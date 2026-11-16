# 第一阶段实施报告

日期：2026-11-16
分支：`codex/phase-01-foundation`
基线：`96b1be626ba38c2d6731063cf315827658d1effe`

## 摘要

第一阶段工程基础建设已在本地开发分支完成。后端从自定义 HTTP Handler 迁移到 FastAPI；运行快照、复核记录、CSV/模型 I/O 和业务服务按职责拆开；前端状态协调及页面按 TASK 归位；新增架构文档、Vitest 测试、CI 和项目级开发说明。原有业务算法继续以基线行为为准，没有引入数据库、账户系统或新的 UI 框架。

## 主要变更

- 后端：FastAPI 应用工厂、依赖注入、统一错误响应和 request ID、健康检查、Pydantic 请求与关键响应模型；保留原 API 路径及 CLI。
- 服务边界：CSV Reader、DeepSeek Client、AnalysisRunRepository、ReviewRepository；TASK 01 来源索引/PDF 服务，TASK 02 版本/质量/指标/导入/案例服务，TASK 03 建议/复核服务，共享成果导出服务。旧 Service 导入路径保留为兼容门面。
- 持久化与错误处理：分析快照和当前指针使用同目录唯一临时文件原子替换，并串行化单 Repository 实例中的保存；复核历史继续追加版本。DeepSeek 超时、坏响应和无效证据返回安全模型服务错误。
- 前端：工作台状态移至 `useWorkbench`；目标、学生分析、复核页面按 TASK 归类；保留 API Client 单一入口和既有 UI。
- 工程与文档：新增 `.github/workflows/ci.yml`、根 `AGENTS.md`、`.env.example`、架构/数据/API/工作流文档、ADR、基线报告及开发计划；赛事原始数据和 `_bmad-output/` 不纳入 Git。

## API 与数据契约

保留 `/api/import`、`/api/run`、`/api/cases`、`/api/draft`、`/api/deepseek`、`/api/reviews`、`/api/review`、`/api/source`、`/api/export`，新增 `/api/health`。导入目录必须是本机绝对路径。请求校验使用 422，业务输入错误使用 400，模型服务失败使用 502；统一错误 JSON 含 `error`、`code`、`request_id`。敏感供应方细节和未处理堆栈不返回客户端。

分析快照 JSON 和业务字段保持兼容。增加的代码边界不改变修订版本选取、质量规则、统计口径、案例候选、证据行号、教师复核历史或 ZIP 内容。前端静态构建仍输出到 `apps/backend/app/web/dist`，与默认服务配置一致。

## 验证

以下检查均在本地完成；pytest 运行时显式指定了仓库外的公开模拟学情 CSV 目录，因此公开数据回归实际执行而非跳过。

| 命令 | 结果 |
|---|---|
| `python -m pytest -q` | 22 passed（含公开数据、导入失败不切换运行、HTTP 导入至复核/ZIP、模型超时/坏响应、来源 allowlist、并发快照写入） |
| `ruff check apps/backend` | Passed |
| `ruff format --check apps/backend` | Passed（50 files already formatted） |
| `apps/web: npm ci` | Passed（134 packages；0 vulnerabilities） |
| `apps/web: npm run test` | Passed（3 files、5 tests） |
| `apps/web: npm run build` | Passed（TypeScript 与 Vite；42 modules） |
| `git diff --check` | Passed（仅有 Windows 换行归一化提示） |

未调用真实 DeepSeek API，未运行 GitHub hosted Actions，也未做真实浏览器端到端验收。

## 已知边界

1. 当前是本地单用户模块化单体；写入串行锁为进程内锁，不承诺多个后端进程共享同一 data 目录并发写入。
2. DeepSeek 故障后规则草稿可由用户显式请求；服务不会在模型请求内自动静默回退。
3. 复杂 CSV 行、metrics 与 observation 的 HTTP 子结构保持兼容字典，关键 AnalysisRun 顶层、质量报告和复核记录已有响应模型；OpenAPI 尚未覆盖每个赛事字段的细粒度约束。
4. CI 配置已提交到工作树，尚无远端 hosted job 结果；真实模型成本/数据传输验收仍需人工决定。
5. 赛方独立数据格式、正式成果 PDF/视频/PPT、来源页码人工核验不属于本阶段已验证范围。

## 变更文件概览

- 新增：FastAPI 路由和应用工厂、核心日志、CSV/DeepSeek adapters、运行/复核 repositories、TASK 01/02/03 services、响应 schema、前端 API/组件测试、TASK 页面和 hooks、CI、AGENTS 与正式文档。
- 修改：配置、服务启动与 CLI、Store 兼容门面、原分析/建议/案例/导出导入路径、后端测试、前端 App/API 类型/依赖、README 和 `.env.example`。
- 删除并替换：6 个旧自定义 API Handler 文件和 6 个 `pages/*` 页面文件；分别迁移到 FastAPI routes 与 `features/task01`、`features/task02`、`features/task03`。

下一步建议：先在独立数据副本上核验课标/教材来源和独立数据格式，再根据赛事提交要求准备正式成果材料；部署或合并前取得 hosted CI 结果。
