import importlib.util
from pathlib import Path
import sys
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "scan-artifacts.py"
SPEC = importlib.util.spec_from_file_location("scan_artifacts", SCRIPT)
assert SPEC and SPEC.loader
scanner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = scanner
SPEC.loader.exec_module(scanner)


def test_scans_all_files_and_reports_findings_without_exposing_values(tmp_path):
    clean = tmp_path / "clean.txt"
    clean.write_text("normal demo content", encoding="utf-8")
    leaked = tmp_path / "nested" / "review.log"
    leaked.parent.mkdir()
    leaked.write_text(
        "Authorization: Bearer " + "A" * 28 + "\n"
        "MODEL_API_KEY=super-secret-placeholder-123456789\n"
        "D:\\Users\\PrivateName\\Desktop\\report.txt",
        encoding="utf-8",
    )

    findings = scanner.scan_path(tmp_path)

    assert {finding.rule for finding in findings} >= {
        "bearer-token",
        "secret-config-line",
        "windows-user-path",
    }
    assert {finding.relative_path for finding in findings} == {"nested/review.log"}
    rendered = scanner.format_findings(findings)
    assert "PrivateName" not in rendered
    assert "super-secret-placeholder" not in rendered


def test_scans_every_zip_member_and_png_text_chunks(tmp_path):
    archive_path = tmp_path / "demo.zip"
    secret = "sk-" + "a" * 32
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("manifest.json", '{"ok": true}')
        archive.writestr("nested/log.txt", f"model={secret}")
    png_path = tmp_path / "screenshot.png"
    png_path.write_bytes(
        scanner.make_test_png_with_text("Author", "C:\\Users\\Private")
    )

    findings = scanner.scan_path(archive_path) + scanner.scan_path(png_path)

    assert {(item.relative_path, item.rule) for item in findings} == {
        ("demo.zip!/nested/log.txt", "api-key-token"),
        ("screenshot.png", "windows-user-path"),
    }
