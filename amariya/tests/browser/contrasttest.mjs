// Text contrast on the rendered pixels (WCAG AA: 4.5:1, or 3:1 for large text, 24 px, or 18.66 px at 700), measured
// against what is really behind each line of text: the live 3D scene, the scrims, the paper. At each scroll stop two
// stills are taken with motion paused (the scene holds): the page as it is, and the page with its text made
// transparent. A line of text counts as seen where the two stills differ under it (so text under an opaque band or
// sheet is left out), and its colour is compared with the background pixels of the second still. Disabled controls,
// form fields' own values and text a visitor cannot see (opacity under .1, hidden) are skipped; text marked aria-hidden
// is measured and reported separately as decorative.
// Usage: node contrasttest.mjs [base] [niches...]
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
const SOFT = process.env.GL === 'swiftshader';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: SOFT ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [], protocolTimeout: 600000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`  ${ok ? 'pass' : 'FAIL'} ${label}`); return ok; };
// The glyphs go, currentColor stays (a button or a plate drawn in it keeps its fill); gilt text, painted by its own
// background through the glyphs, is hidden whole for the still (marked data-contrast-gilt by collect)
const HIDE = '*, *::before, *::after { -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; } svg text { fill: transparent !important; stroke: transparent !important; } [data-contrast-gilt] { visibility: hidden !important; }';

/** While collecting: everything hit-testable, so a band or a strip that takes no pointer is still found on top */
const COLLECT_STYLE = '*, *::before, *::after { pointer-events: auto !important; }';

/** In the page: every text line in the viewport, with its colour, size and effective opacity */
const collect = () => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const alphaOf = (css) => { px.clearRect(0, 0, 1, 1); px.fillStyle = 'rgba(0,0,0,0)'; px.fillStyle = css; px.fillRect(0, 0, 1, 1); return px.getImageData(0, 0, 1, 1).data[3] / 255; };
  // The chrome's soft edges: every fixed or sticky layer that paints, 12 px around it, and the cradle orb on phones
  const EDGE = 12;
  const chrome = [];
  for (const e of document.querySelectorAll('body *')) {
    const p = getComputedStyle(e).position;
    if (p !== 'fixed' && p !== 'sticky') continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.width * r.height > innerWidth * innerHeight * 0.6) continue;
    const s = getComputedStyle(e);
    if (s.visibility !== 'visible' || !(alphaOf(s.backgroundColor) >= 0.5 || (s.backdropFilter && s.backdropFilter !== 'none'))) continue;
    chrome.push({ e, l: r.left - EDGE, t: r.top - EDGE, r: r.right + EDGE, b: r.bottom + EDGE });
  }
  const orb = document.querySelector('.orb');
  if (orb && document.documentElement.hasAttribute('data-orb-cradle')) {
    const o = orb.getBoundingClientRect(), ox = o.left + o.width / 2, oy = o.top + o.height / 2, or = o.width / 2;
    if (or > 0) chrome.push({ l: ox - or * 1.8, t: oy - or * 1.8, r: ox + or * 1.8, b: oy + or * 1.8 });
  }
  /** A layer that paints over what is under it: a canvas, a fill of half opacity or more, or a backdrop filter */
  const paints = (e) => {
    const cs = getComputedStyle(e);
    if (cs.visibility !== 'visible' || opacityOf(e) < 0.5) return false;
    // The stage canvas covers only where it is opaque: a full-frame scene (the hotels house, the band over the page on
    // phones) paints all of it; the porcelain and the pearl are drawn on a transparent canvas, opaque only on the orb
    if (e.tagName === 'CANVAS') return !!window.amariyaOrb?.scene?.fullFrame;
    if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
    return [cs, getComputedStyle(e, '::before'), getComputedStyle(e, '::after')].some((s) => alphaOf(s.backgroundColor) >= 0.5 || (s.backgroundImage && s.backgroundImage !== 'none' && s !== cs));
  };
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script, style, noscript, .sr-only, [hidden], dialog:not([open]), details:not([open]) > :not(summary), button[disabled], option, select, textarea')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible') continue;
    const o = opacityOf(el);
    if (o < 0.1) continue;
    const gilt = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
    if (gilt) el.setAttribute('data-contrast-gilt', '');
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 4 || r.height < 6 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      // Under the fixed chrome, a sheet or the phones' house band (the canvas over the page there), the line is not
      // read: everything is hit-testable for this (COLLECT_STYLE), and any layer above the text at the line's centre
      // that paints there (a canvas, a fill or a backdrop, its own or its ::before/::after's) covers it
      const stack = document.elementsFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
      let covered = false;
      for (const e of stack) {
        if (e === el || el.contains(e)) break;
        // An ancestor found above the text is its own overlay pseudo-element (the grain over the page): see past it
        if (e.contains(el)) continue;
        if (paints(e)) { covered = true; break; }
      }
      if (covered) continue;
      // Sliding under the soft edge of the chrome (its shadow, a fade), or past the phone's cradle orb (a talk button
      // over the page, with its contact shadow), the line is passing under chrome, not being read
      const box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      if (chrome.some((c) => !(c.e && c.e.contains(el)) && box.l < c.r && box.r > c.l && box.t < c.b && box.b > c.t)) continue;
      out.push({
        text: n.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), color: cs.color, gilt, size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400, opacity: o,
        decorative: !!el.closest('[aria-hidden="true"]'), x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top),
        where: `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`,
      });
    }
  }
  return out;
};

