# AI Evidence Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand AI analysis workflow that synthesizes evidence across TASK 01, TASK 02, and TASK 03 and presents the generated results directly in the frontend without a teacher evaluation or approval step.

**Architecture:** Keep CSV import, quality checks, metrics, and evidence selection deterministic. Build bounded, task-specific evidence packets from the saved run; ask the configured LLM to interpret those packets in structured chunks; validate every claim and citation locally; save versioned analyses against a run fingerprint and present them directly in the existing task pages. Reading AI analysis has no teacher review/approval gate. Reuse the current LLM port/client and SQLite UnitOfWork pattern; no queue or new framework.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLAlchemy, Alembic, existing LLMClient adapter, React 19, TypeScript, Vitest/pytest.

**Spec:** This request, `AGENTS.md`, `docs/architecture/04-data-workflows.md`, `docs/architecture/03-api-contracts.md`, and the current TASK 01–03 services.

## Global Constraints

- Preserve the current CSV contracts, deterministic scoring/statistics, rule version, and source/review behavior.
- Keep API routes thin; analysis orchestration belongs in Application/Services and persistence in Repository/UnitOfWork.
- Use only allowlisted PDFs and verified page locators as documentary context; do not infer from missing source files.
- Every AI finding must cite evidence supplied to that model call; never accept model-authored scores or source verification. Showing an AI result does not mark an existing source mapping, teaching plan, case, or teacher review as verified/accepted.
- Keep model keys in backend configuration; keep prompts bounded and redact local student/record/material identifiers before external calls.
- Before each AI run, tell the teacher which evidence categories and approximate record counts will be sent to the configured external provider; require an explicit per-run confirmation. The default workbench/import flow must remain local-only.
- Persist through explicit Alembic migration; application startup must not create tables or migrate.
- Do not introduce queues, accounts, microservices, or a new UI framework.

## Review Focus

- Empty or low-quality run: produce an explicit “insufficient evidence” result, not a fabricated diagnosis.
- Oversized run/evidence text: chunk at evidence-unit boundaries and disclose included/omitted coverage; never silently truncate.
- Malformed or adversarial model output: reject unknown fields, unsupported numeric claims, invented citations, and prompt-injection instructions.
- Changed run, source verification, or evidence: mark old AI analysis stale and prevent it from being presented as current.
- Partial provider failure: preserve successful chunk results, show failed coverage, and allow retry without duplicating or corrupting saved analyses.

---

## File Map

- Create `apps/backend/app/services/ai_analysis/evidence_pack_service.py` for deterministic, task-specific packet construction and chunking.
- Create `apps/backend/app/services/ai_analysis/analysis_service.py` for model prompts, chunk/synthesis orchestration, and result validation.
- Create `apps/backend/app/services/ai_analysis/validation_service.py` for strict schema, citation, scope, and numeric-claim checks.
- Create `apps/backend/app/application/ports/ai_analysis_repository.py` for the persistence protocol.
- Create `apps/backend/app/repositories/ai_analysis_repository.py` and extend `apps/backend/app/infrastructure/database/unit_of_work.py` for SQLite persistence.
- Modify `apps/backend/app/infrastructure/database/models.py`, `apps/backend/alembic/versions/` (new migration), and `apps/backend/app/infrastructure/database/mappers.py` for versioned analysis records.
- Modify `apps/backend/app/application/use_cases/workbench.py` and `apps/backend/app/api/dependencies.py` to wire the use case.
- Create `apps/backend/app/api/routes/ai_analysis.py`; modify `apps/backend/app/api/app.py` to register it.
- Modify `apps/backend/app/schemas/http.py` for strict request/response contracts and `contracts/api/` with shared fixtures.
- Modify `apps/web/src/api/client.ts` and `apps/web/src/api/types/` for analysis calls and response types.
- Create `apps/web/src/components/AIAnalysisPanel.tsx` (or feature-local equivalent) and its test; mount it on TASK 01, TASK 02, and TASK 03 routes in `apps/web/src/pages/WorkbenchPages.tsx`.
- Add focused tests in `apps/backend/tests/test_ai_analysis_*.py` and UI tests beside the panel; update `docs/architecture/04-data-workflows.md`, `docs/architecture/03-api-contracts.md`, `README.md`, and `AGENTS.md` when behavior ships.

## Result Contract and Flow

