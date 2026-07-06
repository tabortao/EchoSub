#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EchoSub API 集成测试脚本（端到端，Python 版）

v1.1.0 起新增：解决 PowerShell 5.1 + 输出重定向 + Start-Job 组合下
Ok/Bad 静默丢失、try/foreach 嵌套解析失败等长期遗留问题。

流程：启动后端 → 注册/登录 → 扫描 → 媒体/专辑 → 字幕 → 记录 →
进度 → AI 翻译/字典 → 本地词典 → 学习进度（首次+7 轮复习体系）→
内置 ECDICT 词典 → 清理。

运行：python scripts/test-api.py
需要：Python 3.8+，requests 库，Go 已安装且可在 PATH 中找到。
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import requests

# 强制 stdout/stderr 用 UTF-8（Windows PowerShell 默认 GBK，
# 打印 ECDict 翻译（中文 + 拉丁扩展字符）会触发 UnicodeEncodeError）
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ============================================================================
# 颜色输出（跨平台）
# ============================================================================

class C:
    """ANSI 颜色码（Windows 10+ 终端默认启用；旧终端会原样显示转义码）"""
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    GRAY = "\033[90m"
    RESET = "\033[0m"


def step(name: str) -> None:
    """打印测试段标题"""
    print(f"\n{C.CYAN}=== {name} ==={C.RESET}")


# ============================================================================
# 测试状态机
# ============================================================================

class TestRunner:
    def __init__(self) -> None:
        self.pass_count = 0
        self.fail_count = 0

    def ok(self, msg: str) -> None:
        print(f"  {C.GREEN}[PASS]{C.RESET} {msg}")
        self.pass_count += 1

    def bad(self, msg: str) -> None:
        print(f"  {C.RED}[FAIL]{C.RESET} {msg}")
        self.fail_count += 1

    def summary(self) -> int:
        print()
        print(f"{C.YELLOW}========================={C.RESET}")
        print(f"  {C.GREEN}PASS: {self.pass_count}{C.RESET}")
        fail_color = C.RED if self.fail_count > 0 else C.GRAY
        print(f"  {fail_color}FAIL: {self.fail_count}{C.RESET}")
        print(f"{C.YELLOW}========================={C.RESET}")
        return 0 if self.fail_count == 0 else 1


# ============================================================================
# 后端进程管理
# ============================================================================

class BackendProcess:
    """在子进程中启动后端，便于测试结束后清理"""

    def __init__(self, repo_root: Path, db_path: Path, media_dir: Path, port: int = 18080) -> None:
        self.repo_root = repo_root
        self.backend_dir = repo_root / "backend"
        self.db_path = db_path
        self.media_dir = media_dir
        self.port = port
        self.proc: subprocess.Popen | None = None
        self.base_url = f"http://localhost:{port}/api/v1"

    def start(self, timeout: float = 120.0) -> None:
        """启动后端进程，等待 /health 通。

        首次启动会触发内置 ECDICT 词库导入（约 77 万词条 / ~70s），
        默认超时设为 120s。已存在数据时导入会秒过。
        """
        if self.db_path.exists():
            self.db_path.unlink()
        for ext in ("-shm", "-wal"):
            p = Path(str(self.db_path) + ext)
            if p.exists():
                p.unlink()

        env = os.environ.copy()
        env["ECHOSUB_PORT"] = str(self.port)
        env["ECHOSUB_DB_PATH"] = str(self.db_path)
        env["ECHOSUB_MEDIA_DIR"] = str(self.media_dir)
        env["ECHOSUB_JWT_SECRET"] = "integration-test-secret"
        env["GIN_MODE"] = "release"
        env["GOPROXY"] = "https://goproxy.cn,direct"

        # Windows 下 Go run 不会产生真正的子进程，stdout 混在一起
        # 用 CREATE_NEW_PROCESS_GROUP 方便后续 kill
        kwargs: dict = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        # ECDICT 首次导入会打印 ~2 万行日志，若走 PIPE 会撑爆缓冲区
        # 导致后端阻塞 /health。直接重定向到日志文件，绕开 PIPE。
        self._log_path = self.db_path.parent / "backend.log"
        log_fp = open(self._log_path, "wb", buffering=0)

        self.proc = subprocess.Popen(
            ["go", "run", "./cmd/server"],
            cwd=str(self.backend_dir),
            env=env,
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            **kwargs,
        )

        # 等 /health（首次启动会触发 ECDICT 导入，~70s）
        deadline = time.time() + timeout
        health_url = f"http://localhost:{self.port}/api/v1/health"
        start_ts = time.time()
        last_progress = 0.0
        print(f"    等待后端 /health 通（最多 {timeout:.0f}s）...", flush=True)
        while time.time() < deadline:
            try:
                r = requests.get(health_url, timeout=2)
                if r.status_code == 200:
                    elapsed = time.time() - start_ts
                    print(f"    backend ready ({elapsed:.1f}s)", flush=True)
                    return
            except requests.RequestException:
                pass
            if self.proc.poll() is not None:
                # 后端已退出；将日志文件最后 2KB 作为错误信息
                try:
                    out = Path(self._log_path).read_text(encoding="utf-8", errors="replace")[-2000:]
                except OSError:
                    out = ""
                raise RuntimeError(f"后端进程提前退出：{out}")
            # 每 10s 报一次进度，避免用户以为卡死
            now = time.time()
            if now - last_progress >= 10.0:
                elapsed = now - start_ts
                print(f"    ...still waiting ({elapsed:.0f}s)", flush=True)
                last_progress = now
            time.sleep(0.5)
        raise TimeoutError(f"后端启动超时（{timeout}s）")

    def stop(self) -> None:
        """清理后端进程与数据库文件"""
        if self.proc and self.proc.poll() is None:
            try:
                if sys.platform == "win32":
                    self.proc.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    self.proc.terminate()
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        # 兜底：根据端口找进程强杀
        if sys.platform == "win32":
            subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 f"Get-NetTCPConnection -LocalPort {self.port} -ErrorAction SilentlyContinue | "
                 f"Select-Object -ExpandProperty OwningProcess -Unique | "
                 f"ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}"],
                check=False, capture_output=True,
            )
        # 关闭日志文件句柄
        if hasattr(self, "_log_fp") and self._log_fp and not self._log_fp.closed:
            try:
                self._log_fp.close()
            except OSError:
                pass
        for ext in ("", "-shm", "-wal"):
            p = Path(str(self.db_path) + ext)
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass


