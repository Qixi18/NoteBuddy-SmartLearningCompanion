"""命令行入口。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def main():
    from app.api.server import serve
    from app.config import resolve_database_url, resolve_path, settings
    from app.repositories.store import Store

    parser = argparse.ArgumentParser(description="智慧学伴赛事数据分析")
    parser.add_argument(
        "command",
        choices=[
            "serve",
            "import",
            "summary",
            "db-upgrade",
            "db-backup",
            "db-restore",
            "migrate-json-to-sqlite",
        ],
    )
    parser.add_argument("folder", nargs="?", help="赛事 CSV 所在目录")
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--host", default=settings.host)
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--backup-dir", type=Path, default=None)
    parser.add_argument("--restore-to", type=Path, default=None)
    parser.add_argument("--confirm-existing-database", action="store_true")
    parser.add_argument("--allow-nonempty-database", action="store_true")
    args = parser.parse_args()
    data_dir = resolve_path(args.data_dir) if args.data_dir else settings.data_dir
    database_url = (
        resolve_database_url(args.database_url)
        if args.database_url
        else settings.database_url
    )
    if args.command == "serve":
        serve(data_dir, args.port, args.host, database_url)
    elif args.command == "import":
        if not args.folder:
            parser.error("import 需要 CSV 目录")
        run = Store(data_dir, database_url=database_url).import_folder(
            resolve_path(args.folder)
        )
        print(
            json.dumps(
                {"run_id": run["run_id"], "quality": run["quality"]},
                ensure_ascii=False,
                indent=2,
            )
        )
    elif args.command == "summary":
        run = Store(data_dir, database_url=database_url).current()
        print(
            json.dumps(
                {
                    "run_id": run["run_id"],
                    "quality": run["quality"],
                    "metrics": run["metrics"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    elif args.command == "db-upgrade":
        from alembic import command
        from alembic.config import Config

        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        os.environ["SMART_LEARNING_DATABASE_URL"] = database_url
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
        command.upgrade(config, "head")
        print("数据库迁移已升级至 head")
    elif args.command == "db-backup":
        from app.infrastructure.database.backup import backup_database

        destination = resolve_path(args.backup_dir) if args.backup_dir else None
        if destination is None:
            destination = (
                (settings.backup_dir or settings.default_backup_root)
                / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
                / "smart_learning.db"
            )
        print(
            json.dumps(
                backup_database(database_url, destination), ensure_ascii=False, indent=2
            )
        )
    elif args.command == "db-restore":
        from app.infrastructure.database.backup import restore_database

        if not args.folder:
            parser.error("db-restore 需要备份文件路径作为 folder")
        restore_target = args.restore_to or args.backup_dir
        destination = resolve_path(restore_target) if restore_target else None
        if destination is None:
            parser.error("db-restore 需要 --restore-to 指定新的恢复目标文件")
        result = restore_database(resolve_path(args.folder), destination)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        from alembic import command
        from alembic.config import Config
        from app.infrastructure.migration.json_to_sqlite import (
            create_verified_backup,
            discover,
            inspect_migration_target,
            migrate_json_to_sqlite,
            sha256,
            write_migration_report,
        )
        from app.repositories.store import Store

        from app.infrastructure.database.backup import backup_database, sqlite_path

        target_db = sqlite_path(database_url)
        backup_base = (
            resolve_path(args.backup_dir)
            if args.backup_dir
            else settings.backup_dir or settings.default_backup_root
        )
        backup_dir = backup_base / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        source_path = data_dir.resolve()

        def paths_overlap(left: Path, right: Path) -> bool:
            return left == right or left in right.parents or right in left.parents

        if (
            paths_overlap(backup_dir, source_path)
            or backup_dir == target_db
            or (target_db in backup_dir.parents)
        ):
            raise SystemExit("备份目录必须与 JSON source 和 SQLite 所在目录分离")
        if backup_dir.exists():
            raise SystemExit(f"备份批次目录已存在：{backup_dir}")
        report_path = backup_dir / "migration-report.json"
        report = {
            "status": "preflight_started",
            "created_at": datetime.now().astimezone().isoformat(),
            "source": str(data_dir),
            "database": str(target_db),
            "backup_directory": str(backup_dir),
            "target_database_existed": target_db.exists(),
            "target_database_nonempty_opt_in": bool(args.allow_nonempty_database),
            "database_preflight": None,
            "discovery": None,
            "plan": [],
            "source_backup": None,
            "database_backup": None,
            "migration": None,
            "last_phase": "preflight",
        }
        write_migration_report(report_path, report)
        source_backup = None
        db_backup = None
        try:
            # Persist even read-only preflight failures so an operator can inspect
            # exactly which batch failed without touching either source or target.
            runs, _, discovery_report = discover(data_dir, with_report=True)
            database_preflight = inspect_migration_target(
                target_db, runs, discovery_report["current_run_id"]
            )
            report.update(
                status="preflight_complete",
                discovery=discovery_report,
                database_preflight=database_preflight,
                plan=[
                    {
                        "run_id": run_id,
                        "snapshot_sha256": sha256(snapshot_path),
                        "review_records": sum(map(len, reviews.values())),
                    }
                    for run_id, snapshot_path, _snapshot_text, reviews in runs
                ],
            )
            write_migration_report(report_path, report)
            if database_preflight["exists"] and not args.confirm_existing_database:
                raise ValueError(
                    f"目标数据库已存在：{target_db}。需显式指定 --confirm-existing-database；未执行备份、升级或写入"
                )
            if database_preflight["nonempty"] and not args.allow_nonempty_database:
                raise ValueError(
                    f"目标数据库已有记录：{target_db}。默认拒绝合并；需显式指定 --allow-nonempty-database"
                )
            if database_preflight["conflicts"]:
                raise ValueError(
                    "目标数据库与迁入数据存在 run/review/current 冲突："
                    + json.dumps(database_preflight["conflicts"], ensure_ascii=False)
                )
            source_backup = create_verified_backup(
                data_dir,
                backup_dir / "source",
                excluded_paths=(target_db,),
            )
            report.update(
                status="source_backed_up",
                last_phase="source_backup",
                source_backup=source_backup,
            )
            write_migration_report(report_path, report)
            if target_db.exists() and target_db.stat().st_size:
                db_backup = backup_database(
                    database_url, backup_dir / "database.sqlite"
                )
                report.update(
                    status="database_backed_up",
                    last_phase="database_backup",
                    database_backup=db_backup,
                )
                write_migration_report(report_path, report)
            config = Config(str(BACKEND_ROOT / "alembic.ini"))
            config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
            os.environ["SMART_LEARNING_DATABASE_URL"] = database_url
            config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
            report.update(status="schema_upgrade_started", last_phase="schema_upgrade")
            write_migration_report(report_path, report)
            command.upgrade(config, "head")
            report.update(status="schema_upgraded", last_phase="schema_upgrade")
            write_migration_report(report_path, report)
            report.update(status="data_migration_started", last_phase="data_migration")
            write_migration_report(report_path, report)
            migration_store = Store(data_dir, database_url=database_url)
            try:
                result = migrate_json_to_sqlite(data_dir, migration_store.uow_factory)
            finally:
                migration_store.database.dispose()
            report.update(
                status="completed", last_phase="data_migration", migration=result
            )
            write_migration_report(report_path, report)
        except Exception as exc:
            report.update(
                status="failed",
                last_phase=report.get("last_phase", "unknown"),
                error_type=type(exc).__name__,
                error_message=str(exc),
                recovery="保留数据库与备份用于检查；从备份恢复到新的数据库路径后重试。",
            )
            if getattr(exc, "details", None) is not None:
                report["database_preflight"] = exc.details
            write_migration_report(report_path, report)
            raise
        print(
            json.dumps(
                {
                    "source": str(data_dir),
                    "database": str(target_db),
                    "backup": str(backup_dir.resolve()),
                    "source_backup": source_backup,
                    "database_backup": db_backup,
                    "discovery": discovery_report,
                    "migration_report": str(report_path.resolve()),
                    "migration": result,
                },
                ensure_ascii=False,
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
