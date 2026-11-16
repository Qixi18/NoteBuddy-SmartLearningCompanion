"""Run-scoped curriculum/material repositories exposed as Domain objects."""

import json

from sqlalchemy import select

from ..domain.subject.models import AssessmentItem, LearningMaterial, LearningObjective
from ..infrastructure.database.models import ItemObjectiveRow, ItemRow, ObjectiveRow
from ..infrastructure.database.session import Database


class SubjectRepository:
    def __init__(self, database: Database):
        self.database = database

    def get_objective(self, run_id: str, indicator_id: str) -> LearningObjective | None:
        with self.database.session() as session:
            row = session.get(ObjectiveRow, (run_id, indicator_id))
            if row is None:
                return None
            value = json.loads(row.data_json)
            return LearningObjective(
                indicator_id=row.indicator_id,
                topic_id=row.topic_id,
                title=row.title,
                description=str(value.get("说明", "")),
                source_refs=tuple(value.get("source_refs", ())),
            )

    def list_materials_for_objective(
        self, run_id: str, indicator_id: str
    ) -> list[LearningMaterial]:
        with self.database.session() as session:
            links = session.scalars(
                select(ItemObjectiveRow).where(
                    ItemObjectiveRow.run_id == run_id,
                    ItemObjectiveRow.indicator_id == indicator_id,
                )
            ).all()
            results = []
            for link in links:
                row = session.get(ItemRow, (run_id, link.material_id))
                value = json.loads(row.data_json)
                results.append(
                    LearningMaterial(
                        material_id=row.material_id,
                        material_type=row.item_type,
                        objective_ids=tuple(json.loads(row.objective_ids_json)),
                        content=str(value.get("题目内容", value.get("材料内容", ""))),
                        resource_uri=value.get("资源位置"),
                        source_refs=tuple(value.get("来源", ())),
                    )
                )
            return results

    def get_assessment_item(
        self, run_id: str, material_id: str
    ) -> AssessmentItem | None:
        with self.database.session() as session:
            row = session.get(ItemRow, (run_id, material_id))
            if row is None:
                return None
            value = json.loads(row.data_json)
            objective_ids = tuple(json.loads(row.objective_ids_json))
            return AssessmentItem(
                item_id=row.material_id,
                item_type=row.item_type,
                objective_ids=objective_ids,
                max_score=float(value.get("满分", 1) or 1),
                content=str(value.get("题目内容", "")),
                source_refs=tuple(value.get("来源", ())),
            )
