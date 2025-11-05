import json
import argparse
import os
import threading
import subprocess
import time
import sys
import socket
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


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
DEPLOY_RUN_ID = 0  # 用于避免并发覆盖 in_progress 状态
CURRENT_PROC: subprocess.Popen | None = None
CANCEL_EVENT: threading.Event | None = None


def _log_write(message: str):
    ts = datetime.utcnow().isoformat() + "Z"
    try:
        with open(DEPLOY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {message}\n")
    except Exception:
        # 如果写文件失败，至少打印到控制台
        print(message)


def _stream_cmd(cmd, cwd=None, env=None, label: str = "cmd", collect_tail: int = 0, cancel_event: threading.Event | None = None):
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
        global CURRENT_PROC
        CURRENT_PROC = proc
        assert proc.stdout is not None
        for line in proc.stdout:
            line = line.rstrip()
            if tail_buf is not None:
                tail_buf.append(line)
            _log_write(f"[{label}] {line}")
            # 支持被强制取消
            if cancel_event is not None and cancel_event.is_set():
                _log_write(f"[{label}] cancel requested, terminating process...")
                try:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except Exception:
                        _log_write(f"[{label}] terminate timed out, killing process...")
                        proc.kill()
                        proc.wait(timeout=5)
                except Exception as e:
                    _log_write(f"[{label}] error during termination: {e}")
                break
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
    global DEPLOY_IN_PROGRESS, DEPLOY_START_TIME_ISO, DEPLOY_RUN_ID, CANCEL_EVENT, CURRENT_PROC
    _log_write("[deploy] starting deploy pipeline...")
    # 为本次运行建立独立的取消事件和 run_id
    run_id = None
    with DEPLOY_LOCK:
        DEPLOY_RUN_ID += 1
        run_id = DEPLOY_RUN_ID
        CANCEL_EVENT = threading.Event()
    try:
        # Step: run build script
        if not os.path.isfile(BUILD_SCRIPT_PATH):
            _log_write(f"[deploy] build script not found at {BUILD_SCRIPT_PATH}")
            return

        build_result = _stream_cmd(["bash", BUILD_SCRIPT_NAME, IMAGE_VERSION], cwd=COMPOSE_PROJECT_DIR, env=os.environ, label="build", collect_tail=50, cancel_event=CANCEL_EVENT)
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
            # 仅当 run_id 仍是最新时，才清除 in_progress，避免被强制重启时覆盖新任务状态
            if run_id == DEPLOY_RUN_ID:
                DEPLOY_IN_PROGRESS = False
            CANCEL_EVENT = None
            CURRENT_PROC = None
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
            # 生成可访问地址列表（本机与局域网）
            access_urls = []
            bind_url = f"http://{HOST}:{PORT}"
            if HOST == "0.0.0.0":
                access_urls.append(f"http://127.0.0.1:{PORT}")
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    s.connect(("8.8.8.8", 80))
                    primary_ip = s.getsockname()[0]
                except Exception:
                    primary_ip = None
                finally:
                    try:
                        s.close()
                    except Exception:
                        pass
                if primary_ip:
                    access_urls.append(f"http://{primary_ip}:{PORT}")
            else:
                access_urls.append(bind_url)

            base_url = access_urls[0] if access_urls else bind_url
            json_force_example = "{\"force\": true}"

            payload = {
                "status": "ok",
                "server_url": base_url,
                "access_urls": access_urls,
                "compose_project_name": COMPOSE_PROJECT_NAME,
                "compose_project_dir": COMPOSE_PROJECT_DIR,
                "deploy_in_progress": DEPLOY_IN_PROGRESS,
                "deploy_start_time": DEPLOY_START_TIME_ISO,
                "usage": {
                    "endpoint": "POST /webhook/bitbucket",
                    "examples": [
                        {
                            "curl": f"curl -sS -X POST '{base_url}/webhook/bitbucket'",
                            "effect": "无部署时 => queued；有部署时 => in_progress",
                        },
                        {
                            "curl": f"curl -sS -X POST '{base_url}/webhook/bitbucket?force=true'",
                            "effect": "有部署时 => restarted（取消旧部署并重启）",
                        },
                        {
                            "curl": f"curl -sS -H 'Content-Type: application/json' -d '{json_force_example}' '{base_url}/webhook/bitbucket'",
                            "effect": "与 query force=true 等效",
                        },
                    ],
                },
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

        # 读取 payload（兼容 JSON 与表单）
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b""

        # 解析是否 force=true（支持 query 参数）
        try:
            query = parse_qs(urlparse(self.path).query)
            force_flag = str(query.get("force", ["false"])[0]).lower() == "true"
        except Exception:
            force_flag = False

        # 兼容 body 中的 force 标志
        if not force_flag and body:
            try:
                # 优先 JSON 解析
                body_json = json.loads(body.decode("utf-8"))
                fv = body_json.get("force")
                if isinstance(fv, bool):
                    force_flag = fv
                elif isinstance(fv, str):
                    force_flag = fv.lower() == "true"
            except Exception:
                # 简单表单/原始文本包含 force=true
                if b"force=true" in body:
                    force_flag = True

        # 部署守卫：如果已有部署在进行，返回明确 JSON，不再启动新的部署
        global DEPLOY_IN_PROGRESS, DEPLOY_START_TIME_ISO, CANCEL_EVENT, CURRENT_PROC, DEPLOY_RUN_ID
        with DEPLOY_LOCK:
            if DEPLOY_IN_PROGRESS:
                if force_flag:
                    # 请求强制重启：发出取消信号并尝试终止当前子进程
                    if CANCEL_EVENT is not None:
                        CANCEL_EVENT.set()
                    if CURRENT_PROC is not None:
                        try:
                            CURRENT_PROC.terminate()
                            try:
                                CURRENT_PROC.wait(timeout=3)
                            except Exception:
                                CURRENT_PROC.kill()
                        except Exception:
                            pass
                    # 立即启动新一轮部署（更新 run_id，保持 DEPLOY_IN_PROGRESS=True）
                    DEPLOY_RUN_ID += 1
                    DEPLOY_START_TIME_ISO = datetime.utcnow().isoformat() + "Z"
                    threading.Thread(target=run_deploy, daemon=True).start()
                    self._send_json(200, {
                        "status": "restarted",
                        "message": "previous deployment cancelled; new deployment started",
                        "compose_project_name": COMPOSE_PROJECT_NAME,
                        "compose_project_dir": COMPOSE_PROJECT_DIR,
                        "deploy_start_time": DEPLOY_START_TIME_ISO,
                    })
                    return
                else:
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
            "force": force_flag,
        })

    # Avoid noisy logging to stderr
    def log_message(self, format, *args):
        print("[http]", format % args)


