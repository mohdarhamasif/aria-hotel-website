"""Build aria-standalone.html: index.html with styles.css, config.js and app.js inlined.

Usage (from the repo root):  python tools/build_standalone.py
Standard library only. Re-run after any change to the four source files.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8").rstrip() + "\n"


def replace_once(html: str, old: str, new: str) -> str:
    if html.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence of {old!r} in index.html")
    return html.replace(old, new)


html = read("index.html")
html = replace_once(html, '<link rel="stylesheet" href="styles.css" />', "<style>\n" + read("styles.css") + "</style>")
html = replace_once(html, '<script src="config.js"></script>', "<script>\n" + read("config.js") + "</script>")
html = replace_once(html, '<script type="module" src="app.js"></script>', '<script type="module">\n' + read("app.js") + "</script>")

with open(ROOT / "aria-standalone.html", "w", encoding="utf-8", newline="\n") as f:
    f.write(html)
print(f"Wrote aria-standalone.html ({len(html.encode('utf-8')) // 1024} KB)")
