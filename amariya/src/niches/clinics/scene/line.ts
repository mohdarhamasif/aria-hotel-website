// The Line: one hairline from the top of the page to the sign-off, her side on one side of it, your team's on the other.
// Geometry lives in page coordinates (main's top-left, y down), rebuilt from the chapters' data-split values and markers
// on resize and after fonts load, then written once as <path data-line-base>. Each frame where something moved, the stretch
// on screen is redrawn as <path data-line-live> with her dent, the plucked string and the voice trace.
// Phones (< 734 px) get the switchback: down a 12 px gutter, across the screen at each split, down the other gutter.
import type { Body, LineHit } from './physics';

const STEP = 4;
const BEND = 240;
const LOOP_R = 186;
const CORNER = 24;
const GUTTER = 12;
const WAVE_AMP = 16;
const PHONE = 734;
const TICK = 7;
/** She collides with this sample (the spine, S-bends, the waveform's spine, the footer baseline, the phone crossings) */
const SOLID = 1;
/** The dial bezel (moves with its pinned chapter) */
const LOOP = 2;
/** Drawn by the waveform paths instead of the line */
const WAVE = 4;
const PLUCK = { hz: 7, tau: 0.55 };
const NS = 'http://www.w3.org/2000/svg';

/** One feature of a chapter's run, measured in page px */
type Feature =
  | { kind: 'loop'; y: number; cx: number; cy: number; sticky: HTMLElement | null; ref: HTMLElement }
  | { kind: 'wave'; y: number; y1: number; peaks: number[] }
  | { kind: 'detour'; y: number; y1: number; points: [number, number][]; crossing: number | null }
  | { kind: 'baseline'; y: number; left: number; right: number; top: number; above: number };

interface Pulse { s: number; v: number; amp: number; w: number; born: number; end: number; shape: 'ecg' | 'dash' | 'burst' }
interface Pluck { s: number; amp: number; born: number; span: number }

export interface Frame {
  /** The viewport in page px */
  top: number;
  bottom: number;
  /** Seconds */
  now: number;
  /** Motion allowed: vibration, pulses and the filament */
  smooth: boolean;
  body: Body;
  /** The call room's playhead, 0–1 (null outside the call) */
  played: number | null;
}

let svg: SVGSVGElement | null = null;
const paths: Record<'base' | 'unplayed' | 'played' | 'ticks' | 'filament' | 'live', SVGPathElement | null> = {
  base: null, unplayed: null, played: null, ticks: null, filament: null, live: null,
};
let glow: SVGRadialGradientElement | null = null;

// Samples
let X: number[] = [], Y: number[] = [], NX: number[] = [], NY: number[] = [], S: number[] = [], F: number[] = [];
/** Running max of y from the start and running min of y from the end: both non-decreasing, for binary search by y */
let MAXY: number[] = [], MINY: number[] = [];
let total = 0;
/** The dial bezel's pinned stretch: spine before it, the loop, spine after it, and how far the pin has carried it */
let dyn: { pre: number; loop: number; post: number; end: number; cy: number; dy: number; sticky: HTMLElement; ref: HTMLElement } | null = null;
let waves: { s0: number; s1: number; y0: number; y1: number; xs: number[]; ys: number[] }[] = [];
let width = 0;
let phone = false;

const plucks: Pluck[] = [];
const pulses: Pulse[] = [];
const filament = { on: false, len: 0, p: [] as number[], q: [] as number[] };
let written = '';
let lit = '';
let lastPlayed = -1;

const smootherstep = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * u * (u * (u * 6 - 15) + 10); };

/** The y of sample i, moved with the pinned dial when it is stuck */
function yAt(i: number) {
  const y = Y[i];
  if (!dyn || !dyn.dy || i < dyn.pre || i >= dyn.end) return y;
  const at = dyn.cy + dyn.dy;
  if (i < dyn.loop) return Math.min(y, at);
  if (i < dyn.post) return y + dyn.dy;
  return Math.max(y, at);
}

/* ---------- Building ---------- */

