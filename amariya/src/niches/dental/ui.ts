// /dental's page script: the voice wiring, then everything the day sheet does on its own. The ink-in of entries, the
// visitor's clock (date, NOW line, ruler stamp), the elastic hour ruler, the chair columns, the pinned call story,
// the working day's entries and drop zones, the notes column's evening and tabs, the closing wordmark, the edge tab
// and the dock's knob. presenter.ts holds the agent's hands; scene/ (P7) moves the pearl and reports to this file
// through 'pearl:arrive', 'sheet:fill' and 'orb:status'.
import { voice } from '../../scripts/voice/bridge';
import { boot } from '../../scripts/orb/boot';
import { init as initSession } from '../../scripts/voice/session';
import { init as initTools } from '../../scripts/voice/tools';
import { init as initLevel } from '../../scripts/voice/level';
import { scheduler } from '../../scripts/motion/scheduler';
import { scroll, sectionProgress, trackSections } from '../../scripts/motion/scroll';
import { motion } from '../../scripts/motion/prefs';
import { clock, type ClockReading } from '../../scripts/motion/clock';
import { playScript, type CallLine, type Playback } from '../../scripts/scripted';
import { sound } from '../../scripts/sound';
import { track } from '../../scripts/analytics';
import { content } from '../../data/content/dental';
import type { NicheCall, NicheLine } from '../../data/content/types';
import { $, $$, bookedFor, callSeconds, clockWithSeconds, hm, isNight, nav, presenter, sceneAt, spread, storyState, timeToY, type StoryState, type TimeAnchor } from './presenter';
import type { OrbStatusDetail, PearlArriveDetail, SheetFillDetail } from './scene/types';

const C = content;
const html = document.documentElement;
/** The 07:45 row is pinned and scroll writes its beats (set by setStoryLive) */
let storyLive = false;

/* ---------- Voice first: the agent's config and hands, the session, then the pearl ---------- */

voice.configure(C.voice);
voice.registerPresenter(presenter);
initSession();
initTools();
initLevel();
boot();
// The page's JS is running: states that need it may hide things now (CSS falls back to showing all after 3 s)
html.dataset.ready = '';

const desktop = matchMedia('(min-width: 1100px)');
const phone = matchMedia('(max-width: 734px)');
// The same query as dental.css's pinned 07:45 row
const pinQuery = matchMedia('(min-width: 1100px) and (min-height: 720px)');
const t0 = performance.now();
const docY = (el: Element) => el.getBoundingClientRect().top + scroll.y;
const minutesOf = (s: string | undefined) => (s ? hm(s) : 0);
const two = (n: number) => String(n).padStart(2, '0');
const mmss = (s: number) => `${two(Math.floor(s / 60))}:${two(Math.floor(s % 60))}`;

/** Re-measure after layout changes, once per frame at most */
function onLayout(cb: () => void) {
  let raf = 0;
  const run = () => { raf = 0; cb(); };
  const queue = () => { if (!raf) raf = requestAnimationFrame(run); };
  new ResizeObserver(queue).observe(document.body);
  addEventListener('resize', queue, { passive: true });
  void document.fonts?.ready.then(queue);
  queue();
}

/* ---------- INK-IN: every entry wipes in left to right at 900 px/s, its baseline 80 ms ahead ---------- */

function ink(el: HTMLElement) {
  if (el.hasAttribute('data-inked')) return;
  if (html.dataset.ink === 'on') {
    el.style.setProperty('--ink-t', `${Math.max(0.24, Math.min(1.4, el.offsetWidth / 900)).toFixed(3)}s`);
    // During the intro the first entries wait for the paper (the first ink lands at 1.1 s)
    const wait = 'intro' in html.dataset ? Math.max(0, 1100 - (performance.now() - t0)) : 0;
    el.style.setProperty('--ink-delay', `${Math.round(wait)}ms`);
  }
  el.setAttribute('data-inked', '');
}
const unink = (el: HTMLElement) => el.removeAttribute('data-inked');

const inkIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    inkIO.unobserve(e.target);
    // The pinned story writes its own rows
    if (!(storyLive && e.target.closest('[data-phone-rows]'))) ink(e.target as HTMLElement);
  }
}, { rootMargin: '0px 0px -8% 0px' });
const observeInk = () => $$('.ink:not([data-inked])').forEach((el) => { if (!(storyLive && el.closest('[data-phone-rows]'))) inkIO.observe(el); });
// Timeout fallback: anything on screen that the observer has not reached yet
window.setTimeout(() => $$('.ink:not([data-inked])').forEach((el) => {
  if (storyLive && el.closest('[data-phone-rows]')) return;
  const r = el.getBoundingClientRect();
  if (r.top < innerHeight && r.bottom > 0) ink(el);
}), 1600);
motion.on(() => { if (!motion.allowed) delete html.dataset.ink; });

/* ---------- The intro: 1.5 s, skipped by any scroll ---------- */

const endIntro = () => { delete html.dataset.intro; };
if ('intro' in html.dataset) {
  window.setTimeout(endIntro, 1600);
  for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const) addEventListener(type, endIntro, { once: true, passive: true });
  scroll.onFrame((y) => { if (y > 8) endIntro(); });
}

/* ---------- Time anchors: where each time sits on the sheet (document px), measured on resize ---------- */

