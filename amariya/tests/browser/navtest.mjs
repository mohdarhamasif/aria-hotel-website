// Navigation checks, per niche at a phone (390×844) and a laptop (1440×900):
//  1. The agent's navigate_to_section lands each section readable: its heading on screen and not under any fixed chrome
//     (hit-tested at its first line); on hotels the page's own "where am I" (data-in) names the chapter.
//  2. The page's own chapter navigation, by pointer and by keyboard: hotels' Night Dial (a role=slider: End, Home,
//     PageUp, arrows, Enter opens the Night index; a tap opens it too; a drag turns the night), the Night index rows and
//     the time chip on phones; clinics' line index (≥ 1100 px) and the Index sheet below it; dental's hour ruler, the
//     phone time strip, the Now link and the edge tab. Every jump lands its heading readable and marks the index entry.
//  3. The industry switcher: reachable (opening its menu, sheet or dialog where it lives there), the menu by keyboard
//     (Enter opens, Tab reaches the links, Escape closes and returns focus), three industries with this one current,
//     and (on the laptop) following a link opens the next niche with that one current.
//  4. Keyboard order: no positive tabindex; Tab from the top visits the chapters in reading order, never backwards;
//     every stop shows a focus ring.
// Then the front door, /aesthetics and a missing page: doors to the three niches, the redirect, the 404 page, and no
// console errors or horizontal overflow at 1920, 1440, 1024 and 390 px.
// Usage: node navtest.mjs [base] [niches...]
// Runs on the machine's GPU by default: software GL (GL=swiftshader) draws the hotel house about once a second, and a
// scroll animated over the scheduler's clamped frame steps then takes many times its real duration.
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const NICHES = process.argv.slice(3).length ? process.argv.slice(3) : ['hotels', 'clinics', 'dental'];
const SOFT = process.env.GL === 'swiftshader';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: SOFT ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [], protocolTimeout: 600000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { if (!ok) failures++; console.log(`  ${ok ? 'pass' : 'FAIL'} ${label}`); return ok; };
const SECTIONS = ['profile', 'features', 'pricing', 'demo', 'welcome'];
const NEXT = { hotels: 'clinics', clinics: 'dental', dental: 'hotels' };

const until = async (page, fn, arg, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await wait(120);
  }
  return false;
};

/** Where the chapter's heading is: its first line on screen and the element there is the heading itself */
const readable = (id) => {
  const el = document.getElementById(id);
  if (!el) return { err: `no #${id}` };
  const h = [...el.querySelectorAll('h1, h2, h3')].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
  if (!h) return { err: `no visible heading in #${id}` };
  const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  let first = null;
  for (let n = walker.nextNode(); n && !first; n = walker.nextNode()) {
    if (!n.textContent.trim() || n.parentElement.closest('.sr-only')) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    first = [...range.getClientRects()].find((r) => r.width > 2 && r.height > 2) ?? null;
  }
  if (!first) return { err: 'heading has no visible text' };
  const x = Math.min(first.left + 12, first.right - 2), y = first.top + first.height / 2;
  const at = document.elementFromPoint(x, y);
  const covered = !at || !(h === at || h.contains(at));
  return {
    id, heading: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 44), top: Math.round(first.top),
    onScreen: first.top >= 0 && first.bottom <= innerHeight, covered,
    by: covered && at ? `${at.tagName.toLowerCase()}.${String(at.className?.baseVal ?? at.className).split(' ')[0]}` : '',
    ok: first.top >= 0 && first.bottom <= innerHeight && !covered,
  };
};
/** Waits for #id to land readable (a far hotels jump goes through lights down first) */
async function landed(page, id, ms = 6000) {
  await until(page, (id) => {
    const el = document.getElementById(id);
    const h = el && [...el.querySelectorAll('h1, h2, h3')].find((x) => x.getClientRects().length);
    if (!h) return false;
    const r = h.getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight * 0.75;
  }, id, ms);
  await wait(900);
  return page.evaluate(readable, id);
}
const describe = (r) => (r.err ? r.err : `"${r.heading}" at ${r.top}px${r.covered ? ` (covered by ${r.by})` : ''}${r.onScreen ? '' : ' (off screen)'}`);
const shown = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].some((el) => {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && !el.closest('dialog:not([open]), details:not([open]) > :not(summary)');
}), sel);
/** A real click on the first match a visitor can see */
async function clickShown(page, sel) {
  for (const h of await page.$$(sel)) {
    const ok = await h.evaluate((el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && !el.closest('dialog:not([open]), details:not([open]) > :not(summary)'); });
    if (ok) { await h.click(); return true; }
  }
  return false;
}
const activeIs = (page, sel) => page.evaluate((sel) => !!document.activeElement?.matches(sel), sel);
const scrollTop = (page) => page.evaluate(() => { window.lenis?.scrollTo?.(0, { immediate: true }); window.scrollTo(0, 0); });

