"""Preview or remove only app-managed data after the application is stopped."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "backend"))

from app.config import settings


def managed_targets(data_root: Path) -> list[Path]:
    root = data_root.resolve()
    targets = [root / "source_ocr_cache", root / "imported_sources", root / "exports"]
    database_value = settings.database_url.removeprefix("sqlite:///")
    database = Path(database_value)
    if not database.is_absolute():
        database = settings.project_root / database
    if database.resolve().is_relative_to(root):
        targets.append(database.resolve())
    safe = []
    for target in targets:
        if target.exists() and target.resolve().is_relative_to(root):
            safe.append(target)
    return safe


def fingerprint(paths: list[Path]) -> str:
    listing: list[tuple[str, str]] = []
    for target in paths:
        if target.is_symlink():
            listing.append((str(target), f"symlink:{target.readlink()}"))
            continue
        listing.append((str(target), "directory" if target.is_dir() else "file"))
        files = [target] if target.is_file() else sorted(target.rglob("*"))
        for item in files:
            if item.is_symlink():
                listing.append((str(item), f"symlink:{item.readlink()}"))
                continue
            if not item.is_file():
                continue
            content_hash = hashlib.sha256()
            with item.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    content_hash.update(chunk)
            digest = content_hash.hexdigest()
            listing.append((str(item.relative_to(target.parent)), digest))
    return hashlib.sha256(repr(listing).encode()).hexdigest()[:12]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="执行清理；默认只预览")
    parser.add_argument(
        "--stopped", action="store_true", help="确认应用和后台服务已停止"
    )
    parser.add_argument("--confirm", help="输入预览给出的清单指纹")
    args = parser.parse_args()
    root = Path(settings.data_dir).resolve()
    paths = managed_targets(root)
    digest = fingerprint(paths)
    print(f"受管数据目录：{root}")
    for path in paths:
        print(path)
    print(f"清单指纹：{digest}")
    if not args.apply:
        print("预览完成；默认不删除数据。")
        return 0
    if not args.stopped or args.confirm != digest:
        parser.error("执行前必须确认服务已停止，并提供完全匹配的 --confirm 指纹")
    for path in paths:
        if path.is_symlink():
            path.unlink()
        elif path.is_dir():
            shutil.rmtree(path)
        elif path.is_file():
            path.unlink()
    print("受管数据清理完成；仓库外来源文件和备份未包含在本工具范围内。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
