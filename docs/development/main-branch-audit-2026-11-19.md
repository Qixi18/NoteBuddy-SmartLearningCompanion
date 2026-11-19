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
| T02-REQ-013 典型案例和依据 | BLOCKED | 三类候选服务输出类型、学生、结构化班级、覆盖理由和 evidence；官方 CSV 只读复算显示三候选覆盖 DC01/DC02；apps/backend/tests/test_task02_cases.py::test_cases_use_latest_node_and_explain_evidence_and_roster_coverage；human cases blocked | 自动证据与界面可见性已核验；正式案例代表性仍待责任人签核 | 需责任人提供人工审核记录、原始出处、日期与签核结论 |
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

### 本轮后续迭代：三人案例包范围

- **决策：** `/api/export` 是“三名案例与成果导出”，因此本 ZIP 定义为三人案例包，不包含全运行审计明细。学生级指标/观测、评分点观察、作答和证据索引只含所选学生；班级统计是所选学生所属班级的整班聚合，可能包含其他同学的聚合贡献，但不含其个人作答。完整运行审计包如需提供，应另行定义入口和数据范围说明。
- **复现：** 将 EXP-06 隔离夹具断言改为拒绝 D04 明细后，首测失败，确认旧实现把未选择学生的指标、回答、原始回答和证据索引放入 ZIP。
- **第二轮发现：** 复核质量附件发现 `data_quality.json` 的逐行处置和 finding 仍可能包含未选学生记录；首轮过滤需覆盖附属审计数据。
- **修复：** 导出服务统一筛选学生维度统计/观测/评分点、作答、证据索引和质量记录；班级统计保留入选学生所属班级的汇总。CSV 与 ZIP JSON 使用相同范围；manifest 增加 `package_type=selected_student_cases`，字段口径说明和导出页列明案例包范围及非全运行审计包。
- **验证：** 后端导出/历史导出专项 3 passed；完整 pytest 135 passed、2 skipped；Ruff check/format 通过；Vitest 55 passed、1 skipped；生产构建通过；Chromium 全套 7 passed，且解压 ZIP 核查未选 D04 不进入作答、证据、指标或质量记录；公开六 CSV 回归通过（1 passed）。来源路径/请求体边界专项 6 passed、1 skipped（Windows symlink 权限）。
- **未解决：** 学科签核、正式案例审核和真实模型语义仍需人工；后端两个 symlink 安全用例在当前 Windows 权限下跳过。此次没有读取本地 `.env`、调用外部模型、改官方资料、提交或推送。

- UI-08 压力 E2E 扩展完成：隔离合成数据包含 41 道题、40 条超分质量异常、4000 字长作答和 80 步解答过程；1024px 下无横向溢出，证据和异常可定位/操作。
- 最终回归：后端 `python -m pytest -q` 为 135 passed、2 skipped；前端 Vitest 为 55 passed、1 skipped；Chromium Playwright 为 7 passed；`ruff check apps/backend`、`ruff format --check apps/backend` 与 `npm run build` 通过；`git diff --check` 无空白错误。两个后端 skip 是本机 Windows symlink 权限限制。
- 导出范围迭代前的阶段记录：追踪矩阵曾为 53 PASS、6 BLOCKED、6 NOT_RUN；本轮修复 EXP-06 后，最新矩阵为 54 PASS、5 BLOCKED、6 NOT_RUN，无已复现未修 FAIL。未执行项仍包括 UI-12 全站可访问性、EXP-10 最终截图/实际交付 ZIP、API-04 截图/日志/ZIP 全量敏感信息核查、UI-14 可选页面拆分、UI-15 806 行等真实规模性能、API-06 文件路径与数据保管边界。
- BLOCKED 项等待负责人/权限：EXP-06 导出数据范围决策、EXP-08 正式案例学科签核、EXP-09 赛事交付材料对应确认、DOC-07 GitHub 分支保护读取/设置权限、DOC-08 最新赛事交付与截止要求确认、DOC-09 最终冻结和签字。
- 工作仍在 `feat/teaching-loop-and-evidence-consistency`，未提交、未合并 main、未写远程；未修改官方赛事 CSV/PDF，未读取 `.env` 值，未发起真实/付费模型调用。

### main 工作区后续迭代（2026-11-19）

