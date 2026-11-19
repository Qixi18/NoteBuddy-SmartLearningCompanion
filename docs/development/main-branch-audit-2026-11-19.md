# main 分支核验阶段报告（2026-11-19）

## 验收范围

- 仓库：`D:\工作台\智慧学伴-比赛项目\NoteBuddy-SmartLearningCompanion`
- 分支/基线：`main`，起始 HEAD `05db9e5f87513667576f592b3aced85ba644ff69`（与 `origin/main` 一致）。本报告期间没有提交或推送。
- 环境：Windows；Python 3.14.6；pip 26.1.2；Node 24.20.0；npm 11.19.0；Playwright 1.65.1；Chromium 159.0.8154.6。
- 工作区：有本次核验修复，尚未提交。每日数据库和赛事原始 CSV/PDF 未作为测试目标；数据库、导入副本和 E2E 均放在 `%LOCALAPPDATA%\Temp\smart-learning-audit-20261119` 下。

## 结果概览

结论：**ENGINEERING_BLOCKED**。截至本报告最近复测，项目代码范围的后端、前端自动化与构建均通过；清单仍有 P0 浏览器、边界矩阵和追踪证据未执行，故尚不能宣称工程验收通过。全仓探索式 Ruff 扫描曾触及 `.agents/_bmad` 技能目录，不属于本项目源码验收范围；项目代码与测试目录的 Ruff check/format 均通过，该技能扫描结果不计作项目工程缺陷。

| 范围 | 当前结果 |
|---|---|
| P0 | 已验证的基础环境、数据库升级、导入复算、单条 E2E、主路径测试通过；已验证项目源码 Ruff、临时 DB 双升级、API health 和一条 E2E；其余 P0 边界和浏览器矩阵仍有 `NOT_RUN`。|
| P1 | 若干运行、界面、导出及路径边界已核验；人工签核、模型、赛事材料等为 `BLOCKED`；其他未测项为 `NOT_RUN`。|
| P2 | `NOT_RUN`。|

## 已执行并通过

