# TASK 01/02/03 实施与验收报告

> 验收日期：2026-11-17。当前代码基线：`main` / `b15b08d7b4ddd79e22ea98dfb16b71f33f73eda3`。报告区分代码实现、自动化测试、公开数据复算和必须由团队成员完成的人工核验。未完成数学/教学人工审核的项目保持 `pending`。

## 1. 范围和基线

- 目标仓库：`D:\工作台\智慧学伴-比赛项目\NoteBuddy-SmartLearningCompanion`。
- 开始时工作区干净，当前分支为 `main`；本轮只在本地修改，不切分支、不提交、不推送。
- 收尾核对：HEAD 仍为 `b15b08d7b4ddd79e22ea98dfb16b71f33f73eda3`、分支 `main`；本轮 15 个代码/契约文件及本报告共 16 个工作文件处于未提交状态，工作区有意保持修改，未合并或推送。
- 官方依据：`【赛题材料】智慧学伴/赛题数据/赛题资料包/1_赛题规则.pdf`（第 3 页 TASK 01/02、第 4 页 TASK 03 与成果提交、第 5 页评分、第 7 页数据/内容安全、第 8—9 页数据范围与独立评测）；并阅读同目录 `2_参赛说明.docx`、`3_典型案例说明.docx`、`4_赛题数据/赛题数据说明.docx`。数据字段说明及 6 份 CSV 用于输入核验。课程标准与教材切片为扫描/图像型 PDF，本轮未 OCR 或逐页人工判读，内容关系继续标记 `pending`。
- 公开输入使用 `4_赛题数据/模拟学情数据/` 下六份 CSV，只读读取；逐文件 SHA-256 见第 4 节。课程标准 PDF 是扫描件，本轮未做 OCR，未根据页码或程序输出将学科关系标成 `verified`。
- 隔离数据库、在线备份和恢复文件均写在系统临时目录 `SmartLearningAcceptance-20261117`，未使用或修改仓库内 `data/smart_learning.db`。

## 2. Phase A—E 执行总览

| 阶段 | 结果 | 证据与限制 |
|---|---|---|
| A 基线与回归 | 通过 | 后端 96 passed / 1 skipped；前端最终 24 passed / 1 skipped；Ruff、格式检查及生产构建通过。默认跳过的 live contract 已显式启用并通过。 |
| B TASK 01 | 程序引用检查通过，学科内容仍待人工核验 | 9/9 指标来源状态为 `pending`；指标—教材/题目/先修关系未得到数学成员逐项签核。 |
| C TASK 02 | 官方 CSV 导入、复算和数据处置核对通过 | 806 行、799 个事件；处置覆盖全部原始行；有效分母和分节点得分率由原始 CSV 独立求和核对。版本及冲突处理策略尚待负责人和数学成员签核。 |
| D TASK 03 | 规则单测、真实数据触发审计、教师复核和 ZIP 闭环通过 | TR-01—TR-08 有专项测试。公开数据未触发 TR-06/TR-07，因为真实映射未验证；DeepSeek 未连接真实付费服务。 |
| E 集成与最终验收 | 本地软件链路通过 | 临时 SQLite 迁移、真实 FastAPI live contract、跨节点复核、重启后读取、ZIP、SQLite 备份/恢复通过。赛事提交物和人工审核未完成。 |

## 3. TASK 01：学科内容和出处

官方 CSV 有 3 个主题、9 个指标、54 道题、3 张学习卡、8 个教材索引。程序导入可验证 ID、引用和来源文件路径，但这些结构校验不能证明数学语义、教材印刷页或课程标准扫描原文正确。