本节覆盖上方实施记录的分支/HEAD 描述：本次实查分支为 `main`，HEAD `89fe0077496f6b02beef8b8a914099c7d00bc933`。以下改动均留在 dirty 工作区，尚未提交或推送；此前三人案例导出范围改动也仍在同一工作区。

- **重复实体 ID 静默覆盖：** 在 TASK 02 分析入口为学生、题目材料、测验节点建立唯一索引；空 ID 或重复 ID 现在明确拒绝，避免 Python 字典构造时静默丢弃同 ID 行。新增三类重复 ID 参数测试。规则和有效输入的指标公式未变，未改 `rule_version`。
- **浏览器导入的来源 PDF：** 浏览器上传使用临时目录，无法依赖原赛事材料包路径；新增可选 `SMART_LEARNING_SOURCE_FILES_DIR`，与 `source_checks.json` 所在 `SMART_LEARNING_RESOURCES_DIR` 分开。仍先校验 allowlist 文件名，并检查解析后的路径位于候选根目录内。新增模拟临时上传路径的 HTTP 来源文件测试，验证配置目录可读且内容正确。
- **密钥日志面：** `Settings` 的 `repr` 不再包含新旧模型 API Key 字段；新增只含虚构标记值的回归测试。核验过程中曾有一次失败回溯输出运行配置的 repr；运行密钥因此按已暴露处理，须由负责人在提供商处轮换。本报告不记录、不复述密钥内容。此后未读取 `.env` 或发起模型请求。
- **前端模型错误与审慎边界复核：** Hook 将 API 的安全错误文本用全局 alert 显示；E2E 已覆盖模拟 502。模型服务只覆盖确定性草稿允许的证据 ID，解析失败/不完整响应/无效引用拒绝；TR-01/TR-08 不调用模型。输出仍是草稿并要求教师复核，自动测试没有证明模型语义正确。
- **验证：** 最新完整后端 pytest `140 passed, 2 skipped`；`ruff check apps/backend` 和 `ruff format --check apps/backend` 通过（104 文件）；前端 Vitest `55 passed, 1 skipped`、生产构建通过；根目录 Chromium Playwright `7 passed`。两个后端 skip 仍是本机 Windows symlink 权限限制。前一条从错误目录调用前端脚本导致“无 test script”，已改从 `apps/web` 执行正确的 Vitest 和 build 命令并通过。
- **剩余边界：** 未执行真实模型质量/语义评审；九项赛事来源验证仍待学科责任人签核；UI-12 全站可访问性、EXP-10 最终截图/真实交付 ZIP、API-04 敏感信息产物全量审查、UI-14/15、API-06 等仍依原矩阵标为未执行或待决。自动化通过不等于赛事完整验收。

### 模型证据门槛优化（当前工作区后续复核）

- **复现：** 新增三种无有效评分场景（仅待评分、仅未作答、没有记录），失败用例证明原实现仍会向模型客户端发送请求。
- **修复：** `deepseek_draft` 仅在规则草稿引用范围内存在至少一条“已评分”记录时调用模型。无已评分证据时直接返回确定性草稿，保留未知原因和补充观察建议；原有范围冲突 TR-01/TR-08 仍在更早阶段拦截。未改统计、阈值或 `rule_version`。
- **验证：** 定向模型用例 6 passed（含三类不请求模型、有效结构化输出、伪造引用拒绝和冲突拦截）；完整后端 143 passed、2 skipped；Ruff check/format 通过（104 文件）；Playwright 7 passed。未调用真实模型 API。
- **评审边界：** 有已评分记录仅说明满足模型调用的最低证据门槛，不代表模型输出已被证明正确；证据语义和教学适切性仍需固定案例集与学科人员审核。
- **重复引用校验：** 复现模型对同一合法记录重复引用会通过校验，导致页面/历史出现重复 ID；现改为拒绝重复引用，加入 Mock 回归。完整后端现为 144 passed、2 skipped；Ruff check/format 通过。E2E 在该纯服务端校验前一轮已 7 passed，此次未因未影响 UI/API 契约的引用校验重复运行。

### 三类案例班级信息透明度

