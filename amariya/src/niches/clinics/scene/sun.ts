// The sundial: the visitor's own time decides where the light comes from, how high it stands and whether it is night.
// Pure maths in sunAt(); the `sun` store keeps the clinic's hours, the story's scrubbed time and the CSS still's variables.
import { clock } from '../../../scripts/motion/clock';

export interface Hours { open: number; close: number }

export interface SunReading {
  /** Minutes since midnight */
  minutes: number;
  /** φ: 0 at 06:00 (light from the left) to π at 19:00 (light from the right) */
  az: number;
  /** θ: elevation in radians, .18–1.1, so there is always a shadow */
  el: number;
  /** 1 by day, 0 at night, cross-fading through dawn and dusk */
  day: number;
  /** Unit vector toward the light: x right, y up the screen, z toward the viewer */
  dir: [number, number, number];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
/** Until the clinic's hours are known: dawn 05:30–07:00, dusk 18:00–19:30 */
const DAWN = [330, 420] as const;
const DUSK = [1080, 1170] as const;
/** The cross-fade around the clinic's own hours: 90 minutes before opening, 90 after closing */
const FADE = 90;

export function sunAt(minutes: number, hours: Hours | null = null): SunReading {
  const m = ((minutes % 1440) + 1440) % 1440;
  const arc = (Math.PI * (m / 60 - 6)) / 13;
  const az = Math.max(0, Math.min(Math.PI, arc));
  const el = Math.max(0.18, Math.min(1.1, 0.18 + 0.62 * Math.sin(arc)));
  let day: number;
  if (!hours) day = Math.min(ramp(m, DAWN[0], DAWN[1]), 1 - ramp(m, DUSK[0], DUSK[1]));
  else {
    const rise = ramp(m, hours.open - FADE, hours.open), set = 1 - ramp(m, hours.close, hours.close + FADE);
    // A clinic open across midnight is lit outside the closed gap
    day = hours.close > hours.open ? Math.min(rise, set) : Math.max(rise, set);
  }
  const c = Math.cos(el);
  return { minutes: m, az, el, day, dir: [-Math.cos(az) * c, Math.sin(az) * c, Math.sin(el)] };
}

const SWEEP = 1.6;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let real = clock.now().minutes;
let override: number | null = null;
let sweep: { from: number; delta: number; t0: number } | null = null;
let written = '';
let started = false;

export const sun = {
  /** The clinic's hours once the visitor sets them (minutes since midnight) */
  hours: null as Hours | null,
  reading: sunAt(real),

  /** Values up to 24 are read as hours */
  setHours(open: number, close: number) {
    const m = (v: number) => (v <= 24 ? v * 60 : v);
    if (!Number.isFinite(open) || !Number.isFinite(close)) return;
    sun.hours = { open: m(open), close: m(close) };
  },

  /**
   * The story's scrubbed clock (null hands the light back to the real time).
   * smooth: an agent's jump sweeps there over 1.6 s; scroll scrubbing and reduced motion move at once.
   */
  setTime(minutes: number | null, smooth = false, now = performance.now()) {
    if (minutes === null || !Number.isFinite(minutes)) { override = null; sweep = null; return; }
    if (smooth) {
      const from = sweepAt(now) ?? override ?? real;
      sweep = { from, delta: ((((minutes - from) % 1440) + 2160) % 1440) - 720, t0: now };
    } else sweep = null;
    override = minutes;
  },

  /** Follows the real clock minute by minute; idempotent */
  start() {
    if (started) return;
    started = true;
    clock.onMinute((c) => { real = c.minutes; });
  },

  /** Once per frame: recomputes the light and writes the CSS still's variables when they change */
  update(now = performance.now()) {
    const minutes = sweepAt(now) ?? override ?? real;
    sun.reading = sunAt(minutes, sun.hours);
    const r = sun.reading;
    // --sun-az: the direction the shadow falls as a CSS angle (0deg right, 90deg down); --sun-el: the light's height
    const vars = `${((r.az * 180) / Math.PI).toFixed(1)}|${((r.el * 180) / Math.PI).toFixed(1)}|${r.day < 0.5 ? 1 : 0}`;
    if (vars === written || typeof document === 'undefined') return;
    written = vars;
    const [az, el, night] = vars.split('|');
    const s = document.documentElement.style;
    s.setProperty('--sun-az', `${az}deg`);
    s.setProperty('--sun-el', `${el}deg`);
    s.setProperty('--night', night);
  },
};

function sweepAt(now: number): number | null {
  if (!sweep) return null;
  const p = Math.min(1, (now - sweep.t0) / 1000 / SWEEP);
  const v = sweep.from + sweep.delta * easeInOut(p);
  if (p >= 1) sweep = null;
  return ((v % 1440) + 1440) % 1440;
}
