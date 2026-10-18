// The clinics world: her body on the page, the Line, the sundial, and the gesture grammar on top of OrbInput.
//   tap → voice (boot.ts) · plain drag → turn (OrbInput; six detents in the dial) · long press → lift and carry,
//   release over a [data-point] ring or [data-ask] target → placed there · ↑/↓ previous/next point · ←/→ a detent (30° elsewhere)
//   · Shift+→ (Shift+↓ on phones) push her into the line · End show the mark · Home set her down · Esc send her home · L note · ? help
// Home rule: unless held or placed, she rests on the current chapter's [data-orb-anchor] (on phones, a chapter without a
// visible anchor sends her to the thumb cradle at the bottom right). startWorld() needs no WebGL; the scene reads `world`.
import { scheduler } from '../../../scripts/motion/scheduler';
import { motion } from '../../../scripts/motion/prefs';
import { scroll, sectionProgress } from '../../../scripts/motion/scroll';
import { voice, FEATURES, type FeatureKey } from '../../../scripts/voice/bridge';
import { sound } from '../../../scripts/sound';
import { content } from '../../../data/content/clinics';
import { getNiche } from '../../../data/niches';
import { Body, nearestDetent, type Env } from './physics';
import { line } from './line';
import { sun } from './sun';
import type { LithoKey, PorcelainApi, PorcelainEvents, World } from './types';

/** Her radius per chapter (px), eased on a critically damped spring k 60 */
const RADII: Record<string, number> = { welcome: 132, story: 110, call: 40, features: 150, line: 96, profile: 72, pricing: 64, apply: 56, faq: 56, signoff: 28 };
/** What the lithophane shows by default in each chapter (the page can override with setLithophane until the chapter changes) */
const LITHO: Record<string, LithoKey> = { welcome: 'greet', story: 'greet', call: 'answering', line: 'guest_requests', profile: 'name', pricing: '30', apply: 'name', faq: 'greet', signoff: 'mark' };
const PHONE = 734;
const PHONE_HERO = 64;
const CRADLE = 30;
const DIAL = Math.PI / 3;
const GREET = (40 * Math.PI) / 180;
const TURN = Math.PI / 6;
const NEAR = 1.8;
const COARSE = matchMedia('(pointer: coarse)').matches;
const MAGNET_R = COARSE ? 72 : 110;
/** Story beat 1: she and her hour ring grow to a 56vh ring beat */
const STORY_GROW = 0.2;

interface Chapter {
  el: HTMLElement;
  id: string;
  top: number;
  bottom: number;
  anchor: HTMLElement | null;
  /** Inside a pinned (sticky) block: measured live while on screen */
  sticky: boolean;
  box: { x: number; y: number; w: number; h: number } | null;
}
interface Target { el: HTMLElement; kind: 'point' | 'ask'; x: number; y: number }

const body = new Body();
export const world: World = {
  body,
  near: 0,
  litho: { key: 'greet', order: [...FEATURES], name: '', version: 0 },
  mark: { shown: false, n: 1 },
  lock: false,
  cradle: false,
};

let root: HTMLElement;
let main: HTMLElement;
let started = false;
let ready = false;
let chapters: Chapter[] = [];
let targets: Target[] = [];
let current = 0;
let vw = 0;
let vh = 0;
let barH = 56;
let safe = { r: 0, b: 0 };
let mainX = 0;
let mainY = 0;
let baseX = 0;
let baseY = 0;
let range: HTMLInputElement | null = null;
/**
 * --ox/--oy/--or change on every scroll frame, and a custom property on :root restyles the whole document:
 * written only while a stylesheet of this page uses them (checked on resize)
 */
let orbVars = false;
/** What the body last saw of its home, to tell a pinned carrier from a jump */
const last = { wx: NaN, wy: NaN, cx: NaN, cy: NaN, t: 0 };
const written = { tx: NaN, ty: NaN, s: 1, orb: NaN, vars: '', near: '', over: '' };
let carryPointer: { x: number; y: number } | null = null;
let restChapter = -1;
let overEl: HTMLElement | null = null;
let explicit: { key: LithoKey; chapter: number } | null = null;
let markChapter = -1;
let detent = -1;
let dialFollow = true;
let greetIndex = -1;
let hide = 0;
let lastScrollMove = 0;
let timeOverride = false;
let introPending = false;
let placedOnce = false;
/** Her yaw when the current press began: only a drag that turned her settles the dial */
let yawAtDown = NaN;
/** Voice trace on the line */
const trace = { idle: 0, beat: 0, state: 'idle', think: [] as number[], ring: [] as number[] };

