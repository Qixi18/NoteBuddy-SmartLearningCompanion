"""Verify checksums and basic structure of a competition submission ZIP."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def verify(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        with zipfile.ZipFile(path) as archive:
            bad_member = archive.testzip()
            if bad_member:
                errors.append(f"ZIP CRC 校验失败：{bad_member}")
            names = set(archive.namelist())
            if "manifest.json" not in names or "checksums.json" not in names:
                return errors + ["缺少 manifest.json 或 checksums.json"]
            manifest = json.loads(archive.read("manifest.json"))
            checksums = json.loads(archive.read("checksums.json"))
            if not isinstance(manifest, dict) or not isinstance(checksums, dict):
                return errors + ["manifest/checksums 顶层必须是对象"]
            for member, expected in checksums.items():
                if member not in names:
                    errors.append(f"校验清单成员不存在：{member}")
                    continue
                actual = hashlib.sha256(archive.read(member)).hexdigest()
                if actual != expected:
                    errors.append(f"成员哈希不匹配：{member}")
            uncovered = names - set(checksums) - {"checksums.json"}
            if uncovered:
                errors.append("未纳入哈希清单的成员：" + "、".join(sorted(uncovered)))
            if manifest.get("package_type") != "competition_submission":
                errors.append("成果包类型不是 competition_submission")
            if not manifest.get("run_id") or len(manifest.get("case_ids", [])) != 3:
                errors.append("manifest 缺少运行 ID 或三名案例 ID")
            for member in ("release_checks.json", "case_reports.json", "class_report.json", "submission.schema.json"):
                if member not in names:
                    errors.append(f"正式成果包缺少成员：{member}")
            for member in names:
                if member.endswith(".json") and member != "checksums.json":
                    try:
                        json.loads(archive.read(member))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        errors.append(f"JSON 无法解析：{member}")
    except (OSError, zipfile.BadZipFile) as exc:
        errors.append(f"无法读取成果包：{exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="正式提交 ZIP 文件")
    args = parser.parse_args()
    errors = verify(args.archive)
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print(f"PASS: {args.archive} 的 ZIP、manifest、JSON 和 SHA-256 清单均有效")
    print("注意：该工具只检查包结构与哈希，不代表教学内容或赛事独立评测通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
