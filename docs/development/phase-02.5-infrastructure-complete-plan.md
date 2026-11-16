# Phase 02.5：基础设施完整建设计划

> 状态：规划稿，待人工审查。本文只规划后续实施，不代表计划中的建设已经完成。
>
> 审查基准：GitHub `main`，审查时本地 `main` 与 `origin/main` 一致，HEAD 为 `68d307b18098cf45e94688eba0c1c7097b536629`（2026-11-16）。审查只读代码、配置和现有文档；本次未运行测试、未改动应用代码。

## 1. 结论摘要

仓库已不是空架构：当前有五类 Python 模块边界、框架独立的 dataclass Domain、SQLite/SQLAlchemy/Alembic、若干 Repository、FastAPI/Pydantic API、集中式 React API Client、DeepSeek HTTP 适配器、JSON 迁移命令和跨层测试。但有些边界只在目录或文档中成立，尚未成为一致的调用方式。

Phase 02.5 应以**渐进式模块化单体整理**为原则，保留当前统计流程、API、CSV/JSON 字段和快照兼容契约。最主要的准入阻塞项为：

1. JSON 迁移的输入发现、预检覆盖范围、数据库目标一致性和中途失败恢复须先变得可审计、可验证。
2. 多 Repository 工作流需要由应用用例持有事务边界；现有 Repository 各自开 Session/提交，应用层目前无法可靠地把多次写入作为一个事务。
3. 逐步建立 Domain 对象与快照/API/ORM 的明确映射，避免 Domain 只被少数服务使用而数据库投影仍以原始 dict/JSON 为实际接口。
4. 把 SQLite/Alembic 从头初始化、升级、约束、隔离、回滚等行为纳入可重复的本地测试；现有测试仍以业务流程和 `create_all` 为主。
5. 进入三个 TASK 前建立最小可用的 CSV/PDF 文件读取边界与配置/启动规则。只有真实业务需要时才增加原子写入、删除或持久化文件元数据；不要提前建设通用文件平台、Agent、重试框架或复杂状态管理。

建议不一次性拆掉 `Store`、顶层兼容服务和 `snapshot_json`。先让新旧调用经由 Application/Repository 接口共存，待调用点和回归覆盖证明迁移安全后，再决定是否移除兼容入口。

## 2. 当前代码基线与文件树

### 2.1 当前主要代码树

```text
apps/
├─ backend/
│  ├─ alembic/
│  │  ├─ env.py
│  │  └─ versions/da812b1d5423_create_domain_database.py
│  ├─ app/
│  │  ├─ api/{app.py,dependencies.py,server.py}
│  │  │  └─ routes/{analysis,exports,health,imports,recommendations,reviews}.py
│  │  ├─ core/logging.py
│  │  ├─ domain/
│  │  │  ├─ assessment/{analysis_run.py,models.py}
│  │  │  ├─ common/{enums.py,exceptions.py}
│  │  │  ├─ student/models.py
│  │  │  ├─ subject/models.py
│  │  │  ├─ teaching/models.py
│  │  │  └─ __init__.py
│  │  ├─ infrastructure/
│  │  │  ├─ database/{base.py,engine.py,models.py,session.py}
│  │  │  ├─ ingestion/csv_reader.py
│  │  │  ├─ llm/deepseek_client.py
│  │  │  └─ migration/json_to_sqlite.py
│  │  ├─ repositories/{analysis_run_repository.py,protocols.py,response_repository.py,review_repository.py,store.py,student_repository.py,subject_repository.py}
│  │  ├─ schemas/{api.py,http.py,review.py}
│  │  ├─ services/
│  │  │  ├─ shared/export_service.py
│  │  │  ├─ task01/{source_index_service.py,source_service.py}
│  │  │  ├─ task02/{analysis_service.py,case_service.py,import_service.py,metrics_service.py,quality_service.py,revision_service.py}
│  │  │  ├─ task03/{recommendation_service.py,review_service.py}
│  │  │  └─ {analysis.py,cases.py,exports.py,recommendations.py}
│  │  ├─ {cli.py,config.py,main.py}
│  └─ tests/{test_core.py,test_phase02.py,test_server.py}
└─ web/
   ├─ index.html / package.json / package-lock.json / tsconfig.json / vite.config.ts
   └─ src/
      ├─ api/{client.ts,client.test.ts,types.ts}
      │  └─ types/{analysis.ts,common.ts,review.ts,subject.ts,teaching.ts}
      ├─ app/{App.tsx,main.tsx}
      │  └─ hooks/useWorkbench.ts
      ├─ components/{MetricBar.tsx,Panel.tsx}
      └─ features/
         ├─ export/ExportPanel.tsx
         ├─ import/{ImportPanel.tsx,ImportPanel.test.tsx}
         ├─ task01/components/ObjectivesPanel.tsx
         ├─ task02/components/{ClassPanel.tsx,EvidencePanel.tsx,QualityPanel.tsx,StudentPanel.tsx}
         └─ task03/components/{ReviewPanel.tsx,ReviewPanel.test.tsx}
docs/
├─ architecture/                 # 系统、模块、契约、流程、Domain、DB、迁移
├─ decisions/                    # ADR-0001、ADR-0002
└─ development/                  # Phase 01/02 报告与本计划
resources/source_checks.json
AGENTS.md / README.md / pyproject.toml / .env.example
```

仓库其余架构/运行基线文件：`AGENTS.md`、`README.md`、`.env.example`、`pyproject.toml`、`resources/source_checks.json`；架构文档为 `docs/architecture/00-system-overview.md` 至 `07-json-migration-plan.md`，决策记录为 `docs/decisions/ADR-0001-foundation-architecture.md`、`ADR-0002-domain-sqlite-local-workflow.md`，已有 Phase 01/02 规划和实施报告位于 `docs/development/`。`_bmad/` 与 `.agents/skills/` 是仓库已有的 BMad v6.12.4 规划运行时，不属于应用运行时架构。

### 2.2 分层模块的实际职责

| 层/目录 | 当前实际内容 | 当前状态 |
|---|---|---|
| API：`app/api/` | FastAPI 工厂、request ID、中间件、错误处理、路由、`Store`/Settings 注入 | **已存在，需完善**。路由很薄，但多处直接组合 Service 函数与 Store；依赖注入的主要对象仍是兼容门面。 |
| Application：无独立目录 | `ImportService`、`ReviewService` 承担少量用例；`Store` 负责构造和兼容转发 | **需要建设**。两种职责混在 Service 与 Store；还没有统一 Use Case 接口或 Unit of Work。 |
| Domain：`app/domain/` | 独立 dataclass、枚举、异常；有学生、班级、目标、材料、节点、作答、指标、运行、证据、诊断、建议草稿和教师复核 | **基础已完成，需统一**。与 FastAPI/Pydantic/ORM 无直接依赖；部分字段用自由字符串、校验标准不一致，主要业务仍使用 dict。 |
| Repository：`app/repositories/`（现状） | AnalysisRun、Review、Student、Subject、Response 实现；`protocols.py` 声明 Protocol | **基础已完成，需重构边界**。架构上 Protocol 应归属 Application Ports，SQLAlchemy Repository 属于 Infrastructure Adapter。现目录可以保留为过渡位置，不要求为满足分层图而整体搬文件；逐个在实际改动时明确“端口定义”与“适配器实现”，避免新协议继续放在实现目录。多个实现内部各自建 Session/事务；快照 Repository 同时负责投影写入。 |
| Infrastructure：`app/infrastructure/` | SQLite 引擎/Session/ORM、Alembic、CSV 读取、DeepSeek HTTP、JSON 导入 | **已存在，需补强**。缺通用 FileStorage；迁移预检与批次恢复有缺口；Session 生命周期和应用生命周期未统一管理。 |
| Services：`app/services/` | TASK01 来源服务；TASK02 CSV 导入、统计、质量、修订；TASK03 建议、复核；共享导出 | **业务实现已存在**。需要区分纯业务 Domain Service、应用用例和外部端口适配，不能借机改统计逻辑。 |
| Schemas：`app/schemas/` | Pydantic HTTP 请求/响应；另有未见路由引用的 `schemas/api.py` TypedDict | **已存在，需清理/定界**。`api.py` 与 `http.py` 定义相似契约的可能性需逐项查引用后处理。 |
| 前端：`apps/web/src/` | `api/client.ts` 集中 fetch 与错误处理；API 类型按 common/analysis/subject/teaching/review 拆分 | **基础已完成，建议完善**。目前检索到的 `fetch` 只在 client；无统一可辨识错误类型、取消/超时约定或类型契约生成。 |

### 2.3 已完成、需完善、未建设

**已完成（代码中可见）**

- Python 3.12+、FastAPI、SQLAlchemy 2.x、Alembic、SQLite；React 19、TypeScript、Vite。
- sqlite Engine 打开外键约束并设置 5 秒 busy timeout；测试可用内存 SQLite。
- ORM 与 Alembic 初始迁移包含 analysis_runs、classes、students、learning_objectives、learning_items、learning_item_objectives、assessment_nodes、response_events、responses、teacher_reviews、app_state。
- Domain 使用标准库 dataclass、Enum 和自定义领域异常；未导入 API、Pydantic、SQLAlchemy。
- Review 追加历史、快照不可静默覆盖、run scoped 复合键和有效引用关系已有实现。
- API 有 request ID、安全的通用异常响应及 `/api/health`；默认 host 为 `127.0.0.1`。
- 前端请求集中在 `api/client.ts`；已有后端 pytest 与前端 Vitest 测试。
- DeepSeek 请求有超时、结构化 JSON 模式与证据 ID 校验；现有测试使用 Mock，不调用真实 API。
- README 提供 PowerShell 安装、启动、迁移及本地验证命令；项目明确不使用 GitHub Actions。

