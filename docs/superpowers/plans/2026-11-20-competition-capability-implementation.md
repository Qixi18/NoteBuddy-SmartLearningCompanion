# 智慧学伴比赛能力优化 Implementation Plan

> **For agentic workers:** 使用 `superpowers:executing-plans` 按工作包执行；仅在用户明确选择代理协作时再使用 `superpowers:subagent-driven-development`。复选框表示待完成工作，不表示已实现。

**Goal:** 在保留可信统计与教师复核的基础上，交付有学科内容、具体教学行动和可独立核验比赛成果的本地智慧学伴。

**Architecture:** 沿现有模块化单体扩展来源映射、范围证据包、学情洞察、材料筛选与发布检查。业务计算留在Services，事务由Application/UoW控制，Domain定义证据与方案契约。新增持久化只服务真实工作流，HTTP与ZIP保持向后兼容。

**Tech Stack:** 现有Python/FastAPI/Pydantic/SQLAlchemy/Alembic/SQLite，React/TypeScript/Vite，pytest/Vitest/Playwright。首轮不引入新框架。

**Spec:** [代码能力与比赛交付优化规划](../../development/2026-11-20-competition-capability-roadmap.md)。实现前同时阅读仓库`AGENTS.md`与当前代码；基线为`main@096bbe2`。

## Global Constraints

- 采用本地单用户、loopback、模块化单体和 SQLite 持久化。不要引入微服务、账户、队列、多 Agent 或新的 UI 框架。
- 不修改赛事原始 CSV、正式 ID、评分规则或现有统计口径；不提交原始赛事资料、运行数据或密钥。
- TASK 01 不依赖 TASK 02/03；TASK 02 可读取 TASK 01；TASK 03 可读取 TASK 01/02；禁止循环依赖。
- SQLite schema 只通过 Alembic 升级；应用启动不得隐式建表或执行迁移。
- TASK03确定性草稿保留TR-01..TR-08及其边界，不设固定得分率阈值或掌握标签；新增细分观察另用`observation_code`，不得偷改既有规则含义。
- 旧HTTP请求、新增字段缺省、旧快照和既有ZIP成员保持兼容；新增字段同步Pydantic、TypeScript、共享fixture。
- 原始数据与人工核验分离；所有verified/confirmed由人工提交，脚本不能代签。
- 本计划只安排开发与交付，不授权远程推送、合并main、发布或自动更改日常数据库。

## Review Focus

1. 真正没有作答记录的学生如何完成正式案例而不虚构证据：P05/P11增加覆盖证据专项。
2. 仅教材文件或映射版本变化，旧方案是否仍被误认为有效：P03/P04/P09/P13增加失效传播测试。
3. 三人包里的嵌套建议、复核、调整或来源附件是否泄漏其他学生详情：P01/P13递归范围检查。
4. 两班题目集合和可观察人数不同，聚合是否产生虚假优劣结论：P07增加不等覆盖反例。
5. 模型返回真实ID但错误数学解释，是否被当成审核通过：P10/P14区分引用校验与语义评审，禁止自动签核。

## 执行方式与任务边界

下面P01–P16各自是可独立审阅的工作包。存在依赖时，先完成生产接口的一包，再实现消费接口的一包。每包执行顺序为：补失败用例→确认失败原因→实现→专项验证→兼容与相关回归→更新文档→本地提交。文档和纯人工核验不强行编造失败测试。

新增路径是明确的规划目标，不表示文件已存在。未列出行号的修改按类/函数定位，避免代码变化后误用过时行号。业务变更时更新`rule_version`；新增推荐模板使用独立`template_version`；模型上下文使用独立`prompt_version`。

## 一、统一新增契约

以下字段在首次拥有它的任务中实现，后续任务复用，不另建同义结构。Domain使用dataclass或当前领域模式；HTTP用Pydantic模型适配；前端共享命名。

