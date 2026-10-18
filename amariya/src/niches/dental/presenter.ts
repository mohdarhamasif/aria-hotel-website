// The day sheet's hands for the agent (contract 7's Presenter): navigation with the polite rule, the intake slip and
// THE TALLY, the feature spotlight, the plan lines, and the two-step application. The pure helpers at the top are the
// page's time maths (scenes, the now line, the story's beats, the ruler) and are shared with ui.ts and the check.
import { voice, type DemoFields, type FeatureKey, type PlanKey, type Presenter, type ProfileFields } from '../../scripts/voice/bridge';
import { content } from '../../data/content/dental';
import { given, type DentalScene } from '../../data/content/types';
import { countUp, flash, setField } from '../../scripts/text';
import { computeRoi, fmtMoney, minutes as minutesOf, paybackDays, roiSummary } from '../../scripts/apply/roi';
import { EMAIL_RE, missingFields, missingMessage } from '../../scripts/apply/validate';
import { qualify } from '../../scripts/apply/qualify';
import { ledgerCounts, meetingsUrl, submitApplication } from '../../scripts/apply/adapter';
import { createNavigator, scroll } from '../../scripts/motion/scroll';
import { track } from '../../scripts/analytics';
import type { PearlApi } from './scene/types';

const C = content;

/* ---------- Pure helpers (scratchpad check-dental.mjs runs these) ---------- */

/** 'HH:MM' → minutes since midnight */
export const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** [from, to) in minutes, wrapping past midnight */
const inBand = (m: number, a: number, b: number) => (a <= b ? m >= a && m < b : m >= a || m < b);

/** The opening scene for the visitor's time */
export function sceneAt(minutes: number, scenes: readonly DentalScene[] = C.scenes): DentalScene {
  return scenes.find((s) => inBand(minutes, hm(s.from), hm(s.to))) ?? scenes[0];
}

/** The slot the scene's call books: past `lateAfter` the afternoon's 3:40 pm has gone, so it is tomorrow's 8:10 */
export function bookedFor(scene: DentalScene, minutes: number): { time: string; label: string; lang?: string; call: string } {
  if (scene.late && scene.lateAfter && minutes >= hm(scene.lateAfter)) return { ...scene.late };
  return { ...scene.booked, call: scene.call };
}

/** 21:00–05:59 is night: the clause turns to 'Your team sleeps.' */
export const isNight = (minutes: number) => minutes >= 21 * 60 || minutes < 6 * 60;

export interface TimeAnchor { t: number; y: number }

/**
 * A time's place on the sheet, linear between the two anchors around it (minutes, document px, sorted by time).
 * null outside the first and last anchors: the now line then waits at the sheet's foot, 'after hours'.
 */
export function timeToY(anchors: readonly TimeAnchor[], t: number): number | null {
  if (anchors.length < 2 || t < anchors[0].t || t > anchors[anchors.length - 1].t) return null;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (t <= b.t) return b.t === a.t ? b.y : a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t);
  }
  return anchors[anchors.length - 1].y;
}

/** Ruler labels at least `gap` px apart, kept inside [top, bottom] (pushed down, then back up from the foot) */
export function spread(ys: readonly number[], gap: number, top: number, bottom: number): number[] {
  const out = ys.map((y) => Math.max(top, Math.min(bottom, y)));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  if (out.length) out[out.length - 1] = Math.min(out[out.length - 1], bottom);
  for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gap);
  return out;
}

/** What the pinned story shows at progress p (0–1): a change at every tenth */
export interface StoryState {
  beat: 1 | 2 | 3;
  /** .1 the setting ring draws around the cradle */
  ring: boolean;
  /** .2 the call is answered and its seconds run */
  answered: boolean;
  /** .3 Amariya answers in their language; .33–.64 greetings roll off the pearl */
  greet: boolean;
  /** .4 the listening halo */
  halo: boolean;
  /** .7 the hairline draws down the lane; .8 the slot's pearl is born; .9 the clause */
  line: boolean;
  born: boolean;
  clause: boolean;
  /** The call timer: 0 → 132 s (2:32:00 → 2:34:12) */
  seconds: number;
}
export function storyState(p: number): StoryState {
  const q = Math.max(0, Math.min(1, p));
  return {
    beat: q >= 0.66 ? 3 : q >= 0.3 ? 2 : 1,
    ring: q >= 0.1,
    answered: q >= 0.2,
    greet: q >= 0.33 && q < 0.64,
    halo: q >= 0.4 && q < 0.66,
    line: q >= 0.7,
    born: q >= 0.8,
    clause: q >= 0.9,
    seconds: Math.round(q * 132),
  };
}

