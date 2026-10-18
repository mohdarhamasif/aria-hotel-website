// The page's hands for the agent (contract 7's Presenter) and the record the conversation leaves behind:
// margin notes on her side, hand-off slips on the team's side, THE ACCOUNT, the application and the notes letter.
// The navigator owns every move: chapters, the dial's detents and the story's beats, with the polite follow rule.
import { voice, FEATURES, type DemoFields, type FeatureKey, type PlanKey, type Presenter, type ProfileFields, type RoiConfig } from '../../scripts/voice/bridge';
import { content } from '../../data/content/clinics';
import { given, type TranscriptCopy } from '../../data/content/types';
import { flash, setField } from '../../scripts/text';
import { computeRoi, fmtMoney, minutes, paybackDays, roiSummary, type Roi } from '../../scripts/apply/roi';
import { missingFields, missingMessage, EMAIL_RE } from '../../scripts/apply/validate';
import { qualify } from '../../scripts/apply/qualify';
import { ledgerCounts, meetingsUrl, submitApplication } from '../../scripts/apply/adapter';
import { createNavigator, offsetTop, scroll } from '../../scripts/motion/scroll';
import { motion } from '../../scripts/motion/prefs';
import { clock, fmtHM } from '../../scripts/motion/clock';
import { track } from '../../scripts/analytics';
import { sound } from '../../scripts/sound';
import { currentLens, hm, outOfHours, payCurve, setLens } from './lens';

/* ---------- P5's porcelain, when the scene has loaded (every call is optional) ---------- */

export interface Porcelain {
  showMark?(): void;
  setLithophane?(key: string): void;
  setClinicName?(name: string): void;
  setHours?(open: number, close: number): void;
  placeOn?(target: HTMLElement): void;
  goHome?(): void;
  pushAcrossLine?(): void;
  point?: number;
  setPoint?(n: number): void;
  intro?(): void;
}
export const porcelain = (): Porcelain | undefined => (window as unknown as { amariyaPorcelain?: Porcelain }).amariyaPorcelain;

/* ---------- Small DOM helpers ---------- */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const C = content;
const nowLine = () => clock.now().line;

/** Announces through the bar's polite status region (never every state flip) */
export function announce(text: string) {
  const s = $('[data-line-status]');
  if (!s) return;
  s.textContent = '';
  requestAnimationFrame(() => { s.textContent = text; });
}

/* ---------- What the conversation leaves behind ---------- */

export const record = {
  asked: [] as { q: string; route: string }[],
  handoffs: [] as { topic: string; summary: string; time: string }[],
  recommendation: null as null | { plan: 'founding' | 'groups'; reason: string },
};

/** A mono margin note on her side of the chapter where it happened: 'Calculated your estimate · 14:41' */
export async function marginNote(chapter: string, action: string) {
  const list = $(`#${chapter} [data-margin-notes]`);
  if (!list) return;
  const li = el('li');
  const text = C.marginNote(action, nowLine());
  list.append(li);
  if (!motion.allowed) return void (li.textContent = text);
  for (const ch of text) {
    li.textContent += ch;
    await sleep(18);
  }
}

/** A hand-off slip on the team's side, in the log and in the Notes panel's team column */
export function logHandoff(topic: string, summary: string) {
  const time = nowLine();
  const T = topic.trim().toUpperCase();
  record.handoffs.push({ topic: T, summary, time });
  const make = () => {
    const li = el('li', 'slip');
    li.dataset.enter = '';
    li.append(el('p', 'slip-stamp mono', `${C.line.handoffPrefix} · ${T} · ${time}`), el('p', 'slip-text', summary));
    li.addEventListener('animationend', () => li.removeAttribute('data-enter'), { once: true });
    return li;
  };
  $('[data-handoff-log]')?.append(make());
  $('[data-handoff-mirror]')?.append(make());
  announce(`Handed to your team: ${topic.toLowerCase()} question`);
  sound.play('hush');
  try { navigator.vibrate?.(8); } catch { /* haptics are a nicety */ }
  document.dispatchEvent(new CustomEvent('clinics:handoff', { detail: { topic: T, summary } }));
}

