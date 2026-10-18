// Orb manipulation checks per niche: mouse drag turns it, a throw keeps spinning then settles, pitch springs back,
// keyboard turns it, a paused orb still turns under the hand, horizontal touch turns it while vertical touch scrolls the page.
// Updated for the niche pages: Pause is the first *visible* [data-orb-pause] (the pages render it in the chrome and in a
// menu), and the orb is measured after its first-visit entrance has settled. Every expectation is unchanged.
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
// Runs on the machine's GPU by default: the touch checks need the page at a real frame rate. Under software GL
// (GL=swiftshader) the hotel house and the dental pearl draw 1 to 4 frames a second, puppeteer's finger waits that long
// for each touch event to be handled, so the page sees a finger held still for over 350 ms, which is (correctly) a
// long press: the pearl lifts and the lantern tilts instead of turning or scrolling.
const SOFT = process.env.GL === 'swiftshader';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: SOFT ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [], protocolTimeout: 400000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
{
  const probe = await browser.newPage();
  console.log('GL:', await probe.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return 'none (no WebGL 2)'; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }));
  await probe.close();
}
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`  ${ok ? 'pass' : 'FAIL'} ${label}`); };
const pose = (page) => page.evaluate(() => window.amariyaOrb.pose);
const center = (page) => page.evaluate(() => { const r = document.querySelector('.orb').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
const canvasShot = async (page) => { const c = await center(page); return (await page.screenshot({ clip: { x: c.x - c.r, y: c.y - c.r, width: c.r * 2, height: c.r * 2 }, type: 'png', captureBeyondViewport: false })).toString('base64'); }; // in-viewport capture: the default briefly resizes the page

const pauseButton = async (page) => {
  for (const h of await page.$$('[data-orb-pause]')) {
    const ok = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('dialog:not([open]), details:not([open])'); });
    if (ok) return h;
  }
  throw new Error('no visible [data-orb-pause]');
};
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
for (const niche of NICHES) {
  console.log(niche);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('amariya_motion', 'on'); } catch {} });
  await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('.orb.is-live', { timeout: 30000 });
  await wait(1800);
  const c = await center(page);

  // 1. Drag: yaw follows the hand while held; release right after the last move is a throw
  const before = await canvasShot(page);
  await page.mouse.move(c.x - c.r * 0.5, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 6 });
  const held = await page.evaluate(() => ({ ...window.amariyaOrb.pose, grab: document.querySelector('.orb').dataset.grab }));
  await page.mouse.move(c.x + c.r * 0.5, c.y, { steps: 6 });
  await page.mouse.up();
  check(held.dragging && held.yaw > 0.6 && held.yaw < 1.0, `drag turns it while held (yaw ${held.yaw.toFixed(2)} at half way, expected ≈0.8)`);
  check(held.grab === 'true', 'grab state set on the element');
  await wait(300);
  // A flick fired from inside the page, so its event times are real even when frames are slow (no GPU here)
  const released = await page.evaluate((c) => {
    const el = document.querySelector('.orb');
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: c.y, button: 0, pointerId: 7, isPrimary: true, bubbles: true }));
    ev('pointerdown', c.x - c.r * 0.4);
    for (let i = 1; i <= 6; i++) ev('pointermove', c.x - c.r * 0.4 + (c.r * 0.8 * i) / 6);
    ev('pointerup', c.x + c.r * 0.4);
    return window.amariyaOrb.pose;
  }, c);
  check(!released.dragging && released.speed > 0.5, `release throws it (speed ${released.speed.toFixed(2)} rad/s)`);
  await wait(1200);
  const later = await pose(page);
  check(later.yaw > released.yaw + 0.05, `keeps turning after release (${released.yaw.toFixed(2)} → ${later.yaw.toFixed(2)})`);
  await wait(5500);
  const settled = await pose(page);
  check(settled.speed < 0.05, `settles within 7 s (speed ${settled.speed.toFixed(3)})`);
  check(before !== (await canvasShot(page)), 'the rendered orb changed with the turn');

  // 2. Pitch: a vertical drag nods it, then it springs back level
  await page.mouse.move(c.x, c.y - c.r * 0.3);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + c.r * 0.3, { steps: 8 });
  const nod = await pose(page);
  check(Math.abs(nod.pitch) > 0.3, `vertical drag nods it (pitch ${nod.pitch.toFixed(2)})`);
  await page.mouse.up();
  await wait(2500);
  const level = await pose(page);
  check(Math.abs(level.pitch) < 0.03, `springs back level (pitch ${level.pitch.toFixed(3)})`);

  // 3. Keyboard
  await page.focus('.orb');
  const k0 = (await pose(page)).yaw;
  await page.keyboard.press('ArrowRight');
  await wait(300);
  const k1 = (await pose(page)).yaw;
  check(k1 > k0 + 0.1, `ArrowRight turns it (${k0.toFixed(2)} → ${k1.toFixed(2)})`);
  await wait(2500);
  await page.keyboard.press('Home');
  await wait(100);
  check(Math.abs((await pose(page)).yaw) < 1e-6, 'Home resets the pose');

  // 4. Paused: still turns under the hand, without inertia, and redraws
  await (await pauseButton(page)).click();
  await wait(300);
  const p0 = await canvasShot(page);
  await page.mouse.move(c.x - c.r * 0.5, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + c.r * 0.5, c.y, { steps: 10 });
  await page.mouse.up();
  await wait(300);
  const pausedPose = await pose(page);
  check(pausedPose.yaw > 1.2 && pausedPose.speed === 0, `paused: turned (${pausedPose.yaw.toFixed(2)}) with no inertia`);
  check(p0 !== (await canvasShot(page)), 'paused: redrew the new pose');
  await (await pauseButton(page)).click();

  // 5. Touch: horizontal swipe turns it; vertical swipe scrolls the page instead
  await page.keyboard.press('Home');
  await wait(100);
  const t0 = (await pose(page)).yaw;
  const t = page.touchscreen;
  await t.touchStart(c.x - c.r * 0.4, c.y);
  for (let i = 1; i <= 8; i++) await t.touchMove(c.x - c.r * 0.4 + (c.r * 0.8 * i) / 8, c.y);
  await t.touchEnd();
  await wait(100);
  const t1 = (await pose(page)).yaw;
  check(t1 > t0 + 0.8, `horizontal touch turns it (${t0.toFixed(2)} → ${t1.toFixed(2)})`);
  await wait(3000);
  await page.evaluate(() => { document.body.style.paddingBottom = '1500px'; });
  const y0 = await page.evaluate(() => scrollY);
  const yaw0 = (await pose(page)).yaw;
  await t.touchStart(c.x, c.y + c.r * 0.4);
  for (let i = 1; i <= 10; i++) await t.touchMove(c.x, c.y + c.r * 0.4 - (c.r * 0.9 * i) / 10);
  await t.touchEnd();
  await wait(600);
  const y1 = await page.evaluate(() => scrollY);
  const yaw1 = (await pose(page)).yaw;
  check(y1 > y0 + 20, `vertical touch scrolls the page (${y0} → ${y1}px)`);
  check(Math.abs(yaw1 - yaw0) < 0.3, `vertical touch does not turn it much (Δyaw ${(yaw1 - yaw0).toFixed(2)})`);
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
  await page.close();
}
console.log(failures ? `${failures} FAILED` : 'all checks passed');
await browser.close();
