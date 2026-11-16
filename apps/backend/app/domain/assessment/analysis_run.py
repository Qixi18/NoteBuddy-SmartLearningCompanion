from dataclasses import dataclass

from ..common.exceptions import DomainError


@dataclass(frozen=True, slots=True)
class AnalysisRun:
    run_id: str
    created_at: str
    rule_version: str
    input_fingerprint: str

    def __post_init__(self) -> None:
        if not self.run_id or not self.created_at or not self.rule_version:
            raise DomainError("分析运行标识、时间和规则版本不能为空")
