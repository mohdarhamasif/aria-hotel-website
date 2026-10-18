// The /hotels page script: voice config and the presenter, the night's chapters (calls revealed at 30 %, stamps
// pressed at 70 %), the ring and the Night index, the property card, handover, key rack, registration and
// questions, the porter's light intro, the phone's house band and the desktop annotations. Then the orb.
import { content } from '../../data/content/hotels';
import type { NicheCall, NicheLine } from '../../data/content/types';
import { voice } from '../../scripts/voice/bridge';
import { init as initTools } from '../../scripts/voice/tools';
import { init as initLevel } from '../../scripts/voice/level';
import { boot } from '../../scripts/orb/boot';
import { scheduler } from '../../scripts/motion/scheduler';
import { scroll, offsetTop, trackSections } from '../../scripts/motion/scroll';
import { motion } from '../../scripts/motion/prefs';
import { clock, fmtHM } from '../../scripts/motion/clock';
import { playScript, type Playback } from '../../scripts/scripted';
import { roiSummary } from '../../scripts/apply/roi';
import { sound } from '../../scripts/sound';
import { track } from '../../scripts/analytics';
import {
  arrived, checkField, checkStep, currentChapter, navigate, presenter, printHandover, readProfile, renderHouse, roomOf, sendCard, showStep,
} from './presenter';
import { chapterAt, chapters, endIntro, initRing, nightHHMM, ringIntro, sceneClock } from './ring';

const html = document.documentElement;
html.dataset.night = '';
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const WIDE = matchMedia('(min-width: 734px)');
const PHONE = matchMedia('(max-width: 733.98px)');
const ORDER = $$('[data-chapter]');
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const isRestaurant = () => html.dataset.house === 'restaurant';
/** A [data-variant] block shows unless it belongs to the other kind of house */
const shows = (el: Element) => {
  const v = el.closest<HTMLElement>('[data-variant]')?.dataset.variant;
  return !v || (v === 'restaurant') === isRestaurant();
};

/* ---------- Voice ---------- */

voice.configure(content.voice);
voice.registerPresenter(presenter);
void import('../../scripts/voice/session').then((m) => m.init()).catch((err) => console.error(err));
initTools();
initLevel();

/* ---------- The ring ---------- */

const chapterCopy = new Map(content.chapters.map((c) => [c.id, c]));
initRing({
  describe(m, c) {
    const copy = chapterCopy.get(c.id);
    const room = roomOf(c.id);
    const v = isRestaurant() && copy?.restaurant ? copy.restaurant : copy;
    const what = copy?.feature ? copy.feature.replace('_', ' ') : (v?.summary ?? '').toLowerCase();
    return { caption: `${nightHHMM(m)} · ${room}`, room, valueText: content.ring.valueText(fmtHM(1080 + m), room, what, c.n, chapters.length) };
  },
  jump: (id, keepFocus) => { navigate(id, false, keepFocus); },
  openIndex,
  turned(m) {
    html.dataset.used = '';
    const c = chapterAt(m);
    track('ring_turned', { minutes: Math.round(m) });
    voice.contextUpdate(`The visitor turned the night to ${nightHHMM(m)}, ${roomOf(c.id)}.`, 'ring');
  },
});

/* ---------- Which chapter is in view ---------- */

let current: HTMLElement | null = currentChapter();
const bandHour = $('[data-band-hour]');
const roomTag = $('[data-room-tag]');
let annoLabel: HTMLElement | null = null;
let annoKind = '';

function onChapter(id: string) {
  const el = document.getElementById(id);
  if (!el || el === current && html.dataset.in === id) return;
  current = el;
  html.dataset.in = id;
  arrived(id);
  annoLabel = null;
  describeChapter();
  for (const a of $$('[data-index-link]')) {
    if (a.dataset.indexLink === id) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  }
  track('hour_viewed', { chapter: id });
}
/** The phone's band numeral and room tag for the chapter in view, in this house's words */
function describeChapter() {
  const copy = current ? chapterCopy.get(current.id) : undefined;
  if (bandHour) {
    // In the visitor's own 12- or 24-hour style, as the log's numerals on wider screens
    const hm = copy?.hour && /^\d\d:\d\d$/.test(copy.hour) ? copy.hour.split(':').map(Number) : null;
    if (hm && clock.now().twelveHour) {
      const ap = document.createElement('span');
      ap.className = 'band-ap';
      ap.textContent = hm[0] < 12 ? 'am' : 'pm';
      bandHour.replaceChildren(`${hm[0] % 12 || 12}:${String(hm[1]).padStart(2, '0')}`, ap);
    } else bandHour.textContent = copy?.hour === 'now' ? content.ring.now : copy?.hour ?? '';
  }
  if (roomTag) roomTag.textContent = copy ? (isRestaurant() && copy.restaurant ? copy.restaurant.annotation : copy.annotation) : '';
}
trackSections(ORDER.map((el) => el.id), onChapter);
if (current) onChapter(current.id);

