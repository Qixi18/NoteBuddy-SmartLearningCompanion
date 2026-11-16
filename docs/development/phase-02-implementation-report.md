# Phase 02 实施报告

日期：2026-11-16  
分支：`feat/phase-02-domain-sqlite`（未提交、未推送）  
基点：`8a3c7df63867e0b7dc2365bbba9f87d51f5c2b61`

## 交付摘要

- 建立独立 dataclass Domain：学习者、课程目标、测评材料/节点、作答/修订/指标、Evidence、Diagnosis、RecommendationDraft、TeacherReview、状态枚举和领域异常。TASK 03 复核流程使用 Domain 校验；Domain 不导入 FastAPI/Pydantic/SQLAlchemy。
- 建立 SQLAlchemy 2.x/SQLite/Alembic。运行、班级、学生、目标、材料、材料—目标多对多、节点、事件、作答、复核、app_state 均有关系表；运行内用复合键隔离。完整 analysis 快照原文保留在 `snapshot_json`，历史快照读取时按需补兼容投影，不重写源文。
- 建立 AnalysisRun、Review、Student、Subject、Response Repository。统计算法仍留在原 TASK services；API 不接触 Session/ORM。
- 新增配置 `SMART_LEARNING_DATABASE_URL`；默认 `data/smart_learning.db`。应用不会自动建表或升级，需显式运行 `python -m app.cli db-upgrade`。
- 新增幂等 JSON 迁移 CLI。备份目录为仓库外 `D:\工作台\智慧学伴-比赛项目\_backups\smart-learning-20261116-170316`，共 7 个源文件，备份 hash 校验通过；迁移后再次逐文件比对，全部匹配。另有一个迁移前误创建的空、旧 schema 数据库已保留在仓库外 `D:\工作台\智慧学伴-比赛项目\_backups\phase-02\empty-schema-before-migration-20261116-170308.sqlite`，无业务数据。
- 正式数据已切换至 SQLite；原始 JSON 未改写、未删除，仍可恢复。数据库文件被 Git 忽略。
- 删除 `.github/workflows/ci.yml`，保留本地 pytest/Ruff/Vitest/build。历史 Phase 01 文档仍如实记载当时建立 CI 的事实；当前指引、架构文档和 ADR 已更新为不依赖 Actions。

## 数据迁移核验

| 对象 | 迁移前/后核验 |
|---|---:|
| AnalysisRun | 5 / 5 |
| 当前运行 | `2f2622ce9170e5b1` / 一致 |
| Student 投影 | 200 |
| LearningObjective 投影 | 45 |
| LearningItem 投影 | 325 |
| AssessmentNode 投影 | 10 |
| 原始作答 | 4,030 |
| 已选作答 | 3,995 |
| 教师复核 | 1 / 1，版本与更新时间保留 |
| 原始快照正文 | 5 份逐份文本一致 |
| 历史可选字段缺失状态 | 原文中保留；读取层成功投影兼容字段 |

迁移工具在完整数据副本上先后执行两次，第二次未重复插入记录；正式数据迁移完成后，再验证源 JSON 与仓库外备份的 SHA-256 一致。

## Domain/数据库结构

Domain 模型及领域约束见 [05-domain-models.md](../architecture/05-domain-models.md)。ER 图、键和约束见 [06-database-design.md](../architecture/06-database-design.md)。迁移步骤、恢复和幂等策略见 [07-json-migration-plan.md](../architecture/07-json-migration-plan.md)。ORM 模型清单：`analysis_runs`、`classes`、`students`、`learning_objectives`、`learning_items`、`learning_item_objectives`、`assessment_nodes`、`response_events`、`responses`、`teacher_reviews`、`app_state`。

## 接口及三 TASK 回归

- 现有 API 路径与 JSON 契约保留。`GET /api/run` 与 `GET /api/reviews` 在正式迁移库上均返回 200。
- Task 01 来源 allowlist/PDF 路由现有 API 测试通过；Domain 提供来源引用，仍不新增 PDF 自动解析。
- Task 02 原始/选中修订、质量 finding、指标与观察统计代码未重写；既有样例和公开 CSV 测试通过，项目原先的统计断言继续通过。
- Task 03 证据校验、DeepSeek mock、教师复核追加历史测试通过；真实 DeepSeek 未调用。
- ZIP 导出：当前运行生成 181,843 字节；最早缺少 observations/source_index 的历史快照也成功生成 174,938 字节 ZIP。

## 测试结果

| 命令/验证 | 结果 |
|---|---|
| `python -m pytest -q` | 26 passed |
| `ruff check apps/backend` | All checks passed |
| `ruff format --check apps/backend` | 77 files already formatted |
| `npm run test` | 3 files、5 passed |
| `npm run build` | TypeScript 通过；Vite 42 modules 构建成功 |
| Alembic `check` | No new upgrade operations detected |
| Alembic `current` | `da812b1d5423 (head)` |
| 正式库 API / ZIP | run=200，reviews=200，ZIP 成功 |
| `git diff --check` | 无空白错误 |

前端构建写入的 bundle 位于 Git 忽略路径 `apps/backend/app/web/dist/`；没有将其纳入变更。

## 变更清单

- 新增：Domain 模型、SQLite Engine/Session/ORM、Alembic 配置和初始迁移、JSON migrator、Student/Subject/Response Repository 与 Protocols、Phase 02 测试、3 份架构文档、ADR-0002、Phase 02 基线和本报告。
- 修改：`AGENTS.md`、README、`.env.example`、`.gitignore`、配置和应用/CLI 装配、Store/AnalysisRun/Review Repository、TASK 02 导入 ID 处理、TASK 03 ReviewService、已有测试和现行架构文档；Phase 01 ADR 标注其 JSON/CI 决策已被 ADR-0002 取代。
- 删除：`.github/workflows/ci.yml`。未删除任何 JSON、赛事数据或其他仓库配置。
- 未提交、未推送；当前 Git 工作区包含本阶段预期变更，等待人工审阅。