class Builder {
  flags = SOLID;
  /** A fixed normal toward her side (null: to the left of travel) */
  normal: [number, number] | null = null;
  centre: [number, number] | null = null;
  at(x: number, y: number) {
    X.push(x); Y.push(y); F.push(this.flags);
    if (this.centre) { const d = Math.hypot(this.centre[0] - x, this.centre[1] - y) || 1; NX.push((this.centre[0] - x) / d); NY.push((this.centre[1] - y) / d); }
    else if (this.normal) { NX.push(this.normal[0]); NY.push(this.normal[1]); }
    else { NX.push(NaN); NY.push(NaN); }
  }
  get x() { return X[X.length - 1]; }
  get y() { return Y[Y.length - 1]; }
  lineTo(x: number, y: number) {
    const x0 = this.x, y0 = this.y, d = Math.hypot(x - x0, y - y0);
    const n = Math.max(1, Math.ceil(d / STEP));
    if (d < 0.01) return;
    for (let k = 1; k <= n; k++) this.at(x0 + ((x - x0) * k) / n, y0 + ((y - y0) * k) / n);
  }
  /** S-bend between two splits: x follows smootherstep in y, sampled by arc length */
  bendTo(x: number, y: number) {
    const x0 = this.x, y0 = this.y, h = y - y0;
    if (h <= 0.5 || Math.abs(x - x0) < 0.5) return this.lineTo(x, y);
    let v = y0;
    while (v < y) {
      const u = (v - y0) / h, slope = ((x - x0) * 30 * u * u * (1 - u) * (1 - u)) / h;
      v = Math.min(y, v + STEP / Math.sqrt(1 + slope * slope));
      this.at(x0 + (x - x0) * smootherstep((v - y0) / h), v);
    }
  }
  /** A rounded corner at (cx, cy), arriving from the current point; (x, y) only sets the way out. Ends at the corner's exit. */
  cornerTo(cx: number, cy: number, x: number, y: number, r = CORNER) {
    const ax = cx - this.x, ay = cy - this.y, al = Math.hypot(ax, ay);
    const bx = x - cx, by = y - cy, bl = Math.hypot(bx, by) || 1;
    const rr = Math.min(r, al);
    if (rr < 0.5) return;
    this.lineTo(cx - (ax / al) * rr, cy - (ay / al) * rr);
    const p0x = this.x, p0y = this.y, p2x = cx + (bx / bl) * rr, p2y = cy + (by / bl) * rr;
    const n = Math.max(2, Math.ceil((rr * 1.6) / STEP));
    for (let k = 1; k <= n; k++) {
      const t = k / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      this.at(a * p0x + b * cx + c * p2x, a * p0y + b * cy + c * p2y);
    }
  }
  /** Full circle, clockwise on screen, starting and ending at its rightmost point */
  loop(cx: number, cy: number, r: number) {
    const n = Math.ceil((2 * Math.PI * r) / STEP);
    this.centre = [cx, cy];
    for (let k = 1; k <= n; k++) this.at(cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n));
    this.centre = null;
  }
}

interface Chapter { el: HTMLElement; top: number; bottom: number; split: number; anchor: DOMRect | null; features: Feature[]; ticks: number[] }

function parseJson(raw: string | undefined): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function stickyAncestor(el: HTMLElement, stop: Element): HTMLElement | null {
  for (let p: HTMLElement | null = el; p && p !== stop; p = p.parentElement) if (getComputedStyle(p).position === 'sticky') return p;
  return null;
}

