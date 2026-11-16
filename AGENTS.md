# 智慧学伴开发规范

## 项目边界

- 本仓库独立实现赛事中的 TASK 01（理解学科）、TASK 02（理解学生）和 TASK 03（理解教学）；NoteBuddy 仅可作工程参考。
- 采用本地单用户、loopback、模块化单体和 JSON 文件存储。不要引入数据库、微服务、账户、队列、多 Agent 或新的 UI 框架。
- 不修改赛事原始 CSV、正式 ID、评分规则或现有统计口径；不提交原始赛事资料、运行数据或密钥。
- DeepSeek 是可选草稿能力；统计由确定性代码计算，AI 引用须经现有证据集合校验，复核必须由教师执行。

## 代码分层

- `apps/backend/app/api/` 只负责 HTTP 路由、Pydantic 契约及依赖装配。路由不能读取 CSV/JSON 文件，也不能自行调用模型 HTTP API。
- `core/` 保存全局日志与基础设施配置；`schemas/` 保存外部输入输出契约。
- `services/` 承载确定性分析、案例、建议和成果包逻辑；不得把业务计算移入 Repository。
- `repositories/` 只负责运行快照和复核历史的持久化；`infrastructure/` 负责 CSV 与外部模型适配。
- 前端网络请求统一经 `apps/web/src/api/client.ts`；TASK 页面分别归入 `features/task01`、`task02`、`task03`，通用控件留在 `components/`。
- TASK 01 不依赖 TASK 02/03；TASK 02 可读取 TASK 01；TASK 03 可读取 TASK 01/02；禁止循环依赖。

## 安全与兼容

- 默认监听 `127.0.0.1`。密钥仅从后端环境读取，日志不得写密钥、完整学生作答或整段模型上下文。
- 不把 `.env`、`data/`、原始赛事 CSV/PDF、模型输出或构建产物加入 Git。
- 保持现有 `/api/*` 路径、前端请求结构、版本规则、质量检查、证据行号、复核追加版本及 ZIP 成果包契约兼容。
- 对外错误保留 `error` 文本并使用安全消息；不得返回堆栈、密钥或内部请求内容。

## 验证与报告

变更完成后运行：

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

若环境无法运行某项，报告准确命令和原因。报告中区分已验证内容、未验证项和后续工作；不声称真实 DeepSeek API 已测试。