**需要完善（已有代码不应按“未实现”重做）**

- Application 用例和事务/UoW；Repository Protocol 与实现签名；Domain 与现有 dict/ORM/schema 的映射规范。
- Alembic 空库启动和升级测试；Repository 外键、唯一约束、隔离、回滚及 Review 历史关系验证。
- JSON 迁移的全目录发现、完整 schema/引用预检、自动备份目录策略、数据库目标绑定、迁移报告、批次故障恢复。
- SQLite 备份/恢复命令、路径解析规则及 PowerShell 参数组合的端到端验收。
- API 错误类型和依赖的统一注入；保持现有路径、响应字段兼容。
- AI 提供方/提示/结果职责分离，补充各类失败 Mock；当前只有 DeepSeek 单提供方适配器。
- 当前使用场景的统一文件读写/元数据边界；不扩建无业务需求的上传平台。
- 测试结构、前端接口类型一致性、文档与实现一致性。

**尚未建设（本阶段只建设明确需要的最小项）**

- `application/` 用例层、共享 Unit of Work、可注入 Repository Protocol。
- 轻量本地 FileStorage port/adapter，优先覆盖现有 CSV/PDF 读取；原子写入、删除、hash 只在当前实际流程需要时加入；不含文件元数据数据库表。
- 有完整验证与恢复报告的 SQLite/JSON 运维入口。
- 面向新 TASK 功能的统一 Application/API 测试夹具和集成测试规范。

### 2.4 现有结构问题与证据

1. **Application 边界缺失**：路由 `analysis.py`、`recommendations.py`、`exports.py` 直接编排 `store.current()` 与 `draft/suggest_cases/package/deepseek_draft`；`Store` 再直接持有服务和 Repository。`ImportService`、`ReviewService` 类型标注为具体 SQLAlchemy Repository。
2. **事务粒度过小**：Repository 方法内部新建 Session；Review 用例先读取 run、验证证据、查询历史，再调用 `append()` 独立事务。新用例如需跨多个 Repository 写入，无法由上层统一回滚；并发下业务校验与追加也非同一 UoW。
3. **Repository 双重模型**：`AnalysisRunRepository.save_snapshot()` 一次事务保存不可变完整 JSON 快照并写规范化投影。除 Review 外多个 Domain Repository 当前提供读写能力，但主要 TASK 业务仍读写 dict 快照。需规定双表示的权威关系，不能在这一阶段贸然删快照。
4. **Protocol 不完整**：`repositories/protocols.py` 只描述一部分读写方法；Review `append/import_history`、Student/Subject/Response `save`、AnalysisRun 的快照/current 方法未形成完整一致契约。当前 Services 按具体类注入。
5. **Domain 规范尚未统一**：枚举与常量存在，但 `RecommendationDraft.status` 是字符串，模型校验程度不一；浮点非有限值、空白标识、日期格式等统一策略未定义。`ResponseRepository` 对来源文件名采用硬编码，实体映射在各 Repository 手写。
6. **迁移发现可能静默漏数据**：`json_to_sqlite.discover()` 对目录名不合法或没有 `analysis.json` 的目录直接 `continue`，而非生成发现清单或拒绝不明数据。迁移前主要验证快照 run_id、复核连续版本/学生目标/证据；快照整体字段结构与全部引用并未统一校验。
7. **迁移不是全批次原子事务**：每个快照、每组 review 独立提交；失败会留下部分已迁入数据。幂等重跑能帮助续跑，但未先建立计划清单/明确状态，失败数据库如何标记、清理或恢复没有操作协议。
8. **CLI 路径可能错配**：`--data-dir` 默认 settings，但 `--database-url` 在参数解析时已默认成 `settings.database_url`；用户只指定另一个 `--data-dir` 时，旧数据路径会变但默认 SQLite URL 不一定随之改变。迁移备份目录也基于 `data_dir.parent.parent/_backups` 推导，应改为明确且可审计的目标策略。
9. **DB 验收主要使用 `create_all`**：测试的 `ready_store()` 直接 `Base.metadata.create_all`；当前虽有 Alembic migration，却未见从空 DB 执行 `upgrade head`、重复升级或 Alembic 元数据差异的测试。
10. **文件/运行生命周期分散**：CSV 通过路径导入；来源 PDF 由 `SourceService` 定位/读取；ZIP 即时内存生成；上传文件持久存储、原始文件资产表、通用删除/备份尚未形成当前实现。应用没有 lifespan 统一 dispose Engine；Session 由 Repository 各自管理。
11. **配置初始化时机**：`Settings` 在模块导入时从环境变量创建全局实例，Path 相对路径依赖进程 CWD；README 中 `.env.example` 也明确程序不自动加载 `.env`。需将配置校验和路径解析收口，但不必引入大型配置框架。
12. **文档存在漂移**：`docs/architecture/07-json-migration-plan.md` 声称发现过程不静默跳过且迁移有相应完整安全保证；当前代码会跳过上述目录类型。Phase 02.5 实施后必须按代码更新文档，不得把文档表述当作已实现证据。

## 3. 目标架构与依赖规则

### 3.1 目标结构（增量建设）

```text
contracts/api/ [pytest 与 Vitest 共用的请求/响应 JSON fixtures]
apps/backend/app/
├─ api/                         # FastAPI 路由、HTTP schema、依赖装配
├─ application/                 # 用例编排与 ports
│  ├─ ports/                    # Repository Protocol、UoW、FileStorage、LLM Protocol
│  └─ use_cases/                # 仅真实 import/read/review/export 用例
├─ domain/                      # 纯 Python 领域对象、规则、异常
├─ infrastructure/             # SQLAlchemy、CSV/PDF FileStorage adapter、DeepSeek adapter、迁移
│  ├─ database/                 # Engine、Session factory、ORM、SQLAlchemy UoW
│  ├─ adapters/repositories/    # 仅逐个移动确有收益时创建，不是本阶段要求
│  ├─ files/                    # 仅当前用例需要的文件读取 adapter
│  ├─ llm/                      # 唯一 DeepSeek adapter
│  └─ migration/                # 显式迁移与报告
├─ repositories/                # 现有 SQLAlchemy Adapter 的兼容物理目录；可持续保留
├─ schemas/                     # HTTP contract；逐步清理重复定义
├─ services/                    # 现有纯业务 TASK 算法；只拆有实际价值的职责
└─ core/                         # 日志、请求上下文等横切能力
```

**Repository 归属是逻辑边界，不是强制搬文件要求**：Repository Protocol 定义在 `app/application/ports/repositories.py`（及按实际需要的同目录窄 Protocol 文件）；SQLAlchemy Repository 具体实现是 Infrastructure Adapter。现有 `app/repositories/*.py` 可以继续存放这些实现，也可长期保留；只有逐个移动有真实收益时才迁至 `app/infrastructure/adapters/repositories/`，不为追求目录美观做大规模迁移。旧 `app/repositories/protocols.py` 在新端口被调用且全仓引用迁移后才移除或改成兼容 re-export。

**依赖方向**：`api → application → domain`；Application 依赖 Domain 与 Application Ports（Protocol），不能反向导入适配器；`infrastructure` 实现 Ports，Repository Adapter 依赖 SQLAlchemy/Domain；装配根（FastAPI factory/CLI）同时构建 SQLAlchemy UoW、Repository 实现、FileStorage/LLM adapter 并注入 Application。`domain` 不依赖其他层。TASK01 可作为公共课程/来源能力；TASK02 使用 TASK01 的课程目标；TASK03 使用 TASK01/02 的输出。禁止 TASK 之间循环依赖。

### 3.2 模块职责与数据传递

| 边界 | 允许依赖 | 禁止依赖/操作 | 传递对象 |
|---|---|---|---|
| API | HTTP schema、Application Use Case 接口、FastAPI DI | SQL/Session/ORM、路径读写、统计或教学规则、直接请求 LLM | 请求/响应 Schema；由 Mapper/Use Case 转换 Domain |
| Application | Domain、Application Ports（Repository/UoW/FileStorage/LLM Protocol）、现有纯业务算法 | FastAPI、SQLAlchemy、HTTP request/response、具体 ORM Repository/adapter | 用例输入/输出 DTO 和 Domain 对象；不把 ORM 行向上泄露 |
| Domain | 标准库及同层 Domain | Pydantic、FastAPI、SQLAlchemy、文件/网络/环境变量 | 不可变实体/值对象/枚举/领域异常 |
| Application Ports | Domain 类型及应用查询参数；Repository Protocol 位于此层 | ORM 具体类型、SQLAlchemy Session 和 HTTP schema | 聚合/领域对象、明确的查询参数和分页结果（实际需要时） |
| Infrastructure Repository Adapter | Domain、ORM、SQLAlchemy UoW session；实现 Application Repository Protocol | 业务规则/HTTP/统计口径 | 显式 mapper 转 Domain；写入遵从调用者 UoW |
| Infrastructure adapters | 外部库、配置、Application ports 的实现 | 业务流程决策 | CSV/文件/DB/LLM 端口实现及安全错误类别 |
| TASK services | 纯 Python 算法、Domain/DTO | HTTP、SQLAlchemy、Repository 实现细节 | 保持当前统计输出契约；按新用例逐步输入更窄 DTO |

