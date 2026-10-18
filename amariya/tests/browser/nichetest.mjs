// Each niche's own features across its 3D scene and its page (the build spec's test plan, items 8 to 10):
//  hotels: the night (:root --t) runs 0 → 1 down the page; the Property Card rebuilds the house (rooms → floors, the
//    name on the canopy); a scenario chip changes the house; the key rack's ledger matches the page's.
//  clinics: pushing her into the line (the API and the visible button) lands a hand-off slip on the team's side; the
//    lens is remembered across a reload; the dial's tabs follow the scroll through the pin and the arrow keys;
//    showMark() turns her over without an error.
//  dental: the pearl rolls from recess to recess as the sheet scrolls (pearl:arrive in time order); a long press lifts
//    her, and dropped on an open gap she sets there (sheet:fill) and its call inks in; a tap on a gap does the same;
//    the NOW line reads the visitor's clock (the clock is set to 10:30 here).
// Usage: node nichetest.mjs [base] [niches...]   (GL=swiftshader for software GL; the drag and scroll checks need a GPU)
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
const SOFT = process.env.GL === 'swiftshader';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: SOFT ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [], protocolTimeout: 600000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`  ${ok ? 'pass' : 'FAIL'} ${label}`); return ok; };
const until = async (page, fn, arg, ms = 6000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await wait(120);
  }
  return false;
};
const jumpTo = (page, y) => page.evaluate((y) => { window.lenis?.scrollTo?.(y, { immediate: true }); window.scrollTo(0, y); }, y);
const topOf = (page, sel) => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().top + scrollY, sel);

async function open(niche, { before } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('amariya_visited', '1'); localStorage.setItem('amariya_intro', '1'); localStorage.setItem('amariya_motion', 'on'); } catch {} });
  if (before) await page.evaluateOnNewDocument(before);
  await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.orb.is-live', { timeout: 30000 }).catch(() => {});
  await wait(1200);
  return { page, errors };
}