| 类型及所有者 | 必需字段与语义 |
|---|---|
| `AnalysisScope`，P05 | run_id、student_id、indicator_id、node_id，均非空 |
| `EvidenceRef`，P05 | kind=response/coverage；evidence_id；scope；response引用原记录与source_line，coverage引用服务端计算覆盖结果及其hash |
| `EvidenceBundle`，P05 | scope、responses、items、rubric_definitions、coverage、source_versions、issues、fingerprint；source_versions为指标到版本映射 |
| `ResourceLink`，P03 | material_id、purpose、indicator_ids、allowed_node_ids、source_locator、content_hash、status；类型从原材料读取，不由调用者随意覆盖 |
| `RubricIssueMapping`，P03 | issue_id、label、rubric_point_ids、material_ids、evidence、status、reviewer；只引用当前材料内已定义评分点 |
| `InsightClaim`，P06 | claim_id、kind=fact/rule_observation/hypothesis、text、evidence_refs、limitations、review_status；假设永远不能按fact输出 |
| `ResourceSelection`，P08 | selected、excluded、reason_codes、source_versions；每个选中资源有目的、理由、适用范围 |
| `TeachingPlanV2`，P09 | schema_version=2、scope、goal、material_ids、resource_reasons、steps、hints、observation_points、adjustment_conditions、evidence_refs、source_versions、template_version |
| `ReleaseCheck`，P13 | check_id、status=pass/fail/not_checked、severity=blocking/warning、message、evidence_refs；not_checked不得折算pass |

`TeachingPlanV2`以新增`teaching_plan_v2`字段传输/保存，旧`structured_plan`继续读取。若需生成兼容旧字段的投影，只能由服务端统一转换并测试，不能让前端维护两份独立方案。所有新证据hash由稳定规范化字段计算，排除生成时间；ID格式不包含个人信息或本机路径。

## 二、实施工作包

### P01 修复案例包范围与引用闭合

**优先级/依赖：** P0；无。

**修改：** `apps/backend/app/services/shared/export_service.py`的`package`；`apps/backend/tests/test_stage2_workflow.py`；`tests/workbench.spec.ts`导出断言。

**接口：** 保持`package(run, reviews, case_ids, *, sources, cases, teaching_adjustments) -> bytes`；新增内部`validate_package_scope(files: dict, case_ids: set[str]) -> list[dict]`，检查所有学生级条目及嵌套引用，班级聚合按明确例外处理。

- [x] 增加 D01–D04 选择范围测试；所选建议及 manifest 计数排除 D04 的已接受和待处理复核。
- [x] 增加嵌套引用与聚合测试：复核/案例/历史/调整引用不得指向当前运行的未选学生记录，班级聚合不得携带逐人record_ids/event_ids。新增`validate_package_scope(files, case_ids)`作为打包门禁。
- [x] 先在旧实现运行新用例，确认未选调整及班级逐人观察触发失败；再对班级指标采用去明细投影，保留聚合分数、分母和计数。
- [x] 对齐过滤与 manifest 计数；案例/复核历史、教学调整及嵌套学生引用均限定所选学生；校验覆盖所有JSON成员的学生范围和当前运行证据引用。
- [x] `apps/backend/tests/test_stage2_workflow.py` 14 passed；全后端及评测契约 224 passed、2 skipped。浏览器测试用例打印通过并实际检查正式包，但 Playwright wrapper 未退出且清理报`EBUSY`；本轮服务与UUID数据已核实清理。完整runner退出状态仍由P13跟踪。
- [x] 更新包内字段口径与`docs/development/competition-submission-package.md`范围兼容说明；待独立本地提交。

### P02 环境自检与数据库准备

**优先级/依赖：** P0；无。

**修改：** `apps/backend/app/cli.py`、`api/routes/health.py`、`schemas/http.py`、`tests/workbench.spec.ts`、`playwright.config.ts`、`README.md`。**新增：** `apps/backend/app/services/shared/readiness_service.py`、`apps/backend/tests/test_readiness.py`。

**接口：** `inspect_readiness(config) -> dict`只读检查；CLI新增`doctor`；新增`GET /api/readiness`，保持`/api/health`兼容。报告schema_revision/head、资源可用性、前端构建和运行依赖，绝不返回密钥。

- [x] 新增只读`inspect_readiness`、CLI`doctor`与`GET /api/readiness`；测试旧库提示migration_required且字节/表结构不变，缺PDF保留`verified=false`，模型未配置时核心状态仍为ready_with_warnings。
- [x] E2E CSV生成器与包检查改用仓库虚拟环境Python（可显式覆盖）及绝对backend/tests路径。浏览器导入用例主体通过；同轮发现并修正两个过时断言标签/全局status定位。运行器仍在测试结束后挂起并触发清理失败，单独归入P13。
- [x] 复用现有临时数据库用例验证重复升级、在线备份和新目标恢复，含schema revision、行数、完整性与恢复内容检查。
- [x] `apps/backend/tests/test_readiness.py apps/backend/tests/test_infrastructure_phase025.py -q`：38 passed、1 skipped；readiness与CLI专项5 passed。根目录Playwright导入用例打印`ok 1`，但wrapper最终因Windows残留服务返回失败，不能计为命令整体通过。
- [x] README补充Python venv、doctor、备份/恢复、显式迁移和启动顺序；本轮检查只使用临时数据库，未碰日常数据库。