### 3.3 是否需要 Application / Use Cases

**需要，但只建薄用例层，不迁移或重写所有 Service。** 证据是当前路由与 Store 承担跨能力组合，而 Review 已有跨 Repository 验证/追加流程。先为 HTTP 实际调用且有边界价值的操作建立用例：导入数据、读取当前运行/案例/建议、保存复核、导出成果包、读取来源文件。统计算法、质量规则、修订选版继续留在 `services/task02/`；规则/LLM 草稿逻辑继续由 TASK03 服务承担，用例负责调用并校验输入输出。

不要同时创建一个 `ApplicationService` 总入口、每个方法一个空的 UseCase、Domain Service、Command Bus 等重复抽象。每个用例必须对应一个现有或即将实施的实际调用流程。

### 3.4 Repository 与事务类型的归属

- Application Ports 声明 Repository Protocol 与 `UnitOfWork` Protocol；Protocol 参数/返回值不得暴露 `Session`、ORM 行或 SQLAlchemy 类型。
- Infrastructure Database 提供 `SessionFactory` 和 SQLAlchemy `UnitOfWork` adapter；Infrastructure Repository Adapter 实现 Application Repository Protocol。
- Application 的 `UnitOfWork` Protocol 暴露所需 Repository Protocol 属性/访问器（如 `uow.reviews`），不暴露原生 Session；SQLAlchemy UoW adapter 内部持有一个 Session，并将使用该 Session 的 Repository adapter 绑定到这些访问器。
- UoW 只拥有事务创建、提交、回滚和关闭；Repository adapter 不自行 commit。读操作可在同一 UoW session 中完成，以便读后写验证一致。
- 迁移用例依赖 Ports/UoW，不直接依赖 SQLAlchemy Repository 实现；CLI 作为装配根注入实现。这样依赖始终从外向内指向 Protocol，不存在 Database → Repository → Application → Database 的反向环。

## 4. 按优先级划分的建设范围

### 4.1 必须完成（进入 TASK 01/02/03 前）

1. **建立薄 Application 用例与统一事务所有权**：先改 Review 与会写多 Repository 的真实流程；现有只读/纯计算流程可后迁。
2. **统一 Repository Ports 与 SQLAlchemy 事务会话及并发策略**：Protocol 属于 Application Ports；SQLAlchemy 实现属于 Infrastructure Adapter。调用者 UoW 开始/提交/回滚；Review 在同一写事务内读最新版本并追加；唯一键兜底并发冲突；Repository 不自行 commit。
3. **巩固 Domain 基本规范与边界映射**：枚举/异常/ID/数值验证约定、Pydantic/ORM mapper 放置规则、Domain 独立单测；不补齐未来业务规则。
4. **明确 JSON/SQLite/备份三类路径，修复迁移漏检、目标错配、已有 DB 保护和失败恢复**：变更 `data-dir` 不得隐式改变 SQLite 目标；对非空目标 DB 默认拒绝写入。
5. **以 Alembic 为正式 schema 唯一入口并做空库/重复升级/关键约束测试**；`create_all` 仅保留测试便利，不代表真实部署初始化。
6. **建立最小 FileStorage port/adapter**：优先满足 CSV/PDF 安全读取；原子写入、删除和哈希只按真实业务需要实现；ZIP 可继续内存生成；无业务需求不建文件资产表。
7. **保持并明确 API contract 与错误 envelope**：路由只适配 HTTP；当前路径/字段不变；前后端共享契约样例并增加一致性测试，覆盖 JSON 与二进制下载。
8. **建立轻量 LLM Port 并接入 DeepSeek Adapter**：不新增 Provider Registry、多模型调度或复杂重试。
9. **配置、Engine 生命周期、CLI 参数和 PowerShell 文档收口**：消除相对路径/CWD及 source/database 目标混淆；显式 upgrade/backup/restore；默认 loopback 不变。
10. **增加针对以上基础设施的本地回归测试并更新架构/操作文档与 AGENTS.md**：统计结果、事件版本选择、证据行号、Review 追加历史、ZIP 内容与 API 契约保持；Codex 实施约束清楚可执行。

### 4.2 建议完成（可以与 TASK 开发并行的小步整理）

- 把前端 `api/client.ts` 的错误从原生 `Error` 收敛成含 `code/status/requestId` 的类型；把请求取消、加载、重试留给真正需要的 feature。
- 维护前后端契约对照检查；只有当 Pydantic/OpenAPI 已稳定且生成方式轻量时再评估自动生成 TypeScript 类型。当前无需立即增加代码生成工具链。
- 将 Task01/02/03 HTTP 调用逐个改为 Application Use Case；保持兼容 Store facade 作为过渡，确认零调用后再移除。
- 增加超出最小 LLM Adapter 的调用追踪/Prompt 版本管理前，先由真实审计需求证明必要性；基础 Mock 故障与隐私测试仍是任务 H 的必做内容。
- 增加可选的覆盖率报告（如本地 pytest-cov），先设观测基线，不以统一百分比取代关键行为验收。
- 增加超出第 6.4 节必需演练的自动化报告增强；核心一致性备份/恢复演练本身属于必做项。
- 将可重复的测试夹具按 Domain/Repository/Application/API/Infrastructure 分目录；仅在规模增长导致定位困难时执行。

### 4.3 当前不需要

- PostgreSQL、Redis、Celery、消息队列、微服务、Kubernetes、账户/多用户或远程部署。
- 多 Agent、复杂工作流、AI 自动决策/统计、AI 自主数据库操作、未经证据集校验的模型输出。
- 大规模重写 TASK 01/02/03、重算历史统计或改评分口径、改正式 ID/CSV 字段、删除证据和教师复核历史。
- 为尚未存在的文件资产生命周期增加宽泛表结构、云对象存储适配器或大型文件管理平台；也不把大型源文件放入 SQLite。
- 在没有多条件查询/大列表之前引入通用分页排序框架、Query DSL、Specification、CQRS、通用 CRUD Repository。
- 引入复杂状态管理；目前 React 网络入口已集中，继续按 feature 所需补足即可。
- 对 DeepSeek 增加激进自动重试。若未来要重试，只对明确可重放请求、429/暂时性网络失败做有界退避，并通过成本/幂等评估。
- 删除 JSON 快照或迁移兼容入口；在快照兼容期与外部调用者未排除前不移除。

## 5. 详细实施任务

文件列表是按当前 main 初步定位的工作范围；实施前再次核对引用与 Git 状态。`删除`栏的“无”表示不计划立即删除现有业务代码。

### 任务 A：Application 用例、Repository ports 与 Unit of Work（必须）

- **为什么/解决什么**：Review 的验证与追加、导入的持久化与 current pointer 等属于一个业务流程，但目前路由、Store、Service、Repository 分散编排，Repository 自行持有事务。保证业务异常可回滚并让 TASK 共用持久化能力。
- **当前状态**：部分 `ImportService`/`ReviewService` 和 Repository Protocol 已存在；没有独立 application 目录/UoW；Protocol 有缺口，服务按具体 Repository 类型注入。
- **修改文件**：`app/api/routes/*.py`、`app/api/dependencies.py`、`app/api/app.py`、`app/repositories/store.py`、`app/repositories/protocols.py`、现有 `app/services/task02/import_service.py` 与 `task03/review_service.py`、各 Repository、`infrastructure/database/session.py`。
- **新增文件**：只在真实流程开始迁移时创建 `application/use_cases/<use_case>.py`。Repository Protocol/UoW Protocol 由任务 C 定义；FileStorage/LLM Protocol 分别由任务 F/H 创建。不得预建只有 `__init__.py` 的空模块。
- **交互方式**：API → 注入用例 → 调用业务服务及 Application Repository ports → SQLAlchemy UoW adapter 实现事务；Use Case 返回 DTO/Domain，再由 API schema 映射。先保留 Store 转发层，确保旧调用不断。
- **实施步骤**：①列出每条路由调用图及写操作；②使用任务 C 定义的 Protocol/UoW Protocol；③使用任务 D 提供的 SessionFactory/UoW adapter；④Repository adapter 改为绑定 UoW 内部 session 并去除内部 `commit()`；⑤先迁 Review，使读取、证据验证、版本分配和追加在一个 `BEGIN IMMEDIATE` 写事务中；⑥迁移确有跨仓事务的流程；⑦路由逐项只调用 Use Case；⑧确认兼容门面调用点后再决定是否移除。
- **前置依赖**：任务 D（Engine/SessionFactory）、任务 C（Application Ports 与 Infrastructure 实现）、任务 B（所需 Domain contract）；用例依赖 Protocol，不依赖具体 adapter。
- **测试**：Application 用例以 fake Repository/UoW 测成功/业务失败/异常回滚；集成测试确认一个 UoW 多次写同成败；Review 使用 SQLite 写锁与唯一约束的并发测试按 6.3 节执行；API 端到端保持响应。
- **验收**：新路由不依赖具体 SQLAlchemy Repository/Session；Service 不直接执行 SQL；同一用例内多仓储写入同一事务、抛错回滚；当前 Store 可移除前有零调用证据；旧 API 与统计结果一致。
- **删除**：首轮不删除 `Store` 或顶层兼容导出。

