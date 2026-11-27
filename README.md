# 智慧学伴

面向教师的学情诊断与教学建议应用。后端提供课程、作答证据和教学工作流 API；新版 Web 前端位于 `apps/web`。

## 启动前端开发服务

先按仓库 Python 环境说明安装项目依赖并准备 `.env`，然后在两个终端分别启动：

```powershell
python -m app.api.server
```

```powershell
npm --prefix apps/web install
npm run web:dev
```

开发页面使用 `http://localhost:5173`，Vite 会将 `/api` 请求代理到 `http://127.0.0.1:8765`。

## 演示环境（单服务入口）

比赛演示只启动后端一个进程：前端构建产物由 FastAPI 提供，演示数据库与开发数据库隔离。

```powershell
# 重新生成标准演示数据（合成学生，无真实个人信息）
python scripts/demo/build-demo-data.py

# 自检数据、迁移与服务状态
pwsh -File scripts/demo/check-demo.ps1

# 构建前端并用 data/demo 独立数据库启动
pwsh -File scripts/demo/start-demo.ps1

# 可选：使用仓库 data 下的其他隔离目录进行演示或验收
pwsh -File scripts/demo/start-demo.ps1 -Rebuild -DemoDataDir data\demo-acceptance

# 重置默认演示数据
pwsh -File scripts/demo/reset-demo.ps1

# 重置自定义隔离目录（必须是 data 下的直接子目录）
pwsh -File scripts/demo/reset-demo.ps1 -DemoDataDir data\demo-acceptance
```

启动脚本会先将所选演示数据库迁移到当前版本，再启动服务。打开 `http://localhost:8765`，在教学工作台一次性导入 `demo-data/csv` 中的六份 CSV。默认端口已被占用时，可通过 `SMART_LEARNING_PORT` 指定空闲端口；脚本会在输出中显示实际端口。`-DemoDataDir` 与重置脚本的同名参数都只允许使用仓库 `data` 目录的直接子目录。

## 构建与部署

```powershell
npm run web:build
```

构建产物输出到 `apps/web/dist`。FastAPI 使用此目录提供 `/` 与 `/assets/*`，比赛或部署环境只需启动后端服务。

## 测试

```powershell
python -m pytest apps/backend/tests          # 后端单元与 API 契约
python scripts/demo/verify-demo-data.py      # 演示数据与 manifest 对账
npm run web:build                            # 前端类型检查与构建
npm run test:e2e                             # 九页 E2E（需要 Edge 或设置 PLAYWRIGHT_BROWSER_CHANNEL）
```

Playwright 会自行启动隔离的 8876 后端与 5174 前端，并使用临时数据库。视觉验收覆盖 1920/1440/1280/768/390 五档分辨率，截图输出到 `artifacts/frontend-acceptance/`（desktop 与 mobile 各九张）。最近一次验收的命令、实测结果与尚未完成的外部验收项见 [`docs/frontend/final-acceptance-report.md`](docs/frontend/final-acceptance-report.md)。

## 课程来源自动核验

「课程知识 → 主题概览」顶部的 **自动核验全部指标** 是来源核验的主入口，教师不需要逐项填写课标与教材定位。

```
POST /api/source-machine-verification
{"run_id": "<当前运行 ID>", "indicator_id": null, "force": false}
```

返回 `run_id`、`summary`（total / verified / needs_review / skipped）与逐项 `results`（状态、原因码、逐项检查、来源页码与证据片段）。旧的 `verified`、`skipped` 字段保留兼容。

判定标准（四类必要证据全部成立才自动通过，全部由后端重新计算）：

1. 来源文件存在且可读；
2. 课标定位页有文本，且该页内容与观察指标相符；
3. 教材切片中**同一页**的文本与本指标相符（逐页匹配，不跨页合并命中）；
4. 本指标在当前运行内有题目/材料关联，且 AI 引用（如有）能逐条回查。