/**
 * Pushes the orb into the line and lands the slip when the line reports the hand-off (P5's 'line:handoff'),
 * or after 1.4 s if it does not (no WebGL, the line's cooldown, reduced motion).
 */
let pendingHandoff: (() => void) | null = null;
export function pushHandoff(topic: string, summary: string) {
  pendingHandoff?.();
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (pendingHandoff === fire) pendingHandoff = null;
    logHandoff(topic, summary);
  };
  const timer = window.setTimeout(fire, 1400);
  pendingHandoff = fire;
  const p = porcelain();
  if (p?.pushAcrossLine) p.pushAcrossLine();
  else fire();
}
/** P5's line reports a hand-off: a pending one lands; otherwise the visitor pushed her there by hand */
document.addEventListener('line:handoff', () => {
  if (pendingHandoff) return pendingHandoff();
  logHandoff('CLINICAL', C.intake.demoSlip);
  const slip = $('[data-intake-slip]');
  if (slip && scroll.y < innerHeight) slip.hidden = false;
  track('handoff_demo', { how: 'orb' });
  voice.contextUpdate('The visitor pushed Amariya against the line on the page: a clinical question goes to the clinic’s team, never answered by her.');
});

/**
 * The Line measures the page again when main changes size; a marker whose data changed without moving anything
 * (the payback points, the call's peaks, the dial's order) asks for the same recompute.
 */
let relayoutTimer = 0;
export function relayout() {
  clearTimeout(relayoutTimer);
  relayoutTimer = window.setTimeout(() => dispatchEvent(new Event('resize')), 120);
}

/* ---------- Navigation ---------- */

const chapterOf = (id: string) => C.chapters.find((c) => c.id === id);
const pinned = (id: string) => document.getElementById(id)?.dataset.pin === 'on';
const sub = (name: string) => $(`[data-sub="${name}"]`);
const ALIAS: Record<string, string> = { demo: 'apply' };

const map: Record<string, string | ((name: string) => HTMLElement | null)> = Object.fromEntries([
  ...C.chapters.map((c) => [c.id, c.id] as const),
  ['demo', 'apply'] as const,
  ...FEATURES.map((k) => [`features:${k}`, (n: string) => (pinned('features') ? sub(n) : document.getElementById('features'))] as const),
  ...[1, 2, 3].map((i) => [`story:${i}`, (n: string) => (pinned('story') ? sub(n) : document.getElementById('story'))] as const),
]);
const labels: Record<string, string> = {};
for (const name of Object.keys(map)) {
  const ch = chapterOf(ALIAS[name] ?? name.split(':')[0]);
  if (ch) labels[name] = C.follow(ch.point, ch.title);
}

export const nav = createNavigator(map, {
  // The bar is the page's scroll-padding (clinics.css), which every move already stops short by
  offset: () => 0,
  labels,
  onFollow(section, label) {
    voice.follow(section, label);
    const target = document.getElementById(ALIAS[section] ?? section.split(':')[0]);
    if (target) document.dispatchEvent(new CustomEvent('orb:edge', { detail: { dir: offsetTop(target) > scroll.y ? 'down' : 'up', section } }));
  },
});

/* ---------- Your clinic: the form and THE ACCOUNT ---------- */

const profileForm = $<HTMLFormElement>('form[data-profile]');
const applyForm = $<HTMLFormElement>('form[data-apply]');
const A = C.clinic.account;
const ACT: TranscriptCopy['activity'] = C.transcript.activity;
let pendingTyping: Promise<unknown> = Promise.resolve();
export let lastRoi: Roi | null = null;

const fieldValue = (form: HTMLFormElement | null, name: string) => {
  const f = form?.elements.namedItem(name);
  return f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement || f instanceof HTMLSelectElement ? f.value.trim() : '';
};
const listValue = (name: string) => {
  if (!profileForm) return '';
  const fd = new FormData(profileForm);
  return [...fd.getAll(name).map(String), String(fd.get(`${name}_other`) ?? '').trim()].filter(Boolean).join(', ');
};