/** The industries nav a visitor can see: three links, this niche current */
async function switcherShown(page, niche) {
  return page.evaluate((niche) => {
    const navs = [...document.querySelectorAll('nav[aria-label="Industries"]')].filter((n) => {
      const a = n.querySelector('a'); if (!a) return false;
      const r = a.getBoundingClientRect(), cs = getComputedStyle(a);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && !a.closest('dialog:not([open]), details:not([open])');
    });
    const n = navs[0];
    if (!n) return null;
    const links = [...n.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.getAttribute('aria-current')]);
    return { count: links.length, current: links.filter(([, c]) => c === 'page').map(([h]) => h), hrefs: links.map(([h]) => h).sort().join(' ') , niche };
  }, niche);
}
const switcherOk = (s, niche) => !!s && s.count === 3 && s.hrefs === '/clinics /dental /hotels' && s.current.length === 1 && s.current[0] === `/${niche}`;

/** Each niche's own chapter navigation at this width */
const CHAPTER_NAV = {
  async hotels(page, wide) {
    if (wide) {
      // The Night Dial in the cornice: a slider that turns the night by the keyboard
      await page.focus('[data-ring-slider]');
      await wait(800); // it fades in
      check(await shown(page, '[data-ring-slider]'), 'the Night Dial shows when it has focus');
      await page.keyboard.press('End');
      let r = await landed(page, 'register');
      check(r.ok, `End on the Night Dial → #register: ${describe(r)}`);
      const now = () => page.evaluate(() => +document.querySelector('[data-ring-slider]').getAttribute('aria-valuenow'));
      check(await until(page, () => +document.querySelector('[data-ring-slider]').getAttribute('aria-valuenow') >= 824, null, 3000), `  and the dial reads 07:45 (aria-valuenow ${await now()})`);
      await page.keyboard.press('Home');
      r = await landed(page, 'house');
      check(r.ok, `Home → #house: ${describe(r)}`);
      check(await until(page, () => +document.querySelector('[data-ring-slider]').getAttribute('aria-valuenow') <= 1, null, 3000), `  and the dial reads 18:00 (aria-valuenow ${await now()})`);
      await page.keyboard.press('PageUp');
      r = await landed(page, 'restaurant');
      check(r.ok, `PageUp → the next hour, #restaurant: ${describe(r)}`);
      check(await until(page, () => Math.abs(+document.querySelector('[data-ring-slider]').getAttribute('aria-valuenow') - 112) <= 1, null, 3000), `  and the dial reads 19:52 (aria-valuenow ${await now()})`);
      await page.keyboard.press('ArrowRight');
      check(await until(page, () => Math.abs(+document.querySelector('[data-ring-slider]').getAttribute('aria-valuenow') - 120) <= 1, null, 3000), `ArrowRight turns a quarter hour on (aria-valuenow ${await now()})`);
      const text = await page.$eval('[data-ring-slider]', (el) => el.getAttribute('aria-valuetext'));
      check(!!text && /20:00|8:00/.test(text), `  and says where the night is ("${text}")`);
      check(await activeIs(page, '[data-ring-slider]'), '  focus stays on the dial');
      // Enter opens the Night index on the hour in view; Escape closes it and returns focus to the dial
      await page.keyboard.press('Enter');
      await wait(500);
      check(await page.evaluate(() => !!document.querySelector('dialog[data-index]')?.open), 'Enter opens the Night index');
      check(await page.evaluate(() => !!document.activeElement?.matches('dialog[data-index] [data-index-link]') && document.activeElement.hasAttribute('aria-current')), '  with focus on the hour in view');
      await page.keyboard.press('Escape');
      await wait(400);
      check(await page.evaluate(() => !document.querySelector('dialog[data-index]')?.open) && await activeIs(page, '[data-ring-slider]'), '  Escape closes it and focus returns to the dial');
      // A row by keyboard
      await page.keyboard.press('Enter');
      await wait(500);
      await page.focus('dialog[data-index] [data-index-link="keys"]');
      await page.keyboard.press('Enter');
      r = await landed(page, 'keys');
      check(r.ok && await page.evaluate(() => !document.querySelector('dialog[data-index]')?.open), `a Night index row by Enter → #keys, the index closed: ${describe(r)}`);
      check(await until(page, () => document.querySelector('[data-index-link="keys"]')?.getAttribute('aria-current') === 'location', null, 3000), '  and the index marks #keys');
      // A tap on the dial opens the index; a drag turns the night
      const box = await (await page.$('[data-ring-slider]')).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await wait(500);
      check(await page.evaluate(() => !!document.querySelector('dialog[data-index]')?.open), 'a tap on the dial opens the Night index');
      await page.keyboard.press('Escape');
      await wait(300);
      await page.evaluate(() => window.amariyaNight?.setMinutes(112, { immediate: true }));
      await wait(800);
      const m0 = await page.evaluate(() => window.amariyaNight?.minutes ?? -1);
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await wait(2500);
      const m1 = await page.evaluate(() => window.amariyaNight?.minutes ?? -1);
      check(m1 > m0 + 60, `dragging the dial left turns the night on (${Math.round(m0)} → ${Math.round(m1)} minutes)`);
      // The hour links behind the dial, for keyboards: hidden until focused, then a list that goes where it says
      await page.focus('.dial-hours a[href="#back-office"]');
      check(await shown(page, '.dial-hours a[href="#back-office"]'), 'the dial\'s hour links appear when focused');
      await page.keyboard.press('Enter');
      r = await landed(page, 'back-office');
      check(r.ok, `  and Enter on one → #back-office: ${describe(r)}`);
      // The night's clock lands on its rooms (test plan: 05:48 since 18:00 → Room 214 at 23:48)
      await page.evaluate(() => window.amariyaNight.setMinutes(348));
      r = await landed(page, 'room-214');
      check(r.ok, `amariyaNight.setMinutes(348) → #room-214: ${describe(r)}`);
    } else {
      // Phones: the time chip opens the Night index; a row takes the visitor there and closes it
      check(await clickShown(page, '.dial-chip[data-index-open]'), 'the time chip is there');
      await wait(500);
      check(await page.evaluate(() => !!document.querySelector('dialog[data-index]')?.open), '  and opens the Night index');
      const s = await switcherShown(page, 'hotels');
      check(switcherOk(s, 'hotels'), `  which holds the industries, this one current (${JSON.stringify(s)})`);
      check(await clickShown(page, 'dialog[data-index] [data-index-link="night-desk"]'), '  a row is there to tap');
      const r = await landed(page, 'night-desk');
      check(r.ok && await page.evaluate(() => !document.querySelector('dialog[data-index]')?.open), `  → #night-desk, the index closed: ${describe(r)}`);
      check(await until(page, () => document.documentElement.dataset.in === 'night-desk', null, 3000), '  and the band names it');
    }
  },
  async clinics(page, wide) {
    if (wide) {
      check(await shown(page, '[data-index] a[data-index-link]'), 'the line index is on the right edge');
      for (const id of ['profile', 'pricing', 'faq', 'story']) {
        check(await clickShown(page, `[data-index] a[data-index-link="${id}"]`), `  its point for #${id} is there`);
        const r = await landed(page, id);
        check(r.ok, `  a click → #${id}: ${describe(r)}`);
        check(await until(page, (id) => document.querySelector(`[data-index] a[data-index-link="${id}"]`)?.hasAttribute('aria-current'), id, 3000), `  and the index marks #${id}`);
      }
      // By keyboard (focus from the keyboard is what shows a point's name): Tab from the point before
      await page.focus('[data-index] a[data-index-link="features"]');
      await page.keyboard.press('Tab');
      await wait(300);
      check(await activeIs(page, '[data-index] a[data-index-link="line"]'), 'Tab moves along the line index');
      check(await page.evaluate(() => { const l = document.querySelector('[data-index] a[data-index-link="line"] .index-label'); return !!l && +getComputedStyle(l).opacity > 0.5; }), '  and the focused point shows its name');
      await page.keyboard.press('Enter');
      const r = await landed(page, 'line');
      check(r.ok, `  Enter → #line: ${describe(r)}`);
    } else {
      check(await clickShown(page, '[data-index-open]'), 'Index is in the bar');
      await wait(400);
      check(await page.evaluate(() => !!document.querySelector('dialog[data-index-sheet]')?.open), '  and opens the Index sheet');
      const s = await switcherShown(page, 'clinics');
      check(switcherOk(s, 'clinics'), `  which holds the industries, this one current (${JSON.stringify(s)})`);
      await page.keyboard.press('Escape');
      await wait(300);
      check(await page.evaluate(() => !document.querySelector('dialog[data-index-sheet]')?.open) && await activeIs(page, '[data-index-open]'), '  Escape closes it and focus returns to Index');
      await clickShown(page, '[data-index-open]');
      await wait(400);
      check(await clickShown(page, 'dialog[data-index-sheet] a[data-index-link="pricing"]'), '  a point is there to tap');
      const r = await landed(page, 'pricing');
      check(r.ok && await page.evaluate(() => !document.querySelector('dialog[data-index-sheet]')?.open), `  → #pricing, the sheet closed: ${describe(r)}`);
    }
  },
  async dental(page, wide) {
    check(await shown(page, '[data-ruler-link]'), wide ? 'the hour ruler is on the left' : 'the time strip is under the bar');
    for (const id of ['pricing', 'profile', 'faq']) {
      check(await clickShown(page, `[data-ruler-link="${id}"]`), `  its ${id} hour is there`);
      const r = await landed(page, id);
      check(r.ok, `  a click → #${id}: ${describe(r)}`);
      check(await until(page, (id) => document.querySelector(`[data-ruler-link="${id}"]`)?.getAttribute('aria-current') === 'location', id, 3000), `  and the ruler marks #${id}`);
    }
    await page.focus('[data-ruler-link="apply"]');
    await page.keyboard.press('Enter');
    let r = await landed(page, 'apply');
    check(r.ok, `Enter on the 18:00 hour → #apply: ${describe(r)}`);
    // The Now link goes to the NOW line on the sheet
    check(await clickShown(page, '[data-now-link]'), 'the Now link is there');
    const nowSeen = await until(page, () => { const l = document.querySelector('[data-now-line]'); const b = l?.getBoundingClientRect(); return !!b && b.height >= 0 && b.top > 0 && b.top < innerHeight; }, null, 4000);
    check(nowSeen, '  and brings the NOW line on screen');
    // The edge tab, once the first screen is behind
    await page.evaluate(() => { const y = document.getElementById('profile').getBoundingClientRect().top + scrollY; window.lenis?.scrollTo?.(y, { immediate: true }); window.scrollTo(0, y); });
    if (wide) {
      const tab = await until(page, () => { const t = document.querySelector('[data-edge-tab]'); const b = t?.getBoundingClientRect(); return !!b && b.right <= innerWidth + 1 && b.left < innerWidth - 8 && getComputedStyle(t).visibility !== 'hidden'; }, null, 3000);
      check(tab, 'the edge tab slides out past the first screen');
      await wait(700);
      check(await clickShown(page, '[data-edge-tab]'), '  and can be clicked');
      r = await landed(page, 'apply');
      check(r.ok, `  → #apply: ${describe(r)}`);
    } else {
      // The menu holds the industries, Sound and Pause
      check(await clickShown(page, '[data-ruler-menu] > summary'), 'Menu is in the bar');
      await wait(300);
      const s = await switcherShown(page, 'dental');
      check(switcherOk(s, 'dental'), `  and opens the industries, this one current (${JSON.stringify(s)})`);
      check(await shown(page, '[data-ruler-menu] [data-orb-pause]'), '  with Pause motion');
      await clickShown(page, '[data-ruler-menu] > summary');
      await wait(200);
      check(await page.evaluate(() => !document.querySelector('[data-ruler-menu]').open), '  and closes again');
    }
  },
};