证据不足时写入 `status=pending` 的待核验记录并附原因码，不降低标准换通过：`SOURCE_MISSING`、`SOURCE_UNREADABLE`、`TEXT_UNAVAILABLE`、`CURRICULUM_MISMATCH`、`TEXTBOOK_MISMATCH`、`REFERENCE_INVALID`、`MATERIAL_NOT_LINKED`、`SOURCE_CHANGED`。

几点实现约束：

- **本地文本优先**。`SourceService.get_text_pages()` 统一取页文本：文本缓存（`data/source_text_cache`，按文件 SHA-256）→ pypdf 原生文本 → 已授权 OCR 缓存（`data/source_ocr_cache`）。文字版 PDF 不再被标成 `unparsed`，也不会被送去外部 OCR。
- **只发送真正缺文本的文件**。`GET /api/source-ocr/preview` 逐份列出「会不会发送、为什么、缺哪几页」；教师确认后 `POST /api/source-ocr` 才执行，预览指纹（含 run_id）变化时必须重新确认。现有 OCR 客户端按整份文件发送，界面不会声称只发送部分页面。
- **课标为扫描件时不会自动通过**。赛事提供的 `课程标准_2022.pdf` 为 189 页扫描件、无原生文本，未授权 OCR 时九项指标会一致给出 `TEXT_UNAVAILABLE`，这是预期行为。
- **运行绑定与幂等**。请求携带的 `run_id` 与当前运行不一致时拒绝写入；核验期间重新导入数据不会把旧证据写进新运行；已有未过期结论不重复写版本，`force=true` 重核验但结论未变化时也不产生新版本。

## 前端结构

- `apps/web/src/layout`：全局导航和分析范围选择器（支持侧边栏收起）。
- `apps/web/src/features/shared`：`useWorkbenchScope` 统一分析范围、共享样式与工具。
- `apps/web/src/features/knowledge`：主题概览、知识结构、题目关联。
- `apps/web/src/features/diagnosis`：班级诊断、学生诊断、题目证据。
- `apps/web/src/features/teaching`：学生个性化建议、班级教学方案。
- `apps/web/src/api`：HTTP 客户端、TanStack Query 查询和缓存键（全部带 run_id 与业务范围）。
- `apps/web/src/types`：后端 API 数据类型。
- `docs/frontend/design`：九张定稿页面图，作为视觉核验基准。
- `docs/frontend/development-plan.md`：重建目标和阶段范围。

页面通过 Hash 路由运行，并从 `#/path?node=&class=&student=&indicator=` 恢复分析范围。所有分析数值来自后端接口。

## 班级教学方案

班级建议不再是只读报告：

- `GET /api/class-teaching-plans?class=&node=`：当前班级的方案与全部历史版本。
- `POST /api/class-teaching-plans/draft`：基于 TASK 02 班级证据生成规则草稿；没有有效评分记录时直接报错。
- `POST /api/class-teaching-plans/{plan_id}/review`：教师采纳、修改、驳回或继续观察；每次审核产生新版本。请求必须携带 `run_id`，且只能审核当前最新版本；来源或数据变化的过期方案会被拒绝。
- `GET/POST /api/class-teaching-adjustments`、`PATCH /api/class-teaching-adjustments/{id}`：班级级教学实施与复测记录，与学生级教学调整相互独立，必须基于已采纳的方案并引用本班该节点的实际作答。
- `GET /api/class-evidence?class=&node=`：本班该节点可引用的作答记录，用于实施与复测选择。

每份方案绑定 `run_id + class_id + node_id`、来源指纹、分析 ID 与证据引用；来源或数据变化后旧版本标记为过期（`stale`）。班级 AI 分析存在且指纹一致时，方案会引用其结论并标记 `generation_source=ai`，否则保持规则方案。TASK 02 的 AI 分析支持可选 `class_id`，缓存键与证据包都按班级隔离；`POST /api/ai-analysis` 必须携带预览指纹（`preview_fingerprint`），数据范围变化后要求重新确认。
