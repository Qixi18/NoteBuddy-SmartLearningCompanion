"""分析结果、建议草稿、来源与案例 API。"""
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from .responses import JsonHandler
from ..config import settings
from ..services.cases import suggest_cases
from ..services.recommendations import draft


class AnalysisApi(JsonHandler):
    store = None

    def do_GET(self):
        url = urlparse(self.path)
        query = {key: values[0] for key, values in parse_qs(url.query).items()}
        try:
            if url.path == "/api/run":
                self.respond(200, self.store.current())
            elif url.path == "/api/cases":
                self.respond(200, suggest_cases(self.store.current()))
            elif url.path == "/api/draft":
                self.respond(200, draft(self.store.current(), query["student"], query["indicator"]))
            elif url.path == "/api/source":
                run = self.store.current()
                name = query.get("file", "")
                allowed = {"课程标准_2022.pdf"}
                for source in run["source_index"]:
                    allowed.update(source["source_check"].get("textbook_slices", []))
                if name not in allowed or Path(name).name != name:
                    raise ValueError("来源文件不在允许范围")
                source_path = self.store.source_file(run, name)
                if source_path is None:
                    raise FileNotFoundError("本机来源文件不存在")
                self.respond(200, source_path.read_bytes(), "application/pdf")
            else:
                self.respond(404, {"error": "接口不存在"})
        except (ValueError, KeyError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
