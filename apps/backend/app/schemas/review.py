"""教师复核接口的数据契约。"""

from typing import Literal, TypedDict


ReviewStatus = Literal["accepted", "edited", "rejected", "needs_observation"]


class ReviewRequest(TypedDict):
    student_id: str
    indicator_id: str
    status: ReviewStatus
    recommendation: str
    evidence_record_ids: list[str]


def validate_review_request(payload: dict) -> dict:
    required = ("student_id", "indicator_id", "status")
    for key in required:
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            raise ValueError(f"{key} 必须是非空字符串")
    if payload["status"] not in {"accepted", "edited", "rejected", "needs_observation"}:
        raise ValueError("复核状态无效")
    for key in ("diagnosis", "recommendation", "adjustment_condition", "reason"):
        if key in payload and not isinstance(payload[key], str):
            raise ValueError(f"{key} 必须是字符串")
    if payload["status"] == "edited" and not payload.get("recommendation", "").strip():
        raise ValueError("修改后的建议不能为空")
    evidence = payload.get("evidence_record_ids", [])
    if not isinstance(evidence, list) or any(
        not isinstance(item, str) for item in evidence
    ):
        raise ValueError("evidence_record_ids 必须是字符串数组")
    return payload
