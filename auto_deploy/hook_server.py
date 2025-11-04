import json
import argparse
import os
import threading
import subprocess
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


# 静态配置（集中放在文件头部，便于修改）
PORT = 8000
CODE_BASE_DIR = "/home/drill/outline"
COMPOSE_PROJECT_NAME = "house-docker-compose"
BUILD_SCRIPT_NAME = "build_docker_and_release.sh"
IMAGE_VERSION = "1.0.1"  # 部署的镜像版本，作为脚本参数传入

COMPOSE_PROJECT_DIR = f"{CODE_BASE_DIR}/{COMPOSE_PROJECT_NAME}"
BUILD_SCRIPT_PATH = f"{CODE_BASE_DIR}/{COMPOSE_PROJECT_NAME}/{BUILD_SCRIPT_NAME}"
DEPLOY_LOG_PATH = os.path.join(os.path.dirname(__file__), "deploy.log")
HOST = "0.0.0.0"


# 部署状态（线程安全）
DEPLOY_LOCK = threading.Lock()
DEPLOY_IN_PROGRESS = False
DEPLOY_START_TIME_ISO = None


def _log_write(message: str):
    ts = datetime.utcnow().isoformat() + "Z"
    try:
        with open(DEPLOY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {message}\n")
    except Exception:
        # 如果写文件失败，至少打印到控制台
        print(message)


def _stream_cmd(cmd, cwd=None, env=None, label: str = "cmd", collect_tail: int = 0):
    """
    Stream command output to deploy.log. Optionally collect the last N lines
    and include them in the return value for error summarization.

    Returns either an int (returncode) when collect_tail == 0,
    or a tuple (returncode, tail_lines: list[str]) when collect_tail > 0.
    """
    _log_write(f"[{label}] starting: {' '.join(cmd)} (cwd={cwd})")
    tail_buf = deque(maxlen=collect_tail) if collect_tail and collect_tail > 0 else None
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            if tail_buf is not None:
                tail_buf.append(line)
            _log_write(f"[{label}] {line}")
        proc.wait()
        _log_write(f"[{label}] finished with code {proc.returncode}")
        if tail_buf is not None:
            return proc.returncode, list(tail_buf)
        return proc.returncode
    except Exception as e:
        msg = str(e)
        _log_write(f"[{label}] exception: {msg}")
        if tail_buf is not None:
            tail_buf.append(f"exception: {msg}")
            return 1, list(tail_buf)
        return 1


def run_deploy():
    global DEPLOY_IN_PROGRESS, DEPLOY_START_TIME_ISO
    _log_write("[deploy] starting deploy pipeline...")
    try:
        # Step: run build script
        if not os.path.isfile(BUILD_SCRIPT_PATH):
            _log_write(f"[deploy] build script not found at {BUILD_SCRIPT_PATH}")
            return

        build_result = _stream_cmd(["bash", BUILD_SCRIPT_NAME, IMAGE_VERSION], cwd=COMPOSE_PROJECT_DIR, env=os.environ, label="build", collect_tail=50)
        if isinstance(build_result, tuple):
            rc, tail = build_result
        else:
            rc, tail = build_result, []
        if rc == 0:
            _log_write("[deploy] deploy pipeline finished successfully")
        else:
            last_err = next((l for l in reversed(tail) if l.strip()), "unknown error")
            _log_write(f"[deploy] build failed (rc={rc}): {last_err}")
    finally:
        # 结束部署状态
        with DEPLOY_LOCK:
            DEPLOY_IN_PROGRESS = False
            # 保留最近一次启动时间供查询，如果需要清理可设为 None


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            payload = {
                "status": "ok",
                "compose_project_name": COMPOSE_PROJECT_NAME,
                "compose_project_dir": COMPOSE_PROJECT_DIR,
                "deploy_in_progress": DEPLOY_IN_PROGRESS,
                "deploy_start_time": DEPLOY_START_TIME_ISO,
            }
            self._send_json(200, payload)
        else:
            self._send_json(404, {
                "error": "not found",
                "compose_project_name": COMPOSE_PROJECT_NAME,
                "compose_project_dir": COMPOSE_PROJECT_DIR,
            })

    def do_POST(self):
        if self.path != "/webhook/bitbucket":
            self._send_json(404, {
                "error": "not found",
                "compose_project_name": COMPOSE_PROJECT_NAME,
                "compose_project_dir": COMPOSE_PROJECT_DIR,
            })
            return

        # 读取 payload（可忽略内容）
        length = int(self.headers.get("Content-Length", "0"))
        _ = self.rfile.read(length) if length > 0 else b""

        # 部署守卫：如果已有部署在进行，返回明确 JSON，不再启动新的部署
        global DEPLOY_IN_PROGRESS, DEPLOY_START_TIME_ISO
        with DEPLOY_LOCK:
            if DEPLOY_IN_PROGRESS:
                self._send_json(200, {
                    "status": "in_progress",
                    "message": "deployment already running; new request ignored",
                    "compose_project_name": COMPOSE_PROJECT_NAME,
                    "compose_project_dir": COMPOSE_PROJECT_DIR,
                    "deploy_start_time": DEPLOY_START_TIME_ISO,
                })
                return

            # 标记部署开始
            DEPLOY_IN_PROGRESS = True
            DEPLOY_START_TIME_ISO = datetime.utcnow().isoformat() + "Z"

        # 后台触发部署
        threading.Thread(target=run_deploy, daemon=True).start()
        self._send_json(200, {
            "status": "queued",
            "compose_project_name": COMPOSE_PROJECT_NAME,
            "compose_project_dir": COMPOSE_PROJECT_DIR,
            "deploy_start_time": DEPLOY_START_TIME_ISO,
        })

    # Avoid noisy logging to stderr
    def log_message(self, format, *args):
        print("[http]", format % args)


def main():
    global CODE_BASE_DIR, IMAGE_VERSION, HOST, PORT, COMPOSE_PROJECT_DIR, BUILD_SCRIPT_PATH

    parser = argparse.ArgumentParser(description="AutoDeploy Hook Server")
    parser.add_argument("--code_base_dir", default=CODE_BASE_DIR, help="代码根目录（包含 compose 项目目录）")
    parser.add_argument("--image_version", default=IMAGE_VERSION, help="部署镜像版本标签，例如 1.0.1")
    parser.add_argument("--host", default=HOST, help="HTTP 监听地址")
    parser.add_argument("--port", type=int, default=PORT, help="HTTP 监听端口")
    args = parser.parse_args()

    CODE_BASE_DIR = args.code_base_dir
    IMAGE_VERSION = args.image_version
    HOST = args.host
    PORT = int(args.port)

    # 依赖 CODE_BASE_DIR 的派生路径需要重新计算
    COMPOSE_PROJECT_DIR = f"{CODE_BASE_DIR}/{COMPOSE_PROJECT_NAME}"
    BUILD_SCRIPT_PATH = f"{COMPOSE_PROJECT_DIR}/{BUILD_SCRIPT_NAME}"

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(
        f"AutoDeploy server listening on http://{HOST}:{PORT}/ "
        f"(project={COMPOSE_PROJECT_NAME}, dir={COMPOSE_PROJECT_DIR}, version={IMAGE_VERSION})"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server...")
        server.server_close()


if __name__ == "__main__":
    main()