| 指标 | 主题 | CSV 课标定位¹ | 题目 ID | 主题学习卡 | 配置中的教材切片 | 当前状态 |
|---|---|---|---|---|---|---|
| T01I1 | T01 | 62 / 55 | Q001、Q002、Q006、Q007、Q013、Q014 | L01 | B05、B06 | pending |
| T01I2 | T01 | 62 / 55 | Q003、Q004、Q005、Q008、Q009、Q010、Q012、Q015、Q016、Q017 | L01 | B05、B06 | pending |
| T01I3 | T01 | 62 / 55 | Q011、Q018 | L01 | B05、B06 | pending |
| T02I1 | T02 | 63 / 56 | Q019—Q026 | L02 | B04、B06 | pending |
| T02I2 | T02 | 63 / 56 | Q028—Q032、Q035 | L02 | B04、B06 | pending |
| T02I3 | T02 | 63 / 56 | Q027、Q033、Q034、Q036 | L02 | B04、B06 | pending |
| T03I1 | T03 | 63 / 56 | Q037—Q043 | L03 | B02 | pending |
| T03I2 | T03 | 63 / 56 | Q044—Q049、Q053 | L03 | B02 | pending |
| T03I3 | T03 | 63 / 56 | Q050—Q052、Q054 | L03 | B02 | pending |

¹ 课标文件页/正文页是 `课程要求.csv` 提供的定位值，不代表已独立核对扫描 PDF。L01—L03 是主题级资料映射，不代表每张卡已适配到该主题的每一个指标。教材切片清单取自 `resources/source_checks.json`，印刷页、具体题目适配和先修关系均待人工确认。当前 `indicator_checks` 为空，故已核验指标 **0/9**，待核验 **9/9**。程序只将其作为待核关系处理，没有用未核验关系输出确定材料推荐。

## 4. TASK 02：公开数据复算

### 4.1 输入版本与哈希

| CSV | 行数 | SHA-256 |
|---|---:|---|
| 课程要求.csv | 9 | `1a2e43dad2d9741e2c30268a56b4ae1d0905fa63e5ced871e138ea921a02cf11` |
| 题目与材料.csv | 65 | `787147c2610c6cee7a4424af46e6fa469c3dd7d496392fe139becd8f433acb19` |
| 模拟学生.csv | 40 | `fc497cd9e4e731b695ec6f300916e17c154243abeef9af43b456aa1ae9d7964b` |
| 测验节点.csv | 2 | `4eba902326d9e22582b162f345f67abfe1c6dc3efae1e208717c0cc8e782ff0b` |
| 作答记录.csv | 806 | `fb055bdcb0e83524f6e02c42713c9cf580a8c490a7fa609c31ab7b3ec43cf2be` |
| 字段说明.csv | 42 | `4771809373818fd5a729e111fd7e70e2cdccb85c1631ea75adc2707e57455966` |

`题目与材料.csv` 的 65 行包括 54 道题、3 张学习卡和 8 个教材索引，不能把 65 都当作题目。

### 4.2 作答处置与异常

| 项目 | 实际结果 |
|---|---:|
| 原始作答行 | 806 |
| 作答事件 | 799 |
| 多版本事件 | 7 |
| 已选唯一当前版本 | 799 |
| 有效已评分事件 | 786 |
| 原始状态：已评分 / 待评分 / 未作答 | 795 / 6 / 5 |
| 每行处置：scored / pending / unanswered / superseded / excluded | 786 / 4 / 5 / 7 / 4 |
| 每事件处置：scored / pending / unanswered / excluded | 786 / 4 / 5 / 4 |

finding 计数：多版本事件 7、待评分 4、未作答 5、无效总分 2、题目不在节点可用范围 1、主题不一致 1、评分点冲突 3。三个评分点冲突为 DR0133、DR0361、DR0535；它们保留独立的总分统计，逐点评分不参与有效 rubric 汇总。处置行数总和为 806，事件处置数总和为 799，未发现静默漏行。

程序按唯一最高版本选择；版本格式无法判断、重复版本或事件身份冲突时隔离事件；选中最高版本内容异常时不回退旧版。这是项目采用的算法策略，不是赛事规则明确规定的行为，尚待负责人和数学成员签核。当前公开数据实际没有触发非法版本、重复版本号或身份冲突；相关边界由自动化用例覆盖。