/** Reads the chapters and their markers, in page px relative to main */
function measure(main: HTMLElement): Chapter[] {
  const m = main.getBoundingClientRect();
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return new DOMRect(r.left - m.left, r.top - m.top, r.width, r.height); };
  const sections = [...document.querySelectorAll<HTMLElement>('[data-chapter]')];
  return sections.map((el) => {
    const b = box(el);
    const anchorEl = el.querySelector<HTMLElement>('[data-orb-anchor]');
    const a = anchorEl ? box(anchorEl) : null;
    const anchor = a && a.width > 0 && a.height > 0 ? a : null;
    const features: Feature[] = [];
    const loop = el.querySelector<HTMLElement>('[data-line-loop]');
    if (loop) {
      const ref = anchorEl && anchor ? anchorEl : loop;
      const c = box(ref);
      features.push({ kind: 'loop', y: c.y + c.height / 2, cx: c.x + c.width / 2, cy: c.y + c.height / 2, sticky: stickyAncestor(ref, main), ref });
    }
    const wave = el.querySelector<HTMLElement>('[data-line-wave]:not(path)');
    if (wave) {
      const w = box(wave), raw = parseJson(wave.dataset.peaks);
      const peaks = Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : [];
      const max = Math.max(1, ...peaks);
      if (w.height > 40) features.push({ kind: 'wave', y: w.top, y1: w.bottom, peaks: peaks.map((p) => Math.max(0, p / max)) });
    }
    const detour = el.querySelector<HTMLElement>('[data-line-detour]');
    if (detour) {
      const d = box(detour), raw = parseJson(detour.dataset.points);
      const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { points?: unknown }).points) ? (raw as { points: unknown[] }).points : [];
      const crossingRaw = raw && !Array.isArray(raw) && typeof raw === 'object' ? Number((raw as { crossing?: unknown }).crossing) : NaN;
      const xy = list
        .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : p && typeof p === 'object' ? [Number((p as { x: unknown }).x), Number((p as { y: unknown }).y)] : [NaN, NaN]))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      // Normalised to the marker's box (0–1, y down) unless the values are already px inside it
      const unit = xy.every(([x, y]) => x <= 1.5 && y <= 1.5);
      const points = xy.map(([x, y]) => [d.left + (unit ? x * d.width : x), d.top + (unit ? y * d.height : y)] as [number, number]);
      if (points.length > 1) features.push({ kind: 'detour', y: points[0][1], y1: Math.max(d.bottom, ...points.map((p) => p[1])) + 32, points, crossing: Number.isInteger(crossingRaw) ? crossingRaw : null });
    }
    const base = el.querySelector<HTMLElement>('[data-line-baseline]');
    // The wordmark's top too: the line bends above the letters and comes down at the wordmark's left edge
    // ...and below whatever precedes the wordmark (the sign-off's actions), so the bend crosses neither
    if (base) {
      const r = box(base), w = box(base.parentElement ?? base), prev = base.parentElement?.previousElementSibling;
      if (r.width > 0) features.push({ kind: 'baseline', y: r.bottom, left: r.left, right: r.right, top: Math.min(w.top, r.bottom), above: prev ? box(prev).bottom : -Infinity });
    }
    const ticksEl = el.querySelector<HTMLElement>('[data-line-ticks]');
    let ticks: number[] = [];
    if (ticksEl) {
      const items = ticksEl.querySelectorAll('[data-tick]').length ? ticksEl.querySelectorAll('[data-tick]') : ticksEl.querySelectorAll('li');
      const t = box(ticksEl);
      ticks = items.length ? [...items].map((i) => { const r = box(i); return r.top + r.height / 2; }) : Array.from({ length: 7 }, (_, k) => t.top + ((k + 0.5) * t.height) / 7);
    }
    features.sort((p, q) => p.y - q.y);
    return { el, top: b.top, bottom: b.bottom, split: Number(el.dataset.split) || 0.5, anchor, features, ticks };
  }).sort((p, q) => p.top - q.top);
}

