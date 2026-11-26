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

# 重置演示数据（只允许操作 data/demo）
pwsh -File scripts/demo/reset-demo.ps1
```

打开 `http://127.0.0.1:8765`，在教学工作台一次性导入 `demo-data/csv` 中的六份 CSV。

## 构建与部署

```powershell
npm run web:build
```

构建产物输出到 `apps/web/dist`。FastAPI 使用此目录提供 `/` 与 `/assets/*`，比赛或部署环境只需启动后端服务。

## 测试

```powershell
python -m pytest apps/backend/tests          # 后端单元与 API 契约
npm run web:build                            # 前端类型检查与构建
npx playwright test                          # 九页 E2E（需要 Edge 或设置 PLAYWRIGHT_BROWSER_CHANNEL）
```

Playwright 会自行启动隔离的 8876 后端与 5174 前端，并使用临时数据库。

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
- `POST /api/class-teaching-plans/{plan_id}/review`：教师采纳、修改、驳回或继续观察；每次审核产生新版本。

每份方案绑定 `run_id + class_id + node_id`、来源指纹、分析 ID 与证据引用；来源或数据变化后旧版本标记为过期（`stale`）。TASK 02 的 AI 分析支持可选 `class_id`，缓存键与证据包都按班级隔离；未配置模型服务时规则方案仍可完整演示。
