# ADR-0001：第一阶段基础架构

- 状态：Accepted for phase 01
- 日期：2026-11-16

## 背景

项目由单人维护，是本机单用户工具；TASK 之间共享同一份课程和作答数据。现有业务已可运行，但自定义 HTTP Handler 将路由、请求校验和 Store 组合在一起，分析及持久化模块职责偏宽，前端状态和类型也需要边界。

## 决定

1. 使用 FastAPI + Pydantic + Uvicorn 作为本地 HTTP 层，保留旧 `/api/*` 路径和前端依赖。
2. 使用模块化单体组织 TASK 01/02/03；不按任务部署独立服务。
3. 持续使用本地 JSON 文件；运行快照与追加复核历史分别由 Repository 管理，临时文件原子替换。
4. 确定性统计、版本处理、质量检查、证据和 ZIP 业务沿用现有实现，不借框架迁移重算口径。
5. 将 CSV 文件读取和 DeepSeek 网络请求封装为 infrastructure adapter；AI 草稿须通过当前证据集合校验并由教师复核。
6. React 不增加 UI 框架或复杂状态库；TASK 页面归入 feature 边界，所有请求经过唯一 API client。
7. 在 PR/main CI 运行后端检查与测试、前端类型检查/构建/单元测试；CI 不调用真实模型。

## 影响

增加 FastAPI 和 Uvicorn 运行依赖、Pydantic API 契约、httpx/Ruff/pytest 开发依赖及 Vitest 测试依赖。请求校验错误由 FastAPI 返回 422，业务输入错误保持 400，错误 JSON 保留 `error` 并增加 `code`/`request_id`。未实现的业务扩展路由不预建空文件。

## 后果与后续

HTTP 层与标准库 Handler 解耦；Repository 可独立核验文件语义；测试可使用 FastAPI TestClient。JSON 仍不适用于多用户事务。分析服务和 Store 导入编排尚有进一步拆分空间，应在有独立测试和逐步迁移时再做，保持输出一致。
