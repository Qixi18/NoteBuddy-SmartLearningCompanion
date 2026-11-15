"""模型辅助 API。"""
from .responses import JsonHandler
from ..config import settings
from ..services.recommendations import deepseek_draft
from ..schemas.api import validate_draft_request


class ModelApi(JsonHandler):
    store = None

    def do_POST(self):
        if self.path != "/api/deepseek":
            self.respond(404, {"error": "接口不存在"})
            return
        try:
            payload = validate_draft_request(self.body())
            run = self.store.current()
            result = deepseek_draft(run, payload["student_id"], payload["indicator_id"], settings.deepseek_api_key, settings.deepseek_model)
            self.respond(200, result)
        except (ValueError, KeyError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
        except Exception as exc:
            self.respond(502, {"error": f"模型服务调用失败：{exc.__class__.__name__}"})
