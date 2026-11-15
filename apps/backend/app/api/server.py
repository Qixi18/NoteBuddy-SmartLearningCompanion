"""本地 HTTP 组合入口：API handler 与前端静态资源。"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .analysis import AnalysisApi
from .exports import ExportApi
from .imports import ImportApi
from .models import ModelApi
from .reviews import ReviewApi
from .responses import JsonHandler
from ..config import settings
from ..repositories.store import Store


def make_handler(store: Store):
    class Handler(JsonHandler):
        def _dispatch(self, api_type, method):
            api = api_type.__new__(api_type)
            api.__dict__ = self.__dict__
            api.store = store
            getattr(api, method)()
            self.__dict__.update(api.__dict__)

        def do_GET(self):
            if self.path.startswith("/api/"):
                path = self.path.split("?", 1)[0]
                routes = {
                    "/api/run": AnalysisApi,
                    "/api/cases": AnalysisApi,
                    "/api/draft": AnalysisApi,
                    "/api/source": AnalysisApi,
                    "/api/reviews": ReviewApi,
                    "/api/export": ExportApi,
                }
                api_type = routes.get(path)
                if api_type is None:
                    self.respond(404, {"error": "接口不存在"})
                else:
                    self._dispatch(api_type, "do_GET")
                return
            if self.path == "/":
                index = settings.web_dist_dir / "index.html"
                self._file(index, "text/html")
            elif self.path.startswith("/assets/"):
                asset_name = self.path.rsplit("/", 1)[-1]
                if not asset_name or Path(asset_name).name != asset_name:
                    self.respond(400, {"error": "资源路径无效"})
                    return
                asset = settings.web_dist_dir / "assets" / asset_name
                mime = "text/css" if asset.suffix == ".css" else "text/javascript"
                self._file(asset, mime)
            else:
                self.respond(404, {"error": "页面不存在"})

        def _file(self, path: Path, mime: str):
            try:
                self.respond(200, path.read_bytes(), mime)
            except FileNotFoundError:
                self.respond(503, {"error": "前端构建资源不存在，请在 apps/web 执行 npm run build"})

        def do_POST(self):
            path = self.path.split("?", 1)[0]
            routes = {"/api/import": ImportApi, "/api/review": ReviewApi, "/api/deepseek": ModelApi}
            api_type = routes.get(path)
            if api_type is None:
                self.respond(404, {"error": "接口不存在"})
            else:
                self._dispatch(api_type, "do_POST")

    return Handler


def serve(data_dir: Path, port: int = 8765, host: str = "127.0.0.1"):
    try:
        server = ThreadingHTTPServer((host, port), make_handler(Store(data_dir)))
    except OSError as exc:
        if exc.errno == 10048:
            raise RuntimeError(f"端口 {port} 已被占用。请停止旧服务或设置 SMART_LEARNING_PORT 使用其他端口。") from exc
        raise
    print(f"智慧学伴：http://localhost:{port}")
    server.serve_forever()
