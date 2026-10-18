// The Medical / Aesthetic lens (html[data-lens], remembered in amariya_lens) and the page's small pure maths:
// The Line's question sorting, the dial's 70/30 dwell, the story's scrubbed clock, the payback curve,
// the out-of-hours share and the call waveform. No runtime imports, so the check at the bottom runs under Node:
//   node --experimental-strip-types src/niches/clinics/lens.ts
import type { FeatureKey } from '../../scripts/voice/bridge';
import type { LensKey } from '../../data/content/types';

/* ---------- The lens ---------- */

const KEY = 'amariya_lens';

/** The lens the page is read in; aesthetic until the visitor (or their clinic type) says otherwise */
export const currentLens = (): LensKey => (document.documentElement.dataset.lens === 'medical' ? 'medical' : 'aesthetic');

/** Sets the lens everywhere: every [data-lens-text] pair switches by CSS, toggles sync, 'lens:change' tells the rest */
export function setLens(lens: LensKey, source: 'visitor' | 'profile' | 'start' = 'visitor') {
  const changed = currentLens() !== lens || source === 'start';
  document.documentElement.dataset.lens = lens;
  try { localStorage.setItem(KEY, lens); } catch { /* the choice lasts for this page */ }
  document.querySelectorAll<HTMLElement>('[data-lens-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lensSet === lens)));
  if (changed) document.dispatchEvent(new CustomEvent('lens:change', { detail: { lens, source } }));
}

/** Wires every [data-lens-set] toggle (bar, intake, Index sheet); the head script already set the first paint */
export function initLens() {
  document.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-lens-set]');
    if (b?.dataset.lensSet === 'medical' || b?.dataset.lensSet === 'aesthetic') setLens(b.dataset.lensSet, 'visitor');
  });
  setLens(currentLens(), 'start');
}

/* ---------- The Line: sorting a caller's question ---------- */