### P03 打通学科映射与资源契约

**优先级/依赖：** P0；无，先冻结本包接口。

**修改：** `schemas/http.py`、`application/use_cases/stage2.py`、`repositories/stage2_repository.py`、`services/task01/source_index_service.py`、`services/task03/recommendation_service.py`的`_verified_indicator_check`、`apps/web/src/api/types/subject.ts`、`SourceVerificationEditor.tsx`。**新增：** `apps/backend/app/domain/subject/source_mapping.py`、`apps/backend/tests/test_source_mapping_v2.py`。共享fixture放`contracts/source-mapping-v2.json`。

**接口：** 原SourceVerificationRequest/Response新增`resource_links: list[ResourceLink]=[]`、`rubric_mappings: list[RubricIssueMapping]=[]`、`source_fingerprints: dict[str,str]={}`、`expected_version: int|None=None`；保留原material_ids与knowledge_links。

- [x] 写HTTP往返测试：两题评分点映射经人工提交后仍在响应、数据库读取和规则输入中；未知评分点、别题评分点、重复ID均拒绝。
- [x] 测试8项教材/3张学习卡可通过ResourceLink关联，不能因为缺单一指标编号被静默丢弃；旧请求不带新字段仍可保存。
- [x] 给当前UI提交增加expected_version，旧客户端省略时兼容但不宣称拥有防陈旧覆盖能力；冲突返回409，保留用户编辑。
- [x] 在现有payload_json保存新字段；当前字段无需新增数据库约束/索引，故未添加迁移。
- [x] 核验必须由用户操作提交，不根据“字段齐全”自动verified；来源变更会标记旧签核过期，人工重新确认后追加版本。
- [x] 运行来源映射、共享契约、前端API/编辑器测试与构建；后端15项、前端11项通过，Ruff通过。

### P04 来源定位与学科内容交付

**优先级/依赖：** P0；P03。

**修改：** `services/task01/source_service.py`、`ObjectivesPanel.tsx`、`SourceVerificationEditor.tsx`。**新增：** `apps/backend/app/services/task01/material_catalog_service.py`、`apps/backend/tests/test_material_catalog.py`、`docs/development/subject-content-checklist.md`。

**接口：** `build_material_catalog(run: dict, sources: dict) -> list[dict]`；来源定位含文件名、SHA、文件页、正文页、片段标识；前端可打开白名单PDF并显示所引用定位。

- [x] 原有用例覆盖文件页越界、文件哈希变化及扫描页无文本；本次将状态改为OCR等待/失败/无文本，未在本次变更中运行回归。不再要求逐页人工核验，OCR结果只提供文本与状态，不自动确认指标映射。P03验证文件变化会使旧verified失效。
- [x] 增加逐指标材料与来源映射视图；OCR自动读取允许来源PDF并展示解析状态，不再设置逐页人工核验流程。指标、题目与材料关系仍需单独确认。
- [ ] 内容负责人逐项完成9指标、54题、18道解答题评分点、8教材及3学习卡检查，保留准确引用与解释；实际材料内容与核验数据保存在忽略的数据目录，Git只保存模板/脚本/合成fixture。
- [ ] 必要联系注明关系与依据；标为先修的边检查环路，非先修关联不错误强制DAG。
- [ ] 新运行可展示旧核验差异供复制为pending；文件/题目/映射指纹不一致不得自动继承verified。
- [x] 运行`python -m pytest apps/backend/tests/test_material_catalog.py apps/backend/tests/test_task01_source_index.py apps/backend/tests/test_shared_contracts.py -q`；工程用例通过。实际赛题PDF页图和逐条学科内容仍待内容负责人现场核验。

P04当前状态：`engineering_pass/content_pending`。目录与文件技术校验已完成；9指标、54题、18道解答题评分点、8项教材及3张学习卡尚未由学科负责人逐项核签。工作模板见`docs/development/subject-content-checklist.md`。

### P05 范围证据包与覆盖证据

**优先级/依赖：** P0；P03。

**新增：** `apps/backend/app/domain/assessment/evidence_bundle.py`、`services/task02/evidence_bundle_service.py`、`apps/backend/tests/test_evidence_bundle.py`。**修改：** `api/routes/analysis.py`、`schemas/http.py`、前端`api/client.ts`及`api/types/analysis.ts`。

