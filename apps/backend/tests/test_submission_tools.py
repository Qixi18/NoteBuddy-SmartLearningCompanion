import hashlib
import importlib.util
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _load_script(name: str):
    path = ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_submission_verifier_checks_required_package_members_and_hashes(tmp_path):
    verifier = _load_script("verify_submission")
    members = {
        "manifest.json": json.dumps(
            {
                "package_type": "competition_submission",
                "run_id": "run-1",
                "case_ids": ["D1", "D2", "D3"],
            }
        ).encode(),
        "release_checks.json": b"[]",
        "case_reports.json": b"{}",
        "class_report.json": b"{}",
        "submission.schema.json": b"{}",
    }
    checksums = {
        name: hashlib.sha256(content).hexdigest() for name, content in members.items()
    }
    members["checksums.json"] = json.dumps(checksums).encode()
    archive_path = tmp_path / "submission.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    assert verifier.verify(archive_path) == []

    members["case_reports.json"] = b"{"
    with zipfile.ZipFile(archive_path, "w") as archive:
        for name, content in members.items():
            archive.writestr(name, content)
    errors = verifier.verify(archive_path)
    assert any("成员哈希不匹配" in error for error in errors)
    assert any("JSON 无法解析" in error for error in errors)


def test_cleanup_confirmation_fingerprint_tracks_content_changes(tmp_path):
    cleaner = _load_script("cleanup_competition_data")
    managed = tmp_path / "managed"
    managed.mkdir()
    database = managed / "app.sqlite"
    database.write_bytes(b"first")
    first = cleaner.fingerprint([database])
    database.write_bytes(b"other")
    assert cleaner.fingerprint([database]) != first