### 任务 B：Domain 规范、Mapping 与独立测试（必须）

- **为什么/解决什么**：Domain 当前符合无框架依赖要求，但模型规则和值类型标准不统一，映射散落 Repository，Domain 的真实使用范围偏窄。
- **当前状态**：主要实体类已存在且有若干校验；`ReviewStatus`/`ScoringStatus` 已定义；`RecommendationDraft.status` 等仍为自由字符串。
- **修改文件**：`app/domain/common/enums.py`、`exceptions.py`、`domain/{student,subject,assessment,teaching}/models.py`、`repositories/{student,subject,response,review,analysis_run}_repository.py`、`tests/test_phase02.py`。
- **新增文件**：仅当转换逻辑重复时新增 `app/mappers/` 或分别在 Repository adapter 内建 mapper；新增领域测试按模型拆分。避免为每个 dataclass 创建空 mapper 文件。
- **交互方式**：API Pydantic schema ↔ application DTO ↔ Domain；Domain ↔ ORM 映射仅在 adapter/mapper；不让 Pydantic/ORM 类型穿透 Domain。
- **实施步骤**：①盘点用户请求所列模型及真实字段来源；②统一标识符空白、数值有限性、枚举状态和领域异常政策；③决定实体和值对象区分，只有有独立校验/语义才建值对象；④明确 AnalysisRun/ResponseRevision/TeacherReview 的状态及不变量；⑤将转换收敛到固定边界；⑥每条 Domain 规则用纯单元测试覆盖；⑦暂时允许遗留 dict 服务，不扩大改动。
- **前置依赖**：Application DTO 与当前数据映射方案确认；不得改变历史 CSV 字段或统计口径。
- **测试**：合法/非法边界、NaN/Infinity、状态转换、修订并列与身份冲突、复核连续版本、Evidence 源行、Domain 导入依赖检查。
- **验收**：Domain 无 FastAPI/Pydantic/SQLAlchemy/IO imports；所有已声明不变量有 Domain 单测；mapper 可往返保留需要兼容的字段；现有业务回归输出不变。
- **删除**：不删除仍承载实际校验的现有类；发现重复字段或废弃类型时列明调用点后再单独清理。

### 任务 C：Repository 契约与 SQLAlchemy 实现（必须）

- **为什么/解决什么**：使 TASK 用例依赖稳定抽象，保证 run scope、一致映射和一致事务；消除 Protocol 与具体类/API dict 脱节。
- **当前状态**：五个 Repository 实现已存在；`protocols.py` 只覆盖部分方法；AnalysisRunRepository 同时写完整快照与实体投影。
- **修改文件**：将 `app/repositories/protocols.py` 的协议定义逐步收敛至 `app/application/ports/repositories.py`；具体实现可继续留在 `app/repositories/*.py` 作为过渡，未来逐个触及时再移至 `app/infrastructure/adapters/repositories/`。同时修改 Store/Database 的装配与事务使用。
- **新增文件**：真实端口明确后创建 `application/ports/repositories.py`、`unit_of_work.py`；只在有实际聚合查询/写入时创建窄 Adapter。无需按表建空目录或通用 CRUD 层。
- **交互方式**：Application 只引用 `application.ports` Protocol；Infrastructure Repository Adapter（包括过渡期位于 `app/repositories/` 的实现）实现 Protocol，通过 UoW session 读写，返回 Domain/应用查询结果，不返回 ORM。
- **实施步骤**：①按用例列查询与写操作，不按表机械造 Repository；②Protocol 覆盖真实用法并与实现签名一致；③统一 `(run_id, id)` 作用域；④定义 `snapshot_json` 与规范化投影的权威/读取用途；⑤保留无效源行快照、不强行写非法外键的既有规则；⑥Repository adapter 不提交事务；⑦仅在修改文件时按需渐进迁移目录；⑧增加 SQLite 集成测试。
- **前置依赖**：任务 D-1 的 SessionFactory 和任务 B 的 Domain contract；阶段 2 先定义 Ports，阶段 3 再将 SQLAlchemy Adapter 接入 UoW。Ports 必须先于 Application Use Case 使用。快照继续作为兼容/恢复载体，未经独立迁移不得删表/改结构。
- **测试**：重复 ID 在不同 run 隔离、find/update、无效源行保留、事务 rollback、Review 历史顺序/唯一性、关系 mapper 往返；跨模块契约测试确认 Application 仅依赖 ports，adapter 符合 Protocol。
- **验收**：三个 TASK 后续均通过 ports 访问数据库；API/Application 不含 ORM 查询；Repository 无业务统计且不独立 commit。
- **删除**：不得删除 `snapshot_json`、旧 JSON 兼容行为或任何历史复核。

### 任务 D：SQLite、Alembic、连接生命周期与数据库运维（必须）

- **为什么/解决什么**：确保新环境可从空库升级，约束真实生效，Windows 路径正确，失败能恢复；当前测试常用 `create_all`，尚未覆盖 Alembic 主路径。
- **当前状态**：Engine/Database/ORM/Alembic 初始 migration 已有；SQLite PRAGMA 与回滚通过 Session context 基本成立；暂无正式 backup/restore 命令，也没有统一 SessionFactory/UoW 所有权。
- **修改文件**：`infrastructure/database/{engine,session,base,models}.py`、`alembic/{env.py,versions/*}`、`alembic.ini`、`app/config.py`、`app/api/app.py`、`app/main.py`、`app/cli.py`、`pyproject.toml`。
- **新增文件**：随真实 schema 变更新增 Alembic revision；最小 DB backup/restore CLI 子命令或专用模块；SQLAlchemy UoW adapter 与测试 fixtures。
- **交互方式**：D-1 配置解析 → Engine/SessionFactory → Alembic/backup；D-2 接入 Application UoW Protocol → SQLAlchemy UoW adapter → Repository Adapter。启动仍不隐式升级 schema。
- **实施步骤**：D-1：①明确 Engine/SessionFactory 只负责连接和 Session 生命周期；②明定 SQLite URL/path 解析；③确认 Alembic metadata import 收齐 ORM；④新增临时文件 DB `upgrade head` 测试并验证重复升级；⑤检查 ORM 与 Alembic schema 差异；⑥补真实需要的复合外键/唯一约束/索引；⑦完成基础一致性备份/恢复能力。D-2：⑧任务 C 定义 UoW Protocol 后，实现 SQLAlchemy adapter，短事务结束后提交/回滚并关闭 Session；⑨App lifespan dispose Engine；⑩按 6.4 节执行恢复演练；⑪不因没有测量依据贸然启用 WAL。
- **前置依赖**：任务 I-0 的路径/config 约定；任务 C-1 定义 UoW Protocol 后才能开始 D-2。任务 E JSON 迁移必须等 D-1/D-2 的 SessionFactory、UoW adapter、数据库备份方式和目标路径规则完成。
- **测试**：空数据库 `upgrade head`、重复 upgrade、外键 pragma、非法 FK/唯一值拒绝、跨 run 隔离、Review 追加历史、rollback；运行中经 SQLite backup API（或停库后复制）备份，再恢复到新路径核对 schema、记录数及关键内容/hash。
- **验收**：干净目录按 README PowerShell 命令可建库运行；Alembic 是应用 schema 唯一正式入口；应用启动不 create/upgrade；备份/恢复已按 6.4 节在临时数据目录演练并记录。
- **删除**：不删历史 migration；已发布 migration 只追加修正 migration，不改写历史 revision。

### 任务 E：JSON→SQLite 安全迁移（必须，优先实施）