### 4.3 分母和手工复算

每组有效已评分数据采用 `S=sum(score)`、`M=sum(maximum)`、`ratio=S/M`；M 为 0 时保持 null/unknown。未评分、未作答、被替代和排除行均不进入分母。

| 范围 | n | S | M | S/M |
|---|---:|---:|---:|---:|
| 全部有效事件（节点合并，仅核对总数） | 786 | 744 | 1304 | 57.06% |
| N01 | 380 | 358 | 626 | 57.19% |
| N02 | 406 | 386 | 678 | 56.93% |

分节点 S/M 由原始作答行按 `record_dispositions` 过滤后独立求和，与服务指标一致。N01 与 N02 的题集、教学范围不同，以上差值**不解释为学习进步**。学生和班级节点指标也按节点展示；“有效记录覆盖”不作为应测完成率。系统没有逐生任务分配表，故应测完成率不可计算。

### 4.4 评分点一致性与案例候选

TASK 02 与 TASK 03 初次对照同一批数据时有 15 条评分点状态不同。原因是 TASK 03 的旧正则从 `Q015P2 分别……1分` 中把编号尾数 `2` 误当分值。已改为逐行解析、要求分值位于行末，并对缺少题目评分点定义的记录保留“逐点评分未知”，不将未知误报成冲突。加入回归用例后，806 行官方数据上的 TASK 02/TASK 03 评分点状态差异为 **0**；三个真实数据冲突仍为 DR0133/DR0361/DR0535。

公开数据生成的三个候选均为 N02、覆盖 DC01 与 DC02；均未由教师确认，不能称正式案例：

| 候选 | 班级 | 候选依据和可核对证据 | 限制 |
|---|---|---|---|
| D04：部分得分 | DC01 | 5 条带过程的有效部分得分：DR0083 第 138 行 Q006 2/3；DR0085 第 143 行 Q036 1/3；DR0089 第 152 行 Q054 1/3；DR0092 第 160 行 Q011 2/3；DR0093 第 162 行 Q014 1/3。 | N02 有效事件 12 条，涉及 12/45 道可用题；需数学成员解释作答过程。 |
| D36：表现较好 | DC02 | 当前节点相对较高样本得分率 18/21=85.7%；有效记录 DR0719—DR0727，CSV 行 1250、1256、1261、1262、1266、1267、1270、1271、1274，题目 Q028、Q034、Q031、Q045、Q040、Q035、Q043、Q042、Q049。 | 共 9 条有效事件，只覆盖 9/45 道可用题；不表示全班排名或掌握。 |
| D17：记录较少 | DC01 | N02 没有有效已评分事件，故候选证据 ID 为空。 | 不得解释成答错或未掌握；须先核实是否分配任务及采集是否完整。 |

## 5. TASK 03：规则、模型与复核

`test_task03_recommendations.py` 覆盖 TR-01—TR-08 的正向和降级/冲突路径；现有规则不依赖固定掌握阈值。对 40×9×2 个明确节点范围的学生—指标请求运行公开数据，得到：

| 规则 | 实际草稿数 | 公开数据说明 |
|---|---:|---|
| TR-01 | 120 | 节点范围明确未教学时，不给该主题材料建议。 |
| TR-02 | 80 | 没有有效评分证据。 |
| TR-03 | 2 | 当前版本有待评分记录。 |
| TR-04 | 157 | 未作答或没有记录。 |
| TR-05 | 241 | 节点内部分得分事实。 |
| TR-06 | 0 | 需要已核验的跨题评分点问题映射；正式来源配置未就绪。 |
| TR-07 | 0 | 需要经核验材料映射；正式来源配置未就绪。 |
| TR-08 | 120 | 证据冲突、未核验映射或无法安全形成结论。 |

