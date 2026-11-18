# 系统总览

## 当前实现

智慧学伴是一个本地单用户模块化单体。React 19/Vite 前端经同源 API 或 Vite `/api` 代理访问 FastAPI；FastAPI 路由通过依赖获取 Application `WorkbenchUseCases`，用例编排业务服务、Ports 与 UnitOfWork。兼容 `Store` 只作为 CLI/旧调用方的组合门面。SQLAlchemy Repository 将运行快照、运行范围内关系投影、当前运行指针与追加式复核历史保存在 SQLite；Domain dataclass 独立于 API 和 ORM。默认监听 `127.0.0.1:8765`。

```text
React pages/features → api/client.ts → FastAPI routes → Application Use Cases
                                                        ├─ Ports / UnitOfWork → SQLAlchemy repositories
                                                        ├─ Domain + deterministic services
                                                        └─ Infrastructure (CSV / files / DeepSeek)
                                                                         └─ SQLite + lossless JSON snapshots
```

当前代码入口和边界：

- Backend 入口：`apps/backend/app/main.py` 与 `app/cli.py`；HTTP 组装在 `app/api/app.py`。
- API 路由：`app/api/routes/`；Pydantic 请求/响应契约：`app/schemas/http.py`。
- Domain 模型：`app/domain/`；数据库基础设施、ORM 和 Alembic：`app/infrastructure/database/`、`apps/backend/alembic/`。
- Application Ports 与用例：`app/application/ports/`、`app/application/use_cases/`；SQLAlchemy UoW、映射器和 Repository adapter：`app/infrastructure/database/`、`app/repositories/`。
- 运行快照和复核 Repository：`app/repositories/analysis_run_repository.py`、`review_repository.py`；`store.py` 保留为兼容组合门面，HTTP 路由不直接依赖 Store。
- CSV 适配器：`app/infrastructure/ingestion/csv_reader.py`。TASK 01 来源索引/PDF 服务位于 `app/services/task01/`；TASK 02 质量、版本、指标、观察与导入编排位于 `app/services/task02/`。
- TASK 03 的建议和复核规则位于 `app/services/task03/`；共享 ZIP 导出位于 `app/services/shared/export_service.py`。旧顶层 Service 模块只 re-export 现有函数以兼容调用方。DeepSeek HTTP 适配器位于 `app/infrastructure/llm/deepseek_client.py`。
- 前端应用组合在 `apps/web/src/app/App.tsx`，状态流程在 `app/hooks/useWorkbench.ts`，网络入口在 `api/client.ts`。TASK 页面分别在 `features/task01`、`task02`、`task03`。

## 功能边界

- TASK 01 当前展示课程目标、题目与来源索引；不解析 PDF 全文，也不建立完整教材知识库。
- TASK 02 导入六类 CSV，选择最高修订版本、隔离冲突和无效作答，计算确定性指标、质量报告与观察，并给出三类案例候选。
- TASK 03 生成规则草稿或可选模型草稿，校验证据、追加教师复核与案例确认历史，并导出成果 ZIP。结构化方案只有在其引用的来源签核仍为当前有效版本时才进入正式导出。

## 运行数据

仓库根目录 `data/` 是本地数据，不提交 Git。SQLite 文件是正式运行数据源；每次分析在 `analysis_runs.snapshot_json` 留存不可变完整快照，规范化实体以 `(run_id, id)` 关联，`app_state` 保存当前运行，`source_verifications`、`teacher_reviews`、`teacher_cases` 分别追加来源签核、教学复核和案例确认版本。迁移前的 JSON 文件留作只读备份，来源 CSV/PDF 保留在用户指定目录。

## 未来工作

后续可以在对应 TASK 内继续细化领域对象与复杂 CSV 子字段的映射。课程 PDF 自动解析、完整学习路径、多用户和远程部署均不属于本阶段。