const now = () => performance.now() / 1000;
const stage = () => window.amariyaOrb;
const smooth = () => motion.allowed;
const emit = <K extends keyof PorcelainEvents>(name: K, detail: PorcelainEvents[K]) => document.dispatchEvent(new CustomEvent(name, { detail }));
const status = (text: string) => emit('orb:status', { text });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smoothstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Page px from viewport px */
const toWorld = (x: number, y: number) => ({ x: x + scrollX - mainX, y: y + scrollY - mainY });

function chapterMeta(ch: Chapter | undefined) {
  const meta = content.chapters.find((c) => c.id === ch?.id);
  const index = ch ? chapters.indexOf(ch) : 0;
  return { point: meta?.point ?? String(index).padStart(2, '0'), title: meta?.title ?? ch?.el.querySelector('h1, h2')?.textContent?.trim() ?? '' };
}

/** The dial's order as the page shows it (the lens may reorder it) */
function dialOrder(): FeatureKey[] {
  const keys = [...document.querySelectorAll<HTMLElement>('#features [data-feature]')]
    .map((el) => el.dataset.feature as FeatureKey)
    .filter((k, i, all) => FEATURES.includes(k) && all.indexOf(k) === i);
  return keys.length === FEATURES.length ? keys : [...FEATURES];
}

/* ---------- Measuring (on resize, after fonts load, when chapters change size) ---------- */

