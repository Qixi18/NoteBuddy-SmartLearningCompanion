# 智慧学伴

本仓库独立实现赛事的 TASK 01（理解学科）、TASK 02（理解学生）和 TASK 03（理解教学）。NoteBuddy 仅作工程参考；数据模型、业务规则和界面以本赛事为准。

## 技术与架构

- 后端：Python 3.12+、FastAPI、Pydantic、SQLAlchemy 2.x、Alembic、Uvicorn；SQLite 本地存储。
- 前端：React 19、TypeScript、Vite。
- 架构：本地单用户模块化单体，默认只监听 `127.0.0.1`。
- 当前能力：六类 CSV 导入、版本与质量检查、统计与观察、三类案例建议、规则/可选模型草稿、Web 逐项来源签核、结构化教学方案、教师案例确认、追加式复核历史、跨运行教学调整记录（含后续证据及教师可比性判断）、PDF 来源 allowlist、ZIP 导出。
- 统计由确定性程序计算。没有有效记录时不推断学生未掌握。系统没有完整 PDF 自动解析、账户、多用户或动态学习路径。

## 安装

从仓库根目录安装后端及开发依赖，并安装前端锁定依赖：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Push-Location apps/web
npm ci
Pop-Location
```

## PowerShell 配置和启动

程序启动时读取仓库根目录的 `.env`（已有 PowerShell 环境变量优先）。先将 `.env.example` 复制为 `.env`，填入模型配置；`.env` 已被 Git 忽略。相对路径统一以仓库根目录为基准，与当前工作目录无关。默认 JSON/CSV 数据目录为仓库根目录 `data/`，SQLite 默认固定为 `data/smart_learning.db`；更改 data-dir 不会移动数据库。默认只绑定 loopback：

```powershell
$env:SMART_LEARNING_HOST = "127.0.0.1"
$env:SMART_LEARNING_PORT = "8765"
$env:SMART_LEARNING_DATA_DIR = "data"
# 可选；相对路径按仓库根目录解析。不设置时 SQLite 固定在仓库根目录 data/ 下。
# $env:SMART_LEARNING_DATABASE_URL = "sqlite:///D:/workspace/project/data/smart_learning.db"
$env:SMART_LEARNING_RESOURCES_DIR = "resources"
# 可选；配置赛事材料 PDF 所在目录。浏览器导入的临时上传不保留原始材料包路径。
# $env:SMART_LEARNING_SOURCE_FILES_DIR = "D:/path/to/5_课程标准及相关教学资源"
# 可选备份根目录；不设置时位于仓库父目录 _backups/smart-learning。
# $env:SMART_LEARNING_BACKUP_DIR = "D:/workspace/_backups/smart-learning"
# 可选；也可以在仓库根目录 .env 中填写。不要提交密钥。
$env:MODEL_PROVIDER = "deepseek"
$env:MODEL_API_URL = "" # deepseek/openai 可留空；其他提供商填完整 HTTPS 接口地址
$env:MODEL_API_KEY = ""
$env:MODEL_NAME = "deepseek-flash"
$env:DEEPSEEK_TIMEOUT_SECONDS = "30"
# 模型请求超时秒数；默认 30，须为正数。
```

开发时打开两个 PowerShell 窗口。窗口一启动后端：

```powershell
Set-Location 'D:\path\to\NoteBuddy-SmartLearningCompanion'
python -m app.cli doctor # 只读检查；首次建库前会提示 migration_required
python -m app.cli db-upgrade # 显式升级；应用启动不会自动建表或迁移
python -m app.cli doctor # 再检查版本、资源、前端构建和可选模型状态
Set-Location apps/backend
python -m app.main
```

`doctor` 退出码 1 表示数据库迁移未完成或核心运行环境被阻断；存在未核验 PDF 或未配置可选模型时会给出警告，但不会把来源标记为已核验，也不会阻止核心统计和规则草稿使用。`GET /api/readiness`提供相同的只读诊断；`GET /api/health`仍只表示服务进程可响应。检查不会创建数据库、执行迁移或改变签核。

窗口二启动前端开发服务器：

```powershell
Set-Location apps/web
npm run dev
```

浏览器地址由 Vite 显示，API `/api` 请求代理到 `http://127.0.0.1:8765`。如需调整代理，可在启动 Vite 前设置 `SMART_LEARNING_API_TARGET`。不使用 Vite 时，先在 `apps/web` 执行 `npm run build`，再运行后端；通过 `http://localhost:8765` 访问同源前端。