function build(chapters: Chapter[], W: number) {
  X = []; Y = []; NX = []; NY = []; F = []; waves = []; dyn = null;
  const b = new Builder();
  const ticks: string[] = [];
  const tickAt = (x: number, ys: number[]) => {
    ys.forEach((y, k) => {
      ticks.push(`M${(x - TICK).toFixed(1)} ${y.toFixed(1)}H${(x + TICK).toFixed(1)}`);
      // The last day ends in a ring
      if (k === ys.length - 1) ticks.push(`M${(x + 6).toFixed(1)} ${y.toFixed(1)}a6 6 0 1 0 -12 0a6 6 0 1 0 12 0`);
    });
  };
  const ring = (x: number, y: number) => ticks.push(`M${(x + 5).toFixed(1)} ${y.toFixed(1)}a5 5 0 1 0 -10 0a5 5 0 1 0 10 0`);
  /** The payback chart: the line leaves its post, draws the 30 days, rings the crossing and returns below the chart */
  const detour = (x: number, f: Extract<Feature, { kind: 'detour' }>) => {
    const [first] = f.points, last = f.points[f.points.length - 1], keep = b.flags;
    b.lineTo(x, f.y - CORNER);
    b.flags = 0;
    b.cornerTo(x, f.y, first[0], f.y);
    b.lineTo(first[0], first[1]);
    for (const p of f.points.slice(1)) b.lineTo(p[0], p[1]);
    b.lineTo(last[0], f.y1 - CORNER);
    b.cornerTo(last[0], f.y1, x, f.y1);
    b.lineTo(x + Math.sign(last[0] - x) * CORNER, f.y1);
    b.cornerTo(x, f.y1, x, f.y1 + 1);
    b.flags = keep;
    if (f.crossing !== null && f.points[f.crossing]) ring(...f.points[f.crossing]);
  };
  if (!chapters.length) return ticks;

  if (!phone) {
    b.at(chapters[0].split * W, 0);
    let ended = false;
    chapters.forEach((ch, i) => {
      if (ended) return;
      const x = ch.split * W, next = chapters[i + 1];
      const mid = next ? (ch.bottom + next.top) / 2 : ch.bottom;
      const out = next ? Math.max(b.y, mid - BEND / 2) : ch.bottom;
      for (const f of ch.features) {
        const y0 = f.kind === 'baseline' ? f.top : f.y, y1 = f.kind === 'loop' ? f.y : f.kind === 'baseline' ? f.y : f.y1;
        // A special stretch that doesn't fit between the bends falls back to the plain line
        const lead = f.kind === 'baseline' ? CORNER + 48 : f.kind === 'detour' ? CORNER : 0;
        if (y0 - lead < b.y || (f.kind !== 'baseline' && y1 > out)) continue;
        if (f.kind === 'loop') {
          const pre = X.length;
          b.lineTo(x, f.cy);
          const loop = X.length;
          b.flags = LOOP;
          const tangent = Math.abs(f.cx + LOOP_R - x) <= 2;
          const cx = tangent ? x - LOOP_R : f.cx;
          if (!tangent) b.lineTo(cx + LOOP_R, f.cy);
          b.loop(cx, f.cy, LOOP_R);
          if (!tangent) b.lineTo(x, f.cy);
          b.flags = SOLID;
          const post = X.length;
          b.lineTo(x, out);
          if (f.sticky) dyn = { pre, loop, post, end: X.length, cy: f.cy, dy: 0, sticky: f.sticky, ref: f.ref };
          // The run to `out` is done; later features in this chapter would sit inside the pinned stretch
          break;
        } else if (f.kind === 'wave') {
          b.lineTo(x, f.y);
          const s0 = X.length - 1;
          b.flags = SOLID | WAVE;
          b.lineTo(x, f.y1);
          b.flags = SOLID;
          F[F.length - 1] = SOLID;
          waves.push({ s0, s1: X.length - 1, y0: f.y, y1: f.y1, ...wavePoints(x, f.y, f.y1, f.peaks) });
        } else if (f.kind === 'detour') {
          detour(x, f);
        } else {
          // The footer: the line comes down to the wordmark's baseline and runs along it; she sits on it as the full stop
          b.lineTo(x, Math.max(b.y, f.top - BEND - CORNER, Math.min(f.above + 16, f.top - CORNER - 48)));
          b.bendTo(f.left, f.top - CORNER);
          b.lineTo(f.left, f.y - CORNER);
          b.normal = [0, -1];
          b.cornerTo(f.left, f.y, f.right, f.y);
          b.lineTo(f.right, f.y);
          b.normal = null;
          ended = true;
          break;
        }
      }
      if (ended) return;
      b.lineTo(x, out);
      if (ch.ticks.length) tickAt(x, ch.ticks);
      if (next) b.bendTo(next.split * W, mid + BEND / 2);
    });
  } else {
    // The switchback: down a gutter, across at each split (her side above), down the other gutter
    let g = GUTTER;
    b.flags = 0;
    b.at(g, 0);
    for (const ch of chapters) {
      const team = ch.el.querySelector<HTMLElement>('[data-side="team"]');
      const teamTop = team ? team.getBoundingClientRect().top - ch.el.getBoundingClientRect().top + ch.top : NaN;
      const base = ch.features.find((f) => f.kind === 'baseline');
      let y = base ? base.y : ch.anchor ? ch.anchor.bottom + 2 : Number.isFinite(teamTop) ? teamTop - 16 : ch.top + Math.min(ch.bottom - ch.top, innerHeight) / 2;
      y = Math.min(ch.bottom - CORNER, Math.max(b.y + 2 * CORNER, y));
      const o = g === GUTTER ? W - GUTTER : GUTTER;
      if (y > b.y + CORNER) {
        b.lineTo(g, y - CORNER);
        b.cornerTo(g, y, o, y);
        // The crossing is the boundary: she rests on it from above
        F[F.length - 1] = SOLID;
        NX[NX.length - 1] = 0;
        NY[NY.length - 1] = -1;
        b.flags = SOLID;
        b.normal = [0, -1];
        b.lineTo(o - Math.sign(o - g) * CORNER, y);
        b.normal = null;
        b.flags = 0;
        if (base) break;
        b.cornerTo(o, y, o, y + 1);
        g = o;
      }
      const d = ch.features.find((f) => f.kind === 'detour');
      if (d && d.kind === 'detour' && d.y > b.y + CORNER) {
        detour(g, d);
        b.flags = 0;
      }
      if (ch.ticks.length) tickAt(g, ch.ticks.filter((t) => t > b.y));
      b.lineTo(g, Math.max(b.y, ch.bottom));
    }
  }

  // Normals to the left of travel (her side while the line runs down the page), where not fixed
  const n = X.length;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(NX[i])) continue;
    const a = Math.max(0, i - 1), c = Math.min(n - 1, i + 1);
    const dx = X[c] - X[a], dy = Y[c] - Y[a], l = Math.hypot(dx, dy) || 1;
    NX[i] = -dy / l;
    NY[i] = dx / l;
  }
  S = new Array(n);
  S[0] = 0;
  for (let i = 1; i < n; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  total = S[n - 1] ?? 0;
  MAXY = new Array(n);
  MINY = new Array(n);
  for (let i = 0, m = -Infinity; i < n; i++) MAXY[i] = m = Math.max(m, Y[i]);
  for (let i = n - 1, m = Infinity; i >= 0; i--) MINY[i] = m = Math.min(m, Y[i]);
  for (const w of waves) { w.s0 = S[w.s0]; w.s1 = S[w.s1]; }
  return ticks;
}