export function readProfile(): ProfileFields {
  const out: ProfileFields = {};
  if (!profileForm) return out;
  const type = new FormData(profileForm).get('hotel_type');
  const name = fieldValue(profileForm, 'hotel_name');
  const rooms = Number(fieldValue(profileForm, 'rooms'));
  const calls = Number(fieldValue(profileForm, 'monthly_calls'));
  const languages = listValue('languages');
  const pains = listValue('pain_points');
  if (name) out.hotel_name = name;
  if (type) out.hotel_type = String(type);
  if (rooms > 0) out.rooms = rooms;
  if (calls > 0) out.monthly_calls = calls;
  if (languages) out.languages = languages;
  if (pains) out.pain_points = pains;
  return out;
}

/** Opening hours in minutes since midnight, from Your clinic (defaults 08:30–18:30) */
export function clinicHours() {
  const d = C.clinic.hours.defaults;
  const open = hm(fieldValue(profileForm, 'opens') || d.opens);
  const close = hm(fieldValue(profileForm, 'closes') || d.closes);
  return { open: Number.isFinite(open) ? open : hm(d.opens), close: Number.isFinite(close) ? close : hm(d.closes) };
}

/** The ROI constants for the lens: the medical lens needs the visitor's own appointment value for revenue */
function roiFor(): { config: RoiConfig; revenue: boolean; avg: number } {
  const base = C.voice.roi;
  if (currentLens() !== 'medical') return { config: base, revenue: true, avg: base.avgBookingValue };
  const medical = given<RoiConfig>(A.medicalRoi) ?? base;
  const avg = Number(fieldValue(profileForm, 'avg_value'));
  return { config: { ...medical, avgBookingValue: avg > 0 ? avg : medical.avgBookingValue }, revenue: avg > 0, avg };
}

const n0 = (n: number) => n.toLocaleString('en-US');

/** Rolling digits (600 ms, 30 ms stagger); rebuilt when the shape of the number changes */
function odometer(box: HTMLElement, text: string) {
  if (box.dataset.text === text) return;
  box.dataset.text = text;
  const chars = [...text];
  const shape = chars.map((c) => (/\d/.test(c) ? '9' : c)).join('');
  const rebuilt = box.dataset.shape !== shape;
  if (rebuilt) {
    box.dataset.shape = shape;
    box.replaceChildren(...chars.map((c, i) => {
      if (!/\d/.test(c)) return el('span', 'od-sep', c);
      const cell = el('span', 'od');
      cell.style.setProperty('--i', String(i));
      const strip = el('span', 'od-strip');
      strip.style.setProperty('--d', '0');
      strip.append(...'0123456789'.split('').map((d) => el('span', '', d)));
      cell.append(strip);
      return cell;
    }));
  }
  const set = () => {
    let k = 0;
    box.querySelectorAll<HTMLElement>('.od-strip').forEach((s) => s.style.setProperty('--d', chars.filter((c) => /\d/.test(c))[k++] ?? '0'));
  };
  if (rebuilt && motion.allowed) requestAnimationFrame(() => requestAnimationFrame(set));
  else set();
}

function setRow(key: string, text: string) {
  const dd = $(`[data-roi="${key}"]`);
  if (dd && dd.textContent !== text) dd.textContent = text;
}

