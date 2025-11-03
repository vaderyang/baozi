import json
import os
import threading
import subprocess
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


REPO_DIR = os.getenv("REPO_DIR", "/home/drill/outline")

# Docker Compose 项目路径与名称（可通过环境变量调整）
COMPOSE_PROJECT_DIR = os.getenv(
    "COMPOSE_PROJECT_DIR", "/home/drill/outline/house-docker-compose-production"
)
DEFAULT_PROJECT_NAME = os.path.basename(COMPOSE_PROJECT_DIR.rstrip("/")) or "house-docker-compose-production"
COMPOSE_PROJECT_NAME = os.getenv("COMPOSE_PROJECT_NAME", DEFAULT_PROJECT_NAME)

# 构建脚本文件名（默认生产脚本，可通过环境变量调整为 stage 或其他）
BUILD_SCRIPT_NAME = os.getenv("BUILD_SCRIPT_NAME", "build_docker_production.sh")
PROD_SCRIPT_PATH = os.path.join(COMPOSE_PROJECT_DIR, BUILD_SCRIPT_NAME)

# 部署状态（线程安全）
DEPLOY_LOCK = threading.Lock()
DEPLOY_IN_PROGRESS = False
DEPLOY_START_TIME_ISO = None

# 部署日志路径
DEPLOY_LOG_PATH = os.path.join(os.path.dirname(__file__), "deploy.log")


def _log_write(message: str):
    ts = datetime.utcnow().isoformat() + "Z"
    try:
        with open(DEPLOY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {message}\n")
    except Exception:
        # 如果写文件失败，至少打印到控制台
        print(message)


def _stream_cmd(cmd, cwd=None, env=None, label: str = "cmd") -> int:
    _log_write(f"[{label}] starting: {' '.join(cmd)} (cwd={cwd})")
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
            _log_write(f"[{label}] {line.rstrip()}" )
        proc.wait()
        _log_write(f"[{label}] finished with code {proc.returncode}")
        return proc.returncode
    except Exception as e:
        _log_write(f"[{label}] exception: {e}")
        return 1


def run_deploy():
    global DEPLOY_IN_PROGRESS, DEPLOY_START_TIME_ISO
    _log_write("[deploy] starting deploy pipeline...")
    try:
        # Step 1: git pull
        git_cmd = [
            "git",
            "-c",
            "core.sshCommand=ssh -i ~/.ssh/id_ed25519_netis -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new",
            "pull",
            "--rebase",
        ]
        rc = _stream_cmd(git_cmd, cwd=REPO_DIR, env=os.environ, label="git")
        if rc != 0:
            _log_write("[deploy] aborting deploy due to git pull failure")
            return

        # Step 2: run build script
        if not os.path.isfile(PROD_SCRIPT_PATH):
            _log_write(f"[deploy] build script not found at {PROD_SCRIPT_PATH}")
            return

        rc = _stream_cmd(["bash", BUILD_SCRIPT_NAME], cwd=COMPOSE_PROJECT_DIR, env=os.environ, label="build")
        if rc == 0:
            _log_write("[deploy] deploy pipeline finished successfully")
        else:
            _log_write(f"[deploy] build script failed with code {rc}")
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
            # 始终返回项目名称与路径，以及部署状态
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

        # Read payload (optional)
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
        print("[http]" , format % args)


def main():
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"AutoDeploy server listening on http://{host}:{port}/ (project={COMPOSE_PROJECT_NAME}, dir={COMPOSE_PROJECT_DIR})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server...")
        server.server_close()


if __name__ == "__main__":
    main()