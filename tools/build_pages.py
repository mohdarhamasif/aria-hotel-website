"""Build the site's pages from one template and one content file per industry.

    src/page.html          the page, with {{placeholders}} for everything that changes
    industries/site.json   brand name, company, site URL, asset version, list of pages
    industries/<key>.json  the words, plans, FAQs, SEO and call scripts for one page

Writes index.html (home), hotels/index.html, aesthetics/index.html, dental/index.html,
sitemap.xml and robots.txt. Standard library only.

Usage (from the repo root):
    python tools/build_pages.py
    python tools/build_pages.py --only hotels --flat --brand Aria --site-url https://example.com/ --out preview.html
      (renders one page at the root level, e.g. to compare it with an older index.html)
"""
import argparse
import datetime
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN_NAMES = {"starter": "Starter", "professional": "Professional", "enterprise": "Enterprise"}


def write(path, content):
    with open(path, "w", encoding="utf-8", newline="\n") as f:  # Python 3.9: write_text() has no newline argument
        f.write(content)


def load(name):
    return json.loads((ROOT / "industries" / f"{name}.json").read_text(encoding="utf-8"))


def fill_tokens(value, tokens):
    """Replace {brand}, {base} and similar tokens in every string inside the content."""
    if isinstance(value, str):
        return re.sub(r"\{(brand|base|company)\}", lambda m: tokens[m.group(1)], value)
    if isinstance(value, list):
        return [fill_tokens(v, tokens) for v in value]
    if isinstance(value, dict):
        return {k: fill_tokens(v, tokens) for k, v in value.items()}
    return value


def text(s):
    return html.escape(s, quote=False)


def blocks(c, site, page, base):
    """Repeated markup, written exactly as it appears in the page."""
    options = ['                <option value="">Select…</option>'] + [f"                <option>{o}</option>" for o in c["profile"]["type_options"]]
    pills = "\n".join(
        f'              <div class="orbit-slot"><article class="card feature pill" data-feature="{p["key"]}" tabindex="0">\n'
        f'                <span class="pill-ico" aria-hidden="true"><svg><use href="#{p["icon"]}" /></svg></span>\n'
        f'                <h3>{p["title"]}</h3>\n'
        f'                <p>{p["desc"]}</p>\n'
        f"              </article></div>"
        for p in c["features"]["pills"]
    )
    first = c["calls"][0]
    thread = [f'                <div class="mini-bubble {who}" dir="auto">{text(line)}</div>' for who, line in first["lines"]]
    thread.append(f'                <div class="call-done"><svg><use href="#i-tick" /></svg><span dir="auto">{text(first["done"])}</span></div>')
    plans = []
    for key, p in c["pricing"]["plans"].items():
        price = f'{p["price"]}<small>/month</small>' if p["price"].startswith("$") else p["price"]
        pop = '\n              <span class="pop">Most popular</span>' if key == "professional" else ""
        plans.append(
            f'            <article class="card plan" data-plan="{key}">\n'
            f'              <span class="plan-badge">Recommended for you</span>{pop}\n'
            f"              <h3>{PLAN_NAMES[key]}</h3>\n"
            f'              <p class="plan-for">{p["for"]}</p>\n'
            f'              <p class="price">{price}</p>\n'
            f'              <ul>{"".join(f"<li>{i}</li>" for i in p["items"])}</ul>\n'
            f"            </article>"
        )
    faq = "\n".join(
        f'          <details class="card">\n'
        f'            <summary><h3>{q["q"]}</h3><svg class="faq-ico" aria-hidden="true"><use href="#i-plus" /></svg></summary>\n'
        f'            <p>{q["a"]}</p>\n'
        f"          </details>"
        for q in c["faq"]["items"]
    )
    current = ' aria-current="page"'
    links = "".join(
        f'<a href="{base}{p["path"]}"{current if p["key"] == page["key"] else ""}>{p["label"]}</a>'
        for p in site["pages"] if p["key"] != "home"
    )
    nav = f'<nav class="industry-nav" aria-label="Industries">{links}</nav>'
    safe = lambda obj: json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")
    page_cfg = {"industry": page["key"], **c["page"]}
    return {
        "type_options": "\n".join(options),
        "marquee_row": "".join(f"<span>{i}</span><i></i>" for i in c["marquee"]["items"]),
        "pills": pills,
        "call_meta": text(first["meta"]),
        "call_thread": "\n".join(thread),
        "plans": "\n".join(plans),
        "faq_items": faq,
        "industry_nav": nav,
        "page_json": safe(page_cfg),
        "call_scripts": f'<script type="application/json" id="callScripts">{safe(c["calls"])}</script>',
    }


