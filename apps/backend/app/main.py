"""本地开发服务入口。"""

from .api.server import serve
from .config import settings


def main() -> None:
    serve(settings.data_dir, settings.port, settings.host, settings.database_url)


if __name__ == "__main__":
    main()
