// The night's clock and the hour ring that turns it. Minutes since 18:00 (0–825) ⇄ the page's scroll: the house
// scene's NightClock (window.amariyaNight) when it runs, else the same piecewise-linear map built here from the
// chapters' cached offsets. One ring component, two instances: around the glass (decorative) and the Night Dial
// in the cornice (the role=slider). Drag 0.45°/px with release velocity, a coast (τ .42 s) and watch-crown
// detents (k 90, c 14) to the nearest chapter within 18°, else the nearest quarter hour.
import { scroll, offsetTop } from '../../scripts/motion/scroll';
import { scheduler } from '../../scripts/motion/scheduler';
import { motion } from '../../scripts/motion/prefs';
import { clock } from '../../scripts/motion/clock';
import { sound } from '../../scripts/sound';

export const SPAN = 825;
const DEG = 0.4;
const DRAG = 0.45;
const OMEGA_MAX = 720;
const COAST_TAU = 0.42;
const SETTLE = 30;
const K = 90, C = 14;
const SNAP_DEG = 18;
const angle = (m: number) => 15 + m * DEG;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Where a chapter opens: the page's scroll-padding-top, where every move to a chapter stops (hotels.css): under the
 * cornice on wider screens, and on phones the reading line under the house band (45 % down, where trackSections reads,
 * less 8 px so the chapter that opens is the one the line reads). The clock and the camera count from there too, so the
 * hour in the cornice is the chapter the visitor was taken to. Read once per size.
 */
let leadPx = -1;
addEventListener('resize', () => { leadPx = -1; }, { passive: true });
export const lead = () => {
  if (leadPx < 0) leadPx = Math.max(0, parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
  return leadPx;
};

interface SceneClock { minutes: number; setMinutes(m: number, o?: { immediate?: boolean }): void }
/** The house scene's clock, once it has loaded (P3) */
export const sceneClock = () => (window as unknown as { amariyaNight?: SceneClock }).amariyaNight ?? null;

export interface Chapter { id: string; el: HTMLElement; m: number; hour: string; n: number }

/** 'HH:MM' → minutes since 18:00 */
export const toNight = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (((h * 60 + m - 1080) % 1440) + 1440) % 1440;
};
/** Minutes since 18:00 → 'HH:MM' */
export const nightHHMM = (m: number) => {
  const t = (1080 + Math.round(m)) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/** The visitor's own hour inside the night, or null by day (07:46–17:59) */
export const nowInNight = () => {
  const m = (((clock.now().minutes - 1080) % 1440) + 1440) % 1440;
  return m <= SPAN ? m : null;
};

/** The clocked chapters in page order: #house (18:00) … #register (07:45) */
export const chapters: Chapter[] = [...document.querySelectorAll<HTMLElement>('[data-chapter][data-hour]')]
  .filter((el) => /^\d\d:\d\d$/.test(el.dataset.hour ?? ''))
  .map((el, i) => ({ id: el.id, el, m: toNight(el.dataset.hour!), hour: el.dataset.hour!, n: i + 1 }));
const prologue = document.querySelector<HTMLElement>('[data-chapter][data-hour="now"]');

/** The chapter a minute belongs to (the last one that has started) */
export function chapterAt(m: number): Chapter {
  let at = chapters[0];
  for (const c of chapters) if (c.m <= m + 1e-6) at = c;
  return at;
}

// ponytail: the page's own NightClock is only the fallback (no WebGL 2, or the scene still loading);
// it reads the same data-hour attributes and cached offsets as the scene's, so both agree.
function minutesAtScroll(y: number) {
  const ahead = lead();
  const s = chapters.map((c) => ({ y: offsetTop(c.el) - ahead, m: c.m }));
  if (prologue) s.unshift({ y: offsetTop(prologue), m: nowInNight() ?? 0 });
  if (!s.length || y <= s[0].y) return s[0]?.m ?? 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (y < s[i + 1].y) return s[i].m + (s[i + 1].m - s[i].m) * ((y - s[i].y) / Math.max(1, s[i + 1].y - s[i].y));
  }
  return s[s.length - 1].m;
}
function scrollAtMinutes(m: number) {
  const ahead = lead();
  const s = chapters.map((c) => ({ y: Math.max(0, offsetTop(c.el) - ahead), m: c.m }));
  for (let i = 0; i < s.length - 1; i++) {
    if (m <= s[i + 1].m) return s[i].y + (s[i + 1].y - s[i].y) * clamp((m - s[i].m) / Math.max(1e-6, s[i + 1].m - s[i].m), 0, 1);
  }
  return s[s.length - 1]?.y ?? 0;
}