- **为什么/解决什么**：历史运行/复核是后续回归和升级的业务数据；避免目录被忽略、迁错 DB、半迁入或报表说成功但表记录不完整。
- **当前状态**：已有备份 SHA256、部分引用检查、run 幂等与 review 版本核对、current pointer 恢复；但发现器跳过不匹配目录/缺失快照；批次写入分多笔事务；`--data-dir`/默认 DB URL 可不一致。
- **修改文件**：`infrastructure/migration/json_to_sqlite.py`、`app/cli.py`、`app/config.py`、相关 tests、`README.md`、`docs/architecture/07-json-migration-plan.md`、`AGENTS.md`（仅当命令政策变更）。
- **新增文件**：迁移扫描/预检结果与报告模块（仅当能清晰呈现计划/结果时新增）；独立 migration test fixtures。无需第二套 CLI。
- **路径规范**：JSON 来源目录由 `--data-dir` 指定，默认 `<project-root>/data`，可由 `SMART_LEARNING_DATA_DIR` 单独配置。SQLite 目标由 `--database-url` 指定；未指定时取独立的 `SMART_LEARNING_DATABASE_URL`，若未设置则固定为 `<project-root>/data/smart_learning.db`。**来源目录绝不用于推导或改写 SQLite 目标**，所以更改命令行 `--data-dir` 不会改变数据库位置。备份目录由 `--backup-dir`/`SMART_LEARNING_BACKUP_DIR` 指定；未设置时固定在 `<project-root-parent>/_backups/smart-learning/<timestamp>/`，并打印最终绝对路径；不得从 source/database 的父目录猜测。三条路径规范化后打印并验证：source 不能等于 DB 文件，默认 DB 可位于固定 data 根目录但扫描器只识别合法 run 目录/指定 JSON 文件；backup 必须在 source 和 DB 所在目录之外。JSON source、SQLite DB 与 backup 的角色/路径分别写入报告。
- **目标数据库保护**：迁移前读取目标 DB 状态、SQLite 文件是否存在、Alembic revision、表集合和关键表记录数。目标 DB 文件已存在时，即使为空也必须通过显式确认参数才可初始化/写入；已有 schema 或业务记录的 DB 默认拒绝，不覆盖、不删除、不自动清空。若确需在兼容的非空 DB 中续迁，必须使用单独的显式 opt-in 参数、先经一致性备份，并通过 run ID/Review 冲突预检；发生冲突就停止，不覆盖既有内容。默认建议选择一个从未存在的新 DB 文件路径。
- **交互方式**：CLI 解析 source/DB/backup 三个独立目标 → 全量扫描与预检 → 检查目标 DB 是否为空/兼容 → 经确认后创建经验证备份 → Alembic upgrade → 经 UoW/迁移事务导入 → 记录核验 → 明确报告；原 JSON 保留只读。
- **实施步骤**：①扫描所有疑似历史目录并输出纳入/排除清单；合法历史 run ID 目录缺失 `analysis.json` 或 ID 错配时默认失败；②校验 current pointer、JSON 根类型/必需字段/行数组/ID 唯一性/复核结构与关系；③分别解析并显示三个绝对路径，保证修改 data-dir 不影响 DB target；④预检目标 DB 存在状态、schema、revision 和数据，非空默认拒绝且从不覆盖；⑤从扫描结果产生稳定计划；⑥备份目标在数据源和 DB 文件之外，逐文件 hash 核验；⑦选用单 DB 事务或有明确批次状态的幂等续跑；不得以“每个 Repository 独立提交”声称全批次回滚；⑧逐项核对 run/student/objective/response/review 计数、关键字段与关系及 current pointer；⑨失败报告阶段和安全恢复方式，不自动删除 JSON、清空/覆盖 DB；⑩临时目录验证路径错配、非空 DB 拒绝和中断恢复。
- **前置依赖**：任务 I 的配置解析、任务 D 的 SessionFactory/UoW/一致性备份能力、任务 C 的 Repository Ports/Adapter、任务 A 中的迁移用例；历史目录命名规则和兼容 schema 版本须先锁定。路径预检可先开发，但正式迁移写入必须等依赖完成。
- **测试**：坏 JSON、错 run_id、缺快照目录、无关目录发现报告、无效复核/引用、非连续版本；指定 source 目录而 DB target 保持原值；显式 DB 覆盖配置；backup/source/db 路径冲突；目标 DB 含数据时拒绝且 byte-for-byte 不变；显式 opt-in 冲突仍拒绝；备份 hash 错误；导入中途失败与安全恢复；全表数目/引用核验；原 JSON/current pointer 不变。
- **验收**：不明输入不静默漏过；预检失败不修改 DB；source、database、backup 三条路径及默认绝对位置写入文档和报告；更改 data-dir 不改变目标 DB；任何已存在 DB 未确认不得写入，非空 DB 默认拒绝；失败后无无法解释的半迁移状态；报告含三条路径、目标预检、备份位置、扫描/迁入/排除计数、记录核验、current run 与结果；旧数据完全保留。
- **删除**：不删除旧 JSON、迁移工具或其兼容版本读取逻辑。

### 任务 F：文件访问边界（读取必须；写入能力按真实需求）

- **为什么/解决什么**：CSV 导入、PDF 来源读取、将来 TASK 文件处理不应各自拼路径；统一安全路径、哈希和文件错误；大文件留在文件系统。
- **当前状态**：CSV reader、SourceService、导出 ZIP 已存在；SourceService 有 allowlist/path-name 检查与 SHA256 指纹（当前真实用途）；尚无统一 FileStorage port；上传/持久化生成报告并非已实现能力。
- **修改文件**：`infrastructure/ingestion/csv_reader.py`、`services/task01/source_service.py`、`services/task02/import_service.py`、API `imports.py`/`analysis.py`/`exports.py`、配置及测试（按迁移路径分批）。
- **新增文件**：`application/ports/file_storage.py`（Repository/UoW 同样按 Ports 归属）；`infrastructure/files/local_file_storage.py` 或在现有 `SourceService` 周边增加单一 adapter，按最小实现择一。没有业务需要时不加数据库资产表。
- **交互方式**：Application 用 FileStorage Protocol 读取经 allowlist 确认的 CSV/PDF；先实现安全解析与读取。仅当真实 TASK 要求落盘/清理/完整性验证时，才为所需方法增补原子写、删除、SHA256/大小。ZIP 可继续在内存生成并作为 HTTP response，不强制经过持久化接口。大型文件一直保存在文件系统。
- **实施步骤**：①画出现有 CSV/PDF/ZIP 文件生命周期；②明确来源目录 allowlist 和路径穿越规则；③统一 PDF 读取；④CSV 以 path 或 stream 输入但保持读取内容、编码和行号不变；⑤保留当前 source fingerprint 所需 SHA256；原子写/删除只在真实生成文件/清理需求出现时加入；⑥只有需要持久化文件资产与跨重启检索时才评估 SQLite 元数据表，并单独说明用途/迁移/恢复成本；⑦若未来确有文件资产，再把这些文件纳入 backup manifest。
- **前置依赖**：任务 I 路径规则；FileStorage Protocol 在 Application Ports 定义。上传/写入/删除仅由真实 TASK 需求触发，不构成当前读能力的前置条件。
- **测试**：路径允许/拒绝、路径穿越、缺文件、CSV 多行源行号不变、PDF allowlist、现有 source fingerprint hash 一致；仅启用写入时测试原子写中断；仅新增删除能力时测试删除语义；ZIP 内存内容保持。
- **验收**：现有 CSV/PDF 读取经一个轻量抽象，三个 TASK 不各自拼路径；ZIP 可内存生成；无大文件进入 SQLite；没有未使用的方法或资产表。
- **删除**：不删 CSV/来源服务，直至所有真实调用已迁移并回归。

### 任务 G：API 契约、DI、错误和请求生命周期（必须）

- **为什么/解决什么**：保留现有 `/api/*` 兼容；路由不能直接读数据库或组合业务；前后端共享一致错误语义，并以自动测试尽早发现字段/状态码漂移。
- **当前状态**：FastAPI app factory、六类 route、Pydantic schema、request ID、错误处理已存在；DI 注入 `Store` 与 Settings；API 文档由 FastAPI 提供。
- **修改文件**：`api/app.py`、`dependencies.py`、`routes/*.py`、`schemas/http.py`、`schemas/api.py`（先检查引用）、前端 `api/client.ts` 与测试。
- **新增文件**：共享 `contracts/api/` JSON contract fixture（用于 pytest 与 Vitest）、仅为实际跨路由复用的 Response/Error schema 或 Application dependency；不必单建版本路由树或生成器。
- **交互方式**：Router 解析输入并调用 Application use case；exception handler 将已知异常映射到现有 `{error, code, request_id}` envelope；未知异常只返回安全 500。
- **实施步骤**：①盘点 OpenAPI 与前端类型；②建立由 pytest 和 Vitest 共用的请求/响应 JSON fixtures，后端按 Pydantic/OpenAPI 验证状态/字段/错误结构，前端按同一 fixtures 验证 API parser/response handling 且 TypeScript build 检查组件类型；③锁定 URL/字段兼容性；④路由注入用例；⑤定义应用异常到 HTTP 状态映射；⑥保留 request ID；⑦分别验证 JSON 与 ZIP/PDF 下载；⑧核查 `schemas/api.py` 引用后再决定处理。
- **前置依赖**：任务 A 用例；前端 client 与后端 schema 对照；不得独立改 API。
- **测试**：每路由成功/验证错误/领域错误/存储失败、安全异常 envelope、request ID；pytest 与 Vitest 读取同一组 contract fixtures，验证关键成功响应、错误 envelope、字段类型及二进制请求路径；OpenAPI path/字段变更需要显式审阅。
- **验收**：现有 API 路径及兼容响应无非必要变更；无路由 ORM/SQL/Session；错误不含堆栈、key、学生原文。
- **删除**：只有确认重复且无导入方时，才删 `schemas/api.py` 中重复定义或旧兼容层。

### 任务 H：LLM Port 与 DeepSeek Adapter（必须；范围保持轻量）