let anchors: TimeAnchor[] = [];
let sheetFoot = 0;
function measureAnchors() {
  const head = $('[data-sheet-head]');
  const marks = $$('[data-chapter], .day-row.entry');
  anchors = [
    // 07:00 is the top of the sheet: the header's perforation, so the NOW line never runs through the date
    ...(head ? [{ t: 7 * 60, y: docY(head) + head.offsetHeight }] : []),
    ...marks.map((el) => ({ t: minutesOf(el.dataset.time), y: docY(el) })),
  ];
  const close = $('#close');
  sheetFoot = close ? docY(close) : html.scrollHeight;
}

/* ---------- The visitor's clock: date, NOW line, ruler stamp, strip clock, the story's moment ---------- */

const nowLine = $('[data-now-line]');
const nowTime = $('[data-now-time]');
const nowStamp = $('[data-now-stamp]');
const nowLink = $('[data-now-link]');
const rulerClock = $('[data-clock]');
const sheet = $('[data-sheet]');
const pin = $('[data-story-pin]');
const phoneRows = $('[data-phone-rows]');
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** '2:32 pm' with a colon that blinks (steps, 2 s; held by Pause); a running '2:32:07 pm' ticks on its own, unblinking */
function stamp(el: HTMLElement | null, text: string) {
  if (!el || el.dataset.text === text) return;
  el.dataset.text = text;
  const i = text.indexOf(':');
  if (i < 0 || text.includes(':', i + 1)) return void (el.textContent = text);
  const colon = document.createElement('span');
  colon.className = 'colon';
  colon.textContent = ':';
  el.replaceChildren(text.slice(0, i), colon, text.slice(i + 1));
}

let now: ClockReading = clock.now();
let rulerAnchors: TimeAnchor[] = [];
/** The ruler's anchors with 07:00 at the top of the scale, for the NOW stamp */
let stampAnchors: TimeAnchor[] = [];

function placeNow() {
  if (!nowLine || !sheet) return;
  const t = now.minutes;
  const inDay = t >= 7 * 60 && t < 19 * 60;
  const hero = t >= hm('07:45') && t < hm('08:40') && !!pin && !!phoneRows;
  html.toggleAttribute('data-after-hours', !inDay);
  nowLine.toggleAttribute('data-after', !inDay);
  // The pinned 07:45 row is the visitor's own moment: the line sits on its phone rows there
  if (hero && pin && phoneRows) {
    if (nowLine.parentElement !== pin) pin.prepend(nowLine);
    nowLine.style.transform = `translateY(${phoneRows.offsetTop}px)`;
  } else {
    if (nowLine.parentElement !== sheet) sheet.prepend(nowLine);
    const y = inDay ? timeToY(anchors, t) : null;
    nowLine.style.transform = `translateY(${Math.round((y ?? sheetFoot) - docY(sheet))}px)`;
  }
  // The ruler's stamp at the same time on the elastic scale
  if (nowLink && desktop.matches) {
    const scaleH = nowLink.parentElement?.clientHeight ?? 0;
    const y = inDay ? timeToY(stampAnchors, t) : null;
    const at = Math.round(y ?? scaleH - 22);
    nowLink.style.setProperty('--y', `${at}px`);
    // The NOW stamp takes the scale's place where it lands: an hour label under it steps aside (its tick stays)
    rulerLinks.forEach((a, i) => a.parentElement?.toggleAttribute('data-under-now', !!rulerAnchors[i] && Math.abs(rulerAnchors[i].y - at) < 34));
  }
}

function tick(reading: ClockReading) {
  now = reading;
  const date = $('[data-date]');
  if (date) date.textContent = dateFmt.format(new Date());
  stamp(nowTime, now.line);
  stamp(nowStamp, now.line);
  stamp(rulerClock, now.line);
  placeNow();
  const after = html.hasAttribute('data-after-hours');
  const afterLabel = nowLink?.querySelector('.ruler-now-label');
  if (afterLabel) afterLabel.textContent = after ? C.ruler.afterHours : C.ruler.now;
  const nowAfter = $('[data-now-after]');
  if (nowAfter) nowAfter.textContent = after ? ` · ${C.ruler.afterHours}` : '';
  writeScene();
}

/* ---------- 07:45: the story's scene for the visitor's hour ---------- */

const numeral = $('[data-numeral]');
function writeScene() {
  const t = now.minutes;
  const scene = sceneAt(t);
  const booked = bookedFor(scene, t);
  const set = (sel: string, text: string, lang?: string) => {
    const el = $(sel);
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    if (lang) el.lang = lang;
    else el.removeAttribute('lang');
  };
  set('[data-story-scene]', scene.name);
  set('[data-story-line]', scene.line(now.line));
  set('[data-booked-label]', booked.label, booked.lang);
  set('[data-booked-text]', booked.label, booked.lang);
  set('p[data-clause]', isNight(t) ? C.beats.closing.night : C.beats.closing.day);
  if (numeral) numeral.textContent = now.twelveHour ? `${now.h % 12 || 12}:${now.mm}` : `${now.hh}:${now.mm}`;
  const storyClock = $('[data-story-time]');
  if (!storyLive && storyClock) storyClock.textContent = now.line;
  // The 7:45 toothache's slot is already set when the day reaches 15:40
  const late = $('[data-slot="e-1540"]');
  if (late && booked.time === '15:40' && !late.hasAttribute('data-set')) {
    late.removeAttribute('data-open');
    late.setAttribute('data-set', '');
    late.setAttribute('data-booked', '');
  }
}