// The ring docks in the cornice once the prologue is 60 % out of view
const prologue = $('#welcome');
if (prologue) {
  new IntersectionObserver(([e]) => {
    html.toggleAttribute('data-docked', e.intersectionRatio < 0.4 && e.boundingClientRect.top < 0);
  }, { threshold: [0, 0.2, 0.4, 0.6, 1] }).observe(prologue);
}
// The key-fob tag retires while the key rack is on screen
const keysSection = $('#keys');
if (keysSection) new IntersectionObserver(([e]) => html.toggleAttribute('data-keys-in', e.isIntersecting)).observe(keysSection);

// 'What she does here' opens on hover or keyboard focus too (and on the agent's spotlight, in the presenter)
for (const does of $$<HTMLDetailsElement>('[data-does]')) {
  const summary = $('summary', does);
  summary?.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') does.open = true; });
  summary?.addEventListener('focus', () => { if (summary.matches(':focus-visible')) does.open = true; });
}

// Log entries settle as they arrive
const settle = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.setAttribute('data-settled', ''); settle.unobserve(e.target); }
}, { threshold: 0.12 });
for (const log of $$('.chapter--entry .log')) settle.observe(log);

/* ---------- Scripted calls: revealed at 30 % of the chapter, completed in real time ---------- */

interface Call { fig: HTMLElement; list: HTMLOListElement; script: NicheCall; started: boolean; done: boolean; playback: Playback | null }
const scripts = new Map(content.calls.map((c) => [c.id, c]));
const callsBySection = new Map<HTMLElement, Call[]>();
for (const fig of $$('.call[data-call]')) {
  const script = scripts.get(fig.dataset.call ?? '');
  const list = $<HTMLOListElement>('[data-call-lines]', fig);
  const section = fig.closest<HTMLElement>('[data-chapter]');
  if (!script || !list || !section) continue;
  list.style.setProperty('--who-a', JSON.stringify(content.transcript.her));
  list.style.setProperty('--who-g', JSON.stringify('Guest'));
  const calls = callsBySection.get(section) ?? [];
  calls.push({ fig, list, script, started: false, done: false, playback: null });
  callsBySection.set(section, calls);
}

/** Lines the player writes get their English gloss; the room phone stops ringing once she answers */
function decorate(call: Call) {
  return (li: HTMLLIElement, line: NicheLine | { who: 'g' | 'a' }) => {
    if (line.who === 'a') call.fig.dataset.answered = '';
    const gloss = (line as NicheLine).gloss;
    if (gloss && !li.querySelector('.gloss')) {
      const g = document.createElement('span');
      g.className = 'gloss';
      g.lang = 'en';
      g.dir = 'ltr';
      g.textContent = gloss;
      li.append(g);
    }
  };
}

function finish(call: Call) {
  call.done = true;
  call.fig.dataset.done = '';
  call.fig.dataset.answered = '';
  call.list.style.minHeight = '';
  delete call.fig.dataset.playing;
  const next = $<HTMLButtonElement>('[data-next-line]', call.fig);
  if (next) next.hidden = true;
}

function start(call: Call) {
  if (call.started || !motion.allowed) return;
  call.started = true;
  const list = call.list;
  // Keep the transcript's height while the reserved lines give way to the live ones. Next line rides at the foot of
  // that room (hotels.css) and goes as the last line begins, before anything is written where it sits: shown in the
  // flow, it pushed every chapter below down 50 px, and back up at the end, under a visitor who had moved on.
  list.style.minHeight = `${list.offsetHeight}px`;
  for (const li of $$('[data-reserve]', list)) li.remove();
  call.fig.dataset.playing = '';
  const next = $<HTMLButtonElement>('[data-next-line]', call.fig);
  const onLine = decorate(call), last = call.script.lines.length - 1;
  const pb = playScript(list, call.script, {
    onLine: (li, line, i) => { onLine(li, line); if (next && i >= last - 1) next.hidden = true; },
    onDone: () => finish(call),
  });
  call.playback = pb;
  if (next) {
    next.hidden = last < 2;
    next.onclick = () => { if (!pb.next()) next.hidden = true; };
  }
}