- **为什么/解决什么**：隔离提供方 HTTP、教学提示与证据校验，记录可追溯配置同时防止泄露学生数据。
- **当前状态**：`deepseek_client.complete()` 使用 urllib、30 秒 timeout；TASK03 服务构造提示、解码 JSON、检查必填字段和证据集；密钥来自 Settings/env；当前尚无 Application LLM Protocol。
- **修改文件**：`infrastructure/llm/deepseek_client.py`、`services/task03/recommendation_service.py`、`config.py`、`api/routes/recommendations.py`、AI tests 与 README。
- **新增文件**：在 `application/ports/llm.py` 定义轻量 `LLMClient` Protocol（只包含当前所需的结构化 completion 操作）；保留/调整 `infrastructure/llm/deepseek_client.py` 作为唯一 DeepSeek Adapter。当前不增加第二实现、Provider Registry、模型路由或调度器。
- **交互方式**：Use Case → Application `LLMClient` Protocol → DeepSeek Adapter；TASK03 负责提示策略和输出/证据校验，Adapter 负责 HTTP 传输和提供方响应适配；模型不能连接 Repository。
- **实施步骤**：①定义单一、最小 Protocol 与安全错误类型；②把现有 DeepSeek client 接到该 Protocol；③超时、模型名从配置注入；④日志只记录 provider/model/prompt version/耗时/结果类别，不记 key、完整 prompt 或整段作答；⑤补 Mock 错误覆盖；⑥若未来第二提供方真实出现，再单独评估；⑦真实付费 API 验证需用户明确授权。
- **前置依赖**：任务 C 确立 Ports 归属规则；任务 A 的用例；Domain Evidence 基本规则。
- **测试**：超时、无效 JSON、截断、429/5xx、安全日志、假证据、无引用、有效输出；测试不得发起网络调用。
- **验收**：轻量 Protocol 仅含当前调用需要；只有 DeepSeek Adapter 实现；模型是可选草稿能力；统计不依赖 LLM；仅教师可复核；证据 ID 必须属于允许集合；无 Provider Registry、多模型调度或复杂重试；真实 API 测试状态如实记录。
- **删除**：不删现有 DeepSeek client/提示逻辑，不增加 Provider Registry、多模型调度、多 Agent 或复杂自动重试系统。

### 任务 I：配置、日志、生命周期与 PowerShell 开发体验（必须）

- **为什么/解决什么**：统一 DB、data、resources、web dist 路径与密钥配置；解决 CWD 歧义和资源不释放问题；确保开发者按 PowerShell 步骤复现。
- **当前状态**：Settings dataclass/环境变量与 `.env.example` 已有；日志 formatter/request ID 已有；README 命令存在；配置在 import time 创建，路径相对当前 CWD；CLI 参数默认值存在 data-dir/db-url 错配风险。
- **修改文件**：`app/config.py`、`app/core/logging.py`、`app/api/app.py`、`api/server.py`、`app/cli.py`、`.env.example`、README。
- **新增文件**：仅需简单 config loader/CLI shared options/lifespan tests；不为两三个环境增加大型设置框架。
- **交互方式**：进程入口加载并校验配置 → 应用 lifespan 配置日志/创建或接收 Engine → 关闭时 dispose → 用例和 DI 获取显式 Settings。
- **实施步骤**：①定义相对路径基准为项目根/显式配置目录，不依赖调用位置；②分别解析 source data-dir、SQLite database-url、backup-dir，默认 DB 为 `<project-root>/data/smart_learning.db`，backup 默认在 `<project-root-parent>/_backups/smart-learning/<timestamp>/`，绝不随 `--data-dir` 变化；只有显式设置数据库 URL 才改变 DB 目标；③配置缺失/无效时启动前给可读错误；④避免重复配置日志 handler；⑤FastAPI lifespan dispose Engine；⑥审查日志字段、敏感数据过滤；⑦README 所有 PowerShell 示例使用一致相对路径和 `http://localhost:<port>`。
- **前置依赖**：任务 D DB URL 与 Session 设计；任务 G request context。
- **测试**：从 repo root 与 backend 目录启动、覆盖 env/CLI 优先级、Windows 路径、迁移中 `--data-dir` 变化而数据库目标保持固定（除非显式修改 DB URL）、lifespan dispose、日志不含 key/作答正文。
- **验收**：无需个人绝对路径即可启动；配置优先级明确；默认 loopback；DB upgrade 独立显式执行；PowerShell 完整流程可复制。
- **删除**：不删 `.env.example` 或个人可选配置；不自动加载 `.env` 除非明确增加且文档化依赖。

### 任务 J：测试矩阵、文档与准入验收（必须）

- **为什么/解决什么**：已有测试保护重要行为，但基础设施主路径不充分；让后续任务在本地快速验证且不破坏统计/历史。
- **当前状态**：`test_core.py` 覆盖统计、CSV、导入、Review/ZIP、并发、可选赛事 fixture、DeepSeek mock；`test_phase02.py` 覆盖少量 Domain、`create_all` 数据库、review、迁移；`test_server.py` 覆盖 API 主路径/错误/来源/静态资源；前端只有 client、ImportPanel、ReviewPanel tests。
- **修改文件**：`apps/backend/tests/`、`apps/web/src/**/*.test.ts(x)`、`pyproject.toml`、`apps/web/package.json`（仅确有必要）、`docs/architecture/*.md`、README、`AGENTS.md`。
- **新增文件**：Domain/Repository/Application/Infrastructure/API 的测试模块；前端 API 下载/错误测试；必要 PowerShell 运维脚本文档。
- **交互方式**：单测验证 Domain/纯服务；临时文件 SQLite 验证 Repository/UoW/Alembic；FastAPI TestClient 验证合同；Vitest 验证 client/features；不连接开发数据目录或真实 DeepSeek。
- **实施步骤**：①按下面矩阵列测试；②保证所有 DB 测试用 tmp_path 独立文件；③Alembic 用真实 upgrade；④回归关键当前赛事结果与证据行号；⑤更新漂移文档；⑥运行仓库 AGENTS.md 命令；⑦记录未验证项而非隐藏 skip。
- **前置依赖**：A–I 的实现稳定后进行最终准入；建设中每个改动增补对应局部测试。
- **测试**：见第 6 节及 AGENTS.md 验证命令。
- **验收**：所有强制检查本地通过；可选真实赛事 fixture 的可用/skip 状态明确；没有真实外部模型调用；数据库与迁移测试从空临时目录可复现。
- **删除**：不删既有回归测试；若重排文件，保持测试断言覆盖范围相同或更广。

## 6. 测试方案与业务兼容性

### 6.1 分层测试

| 测试类型 | 重点 | 环境与数据 | 通过条件 |
|---|---|---|---|
| Domain unit | 实体/值对象、枚举、领域异常、评分/复核/证据边界、Domain 无框架依赖 | 不需 DB/网络 | 每项领域不变量有正反例；历史有效值可映射 |
| Service unit | TASK02 质量、版本选取、指标和案例；TASK03 规则建议与引用 | fixture/mock | 统计分母、事件规则、finding、案例结果与基线一致 |
| Repository | CRUD/映射、run 隔离、FK/唯一约束、Review append、rollback | 临时 SQLite 文件；通过 Alembic 建 schema | 错误输入由 DB 拒绝；事务失败无部分提交 |
| Application | Use Case 编排、依赖 ports、UoW、异常/回滚 | fake repositories/UoW + 少数 SQLite 集成 | Repository mock 不依赖 SQLAlchemy；多仓操作原子 |
| Infrastructure | Alembic 初始化/重复升级、迁移预检/备份/中断恢复、文件 adapter、DeepSeek mock | tmp_path；拦截网络 | 文件/hash/DB 核验一致；无真实外网请求 |
| API | 正常/422/领域错误/未知错误、request ID、contract、上传/下载 | FastAPI TestClient + 临时 DB | 路径/状态/schema/错误结构稳定，无内部信息泄漏 |
| Frontend | API JSON/error/binary、加载失败、Import、Review | Vitest/jsdom/mock fetch | 请求只经过 api client；错误对用户可理解；类型与 contract 对齐 |
| Regression | CSV 导入、统计口径、修订、证据、AI 草稿、Review 历史、ZIP | 合成 fixtures；可选正式赛事 fixture | Phase 02 基线断言与当前 API/ZIP 都不变 |

### 6.2 必须保留的回归不变量

- TASK02 统计公式、有效样本/分母、修订最高版本唯一性、事件身份冲突隔离及质量 findings 不改变。
- CSV 原始列、学生 ID、题目/材料 ID、赛事源文件不得被重写；证据记录 ID 和 `_source_line` 追溯正确。
- `analysis_runs.snapshot_json` 对旧快照保持无损；只读兼容投影不得写回源 JSON。
- TeacherReview 状态、版本顺序、原始草稿、证据列表与教师修改历史完整保留，不覆盖旧版本。
- `/api/*` 路径、现有请求/响应字段、error 字段、ZIP 文件名/成员/格式保持兼容；新增错误码须兼容现有安全消息语义。
- DeepSeek 为可选草稿；统计在模型失败/未配置时照常可用；Mock 才是自动测试路径。

### 6.3 SQLite Review 并发控制

SQLite 同一文件采用单写者语义。应用使用短写事务，Review 的“读取最新版本 → 分配下一版本 → 插入”必须处在同一事务中；事务在读取最新版本前取得写锁（SQLite `BEGIN IMMEDIATE` 或经验证等价的 SQLAlchemy 策略），避免两个进程都读到相同的 latest 后盲目插入。不要依赖 Python 进程内 `threading.RLock` 作为跨进程一致性机制。

