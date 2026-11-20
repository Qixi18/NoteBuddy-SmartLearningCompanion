# API 契约

所有现行路径由 FastAPI 保持原名。成功响应保留旧前端所用字段；客户端错误新增 `code` 和 `request_id`，并保留 `error` 文本。请求校验由 Pydantic 执行。未知后端异常使用通用安全消息，不回传堆栈。

| 方法 | 路径 | 输入 | 成功响应 |
|---|---|---|---|
| GET | `/api/health` | 无 | `{"status":"ok"}` |
| POST | `/api/import` | `{"folder":"本机 CSV 目录绝对路径"}` | `{"run_id":"…","quality":{…}}`；Pydantic 要求非空绝对路径，新运行持久化后更新当前指针 |
| GET | `/api/run` | 无 | 当前 AnalysisRun；Quality 增加逐行/事件处置计数，Metric/Observation 增加可选节点状态和隔离记录编号，并提供结构化 `rubric_observations` |
| GET | `/api/cases` | 无 | 三类不同学生的当前节点候选；理由列明有效证据、题目/班级覆盖与限制；少于三名学生时为空数组 |
| GET | `/api/draft?student=…&indicator=…` | 必填学生、指标；可选 `node` | TR-01..TR-08 草稿；旧字段保留并增加规则、观察事实、推断边界、步骤、来源行；跨节点需选择，未知 node 返回安全业务错误 |
| POST | `/api/deepseek` | `student_id`, `indicator_id`；可选 `node_id` | 结构和证据校验后的单 DeepSeek 草稿；范围/冲突闸门返回规则基线，不由模型覆盖 |
| GET | `/api/ai-analysis` | 必填 `task=task01|task02|task03`；可选 `run_id`、`node_id`、成对的 `student_id`/`indicator_id` | 当前精确范围的模型、输入覆盖摘要、最新有效分析或过期标记；不调用模型 |
| POST | `/api/ai-analysis` | `task`、`action=generate|refresh|retry_failed`、`request_id`、`transmission_confirmed=true`；可选运行/节点/学生/指标范围及重试 `analysis_id` | 经原文引用验证的持久化分析版本、结论和分块覆盖状态；只在确认后访问模型 |
| GET | `/api/reviews` | 无 | 当前运行的 `student_id:indicator_id` → 版本数组映射 |
| POST | `/api/review` | 学生、指标、状态及复核字段/证据 ID | 新增复核版本 |
| GET/POST | `/api/source-verifications`、`/api/source-verification` | 当前运行的签核历史／单指标逐项签核 | 版本映射／新增签核版本 |
| GET/POST | `/api/teacher-cases`、`/api/teacher-case` | 当前运行的案例历史／案例确认字段 | 版本映射／新增案例版本 |
| GET/POST | `/api/teaching-adjustments` | 无／起始运行、学生、指标、节点、已接受复核版本与教学计划 | 跨运行调整记录列表／新调整记录 |
| PATCH | `/api/teaching-adjustments/{adjustment_id}` | 实施状态、后续运行/节点/同范围证据、教师可比性与结论 | 更新后的记录及前序版本历史；不会自动推断干预效果 |
| GET | `/api/source?file=…` | 允许列表中的 PDF 文件名 | PDF 字节流 |
| GET | `/api/export?cases=id1,id2,id3` | 三个不同有效学生 ID | `application/zip` |

教学调整的起始复核必须为 `accepted` 或 `edited`，并固定其运行、学生、指标、节点和版本；后续记录校验相同学生/指标/节点及该运行中存在的证据 ID。教师需填写可比性判断及结论，服务只保存人工判断，不将两次分数变化解释为干预效果。调整历史可随 `/api/export` 导出为 `teaching_adjustments.json`。

API 错误及静态页面/资源错误统一返回包含 `error`、`code`、`request_id` 的 JSON；中间件也会写入 `X-Request-ID`。未知异常和模型供应方错误不会泄露堆栈、密钥或供应方原文。

错误响应格式：

```json
{"error":"请求参数无效","code":"VALIDATION_ERROR","request_id":"…"}
```

Pydantic 参数校验当前使用 HTTP 422；业务输入错误 400；未知节点 400；未找到分析运行 400；DeepSeek 供应方失败统一映射为 502。Review 唯一键冲突返回 409 `REVIEW_VERSION_CONFLICT`，SQLite busy/locked 返回 503 `DATABASE_BUSY`，均不回传数据库异常参数。健康、错误、Review、Draft、AnalysisRun/Quality 的共享 JSON fixture 由 pytest 和 Vitest 同时读取；真实 `/api/run` 测试确认 Pydantic 不会过滤新增质量字段。Review 引用允许同一运行内、同学生/指标/节点范围的已选作答记录，包括待评分或质量冲突记录，以便记录教师核查依据；此引用不改变其统计处置，其他学生/指标/节点及非当前记录仍拒绝。成果 ZIP 保留旧成员，并追加 `course_relations.json/csv`、`node_scoped_metrics.json`、`node_observations.json`、`rubric_observations.json` 和 `teaching_adjustments.json`；字段与口径说明解释处置、未知状态和覆盖边界。健康、导入、Review、来源、模型失败、并发数据库错误、统一错误、教学调整两运行和导出路径均有 TestClient 覆盖。`apps/web/src/api/live-contract.test.ts` 通过显式 `VITE_SMART_LEARNING_LIVE_CONTRACT=1`、后端 URL 和导入目录配置启用；真实 HTTP 检查导入、run、cases、node draft、Review/历史与 ZIP 导出；默认本地单测跳过，不伪称已执行。所有 API 路由经 Application Use Cases 访问业务能力；路由不直接依赖 Store、Session、文件系统或模型 HTTP 客户端。

`/api/subject/*`、`/api/analysis/*`、`/api/teaching/*` 是未来扩展命名建议，不是当前已实现接口；教学调整当前路径为 `/api/teaching-adjustments`。