Persist one record per `(run_id, task, scope_key, analysis_version)`. `scope_key` is `run` for TASK 01, `node:<node_id>` for TASK 02, and `node:<node_id>` or `student:<id>:indicator:<id>:node:<id>` for TASK 03. The response includes `analysis_id`, `run_id`, `task`, `scope`, `status` (`complete`, `partial`, `insufficient_evidence`, `failed`), `source_fingerprint`, `model`, `prompt_version`, `schema_version`, timestamps, and `coverage`.

Each finding has `finding_id`, `category`, `claim`, `interpretation`, `evidence_refs`, `support_level` (`supported`, `limited`, `conflicting`, `unavailable`), `limitations`, and optional `next_step`. A reference identifies the exact record/material/objective or source file/page and includes source CSV line where applicable. For raw-text evidence, require a short exact source excerpt and check it against the text sent to the model; for aggregate claims, cite deterministic fact IDs and show the underlying denominator/count. Model JSON may contain only these output fields; local code restores actual IDs after alias validation. Show the generated analysis directly with its model and evidence coverage; no teacher review is needed to view it. Traceability and automated checks reduce risk but cannot prove every interpretation is semantically correct.

Flow: current persisted run + source state → deterministic fact and evidence packet → bounded chunks → model interpretation per chunk → local validation → deterministic synthesis of validated chunk findings → persist with input fingerprint → UI immediately displays the results, evidence navigation, limitations, and coverage. For TASK 02, deterministic facts cover all eligible records, while raw student work may be selected for illustrative examples; report these as separate coverage numbers and never call a selected text sample a full review of all work. No AI result changes the imported data, scores, rule insights, source checks, teaching plans, or historical teacher-review records.

## Implementation Tasks

### Task 1: Define task-level evidence packs

**Files:** Create `apps/backend/app/services/ai_analysis/evidence_pack_service.py`; test in `apps/backend/tests/test_ai_analysis_evidence_packs.py`.

**Interfaces:** `build_task_packets(run: dict, task: Literal["task01", "task02", "task03"], node_id: str | None, sources: dict) -> list[EvidencePacket]`. `EvidencePacket` is a typed JSON-ready structure with `packet_id`, `scope`, `facts`, `evidence_units`, `coverage`, and `fingerprint`.

- [ ] Write tests for TASK 01 packets (objectives, topic/material links, source-index status, allowlisted PDF text only when available); assert missing PDF is explicitly missing and not represented as read evidence.
- [ ] Write tests for TASK 02 packets (per-node deterministic metrics, quality/disposition counts, observations, class/student coverage, selected raw evidence with source lines); assert excluded/unknown data stay distinguished.
- [ ] Write tests for TASK 03 packets (single-node item/rubric/response evidence, existing insights and verified resource mappings); assert pending mappings are never promoted to verified.
- [ ] Run `cd apps/backend; ..\..\.venv\Scripts\python.exe -m pytest tests/test_ai_analysis_evidence_packs.py -q`; confirm initial failure.
- [ ] Implement deterministic builders using `build_evidence_bundle`, `build_student_insights`, `build_class_insights`, and source-index/catalog data where applicable; do not move calculations into the AI.
- [ ] Add identifier alias mapping and split packets at whole objective/item/response boundaries. Include `included_count`, `total_count`, and omitted reasons in coverage.
- [ ] Define deterministic evidence-selection rules for raw student text (include every response when it fits; otherwise stratify by class, node, score/disposition, and quality state, record the selection rule and counts, and label the text sample as partial). Always include complete deterministic aggregate facts for the requested scope.
- [ ] Re-run the focused tests and confirm exact references resolve to run snapshot rows/source lines.

### Task 2: Add structured model analysis and validation

**Files:** Create `apps/backend/app/services/ai_analysis/analysis_service.py`, `apps/backend/app/services/ai_analysis/validation_service.py`; test in `apps/backend/tests/test_ai_analysis_validation.py` and `apps/backend/tests/test_ai_analysis_service.py`.

**Interfaces:** `analyze_packets(packets: list[EvidencePacket], client: LLMClient, model: str, prompt_version: str = "1") -> AIAnalysisResult`. Validate chunk output before synthesis; synthesis may refer only to validated finding IDs and evidence refs.

