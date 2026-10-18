// Functional checks per niche page: structure and landmarks, the industry switcher, the voice and chat UI through a
// simulated call, the start sheet and 'Type instead', the agent's tools (navigation with the polite rule, profile and
// ROI, spotlight, recommendation, fill and submit), the ROI typed by hand, the application form by hand (validation
// messages, step changes and focus, success state, local storage), keyboard paths (skip link, tab order, the orb,
// focus never under the fixed chrome), 44 px targets, Pause motion and reduced motion.
// Runs with motion paused (stills, instant typing) except where a check needs it on. One browser, one page at a time.
// Usage: node functest.mjs [base] [niches...]
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: process.env.GL === 'gpu' ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'], // GL=gpu: the machine's GPU
  protocolTimeout: 400000,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`  ${ok ? 'pass' : 'FAIL'} ${label}`); return ok; };

/** Expected figures (contract 9 test vectors) and each page's own hooks */
const CFG = {
  hotels: {
    units: 80, revenue: '$15,840', recovered: '240', hours: '64', payback: '5', minutes: ['960', '3,840'],
    roi: '[data-handover]', pricing: 'keys', demo: 'register', features: 'restaurant', chrome: '.cornice',
    dock: '[data-dock][data-variant="bottom"]',
  },
  clinics: {
    units: 4, revenue: '$16,313', recovered: '150', hours: '50', payback: '7', minutes: ['750', '3,000'],
    roi: '#profile', pricing: 'pricing', demo: 'apply', features: 'features', chrome: '[data-bar]',
    dock: '[data-dock]',
  },
  dental: {
    units: 5, revenue: '$13,500', recovered: '225', hours: '60', payback: '7', minutes: ['900', '3,600'],
    roi: '#profile', pricing: 'pricing', demo: 'apply', features: 'features', chrome: '.ruler',
    dock: '[data-dock][data-variant="bottom"]',
  },
};

async function open(ctx, niche, { width = 1280, height = 800, paused = true, reduced = false, mobile = false } = {}) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((paused) => {
    try {
      localStorage.setItem('amariya_motion', paused ? 'paused' : 'on');
      // A returning visitor: no first-visit intros in the way of the checks
      localStorage.setItem('amariya_visited', '1');
      localStorage.setItem('amariya_intro', '1');
    } catch {}
  }, paused);
  await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.orb.is-live', { timeout: 30000 }).catch(() => {});
  await wait(600);
  return { page, errors };
}

const text = (page, sel) => page.$eval(sel, (el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).catch(() => null);
const visible = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]');
}, sel);
const until = async (page, fn, arg, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await wait(150);
  }
  return false;
};
/** Clicks the first visible match (several pages render a control twice: chrome and menu) */
async function clickVisible(page, sel) {
  const handles = await page.$$(sel);
  for (const h of handles) {
    const box = await h.boundingBox();
    const shown = await h.evaluate((el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && !el.closest('[hidden]') && !el.closest('dialog:not([open])') && !el.closest('details:not([open]) > :not(summary)'); });
    if (box && box.width > 0 && box.height > 0 && shown) {
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await wait(250);
      await h.click();
      return true;
    }
  }
  return false;
}
const scrollTo = (page, id) => page.evaluate((id) => { const el = document.getElementById(id); el?.scrollIntoView({ block: 'start' }); }, id);