/* ---------- The hour ruler: links where their chapters sit, ten-minute ticks between, measured on resize ---------- */

const scale = $('[data-ruler-scale]');
const ticksBox = $('[data-ruler-ticks]');
const rulerLinks = $$<HTMLAnchorElement>('[data-ruler-link]');

function layoutRuler() {
  if (!scale || !ticksBox) return;
  scale.toggleAttribute('data-laid', desktop.matches);
  if (!desktop.matches) {
    rulerLinks.forEach((a) => a.parentElement?.style.removeProperty('--y'));
    ticksBox.replaceChildren();
    rulerAnchors = stampAnchors = [];
    return;
  }
  const H = scale.clientHeight, total = Math.max(1, html.scrollHeight);
  const targets = rulerLinks.map((a) => document.getElementById(a.dataset.rulerLink ?? ''));
  const ys = targets.map((el) => (el ? (docY(el) / total) * H : 0));
  const placed = spread(ys, 44, 0, Math.max(0, H - 44));
  rulerLinks.forEach((a, i) => a.parentElement?.style.setProperty('--y', `${Math.round(placed[i])}px`));
  rulerAnchors = rulerLinks.map((a, i) => ({ t: minutesOf(a.dataset.time), y: placed[i] + 22 }));
  stampAnchors = [{ t: 7 * 60, y: 0 }, ...rulerAnchors];
  // Ticks every ten minutes between the hours that have entries, evenly spaced
  const frag = document.createDocumentFragment();
  let n = 0;
  for (let i = 1; i < rulerAnchors.length; i++) {
    const a = rulerAnchors[i - 1], b = rulerAnchors[i];
    const steps = Math.max(1, Math.round((b.t - a.t) / 10));
    for (let k = 0; k < steps; k++) {
      const tick = document.createElement('span');
      tick.className = k === 0 ? 'tick tick-hour' : 'tick';
      tick.style.setProperty('--y', `${(a.y + ((b.y - a.y) * k) / steps).toFixed(1)}px`);
      tick.style.setProperty('--i', String(n++));
      frag.append(tick);
    }
  }
  ticksBox.replaceChildren(frag);
}

/* ---------- The chair columns: an example day per practice type, ruled into every chapter ---------- */

interface Band { chair: number; start: number; end: number; label: string }
const LUNCH = [hm('12:30'), hm('13:30')] as const;
const DAY = [hm('07:30'), hm('17:00')] as const;
const durOf = (label: string) => Number(label.match(/(\d+)\s*min/)?.[1]) || 30;

/** Eight chairs' bookings for the day, from the practice type's four kinds of appointment; nobody works through lunch */
function daySchedule(labels: readonly string[]): Band[] {
  const out: Band[] = [];
  for (let c = 0; c < 8; c++) {
    let t = DAY[0] + ((c * 17) % 45);
    let k = c % labels.length;
    while (t < DAY[1]) {
      if (t >= LUNCH[0] && t < LUNCH[1]) { t = LUNCH[1] + (c % 3) * 5; continue; }
      const label = labels[k % labels.length];
      const d = durOf(label);
      if (t < LUNCH[0] && t + d > LUNCH[0]) { t = LUNCH[1] + (c % 3) * 5; continue; }
      const end = Math.min(t + d, DAY[1]);
      out.push({ chair: c, start: t, end, label });
      t = end + [10, 15, 5][(c + k) % 3];
      k++;
    }
  }
  return out;
}

const segments = $$('[data-chairs]');
let chairCount = 4;
let typeId = C.practiceTypes[0].id;
let schedule = daySchedule(C.practiceTypes[0].bands);

function drawChairs() {
  // All reads first, then the writes (resize only)
  const boxes = segments.map((seg) => ({ seg, h: seg.clientHeight, top: docY(seg) }));
  for (const { seg, h, top } of boxes) {
    const [from, to] = (seg.dataset.chairs ?? '').split('-').map(hm);
    if (!h) continue;
    const linear = !!seg.closest('[data-story-pin]');
    // The profile's segment carries the chair count at its head: band words start under it, never beneath it
    const head = seg.closest('#profile') ? 32 : 0;
    const y = (t: number) => (linear ? ((t - from) / (to - from)) * h : (timeToY(anchors, t) ?? (t < from ? 0 : h) + top) - top);
    const strips: HTMLElement[] = [];
    for (let c = 0; c < 8; c++) {
      const strip = document.createElement('span');
      strip.className = 'strip';
      strip.style.setProperty('--i', String(c));
      strip.dataset.i = String(c);
      if (c >= chairCount) strip.dataset.off = '';
      strips.push(strip);
    }
    for (const b of schedule) {
      if (b.end <= from || b.start >= to) continue;
      const y0 = Math.max(0, y(Math.max(b.start, from))), y1 = Math.min(h, y(Math.min(b.end, to)));
      if (y1 - y0 < 3) continue;
      const band = document.createElement('span');
      band.className = 'band';
      band.style.top = `${y0.toFixed(1)}px`;
      band.style.height = `${(y1 - y0).toFixed(1)}px`;
      const lift = Math.max(0, head - y0);
      if (y1 - y0 - lift >= b.label.length * 6.8 + 20) {
        const label = document.createElement('span');
        label.className = 'band-label';
        label.textContent = b.label;
        if (lift) label.style.marginTop = `${Math.ceil(lift)}px`;
        band.append(label);
      }
      strips[b.chair].append(band);
    }
    const count = seg.closest('#profile') ? [chairLabel()] : [];
    seg.replaceChildren(...count, ...strips);
  }
}
function chairLabel() {
  const span = document.createElement('span');
  span.className = 'chairs-count';
  span.dataset.chairsCount = '';
  const n = Number(readRooms()) || chairCount;
  span.textContent = `${n > 8 ? C.intake.chairsMore : n} ${n === 1 ? 'chair' : 'chairs'}`;
  return span;
}
const readRooms = () => (document.querySelector<HTMLInputElement>('form[data-profile] [name="rooms"]')?.value ?? '').trim();