def main():
    global CODE_BASE_DIR, IMAGE_VERSION, HOST, PORT, COMPOSE_PROJECT_DIR, BUILD_SCRIPT_PATH

    parser = argparse.ArgumentParser(description="AutoDeploy Hook Server")
    parser.add_argument("--code_base_dir", required=True, help="代码根目录（包含 compose 项目目录）")
    parser.add_argument("--image_version", required=True, help="部署镜像版本标签，例如production/staging")
    parser.add_argument("--host", required=True, help="HTTP HOOK 监听地址")
    parser.add_argument("--port", type=int, required=True, help="HTTP HOOK 监听端口")

    # 未提供任何参数时，显示帮助并退出
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)

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
        f"AutoDeploy server listening: bind=http://{HOST}:{PORT}/ "
        f"(project={COMPOSE_PROJECT_NAME}, dir={COMPOSE_PROJECT_DIR}, version={IMAGE_VERSION})"
    )

    # 生成可访问地址列表（本机与局域网）
    access_urls = []
    if HOST == "0.0.0.0":
        access_urls.append(f"http://127.0.0.1:{PORT}")
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            primary_ip = s.getsockname()[0]
        except Exception:
            primary_ip = None
        finally:
            try:
                s.close()
            except Exception:
                pass
        if primary_ip:
            access_urls.append(f"http://{primary_ip}:{PORT}")
    else:
        access_urls.append(f"http://{HOST}:{PORT}")

    if access_urls:
        print("可访问地址：")
        for u in access_urls:
            print(f"  - {u}/")

    # 启动后输出常用 POST 示例（选择首个可访问地址作为示例前缀）
    base_url = access_urls[0] if access_urls else f"http://{HOST}:{PORT}"
    json_force_example = '{"force": true}'
    print("示例触发发布：")
    print(f"  正常发布: curl -sS -X POST '{base_url}/webhook/bitbucket'")
    print(f"  强制重新发布: curl -sS -X POST '{base_url}/webhook/bitbucket?force=true'")
    print(f"  JSON 强制重新发布: curl -sS -H 'Content-Type: application/json' -d '{json_force_example}' '{base_url}/webhook/bitbucket'")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server...")
        server.server_close()


if __name__ == "__main__":
    main()