/** Re-renders the account from the form: blank rows until there is input, never a dash */
export function renderAccount() {
  const p = readProfile();
  const { config, revenue: revenueKnown, avg } = roiFor();
  const r = computeRoi(p, config);
  const { open, close } = clinicHours();
  lastRoi = r;
  // The agent's estimate uses the same constants as the page (the medical lens: the visitor's own value)
  if (voice.config && voice.config.roi !== config) voice.config = { ...C.voice, roi: config };
  const readout = $('[data-readout]');
  const needs = $('[data-roi-needs]');
  const meter = $('[data-minutes-meter]');
  const note = $('[data-roi-note]');
  const basis = $('[data-roi-basis]');
  const detour = $('[data-detour]');
  const licencePay = $('[data-licence-payback]');

  setRow('out', A.outOfHoursValue(outOfHours(open, close)));
  if (note) note.hidden = !!r;
  if (!r) {
    ['calls', 'recovered', 'revenue', 'hours', 'payback', 'minutes'].forEach((k) => setRow(k, ''));
    if (readout) { readout.replaceChildren(); delete readout.dataset.text; delete readout.dataset.shape; }
    if (needs) needs.hidden = true;
    if (meter) meter.hidden = true;
    if (basis) basis.textContent = '';
    if (detour) detour.hidden = true;
    if (licencePay) licencePay.hidden = true;
    return;
  }
  setRow('calls', n0(r.calls));
  setRow('hours', `${n0(r.hours)} h`);
  // The medical lens shows calls and hours until the visitor gives their own appointment value
  const full = revenueKnown;
  setRow('recovered', full ? n0(r.recovered) : '');
  setRow('revenue', full ? fmtMoney(r.revenue) : '');
  if (readout) {
    if (full) odometer(readout, fmtMoney(r.revenue));
    else { readout.replaceChildren(); delete readout.dataset.text; delete readout.dataset.shape; }
  }
  if (needs) needs.hidden = full;
  const m = minutes(r, config);
  setRow('minutes', full ? A.minutesValue(n0(m.missedOnly), n0(m.every)) : '');
  if (meter) {
    meter.hidden = !full;
    const max = Math.max(m.every, m.included) * 1.08;
    const place = (k: string, v: number, label?: string) => {
      const mark = $(`[data-meter="${k}"]`, meter);
      mark?.style.setProperty('--at', `${((v / max) * 100).toFixed(2)}%`);
      const l = $(`[data-meter-label="${k}"]`, meter);
      if (l && label) l.textContent = label;
    };
    place('included', m.included);
    place('missed', m.missedOnly, n0(m.missedOnly));
    place('every', m.every, n0(m.every));
  }
  if (basis) basis.textContent = full ? C.roi.basis(r.calls, r.estimatedCalls, Math.round(config.missedCallRate * 100), fmtMoney(avg)) : '';

  const price = C.offer.price;
  const days = full && r.revenue > 0 ? paybackDays(price, r.revenue) : null;
  setRow('payback', days ? A.paybackValue(days) : '');
  if (licencePay) {
    licencePay.hidden = !days;
    if (days) licencePay.textContent = C.licence.payback(days);
  }
  if (detour) {
    detour.hidden = !full;
    if (full) drawDetour(r.revenue, price);
  }
}

