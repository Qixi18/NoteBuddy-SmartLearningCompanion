# 智慧学伴 main 全面核验追踪矩阵（2026-11-19）

来源清单：`../智慧学伴-main分支全面核验与测试清单.md`。按原清单编号逐项保留。PASS=有当前可定位证据；FAIL=复现未修；BLOCKED=依赖授权、人工审核或责任人决定；NOT_RUN=本轮未执行。自动测试不替代人工学科/赛事签核。

环境：Windows / Python 3.14.6 / Node 24.20.0 / Chromium 159.0.8154.6；分支 main；HEAD `05db9e5f87513667576f592b3aced85ba644ff69`；工作区 dirty。E2E 使用 Playwright 独立 SQLite/数据目录和 loopback。
数据集映射见 [测试数据集矩阵](main-branch-test-datasets-2026-11-19.md)。

| ID | 优先级 | 责任方 | 状态 | 执行命令/动作与输入 | 期望 | 实际与证据 | 缺陷/未满足项 |
|---|---|---|---|---|---|---|---|
| BASE-01 | P0 | Codex | PASS | Get-Location; git status --short; git rev-parse HEAD; git log -5 --oneline | 确认仓库绝对路径、当前分支、`git status --short`、`git rev-parse HEAD`、`git log -5 --oneline`；如基线变化，补充变更范围及新增回归项。**证据：** HEAD、工作区状态、提交摘要。 | main，HEAD 05db9e5f87513667576f592b3aced85ba644ff69；dirty，改动清单由 git status 提供 |  |
| BASE-02 | P0 | Codex | PASS | 逐项先测后修；失败保留在审计报告 | 此轮先测试、后修复；任何自动修复单独建变更清单，不在原本核验报告中抹去失败证据。**证据：** 首测日志、修复 diff、复测日志分开保存。 | 统计参数用例通过；官方 CSV 首测发现测试局部导入 pytest 导致失败，修正后复测通过；代码首测与修复记录保留 |  |
| BASE-03 | P0 | Codex | PASS | Get-FileHash 六个官方 CSV；临时 SQLite 与 E2E | 仅使用隔离的临时 SQLite、临时 CSV 和备份目录，不修改官方 CSV、教材 PDF 或现有 `data/smart_learning.db`。**证据：** 数据路径、前后哈希与清理说明。 | 六个原件摘要与既有报告一致；临时库 %LOCALAPPDATA%\Temp\smart-learning-audit-20261119-current；日常 DB 摘要未变 |  |
| BASE-04 | P0 | Codex | PASS | 审查 config.py、server.py、Playwright config、package.json | 项目默认本地单用户、loopback、SQLite、无 GitHub Actions；禁止为测试增加账号系统、微服务、队列或引入新的前端框架。**证据：** 无范围外架构变更。 | SQLite、127.0.0.1、无 GitHub Actions；未增新框架/微服务/队列 |  |
| BASE-05 | P0 | Codex | PASS | 已生成当前追踪矩阵 | 逐项填写：编号、优先级、执行命令/点击动作、输入夹具、期望、实际、状态、截图/日志路径、关联缺陷。**证据：** 测试追踪矩阵。 | 已建立 65 项矩阵，字段含 ID/优先级/责任方/命令/期望/实际/状态/缺口 | 关联缺陷和特定截图仅在适用项记录；未执行项明确 NOT_RUN |
| BASE-06 | P1 | 负责人 | PASS | 人工/自动状态分列并设为独立状态 | 人工审核和自动化测试分离；学科正确性、教学语义、比赛提交要求不得由 pytest 或 Codex 自行代签。**证据：** 审核人、日期、原始出处与结论。 | 自动化状态与人工状态分开标注；责任人审核条目均未伪造签字 | 实际学科/教学签核仍待责任人完成 |
| BASE-07 | P1 | Codex | PASS | 已建立测试数据集矩阵 | 建立数据集矩阵：空库、最小正常样本、赛事公开六 CSV、版本冲突样本、跨节点样本、部分缺失/异常样本、历史 JSON 迁移样本。**证据：** 用例与数据集映射。 | 空库/最小样本/赛事六 CSV/版本冲突/跨节点/部分缺失异常/历史 JSON 均映射到现有 fixture 与隔离目录 | 未覆盖的细分组合仍按各自清单条目标记 NOT_RUN |
| BASE-08 | P1 | Codex | NOT_RUN | 本轮未执行 | 新增或修改测试不得偷改源 CSV 和生产业务规则以“让测试通过”；问题需如实报告并经负责人批准后修改。**证据：** diff 与理由。 | 无本轮证据 | 待核验 |
| ENV-01 | P0 | 自动 | PASS | python/pip/node/npm/playwright --version | 在项目根目录安装或确认 Python 依赖，使用 Python 3.12+，记录解释器、pip、Node、npm、Playwright 浏览器版本。**通过：** 与 `pyproject.toml`、`package.json` 兼容。 | Python 3.14.6、pip 26.1.2、Node 24.20.0、npm 11.19.0、Playwright 1.65.1 |  |
| ENV-02 | P0 | 自动 | PASS | 隔离 SMART_LEARNING_DATABASE_URL；db-upgrade 两次；SQLite PRAGMA | 全新空 SQLite 执行 `python -m app.cli db-upgrade`。**通过：** Alembic 升至 head；重复运行不报错、不重复建表。 | 两次到 Alembic b2f4d2a8c1e0；14 表；integrity ok；foreign_key_check=[] |  |
| ENV-03 | P0 | 自动 | PASS | 临时服务 127.0.0.1:18765；GET /api/health | 启动 FastAPI 并请求 `/api/health`。**通过：** 返回 200、`{"status":"ok"}`，只监听指定 `127.0.0.1`。 | HTTP 200，{"status":"ok"}；loopback 成功；测试后关闭 |  |
| ENV-04 | P0 | 浏览器 | NOT_RUN | 本轮未执行 | 启动 Vite 后打开首页；验证 API 代理与跨服务调用。**通过：** 无浏览器致命错误、无 500、无 CORS/代理异常。 | 无本轮证据 | 待核验 |
| ENV-05 | P0 | 自动 | PASS | pytest -q；ruff check/format 项目源码路径 | 执行后端 pytest、Ruff check、Ruff format check。**通过：** 所有测试通过（已知系统限制下的 skip 单独列出）；不存在格式或静态检查错误。 | 121 passed，2 skipped；Ruff check 与 format 通过；symlink 两用例受 WinError 1314 跳过 |  |
| ENV-06 | P0 | 自动 | PASS | apps/web 执行 npm ci; npm run test -- --run; npm run build | 前端执行 `npm ci`、`npm run test`、`npm run build`。**通过：** 从锁文件安装正常，Vitest 通过，TS 和 Vite 构建无错误。 | 134 包安装；Vitest 50 passed、1 skipped；构建成功 | esbuild install-scripts 提示需人工 allowScripts 审查，但安装/build/test 成功 |
| ENV-07 | P0 | 浏览器 | PASS | 根目录 npm run test:e2e | 根目录执行 `npm run test:e2e`，必要时先安装 Playwright Chromium。**通过：** 独立前后端启动、测试完成、trace/report 可查、无污染日常库。 | Chromium 1 passed；唯一 run ID、独立 SQLite/CSV、loopback；HTML 报告配置于 playwright-report/ |  |
| ENV-08 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 无数据运行时首次启动和空状态。**通过：** 提示导入六类文件，不出现虚假统计、零分或空白崩溃。 | 无本轮证据 | 待核验 |
| ENV-09 | P1 | 自动 | NOT_RUN | 本轮未执行 | 无前端生产构建时访问根路径；构建后再访问。**通过：** 缺资产显示安全的 503 提示，构建后同源网页资源可正确加载。 | 无本轮证据 | 待核验 |
| ENV-10 | P1 | 自动 | NOT_RUN | 本轮未执行 | 关闭并重启服务、同时检查健康接口和当前运行。**通过：** 运行数据、复核历史、当前指针持久化；服务可正常释放 SQLite 连接。 | 无本轮证据 | 待核验 |
| ENV-11 | P1 | 自动 | NOT_RUN | 本轮未执行 | CLI `import`、`summary`、`db-backup`、`db-restore`。**通过：** 命令说明和实际行为一致，错误参数返回可理解信息。 | 无本轮证据 | 待核验 |
| EXP-01 | P0 | 浏览器+接口 | PASS | `python -m pytest -q`：test_export_rejects_empty_duplicate_and_unknown_case_ids；Playwright 全流程 | 空选/重复/未知三类均拒绝，正常三人可导出 | HTTP 400/INVALID_REQUEST 断言通过；完整导入工作台 E2E 2 passed | 下载响应头/点击下载 UX 仍属 EXP-07 NOT_RUN |
| EXP-02 | P0 | 自动 | PASS | `python -m pytest -q`：test_unverified_source_and_unconfirmed_case_never_enter_confirmed_export | 候选与人工确认分离 | confirmed_cases.json 空数组断言通过，候选未升级为确认案例 |  |
| EXP-03 | P0 | 自动 | PASS | `python -m pytest -q`：test_confirmed_case_requires_teacher_content_evidence_and_review_reference | 必填 reviewer/narrative/limitations/evidence/有效 review refs；坏引用拒绝且无写入 | 七类无效 payload 400、历史无半提交；有效 payload 可 confirmed | 负责人对真实案例内容仍需人工审阅（EXP-08） |
| EXP-04 | P0 | 自动 | NOT_RUN | 本轮未执行 | 来源签核版本更新后重新导出。**通过：** 失效结构化方案与案例不得继续列为 confirmed，历史仍保留。 | 无本轮证据 | 待核验 |
| EXP-05 | P0 | 自动 | PASS | `python -m pytest -q`：test_review_and_export；test_source_signoff_structured_plan_case_and_export_roundtrip | ZIP 可读、JSON/CSV 可解析、清单/哈希/版本一致 | export/roundtrip 测试在 121 passed 中通过 | 对全部成员和未来兼容版本的穷举不在该测试范围 |
| EXP-06 | P0 | 产品决定+自动 | BLOCKED | 需责任人/学科成员人工审核或决定 | **专测已知风险**：选择 3 名学生后，`raw_responses.json`、`responses.json`、`all_metrics.json` 是否仍包含全量学生信息。**通过：** 明确两种之一——全量审计包或仅三人案例包——并使界面说明、输出文件、权限/数据范围一致。 | 已测到未选学生明细仍在成果包，选择全量审计或三人案例包的产品决策未定 | 负责人决定导出语义后再统一 UI/文件范围 |
| EXP-07 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 浏览器点击下载，校验响应头、文件名、下载成功/失败反馈。**通过：** 失败不误显示成功，成果包能由普通解压软件打开。 | 无本轮证据 | 待核验 |
| EXP-08 | P1 | 人工 | BLOCKED | 需责任人/学科成员人工审核或决定 | 逐项核查三个正式案例的代表性、原始证据、数学解释、方案、适用限制。**通过：** 教师或学科成员签署三例完成记录。 | 当前无签核或决定证据 | 需责任人输入 |
| EXP-09 | P1 | 人工 | BLOCKED | 需责任人/学科成员人工审核或决定 | 核验成果 ZIP 与正式赛事提交要求是否同义。**通过：** 数据包不被误称为完整比赛设计方案 PDF、演示 MP4 或答辩 PPT。 | 当前无签核或决定证据 | 需责任人输入 |
| EXP-10 | P1 | 安全 | NOT_RUN | 本轮未执行 | 归档/演示用 ZIP、截图、报告中涉及学生原始作答与模型调用内容的处理。**通过：** 不意外暴露敏感数据，不将密钥/绝对个人路径写入交付包。 | 无本轮证据 | 待核验 |
| UI-01 | P0 | 浏览器 | PASS | 根目录 npm run test:e2e | 8 个子路由逐页进入、直接刷新、浏览器前进后退、未知 hash 回首页。**通过：** 页面名称、导航高亮、标题和内容一致。 | 新增八路由 E2E，直接 hash/刷新/history/未知 hash，目标标题与导航状态通过；全套 E2E 2 passed | 不包含视觉布局/异常态覆盖，见 UI-03/UI-06 |
| UI-02 | P0 | 浏览器 | NOT_RUN | 本轮未执行 | 全局概览数字均取当前 API，运行改变后重新显示。**通过：** 无静态伪数据，无跨运行残留。 | 无本轮证据 | 待核验 |
| UI-03 | P1 | 视觉 | NOT_RUN | 本轮未执行 | 在 1024、1280、1440、1920 宽度检查所有页面；每个宽度至少截图首页、知识、学情、复核、案例。**通过：** 主要内容可读、无非预期横向滚动、按钮和文本不遮挡。 | 无本轮证据 | 待核验 |
| UI-04 | P1 | 视觉 | NOT_RUN | 本轮未执行 | 检查主导航、顶部栏、面包屑、页面标题、副说明、筛选区、正文对齐和空间占用。**通过：** 重点信息位于首屏，不被过量空白/重复说明挤压。 | 无本轮证据 | 待核验 |
| UI-05 | P1 | 视觉 | NOT_RUN | 本轮未执行 | 核对 `PRODUCT.md`、`DESIGN.md`、`docs/ux/EXPERIENCE.md` 与实际 CSS。**通过：** 一个权威设计基准，颜色和背景、导航样式、卡片层级一致。 | 无本轮证据 | 待核验 |
| UI-06 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 无运行、加载中、导入中、导入失败、API 不可用、辅助接口失败、模型失败、保存失败。**通过：** 用户能理解下一步操作，之前有效编辑不丢。 | 无本轮证据 | 待核验 |
| UI-07 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 全局选中学生/指标/节点跨班级、学生、证据与复核页面的联动。**通过：** 不出现已选学生 A，却展示学生 B 作答。 | 无本轮证据 | 待核验 |
| UI-08 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 逐行证据文本较长、评分步骤多行、指标/题目多、质量异常多。**通过：** 内容可滚动、可定位，行间不重叠，关键操作不被挤出视野。 | 无本轮证据 | 待核验 |
| UI-09 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 导入文件选择器真实可用，能识别六文件、显示缺失及导入反馈。**通过：** 文案与真实“文件夹选取并上传六 CSV 内容到本地后端”行为一致。 | 无本轮证据 | 待核验 |
| UI-10 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 教学复核完成全部操作流程，无强制多次上下滚动找保存按钮。**通过：** 证据区与编辑区各有明确视觉层级，操作可发现。 | 无本轮证据 | 待核验 |
| UI-11 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 案例候选→原始证据→复核→返回案例→确认→导出。**通过：** 不丢必要选择，路径可解释。 | 无本轮证据 | 待核验 |
| UI-12 | P1 | 可访问性 | NOT_RUN | 本轮未执行 | 键盘 Tab、焦点指示、弹窗开关/关闭、Esc、表单 label、ARIA 错误提示、颜色对比。**通过：** 不依赖鼠标或颜色才能完成关键操作。 | 无本轮证据 | 待核验 |
| UI-13 | P1 | 浏览器 | NOT_RUN | 本轮未执行 | 网络慢、连续点击生成、连续点击保存、快速切页。**通过：** 防重复请求，异步状态无覆盖/竞争导致错误提示。 | 无本轮证据 | 待核验 |
| UI-14 | P2 | 维护 | NOT_RUN | 本轮未执行 | `WorkbenchPages.tsx` 与 `style.css` 的拆分设计，只作为独立小改动执行。**通过：** 拆分后交互与 API 行为保持一致，新增回归测试。 | 无本轮证据 | 待核验 |
| UI-15 | P2 | 性能 | NOT_RUN | 本轮未执行 | 真实规模数据下首屏、切页、展开 806 行质量明细、长列表输入的响应。**通过：** 无明显卡死；若发现卡顿，记录可重复的操作与浏览器 Performance 证据。 | 无本轮证据 | 待核验 |
| DB-01 | P0 | 自动 | PASS | `python -m pytest -q`：test_database_has_normalized_run_scoped_rows_and_enforces_foreign_keys；test_alembic_empty_upgrade_repeat_and_consistent_restore | schema/head 一致且 FK 启用 | 121 passed 中相关测试通过；本轮临时库 Alembic b2f4d2a8c1e0、14 表、integrity ok、foreign_key_check=[] | 具体非 SQLite 方言不适用，本项目固定 SQLite |
| DB-02 | P0 | 自动 | NOT_RUN | 本轮未执行 | 分析快照及 run-scoped 关系表一致。**通过：** 同 ID 不同 run 隔离，`current_run` 指向正确成功运行。 | 无本轮证据 | 待核验 |
| DB-03 | P0 | 自动 | NOT_RUN | 本轮未执行 | 重复导入同数据、导入失败回滚、并发运行保存。**通过：** 不覆盖既有不可变快照，失败不切当前运行。 | 无本轮证据 | 待核验 |
| DB-04 | P0 | 自动 | PASS | `python -m pytest -q`：test_alembic_empty_upgrade_repeat_and_consistent_restore；test_backup_restore_cli_wires_database_and_destination_paths | 备份/恢复新目标且检查完整性、run/review 保留 | 快照、current、复核、行数、SHA、schema 与 foreign keys 断言通过 | DB-04范围通过；真实日常库未作为输入 |
| DB-05 | P0 | 自动 | PASS | `python -m pytest -q`：test_json_migration_is_idempotent_lossless_and_restores_current；test_migration_report_survives_failure_and_retry_completes_atomically；test_json_migration_rolls_back_all_runs_on_mid_batch_failure；migration CLI preflight tests | 新库/空旧源/非空批准/冲突/重试安全 | 迁移幂等保真、失败报告、重试原子性、target 不变等断言在 121 passed 中通过；symlink 子项独立 skip | symlink 限制单列；失败报告/重试均有测试 |
| DB-06 | P1 | 自动 | NOT_RUN | 本轮未执行 | 数据库 busy/locked、Review 并发唯一键冲突。**通过：** 返回约定 503/409 或安全业务错误，不暴露 SQL 和堆栈。 | 无本轮证据 | 待核验 |
| API-01 | P0 | 自动 | PASS | `python -m pytest -q`：test_shared_frontend_backend_contract_fixtures；apps/web Vitest contract tests | source-verification/teacher-case 前后端字段共享兼容 | fixture 经 Pydantic 与前端类型校验；Vitest 50 passed/1 skipped | 尚非全路由自动生成 OpenAPI 对比 |
| API-02 | P0 | 自动 | PASS | `python -m pytest -q`：test_health_and_validation_error_contract；test_api_not_found_uses_common_error_contract；test_review_api_rejects_invalid_identity_and_cross_student_evidence | 参数/空白 ID/未知资源返回安全 4xx | 400/404/422、安全 error/code/request_id 且无跨学生写入断言通过 | 枚举和 JSON 错误类型组合并非穷举 |
| API-03 | P1 | 自动 | NOT_RUN | 本轮未执行 | 统一 API 错误，不暴露 Traceback、模型密钥、系统路径和供应方原文。**通过：** 安全错误消息且后端诊断日志具备请求 ID。 | 无本轮证据 | 待核验 |
| API-04 | P1 | 受控测试 | NOT_RUN | 本轮未执行 | 模型 Key 只在后端 `.env` 或环境变量读取；网络调用仅 HTTPS。**通过：** 构建产物、前端请求、截图、日志、ZIP 均无密钥。 | 无本轮证据 | 待核验 |
| API-05 | P1 | 安全 | NOT_RUN | 本轮未执行 | 浏览器导入接口的大文件、伪造超长内容、错误类型/编码。**通过：** 不发生不可控内存占用或长时间阻塞；如果尚无请求大小上限，记录实际风险及修复优先级。 | 无本轮证据 | 待核验 |
| API-06 | P2 | 安全 | NOT_RUN | 本轮未执行 | 文件读取白名单、路径穿越、临时目录清理、日志脱敏、数据保管边界。**通过：** 不意外读取仓库外任意文件、不残留密钥和不必要个人数据。 | 无本轮证据 | 待核验 |
| DOC-01 | P0 | Codex | PASS | 已重建 35 项赛事需求追踪矩阵，逐项含当前代码/测试/人工状态/未满足条件 | 重新构建 35 项赛事需求追踪矩阵（8+14+13），每项关联代码文件、测试、实际结果、人工签核及未满足事项。**通过：** 不照搬 2026-11-17 历史状态。 | 35 项（8+14+13）齐全；保留 BLOCKED/NOT_MET，不代签人工事项 | 最新代码/测试引用已写入阶段报告需求矩阵 |
| DOC-02 | P0 | 负责人 | PASS | 审计报告保留 T03-REQ-010 为 NOT_MET | 保留当前未覆盖需求，如跨分析运行跟踪教学调整；若没有实现，不得改成完成。**通过：** `not_met` 与待建设范围准确。 | 明确 adjustment_condition 只有文本，没有跨运行证据关联 | 建设范围仍需产品/团队决定 |
| DOC-03 | P1 | Codex | NOT_RUN | 本轮未执行 | README 启动命令、浏览器文件夹导入和旧 CLI 绝对路径导入描述一致。**通过：** 新开发者可照文档独立启动并完成一次导入。 | 无本轮证据 | 待核验 |
| DOC-04 | P1 | Codex | NOT_RUN | 本轮未执行 | 修复 `docs/ux/EXPERIENCE.md` 指向缺失的 `前后端与赛题要求映射.md` 链接；核对 `PRODUCT.md` 和 `DESIGN.md` 设计冲突。**通过：** 本地相对链接可用、当前设计标准统一。 | 无本轮证据 | 待核验 |
| DOC-05 | P1 | Codex | NOT_RUN | 本轮未执行 | `capture-shots.py` 的 `D:\工作台\...` 硬编码路径改为可传入参数/项目相对路径，若修改则配相应验证。**通过：** 换一台 Windows 机器也可生成截图。 | 无本轮证据 | 待核验 |
| DOC-06 | P1 | Codex | NOT_RUN | 本轮未执行 | 检查 `.gitignore`，确保 `data/`、真实 CSV/PDF、`.env`、测试截图视频、日志、浏览器凭据、临时数据库不提交。**通过：** `git status` 没有敏感或运行产物。 | 无本轮证据 | 待核验 |
| DOC-07 | P1 | 负责人 | BLOCKED | 需责任人/学科成员人工审核或决定 | main 目前检查到 `protected=false`；决定并设置合适的 PR/审批保护，不要求启用 GitHub Actions。**通过：** 仓库设置截图/保护状态复核。 | 集成 API 403，当前权限无法读取 branch protection | 负责人从 GitHub 设置确认 |
| DOC-08 | P0 | 负责人+团队 | BLOCKED | 需责任人/学科成员人工审核或决定 | 正式比赛交付材料：设计方案 PDF、演示 MP4、答辩 PPT、独立评测数据与官方截止要求逐项确认。**通过：** 按最新官方通知验收，不把 ZIP 当全部交付材料。 | 当前无签核或决定证据 | 需责任人输入 |
| DOC-09 | P1 | 负责人 | BLOCKED | 需责任人/学科成员人工审核或决定 | 最终版本冻结、提交 SHA、测试结果、人工签字与数据保管确认。**通过：** 有可重现的正式验收报告。 | 当前无签核或决定证据 | 需责任人输入 |

## 当前计数
- P0：PASS 24, BLOCKED 2, NOT_RUN 4
- P1：PASS 3, BLOCKED 4, NOT_RUN 25
- P2：NOT_RUN 3

