// The pearl's hand and paper physics, in CSS px on the page; the scene draws whatever this decides.
// CRADLE  a drag turns her (OrbInput, unchanged) and leans her in the bowl; a throw rolls her up to .5 R and back
// POLISH  a slow circular rub (or holding P) raises the lustre and stamps a mirror patch; it fades over ~20 s
// LIFT    a long press lifts her; she follows the pointer down the lane (auto-scrolling near the edges) and sets into
//         an open recess within 40 px (sheet:fill), or rolls back to the nearest anchor
// SCROLL  she rests in the anchor the sheet is at, then rolls down the lane at the reading line to the next one
// KEYS    Shift+↑/↓ carry, Enter/Space set, Escape put back, J/K PageUp/PageDown jump, Home back to 07:45, P polish
// It also lays the roll trace and drives the live string. Reduced motion or Pause: no lean, inertia, rolling, trace
// or vibration; she moves to her place at once and still turns under the hand (OrbInput's direct mode).
import { Vector3 } from 'three';
import { scheduler } from '../../../scripts/motion/scheduler';
import { scroll } from '../../../scripts/motion/scroll';
import { motion } from '../../../scripts/motion/prefs';
import { voice } from '../../../scripts/voice/bridge';
import { sound } from '../../../scripts/sound';
import { createTrace } from './trace';
import { createString } from './string';
import type { NacreInput } from './pearl-nacre';
import type { OrbFrame } from '../../../scripts/orb/stage';
import type { PearlApi, PearlArriveDetail, SheetFillDetail, OrbStatusDetail } from './types';

/** The root box is 2.6 pearl radii: the pearl plus a 1.3× pad for its shadow and halo */
const PAD = 2.6;
const STEP = 1 / 120;
const BOWL_K = 9, BOWL_C = 2 * 0.7 * Math.sqrt(BOWL_K), FRICTION = 0.9;
const SET_K = 28, SET_C = 2 * Math.sqrt(SET_K);
/** τ of the travel between recesses, and of following the hand while carried */
const GLIDE = 0.2, FOLLOW = 0.04;
/** The reading line, as a share of the viewport height */
const READING = 0.38;
const REACH = 40, EDGE = 80, EDGE_SPEED = 600, LANE_SLACK = 24, THROW_MAX = 1400;
const PHONE = 734;
const SIZES = { hero: [360, 234], lane: [180, 72], footer: [240, 160] } as const;
/** The intro's roll-in: ω 9 rad/s, ζ .7 */
const INTRO_ZW = 0.7 * 9, INTRO_WD = 9 * Math.sqrt(1 - 0.7 * 0.7);
const FACING = new Vector3(0, 0, 1);
const QUIET: readonly number[] = [0, 0, 0];

/* ---------- Pure parts (checked by the scratch test) ---------- */

/** One 120 Hz step of the bowl: spring k 9, ζ .7, rolling friction τ .9 s */
export function bowlStep(x: number, v: number, h: number): [number, number] {
  v += (-BOWL_K * x - BOWL_C * v) * h;
  v *= Math.exp(-h / FRICTION);
  return [x + v * h, v];
}

/** Peak excursion of the bowl per 1 px/s push, so throws can be scaled to the bowl */
export const BOWL_GAIN = (() => {
  let x = 0, v = 1, peak = 0;
  for (let i = 0; i < 720; i++) {
    [x, v] = bowlStep(x, v, STEP);
    peak = Math.max(peak, x);
  }
  return peak;
})();

/** Release velocity (px/s) → push into the bowl: a 1400 px/s throw rolls her .5 R up the side and back */
export function throwPush(vx: number, vy: number, radius: number): [number, number] {
  const speed = Math.hypot(vx, vy);
  if (!speed) return [0, 0];
  const k = (Math.min(speed, THROW_MAX) / THROW_MAX) * (0.5 * radius / BOWL_GAIN) / speed;
  return [vx * k, vy * k];
}

/**
 * The scroll at which each anchor becomes the sheet's: when its top meets the reading line. The last anchors can never
 * rise to 38 %, so over the last screen of scroll the line drifts down to where the last one sits at the very end.
 */
export function activations(tops: readonly number[], line: number, maxScroll: number, screen: number): number[] {
  const end = Math.max(line, (tops[tops.length - 1] ?? 0) - maxScroll);
  const s0 = Math.max(0, maxScroll - screen), span = maxScroll - s0;
  const k = span > 0 ? (end - line) / span : 0;
  return tops.map((top) => (top - line <= s0 ? top - line : (top - line + k * s0) / (1 + k)));
}

/** The anchor the sheet is at: the last one whose activation has passed (the first before any) */
export function activeAnchor(acts: readonly number[], y: number): number {
  let a = 0;
  for (let i = 1; i < acts.length; i++) if (acts[i] <= y) a = i;
  return a;
}

/** A recess in viewport px: centre, top and the pearl's box there */
export interface Spot { x: number; y: number; top: number; size: number }