/** The switcher where a visitor first meets it at this width (the phones' copies are checked with their sheets) */
async function switcher(page, niche, wide) {
  await scrollTop(page);
  await wait(500);
  const menu = await page.evaluate(() => {
    const d = [...document.querySelectorAll('nav[aria-label="Industries"] details.switcher-menu')].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
    if (!d) return false;
    d.querySelector('summary').setAttribute('data-test-summary', '');
    return true;
  });
  if (menu) {
    await page.focus('[data-test-summary]');
    await page.keyboard.press('Enter');
    await wait(300);
    check(await page.evaluate(() => document.querySelector('[data-test-summary]').parentElement.open), 'the industries menu opens with Enter');
    let s = await switcherShown(page, niche);
    check(switcherOk(s, niche), `  three industries, this one current (${JSON.stringify(s)})`);
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => !!document.activeElement?.closest('details.switcher-menu') && document.activeElement.tagName === 'A'), '  Tab reaches its links');
    await page.keyboard.press('Escape');
    await wait(200);
    check(await page.evaluate(() => !document.querySelector('[data-test-summary]').parentElement.open) && await activeIs(page, '[data-test-summary]'), '  Escape closes it and focus returns to the menu button');
  } else if (wide) {
    const s = await switcherShown(page, niche);
    check(switcherOk(s, niche), `the industries are in the page's head, this one current (${JSON.stringify(s)})`);
  }
}