**接口：** `build_evidence_bundle(run: dict, scope: AnalysisScope, sources: dict) -> EvidenceBundle`；新增`GET /api/evidence-bundle?student=&indicator=&node=`，run由当前运行解析并返回，不接受前端伪造证据hash。

- [x] `test_bundle_isolates_scope`：同run下的学生和节点范围隔离；跨run的scope被拒绝。记录编号跨run冲突反例仍可补充。
- [x] `test_no_record_has_coverage_evidence`：无记录返回稳定coverage引用、record_count=0及未知原因边界；不得产生response引用或零分。
- [x] `test_bundle_fingerprint_changes_with_sources`：来源签核版本、题干/评分点变化改变指纹；指纹计算不包含生成时间。
- [x] 组装题干、评分点定义、原始作答和步骤；保留pending/unanswered/excluded处置，非计分状态的得分为null。
- [x] 运行证据包、共享合同、全后端和前端测试及构建。Playwright 8项用例全部显示通过，但包装进程在退出阶段挂起并被中断；该轮浏览器验收不记为完整通过。

### P06 个体可解释学情

**优先级/依赖：** P1核心；P04、P05。

**新增：** `apps/backend/app/services/task02/insight_service.py`、`apps/backend/tests/test_student_insights.py`、`apps/web/src/features/task02/components/InsightPanel.tsx`。**修改：** `StudentPanel.tsx`、`EvidencePanel.tsx`、`api/routes/analysis.py`及相应合同。

**接口：** `build_student_insights(bundle: EvidenceBundle) -> list[InsightClaim]`；新增`GET /api/student-insights`，参数同证据包。

- [x] 测试单题评分点失分只产生局部事实；两题同类失分但未核验映射不产生“重复问题”；核验后生成规则观察并保留成功反例。
- [x] 测试总分与评分点冲突时阻断步骤归因；无记录只产生“暂时无法判断”，不出现“薄弱/不会”。
- [x] 输出带CSV原始行引用的事实和规则观察；点击后定位并展开对应原始证据行，假设不会冒充事实。
- [x] 使用评分点定义和仍有效的人工映射生成中性描述；过期签核不向规则输入提供旧映射，不生成自动能力标签。
- [x] 后端全量165项通过、2项跳过；前端全量65项通过、1项跳过，生产构建通过；内容负责人对三个主题的学科样本审阅仍待完成。

P06当前状态：`engineering_pass/content_pending`。自动解释仅是带引用、限制和未复核状态的候选；未由内容负责人复核的主张不得当作正式学科结论。

### P07 班级共性与公平口径比较

**优先级/依赖：** P1核心；P06。

**新增：** `apps/backend/app/services/task02/class_insight_service.py`、`apps/backend/tests/test_class_insights.py`。**修改：** `ClassPanel.tsx`、`api/routes/analysis.py`、统计响应与前端类型。

**接口：** `build_class_insights(run: dict, node_id: str, sources: dict) -> dict`；新增`GET /api/class-insights?node=`，返回两班范围、问题计数、去重人数、可观察分母、共同题目对比和边界。

- [x] 构造同一学生三条同类错误，问题人数只计1；分母只含本指标/节点有有效评分的学生。
- [x] 构造两班不同试题集合，展示全样本和共同题目口径；不输出能力排名或显著性结论；共同集合为空明确显示不可比较。
- [x] 班级共性可下钻学生，展示记录编号、题目编号和CSV行；汇总显示覆盖差异，不自动给班级掌握等级。
- [x] 后端全量171项通过、2项跳过；前端全量67项通过、1项跳过，生产构建通过；内容负责人编写两班正式分析并核对支持证据仍待完成。

P07当前状态：`engineering_pass/content_pending`。当前数字描述已观察记录，不能作为班级整体能力或因果结论。

### P08 可解释资源选择

**优先级/依赖：** P1核心；P04、P06。

**新增：** `apps/backend/app/services/task03/resource_selection_service.py`、`apps/backend/tests/test_resource_selection.py`。**修改：** `recommendation_service.py`与DraftResponse/TypeScript新增选择解释字段。

**接口：** `select_resources(bundle: EvidenceBundle, insights: list[InsightClaim], catalog: list[dict], purpose: str) -> ResourceSelection`；purpose为remediation/transfer/diagnostic之一。