/** Pause or reduced motion during a call: show the rest of it at once */
function completeNow(call: Call) {
  if (!call.started || call.done) return;
  call.playback?.stop();
  for (const li of $$('li:not([data-static])', call.list)) li.remove();
  playScript(call.list, call.script, { static: true, onLine: decorate(call), onDone: () => finish(call) });
}
motion.on(() => { if (!motion.allowed) for (const calls of callsBySection.values()) calls.forEach(completeNow); });

/* ---------- The frame: beats of the chapter in view, the phone's house band, the annotation ---------- */

/** 0 when the chapter's top crosses the reading line (55 % down the screen), 1 when its bottom does */
function progress(el: HTMLElement) {
  const i = ORDER.indexOf(el);
  const top = offsetTop(el);
  const bottom = i >= 0 && i < ORDER.length - 1 ? offsetTop(ORDER[i + 1]) : top + innerHeight;
  return clamp01((scroll.y + innerHeight * 0.55 - top) / Math.max(1, bottom - top));
}

function beats(el: HTMLElement, p: number) {
  const calls = (callsBySection.get(el) ?? []).filter((c) => shows(c.fig));
  if (p >= 0.3) {
    const next = calls.find((c) => !c.started);
    const prev = next ? calls[calls.indexOf(next) - 1] : undefined;
    if (next && (!prev || (prev.done && p >= 0.45))) start(next);
  }
  if (p >= 0.5 && !el.hasAttribute('data-lit')) el.setAttribute('data-lit', '');
  if (p >= 0.7 && !el.hasAttribute('data-stamped')) el.setAttribute('data-stamped', '');
}

// The phone's house band: the top of the fixed canvas, 56svh over the prologue, 44svh as a chapter opens,
// 30svh once its text is under way. A clip on the canvas, never a layout change.
const bandEls = [$('[data-stage-canvas]'), bandHour, roomTag].filter((x): x is HTMLElement => !!x);
let band = 56;
let bandShown = -1;
function bandStep(el: HTMLElement, p: number, dt: number) {
  const target = el.id === 'welcome' ? 56 - 12 * smooth(0.55, 1, p) : 44 - 14 * smooth(0.05, 0.35, p);
  band = motion.allowed ? band + (target - band) * (1 - Math.exp(-dt / 0.2)) : target;
  if (Math.abs(band - bandShown) < 0.05) return;
  bandShown = band;
  for (const b of bandEls) b.style.setProperty('--bandf', band.toFixed(2));
}

// Desktop annotation: a leader from the entry's room label to the lantern in that room, drawn at 10–20 %
const annoPath = $<SVGPathElement>('[data-annotation-path]');
const annoRing = $<SVGCircleElement>('[data-annotation-ring]');
let logLeft = 0;
let annoShown = '';
const invalidate = () => { logLeft = 0; annoLabel = null; };
new ResizeObserver(invalidate).observe(document.body);
addEventListener('resize', invalidate, { passive: true });
// The house scene's director writes these on the elements that read them (the room tag among them); without the
// scene, this page writes them on :root itself
const cssPx = (name: string) => parseFloat(roomTag?.style.getPropertyValue(name) || html.style.getPropertyValue(name));