/** The page's clock: read the hour in view, or turn the page to an hour */
export const night = {
  get minutes() {
    const s = sceneClock();
    return clamp(s ? s.minutes : minutesAtScroll(scroll.y), 0, SPAN);
  },
  set(m: number, o: { immediate?: boolean } = {}) {
    m = clamp(m, 0, SPAN);
    const s = sceneClock();
    if (s) return s.setMinutes(m, o);
    void scroll.to(scrollAtMinutes(m), { immediate: o.immediate, duration: 1.1 });
  },
};

/* ---------- The two ring instances ---------- */

interface RingDom {
  root: SVGSVGElement;
  glass: boolean;
  /** Glass: the visitor's hand. Cornice: the scale that rolls under the fixed index */
  turn: SVGGElement | null;
  now: SVGGElement | null;
  needle: SVGGElement | null;
  ticks: SVGLineElement[];
}
const rings: RingDom[] = [...document.querySelectorAll<HTMLElement>('[data-ring]')].flatMap((host) => {
  const root = host.querySelector('svg');
  if (!root) return [];
  const glass = host.dataset.ring === 'glass';
  return [{
    root,
    glass,
    turn: root.querySelector<SVGGElement>(glass ? '[data-ring-hand]' : '[data-ring-scale]'),
    now: root.querySelector<SVGGElement>('[data-ring-now]'),
    needle: root.querySelector<SVGGElement>('[data-ring-needle]'),
    ticks: [...root.querySelectorAll<SVGLineElement>('.ring-tick')],
  }];
});
const slider = document.querySelector<HTMLElement>('[data-ring-slider]');
// The readout inside the dial window and the phone's time chip
const timeEls = [...document.querySelectorAll('[data-ring-time]')];
const roomEls = [...document.querySelectorAll('[data-ring-room]')];
const edges = { left: document.querySelector('[data-needle-edge="left"]'), right: document.querySelector('[data-needle-edge="right"]') };
const rotate = (el: Element | null, deg: number, glass: boolean) => el?.setAttribute('transform', glass ? `rotate(${deg.toFixed(2)})` : `rotate(${deg.toFixed(2)} 120 334)`);

export interface RingHooks {
  /** '23:48 · Room 214' and the slider's aria-valuetext for a minute */
  describe(m: number, c: Chapter): { caption: string; room: string; valueText: string };
  /** A chapter jump (lights down when far); keepFocus leaves focus on the slider */
  jump(id: string, keepFocus: boolean): void;
  openIndex(): void;
  /** The visitor let go of the ring at this minute */
  turned?(m: number): void;
}
let hooks: RingHooks | null = null;

/* ---------- State ---------- */

type Mode = 'idle' | 'drag' | 'coast' | 'spring';
const ring = { mode: 'idle' as Mode, theta: 0, omega: 0, target: 0, lastSet: -1, samples: [] as { t: number; th: number }[] };
let her: number | null = null;
let shown = -1;
let shownMinute = -1;
let shownChapter = '';
let lastQuarter = -1;
let lastTick = 0;
let intro: { t0: number; ms: number; to: number } | null = null;

const detent = (theta: number) => {
  const m = theta / DEG;
  let best: number | null = null;
  for (const c of chapters) if (Math.abs(c.m - m) * DEG <= SNAP_DEG && (best === null || Math.abs(c.m - m) < Math.abs(best - m))) best = c.m;
  return (best ?? Math.round(m / 15) * 15) * DEG;
};

function flashTick(q: number) {
  for (const r of rings) {
    const t = r.ticks[q];
    if (!t) continue;
    t.classList.add('lit');
    setTimeout(() => t.classList.remove('lit'), 140);
  }
  const now = performance.now();
  if (now - lastTick > 35) {
    lastTick = now;
    sound.play('tick');
    if (sound.enabled) navigator.vibrate?.(4);
  }
}

/** The minute the ring shows this frame */
function displayed(nowMs: number) {
  if (ring.mode !== 'idle') return ring.theta / DEG;
  if (intro) {
    const p = Math.min(1, (nowMs - intro.t0) / intro.ms);
    if (p >= 1) intro = null;
    else return intro.to * (1 - Math.pow(1 - p, 3));
  }
  return night.minutes;
}

function render(m: number) {
  if (Math.abs(m - shown) < 0.02) return;
  shown = m;
  const a = angle(m);
  for (const r of rings) rotate(r.turn, r.glass ? a : -a, r.glass);
  if (her !== null) {
    const rel = angle(her) - a;
    edges.left?.toggleAttribute('hidden', rel > -20);
    edges.right?.toggleAttribute('hidden', rel < 20);
  }
  const rm = Math.round(m);
  if (rm === shownMinute || !hooks) return;
  shownMinute = rm;
  const c = chapterAt(rm);
  const d = hooks.describe(rm, c);
  for (const el of timeEls) el.textContent = nightHHMM(rm);
  if (shownChapter !== c.id + d.room) {
    shownChapter = c.id + d.room;
    for (const el of roomEls) el.textContent = ` · ${d.room}`;
  }
  slider?.setAttribute('aria-valuenow', String(rm));
  slider?.setAttribute('aria-valuetext', d.valueText);
}