共 720 个范围请求，无异常。TR-06/TR-07 使用显式标注的合成 verified fixture 做专项测试，不能据此声称真实赛事映射已验证。DeepSeek 使用 Mock 验证 JSON 结构和证据 ID 子集；没有真实 API 调用、费用或语义准确性结论。

跨节点复核问题已向后兼容修复：每条新复核 JSON 记录显式保存 `node_id`；数据库主键和 `student_id:indicator_id` 历史键不变；旧记录从 `original_draft.node_id` 读取，没有范围信息的旧记录为 null。页面按所选节点选择当前复核，并在全部历史中显示节点；ZIP 新增 `teacher_review_history.json`，建议条目注明审核节点。N01 和 N02 两条 live 复核已验证各自保留节点，导出后可区分；重启后旧记录仍可读取。

## 6. Phase E：接口、SQLite 和 ZIP 实测

- 临时空 SQLite 通过 `db-upgrade` 升至 Alembic revision `da812b1d5423`；12 张应用/迁移表存在，`integrity_check=ok`，`foreign_key_check` 为空。
- 真实 FastAPI（仅监听 127.0.0.1:8766）上通过 live contract：导入官方 CSV、读取运行/质量报告/案例、取节点规则建议、保存教师复核、读取历史、下载 ZIP。显式启用的 live contract：1 passed。
- `GET /api/source?file=B05_相关资料切片.pdf` 返回 PDF 200；越界 `../.env.example` 返回安全 400 错误。
- ZIP 实际含 manifest、数据质量、课程关系 JSON/CSV、指标、节点观察、rubric 观察、响应、证据索引、案例、建议和复核状态；本轮新增 `teacher_review_history.json`。检查未发现 `.env`、SQLite、key 或 secret 文件成员。ZIP 中保留原有 `raw_responses.json` 以兼容既有导出契约；未把赛事 PDF/CSV 原文件作为 ZIP 成员。
- 对在线 SQLite 执行 `db-backup` 和 `db-restore` 至新临时路径：两文件 SHA-256 同为 `58147763207e00cd677466ac1a0a559f9528789844f2b68c68ffcc3c362954ea`，均 `integrity_check=ok`、外键违规 0；运行快照、current 指针和 4 条测试复核历史均保留。
- 测试过程中隔离数据库有 2 个运行快照和 4 条测试复核记录；它们仅位于系统临时目录，不是项目数据。

## 7. 35 项赛事需求追踪矩阵

状态定义：`test_passed` 表示有本轮自动化或真实链路证据；`implemented` 表示代码有能力但内容/覆盖仍不完整；`blocked` 表示只有完成指定人工核验后才能称满足；`not_met` 表示未发现该项所需能力。没有条目标为 `manually_verified`，因为本轮没有替代教师/数学成员签核。

### TASK 01（8 项）

| 编号 | 官方依据 | 当前代码/运行证据 | 状态 | 待办 |
|---|---|---|---|---|
| T01-REQ-001 | 规则 PDF p.3：指定范围 | 3 个主题、9 指标导入；官方数据分析与 pytest 通过 | test_passed | 无代码缺口；主题内容仍需学科成员确认。 |
| T01-REQ-002 | p.3：梳理主要学习内容与要求 | CSV、`ObjectivesPanel`、TASK 01 服务 | blocked | 数学成员逐项核对扫描课标及 9 指标完整性。 |
| T01-REQ-003 | p.3：必要联系 | 主题/指标/题目 ID 可关联 | blocked | 补充有来源依据的内容、先修关系并人工确认。 |
| T01-REQ-004 | p.3：要求、材料出处 | `source_index_service.py`、source index、题目映射 | blocked | PDF/印刷页和题目—指标关系待核。 |
| T01-REQ-005 | p.3：范围清楚、可供后续使用 | 快照保存 objectives/items/source_index，未知状态保留 pending | blocked | 核定映射前不作为确定教学关系。 |
| T01-REQ-006 | p.3：材料出处可查看 | `/api/source` PDF 200；越界路径 400；前端来源面板 | test_passed | 无。 |
| T01-REQ-007 | p.3—4：成果结构清晰 | ZIP 的 course_relations JSON/CSV、learning objectives CSV/JSON | test_passed | 人工核验完后复核正式字段样例。 |
| T01-REQ-008 | p.5：内容准确且材料有据 | 目前 0/9 verified | blocked | 必须完成学科成员交叉审阅。 |

