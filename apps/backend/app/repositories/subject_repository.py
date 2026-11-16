"""Run-scoped curriculum/material repositories exposed as Domain objects."""

from sqlalchemy import select

from ..domain.subject.models import AssessmentItem, LearningMaterial, LearningObjective
from ..infrastructure.database.models import ItemObjectiveRow, ItemRow, ObjectiveRow
from ..infrastructure.database.mappers import (
    assessment_item_from_row,
    material_from_row,
    objective_from_row,
)
from .base import SqlAlchemyRepository


class SubjectRepository(SqlAlchemyRepository):
    def __init__(self, database, *, session=None):
        super().__init__(database, session=session)

    def get_objective(self, run_id: str, indicator_id: str) -> LearningObjective | None:
        with self.session_scope() as session:
            row = session.get(ObjectiveRow, (run_id, indicator_id))
            if row is None:
                return None
            return objective_from_row(row)

    def list_materials_for_objective(
        self, run_id: str, indicator_id: str
    ) -> list[LearningMaterial]:
        with self.session_scope() as session:
            links = session.scalars(
                select(ItemObjectiveRow).where(
                    ItemObjectiveRow.run_id == run_id,
                    ItemObjectiveRow.indicator_id == indicator_id,
                )
            ).all()
            results = []
            for link in links:
                row = session.get(ItemRow, (run_id, link.material_id))
                results.append(material_from_row(row))
            return results

    def get_assessment_item(
        self, run_id: str, material_id: str
    ) -> AssessmentItem | None:
        with self.session_scope() as session:
            row = session.get(ItemRow, (run_id, material_id))
            if row is None:
                return None
            return assessment_item_from_row(row)
