# 05 — Domain 领域模型

## 边界

`apps/backend/app/domain/` 使用 Python dataclass、Enum 与领域异常描述教育业务，不导入 FastAPI、Pydantic、SQLAlchemy、文件系统或外部 HTTP 客户端。API schema 仍是 HTTP 合约，ORM 是数据库映射；二者都不继承 Domain 类型。当前 Service 保留既有 dict 契约，按用例逐步用 Domain 对象收敛，不在本阶段重写统计流程。

## 模型

| 模型 | 关键字段/职责 |
|---|---|
| `ClassGroup`、`Student` | 班级编号/名称；学生编号及班级编号。当前赛事数据没有学校、教师账户实体。 |
| `LearningObjective` | 指标编号、主题编号、观察指标、说明、来源引用。 |
| `AssessmentItem`、`LearningMaterial` | 材料编号、类型、可关联多个目标、满分/内容或资源位置、来源。当前快照按实际材料行记录映射。 |
| `AssessmentNode` | 节点编号、可用题目、可选日期/主题/说明。 |
| `Response` | 记录/事件/学生/材料/节点编号、修订版本、评分状态、得分/满分、解答步骤、评分点、来源文件及原始行号。 |
| `ResponseRevision` | 同一事件的候选修订；仅唯一最高版本可选，身份冲突或最高版本并列返回无选中结果。 |
| `Metric`、`AnalysisRun` | 指标边界与来源记录 ID；运行身份、创建时间、规则版本和输入指纹。 |
| `Evidence` | 学生、学习目标、记录、材料、来源及行号和得分信息。 |
| `Diagnosis`、`RecommendationDraft` | 诊断事实与证据充分性；建议草稿携带证据允许集、来源/model/prompt 版本和复核状态。 |
| `TeacherReview` | 四种现有状态、复核版本、建议、证据和理由；版本只能连续追加。 |

## 规则

- `Response` 校验正修订号、正满分、得分非负；已评分记录要求得分不超过满分。待评分不参与 ratio 计算。
- 修订选版保留现有服务算法的全部质量 finding 和逐行追溯；Domain 的 `ResponseRevision.unique_highest()` 提供等价的最小领域规则，不代替原服务逻辑。
- Evidence 必须包含来源记录定位。建议只能引用明确允许的证据，不可由模型自造；草稿不得自行标为 accepted。
- edited 复核必须有非空建议，复核历史版本严格递增。
- CSV 中存在不合法/缺失引用的原始记录时仍须保存原快照与质量报告；规范化投影不能因此丢失源记录。

## 代码地图

`domain/common/` 定义状态枚举及领域异常；`student/models.py` 定义学习者；`subject/models.py` 定义目标、材料和测评节点；`assessment/models.py` 定义作答及修订；`teaching/models.py` 定义证据、诊断、建议和复核。对应独立单测位于 `apps/backend/tests/test_phase02.py`。
