"""Scan build, report, screenshot, and ZIP artifacts for accidental disclosures."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re
import struct
import zipfile


RULES: tuple[tuple[str, re.Pattern[bytes]], ...] = (
    ("api-key-token", re.compile(rb"(?i)\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("bearer-token", re.compile(rb"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{20,}")),
    (
        "secret-config-line",
        re.compile(
            rb"(?im)^\s*(?:MODEL_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|"
            rb"API_KEY|SECRET_KEY|ACCESS_TOKEN)\s*[:=]\s*\S+"
        ),
    ),
    ("windows-user-path", re.compile(rb"(?i)[A-Z]:[\\/]+Users[\\/]+[^\\/\r\n\"<> ]+")),
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_TEXT_CHUNKS = {b"tEXt", b"zTXt", b"iTXt"}


@dataclass(frozen=True)
class Finding:
    relative_path: str
    rule: str


def _png_text(data: bytes) -> bytes:
    if not data.startswith(PNG_SIGNATURE):
        return b""
    parts: list[bytes] = []
    offset = len(PNG_SIGNATURE)
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        end = offset + 12 + length
        if end > len(data):
            break
        chunk = data[offset + 8 : offset + 8 + length]
        if chunk_type == b"tEXt":
            parts.append(chunk)
        elif chunk_type == b"zTXt" and b"\x00" in chunk:
            import zlib

            try:
                parts.append(zlib.decompress(chunk.split(b"\x00", 1)[1][1:]))
            except zlib.error:
                parts.append(chunk)
        elif chunk_type == b"iTXt" and b"\x00" in chunk:
            fields = chunk.split(b"\x00", 5)
            if len(fields) == 6:
                compressed = fields[1] == b"\x01"
                payload = fields[5]
                if compressed:
                    import zlib

                    try:
                        payload = zlib.decompress(payload)
                    except zlib.error:
                        pass
                parts.append(payload)
        offset = end
    return b"\n".join(parts)


def _matches(label: str, data: bytes) -> list[Finding]:
    findings = []
    for name, pattern in RULES:
        if name == "secret-config-line":
            continue
        if pattern.search(data):
            findings.append(Finding(label, name))
    if re.search(
        rb"(?im)^\s*(?:MODEL_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|"
        rb"API_KEY|SECRET_KEY|ACCESS_TOKEN)\s*[:=]\s*\S+",
        data,
    ):
        findings.append(Finding(label, "secret-config-line"))
    if label.lower().endswith((".png", ".png!/")):
        metadata = _png_text(data)
        findings.extend(
            Finding(label, name) for name, pattern in RULES if pattern.search(metadata)
        )
    return findings


def scan_path(path: str | Path) -> list[Finding]:
    target = Path(path).expanduser().resolve()
    findings: list[Finding] = []
    if target.is_dir():
        for file_path in sorted(item for item in target.rglob("*") if item.is_file()):
            findings.extend(
                _scan_file(file_path, file_path.relative_to(target).as_posix())
            )
    elif target.is_file():
        findings.extend(_scan_file(target, target.name))
    return findings


def _scan_file(file_path: Path, label: str) -> list[Finding]:
    try:
        data = file_path.read_bytes()
    except OSError:
        return [Finding(label, "unreadable-file")]
    findings = [] if zipfile.is_zipfile(file_path) else _matches(label, data)
    if zipfile.is_zipfile(file_path):
        try:
            with zipfile.ZipFile(file_path) as archive:
                for info in archive.infolist():
                    if info.is_dir():
                        continue
                    member = f"{label}!/{info.filename}"
                    try:
                        contents = archive.read(info)
                    except (OSError, RuntimeError, zipfile.BadZipFile):
                        findings.append(Finding(member, "unreadable-zip-member"))
                        continue
                    findings.extend(_matches(member, contents))
        except (OSError, zipfile.BadZipFile):
            findings.append(Finding(label, "invalid-zip"))
    return _dedupe(findings)


def _dedupe(findings: list[Finding]) -> list[Finding]:
    return list(dict.fromkeys(findings))


def format_findings(findings: list[Finding]) -> str:
    if not findings:
        return "No artifact disclosure patterns found."
    return "\n".join(f"{finding.relative_path}: {finding.rule}" for finding in findings)


def make_test_png_with_text(keyword: str, value: str) -> bytes:
    """Build a tiny valid PNG with a tEXt chunk for scanner unit tests."""
    import zlib

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return (
            struct.pack(">I", len(payload))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    image_data = b"\x00\x00\x00\x00"
    return (
        PNG_SIGNATURE
        + chunk(b"IHDR", struct.pack(">2I5B", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"tEXt", keyword.encode() + b"\x00" + value.encode())
        + chunk(b"IDAT", zlib.compress(image_data))
        + chunk(b"IEND", b"")
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths", nargs="+", type=Path, help="Files or directories to scan"
    )
    args = parser.parse_args(argv)
    findings = _dedupe([finding for path in args.paths for finding in scan_path(path)])
    print(format_findings(findings))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
