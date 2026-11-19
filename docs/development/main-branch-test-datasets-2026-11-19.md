# 测试数据集矩阵（2026-11-19）

本矩阵映射清单 BASE-07 要求的数据集与当前可重现 fixture。所有自动化测试使用 pytest `tmp_path`，不写日常 `data/smart_learning.db`。本轮额外运行的数据库位于 `%LOCALAPPDATA%\Temp\smart-learning-audit-20261119-current`；Playwright 使用唯一 run ID 的 `data/playwright-*`。

| 数据集类别 | fixture / 测试 | 文件或位置 | 当前证据 | 备注 |
|---|---|---|---|---|
| 空库 | `test_alembic_empty_upgrade_repeat_and_consistent_restore`；本轮独立 `db-upgrade` 双跑 | pytest `tmp_path`；`%LOCALAPPDATA%\Temp\smart-learning-audit-20261119-current\env02-fresh.sqlite` | 两次升级到 `b2f4d2a8c1e0`；14 表；SQLite integrity ok、foreign key check 空 | 隔离临时 SQLite |
| 最小正常样本 | `sample_tables()` / `_tables()`；`test_http_import_through_review_and_export` | Python 内存表与 pytest `tmp_path` | 业务分析、Review、导出往返回归通过 | 小型确定性夹具 |
| 赛事公开六 CSV | `test_public_bundle_if_available` | `D:/工作台/智慧学伴-比赛项目/【赛题材料】智慧学伴/赛题数据/赛题资料包/4_赛题数据/模拟学情数据` | 本轮测试通过；806 原始行、799 事件、786 scored；独立聚合 744/1304 | 源文件只读；六 CSV SHA 在阶段报告记录 |
| 版本冲突/多修订 | `test_event_identity_conflict_is_excluded`、`test_invalid_revision_quarantines_event_without_fallback`、`test_duplicate_lower_revision_quarantines_whole_event`、`test_unorderable_revisions_quarantine_each_raw_row_once` | 由测试直接构造 CSV 行/表 | 冲突事件隔离、原始行处置唯一 | pytest `tmp_path` 或内存 fixture |
| 跨节点样本 | `test_task03_requires_scope_when_indicator_spans_nodes`、`test_cross_node_draft_requires_explicit_node_and_does_not_call_model`、`test_student_and_class_node_metrics_use_disjoint_node_records` | N01/N02 或 N01/N04 合成行 | 无范围请求被门控；节点指标记录隔离 | 不混合题集作进步判断 |
| 部分缺失/异常样本 | `test_failed_import_keeps_current_run`、malformed CSV / missing required column / bad UTF-8 HTTP tests、`test_node_observation_distinguishes_zero_from_empty_or_invalid_denominators` | pytest `tmp_path`、内存行 | 导入失败不更换 current run；异常/空分母状态有独立断言 | 覆盖编码、列、语法、评分边界 |
| 历史 JSON 迁移样本 | `test_json_migration_is_idempotent_lossless_and_restores_current`、`test_migration_report_survives_failure_and_retry_completes_atomically`、`test_json_migration_rolls_back_all_runs_on_mid_batch_failure` | pytest `tmp_path` 中生成的旧 JSON snapshot/reviews | 幂等、保真、失败重试和回滚测试均在后端全套 121 passed 内 | migration symlink 独立测试受 Windows 权限限制 skip |

本矩阵说明 fixture 的种类与位置，不表示该类别所有生产规模/人工内容已验收；详细条目状态见 [main 分支全面核验追踪矩阵](main-branch-checklist-matrix-2026-11-19.md)。