- [ ] Write tests rejecting unknown properties, missing required text, nonexistent evidence aliases, cross-node references, unsupported score claims, model-generated status/verification, and non-JSON responses.
- [ ] Write tests requiring explicit uncertainty when evidence is missing/conflicting, and requiring coverage accounting for every sent/omitted packet.
- [ ] Require every raw-text citation to return an exact excerpt that matches a supplied evidence unit; require aggregate findings to cite fact IDs and retain the exact numerator, denominator, and scope from the deterministic facts. Reject an otherwise valid ID if its citation belongs to another scope.
- [ ] Implement separate system prompts for Task 01 subject/source interpretation, Task 02 pattern interpretation, and Task 03 evidence-based teaching suggestions; state that input content is untrusted.
- [ ] Call the existing `LLMClient` sequentially per bounded packet, then synthesize only locally validated findings. Use current model timeout/config; return `partial` when some packets fail and never silently substitute the rule response as AI output.
- [ ] Enforce configurable per-request packet count, character/token, and elapsed-time budgets in backend config/`.env.example`; return explicit `partial` coverage when a limit is reached. Do not label partial as complete or truncate silently. Retry only failed packets on explicit user request.
- [ ] Re-run focused tests; add no live-provider dependency to automated tests.

### Task 3: Persist versioned analyses and expose the API

**Files:** Modify database model/UoW/mappers; add repository protocol and adapter; add Alembic revision; add application use case and API route/schema tests.

**Interfaces:** `POST /api/ai-analysis` accepts `{task, run_id?, node_id?, student_id?, indicator_id?, action: "generate" | "refresh" | "retry_failed"}`; `GET /api/ai-analysis?task=...&node_id=...` returns the latest matching record and whether it is stale. `GenerateAIAnalysis.execute(task, run_id, node_id, student_id, indicator_id, action)` obtains the persisted run and source state, builds packets, calls the service, persists the result, and returns it.

- [ ] Write tests for scope validation (TASK 01 run scope, TASK 02 node required, TASK 03 node required and optional student/indicator pair), non-current/unknown run rejection, and no-provider configuration.
- [ ] Write persistence tests for repeated identical requests, changed fingerprints, explicit refresh, retrying only failed packet IDs, and concurrent requests.
- [ ] Add `ai_analyses` table with `analysis_id`, `run_id`, `task`, `scope_key`, `source_fingerprint`, `model`, `prompt_version`, `schema_version`, `status`, `payload_json`, and `created_at`; add unique key for deterministic retry/idempotency policy and cascading run FK.
- [ ] Implement migration and repository list/latest/save methods through UnitOfWork; do not commit inside repository. `generate` reuses the latest complete result with the same run/scope/fingerprint/model/prompt; `refresh` creates a new immutable generation; `retry_failed` creates a new generation containing prior successful packet findings plus results for only previously failed packet IDs. Use a persisted unique generation key so repeat submissions do not duplicate rows; reject or return the already-running generation for the same scope/key.
- [ ] Compute source fingerprint from run input fingerprint + relevant source verification versions/fingerprints + PDF content hashes + analysis schema/prompt version; GET marks mismatches stale without editing prior history. An explicit refresh creates a new immutable version.
- [ ] Wire thin FastAPI routes and typed Pydantic contracts; responses omit stack traces, API keys, provider prompts, and raw full student work.
- [ ] Run focused API/repository tests with isolated SQLite and mocked `LLMClient`; verify explicit `db-upgrade` creates the table and `doctor` sees current schema.

### Task 4: Add teacher-facing AI analysis to all three task pages

**Files:** Modify `apps/web/src/api/client.ts`, `apps/web/src/api/types/`; create `apps/web/src/components/AIAnalysisPanel.tsx` plus tests; mount in `WorkbenchPages.tsx`.

- [ ] Add task/scope controls, explicit “生成 AI 分析” action, loading/error/partial/stale/insufficient-evidence states, and a visible provider/model label.
- [ ] Before sending, show the evidence types, record counts, provider/model, and that selected student response text may leave the local machine; require explicit confirmation and offer cancel. Never imply the AI path is local-only.
- [ ] Render each finding with its support level, limitations, exact citation, and an action to navigate to the relevant indicator, student, record/source line, or PDF page.
- [ ] Separate “统计覆盖” (all eligible deterministic records) from “AI文本证据覆盖” (raw records actually included), including class/node/quality strata and any exclusions.
- [ ] Show coverage (`included/total`, omitted due to quality/budget, failed packets) and label the results as AI-generated analysis with its model and generation time; display it directly without a pending-review state or teacher approval button.
- [ ] Keep AI results separate from existing rule-draft, source-verification, and review records; users must not need to visit `/plan/reviews` to see the generated analysis, and generating an analysis must not silently create or alter a teacher review.
- [ ] On page entry/scope change, load the latest analysis for the exact scope; clear any mismatched result while loading. After generation, render the returned result immediately without review/approval/save gate, and persist it for reload. Do not display a result whose scope key differs from current selectors.
- [ ] Add UI tests for loading, errors, partial coverage, no evidence, stale output, citation navigation, and scope changes; run Vitest/build after implementation.