/** '2:32:07 pm' or '14:32:07': the visitor's minute with the call's seconds */
export function clockWithSeconds(minutes: number, seconds: number, twelve: boolean): string {
  const total = ((Math.floor(minutes) * 60 + seconds) % 86400 + 86400) % 86400;
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return twelve ? `${h % 12 || 12}:${two(m)}:${two(s)} ${h < 12 ? 'am' : 'pm'}` : `${two(h)}:${two(m)}:${two(s)}`;
}

/** The tally's figures for a profile, or null (blank baselines) */
export function tallyFor(p: ProfileFields) {
  const r = computeRoi(p, C.voice.roi);
  if (!r) return null;
  const m = minutesOf(r, C.voice.roi);
  const n0 = (n: number) => n.toLocaleString('en-US');
  return {
    roi: r,
    calls: r.calls,
    missed: Math.round(r.calls * C.voice.roi.missedCallRate),
    recovered: r.recovered,
    revenue: r.revenue,
    hours: r.hours,
    payback: r.revenue > 0 ? paybackDays(C.offer.price, r.revenue) : null,
    minutes: `${n0(m.missedOnly)}–${n0(m.every)}`,
  };
}

/** How long a scripted call runs under playScript's timings (typing, 75 ms a word, the hold after each line), in s */
export function callSeconds(lines: readonly { who: 'g' | 'a'; text: string }[]): number {
  const ms = lines.slice(1).reduce((t, l) => t + (l.who === 'a' ? 1200 + l.text.split(' ').length * 75 : 800) + 900 + 22 * l.text.length, 900 + 22 * (lines[0]?.text.length ?? 0));
  return Math.round(ms / 1000);
}

/** The practice type a spoken answer means ('ortho', 'a kids practice' → Pediatric is not guessed; exact words are) */
export function matchType(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const norm = (s: string) => s.toLowerCase();
  return C.practiceTypes.find((t) => norm(t.hotelType) === v || norm(t.chip) === v)
    ?? C.practiceTypes.find((t) => v.includes(norm(t.chip)) || norm(t.hotelType).includes(v) || v.includes(norm(t.hotelType)))
    ?? null;
}

/* ---------- DOM helpers ---------- */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const pearl = (): PearlApi | undefined => window.amariyaPearl;
/** The visitor touched the page in the last 2.5 s: the agent offers moves instead of making them */
export const reading = () => Date.now() - scroll.lastUserInput < 2500;
const n0 = (n: number) => n.toLocaleString('en-US');

/* ---------- Navigation: chapters, the working day's entries and the agent's section names ---------- */

const entries = C.workingDay.entries;
const map: Record<string, string> = {
  welcome: 'welcome', profile: 'profile', features: entries[0].id, pricing: 'pricing', demo: 'apply', apply: 'apply', faq: 'faq', close: 'close', footer: 'close',
};
for (const c of C.chapters) map[c.id] ??= c.id;
for (const e of entries) map[e.id] = e.id;

const labels: Record<string, string> = {};
for (const [name, id] of Object.entries(map)) {
  const section = C.voice.sectionLabels[name as keyof typeof C.voice.sectionLabels];
  const entry = entries.find((e) => e.id === id);
  const chapter = C.chapters.find((c) => c.id === id);
  if (section) {
    const [time, ...rest] = section.split(', ');
    labels[name] = C.follow(time, rest.join(', '));
  } else if (entry) labels[name] = C.follow(entry.time, entry.title.toLowerCase());
  else if (chapter) labels[name] = C.follow(chapter.time, chapter.title.toLowerCase());
}

export const nav = createNavigator(map, {
  // The bar and the ruler are the page's scroll-padding, an entry's own landing its scroll-margin (dental.css)
  offset: () => 0,
  labels,
  onFollow: (section, label) => voice.follow(section, label),
});

/* ---------- 08:40: the intake slip and THE TALLY ---------- */

const profileForm = $<HTMLFormElement>('form[data-profile]');
const applyForm = $<HTMLFormElement>('form[data-apply]');
let pendingTyping: Promise<unknown> = Promise.resolve();
let roiShown = false;