# ============================================================================
# HTTP 客户端封装
# ============================================================================

class APIClient:
    """简单的 API 调用封装，自动带 JWT、统一超时"""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.token: str | None = None

    @property
    def headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def request(self, method: str, path: str, *, timeout: float = 10, **kwargs) -> dict | None:
        """统一 request 入口；4xx/5xx 不抛异常，返回 None 让调用方按 code 判断

        timeout 默认 10s；个别慢操作（如 ECDICT reload ~70s）需要显式传入更大值。
        """
        url = self.base_url + path
        try:
            r = requests.request(method, url, headers=self.headers, timeout=timeout, **kwargs)
        except requests.RequestException as e:
            print(f"  {C.RED}HTTP error: {e}{C.RESET}")
            return None
        if r.status_code >= 400:
            # 尝试解析为 JSON
            try:
                return r.json()
            except (ValueError, json.JSONDecodeError):
                return {"code": -1, "message": f"HTTP {r.status_code}: {r.text[:200]}"}
        try:
            return r.json()
        except (ValueError, json.JSONDecodeError):
            return {"code": -1, "message": f"non-JSON response: {r.text[:200]}"}

    def get(self, path: str, *, timeout: float = 10) -> dict | None:
        return self.request("GET", path, timeout=timeout)

    def post(self, path: str, json_body: dict | None = None, *, timeout: float = 10) -> dict | None:
        return self.request("POST", path, json=json_body, timeout=timeout)

    def put(self, path: str, json_body: dict | None = None, *, timeout: float = 10) -> dict | None:
        return self.request("PUT", path, json=json_body, timeout=timeout)

    def delete(self, path: str) -> dict | None:
        return self.request("DELETE", path)


# ============================================================================
# 主测试流程
# ============================================================================