function annotate(el: HTMLElement, p: number) {
  if (!annoPath || !annoRing) return;
  let d = 'M0 0';
  let draw = 0;
  if (el.id !== 'welcome') {
    if (!annoLabel || annoKind !== (html.dataset.house ?? '')) {
      annoKind = html.dataset.house ?? '';
      annoLabel = $$('.annotation-label', el).find((x) => x.getClientRects().length) ?? null;
    }
    if (!logLeft) logLeft = $('.chapter .log')?.getBoundingClientRect().left ?? 0;
    const ox = cssPx('--ox'), oy = cssPx('--oy'), or = cssPx('--or');
    if (annoLabel && logLeft && ox > 0 && ox < logLeft - 48 && oy > 0 && oy < innerHeight) {
      const y = offsetTop(annoLabel) - scroll.y + 8;
      if (y > 72 && y < innerHeight - 72) {
        const x0 = logLeft - 18;
        const r = or + 10;
        const dx = x0 - ox, dy = y - oy, len = Math.hypot(dx, dy) || 1;
        const ex = ox + (dx / len) * r, ey = oy + (dy / len) * r;
        const elbow = Math.max(ex + 24, x0 - 96);
        d = `M${x0.toFixed(1)} ${y.toFixed(1)}H${elbow.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
        draw = motion.allowed ? smooth(0.1, 0.2, p) : 1;
        annoRing.setAttribute('cx', ex.toFixed(1));
        annoRing.setAttribute('cy', ey.toFixed(1));
      }
    }
  }
  const key = `${d}|${draw.toFixed(2)}`;
  if (key === annoShown) return;
  annoShown = key;
  annoPath.setAttribute('d', d);
  annoPath.style.strokeDashoffset = String(1 - draw);
  annoRing.toggleAttribute('data-on', draw >= 0.98);
}

// Until the house scene runs (no WebGL 2, or still loading), the page writes the lantern's place itself
const orb = $('[data-orb]');
let orbBox: { left: number; size: number } | null = null;
new ResizeObserver(() => { orbBox = null; }).observe(document.body);
let orbShown = '';
const orbReaders = $$('.ring-glass, .coaster, .room-tag');
function orbVars() {
  if (sceneClock()) {
    if (!html.hasAttribute('data-director')) html.setAttribute('data-director', '');
    return;
  }
  if (!orb) return;
  if (!orbBox) { const r = orb.getBoundingClientRect(); orbBox = { left: r.left, size: r.width }; }
  const or = orbBox.size / 2, ox = orbBox.left + or, oy = offsetTop(orb) - scroll.y + or;
  const key = `${ox.toFixed(1)}|${oy.toFixed(1)}|${or.toFixed(1)}`;
  if (key === orbShown) return;
  orbShown = key;
  // On :root (the page contract) and on the elements that read them: hotels.css registers them as not inherited
  for (const el of [html, ...orbReaders]) {
    el.style.setProperty('--ox', `${ox.toFixed(1)}px`);
    el.style.setProperty('--oy', `${oy.toFixed(1)}px`);
    el.style.setProperty('--or', `${or.toFixed(1)}px`);
  }
}

// Phones, with the house scene running: the room tag sits under the lantern when that clears the hour numeral hanging
// from the band's edge, else over it, else beside it. Its width is measured only when its words change.
let tagWords = '', tagW = 0, tagShown = '';
function placeRoomTag() {
  if (!roomTag || !PHONE.matches || !sceneClock() || !roomTag.textContent || html.dataset.in === 'welcome') return;
  if (roomTag.textContent !== tagWords || !tagW) { tagWords = roomTag.textContent; tagW = roomTag.offsetWidth; }
  if (!tagW) return;
  // In the lobby her hour ring shows around the glass (1.36 r): the tag keeps clear of the ring, not just the glass
  const ox = cssPx('--ox'), oy = cssPx('--oy'), or = cssPx('--or') * (html.dataset.in === 'lobby' ? 1.36 : 1), band = cssPx('--band');
  if (!(or > 0) || !(band > 0)) return;
  const h = 26, gap = 10, floor = band - 72, ceiling = 64;
  let top = oy + or + gap, left = ox - tagW / 2;
  if (top + h > floor) top = oy - or - gap - h;
  if (top < ceiling) {
    top = oy - h / 2;
    left = ox + or + gap + tagW <= innerWidth - 16 ? ox + or + gap : ox - or - gap - tagW;
  }
  left = Math.max(16, Math.min(innerWidth - 16 - tagW, left));
  const key = `${left.toFixed(0)}|${top.toFixed(0)}`;
  if (key === tagShown) return;
  tagShown = key;
  // On a transform from the corner: moving left/top every frame was a layout shift (CLS) and a layout per frame
  roomTag.style.left = '0px';
  roomTag.style.top = '0px';
  roomTag.style.translate = `${left.toFixed(0)}px ${top.toFixed(0)}px`;
}

scheduler.add((_, dt) => {
  orbVars();
  placeRoomTag();
  if (!current) return;
  const p = progress(current);
  beats(current, p);
  if (WIDE.matches) annotate(current, p);
  // Once the house scene runs, its director writes the band (--bandf, on these same elements) for the camera and the
  // clip alike; if it ever stops, this page writes it again
  if (sceneClock()) {
    bandShown = -1;
  } else if (PHONE.matches) bandStep(current, p, dt);
}, 90);

/* ---------- The visitor's own time ---------- */

const nightDesk = $('#night-desk [data-hour-num]');
function tick() {
  const now = clock.now();
  for (const el of $$('[data-now]')) el.textContent = now.line;
  for (const el of $$('[data-closing]')) el.textContent = (now.night ? el.dataset.night : el.dataset.day) ?? el.textContent;
  // Between midnight and five, the visitor's own hour stands in at the night desk
  if (nightDesk) {
    const own = now.h < 5 ? now.minutes : null;
    setNumeral(nightDesk, own !== null ? `${String(now.h).padStart(2, '0')}:${now.mm}` : nightDesk.dataset.hourNum ?? '');
    nightDesk.toggleAttribute('data-own', own !== null);
  }
}
/** The hour numeral in the visitor's own 12- or 24-hour style (tabular figures, so nothing shifts) */
function setNumeral(el: HTMLElement, hhmm: string) {
  const num = $('.hour-num', el), ap = $('[data-hour-ap]', el);
  if (!num) return;
  const [h, m] = hhmm.split(':').map(Number);
  if (clock.now().twelveHour) {
    num.textContent = `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
    if (ap) ap.textContent = h < 12 ? 'am' : 'pm';
  } else {
    num.textContent = hhmm;
    if (ap) ap.textContent = '';
  }
}
for (const el of $$('[data-hour-num]')) setNumeral(el, el.dataset.hourNum ?? '');
tick();
clock.onMinute(tick);

// The lobby greets first in the visitor's own language
const greetings = $('[data-greetings]');
if (greetings) {
  const langs = (navigator.languages ?? [navigator.language]).map((l) => l.toLowerCase().split('-')[0]);
  const own = langs.map((l) => $(`[data-lang="${l}"]`, greetings)).find(Boolean);
  if (own) greetings.prepend(own);
}

/* ---------- The porter's light: 1.6 s, never blocking, skipped on a return visit ---------- */

const returning = (() => { try { return !!(localStorage.getItem('amariya_visited') || localStorage.getItem('aria_visited')); } catch { return false; } })();
if (!returning && motion.allowed && scroll.y < 8) {
  html.dataset.intro = '';
  ringIntro(1600);
  // Any input ends it at once
  const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  const end = () => {
    delete html.dataset.intro;
    endIntro();
    clearTimeout(timer);
    for (const type of INPUTS) removeEventListener(type, end, true);
  };
  const timer = setTimeout(end, 1600);
  for (const type of INPUTS) addEventListener(type, end, { capture: true, passive: true });
}
// The coaster caption shows until the glass or the ring is first used
const used = () => { html.dataset.used = ''; };
orb?.addEventListener('pointerdown', used, { once: true });
orb?.addEventListener('orb:tap', used, { once: true });
orb?.addEventListener('keydown', used, { once: true });

/* ---------- The property card and the scenario chips ---------- */

const profile = $<HTMLFormElement>('form[data-profile]');
let profileTimer = 0;
const reportProfile = () => {
  clearTimeout(profileTimer);
  profileTimer = window.setTimeout(() => {
    const p = readProfile();
    voice.contextUpdate(
      `The visitor edited their ${content.voice.businessNoun} profile by hand: ${JSON.stringify(p)}. ${roiSummary(p, content.roi, { revenueWording: content.voice.revenueWording, unitsPlural: content.voice.unitsPlural, licencePrice: content.offer.price })}`,
      'profile',
    );
  }, 1200);
};
const onProfile = (e: Event) => {
  renderHouse();
  describeChapter();
  if (e.isTrusted) reportProfile();
};
profile?.addEventListener('input', onProfile);
profile?.addEventListener('change', onProfile);

const scenario = $<HTMLDetailsElement>('[data-scenario]');
scenario?.addEventListener('change', (e) => {
  const radio = e.target as HTMLInputElement;
  const s = content.scenarios.find((x) => x.id === radio.value);
  if (!s || !profile) return;
  const type = profile.elements.namedItem('hotel_type') as RadioNodeList | null;
  for (const r of type ? [...type] as HTMLInputElement[] : []) r.checked = r.value === s.hotelType;
  renderHouse();
  describeChapter();
  scenario.open = false;
  scenario.querySelector('summary')?.focus();
  track('scenario_set', { scenario: s.id });
  voice.contextUpdate(`The visitor chose the scenario "${s.label}" for their house.`, 'scenario');
});
scenario?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && scenario.open) { scenario.open = false; scenario.querySelector('summary')?.focus(); }
});
document.addEventListener('click', (e) => { if (scenario?.open && !scenario.contains(e.target as Node)) scenario.open = false; });