function fieldOf(form: HTMLFormElement | null, name: string) {
  const f = form?.elements.namedItem(name);
  return f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement || f instanceof HTMLSelectElement ? f : null;
}
const valueOf = (form: HTMLFormElement | null, name: string) => {
  const f = form?.elements.namedItem(name);
  if (f instanceof RadioNodeList) return [...f].find((r): r is HTMLInputElement => r instanceof HTMLInputElement && r.checked)?.value ?? '';
  return fieldOf(form, name)?.value.trim() ?? '';
};

export function readProfile(): ProfileFields {
  const out: ProfileFields = {};
  if (!profileForm) return out;
  const name = valueOf(profileForm, 'hotel_name');
  const type = valueOf(profileForm, 'hotel_type');
  const rooms = Number(valueOf(profileForm, 'rooms'));
  const calls = Number(valueOf(profileForm, 'monthly_calls'));
  const languages = valueOf(profileForm, 'languages');
  const pains = valueOf(profileForm, 'pain_points');
  if (name) out.hotel_name = name;
  if (type) out.hotel_type = type;
  if (rooms > 0) out.rooms = rooms;
  if (calls > 0) out.monthly_calls = calls;
  if (languages) out.languages = languages;
  if (pains) out.pain_points = pains;
  return out;
}

function setFigure(key: string, value: number | null, fmt: (n: number) => string) {
  const el = $(`[data-tally="${key}"]`), sr = $(`[data-tally-sr="${key}"]`);
  if (!el || !sr) return;
  el.closest('.tally-row')?.toggleAttribute('data-filled', value !== null);
  if (value === null) {
    el.replaceChildren();
    delete el.dataset.value;
    sr.textContent = '';
    return;
  }
  sr.textContent = fmt(value);
  // Boska's tabular figures keep every digit's width while it counts
  countUp(el, value, { format: fmt });
}

const setText = (sel: string, text: string) => {
  const el = $(sel);
  if (el && el.textContent !== text) el.textContent = text;
};

/** Re-renders the tally from the slip: blank baselines until there is input, never a dash */
export function renderTally() {
  const t = tallyFor(readProfile());
  const money = (n: number) => fmtMoney(n);
  setFigure('calls', t?.calls ?? null, n0);
  setFigure('missed', t?.missed ?? null, n0);
  setFigure('recovered', t?.recovered ?? null, n0);
  setFigure('revenue', t?.revenue ?? null, money);
  setFigure('hours', t?.hours ?? null, (n) => `${n0(n)} h`);
  setText('[data-tally-payback]', t?.payback ? C.tally.payback(t.payback) : '');
  const rate = given(C.roi.overageRate);
  setText('[data-tally-minutes]', t ? C.tally.minutes(t.minutes) + (rate ? ` (${rate})` : '') : '');
  setText('[data-tally-basis]', t ? C.roi.basis(t.calls, t.roi.estimatedCalls, Math.round(C.voice.roi.missedCallRate * 100), fmtMoney(C.voice.roi.avgBookingValue)) : '');
  const note = $('[data-tally-note]');
  if (note) note.hidden = !!t;
  $('aside[data-tally]')?.toggleAttribute('data-filled', !!t);
  if (t && !roiShown) {
    roiShown = true;
    track('roi_shown', { chairs: Number(readProfile().rooms) || 0 });
  }
}

/** The practice name travels: onto the sheet's header and into the application */
function practiceNamed(name: string) {
  const line = $('[data-practice-name]');
  if (line) {
    line.textContent = name || line.dataset.placeholder || '';
    line.toggleAttribute('data-empty', !name);
  }
  prefill('hotel_name', name);
}

/** Copies a profile value into the application unless the visitor has written their own there */
function prefill(name: string, value: string) {
  const f = fieldOf(applyForm, name);
  if (!f || (f.value && f.dataset.auto !== 'true')) return;
  f.value = value;
  f.dataset.auto = 'true';
}

let profileDebounce = 0;
profileForm?.addEventListener('input', (e) => {
  const p = readProfile();
  renderTally();
  practiceNamed(p.hotel_name ?? '');
  if (p.rooms) prefill('chairs', String(p.rooms));
  document.dispatchEvent(new CustomEvent('sheet:profile', { detail: p }));
  // Only the visitor's own edits are reported (her typing dispatches untrusted events)
  if (!e.isTrusted) return;
  clearTimeout(profileDebounce);
  profileDebounce = window.setTimeout(() => {
    voice.contextUpdate(`The visitor edited their practice profile by hand: ${JSON.stringify(readProfile())}. ${roiSummary(readProfile(), C.voice.roi, C.voice)}`);
  }, 1200);
});
// A chip is a radio: 'change' covers keyboard and pointer alike
profileForm?.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.name !== 'hotel_type') return;
  const type = C.practiceTypes.find((p) => p.hotelType === t.value);
  if (type) document.dispatchEvent(new CustomEvent('sheet:type', { detail: { id: type.id } }));
  if (e.isTrusted && type) voice.contextUpdate(`The visitor chose "${type.hotelType}" as their kind of practice on the sheet.`);
});
// The slip never submits anywhere: Enter in a field just moves on
profileForm?.addEventListener('submit', (e) => e.preventDefault());

