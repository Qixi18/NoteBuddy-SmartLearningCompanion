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
    from app.config import settings
    from app.repositories.store import Store

    parser = argparse.ArgumentParser(description="智慧学伴赛事数据分析")
    parser.add_argument(
        "command",
        choices=["serve", "import", "summary", "db-upgrade", "migrate-json-to-sqlite"],
    )
    parser.add_argument("folder", nargs="?", help="赛事 CSV 所在目录")
    parser.add_argument("--data-dir", type=Path, default=settings.data_dir)
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--host", default=settings.host)
    parser.add_argument("--database-url", default=settings.database_url)
    args = parser.parse_args()
    if args.command == "serve":
        serve(args.data_dir, args.port, args.host, args.database_url)
    elif args.command == "import":
        if not args.folder:
            parser.error("import 需要 CSV 目录")
        run = Store(args.data_dir, database_url=args.database_url).import_folder(
            Path(args.folder)
        )
        print(
            json.dumps(
                {"run_id": run["run_id"], "quality": run["quality"]},
                ensure_ascii=False,
                indent=2,
            )
        )
    elif args.command == "summary":
        run = Store(args.data_dir, database_url=args.database_url).current()
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
        os.environ["SMART_LEARNING_DATABASE_URL"] = args.database_url
        config.set_main_option("sqlalchemy.url", args.database_url.replace("%", "%%"))
        command.upgrade(config, "head")
        print("数据库迁移已升级至 head")
    else:
        from alembic import command
        from alembic.config import Config
        from app.infrastructure.migration.json_to_sqlite import (
            create_verified_backup,
            migrate_json_to_sqlite,
        )
        from app.repositories.store import Store

        backup_dir = (
            args.data_dir.resolve().parent.parent
            / "_backups"
            / f"smart-learning-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        )
        repo_root = BACKEND_ROOT.parent.parent.resolve()
        if (
            repo_root == backup_dir.resolve()
            or repo_root in backup_dir.resolve().parents
        ):
            raise SystemExit("备份目录应位于仓库外")
        backup = create_verified_backup(args.data_dir, backup_dir)
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        os.environ["SMART_LEARNING_DATABASE_URL"] = args.database_url
        config.set_main_option("sqlalchemy.url", args.database_url.replace("%", "%%"))
        command.upgrade(config, "head")
        result = migrate_json_to_sqlite(
            args.data_dir, Store(args.data_dir, database_url=args.database_url)
        )
        print(
            json.dumps(
                {"backup": backup, "migration": result}, ensure_ascii=False, indent=2
            )
        )


if __name__ == "__main__":
    main()