- [x] 测试不适用节点、未核验材料、主题冲突、未知材料被过滤且有reason_code；一个候选也没有时返回blocked而非取第一题。
- [x] 测试相同输入稳定输出；迁移观察优先未见题，已做题明确排除为“仅供反思”。
- [x] 排序按目标问题、教学用途、迁移未见优先及稳定材料ID；理由明确是规则理由，不输出能力分数。
- [x] 题目与教材/学习卡分开选择；题目按当前证据包节点，教材/学习卡按当前指标、节点和人工核验范围过滤。
- [x] 三类目的产生区别化理由；全后端174通过/2跳过、全前端69通过/1跳过及生产构建通过。内容负责人逐项审核正式资源映射仍待完成。

P08当前状态：`engineering_pass/content_pending`。只有来源签核当前有效且范围相符的项目才能进入推荐；选择结果是可解释候选，不代替教师选择。

### P09 结构化方案与渐进提示

**优先级/依赖：** P1核心；P08。

**新增：** `apps/backend/app/domain/teaching/plan.py`、`apps/backend/app/services/task03/teaching_plan_service.py`、`apps/backend/app/content/teaching-plan-templates-v2.json`、`apps/backend/tests/test_teaching_plan_v2.py`、`apps/web/src/features/task03/components/TeachingPlanEditor.tsx`。**修改：** `schemas/http.py`、`application/use_cases/save_review.py`、`ReviewPanel.tsx`、前端teaching/review类型与合同。

**接口：** `build_teaching_plan(bundle, insights, selection, templates: dict) -> TeachingPlanV2`；模板按目的和核验问题组织，实际内容保存在可版本化的本地内容目录。`validate_plan(plan, bundle, latest_sources) -> list[dict]`用于保存及导出。

- [x] 方案绑定学生/指标/节点/运行、材料及逐项理由、步骤、提示、观察与调整、作答证据指纹和来源版本；占位文案与范围外引用不能通过校验。
- [x] 保存与导出重新计算证据和来源新鲜度；集成测试覆盖来源撤销、旧方案仅作历史记录且不进入有效导出。
- [x] 三类本地版本模板分别组织补救、迁移、诊断目标与观察；方向→结构→局部检查按层输出，教师说明独立于学生提示并有安全投影测试。
- [x] `teaching_plan_v2`支持保存、历史回看、旧格式兼容投影；旧结构化方案及历史 JSON 不强制升级或改写。
- [x] 全后端189通过/2跳过、全前端70通过/1跳过、生产构建通过；学科负责人核对正式三案例的提示、材料和调整条件仍待完成。

P09当前状态：`engineering_pass/content_pending`。模板是经教师修改前的方案草稿；正式使用前须逐条学科审核，导出会重新验证来源和证据指纹。

### P10 模型证据上下文与输出校验

**优先级/依赖：** P1增强；P05、P06、P08。基础演示不得依赖本包联网成功。

**新增：** `apps/backend/app/services/task03/model_context_service.py`、`model_validation_service.py`、`apps/backend/tests/test_model_grounding.py`。**修改：** `recommendation_service.py`的`deepseek_draft`及`infrastructure/llm/deepseek_client.py`必要接口适配。

**接口：** `build_model_context(bundle, insights, selection, max_chars: int) -> dict`；`validate_model_output(candidate: dict, context: dict) -> dict`。显式记录上下文裁剪，别名映射覆盖题目、记录、评分点和资源；返回后还原本地引用。

- [x] Mock断言上下文包含题干、评分点文字、步骤与可选资源；无范围外学生/记录，超限时按完整证据单元裁剪，不截断公式。
- [x] 测试伪造引用、模型输出伪造评分、未知材料字段、模型自称verified、输入中包含忽略指令提示；非法输出只回退到待教师复核的规则草稿。
- [x] 模型输出仅允许诊断、建议、调整条件和证据别名；超时、错误JSON及引用不合法回退规则草稿，未写入教师复核/编辑数据。
- [ ] 真实模型输出归档到忽略目录，记录模型/提示/上下文指纹与人工评价；不得把Mock通过写成真实服务验收。
- [x] 运行`python -m pytest apps/backend/tests/test_model_grounding.py -q`；本地mock验证不代表真实服务验收。
- [ ] 真实调用前完成资源使用和供应方数据边界确认，归档真实模型输出并作人工质量评价；本任务未发起真实或可能收费的模型调用。

P10当前状态：`engineering_pass/real_model_pending`。请求上下文不含本地ID还原表；题干/评分点中的指令按不可信内容传递；完整证据单元按预算裁剪。所有模型结果仍为待教师复核草稿，数值和签核由规则/教师负责。

### P11 无记录案例与教学调整闭环

**优先级/依赖：** P0内容闭环；P05、P09。

