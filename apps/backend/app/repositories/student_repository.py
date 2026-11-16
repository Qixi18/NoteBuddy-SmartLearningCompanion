"""Run-scoped student persistence exposed as Domain objects."""

import json

from sqlalchemy import select

from ..domain.student.models import ClassGroup, Student
from ..infrastructure.database.models import ClassRow, StudentRow
from ..infrastructure.database.session import Database


class StudentRepository:
    def __init__(self, database: Database):
        self.database = database

    def get_by_id(self, run_id: str, student_id: str) -> Student | None:
        with self.database.session() as session:
            row = session.get(StudentRow, (run_id, student_id))
            return (
                Student(student_id=row.student_id, class_id=row.class_id)
                if row
                else None
            )

    def list_by_class(self, run_id: str, class_id: str) -> list[Student]:
        with self.database.session() as session:
            rows = session.scalars(
                select(StudentRow)
                .where(StudentRow.run_id == run_id, StudentRow.class_id == class_id)
                .order_by(StudentRow.student_id)
            ).all()
            return [
                Student(student_id=row.student_id, class_id=row.class_id)
                for row in rows
            ]

    def save(
        self, run_id: str, student: Student, class_group: ClassGroup | None = None
    ) -> None:
        with self.database.session() as session, session.begin():
            class_row = session.get(ClassRow, (run_id, student.class_id))
            if class_row is None:
                session.add(
                    ClassRow(
                        run_id=run_id,
                        class_id=student.class_id,
                        name=class_group.name if class_group else student.class_id,
                    )
                )
            row = session.get(StudentRow, (run_id, student.student_id))
            if row is None:
                row = StudentRow(
                    run_id=run_id,
                    student_id=student.student_id,
                    class_id=student.class_id,
                    data_json=json.dumps(
                        {
                            "学生编号": student.student_id,
                            "模拟班级编号": student.class_id,
                        },
                        ensure_ascii=False,
                    ),
                )
                session.add(row)
            else:
                row.class_id = student.class_id
                row.data_json = json.dumps(
                    {"学生编号": student.student_id, "模拟班级编号": student.class_id},
                    ensure_ascii=False,
                )