### TASK 02（14 项）

| 编号 | 官方依据 | 当前代码/运行证据 | 状态 | 待办 |
|---|---|---|---|---|
| T02-REQ-001 | p.3：分析模拟数据 | 六 CSV 实际导入；806 行/40 人/54 题核对 | test_passed | 无。 |
| T02-REQ-002 | p.3：处理重复、异常记录 | 修订选择、隔离、源行 finding；单测通过；实际 7 个多版事件 | blocked | 负责人和数学成员签核官方未规定的版本/冲突策略。 |
| T02-REQ-003 | p.3：数据质量检查 | 真实异常 finding：无效分数 2、题目范围 1、主题不一致 1 | test_passed | 签核异常策略后冻结为项目政策。 |
| T02-REQ-004 | p.3：缺失、待评分处理 | 每行 disposition 对账；待评分 4、未作答 5 个当前事件 | test_passed | 无。 |
| T02-REQ-005 | p.3：说明处理方式 | QualityPanel、findings、处置原因、rule_version 3 | test_passed | 将本报告的策略说明纳入团队交付包。 |
| T02-REQ-006 | p.3：记录/统计依据 | record ID、CSV 行号、evidence_index、导出可追溯 | test_passed | 无。 |
| T02-REQ-007 | p.3：个体摘要 | 学生—节点—指标指标及 unknown 状态；测试和 API 通过 | test_passed | 案例语义仍需人工复核。 |
| T02-REQ-008 | p.3：群体摘要与差异 | 班级/指标/节点加权总分，前端按节点展示 | test_passed | 不将不同节点得分差解释为进步。 |
| T02-REQ-009 | p.3：共性问题和差异 | 有指标/题目统计与部分得分事实，尚无充分的共性数学错误分类 | implemented | 需经核验的 rubric 映射与人工解释，不能靠关键词补齐。 |
| T02-REQ-010 | p.3、p.9：信息不足不推断未掌握 | not_measured/no_record/pending/unanswered/excluded 状态区分；测试通过 | test_passed | 无。 |
| T02-REQ-011 | p.3：结合答案、过程和评分依据 | EvidencePanel 显示答案/过程/评分点；评分点一致性检查和跨模块比较通过 | implemented | 过程的数学解释仍需教师/数学成员核验。 |
| T02-REQ-012 | p.3—4、p.9：适配实际范围 | N01/N02 指标分开显示；UI 声明合并值不能推断进步 | test_passed | 不做跨节点学习增长结论。 |
| T02-REQ-013 | p.4：典型案例并核对依据 | 三候选有记录、源行、题目、分数和班级覆盖 | blocked | 人工选定正式三案并解释作答过程。 |
| T02-REQ-014 | p.4：结构化任务成果 | ZIP JSON/CSV、字段说明、manifest；live 下载及解析通过 | test_passed | 按组委会最终格式/提交清单复核。 |

### TASK 03（13 项）

