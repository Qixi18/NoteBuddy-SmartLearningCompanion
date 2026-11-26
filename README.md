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

## 构建与部署

```powershell
npm run web:build
```

构建产物输出到 `apps/web/dist`。FastAPI 使用此目录提供 `/` 与 `/assets/*`，比赛或部署环境只需启动后端服务。

## 前端结构

- `apps/web/src/layout`：全局导航和分析范围选择器。
- `apps/web/src/features`：工作台、课程知识、学情诊断与教学建议页面。
- `apps/web/src/api`：HTTP 客户端、TanStack Query 查询和缓存键。
- `apps/web/src/types`：后端 API 数据类型。
- `docs/frontend/design`：九张定稿页面图，作为视觉核验基准。
- `docs/frontend/development-plan.md`：重建目标和阶段范围。

页面通过 Hash 路由运行，并从 URL 查询参数恢复班级、测验节点、学生和指标范围。所有分析数值来自后端接口。当前班级级 AI 教学建议没有独立后端范围契约，前端不会将学生级建议或节点级分析冒充为班级方案。