/** The payback detour: thirty days against the licence price, as points for P5's line and as a drawing */
function drawDetour(monthly: number, price: number) {
  const { points, day, threshold } = payCurve(monthly, price);
  const chart = $('[data-line-detour]');
  if (!chart) return;
  const json = JSON.stringify(points);
  if (chart.dataset.points !== json) {
    chart.dataset.points = json;
    chart.dataset.threshold = String(threshold);
    chart.dataset.crossing = day === null ? '' : JSON.stringify([day / 30, threshold]);
    relayout();
  }
  $('[data-detour-curve]', chart)?.setAttribute('d', `M${points.map(([x, y]) => `${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join('L')}`);
  $('[data-detour-threshold]', chart)?.setAttribute('d', `M0 ${(threshold * 100).toFixed(2)}H100`);
  chart.style.setProperty('--threshold', `${(threshold * 100).toFixed(2)}%`);
  const ring = $('[data-detour-ring]', chart);
  if (ring) {
    ring.hidden = day === null;
    if (day !== null) {
      ring.style.setProperty('--x', `${((day / 30) * 100).toFixed(2)}%`);
      const label = $('[data-detour-day]', ring);
      if (label) label.textContent = C.clinic.curve.crossing(day);
    }
  }
  const text = $('[data-detour-text]');
  if (text) text.textContent = C.clinic.curve.text(day, C.offer.priceLabel);
}

/** Brackets acquire a field while she writes, then '✓ NOTED' for 1.4 s */
function acquire(name: string, on: boolean) {
  const f = profileForm?.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (f) f.toggleAttribute('data-acquired', on);
}
function noted(name: string) {
  acquire(name, false);
  const stamp = profileForm?.querySelector<HTMLElement>(`[data-field="${name}"] [data-noted]`);
  if (!stamp) return;
  stamp.dataset.on = '';
  window.setTimeout(() => stamp.removeAttribute('data-on'), 1400);
}

const norm = (s: string) => s.trim().toLowerCase();
/** Languages and challenges are several chips plus 'Other'; the agent's comma list replaces the selection */
function setChips(name: 'languages' | 'pain_points', value: string) {
  if (!profileForm) return;
  const parts = value.split(/\s*(?:,|;|\/|\band\b|&)\s*/i).map((s) => s.trim()).filter(Boolean);
  const boxes = $$<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`, profileForm);
  const other: string[] = [];
  boxes.forEach((b) => { b.checked = false; });
  for (const part of parts) {
    const v = norm(part);
    const box = boxes.find((b) => norm(b.value) === v) ?? boxes.find((b) => v.length > 3 && (norm(b.value).includes(v) || v.includes(norm(b.value))));
    if (box) box.checked = true;
    else other.push(part);
  }
  const o = profileForm.elements.namedItem(`${name}_other`);
  if (o instanceof HTMLInputElement) o.value = other.join(', ');
  const fs = profileForm.querySelector(`[data-field="${name}"]`);
  if (fs) flash(fs);
  profileForm.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The clinic name travels: into the application and onto the porcelain */
export function clinicNamed(name: string) {
  const f = applyForm?.elements.namedItem('hotel_name');
  if (f instanceof HTMLInputElement && (!f.value || f.dataset.auto === 'true')) {
    f.value = name;
    f.dataset.auto = 'true';
  }
  porcelain()?.setClinicName?.(name);
}

/** A type of clinic sets the lens (GP → Medical, aesthetics → Aesthetic) */
export function lensFromType(type: string) {
  const match = Object.entries(C.lens.byType).find(([t]) => norm(t) === norm(type) || norm(type).includes(norm(t)));
  if (match) setLens(match[1], 'profile');
}

/* ---------- The application ---------- */

const errorsBox = $('[data-apply-errors]');
const FIELD_ERRORS: Record<string, string> = { name: 'Add your name.', hotel_name: 'Add your clinic’s name.', email: C.apply.errors.email };

export function readApplication(): DemoFields {
  const out: DemoFields = {};
  for (const k of ['name', 'hotel_name', 'email', 'phone', 'preferred_time', 'plan', 'notes'] as const) {
    const v = fieldValue(applyForm, k);
    if (v) out[k] = v;
  }
  return out;
}

function showErrors(fields: string[]) {
  if (!applyForm) return;
  for (const name of ['name', 'hotel_name', 'email']) {
    const input = applyForm.elements.namedItem(name);
    const msg = $(`#a-${name}-err`);
    const bad = fields.includes(name);
    if (input instanceof HTMLInputElement) input.toggleAttribute('aria-invalid', bad);
    if (msg) { msg.hidden = !bad; msg.textContent = bad ? FIELD_ERRORS[name] : ''; }
  }
}

function setPlan(plan: 'founding' | 'groups') {
  const hidden = applyForm?.elements.namedItem('plan');
  const label = plan === 'groups' ? C.apply.plans.groups : C.apply.plans.founding;
  if (hidden instanceof HTMLInputElement) hidden.value = label;
  const line = $('[data-apply-plan]');
  if (line) line.textContent = label;
}

let submitting = false;
/** Validates both steps, qualifies silently, sends, stamps RECEIVED and shows what happens next */
export async function sendApplication(by: 'visitor' | 'agent'): Promise<{ ok: boolean; message: string }> {
  if (!applyForm) return { ok: false, message: 'The application is not on this page.' };
  const fd = new FormData(applyForm);
  const get = (k: string) => String(fd.get(k) ?? '').trim();
  const step1 = { hotel_name: get('hotel_name'), locations: get('locations'), software: get('software'), go_live: get('go_live'), plan: get('plan'), lens: currentLens() };
  const step2 = { name: get('name'), role: get('role'), email: get('email'), phone: get('phone'), whatsapp: fd.has('whatsapp'), preferred_time: get('preferred_time'), notes: get('notes'), consent: fd.has('consent') };
  const missing = missingFields(step1, step2, C.voice.nameLabel);
  if (missing.length) {
    const bad = [!step2.name && 'name', !step1.hotel_name && 'hotel_name', (!step2.email || !EMAIL_RE.test(step2.email)) && 'email'].filter(Boolean) as string[];
    showErrors(bad);
    if (errorsBox) {
      errorsBox.textContent = missingMessage(missing);
      errorsBox.hidden = false;
    }
    if (by === 'visitor') applyForm.querySelector<HTMLElement>('[aria-invalid]')?.focus();
    track('application_step', { step: 'missing', count: missing.length });
    return { ok: false, message: `Cannot submit yet. Missing: ${missing.join(', ')}.` };
  }
  if (submitting) return { ok: false, message: C.apply.sending };
  submitting = true;
  showErrors([]);
  if (errorsBox) errorsBox.hidden = true;
  const button = $<HTMLButtonElement>('[data-apply-submit]');
  const label = button?.firstChild?.textContent ?? C.apply.submit;
  if (button) { button.disabled = true; button.firstChild!.textContent = C.apply.sending; }

  const counts = ledgerCounts('clinics');
  const q = qualify({ role: step2.role, locations: step1.locations, go_live: step1.go_live, open: counts.open });
  const result = await submitApplication({
    industry: 'clinics',
    step1,
    step2,
    hotel_profile: readProfile(),
    roi: lastRoi,
    qualification: q,
    submitted_at: new Date().toISOString(),
    conversation_id: voice.conversationId,
    notes: letterText(),
  });
  submitting = false;
  if (button) { button.disabled = false; button.firstChild!.textContent = label; }

  if (!result.ok) {
    // Focus goes to the note only when the visitor sent it: the agent's submit never takes their focus
    if (errorsBox) { errorsBox.textContent = C.apply.errors.network; errorsBox.hidden = false; if (by === 'visitor') errorsBox.focus(); }
    track('application_step', { step: 'failed' });
    return { ok: false, message: C.apply.errors.network };
  }

  const stamp = $('[data-received]');
  if (stamp) { stamp.textContent = C.applyExtras.received(fmtHM(clock.now().minutes, false)); stamp.hidden = false; }
  const box = $('[data-apply-result]');
  const url = q.qualified ? meetingsUrl('clinics') : null;
  if (box) {
    box.hidden = false;
    const meetings = $('[data-meetings]', box);
    if (meetings && url) {
      meetings.hidden = false;
      const frame = $('[data-meetings-frame]', meetings);
      if (frame && !frame.querySelector('iframe')) {
        const iframe = document.createElement('iframe');
        iframe.src = `${url}${url.includes('?') ? '&' : '?'}embed=true`;
        iframe.title = C.apply.meetings.frameTitle;
        iframe.loading = 'lazy';
        frame.append(iframe);
      }
      $<HTMLAnchorElement>('[data-meetings-link]', meetings)?.setAttribute('href', url);
      const reply = $('[data-result-reply]', box);
      if (reply) reply.hidden = true;
    }
    if (by === 'visitor') box.focus();
  }
  void marginNote('apply', C.transcript.activity.sent);
  track('application_submitted', { qualified: q.qualified, meetings: !!url });
  if (by === 'visitor') voice.contextUpdate(`The visitor submitted the application form themselves: ${JSON.stringify({ ...step1, ...step2 })}.`);
  return { ok: true, message: `Application received for ${step2.name} (${step2.email}).` };
}

/** HubSpot's meetings embed reports a booking with postMessage */
addEventListener('message', (e) => {
  const data = e.data as { meetingBookSucceeded?: boolean; meetingsPayload?: { bookingResponse?: { event?: { dateTime?: number } } } } | null;
  if (!data?.meetingBookSucceeded || !/hubspot/.test(e.origin)) return;
  const at = data.meetingsPayload?.bookingResponse?.event?.dateTime;
  const when = at ? new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const heading = $('[data-result-heading]');
  const text = $('[data-result-text]');
  if (heading) heading.textContent = C.apply.success.bookedHeading;
  if (text && when) text.textContent = C.apply.success.booked(when);
  track('meeting_booked');
});

/* ---------- The notes letter ---------- */

interface LetterSection { title: string; lines: string[] }

export function letterSections(withTranscript: boolean): LetterSection[] {
  const L = C.letter.sections;
  const p = readProfile();
  const lab = C.profile.labels;
  const { open, close } = clinicHours();
  const lens = currentLens();
  const out: LetterSection[] = [];
  const profile = [
    p.hotel_name && `${lab.hotel_name}: ${p.hotel_name}`,
    p.hotel_type && `${lab.hotel_type}: ${p.hotel_type}`,
    p.rooms && `${lab.rooms}: ${p.rooms}`,
    p.monthly_calls && `${lab.monthly_calls}: ${n0(Number(p.monthly_calls))}`,
    p.languages && `${lab.languages}: ${p.languages}`,
    p.pain_points && `${lab.pain_points}: ${p.pain_points}`,
    `Hours: ${fmtHM(open, false)}–${fmtHM(close, false)}`,
    `Read as: ${C.lens.labels[lens]}`,
  ].filter(Boolean) as string[];
  out.push({ title: L.profile, lines: profile });

  const r = lastRoi;
  const { revenue: full, config } = roiFor();
  if (r) {
    const m = minutes(r, config);
    out.push({
      title: L.estimate,
      lines: [
        `${A.calls}: ${n0(r.calls)}`,
        full && `${A.recovered}: ${n0(r.recovered)}`,
        full && `${A.revenue}: ${fmtMoney(r.revenue)} a month`,
        `${A.hours}: ${n0(r.hours)} h`,
        `${A.outOfHours}: ${A.outOfHoursValue(outOfHours(open, close))}`,
        full && r.revenue > 0 && `${A.payback}: ${A.paybackValue(paybackDays(C.offer.price, r.revenue))}`,
        full && `${A.minutes}: ${A.minutesValue(n0(m.missedOnly), n0(m.every))}; ${A.included}`,
        C.roi.disclaimer,
      ].filter(Boolean) as string[],
    });
  } else out.push({ title: L.estimate, lines: [C.roi.note] });

  const titles = C.dial.items.map((it) => (typeof it.title === 'string' ? it.title : it.title[lens]));
  const answered = record.asked.filter((a) => a.route === 'administrative').map((a) => `Answered on The Line: “${a.q}”`);
  out.push({ title: L.handled, lines: [...titles, ...answered] });
  out.push({ title: L.handedOff, lines: [...C.line.stays, ...record.handoffs.map((h) => `${h.topic}: ${h.summary}`)] });
  if (record.recommendation) {
    const rec = record.recommendation;
    out.push({ title: L.recommendation, lines: [rec.plan === 'groups' ? C.offer.groupsNote : `${C.apply.plans.founding}, ${C.licence.price}`, rec.reason].filter(Boolean) });
  }
  out.push({ title: L.next, lines: [C.letter.nextStep, C.offer.guarantee] });
  if (record.handoffs.length) out.push({ title: L.log, lines: record.handoffs.map((h) => `${h.time} · ${C.line.handoffPrefix} · ${h.topic}. ${h.summary}`) });
  if (withTranscript) {
    const lines = $$('[data-log-thread] li').flatMap((li) => {
      const t = (li.querySelector('.log-text')?.textContent ?? li.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!t || li.dataset.who === 'typing') return [];
      const who = li.dataset.who === 'user' ? C.transcript.you : li.dataset.who === 'agent' ? C.transcript.her : '§';
      return [`${who}: ${t}`];
    });
    if (lines.length) out.push({ title: L.transcript, lines });
  }
  return out;
}

const stamp = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Plain text of the letter: for copying, email and the application's notes */
export function letterText(withTranscript = true): string {
  const head = [C.letter.title, C.letter.intro, stamp()].join('\n');
  return [head, ...letterSections(withTranscript).map((s) => `${s.title.toUpperCase()}\n${s.lines.map((l) => `- ${l}`).join('\n')}`)].join('\n\n');
}

/* ---------- The presenter ---------- */

const PLAN: Partial<Record<string, 'founding' | 'groups'>> = { starter: 'founding', professional: 'founding', enterprise: 'groups' };

export const presenter: Presenter = {
  navigate: (section, fromAgent) => nav.goTo(String(section || '').toLowerCase(), fromAgent),

  // The tools move the page (navigate) before calling these hands, and wait on their promises for the typing
  async setProfile(f) {
    if (!profileForm) return [];
    const names: string[] = [];
    const jobs: Promise<unknown>[] = [];
    for (const key of ['hotel_name', 'hotel_type', 'rooms', 'monthly_calls'] as const) {
      const v = f[key];
      if (v === undefined || v === null || v === '') continue;
      acquire(key, true);
      const r = setField(profileForm, key, v);
      if (r === false) { acquire(key, false); continue; }
      names.push(key);
      jobs.push(Promise.resolve(r).then(() => noted(key)));
    }
    for (const key of ['languages', 'pain_points'] as const) {
      const v = f[key];
      if (!v) continue;
      setChips(key, String(v));
      names.push(key);
      noted(key);
    }
    if (f.hotel_name) clinicNamed(String(f.hotel_name));
    if (f.hotel_type) lensFromType(String(f.hotel_type));
    pendingTyping = Promise.all(jobs).then(renderAccount);
    renderAccount();
    if (names.length) void marginNote('profile', ACT.profile(''));
    // Resolves when her typing is done, so the tools' typist knows when the form is complete
    await pendingTyping;
    return names;
  },

  readProfile,

  async showRoi() {
    await pendingTyping;
    renderAccount();
    const account = $('[data-account]');
    if (account) flash(account);
    const ring = $('[data-detour-ring]');
    if (ring && !ring.hidden) {
      ring.removeAttribute('data-ring');
      void ring.offsetWidth;
      ring.dataset.ring = '';
    }
    void marginNote('profile', C.transcript.activity.roi);
    track('roi_shown', { lens: currentLens() });
  },

  spotlight(key: FeatureKey) {
    const item = $(`[data-feature="${key}"]`);
    if (!item) return false;
    $$('[data-feature].spotlight').forEach((e) => e.classList.remove('spotlight'));
    item.classList.add('spotlight');
    porcelain()?.setLithophane?.(key);
    document.dispatchEvent(new CustomEvent('dial:select', { detail: { key, fromAgent: true } }));
    void marginNote('features', C.transcript.activity.showing(C.features[key].title));
    return true;
  },

  recommend(plan: PlanKey, reason?: string) {
    const key = PLAN[String(plan).toLowerCase()];
    if (!key) return false;
    const target = $(`[data-plan="${key}"]`);
    if (!target) return false;
    $$('[data-plan]').forEach((p) => p.classList.toggle('recommended', p === target));
    const why = String(reason ?? '').trim();
    const line = $('[data-plan-reason]', target);
    if (line) {
      line.textContent = why ? (key === 'founding' ? C.licence.recommend(why) : `${C.apply.plans.groups}: ${why}`) : '';
      line.hidden = !why;
    }
    setPlan(key);
    record.recommendation = { plan: key, reason: why };
    if (key === 'founding') {
      const plate = $('[data-plate]');
      if (plate) {
        plate.classList.remove('sweep');
        void plate.offsetWidth;
        plate.classList.add('sweep');
      }
      document.dispatchEvent(new CustomEvent('licence:mark'));
    }
    void marginNote('pricing', why && key === 'founding' ? C.licence.recommend(why) : key === 'founding' ? C.transcript.activity.founding : C.transcript.activity.groups);
    return true;
  },

  async fillApplication(f) {
    const filled: string[] = [];
    const jobs: Promise<unknown>[] = [];
    if (applyForm) {
      for (const k of ['hotel_name', 'name', 'email', 'phone', 'preferred_time', 'notes'] as const) {
        const r = setField(applyForm, k, f[k]);
        if (r === false) continue;
        filled.push(k);
        jobs.push(Promise.resolve(r));
      }
      if (f.plan) {
        setPlan(/group|enterprise/i.test(f.plan) ? 'groups' : 'founding');
        filled.push('plan');
      }
    }
    pendingTyping = Promise.all(jobs);
    if (filled.length) void marginNote('apply', C.transcript.activity.filled);
    track('application_step', { step: 'filled_by_agent' });
    await pendingTyping;
    return { filled, missing: missingFields({ ...readApplication() }, {}, C.voice.nameLabel) };
  },

  readApplication,

  async submitApplication() {
    await pendingTyping;
    return sendApplication('agent');
  },

  handoff(topic: string, summary: string) {
    pushHandoff(topic || 'CLINICAL', summary);
  },
};

export const roiSentence = () => roiSummary(readProfile(), roiFor().config, { revenueWording: C.voice.revenueWording, unitsPlural: C.voice.unitsPlural, licencePrice: C.offer.price });