def jsonld(c, site, url, site_url):
    seo = c["seo"]
    org = site_url + "#org"
    offers = [
        {"@type": "Offer", "name": PLAN_NAMES[k], "price": p["price"].lstrip("$"), "priceCurrency": "USD", "description": p["offer"], "url": url + "#pricing"}
        for k, p in c["pricing"]["plans"].items() if p["price"].startswith("$")
    ]
    graph = [
        {"@type": "Organization", "@id": org, "name": site["company"], "url": site_url, "logo": site_url + "apple-touch-icon.png"},
        {"@type": "WebSite", "@id": site_url + "#website", "url": site_url, "name": seo["website_name"], "inLanguage": "en", "publisher": {"@id": org}},
        {"@type": "SoftwareApplication", "@id": url + "#app", "name": site["brand"], "applicationCategory": "BusinessApplication",
         "applicationSubCategory": seo["app_subcategory"], "operatingSystem": "Web, telephone", "description": seo["app_description"],
         "url": url, "publisher": {"@id": org}, "featureList": seo["feature_list"], "offers": offers},
        {"@type": "Service", "@id": url + "#service", "serviceType": seo["service_type"], "name": seo["service_name"],
         "provider": {"@id": org}, "audience": {"@type": "BusinessAudience", "audienceType": seo["audience"]},
         "areaServed": "Worldwide", "availableChannel": {"@type": "ServiceChannel", "serviceUrl": url + "#demo"}},
    ]
    out = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return "\n".join("  " + line for line in out.splitlines())


def render(template, site, page, flat=False):
    base = "" if flat or not page["path"] else "../"
    site_url = site["site_url"]
    url = site_url + page["path"]
    tokens = {"brand": site["brand"], "base": base, "company": site["company"]}
    c = fill_tokens(load(page["key"]), tokens)
    values = {
        "brand": site["brand"], "company": site["company"], "version": site["version"],
        "base": base, "home": base or "./", "url": url, "site_url": site_url,
        "jsonld": jsonld(c, site, url, site_url), **blocks(c, site, page, base),
    }

    def lookup(key):
        if key in values:
            return values[key]
        node = c
        for part in key.split("."):
            if not isinstance(node, dict) or part not in node:
                raise SystemExit(f"{page['key']}.json is missing '{key}'")
            node = node[part]
        return node

    def sub(m):
        v = lookup(m.group(1))
        return html.escape(v, quote=True) if m.group(2) else str(v)

    out = re.sub(r"\{\{([\w.]+)(\|attr)?\}\}", sub, template)
    if "{{" in out or re.search(r"\{(brand|base|company)\}", out):
        raise SystemExit(f"Unfilled placeholder left in {page['key']}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--flat", action="store_true", help="render with assets at the same level (base '')")
    ap.add_argument("--brand")
    ap.add_argument("--site-url")
    ap.add_argument("--out")
    args = ap.parse_args()

    template = (ROOT / "src" / "page.html").read_text(encoding="utf-8")
    site = load("site")
    if args.brand:
        site["brand"] = args.brand
    if args.site_url:
        site["site_url"] = args.site_url

    pages = [p for p in site["pages"] if not args.only or p["key"] == args.only]
    for page in pages:
        out = render(template, site, page, flat=args.flat)
        target = Path(args.out) if args.out else ROOT / page["path"] / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        write(target, out)
        print(f"Wrote {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target} ({len(out.encode()) // 1024} KB)")

    if args.only or args.out:
        return
    today = datetime.date.today().isoformat()
    urls = "".join(f"  <url>\n    <loc>{site['site_url']}{p['path']}</loc>\n    <lastmod>{today}</lastmod>\n  </url>\n" for p in site["pages"])
    write(ROOT / "sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    robots = re.sub(r"^# .*", f"# {site['brand']} — AI receptionist for hotels and clinics", robots, count=1)
    robots = re.sub(r"(?m)^Sitemap: .*$", f"Sitemap: {site['site_url']}sitemap.xml", robots)
    write(ROOT / "robots.txt", robots)
    print("Wrote sitemap.xml, robots.txt")


if __name__ == "__main__":
    main()