/** The call's waveform along the spine: a zig-zag every 3 px whose reach is the peak (20 per second of call) in that slice */
function wavePoints(x: number, y0: number, y1: number, peaks: number[]) {
  const xs: number[] = [], ys: number[] = [];
  const n = Math.max(2, Math.floor((y1 - y0) / 3));
  for (let k = 0; k <= n; k++) {
    const a = Math.floor((k / (n + 1)) * peaks.length), b = Math.max(a + 1, Math.floor(((k + 1) / (n + 1)) * peaks.length));
    let p = 0;
    for (let j = a; j < b && j < peaks.length; j++) p = Math.max(p, peaks[j]);
    xs.push(x + (k % 2 ? 1 : -1) * WAVE_AMP * (k === 0 || k === n ? 0 : p));
    ys.push(y0 + ((y1 - y0) * k) / n);
  }
  return { xs, ys };
}

/* ---------- Search ---------- */

/** First index whose running max reaches y */
function fromY(y: number) {
  let lo = 0, hi = MAXY.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (MAXY[mid] < y) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Last index whose running min (from the end) is at or above... i.e. the last index that can still be ≤ y */
function toY(y: number) {
  let lo = 0, hi = MINY.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (MINY[mid] <= y) lo = mid + 1; else hi = mid; }
  return lo - 1;
}

/** Arc length where the line first reaches page y */
function sAtY(y: number) {
  const i = Math.min(S.length - 1, fromY(y));
  return S[i] ?? 0;
}

/* ---------- Drawing ---------- */

function el(name: 'path' | 'radialGradient' | 'stop' | 'defs' | 'svg') { return document.createElementNS(NS, name); }

function ensureSvg(main: HTMLElement) {
  svg = document.querySelector<SVGSVGElement>('svg[data-line]');
  if (!svg) {
    svg = el('svg') as SVGSVGElement;
    svg.setAttribute('data-line', '');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', zIndex: '2' });
    main.prepend(svg);
  }
  if (!document.querySelector('style[data-line-style]')) {
    const style = document.createElement('style');
    style.setAttribute('data-line-style', '');
    // Zero specificity: the page's own CSS always wins
    style.textContent = `
:where(svg[data-line]){overflow:visible;pointer-events:none}
:where(svg[data-line] path){fill:none;stroke-width:1px;stroke-linecap:butt;stroke-linejoin:round}
:where([data-line-base]),:where([data-line-ticks]){stroke:var(--color-line)}
:where([data-line-live]){stroke:url(#amariya-line-glow);filter:drop-shadow(0 1px 1px color-mix(in oklab,var(--color-shadow-ink) 6%,transparent))}
:where([data-line-unplayed]){stroke:var(--color-line-quiet)}
:where([data-line-played]){stroke:var(--color-text-primary)}
:where([data-line-filament]){stroke:color-mix(in oklab,var(--color-line-quiet),var(--color-line))}
:where([data-line-filament][data-hidden]){display:none}`;
    document.head.append(style);
  }
  for (const key of ['base', 'unplayed', 'played', 'ticks', 'filament', 'live'] as const) {
    let p = svg.querySelector<SVGPathElement>(`path[data-line-${key}]`);
    if (!p) {
      p = el('path') as SVGPathElement;
      p.setAttribute(`data-line-${key}`, '');
      if (key === 'filament') p.setAttribute('data-hidden', '');
      svg.append(p);
    }
    paths[key] = p;
  }
  glow = svg.querySelector<SVGRadialGradientElement>('#amariya-line-glow');
  if (!glow) {
    const defs = el('defs');
    glow = el('radialGradient') as SVGRadialGradientElement;
    glow.id = 'amariya-line-glow';
    glow.setAttribute('gradientUnits', 'userSpaceOnUse');
    // Near her the line catches her light: steel-500 at her centre to the line's steel-600 at 1.2 r
    for (const [offset, role] of [['0', '--color-orb-glow'], ['1', '--color-line']]) {
      const stop = el('stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('style', `stop-color:var(${role})`);
      glow.append(stop);
    }
    defs.append(glow);
    svg.prepend(defs);
  }
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** Writes the base path once per rebuild, with the stretch on screen (and the waveform) left to the live paths */
function writeStatic(ticks: string[]) {
  if (!svg) return;
  let d = '';
  for (let i = 0; i < X.length; i++) d += `${i ? 'L' : 'M'}${f1(X[i])} ${f1(Y[i])}`;
  paths.base?.setAttribute('d', d);
  if (total > 0) paths.base?.setAttribute('pathLength', total.toFixed(2));
  paths.ticks?.setAttribute('d', ticks.join(''));
  // Ink may overflow (the svg is overflow: visible); the box itself must not lengthen the page
  svg.style.height = `${Math.ceil(MAXY[MAXY.length - 1] ?? 0)}px`;
  written = '';
  lastPlayed = -1;
}

/** Visible stretches of the base path: everything except the waveforms and [s0, s1] (drawn live) */
function dashes(s0: number, s1: number) {
  const gaps = [[s0, s1], ...waves.map((w) => [w.s0, w.s1])].filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const merged: number[][] = [];
  for (const g of gaps) {
    const last = merged[merged.length - 1];
    if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]);
    else merged.push([...g]);
  }
  const out: number[] = [];
  let at = 0;
  for (const [a, b] of merged) { out.push(Math.max(0, a - at), b - Math.max(a, at)); at = b; }
  out.push(Math.max(0, total - at) + 1, total + 1);
  return out.map((v) => v.toFixed(1)).join(' ');
}