- 较早一次 `python -m pytest -q`：119 passed，2 skipped；不是当前计数。最近一次完整后端复测：`python -m pytest -q`：121 passed，2 skipped。两项 skip 均为本机 Windows 创建符号链接受 WinError 1314 限制（迁移源文件 symlink、PDF 资源根越界 symlink）；这两项需在可创建 symlink 的环境复验。
- 官方公开六 CSV 复算：`SMART_LEARNING_TEST_DATA_DIR=.../模拟学情数据 python -m pytest -q apps/backend/tests/test_core.py::test_public_bundle_if_available` 通过。独立从原始表按 `record_dispositions` 的 scored 行汇总得 744/1304；与 786 个有效评分事件及两个班级指标汇总一致。原始状态/事件处置仍依据完整验收报告中列明的原件 SHA 与逐行复算。
- T02-10/T02-12：新增极端比例差异样本，验证班级加权比率为 9/12=75% 而非学生比率简单平均 65%；新增学生×节点、班级×节点记录 ID 隔离反例。测试通过。
- T02-11：新增合法 0 分（0.0 ratio）、仅待评分、仅未作答、满分为零（排除）断言；既有完全无记录用例验证 `no_record`。不输出虚假 0% 或“未掌握”。
- ENV-02/03：独立临时数据库两次 `db-upgrade` 均到 Alembic head `b2f4d2a8c1e0`；14 张应用表、`integrity_check=ok`、`foreign_key_check=[]`。临时 loopback 服务 GET `/api/health` 返回 `200 {"status":"ok"}`，实际连接地址为 `127.0.0.1`，验证后关闭。
- ENV-07：本轮根目录 `npm run test:e2e` 使用唯一 Playwright run ID、忽略目录下新 SQLite/CSV 与独立 loopback 服务；Chromium 端到端导入工作台流程 `1 passed`。报告与 trace 配置路径为 `playwright-report/` 和 `test-results/`；本次通过故不生成失败 trace。
- BASE-03：赛事六个原 CSV 当前 SHA-256 与历史独立复算报告输入摘要相符；测试只读原件。`data/smart_learning.db` 当前 SHA-256 仍为 `1E76C2512A0CB37FAC30DB5F8AB4FFD772CDA09728AD2D5745CB6724A4A1F395`。本轮临时 DB 在 `%LOCALAPPDATA%\Temp\smart-learning-audit-20261119-current`。
- `python -m pytest -q tests/test_capture_shots.py`：2 passed。
- Ruff 项目 Python 源码/测试：`python -m ruff check apps/backend/app apps/backend/tests tests capture-shots.py` 通过；相同路径 `ruff format --check` 100 files already formatted。
- Web：`npm ci` 成功；最新 Vitest 50 passed，1 skipped；`npm run build` 成功。
- Playwright：`apps/web` 子项目没有 `test:e2e` npm script；仓库根目录配置了该脚本。根目录 `npm run test:e2e` 及直接 `npx playwright test` 均以全新临时 SQLite/CSV 和独立端口通过，各 1 passed，README 所写根目录命令可直接使用。
- 先前完整视口浏览器检查：8 个路由直接进入/刷新、前进后退、未知 hash 回首页；1024/1280/1440/1920 下检查页面宽度与横向溢出。1024 教学方案筛选控件过窄已修复并有 E2E 断言。
- 官方六 CSV 在临时副本导入并与独立复算脚本核对。原始作答行 806、逻辑事件 799、学生 40、指标 9、题目 54、知识点 2；导入处置与独立脚本一致（786 scored、5 unanswered、7 superseded、4 excluded、4 pending）。加权分数 744/1304 = 57.0552%。原始评分状态：795 已评分、6 待评分、5 未作答。
- 临时 DB 两次升级到 `b2f4d2a8c1e0`；SQLite integrity 正常，foreign key check 无异常。备份并恢复到新路径后，数据库摘要哈希一致。
- 临时 API 健康检查通过；无构建资产时根路径返回安全 503；无效学生和来源路径穿越请求返回安全 4xx。
- API-02：新增 Review HTTP 校验矩阵，未知/空白学生、未知指标、跨学生真实作答证据返回安全 400 且不写入 Review；空学生/指标/node query 返回契约 422。
- API-01/共享合同：新增 source-verification、teacher-case fixture 的后端请求/响应 Pydantic 校验及前端 payload 类型测试；完整后端/前端回归和构建通过。
- API-05/T02-02：坏 UTF-8 CSV 经 HTTP 返回安全 400 且 current run 不变；`/api/import-files` 增加 UTF-8 总内容 16 MiB 上限，超限返回带 request_id 的 422、current run 不变。限制在 JSON 解析之后执行，不是 ASGI 流式 body 上限，超大请求解析的峰值内存风险仍在。
- T02-05/T02-06/T02-09：新增版本为 0、负数、非数字、小数、空值时事件隔离且原始行各只处置一次；最高版本分数非法时保留该最高修订供审计、旧版标 superseded、两版均不进入指标，没有回退统计。
- ENV-10：新增真实应用关闭/重建回归，复核 GET /api/run 的 current run、Review history version 和 node_id 在 Store 重启后持久化；测试通过。
- 导出 ZIP 可解压，JSON/CSV 可解析。EXP-06 专项夹具选择 D01/D02/D03 并加入未选 D04：`student_cases.json` 与 `teacher_review_history.json` 只含被选学生；`all_metrics.json`、`responses.json`、`raw_responses.json`、`evidence_index.json` 仍包含 D04。官方样本实际包曾包含 40 名学生，其中 37 名未选择。全量审计包/三人案例包口径仍待负责人决策。
- `.gitignore` 包含 data、数据库、`.env`、Playwright 报告、截图/视频结果和凭据路径规则。
- `PRODUCT.md` 与 `DESIGN.md` 的画布背景冲突已统一；`PRODUCT.md`、`docs/ux/EXPERIENCE.md` 中已知断链已修复。相关本地相对链接核验通过。

## 首测发现与修复记录

