# 智慧学伴开发规范

## 项目边界

- 本仓库独立实现赛事中的 TASK 01（理解学科）、TASK 02（理解学生）和 TASK 03（理解教学）；NoteBuddy 仅可作工程参考。
- 采用本地单用户、loopback、模块化单体和 SQLite 持久化。不要引入微服务、账户、队列、多 Agent 或新的 UI 框架。
- 不修改赛事原始 CSV、正式 ID、评分规则或现有统计口径；不提交原始赛事资料、运行数据或密钥。
- DeepSeek 是可选草稿能力；统计由确定性代码计算，AI 引用须经现有证据集合校验，复核必须由教师执行。

## 代码分层

- `apps/backend/app/api/` 只负责 HTTP 路由、Pydantic 契约及依赖装配。路由不能读取 CSV/JSON 文件，也不能自行调用模型 HTTP API。
- `core/` 保存全局日志与基础设施配置；`schemas/` 保存外部输入输出契约。
- `services/` 承载确定性分析、案例、建议和成果包逻辑；不得把业务计算移入 Repository。
- `domain/` 放置不依赖框架、API 或 ORM 的教育领域对象与规则。
- `repositories/` 负责持久化映射；`infrastructure/` 负责数据库、CSV 与外部模型适配。事务由应用用例界定，Repository 不独立提交。
- 前端网络请求统一经 `apps/web/src/api/client.ts`；TASK 页面分别归入 `features/task01`、`task02`、`task03`，通用控件留在 `components/`。
- TASK 01 不依赖 TASK 02/03；TASK 02 可读取 TASK 01；TASK 03 可读取 TASK 01/02；禁止循环依赖。
- TASK 03 建议必须限定单一测验节点；旧请求省略节点时，仅在数据明确只有一个节点时自动解析，多节点证据返回待选择状态。未经人工核验的指标/材料映射保持 `pending`，不得默认挑第一道题作为教学资源。
- 作答事件版本顺序不可判定（非法版本、重复最高版本或身份冲突）时隔离整个事件，不得回退到较低版本；质量报告保留来源行和 finding。
- TASK02 质量处置必须覆盖原始作答行，并区分计分、待评分、未作答、旧版本替代和排除；节点得分按节点分组，覆盖不等于应测完成率。改变分析算法时更新 `rule_version`。
- TASK02 案例仅作候选；理由需说明当前节点证据、题目样本和班级覆盖，证据不足或班级未覆盖时明确说明，不宣称全班代表性。
- TASK03 确定性草稿使用 TR-01..TR-08；只陈述节点内可追溯事实，不设固定得分率阈值或掌握标签。评分点问题需一致性校验；跨题重复问题需显式人工核验映射，未核验材料不得推荐。
- ReviewPanel 展示规则、证据、来源行和推断边界；切换节点/学生/指标后不得保留可保存的旧范围草稿。新增 Draft/Quality/Metric 字段必须同步 FastAPI response model、TypeScript 与共享 contract fixture。
- ZIP 可添加关系、节点统计和处置摘要，但既有成员/字段不得删除；统计说明须区分有效分母、未知/未测、节点覆盖和不可推断事项。

### Phase 02.5 Application 与事务边界

- Repository/UoW/FileStorage/LLM Protocol 放在 `app/application/ports/`；SQLAlchemy 与本地文件、DeepSeek 实现属于 Infrastructure adapter。兼容期的 `app/repositories/` 可继续放 SQLAlchemy 实现。
- Application 用例只依赖 Ports、Domain 与现有纯业务服务；不得暴露 Session/ORM。单个 UoW 负责提交、回滚和关闭；Repository 不自行提交。
- Review 的最新版本读取、校验和追加必须在同一个 SQLite 写事务中完成；保留复合唯一约束和有限 busy timeout。不得以进程内锁代替数据库跨进程一致性。
- 每项变更说明原因、影响模块与兼容风险；只新增真实调用需要的抽象，不建空模块或无用表。每个修改模块需有对应测试。
- SQLite schema 只通过显式 Alembic 命令升级。JSON 迁移必须分别解析 source/database/backup，扫描异常目录，拒绝未确认的已存在数据库和默认非空数据库；备份源 JSON 且不得删除或修改源文件。
- 完成后同步 `docs/architecture/`、README（运行/运维变化时）与本文件；记录实际运行的后端、Ruff、前端和迁移/备份验证，不得把未运行项目写成通过。

## 安全与兼容

- 默认监听 `127.0.0.1`。密钥仅从后端环境读取，日志不得写密钥、完整学生作答或整段模型上下文。
- 不把 `.env`、`data/`、原始赛事 CSV/PDF、模型输出或构建产物加入 Git。
- 保持现有 `/api/*` 路径、前端请求结构、版本规则、质量检查、证据行号、复核追加版本及 ZIP 成果包契约兼容。
- SQLite schema 只通过 Alembic 升级；应用启动不得隐式建表或执行迁移。JSON→SQLite 迁移必须显式运行、先备份并验证；不得删除原 JSON。
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

本项目不使用 GitHub Actions；以上检查在本地运行。

若环境无法运行某项，报告准确命令和原因。报告中区分已验证内容、未验证项和后续工作；不声称真实 DeepSeek API 已测试。
