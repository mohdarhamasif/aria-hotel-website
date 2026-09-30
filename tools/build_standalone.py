"""Build aria-standalone.html: index.html with styles.css, config.js, app.js and experience.js inlined.

Usage (from the repo root):  python tools/build_standalone.py
Standard library only. Re-run after any change to the five source files.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8").rstrip() + "\n"


def replace_once(html: str, tag: str, name: str, new: str) -> str:
    # The file name in `tag` may carry a ?v= cache-busting suffix in index.html
    pattern = re.escape(tag).replace(re.escape(name), re.escape(name) + r"(?:\?v=[\w.-]+)?")
    if len(re.findall(pattern, html)) != 1:
        raise SystemExit(f"Expected exactly one occurrence of {tag!r} in index.html")
    return re.sub(pattern, lambda _: new, html)


html = read("index.html")
html = replace_once(html, '<link rel="stylesheet" href="styles.css" />', "styles.css", "<style>\n" + read("styles.css") + "</style>")
html = replace_once(html, '<script src="config.js"></script>', "config.js", "<script>\n" + read("config.js") + "</script>")
html = replace_once(html, '<script type="module" src="app.js"></script>', "app.js", '<script type="module">\n' + read("app.js") + "</script>")
html = replace_once(html, '<script type="module" src="experience.js"></script>', "experience.js", '<script type="module">\n' + read("experience.js") + "</script>")

with open(ROOT / "aria-standalone.html", "w", encoding="utf-8", newline="\n") as f:
    f.write(html)
print(f"Wrote aria-standalone.html ({len(html.encode('utf-8')) // 1024} KB)")