- **差距：** T02-DEV-005 要求案例覆盖与限制可见；原候选卡只显示学生编号、理由和证据，评审无法直接看到每名候选所属班级。
- **改动：** `/api/cases` 增加必需 `class_id` 响应字段（值来自原始模拟班级编号）；前端候选标题展示类型、学生和班级；原有 `reason` 班级覆盖总结保留。前端类型允许旧 Mock/客户端缺省该字段，避免兼容期 UI 崩溃。
- **验证：** 后端候选测试断言每类候选的 class_id；HTTP 测试验证响应模型包含该字段；Workbench 页面测试断言班级显示。使用官方六 CSV 只读复算：40 名学生、806 行作答，生成 3 个候选并覆盖 DC01/DC02（2/2）；此结果说明分组覆盖，不证明案例有代表性。完整后端 144 passed、2 skipped；Ruff check/format 通过；前端 55 passed、1 skipped 和 build 成功；Playwright 7 passed。
- **状态：** 赛事原始 CSV/PDF 未修改；真实案例代表性、差异解释和教学结论仍待教师/学科人员复核，本项不能据代码测试标为正式内容验收完成。

### TASK03 教学步骤展示修复

- **复现：** 新增 ReviewPanel 用例，将规则草稿 `activity` 设置为与 `recommendation` 相同、同时提供步骤/材料/观察点。原 UI 只在 activity 与 recommendation 不同时渲染教学安排折叠区，定向测试失败，确认规则草稿细节被隐藏。
- **修复：** 现在只要草稿含不同的活动说明、步骤、材料或观察点，就展示“教学安排建议”；活动说明与主建议重复时不再重复打印文案，但步骤、材料 ID、观察点仍可查看。
- **验证：** ReviewPanel 9 passed；前端完整 Vitest 56 passed、1 skipped；生产 build 成功；Chromium E2E 7 passed；后端 Ruff check/format 通过。此处只改前端展示，没有调整 TASK03 规则或推断逻辑。

### 教师复核历史中的完整方案回看

- **差距：** 完整教学方案此前已由服务端校验、追加保存并进入 ZIP，但 ReviewPanel 历史只呈现诊断/建议/理由，教师不能在应用内回看该版本保存的活动、材料、步骤、练习和观察点。
- **改动：** 展开某条历史复核后显示该版本的完整方案及材料来源签核版本号；无方案的旧版记录保持原展示。新增区分化样式，不改 API、数据库和 ZIP 契约。
- **验证：** 先加历史方案测试并观察失败，再实现；ReviewPanel 9 passed，完整前端 Vitest 56 passed、1 skipped，生产 build 成功，Chromium E2E 7 passed；后端 Ruff check/format 和 `git diff --check` 通过。历史测试覆盖活动、材料/签核版本、步骤、练习及观察点。
- **限制：** 页面显示的是复核时保存的历史方案与签核版本，不代表该来源签核当前仍有效；ZIP 仍由服务端按最新签核版本决定是否将方案作为当前有效内容导出。

### TASK03 教师复核历史中的当前签核有效性

- **差距：** 上一轮历史方案只展示保存时的签核版本；教师无法从页面判断该签核是否仍有效，容易把旧方案误认为当前仍可用。
- **规则与改动：** 与导出端一致，只有当前签核状态为 `verified`、版本号等于方案保存版本、且方案所需材料仍在当前签核材料集合中，才显示“本方案来源签核仍有效”；其他情况均标注签核已变化/撤销/无法核验，且方案仅作历史记录、导出不作为有效方案。
- **验证：** helper 单测覆盖有效版本、版本变化、材料缺失、签核撤销和无签核；历史 UI 测试覆盖当前有效与过期方案。ReviewPanel 11 passed；完整前端 Vitest 58 passed、1 skipped；生产 build 成功；根目录 Chromium Playwright 7 passed；`git diff --check` 无空白错误。没有改 API、数据库或模型推断。
- **限制：** 自动化验证的是版本/材料引用一致性，不代表课程来源本身经学科专家认可；真实模型和教材签核仍未执行。

### 自动化交付产物扫描（EXP-10 / API-04）