## 已知限制与后续建议

- 为保障旧 API 和业务逻辑兼容，现有 TASK services 仍使用快照 dict；Domain 已在规则层和 Repository 新接口建立基础，后续可逐个用例收敛，避免一次性重写。
- DI/数据库初始化由显式 Alembic 命令负责；首次启动若未升级 schema，应用不会自动替用户创建数据库结构。
- SQLite 适用于当前本地单用户。没有启用 WAL，不承诺多进程高并发写入；如未来需要远程/多用户部署需另行评估。
- 未调用真实 DeepSeek，不做模型效果或外部服务可用性声明。

## 文件树

下面分别列出基线中的完整跟踪文件路径和本阶段完成后的仓库文件路径（忽略运行数据、构建产物、依赖缓存和 `_bmad-output/`）。

### 基线（Phase 02 开始前）

```text
.agents/skills/bmad-advanced-elicitation/SKILL.md
.agents/skills/bmad-advanced-elicitation/assets/methods.csv
.agents/skills/bmad-advanced-elicitation/customize.toml
.agents/skills/bmad-advanced-elicitation/scripts/pick_methods.py
.agents/skills/bmad-advanced-elicitation/scripts/tests/test_pick_methods.py
.agents/skills/bmad-agent-analyst/SKILL.md
.agents/skills/bmad-agent-analyst/customize.toml
.agents/skills/bmad-agent-architect/SKILL.md
.agents/skills/bmad-agent-architect/customize.toml
.agents/skills/bmad-agent-dev/SKILL.md
.agents/skills/bmad-agent-dev/customize.toml
.agents/skills/bmad-agent-pm/SKILL.md
.agents/skills/bmad-agent-pm/customize.toml
.agents/skills/bmad-agent-ux-designer/SKILL.md
.agents/skills/bmad-agent-ux-designer/customize.toml
.agents/skills/bmad-architecture/SKILL.md
.agents/skills/bmad-architecture/assets/spine-template.md
.agents/skills/bmad-architecture/customize.toml
.agents/skills/bmad-architecture/references/headless.md
.agents/skills/bmad-architecture/references/reviewer-gate.md
.agents/skills/bmad-architecture/scripts/lint_spine.py
.agents/skills/bmad-architecture/scripts/tests/test_lint_spine.py
.agents/skills/bmad-brainstorming/SKILL.md
.agents/skills/bmad-brainstorming/assets/brain-icons.json
.agents/skills/bmad-brainstorming/assets/brain-methods.csv
.agents/skills/bmad-brainstorming/assets/brain-selector.html
.agents/skills/bmad-brainstorming/customize.toml
.agents/skills/bmad-brainstorming/references/converge.md
.agents/skills/bmad-brainstorming/references/finalize.md
.agents/skills/bmad-brainstorming/references/headless.md
.agents/skills/bmad-brainstorming/references/in-chat-techniques.md
.agents/skills/bmad-brainstorming/references/mode-autonomous.md
.agents/skills/bmad-brainstorming/references/mode-facilitator.md
.agents/skills/bmad-brainstorming/references/mode-partner.md
.agents/skills/bmad-brainstorming/references/resume.md
.agents/skills/bmad-brainstorming/scripts/brain.py
.agents/skills/bmad-brainstorming/scripts/tests/test_brain.py
.agents/skills/bmad-build-auto/SKILL.md
.agents/skills/bmad-build-auto/compile-epic-context.md
.agents/skills/bmad-build-auto/customize.toml
.agents/skills/bmad-build-auto/references/claims-check.md
.agents/skills/bmad-build-auto/references/deletion-check.md
.agents/skills/bmad-build-auto/review-prompts/edge-case-hunter.md
.agents/skills/bmad-build-auto/review-prompts/verification-gap.md
.agents/skills/bmad-build-auto/spec-template.md
.agents/skills/bmad-build-auto/step-01-clarify-and-route.md
.agents/skills/bmad-build-auto/step-02-plan.md
.agents/skills/bmad-build-auto/step-03-implement.md
.agents/skills/bmad-build-auto/step-04-review.md
.agents/skills/bmad-build-auto/workflow.md
.agents/skills/bmad-build/SKILL.md
.agents/skills/bmad-build/compile-epic-context.md
.agents/skills/bmad-build/customize.toml
.agents/skills/bmad-build/references/claims-check.md
.agents/skills/bmad-build/references/deletion-check.md
.agents/skills/bmad-build/review-prompts/edge-case-hunter.md
.agents/skills/bmad-build/review-prompts/verification-gap.md
.agents/skills/bmad-build/spec-template.md
.agents/skills/bmad-build/step-01-clarify-and-route.md
.agents/skills/bmad-build/step-02-plan.md
.agents/skills/bmad-build/step-03-implement.md
.agents/skills/bmad-build/step-04-review.md
.agents/skills/bmad-build/step-05-present.md
.agents/skills/bmad-build/step-oneshot.md
.agents/skills/bmad-build/sync-sprint-status.md
.agents/skills/bmad-build/workflow.md
.agents/skills/bmad-code-review/SKILL.md
.agents/skills/bmad-code-review/customize.toml
.agents/skills/bmad-code-review/references/claims-check.md
.agents/skills/bmad-code-review/references/deletion-check.md
.agents/skills/bmad-code-review/review-prompts/edge-case-hunter.md
.agents/skills/bmad-code-review/review-prompts/verification-gap.md
.agents/skills/bmad-code-review/steps/step-01-gather-context.md
.agents/skills/bmad-code-review/steps/step-02-review.md
.agents/skills/bmad-code-review/steps/step-03-triage.md
.agents/skills/bmad-code-review/steps/step-04-present.md
.agents/skills/bmad-correct-course/SKILL.md
.agents/skills/bmad-correct-course/checklist.md
.agents/skills/bmad-correct-course/customize.toml
.agents/skills/bmad-create-epics-and-stories/SKILL.md
.agents/skills/bmad-create-epics-and-stories/customize.toml
.agents/skills/bmad-create-epics-and-stories/steps/step-01-validate-prerequisites.md
.agents/skills/bmad-create-epics-and-stories/steps/step-02-design-epics.md
.agents/skills/bmad-create-epics-and-stories/steps/step-03-create-stories.md
.agents/skills/bmad-create-epics-and-stories/steps/step-04-final-validation.md
.agents/skills/bmad-create-epics-and-stories/templates/epics-template.md
.agents/skills/bmad-customize/SKILL.md
.agents/skills/bmad-customize/scripts/list_customizable_skills.py
.agents/skills/bmad-customize/scripts/tests/test_list_customizable_skills.py
.agents/skills/bmad-deep-recon/SKILL.md
.agents/skills/bmad-deep-recon/assets/research.template.md
.agents/skills/bmad-deep-recon/customize.toml
.agents/skills/bmad-deep-recon/references/draft.md
.agents/skills/bmad-deep-recon/references/finalize.md
.agents/skills/bmad-deep-recon/references/html-briefing.md
.agents/skills/bmad-deep-recon/references/lifecycle.md
.agents/skills/bmad-deep-recon/references/process.md
.agents/skills/bmad-deep-recon/references/run.md
.agents/skills/bmad-deep-recon/references/selection.md
.agents/skills/bmad-deep-recon/references/synthesis.md
.agents/skills/bmad-deep-recon/references/verification.md
.agents/skills/bmad-deep-recon/scripts/recon_kit.py
.agents/skills/bmad-deep-recon/scripts/tests/test_recon_kit.py
.agents/skills/bmad-deep-recon/types/academic-lit.md
.agents/skills/bmad-deep-recon/types/competitive.md
.agents/skills/bmad-deep-recon/types/domain.md
.agents/skills/bmad-deep-recon/types/market.md
.agents/skills/bmad-deep-recon/types/technical.md
.agents/skills/bmad-deep-recon/types/user-voice.md
.agents/skills/bmad-forge-idea/SKILL.md
.agents/skills/bmad-forge-idea/customize.toml
.agents/skills/bmad-forge-idea/scripts/resolve_personas.py
.agents/skills/bmad-forge-idea/scripts/tests/test_resolve_personas.py
.agents/skills/bmad-help/SKILL.md
.agents/skills/bmad-party-mode/SKILL.md
.agents/skills/bmad-party-mode/customize.toml
.agents/skills/bmad-party-mode/references/create-party.md
.agents/skills/bmad-party-mode/references/mode-agent-team.md
.agents/skills/bmad-party-mode/references/mode-auto.md
.agents/skills/bmad-party-mode/references/mode-subagent.md
.agents/skills/bmad-party-mode/references/party-memory.md
.agents/skills/bmad-party-mode/scripts/resolve_party.py
.agents/skills/bmad-party-mode/scripts/tests/test_resolve_party.py
.agents/skills/bmad-prd/SKILL.md
.agents/skills/bmad-prd/assets/headless-schemas.md
.agents/skills/bmad-prd/assets/prd-template.md
.agents/skills/bmad-prd/assets/prd-validation-checklist.md
.agents/skills/bmad-prd/assets/validation-report-template.html
.agents/skills/bmad-prd/customize.toml
.agents/skills/bmad-prd/references/headless.md
.agents/skills/bmad-prd/references/validate.md
.agents/skills/bmad-prfaq/SKILL.md
.agents/skills/bmad-prfaq/agents/artifact-analyzer.md
.agents/skills/bmad-prfaq/agents/web-researcher.md
.agents/skills/bmad-prfaq/assets/prfaq-template.md
.agents/skills/bmad-prfaq/bmad-manifest.json
.agents/skills/bmad-prfaq/customize.toml
.agents/skills/bmad-prfaq/references/customer-faq.md
.agents/skills/bmad-prfaq/references/internal-faq.md
.agents/skills/bmad-prfaq/references/press-release.md
.agents/skills/bmad-prfaq/references/verdict.md
.agents/skills/bmad-product-brief/SKILL.md
.agents/skills/bmad-product-brief/assets/brief-template.md
.agents/skills/bmad-product-brief/customize.toml
.agents/skills/bmad-project-context/SKILL.md
.agents/skills/bmad-project-context/customize.toml
.agents/skills/bmad-project-context/references/best-practices.md
.agents/skills/bmad-project-context/references/template.md
.agents/skills/bmad-qa-generate-e2e-tests/SKILL.md
.agents/skills/bmad-qa-generate-e2e-tests/checklist.md
.agents/skills/bmad-qa-generate-e2e-tests/customize.toml
.agents/skills/bmad-retrospective/SKILL.md
.agents/skills/bmad-retrospective/customize.toml
.agents/skills/bmad-retrospective/references/acceptance-verdict.md
.agents/skills/bmad-retrospective/references/aggregate-views.md
.agents/skills/bmad-retrospective/references/evidence-gathering.md
.agents/skills/bmad-retrospective/references/retro-document.md
.agents/skills/bmad-retrospective/references/team-discussion.md
.agents/skills/bmad-retrospective/scripts/git_evidence.py
.agents/skills/bmad-retrospective/scripts/sprint_status.py
.agents/skills/bmad-retrospective/scripts/tests/fixtures/sprint-status-template.yaml
.agents/skills/bmad-retrospective/scripts/tests/test_git_evidence.py
.agents/skills/bmad-retrospective/scripts/tests/test_sprint_status.py
.agents/skills/bmad-review/SKILL.md
.agents/skills/bmad-review/customize.toml
.agents/skills/bmad-review/references/editorial-common.md
.agents/skills/bmad-review/references/lens-adversarial.md
.agents/skills/bmad-review/references/lens-edge-case-hunter.md
.agents/skills/bmad-review/references/lens-prose.md
.agents/skills/bmad-review/references/lens-structure.md
.agents/skills/bmad-review/references/lens-verification-gap.md
.agents/skills/bmad-review/references/structure-models.md
.agents/skills/bmad-review/scripts/tests/test_word_metrics.py
.agents/skills/bmad-review/scripts/word_metrics.py
.agents/skills/bmad-spec/SKILL.md
.agents/skills/bmad-spec/assets/headless-schemas.md
.agents/skills/bmad-spec/assets/spec-template.md
.agents/skills/bmad-spec/assets/stories-schema.md
.agents/skills/bmad-spec/customize.toml
.agents/skills/bmad-sprint-planning/SKILL.md
.agents/skills/bmad-sprint-planning/customize.toml
.agents/skills/bmad-sprint-planning/references/fix-sprint-status.md
.agents/skills/bmad-sprint-planning/references/generate-tracking.md
.agents/skills/bmad-sprint-planning/references/readiness-gate.md
.agents/skills/bmad-sprint-planning/references/status-view.md
.agents/skills/bmad-sprint-planning/references/validate.md
.agents/skills/bmad-sprint-planning/scripts/sprint_plan.py
.agents/skills/bmad-sprint-planning/scripts/tests/test_sprint_plan.py
.agents/skills/bmad-sprint-planning/sprint-status-template.yaml
.agents/skills/bmad-ux/SKILL.md
.agents/skills/bmad-ux/assets/color-themes.md
.agents/skills/bmad-ux/assets/design-directions.md
.agents/skills/bmad-ux/assets/design-example-editorial.md
.agents/skills/bmad-ux/assets/design-example-mobile.md
.agents/skills/bmad-ux/assets/design-example-shadcn.md
.agents/skills/bmad-ux/assets/excalidraw-wireframe.md
.agents/skills/bmad-ux/assets/experience-example-mobile.md
.agents/skills/bmad-ux/assets/experience-example-shadcn.md
.agents/skills/bmad-ux/assets/headless-schemas.md
.agents/skills/bmad-ux/assets/key-screens.md
.agents/skills/bmad-ux/assets/validation-report-template.html
.agents/skills/bmad-ux/customize.toml
.agents/skills/bmad-ux/references/creative-tools.md
.agents/skills/bmad-ux/references/design-md-spec.md
.agents/skills/bmad-ux/references/headless.md
.agents/skills/bmad-ux/references/validate.md
.agents/skills/bmad-walkthrough/SKILL.md
.agents/skills/bmad-walkthrough/customize.toml
.agents/skills/bmad-walkthrough/generate-trail.md
.agents/skills/bmad-walkthrough/step-01-orientation.md
.agents/skills/bmad-walkthrough/step-02-walkthrough.md
.agents/skills/bmad-walkthrough/step-03-detail-pass.md
.agents/skills/bmad-walkthrough/step-04-testing.md
.agents/skills/bmad-walkthrough/step-05-wrapup.md
.env.example
.github/workflows/ci.yml
.gitignore
AGENTS.md
README.md
_bmad/_config/bmad-help.csv
_bmad/_config/files-manifest.csv
_bmad/_config/manifest.yaml
_bmad/_config/skill-manifest.csv
_bmad/bmm/config.yaml
_bmad/bmm/module-help.csv
_bmad/bmm/v6-shims/README.md
_bmad/config.toml
_bmad/config.user.toml
_bmad/core/config.yaml
_bmad/core/module-help.csv
_bmad/core/v6-shims/README.md
_bmad/custom/.gitignore
_bmad/custom/config.toml
_bmad/scripts/config_utils.py
_bmad/scripts/memlog.py
_bmad/scripts/render_skill.py
_bmad/scripts/resolve_config.py
_bmad/scripts/resolve_customization.py
apps/backend/app/__init__.py
apps/backend/app/api/__init__.py
apps/backend/app/api/app.py
apps/backend/app/api/dependencies.py
apps/backend/app/api/routes/__init__.py
apps/backend/app/api/routes/analysis.py
apps/backend/app/api/routes/exports.py
apps/backend/app/api/routes/health.py
apps/backend/app/api/routes/imports.py
apps/backend/app/api/routes/recommendations.py
apps/backend/app/api/routes/reviews.py
apps/backend/app/api/server.py
apps/backend/app/cli.py
apps/backend/app/config.py
apps/backend/app/core/__init__.py
apps/backend/app/core/logging.py
apps/backend/app/infrastructure/__init__.py
apps/backend/app/infrastructure/ingestion/__init__.py
apps/backend/app/infrastructure/ingestion/csv_reader.py
apps/backend/app/infrastructure/llm/__init__.py
apps/backend/app/infrastructure/llm/deepseek_client.py
apps/backend/app/main.py
apps/backend/app/repositories/analysis_run_repository.py
apps/backend/app/repositories/review_repository.py
apps/backend/app/repositories/store.py
apps/backend/app/schemas/__init__.py
apps/backend/app/schemas/api.py
apps/backend/app/schemas/http.py
apps/backend/app/schemas/review.py
apps/backend/app/services/analysis.py
apps/backend/app/services/cases.py
apps/backend/app/services/exports.py
apps/backend/app/services/recommendations.py
apps/backend/app/services/shared/__init__.py
apps/backend/app/services/shared/export_service.py
apps/backend/app/services/task01/__init__.py
apps/backend/app/services/task01/source_index_service.py
apps/backend/app/services/task01/source_service.py
apps/backend/app/services/task02/__init__.py
apps/backend/app/services/task02/analysis_service.py
apps/backend/app/services/task02/case_service.py
apps/backend/app/services/task02/import_service.py
apps/backend/app/services/task02/metrics_service.py
apps/backend/app/services/task02/quality_service.py
apps/backend/app/services/task02/revision_service.py
apps/backend/app/services/task03/__init__.py
apps/backend/app/services/task03/recommendation_service.py
apps/backend/app/services/task03/review_service.py
apps/backend/tests/test_core.py
apps/backend/tests/test_server.py
apps/web/index.html
apps/web/package-lock.json
apps/web/package.json
apps/web/src/.gitkeep
apps/web/src/api/.gitkeep
apps/web/src/api/client.test.ts
apps/web/src/api/client.ts
apps/web/src/api/types.ts
apps/web/src/api/types/analysis.ts
apps/web/src/api/types/common.ts
apps/web/src/api/types/review.ts
apps/web/src/api/types/subject.ts
apps/web/src/api/types/teaching.ts
apps/web/src/app/.gitkeep
apps/web/src/app/App.tsx
apps/web/src/app/hooks/useWorkbench.ts
apps/web/src/components/.gitkeep
apps/web/src/components/MetricBar.tsx
apps/web/src/components/Panel.tsx
apps/web/src/features/.gitkeep
apps/web/src/features/export/ExportPanel.tsx
apps/web/src/features/import/ImportPanel.test.tsx
apps/web/src/features/import/ImportPanel.tsx
apps/web/src/features/task01/components/ObjectivesPanel.tsx
apps/web/src/features/task02/components/ClassPanel.tsx
apps/web/src/features/task02/components/EvidencePanel.tsx
apps/web/src/features/task02/components/QualityPanel.tsx
apps/web/src/features/task02/components/StudentPanel.tsx
apps/web/src/features/task03/components/ReviewPanel.test.tsx
apps/web/src/features/task03/components/ReviewPanel.tsx
apps/web/src/main.tsx
apps/web/src/pages/.gitkeep
apps/web/src/style.css
apps/web/tsconfig.json
apps/web/vite.config.ts
docs/architecture/00-system-overview.md
docs/architecture/01-module-boundaries.md
docs/architecture/02-data-contracts.md
docs/architecture/03-api-contracts.md
docs/architecture/04-data-workflows.md
docs/decisions/ADR-0001-foundation-architecture.md
docs/development/phase-01-baseline-report.md
docs/development/phase-01-foundation-plan.md
docs/development/phase-01-implementation-report.md
pyproject.toml
resources/source_checks.json
```