/* ---------- 18:00: the application ---------- */

const FIELD_ERRORS: Record<string, string> = { name: 'Add your name.', hotel_name: 'Add your practice’s name.', email: C.apply.errors.email };
const STEP1 = ['name', 'role', 'hotel_name', 'software', 'email', 'phone', 'preferred_time', 'notes', 'plan'] as const;
const STEP2 = ['answers', 'chairs', 'locations', 'go_live'] as const;

export function readApplication(): DemoFields {
  const out: DemoFields = {};
  for (const k of ['name', 'hotel_name', 'email', 'phone', 'preferred_time', 'plan', 'notes'] as const) {
    const v = valueOf(applyForm, k);
    if (v) out[k] = v;
  }
  return out;
}

/** Shows step 1 or 2; the hidden step is disabled so its fields stay out of the tab order */
export function showStep(n: 1 | 2, focus = false) {
  if (!applyForm) return;
  applyForm.dataset.step = String(n);
  $$<HTMLFieldSetElement>('[data-apply-step]', applyForm).forEach((f) => {
    const on = f.dataset.applyStep === String(n);
    f.hidden = !on;
    f.disabled = !on;
  });
  if (focus) $<HTMLElement>(`[data-apply-step="${n}"] :is(input:not([type=hidden]), select, textarea)`, applyForm)?.focus();
}

function showErrors(bad: string[], summary: string) {
  if (!applyForm) return;
  for (const name of ['name', 'hotel_name', 'email']) {
    const f = fieldOf(applyForm, name);
    const msg = $(`#a-${name}-err`);
    const on = bad.includes(name);
    f?.toggleAttribute('aria-invalid', on);
    if (msg) {
      msg.hidden = !on;
      const email = name === 'email' && on && f?.value.trim() ? missingMessage(['a valid email address']) : '';
      msg.textContent = on ? email || FIELD_ERRORS[name] : '';
    }
  }
  const box = $('[data-apply-errors]', applyForm);
  if (box) {
    box.textContent = summary;
    box.hidden = !summary;
  }
}

/** Step 1's required fields, as the fields to mark and the agent's wording */
function step1Missing() {
  const s1 = Object.fromEntries(STEP1.map((k) => [k, valueOf(applyForm, k)]));
  const missing = missingFields(s1, undefined, C.voice.nameLabel);
  const bad = [!s1.name && 'name', !s1.hotel_name && 'hotel_name', (!s1.email || !EMAIL_RE.test(s1.email)) && 'email'].filter(Boolean) as string[];
  return { s1, missing, bad };
}

function setPlan(plan: 'founding' | 'groups') {
  const label = plan === 'groups' ? C.apply.plans.groups : C.apply.plans.founding;
  const hidden = fieldOf(applyForm, 'plan');
  if (hidden) hidden.value = label;
  setText('[data-apply-plan]', label);
}