**修改：** `application/use_cases/stage2.py`的`save_case`、`teaching_adjustments.py`、`schemas/http.py`、`TeacherCaseEditor.tsx`、`TeachingAdjustmentsPanel.tsx`、现有导出服务。**新增测试：** `apps/backend/tests/test_coverage_cases.py`。

**接口：** TeacherCaseRequest新增`evidence_refs`，保留`evidence_record_ids`；教学调整新增`origin_evidence_refs`及兼容缺省，coverage引用须由服务端重新计算验证。

- [x] 测试当前节点无作答的学生凭当前 coverage、正式诊断方案和教师理由确认“记录不足”案例；其他学生范围、旧运行哈希、伪造记录均拒绝。
- [x] 保留 response 证据交集约束；仅经服务端重新计算核验的 coverage 分支允许空 `evidence_record_ids`。
- [x] 覆盖证据可启动诊断活动记录；后续 response 引用按同一学生/指标/节点重验并保留来源行，比较结论由教师明确填写。
- [x] 后续分数变化不自动标记干预有效；节点和运行范围固定，不把跨节点记录混入单节点证据。
- [x] 运行`python -m pytest apps/backend/tests/test_coverage_cases.py apps/backend/tests/test_stage2_workflow.py -q`；通过“无记录→诊断方案→确认→导出→后续作答”端到端测试。

P11当前状态：`engineering_pass/content_review_pending`。本机教师可完成零作答案例与诊断活动记录；正式赛事案例叙述仍须由学科负责人核查。

### P12 三案例阅读报告与两班报告

**优先级/依赖：** P1核心；P07、P09、P11。

**新增：** `apps/backend/app/services/shared/report_service.py`、`apps/backend/tests/test_case_reports.py`、`apps/web/src/features/export/CaseReport.tsx`、`ClassReport.tsx`。**修改：** `WorkbenchPages.tsx`只接入组件、`ExportPanel.tsx`、必要打印CSS。

**接口：** `build_case_report(run, confirmed_case, reviews, sources) -> dict`、`build_class_report(run, node_id, insights) -> dict`；报告数据模型同时用于UI与正式导出。

- [x] 测试报告中的分数、材料和复核版本均来自存储快照；不存在确认案例时返回明确未完成，不自动把候选渲染成已确认。
- [x] 报告展示范围、事实、解释、活动、提示、调整及限制；教师阅读版保留证据入口，打印版含可读定位，不仅是不可用按钮。
- [x] 三案例并排展示需求与方案差异；两班报告列共性、差异与覆盖，避免只摆三张得分卡。
- [x] 浏览器检查打印分页、长公式、长作答、表格跨页、1024/1440宽度；PDF输出采用同一报告视图，不能另拼一套统计。
- [x] 运行报告单测、工作区回归及打印/案例E2E；P12当前状态：`engineering_pass/content_review_pending`。正式案例由内容负责人重点风险复核；不执行 OCR 文本逐页人工核验。

### P13 发布检查与正式成果包

**优先级/依赖：** P0交付；P01、P04、P12。

**新增：** `apps/backend/app/services/shared/release_service.py`、`api/routes/release.py`、`apps/backend/tests/test_competition_release.py`。**修改：** `export_service.py`、`api/app.py`路由装配、`ExportPanel.tsx`及API合同。

**接口：** `check_release(run, sources, cases, reviews, report_data) -> list[ReleaseCheck]`；新增`GET /api/release-checks`与`POST /api/export-submission`。正式导出请求携带case_ids、run_id与预检fingerprint，事务读取最新版本后重核对，防止预检后变更。

- [x] 测试三案例不完整、来源过期、缺班级报告、未审提示、未知引用时正式导出阻断；旧草稿导出仍可用且状态清楚。
- [x] 预检指纹绑定运行、案例、复核、来源和报告；复核版本变化后拒绝旧指纹。来源/运行变化同样进入指纹，导出复核从同一只读快照打包。
- [x] 新增`release_checks.json`、案例/班级报告JSON与HTML、输出schema、输入输出样例和版本manifest；保留旧成员，manifest声明schema_version与package_type。
- [x] 实际解压校验ZIP结构、三人范围、两班聚合、报告状态、schema文件及所有成员的SHA-256；字段说明沿用并保留，新增输出字段由schema定义。
- [x] 发布单测、API指纹回归与正式ZIP结构/校验和检查通过；机器检查与人工签核分栏，官方独立数据未验收时保留`not_checked`，状态为`ready_with_open_checks`而非全部通过。
- [x] 正式包浏览器E2E：Playwright 已输出 `ok 1`，实际完成三案例确认、发布预检、下载及压缩包内三人范围/班级聚合/`not_checked`/全部成员SHA-256断言。
- [ ] Playwright 在打印测试成功后未退出并留下本轮服务；已核验本轮PID命令行后停止服务并通过仓库清理器清理本轮隔离数据。自动运行器的成功后退出问题仍需排查。