- **数据库最终约束**：`teacher_reviews` 保留复合主键/唯一约束 `(run_id, student_id, indicator_id, version)`。它是最后防线，禁止同一复核序列出现重复版本。
- **事务与锁**：Review 写事务尽量短，不在锁内调用文件系统、外部服务或 LLM；先验证必要数据、在写事务中读取最新版本并追加，再提交。SQLite `busy_timeout` 有界等待；所有 Repository adapter 使用同一个 UoW session，不在 Repository 内开启独立事务。
- **冲突处理**：唯一约束冲突映射为可识别的 `REVIEW_VERSION_CONFLICT`（HTTP 409），数据库锁等待超时映射为安全的可重试错误（建议 503 `DATABASE_BUSY`）。不做无界自动重试，也不在客户端静默重复提交；前端收到冲突时刷新 Review 历史，让教师确认后再提交。提交结果不明确时先查询历史再决定重试，避免重复教师操作。
- **隔离范围**：并发测试必须使用同一 SQLite 文件的两个独立 Engine/Session，不能只在一个 Store/连接中用线程锁验证。覆盖同一 student/indicator、不同序列、不同 run 的行为。
- **对应测试**：多并发 writer 每条 Review 历史版本连续、唯一且不丢失；通过注入屏障/直接唯一键插入验证唯一约束；模拟 `SQLITE_BUSY`/锁超时检查回滚与安全错误映射；事务失败不留下半条记录；跨 run ID 隔离；回归 Review API 错误 envelope。

### 6.4 SQLite 一致性备份与恢复演练

备份目标是**同一时间点可恢复的 SQLite 数据库**，并将必须共同恢复的文件资产纳入同一清单。SQLite 运行中不得直接 `Copy-Item` 数据库主文件作为一致性备份；优先使用 SQLite backup API。若实现/工具不支持在线 backup，则必须停应用、关闭全部连接后再复制，且在复制前后确认数据库不再写入。若启用 WAL，备份必须包含 WAL 一致状态；当前没有测量依据时不要求启用 WAL。

每次演练使用临时源 DB、临时备份根和临时恢复目标：①写入多个 run、跨 run 同 ID、Review 多版本和 current pointer；②执行 checkpoint/backup（按所选技术）；③确认备份文件可打开、schema revision 正确并记录大小/hash；④恢复到另一个绝对路径；⑤运行 `PRAGMA integrity_check` 与 `foreign_key_check`；⑥逐表核对记录数、当前 run、Review 历史、run 快照和关键 SHA256；⑦用恢复 DB 启动应用并读取/导出；⑧记录命令、源/备份/恢复路径、时间、结果和未覆盖情况。恢复操作不得覆盖现有 DB；目标存在时默认拒绝，需显式选择新的路径或独立确认。

### 6.5 Codex 实施规范

Phase 02.5 实施及 TASK01/02/03 后续开发应将以下规则写入并维护 `AGENTS.md`：

1. 每项代码修改先在 PR/变更说明中写清“修改原因、解决的问题、影响模块、兼容风险”；没有真实用途不新增抽象。
2. 不得破坏现有三个 TASK：统计口径、正式数据字段/ID、API、证据追溯、教师复核历史与 ZIP 合同均受回归测试保护。
3. 每个变更模块都要有对应测试；跨层变更要覆盖相邻边界，不能只靠静态检查或单个端到端 happy path。
4. 不创建没有实际用途的空模块、空目录、占位 Use Case/Repository/Adapter；Protocol 必须对应被使用的调用点。
5. 新增持久化结构必须有 Alembic migration、Repository/Application/API 测试及恢复/兼容评估；不得在应用 startup 自动建表或迁移。
6. 完成后必须按实现结果更新 `docs/architecture/`、README（运行行为变化时）和 `AGENTS.md`；文档不得先于代码宣称能力完成。
7. 本地运行项目规定的后端、Ruff、前端 build/test；本地赛事数据或真实 DeepSeek 不可用时明确报告 skip/未验证，不得冒称通过。

## 7. 目标文件树

目标是渐进增量后的文件树，非要求一次性创建全部目录。方括号 `新增` 表示需视实际用例创建；不需要的空目录不得落地。

```text
apps/backend/app/
├─ api/
│  ├─ app.py / dependencies.py / routes/
│  └─ [生命周期及统一 exception mapping]
├─ application/ [新增]
│  ├─ ports/
│  │  ├─ repositories.py [完善当前 protocols]
│  │  ├─ unit_of_work.py [新增]
│  │  ├─ file_storage.py [新增，最小本地文件边界]
│  │  └─ llm.py [必需的轻量 Protocol；只接 DeepSeek]
│  └─ use_cases/ [仅真实 HTTP/CLI 用例]
├─ core/ [日志、request context]
├─ domain/
│  ├─ common/ / student/ / subject/ / assessment/ / teaching/
│  └─ [按需求增加有限值对象，不预建空业务模块]
├─ infrastructure/
│  ├─ database/ [Engine、Session/UoW 实现、ORM]
│  ├─ ingestion/ [CSV adapter]
│  ├─ files/ [新增本地 FileStorage adapter]
│  ├─ llm/ [DeepSeek adapter]
│  └─ migration/ [预检、JSON→SQLite、报告]
├─ repositories/ [现有 SQLAlchemy Repository Adapter 兼容目录；可保留]
├─ infrastructure/adapters/repositories/ [只有逐个移动有实际收益时才创建]
├─ schemas/http.py [唯一 HTTP Pydantic contract]
└─ services/{task01,task02,task03,shared}/ [现有算法渐进保留]
apps/backend/alembic/versions/ [只追加 schema revisions]
apps/backend/tests/
├─ unit/domain + unit/services
├─ repository/ + application/ + infrastructure/
└─ api/ [可按规模渐进拆分]
apps/web/src/api/ [client、error、single-source TS contract]
contracts/api/ [pytest 与 Vitest 共用的请求/响应 JSON fixtures]
docs/architecture/ [与实际代码同步]
docs/development/phase-02.5-infrastructure-complete-plan.md
```

## 8. 删除与新增清单

### 8.1 预计修改

见任务 A–J，主要集中于 `apps/backend/app/api`、`application`、`domain`、`repositories`、`infrastructure/database`、`infrastructure/migration`、`services/task02/import_service.py`、`services/task03/review_service.py`、`apps/backend/tests`、`apps/web/src/api`、`README.md`、`docs/architecture/07-json-migration-plan.md` 及相关运行文档。

### 8.2 预计新增

- `apps/backend/app/application/ports/{repositories,unit_of_work,file_storage,llm}.py` 和有真实流程对应的 `use_cases/*.py`。
- `apps/backend/app/infrastructure/files/local_file_storage.py`（按 F 任务实际接口定名）；Repository Adapter 可留在 `app/repositories/`，不要求整体移动。
- Alembic 新版本（仅当实际 schema 变更）；迁移计划/报告类型（只在能消除遗漏/提升可审计性时）。
- 新的 Domain、Repository、Application、Infrastructure/API 测试模块。

### 8.3 预计删除

**当前没有已确认必须删除的应用代码或数据库表。** 可能清理但必须先做全仓引用检查：`schemas/api.py` 中与 Pydantic HTTP schema 重复的 TypedDict/验证器；旧顶层 `services/analysis.py`、`cases.py`、`recommendations.py`、`exports.py` 兼容 re-export；`Store` 在所有入口迁移后可移除。只有证明无公开导入调用且兼容期结束，才列入单独实施 PR。绝不删除快照、原始 JSON、统计函数、来源行号或复核版本。

## 9. 唯一实施顺序与模块依赖

以下是单一的前后顺序。阶段内允许同一阶段内独立文件的工作并行，但不得跳过依赖或把后续阶段提前合并；这消除了“迁移要用 UoW、UoW 又要先有 Repository、Repository 又依赖迁移”等循环表述。

```text
0 路径/config 约定与基线测试
  ↓
1 Engine + SessionFactory + Alembic + SQLite backup/restore 基础（Infrastructure）
  ↓
2 Application Ports：Repository Protocol + UoW Protocol + 必要的 FileStorage/LLM Protocol
  ↓
3 SQLAlchemy UoW adapter + Repository adapters（可暂留 app/repositories）+ Domain mapper
  ↓
4 Domain contract 收敛 + Application Use Cases（先 Review，再导入等写流程）
  ↓
5 Review 并发策略验证 + JSON→SQLite 安全迁移（迁移用例复用 ports/UoW）
  ↓
6 FileStorage 读取接入 + LLM DeepSeek adapter + API 路由/契约测试收敛
  ↓
7 FastAPI/CLI lifespan、完整 PowerShell 路径与配置优先级验收
  ↓
8 全层回归、SQLite 备份恢复演练、架构文档与 AGENTS.md 更新、TASK 准入签核
```

### 9.1 每阶段输入与产物