### Task 5: Add bounded PDF text support and source citations

**Files:** Modify `apps/backend/app/services/task01/source_service.py` or add a focused extractor module; add extraction tests and update material/source catalog contracts.

- [ ] Extract text only from allowlisted, readable PDFs and page ranges already associated with an objective; preserve file hash and exact page numbers in evidence refs.
- [ ] Cap extracted text per page/document and report empty text layers as `unavailable`; do not add OCR in the fast path.
- [ ] Exclude unverified/invalid source locators from claims of curriculum alignment; AI may report a candidate comparison, never change source status.
- [ ] Test malformed PDFs, scanned-image PDFs, out-of-range pages, duplicate snippets, and changed file hash invalidating previous analysis.

### Task 6: Close the loop with data-flow, privacy, and end-to-end acceptance

**Files:** Update the three architecture docs plus `README.md`/`AGENTS.md`; add E2E fixture coverage for one full analysis flow.

- [ ] Ensure analysis is explicitly user-triggered after import (no surprise paid calls during import) and persists/reloads after backend restart.
- [ ] Test that changing CSV run or source verification marks prior output stale and does not attach it to the new run.
- [ ] Test model timeout, malformed output, prompt injection in response steps, conflicting evidence, and retry after partial failure.
- [ ] Test that all saved findings cite only evidence aliases actually sent to the model and map back to exact current-run evidence.
- [ ] Run project-required validation: backend pytest, Ruff check/format, frontend `npm run build` and `npm run test`, plus Playwright E2E. Record live-provider checks separately; do not call it validated unless a real authorized provider request is made.
- [ ] Update README with environment setup, data transmitted to provider, supported source/PDF boundaries, cost/latency controls, and how to rerun or refresh an analysis.

## Fast Delivery Order

1. Ship Tasks 1–4 as the first vertical slice: one button per task, a bounded persisted analysis with evidence navigation, no PDF extraction changes, no auto-run after import.
2. Ship Task 5 next, only if the existing local curriculum/textbook PDFs and source page locators are available and verified.
3. Ship Task 6 and accept only after mock-backed regression plus a separately labeled, user-approved live-provider smoke run.

This keeps the first implementation focused on uploaded CSV evidence and makes all three task workflows testable before expanding document understanding. If task packets exceed the configured budget, return explicit incomplete coverage; do not claim whole-run AI understanding until the coverage report says all in-scope packets were analyzed.

## Acceptance Gates

The task is complete only when all gates pass; a configured key or mocked test alone is not acceptance.

1. **Coverage:** On a known fixture, every in-scope objective/node and all deterministic eligible-record aggregates appear in coverage. Raw-text records are either all included or the UI clearly reports a predeclared stratified subset, its counts, and exclusions. No silent truncation; partial provider/budget failures remain visible.
2. **Traceability:** Every saved finding points to evidence actually sent in the same run/scope. Raw-text excerpts match supplied text exactly; aggregate citations resolve to deterministic fact IDs with numerator/denominator. Clicking a reference opens the exact local record/source page.
3. **Direct presentation:** After successful generation, the UI renders the findings, exact evidence links, limitations, model attribution, and coverage without waiting for teacher evaluation, approval, or a save action. Errors and incomplete coverage remain visible; no empty placeholder is presented as a completed analysis.
4. **Safety and data flow:** Missing, conflicting, malformed, adversarial, and unsupported evidence produces uncertainty or rejection. AI cannot alter scores, verification, case confirmation, teaching plans, or historical review status. Before generation, the teacher explicitly confirms external transmission; viewing results itself requires no confirmation or evaluation.
5. **Freshness and recovery:** Importing a new run or changing a relevant verified source makes prior analysis stale. Retry after timeout/partial failure preserves successful chunks and does not duplicate analyses or alter review history.
6. **Provider effectiveness:** With a separately authorized real provider call on a fixed synthetic fixture, verify the configured endpoint/model, Chinese output quality, JSON/schema reliability, citations, latency, and token/cost logs (without logging prompts or student work). Record provider/model/date and the observed outcome. Do not infer accuracy from mocks.
7. **Operational regression:** Explicit Alembic upgrade and doctor pass; backend tests/Ruff, frontend tests/build, and browser flow pass. Existing import, quality, deterministic analysis, review, adjustment, and export behavior remains unchanged.