/** The chair count from the slip rules that many columns in, each wiping down (240 ms, 60 ms apart) */
function setChairs(n: number) {
  const prev = chairCount;
  chairCount = Math.max(1, Math.min(8, n));
  html.dataset.chairs = String(chairCount);
  for (const seg of segments) {
    seg.querySelectorAll<HTMLElement>('.strip').forEach((s, c) => {
      const on = c < chairCount;
      s.toggleAttribute('data-off', !on);
      if (on && c >= prev) {
        s.style.setProperty('--d', `${(c - prev) * 60}ms`);
        s.removeAttribute('data-wipe');
        void s.offsetWidth;
        s.setAttribute('data-wipe', '');
      }
    });
    const label = seg.querySelector('[data-chairs-count]');
    if (label) label.replaceWith(chairLabel());
  }
}

// The chapter arrives: its chairs fill top to bottom, a pen ruling the day
const fillIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.fill = ''; fillIO.unobserve(e.target); }
}, { rootMargin: '0px 0px -20% 0px' });
segments.forEach((s) => fillIO.observe(s));

document.addEventListener('sheet:profile', (e) => {
  const rooms = Number((e as CustomEvent<{ rooms?: number }>).detail.rooms);
  if (rooms > 0 && Math.min(8, rooms) !== chairCount) setChairs(rooms);
  else if (rooms > 0) $$('[data-chairs-count]').forEach((l) => l.replaceWith(chairLabel()));
});
document.addEventListener('sheet:type', (e) => {
  const type = C.practiceTypes.find((t) => t.id === (e as CustomEvent<{ id: string }>).detail.id);
  if (!type || type.id === typeId) return;
  typeId = type.id;
  schedule = daySchedule(type.bands);
  const line = $('[data-intake-line]');
  if (line) {
    line.textContent = type.intakeLine;
    if (html.dataset.ink === 'on') { unink(line); void line.offsetWidth; ink(line); }
  }
  drawChairs();
});

/* ---------- 07:45: the pinned call story ---------- */

const story = $('#welcome');
const beatRows = $$('[data-beat]');
const clauseRow = $('p[data-clause]');
const storyTime = $('[data-story-time]');
const floats = $$('[data-greet-float] li');
const cradle = $('[data-cradle]');
let sp = 0;
let last: StoryState | null = null;
/** The minute the row's time was written for: the clock moves on while the story rests, and the line beside it follows */
let storyMinute = '';
let storyTone: 'warm' | 'bright' | 'calm' = 'warm';
let nextGreet = 0, greetN = 0;

/** live: one beat on the phone row at a time; static: all three written */
function setStoryAttrs(s: StoryState, live = true) {
  if (!story) return;
  const flags: [string, boolean][] = [['ring', s.ring], ['answered', s.answered], ['halo', s.halo], ['line', s.line], ['born', s.born], ['clause', s.clause]];
  // data-at-*: the section's own flags, never the hooks of the elements inside it
  for (const [k, on] of flags) story.toggleAttribute(`data-at-${k}`, on);
  beatRows.forEach((row, i) => ((live ? i + 1 === s.beat : i + 1 <= s.beat) ? ink(row) : unink(row)));
  if (clauseRow) (s.clause ? ink(clauseRow) : unink(clauseRow));
}

/** Static story: the three beats stand written, in their final state */
function setStoryLive() {
  const was = storyLive;
  // Scroll writes the story whenever the row is pinned (Pause keeps it, without the wipes and greetings)
  storyLive = pinQuery.matches && !motion.reduced && !!story;
  html.dataset.story = storyLive ? 'live' : 'static';
  if (!storyLive) {
    setStoryAttrs(storyState(1), false);
    if (storyTime) storyTime.textContent = now.line;
    if (was) setTone('warm');
  } else {
    last = null;
  }
  observeInk();
}

function setTone(t: 'warm' | 'bright' | 'calm') {
  if (t === storyTone) return;
  storyTone = t;
  // Only the visitor's own scrolling sets her tone, never during a conversation
  if (voice.state === 'idle') window.amariyaOrb?.setTone(t);
}

/** Greetings roll off the pearl one at a time: every 1.05 s, four alternating slots, each living 2.1 s */
const SLOTS = [[-1, -1], [1, 1], [1, -1], [-1, 1]] as const;
function greet() {
  if (!cradle || !floats.length) return;
  const li = floats[greetN % floats.length];
  const [sx, sy] = SLOTS[greetN % SLOTS.length];
  const r = cradle.clientWidth / 2.6;
  const k = Math.SQRT1_2;
  li.style.setProperty('--x0', `${(sx * k * r * 0.85).toFixed(1)}px`);
  li.style.setProperty('--y0', `${(sy * k * r * 0.85).toFixed(1)}px`);
  li.style.setProperty('--x1', `${(sx * k * r * 1.42).toFixed(1)}px`);
  li.style.setProperty('--y1', `${(sy * k * r * 1.32).toFixed(1)}px`);
  li.removeAttribute('data-go');
  void li.offsetWidth;
  li.setAttribute('data-go', '');
  greetN++;
}