// A returning visitor's house, remembered in this browser
const welcomeLines = $$('[data-welcome]');
const forget = $<HTMLButtonElement>('[data-forget]');
try {
  const saved = JSON.parse(localStorage.getItem('amariya_house') || 'null') as { name?: string; type?: string; rooms?: string } | null;
  if (profile && saved && (saved.name || saved.type || saved.rooms)) {
    const field = (n: string) => profile.elements.namedItem(n);
    const name = field('hotel_name'), rooms = field('rooms'), type = field('hotel_type') as RadioNodeList | null;
    if (name instanceof HTMLInputElement) name.value = saved.name ?? '';
    if (rooms instanceof HTMLInputElement) rooms.value = saved.rooms ?? '';
    for (const r of type ? [...type] as HTMLInputElement[] : []) r.checked = r.value === saved.type;
    if (saved.name) for (const w of welcomeLines) { w.textContent = content.propertyCard.welcomeBack(saved.name); w.hidden = false; }
    if (forget) forget.hidden = false;
  }
} catch { /* nothing remembered */ }
forget?.addEventListener('click', () => {
  try { localStorage.removeItem('amariya_house'); } catch { /* already gone */ }
  profile?.reset();
  for (const w of welcomeLines) { w.hidden = true; w.textContent = ''; }
  forget.hidden = true;
  renderHouse();
  (profile?.elements.namedItem('hotel_name') as HTMLInputElement | null)?.focus();
});
renderHouse();

