import io
import json
import threading
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer

from app.services.analysis import analyze
from app.api.server import make_handler
from app.repositories.store import Store
from test_core import sample_tables


def test_http_review_to_export(tmp_path):
    run = analyze(sample_tables(), {})
    store = Store(tmp_path)
    folder = tmp_path / run["run_id"]
    folder.mkdir()
    (folder / "analysis.json").write_text(json.dumps(run, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "current.txt").write_text(run["run_id"], encoding="utf-8")
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(store))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    root = f"http://127.0.0.1:{server.server_port}"
    try:
        with urllib.request.urlopen(f"{root}/api/draft?student=D01&indicator=T01I1") as response:
            draft = json.load(response)
        assert draft["evidence_record_ids"] == ["R2"]
        body = {"student_id": "D01", "indicator_id": "T01I1", "status": "edited",
                "diagnosis": "复核诊断", "recommendation": "先做一道练习", "adjustment_condition": "再次观察",
                "reason": "根据步骤", "evidence_record_ids": draft["evidence_record_ids"]}
        request = urllib.request.Request(f"{root}/api/review", json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urllib.request.urlopen(request) as response:
            saved = json.load(response)
        assert saved["version"] == 1
        with urllib.request.urlopen(f"{root}/api/export?cases=D01,D02,D03") as response:
            with zipfile.ZipFile(io.BytesIO(response.read())) as archive:
                recommendations = json.loads(archive.read("recommendations.json"))
                assert recommendations[0]["recommendation"] == "先做一道练习"
                assert len(json.loads(archive.read("student_cases.json"))) == 3
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