| 编号 | 官方依据 | 当前代码/运行证据 | 状态 | 待办 |
|---|---|---|---|---|
| T03-REQ-001 | p.4：结合学习要求、学情、任务条件 | 草稿要求 student/indicator/node；真实规则请求 720 次无异常 | test_passed | 学科映射确认后再作为正式建议。 |
| T03-REQ-002 | p.4：提出具体内容/练习/活动 | TR-01—TR-08 规则和步骤字段；专项单测通过 | implemented | 对教学活动是否适切需教师核验。 |
| T03-REQ-003 | p.4：对应具体资料/练习 | `material_ids` 受核验映射限制；当前 9 项都 pending | blocked | 不能伪造 verified；需完成 9 项来源审核。 |
| T03-REQ-004 | p.4：选择理由 | draft 给出观察事实、证据 ID、规则、推断限度 | implemented | 人工评价数学解释是否充分。 |
| T03-REQ-005 | p.4：必要先后安排 | 规则草稿含 steps/activity 和后续观察条件 | implemented | 按最终案例人工审核顺序与可实施性。 |
| T03-REQ-006 | p.4—5：回应不同需求 | TR-01—08 分支无固定掌握阈值；正反例测试通过 | test_passed | TR-06/07 最低证据门槛待团队签核。 |
| T03-REQ-007 | p.4：不足时补充观察/练习 | TR-02/03/04/08 和 unknown_reason 有测试 | test_passed | 无。 |
| T03-REQ-008 | p.4：教师可调整 | UI 可编辑并保存状态/理由；live review 成功 | test_passed | 教师语义审核属于交付流程。 |
| T03-REQ-009 | p.4：依据可核对 | 复核历史追加、节点标注、ZIP 导出；重启后读取通过 | test_passed | 无。 |
| T03-REQ-010 | p.2：可说明补充信息后的调整过程 | 具备 adjustment_condition 文本，未把后续 run 与旧建议串联 | not_met | 后续材料若提供，由团队人工说明或另行明确需求。 |
| T03-REQ-011 | p.4：不同案例核对建议 | D04/D36/D17 候选证据齐全，但未选为正式案例 | blocked | 教师确认案例及各自的不同需求。 |
| T03-REQ-012 | p.4：建议对应具体学生/证据 | student/node/indicator 过滤，证据引用子集校验；跨节点 live 测试通过 | test_passed | 无。 |
| T03-REQ-013 | p.7：模型内容合规 | Prompt 要求安全，模型草稿须教师复核；没有自动语义/泄题检测 | blocked | 指定教师检查每条正式模型建议；不声称自动内容审核通过。 |

## 8. 命令、结果与限制

| 命令/操作 | 结果 |
|---|---|
| Python 3.12：`python -m pytest`（环境摸底） | 未启动：当前 Python 3.12 环境没有安装 pytest；未擅自安装。 |
| `D:\ANACONDA\python.exe -m pytest -q -rs`（Python 3.14.6，项目要求 Python ≥3.12） | 96 passed，1 skipped，7.61s。Skip 是 Windows 当前环境不能创建符号链接，故 `test_migration_rejects_symlinked_run_files` 跳过。 |
| `D:\ANACONDA\python.exe -m ruff check apps/backend` | All checks passed。 |
| `D:\ANACONDA\python.exe -m ruff format --check apps/backend` | 96 files already formatted。 |
| `npm run test`（最终复跑） | 24 passed，1 skipped（默认 live contract 未启用）；7 个测试文件通过，live contract 单独显式运行为 1 passed。 |
| `npm run build` | TypeScript 检查和 Vite production build 通过。 |
| 显式开启 `VITE_SMART_LEARNING_LIVE_CONTRACT=1`、服务地址和官方 CSV 目录运行 `npm run test -- src/api/live-contract.test.ts` | 1 passed；真实 FastAPI HTTP 链路。 |
| 临时 SQLite `db-upgrade` / `db-backup` / `db-restore` | 成功；备份与恢复 SHA 相同、完整性和外键检查通过。 |

未执行 `npm ci`：现有 `node_modules` 与 lockfile 已足以运行测试和构建，避免不必要安装；未升级依赖。未调用真实 DeepSeek。曾尝试通过 Lightpanda 打开 localhost 页面，工具返回 `CouldntConnect`；故没有浏览器视觉检查结果，前端行为由 Vitest、构建及 live API contract 覆盖。该限制不影响上述实际 HTTP 断言。