/**
 * Where she rests while reading. In anchor a until its centre rises past her pin line (the reading line, or higher
 * for an anchor that starts above it); then she stays on the line and rolls over the moving paper toward b, arriving
 * on b's activation line just as b becomes the sheet's anchor. Bound for a bigger setting (the close's), she keeps
 * her lane size and place until it is within half its size of the line: grown on the way, she sat on the text beside
 * the lane (a phone's questions and closing lines) for a whole screen of scroll.
 */
export function restingPoint(a: Spot, b: Spot | null, pin: number, line: number): { x: number; y: number; size: number } {
  if (!b || a.y >= pin) return { x: a.x, y: a.y, size: a.size };
  const gone = pin - a.y, left = Math.max(0, b.top - line);
  const u = gone / (gone + left);
  const g = b.size > a.size ? Math.min(u, Math.max(0, 1 - left / (b.size / 2))) : u;
  return { x: a.x + (b.x - a.x) * g, y: pin + (line - pin) * u, size: a.size + (b.size - a.size) * g };
}

export interface Sample { x: number; y: number; t: number }

/** A slow circular rub: ≥ 400 ms inside a .3 R circle at ≤ 2 R/s, sweeping at least 126° around its centre */
export function isRub(s: readonly Sample[], radius: number): boolean {
  const n = s.length;
  if (n < 6 || s[n - 1].t - s[0].t < 400) return false;
  let cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of s) {
    cx += p.x;
    cy += p.y;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  cx /= n;
  cy /= n;
  let path = 0, swept = 0;
  for (let i = 1; i < n; i++) {
    const p = s[i], q = s[i - 1];
    path += Math.hypot(p.x - q.x, p.y - q.y);
    let da = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx);
    da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
    swept += da;
  }
  // The rub's radius from its extent (a centroid underestimates a partial arc)
  const extent = Math.max(x1 - x0, y1 - y0) / 2;
  const speed = path / ((s[n - 1].t - s[0].t) / 1000);
  return extent <= 0.3 * radius && extent >= 0.03 * radius && speed <= 2 * radius && speed >= 0.1 * radius && Math.abs(swept) >= 2.2;
}

/** Client px → an svg's user units, or null while it has no usable size */
function toUser(svg: SVGSVGElement | null) {
  const m = svg?.getScreenCTM()?.inverse();
  return m && Number.isFinite(m.a + m.b + m.c + m.d + m.e + m.f) ? m : null;
}

/** Distance from a point to a rectangle (0 inside) */
const gap = (x: number, y: number, l: number, t: number, r: number, b: number) => Math.hypot(Math.max(l - x, 0, x - r), Math.max(t - y, 0, y - b));

/* ---------- The pearl on the page ---------- */

interface Slot {
  el: HTMLElement;
  id: string;
  time: string;
  anchor: boolean;
  /** Inside a position: sticky ancestor (the pinned 07:45 row): read live, and the paper does not move under her */
  sticky: boolean;
  /** The pearl's box here */
  size: number;
  /** Document px */
  l: number; t: number; r: number; b: number;
}

type Mode = 'home' | 'held' | 'carry' | 'keys';
type Travel = 'glide' | 'follow' | 'set' | 'roll';

export interface PearlPhysics {
  readonly api: PearlApi;
  /** The orb's state as the stage last drew it (drives the string and the rock, a frame later) */
  sync(f: OrbFrame): void;
  /** This frame's state for the scene (the rolling is handed over once) */
  frame(): NacreInput;
  dispose(): void;
}