/** Following the switcher's link to the next niche opens it with that one current (it leaves the page: run it last) */
async function followSwitcher(page, niche) {
  await scrollTop(page);
  await wait(500);
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('nav[aria-label="Industries"] details.switcher-menu')].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
    if (d) d.open = true;
  });
  await wait(300);
  const next = NEXT[niche];
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  const clicked = await clickShown(page, `nav[aria-label="Industries"] a[href="/${next}"]`);
  await nav;
  await wait(400);
  const there = await page.evaluate(() => ({ path: location.pathname, current: document.querySelector('nav[aria-label="Industries"] a[aria-current="page"]')?.getAttribute('href') }));
  check(clicked && there.path.replace(/\/$/, '') === `/${next}` && there.current === `/${next}`, `the switcher goes to /${next}, which marks itself current (${JSON.stringify(there)})`);
}

/** Tab from the top: chapters in reading order, a focus ring on every stop, no positive tabindex */
async function focusOrder(page) {
  await scrollTop(page);
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  const positive = await page.evaluate(() => [...document.querySelectorAll('[tabindex]')].filter((el) => el.tabIndex > 0).map((el) => el.outerHTML.slice(0, 60)));
  check(positive.length === 0, `no positive tabindex${positive.length ? ': ' + positive.join(' | ') : ''}`);
  // Every control's look at rest, to tell its focus indicator from its own styling: an outline, a shadow, or (the
  // ruled forms) the field's underline thickening in the focus colour all count, as long as focus changes something
  await page.evaluate(() => {
    const look = (x) => { const cs = getComputedStyle(x); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderBottomWidth, cs.borderBottomColor, cs.backgroundColor].join('|'); };
    window.__look = look;
    window.__rest = new Map();
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], label')) window.__rest.set(el, look(el));
  });
  const order = [];
  const ringless = [];
  let back = null;
  let last = -1, lastLabel = '';
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press('Tab');
    await wait(60);
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const chapters = [...document.querySelectorAll('[data-chapter]')];
      const ch = el.closest('[data-chapter]');
      const at = ch ? chapters.indexOf(ch) : -1;
      // The focus indicator: focus changes the element's outline, shadow, underline or fill (or, for a chip's hidden
      // radio or checkbox, its label's), and an outline it shows is at least 1.5 px
      const changed = (x) => !!x && window.__rest.has(x) && window.__rest.get(x) !== window.__look(x);
      const cs = getComputedStyle(el);
      const thinOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) < 1.5;
      const ring = (changed(el) && !thinOutline) || (el.matches('input[type="radio"], input[type="checkbox"]') && changed(el.closest('label')));
      return { at, id: ch?.id ?? '', footer: !!el.closest('footer, [data-chapter="footer"]'), label: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].slice(0, 2).join('.')} "${(el.getAttribute('aria-label') || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`, ring };
    });
    if (!f) continue;
    order.push(f.id || '-');
    if (!f.ring) ringless.push(f.label);
    if (f.at >= 0) {
      if (f.at < last && !back) back = `${lastLabel} → ${f.label} (#${f.id})`;
      last = Math.max(last, f.at);
      lastLabel = `${f.label} (#${f.id})`;
    }
    if (f.footer && i > 20) break;
  }
  const visited = [...new Set(order.filter((x) => x !== '-'))];
  check(visited.length >= 5, `Tab reaches the chapters (${visited.join(' → ')})`);
  check(!back, `focus moves through the chapters in reading order${back ? ': went back at ' + back : ''}`);
  check(ringless.length === 0, `every focus stop shows a ring${ringless.length ? ': ' + [...new Set(ringless)].slice(0, 6).join(', ') : ''}`);
}