## 9. 本轮修改与兼容性

- 修正 TASK 03 rubric 正则对 `P2 分别...` 的误解析；缺少 rubric 定义时保留逐点评分未知，不把总分有效记录升级为 rubric 冲突。
- 修正 TASK 03 DeepSeek 正例测试夹具：原夹具在同一学生/指标/节点内含有 invalid-score 记录，和“证据冲突必须 fail closed”的专项测试矛盾；改为使用既有无该冲突的正例样本。生产代码仍对真实冲突阻止模型调用。
- 新复核快照增加 `node_id`；API response、TypeScript 类型、ReviewPanel 历史标签及当前节点选取同步更新。旧历史从 `original_draft.node_id` 兼容读取；缺失节点的老记录安全返回 null。
- ZIP 新增 `teacher_review_history.json`，并在建议条目写出复核节点；既有成员、键和数据库 schema 保持。没有 Alembic migration，SQLite 快照继续通过原有 JSON payload 保存历史。
- 补充评分点解析、缺失 rubric、跨节点历史、legacy 记录、ZIP 和前端历史节点测试；共享 review-success contract 增加可空节点字段。
- 修改文件：`apps/backend/app/services/task03/recommendation_service.py`、`apps/backend/app/application/use_cases/save_review.py`、`apps/backend/app/schemas/http.py`、`apps/backend/app/repositories/review_repository.py`、`apps/backend/app/services/shared/export_service.py`、相关后端 tests、`apps/web/src/app/App.tsx`、`apps/web/src/app/hooks/useWorkbench.ts`、`apps/web/src/api/types/review.ts`、`apps/web/src/features/task03/components/ReviewPanel.tsx`、相关前端 tests、`contracts/api/review-success.json`。
- 兼容风险：ZIP 新成员为 additive；API review response 新增可空 `node_id`；老 review JSON 可读取。未更改 `/api/*` 路径、review 历史主键、指标算法 `rule_version=3`、官方 CSV 或数据 ID。

## 10. 人工待核、赛事材料和最终结论

前端最终复跑为 24 passed（原基线报告中的 23 是新增节点选择测试之前的结果）；`npm run build` 通过。`git diff --check` 通过。验收 API 服务在收尾时已不可连接，说明本轮启动的临时服务已退出。

必须由团队成员完成的事项：

1. 数学教师核验 9 项指标、扫描课程标准原文页、教材印刷页/PDF 页、B02/B04/B05/B06 对应关系、先修关系，以及 N01/N02 的适用范围；必要时第二人抽查并记录审核人/日期/出处。
2. 项目负责人和数学成员签核版本异常、总分与 rubric 冲突处理规则及 TR-06/TR-07 的跨题证据门槛。它们属于项目策略，官方没有给出唯一答案。
3. 数学教师最终选择 D04/D36/D17 或更合适的三个案例，核对原始作答和教学建议；D17 仅表示暂无有效证据，不能解释为未掌握。
4. 对正式教学建议进行内容、安全与教育伦理审核。系统没有自动证明 DeepSeek 的数学语义正确或不会泄露答案。
5. 当前比赛目录中未找到团队设计方案 PDF、5 分钟内演示 MP4、答辩 PPT 或独立评测数据。官方规则要求这些资料/后续安排，须由团队按赛题组正式通知准备；不能由本地软件验收代替。
6. 按规则保管赛事数据，并在赛后依组委会要求处理删除；本轮没有删除官方源文件。

**最终结论：`FUNCTIONALLY_READY_WITH_MANUAL_GAPS`。** 核心本地软件链路、数据处置、节点统计、来源 allowlist、教师复核、SQLite 持久化和成果包均有真实运行证据；但 9 项学科关系全部 pending，策略签核、正式案例审核和正式提交材料未完成。因此当前**不能称为赛事最终验收完成或 READY_FOR_SUBMISSION**。上述人工事项完成后，应更新本报告矩阵并重跑受影响回归。
