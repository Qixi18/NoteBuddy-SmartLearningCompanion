import asyncio
import argparse
from pathlib import Path
from playwright.async_api import async_playwright


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Capture workbench pages from a local server."
    )
    parser.add_argument(
        "--base-url", default="http://127.0.0.1:5174", help="Local workbench URL"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web端截图",
        help="Screenshot output directory",
    )
    args = parser.parse_args(argv)
    args.output_dir = args.output_dir.expanduser().resolve()
    return args


async def main(argv=None):
    args = parse_args(argv)
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={"width": 1440, "height": 900}, device_scale_factor=1
        )
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(args.base_url, wait_until="networkidle")
        await page.get_by_role("link", name="学科知识").click()
        await page.get_by_role("heading", name="学习要求与来源").wait_for()
        await page.screenshot(path=str(out / "02-学科知识.png"), full_page=True)
        await page.get_by_role("link", name="学情洞察").click()
        await page.get_by_label("测验节点").select_option("N01")
        await page.screenshot(path=str(out / "03-班级概览.png"), full_page=True)
        await page.get_by_role("link", name="学生分析").click()
        await page.get_by_label("测验节点").select_option("N01")
        await page.screenshot(path=str(out / "04-学生分析.png"), full_page=True)
        await page.get_by_role("link", name="作答证据").click()
        await page.screenshot(path=str(out / "05-作答证据.png"), full_page=True)
        await page.get_by_role("link", name="数据质量").click()
        await page.screenshot(path=str(out / "06-数据质量.png"), full_page=True)
        await page.get_by_role("link", name="教学方案").click()
        await page.get_by_label("测验节点").select_option("N01")
        await page.get_by_role("button", name="生成规则草稿").click()
        await page.get_by_role("heading", name="教师复核内容").wait_for()
        await page.screenshot(path=str(out / "07-建议复核.png"), full_page=True)
        await page.get_by_role("link", name="案例与导出").click()
        await page.screenshot(path=str(out / "08-案例与导出.png"), full_page=True)
        await page.get_by_role("link", name="全局概览").click()
        await page.screenshot(path=str(out / "01-全局概览.png"), full_page=True)
        print(
            {
                "errors": errors,
                "viewport": await page.evaluate(
                    "({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth})"
                ),
                "screenshots": sorted(file.name for file in out.glob("*.png")),
            }
        )
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
