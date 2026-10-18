// Rendered contrast on the hospitality page (with the grain overlay): text pixels vs the lightest nearby background pixels.
import puppeteer from 'puppeteer-core';
import { wcagContrast } from 'culori';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1100 });
await page.goto('http://127.0.0.1:4321/hotels', { waitUntil: 'networkidle0' });
await page.waitForSelector('.orb.is-live', { timeout: 25000 });
await page.evaluate(() => window.amariyaOrb.setPaused(true));
await new Promise((r) => setTimeout(r, 600));
const boxes = await page.evaluate(() => Object.fromEntries(['.eyebrow', '.lede', '.offer > span:first-child', '.guarantee', '.switcher a:not([aria-current])'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]]; })));
const png = await page.screenshot({ type: 'png', encoding: 'base64' });
const reader = await browser.newPage();
const out = await reader.evaluate(async (data, boxes) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const pick = (x, y, w, h) => { const d = g.getImageData(x, y, w, h).data; const px = []; for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]); return px.sort((a, b) => lum(...a) - lum(...b)); };
  const res = {};
  for (const [name, [x, y, w, h]] of Object.entries(boxes)) {
    const text = pick(x, y, w, h); const glyph = text[Math.floor(text.length * 0.995)];
    // background: a band just above the element, lightest 2% (worst case for light text)
    const bg = pick(x, Math.max(0, y - 14), w, 10); const worst = bg[Math.floor(bg.length * 0.98)];
    res[name] = { glyph, worst };
  }
  return res;
}, png, boxes);
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
for (const [name, { glyph, worst }] of Object.entries(out)) console.log(`${name.padEnd(30)} text ${hex(glyph)} on lightest bg ${hex(worst)} → ${wcagContrast(hex(glyph), hex(worst)).toFixed(2)}:1`);
await browser.close();
