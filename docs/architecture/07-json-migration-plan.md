# 07 — JSON 到 SQLite 迁移计划

## 源数据形态

旧目录为 `data/current.txt` 和 `data/<run_id>/{analysis.json,reviews.json?}`。扫描器检查所有目录：命名不合法但含 analysis/reviews 文件的疑似运行目录会失败；合法 run ID 目录缺少 analysis JSON 会失败；坏 JSON、快照根节点类型、必需的 `students`/`objectives`/`items`/`nodes`/`responses` 数组缺失或类型错误、可选 `raw_responses` 数组类型错误、重复实体 ID、目录/run_id 对应关系、当前指针及复核键/连续版本会在写库前校验。旧快照可缺少 `raw_responses`，此时迁移沿用 `responses` 作为原始作答来源；缺少 reviews 文件表示该运行无复核。历史快照中 `observations`、`source_index`、`source_root`、`source_files` 等非核心投影字段仍保持可选。

本地核验的历史共有 5 个快照，规则版本 v1/v2。最早历史快照没有 `observations`、`source_index`、`source_root`、`source_files` 全部字段；其余快照也有字段逐步添加。迁移不重算历史数据、不修改原文件；数据库内 `snapshot_json` 保存原始 UTF-8 文本。旧快照的 API 读取投影会在内存中补充空 observations/source_index/source_files 与空 source_root，不写回数据库。这样旧 ZIP 导出按现有字段运行。

## 安全执行

运行 `python -m app.cli migrate-json-to-sqlite`（可配 `--data-dir`、`--database-url`、`--backup-dir`）。JSON source、SQLite database、backup 三条路径分别解析；更改 data-dir 不会改变默认 DB（仓库根 `data/smart_learning.db`）。CLI 在目标检查前创建原子更新的 `migration-report.json`，并只读检查目标 SQLite integrity/FK、精确表及列集合、Alembic head revision、逐表记录数和 current pointer。已存在 DB 仍需 `--confirm-existing-database`；非空 DB 默认拒绝，只有再指定 `--allow-nonempty-database` 才可合并。opt-in 只允许目标 schema/revision 兼容且没有 incoming run snapshot、Review version 或 current pointer 冲突；完全相同的既有 run/review 可按幂等规则复用。所有拒绝都会写入失败报告，且在备份、schema upgrade 或数据写入前不修改 DB/source。预检通过后源文件备份保留 JSON 与其他数据文件，但排除目标 SQLite 主文件及其 `-wal`/`-shm` 旁文件；这些 SQLite 文件只通过单独的 SQLite backup API 做一致性备份，排除清单写入迁移报告。源文件备份逐文件核验 hash；随后执行 Alembic upgrade，再由 CLI 注入 Application UoW factory，单个 UoW 事务导入所有 run/review、current pointer 并核对快照、ORM 投影计数、复核数量和源 JSON hash。迁移适配器不依赖 `Store` 或 SQLAlchemy 实现。原 JSON 不删除。目标备份目录应是独立位置；请选择新的 DB 文件路径进行首次迁移。

建议正式迁移前在数据副本运行相同命令并检查输出。真实数据目录只有在仓库外备份核验成功后才允许迁移。迁移报告需记录备份位置、文件/hash/运行/复核计数、当前 run ID、验证结果。历史 JSON 保持原样只读作为恢复与审计材料；正常服务仅读写 SQLite，不双写 JSON。

## 幂等与故障恢复

运行以 run_id 幂等；相同 run_id 但不同快照会报冲突。复核以 `(run_id, student_id, indicator_id, version)` 幂等，完全相同版本重复执行不重复插入，内容冲突则失败。JSON 数据与 current pointer 在一个 UoW 事务中整体提交；事务中任一记录/核验失败会回滚全部业务数据。Alembic schema upgrade 位于该数据事务之前，因此迁移失败时数据库可能保留已升级 schema。报告记录最后开始/完成阶段和错误类别；若进程在报告更新前突然终止，报告状态会停留在 `schema_upgrade_started` 或 `data_migration_started`。可保留该数据库供诊断，完成目标/备份核验后用显式确认参数重跑；导入按 run/review 身份幂等，数据事务重新提交前仍完整核验。

CLI 迁移当前对数据库的 schema 升级是显式动作。常规应用启动只连接既有 schema，不自动运行 Alembic。生产切换后 JSON 为只读备份，不能作为第二个在线数据源。