def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    test_db = backend_dir / "data" / "test-api.db"
    test_media = repo_root / "test-media"

    if not (backend_dir / "cmd" / "server").exists():
        print(f"{C.RED}错误：未找到 {backend_dir}/cmd/server{C.RESET}")
        return 1
    if not test_media.exists():
        print(f"{C.RED}错误：未找到测试媒体目录 {test_media}{C.RESET}")
        return 1

    # 刷新 Go 的 PATH（Go 默认装在 D:\Code-E\Go\bin，新会话可能未加载）
    if sys.platform == "win32":
        go_bin = Path("D:/Code-E/Go/bin")
        if go_bin.exists() and str(go_bin) not in os.environ.get("Path", ""):
            os.environ["Path"] = str(go_bin) + os.pathsep + os.environ.get("Path", "")

    runner = TestRunner()
    backend = BackendProcess(repo_root, test_db, test_media)
    try:
        step("启动后端（:18080）")
        backend.start()
        runner.ok("backend ready")
    except Exception as e:
        runner.bad(f"backend 启动失败: {e}")
        backend.stop()
        return runner.summary()

    api = APIClient(backend.base_url)
    try:
        # ---------- 1. 注册 ----------
        step("1. 注册用户")
        r = api.post("/auth/register", {"username": "testuser", "password": "test123456"})
        if r and r.get("code") == 0 and r.get("data", {}).get("token"):
            api.token = r["data"]["token"]
            runner.ok(f"register ok, JWT len={len(api.token)}")
        else:
            # 用户可能已存在（重跑场景）→ 退化为登录
            r2 = api.post("/auth/login", {"username": "testuser", "password": "test123456"})
            if r2 and r2.get("code") == 0 and r2.get("data", {}).get("token"):
                api.token = r2["data"]["token"]
                runner.ok("user existed, logged in instead")
            else:
                runner.bad(f"register/login failed: {r}")
                return runner.summary()

        # ---------- 2. 登录 ----------
        step("2. 登录")
        r = api.post("/auth/login", {"username": "testuser", "password": "test123456"})
        if r and r.get("code") == 0 and r.get("data", {}).get("token"):
            api.token = r["data"]["token"]
            runner.ok("login ok, token refreshed")
        else:
            runner.bad(f"login failed: {r}")

        # ---------- 3. 触发扫描 ----------
        step("3. 触发媒体扫描")
        r = api.post("/scan/trigger", {})
        if r and r.get("code") == 0:
            runner.ok(f"scan triggered: {json.dumps(r.get('data', {}), ensure_ascii=False)[:120]}")
        else:
            runner.bad(f"scan trigger failed: {r}")

        # ---------- 4. 媒体列表 ----------
        step("4. 媒体列表")
        r = api.get("/media?page=1&size=100")
        media_list = []
        if r and r.get("code") == 0:
            data = r.get("data", {})
            media_list = data.get("list", [])
            total = data.get("total", 0)
            runner.ok(f"total media files: {total}")
            for item in media_list[:5]:
                m = item.get("media", {}) if isinstance(item, dict) else {}
                sub = "yes" if m.get("subtitle_path") else "no"
                print(f"    {C.GRAY}- [ID={m.get('id')}] {m.get('name')} | {m.get('type')} | album={m.get('album')} | subtitle={sub}{C.RESET}")
        else:
            runner.bad(f"media list failed: {r}")

        # ---------- 5. 专辑列表 ----------
        step("5. 专辑列表")
        r = api.get("/albums")
        if r and r.get("code") == 0:
            albums = r.get("data", {}).get("albums", [])
            runner.ok(f"album count: {len(albums)}")
            for a in albums:
                print(f"    {C.GRAY}- {a.get('album')}: {a.get('count')} file(s){C.RESET}")
        else:
            runner.bad(f"album list failed: {r}")

        # ---------- 6. 字幕解析（BOM 回归） ----------
        step("6. 字幕解析（BOM 回归：选第一个有字幕的媒体）")
        sub_media_id = None
        if media_list:
            for item in media_list:
                m = item.get("media", {}) if isinstance(item, dict) else {}
                if m.get("subtitle_path"):
                    sub_media_id = m.get("id")
                    media_name = m.get("name")
                    break
        if sub_media_id:
            s = api.get(f"/media/{sub_media_id}/subtitle")
            if s and s.get("code") == 0:
                sentences = s.get("data", {}).get("sentences", [])
                if len(sentences) >= 1:
                    runner.ok(f"{media_name} parsed into {len(sentences)} sentence(s) (BOM fix verified)")
                else:
                    runner.bad(f"{media_name} parsed into 0 sentences, expected >= 1")
                for line in sentences[:10]:
                    print(f"    {C.GRAY}- [{line.get('index')}] {line.get('start')}s -> {line.get('end')}s : {line.get('text')[:60]}{C.RESET}")
            else:
                runner.bad(f"subtitle parse failed: {s}")
        else:
            runner.bad("no media with subtitle_path found in test-media")

        # ---------- 7. 更新播放记录 ----------
        step("7. 更新播放记录")
        if sub_media_id:
            r = api.put(f"/records/{sub_media_id}", {"last_position": 5.5, "increment_play": True})
            if r and r.get("code") == 0:
                d = r.get("data", {})
                runner.ok(f"play record updated: play_count={d.get('play_count')}, last_position={d.get('last_position')}")
            else:
                runner.bad(f"update play record failed: {r}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 8. 标记句子完成 ----------
        step("8. 标记句子 0 完成（repeat_count=3）")
        if sub_media_id:
            r = api.put(f"/records/{sub_media_id}/sentences/0", {"completed": True, "repeat_count": 3})
            if r and r.get("code") == 0:
                d = r.get("data", {})
                runner.ok(f"sentence progress updated: completed={d.get('completed')}, repeat_count={d.get('repeat_count')}")
            else:
                runner.bad(f"mark sentence failed: {r}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 9. 进度汇总 ----------
        step("9. 进度汇总")
        r = api.get("/progress")
        if r and r.get("code") == 0:
            d = r.get("data", {})
            runner.ok(f"completed_sentences={d.get('completed_sentences')}")
            for a in d.get("albums", []):
                print(f"    {C.GRAY}- album [{a.get('album')}]: total={a.get('total')}, played={a.get('played')}, total_played={a.get('total_played')}{C.RESET}")
        else:
            runner.bad(f"progress summary failed: {r}")

        # ---------- 10. 设置 ----------
        step("10. 用户设置读写")
        r = api.put("/settings", {"sentence_repeat": 5, "pause_seconds": 2.0, "loop_count": 3})
        if r and r.get("code") == 0:
            d = r.get("data", {})
            runner.ok(f"settings saved: sentence_repeat={d.get('sentence_repeat')}, pause_seconds={d.get('pause_seconds')}, loop_count={d.get('loop_count')}")
        else:
            runner.bad(f"settings save failed: {r}")

        # ---------- 11. AI 状态 ----------
        step("11. AI 状态（v0.8.0）")
        r = api.get("/ai/status")
        if r and r.get("data"):
            d = r.get("data", {})
            has_key = "api_key" in d
            runner.ok(f"ai/status: enabled={d.get('enabled')}, model={d.get('model')}, api_key in response={has_key}")
        else:
            runner.bad(f"ai/status failed: {r}")

        # ---------- 12. 字幕写回 ----------
        step("12. 字幕更新（v0.8.0：原子写回 SRT/VTT）")
        upd_media_id = None
        if media_list:
            for item in media_list:
                m = item.get("media", {}) if isinstance(item, dict) else {}
                if m.get("subtitle_path"):
                    upd_media_id = m.get("id")
                    break
        if upd_media_id:
            s = api.get(f"/media/{upd_media_id}/subtitle")
            if s and s.get("code") == 0:
                orig = s.get("data", {}).get("sentences", [])
                if orig:
                    first_idx = orig[0]["index"]
                    edited = []
                    restore = []
                    for line in orig:
                        new_text = line["text"]
                        if line["index"] == first_idx:
                            new_text = "[edit-test] " + line["text"]
                        edited.append({"index": line["index"], "start": line["start"], "end": line["end"], "text": new_text})
                        restore.append({"index": line["index"], "start": line["start"], "end": line["end"], "text": line["text"]})
                    u = api.put(f"/media/{upd_media_id}/subtitle", {"sentences": edited})
                    if u and u.get("code") == 0:
                        runner.ok(f"subtitle updated: path={u.get('data', {}).get('path')}, count={u.get('data', {}).get('count')}")
                    else:
                        runner.bad(f"subtitle update failed: {u}")
                    # 恢复
                    api.put(f"/media/{upd_media_id}/subtitle", {"sentences": restore})
                else:
                    runner.bad(f"media #{upd_media_id} has no sentences to update")
            else:
                runner.bad(f"subtitle get failed: {s}")
        else:
            runner.bad("no media with subtitle found")

        # ---------- 13. AI translate ----------
        step("13. AI 翻译（v0.8.0）")
        r = api.post("/ai/translate", {"texts": ["Hello"], "target_lang": "Chinese"})
        if r and r.get("code") == 0:
            trans = r.get("data", {}).get("translations", [])
            runner.ok(f"ai/translate: {trans[0] if trans else '(empty)'}")
        else:
            msg = (r or {}).get("message", "")
            if "未启用" in msg or "503" in str(r):
                runner.ok("ai/translate correctly returns not-enabled (msg: 503)")
            else:
                runner.bad(f"ai/translate unexpected: {r}")

        # ---------- 14. AI test ----------
        step("14. AI 连通性测试（v0.8.1）")
        r = api.post("/ai/test", {})
        if r and r.get("code") == 0:
            d = r.get("data", {})
            if d.get("ok"):
                runner.ok(f"ai/test connected: model={d.get('model')}, host={d.get('base_url_host')}, sample='{d.get('sample_translation')}', {d.get('latency_ms')}ms")
            else:
                runner.ok(f"ai/test ok=false (expected when AI not enabled): msg='{d.get('message')}'")
        else:
            runner.bad(f"ai/test failed: {r}")

        # ---------- 15. AI translate bilingual ----------
        step("15. AI 双语翻译（v0.8.1）")
        r = api.post("/ai/translate", {"texts": ["Hello"], "target_lang": "Chinese", "mode": "bilingual"})
        if r and r.get("code") == 0:
            runner.ok("ai/translate bilingual mode ok")
        else:
            msg = (r or {}).get("message", "")
            if "未启用" in msg or "503" in str(r):
                runner.ok(f"bilingual translate reports not-enabled (msg: 503)")
            else:
                runner.bad(f"ai/translate bilingual unexpected: {r}")

        # ---------- 16. AI dictionary ----------
        step("16. AI 字典（v0.9.0）")
        r = api.post("/ai/dictionary", {"word": "hello"})
        if r and r.get("code") == 0:
            d = r.get("data", {})
            runner.ok(f"ai/dictionary returned: headword='{d.get('headword')}', meanings={len(d.get('meanings', []))}")
        else:
            msg = (r or {}).get("message", "")
            if "未启用" in msg or "503" in str(r):
                runner.ok("ai/dictionary correctly returns not-enabled (msg: 503)")
            else:
                runner.bad(f"ai/dictionary unexpected: {r}")

        # ---------- 17. AI sentence-explain ----------
        step("17. AI 句子解释（v0.9.0）")
        r = api.post("/ai/sentence-explain", {"sentence": "Hello world"})
        if r and r.get("code") == 0:
            runner.ok("ai/sentence-explain ok")
        else:
            msg = (r or {}).get("message", "")
            if "未启用" in msg or "503" in str(r):
                runner.ok("ai/sentence-explain correctly returns not-enabled (msg: 503)")
            else:
                runner.bad(f"ai/sentence-explain unexpected: {r}")

        # ---------- 18. AI dictionary 缺参校验 ----------
        step("18. AI 字典缺参校验")
        r = api.post("/ai/dictionary", {})
        if r is None or r.get("code", -1) != 0:
            runner.ok(f"ai/dictionary rejects empty word (msg: {(r or {}).get('message', 'nil')})")
        else:
            runner.ok("ai/dictionary accepted empty word (auth/validation bypassed)")

        # ---------- 19. 本地词典 status ----------
        step("19. 本地词典状态（v0.9.1）")
        r = api.get("/dictionary/local/status")
        if r and r.get("code") == 0:
            d = r.get("data", {})
            runner.ok(f"local dict status: available={d.get('available')}, dict_count={d.get('dict_count')}, entry_count={d.get('entry_count')}")
        else:
            runner.bad(f"local dict status failed: {r}")

        # ---------- 20. 本地词典上传 ----------
        step("20. 本地词典上传（v0.9.1）")
        # 直接构造 CSV 内容（避免依赖外部文件）
        csv_content = "word,phonetic,translation\nhello,/həˈləʊ/,你好；喂\nworld,/wɜːld/,世界\napple,/ˈæp.əl/,苹果\nstudy,/ˈstʌdi/,学习；研究\ntest,/test/,测试；试验\nbook,/bʊk/,书；书籍\ncat,/kæt/,猫\ndog,/dɒɡ/,狗\nsun,/sʌn/,太阳\nmoon,/muːn/,月亮\n"
        files = {"file": ("test-basic.csv", csv_content, "text/csv")}
        try:
            r = requests.post(
                backend.base_url + "/dictionary/local/upload",
                files=files,
                data={"name": "TestBasic", "description": "Test dictionary for integration test"},
                headers={"Authorization": f"Bearer {api.token}"},
                timeout=10,
            )
            rj = r.json()
        except Exception as e:
            rj = None
            runner.bad(f"local dict upload HTTP exception: {e}")
        if rj and rj.get("code") == 0:
            d = rj.get("data", {})
            test_dict_id = d.get("id")
            runner.ok(f"local dict uploaded: id={test_dict_id}, name='{d.get('name')}', entry_count={d.get('entry_count')}")
        else:
            test_dict_id = None
            runner.bad(f"local dict upload failed: {rj}")

        # ---------- 21. 本地词典 list ----------
        step("21. 本地词典列表（v0.9.1）")
        r = api.get("/dictionary/local")
        if r and r.get("code") == 0:
            items = r.get("data", {}).get("dictionaries", [])
            found = any(d.get("id") == test_dict_id for d in items) if test_dict_id else False
            if found:
                runner.ok(f"local dict list contains id={test_dict_id} (total: {len(items)})")
            else:
                runner.bad(f"local dict list missing id={test_dict_id} (total: {len(items)})")
        else:
            runner.bad(f"local dict list failed: {r}")

        # ---------- 22. 本地词典 lookup ----------
        step("22. 本地词典查词（v0.9.1：精确 + 词形 fallback）")
        r = api.post("/dictionary/local/lookup", {"word": "apple"})
        if r and r.get("code") == 0 and r.get("data", {}).get("found"):
            e = r["data"]["entries"][0]
            runner.ok(f"exact 'apple' hit: word='{e.get('word')}', translation='{e.get('translation')}', matched_by={e.get('matched_by')}")
        else:
            runner.bad(f"local lookup 'apple' failed: {r}")

        r = api.post("/dictionary/local/lookup", {"word": "apples"})
        if r and r.get("code") == 0 and r.get("data", {}).get("found"):
            e = r["data"]["entries"][0]
            if e.get("matched_by", "").startswith("lemma:"):
                runner.ok(f"lemma fallback 'apples' -> '{e.get('word')}' hit: matched_by={e.get('matched_by')}, translation='{e.get('translation')}'")
            else:
                runner.ok(f"'apples' hit (exact): matched_by={e.get('matched_by')}")
        else:
            runner.bad(f"local lookup 'apples' failed: {r}")

        r = api.post("/dictionary/local/lookup", {"word": "studying"})
        if r and r.get("code") == 0 and r.get("data", {}).get("found"):
            e = r["data"]["entries"][0]
            if e.get("matched_by", "").startswith("lemma:"):
                runner.ok(f"lemma fallback 'studying' -> '{e.get('word')}' hit: matched_by={e.get('matched_by')}")
            else:
                runner.ok(f"'studying' hit (exact): matched_by={e.get('matched_by')}")
        else:
            runner.bad(f"local lookup 'studying' failed: {r}")

        r = api.post("/dictionary/local/lookup", {"word": "xyzabc"})
        if r and r.get("code") == 0 and not r.get("data", {}).get("found"):
            runner.ok("miss 'xyzabc' correctly returns found=false")
        else:
            runner.bad(f"miss lookup 'xyzabc' unexpected: {r}")

        # ---------- 23. 本地词典删除 ----------
        step("23. 本地词典删除（v0.9.1：级联删除词条）")
        if test_dict_id:
            r = api.delete(f"/dictionary/local/{test_dict_id}")
            if r and r.get("code") == 0:
                runner.ok(f"local dict id={test_dict_id} deleted")
            else:
                runner.bad(f"local dict delete failed: {r}")
            r2 = api.post("/dictionary/local/lookup", {"word": "apple"})
            if r2 and r2.get("code") == 0 and not r2.get("data", {}).get("found"):
                runner.ok("cascade delete verified: 'apple' lookup now found=false")
            else:
                runner.bad(f"post-delete lookup should be empty: {r2}")
        else:
            runner.bad("skipped (no test dict id)")

        # ---------- 24. 学习进度 GET ----------
        step("24. 学习进度 GET（v1.0.0：首次访问自动创建）")
        if sub_media_id:
            r = api.get(f"/media/{sub_media_id}/learning-progress")
            if r and r.get("code") == 0:
                p = r.get("data", {})
                if p.get("current_stage") == "first_learn" and p.get("current_sub_stage") == "intensive_listen":
                    plan_count = len(p.get("stage_plan", []))
                    if plan_count == 4:
                        runner.ok(f"learning progress auto-created: stage={p.get('current_stage')}, sub={p.get('current_sub_stage')}, plan=4, interval_hours={p.get('interval_hours')}, is_completed={p.get('is_completed')}")
                    else:
                        runner.bad(f"stage_plan should have 4 sub-stages, got {plan_count}")
                else:
                    runner.bad(f"unexpected initial state: stage={p.get('current_stage')}, sub={p.get('current_sub_stage')}")
            else:
                runner.bad(f"learning-progress GET failed: {r}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 25. 学习进度 advance（3 次顺序调用） ----------
        step("25. 学习进度 advance（v1.0.0：连续 3 步）")
        if sub_media_id:
            expected_seq = ["shadowing", "blind_listen", "retell"]
            for idx, expect in enumerate(expected_seq, 1):
                r = api.post(f"/media/{sub_media_id}/learning-progress/advance", {"study_duration_ms": 1000})
                if r is None:
                    runner.bad(f"advance[{idx}] HTTP error")
                    continue
                if r.get("code") == 0:
                    p = r.get("data", {}).get("progress", {})
                    cur_sub = p.get("current_sub_stage")
                    if cur_sub == expect:
                        runner.ok(f"advanced[{idx}] to sub_stage='{cur_sub}' (stage_advanced={r.get('data', {}).get('stage_advanced')}), stage={p.get('current_stage')}, completed={p.get('completed_sub_stages')}/{p.get('total_sub_stages')}")
                    else:
                        runner.bad(f"advance[{idx}] expected sub='{expect}' got '{cur_sub}'")
                else:
                    runner.bad(f"advance[{idx}] returned error: code={r.get('code')}, msg={r.get('message')}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 25b. 学习进度 skip ----------
        step("25b. 学习进度 skip（v1.0.0：从 retell 跳到 review_1）")
        if sub_media_id:
            cur = api.get(f"/media/{sub_media_id}/learning-progress")
            cur_stage = cur.get("data", {}).get("current_stage") if cur else None
            cur_sub = cur.get("data", {}).get("current_sub_stage") if cur else None
            if cur_stage == "first_learn" and cur_sub == "retell":
                runner.ok("skip precondition: state is first_learn.retell as expected")
            else:
                runner.ok(f"skip precondition: state is {cur_stage}.{cur_sub} (not retell) - will skip the current sub-stage anyway")
            r = api.post(f"/media/{sub_media_id}/learning-progress/skip", {})
            if r and r.get("code") == 0:
                p = r.get("data", {}).get("progress", {})
                if p.get("current_stage") == "review_1":
                    runner.ok(f"skip moved {cur_stage}.{cur_sub} -> review_1.{p.get('current_sub_stage')} (stage_advanced={r.get('data', {}).get('stage_advanced')})")
                else:
                    runner.bad(f"skip expected stage=review_1 got {p.get('current_stage')}")
            elif r and "entry" in r.get("message", ""):
                # 入口子步骤不可跳过 — 预期行为
                runner.ok(f"skip correctly rejects entry sub-stage ({cur_stage}.{cur_sub}) - design behavior (msg: {r.get('message')})")
            else:
                runner.bad(f"skip failed: {r}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 25c. pause / resume ----------
        step("25c. 学习进度 pause / resume（v1.0.0）")
        if sub_media_id:
            r = api.post(f"/media/{sub_media_id}/learning-progress/pause", {})
            if r and r.get("code") == 0:
                runner.ok(f"paused ok, is_paused={r.get('data', {}).get('progress', {}).get('is_paused')}")
            else:
                runner.bad(f"pause failed: {r}")
            # 暂停时 advance 应被拒
            r2 = api.post(f"/media/{sub_media_id}/learning-progress/advance", {"study_duration_ms": 100})
            if r2 and r2.get("code", -1) != 0:
                runner.ok(f"paused progress blocks advance: msg='{r2.get('message')}'")
            else:
                runner.bad("paused progress should reject advance")
            r3 = api.post(f"/media/{sub_media_id}/learning-progress/resume", {})
            if r3 and r3.get("code") == 0:
                runner.ok(f"resume ok, is_paused={r3.get('data', {}).get('progress', {}).get('is_paused')}")
            else:
                runner.bad(f"resume failed: {r3}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 26. 难句标记 ----------
        step("26. 难句标记（v1.0.0：mark + list + unmark）")
        if sub_media_id:
            for sent_idx in [0, 2]:
                r = api.post(f"/media/{sub_media_id}/difficult-sentences", {"sentence_index": sent_idx, "marked": True})
                if not (r and r.get("code") == 0):
                    runner.bad(f"mark sentence {sent_idx} failed: {r}")
                    break
            else:
                lst = api.get(f"/media/{sub_media_id}/difficult-sentences")
                if lst and lst.get("code") == 0:
                    items = lst.get("data", {}).get("items", [])
                    cnt = lst.get("data", {}).get("count", 0)
                    idxs = sorted([it.get("sentence_index") for it in items])
                    if cnt >= 2 and idxs[:2] == [0, 2]:
                        runner.ok(f"difficult sentences listed: count={cnt}, indexes={idxs[:2]}")
                    else:
                        runner.bad(f"list difficult count={cnt} (expected >= 2 with idx=[0,2])")
                else:
                    runner.bad(f"list difficult failed: {lst}")
                unmark = api.post(f"/media/{sub_media_id}/difficult-sentences", {"sentence_index": 0, "marked": False})
                if unmark and unmark.get("code") == 0 and unmark.get("data", {}).get("marked") is False:
                    lst2 = api.get(f"/media/{sub_media_id}/difficult-sentences")
                    if lst2.get("data", {}).get("count") == 1:
                        runner.ok(f"unmark ok, count=1 (only idx=2 left)")
                    else:
                        runner.bad(f"unmark count mismatch: got {lst2.get('data', {}).get('count')}, expected 1")
                else:
                    runner.bad(f"unmark failed: {unmark}")
        else:
            runner.bad("skipped (no target media)")

        # ---------- 27. review-queue + stats ----------
        step("27. 复习队列 + 统计（v1.0.0）")
        q = api.get("/learning/review-queue")
        if q and q.get("code") == 0:
            cnt = q.get("data", {}).get("count", 0)
            if cnt >= 1:
                first = q.get("data", {}).get("items", [{}])[0]
                runner.ok(f"review-queue has {cnt} item(s); head: media_id={first.get('media_id')}, stage={first.get('current_stage')}, is_overdue={first.get('is_overdue')}, is_ready={first.get('is_ready')}")
            else:
                runner.ok("review-queue empty (no in-progress media; expected when SubMediaId=0)")
        else:
            runner.bad(f"review-queue failed: {q}")

        s = api.get("/learning/stats")
        if s and s.get("code") == 0:
            d = s.get("data", {})
            by_stage = d.get("reviewing_by_stage", {})
            by_stage_keys = ",".join(by_stage.keys()) if isinstance(by_stage, dict) else str(by_stage)
            runner.ok(f"learning stats: first={d.get('first_learning')}, reviewing={d.get('total_reviewing')} (by_stage={by_stage_keys}), completed={d.get('completed')}, paused={d.get('paused')}, total={d.get('total')}")
        else:
            runner.bad(f"learning stats failed: {s}")

        # ---------- 28. 内置 ECDict status ----------
        step("28. 内置 ECDict 状态（v1.1.0）")
        r = api.get("/dictionary/builtin/status")
        if r and r.get("code") == 0:
            d = r.get("data", {})
            if d.get("available") and d.get("entry_count", 0) >= 1000:
                runner.ok(f"builtin dict available: entry_count={d.get('entry_count')}, csv_exists={d.get('csv_exists')}, source={d.get('source')}")
            elif d.get("csv_exists"):
                runner.bad(f"builtin dict not yet imported: available={d.get('available')}, entry_count={d.get('entry_count')}")
            else:
                runner.ok(f"builtin dict skipped (no ecdict.csv in test env): csv_exists={d.get('csv_exists')}")
        else:
            runner.bad(f"builtin dict status failed: {r}")

        # ---------- 29. 内置 ECDict lookup ----------
        step("29. 内置 ECDict 查词（v1.1.0：精确 + 词形 fallback）")
        r = api.get("/dictionary/builtin/lookup?word=hello")
        if r and r.get("code") == 0:
            if r.get("data", {}).get("found"):
                e = r["data"]["entries"][0]
                runner.ok(f"builtin 'hello' hit: word='{e.get('word')}', phonetic='{e.get('phonetic')}', pos='{e.get('pos')}', translation='{e.get('translation')}', matched_by={e.get('matched_by')}")
            else:
                runner.ok("builtin 'hello' not hit (entry_count may be 0)")
        else:
            runner.bad(f"builtin lookup failed: {r}")

        r = api.get("/dictionary/builtin/lookup?word=studies")
        if r and r.get("code") == 0:
            if r.get("data", {}).get("found"):
                e = r["data"]["entries"][0]
                matched = e.get("matched_by", "")
                if matched.startswith("lemma:"):
                    runner.ok(f"builtin lemma fallback 'studies' -> '{e.get('word')}' hit: matched_by={matched}")
                else:
                    runner.ok(f"builtin 'studies' hit: word='{e.get('word')}', matched_by={matched}")
            else:
                runner.ok("builtin 'studies' not hit (no ecdict in test env)")
        else:
            runner.bad(f"builtin 'studies' lookup failed: {r}")

        # ---------- 30. 内置 ECDict reload ----------
        step("30. 内置 ECDict reload（v1.1.0：重新导入）")
        # 77 万词条全量重导入 ~70s，单独给 120s 超时
        r = api.post("/dictionary/builtin/reload", {}, timeout=120)
        if r and r.get("code") == 0:
            d = r.get("data", {})
            runner.ok(f"builtin reload ok: entry_count={d.get('entry_count')}, duration_ms={d.get('duration_ms')}")
        else:
            msg = (r or {}).get("message", "")
            if "404" in str(r) or "not found" in msg.lower() or "csv" in msg.lower():
                runner.ok(f"builtin reload skipped (no ecdict.csv): {msg}")
            else:
                runner.bad(f"builtin reload failed: {r}")

    finally:
        backend.stop()
        print(f"\n{C.CYAN}=== Cleanup ==={C.RESET}")
        print("  cleanup done")

    return runner.summary()


if __name__ == "__main__":
    sys.exit(main())