/** In the page: for each text box, whether the text shows at all, and its contrast with the background under it */
const measure = async ({ shown, bare, boxes }) => {
  const load = async (png) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g;
  };
  const [A, B] = await Promise.all([load(shown), load(bare)]);
  const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
  // Any CSS colour (oklch, color-mix, hex) to sRGB bytes, through a 1 px canvas
  const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (css) => { px.clearRect(0, 0, 1, 1); px.fillStyle = css; px.fillRect(0, 0, 1, 1); const d = px.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const res = [];
  for (const b of boxes) {
    const x = Math.floor(b.x), y = Math.floor(b.y), w = Math.max(1, Math.floor(b.w)), h = Math.max(1, Math.floor(b.h));
    const a = A.getImageData(x, y, w, h).data, data = B.getImageData(x, y, w, h).data;
    // Seen: enough pixels change when the text goes (glyphs cover roughly a fifth of a line box; covered text, none).
    // The glyphs and 2 px around them are where the background is read: not the empty top of a tall line box
    const glyphAt = new Uint8Array(w * h);
    let changed = 0;
    for (let i = 0, p = 0; i < a.length; i += 4, p++) if (Math.max(Math.abs(a[i] - data[i]), Math.abs(a[i + 1] - data[i + 1]), Math.abs(a[i + 2] - data[i + 2])) > 24) { glyphAt[p] = 1; changed++; }
    if (changed < (w * h) * 0.01) continue;
    const near = new Uint8Array(w * h);
    for (let p = 0; p < glyphAt.length; p++) {
      if (!glyphAt[p]) continue;
      const gx = p % w, gy = (p / w) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1;
      }
    }
    let [tr, tg, tb, ta] = rgba(b.color);
    let alpha = ta * b.opacity;
    // Gilt text is the colour of its own glyphs: the median of the pixels that went with it
    if (b.gilt) {
      const glyph = [];
      for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i] - data[i]), Math.abs(a[i + 1] - data[i + 1]), Math.abs(a[i + 2] - data[i + 2])) > 24) glyph.push([a[i], a[i + 1], a[i + 2]]);
      glyph.sort((p, q) => lum(p) - lum(q));
      [tr, tg, tb] = glyph[Math.floor(glyph.length / 2)];
      alpha = 1;
    }
    const ratios = [];
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (!near[p]) continue;
      const bg = [data[i], data[i + 1], data[i + 2]];
      const fg = [tr * alpha + bg[0] * (1 - alpha), tg * alpha + bg[1] * (1 - alpha), tb * alpha + bg[2] * (1 - alpha)];
      const l1 = lum(fg), l2 = lum(bg);
      ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
    }
    ratios.sort((p, q) => p - q);
    // The 10th percentile: the worst of the background, not a stray pixel of a border or a sparkle
    res.push({ ...b, ratio: ratios[Math.floor(ratios.length * 0.1)] ?? 21 });
  }
  return res;
};

for (const niche of NICHES) {
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    console.log(`${niche} ${W}×${H}`);
    const page = await browser.newPage();
    const mobile = W < 700;
    await page.setViewport({ width: W, height: H, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('amariya_visited', '1'); localStorage.setItem('amariya_intro', '1'); localStorage.setItem('amariya_motion', 'paused'); } catch {} });
    await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('.orb.is-live', { timeout: 30000 }).catch(() => {});
    await wait(1500);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const bad = new Map(), deco = new Map();
    let lines = 0;
    for (let y = 0; y <= total; y += Math.round(H * 0.6)) {
      await page.evaluate((y) => { window.lenis?.scrollTo?.(y, { immediate: true }); window.scrollTo(0, y); }, y);
      await wait(1400);
      await page.addStyleTag({ content: COLLECT_STYLE }).then((h) => h.evaluate((s) => s.setAttribute('data-hit-probe', '')));
      const boxes = await page.evaluate(collect);
      await page.evaluate(() => document.querySelector('style[data-hit-probe]')?.remove());
      const shown = (await page.screenshot({ type: 'png', captureBeyondViewport: false })).toString('base64');
      await page.addStyleTag({ content: HIDE }).then((h) => h.evaluate((s) => s.setAttribute('data-contrast-probe', '')));
      await wait(250);
      const bare = (await page.screenshot({ type: 'png', captureBeyondViewport: false })).toString('base64');
      await page.evaluate(() => document.querySelector('style[data-contrast-probe]')?.remove());
      const res = await page.evaluate(measure, { shown, bare, boxes });
      lines += res.length;
      for (const r of res) {
        const large = r.size >= 24 || (r.size >= 18.66 && r.weight >= 700);
        const need = large ? 3 : 4.5;
        if (r.ratio + 0.05 >= need) continue;
        const key = `${r.where} "${r.text}"`;
        const map = r.decorative ? deco : bad;
        if (!map.has(key) || map.get(key).ratio > r.ratio) map.set(key, { ratio: r.ratio, need, y, size: r.size });
      }
    }
    const list = (m) => [...m.entries()].map(([k, v]) => `${k} ${v.ratio.toFixed(2)}:1 (needs ${v.need}, ${v.size}px, at scroll ${v.y})`);
    check(bad.size === 0, `${lines} text lines meet AA on their rendered background${bad.size ? ':\n      ' + list(bad).join('\n      ') : ''}`);
    if (deco.size) console.log(`  note: decorative (aria-hidden) text under AA:\n      ${list(deco).join('\n      ')}`);
    await page.close();
  }
}
console.log(failures ? `${failures} FAILED` : 'all checks passed');
await browser.close();