for (const niche of NICHES) {
  for (const [W, H] of [[390, 844], [1440, 900]]) {
    const wide = W >= 1100;
    console.log(`${niche} ${W}×${H}`);
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const mobile = W < 700;
    await page.setViewport({ width: W, height: H, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('amariya_visited', '1'); localStorage.setItem('amariya_intro', '1'); localStorage.setItem('amariya_motion', 'on'); } catch {} });
    await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await wait(1500);

    // 1. The agent's navigation
    for (const section of SECTIONS) {
      await page.evaluate(async (s) => { await window.amariyaTools.navigate_to_section({ section: s }); }, section);
      await wait(2600);
      const r = await page.evaluate((section) => {
        const id = location.hash.slice(1);
        const el = (id && document.getElementById(id)) || document.querySelector(`[data-section="${section}"]`);
        return el ? el.id : '';
      }, section);
      const got = r ? await page.evaluate(readable, r) : { err: `no target for ${section}` };
      check(got.ok, `agent: ${section} → #${r}: ${describe(got)}`);
      if (niche === 'hotels' && section !== 'welcome') {
        const inView = await page.evaluate(() => document.documentElement.dataset.in ?? null);
        check(inView === r, `  the band names it (data-in ${inView})`);
      }
    }

    // 2. The page's own chapter navigation
    await scrollTop(page);
    await wait(2700); // past the polite window of the last agent move
    await CHAPTER_NAV[niche](page, wide);

    // 3. The switcher
    await switcher(page, niche, wide);

    // 4. Keyboard order (a fresh load: no state from the checks above)
    await page.goto(`${BASE}/${niche}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await wait(1200);
    await focusOrder(page);

    // The switcher's link last: it leaves the page
    if (wide) await followSwitcher(page, niche);
    check(errors.length === 0, errors.length ? `console errors: ${errors.slice(0, 4).join(' | ')}` : 'no console errors');
    await page.close();
  }
}

/* ---------- The front door, the redirect and the missing page ---------- */
console.log('front door, /aesthetics, 404');
for (const [W, H] of [[1920, 1080], [1440, 900], [1024, 768], [390, 844]]) {
  for (const path of ['/', '/aesthetics', '/no-such-room']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type()) && !/404 \(Not Found\)/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const mobile = W < 700;
    await page.setViewport({ width: W, height: H, isMobile: mobile, hasTouch: mobile });
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 120000 });
    if (path === '/aesthetics') await page.waitForFunction(() => location.pathname.startsWith('/clinics'), { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await wait(path === '/aesthetics' ? 2500 : 500);
    const r = await page.evaluate(() => ({
      path: location.pathname, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      doors: [...document.querySelectorAll('a.door')].map((a) => a.getAttribute('href')).join(' '),
      h1: document.querySelectorAll('h1').length, home: !!document.querySelector('a[href="/"]'),
    }));
    if (path === '/') check(r.doors === '/hotels /clinics /dental' && r.h1 === 1, `${W}: / has one h1 and the three doors (${r.doors})`);
    if (path === '/aesthetics') check(r.path.replace(/\/$/, '') === '/clinics', `${W}: /aesthetics lands on /clinics (${r.path})`);
    if (path === '/no-such-room') check(res?.status() === 404 && r.h1 === 1 && r.home, `${W}: a missing page answers 404 with its own page and a way home (${res?.status()})`);
    check(r.overflow === 0, `${W} ${path}: no horizontal overflow (${r.overflow}px)`);
    check(errors.length === 0, errors.length ? `${W} ${path}: console: ${errors.slice(0, 3).join(' | ')}` : `${W} ${path}: no console errors`);
    await page.close();
  }
}
console.log(failures ? `${failures} FAILED` : 'all checks passed');
await browser.close();
