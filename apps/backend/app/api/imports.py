"""赛事数据导入 API。"""
from pathlib import Path
from .responses import JsonHandler
from ..schemas.api import ImportRequest, ImportResponse


class ImportApi(JsonHandler):
    store = None

    def do_POST(self):
        if self.path != "/api/import":
            self.respond(404, {"error": "接口不存在"})
            return
        try:
            payload: ImportRequest = self.body()
            folder = payload.get("folder")
            if not isinstance(folder, str) or not folder.strip():
                raise ValueError("folder 必须是非空目录路径")
            result = self.store.import_folder(Path(folder))
            response: ImportResponse = {"run_id": result["run_id"], "quality": result["quality"]}
            self.respond(200, response)
        except (ValueError, KeyError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
