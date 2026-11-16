from dataclasses import dataclass

from ..common.exceptions import DomainError


@dataclass(frozen=True, slots=True)
class ClassGroup:
    class_id: str
    name: str = ""

    def __post_init__(self) -> None:
        if not self.class_id.strip():
            raise DomainError("class_id 不能为空")


@dataclass(frozen=True, slots=True)
class Student:
    student_id: str
    class_id: str

    def __post_init__(self) -> None:
        if not self.student_id.strip() or not self.class_id.strip():
            raise DomainError("student_id 和 class_id 不能为空")
