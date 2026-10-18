// Behaviour checks per niche: reduced motion = one still frame; pause/play; a call's state sequence + live region.
// Updated for the niche pages: the Pause control is the first *visible* [data-orb-pause] (pages render it twice, in the
// chrome and in a menu), its words are read from its [data-motion-label], and the call is window.amariyaVoice.simulate()
// (Talk now opens the start sheet first). Every expectation is unchanged.
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'], protocolTimeout: 400000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const canvasShot = async (page) => {
  const clip = await page.evaluate(() => { const r = document.querySelector('.orb').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  // In-viewport capture: puppeteer's default for a clip (captureBeyondViewport) briefly resizes the page, and the page
  // rightly re-lays itself out on resize, so the shot itself would change what it measures
  return (await page.screenshot({ clip, type: 'png', captureBeyondViewport: false })).toString('base64');
};
/** The first [data-orb-pause] a visitor can actually see and press */
const pauseButton = async (page) => {
  for (const h of await page.$$('[data-orb-pause]')) {
    const ok = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('dialog:not([open]), details:not([open])'); });
    if (ok) return h;
  }
  throw new Error('no visible [data-orb-pause]');
};
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`  ${ok ? 'pass' : 'FAIL'} ${label}`); };
for (const niche of NICHES) {
  console.log(niche);
  // 1. Reduced motion: renders once, then never changes
  let page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('amariya_motion', 'on'); } catch {} });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
  check(await page.waitForSelector('.orb.is-live', { timeout: 30000 }).then(() => true, () => false), 'reduced motion: still frame rendered');
  await wait(1500);
  const a = await canvasShot(page); await wait(1200); const b = await canvasShot(page);
  check(a === b, 'reduced motion: orb does not move');
  await page.close();

  // 2. Pause and play
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('amariya_motion', 'on'); } catch {} });
  await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('.orb.is-live', { timeout: 30000 });
  await wait(1200);
  const m1 = await canvasShot(page); await wait(900); let m2 = await canvasShot(page);
  // Software rendering runs a few frames a second: a slow idle motion (the porcelain turns 2° a second) may need longer
  if (m1 === m2) { await wait(2500); m2 = await canvasShot(page); }
  check(m1 !== m2, 'animates by default');
  await (await pauseButton(page)).click();
  const pressed = await (await pauseButton(page)).evaluate((el) => [el.getAttribute('aria-pressed'), (el.querySelector('[data-motion-label]') ?? el).textContent.trim()]);
  check(pressed[0] === 'true' && pressed[1] === 'Play motion', `pause button pressed (${pressed.join(', ')})`);
  // Pausing draws one still; software GL presents a frame every ~300 ms (the pearl's), so it can land after 400 ms
  await wait(1200);
  const p1 = await canvasShot(page); await wait(900); const p2 = await canvasShot(page);
  check(p1 === p2, 'paused: orb does not move');
  await (await pauseButton(page)).click();
  await wait(900);
  const r1 = await canvasShot(page); await wait(900); const r2 = await canvasShot(page);
  check(r1 !== r2, 'play: orb moves again');

  // 3. A call: listening → speaking → idle, announced in the live region
  await page.evaluate(() => window.amariyaVoice.simulate());
  await wait(400);
  const s1 = await page.$eval('[data-orb]', (el) => [el.dataset.state, el.querySelector('[data-orb-status]').textContent]);
  check(s1[0] === 'listening' && s1[1] === 'Amariya is listening', `talk → ${s1.join(' / ')}`);
  await wait(2000);
  const s2 = await page.$eval('[data-orb]', (el) => [el.dataset.state, el.querySelector('[data-orb-status]').textContent]);
  check(s2[0] === 'speaking' && s2[1] === 'Amariya is speaking', `then → ${s2.join(' / ')}`);
  await wait(6000);
  const s3 = await page.$eval('[data-orb]', (el) => el.dataset.state);
  check(s3 === 'idle', `then → ${s3}`);
  await page.close();
}
console.log(failures ? `${failures} FAILED` : 'all checks passed');
await browser.close();