scheduler.add((nowMs, dt) => {
  if (!storyLive || !story) return;
  // Reads: progress from cached offsets
  const goal = sectionProgress(story);
  sp = Math.abs(goal - sp) > 0.35 ? goal : sp + (goal - sp) * (1 - Math.exp(-dt / 0.143));
  if (Math.abs(goal - sp) < 1e-4) sp = goal;
  const s = storyState(sp);
  // Writes, only on change
  if (!last || s.beat !== last.beat || s.ring !== last.ring || s.answered !== last.answered || s.halo !== last.halo || s.line !== last.line || s.born !== last.born || s.clause !== last.clause) setStoryAttrs(s);
  if (!last || s.seconds !== last.seconds || s.answered !== last.answered || now.line !== storyMinute) {
    storyMinute = now.line;
    if (storyTime) {
      const text = s.answered ? clockWithSeconds(now.minutes, s.seconds, now.twelveHour) : now.line;
      if (storyTime.textContent !== text) storyTime.textContent = text;
    }
  }
  // The ruler's digits run with the call too
  stamp(nowStamp, s.answered && sp < 0.999 ? clockWithSeconds(now.minutes, s.seconds, now.twelveHour) : now.line);
  last = s;
  setTone(sp > 0.02 && sp < 0.98 ? (s.beat === 3 ? 'calm' : s.ring && s.beat === 1 ? 'bright' : 'warm') : 'warm');
  if (s.greet && motion.allowed && nowMs >= nextGreet) {
    greet();
    nextGreet = nowMs + 1050;
  }
}, 90);
// A conversation owns her tone: hand it back the moment one starts
voice.on('state', ({ state }) => {
  if (state === 'idle' || storyTone === 'warm') return;
  storyTone = 'warm';
  window.amariyaOrb?.setTone(voice.tone);
});
// Pause: greetings in the air are put away, none start
motion.on(() => { if (!motion.allowed) floats.forEach((li) => li.removeAttribute('data-go')); });

/* ---------- The hero's talk control follows the conversation; the pearl is pressed while a call is live ---------- */

const heroTalk = $<HTMLButtonElement>('[data-hero-talk]');
const orbRoot = $('[data-orb]');
voice.on('state', ({ state }) => {
  const live = state !== 'idle';
  if (heroTalk) {
    heroTalk.textContent = state === 'idle' ? C.hero.talk.idle : state === 'connecting' ? C.hero.talk.connecting : C.hero.talk.live;
    heroTalk.toggleAttribute('data-orb-talk', !live);
    heroTalk.toggleAttribute('data-hero-end', live);
  }
  orbRoot?.setAttribute('aria-pressed', String(live));
  $('[data-talk-labels]')?.toggleAttribute('data-live', live);
});
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('[data-hero-end]')) voice.stop();
});
orbRoot?.setAttribute('aria-pressed', 'false');
// The dental pearl's own keys, for screen readers
const help = $('#orb-help');
if (orbRoot && help) {
  const more = document.createElement('p');
  more.id = 'pearl-help';
  more.className = 'sr-only';
  more.textContent = 'Shift and the up or down arrow carries her between the open slots on the sheet; Enter sets her there and plays that call. J and K jump between entries. Escape puts her back.';
  help.after(more);
  orbRoot.setAttribute('aria-describedby', 'orb-help pearl-help');
}

/* ---------- The pearl's live region (keyboard carrying) and the [ ] keys between entries ---------- */

const pearlLive = $('[data-pearl-live]');
document.addEventListener('orb:status', (e) => {
  if (!pearlLive) return;
  pearlLive.textContent = '';
  const text = (e as CustomEvent<OrbStatusDetail>).detail.text;
  requestAnimationFrame(() => { pearlLive.textContent = text; });
});
orbRoot?.addEventListener('orb:key', (e) => {
  const { key } = (e as CustomEvent<{ key: string }>).detail;
  if (key !== '[' && key !== ']') return;
  e.preventDefault();
  const stops = $$('[data-chapter], .day-row.entry').map((el) => ({ el, y: docY(el) }));
  const y = scroll.y + 8;
  const target = key === ']' ? stops.find((s) => s.y > y + 40) : [...stops].reverse().find((s) => s.y < y - 40);
  if (target?.el.id) nav.goTo(target.el.id, false);
});

/* ---------- The working day: entries open, play their calls and set a pearl; gaps take a dropped pearl ---------- */

interface Call {
  el: HTMLElement;
  call: NicheCall;
  list: HTMLOListElement;
  timer: HTMLElement | null;
  recess: HTMLElement | null;
  playback: Playback | null;
  started: number;
  played: boolean;
  done: boolean;
}
const calls = new Map<string, Call>();
const callOf = (id: string) => C.calls.find((c) => c.id === id);

for (const el of $$('[data-entry], [data-gap]')) {
  const id = el.dataset.entry ?? el.dataset.gap ?? '';
  const call = callOf(el.dataset.call ?? '');
  const list = el.querySelector<HTMLOListElement>('[data-call-lines]');
  if (!id || !call || !list) continue;
  calls.set(id, {
    el, call, list,
    timer: el.querySelector('[data-call-timer]'),
    recess: document.querySelector(`[data-slot="${id}"]`),
    playback: null, started: 0, played: false, done: false,
  });
  // Folded until the day reaches it (or a hover, focus, tap, the agent or the pearl opens it)
  if (el.dataset.entry && el.id !== 'e-2310') setOpen(el, false);
}