- **差距复核：** 旧审计只扫描少量文本构建/测试产物；演示 PNG 元数据、完整 Playwright 结果目录、ZIP 每个成员未形成可复用全量扫描流程。矩阵 HEAD 记录也与实际工作区不符，现已更新为当前 HEAD `2a442d03a76c958979d176a140f72bf651ef6e1b`。
- **实现：** 新增 `scan-artifacts.py`，递归扫描目录、逐成员读取 ZIP，并检查 PNG tEXt/zTXt/iTXt 元数据；识别常见 sk token、Bearer token、模型密钥配置行、Windows Users 路径，输出只含文件位置和规则、不回显命中值。Playwright 真实导出流程对浏览器下载 ZIP 执行该扫描；20 张多视口浏览器截图也在 E2E 中自动扫描。截图脚本现遇浏览器 pageerror 会失败，避免仅打印后仍被误认为成功。
- **验证：** 扫描器/截图脚本定向 pytest 4 passed；Ruff check/format 通过。真实导出 E2E 1 passed（ZIP 结构范围校验与全成员敏感形态扫描）；多视口 E2E 1 passed（20 PNG 检查并扫描）；对生产 bundle、Playwright HTML 报告/trace、test-results 和现存演示截图目录运行扫描，均为 `No artifact disclosure patterns found.`。没有读取 `.env` 或调用模型 API。
- **矩阵：** EXP-10 与 API-04 记为自动静态范围 PASS；当前 65 项统计为 P0 29 PASS/1 BLOCKED，P1 27 PASS/4 BLOCKED/1 NOT_RUN，P2 3 NOT_RUN；合计 56 PASS、5 BLOCKED、4 NOT_RUN。
- **边界：** 规则扫描只能证明所列模式未命中，不等于语义隐私审查；正式赛事交付 ZIP 是否包含恰当的真实案例内容、学生授权/匿名化和演示材料仍需负责人审阅。

### API-03/API-06 日志隐私加固

- **发现：** 通用 500 响应已隐藏异常原文，但服务端仍通过 `logger.exception` 把完整 traceback 与异常消息写入常规日志；合成异常验证复现了日志包含 Windows 私有路径和密钥标记。这使 API-03 的“安全错误”只覆盖响应，没有覆盖日志侧泄漏。
- **修复：** 通用异常日志现在只记录异常类型和 request ID，不输出异常文本或 traceback。定向回归先复现旧行为，再断言日志调用只有类型、请求 ID 且没有异常上下文。
- **验证：** 后端完整 pytest 145 passed、2 skipped；Ruff check 通过，104 个 Python 文件格式检查通过；Chromium Playwright 7 passed；API 响应仍为安全 `INTERNAL_ERROR`，未改变正常业务接口。未发现应用源码仍有 `logger.exception` 调用。
- **范围状态：** API-03 的常规 500 日志脱敏证据增强；API-06 仍为 NOT_RUN，因为临时文件/服务数据清理与数据保管边界未完成系统性核查。备份迁移报告保留源/目标路径是现有运维设计约定，不在此处静默改变。
- **诊断取舍：** 常规日志不再包含默认 traceback。排查需凭 request ID 结合受控诊断；如果未来需要完整堆栈，应另行设计访问受控、可脱敏的诊断通道。

### Playwright 临时数据生命周期（API-06 补充）

- **复核发现：** `playwright.config.ts` 的每次 E2E 默认在仓库 `data/` 下创建 UUID 隔离 SQLite 与六 CSV 导入目录；此前只靠 `.gitignore` 隐藏，没有清理钩子，累积旧产物。
- **改进：** 根 `test:e2e` 改由 `run-playwright.cjs` 启动子进程。只有运行器自己生成 UUID、且默认目录/数据库运行前都不存在时，才在 Playwright 和 webServer 子进程完全退出后，调用路径严格校验的清理器删除精确匹配的目录、SQLite、WAL/SHM。显式自定义路径、复用的 run ID、已有目标、越界路径和 symlink 目标不清理。`smart_learning.db` 与非 UUID 测试数据保留。
- **验证：** 清理器 Node 测试 2 passed、symlink 测试 1 skipped（Windows 本机不允许创建 symlink）；包装器定向真实 E2E 1 passed，结束提示已清理；包装器全套 Chromium E2E 7 passed，结束提示已清理；测试后确认本次 UUID 数据目录/DB 不存在、日常 `data/smart_learning.db` 存在、8876/5174 无监听服务。
- **历史残留：** 核验发现 `data/` 中仍有 263 个以前累积的 `playwright-<UUID>` 目录/数据库项。本轮尝试在校验其均为 `data/` 直接子项、并确认测试服务已停止后清理；执行工具的自动安全审查拒绝了递归删除。本轮没有绕过该限制或删除这些旧项。API-06 仍保持 NOT_RUN；未来经包装器启动的新运行会清理自己创建的临时数据。

