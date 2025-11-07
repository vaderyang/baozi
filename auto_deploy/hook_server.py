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
TARGET_BRANCH: str | None = None  # 目标分支，若设置则仅当 toRef.branch.name 匹配时触发部署

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

# 启动说明/示例输出收集（在 stdout 打印的同时也保存一份）
STARTUP_LINES: list[str] = []

def _startup_print(line: str):
    try:
        print(line)
    finally:
        STARTUP_LINES.append(line)


def _log_write(message: str):
    ts = datetime.utcnow().isoformat() + "Z"
    try:
        with open(DEPLOY_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {message}\n")
    except Exception:
        # 如果写文件失败，至少打印到控制台
        print(message)

def parse_branch_name(payload: dict) -> str | None:
    """
    提取 toRef/toref -> branch -> name 的分支名，兼容大小写。
    如果不存在该结构则返回 None。
    """
    if not isinstance(payload, dict):
        return None
    root = payload
    for key in ("pullrequest", "pullRequest", "PullRequest"):
        if isinstance(payload.get(key), dict):
            root = payload[key]
            break
    toref_obj = None
    for key in ("toRef", "toref", "TOREF", "to_ref"):
        if isinstance(root.get(key), dict):
            toref_obj = root[key]
            break
    if not toref_obj:
        return None
    branch_obj = None
    for key in ("branch", "Branch"):
        if isinstance(toref_obj.get(key), dict):
            branch_obj = toref_obj[key]
            break
    if not branch_obj:
        return None
    for key in ("name", "Name"):
        val = branch_obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _list_access_urls(host: str, port: int) -> list[str]:
    """
    枚举可访问地址：
    - 若 host 为具体地址：仅返回该地址
    - 若 host 为 0.0.0.0：枚举本机 IPv4（包含 127.0.0.1 与所有非回环地址）
    """
    bind_url = f"http://{host}:{port}"
    urls: list[str] = []
    if host != "0.0.0.0":
        return [bind_url]

    # 始终包含本地回环
    urls.append(f"http://127.0.0.1:{port}")

    # 尝试通过 hostname -I 枚举所有 IPv4
    try:
        out = subprocess.check_output(["hostname", "-I"], text=True).strip()
        for token in out.split():
            if token.count('.') == 3 and not token.startswith('127.'):
                urls.append(f"http://{token}:{port}")
    except Exception:
        pass

    # 备用：通过 UDP 套接字探测主 IP
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
    if primary_ip and not primary_ip.startswith('127.'):
        urls.append(f"http://{primary_ip}:{port}")

    # 去重，保留顺序
    seen = set()
    deduped: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    return deduped

def _read_deploy_log_tail(max_bytes: int = 200 * 1024, tail_lines: int = 2000, reverse: bool = False) -> str:
    """
    Read the tail of deploy.log safely, limiting bytes and lines to avoid
    excessive memory usage in the UI.
    """
    try:
        if not os.path.exists(DEPLOY_LOG_PATH):
            return "(deploy.log 不存在)"
        size = os.path.getsize(DEPLOY_LOG_PATH)
        with open(DEPLOY_LOG_PATH, "rb") as f:
            if size > max_bytes:
                try:
                    f.seek(size - max_bytes)
                except Exception:
                    # 回退到读取整个文件
                    pass
            data = f.read()
        text = data.decode("utf-8", errors="replace")
        lines = text.splitlines()
        # 截取尾部指定行数
        if len(lines) > tail_lines:
            lines = lines[-tail_lines:]
        # 根据需求逆序（最新在最上面）
        if reverse:
            lines = list(reversed(lines))
        return "\n".join(lines)
    except Exception as e:
        return f"(无法读取日志: {e})"


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

    def _send_html(self, status_code: int, html: str):
        body = html.encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # 规范化路径，根路径重定向到 /deploy
        parsed = urlparse(self.path)
        path_only = parsed.path
        norm_path = path_only.rstrip("/") or "/"
        if norm_path == "/":
            self.send_response(302)
            self.send_header("Location", "/deploy")
            self.end_headers()
            return
        elif self.path.startswith("/deploy/log"):
            # 纯文本返回日志尾部（供页面刷新使用）
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            order = str(qs.get("order", ["desc"])[0]).lower()
            reverse = order in ("desc", "latest", "reverse")
            log_text = _read_deploy_log_tail(reverse=reverse)
            body = log_text.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/deploy"):
            # 展示 deploy.log 内容与取消按钮
            # 页面初次渲染也采用最新在最上方
            log_text = _read_deploy_log_tail(reverse=True)
            in_progress_text = "部署进行中" if DEPLOY_IN_PROGRESS else "空闲"
            start_text = DEPLOY_START_TIME_ISO or "-"
            cancel_disabled = "" if DEPLOY_IN_PROGRESS else "disabled"
            html = f"""
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AutoDeploy 日志</title>
  <style>
    body {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; margin: 16px; background: #0f1216; color: #e6edf3; }}
    h1 {{ margin: 0 0 12px; font-size: 20px; }}
    .meta {{ margin: 0 0 12px; font-size: 13px; color: #9da7b1; }}
    .actions {{ margin: 12px 0; }}
    button {{ padding: 8px 12px; border-radius: 6px; border: 1px solid #42526b; background: #1f6feb; color: #fff; cursor: pointer; }}
    button[disabled] {{ opacity: 0.6; cursor: not-allowed; }}
    pre {{ background: #0a0d12; border: 1px solid #30363d; padding: 12px; overflow: auto; max-height: 70vh; }}
    a {{ color: #58a6ff; text-decoration: none; }}
  </style>
</head>
<body>
  <h1>AutoDeploy</h1>
  <div class="meta">项目: {COMPOSE_PROJECT_NAME} <!-- · 目录: {COMPOSE_PROJECT_DIR} --></div>
  <div class="meta">状态: {in_progress_text} · 启动时间: {start_text}</div>
  <div class="meta">VERSION: {IMAGE_VERSION}</div>
  <!--
  <div class="actions">
    <form method="POST" action="/cancel" onsubmit="return confirm('确认取消当前部署吗？');">
      <button type="submit" {cancel_disabled}>取消当前部署</button>
      <span style="margin-left:12px; font-size:12px; color:#9da7b1;">取消后将终止当前构建并释放状态</span>
    </form>
  </div>
  -->
  <div class="meta"><!-- 日志文件: {DEPLOY_LOG_PATH} · --> 显示顺序: 最新在最上方</div>
  <pre id="log">{log_text}</pre>
  <script>
    // 可选：简单的轮询刷新日志
    const pre = document.getElementById('log');
    async function refresh() {{
      try {{
        const res = await fetch('/deploy/log?order=desc');
        pre.textContent = await res.text();
      }} catch (e) {{ /* ignore */ }}
    }}
    setInterval(refresh, 4000);
  </script>
</body>
</html>
"""
            self._send_html(200, html)
        else:
            self._send_json(404, {
                "error": "not found",
                "compose_project_name": COMPOSE_PROJECT_NAME,
                "compose_project_dir": COMPOSE_PROJECT_DIR,
            })

    def do_POST(self):
        # 在函数顶部声明涉及的全局变量，避免语法错误
        global DEPLOY_IN_PROGRESS, DEPLOY_START_TIME_ISO, CANCEL_EVENT, CURRENT_PROC, DEPLOY_RUN_ID, TARGET_BRANCH
        # 解析请求路径（忽略查询参数进行路由匹配，并兼容尾随斜杠）
        parsed = urlparse(self.path)
        path_only = parsed.path
        norm_path = path_only.rstrip("/") or "/"

        if norm_path == "/cancel":
            # 取消当前部署（如果有）
            cancelled = False
            with DEPLOY_LOCK:
                if DEPLOY_IN_PROGRESS:
                    cancelled = True
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
                else:
                    cancelled = False

            # 根据 Accept/Referer 决定返回类型（页面重定向或 JSON）
            accept = self.headers.get("Accept", "")
            referer = self.headers.get("Referer", "")
            if "text/html" in accept or referer.endswith("/deploy"):
                self.send_response(303)
                self.send_header("Location", "/deploy")
                self.end_headers()
            else:
                self._send_json(200, {
                    "status": "cancel_requested" if cancelled else "idle",
                    "message": "cancel signal sent" if cancelled else "no deployment in progress",
                    "deploy_in_progress": DEPLOY_IN_PROGRESS,
                })
            return
        if norm_path != "/webhook/bitbucket":
            self._send_json(404, {
                "error": "not found",
                "compose_project_name": COMPOSE_PROJECT_NAME,
                "compose_project_dir": COMPOSE_PROJECT_DIR,
            })
            return

        # 读取 payload（兼容 JSON 与表单）
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length > 0 else b""
        content_type = self.headers.get("Content-Type", "")
        payload_json = None
        if body and content_type.startswith("application/json"):
            try:
                payload_json = json.loads(body.decode("utf-8"))
            except Exception:
                payload_json = None

        # 解析是否 force=true（支持 query 参数）
        try:
            query = parse_qs(parsed.query)
            force_flag = str(query.get("force", ["false"])[0]).lower() == "true"
        except Exception:
            force_flag = False

        # 兼容 body 中的 force 标志
        if not force_flag and body:
            try:
                # 优先 JSON 解析
                body_json = payload_json if payload_json is not None else json.loads(body.decode("utf-8"))
                fv = body_json.get("force")
                if isinstance(fv, bool):
                    force_flag = fv
                elif isinstance(fv, str):
                    force_flag = fv.lower() == "true"
            except Exception:
                # 简单表单/原始文本包含 force=true
                if b"force=true" in body:
                    force_flag = True

        # 解析出 toRef.branch.name 并打印日志
        parsed_branch = None
        try:
            if isinstance(payload_json, dict):
                parsed_branch = parse_branch_name(payload_json)
        except Exception:
            parsed_branch = None
        if parsed_branch:
            _log_write(f"[webhook] parsed branch name from pullrequest.toRef.branch.name: {parsed_branch}")
            try:
                print(f"[webhook] parsed pullrequest.toRef.branch.name: {parsed_branch}")
            except Exception:
                pass

        # 若设置了目标分支，则仅当解析到的分支匹配时才继续
        if TARGET_BRANCH is not None or parsed_branch is None:
            if parsed_branch != TARGET_BRANCH:
                msg = f"Branch pullrequest.toRef.branch.name {parsed_branch} is not target branch {TARGET_BRANCH}, ignore."
                _log_write(f"[webhook] {msg}")
                try:
                    print(f"[webhook] {msg}")
                except Exception:
                    pass
                self._send_json(200, {
                    "status": "ignored",
                    "message": msg,
                    "branch": parsed_branch,
                    "target_branch": TARGET_BRANCH,
                })
            else:
                msg = f"Branch pullrequest.toRef.branch.name {parsed_branch} is same as target branch {TARGET_BRANCH}, continue."
                _log_write(f"[webhook] {msg}")
                return

        # 部署守卫：如果已有部署在进行，返回明确 JSON，不再启动新的部署
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
            "branch": parsed_branch,
        })

    # Avoid noisy logging to stderr
    def log_message(self, format, *args):
        print("[http]", format % args)


