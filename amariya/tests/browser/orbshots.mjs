// Screenshots of the three niche heroes (idle / listening / speaking) + console errors + overflow check.
// Updated for the niche pages: phones are emulated as phones (touch, mobile viewport), and overflow is measured against
// clientWidth (a mobile layout viewport widens to fit an overflow, which hid it from innerWidth).
// Usage: node orbshots.mjs [base] [niches...]
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + '/hotels')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: process.env.GL === 'gpu' ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'], // GL=gpu: the machine's GPU
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const niche of NICHES) {
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.setViewport({ width: W, height: H, isMobile: W < 700, hasTouch: W < 700 });
    await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    const live = await page.waitForSelector('.orb.is-live', { timeout: 25000 }).then(() => true, () => false);
    await wait(2500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `orb-${niche}-${W}-idle.jpg`, type: 'jpeg', quality: 80 });
    if (W === 1440 && live) {
      await page.evaluate(() => { window.amariyaOrb.setState('listening'); });
      await wait(1800);
      await page.screenshot({ path: `orb-${niche}-${W}-listening.jpg`, type: 'jpeg', quality: 80 });
      await page.evaluate(() => { window.amariyaOrb.setAmpSource(() => 0.85); window.amariyaOrb.setState('speaking'); });
      await wait(1800);
      await page.screenshot({ path: `orb-${niche}-${W}-speaking.jpg`, type: 'jpeg', quality: 80 });
    }
    console.log(`${niche} ${W}: live=${live} overflowX=${overflow}px ${errors.length ? '\n  ' + errors.join('\n  ') : 'no console errors'}`);
    await page.close();
  }
}
await browser.close();