/* ---------- The world's line ---------- */

export const line = {
  get ready() { return X.length > 1; },
  get phone() { return phone; },
  get total() { return total; },

  /** Rebuild from the DOM (call on resize, after fonts load and when chapters change size) */
  rebuild(main: HTMLElement) {
    width = main.clientWidth;
    phone = document.documentElement.clientWidth < PHONE;
    ensureSvg(main);
    const ticks = build(measure(main), width);
    writeStatic(ticks);
  },

  /** The nearest point she can touch (the spine, the bends, the waveform, the baseline, the phone crossings) */
  probe(x: number, y: number): LineHit | null {
    if (X.length < 2) return null;
    const reach = 420 + (dyn ? Math.abs(dyn.dy) : 0);
    const a = Math.max(0, fromY(y - reach) - 1), b = Math.min(X.length - 2, toY(y + reach));
    let best = Infinity, bi = -1, bt = 0, bx = 0, by = 0;
    for (let i = a; i <= b; i++) {
      if (!(F[i] & SOLID) || !(F[i + 1] & SOLID)) continue;
      const ax = X[i], ay = yAt(i), ex = X[i + 1] - ax, ey = yAt(i + 1) - ay;
      const l2 = ex * ex + ey * ey;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
      const qx = ax + ex * t, qy = ay + ey * t, d2 = (x - qx) ** 2 + (y - qy) ** 2;
      if (d2 < best) { best = d2; bi = i; bt = t; bx = qx; by = qy; }
    }
    if (bi < 0) return null;
    let nx = NX[bi] + (NX[bi + 1] - NX[bi]) * bt, ny = NY[bi] + (NY[bi + 1] - NY[bi]) * bt;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    return { x: bx, y: by, nx, ny, d: (x - bx) * nx + (y - by) * ny, s: S[bi] + (S[bi + 1] - S[bi]) * bt };
  },

  /** The x of the line's spine at page y (her side's edge), for a chapter without an anchor */
  xAt(y: number) {
    if (X.length < 2) return width / 2;
    const i = Math.min(X.length - 1, fromY(y));
    return X[i];
  },

  /** The pinned dial carries its bezel: where its centre is now (page px) */
  pin(stuckCy: number | null) {
    if (!dyn) return;
    dyn.dy = stuckCy === null ? 0 : stuckCy - dyn.cy;
  },
  get pinned() { return dyn ? { el: dyn.ref, section: dyn.sticky } : null; },

  pluck(s: number, amp: number, span: number) {
    if (amp < 0.3) return;
    plucks.push({ s, amp, born: performance.now() / 1000, span });
    if (plucks.length > 6) plucks.shift();
  },

  /** A pulse along the line from s to end (px/s; positive runs down the page) */
  pulse(s: number, end: number, speed: number, amp: number, shape: Pulse['shape'] = 'ecg', w = 6) {
    if (!X.length || Math.abs(end - s) < 8) return;
    pulses.push({ s, v: Math.sign(end - s) * speed, amp, w, born: performance.now() / 1000, end, shape });
    if (pulses.length > 48) pulses.shift();
  },

  /** Arc length where the line meets page y */
  sAt: sAtY,

  /** Draws the visible stretch; returns early when nothing on it moved */
  draw(f: Frame) {
    if (!svg || X.length < 2) return;
    const t = f.now;
    const body = f.body, r = body.r * (1 + 0.04 * body.z);
    // Age out the string's vibration and the pulses
    for (let i = plucks.length - 1; i >= 0; i--) if (!f.smooth || t - plucks[i].born > PLUCK.tau * 5) plucks.splice(i, 1);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], at = p.s + p.v * (t - p.born);
      if (!f.smooth || (p.v > 0 ? at > p.end + p.w * 3 : at < p.end - p.w * 3)) pulses.splice(i, 1);
    }
    // The stretch: the viewport plus half a screen each way, snapped to 256 px so scrolling rewrites it only now and then
    const span = f.bottom - f.top;
    const top = Math.floor((f.top - span / 2) / 256) * 256, bottom = Math.ceil((f.bottom + span / 2) / 256) * 256;
    let a = Math.max(0, fromY(top) - 1), b = Math.min(X.length - 1, toY(bottom) + 1);
    if (dyn && dyn.dy && Y[dyn.pre] < bottom && Y[dyn.end - 1] + dyn.dy > top) { a = Math.min(a, dyn.pre); b = Math.max(b, dyn.end - 1); }
    const foot = body.foot, depth = body.depth;
    if (foot && depth > 0) {
      const ia = Math.max(0, fromY(foot.y - 3 * r) - 1), ib = Math.min(X.length - 1, toY(foot.y + 3 * r) + 1);
      a = Math.min(a, ia);
      b = Math.max(b, ib);
    }
    if (b <= a) return;
    const moving = plucks.length > 0 || pulses.length > 0;
    const key = `${a}|${b}|${dyn ? dyn.dy.toFixed(1) : 0}|${foot && depth > 0 ? `${foot.s.toFixed(1)}|${depth.toFixed(2)}|${r.toFixed(1)}` : ''}`;
    const light = `${f1(body.x)}|${f1(body.y + body.fall)}|${f1(1.2 * r)}`;
    if (glow && light !== lit) {
      lit = light;
      const [cx, cy, gr] = light.split('|');
      glow.setAttribute('cx', cx);
      glow.setAttribute('cy', cy);
      glow.setAttribute('r', gr);
    }
    this.playhead(f.played);
    this.thread(f);
    if (key === written && !moving) return;
    written = moving ? '' : key;

    const fs = foot && depth > 0 ? foot.s : NaN;
    let d = '', open = false;
    for (let i = a; i <= b; i++) {
      if (F[i] & WAVE) { open = false; continue; }
      const s = S[i];
      let off = 0;
      // The dent: the line wraps her circle where she presses it, easing out as a gaussian 1.4 r wide
      if (fs === fs) {
        const u = s - fs;
        if (Math.abs(u) < 3 * r) off += Math.max(Math.sqrt(Math.max(0, r * r - u * u)) - (r - depth), depth * Math.exp(-((u / (0.7 * r)) ** 2)), 0);
      }
      // Plucked: a 7 Hz standing wave between nodes 2.8 r either side of where she let go
      for (const p of plucks) {
        const u = (s - p.s) / p.span;
        if (Math.abs(u) >= 1) continue;
        const age = t - p.born;
        off += p.amp * Math.exp(-age / PLUCK.tau) * Math.sin(2 * Math.PI * PLUCK.hz * age) * Math.cos((Math.PI / 2) * u);
      }
      // Her voice on the line
      for (const p of pulses) {
        const u = (s - (p.s + p.v * (t - p.born))) / p.w;
        if (Math.abs(u) > 4) continue;
        const g = (x: number) => Math.exp(-x * x);
        off += p.amp * (p.shape === 'ecg' ? g(u) - 0.3 * g(u + 1.6) - 0.45 * g(u - 1.4) : p.shape === 'dash' ? (Math.abs(u) < 1 ? 1 : 0) : Math.sin(u * 2.4) * g(u / 2));
      }
      d += `${open ? 'L' : 'M'}${f1(X[i] - NX[i] * off)} ${f1(yAt(i) - NY[i] * off)}`;
      open = true;
    }
    paths.live?.setAttribute('d', d);
    paths.base?.setAttribute('stroke-dasharray', dashes(S[a], S[b]));
  },

  /** The call room's waveform: played part in ink, the rest in steel-300 */
  playhead(played: number | null) {
    const w = waves[0];
    if (!w) return;
    const p = played === null ? 0 : Math.max(0, Math.min(1, played));
    if (Math.abs(p - lastPlayed) < 0.002) return;
    lastPlayed = p;
    const cut = w.y0 + (w.y1 - w.y0) * p;
    let done = '', rest = '';
    for (let k = 0; k < w.xs.length; k++) {
      const seg = `${f1(w.xs[k])} ${f1(w.ys[k])}`;
      if (w.ys[k] <= cut) done += `${done ? 'L' : 'M'}${seg}`;
      if (w.ys[k] >= cut || k === w.xs.length - 1) rest += `${rest ? 'L' : 'M'}${seg}`;
    }
    paths.played?.setAttribute('d', done);
    paths.unplayed?.setAttribute('d', rest);
  },

  /** Where the playhead sits on the waveform (page px), for her home in the call room */
  playheadAt(played: number) {
    const w = waves[0];
    if (!w) return null;
    return { x: w.xs[0], y: w.y0 + (w.y1 - w.y0) * Math.max(0, Math.min(1, played)), reach: WAVE_AMP, y0: w.y0, y1: w.y1 };
  },

  /** The filament: a 12-segment Verlet thread from the nearest point on the line to her edge while she is lifted */
  thread(f: Frame) {
    const path = paths.filament;
    if (!path) return;
    const body = f.body, foot = body.foot;
    const lifted = f.smooth && body.z > 0.05 && body.mode === 'carry' && !!foot;
    const th = filament;
    if (!lifted && !th.on) return;
    if (!f.smooth) {
      th.on = false;
      path.setAttribute('data-hidden', '');
      return;
    }
    const ax = foot ? foot.x : body.x, ay = foot ? foot.y : body.y;
    const dx = ax - body.x, dy = ay - body.y, dl = Math.hypot(dx, dy) || 1;
    const bx = body.x + (dx / dl) * body.r, by = body.y + (dy / dl) * body.r;
    const N = 12;
    if (!th.on) {
      th.on = true;
      th.len = 0;
      th.p = [];
      for (let k = 0; k <= N; k++) th.p.push(ax + ((bx - ax) * k) / N, ay + ((by - ay) * k) / N);
      th.q = th.p.slice();
      path.removeAttribute('data-hidden');
    }
    // Slack while lifted (sags under 1800 px/s²), reeled in when she is set down
    const want = lifted ? Math.hypot(bx - ax, by - ay) * 1.12 + 6 : 0;
    th.len += (want - th.len) * (lifted ? 0.35 : 0.18);
    if (!lifted && th.len < 2) {
      th.on = false;
      path.setAttribute('data-hidden', '');
      path.removeAttribute('d');
      return;
    }
    // ponytail: Verlet per frame at a 60 fps gravity step; scale by the frame time if 120 Hz screens sag too little
    const seg = th.len / N, g = 1800 / 3600, P = th.p, Q = th.q;
    for (let k = 1; k < N; k++) {
      const x = P[2 * k], y = P[2 * k + 1];
      P[2 * k] += (x - Q[2 * k]) * 0.96;
      P[2 * k + 1] += (y - Q[2 * k + 1]) * 0.96 + g;
      Q[2 * k] = x;
      Q[2 * k + 1] = y;
    }
    for (let it = 0; it < 4; it++) {
      P[0] = ax; P[1] = ay; P[2 * N] = bx; P[2 * N + 1] = by;
      for (let k = 0; k < N; k++) {
        const x0 = P[2 * k], y0 = P[2 * k + 1], x1 = P[2 * k + 2], y1 = P[2 * k + 3];
        const l = Math.hypot(x1 - x0, y1 - y0) || 1e-6, diff = (l - seg) / l / 2;
        // A thread only resists stretching: slack sags
        if (l <= seg) continue;
        if (k > 0) { P[2 * k] += (x1 - x0) * diff; P[2 * k + 1] += (y1 - y0) * diff; }
        if (k < N - 1) { P[2 * k + 2] -= (x1 - x0) * diff; P[2 * k + 3] -= (y1 - y0) * diff; }
      }
    }
    let d = '';
    for (let k = 0; k <= N; k++) d += `${k ? 'L' : 'M'}${f1(P[2 * k])} ${f1(P[2 * k + 1])}`;
    path.setAttribute('d', d);
  },
};