/* ---------- The morning handover ---------- */

$('[data-ota]')?.addEventListener('input', (e) => {
  renderHouse();
  const rate = (e.target as HTMLInputElement).value.trim();
  if (e.isTrusted && rate) voice.contextUpdate(`The visitor entered their OTA commission rate: ${rate}%.`, 'ota');
});
$('[data-spend]')?.addEventListener('input', () => renderHouse());
$('[data-handover-print]')?.addEventListener('click', () => {
  track('handover_printed');
  voice.contextUpdate('The visitor printed the morning handover.', 'handover');
  printHandover();
});
$('[data-handover-send]')?.addEventListener('click', () => {
  track('handover_sent');
  voice.contextUpdate('The visitor is sending the morning handover to their general manager by email.', 'handover');
});

/* ---------- The key rack ---------- */

const keyList = $('[data-keys]');
const keyEls = $$('[data-key]', keyList ?? document);
const swungAt = new Map<string, number>();
let keyContextAt = 0;
function swing(li: HTMLElement) {
  const n = li.dataset.key ?? '';
  try { (window as unknown as { amariyaKeys?: { swing(n: number): void } }).amariyaKeys?.swing(Number(n)); } catch (err) { console.error(err); }
  if (motion.allowed) { li.classList.remove('swing'); void li.offsetWidth; li.classList.add('swing'); }
  const now = Date.now();
  if (now - (swungAt.get(n) ?? 0) > 4000) { swungAt.set(n, now); track('key_hovered', { key: n }); }
  if (now - keyContextAt > 10000) {
    keyContextAt = now;
    voice.contextUpdate(`The visitor is looking at founding key ${n} (${li.dataset.state}).`, 'key');
  }
}
for (const li of keyEls) {
  li.addEventListener('pointerenter', () => swing(li));
  li.addEventListener('focus', () => swing(li));
}
keyList?.addEventListener('keydown', (e) => {
  const i = keyEls.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  const cols = 6;
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: keyEls.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  const next = keyEls[Math.max(0, Math.min(keyEls.length - 1, to))];
  for (const k of keyEls) k.tabIndex = k === next ? 0 : -1;
  next.focus();
});

/* ---------- The registration card ---------- */