let submitting = false;
async function send(by: 'visitor' | 'agent'): Promise<{ ok: boolean; message: string }> {
  if (!applyForm) return { ok: false, message: 'The application is not on this page.' };
  const { s1, missing, bad } = step1Missing();
  if (missing.length) {
    showStep(1);
    showErrors(bad, missingMessage(missing));
    if (by === 'visitor') $<HTMLElement>('[aria-invalid]', applyForm)?.focus();
    track('application_step', { step: 'missing', count: missing.length });
    return { ok: false, message: `Cannot submit yet. Missing: ${missing.join(', ')}.` };
  }
  if (submitting) return { ok: false, message: C.apply.sending };
  submitting = true;
  showErrors([], '');
  const s2: Record<string, string | boolean> = Object.fromEntries(STEP2.map((k) => [k, valueOf(applyForm, k)]));
  s2.consent = !!(applyForm.elements.namedItem('consent') as HTMLInputElement | null)?.checked;
  const button = $<HTMLButtonElement>('[data-apply-submit]', applyForm);
  const label = $('[data-submit-label]', applyForm);
  if (button) button.disabled = true;
  if (label) label.textContent = C.apply.sending;

  const profile = readProfile();
  const q = qualify({ role: s1.role, locations: s2.locations as string, go_live: s2.go_live as string, open: ledgerCounts('dental').open });
  const result = await submitApplication({
    industry: 'dental',
    step1: s1,
    step2: s2,
    hotel_profile: profile,
    roi: computeRoi(profile, C.voice.roi),
    qualification: q,
    submitted_at: new Date().toISOString(),
    conversation_id: voice.conversationId,
    notes: s1.notes || undefined,
  });
  submitting = false;
  if (button) button.disabled = false;
  if (label) label.textContent = C.apply.submit;

  if (!result.ok) {
    showErrors([], C.apply.errors.network);
    // Focus goes to the note only when the visitor sent it: the agent's submit never takes their focus
    if (by === 'visitor') $<HTMLElement>('[data-apply-errors]', applyForm)?.focus();
    track('application_step', { step: 'failed' });
    return { ok: false, message: C.apply.errors.network };
  }

  const box = $('[data-apply-result]');
  const duplicate = result.message !== 'Application received.';
  if (box) {
    applyForm.hidden = true;
    box.hidden = false;
    setText('[data-result-heading]', C.applySlip.status.received);
    setText('[data-result-text]', duplicate ? C.apply.errors.duplicate : C.apply.success.text);
    const url = q.qualified ? meetingsUrl('dental') : null;
    const meet = $('[data-meetings]', box);
    if (meet && q.qualified) {
      meet.hidden = false;
      const frame = $('[data-meetings-frame]', meet);
      if (url && frame && !frame.querySelector('iframe')) {
        const iframe = document.createElement('iframe');
        iframe.src = `${url}${url.includes('?') ? '&' : '?'}embed=true`;
        iframe.title = frame.dataset.title ?? '';
        iframe.loading = 'lazy';
        frame.replaceChildren(iframe);
        frame.dataset.live = '';
      }
      const link = $<HTMLAnchorElement>('[data-meetings-link]', meet);
      if (link && url) { link.href = url; link.hidden = false; }
      if (url) { const reply = $('[data-result-reply]', box); if (reply) reply.hidden = true; }
    }
    if (by === 'visitor') box.focus();
  }
  track('application_submitted', { qualified: q.qualified, meetings: !!(q.qualified && meetingsUrl('dental')) });
  document.dispatchEvent(new CustomEvent('sheet:applied'));
  if (by === 'visitor') voice.contextUpdate(`The visitor submitted the application form themselves: ${JSON.stringify({ ...s1, ...s2 })}.`);
  return { ok: true, message: `Application received for ${s1.name} (${s1.email}).` };
}

/** Step 1 → step 2, once the slip has a name, a practice and a valid email */
function nextStep() {
  const { missing, bad } = step1Missing();
  if (missing.length) {
    showErrors(bad, missingMessage(missing));
    $<HTMLElement>('[aria-invalid]', applyForm ?? document)?.focus();
    return;
  }
  showErrors([], '');
  showStep(2, true);
  track('application_step', { step: 2 });
}
applyForm?.addEventListener('click', (e) => {
  const t = e.target as Element;
  if (t.closest('[data-apply-next]')) nextStep();
  else if (t.closest('[data-apply-back]')) showStep(1, true);
});
// Enter in a step-1 field moves on to step 2 (the hidden step's submit button cannot take it)
applyForm?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || applyForm.dataset.step !== '1' || !(e.target instanceof HTMLInputElement)) return;
  e.preventDefault();
  nextStep();
});
applyForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  void send('visitor');
});
// A field written by hand stops being prefilled from the profile
applyForm?.addEventListener('input', (e) => {
  const f = e.target as HTMLElement;
  if (e.isTrusted && f.dataset.auto) delete f.dataset.auto;
});

/** HubSpot's meetings page reports a booking: only then does the slip say 'Call booked' */
addEventListener('message', (e) => {
  const data = e.data as { meetingBookSucceeded?: boolean; meetingsPayload?: { bookingResponse?: { event?: { dateTime?: number } } } } | null;
  if (!data?.meetingBookSucceeded || !/hubspot/.test(e.origin)) return;
  const at = data.meetingsPayload?.bookingResponse?.event?.dateTime;
  const when = at ? new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  setText('[data-result-heading]', C.applySlip.status.booked);
  if (when) setText('[data-result-text]', C.apply.success.booked(when));
  track('meeting_booked');
});

/* ---------- The presenter ---------- */