export type Route = 'emergency' | 'clinical' | 'administrative' | 'unsure';
export interface Rules { emergency: string[]; clinical: string[]; administrative: string[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = (s: string) => s.toLowerCase().replace(/[’‘`]/g, "'");

/**
 * Emergency first, then clinical, then administrative; anything unmatched goes to the team ('unsure').
 * A rule matches at the start of a word, so 'bruis' matches 'bruising' but 'pain' does not match 'Spain'.
 */
export function route(question: string, rules: Rules): Route {
  const q = plain(question);
  const hit = (list: string[]) => list.some((r) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(plain(r))}`, 'u').test(q));
  if (hit(rules.emergency)) return 'emergency';
  if (hit(rules.clinical)) return 'clinical';
  if (hit(rules.administrative)) return 'administrative';
  return 'unsure';
}

/* ---------- The dial: each sixth holds 70 % on its detent, turns in the last 30 % ---------- */

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Continuous detent position 0…n−1 for the pinned dial's progress p (0–1) */
export function dialPosition(p: number, n = 6): number {
  const at = Math.max(0, Math.min(1, p)) * n;
  const i = Math.min(n - 1, Math.floor(at));
  const s = at - i;
  return i === n - 1 || s < 0.7 ? i : i + smooth((s - 0.7) / 0.3);
}

/** The pin progress at which detent i sits in the middle of its hold */
export const detentProgress = (i: number, n = 6) => (i + 0.35) / n;

/** Feature order for the lens, with the visitor's own problem first */
export function dialOrder(lens: LensKey, first: FeatureKey | null): FeatureKey[] {
  const base: FeatureKey[] = lens === 'medical'
    ? ['answering', 'bookings', 'guest_requests', 'upsells', 'multilingual', 'integrations']
    : ['answering', 'bookings', 'multilingual', 'guest_requests', 'upsells', 'integrations'];
  return first ? [first, ...base.filter((k) => k !== first)] : base;
}

/** The feature that answers a front-desk challenge (chip or free text), or null */
export function challengeFeature(text: string): FeatureKey | null {
  const t = plain(text);
  if (!t.trim()) return null;
  if (/language|translat|international/.test(t)) return 'multilingual';
  if (/no-?show|recall|remind|rebook|package|membership|diary gap/.test(t)) return 'upsells';
  if (/deposit|payment|booking|appointment|schedul/.test(t)) return 'bookings';
  if (/software|system|integrat|calendar|crm/.test(t)) return 'integrations';
  if (/question|enquir|inquir|clinical/.test(t)) return 'guest_requests';
  if (/call|phone|after.?hours|lunch|miss|busy|voicemail|consultation|treatment/.test(t)) return 'answering';
  return null;
}

/* ---------- Time ---------- */

/** 'HH:MM' → minutes since midnight (NaN when unreadable) */
export function hm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** '00:07' → 7 seconds */
export const secondsOf = (at?: string) => {
  const m = /^(\d+):(\d{2})$/.exec(at ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** Minutes the clinic is open in a day (overnight hours wrap) */
const openSpan = (open: number, close: number) => ((close - open) % 1440 + 1440) % 1440;

/** True when minutes-since-midnight t falls inside the clinic's hours */
export function isOpen(t: number, open: number, close: number): boolean {
  const d = ((t - open) % 1440 + 1440) % 1440;
  return d < openSpan(open, close);
}

/** Share of the clock the clinic is closed, in whole percent (08:30–18:30 → 58) */
export const outOfHours = (open: number, close: number) => Math.round(((1440 - openSpan(open, close)) / 1440) * 100);

/**
 * The story's scrubbed clinic clock: from the visitor's time now, forwards. During opening hours the scrub
 * crosses closing time in the third beat (the sunset spans .66–.78 of the pin); otherwise it runs two hours on.
 */
export function storyMinutes(p: number, now: number, open: number, close: number): number {
  const q = Math.max(0, Math.min(1, p));
  if (!isOpen(now, open, close)) return now + q * 120;
  const toClose = ((close - now) % 1440 + 1440) % 1440;
  const a = Math.max(0, toClose - 20); // reached at .66, 20 minutes before closing
  if (q < 0.66) return now + a * smooth(q / 0.66);
  if (q < 0.78) return now + a + 60 * ((q - 0.66) / 0.12);
  return now + a + 60 + 50 * ((q - 0.78) / 0.22);
}

/** Which hour band (from–to, 'HH:MM', to exclusive) holds the time; bands may wrap past midnight */
export function bandIndex(t: number, bands: { from: string; to: string }[]): number {
  const m = ((t % 1440) + 1440) % 1440;
  const i = bands.findIndex((b) => isOpen(m, hm(b.from), hm(b.to)));
  return Math.max(0, i);
}

/* ---------- Money ---------- */

/**
 * Thirty days of cumulative recovered revenue against the licence price, as points in a unit box
 * (x: day / 30 to the right, y: 0 at the top, 1 at the bottom), plus the day it passes the price.
 * The crossing day matches roi.ts paybackDays (a month is 30.4 days).
 */
export function payCurve(monthly: number, price: number, days = 30): { points: [number, number][]; day: number | null; threshold: number } {
  const perDay = monthly / 30.4;
  const top = Math.max(perDay * days, price) * 1.12;
  const points: [number, number][] = [];
  for (let d = 0; d <= days; d++) points.push([+(d / days).toFixed(4), +(1 - (perDay * d) / top).toFixed(4)]);
  const day = perDay > 0 ? Math.ceil(price / perDay) : Infinity;
  return { points, day: day <= days ? day : null, threshold: +(1 - price / top).toFixed(4) };
}

/* ---------- The call room's waveform, from the script's own timing ---------- */

/** Amplitudes 0–1 per bin: speech while a line is spoken (about 2.6 words a second), room tone between */
export function peaks(lines: { text: string; at?: string }[], bins = 72): number[] {
  const starts = lines.map((l) => secondsOf(l.at));
  const ends = lines.map((l, i) => Math.min(starts[i + 1] ?? Infinity, starts[i] + 0.6 + l.text.split(/\s+/).length / 2.6));
  const total = Math.max(1, ends[ends.length - 1] ?? 1) + 1.5;
  return Array.from({ length: bins }, (_, b) => {
    const t = ((b + 0.5) / bins) * total;
    const i = starts.findIndex((s, k) => t >= s && t < ends[k]);
    if (i < 0) return 0.04;
    // Deterministic syllable shape, so the server and the browser draw the same wave
    const v = Math.abs(Math.sin(t * 9.1 + i * 1.7) * Math.sin(t * 3.3 + 0.6));
    return +(0.28 + 0.66 * v).toFixed(3);
  });
}

/** Seconds from the call's start to just after its last line */
export const callLength = (lines: { text: string; at?: string }[]) => {
  const last = lines[lines.length - 1];
  return last ? secondsOf(last.at) + Math.ceil(0.6 + last.text.split(/\s+/).length / 2.6) + 1 : 0;
};

/* ---------- The one runnable check for the logic above ---------- */

const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv ?? [];
if (/lens\.ts$/.test(argv[1] ?? '')) {
  const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(`lens.ts check failed: ${what}`); };
  const rules: Rules = { emergency: ['chest pain', 'can’t breathe'], clinical: ['bruis', 'pain', 'dose', 'safe', 'is it normal'], administrative: ['parking', 'park', 'move', 'cost'] };
  ok(route('Is it normal to bruise after filler?', rules) === 'clinical', 'bruise → clinical');
  ok(route("I have chest pain and can't breathe", rules) === 'emergency', 'emergency wins, straight apostrophe');
  ok(route('Do you have parking?', rules) === 'administrative', 'parking → administrative');
  ok(route('Do you speak Spanish?', rules) === 'unsure', "'pain' must not match inside 'Spanish'");
  ok(route('Is it safe to park outside?', rules) === 'clinical', 'clinical is checked before administrative');
  ok(dialPosition(0) === 0 && dialPosition(0.1) === 0 && dialPosition(detentProgress(3)) === 3, 'dial holds on its detent');
  ok(dialPosition(1 / 6 - 0.001) > 0.9 && dialPosition(1 / 6 - 0.001) < 1, 'dial turns in the last 30 %');
  ok(dialPosition(1) === 5, 'dial ends on the sixth detent');
  ok(outOfHours(hm('08:30'), hm('18:30')) === 58, '08:30–18:30 is 58 % out of hours');
  ok(isOpen(hm('23:00'), hm('22:00'), hm('06:00')) && !isOpen(hm('07:00'), hm('22:00'), hm('06:00')), 'overnight hours wrap');
  const c = payCurve(16313, 3500);
  ok(c.day === 7 && c.points.length === 31 && c.points[0][1] === 1, 'payback crosses on day 7 (as paybackDays)');
  ok(payCurve(1000, 3500).day === null, 'no crossing inside 30 days');
  const open = hm('08:30'), close = hm('18:30'), now = hm('14:32');
  ok(storyMinutes(0, now, open, close) === now, 'the story starts at the visitor’s time');
  ok(storyMinutes(0.66, now, open, close) < close && storyMinutes(0.78, now, open, close) > close, 'the sunset falls in the third beat');
  ok(storyMinutes(1, hm('22:10'), open, close) === hm('22:10') + 120, 'after hours the clock runs two hours on');
  const bands = [{ from: '06:00', to: '08:00' }, { from: '08:00', to: '12:00' }, { from: '21:00', to: '06:00' }];
  ok(bandIndex(hm('02:00'), bands) === 2 && bandIndex(hm('09:15'), bands) === 1, 'hour bands, including one past midnight');
  ok(dialOrder('medical', 'multilingual')[0] === 'multilingual' && dialOrder('aesthetic', null).length === 6, 'dial order');
  ok(challengeFeature('No-shows') === 'upsells' && challengeFeature('Languages') === 'multilingual' && challengeFeature('Lunchtime gaps') === 'answering', 'challenges map to features');
  const w = peaks([{ text: 'Hi there', at: '00:02' }, { text: 'Hello, how can I help?', at: '00:05' }]);
  ok(w.length === 72 && w[0] === 0.04 && Math.max(...w) <= 0.94, 'waveform: room tone before the first line');
  console.log('lens.ts: all checks passed');
}
