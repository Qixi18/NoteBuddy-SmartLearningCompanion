# API 契约

所有现行路径由 FastAPI 保持原名。成功响应保留旧前端所用字段；客户端错误新增 `code` 和 `request_id`，并保留 `error` 文本。请求校验由 Pydantic 执行。未知后端异常使用通用安全消息，不回传堆栈。

| 方法 | 路径 | 输入 | 成功响应 |
|---|---|---|---|
| GET | `/api/health` | 无 | `{"status":"ok"}` |
| POST | `/api/import` | `{"folder":"本机 CSV 目录绝对路径"}` | `{"run_id":"…","quality":{…}}`；Pydantic 要求非空绝对路径，新运行持久化后更新当前指针 |
| GET | `/api/run` | 无 | 当前 AnalysisRun JSON |
| GET | `/api/cases` | 无 | 三类案例候选数组；少于三名学生时为空数组 |
| GET | `/api/draft?student=…&indicator=…` | 必填学生、指标查询参数 | 规则建议草稿 |
| POST | `/api/deepseek` | `student_id`, `indicator_id` | 经结构和证据校验的 DeepSeek 草稿 |
| GET | `/api/reviews` | 无 | 当前运行的 `student_id:indicator_id` → 版本数组映射 |
| POST | `/api/review` | 学生、指标、状态及复核字段/证据 ID | 新增复核版本 |
| GET | `/api/source?file=…` | 允许列表中的 PDF 文件名 | PDF 字节流 |
| GET | `/api/export?cases=id1,id2,id3` | 三个不同有效学生 ID | `application/zip` |

API 错误及静态页面/资源错误统一返回包含 `error`、`code`、`request_id` 的 JSON；中间件也会写入 `X-Request-ID`。未知异常和模型供应方错误不会泄露堆栈、密钥或供应方原文。

错误响应格式：

```json
{"error":"请求参数无效","code":"VALIDATION_ERROR","request_id":"…"}
```

Pydantic 参数校验当前使用 HTTP 422；业务输入错误 400；未找到分析运行 400；DeepSeek 供应方失败统一映射为 502。Review 唯一键冲突返回 409 `REVIEW_VERSION_CONFLICT`，SQLite busy/locked 返回 503 `DATABASE_BUSY`，均不回传数据库异常参数。健康和安全错误 envelope 的共享 JSON fixture 由 pytest 与 Vitest 同时校验。当前复杂分析响应保留已有字段并使用对象型响应模型，字段级契约后续可随稳定业务 DTO 继续细化。健康、导入、复核、来源、模型失败、并发数据库错误、统一错误和导出路径均有 TestClient 覆盖。所有 API 路由经 Application Use Cases 访问业务能力；路由不直接依赖 Store、Session、文件系统或模型 HTTP 客户端。

`/api/subject/*`、`/api/analysis/*`、`/api/teaching/*` 是未来扩展命名建议，不是当前已实现接口。