const PLAN: Partial<Record<string, 'founding' | 'groups'>> = { starter: 'founding', professional: 'founding', enterprise: 'groups' };
/** Numbers only: a number field would drop '5 chairs' to nothing */
const digits = (v: unknown) => String(v ?? '').match(/\d[\d,]*/)?.[0].replace(/,/g, '') ?? '';

export const presenter: Presenter = {
  navigate: (section, fromAgent) => nav.goTo(String(section || '').trim().toLowerCase(), fromAgent),

  async setProfile(f) {
    if (!profileForm) return [];
    const names: string[] = [];
    const jobs: Promise<unknown>[] = [];
    const values: Record<string, unknown> = { ...f };
    if (f.rooms !== undefined) values.rooms = digits(f.rooms);
    if (f.monthly_calls !== undefined) values.monthly_calls = digits(f.monthly_calls);
    if (f.hotel_type) values.hotel_type = matchType(String(f.hotel_type))?.hotelType ?? f.hotel_type;
    for (const key of ['hotel_name', 'hotel_type', 'rooms', 'monthly_calls', 'languages', 'pain_points'] as const) {
      const r = setField(profileForm, key, values[key]);
      if (r === false) continue;
      names.push(key);
      jobs.push(Promise.resolve(r));
    }
    pendingTyping = Promise.all(jobs).then(renderTally);
    // Resolves when her typing is done, so the tools know when the slip is complete
    await pendingTyping;
    return names;
  },

  readProfile,

  async showRoi() {
    await pendingTyping;
    renderTally();
    const tally = $('aside[data-tally]');
    if (tally) flash(tally);
  },

  spotlight(key: FeatureKey) {
    const entry = $(`[data-feature="${key}"]`);
    if (!entry) return false;
    $$('[data-feature].spotlight').forEach((e) => e.classList.remove('spotlight'));
    entry.classList.add('spotlight');
    document.dispatchEvent(new CustomEvent('sheet:open', { detail: { id: entry.id, spotlight: true } }));
    const recess = $<HTMLElement>(`[data-slot="${entry.id}"]`, entry);
    const p = pearl();
    // While the visitor is reading, the follow note offers the move instead (navigate already showed it)
    if (!reading()) {
      if (p && recess) void p.carryTo(recess);
      else nav.goTo(entry.id, false);
    }
    const title = entries.find((e) => e.id === entry.id)?.title ?? C.features[key].title;
    voice.activity(C.transcript.activity.showing(`${entry.dataset.time}, ${title.toLowerCase()}`));
    return true;
  },

  recommend(plan: PlanKey, reason?: string) {
    const key = PLAN[String(plan).toLowerCase()];
    const target = key ? $(`[data-plan="${key}"]`) : null;
    if (!key || !target) return false;
    $$('[data-plan]').forEach((p) => p.classList.toggle('lit', p === target));
    $$<HTMLElement>('[data-plan-reason]').forEach((r) => { r.hidden = true; r.textContent = ''; });
    const why = String(reason ?? '').trim();
    const note = $('[data-plan-reason]', target);
    if (note && why) {
      note.textContent = C.licenceLine.recommend(why);
      note.hidden = false;
    }
    setPlan(key);
    const mark = key === 'founding' ? $<HTMLElement>('.seat[data-seat="open"]') : $<HTMLElement>('[data-groups-mark]');
    const p = pearl();
    if (mark && p && !reading()) void p.carryTo(mark);
    return true;
  },

  async fillApplication(f) {
    const filled: string[] = [];
    const jobs: Promise<unknown>[] = [];
    if (applyForm) {
      if (!applyForm.hidden) showStep(1);
      for (const k of ['name', 'hotel_name', 'email', 'phone', 'preferred_time', 'notes'] as const) {
        const field = fieldOf(applyForm, k);
        if (field && f[k]) delete field.dataset.auto;
        const r = setField(applyForm, k, f[k]);
        if (r === false) continue;
        filled.push(k);
        jobs.push(Promise.resolve(r));
      }
      if (f.plan) {
        setPlan(/enterprise|group/i.test(f.plan) ? 'groups' : 'founding');
        filled.push('plan');
      }
    }
    pendingTyping = Promise.all(jobs);
    track('application_step', { step: 'filled_by_agent' });
    await pendingTyping;
    return { filled, missing: missingFields({ ...readApplication() }, undefined, C.voice.nameLabel) };
  },

  readApplication,

  async submitApplication() {
    await pendingTyping;
    return send('agent');
  },
};