首次启动先执行 Alembic schema 升级。旧版 JSON 用户应先在副本演练，再显式运行迁移命令。source、SQLite 目标和 backup 可分别指定。迁移会在报告中记录只读目标预检，包括 SQLite 完整性、精确 schema/table set、Alembic head revision、各表行数及与待迁入 run/review/current 的冲突。已存在数据库必须显式确认；非空数据库还需单独 opt-in，且只能合并到兼容 schema、无 ID/版本/current 冲突的目标。任何预检拒绝都先持久化报告，且不修改目标数据库或源 JSON。默认建议使用全新 DB 路径：

```powershell
Set-Location apps/backend
python -m app.cli migrate-json-to-sqlite --data-dir "D:\data\legacy" --backup-dir "D:\backups\migration"
# 仅当已核验目标数据库并确认继续时才使用：
# python -m app.cli migrate-json-to-sqlite --confirm-existing-database --allow-nonempty-database
```

SQLite 在线一致性备份使用 SQLite backup API；`db-backup --backup-dir` 接受备份文件的完整路径，恢复只写入一个全新的目标路径，不覆盖已有文件：

```powershell
python -m app.cli db-backup --backup-dir "D:\backups\smart_learning.sqlite"
python -m app.cli db-restore "D:\backups\smart_learning.sqlite" --restore-to "D:\restore\smart_learning.sqlite"
```

命令行导入和读取摘要：

```powershell
Set-Location apps/backend
python -m app.cli import "D:\path\to\模拟学情数据"
python -m app.cli summary
```

数据库默认位于仓库根目录 `data/smart_learning.db`。分析快照、学生/目标/材料/节点/作答投影、当前运行指针、来源签核、教师案例、复核历史和教学调整记录保存在 SQLite；人工签核按运行追加版本，教学调整固定起始复核版本并记录后续运行、证据及教师判断。升级新版本前先显式运行 `python -m app.cli db-upgrade`，使数据库迁移至当前 Alembic head。旧 JSON 保持原样用于备份与校验。导入成功后当前运行指针才会更新。

## 可选模型服务

模型 API Key 只配置在后端的 `.env` 或环境变量中；浏览器不会接触密钥。`MODEL_PROVIDER` 填 `deepseek` 或 `openai` 时可省略 `MODEL_API_URL`，程序会选择对应默认地址；其他提供商需填写完整的 HTTPS Chat Completions 接口地址。`MODEL_NAME` 填模型 ID。当前支持兼容 OpenAI Chat Completions 的接口及 JSON 对象响应；旧 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 仍可用。调用模型会将所选学生的模拟作答步骤及评分点发给外部服务。模型输出是建议草稿，系统校验证据 ID，教师必须复核；自动化测试使用 Mock，不发起真实付费调用。修改 `.env` 后须重启后端。

来源 PDF 按 `source_checks.json` 的 allowlist 查找。CLI 导入赛事材料包时可从原始材料目录读取；浏览器导入使用临时目录，如需查看 PDF，请通过 `SMART_LEARNING_SOURCE_FILES_DIR` 指向包含 allowlist 文件的本机目录。该目录与 `SMART_LEARNING_RESOURCES_DIR` 中的元数据目录分开配置。

## 验证

浏览器端到端流程测试使用 Playwright Chromium。它会自动在 loopback 上启动独立前后端，创建带唯一运行标识的 SQLite 数据库和数据目录，并从后端测试用例生成六类模拟 CSV；不读取或修改日常开发数据库，不调用真实模型 API。运行：

```powershell
npm run test:e2e
```

失败时可在 `playwright-report/` 查看 HTML 报告，在 `test-results/` 查看截图、视频和 trace。测试临时数据库与 CSV 保留在 `data/playwright-*`，该目录受 Git 忽略；确认不再需要诊断数据后可手动清理对应本轮目录和数据库文件。

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

本项目不使用 GitHub Actions；请在本地运行上述测试与构建命令。配置说明见 [系统总览](docs/architecture/00-system-overview.md)、[Domain 模型](docs/architecture/05-domain-models.md)、[数据库设计](docs/architecture/06-database-design.md)、[JSON 迁移计划](docs/architecture/07-json-migration-plan.md) 与 [API 契约](docs/architecture/03-api-contracts.md)。
