# 本地演示运行手册

本手册用于从干净演示目录启动当前本地系统，导入赛题模拟数据，核对来源、学情和教学建议，并生成正式提交包。准备录制前，应先完成 `competition-release-checklist.md` 中的学科内容与案例签核。模型服务不是演示前提，核心流程使用确定性规则。

## 0. 演示前准备

1. 确认本机赛事资料目录和 `.venv`、`apps/web/node_modules` 已就绪。
2. 用赛事资料包中的六张 CSV；核对其 SHA 与冻结基线一致。
3. 指定独立演示目录和数据库；不要复用日常开发库。
4. 确认教师已完成9项指标、54道题及所用资源的核验，并在冻结运行中确认三名案例。尚未签核时，只演示工程流程，不展示为正式教学结论。
5. 将源 PDF 目录设为 `SMART_LEARNING_SOURCE_FILES_DIR`。不上传或复制原始 PDF/CSV 至 ZIP。
6. 关闭真实模型凭据。不要为了演示产生未授权的模型费用或发送学生模拟作答到外部服务。

## 1. 启动隔离演示环境

在 PowerShell 窗口一执行：

```powershell
$repo = 'D:\工作台\智慧学伴-比赛项目\NoteBuddy-SmartLearningCompanion'
$python = Join-Path $repo '.venv\Scripts\python.exe'
$runId = [guid]::NewGuid().ToString('N')
$dataPath = Join-Path $repo "data\competition-demo-$runId"
$databasePath = Join-Path $repo "data\competition-demo-$runId.sqlite"
$env:SMART_LEARNING_HOST = '127.0.0.1'
$env:SMART_LEARNING_PORT = '8765'
$env:SMART_LEARNING_DATA_DIR = $dataPath
$env:SMART_LEARNING_DATABASE_URL = "sqlite:///$($databasePath.Replace('\', '/'))"
$env:SMART_LEARNING_RESOURCES_DIR = 'resources'
$env:SMART_LEARNING_SOURCE_FILES_DIR = 'D:/工作台/智慧学伴-比赛项目/【赛题材料】智慧学伴/赛题数据/赛题资料包/5_课程标准及相关教学资源'
$env:MODEL_PROVIDER = 'deepseek'
$env:MODEL_API_KEY = ''
$env:DEEPSEEK_API_KEY = ''
Set-Location (Join-Path $repo 'apps\backend')
& $python -m app.cli db-upgrade
& $python -m app.main
```

在 PowerShell 窗口二执行：

```powershell
$repo = 'D:\工作台\智慧学伴-比赛项目\NoteBuddy-SmartLearningCompanion'
$env:SMART_LEARNING_API_TARGET = 'http://127.0.0.1:8765'
Set-Location (Join-Path $repo 'apps\web')
npm run dev -- --host 127.0.0.1
```

在浏览器打开 Vite 输出的 localhost 地址。核对后端 `GET http://127.0.0.1:8765/api/health` 返回成功。不要在未核对 PID 和命令行前结束其他本地服务。

## 2. 五分钟视频演示流程

视频时长须不超过5分钟。建议使用 [`submission-storyboard.md`](submission-storyboard.md) 的时间轴，并只展示冻结版本。

1. 先显示数据来源和 run ID；指出这是赛事提供的模拟数据。
2. 展示来源与指标状态。明确说明尚待内容签核的关系不会被系统当成已确认材料。
3. 展示记录处置与有效分母；指出 744/1304 是赛事基线，不是掌握度判断。
4. 展示两班和节点结果，解释覆盖差异及不可推断事项。
5. 展示三名已签核案例：答题步骤、证据引用、差异化活动、提示和后续观察点。
6. 展示教师编辑/确认和复核历史，说明建议可调整且更新后旧发布指纹失效。
7. 展示正式包预检、下载、解压核验及包内校验和。

若来源核验或三案例人工签字未完成，不应伪造成功状态；将其作为尚待完成的治理状态说明，另行补录正式视频。

## 3. 数据导入与成果包操作

1. 从左侧“导入数据”选择赛事资料包 `4_赛题数据/模拟学情数据`，先预览六个 CSV，再执行导入。
2. 在“学习要求与来源”查看指标与材料状态。课程标准或教材页码未由负责人审核时维持 pending。
3. 在“数据质量”查看原始行、事件和五种处置；核对处置守恒及有效分母。
4. 在学生与班级分析页分别选 N01/N02；不把节点间得分差解释为进步。
5. 在“案例与导出”确认三个学生案例；每个案例检查学生、指标、节点、作答原文/步骤和证据行号。
6. 核对案例报告和班级报告。教师完成实质审阅并填写负责人信息后，执行正式发布预检。
7. 服务端门禁通过后下载提交包；解压验证 `manifest.json`、三人范围、报告、schema、`release_checks.json` 和 `checksums.json`。
8. 保留 ZIP 文件哈希、源码 commit 和 run ID，与视频/PPT 的版本对齐。

## 4. 异常与回退

| 情况 | 现场处理 |
|---|---|
| 端口被占用 | 不终止未知进程。先查 PID/命令行，再改用空闲端口，并同步更新前端 API 代理。 |
| PDF 打不开 | 展示来源文件名、哈希和页码定位；不以其它材料替代，也不声称 PDF 已核验。切换至同版本预录屏。 |
| 模型不可用 | 使用确定性规则草稿；说明模型能力为可选。不要把上次模型文本冒充本次生成。 |
| 运行或签核发生变化 | 重新运行报告和预检；旧指纹失效后不得继续使用旧 ZIP。 |
| 正式导出失败 | 保留错误信息和运行指纹，展示已校验的同版本回退包；不得临时编辑 ZIP 文件。 |
| 网络中断 | 规则分析、教师复核、报告打印和正式包均在本地运行；仅模型增强不可用。 |

## 5. 演示结束

先确认没有需要保留的演示记录，再按团队和赛题组的数据保管要求处理窗口一创建的 `$dataPath` 和 `$databasePath`。赛事源文件仅用于本次赛事，赛后按赛题组通知删除。当前阶段不要清理正式提交包、复核凭据或依法需保留的交付记录。