def main():
    global CODE_BASE_DIR, IMAGE_VERSION, HOST, PORT, COMPOSE_PROJECT_DIR, BUILD_SCRIPT_PATH, TARGET_BRANCH

    parser = argparse.ArgumentParser(description="AutoDeploy Hook Server")
    parser.add_argument("--code_base_dir", required=True, help="代码根目录（包含 compose 项目目录）")
    parser.add_argument("--image_version", required=True, help="部署镜像版本标签，例如production/staging")
    parser.add_argument("--host", required=True, help="HTTP HOOK 监听地址")
    parser.add_argument("--port", type=int, required=True, help="HTTP HOOK 监听端口")
    parser.add_argument("--target_branch", default=None, help="目标分支名，当设置时，如 post 中 pullrequest.toRef.branch.name 存在，则仅当匹配时触发部署")

    # 未提供任何参数时，显示帮助并退出
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)

    args = parser.parse_args()

    CODE_BASE_DIR = args.code_base_dir
    IMAGE_VERSION = args.image_version
    HOST = args.host
    PORT = int(args.port)
    TARGET_BRANCH = args.target_branch

    # 依赖 CODE_BASE_DIR 的派生路径需要重新计算
    COMPOSE_PROJECT_DIR = f"{CODE_BASE_DIR}/{COMPOSE_PROJECT_NAME}"
    BUILD_SCRIPT_PATH = f"{COMPOSE_PROJECT_DIR}/{BUILD_SCRIPT_NAME}"

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    _startup_print(
        f"AutoDeploy server listening: bind=http://{HOST}:{PORT}/ "
        f"(project={COMPOSE_PROJECT_NAME}, dir={COMPOSE_PROJECT_DIR}, version={IMAGE_VERSION})"
    )

    # 生成可访问地址列表（枚举全部 IPv4）
    access_urls = _list_access_urls(HOST, PORT)

    if access_urls:
        _startup_print("可访问地址：")
        for u in access_urls:
            _startup_print(f"  - {u}/")

    # 启动后输出常用 POST 示例（为每个可访问地址打印一组示例）
    json_force_example = '{"force": true}'
    _startup_print("示例触发发布：")
    for base_url in access_urls:
        _startup_print(f"  正常发布: curl -sS -X POST '{base_url}/webhook/bitbucket'")
        _startup_print(f"  强制重新发布: curl -sS -X POST '{base_url}/webhook/bitbucket?force=true'")
        _startup_print(f"  JSON 强制重新发布: curl -sS -H 'Content-Type: application/json' -d '{json_force_example}' '{base_url}/webhook/bitbucket'")
        _startup_print(f"  日志页面: {base_url}/")
        # 不同 IP 组之间间隔一行，提升可读性
        _startup_print("")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server...")
        server.server_close()


if __name__ == "__main__":
    main()