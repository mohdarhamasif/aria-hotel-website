// Capture each niche page for review: scroll stops at desktop and phone widths, orb states, console errors, overflow.
// Usage: node critshots.mjs <base> <outDir> [niches...]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const OUT = process.argv[3] || 'crit';
const NICHES = process.argv.slice(4).length ? process.argv.slice(4) : ['hotels', 'clinics', 'dental'];
fs.mkdirSync(OUT, { recursive: true });
// The machine's GPU by default, so each shot shows the scene a visitor sees once it has settled: under software GL
// (GL=swiftshader) the hotel house draws about once a second and its camera is still travelling when the shot is taken
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: process.env.GL === 'swiftshader' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : [],
  protocolTimeout: 600000,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const index = {};
for (const niche of NICHES) {
  index[niche] = { shots: [], errors: [], overflow: {} };
  // Large desktop, laptop, tablet landscape, phone
  for (const [W, H, step] of [[1920, 1080, 980], [1440, 900, 820], [1024, 768, 700], [390, 844, 760]]) {
    const page = await browser.newPage();
    page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) index[niche].errors.push(`${W} ${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => index[niche].errors.push(`${W} pageerror: ${e.message}`));
    await page.setViewport({ width: W, height: H, isMobile: W < 700, hasTouch: W < 700 });
    try {
      await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 90000 });
    } catch (e) {
      index[niche].errors.push(`${W} goto: ${e.message}`);
    }
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForSelector('.is-live, [data-live="true"]', { timeout: 20000 }).catch(() => {});
    await wait(2500);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    // clientWidth, not innerWidth: in mobile emulation the layout viewport widens to fit an overflow, hiding it
    index[niche].overflow[W] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    let i = 0;
    for (let y = 0; y < total - 200 && i < 40; y += step) {
      await page.evaluate((y) => { window.lenis?.scrollTo?.(y, { immediate: true }); window.scrollTo(0, y); }, y);
      await wait(1300);
      const file = `${OUT}/${niche}-${W}-${String(i).padStart(2, '0')}-y${y}.jpg`;
      await page.screenshot({ path: file, type: 'jpeg', quality: 68 });
      index[niche].shots.push(file);
      i++;
    }
    if (W === 1440) {
      await page.evaluate(() => { window.lenis?.scrollTo?.(0, { immediate: true }); window.scrollTo(0, 0); });
      await wait(800);
      for (const state of ['listening', 'speaking']) {
        // Through the voice bridge, so the whole page shows the state (the dock, its status and boxes, the orb), at a
        // speech-like level on the orb
        const ok = await page.evaluate((s) => { const o = window.amariyaOrb; if (!o) return false; o.setAmpSource?.(() => 0.8); if (window.amariyaVoice) window.amariyaVoice.setState(s); else o.setState(s); return true; }, state);
        if (!ok) break;
        await wait(1500);
        const file = `${OUT}/${niche}-1440-orb-${state}.jpg`;
        await page.screenshot({ path: file, type: 'jpeg', quality: 70 });
        index[niche].shots.push(file);
      }
    }
    await page.close();
  }
  console.log(`${niche}: ${index[niche].shots.length} shots, overflow ${JSON.stringify(index[niche].overflow)}, ${index[niche].errors.length} errors`);
}
fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
await browser.close();
