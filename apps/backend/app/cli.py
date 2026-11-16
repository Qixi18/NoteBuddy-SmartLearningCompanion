"""命令行入口。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def main():
    from app.api.server import serve
    from app.config import settings
    from app.repositories.store import Store

    parser = argparse.ArgumentParser(description="智慧学伴赛事数据分析")
    parser.add_argument("command", choices=["serve", "import", "summary"])
    parser.add_argument("folder", nargs="?", help="赛事 CSV 所在目录")
    parser.add_argument("--data-dir", type=Path, default=settings.data_dir)
    parser.add_argument("--port", type=int, default=settings.port)
    parser.add_argument("--host", default=settings.host)
    args = parser.parse_args()
    if args.command == "serve":
        serve(args.data_dir, args.port, args.host)
    elif args.command == "import":
        if not args.folder:
            parser.error("import 需要 CSV 目录")
        run = Store(args.data_dir).import_folder(Path(args.folder))
        print(
            json.dumps(
                {"run_id": run["run_id"], "quality": run["quality"]},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        run = Store(args.data_dir).current()
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


if __name__ == "__main__":
    main()