P13当前状态：`backend_and_browser_pass/runner_shutdown_issue/official_data_and_content_review_pending`。赛事提供的模拟CSV基线已由P14独立复算，但数学内容复核和独立教师签核尚待完成，不能宣称内容验收完成。

### P14 冻结评测与质量比较

**优先级/依赖：** 从M0开始；完整执行依赖P06–P13。

**新增：** `scripts/evaluate_competition.py`、`tests/test_evaluation_contract.py`、`docs/development/evaluation-protocol.md`；合成fixture放`tests/fixtures/competition/`，赛事摘录与真实模型输出放忽略的数据目录。

**接口：** CLI `python scripts/evaluate_competition.py --manifest <本地清单> --output <本地输出目录>`，输出逐案例结果、失败原因、输入/代码/规则版本；默认不联网。

- [x] 建立45个合成冻结契约案例：36个主题×需求×变体组合及9个异常场景；范围、允许材料/证据、必需/禁止结论均可机器检查，不固定建议排序。此批用于验证评测器契约，不代表经学科专家审核的完整比赛案例集。
- [x] 独立只读复算脚本不调用生产导入、修订、质量或metrics函数；赛事资料包CSV行处置、744/1304得分及六个原件SHA与冻结基线一致。
- [x] 合成变形测试覆盖CSV行序、学生ID替换、旧版本追加及更改其他学生数据不影响目标学生事实。
- [ ] 规则版与模型版在相同冻结输入上比较：统计正确、引用正确、数学解释、建议适切、提示边界、教师修改量；严重错误逐项列出。
- [ ] 教师审核每个冻结案例的正式结论，模型不用于给自己打最终分；官方独立数据到达后单独出具验收报告。

P14当前状态：`official_baseline_recalculated/quality_comparison_and_blind_review_pending`。赛事提供的模拟学情CSV独立复算已匹配冻结基线，但这不是隐藏评测；规则/模型同集比较、学科教师盲审仍未完成，不能报告教学质量验收通过。

### P15 正式材料、发布冻结与演示演练

**优先级/依赖：** P0交付；P13、P14、P16。

**新增：** `docs/development/competition-release-checklist.md`、`docs/development/demo-runbook.md`、`docs/development/submission-storyboard.md`。正式PDF/MP4/PPTX和数据包保存到项目父目录的`参赛交付/<版本>/`，不把赛事原始内容加入Git。

- [x] 起草正式材料放行清单、本地演示运行手册、18页设计方案结构及5分钟视频/10分钟答辩分镜；均依据赛题规则的20页/5分钟/10+5分钟硬限制。
- [ ] 按目标规格的18页建议结构编写设计方案，覆盖需求、方案、三任务、验证、创新、边界、组件来源与数据使用。
- [ ] 从同一release_id取截图、统计、案例及包，不引用旧演示数据；写清公开数据/自建测试/后续补充记录的来源区别。
- [ ] 制作≤5分钟视频、10分钟讲解PPT与5分钟问答备稿；实际计时并逐项核对数字。
- [ ] 在干净演示环境安装并用localhost启动，验证数据库、PDF来源、已确认案例、规则离线方案、正式包下载；准备录屏与成果文件回退。
- [ ] 工程、数学内容、交付三角色分别记录验收结果；冻结代码SHA、schema头、输入SHA、规则/模板/模型版本和最终文件SHA。
- [ ] 产出最终放行清单；本地提交与远程提交分开，未经用户明确指令不推送、不合并、不实际提交赛事系统。

P15当前状态：`preparation_docs_complete/final_artifacts_and_human_acceptance_pending`。已完成的是可执行蓝图和运行说明；最终PDF、MP4、PPTX、正式内容签核、干净演示验收仍未完成。

### P16 性能、可用性与维护性收尾

**优先级/依赖：** P1；P07、P09完成后启动，P15之前完成。

**修改：** 实测涉及的`useWorkbench.ts`、页面组件与服务查询；仅在确有性能问题时优化。**新增：** `tests/competition-journey.spec.ts`、`scripts/benchmark_competition.py`、`docs/development/performance-baseline.md`。

