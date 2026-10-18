// The one scroll owner: Lenis on fine pointers (not under reduced motion), native scrolling otherwise.
// Every pin and timeline reads scroll.y / sectionProgress() from here; nothing measures rects per frame.
import Lenis from 'lenis';
import { scheduler } from './scheduler';

type Easing = (t: number) => number;
export interface ScrollToOptions {
  /** Added to where the target lands, as in Lenis (an element already stops short by its scroll-margin-top and the page's scroll-padding-top) */
  offset?: number;
  /** Seconds */
  duration?: number;
  immediate?: boolean;
  easing?: Easing;
}

const inOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = matchMedia('(pointer: fine)').matches && !reduced();

const lenis = smooth ? new Lenis({ lerp: 0.09, smoothWheel: true, autoRaf: false }) : null;
if (lenis) document.documentElement.classList.add('lenis');

const frameCallbacks = new Set<(y: number, v: number) => void>();
let settle: (() => void) | null = null;
let nativeAnim: (() => void) | null = null;
let lastY = window.scrollY;

export const scroll = {
  y: window.scrollY,
  /** px per second, positive downwards */
  v: 0,
  lenis,
  smooth,
  /** Date.now() of the visitor's last wheel, touch, key or pointer press outside the voice UI */
  lastUserInput: 0,

  /** Scrolls to a position, selector or element; resolves when it arrives or is cancelled */
  to(target: number | string | HTMLElement, o: ScrollToOptions = {}): Promise<void> {
    scroll.cancel();
    const immediate = o.immediate || reduced();
    return new Promise<void>((resolve) => {
      settle = () => { settle = null; resolve(); };
      if (lenis) {
        lenis.scrollTo(target, { offset: o.offset ?? 0, duration: o.duration ?? 1, easing: o.easing ?? inOutCubic, immediate, force: true, onComplete: () => settle?.() });
        if (immediate) settle?.();
        return;
      }
      const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
      if (el === null) return settle();
      const max = document.documentElement.scrollHeight - innerHeight;
      // As Lenis does (and the browser's own anchor jumps): an element stops short by its scroll-margin-top and the
      // page's scroll-padding-top (the fixed chrome), so a page says once, in CSS, where things land for both scrollers
      const short = (v: string) => parseFloat(v) || 0;
      const at = typeof el === 'number' ? el
        : el.getBoundingClientRect().top + window.scrollY - short(getComputedStyle(el).scrollMarginTop) - short(getComputedStyle(document.documentElement).scrollPaddingTop);
      const goal = Math.max(0, Math.min(max, at + (o.offset ?? 0)));
      if (immediate) {
        window.scrollTo({ top: goal, behavior: 'instant' });
        return settle();
      }
      const from = window.scrollY, ms = (o.duration ?? 1) * 1000, ease = o.easing ?? inOutCubic, t0 = performance.now();
      const stop = scheduler.add((now) => {
        const p = Math.min(1, (now - t0) / ms);
        window.scrollTo({ top: from + (goal - from) * ease(p), behavior: 'instant' });
        if (p >= 1) { stop(); nativeAnim = null; settle?.(); }
      }, 1);
      nativeAnim = stop;
    });
  },
  /** Stops an agent or programmatic scroll where it is */
  cancel() {
    if (nativeAnim) { nativeAnim(); nativeAnim = null; }
    if (lenis && lenis.isScrolling === 'smooth') lenis.scrollTo(lenis.scroll, { immediate: true, force: true });
    settle?.();
  },
  /** Runs after scroll.y and scroll.v update, every frame; returns the remover */
  onFrame(cb: (y: number, v: number) => void): () => void {
    frameCallbacks.add(cb);
    return () => { frameCallbacks.delete(cb); };
  },
};

scheduler.add((now, dt) => {
  lenis?.raf(now);
  const y = lenis ? lenis.scroll : window.scrollY;
  const v = (y - lastY) / Math.max(dt, 1e-3);
  scroll.v += (v - scroll.v) * Math.min(1, dt / 0.08);
  if (Math.abs(scroll.v) < 0.5) scroll.v = 0;
  scroll.y = lastY = y;
  frameCallbacks.forEach((cb) => cb(y, scroll.v));
}, 0);

// The visitor's own input wins over the agent: it cancels agent scrolls and starts the polite window
for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const) {
  addEventListener(type, (e) => {
    if ((e.target as Element | null)?.closest?.('[data-voice-ui]')) return;
    scroll.lastUserInput = Date.now();
    if (settle) scroll.cancel();
  }, { passive: true });
}

/* ---------- Section progress from cached offsets ---------- */

const offsets = new Map<HTMLElement, { top: number; height: number }>();
const invalidate = () => offsets.clear();
new ResizeObserver(invalidate).observe(document.body);
addEventListener('resize', invalidate, { passive: true });
document.fonts?.ready.then(invalidate);

function measure(el: HTMLElement) {
  let m = offsets.get(el);
  if (!m) {
    m = { top: el.getBoundingClientRect().top + (lenis ? lenis.scroll : window.scrollY), height: el.offsetHeight };
    offsets.set(el, m);
  }
  return m;
}

/** 0 when the section's top reaches the viewport top, 1 when its bottom reaches the viewport bottom */
export function sectionProgress(el: HTMLElement): number {
  const { top, height } = measure(el);
  const run = height - innerHeight;
  const into = scroll.y - top;
  if (run <= 0) return into >= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, into / run));
}

/** The document offset of an element, cached like sectionProgress */
export const offsetTop = (el: HTMLElement) => measure(el).top;

/** Where trackSections reads the page: a section is in view while it crosses the band from here to 50 % down */
export const READ_LINE = 0.45;

/** Calls cb with the id of the section crossing the middle of the viewport; returns the disconnector */
export function trackSections(ids: string[], cb: (id: string) => void): () => void {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) cb((e.target as HTMLElement).id);
  }, { rootMargin: `-${READ_LINE * 100}% 0px -50% 0px` });
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
  return () => io.disconnect();
}

export interface Navigator {
  goTo(name: string, fromAgent: boolean): boolean;
  /** Id of the section in view */
  current: string;
}

/**
 * Section navigation for visitors and the agent. map: section name or alias → element id, or a resolver.
 * Polite rule: while the visitor is reading (input in the last 2.5 s), the agent's move becomes the follow note.
 */
export function createNavigator(
  map: Record<string, string | ((name: string) => HTMLElement | null)>,
  o: { offset: () => number; onFollow?: (section: string, label: string) => void; labels: Record<string, string> },
): Navigator {
  const resolve = (name: string) => {
    const entry = map[name] ?? name;
    return typeof entry === 'function' ? entry(name) : document.getElementById(entry.replace(/^#/, ''));
  };
  const ids = [...new Set(Object.values(map).filter((v): v is string => typeof v === 'string').map((v) => v.replace(/^#/, '')))];
  const nav: Navigator = {
    current: '',
    goTo(name, fromAgent) {
      const el = resolve(name);
      if (!el) return false;
      if (fromAgent && Date.now() - scroll.lastUserInput < 2500 && el.id !== nav.current) {
        o.onFollow?.(name, o.labels[name] ?? name);
        return true;
      }
      const d = Math.abs(offsetTop(el) - scroll.y);
      scroll.to(el, { offset: o.offset(), duration: Math.max(500, Math.min(1100, d * 0.45)) / 1000 });
      if (el.id) history.replaceState(null, '', `#${el.id}`);
      return true;
    },
  };
  trackSections(ids, (id) => { nav.current = id; });
  return nav;
}
