"""DeepSeek OCR API adapter for curriculum and textbook PDFs."""

from __future__ import annotations

import json
import secrets
import urllib.error
import urllib.request


class DeepSeekOCRError(RuntimeError):
    pass


class DeepSeekOCRAdapter:
    def __init__(
        self,
        api_key: str,
        timeout: int = 180,
        api_url: str = "https://api.deepseek.com/v1/tools/ocr",
        purpose: str = "rich_layout_recognition",
    ):
        self.api_key = api_key
        self.timeout = timeout
        self.api_url = api_url
        self.purpose = purpose

    def recognize(self, filename: str, content: bytes) -> dict:
        boundary = f"----NoteBuddyOCR{secrets.token_hex(16)}"
        body = b"".join(
            (
                f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n{self.purpose}\r\n'.encode(),
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="document.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode(),
                content,
                f"\r\n--{boundary}--\r\n".encode(),
            )
        )
        request = urllib.request.Request(
            self.api_url,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                result = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            # Avoid persisting provider messages that may contain request details.
            raise DeepSeekOCRError(f"DeepSeek OCR HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise DeepSeekOCRError("DeepSeek OCR 网络或超时错误") from exc
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise DeepSeekOCRError("DeepSeek OCR 返回无效 JSON") from exc

        if not isinstance(result, dict):
            raise DeepSeekOCRError("DeepSeek OCR 返回结构无效")
        if result.get("error"):
            error = result["error"]
            code = error.get("code") if isinstance(error, dict) else None
            raise DeepSeekOCRError(
                f"DeepSeek OCR 识别失败{f' ({code})' if code else ''}"
            )
        pages = result.get("pages")
        if not isinstance(pages, list):
            raise DeepSeekOCRError("DeepSeek OCR 未返回逐页识别结果")
        return result