1. **阶段 0（I 的路径规则部分 + J 基线）**：先固定 `--data-dir`、`--database-url`、`--backup-dir` 各自解析/优先级，保证三者分离；记录现有 API/统计/Review/ZIP 基线。不创建应用模块。
2. **阶段 1（D 的连接/schema/运维底座）**：Engine、SessionFactory、SQLite PRAGMA、Alembic 空库/重复升级、SQLite 一致性备份与恢复机制。此时不依赖 Application Repository 或 UoW。
3. **阶段 2（C 的接口定义 + B 的 Domain contract 初审）**：先定义纯 Protocol：Repository 与 UoW 属 Application Ports；FileStorage/LLM Protocol 按任务实际使用分别定义。Protocol 不暴露 Session/ORM。没有实现用途的接口不创建。
4. **阶段 3（D 的 UoW adapter + C 的 Repository 实现 + B mapper）**：SQLAlchemy UoW 依赖 SessionFactory 并实现 Port；现有 Repository adapter 改用传入的 UoW/session。文件可留在 `app/repositories/`，不要求目录迁移。mapper 保留 snapshot/API 字段。
5. **阶段 4（B + A）**：完善涉及现有流程的 Domain 规则；Application Use Case 依赖 Ports；先使 Review 读、校验、版本分配、写入处于一个 UoW，后迁导入等真正需要多仓事务的流程。
6. **阶段 5（Review 并发 + E）**：落实锁定/唯一约束/冲突响应后，JSON 迁移按独立 source/DB/backup 路径预检；迁移用例依赖 Application Ports 和已实现 UoW，不直接 new 具体 Repository。先测预检，再执行副本迁移。
7. **阶段 6（F + H + G）**：接入当前 CSV/PDF 读取边界、唯一 DeepSeek Adapter 和 HTTP use cases；pytest/Vitest 共读契约样例验证字段与行为。ZIP 仍可内存生成。
8. **阶段 7（I 的运行期部分）**：把已确定配置注入 FastAPI/CLI，在 lifespan dispose Engine；从不同 PowerShell 当前目录验证相同配置解析。这里不再改变阶段 0 已锁定的 source/DB/backup 语义。
9. **阶段 8（J）**：运行既定本地检查和跨层回归，执行完整备份恢复演练，更新架构文档、README 与 `AGENTS.md`，留验收证据。

**无循环依赖证明**：Infrastructure `SessionFactory` 不依赖 Application；Application 声明 UoW/Repository Protocol；Infrastructure SQLAlchemy UoW/Repository Adapter 实现 Protocol；Application Use Case 只依赖 Protocol；CLI/API 装配根把实现注入用例。JSON 迁移是一个 Application 用例/Infrastructure 读取适配器的组合，不反向改变 SessionFactory/UoW 的职责。`app/repositories` 的过渡物理路径不改变其 Adapter 逻辑归属。

## 10. 风险及控制

| 风险 | 影响 | 控制/验收 |
|---|---|---|
| 快照与规范化投影定义不清 | 导入/回读出现不一致，历史 API 或统计改变 | 先定义权威载体和投影用途；不删快照；按 run 比对内容及计数 |
| 新 UoW 造成事务行为改变 | Review 版本丢失/重复、导入 current 指针提前切换 | 先补并发/回滚测试；一次迁移一条用例；使用唯一约束并处理冲突 |
| 迁移工具只对“常见目录”验证 | 旧数据被静默漏掉或导入错误 DB | 全目录扫描清单、明确拒绝策略；data-dir/db-url 同目标断言；副本演练 |
| 对 Domain 做大范围重写 | 统计输出、响应契约和历史快照发生变化 | 保持现有分析 Service；只在边界映射；保留端到端基线 fixture |
| SQLite 文件备份不一致 | 数据库损坏或备份缺 WAL/资产文件 | 明确应用停机或 SQLite backup API；恢复到临时目录验证；禁止裸复制运行中的多文件状态 |
| 文件抽象泛化过度 | 新增空接口和无用资产表 | FileStorage 只覆盖当前 read/hash/write 生命周期；无真实持久文件就不建元数据表 |
| LLM 日志包含学生个人数据/key | 隐私泄露 | 日志字段白名单、模拟敏感串检查；不记录完整 prompt、响应、key |
| 文档与代码再次漂移 | 后续实现基于错误前提 | 每个批次更新对应文档；以测试和代码为事实源，审查时核对 |
| Windows 路径/PowerShell 参数差异 | 新用户启动/迁移到意外目录 | 从 repo root 与 backend 目录各跑一遍；含空格/绝对路径临时目录测试 |

## 11. Phase 02.5 最终验收清单

- [ ] `main` 最新工作区上审查并确认本计划中实现范围，实施分支保留原始数据与未提交改动。
- [ ] API/Application/Domain/Infrastructure/Repository 的职责及依赖箭头写入 `AGENTS.md` 与架构文档，并符合代码实际。
- [ ] Domain 不依赖 FastAPI、Pydantic、SQLAlchemy；规则与转换均有独立测试。
- [ ] 多 Repository 用例由 Application 组织并由一个 UoW 界定事务；异常可回滚。
- [ ] Repository Protocol 位于 Application Ports；SQLAlchemy Repository 属于 Infrastructure Adapter；旧 `app/repositories/` 仅作为可保留的物理过渡目录；业务用例不依赖具体实现。
- [ ] SessionFactory → Application UoW/Repository Protocol → SQLAlchemy UoW/Repository Adapter → Use Case 的依赖方向已按唯一顺序落实，无跨层循环。
- [ ] Review 在单个短 `BEGIN IMMEDIATE` 写事务内读取最新版本并追加；复合唯一约束有效；唯一冲突/SQLITE_BUSY 有安全错误映射且无自动无限重试；独立连接并发测试通过。
- [ ] Alembic 能从空库升级至 head，重复 upgrade 安全，全部模型被 metadata 发现；外键、唯一约束、run 隔离和 Review 历史已验证。
- [ ] 迁移扫描不会静默跳过可能含数据的目录；坏数据在 DB 修改前失败并报告原因。
- [ ] JSON source、SQLite database、backup 的默认绝对路径和 CLI/env 优先级明确；更改 `--data-dir` 不改变 DB target；路径冲突在执行前拒绝。
- [ ] 迁移前检查数据库是否存在、schema/revision 和现存记录；已存在 DB 未显式确认绝不写入；非空 DB 默认拒绝，绝不自动清空或覆盖。
- [ ] 备份使用一致性机制；恢复到新路径后 integrity/FK、schema、记录数、current run、Review 历史及关键内容/hash 核验通过；演练有记录；原 JSON 不删不改。
- [ ] CSV/PDF/需要持久化的文件经统一本地存储边界；大文件仍留文件系统；无未使用资产表。
- [ ] FileStorage 先统一 CSV/PDF 读取；原子写/删除只按真实需要增加；现有 source hash 保持；ZIP 可在内存生成；没有业务需求时不建文件资产表。
- [ ] API 路径/字段兼容，错误包含安全 `error` 与 request ID，路由无 DB/文件/模型直连；pytest 与 Vitest 共读契约 fixtures 并通过一致性检查。
- [ ] 前端请求统一经 API client，关键类型不重复漂移；API、JSON 错误及 ZIP/PDF 下载经过测试。
- [ ] Application 只定义轻量 LLM Protocol，只有 DeepSeek Adapter；无 Registry/多模型调度/复杂重试；DeepSeek 未配置或失败不影响统计；Mock 覆盖异常；无密钥、完整学生文本出现在日志；证据校验保留。
- [ ] Codex 实施规则要求每项修改说明原因、保护三个 TASK、每模块对应测试、禁止无用空模块，并在完成后同步架构文档与 `AGENTS.md`。
- [ ] Windows PowerShell 从干净开发环境完成安装、Alembic、后端、前端、测试、备份和恢复步骤。
- [ ] TASK01/02/03 既有回归结果、指标统计、行号证据、教师历史和 ZIP 输出无非目标变化。
- [ ] README、AGENTS、架构、DB、迁移、测试、备份/恢复说明均与已实现代码同步。

## 12. TASK 01/02/03 开发准入条件

**可以进入三个 TASK 的后续业务开发**，仅当上述最终验收中所有必须项通过并记录证据，且以下条件全部成立：

1. 独立开发者能根据 Application 用例、Repository port、Domain 映射和文件端口规则放置新增代码，不需要每个 TASK 发明自己的持久化/事务实现。
2. 迁移在历史数据副本及自定义 Windows 路径完成端到端演练；迁入 DB 的 snapshot/review/current pointer 与来源数据逐项核对，能安全失败和恢复。
3. Alembic 空库初始化和重复升级通过；SQLite 约束、事务回滚和 run 隔离有测试证据。
4. 后端 pytest、Ruff check/format、前端 npm build/test 均通过；任何跳过、不可运行或依赖赛事本地数据的项单独列明，不能以未运行冒充通过。
5. 统计、修订、证据、AI 草稿、复核、导出等现有回归断言保持；未改变赛事原始字段、正式 ID、API 和数据历史。
6. 配置、日志、启动/迁移/备份/恢复的 PowerShell 指南在干净环境可执行，无开发者绝对路径依赖。
7. 对建议项可记录为后续 backlog；“当前不需要”项目不作为准入前提，不为通过准入添加无用抽象。

**实施状态（2026-11-16）**：Phase 02.5 必须建设已按第 9 节顺序完成，代码、架构文档和 `AGENTS.md` 已同步。当前验证为后端 61 passed / 1 skipped（Windows 环境无法创建符号链接，相关拒绝路径仍由实现检查覆盖）、Ruff check/format、前端 build/test、临时 SQLite Alembic/Review 并发/迁移/备份恢复测试通过。未使用真实赛事数据副本执行迁移，也未调用付费 DeepSeek 服务；因此上线前仍须按本节步骤在真实旧数据副本完成迁移演练，并由维护者复核最终准入清单。建议完成项不阻塞后续 TASK 开发。

