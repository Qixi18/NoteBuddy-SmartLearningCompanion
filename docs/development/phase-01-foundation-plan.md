# 第一阶段工程基础实施计划

> 历史计划：第一阶段已完成；其中 Actions/CI 仅记录当时的执行方案，第二阶段已按 ADR-0002 移除 GitHub Actions。

## 目标与边界

在不改写赛事业务口径的前提下，把本地后端 HTTP/API、Repository、前端 TASK 视图、测试和开发文档收束成可持续演进的模块化单体。只完成基础设施和已有功能迁移；不增加完整 PDF 解析、学习路径、多用户或外部部署。

## 工作顺序

1. 核对分支、提交、工作区、README/依赖、后端测试和前端构建，并记录基线。
2. 根据实际代码和现存赛事字段整理模块、数据、API、工作流文档和 ADR。
3. 迁移 API 到 FastAPI；保持现有 `/api/*` 路径、JSON 结构和静态前端集成，增加健康检查与统一安全错误元数据。
4. 分离运行快照与复核历史 Repository；将 CSV 和 DeepSeek I/O 放入基础设施适配器；保持规则算法、哈希和 ZIP 契约。
5. 按 TASK 边界归位前端面板，将网络访问保留在唯一 client，抽出工作台状态 hook。
6. 建立 pytest/Ruff、Vitest、TypeScript/Vite build 与 GitHub Actions；更新 Windows PowerShell 配置指引。
7. 回归导入/分析/建议/复核/ZIP 现有行为，记录真实数据、DeepSeek 和 CI 的限制。

## 验收

- 同一输入下版本选择、冲突隔离、统计字段、来源行号、三类候选、复核版本和 ZIP 内容保持兼容。
- 后端错误不泄漏堆栈/密钥；API 路由不直接文件读写或模型请求；运行与复核 Repository 分离。
- 三 TASK 的前端依赖单向、API client 唯一，前端行为有基本 Vitest 覆盖。
- 文档描述当前实际代码，并清楚区分已实现与预留。
- PR/main CI 执行 Python tests/Ruff 和 npm ci/TypeScript/Vite/Vitest，不调用真实 DeepSeek。

## 依赖

后端新增 FastAPI/Pydantic（请求模型）、Uvicorn（本地 ASGI 服务）；开发额外使用 httpx（FastAPI TestClient）、pytest 和 Ruff。前端新增 Vitest、jsdom、Testing Library，用于组件和请求逻辑单元测试。没有引入数据库、图表或 UI 框架。

## 风险与控制

- CSV 真实表头可能比 CSV reader 的必需字段列表更广；对赛事字段只按现有消费逻辑定义，不修改原始数据。
- API 错误状态和新元数据要保留 `error` 文本以兼容现有客户端。
- JSON 文件写入仅覆盖当前本地单用户、单后端进程；快照写入用唯一临时文件及实例内串行锁，复核历史用实例内锁和原子替换。多进程共用目录不在范围内。
- 未提供数据/密钥时只用合成测试夹具和模型 mock 验证，不发起外网付费调用。
