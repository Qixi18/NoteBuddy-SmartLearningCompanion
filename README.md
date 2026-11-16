# 智慧学伴

本仓库独立实现赛事的 TASK 01（理解学科）、TASK 02（理解学生）和 TASK 03（理解教学）。NoteBuddy 仅作工程参考；数据模型、业务规则和界面以本赛事为准。

## 技术与架构

- 后端：Python 3.12+、FastAPI、Pydantic、Uvicorn；JSON 本地存储。
- 前端：React 19、TypeScript、Vite。
- 架构：本地单用户模块化单体，默认只监听 `127.0.0.1`。
- 当前能力：六类 CSV 导入、版本与质量检查、统计与观察、三类案例建议、规则/可选 DeepSeek 草稿、教师复核历史、PDF 来源 allowlist、ZIP 导出。
- 统计由确定性程序计算。没有有效记录时不推断学生未掌握。系统没有完整 PDF 自动解析、账户、多用户或动态学习路径。

## 安装

从仓库根目录安装后端及开发依赖，并安装前端锁定依赖：

```powershell
python -m pip install -e ".[dev]"
Push-Location apps/web
npm ci
Pop-Location
```

## PowerShell 配置和启动

程序不会自动读取 `.env`。`.env.example` 仅列出配置项；其中相对路径假设进程从 `apps/backend` 启动。当前 PowerShell 会话中需显式设置 `$env:`。默认数据目录是仓库根目录 `data/`，默认只绑定 loopback：

```powershell
$env:SMART_LEARNING_HOST = "127.0.0.1"
$env:SMART_LEARNING_PORT = "8765"
$env:SMART_LEARNING_DATA_DIR = (Join-Path (Get-Location) "data")
$env:SMART_LEARNING_RESOURCES_DIR = (Join-Path (Get-Location) "resources")
# 可选；仅启用模型草稿时配置。不要提交密钥。
$env:DEEPSEEK_API_KEY = ""
$env:DEEPSEEK_MODEL = "deepseek-flash"
```

开发时打开两个 PowerShell 窗口。窗口一启动后端：

```powershell
Set-Location apps/backend
python -m app.main
```

窗口二启动前端开发服务器：

```powershell
Set-Location apps/web
npm run dev
```

浏览器地址由 Vite 显示，API `/api` 请求代理到 `http://127.0.0.1:8765`。如需调整代理，可在启动 Vite 前设置 `SMART_LEARNING_API_TARGET`。不使用 Vite 时，先在 `apps/web` 执行 `npm run build`，再运行后端；通过 `http://localhost:8765` 访问同源前端。

命令行导入和读取摘要：

```powershell
Set-Location apps/backend
python -m app.cli import "D:\path\to\模拟学情数据"
python -m app.cli summary
```

运行数据保存在 `data/<run_id>/`，不会覆盖原始 CSV。复核版本独立追加保存。导入成功后当前运行指针才会更新。

## 可选 DeepSeek

DeepSeek API Key 只配置在后端环境；浏览器不会接触密钥。调用模型会将所选学生的模拟作答步骤及评分点发给外部服务。模型输出是建议草稿，系统校验证据 ID，教师必须复核；自动化测试使用 Mock，不发起真实付费调用。

## 验证

```powershell
python -m pytest
ruff check apps/backend
ruff format --check apps/backend
Push-Location apps/web
npm ci
npm run build
npm run test
Pop-Location
```

GitHub Actions 对 pull request 和 `main` 分支运行相同检查。配置说明见 [架构文档](docs/architecture/00-system-overview.md)、[API 契约](docs/architecture/03-api-contracts.md)、[第一阶段实施计划](docs/development/phase-01-foundation-plan.md) 与 [阶段报告](docs/development/phase-01-implementation-report.md)。