/** Re-describe the current minute (the house kind changed the room names) */
export function refresh() { shownMinute = -1; shownChapter = ''; shown = -1; }

/* ---------- Physics (order 5, before the scene's director reads the scroll) ---------- */

function physics(dt: number) {
  if (ring.mode === 'coast') {
    ring.omega *= Math.exp(-dt / COAST_TAU);
    ring.theta += ring.omega * dt;
    if (ring.theta <= 0 || ring.theta >= SPAN * DEG) { ring.theta = clamp(ring.theta, 0, SPAN * DEG); ring.omega = 0; }
    if (Math.abs(ring.omega) < SETTLE) { ring.mode = 'spring'; ring.target = detent(ring.theta); }
  } else if (ring.mode === 'spring') {
    const h = dt / 4;
    for (let i = 0; i < 4; i++) {
      ring.omega += (K * (ring.target - ring.theta) - C * ring.omega) * h;
      ring.theta += ring.omega * h;
    }
    if (Math.abs(ring.target - ring.theta) < 0.02 && Math.abs(ring.omega) < 0.5) {
      ring.theta = ring.target;
      ring.mode = 'idle';
      apply(true);
      hooks?.turned?.(ring.theta / DEG);
      return;
    }
  } else return;
  apply(false);
}

/** Turn the page to the ring's minute; ticks flash and click as quarters pass */
function apply(force: boolean) {
  const m = clamp(ring.theta / DEG, 0, SPAN);
  const q = Math.round(m / 15);
  if (q !== lastQuarter) { if (lastQuarter >= 0) flashTick(q); lastQuarter = q; }
  if (force || Math.abs(m - ring.lastSet) >= 0.2) {
    ring.lastSet = m;
    night.set(m, { immediate: true });
  }
}

const cancelCoast = () => { if (ring.mode === 'coast' || ring.mode === 'spring') ring.mode = 'idle'; };

/* ---------- Pointer: drag on fine pointers, a tap opens the Night index ---------- */

const FINE = matchMedia('(pointer: fine)');
let press: { id: number; x: number; y: number; cx: number; cy: number; glass: boolean; moved: number; dragging: boolean } | null = null;

function onDown(e: PointerEvent) {
  const host = (e.currentTarget as Element).closest<HTMLElement>('[data-ring]');
  if (!host || e.button !== 0) return;
  const glass = host.dataset.ring === 'glass';
  const dragging = FINE.matches && e.pointerType !== 'touch';
  let cx = 0, cy = 0;
  if (glass) {
    // One read at the start of a gesture: the ring's centre on screen
    const r = host.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
  }
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, cx, cy, glass, moved: 0, dragging };
  if (!dragging) return;
  e.preventDefault();
  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  intro = null;
  ring.mode = 'drag';
  ring.omega = 0;
  ring.theta = night.minutes * DEG;
  ring.lastSet = ring.theta / DEG;
  lastQuarter = Math.round(ring.theta / DEG / 15);
  ring.samples = [{ t: performance.now(), th: ring.theta }];
  document.documentElement.dataset.ringDrag = '';
}

function onMove(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  press.moved += Math.hypot(dx, dy);
  press.x = e.clientX;
  press.y = e.clientY;
  if (!press.dragging || ring.mode !== 'drag') return;
  let d: number;
  if (press.glass) {
    // Tangential travel, clockwise positive (angles clockwise from 12 o'clock)
    const a = Math.atan2(e.clientX - press.cx, -(e.clientY - press.cy));
    d = dx * Math.cos(a) + dy * Math.sin(a);
  } else {
    // The scale rolls with the hand: pulling it left brings the later hours under the index
    d = -dx;
  }
  ring.theta = clamp(ring.theta + d * DRAG, 0, SPAN * DEG);
  const t = performance.now();
  ring.samples.push({ t, th: ring.theta });
  while (ring.samples.length > 2 && t - ring.samples[0].t > 80) ring.samples.shift();
  apply(false);
}

