# 07 — JSON 到 SQLite 迁移计划

## 源数据形态

旧目录为 `data/current.txt` 和 `data/<run_id>/{analysis.json,reviews.json?}`。迁移工具不以示例目录结构替代实际目录：只发现合法 run ID 目录内的 analysis JSON，校验 JSON、目录/run_id 对应关系、当前指针以及复核键/连续版本。缺少 reviews 文件表示该运行无复核。

本地核验的历史共有 5 个快照，规则版本 v1/v2。最早历史快照没有 `observations`、`source_index`、`source_root`、`source_files` 全部字段；其余快照也有字段逐步添加。迁移不重算历史数据、不修改原文件；数据库内 `snapshot_json` 保存原始 UTF-8 文本。旧快照的 API 读取投影会在内存中补充空 observations/source_index/source_files 与空 source_root，不写回数据库。这样旧 ZIP 导出按现有字段运行。

## 安全执行

运行 `python -m app.cli migrate-json-to-sqlite`（可配 `--data-dir`、`--database-url`）。CLI 先将整个旧数据目录复制到仓库外的 `_backups/` 目录，生成 SHA-256 清单并逐文件核验，然后执行 Alembic upgrade，迁入所有运行和 reviews，逐快照比对文本与复核数量，最后才写 SQLite `app_state.current_run_id`。任何指针缺失、JSON 无效、run ID 不匹配、版本不连续、引用冲突或 hash 异常均停止，不静默跳过；先前步骤可重跑，原 JSON 不删除。

建议正式迁移前在数据副本运行相同命令并检查输出。真实数据目录只有在仓库外备份核验成功后才允许迁移。迁移报告需记录备份位置、文件/hash/运行/复核计数、当前 run ID、验证结果。历史 JSON 保持原样只读作为恢复与审计材料；正常服务仅读写 SQLite，不双写 JSON。

## 幂等与故障恢复

运行以 run_id 幂等；相同 run_id 但不同快照会报冲突。复核以 `(run_id, student_id, indicator_id, version)` 幂等，完全相同版本重复执行不重复插入，内容冲突则失败。迁移逐运行提交，当前指针最后更新；若中途失败，指针不变、原 JSON 和备份完整，修复原因后可重复执行。恢复时保留故障数据库用于诊断，重新从备份迁移到空数据库文件。

CLI 迁移当前对数据库的 schema 升级是显式动作。常规应用启动只连接既有 schema，不自动运行 Alembic。生产切换后 JSON 为只读备份，不能作为第二个在线数据源。