1. `ObjectivesPanel` 将 `run.source_index` 快照当作最新签核状态。单测先验证失败，再调整为读取当前 API 签核历史并显示加载/失败状态；新增测试覆盖 API 最新 verified 而快照 pending 的情况。复测包含在 Vitest 49 passed 中。
2. 1024px 下三个教学范围选择器宽度只有 208px，低于可用性要求。先增加 E2E 断言复现，再将窄屏布局改为单列；最终 Playwright 通过。
3. `capture-shots.py` 依赖本机固定输出位置且 import 即启动浏览器。改为可传 `--base-url`、`--output-dir`，默认路径由脚本位置推导并添加 main guard；新增 2 个参数解析测试通过。
4. 修复 `PRODUCT.md` 设计描述及 EXPERIENCE 的相对链接。
5. Ruff 对仓库根目录 `.` 的探索式扫描会包含 `.agents/_bmad` 与 `.agents/skills`；本轮仅以项目源码、测试和截图脚本为 ENV-05 范围，`apps/backend/app`、`apps/backend/tests`、`tests` 和 `capture-shots.py` 的 check 与 format 均通过，未修改技能目录。清单不要求把未调用的个人技能目录当作项目源码验收。
6. T02-02 新发现并修复：Python CSV 默认宽松模式会接受未闭合引号。`read_bundle` 改为 strict 解析并将 `csv.Error` 转成包含文件名、行号的可读 `ValueError`；坏 CSV 测试先红后绿，修复后的后端 pytest 101 passed、1 skipped（含后续跨节点用例）。
7. T03-02/T03-04：新增接口用例，构造 D01/T01I1 在 N01 与 N02 都有有效证据的运行。无 node 的模型草稿返回 `scope_required=true`、来源为确定性规则，并断言网络调用函数未触发；测试通过。
8. EXP-01/EXP-03：新增 HTTP 导出参数验证（空选、重复 ID、未知 ID 均安全返回 400），以及确认案例字段/证据/复核版本验证；无效内容和无效证据均拒绝且不产生案例记录，有效已签核来源、已复核方案及证据组合可成功确认。
9. T02-02：HTTP 导入缺失必需列和损坏引号时都返回 400，当前 run_id 保持不变。首测发现 CSV 引号异常时底层 reader 的行号是前一条完整记录；现通过输入物理行跟踪报告正确行号，parser 和 HTTP 回归均通过。
10. T03-11：增加结构化方案反例，未签核时不能保存；已签核时未知/重复材料、空活动、缺步骤/练习/观察点均被拒绝且不写入 Review；随后有效方案仍以 version 1 保存，证明失败请求没有半提交。
11. T01-05/T01-08：增加 verified 来源签核反例，课标/教材定位、核验人、依据缺失，关联材料为空/未知/重复，知识联系目标为自身/未知或缺依据均被拒绝且不留下版本；有效签核随后保存为 version 1。
12. T01-10：来源 API 增加编码后相对路径、Windows 反斜杠、绝对路径及嵌套路径测试，均返回安全 400。`SourceService.resolve` 对允许名单中的名字也校验最终解析路径仍位于资源根目录，防止资源目录内 symlink 指向外部。专门 symlink 用例已增加，但当前环境创建权限不足而 skip，需在支持 symlink 的环境复验。
13. EXP-06：新增选中/未选中学生的 ZIP 成员范围测试，明确了案例详情/复核历史过滤与全量明细成员的实际区别；没有更改导出范围，等待负责人产品决策。

## 专项风险及待决事项

- **T03-07：** API 接受空 reviewer、reason、diagnosis、recommendation 的 accepted review，并将 reviewer 默认写成“教师”。清单注明正式复核字段规则需负责人决定；保留当前合同，未自行加硬性校验。
- **EXP-06：** 选择三个案例学生后，成果包仍含全量学生明细。需负责人决定是“全量审计包”还是“仅三人案例包”，再统一 UI 说明和导出范围。
- **DOC-07：** GitHub 集成无法读取 main branch protection（API 返回 403，权限不允许）；需负责人从仓库设置确认。
- **T03-06、数学/教学人工签核、赛事提交材料：** 尚无真实模型授权调用、数学成员审核签字、案例审核及最新官方材料/截止要求验收。均不得标成自动化 PASS。
- **T03-16：** 跨运行跟踪教学调整尚未实现；当前只有 adjustment_condition 文本，应继续保持 `not_met`。