/** When each entry last unfolded: a tap that focused it open must not fold it again */
const openedAt = new Map<HTMLElement, number>();
function setOpen(el: HTMLElement, open: boolean) {
  if (open && !el.hasAttribute('data-open')) openedAt.set(el, performance.now());
  el.toggleAttribute('data-open', open);
  el.querySelector('[data-entry-toggle]')?.setAttribute('aria-expanded', String(open));
}

/** Who is speaking, for screen readers: the caller as the call's meta names them, or Amariya */
const whoOf = (who: 'g' | 'a', call: NicheCall) => (who === 'a' ? C.transcript.her : call.meta.split(' · ')[0]);
function speaker(li: HTMLLIElement, who: 'g' | 'a', call: NicheCall) {
  if (li.querySelector('.sr-only')) return;
  const s = document.createElement('span');
  s.className = 'sr-only';
  s.lang = 'en';
  s.textContent = `${whoOf(who, call)}: `;
  li.prepend(s);
}

/** A translated line keeps its English gloss under it */
function gloss(li: HTMLLIElement, line: NicheLine) {
  if (!line.gloss || li.querySelector('.gloss')) return;
  const g = document.createElement('span');
  g.className = 'gloss';
  g.lang = 'en';
  g.textContent = line.gloss;
  li.append(g);
}

let timerJob: (() => void) | null = null;
function runTimers() {
  if (timerJob) return;
  timerJob = scheduler.add(() => {
    let any = false;
    for (const c of calls.values()) {
      if (!c.played || c.done || !c.timer) continue;
      any = true;
      const text = mmss((performance.now() - c.started) / 1000);
      if (c.timer.textContent !== text) c.timer.textContent = text;
    }
    if (!any && timerJob) { timerJob(); timerJob = null; }
  }, 90);
}

function finished(c: Call) {
  c.done = true;
  c.el.dataset.done = '';
  // Written out in full, it is the height it held: the hold goes, so a later resize reflows freely
  c.list.style.minHeight = '';
  if (c.timer) c.timer.textContent = mmss(callSeconds(c.call.lines));
  if (c.recess) {
    c.recess.removeAttribute('data-open');
    c.recess.setAttribute('data-set', '');
  }
  c.el.querySelector('[data-call-slips]')?.setAttribute('data-shown', '');
  sound.play('tick');
}

function play(c: Call, quiet = false) {
  if (c.played) return;
  c.played = true;
  c.started = performance.now();
  c.el.dataset.playing = '';
  const onLine = (li: HTMLLIElement, line: CallLine) => { speaker(li, line.who, c.call); gloss(li, line as NicheLine); };
  const live = !quiet && motion.allowed;
  if (live) {
    // The slip's final height, held while the lines arrive (written out once and taken back in the same frame): the
    // estimated room (--lines) was short, and the growing call pushed the rows below under the reader's eyes
    const kept = new Set(c.list.children);
    playScript(c.list, c.call, { static: true, onLine });
    c.list.style.minHeight = `${c.list.offsetHeight}px`;
    for (const li of [...c.list.children]) if (!kept.has(li)) li.remove();
  }
  c.playback = playScript(c.list, c.call, { static: !live, onLine, onDone: () => finished(c) });
  runTimers();
}

/** Opens an entry (or a filled gap) and plays its call once */
function openCall(id: string) {
  const c = calls.get(id);
  if (!c) return;
  if (c.el.dataset.entry) setOpen(c.el, true);
  const slip = c.el.querySelector<HTMLElement>('[data-gap-call]');
  if (slip) slip.hidden = false;
  if (html.dataset.ink === 'on') c.el.querySelectorAll<HTMLElement>('.entry-body, .call').forEach(ink);
  play(c);
}

// Pause (or reduced motion) mid-call: every call that is playing is written out in full at once
motion.on(() => {
  if (motion.allowed) return;
  for (const c of calls.values()) {
    if (!c.played || c.done) continue;
    c.playback?.stop();
    c.list.querySelectorAll('li:not([data-static])').forEach((li) => li.remove());
    c.played = false;
    play(c, true);
  }
});

// Each entry opens as the reading line (38 % down the screen) reaches it
const readIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) openCall((e.target as HTMLElement).dataset.entry ?? '');
}, { rootMargin: '-38% 0px -61% 0px' });
$$('[data-entry]').forEach((el) => readIO.observe(el));

for (const el of $$('[data-entry]')) {
  const id = el.dataset.entry ?? '';
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') openCall(id); });
  el.addEventListener('focusin', () => openCall(id));
  el.querySelector('[data-entry-toggle]')?.addEventListener('click', () => {
    if (el.hasAttribute('data-open') && performance.now() - (openedAt.get(el) ?? 0) > 600) setOpen(el, false);
    else openCall(id);
  });
}

document.addEventListener('sheet:open', (e) => {
  const { id } = (e as CustomEvent<{ id: string }>).detail;
  openCall(id);
});

