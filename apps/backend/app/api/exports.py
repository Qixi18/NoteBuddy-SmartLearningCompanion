"""成果包导出 API。"""
from urllib.parse import parse_qs, urlparse
from .responses import JsonHandler
from ..services.exports import package


class ExportApi(JsonHandler):
    store = None

    def do_GET(self):
        url = urlparse(self.path)
        if url.path != "/api/export":
            self.respond(404, {"error": "接口不存在"})
            return
        try:
            query = parse_qs(url.query)
            case_ids = query.get("cases", [""])[0].split(",")
            run = self.store.current()
            self.respond(200, package(run, self.store.reviews(run["run_id"]), case_ids), "application/zip")
        except (ValueError, KeyError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