## 尚未覆盖

本轮没有执行完整清单的所有正反例和组合。已完成 T02-10/11/12 统计与分母边界测试，官方六 CSV 独立复算通过，ENV-02/03/05/06/07、UI-01、DB-01/04/05、EXP-01/02/03/05、API-01/02、T03-02/04/05/11 等项目有当前测试证据。其余项目以 65 项追踪矩阵为准；仍未执行的 P0 项包括 ENV-04、UI-02 和其余边界组合。API-05 仅有 16 MiB 内容级上限，HTTP 流式 body 限额仍未测。完整矩阵见 `main-branch-checklist-matrix-2026-11-19.md`。

## 35 项需求追踪矩阵（2026-11-19 当前核验）

本矩阵按赛事需求清单 8+14+13 项逐条映射当前代码、测试、工程/人工状态和未满足条件；不构成最终赛事通过声明。PASS 只表示自动可验证部分有当前证据；内容审核需要人签核的需求继续 BLOCKED；NOT_MET 表示尚未实现。

| 需求 | 当前状态 | 当前代码与测试证据 | 人工签核状态 | 未满足的验收条件 |
|---|---|---|---|---|
| T01-REQ-001 指定学科范围 | PASS | 官方 CSV 临时副本独立复算：3 主题、9 指标、54 题；`test_task01_source_index.py`; apps/backend/tests/test_task01_source_index.py::test_source_index_preserves_theme_notes_and_verifies_explicit_valid_locator | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T01-REQ-002 梳理学习内容和要求 | BLOCKED | `ObjectivesPanel.tsx`、来源索引；来源缺项测试; apps/backend/tests/test_task01_source_index.py::test_unknown_or_invalid_indicator_mappings_stay_pending_or_invalid | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T01-REQ-003 必要知识联系 | BLOCKED | `stage2.py` 检查目标存在、自指、依据；新反例测试; apps/backend/tests/test_stage2_workflow.py::test_verified_source_signoff_requires_complete_valid_mapping | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T01-REQ-004 学习要求与材料出处 | BLOCKED | `source_index_service.py`、来源配置完整性测试; apps/backend/tests/test_task01_source_index.py::test_verified_map_with_unknown_material_or_rubric_reference_is_invalid | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T01-REQ-005 范围清晰、可供后续使用 | BLOCKED | pending 状态和来源校验代码; apps/backend/tests/test_task01_source_index.py::test_unknown_or_invalid_indicator_mappings_stay_pending_or_invalid | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T01-REQ-006 来源材料可查看 | PASS | `/api/source` allowlist、路径变体、缺失文件测试；symlink 测试受本机权限限制而 skip; apps/backend/tests/test_server.py source allowlist/path tests (symlink escape skipped on Windows) | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T01-REQ-007 成果结构清晰 | PASS | `export_service.py`、ZIP JSON/CSV 解析和工作流测试; apps/backend/tests/test_stage2_workflow.py::test_source_signoff_structured_plan_case_and_export_roundtrip | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T01-REQ-008 内容准确且有材料依据 | BLOCKED | 当前来源状态未因代码/页码自动改为 verified; apps/backend/tests/test_stage2_workflow.py::test_verified_source_signoff_requires_complete_valid_mapping | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T02-REQ-001 分析模拟数据 | PASS | 六 CSV 临时导入和独立复算；806 原始行; apps/backend/tests/test_core.py::test_public_bundle_if_available (current turn passed) | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-002 重复和异常记录 | BLOCKED | `test_core.py` 版本/事件冲突；导入处置核对; apps/backend/tests/test_core.py event identity and revision conflict cases | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T02-REQ-003 数据质量检查 | PASS | `test_task02_quality_metrics.py`；官方样本 finding 复算; apps/backend/tests/test_task02_quality_metrics.py::test_quality_records_disposition_and_audit_metadata | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-004 缺失与待评分处理 | PASS | disposition 逐行测试和官方样本对账; apps/backend/tests/test_task02_quality_metrics.py pending/unanswered/disposition tests | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-005 说明数据处理方式 | PASS | `QualityPanel.tsx`、质量 finding 与导出字段测试; apps/web/src/features/task02/components/QualityPanel.tsx; apps/backend/tests/test_server.py::test_run_api_exposes_extended_quality_dispositions | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-006 记录与统计可追溯 | PASS | `evidence_index`、record ID/行号及 ZIP 测试; apps/backend/tests/test_core.py::test_review_and_export; export roundtrip | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-007 个体摘要 | PASS | 学生/节点/指标指标及 unknown 测试; apps/backend/tests/test_task02_quality_metrics.py::test_node_metrics_preserve_legacy_aggregate_and_separate_denominators | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-008 群体摘要与差异 | PASS | 节点级班级统计和分母测试; apps/backend/tests/test_task02_quality_metrics.py weighted class and node disjointness tests | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-009 共性问题与差异 | BLOCKED | 有题目/评分点事实，不以关键词生成知识错误; apps/backend/tests/test_task03_recommendations.py::test_tr06_requires_shared_verified_rubric_issue_mapping_or_downgrades_to_tr05; human interpretation blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T02-REQ-010 信息不足不推断未掌握 | PASS | `no_record`/`not_measured`/pending/unanswered 测试；合法 0 分与零满分排除用例; apps/backend/tests/test_task02_quality_metrics.py zero/no_record/pending/unanswered/max=0 tests | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-011 结合答案、过程和评分依据 | BLOCKED | Evidence 页面有答案、过程、rubric 状态字段; apps/web/src/features/task02/components/EvidencePanel.tsx; human math review blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T02-REQ-012 适配实际测量范围 | PASS | N01/N02 分节点指标与跨节点规则测试; apps/backend/tests/test_server.py cross-node draft scope test | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T02-REQ-013 典型案例和依据 | BLOCKED | 三类候选服务和 evidence 输出; apps/backend/tests/test_task02_cases.py::test_cases_use_latest_node_and_explain_evidence_and_roster_coverage; human cases blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T02-REQ-014 结构化成果 | BLOCKED | ZIP 结构、manifest、文件解析测试通过; apps/backend/tests/test_core.py::test_review_and_export; apps/backend/tests/test_stage2_workflow.py export roundtrip | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T03-REQ-001 结合要求、学情、条件 | PASS | `recommendation_service.py` 规则测试、节点范围隔离; apps/backend/tests/test_task03_recommendations.py TR-01 to TR-08 tests | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T03-REQ-002 提出内容/练习/活动 | BLOCKED | TR 规则与 structured plan schema/验证; apps/backend/tests/test_stage2_workflow.py structured plan validation; teaching review blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T03-REQ-003 对应具体材料/练习 | BLOCKED | 当前来源未 verified 时 material_ids 被限制; apps/backend/tests/test_task03_recommendations.py verified material/rubric mapping tests | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T03-REQ-004 提供选择理由 | PASS | draft 的 observed fact、证据 ID、rule、inference limit; apps/backend/tests/test_core.py::test_deepseek_accepts_valid_structured_draft | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T03-REQ-005 提供先后安排 | BLOCKED | draft/structured plan 有 steps/activity; apps/backend/tests/test_stage2_workflow.py structured plan roundtrip; implementation review blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T03-REQ-006 回应不同需求 | BLOCKED | TR-01—TR-08 自动用例; apps/backend/tests/test_task03_recommendations.py TR-01 to TR-08 tests; strategy signoff blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T03-REQ-007 信息不足时补充观察 | PASS | TR-02/03/04/08 unknown/needs-observation 测试; apps/backend/tests/test_task03_recommendations.py unknown/unanswered distinction cases | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T03-REQ-008 教师可调整 | PASS | ReviewPanel 保存、版本追加与 E2E 草稿流程; apps/backend/tests/test_server.py::test_http_review_to_export; tests/workbench.spec.ts review workflow | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T03-REQ-009 依据可核对 | PASS | Review 历史、node、evidence 和 ZIP 恢复/导出测试; apps/backend/tests/test_server.py invalid identity/evidence HTTP tests | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T03-REQ-010 补充信息后说明调整过程 | PASS（本地功能分支） | `/api/teaching-adjustments`，Alembic `c46d02ef11a1`，TeachingAdjustmentsPanel；后端两运行工作流测试与 Playwright 创建/回访测试 | 工程能力已实现；教学效果及结论仍须教师审核 | 负责人需审核真实教学内容；不自动推断因果或干预效果 |
| T03-REQ-011 不同案例对应不同建议 | BLOCKED | 候选可定位到学生/证据; apps/backend/tests/test_task02_cases.py case candidates; formal case signoff blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
| T03-REQ-012 建议对应学生和证据 | PASS | `save_review.py` 作用域校验、跨节点及证据测试; apps/backend/tests/test_server.py::test_review_api_rejects_invalid_identity_and_cross_student_evidence | 自动/代码证据已核验；正式内容审核（如适用）仍独立签核 | 正式学科/教学/赛事内容签核仍需对应责任人独立完成（如适用） |
| T03-REQ-013 模型内容合规 | BLOCKED | Mock 错误/超时测试；真实模型调用未授权，语义未自动证明; apps/backend/tests/test_server.py model timeout/malformed response Mock tests; live call blocked | BLOCKED：需责任人签核原始出处、审核人和日期 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |

## 本轮未提交改动

- 修复目录签核状态、1024px 筛选布局、截图脚本参数化。
- 更新两个设计/体验文档的描述和链接。
- 增补对应 Vitest、Playwright、Python 参数解析测试。
- 仅修改项目应用目录的两个 Python 文件格式。

## 后续实施记录（2026-11-19，覆盖上文中的历史状态）

本节记录规划评审后继续实施的功能分支结果。分支 `feat/teaching-loop-and-evidence-consistency` 基于本地提交 `e54a022`；改动仍在工作区，未提交、未合并 main、未写入远程。上文“当前 main”核验仍是基线报告；以下数字与验收结论只对应当前功能分支代码。

### 规划任务实施

- **节点级复核与导出：** 导出按节点分别取最新复核，保留原追加历史和现有 ZIP 成员。无节点旧请求只在有效证据唯一对应一个节点时推断，否则拒绝保存。
- **最新来源签核进入规则草稿：** 规则和可选 DeepSeek 草稿读取当前来源签核历史；后续人工撤销/待核验会覆盖旧快照状态。未执行真实模型调用。
- **教学调整闭环（T03-REQ-010）：** 新增 Alembic `c46d02ef11a1`、持久化调整记录和起始复核外键、GET/POST/PATCH API、Web“教学调整”子页面及 ZIP 成员 `teaching_adjustments.json`。记录连接起始运行/节点/复核版本与后续运行/节点/证据；教师标注可比性和结论，系统不推断干预效果。测试使用隔离模拟数据。
- **复测与文档对齐：** BASE-08、ENV-04、ENV-09、ENV-11、EXP-04、EXP-07、UI-02、UI-05、UI-13、DB-02、DB-03 已补充或重跑证据，均为 PASS。改动清单无赛事 CSV/PDF 或 source-check 配置修改；统计算法与评分口径未变。修正体验文档中的旧导入交互与缺失教学调整流程、将设计宽度记录与最终 CSS 对齐，并校正追踪矩阵当前分支、基线和计数。矩阵为 P0 28 PASS、2 BLOCKED、0 NOT_RUN；P1 24 PASS、4 BLOCKED、4 NOT_RUN；P2 3 NOT_RUN。总数仍为 65。其余人工决策/学科签核、真实模型和正式比赛材料没有被工程测试替代。

