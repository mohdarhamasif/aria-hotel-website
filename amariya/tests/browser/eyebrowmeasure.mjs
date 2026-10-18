// Background actually behind the hotel eyebrow (text hidden), idle and at a speaking peak, vs the eyebrow's token colour.
import puppeteer from 'puppeteer-core';
import { wcagContrast } from 'culori';
const TEXT = '#d8c08d';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'], protocolTimeout: 400000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://127.0.0.1:4321/hotels', { waitUntil: 'networkidle0' });
await page.waitForSelector('.orb.is-live', { timeout: 25000 });
const reader = await browser.newPage();
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
for (const state of ['idle', 'speaking']) {
  await page.bringToFront();
  await page.evaluate((s) => { window.amariyaOrb.setAmpSource(() => 1); window.amariyaOrb.setState(s); }, state);
  await new Promise((r) => setTimeout(r, 2000));
  const box = await page.evaluate(() => { const e = document.querySelector('.eyebrow'); e.style.color = 'transparent'; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
  const png = await page.screenshot({ type: 'png', encoding: 'base64' });
  await page.evaluate(() => { document.querySelector('.eyebrow').style.color = ''; });
  const worst = await reader.evaluate(async (data, [x, y, w, h]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(x, y, w, h).data; const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    px.sort((a, b) => lum(a) - lum(b));
    return px[Math.floor(px.length * 0.98)];
  }, png, box);
  console.log(`${state.padEnd(9)} eyebrow ${TEXT} on lightest background behind it ${hex(worst)} → ${wcagContrast(TEXT, hex(worst)).toFixed(2)}:1 (needs 4.5)`);
}
await browser.close();