/** A dropped pearl (or a tap on a recess) fills that gap: its call inks in */
function fill(slot: string) {
  const c = calls.get(slot);
  if (!c) return;
  if (c.recess) {
    c.recess.removeAttribute('data-open');
    c.recess.setAttribute('data-set', '');
  }
  openCall(slot);
  track('slot_filled', { slot });
}
document.addEventListener('sheet:fill', (e) => fill((e as CustomEvent<SheetFillDetail>).detail.slot));

document.addEventListener('click', (e) => {
  const recess = (e.target as Element | null)?.closest?.<HTMLElement>('[data-recess]');
  if (!recess) return;
  const slot = recess.dataset.slot ?? '';
  const pearl = window.amariyaPearl;
  // She rolls there herself when she can; the sheet:fill she dispatches inks the call
  if (pearl && recess.hasAttribute('data-open')) void pearl.carryTo(recess);
  else if (recess.hasAttribute('data-open')) fill(slot);
  else openCall(slot);
});

document.addEventListener('pearl:arrive', (e) => {
  const { slot } = (e as CustomEvent<PearlArriveDetail>).detail;
  $$('[data-here]').forEach((el) => el.removeAttribute('data-here'));
  document.querySelector(`[data-slot="${CSS.escape(slot)}"]`)?.setAttribute('data-here', '');
  pearlAway = slot !== 'now' && slot !== 'now-lane';
  heroAway();
  if (calls.has(slot) && calls.get(slot)!.el.dataset.entry) openCall(slot);
});

/** The labels under the cradle step aside when she leaves it: carried off, or the cradle rising past the reading line */
const heroLane = $('[data-hero-lane]');
let pearlAway = false, cradleAbove = false;
const heroAway = () => heroLane?.toggleAttribute('data-away', !!window.amariyaPearl && (pearlAway || cradleAbove));
if (cradle) {
  new IntersectionObserver(([e]) => {
    cradleAbove = e.intersectionRatio < 0.5 && e.boundingClientRect.top < (e.rootBounds?.top ?? 0);
    heroAway();
  }, { rootMargin: '-38% 0px 0px 0px', threshold: [0, 0.5, 1] }).observe(cradle);
}

// 'Hear her take a call': real recordings only (none until the owner supplies them)
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-hear]');
  if (!b) return;
  const audio = b.querySelector('audio');
  if (!audio) return;
  if (audio.paused) void audio.play().catch(() => {});
  else audio.pause();
});

/* ---------- Phones: one extra recess right under the cradle, so she reaches the phone lane before the text ---------- */

const heroTrack = $('[data-hero-track]');
function setHeroTrack() {
  if (!heroTrack) return;
  if (phone.matches) {
    heroTrack.dataset.slot = 'now-lane';
    heroTrack.dataset.time = '07:45';
    heroTrack.setAttribute('data-anchor', '');
  } else {
    delete heroTrack.dataset.slot;
    delete heroTrack.dataset.time;
    heroTrack.removeAttribute('data-anchor');
  }
}

/* ---------- 17:30: the seats are counted when they are seen ---------- */

const seats = $('[data-seats]');
if (seats) {
  const io = new IntersectionObserver((es) => {
    if (es.some((x) => x.isIntersecting)) { track('ledger_viewed'); io.disconnect(); }
  }, { threshold: 0.5 });
  io.observe(seats);
}

/* ---------- 18:30: the paper warms, the FAQ becomes tabs, every answer can be asked ---------- */

const faq = $('#faq');
let faqTop = Infinity;
scroll.onFrame((y) => {
  const evening = y + innerHeight * 0.38 >= faqTop;
  if (evening !== html.hasAttribute('data-evening')) html.toggleAttribute('data-evening', evening);
});

const tablist = $('[data-tablist]');
const tabs = $$<HTMLButtonElement>('[data-tab]');
const panels = $$('[data-panel]');
function selectTab(id: string, focus: boolean, byVisitor: boolean) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  panels.forEach((p) => { p.hidden = p.dataset.panel !== id; });
  if (byVisitor) {
    const label = tabs.find((t) => t.dataset.tab === id)?.textContent ?? id;
    voice.contextUpdate(`The visitor opened the "${label}" questions in the notes column.`);
  }
}
if (tablist && tabs.length) {
  tablist.hidden = false;
  faq?.setAttribute('data-tabs-on', '');
  panels.forEach((p) => {
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', `faq-tab-${p.dataset.panel}`);
    p.tabIndex = 0;
  });
  selectTab(tabs[0].dataset.tab ?? '', false, false);
  tablist.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLButtonElement>('[data-tab]');
    if (t) selectTab(t.dataset.tab ?? '', false, true);
  });
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(tabs[next].dataset.tab ?? '', true, true);
  });
}

/** 'Ask Amariya this': a text conversation with the question waiting in the composer, unsent */
function ask(question: string) {
  track('ask', { live: voice.state !== 'idle' });
  if (voice.state !== 'idle') return voice.sendText(question);
  voice.requestStart('text');
  const put = () => {
    const input = $<HTMLInputElement>('[data-log-form] [name="msg"]');
    if (input && !input.value) {
      input.value = question;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  requestAnimationFrame(put);
  window.setTimeout(put, 450);
}
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ask-this]');
  const q = b?.closest<HTMLElement>('[data-ask]')?.dataset.ask;
  if (q) ask(q);
});

/* ---------- 19:00: the wordmark fills the sheet's width (Ranade, measured) ---------- */