const T = {
  async hotels() {
    const { page, errors } = await open('hotels');
    check(await until(page, () => !!window.amariyaNight && !!window.amariyaHouse && !!window.amariyaKeys, null, 15000), 'the house scene is up (amariyaNight, amariyaHouse, amariyaKeys)');
    // The night runs down the page
    const ts = [];
    for (const id of ['house', 'lobby', 'night-desk', 'handover', 'register']) {
      await page.evaluate((id) => window.amariyaNight.setMinutes(window.amariyaNight.chapters.find((c) => c.id === id).minutes, { immediate: true }), id);
      await wait(900);
      ts.push(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--t'))));
    }
    check(ts.every((t, i) => i === 0 || t > ts[i - 1]) && ts[0] < 0.02 && ts.at(-1) > 0.98, `--t runs 0 → 1 through the night (${ts.map((t) => t.toFixed(3)).join(', ')})`);
    // The Property Card rebuilds the house
    const floors0 = await page.evaluate(() => window.amariyaHouse.params.floors);
    await page.evaluate(() => document.querySelector('form[data-profile]').scrollIntoView({ block: 'center' }));
    await wait(800);
    const rooms = await page.$('form[data-profile] [name="rooms"]');
    await rooms.focus();
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.type('20');
    await page.keyboard.press('Tab');
    check(await until(page, () => window.amariyaHouse.params.floors === 2, null, 4000), `20 rooms → a 2-floor house (was ${floors0}, now ${await page.evaluate(() => window.amariyaHouse.params.floors)})`);
    await rooms.focus();
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.type('80');
    await page.keyboard.press('Tab');
    check(await until(page, () => window.amariyaHouse.params.floors === 6, null, 4000), `80 rooms → 6 floors, ceil(80 / 14) (${await page.evaluate(() => window.amariyaHouse.params.floors)})`);
    const name = await page.$('form[data-profile] [name="hotel_name"]');
    await name.focus();
    await page.keyboard.type('The Harbour House');
    await page.keyboard.press('Tab');
    check(await until(page, () => window.amariyaHouse.params.name === 'The Harbour House', null, 4000), `the name goes up on the canopy ("${await page.evaluate(() => window.amariyaHouse.params.name)}")`);
    // A scenario chip changes the house
    await jumpTo(page, 0);
    await wait(900);
    const before = await page.evaluate(() => JSON.stringify(window.amariyaHouse.params));
    await page.click('[data-scenario] > summary');
    await wait(300);
    await page.click('[data-scenario] input[value="restaurant"]');
    const changed = await until(page, (b) => JSON.stringify(window.amariyaHouse.params) !== b && window.amariyaHouse.params.ground === 'restaurant', before, 4000);
    check(changed, `the restaurant chip rebuilds the house (${await page.evaluate(() => JSON.stringify(window.amariyaHouse.params))})`);
    check(await page.evaluate(() => /restaurant/i.test(document.querySelector('[data-scenario-label]').textContent)), `  and the sentence names it ("${await page.evaluate(() => document.querySelector('[data-scenario-label]').textContent)}")`);
    check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
    await page.close();
  },

  async clinics() {
    let { page, errors } = await open('clinics');
    check(await until(page, () => !!window.amariyaPorcelain, null, 15000), 'the porcelain is up (amariyaPorcelain)');
    // Into the line: a slip lands on the team's side
    const slips = () => page.evaluate(() => document.querySelectorAll('[data-handoff-log] .slip').length);
    const n0 = await slips();
    await page.evaluate(() => window.amariyaPorcelain.pushAcrossLine());
    check(await until(page, (n) => document.querySelectorAll('[data-handoff-log] .slip').length > n, n0, 5000), `pushAcrossLine() lands a hand-off slip (${n0} → ${await slips()})`);
    const stamp = await page.evaluate(() => document.querySelector('[data-handoff-log] .slip:last-child .slip-stamp')?.textContent ?? '');
    check(/CLINICAL/.test(stamp), `  stamped for the team ("${stamp}")`);
    await wait(2500); // the line's cooldown
    const n1 = await slips();
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(600);
    const push = await page.$('[data-push]');
    const pushShown = await push?.evaluate((el) => !el.hidden && el.getClientRects().length > 0);
    if (check(!!pushShown, 'the "push her across the line" button is on the first screen')) {
      await push.click();
      check(await until(page, (n) => document.querySelectorAll('[data-handoff-log] .slip').length > n, n1, 5000), `  and pressing it lands a slip too (${n1} → ${await slips()})`);
    }
    // The dial follows the scroll through its pin, and the arrow keys
    const features = await topOf(page, '#features');
    const span = await page.evaluate(() => { const el = document.getElementById('features'); return el.offsetHeight - innerHeight; });
    const seen = [];
    for (let f = 0.02; f <= 0.98; f += 0.12) {
      await jumpTo(page, features + span * f);
      await wait(500);
      const k = await page.evaluate(() => document.querySelector('[data-dial-tab][aria-selected="true"]')?.dataset.dialTab);
      if (k && seen.at(-1) !== k) seen.push(k);
    }
    check(seen.length >= 4, `scrolling the pin turns the dial (${seen.join(' → ')})`);
    await page.focus('[data-dial-tab][aria-selected="true"]');
    const k0 = await page.evaluate(() => document.activeElement.dataset.dialTab);
    await page.keyboard.press('ArrowLeft');
    await wait(900);
    const k1 = await page.evaluate(() => ({ focus: document.activeElement.dataset.dialTab, selected: document.querySelector('[data-dial-tab][aria-selected="true"]')?.dataset.dialTab }));
    check(!!k1.focus && k1.focus !== k0 && k1.selected === k1.focus, `ArrowLeft moves the dial's tab (${k0} → ${k1.focus}, selected ${k1.selected})`);
    // She turns over to show her mark
    await page.evaluate(() => window.amariyaPorcelain.showMark());
    await wait(1200);
    // The lens is remembered
    const lens0 = await page.evaluate(() => document.documentElement.dataset.lens);
    const other = lens0 === 'medical' ? 'aesthetic' : 'medical';
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(400);
    await page.click(`[data-bar] [data-lens-set="${other}"]`);
    await wait(300);
    check(await page.evaluate((o) => document.documentElement.dataset.lens === o && localStorage.getItem('amariya_lens') === o, other), `the lens switches to ${other}`);
    check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(800);
    const kept = await page.evaluate(() => ({ lens: document.documentElement.dataset.lens, pressed: document.querySelector(`[data-bar] [data-lens-set="${document.documentElement.dataset.lens}"]`)?.getAttribute('aria-pressed') }));
    check(kept.lens === other && kept.pressed === 'true', `  and is remembered after a reload (${JSON.stringify(kept)})`);
    await page.evaluate((l) => localStorage.setItem('amariya_lens', l), lens0);
    await page.close();
  },

  async dental() {
    // The visitor's clock at 10:30, running
    const at1030 = () => {
      const RealDate = Date;
      const target = new RealDate(); target.setHours(10, 30, 0, 0);
      const offset = target.getTime() - RealDate.now();
      class Shifted extends RealDate {
        constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
        static now() { return RealDate.now() + offset; }
      }
      window.Date = Shifted;
    };
    const { page, errors } = await open('dental', { before: at1030 });
    check(await until(page, () => !!window.amariyaPearl, null, 15000), 'the pearl is up (amariyaPearl)');
    const nowText = await page.evaluate(() => document.querySelector('[data-now-time]')?.textContent.trim());
    check(/^10:30\s?(am)?$/i.test(nowText ?? ''), `the NOW line reads the visitor's clock (${nowText})`);
    // The NOW line sits between the entries around 10:30 (the 09:10 entry above it, the 12:20 one below)
    const order = await page.evaluate(() => {
      const y = (el) => el.getBoundingClientRect().top + scrollY;
      const line = document.querySelector('[data-now-line]');
      const a = document.getElementById('e-0910'), b = document.getElementById('e-1220');
      return a && b && line ? { a: Math.round(y(a)), line: Math.round(y(line)), b: Math.round(y(b)) } : null;
    });
    check(!!order && order.a < order.line && order.line < order.b, `  and lies on the sheet at 10:30, between the 09:10 and 12:20 entries (${JSON.stringify(order)})`);
    // She rolls from recess to recess as the sheet scrolls
    await page.evaluate(() => { window.__arrived = []; document.addEventListener('pearl:arrive', (e) => window.__arrived.push(e.detail.slot)); });
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= total; y += 300) { await jumpTo(page, y); await wait(160); }
    await wait(1200);
    const arrived = await page.evaluate(() => window.__arrived);
    const times = await page.evaluate((slots) => slots.map((s) => document.querySelector(`[data-slot="${CSS.escape(s)}"]`)?.dataset.time ?? ''), arrived);
    const inOrder = times.filter(Boolean).every((t, i, a) => i === 0 || t >= a[i - 1]);
    check(arrived.length >= 5 && inOrder, `pearl:arrive follows the day down the sheet (${arrived.map((s, i) => `${s}@${times[i]}`).join(' → ')})`);
    // A tap on an open gap: she carries herself there, sets, and its call inks in
    await page.evaluate(() => { window.__filled = []; document.addEventListener('sheet:fill', (e) => window.__filled.push(e.detail.slot)); });
    const gaps = await page.evaluate(() => [...document.querySelectorAll('.gap-recess[data-open]')].map((g) => g.dataset.slot));
    check(gaps.length >= 2, `open gaps on the sheet (${gaps.join(', ')})`);
    const tapGap = gaps[0];
    // Each gap is brought to 70 % down the screen, clear of the pearl, who rests at the reading line (38 %)
    const gapAt = (s) => page.evaluate((s) => { const r = document.querySelector(`[data-slot="${s}"]`).getBoundingClientRect(); const y = r.top + r.height / 2 + scrollY - innerHeight * 0.7; window.lenis?.scrollTo?.(y, { immediate: true }); window.scrollTo(0, y); }, s);
    await gapAt(tapGap);
    await wait(1500);
    await page.click(`[data-slot="${tapGap}"]`);
    check(await until(page, (s) => window.__filled.includes(s), tapGap, 8000), `a tap on gap ${tapGap} sets her there (sheet:fill)`);
    check(await until(page, (s) => { const r = document.querySelector(`[data-slot="${s}"]`); return r.hasAttribute('data-set') && !r.hasAttribute('data-open'); }, tapGap, 3000), '  the gap is filled (data-set)');
    // A long press lifts her; dropped on the next open gap she sets there
    const dropGap = gaps.find((g) => g !== tapGap);
    await gapAt(dropGap);
    await wait(1500);
    const geo = await page.evaluate((s) => {
      const o = document.querySelector('.orb').getBoundingClientRect(), g = document.querySelector(`[data-slot="${s}"]`).getBoundingClientRect();
      return { ox: o.left + o.width / 2, oy: o.top + o.height / 2, gx: g.left + g.width / 2, gy: g.top + g.height / 2 };
    }, dropGap);
    await page.mouse.move(geo.ox, geo.oy);
    await page.mouse.down();
    await wait(600);
    const lifted = await page.evaluate(() => document.querySelector('.orb').dataset.carry === 'true');
    check(lifted, 'a long press lifts her (data-carry)');
    await page.mouse.move(geo.gx, geo.gy, { steps: 16 });
    await wait(400);
    await page.mouse.up();
    check(await until(page, (s) => window.__filled.includes(s), dropGap, 6000), `dropped on gap ${dropGap}, she sets there (sheet:fill)`);
    check(await until(page, (s) => { const g = document.querySelector(`[data-gap="${s}"]`); return !!g && (g.hasAttribute('data-playing') || g.hasAttribute('data-done')) && !g.querySelector('[data-gap-call]')?.hidden; }, dropGap, 3000), '  and its call opens and plays');
    check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
    await page.close();
  },
};

for (const niche of NICHES) {
  console.log(niche);
  await T[niche]();
}
console.log(failures ? `${failures} FAILED` : 'all checks passed');
await browser.close();