### 当前分支验证

- 后端完整 pytest：128 passed、2 skipped、1 条 Starlette/httpx 弃用警告。两项 skip 是本机 Windows 创建 symlink 受 WinError 1314 限制。
- `ruff check apps/backend` 已通过；`ruff format --check apps/backend` 在整理前报 3 个文件需格式化，随后格式化并复查通过（104 个文件已格式化）。
- Web：`npm ci` 成功；Vitest 50 passed、1 skipped；`npm run build` 成功。
- 独立临时 SQLite Alembic 从空库升级到 `c46d02ef11a1` 两次成功；新表及 `teaching_adjustment_origins.run_id` 外键存在。
- Playwright 完整套件：最新完整运行 6 passed（25.6 秒），键盘专项单测曾另行 1 passed。覆盖九路由直接进入/刷新/历史导航、键盘打开/关闭导入弹窗及缺失文件播报；导入前后摘要变化；来源签核、教学方案、教师复核、案例证据跳转/确认、ZIP 成功下载/解压结构校验/下载开始提示、HTTP 500 下载失败提示；人为延迟生成/保存请求、重复触发不产生额外请求、切换学生后丢弃旧草稿；以及跨运行教学调整。五个关键页面在 1024/1280/1440/1920 共生成 20 张截图并检查无横向溢出。模拟审核数据不构成真实学科签核。
- 当前工作区回归（初次完成时）：后端 131 passed、2 skipped；Ruff check 与 104 个 Python 文件格式检查通过；前端 55 passed、1 skipped 且生产构建成功。三个前端关键组件/Hook 文件的针对性运行 24 passed；`tests/test_capture_shots.py` 另 2 passed；`git diff --check` 无空白错误（仅报告 LF/CRLF 转换提示）。
- 刷新失败保留行为：Hook 回归证明同一运行的案例/复核辅助请求失败时保留上次有效响应并提示错误；换到新运行时不会沿用旧运行的辅助数据。复核保存失败的测试确认表单编辑仍保留。
- ENV-11 CLI 全链路：在 `data/cli-audit-d08d8a38e53946e1bc09372593668378` 临时目录完成帮助、数据库升级、模拟 CSV 导入、摘要、备份、新路径恢复和恢复后摘要；备份/恢复 SHA-256 一致、SQLite integrity=`ok`、foreign key violations=0。该隔离目录保留且被 Git 忽略。

