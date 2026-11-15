# 智慧学伴

本仓库独立实现“理解学科—理解学生—理解教学”三项赛事任务。相邻的 NoteBuddy 项目仅是技术参考，本项目的数据模型、规则和界面以赛题为准。

## 运行

需要 Python 3.12 或更新版本，以及 Node.js。项目分为 `apps/backend` 和 `apps/web`，后端使用 Python 标准库 HTTP 服务，前端采用 Vite、React 和 TypeScript。

Windows PowerShell 启动后端：

```powershell
python -m app.main
```

先在 `apps/web` 执行 `npm ci` 和 `npm run build` 生成静态资源，再在 `apps/backend` 执行上述命令；页面地址为 `http://localhost:8765`。命令行导入与摘要：

```powershell
python -m app.cli import "D:\工作台\智慧学伴-比赛项目\【赛题材料】智慧学伴\赛题数据\赛题资料包\4_赛题数据\模拟学情数据"
python -m app.cli summary
```

开发时打开两个 PowerShell 窗口：在 `apps/backend` 运行 `python -m app.main`，在 `apps/web` 运行 `npm run dev`。Vite 将 `/api` 请求代理到 `http://127.0.0.1:8765`；要改变 API 地址，可为 Vite 设置 `SMART_LEARNING_API_TARGET`。生产构建使用 `npm run build`，随后由 backend 提供页面和 API。

后端配置通过环境变量读取：`SMART_LEARNING_DATA_DIR`、`SMART_LEARNING_RESOURCES_DIR`、`SMART_LEARNING_HOST`、`SMART_LEARNING_PORT`、`DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL`。默认数据目录固定为仓库根下的 `data/`。

## 架构边界

`apps/backend/app/main.py` 和 `cli.py` 是进程入口；`api/` 只负责 HTTP 路由与请求校验；`schemas/` 定义请求/响应契约；`services/` 执行确定性分析、建议、案例选择和成果包生成；`repositories/` 保存分析运行与复核历史。原始 CSV 与 PDF 留在输入/来源目录，运行 JSON 和复核版本写入 `data/<run_id>/`。

`apps/web/src/api/` 集中维护 TypeScript 数据类型和 HTTP 客户端；`features/` 管理导入、导出等业务操作；`pages/` 组合分析、证据、复核界面；`components/` 放共享控件。前端不直接读取本地文件或模型密钥，浏览器只通过 backend API 传递路径和业务数据。

| 接口 | 方法 | 用途 |
|---|---|---|
| `/api/import` | POST | 导入六类 CSV 并创建分析运行 |
| `/api/run`、`/api/cases` | GET | 读取当前分析及三案例候选 |
| `/api/draft`、`/api/deepseek` | GET / POST | 生成规则草稿或模型辅助草稿 |
| `/api/reviews`、`/api/review` | GET / POST | 读取并追加教师复核版本 |
| `/api/source` | GET | 在允许列表内读取课标/教材 PDF |
| `/api/export` | GET | 下载包含复核状态的成果 ZIP |

开发时由 Vite 托管源码页面并代理 API；生产时 `npm run build` 将静态资源写入 `apps/backend/app/web/dist/`，backend 从同源提供页面、资源和 API。`pyproject.toml` 将该构建目录纳入 Python wheel。

分析运行与复核记录保存在被忽略的 `data/`。原始赛事文件留在原位置，不进入仓库。页面选择三名不同学生后下载成果包，其中已接受或已修改的建议与待复核项分开存放。成果包同时包含原始作答行、选中修订、质量报告、统计、字段说明与证据索引。

## DeepSeek

可选设置 `DEEPSEEK_API_KEY` 后在页面中生成草稿；`DEEPSEEK_MODEL` 可选，默认 `deepseek-flash`（依据 [DeepSeek 官方更新记录](https://api-docs.deepseek.com/updates/)）。密钥只在服务端读取。模型仅辅助解释和建议，统计由确定性代码计算。此功能会向外部服务发送所选学生的模拟作答步骤和评分点；使用前请确认赛事资料的数据传输范围。自动测试不会调用真实付费 API。

## 统计口径

同一作答事件取唯一最高修订版本；最高版本冲突时隔离。只有状态为已评分、得分合法且满分与题目一致的记录进入得分率。待评分和未作答单列；质量报告保留原始行号。没有有效记录时不推断未掌握。课标和教材页码来自赛事 CSV，尚需人工逐页核对。

## 当前限制

本地单用户工作台；尚无账户或多人权限控制。当前建议基线较粗，教师必须复核。系统提供三类案例候选，操作者仍须核对其代表性并可改选。课标扫描 PDF 核验、独立评测数据适配和正式视频/PPT 尚待完成。当前只接受本机可访问的 CSV 文件夹，不支持浏览器上传。