### 2026-11-19 键盘与色彩复核（UI-12 补充）

- **发现：** 新增的全路由键盘审计首轮误报案例页两个嵌套折叠区的 `<summary>` 无法 Tab 聚焦。原因是审计筛选只检查最近一层 `<details>`，没有检查外层关闭的折叠区；浏览器实际 Tab 序列并未暴露这些隐藏控件。
- **改进：** 测试现在沿 DOM 所有祖先检查关闭的 `<details>`，仅保留关闭折叠区自身直接的 summary。9 个路由逐一检查可访问名称，并通过 Chromium 原生 Tab 验证焦点环；建议复核路由会生成规则草稿、展开教学安排/完整方案、启用结构化方案编辑并展开原始证据；教学调整路由使用独立模拟历史记录，展开后续证据和实施历史；案例路由展开教师签核表单，将条件态 textarea 与嵌套证据 disclosure 纳入检查。采样前禁用视觉过渡以避免计算到动画中间帧。以工作台入口链接作为序列起点，并先断言其焦点环，再遍历后续控件。
- **色彩发现与修正：** 实际 Chromium 文本/背景采样发现概览页琥珀状态（3.86:1）、青色统计数字（3.88:1）、数据质量技术文本（4.01:1）及建议复核“教学对象与目标”标签（4.47:1）低于小字号 AA 4.5:1；禁用按钮文本也偏淡。加深 `--amber`、`--teal`、`.quality-raw`、`button:disabled` 和 `.draft-target > span` 色值。扫描器现在解析项目实际使用的线性渐变 CSS 色标，并用最差端点作为背景对比；用例断言确实采样到渐变文本。对当前已覆盖的页面初始状态、建议复核条件态、教学调整历史与案例签核展开态，复测无低于 WCAG AA 阈值的组合。
- **验证：** 全站专项测试通过；全套 Chromium Playwright E2E 8 passed（`npm run test:e2e`，包装器清理本轮隔离数据）；前端 Vitest 58 passed、1 skipped；生产构建成功；后端完整 pytest 145 passed、2 skipped；Ruff check 通过、104 个 Python 文件格式通过；`git diff --check` 通过。清理器 Node 测试 2 passed、symlink 限制用例 1 skipped。
- **范围边界：** CSS 端点检查针对仓库现有两色浅色线性渐变；未覆盖动态主题、图形文字和所有条件状态，且没有替代完整 axe/WCAG 语义审计。人工屏幕阅读器检查仍待完成，UI-12 维持 NOT_RUN。

### 2026-11-19 模型提示去标识化

- **发现：** 可选模型请求会发送学生/记录/题目 ID；这些编号也嵌在规则基线的说明文本中，单独清理 JSON 字段仍会泄漏标识。
- **TDD 验证：** 新增模型提示回归测试，要求请求全文不含合成学生 `D01`、记录 `R2`、题目 `Q001`，而结构化证据使用“证据1”“题目1”；模型以“证据1”引用时，应用返回的本地草稿必须还原为 `R2`。首轮红灯准确暴露规则基线文本仍含 `Q001`，随后修复再通过。
- **改进：** 发送前剔除学生 ID、证据 ID、来源行等字段；将题目/证据编号映射为请求内别名，并对基线、指标和作答文本递归替换标识；模型引用校验只接受已发出的别名，之后在本地映射回原始证据 ID。未更改评分或推荐规则。
- **验证：** 后端完整 pytest 146 passed、2 skipped；Ruff check 通过、104 个 Python 文件格式检查通过；Chromium E2E 8 passed，隔离测试数据自动清理。没有读取 `.env` 或调用付费模型 API。
- **边界：** 学生作答过程文本仍会发送给所配置的模型服务，以便模型依据步骤提出建议；不能据此推断实际供应商不保存或不使用数据。真实供应商条款、人工授权及真实输出质量仍需负责人确认。