### 仍需人工完成

- 对课程/教材原文、9 项数学指标、正式案例、教师结论与真实建议逐项签字并记页码/审核人/日期。
- 负责人决定选三名学生后导出包的全量数据边界（EXP-06），确认 GitHub 分支保护（DOC-07）与正式赛事提交材料/截止要求（DOC-08/DOC-09）。
- 如需真实 DeepSeek 质量验收，先由负责人明确 API 调用授权；当前未发起收费模型请求。





- BASE-05/BASE-07：已建立 65 项逐条追踪表与七类 fixture 数据集矩阵；矩阵行数、列结构、P0/P1/P2 计数及编号唯一性均经脚本核对。

- ENV-06/UI-01：本轮锁文件安装 134 包，Vitest 50 passed/1 skipped，生产 build 成功；
pm run test:e2e 全部 2 passed。新增八路由直接 hash、刷新、当前导航标记、前进后退、未知 hash 回首页测试。测试新建过程中曾有 5 次测试装置/选择器/等待条件失败，修正后独立测试及全套通过；失败 trace 保留在忽略目录。




### 2026-11-19 后续清单推进

- 修复 API-05 的请求体读取边界：ASGI 层在 FastAPI JSON 解码前限制请求 body 为 20 MiB，超限统一返回 413；带 Content-Length 与分块传输超限、无效 UTF-8 三项回归均通过。慢速分块持续时间仍未验证，矩阵继续保留 NOT_RUN。
- UI-07 补充跨页选择联动测试并通过：D01/T01I1/N01 从学生分析打开作答证据，再进入建议复核，范围选择保持一致。UI-08 补充 1024px 长文本/80 步过程滚动夹具，页面无横向溢出且过程容器可滚动；多题和大量质量异常组合尚未覆盖，矩阵继续保留 NOT_RUN。
- 本次完整复测：后端 135 passed、2 skipped；前端 55 passed、1 skipped；生产构建成功；Playwright 7 passed；Ruff check 与 104 个文件格式检查通过。
- 安全静态扫描覆盖 5 个文本构建/测试产物，未匹配凭证样式或 Windows 用户路径；未检查截图视觉内容或独立交付 ZIP，EXP-10 与 API-04 仍为 NOT_RUN。未读取本地 `.env` 值，也未发起模型请求。
- UI-12 键盘审查发现 Chromium 中焦点会从导入 modal 逃至页面 `BODY`；已增加可见控件 Tab/Shift+Tab 首尾循环与测试，专项 Playwright 1 passed。模型异常浏览器场景通过拦截 `/api/deepseek` 模拟 502 验证，无真实模型调用。UI-12 全站审查仍未闭合。
- 焦点环对比度计算发现原色 `#6995EE` 在白底仅 2.94:1；已调整为 `#557FCE`，白底/画布分别为 3.95:1/3.65:1。键盘 E2E 断言焦点环 3px 与 RGB 颜色、Tab 环绕、Shift+Tab、Escape 和焦点返回，专项 1 passed。
- API-05 增加 body 总接收时限：最长 60 秒，超时返回 408/`REQUEST_BODY_TIMEOUT`；模拟慢 `receive` 测试证明请求不进入应用。请求大小、分块超限、无效 UTF-8 与总超时专项 4 passed；Ruff check/format 对相关文件通过。矩阵 API-05 更新 PASS。
- API-05 修复后的完整回归：后端 `python -m pytest -q` 135 passed、2 skipped；Vitest 55 passed、1 skipped；Playwright 7 passed；Ruff check 与 104 文件格式检查通过；矩阵 65 项状态脚本复核为 52 PASS、6 BLOCKED、7 NOT_RUN。
- UI-06 combined state acceptance now passes: Playwright covers empty store/loading/API unavailable and retry, pending and failed import with file selection retained, model 502 feedback, review save failure retaining edits and retry, and same-run auxiliary case failure retaining existing candidates. Hook/component tests cover auxiliary/model/API recovery.
- UI-06 扩充后 Playwright 完整套件复跑：7 passed（31.2s）；覆盖 API 不可用加载/重试、导入服务器失败与保留选择、保存失败保留编辑、同运行辅助候选失败保留旧数据。
- EXP-10 package scan added to `test_http_review_to_export`: scans every synthetic ZIP member for credential-like tokens, Windows user paths, and the isolated temporary fixture root. Focused export test passed; final screenshots and delivery ZIP remain unreviewed.