### 实施后

```text
.agents/skills/bmad-advanced-elicitation/SKILL.md
.agents/skills/bmad-advanced-elicitation/assets/methods.csv
.agents/skills/bmad-advanced-elicitation/customize.toml
.agents/skills/bmad-advanced-elicitation/scripts/pick_methods.py
.agents/skills/bmad-advanced-elicitation/scripts/tests/test_pick_methods.py
.agents/skills/bmad-agent-analyst/SKILL.md
.agents/skills/bmad-agent-analyst/customize.toml
.agents/skills/bmad-agent-architect/SKILL.md
.agents/skills/bmad-agent-architect/customize.toml
.agents/skills/bmad-agent-dev/SKILL.md
.agents/skills/bmad-agent-dev/customize.toml
.agents/skills/bmad-agent-pm/SKILL.md
.agents/skills/bmad-agent-pm/customize.toml
.agents/skills/bmad-agent-ux-designer/SKILL.md
.agents/skills/bmad-agent-ux-designer/customize.toml
.agents/skills/bmad-architecture/SKILL.md
.agents/skills/bmad-architecture/assets/spine-template.md
.agents/skills/bmad-architecture/customize.toml
.agents/skills/bmad-architecture/references/headless.md
.agents/skills/bmad-architecture/references/reviewer-gate.md
.agents/skills/bmad-architecture/scripts/lint_spine.py
.agents/skills/bmad-architecture/scripts/tests/test_lint_spine.py
.agents/skills/bmad-brainstorming/SKILL.md
.agents/skills/bmad-brainstorming/assets/brain-icons.json
.agents/skills/bmad-brainstorming/assets/brain-methods.csv
.agents/skills/bmad-brainstorming/assets/brain-selector.html
.agents/skills/bmad-brainstorming/customize.toml
.agents/skills/bmad-brainstorming/references/converge.md
.agents/skills/bmad-brainstorming/references/finalize.md
.agents/skills/bmad-brainstorming/references/headless.md
.agents/skills/bmad-brainstorming/references/in-chat-techniques.md
.agents/skills/bmad-brainstorming/references/mode-autonomous.md
.agents/skills/bmad-brainstorming/references/mode-facilitator.md
.agents/skills/bmad-brainstorming/references/mode-partner.md
.agents/skills/bmad-brainstorming/references/resume.md
.agents/skills/bmad-brainstorming/scripts/brain.py
.agents/skills/bmad-brainstorming/scripts/tests/test_brain.py
.agents/skills/bmad-build-auto/SKILL.md
.agents/skills/bmad-build-auto/compile-epic-context.md
.agents/skills/bmad-build-auto/customize.toml
.agents/skills/bmad-build-auto/references/claims-check.md
.agents/skills/bmad-build-auto/references/deletion-check.md
.agents/skills/bmad-build-auto/review-prompts/edge-case-hunter.md
.agents/skills/bmad-build-auto/review-prompts/verification-gap.md
.agents/skills/bmad-build-auto/spec-template.md
.agents/skills/bmad-build-auto/step-01-clarify-and-route.md
.agents/skills/bmad-build-auto/step-02-plan.md
.agents/skills/bmad-build-auto/step-03-implement.md
.agents/skills/bmad-build-auto/step-04-review.md
.agents/skills/bmad-build-auto/workflow.md
.agents/skills/bmad-build/SKILL.md
.agents/skills/bmad-build/compile-epic-context.md
.agents/skills/bmad-build/customize.toml
.agents/skills/bmad-build/references/claims-check.md
.agents/skills/bmad-build/references/deletion-check.md
.agents/skills/bmad-build/review-prompts/edge-case-hunter.md
.agents/skills/bmad-build/review-prompts/verification-gap.md
.agents/skills/bmad-build/spec-template.md
.agents/skills/bmad-build/step-01-clarify-and-route.md
.agents/skills/bmad-build/step-02-plan.md
.agents/skills/bmad-build/step-03-implement.md
.agents/skills/bmad-build/step-04-review.md
.agents/skills/bmad-build/step-05-present.md
.agents/skills/bmad-build/step-oneshot.md
.agents/skills/bmad-build/sync-sprint-status.md
.agents/skills/bmad-build/workflow.md
.agents/skills/bmad-code-review/SKILL.md
.agents/skills/bmad-code-review/customize.toml
.agents/skills/bmad-code-review/references/claims-check.md
.agents/skills/bmad-code-review/references/deletion-check.md
.agents/skills/bmad-code-review/review-prompts/edge-case-hunter.md
.agents/skills/bmad-code-review/review-prompts/verification-gap.md
.agents/skills/bmad-code-review/steps/step-01-gather-context.md
.agents/skills/bmad-code-review/steps/step-02-review.md
.agents/skills/bmad-code-review/steps/step-03-triage.md
.agents/skills/bmad-code-review/steps/step-04-present.md
.agents/skills/bmad-correct-course/SKILL.md
.agents/skills/bmad-correct-course/checklist.md
.agents/skills/bmad-correct-course/customize.toml
.agents/skills/bmad-create-epics-and-stories/SKILL.md
.agents/skills/bmad-create-epics-and-stories/customize.toml
.agents/skills/bmad-create-epics-and-stories/steps/step-01-validate-prerequisites.md
.agents/skills/bmad-create-epics-and-stories/steps/step-02-design-epics.md
.agents/skills/bmad-create-epics-and-stories/steps/step-03-create-stories.md
.agents/skills/bmad-create-epics-and-stories/steps/step-04-final-validation.md
.agents/skills/bmad-create-epics-and-stories/templates/epics-template.md
.agents/skills/bmad-customize/SKILL.md
.agents/skills/bmad-customize/scripts/list_customizable_skills.py
.agents/skills/bmad-customize/scripts/tests/test_list_customizable_skills.py
.agents/skills/bmad-deep-recon/SKILL.md
.agents/skills/bmad-deep-recon/assets/research.template.md
.agents/skills/bmad-deep-recon/customize.toml
.agents/skills/bmad-deep-recon/references/draft.md
.agents/skills/bmad-deep-recon/references/finalize.md
.agents/skills/bmad-deep-recon/references/html-briefing.md
.agents/skills/bmad-deep-recon/references/lifecycle.md
.agents/skills/bmad-deep-recon/references/process.md
.agents/skills/bmad-deep-recon/references/run.md
.agents/skills/bmad-deep-recon/references/selection.md
.agents/skills/bmad-deep-recon/references/synthesis.md
.agents/skills/bmad-deep-recon/references/verification.md
.agents/skills/bmad-deep-recon/scripts/recon_kit.py
.agents/skills/bmad-deep-recon/scripts/tests/test_recon_kit.py
.agents/skills/bmad-deep-recon/types/academic-lit.md
.agents/skills/bmad-deep-recon/types/competitive.md
.agents/skills/bmad-deep-recon/types/domain.md
.agents/skills/bmad-deep-recon/types/market.md
.agents/skills/bmad-deep-recon/types/technical.md
.agents/skills/bmad-deep-recon/types/user-voice.md
.agents/skills/bmad-forge-idea/SKILL.md
.agents/skills/bmad-forge-idea/customize.toml
.agents/skills/bmad-forge-idea/scripts/resolve_personas.py
.agents/skills/bmad-forge-idea/scripts/tests/test_resolve_personas.py
.agents/skills/bmad-help/SKILL.md
.agents/skills/bmad-party-mode/SKILL.md
.agents/skills/bmad-party-mode/customize.toml
.agents/skills/bmad-party-mode/references/create-party.md
.agents/skills/bmad-party-mode/references/mode-agent-team.md
.agents/skills/bmad-party-mode/references/mode-auto.md
.agents/skills/bmad-party-mode/references/mode-subagent.md
.agents/skills/bmad-party-mode/references/party-memory.md
.agents/skills/bmad-party-mode/scripts/resolve_party.py
.agents/skills/bmad-party-mode/scripts/tests/test_resolve_party.py
.agents/skills/bmad-prd/SKILL.md
.agents/skills/bmad-prd/assets/headless-schemas.md
.agents/skills/bmad-prd/assets/prd-template.md
.agents/skills/bmad-prd/assets/prd-validation-checklist.md
.agents/skills/bmad-prd/assets/validation-report-template.html
.agents/skills/bmad-prd/customize.toml
.agents/skills/bmad-prd/references/headless.md
.agents/skills/bmad-prd/references/validate.md
.agents/skills/bmad-prfaq/SKILL.md
.agents/skills/bmad-prfaq/agents/artifact-analyzer.md
.agents/skills/bmad-prfaq/agents/web-researcher.md
.agents/skills/bmad-prfaq/assets/prfaq-template.md
.agents/skills/bmad-prfaq/bmad-manifest.json
.agents/skills/bmad-prfaq/customize.toml
.agents/skills/bmad-prfaq/references/customer-faq.md
.agents/skills/bmad-prfaq/references/internal-faq.md
.agents/skills/bmad-prfaq/references/press-release.md
.agents/skills/bmad-prfaq/references/verdict.md
.agents/skills/bmad-product-brief/SKILL.md
.agents/skills/bmad-product-brief/assets/brief-template.md
.agents/skills/bmad-product-brief/customize.toml
.agents/skills/bmad-project-context/SKILL.md
.agents/skills/bmad-project-context/customize.toml
.agents/skills/bmad-project-context/references/best-practices.md
.agents/skills/bmad-project-context/references/template.md
.agents/skills/bmad-qa-generate-e2e-tests/SKILL.md
.agents/skills/bmad-qa-generate-e2e-tests/checklist.md
.agents/skills/bmad-qa-generate-e2e-tests/customize.toml
.agents/skills/bmad-retrospective/SKILL.md
.agents/skills/bmad-retrospective/customize.toml
.agents/skills/bmad-retrospective/references/acceptance-verdict.md
.agents/skills/bmad-retrospective/references/aggregate-views.md
.agents/skills/bmad-retrospective/references/evidence-gathering.md
.agents/skills/bmad-retrospective/references/retro-document.md
.agents/skills/bmad-retrospective/references/team-discussion.md
.agents/skills/bmad-retrospective/scripts/git_evidence.py
.agents/skills/bmad-retrospective/scripts/sprint_status.py
.agents/skills/bmad-retrospective/scripts/tests/fixtures/sprint-status-template.yaml
.agents/skills/bmad-retrospective/scripts/tests/test_git_evidence.py
.agents/skills/bmad-retrospective/scripts/tests/test_sprint_status.py
.agents/skills/bmad-review/SKILL.md
.agents/skills/bmad-review/customize.toml
.agents/skills/bmad-review/references/editorial-common.md
.agents/skills/bmad-review/references/lens-adversarial.md
.agents/skills/bmad-review/references/lens-edge-case-hunter.md
.agents/skills/bmad-review/references/lens-prose.md
.agents/skills/bmad-review/references/lens-structure.md
.agents/skills/bmad-review/references/lens-verification-gap.md
.agents/skills/bmad-review/references/structure-models.md
.agents/skills/bmad-review/scripts/tests/test_word_metrics.py
.agents/skills/bmad-review/scripts/word_metrics.py
.agents/skills/bmad-spec/SKILL.md
.agents/skills/bmad-spec/assets/headless-schemas.md
.agents/skills/bmad-spec/assets/spec-template.md
.agents/skills/bmad-spec/assets/stories-schema.md
.agents/skills/bmad-spec/customize.toml
.agents/skills/bmad-sprint-planning/SKILL.md
.agents/skills/bmad-sprint-planning/customize.toml
.agents/skills/bmad-sprint-planning/references/fix-sprint-status.md
.agents/skills/bmad-sprint-planning/references/generate-tracking.md
.agents/skills/bmad-sprint-planning/references/readiness-gate.md
.agents/skills/bmad-sprint-planning/references/status-view.md
.agents/skills/bmad-sprint-planning/references/validate.md
.agents/skills/bmad-sprint-planning/scripts/sprint_plan.py
.agents/skills/bmad-sprint-planning/scripts/tests/test_sprint_plan.py
.agents/skills/bmad-sprint-planning/sprint-status-template.yaml
.agents/skills/bmad-ux/SKILL.md
.agents/skills/bmad-ux/assets/color-themes.md
.agents/skills/bmad-ux/assets/design-directions.md
.agents/skills/bmad-ux/assets/design-example-editorial.md
.agents/skills/bmad-ux/assets/design-example-mobile.md
.agents/skills/bmad-ux/assets/design-example-shadcn.md
.agents/skills/bmad-ux/assets/excalidraw-wireframe.md
.agents/skills/bmad-ux/assets/experience-example-mobile.md
.agents/skills/bmad-ux/assets/experience-example-shadcn.md
.agents/skills/bmad-ux/assets/headless-schemas.md
.agents/skills/bmad-ux/assets/key-screens.md
.agents/skills/bmad-ux/assets/validation-report-template.html
.agents/skills/bmad-ux/customize.toml
.agents/skills/bmad-ux/references/creative-tools.md
.agents/skills/bmad-ux/references/design-md-spec.md
.agents/skills/bmad-ux/references/headless.md
.agents/skills/bmad-ux/references/validate.md
.agents/skills/bmad-walkthrough/SKILL.md
.agents/skills/bmad-walkthrough/customize.toml
.agents/skills/bmad-walkthrough/generate-trail.md
.agents/skills/bmad-walkthrough/step-01-orientation.md
.agents/skills/bmad-walkthrough/step-02-walkthrough.md
.agents/skills/bmad-walkthrough/step-03-detail-pass.md
.agents/skills/bmad-walkthrough/step-04-testing.md
.agents/skills/bmad-walkthrough/step-05-wrapup.md
.env.example
.github/workflows/ci.yml
.gitignore
AGENTS.md
README.md
_bmad/_config/bmad-help.csv
_bmad/_config/files-manifest.csv
_bmad/_config/manifest.yaml
_bmad/_config/skill-manifest.csv
_bmad/bmm/config.yaml
_bmad/bmm/module-help.csv
_bmad/bmm/v6-shims/README.md
_bmad/config.toml
_bmad/config.user.toml
_bmad/core/config.yaml
_bmad/core/module-help.csv
_bmad/core/v6-shims/README.md
_bmad/custom/.gitignore
_bmad/custom/config.toml
_bmad/scripts/config_utils.py
_bmad/scripts/memlog.py
_bmad/scripts/render_skill.py
_bmad/scripts/resolve_config.py
_bmad/scripts/resolve_customization.py
apps/backend/alembic.ini
apps/backend/alembic/env.py
apps/backend/alembic/script.py.mako
apps/backend/alembic/versions/da812b1d5423_create_domain_database.py
apps/backend/app/__init__.py
apps/backend/app/api/__init__.py
apps/backend/app/api/app.py
apps/backend/app/api/dependencies.py
apps/backend/app/api/routes/__init__.py
apps/backend/app/api/routes/analysis.py
apps/backend/app/api/routes/exports.py
apps/backend/app/api/routes/health.py
apps/backend/app/api/routes/imports.py
apps/backend/app/api/routes/recommendations.py
apps/backend/app/api/routes/reviews.py
apps/backend/app/api/server.py
apps/backend/app/cli.py
apps/backend/app/config.py
apps/backend/app/core/__init__.py
apps/backend/app/core/logging.py
apps/backend/app/domain/__init__.py
apps/backend/app/domain/assessment/__init__.py
apps/backend/app/domain/assessment/analysis_run.py
apps/backend/app/domain/assessment/models.py
apps/backend/app/domain/common/__init__.py
apps/backend/app/domain/common/enums.py
apps/backend/app/domain/common/exceptions.py
apps/backend/app/domain/student/__init__.py
apps/backend/app/domain/student/models.py
apps/backend/app/domain/subject/__init__.py
apps/backend/app/domain/subject/models.py
apps/backend/app/domain/teaching/__init__.py
apps/backend/app/domain/teaching/models.py
apps/backend/app/infrastructure/__init__.py
apps/backend/app/infrastructure/database/__init__.py
apps/backend/app/infrastructure/database/base.py
apps/backend/app/infrastructure/database/engine.py
apps/backend/app/infrastructure/database/models.py
apps/backend/app/infrastructure/database/session.py
apps/backend/app/infrastructure/ingestion/__init__.py
apps/backend/app/infrastructure/ingestion/csv_reader.py
apps/backend/app/infrastructure/llm/__init__.py
apps/backend/app/infrastructure/llm/deepseek_client.py
apps/backend/app/infrastructure/migration/__init__.py
apps/backend/app/infrastructure/migration/json_to_sqlite.py
apps/backend/app/main.py
apps/backend/app/repositories/analysis_run_repository.py
apps/backend/app/repositories/protocols.py
apps/backend/app/repositories/response_repository.py
apps/backend/app/repositories/review_repository.py
apps/backend/app/repositories/store.py
apps/backend/app/repositories/student_repository.py
apps/backend/app/repositories/subject_repository.py
apps/backend/app/schemas/__init__.py
apps/backend/app/schemas/api.py
apps/backend/app/schemas/http.py
apps/backend/app/schemas/review.py
apps/backend/app/services/analysis.py
apps/backend/app/services/cases.py
apps/backend/app/services/exports.py
apps/backend/app/services/recommendations.py
apps/backend/app/services/shared/__init__.py
apps/backend/app/services/shared/export_service.py
apps/backend/app/services/task01/__init__.py
apps/backend/app/services/task01/source_index_service.py
apps/backend/app/services/task01/source_service.py
apps/backend/app/services/task02/__init__.py
apps/backend/app/services/task02/analysis_service.py
apps/backend/app/services/task02/case_service.py
apps/backend/app/services/task02/import_service.py
apps/backend/app/services/task02/metrics_service.py
apps/backend/app/services/task02/quality_service.py
apps/backend/app/services/task02/revision_service.py
apps/backend/app/services/task03/__init__.py
apps/backend/app/services/task03/recommendation_service.py
apps/backend/app/services/task03/review_service.py
apps/backend/tests/test_core.py
apps/backend/tests/test_phase02.py
apps/backend/tests/test_server.py
apps/web/index.html
apps/web/package-lock.json
apps/web/package.json
apps/web/src/.gitkeep
apps/web/src/api/.gitkeep
apps/web/src/api/client.test.ts
apps/web/src/api/client.ts
apps/web/src/api/types.ts
apps/web/src/api/types/analysis.ts
apps/web/src/api/types/common.ts
apps/web/src/api/types/review.ts
apps/web/src/api/types/subject.ts
apps/web/src/api/types/teaching.ts
apps/web/src/app/.gitkeep
apps/web/src/app/App.tsx
apps/web/src/app/hooks/useWorkbench.ts
apps/web/src/components/.gitkeep
apps/web/src/components/MetricBar.tsx
apps/web/src/components/Panel.tsx
apps/web/src/features/.gitkeep
apps/web/src/features/export/ExportPanel.tsx
apps/web/src/features/import/ImportPanel.test.tsx
apps/web/src/features/import/ImportPanel.tsx
apps/web/src/features/task01/components/ObjectivesPanel.tsx
apps/web/src/features/task02/components/ClassPanel.tsx
apps/web/src/features/task02/components/EvidencePanel.tsx
apps/web/src/features/task02/components/QualityPanel.tsx
apps/web/src/features/task02/components/StudentPanel.tsx
apps/web/src/features/task03/components/ReviewPanel.test.tsx
apps/web/src/features/task03/components/ReviewPanel.tsx
apps/web/src/main.tsx
apps/web/src/pages/.gitkeep
apps/web/src/style.css
apps/web/tsconfig.json
apps/web/vite.config.ts
docs/architecture/00-system-overview.md
docs/architecture/01-module-boundaries.md
docs/architecture/02-data-contracts.md
docs/architecture/03-api-contracts.md
docs/architecture/04-data-workflows.md
docs/architecture/05-domain-models.md
docs/architecture/06-database-design.md
docs/architecture/07-json-migration-plan.md
docs/decisions/ADR-0001-foundation-architecture.md
docs/decisions/ADR-0002-domain-sqlite-local-workflow.md
docs/development/phase-01-baseline-report.md
docs/development/phase-01-foundation-plan.md
docs/development/phase-01-implementation-report.md
docs/development/phase-02-baseline-report.md
docs/development/phase-02-implementation-report.md
pyproject.toml
resources/source_checks.json
```