function onUp(e: PointerEvent) {
  if (!press || e.pointerId !== press.id) return;
  const was = press;
  press = null;
  delete document.documentElement.dataset.ringDrag;
  if (was.moved < 5) {
    if (ring.mode === 'drag') ring.mode = 'idle';
    hooks?.openIndex();
    return;
  }
  if (ring.mode !== 'drag') return;
  const s = ring.samples, first = s[0], last = s[s.length - 1];
  const dt = (last.t - first.t) / 1000;
  ring.omega = dt > 0.008 ? clamp((last.th - first.th) / dt, -OMEGA_MAX, OMEGA_MAX) : 0;
  if (!motion.allowed) {
    ring.theta = detent(ring.theta);
    ring.mode = 'idle';
    apply(true);
    hooks?.turned?.(ring.theta / DEG);
    return;
  }
  if (Math.abs(ring.omega) < SETTLE) { ring.mode = 'spring'; ring.target = detent(ring.theta); }
  else ring.mode = 'coast';
}

/** The browser took the touch for scrolling: no tap, no drag */
function onCancel() {
  press = null;
  delete document.documentElement.dataset.ringDrag;
  if (ring.mode === 'drag') { ring.mode = 'spring'; ring.target = detent(ring.theta); ring.omega = 0; }
}

/* ---------- Keyboard: the slider in the cornice ---------- */

function onKey(e: KeyboardEvent) {
  if (!hooks) return;
  const m = Math.round(night.minutes);
  const c = chapterAt(m);
  const i = chapters.indexOf(c);
  let to: number | null = null;
  switch (e.key) {
    case 'ArrowLeft': case 'ArrowDown': to = Math.ceil(m / 15) * 15 - 15; break;
    case 'ArrowRight': case 'ArrowUp': to = Math.floor(m / 15) * 15 + 15; break;
    case 'PageUp': { const n = chapters[Math.min(chapters.length - 1, i + 1)]; e.preventDefault(); hooks.jump(n.id, true); return; }
    case 'PageDown': { const p = m > c.m + 1 ? c : chapters[Math.max(0, i - 1)]; e.preventDefault(); hooks.jump(p.id, true); return; }
    case 'Home': e.preventDefault(); hooks.jump(chapters[0].id, true); return;
    case 'End': e.preventDefault(); hooks.jump(chapters[chapters.length - 1].id, true); return;
    case 'Enter': e.preventDefault(); hooks.openIndex(); return;
    default: return;
  }
  e.preventDefault();
  cancelCoast();
  intro = null;
  to = clamp(to, 0, SPAN);
  flashTick(Math.round(to / 15));
  night.set(to, { immediate: true });
}

/* ---------- Marks: the visitor's 'now' pin and Amariya's second hand ---------- */

function placeNow() {
  const m = nowInNight();
  for (const r of rings) {
    r.now?.toggleAttribute('hidden', m === null);
    if (m !== null) rotate(r.now, angle(m), r.glass);
  }
  const h = clock.now().h;
  document.documentElement.toggleAttribute('data-up-late', h >= 0 && h < 5);
}

/** Show Amariya's second hand at her hour (the follow prompt), or hide it with null */
export function needle(m: number | null) {
  her = m === null ? null : clamp(m, 0, SPAN);
  for (const r of rings) {
    r.needle?.toggleAttribute('hidden', her === null);
    if (her !== null) rotate(r.needle, angle(her), r.glass);
  }
  if (her === null) { edges.left?.setAttribute('hidden', ''); edges.right?.setAttribute('hidden', ''); }
  shown = -1;
}

/** The porter's light: the ring's numerals tick from 18:00 to the visitor's hour */
export function ringIntro(ms: number) {
  const to = nowInNight();
  if (to !== null && motion.allowed) intro = { t0: performance.now(), ms, to };
}
export function endIntro() { intro = null; }

/* ---------- Start ---------- */

let started = false;
export function initRing(h: RingHooks) {
  hooks = h;
  if (started) return;
  started = true;
  for (const hit of document.querySelectorAll<Element>('[data-ring-hit]')) {
    hit.addEventListener('pointerdown', onDown as EventListener);
    hit.addEventListener('pointermove', onMove as EventListener);
    hit.addEventListener('pointerup', onUp as EventListener);
    hit.addEventListener('pointercancel', onCancel);
  }
  slider?.addEventListener('keydown', onKey);
  // The visitor's own scrolling wins over a coasting ring
  addEventListener('wheel', cancelCoast, { passive: true });
  addEventListener('touchstart', cancelCoast, { passive: true });
  addEventListener('keydown', (e) => { if (e.target !== slider) cancelCoast(); });
  scheduler.add((_, dt) => physics(dt), 5);
  scheduler.add((now) => render(displayed(now)), 90);
  placeNow();
  clock.onMinute(() => {
    placeNow();
    // The 'now' pin pulses once a minute
    if (motion.allowed) for (const r of rings) r.now?.animate([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], { duration: 1400, easing: 'ease-in-out' });
  });
  motion.on(() => { if (!motion.allowed) { cancelCoast(); intro = null; } });
}