- UI-08 收尾通过：扩充隔离合成夹具至 41 题、40 条超分质量异常，并保留 4000 字作答和 80 步过程；1024px 下浏览器确认可滚动、异常可操作、无页面横向溢出。主流程专项 E2E 1 passed。最新矩阵计数为 P0 28 PASS/2 BLOCKED，P1 25 PASS/4 BLOCKED/3 NOT_RUN，P2 3 NOT_RUN；合计 53 PASS、6 BLOCKED、6 NOT_RUN（65 项）。


### 当前工作区收尾复核（2026-11-19）

- UI-08 压力 E2E 扩展完成：隔离合成数据包含 41 道题、40 条超分质量异常、4000 字长作答和 80 步解答过程；1024px 下无横向溢出，证据和异常可定位/操作。
- 最终回归：后端 `python -m pytest -q` 为 135 passed、2 skipped；前端 Vitest 为 55 passed、1 skipped；Chromium Playwright 为 7 passed；`ruff check apps/backend`、`ruff format --check apps/backend` 与 `npm run build` 通过；`git diff --check` 无空白错误。两个后端 skip 是本机 Windows symlink 权限限制。
- 追踪矩阵 65 项：53 PASS、6 BLOCKED、6 NOT_RUN，无已复现未修 FAIL。未执行项为 UI-12 全站可访问性、EXP-10 最终截图/实际交付 ZIP、API-04 截图/日志/ZIP 全量敏感信息核查、UI-14 可选页面拆分、UI-15 806 行等真实规模性能、API-06 文件路径与数据保管边界。未完成项不影响本轮已验证的关键路径结论，但矩阵尚非全绿。
- BLOCKED 项等待负责人/权限：EXP-06 导出数据范围决策、EXP-08 正式案例学科签核、EXP-09 赛事交付材料对应确认、DOC-07 GitHub 分支保护读取/设置权限、DOC-08 最新赛事交付与截止要求确认、DOC-09 最终冻结和签字。
- 工作仍在 `feat/teaching-loop-and-evidence-consistency`，未提交、未合并 main、未写远程；未修改官方赛事 CSV/PDF，未读取 `.env` 值，未发起真实/付费模型调用。