const card = $<HTMLFormElement>('form[data-apply]');
$('[data-step-next]')?.addEventListener('click', () => { if (checkStep(1)) showStep(2, true); });
$('[data-step-back]')?.addEventListener('click', () => showStep(1, true));
card?.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.getAttribute('aria-invalid') === 'true') checkField(el);
});
card?.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.getAttribute('aria-invalid') === 'true') checkField(el);
});
card?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (card.dataset.step !== '2') {
    if (checkStep(1)) showStep(2, true);
    return;
  }
  if (!checkStep(1)) { showStep(1, false); checkStep(1); return; }
  if (!checkStep(2)) return;
  const res = await sendCard({ byAgent: false });
  if (res.ok) {
    const d = Object.fromEntries([...new FormData(card)].filter(([k]) => k !== 'consent'));
    voice.contextUpdate(`The visitor sent the registration card themselves: ${JSON.stringify(d)}.`, 'apply');
  }
});

/* ---------- Questions at the desk ---------- */

const faq = $('[data-faq]');
const tablist = $('[data-faq-tabs]');
const tabs = $$<HTMLButtonElement>('[data-faq-tab]');
if (faq && tablist && tabs.length) {
  tablist.hidden = false;
  faq.dataset.tabs = '';
  for (const panel of $$('[data-faq-panel]', faq)) {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `faq-tab-${panel.dataset.faqPanel}`);
  }
  const select = (tab: HTMLButtonElement, focus: boolean) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  };
  select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0], false);
  tablist.addEventListener('click', (e) => {
    const tab = (e.target as Element).closest<HTMLButtonElement>('[data-faq-tab]');
    if (tab) select(tab, false);
  });
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(tabs[to], true);
  });
}

/** 'Ask Amariya this': into the live conversation, or a written one opened with the question */
function ask(q: string) {
  track('faq_asked');
  if (voice.state !== 'idle' && voice.connectedAt) return voice.sendText(q);
  const composer = $<HTMLInputElement>('[data-log-form] input[name="msg"]');
  if (composer) composer.value = q;
  const off = voice.on('connected', () => {
    off();
    clearTimeout(giveUp);
    setTimeout(() => {
      voice.sendText(q);
      if (composer?.value === q) composer.value = '';
    }, 400);
  });
  const giveUp = setTimeout(off, 20000);
  voice.requestStart('text');
}
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ask]');
  if (b?.dataset.ask) ask(b.dataset.ask);
});

/* ---------- The Night index and in-page links ---------- */

const dialog = $<HTMLDialogElement>('[data-index]');
function openIndex() {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  ($<HTMLElement>('[aria-current]', dialog) ?? $<HTMLElement>('[data-index-link]', dialog))?.focus();
}
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('[data-index-open]')) openIndex();
});
// A click on the backdrop closes the directory
dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

// Every in-page link moves through the night the same way: near hours glide, far ones go through lights down
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#"]');
  if (!a || a.closest('[data-voice-ui]')) return;
  const id = a.getAttribute('href')!.slice(1);
  if (!id) return;
  if (a.closest('[data-index]')) dialog?.close();
  if (navigate(id, false)) e.preventDefault();
});
// Aliases and hours in the address (#pricing, #apply, #h-2348) land where they mean
const fromHash = () => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && !document.getElementById(h)?.matches('[data-chapter]')) navigate(h, false);
};
addEventListener('hashchange', fromHash);
if (location.hash) {
  if (document.readyState === 'complete') requestAnimationFrame(fromHash);
  else addEventListener('load', () => requestAnimationFrame(fromHash), { once: true });
}

/* ---------- Sound, and the Do Not Disturb hanger ---------- */

document.addEventListener('click', (e) => {
  const target = e.target as Element | null;
  if (target?.closest?.('[data-sound-toggle]')) {
    voice.contextUpdate(`The visitor turned the page's sound ${sound.enabled ? 'on' : 'off'}.`, 'sound');
  }
  // The hanger flips each time it is turned (two names, so the animation restarts)
  const hanger = target?.closest?.<HTMLElement>('.hanger');
  if (hanger) hanger.dataset.flip = hanger.dataset.flip === 'a' ? 'b' : 'a';
});

/* ---------- The orb ---------- */

// The lantern is never carried: a long press is a full tilt grab (the concept's "Carry is off")
orb?.setAttribute('data-hold', 'tilt');
boot();