- [ ] 在记录硬件的演示电脑运行1000行基线与5000行压力样本，分别测冷启动、导入、切页、证据展开、报告生成；记录5次中位数与最大值。
- [x] 后端基准子集已在 Windows 11 / Python 3.13.3 完成：每规模5轮，测Alembic迁移、Store初始化、导入、健康/证据/案例报告/班级报告；详见`docs/development/performance-baseline.md`。这尚未覆盖整机冷启动和浏览器交互，不能替代上一条完整验收。
- [ ] 必要时按范围惰性加载证据、减少重复派生、按明确缓存键缓存纯计算；缓存键必须含run与source版本，撤销签核不得读旧缓存。
- [x] 本次后端实测未发现需要缓存或改写统计逻辑的证据，因此未添加缓存或改变统计口径。
- [x] 浏览器自动化已有端到端流程：`tests/workbench.spec.ts`覆盖数据导入、教学复核/方案编辑、案例确认、正式预检与成果包校验；另有路由刷新和键盘辅助用例。保留该覆盖，避免复制成重复的`competition-journey.spec.ts`。本轮未重跑浏览器套件。
- [ ] 三名首次使用者执行导入→查看证据→编辑方案→确认案例→导出；记录任务完成、困惑及阻塞，不凭截图宣布易用性通过。
- [ ] 检查键盘、焦点、表单错误、长内容、打印和浏览器刷新；复用现有组件，仅按实际需要拆分过大的ReviewPanel/WorkbenchPages。
- [ ] 运行专项E2E与相关回归；性能不达内部目标时报告瓶颈与实测范围，不擅自修改统计口径换取速度。

## 三、每阶段验收命令

从仓库根目录先激活或显式指定已有虚拟环境，并确认安装项目及开发依赖。执行前检查现有工作区，保留无关改动。以下是实现阶段要执行的命令，不是本规划已经执行的结果。

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m pytest
python -m ruff check apps/backend
python -m ruff format --check apps/backend
Push-Location apps/web
npm ci
npm run test
npm run build
Pop-Location
npm run test:e2e
git diff --check
```

对迁移、新脚本、正式包和真实模型另跑对应专项。官方数据回归通过环境变量指定只读原件；测试数据库一律使用隔离临时目录。Windows符号链接用例若跳过需准确列出，不视为已覆盖。不得重跑与变更无关的昂贵评测来制造“验证很多”的印象。

## 四、阶段交付矩阵

| 赛题要求 | 责任工作包 | 工程证据 | 内容/交付证据 |
|---|---|---|---|
| 三主题学习要求及必要联系 | P03/P04 | 映射契约、版本与定位测试 | 9指标卡、关系依据及教师核验 |
| 课标、教材、题目对应 | P03/P04 | 白名单、页码、指纹、资源类型测试 | 54题及使用资源逐项核对 |
| 缺失、异常、重复处理 | P01/P05/P14 | 处置守恒与独立复算 | 输入SHA、口径说明 |
| 个体表现与步骤解释 | P05/P06/P10 | 证据隔离与claims校验 | 学科样例审核 |
| 两班差异与共性问题 | P07/P12 | 去重分母、共同题目比较测试 | 两班报告与限制说明 |
| 具体材料、理由、顺序 | P08/P09 | 选择约束与版本有效性测试 | 三套差异化教学方案 |
| 分步提示与后续调整 | P09/P11 | 提示隔离、覆盖证据与调整测试 | 提示审核、教师观察记录 |
| 三名正式案例 | P11/P12 | 确认与导出E2E | 代表性理由与三案例报告 |
| 可机读成果与核对样例 | P01/P13/P14 | schema、范围、引用闭合 | JSON/CSV、说明与复算样例 |
| PDF、MP4、PPT | P15 | 文件/版本清单与尺寸时长核验 | 实际可读PDF、可播视频、答辩演练 |
| 新数据与独立评测 | P14/P16 | 变形测试、异常集与压力样本 | 官方独立数据到达后单独验收 |

## 五、完成定义

一个工作包只有在代码、测试、合同、说明及适用的人工内容全部完成时，才可标记完成。工程完成但待学科审核时写`engineering_pass/content_pending`；模型Mock通过但未实调写`mock_pass/live_not_run`；正式文件未生成时不能写“交付完成”。

本阶段规划交付完成后，执行者按P01/P02启动M0，再进入P03学科契约与P05证据契约。需要缩减工期时，先延期整本PDF自动提取、模型增强、扩展学生视图和方案对比；不得削减范围隔离、学科核验、三案例、正式包及必交材料。
