"""复核记录 API。"""
from .responses import JsonHandler
from ..schemas.review import validate_review_request


class ReviewApi(JsonHandler):
    store = None

    def do_GET(self):
        if self.path != "/api/reviews":
            self.respond(404, {"error": "接口不存在"})
            return
        try:
            run = self.store.current()
            self.respond(200, self.store.reviews(run["run_id"]))
        except FileNotFoundError as exc:
            self.respond(400, {"error": str(exc)})

    def do_POST(self):
        if self.path != "/api/review":
            self.respond(404, {"error": "接口不存在"})
            return
        try:
            payload = validate_review_request(self.body())
            run = self.store.current()
            saved = self.store.save_review(run["run_id"], payload["student_id"], payload["indicator_id"], payload)
            self.respond(200, saved)
        except (ValueError, KeyError, FileNotFoundError) as exc:
            self.respond(400, {"error": str(exc)})
