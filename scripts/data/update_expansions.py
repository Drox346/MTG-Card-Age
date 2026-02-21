import sys
import json
from datetime import datetime
from pathlib import Path
import re

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")

def parse_legal_rows(html: str) -> dict[int, list[str]]:
    soup = BeautifulSoup(html, "lxml")
    results: dict[int, list[str]] = {}

    for row in soup.select("div.row"):
        row_text = row.get_text(" ", strip=True)
        if "Legal until" not in row_text:
            continue

        m = YEAR_RE.search(row_text)
        if not m:
            continue
        year = int(m.group(0))

        codes = []
        seen = set()
        for item in row.select('div[aria-controls^="accordion-collapse-"]'):
            code = item.get("aria-controls", "").split("-")[-1].strip().upper()
            if code and code not in seen:
                seen.add(code)
                codes.append(code)

        if codes:
            results[year] = codes

    return results

def fetch_rendered_html(url: str) -> str:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(url, wait_until="networkidle", timeout=60_000)
        html = page.content()
        browser.close()
        return html

def main() -> int:
    url = "https://whatsinstandard.com/"
    text = fetch_rendered_html(url)

    data = parse_legal_rows(text)
    current_year = datetime.now().year
    data = {year: codes for year, codes in data.items() if year > current_year}
    if not data:
        print(
            f"ERROR: no expansion years above {current_year} found (markup changed or no future data?)",
            file=sys.stderr,
        )
        return 2

    output_path = Path(__file__).resolve().parents[1] / ".." / "data" / "expansions.json"
    output_path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Wrote {len(data)} entries to {output_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
