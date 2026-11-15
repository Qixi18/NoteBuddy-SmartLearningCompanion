"""HTTP 响应与请求体处理。"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler


class JsonHandler(BaseHTTPRequestHandler):
    def respond(self, status: int, value, mime: str = "application/json") -> None:
        data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime != "application/zip" else mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self) -> dict:
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Content-Length 无效") from exc
        if size <= 0:
            raise ValueError("请求体不能为空")
        if size > 1_000_000:
            raise ValueError("请求过大")
        try:
            payload = json.loads(self.rfile.read(size))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("请求体必须是有效 JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("请求体必须是 JSON 对象")
        return payload

    def log_message(self, fmt: str, *args) -> None:
        # 保留标准库访问日志，便于本地排障。
        super().log_message(fmt, *args)
