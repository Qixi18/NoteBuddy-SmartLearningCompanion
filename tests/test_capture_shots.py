import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "capture-shots.py"
SPEC = importlib.util.spec_from_file_location("capture_shots", SCRIPT)
assert SPEC and SPEC.loader
capture_shots = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(capture_shots)


def test_capture_paths_default_to_project_sibling_and_loopback():
    args = capture_shots.parse_args([])

    assert args.base_url == "http://127.0.0.1:5174"
    assert args.output_dir == SCRIPT.resolve().parents[1] / "web端截图"


def test_capture_paths_accept_explicit_url_and_output_directory(tmp_path):
    output = tmp_path / "screenshots with spaces"
    args = capture_shots.parse_args(
        ["--base-url", "http://localhost:5188", "--output-dir", str(output)]
    )

    assert args.base_url == "http://localhost:5188"
    assert args.output_dir == output.resolve()