export function createPhysics(root: HTMLElement): PearlPhysics {
  const trace = createTrace();
  const string = createString();
  const dock = document.querySelector<HTMLElement>('[data-dock]');
  const still = root.querySelector<HTMLElement>('.orb-fallback');
  const docEl = document.documentElement;

  let slots: Slot[] = [], anchors: Slot[] = [], acts: number[] = [];
  let measured = false, vh = innerHeight, line = vh * READING, phone = innerWidth <= PHONE, maxScroll = 0;

  let mode: Mode = 'home', travel: Travel = 'glide';
  /** The element she is held in or carried to (held, keys), its box, and the anchor the sheet was at then */
  let target: HTMLElement | null = null, targetSize = 0, targetAnchor = 0, targetSerial = 0, keyLift = true;
  /** lift() with no target: the document point she hangs over */
  let liftAt: { x: number; y: number } | null = null;
  let pending: { el: HTMLElement; fill: boolean; resolve: () => void } | null = null;
  let revealing = false;

  // Drawn state: centre (viewport px), box size, the translate and --orb written
  let started = false, lastKey = 'start', px = 0, py = 0, size = 0, radius = 1, lastSy = scroll.y;
  let curX = 0, curY = 0, curSize = 0, varsKey = '';
  // Travel offset T and bowl lean L (P = H + T + L), with velocities
  let tx = 0, ty = 0, tvx = 0, tvy = 0, lx = 0, ly = 0, lvx = 0, lvy = 0;
  let kick: { at: number; x: number; y: number; d0: number } | null = null;
  let introAt = 0, introFrom = 0;
  // The hand
  let dragging = false, pid = -1, downX = 0, downY = 0, mx = 0, my = 0, lastMove = 0, vx = 0, vy = 0, leanX = 0, leanY = 0;
  let hovering = false, cursorX = 0, cursorY = 0;
  let pointerX = 0, pointerY = 0, grabX = 0, grabY = 0;
  // Polish
  const samples: Sample[] = [];
  const rub = new Vector3(0, 0, 1);
  let rubUntil = 0, pHeld = false, stamp = false, lustre = 0, drawnLustre = 0;
  let patchNow: Vector3 | null = null;
  // The orb's state (from the stage) and the set's dip
  const orb = { listen: 0, speak: 0, connect: 0, think: 0, amp: 0 };
  let carry = 0, dip = 0, dipStart = 0, dipPending = false;
  // Rolling handed to the scene, and the trace's last point (paper px)
  let rollX = 0, rollY = 0, traceX = NaN, traceY = NaN;
  let current: string | null = null;
  const arrivals = new Set<(slot: string) => void>();
  let reached = new Set<HTMLElement>();
  const out: NacreInput = { radius: 1, lift: 0, carry: 0, lustre: 0, patch: null, rollX: 0, rollY: 0 };

  /* ----- Recesses, cached in document px and re-measured when the page changes size ----- */

  function stickyIn(el: HTMLElement) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'sticky') return true;
    return false;
  }

  function sizeOf(el: HTMLElement, role: keyof typeof SIZES) {
    const custom = parseFloat(getComputedStyle(el).getPropertyValue('--slot-orb'));
    return custom > 0 ? custom : SIZES[role][phone ? 1 : 0];
  }

  function measure() {
    measured = true;
    vh = innerHeight;
    line = vh * READING;
    phone = innerWidth <= PHONE;
    maxScroll = Math.max(0, docEl.scrollHeight - vh);
    const y = scroll.y;
    const els = [...document.querySelectorAll<HTMLElement>('[data-slot]')];
    const first = els.find((el) => el.hasAttribute('data-anchor'));
    slots = els.map((el) => {
      const r = el.getBoundingClientRect();
      const role = el === first || el.closest('#welcome') ? 'hero' : el.closest('footer, #close') ? 'footer' : 'lane';
      return {
        el, id: el.dataset.slot || el.id, time: el.dataset.time ?? '', anchor: el.hasAttribute('data-anchor'), sticky: stickyIn(el),
        size: sizeOf(el, role), l: r.left, t: r.top + y, r: r.right, b: r.bottom + y,
      };
    });
    anchors = slots.filter((s) => s.anchor);
    acts = activations(anchors.map((s) => s.t), line, maxScroll, vh);
    // The target may have moved: keep her drawn where she is and glide to the new place
    if (lastKey !== 'start') lastKey = 'measured';
  }
  const invalidate = () => { measured = false; };

  function spotOf(s: Slot): Spot {
    if (s.sticky) {
      const r = s.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, size: s.size };
    }
    const sy = scroll.y;
    return { x: (s.l + s.r) / 2, y: (s.t + s.b) / 2 - sy, top: s.t - sy, size: s.size };
  }

  const slotOf = (el: HTMLElement) => slots.find((s) => s.el === el);
  const idOf = (el: HTMLElement) => el.dataset.slot || el.id;

  /** The lane's centre near a document y: the nearest recess's centre */
  function laneX(docY: number) {
    let best = px, bd = Infinity;
    for (const s of slots) {
      const d = Math.abs((s.t + s.b) / 2 - docY);
      if (d < bd) { bd = d; best = (s.l + s.r) / 2; }
    }
    return best;
  }

  /* ----- Modes ----- */

  function arrive(id: string) {
    if (!id || id === current) return;
    current = id;
    document.dispatchEvent(new CustomEvent<PearlArriveDetail>('pearl:arrive', { detail: { slot: id } }));
    arrivals.forEach((cb) => { try { cb(id); } catch (err) { console.error(err); } });
  }

  function status(text: string) {
    root.dispatchEvent(new CustomEvent<OrbStatusDetail>('orb:status', { bubbles: true, detail: { text } }));
  }

  function settlePending() {
    const p = pending;
    pending = null;
    p?.resolve();
  }

  function leaveKeys() {
    if (mode === 'keys') delete root.dataset.carry;
  }

  function goHome(kind: Travel) {
    settlePending();
    leaveKeys();
    mode = 'home';
    target = null;
    liftAt = null;
    travel = kind;
  }

  function hold(el: HTMLElement, kind: Travel) {
    settlePending();
    leaveKeys();
    mode = 'held';
    target = el;
    targetSize = slotOf(el)?.size ?? sizeOf(el, 'lane');
    targetAnchor = anchors.length ? activeAnchor(acts, scroll.y) : -1;
    targetSerial++;
    liftAt = null;
    travel = kind;
  }

  /** Carried by the keys or the page (carryTo, setSlot, lift): lifted unless placing quietly */
  function takeTo(el: HTMLElement | null, lifted: boolean) {
    settlePending();
    mode = 'keys';
    target = el;
    targetSize = el ? slotOf(el)?.size ?? sizeOf(el, 'lane') : size;
    targetSerial++;
    keyLift = lifted;
    travel = 'glide';
    if (lifted) {
      root.dataset.carry = 'true';
      sound.play('hush');
    } else {
      delete root.dataset.carry;
    }
    if (el) reveal(el);
  }

  /** Scrolls a target to the reading line when it is out of comfortable view */
  function reveal(el: HTMLElement) {
    const r = el.getBoundingClientRect(), cy = r.top + r.height / 2;
    if (cy > EDGE + radius && cy < vh - EDGE - radius) return;
    revealing = true;
    void scroll.to(cy + scroll.y - line, { duration: 0.9 }).then(() => { revealing = false; });
  }

  /** Sets her into a recess: the set spring, a 6 px dip and a tink; an open gap is filled */
  function set(el: HTMLElement, byVisitor: boolean, fill = true) {
    hold(el, 'set');
    dipPending = true;
    const id = idOf(el), time = el.dataset.time ?? '';
    if (fill && el.hasAttribute('data-slot') && el.hasAttribute('data-open')) {
      document.dispatchEvent(new CustomEvent<SheetFillDetail>('sheet:fill', { detail: { slot: id, time } }));
      if (byVisitor && time) voice.contextUpdate(`The visitor dropped Amariya into the ${time} gap`);
    }
    arrive(id);
  }

  /** Elsewhere: she rolls back, with friction, to the nearest anchor */
  function rollBack() {
    const y = py + scroll.y;
    let best: Slot | null = null, bd = Infinity;
    for (const s of anchors) {
      const d = Math.hypot((s.l + s.r) / 2 - px, (s.t + s.b) / 2 - y);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best || best === anchors[activeAnchor(acts, scroll.y)]) return goHome('roll');
    hold(best.el, 'roll');
    arrive(best.id);
  }

  /** Where the hand is taking her while carried (viewport px): along the lane, x within ±24 px of its centre */
  function carried(clientX: number, clientY: number) {
    const lane = laneX(clientY - grabY + scroll.y);
    return [Math.max(lane - LANE_SLACK, Math.min(lane + LANE_SLACK, clientX - grabX)), clientY - grabY] as const;
  }

  /** Let go (at x, y in viewport px; where she is by default): into an open recess within 40 px, or back */
  function dropHere(byVisitor: boolean, x = px, vy = py) {
    const y = vy + scroll.y;
    let best: Slot | null = null, bd = REACH;
    for (const s of slots) {
      if (!s.el.hasAttribute('data-open')) continue;
      const d = gap(x, y, s.l, s.t, s.r, s.b);
      if (d <= bd) { bd = d; best = s; }
    }
    if (best) set(best.el, byVisitor);
    else rollBack();
  }

  /* ----- Keys ----- */

  function keyStep(dir: 1 | -1) {
    if (!measured) measure();
    if (!slots.length) return;
    const at = target ? slots.findIndex((s) => s.el === target) : -1;
    let i: number;
    if (mode === 'keys' && at >= 0) {
      i = Math.max(0, Math.min(slots.length - 1, at + dir));
    } else {
      const y = py + scroll.y;
      i = -1;
      if (dir > 0) i = slots.findIndex((s) => (s.t + s.b) / 2 > y + 4);
      else for (let k = slots.length - 1; k >= 0; k--) if ((slots[k].t + slots[k].b) / 2 < y - 4) { i = k; break; }
      if (i < 0) i = dir > 0 ? slots.length - 1 : 0;
    }
    const s = slots[i];
    takeTo(s.el, true);
    status(`Slot ${s.time || s.id}, ${s.el.hasAttribute('data-open') ? 'open, press Enter to hear the call' : 'press Enter to set her here'}`);
  }

  /** J/K, PageDown/PageUp: the next entry, or the start of this one (then the one before) */
  function jump(dir: 1 | -1) {
    if (!anchors.length) return;
    const y = scroll.y;
    let i = -1;
    if (dir > 0) i = acts.findIndex((a) => a > y + 2);
    else for (let k = acts.length - 1; k >= 0; k--) if (acts[k] < y - 40) { i = k; break; }
    if (i >= 0) void scroll.to(Math.max(0, acts[i] + 1), { duration: 0.9 });
  }

  /** Home: back to the first recess, the 07:45 "Now" row (OrbInput resets her pose at the same time) */
  function homeKey() {
    if (mode !== 'home') goHome('glide');
    if (anchors.length && activeAnchor(acts, scroll.y) > 0) void scroll.to(Math.max(0, acts[0] + 1), { duration: 0.9 });
  }

  function putBack() {
    rollBack();
    status('Amariya is back in her place');
  }

  const onKeyCapture = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Home') return homeKey();
    // Enter and Space set her while she is carried, instead of starting a conversation
    if ((e.key === 'Enter' || e.key === ' ') && mode === 'keys' && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (target) set(target, true);
      else dropHere(true);
    }
  };

  const onOrbKey = (e: Event) => {
    const { key, shiftKey } = (e as CustomEvent<{ key: string; shiftKey: boolean }>).detail;
    if (shiftKey && (key === 'ArrowDown' || key === 'ArrowUp')) keyStep(key === 'ArrowDown' ? 1 : -1);
    else if (key === 'Escape' && mode === 'keys') putBack();
    else if (key === 'Escape' && mode === 'carry') {
      // OrbInput ends the carry when it loses the pointer, and she rolls back (orb:release)
      try { root.releasePointerCapture(pid); } catch { /* not captured */ }
    } else if (key === 'j' || key === 'J' || key === 'PageDown') jump(1);
    else if (key === 'k' || key === 'K' || key === 'PageUp') jump(-1);
    else if (key === 'p' || key === 'P') pHeld = true;
    else return;
    e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'p' || e.key === 'P') pHeld = false; };
  const onBlur = () => {
    pHeld = false;
    if (mode === 'keys' && !pending) putBack();
  };

  /* ----- The hand ----- */

  function sample(x: number, y: number, t: number) {
    samples.push({ x, y, t });
    while (samples.length && t - samples[0].t > 1000) samples.shift();
    if (!isRub(samples, radius)) return;
    rubUntil = t + 150;
    // The rubbed point on the pearl, seen from the viewer
    const ux = (x - px) / radius, uy = -(y - py) / radius, l = Math.hypot(ux, uy), k = l > 0.98 ? 0.98 / l : 1;
    rub.set(ux * k, uy * k, Math.sqrt(Math.max(0, 1 - (ux * k) ** 2 - (uy * k) ** 2)));
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || mode === 'carry') return;
    if (mode === 'keys' && !pending) rollBack();
    dragging = true;
    pid = e.pointerId;
    downX = mx = e.clientX;
    downY = my = e.clientY;
    lastMove = e.timeStamp;
    vx = vy = leanX = leanY = 0;
  };

  const onMove = (e: PointerEvent) => {
    cursorX = e.clientX;
    cursorY = e.clientY;
    if (mode !== 'carry') sample(e.clientX, e.clientY, e.timeStamp);
    if (!dragging || e.pointerId !== pid) return;
    // The bowl: she leans toward the drag, min(.25 R, .3 × the drag)
    const dx = e.clientX - downX, dy = e.clientY - downY, d = Math.hypot(dx, dy);
    const k = d ? Math.min(0.25 * radius, 0.3 * d) / d : 0;
    leanX = dx * k;
    leanY = dy * k;
    const h = Math.max(1e-3, (e.timeStamp - lastMove) / 1000);
    vx += ((e.clientX - mx) / h - vx) * 0.5;
    vy += ((e.clientY - my) / h - vy) * 0.5;
    mx = e.clientX;
    my = e.clientY;
    lastMove = e.timeStamp;
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    leanX = leanY = 0;
    // A throw older than 120 ms has stopped
    if (e.type === 'pointerup' && e.timeStamp - lastMove <= 120 && motion.allowed) {
      const [kx, ky] = throwPush(vx, vy, radius);
      lvx += kx;
      lvy += ky;
    }
  };

  const onEnter = () => { hovering = true; };
  const onLeave = () => { hovering = false; samples.length = 0; };

  const onLongPress = (e: Event) => {
    const { clientX, clientY } = (e as CustomEvent<{ clientX: number; clientY: number }>).detail;
    settlePending();
    leaveKeys();
    dragging = false;
    leanX = leanY = 0;
    mode = 'carry';
    target = null;
    liftAt = null;
    travel = 'follow';
    pointerX = clientX;
    pointerY = clientY;
    grabX = clientX - px;
    grabY = clientY - py;
    sound.play('hush');
  };
  const onCarryMove = (e: Event) => {
    const { clientX, clientY } = (e as CustomEvent<{ clientX: number; clientY: number }>).detail;
    pointerX = clientX;
    pointerY = clientY;
  };
  // Judged where the hand let go, not where the 40 ms follow has drawn her so far
  const onDrop = (e: Event) => {
    if (mode !== 'carry') return;
    const { clientX, clientY } = (e as CustomEvent<{ clientX: number; clientY: number }>).detail;
    dropHere(true, ...carried(clientX, clientY));
  };
  const onRelease = () => { if (mode === 'carry') rollBack(); };

  /* ----- Every frame (scheduler order 10: reads first, then writes) ----- */

  function integrate(dt: number) {
    const near = hovering && !dragging && mode !== 'carry';
    // Hovering tilts the bowl .02 R toward the cursor
    const cx = cursorX - px, cy = cursorY - py, cl = Math.hypot(cx, cy);
    const restX = near && cl ? (cx / cl) * 0.02 * radius : 0, restY = near && cl ? (cy / cl) * 0.02 * radius : 0;
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      left -= h;
      if (travel === 'glide' || travel === 'follow') {
        const tau = travel === 'glide' ? GLIDE : FOLLOW, k = 1 - Math.exp(-h / tau);
        tvx = -tx / tau;
        tvy = -ty / tau;
        tx -= tx * k;
        ty -= ty * k;
      } else if (travel === 'set') {
        tvx += (-SET_K * tx - SET_C * tvx) * h;
        tvy += (-SET_K * ty - SET_C * tvy) * h;
        tx += tvx * h;
        ty += tvy * h;
      } else {
        [tx, tvx] = bowlStep(tx, tvx, h);
        [ty, tvy] = bowlStep(ty, tvy, h);
      }
      if (dragging) {
        const k = 1 - Math.exp(-h / 0.03), nx = lx + (leanX - lx) * k, ny = ly + (leanY - ly) * k;
        lvx = (nx - lx) / h;
        lvy = (ny - ly) / h;
        lx = nx;
        ly = ny;
      } else {
        let x: number;
        [x, lvx] = bowlStep(lx - restX, lvx, h);
        lx = x + restX;
        [x, lvy] = bowlStep(ly - restY, lvy, h);
        ly = x + restY;
      }
    }
    // The bowl's rim
    const lr = Math.hypot(lx, ly), rim = 0.55 * radius;
    if (lr > rim) {
      lx *= rim / lr;
      ly *= rim / lr;
      const out = (lvx * lx + lvy * ly) / (rim * rim);
      if (out > 0) { lvx -= out * lx; lvy -= out * ly; }
    }
    // Arriving from a glide, she rocks once in the new recess's bowl
    if (kick && Math.hypot(tx, ty) <= kick.at) {
      const push = Math.min(0.06 * radius, 0.1 * kick.d0) / BOWL_GAIN;
      lvx += kick.x * push;
      lvy += kick.y * push;
      kick = null;
    }
  }

  const job = (now: number, dt: number) => {
    if (!measured) measure();
    const allowed = motion.allowed;

    // Reads
    const box = root.getBoundingClientRect();
    if (!box.width) return;
    const bx = box.left + box.width / 2 - curX, by = box.top + box.height / 2 - curY;
    if (!started) {
      started = true;
      px = box.left + box.width / 2;
      py = box.top + box.height / 2;
      size = curSize = box.width;
      radius = size / PAD;
    }
    const sy = scroll.y;
    const a = anchors.length ? activeAnchor(acts, sy) : -1;
    let rect = target && (mode === 'held' || mode === 'keys') ? target.getBoundingClientRect() : null;
    // A hold lasts until the reader moves on to another anchor or the recess leaves the screen
    if (mode === 'held' && rect && (a !== targetAnchor || rect.bottom < -radius || rect.top > vh + radius)) {
      goHome('glide');
      rect = null;
    }
    const dockTop = dock ? dock.getBoundingClientRect().top || vh : vh;
    const lineInv = toUser(string.svg);
    const traceInv = trace.svg === string.svg ? lineInv : toUser(trace.svg);

    // Where she belongs this frame (H) and the box there
    let hx = bx, hy = by, hs = size, key = 'page', paperStill = false;
    if (mode === 'carry') {
      [hx, hy] = carried(pointerX, pointerY);
      key = 'carry';
    } else if (rect) {
      hx = rect.left + rect.width / 2;
      hy = rect.top + rect.height / 2;
      hs = targetSize;
      key = `t${targetSerial}`;
      paperStill = !!(target && slotOf(target)?.sticky);
    } else if (mode === 'keys') {
      liftAt ??= { x: px, y: py + sy };
      hx = liftAt.x;
      hy = liftAt.y - sy;
      key = 'lift';
    } else if (a >= 0) {
      const A = anchors[a], B = anchors[a + 1], sa = spotOf(A);
      // Her pin line: the line A became the sheet's anchor on (or A's own centre, if it starts higher on the screen)
      const pin = Math.min(A.t - acts[a], (A.t + A.b) / 2 - Math.max(0, acts[a]));
      const rest = restingPoint(sa, B && sa.y < pin ? spotOf(B) : null, pin, B ? B.t - acts[a + 1] : 0);
      hx = rest.x;
      hy = rest.y;
      hs = rest.size;
      key = `a${a}`;
      // Resting in the pinned 07:45 row: the paper there is not moving under her
      paperStill = A.sticky && sa.y >= pin;
    }

    // Keep her drawn where she is when her place changes, and travel from there
    if (key !== lastKey) {
      if (lastKey === 'start' && allowed && a === 0 && mode === 'home' && sy < 8 && performance.now() < 6000) {
        // The intro: she rolls in from the left along the 07:45 row and settles into her cradle
        introAt = now;
        introFrom = -Math.min(320, hx + radius * 1.4);
        tx = ty = tvx = tvy = 0;
        if (still) { still.style.transition = 'none'; still.style.opacity = '0'; }
      } else if (allowed) {
        // Moving on to the next anchor is always a glide, whatever brought her home
        if (mode === 'home' && lastKey[0] === 'a') travel = 'glide';
        tx = px - lx - hx;
        ty = py - ly - hy;
        const d0 = Math.hypot(tx, ty);
        kick = travel === 'glide' && d0 > 6 ? { at: 0.2 * d0, x: -tx / d0, y: -ty / d0, d0 } : null;
      } else {
        trace.lift();
      }
      lastKey = key;
    }

    // Physics (none under reduced motion or Pause: she is simply in her place)
    let rock = 0;
    if (allowed) {
      integrate(dt);
      // Thinking: a 3 px rock at 1.2 Hz
      rock = 3 * orb.think * Math.sin(2 * Math.PI * 1.2 * (now / 1000));
    } else {
      tx = ty = tvx = tvy = lx = ly = lvx = lvy = 0;
      kick = null;
    }
    // ponytail: the intro is a damped curve on the real clock (ω 9, ζ .7: one soft overshoot, settled in 1 s), not
    // the k 9 bowl, so it lands inside the 1.5 s intro at any frame rate; the bowl takes over afterwards
    const introT = introAt ? (now - introAt) / 1000 : 1;
    const intro = allowed && introT < 1 ? introFrom * Math.exp(-INTRO_ZW * introT) * (Math.cos(INTRO_WD * introT) + (INTRO_ZW / INTRO_WD) * Math.sin(INTRO_WD * introT)) : 0;
    if (introAt && (introT >= 1 || !allowed)) {
      introAt = 0;
      if (still) still.style.transition = still.style.opacity = '';
    }
    size += (hs - size) * (allowed ? 1 - Math.exp(-dt / GLIDE) : 1);
    radius = size / PAD;
    carry += ((mode === 'carry' || (mode === 'keys' && keyLift) ? 1 : 0) - carry) * (allowed ? 1 - Math.exp(-dt / 0.12) : 1);

    // A set: the dip into the paper (and the tink) as she arrives
    if (dipPending && (!allowed || Math.hypot(tx, ty) < 4)) {
      dipPending = false;
      sound.play('tink');
      if (allowed) dipStart = now;
    }
    const dipAge = dipStart ? (now - dipStart) / 320 : 1;
    dip = dipAge < 1 ? -6 * Math.sin(Math.PI * dipAge) : 0;
    if (dipAge >= 1) dipStart = 0;

    // Carried to the edge of the screen: the sheet scrolls under her
    if (mode === 'carry') {
      const depth = pointerY < EDGE ? -(1 - pointerY / EDGE) : pointerY > vh - EDGE ? 1 - (vh - pointerY) / EDGE : 0;
      if (depth) void scroll.to(Math.max(0, Math.min(maxScroll, sy + Math.max(-1, Math.min(1, depth)) * EDGE_SPEED * dt)), { immediate: true });
    }
    // carryTo / setSlot finish once she has arrived and the sheet has stopped
    if (pending && mode === 'keys' && !revealing && Math.hypot(tx, ty) < 2) {
      const { el, fill } = pending;
      if (fill) set(el, false);
      else { hold(el, 'set'); arrive(idOf(el)); }
    }

    // Polish: a rub or P ramps the lustre over 600 ms; it fades with τ 8 s once the hand leaves
    const polishing = now < rubUntil || pHeld;
    patchNow = polishing ? (pHeld ? FACING : rub) : stamp ? FACING : null;
    stamp = false;
    if (polishing) lustre = Math.min(1, lustre + dt / 0.6);
    else if (allowed) lustre *= Math.exp(-dt / 8);

    const nx = hx + tx + lx + rock + intro, ny = hy + ty + ly;
    if (allowed) {
      // She rolls without slipping over the paper (which moves with the page, except in the pinned row)
      const dx = nx - px, dy = ny - py + (paperStill ? 0 : sy - lastSy);
      if (Math.hypot(dx, dy) > 0.01) {
        rollX += dx;
        rollY += dy;
        const r = Math.hypot(rollX, rollY), cap = 4 * radius;
        if (r > cap) { rollX *= cap / r; rollY *= cap / r; }
      }
      // The trace on the paper, a point every 1.5 px
      const paperY = ny + (paperStill ? 0 : sy);
      if (traceInv && !(Math.hypot(nx - traceX, paperY - traceY) < 1.5)) {
        trace.add(nx, ny, now, traceInv);
        traceX = nx;
        traceY = paperY;
      }
    } else {
      trace.lift();
      traceX = NaN;
    }

    // Writes
    const ox = nx - bx, oy = ny - by;
    let moved = false;
    if (Math.abs(ox - curX) > 0.01 || Math.abs(oy - curY) > 0.01) {
      root.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0)`;
      curX = ox;
      curY = oy;
      moved = true;
    }
    const whole = Math.round(size);
    // Without recesses the page's own --orb stays in charge
    if (whole !== curSize && (anchors.length > 0 || target)) {
      root.style.setProperty('--orb', `${whole}px`);
      curSize = whole;
      moved = true;
    }
    const vars = `${Math.round(nx)} ${Math.round(ny)} ${Math.round(radius)}`;
    if (vars !== varsKey) {
      varsKey = vars;
      // Not inherited (dental.css registers them), so these :root writes restyle :root alone
      docEl.style.setProperty('--ox', `${Math.round(nx)}px`);
      docEl.style.setProperty('--oy', `${Math.round(ny)}px`);
      docEl.style.setProperty('--or', `${Math.round(radius)}px`);
    }
    if (traceInv && trace.busy) trace.hole(nx, ny, radius * 0.98, traceInv);
    if (lineInv) {
      // During a call: speaking plays three modes with her voice, listening one standing wave with the visitor's
      const { listen, speak, connect, think, amp } = orb;
      const live = allowed && listen + speak + connect + think > 0.02;
      const modes = live ? [amp * (6 * speak + 3 * listen), 2.5 * amp * speak, amp * speak] : QUIET;
      string.update(allowed ? dt : Infinity, now / 1000, nx, ny + radius + 1, dockTop - 1, lineInv, live, modes);
    }
    // Open recesses within reach of a carried pearl
    const reach = new Set<HTMLElement>();
    if (mode === 'carry' || (mode === 'keys' && keyLift)) {
      for (const s of slots) if (s.el.hasAttribute('data-open') && gap(nx, ny + sy, s.l, s.t, s.r, s.b) <= REACH) reach.add(s.el);
    }
    reached.forEach((el) => { if (!reach.has(el)) el.removeAttribute('data-reach'); });
    reach.forEach((el) => { if (!reached.has(el)) el.setAttribute('data-reach', ''); });
    reached = reach;

    if (mode === 'home' && a >= 0) arrive(anchors[a].id);

    // Still frames: the stage redraws on scroll itself; anything else that moved her needs one now
    const relit = Math.abs(lustre - drawnLustre) > 0.02 || !!patchNow;
    if (!allowed && ((moved && sy === lastSy) || relit)) {
      drawnLustre = lustre;
      window.amariyaOrb?.still();
    }
    if (allowed) drawnLustre = lustre;
    px = nx;
    py = ny;
    lastSy = sy;
  };

  /* ----- Wiring ----- */

  root.addEventListener('keydown', onKeyCapture, { capture: true });
  root.addEventListener('keyup', onKeyUp);
  root.addEventListener('blur', onBlur);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('lostpointercapture', onUp);
  root.addEventListener('pointerenter', onEnter);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('orb:longpress', onLongPress);
  root.addEventListener('orb:carrymove', onCarryMove);
  root.addEventListener('orb:drop', onDrop);
  root.addEventListener('orb:release', onRelease);
  root.addEventListener('orb:key', onOrbKey);
  const ro = new ResizeObserver(invalidate);
  ro.observe(document.body);
  addEventListener('resize', invalidate, { passive: true });
  void document.fonts?.ready.then(invalidate);
  const removeJob = scheduler.add(job, 10);

  const api: PearlApi = {
    polish(level) {
      lustre = Math.max(0, Math.min(1, level));
      stamp = true;
    },
    get lustre() { return lustre; },
    lift() {
      if (mode === 'carry') return;
      liftAt = { x: px, y: py + scroll.y };
      takeTo(null, true);
    },
    drop() {
      if (mode === 'carry' || mode === 'keys') dropHere(false);
    },
    carryTo(el) {
      return new Promise<void>((resolve) => {
        takeTo(el, true);
        pending = { el, fill: true, resolve };
      });
    },
    setSlot(id) {
      if (!measured) measure();
      const el = slots.find((s) => s.id === id)?.el;
      if (!el) return;
      takeTo(el, false);
      pending = { el, fill: false, resolve: () => {} };
    },
    get currentSlot() { return current; },
    onArrive(cb) {
      arrivals.add(cb);
      return () => { arrivals.delete(cb); };
    },
  };

  return {
    api,
    sync(f) {
      orb.listen = f.listen;
      orb.speak = f.speak;
      orb.connect = f.connect;
      orb.think = f.think;
      orb.amp = f.amp;
    },
    frame() {
      out.radius = radius;
      out.lift = 8 * carry + dip;
      out.carry = carry;
      out.lustre = lustre;
      out.patch = patchNow;
      out.rollX = rollX;
      out.rollY = rollY;
      rollX = rollY = 0;
      return out;
    },
    dispose() {
      removeJob();
      settlePending();
      ro.disconnect();
      removeEventListener('resize', invalidate);
      root.removeEventListener('keydown', onKeyCapture, { capture: true });
      root.removeEventListener('keyup', onKeyUp);
      root.removeEventListener('blur', onBlur);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('lostpointercapture', onUp);
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('orb:longpress', onLongPress);
      root.removeEventListener('orb:carrymove', onCarryMove);
      root.removeEventListener('orb:drop', onDrop);
      root.removeEventListener('orb:release', onRelease);
      root.removeEventListener('orb:key', onOrbKey);
      reached.forEach((el) => el.removeAttribute('data-reach'));
      trace.dispose();
      string.dispose();
      leaveKeys();
      root.style.transform = '';
      root.style.removeProperty('--orb');
      if (still) still.style.transition = still.style.opacity = '';
    },
  };
}