const wordmark = $('[data-wordmark]');
const wordText = $('[data-wordmark-text]');
const wordSlot = $('.wordmark-slot');
let faceAsked = false;
function fitWordmark() {
  if (!wordmark || !wordText) return;
  // Measured in Ranade itself: until the face has loaded, the fallback's narrower width would overfill the sheet
  const face = `500 100px ${getComputedStyle(wordText).fontFamily}`;
  if (!faceAsked && !document.fonts.check(face)) {
    faceAsked = true;
    void document.fonts.load(face).then(fitWordmark, () => {});
  }
  // Through the wordmark's documented decorative token (dental.css), so the type scale stays enforceable
  const avail = wordmark.clientWidth - (wordSlot?.offsetWidth ?? 0) - 8;
  wordText.style.setProperty('--wordmark-size', '100px');
  const w = wordText.getBoundingClientRect().width;
  if (w > 0 && avail > 0) wordText.style.setProperty('--wordmark-size', `${Math.floor((100 * avail) / w)}px`);
}

/* ---------- Navigation: the ruler, 'read on', the hero's Apply and the edge tab go through the navigator ---------- */

document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('[data-ruler-link], [data-go]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const name = a.dataset.rulerLink ?? a.dataset.go ?? '';
  if (!name || !nav.goTo(name, false)) return;
  e.preventDefault();
  const menu = $<HTMLDetailsElement>('[data-ruler-menu]');
  if (menu) menu.open = false;
});
nowLink?.addEventListener('click', (e) => {
  if (!nowLine) return;
  e.preventDefault();
  // To the reading line itself (a number, so no scroll-padding is taken off)
  void scroll.to(nowLine.getBoundingClientRect().top + scroll.y - innerHeight * 0.38, { duration: 0.9 });
});

const chapterIds = $$('[data-chapter]').map((el) => el.id).filter(Boolean);
let current = '';
trackSections(chapterIds, (id) => {
  if (id === current) return;
  current = id;
  track('section_viewed', { section: id });
  rulerLinks.forEach((a) => {
    const on = a.dataset.rulerLink === id;
    if (on) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
    // The phone strip keeps the current hour in view, scrolling only itself: scrollIntoView also moved the page (the
    // strip sits in the scroll padding under the bar), pulling a phone visitor back up at every new chapter
    const strip = on && !desktop.matches ? a.closest<HTMLElement>('.ruler-marks') : null;
    if (strip) {
      const r = a.getBoundingClientRect(), s = strip.getBoundingClientRect();
      strip.scrollTo({ left: strip.scrollLeft + (r.left + r.width / 2) - (s.left + s.width / 2), behavior: motion.allowed ? 'smooth' : 'instant' });
    }
  });
  $$('[data-chapter]').forEach((el) => el.toggleAttribute('data-current', el.id === id));
  html.toggleAttribute('data-at-apply', id === 'apply');
});

// The phone strip's hours fade out at an end only while more of them lie past it (dental.css reads the flags): a
// hard cut left a stray '15' or '18:' at its edges. Its width moves with the NOW stamp beside it, an hour's with the moon.
const marksStrip = $('.ruler-marks');
if (marksStrip) {
  let more = 0;
  const ends = () => {
    marksStrip.toggleAttribute('data-more-start', marksStrip.scrollLeft > 1);
    marksStrip.toggleAttribute('data-more-end', marksStrip.scrollLeft < more - 1);
  };
  const ro = new ResizeObserver(() => { more = marksStrip.scrollWidth - marksStrip.clientWidth; ends(); });
  ro.observe(marksStrip);
  $$('.ruler-mark', marksStrip).forEach((li) => ro.observe(li));
  marksStrip.addEventListener('scroll', ends, { passive: true });
}

// The edge tab shows once the first screen is behind the visitor
scroll.onFrame((y) => {
  const past = y > innerHeight;
  if (past !== html.hasAttribute('data-past')) html.toggleAttribute('data-past', past);
});

/* ---------- The dock collapses to a knob while a field has focus or the close is on screen ---------- */

let fieldFocus = false, closeSeen = false;
const knob = () => html.toggleAttribute('data-knob', fieldFocus || closeSeen);
document.addEventListener('focusin', (e) => {
  const t = e.target as Element;
  fieldFocus = !!t.closest?.('main input, main select, main textarea') && !t.closest('[data-voice-ui]') && (t as HTMLInputElement).type !== 'radio' && (t as HTMLInputElement).type !== 'checkbox';
  knob();
});
document.addEventListener('focusout', () => {
  requestAnimationFrame(() => {
    const t = document.activeElement;
    fieldFocus = !!t?.closest?.('main input, main select, main textarea') && (t as HTMLInputElement).type !== 'radio' && (t as HTMLInputElement).type !== 'checkbox';
    knob();
  });
});
const closeEl = $('#close');
if (closeEl) new IntersectionObserver((es) => { closeSeen = es.some((x) => x.isIntersecting); knob(); }, { threshold: 0.15 }).observe(closeEl);

/* ---------- Layout: everything measured on resize, never per frame ---------- */

for (const q of [desktop, phone, pinQuery]) q.addEventListener('change', () => { setHeroTrack(); setStoryLive(); });
motion.on(setStoryLive);
setHeroTrack();
setStoryLive();
writeScene();
html.dataset.chairs = String(chairCount);
onLayout(() => {
  measureAnchors();
  layoutRuler();
  drawChairs();
  fitWordmark();
  faqTop = faq ? docY(faq) : Infinity;
  placeNow();
});
tick(clock.now());
clock.onMinute(tick);