for (const niche of NICHES) {
  const C = CFG[niche];
  console.log(`\n${niche}`);
  const ctx = await browser.createBrowserContext();

  /* ---------- 1. Structure, landmarks, switcher, targets ---------- */
  let { page, errors } = await open(ctx, niche);
  const s = await page.evaluate(() => {
    const chapters = [...document.querySelectorAll('[data-chapter]')];
    const labelled = chapters.every((c) => { const id = c.getAttribute('aria-labelledby'); return !!id && !!document.getElementById(id); });
    const sw = document.querySelector('nav[aria-label="Industries"]');
    const links = sw ? [...sw.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]) : [];
    const buttons = [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="slider"]')];
    const unnamed = buttons.filter((b) => b.getClientRects().length && !b.closest('[hidden], [aria-hidden="true"]')).filter((b) => {
      const name = (b.getAttribute('aria-label') || b.textContent || b.getAttribute('title') || '').trim();
      const lb = b.getAttribute('aria-labelledby');
      return !name && !(lb && document.getElementById(lb)?.textContent?.trim());
    }).map((b) => b.outerHTML.slice(0, 80));
    const fields = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')];
    const unlabelled = fields.filter((f) => !(f.labels?.length || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.closest('label'))).map((f) => f.outerHTML.slice(0, 80));
    return {
      h1: document.querySelectorAll('h1').length,
      orbs: document.querySelectorAll('.orb[data-orb][data-orb-canvas="fixed"]').length,
      canvases: document.querySelectorAll('canvas[data-stage-canvas]').length,
      labelled, count: chapters.length, links, unnamed, unlabelled,
      lang: document.documentElement.lang, title: document.title,
      sections: ['welcome', 'profile', 'features', 'pricing', 'demo'].map((n) => !!document.querySelector(`[data-section="${n}"]`)),
      italic: [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).fontStyle === 'italic').length,
    };
  });
  check(s.h1 === 1, `one h1 (${s.h1})`);
  check(s.orbs === 1 && s.canvases === 1, `one fixed orb root and one stage canvas (${s.orbs}, ${s.canvases})`);
  check(s.labelled && s.count >= 7, `every chapter is labelled by an existing heading (${s.count} chapters, labelled ${s.labelled})`);
  check(s.sections.every(Boolean), `the agent's five sections are on the page (${s.sections})`);
  check(s.links.length === 3 && s.links.filter(([, c]) => c === 'page').length === 1 && s.links.find(([h, c]) => c === 'page')?.[0] === `/${niche}`, `switcher: three industries, this one current (${JSON.stringify(s.links)})`);
  check(s.unnamed.length === 0, `every button has a name${s.unnamed.length ? ': ' + s.unnamed.join(' | ') : ''}`);
  check(s.unlabelled.length === 0, `every field has a label${s.unlabelled.length ? ': ' + s.unlabelled.join(' | ') : ''}`);
  check(s.italic === 0, `no italic text (${s.italic})`);
  check(s.lang === 'en' && !!s.title, 'lang and title set');
  // Landmarks a screen reader lists are told apart: no two exposed with the same role and name
  const dupes = await page.evaluate(() => {
    const exposed = (el) => !el.closest('[hidden], [aria-hidden="true"], dialog:not([open]), details:not([open]) > :not(summary)') && el.getClientRects().length > 0;
    const nameOf = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ')).trim();
    const roleOf = (el) => {
      const r = el.getAttribute('role');
      if (r) return r;
      const t = el.tagName.toLowerCase();
      if (t === 'nav') return 'navigation';
      if (t === 'aside') return 'complementary';
      if (t === 'main') return 'main';
      if (t === 'header') return el.closest('article, aside, main, nav, section') ? null : 'banner';
      if (t === 'footer') return el.closest('article, aside, main, nav, section') ? null : 'contentinfo';
      if ((t === 'section' || t === 'form') && nameOf(el)) return t === 'section' ? 'region' : 'form';
      return null;
    };
    const seen = new Map();
    for (const el of document.querySelectorAll('nav, aside, main, header, footer, section, form, [role="navigation"], [role="region"], [role="complementary"], [role="search"]')) {
      const role = roleOf(el);
      if (!role || !['navigation', 'complementary', 'main', 'banner', 'contentinfo', 'region', 'form', 'search'].includes(role) || !exposed(el)) continue;
      const key = `${role} "${nameOf(el)}"`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
  });
  check(dupes.length === 0, `landmarks are unique by role and name${dupes.length ? ': ' + dupes.join(', ') : ''}`);

  // The copy's counts are what the page shows: the call room's lede in each lens, the application's question step
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  if (niche === 'clinics') {
    for (const lens of ['medical', 'aesthetic']) {
      await clickVisible(page, `[data-lens-set="${lens}"]`);
      await wait(300);
      const got = await page.evaluate(() => ({
        lede: document.querySelector('#call .lede')?.innerText.trim() ?? '',
        shown: [...document.querySelectorAll('#call .call-pick')].filter((b) => b.getClientRects().length).length,
        lens: document.documentElement.dataset.lens,
      }));
      const said = WORDS.indexOf(got.lede.split(' ')[0].toLowerCase());
      check(got.lens === lens && said === got.shown, `${lens} lens: the call room says "${got.lede.split(',')[0]}" and lists ${got.shown}`);
    }
  }
  if (niche === 'dental') {
    const got = await page.evaluate(() => {
      const step = document.querySelector('[data-apply-step="2"]');
      return {
        asked: step ? step.querySelectorAll(':scope > fieldset, :scope > .slip-rows > .slip-row').length : 0,
        legend: step?.querySelector('legend')?.textContent?.trim() ?? '',
        next: document.querySelector('[data-apply-next]')?.textContent?.trim() ?? '',
      };
    });
    const promised = (t) => WORDS.findIndex((w) => new RegExp(`\\b${w} questions\\b`, 'i').test(t));
    check(promised(got.legend) === got.asked && promised(got.next) === got.asked, `step 2 promises "${got.legend}" / "${got.next}" and asks ${got.asked}`);
  }

  // Targets in the fixed chrome and the dock are at least 44 px
  const small = await page.evaluate((sel) => {
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      for (const el of root.querySelectorAll('a[href], button, [role="slider"], summary, input, select')) {
        const box = el.getBoundingClientRect();
        const after = getComputedStyle(el, '::after');
        const grow = after.content !== 'none' && after.position === 'absolute' ? { t: Math.max(0, -parseFloat(after.top) || 0), b: Math.max(0, -parseFloat(after.bottom) || 0) } : { t: 0, b: 0 };
        const r = { width: box.width, height: box.height + grow.t + grow.b };
        let clipped = false; for (let p = el; p && p !== root; p = p.parentElement) { const b = p.getBoundingClientRect(); if (b.width <= 1 || b.height <= 1) { clipped = true; break; } }
        if (clipped || !r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]') || el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
        if (r.height < 43.5 && r.width < 43.5) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.width)}×${Math.round(r.height)}`);
        else if (r.height < 43.5 || r.width < 23.5) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return out;
  }, `${C.chrome}, ${C.dock}`);
  check(small.length === 0, `chrome and dock targets ≥ 44 px${small.length ? ': ' + small.join(', ') : ''}`);

  /* ---------- 2. Voice and chat UI through a simulated call ---------- */
  const state = () => page.evaluate((dock) => {
    const d = document.querySelector(dock), orb = document.querySelector('[data-orb]');
    const shown = (sel) => { const b = d?.querySelector(sel); return !!b && !b.hidden; };
    return {
      body: document.body.dataset.state, orb: orb?.dataset.state, status: orb?.querySelector('[data-orb-status]')?.textContent,
      dock: d?.dataset.state, dockStatus: d?.querySelector('[data-dock-status]')?.textContent?.trim(),
      talk: shown('[data-dock-talk]'), end: shown('[data-dock-end]'),
      box: d?.querySelector('[data-dock-states] [data-on="true"]')?.dataset.k ?? null,
    };
  }, C.dock);
  await page.evaluate(() => window.amariyaVoice.simulate());
  await wait(350);
  let v = await state();
  check(v.body === 'listening' && v.orb === 'listening' && v.status === 'Amariya is listening', `simulate → listening (${v.body}/${v.orb}/${v.status})`);
  check(v.dock === 'listening' && !v.talk && v.end && v.box === 'listen', `dock follows: listening, End shown, Talk hidden, box ticked (${JSON.stringify(v)})`);
  await wait(1900);
  v = await state();
  check(v.body === 'speaking' && v.status === 'Amariya is speaking' && v.dock === 'speaking' && v.box === 'speak', `then speaking (${v.body}/${v.status}/${v.dock}/${v.box})`);
  await page.evaluate(() => window.amariyaVoice.stop());
  await wait(200);
  v = await state();
  check(v.body === 'idle' && v.orb === 'idle' && v.talk && !v.end, `End → idle, Talk back (${JSON.stringify(v)})`);
  await page.evaluate(() => window.amariyaVoice.simulate());
  await wait(7900);
  v = await state();
  check(v.body === 'idle' && v.status === 'Amariya is ready', `a simulated call ends by itself at 7.6 s (${v.body}/${v.status})`);

  /* ---------- 3. The start sheet ---------- */
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  const clicked = await clickVisible(page, '[data-orb-talk]');
  await wait(400);
  check(clicked && await page.evaluate(() => !!document.querySelector('dialog[data-sheet]')?.open), 'Talk opens the start sheet');
  const focusInSheet = await page.evaluate(() => !!document.activeElement?.closest('dialog[data-sheet]'));
  check(focusInSheet, 'focus moves into the sheet');
  await page.keyboard.press('Escape');
  await wait(300);
  check(await page.evaluate(() => !document.querySelector('dialog[data-sheet]')?.open && document.body.dataset.state === 'idle'), 'Escape closes it and nothing starts');

  /* ---------- 4. The agent's tools ---------- */
  const tool = (name, args) => page.evaluate((name, args) => Promise.resolve(window.amariyaTools[name](args)), name, args);
  // Navigation: the visitor's own input in the last 2.5 s makes it a follow note; otherwise the page moves
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(400);
  await page.mouse.wheel({ deltaY: 40 });
  await wait(100);
  let reply = await tool('navigate_to_section', { section: 'pricing' });
  check(reply === 'Now showing the pricing section.', `navigate_to_section reply (${reply})`);
  const followed = await until(page, () => { const f = document.querySelector('[data-follow]'); return !!f && !f.hidden; }, null, 2000);
  check(followed, 'within 2.5 s of the visitor\'s input it offers the follow note instead of scrolling');
  const y0 = await page.evaluate(() => scrollY);
  check(y0 < 300, `and the page stayed put (scrollY ${y0})`);
  await wait(2700);
  reply = await tool('navigate_to_section', { section: 'pricing' });
  const arrived = await until(page, (id) => { const r = document.getElementById(id)?.getBoundingClientRect(); return !!r && r.top < innerHeight * 0.5 && r.bottom > 0; }, C.pricing, 4000);
  check(arrived, `without recent input it goes to #${C.pricing}`);
  check(await page.evaluate(() => location.hash.length > 1), `the hash follows (${await page.evaluate(() => location.hash)})`);
  reply = await tool('navigate_to_section', { section: 'nowhere' });
  check(/^Unknown section/.test(reply), `an unknown section says so (${reply})`);

  // Profile and ROI
  await wait(2600);
  reply = await tool('update_hotel_profile', { hotel_name: 'The Harbour House', rooms: C.units });
  check(reply.startsWith('Updated: hotel_name, rooms.') && reply.includes(C.revenue) && reply.includes(`Estimated monthly impact: ${C.recovered}`), `update_hotel_profile reply has the old sentence and ${C.revenue} (${reply.slice(0, 160)}…)`);
  const roiShown = await until(page, ({ sel, rev }) => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').includes(rev), { sel: C.roi, rev: C.revenue }, 10000);
  check(roiShown, `the page shows ${C.revenue}`);
  const roiText = await text(page, C.roi);
  for (const n of [C.recovered, C.hours, C.payback, ...C.minutes]) check(roiText?.includes(n), `the ROI shows ${n}`);
  check(await page.evaluate(() => { const f = document.querySelector('form[data-profile]'); const n = f?.querySelector('[name="hotel_name"]'); return n?.value === 'The Harbour House'; }), 'the profile form holds the name she typed');
  reply = await tool('get_roi_estimate');
  check(typeof reply === 'string' && reply.includes(C.revenue), `get_roi_estimate (${String(reply).slice(0, 100)}…)`);

  // Spotlight and recommendation
  reply = await tool('highlight_feature', { feature: 'upsells' });
  check(reply === 'Highlighting upsells.' && await page.evaluate(() => document.querySelector('[data-feature="upsells"]')?.classList.contains('spotlight')), `highlight_feature lights [data-feature=upsells] (${reply})`);
  check(await page.evaluate(() => document.querySelectorAll('.spotlight').length === 1), 'only one spotlight at a time');
  reply = await tool('recommend_plan', { plan: 'professional', reason: 'Two sites and a busy night desk' });
  const reason = await text(page, '[data-plan="founding"] [data-plan-reason]');
  check(reply === 'Showing professional as the recommended plan.' && !!reason && reason.includes('Two sites and a busy night desk'), `recommend_plan shows the reason on the founding licence (${reason})`);
  reply = await tool('recommend_plan', { plan: 'enterprise' });
  check(reply === 'Showing enterprise as the recommended plan.' && await page.evaluate(() => (() => { const lit = (el) => !!el && (el.classList.contains('recommended') || el.classList.contains('lit')); return lit(document.querySelector('[data-plan="groups"]')) && !lit(document.querySelector('[data-plan="founding"]')); })()), 'enterprise lights the groups option (and only it)');

  // Application through the agent
  reply = await tool('submit_demo_request');
  check(/^Cannot submit yet\. Missing: /.test(reply) && reply.includes('email'), `submit_demo_request with an empty form (${reply})`);
  reply = await tool('fill_demo_form', { name: 'Test Owner', email: 'owner@example.com', hotel_name: 'The Harbour House', phone: '+1 555 0100', preferred_time: 'Tuesday 10am' });
  check(reply === 'Filled: name, hotel_name, email, phone, preferred_time. All required fields are complete.', `fill_demo_form (${reply})`);
  await wait(600);
  const filled = await page.evaluate(() => { const f = document.querySelector('form[data-apply]'); return ['name', 'email', 'hotel_name'].map((n) => f?.querySelector(`[name="${n}"]`)?.value); });
  check(filled.join('|') === 'Test Owner|owner@example.com|The Harbour House', `the form holds what she typed (${filled})`);
  const before = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('amariya_applications') || '[]').length; } catch { return -1; } });
  reply = await tool('submit_demo_request');
  const stored = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('amariya_applications') || '[]'); } catch { return []; } });
  check(stored.length === before + 1 && stored.at(-1)?.industry === niche, `submit_demo_request stores the application locally (${reply})`);
  const done = await until(page, () => [...document.querySelectorAll('[data-apply-done], [data-apply-result]')].some((el) => !el.hidden), null, 3000);
  check(done, 'and the success state shows');
  const doneText = await page.evaluate(() => [...document.querySelectorAll('[data-apply-done], [data-apply-result]')].filter((el) => !el.hidden).map((el) => el.textContent.replace(/\s+/g, ' ').trim()).join(' '));
  check(!/booked|confirmed/i.test(doneText) || /we'll|we will|email/i.test(doneText), `the success copy is honest (no booking claimed without a calendar): "${doneText.slice(0, 140)}…"`);
  check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
  await page.close();

  /* ---------- 5. ROI and the application by hand ---------- */
  ({ page, errors } = await open(ctx, niche));
  await scrollTo(page, C.roi.startsWith('#') ? C.roi.slice(1) : 'handover');
  const rooms = await page.$('form[data-profile] [name="rooms"]');
  await rooms.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await wait(300);
  // Focused and typed by keyboard (a click could land on the lantern while it is still travelling across the page)
  await rooms.focus();
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.type(String(C.units), { delay: 40 });
  await page.keyboard.press('Tab');
  const typed = await until(page, ({ sel, rev }) => (document.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').includes(rev), { sel: C.roi, rev: C.revenue }, 8000);
  check(typed, `typing ${C.units} by hand shows ${C.revenue}`);

  await scrollTo(page, C.demo);
  await wait(400);
  const form = 'form[data-apply]';
  if (niche === 'hotels') {
    await page.click('[data-step-next]');
    await wait(300);
    const e1 = await page.evaluate(() => ['#r-name-err', '#r-email-err'].map((s) => { const el = document.querySelector(s); return el && !el.hidden ? el.textContent.trim() : ''; }));
    check(e1.every(Boolean), `step 1 empty: inline errors (${e1.join(' / ')})`);
    check(await page.evaluate(() => document.activeElement?.id === 'r-name' && document.querySelector('#r-name').getAttribute('aria-invalid') === 'true'), 'focus goes to the first field that needs the visitor');
    await page.type('#r-name', 'Hand Typed');
    await page.type('#r-email', 'not-an-email');
    await page.click('[data-step-next]');
    await wait(300);
    check(await page.evaluate(() => document.querySelector('#r-name-err').hidden && !document.querySelector('#r-email-err').hidden), 'a bad email keeps its error; the name clears');
    await page.click('#r-email', { clickCount: 3 });
    await page.type('#r-email', 'hand@example.com');
    await page.click('[data-step-next]');
    await wait(500);
    check(await page.evaluate(() => !document.querySelector('[data-step-panel="2"]').hidden && document.activeElement?.matches('[data-step-panel="2"] [data-step-title]')), 'Next shows step 2 and focuses its heading');
    await page.$eval('#r-hotel_name', (el) => { el.value = ''; });
    await page.click('[data-apply-submit]');
    await wait(300);
    const e2 = await page.evaluate(() => ['#r-hotel_name-err', '#r-consent-err'].map((s) => { const el = document.querySelector(s); return el && !el.hidden ? el.textContent.trim() : ''; }));
    check(e2.every(Boolean), `step 2 empty: inline errors (${e2.join(' / ')})`);
    await page.type('#r-hotel_name', 'The Night Owl');
    await page.click('#r-consent');
    await page.click('[data-apply-submit]');
  } else if (niche === 'clinics') {
    await page.$eval(`${form} [name="hotel_name"]`, (el) => { el.value = ''; });
    await clickVisible(page, '[data-apply-submit]');
    await wait(300);
    const box = await text(page, '[data-apply-errors]');
    const e1 = await page.evaluate(() => ['#a-name-err', '#a-email-err', '#a-hotel_name-err'].map((s) => { const el = document.querySelector(s); return el && !el.hidden ? el.textContent.trim() : ''; }));
    check(!!box && box.startsWith('Please add') && e1.every(Boolean), `empty: summary "${box}" and inline errors (${e1.join(' / ')})`);
    check(await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid') !== null && document.activeElement?.matches('input')), 'focus goes to the first field that needs the visitor');
    await page.type(`${form} [name="hotel_name"]`, 'Northside Clinic');
    await page.type(`${form} [name="name"]`, 'Hand Typed');
    await page.type(`${form} [name="email"]`, 'not-an-email');
    await clickVisible(page, '[data-apply-submit]');
    await wait(300);
    check(await page.evaluate(() => !document.querySelector('#a-email-err').hidden && document.querySelector('#a-name-err').hidden), 'a bad email keeps its error; the others clear');
    await page.click(`${form} [name="email"]`, { clickCount: 3 });
    await page.type(`${form} [name="email"]`, 'hand@example.com');
    await clickVisible(page, '[data-apply-submit]');
  } else {
    await clickVisible(page, '[data-apply-next]');
    await wait(300);
    const box = await text(page, '[data-apply-errors]');
    const e1 = await page.evaluate(() => ['#a-name-err', '#a-email-err', '#a-hotel_name-err'].map((s) => { const el = document.querySelector(s); return el && !el.hidden ? el.textContent.trim() : ''; }));
    check(!!box && box.startsWith('Please add') && e1.every(Boolean), `step 1 empty: summary "${box}" and inline errors (${e1.join(' / ')})`);
    check(await page.evaluate(() => document.activeElement?.hasAttribute('aria-invalid')), 'focus goes to the first field that needs the visitor');
    await page.type(`${form} [name="name"]`, 'Hand Typed');
    await page.$eval(`${form} [name="hotel_name"]`, (el) => { el.value = ''; });
    await page.type(`${form} [name="hotel_name"]`, 'Bright Smile Dental');
    await page.type(`${form} [name="email"]`, 'not-an-email');
    await clickVisible(page, '[data-apply-next]');
    await wait(300);
    check(await page.evaluate(() => !document.querySelector('#a-email-err').hidden && document.querySelector('#a-name-err').hidden), 'a bad email keeps its error; the others clear');
    await page.click(`${form} [name="email"]`, { clickCount: 3 });
    await page.type(`${form} [name="email"]`, 'hand@example.com');
    await clickVisible(page, '[data-apply-next]');
    await wait(400);
    check(await page.evaluate(() => !document.querySelector('[data-apply-step="2"]').hidden && !!document.activeElement?.closest('[data-apply-step="2"]')), 'Next shows step 2 and moves focus into it');
    await clickVisible(page, '[data-apply-submit]');
  }
  const ok = await until(page, () => [...document.querySelectorAll('[data-apply-done], [data-apply-result]')].some((el) => !el.hidden), null, 5000);
  check(ok, 'submitting by hand shows the success state');
  check(await page.evaluate(() => !!document.activeElement?.closest('[data-apply-done], [data-apply-result]')), 'focus moves to the result');
  if (niche === 'clinics') check(/^RECEIVED \d\d:\d\d$/.test((await text(page, '[data-received]')) ?? ''), `the RECEIVED stamp (${await text(page, '[data-received]')})`);
  const stored2 = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('amariya_applications') || '[]'); } catch { return []; } });
  check(stored2.at(-1)?.industry === niche && JSON.stringify(stored2.at(-1)).includes('hand@example.com'), 'the hand-typed application is stored');
  check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
  await page.close();

  /* ---------- 6. Keyboard: skip link, tab order, the orb, focus never under the chrome ---------- */
  ({ page, errors } = await open(ctx, niche));
  await page.keyboard.press('Tab');
  await wait(400);
  const first = await page.evaluate(() => ({ cls: document.activeElement?.closest('.skip-links') ? 'skip' : document.activeElement?.tagName, href: document.activeElement?.getAttribute('href'), shown: document.activeElement?.getBoundingClientRect().top >= 0 }));
  check(first.cls === 'skip' && first.shown, `the first Tab is a visible skip link (${JSON.stringify(first)})`);
  await page.keyboard.press('Enter');
  await wait(1500);
  const skipped = await page.evaluate((href) => { const t = document.querySelector(href); const r = t?.getBoundingClientRect(); return !!r && r.top < innerHeight && r.bottom > 0; }, first.href);
  check(skipped, `the skip link goes to ${first.href}`);
  await page.close();
  ({ page, errors } = await open(ctx, niche));
  const seen = [];
  let orbAt = -1, hidden = [], covered = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    await wait(80);
    const f = await page.evaluate((dockSel) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const fixed = [...document.querySelectorAll(dockSel)].concat([...document.querySelectorAll('.cornice, [data-bar], .ruler')]).filter((x) => getComputedStyle(x).position === 'fixed' || getComputedStyle(x).position === 'sticky');
      // Fixed-position controls (the chrome itself, skip links) sit above the page and cannot be covered by it
      let ownFixed = false; for (let p = el; p; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') { ownFixed = true; break; }
      const inChrome = ownFixed || fixed.some((x) => x.contains(el));
      const under = !inChrome && fixed.some((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && r.top < b.bottom - 2 && r.bottom > b.top + 2 && r.left < b.right && r.right > b.left && (r.bottom > b.top + 2) && (r.top >= b.top || r.bottom <= b.bottom) && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > r.height * 0.5; });
      return { tag: el.tagName.toLowerCase(), cls: [...el.classList].slice(0, 2).join('.'), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), orb: el.matches('[data-orb]'), hidden: r.width === 0 || r.height === 0 || cs.visibility === 'hidden', under };
    }, C.dock);
    if (!f) continue;
    seen.push(`${f.tag}${f.cls ? '.' + f.cls : ''}`);
    if (f.orb && orbAt < 0) orbAt = i;
    if (f.hidden) hidden.push(`${f.tag}.${f.cls} "${f.label}"`);
    if (f.under) covered.push(`${f.tag}.${f.cls} "${f.label}"`);
  }
  check(orbAt >= 0 && orbAt < 40, `Tab reaches the orb (at stop ${orbAt})`);
  check(hidden.length === 0, `no focus on invisible elements${hidden.length ? ': ' + hidden.slice(0, 5).join(', ') : ''}`);
  check(covered.length === 0, `focus is never hidden under the fixed chrome${covered.length ? ': ' + covered.slice(0, 5).join(', ') : ''}`);
  // The orb by keyboard: Enter opens the sheet; Escape closes it
  await page.focus('[data-orb]');
  await page.keyboard.press('Enter');
  await wait(400);
  check(await page.evaluate(() => !!document.querySelector('dialog[data-sheet]')?.open), 'Enter on the orb opens the start sheet');
  await page.keyboard.press('Escape');
  await wait(300);
  check(await page.evaluate(() => !document.querySelector('dialog[data-sheet]')?.open && document.activeElement?.matches('[data-orb]')), 'Escape closes it and focus returns to the orb');
  check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
  await page.close();

  /* ---------- 7. 'Type instead': the log opens with the composer focused; a failed start is a plain note ---------- */
  ({ page, errors } = await open(ctx, niche));
  await clickVisible(page, '[data-orb-talk]');
  await wait(400);
  await page.click('dialog[data-sheet] button[value="text"]');
  await wait(800);
  const log = await page.evaluate(() => ({ open: !document.querySelector('[data-log]')?.hidden, focus: document.activeElement?.matches('[data-log-form] input[name="msg"]') }));
  check(log.open && log.focus, `'Type instead' opens the log with the composer focused (${JSON.stringify(log)})`);
  // The text session either connects (then we end it) or fails with a plain note in the toast
  const outcome = await until(page, () => document.body.dataset.state === 'listening' || document.body.dataset.state === 'thinking' || !!document.querySelector('[data-toast]')?.textContent?.trim(), null, 15000);
  const toast = await text(page, '[data-toast]');
  const st = await page.evaluate(() => document.body.dataset.state);
  check(outcome && (st !== 'idle' || (!!toast && !/error|exception|undefined|\{|stack/i.test(toast))), `the text session connected (${st}) or failed with a plain note ("${toast ?? ''}")`);
  await page.evaluate(() => window.amariyaVoice.stop());
  await wait(500);
  await page.keyboard.press('Escape');
  await wait(300);
  check(await page.evaluate(() => document.querySelector('[data-log]')?.hidden), 'Escape closes the log');
  await page.close();

  /* ---------- 8. Pause motion and reduced motion ---------- */
  ({ page, errors } = await open(ctx, niche, { paused: false }));
  await clickVisible(page, '[data-orb-pause]');
  await wait(400);
  const paused = await page.evaluate(() => ({
    motion: document.documentElement.dataset.motion,
    pressed: [...document.querySelectorAll('[data-orb-pause]')].every((b) => b.getAttribute('aria-pressed') === 'true'),
    anims: document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.constructor.name} on ${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className}`),
  }));
  check(paused.motion === 'paused' && paused.pressed, `Pause sets html[data-motion=paused] and every Pause control pressed (${paused.motion})`);
  check(paused.anims.length === 0, `Pause: every animation paused${paused.anims.length ? ': ' + paused.anims.slice(0, 5).join(', ') : ''}`);
  await clickVisible(page, '[data-orb-pause]');
  await wait(300);
  check(await page.evaluate(() => document.documentElement.dataset.motion === 'on'), 'Play motion turns it back on');
  await page.close();
  ({ page, errors } = await open(ctx, niche, { paused: false, reduced: true }));
  const rm = await page.evaluate(() => ({ motion: document.documentElement.dataset.motion, lenis: document.documentElement.classList.contains('lenis'), story: document.documentElement.dataset.story ?? null }));
  check(rm.motion === 'reduced' && !rm.lenis, `reduced motion: html[data-motion=reduced], no Lenis (${JSON.stringify(rm)})`);
  if (niche === 'dental') check(rm.story === 'static', 'reduced motion: the 07:45 story stands written');
  if (niche === 'clinics') check(await page.evaluate(() => [...document.querySelectorAll('[data-pin]')].every((el) => el.dataset.pin !== 'on')), 'reduced motion: the story and dial do not pin');
  check(errors.length === 0, errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
  await page.close();
  await ctx.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
await browser.close();