function cssPx(name: string, fallback: number) {
  const v = parseFloat(getComputedStyle(document.body).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

function recompute() {
  vw = document.documentElement.clientWidth;
  vh = innerHeight;
  barH = cssPx('--bar-h', 56);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:0 env(safe-area-inset-right) env(safe-area-inset-bottom) 0';
  document.body.append(probe);
  const ps = getComputedStyle(probe);
  safe = { r: parseFloat(ps.paddingRight) || 0, b: parseFloat(ps.paddingBottom) || 0 };
  probe.remove();

  const m = main.getBoundingClientRect();
  mainX = m.left + scrollX;
  mainY = m.top + scrollY;
  line.rebuild(main);
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left - m.left, y: r.top - m.top, w: r.width, h: r.height }; };
  chapters = [...document.querySelectorAll<HTMLElement>('[data-chapter]')]
    .map((el) => {
      const b = box(el);
      const anchor = el.querySelector<HTMLElement>('[data-orb-anchor]');
      const a = anchor ? box(anchor) : null;
      let sticky = false;
      for (let p = anchor; p && p !== el.parentElement; p = p.parentElement) if (getComputedStyle(p).position === 'sticky') sticky = true;
      return { el, id: el.id || el.dataset.chapter || '', top: b.y, bottom: b.y + b.h, anchor, sticky, box: a && a.w > 0 && a.h > 0 ? a : null };
    })
    .sort((p, q) => p.top - q.top);
  targets = [...document.querySelectorAll<HTMLElement>('[data-point], [data-ask]')]
    .filter((el) => !root.contains(el))
    .map((el) => { const b = box(el); return { el, kind: el.hasAttribute('data-point') ? 'point' as const : 'ask' as const, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w }; })
    .filter((t) => t.w > 0);
  range = document.querySelector<HTMLInputElement>('#call input[type="range"]');
  orbVars = [...document.styleSheets].some((sheet) => {
    try { return [...sheet.cssRules].some((rule) => /var\(--o[xyr]\b/.test(rule.cssText)); } catch { return false; }
  }) || !!document.querySelector('body [style*="var(--ox"], body [style*="var(--oy"], body [style*="var(--or)"]');
  // Where the root sits before our transform (it is absolutely positioned in main; any containing block works)
  const r = root.getBoundingClientRect();
  const s = written.s || 1, w = r.width / s;
  baseX = r.left + scrollX - (Number.isFinite(written.tx) ? written.tx : 0) - (w / 2) * (1 - s);
  baseY = r.top + scrollY - (Number.isFinite(written.ty) ? written.ty : 0) - (w / 2) * (1 - s);
  const order = dialOrder();
  if (order.join() !== world.litho.order.join()) { world.litho.order = order; world.litho.version++; }
  last.wx = NaN;
  ready = chapters.length > 0;
}

let timer = 0;
const schedule = () => { clearTimeout(timer); timer = window.setTimeout(recompute, 100); };

/* ---------- Home ---------- */

function homeOf(index: number, viewTop: number) {
  const ch = chapters[index];
  const phone = vw < PHONE;
  let r = RADII[ch.id] ?? 56;
  let x: number, y: number, cradle = false;
  let b = ch.box;
  if (b && ch.sticky && ch.anchor) {
    const rect = ch.anchor.getBoundingClientRect();
    b = { x: rect.left + scrollX - mainX, y: rect.top + scrollY - mainY, w: rect.width, h: rect.height };
  }
  if (b) {
    x = b.x + b.w / 2;
    y = b.y + b.h / 2;
    if (b.w >= 40) r = Math.min(r, b.w / 2);
  } else if (phone && index > 0) {
    // The thumb's talk button: bottom right, sliding away while the page scrolls down
    r = CRADLE;
    cradle = true;
    x = vw - 16 - safe.r - r + scrollX - mainX;
    y = viewTop + vh - 16 - safe.b - r + hide * (2 * r + 40);
  } else {
    if (phone) r = PHONE_HERO;
    y = ch.top + Math.min(ch.bottom - ch.top, vh) / 2;
    x = phone ? vw / 2 + scrollX - mainX : line.xAt(y) - r - 8;
  }
  if (ch.id === 'story' && smooth()) {
    // Beat 1 grows her (and the hour ring the page draws around her) to the 56vh ring beat; she settles back for the last beat
    const p = sectionProgress(ch.el);
    const grow = smoothstep(0, 0.08, p) * (1 - smoothstep(0.9, 1, p));
    // ...never past the cell the page keeps for her: her printed ring (1.36 r) must not cross the beats beside it.
    // ponytail: with the page's cell in place this holds her at its size; the growth shows only without a cell.
    const room = b ? b.w / 2 : Infinity;
    r += (Math.min(STORY_GROW * vh, (phone ? 0.225 : 0.32) * vw, room) - r) * grow;
  }
  if (ch.id === 'call' && range) {
    const head = line.playheadAt(played() ?? 0);
    if (head) {
      y = head.y;
      if (!b) x = head.x - head.reach - r - 6;
    }
  }
  return { x, y, r, cradle };
}

function played() {
  if (!range) return null;
  const min = Number(range.min) || 0, max = Number(range.max) || 100, v = Number(range.value);
  return max > min && Number.isFinite(v) ? (v - min) / (max - min) : 0;
}

/* ---------- The frame ---------- */

const env: Env = {
  smooth: true, home: { x: 0, y: 0 }, carrierVx: 0, carrierVy: 0, radius: 132, scrollV: 0, paper: true,
  walls: { left: 0, right: 0, top: 0, bottom: 0 },
  probe: (x, y) => line.probe(x, y),
};

function tick(_now: number, dt: number) {
  if (!ready) return;
  const t = now();
  const go = smooth();
  const viewTop = scrollY - mainY;
  const mid = viewTop + vh / 2;
  // The chapter crossing the middle of the viewport
  const index = chapterAt(mid);
  if (index !== current) chapterChanged(index);

  // The phone cradle slides away while the page scrolls down and comes back when it stops
  if (Math.abs(scroll.v) > 40) lastScrollMove = t;
  const hideTo = vw < PHONE && scroll.v > 40 ? 1 : scroll.v < -40 || t - lastScrollMove > 0.6 ? 0 : hide;
  hide += (hideTo - hide) * (go ? 1 - Math.exp(-dt / 0.18) : 1);

  // A dial bezel carried by its pin
  const pin = line.pinned;
  if (pin) {
    const sec = pin.section.getBoundingClientRect();
    if (sec.bottom > -vh && sec.top < 2 * vh) { const r = pin.el.getBoundingClientRect(); line.pin(r.top + r.height / 2 + scrollY - mainY); }
  }

  // Home, and whether it moved with a pin (carry along) or jumped (spring)
  const home = homeOf(current, viewTop);
  const cx = home.x, cy = home.y - viewTop;
  const dw = Math.hypot(home.x - last.wx, home.y - last.wy), dc = Math.hypot(cx - last.cx, cy - last.cy);
  env.carrierVx = env.carrierVy = 0;
  if (Number.isFinite(dw) && dw > 0.01 && dc < 0.5 && dt > 0) { env.carrierVx = (home.x - last.wx) / dt; env.carrierVy = (home.y - last.wy) / dt; }
  else if (Number.isFinite(dw) && dw > 0.5 && dc > 0.5 && body.mode === 'attached') body.goHome();
  Object.assign(last, { wx: home.x, wy: home.y, cx, cy, t });
  env.home.x = home.x;
  env.home.y = home.y;
  env.radius = home.r;
  const onLine = line.probe(home.x, home.y);
  env.paper = !home.cradle && !!onLine && onLine.d >= home.r - 2;
  env.smooth = go;
  env.scrollV = scroll.v;
  env.walls.left = scrollX - mainX;
  env.walls.right = vw + scrollX - mainX;
  env.walls.top = viewTop + barH;
  env.walls.bottom = viewTop + vh;
  // The first frame: she is simply there (the intro, when the page asks for it, drops her in)
  if (!placedOnce) { placedOnce = true; body.reset(home.x, home.y, home.r); }

  // A parked or placed orb goes home once its chapter leaves the viewport
  if ((body.mode === 'parked' || body.mode === 'placed') && restChapter >= 0) {
    const ch = chapters[restChapter];
    if (!ch || ch.bottom < viewTop || ch.top > viewTop + vh) sendHome();
  }

  // Carrying: follow the pointer (in page px, so a wheel scroll while carrying keeps her under the hand), snap to magnets
  if (body.mode === 'carry' && carryPointer) {
    const p = toWorld(carryPointer.x, carryPointer.y);
    body.move(p.x, p.y);
    const near = nearestTarget(p.x, p.y);
    body.magnet = near ? restingSpot(near) : null;
    markOver(near?.el ?? null, near?.kind);
  }

  steer(go);
  body.step(dt, env);
  if (introPending && go) { introPending = false; body.dropIn(24); }

  // In the phone's thumb cradle she is chrome (a talk button), not an object on the paper: the stage canvas draws over
  // the content while she sits there or travels out of it, and goes back under once she reaches her next home (an
  // empty cell, so the change never shows). Under the content, text ran across her and the button looked broken.
  const raised = home.cradle || (world.cradle && Math.hypot(body.x - home.x, body.y - home.y) > home.r);
  if (raised !== world.cradle) { world.cradle = raised; document.documentElement.toggleAttribute('data-orb-cradle', raised); }

  sun.update(performance.now());
  if (timeOverride && chapters[current]?.id !== 'story') { timeOverride = false; sun.setTime(null); }
  voiceTrace(t, viewTop, go);
}

/** Turning by itself: the dial follows the scroll between detents, the story turns 40° per greeting */
function steer(go: boolean) {
  const input = stage()?.input;
  const ch = chapters[current];
  if (!input || !ch) return;
  world.mark.shown = world.mark.shown && markChapter === current;
  let lock = world.mark.shown;
  if (ch.id === 'features') {
    lock = true;
    if (go && dialFollow && !input.dragging && !input.carrying) {
      const p = sectionProgress(ch.el), seg = p * 6, i = Math.min(5, Math.floor(seg));
      const at = i + (i < 5 ? smoothstep(0.7, 1, seg - i) : 0);
      const target = -at * DIAL, yaw = target + Math.round((input.yaw - target) / (2 * Math.PI)) * 2 * Math.PI;
      if (Math.abs(yaw - input.yaw) > 1e-4) input.setPose(yaw, input.pitch);
    }
    const d = nearestDetent(input.yaw, DIAL, 6);
    if (d.index !== detent) {
      const user = input.dragging || !dialFollow;
      detent = d.index;
      const key = world.litho.order[d.index];
      emit('dial:detent', { index: d.index, key, user });
      if (user) sound.play('tick');
      setLitho();
    }
  } else if (ch.id === 'story' && world.litho.key === 'greet' && go) {
    const p = sectionProgress(ch.el);
    if (p >= 1 / 3 && p < 2 / 3) {
      lock = true;
      const k = clamp(Math.floor((p - 1 / 3) * 27), 0, 8);
      if (k !== greetIndex && !input.dragging) {
        greetIndex = k;
        const target = -k * GREET;
        input.snapYawTo(target + Math.round((input.yaw - target) / (2 * Math.PI)) * 2 * Math.PI, 60, 15.5);
      }
    } else greetIndex = -1;
  }
  world.lock = lock;
}

function chapterChanged(index: number) {
  current = index;
  explicit = explicit && explicit.chapter === index ? explicit : null;
  if (markChapter !== index) { world.mark.shown = false; markChapter = -1; }
  detent = -1;
  greetIndex = -1;
  dialFollow = true;
  if (body.mode === 'attached') body.goHome();
  setLitho();
}

/** Resolves the lithophane for the chapter (or the page's choice) and bumps the version when it changes */
function setLitho() {
  const ch = chapters[current];
  const key: LithoKey = explicit?.key ?? (ch?.id === 'features' ? world.litho.order[Math.max(0, detent)] : LITHO[ch?.id ?? ''] ?? 'greet');
  if (key !== world.litho.key) { world.litho.key = key; world.litho.version++; }
}

function nearestTarget(x: number, y: number) {
  let best: Target | null = null, bd = MAGNET_R;
  for (const t of targets) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/** Where she rests on a target: on it, or tangent to the line on her side when it sits on the line or beyond */
function restingSpot(t: { x: number; y: number }) {
  const hit = line.probe(t.x, t.y);
  const gap = body.r + 4;
  if (hit && hit.d < gap) return { x: hit.x + hit.nx * gap, y: hit.y + hit.ny * gap };
  return { x: t.x, y: t.y };
}

function markOver(el: HTMLElement | null, kind?: string) {
  if (el === overEl) return;
  overEl?.removeAttribute('data-orb-over');
  overEl = el;
  el?.setAttribute('data-orb-over', '');
  const over = kind ?? '';
  if (over !== written.over) { written.over = over; if (over) root.dataset.over = over; else delete root.dataset.over; }
}

function chapterAt(y: number) {
  let i = 0;
  for (let k = 0; k < chapters.length; k++) if (chapters[k].top <= y) i = k;
  return i;
}

function placed(el: HTMLElement, via: 'drag' | 'api') {
  restChapter = chapterAt(body.target?.y ?? body.y);
  emit('orb:placed', { target: el, via });
  sound.play('tink');
  const point = el.getAttribute('data-point');
  if (point) {
    const meta = content.chapters.find((c) => c.point === point);
    status(`Placed on point ${point}${meta ? `: ${meta.title}` : ''}`);
  }
}

function sendHome() {
  restChapter = -1;
  world.mark.shown = false;
  markOver(null);
  body.goHome();
}

/* ---------- Her voice on the line ---------- */

function voiceTrace(t: number, viewTop: number, go: boolean) {
  if (!go || !line.ready) return;
  const sBar = line.sAt(viewTop + barH), sEnd = line.sAt(viewTop + vh), sOrb = body.foot?.s ?? sEnd;
  const state = voice.state, level = voice.level;
  if (state !== trace.state) {
    if (state === 'thinking') trace.think = [t, t + 0.6, t + 1.2];
    trace.state = state;
    trace.idle = t;
  }
  // Three slow blips while she thinks
  while (trace.think.length && trace.think[0] <= t) { trace.think.shift(); line.pulse(sBar, sOrb, 200, 5); }
  // The phone ringing: two plucked bursts from the bar
  while (trace.ring.length && trace.ring[0] <= t) { trace.ring.shift(); line.pulse(sBar, sEnd, 600, 7, 'burst', 9); }
  if (state === 'idle') {
    if (t - trace.idle >= 8) { trace.idle = t; line.pulse(sBar, sEnd, 420, 5); }
  } else if (state === 'connecting') {
    if (t - trace.beat >= 0.25) { trace.beat = t; line.pulse(sBar, sOrb, 600, 3, 'dash', 8); }
  } else if (state === 'listening') {
    if (level > 0.08 && t - trace.beat >= 0.12) { trace.beat = t; line.pulse(sBar, sOrb, 420, 3 + 6 * level); }
  } else if (state === 'speaking') {
    if (level > 0.1 && t - trace.beat >= 0.16) { trace.beat = t; line.pulse(sOrb, sBar, 420, 3 + 7 * level); }
  }
}

/* ---------- Writes ---------- */

function write() {
  if (!ready) return;
  const r = body.r, s = 1 + 0.04 * body.z;
  const x = body.x, y = body.y + body.fall;
  const tx = Math.round((x - r + mainX - baseX) * 100) / 100, ty = Math.round((y - r + mainY - baseY) * 100) / 100;
  let moved = false;
  if (tx !== written.tx || ty !== written.ty || Math.abs(s - written.s) > 1e-4) {
    Object.assign(written, { tx, ty, s });
    root.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s.toFixed(4)})`;
    moved = true;
  }
  if (Math.abs(2 * r - written.orb) > 0.05 || !Number.isFinite(written.orb)) {
    written.orb = 2 * r;
    root.style.setProperty('--orb', `${(2 * r).toFixed(2)}px`);
    moved = true;
  }
  // Her centre and radius in viewport px, for anything the page keeps in register with her
  const ox = x + mainX - scrollX, oy = y + mainY - scrollY;
  const vars = `${ox.toFixed(0)}|${oy.toFixed(0)}|${(r * s).toFixed(0)}`;
  if (orbVars && vars !== written.vars) {
    written.vars = vars;
    const rs = document.documentElement.style;
    rs.setProperty('--ox', `${ox.toFixed(0)}px`);
    rs.setProperty('--oy', `${oy.toFixed(0)}px`);
    rs.setProperty('--or', `${(r * s).toFixed(0)}px`);
  }
  const near = world.near || body.mode === 'carry' ? 'true' : '';
  if (near !== written.near) { written.near = near; if (near) root.dataset.near = near; else delete root.dataset.near; }
  line.draw({ top: scrollY - mainY, bottom: scrollY - mainY + vh, now: now(), smooth: smooth(), body, played: played() });
  // Reduced motion or Pause: the stage draws only on demand
  if (moved && !smooth()) stage()?.still();
}

/* ---------- Gestures ---------- */

function onLongPress(e: Event) {
  const d = (e as CustomEvent<{ clientX: number; clientY: number }>).detail;
  carryPointer = { x: d.clientX, y: d.clientY };
  const p = toWorld(d.clientX, d.clientY);
  body.carry(p.x, p.y);
  restChapter = -1;
  try { navigator.vibrate?.(6); } catch { /* haptics are a nicety */ }
}

function onCarryMove(e: Event) {
  const d = (e as CustomEvent<{ clientX: number; clientY: number }>).detail;
  carryPointer = { x: d.clientX, y: d.clientY };
}

function onDrop(e: Event) {
  const d = (e as CustomEvent<{ clientX: number; clientY: number }>).detail;
  carryPointer = { x: d.clientX, y: d.clientY };
  release();
}

/** Every pointer up: a carry that ended without a drop (pointer cancelled) stays where it is */
function onRelease() {
  if (body.mode === 'carry') { release(); return; }
  // A drag that turned her in the dial settles on the nearest detent and scrolls the page to it
  const input = stage()?.input;
  if (input && chapters[current]?.id === 'features' && Math.abs(input.yaw - yawAtDown) > 0.02) settleDial(nearestDetent(input.yaw, DIAL, 6).index);
}

function release() {
  if (carryPointer) { const p = toWorld(carryPointer.x, carryPointer.y); body.move(p.x, p.y); }
  carryPointer = null;
  const target = body.magnet ? overEl : null;
  const mode = body.drop(smooth());
  markOver(null);
  if (mode === 'placed' && target) placed(target, 'drag');
  else restChapter = chapterAt(body.y);
}

function settleDial(index: number) {
  const input = stage()?.input;
  const ch = chapters[current];
  if (!input || !ch || ch.id !== 'features') return;
  const target = -index * DIAL;
  input.snapYawTo(target + Math.round((input.yaw - target) / (2 * Math.PI)) * 2 * Math.PI, 90, 16);
  if (!smooth()) return;
  // The page follows to that detent's held position (the dial holds each detent for 70 % of its sixth)
  const top = ch.top + mainY, run = ch.el.offsetHeight - vh;
  if (run <= 0) return;
  dialFollow = false;
  const goal = top + ((index + 0.35) / 6) * run;
  void scroll.to(goal, { duration: clamp(Math.abs(goal - scrollY) * 0.45, 500, 1100) / 1000 }).then(() => { dialFollow = true; });
}

function onPointerMove(e: PointerEvent) {
  const r = body.r * (1 + 0.04 * body.z), cx = body.x + mainX - scrollX, cy = body.y + body.fall + mainY - scrollY;
  world.near = e.pointerType !== 'touch' && Math.hypot(e.clientX - cx, e.clientY - cy) <= NEAR * r ? 1 : 0;
  // The call room: dragging her scrubs the call (the page's range input follows and plays from there)
  if (range && root.dataset.grab === 'true' && chapters[current]?.id === 'call') {
    const head = line.playheadAt(0);
    if (head) {
      const y = toWorld(e.clientX, e.clientY).y, frac = clamp((y - head.y0) / (head.y1 - head.y0), 0, 1);
      const min = Number(range.min) || 0, max = Number(range.max) || 100;
      const value = String(min + frac * (max - min));
      if (range.value !== value) {
        range.value = value;
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
}

/** Arrow keys belong to the page's points and the dial here (OrbInput would nod and turn her) */
function onKeyCapture(e: KeyboardEvent) {
  if (e.target !== root || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === '?') {
    e.preventDefault();
    status(document.getElementById('orb-help')?.textContent?.trim() || 'Enter talks. Arrow up and down move between points; left and right turn her; Shift and arrow right pushes her across the line; End shows her mark; Home sets her down; Escape sends her home; L plays the note.');
    return;
  }
  if (e.key === 'Home') { sendHome(); return; }
  // Shift+arrows reach onOrbKey through OrbInput
  if (e.shiftKey) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    api.setPoint(current + (e.key === 'ArrowDown' ? 1 : -1));
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const input = stage()?.input;
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (chapters[current]?.id === 'features') settleDial(clamp(nearestDetent(input.yaw, DIAL, 6).index + dir, 0, 5));
    else input.snapYawTo(input.yaw + dir * TURN, 90, 16);
  }
}

function onOrbKey(e: Event) {
  const { key, shiftKey } = (e as CustomEvent<{ key: string; shiftKey: boolean }>).detail;
  const phone = vw < PHONE;
  if (shiftKey && (key === 'ArrowRight' || (phone && key === 'ArrowDown'))) api.pushAcrossLine();
  else if (key === 'End') api.showMark();
  else if (key === 'Escape') sendHome();
  else if (key.toLowerCase() === 'l') emit('orb:note', { point: chapterMeta(chapters[current]).point });
  else return;
  e.preventDefault();
}

/* ---------- The page's hands ---------- */

export const api: PorcelainApi = {
  showMark() {
    world.mark.shown = true;
    markChapter = current;
    const meta = getNiche('clinics').offer;
    const n = Math.min(meta.cap, meta.issued + meta.held + 1);
    if (n !== world.mark.n) world.mark.n = n;
  },
  setLithophane(key) {
    explicit = { key, chapter: current };
    if (chapters[current]?.id === 'features' && (FEATURES as string[]).includes(key)) {
      const i = world.litho.order.indexOf(key as FeatureKey);
      const input = stage()?.input;
      if (i >= 0 && input && nearestDetent(input.yaw, DIAL, 6).index !== i) {
        const target = -i * DIAL;
        input.snapYawTo(target + Math.round((input.yaw - target) / (2 * Math.PI)) * 2 * Math.PI, 90, 16);
      }
    }
    setLitho();
  },
  setClinicName(name) {
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (clean === world.litho.name) return;
    world.litho.name = clean;
    world.litho.version++;
  },
  setHours(open, close) { sun.setHours(open, close); },
  placeOn(target) {
    if (!(target instanceof HTMLElement) || !ready) return;
    const m = main.getBoundingClientRect(), r = target.getBoundingClientRect();
    const spot = restingSpot({ x: r.left + r.width / 2 - m.left, y: r.top + r.height / 2 - m.top });
    body.placeAt(spot.x, spot.y, smooth());
    placed(target, 'api');
  },
  goHome() { sendHome(); },
  pushAcrossLine() {
    if (!ready || body.mode === 'carry') return;
    const hit = line.probe(body.x, body.y);
    if (!hit) return;
    // Nowhere near the line (the phone cradle): the hand-off still happens, where the line is nearest
    if (hit.d > body.r * 3) {
      emit('line:handoff', { x: hit.x + mainX - scrollX, y: hit.y + mainY - scrollY });
      if (smooth()) line.pluck(hit.s, 8, 2.8 * body.r);
      return;
    }
    restChapter = -1;
    body.push(hit.nx, hit.ny, smooth());
  },
  get point() { return current; },
  setPoint(n) {
    if (!chapters.length) return;
    const i = clamp(Math.round(n), 0, chapters.length - 1), ch = chapters[i];
    const goal = ch.top + mainY - barH;
    void scroll.to(ch.el, { duration: clamp(Math.abs(goal - scrollY) * 0.45, 500, 1100) / 1000, immediate: !smooth() });
    const meta = chapterMeta(ch);
    status(`Point ${meta.point} of ${String(chapters.length).padStart(2, '0')}: ${meta.title}`);
  },
  intro() { if (smooth()) introPending = true; },
};

/** Starts the world once (the scene calls it; a page without WebGL may call it too, for the line and the sundial's CSS still) */
export function startWorld(orbRoot: HTMLElement): World {
  if (started) return world;
  started = true;
  root = orbRoot;
  main = document.querySelector<HTMLElement>('main[data-main]') ?? document.querySelector<HTMLElement>('main') ?? document.body;
  root.style.willChange = 'transform';
  world.mark.n = (() => { const o = getNiche('clinics').offer; return Math.min(o.cap, o.issued + o.held + 1); })();
  body.onHandoff = (x, y) => {
    emit('line:handoff', { x: x + mainX - scrollX, y: y + mainY - scrollY });
    sound.play('pluck');
    try { navigator.vibrate?.(8); } catch { /* haptics are a nicety */ }
  };
  body.onPluck = (s, amp) => { if (smooth()) line.pluck(s, amp, 2.8 * body.r); };
  body.onLand = () => { if (body.foot) line.pluck(body.foot.s, 6, 2.8 * body.r); };

  recompute();
  new ResizeObserver(schedule).observe(main);
  addEventListener('resize', schedule, { passive: true });
  document.fonts?.ready.then(schedule);
  sun.start();
  sun.update();

  root.addEventListener('pointerdown', () => { yawAtDown = stage()?.input.yaw ?? NaN; });
  root.addEventListener('orb:longpress', onLongPress);
  root.addEventListener('orb:carrymove', onCarryMove);
  root.addEventListener('orb:drop', onDrop);
  root.addEventListener('orb:release', onRelease);
  root.addEventListener('orb:key', onOrbKey);
  document.addEventListener('keydown', onKeyCapture, true);
  addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('clinic:time', (e) => {
    const m = e.detail?.minutes;
    timeOverride = typeof m === 'number' && Number.isFinite(m);
    sun.setTime(timeOverride ? (m as number) : null, !!e.detail?.sweep && smooth());
  });
  document.addEventListener('line:ring', () => { const t = now(); trace.ring.push(t, t + 0.35); });
  motion.on(() => { if (!smooth()) body.magnet = null; });

  scheduler.add(tick, 10);
  scheduler.add(write, 90);
  window.amariyaPorcelain = api;
  return world;
}
