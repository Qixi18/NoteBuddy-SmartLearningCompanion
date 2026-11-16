# ADR-0002：Domain、SQLite 与本地开发工作流

- 状态：Accepted
- 日期：2026-11-16

## 背景

第一阶段完成模块化单体并以 JSON 保存运行快照和复核。随着历史运行与复核增加，需要在保留现有 API、统计口径、质量报告和导出结构的同时，增加统一领域约束和关系查询能力。项目由单人本地使用，不需要远程多用户数据库或托管 CI。

## 决定

1. 建立独立 Python dataclass Domain；ORM 和 Pydantic schema 不充当领域模型，现有 TASK services 继续拥有分析编排。
2. SQLite 为正式运行数据源，由 SQLAlchemy 2.x 访问、Alembic 管理 schema。环境变量 `SMART_LEARNING_DATABASE_URL` 覆盖默认数据目录下的 SQLite 文件。
3. 分析运行按 run_id 隔离；存完整原文 `snapshot_json`，并将需要关联查询的核心实体规范化。复核历史追加保存，当前运行由 `app_state` 指向。
4. JSON 迁移必须显式执行：仓库外完整备份及 hash 验证、运行/复核预检查、幂等导入、内容核验，最后才设置当前指针。原 JSON 保留为只读备份；SQLite 是唯一在线写入源。
5. SQLite schema 通过显式 Alembic upgrade 管理，应用启动不自动迁移。
6. 删除 GitHub Actions 工作流；保留 pytest、Ruff、Vitest 和前端构建的本地验证流程。不引入替代 CI 服务。

## 后果

- 历史快照可原样恢复和核验；旧字段缺失由 API 兼容投影处理，不回写或重算历史数据。
- SQLite 适合当前离线单用户范围；高并发、多用户和远程部署需要另行评估。
- 开发者必须先运行数据库 schema upgrade；旧 JSON 项目需明确迁移，应用不会自动切换数据源。
- Repository 兼容现有 Service 的 dict 数据接口，Domain 在规则和后续用例中逐步扩大应用，不一次性重写业务流程。
