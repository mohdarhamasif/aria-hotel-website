// The page's hands for Amariya's tools on /hotels (the Presenter contract), and the page actions the visitor's own
// input shares with them: rendering the house from the property card, the morning handover, the registration
// card, and moving through the night (polite follow, 'lights down' for far jumps, the hash).
import { content } from '../../data/content/hotels';
import { given } from '../../data/content/types';
import { voice, type DemoFields, type FeatureKey, type PlanKey, type Presenter, type ProfileFields, type RoiConfig } from '../../scripts/voice/bridge';
import { scroll, createNavigator, offsetTop } from '../../scripts/motion/scroll';
import { motion } from '../../scripts/motion/prefs';
import { countUp, flash, setField } from '../../scripts/text';
import { computeRoi, fmtMoney, minutes as roiMinutes, paybackDays, type Roi } from '../../scripts/apply/roi';
import { EMAIL_RE, missingFields } from '../../scripts/apply/validate';
import { qualify } from '../../scripts/apply/qualify';
import { ledgerCounts, meetingsUrl, submitApplication as submitToAdapter } from '../../scripts/apply/adapter';
import { track } from '../../scripts/analytics';
import { chapterAt, needle, night, nightHHMM, refresh as refreshRing, toNight, SPAN } from './ring';

export type HouseKind = 'hotel' | 'restaurant' | 'both';

const PROFILE_KEYS = ['hotel_name', 'hotel_type', 'rooms', 'monthly_calls', 'languages', 'pain_points'] as const;
const H = content.handover;
const html = document.documentElement;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const profileForm = () => $<HTMLFormElement>('form[data-profile]');
const applyForm = () => $<HTMLFormElement>('form[data-apply]');
const input = (form: HTMLFormElement | null, name: string) => form?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Typing the agent started; the ROI and the submission wait for it */
let pendingTyping: Promise<unknown> = Promise.resolve();
const settleTyping = (p: Promise<unknown>) => (pendingTyping = pendingTyping.then(() => p).catch((err) => console.error(err)));

/* ---------- The house ---------- */

export const kindOf = (type: string): HouseKind => (/restaurant/i.test(type) ? (/hotel/i.test(type) ? 'both' : 'restaurant') : 'hotel');

export function readProfile(): ProfileFields {
  const form = profileForm();
  const out: ProfileFields = {};
  if (!form) return out;
  const data = new FormData(form);
  for (const k of PROFILE_KEYS) {
    const v = String(data.get(k) ?? '').trim();
    if (v) out[k] = v;
  }
  return out;
}

/** The date of tonight ('Friday 16 October'): before 06:00 the night began yesterday */
function nightDate(offsetDays = 0) {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** The estimate for this house: hotels use the niche's constants; a restaurant needs its own calls and spend */
export function estimate(p = readProfile()): { roi: Roi | null; cfg: RoiConfig; wording: string } {
  if (kindOf(p.hotel_type ?? '') !== 'restaurant') return { roi: computeRoi(p, content.roi), cfg: content.roi, wording: content.roi.revenueWording };
  const own = given<RoiConfig>(H.restaurant.roi);
  const spend = Number(String($<HTMLInputElement>('[data-spend]')?.value ?? '').replace(/[^\d.]/g, '')) || 0;
  // ponytail: until the owner confirms restaurant constants, only the visitor's calls and spend make an estimate
  const cfg: RoiConfig = { ...(own ?? content.roi), ...(spend ? { avgBookingValue: spend } : {}), ...(own ? {} : { callsPerUnit: 0 }) };
  const roi = own || spend ? computeRoi(p, cfg) : null;
  return { roi, cfg, wording: content.prologue.restaurantWording };
}

interface HouseApi { rebuild(p: object): void }
const houseApi = () => (window as unknown as { amariyaHouse?: HouseApi }).amariyaHouse ?? null;

/** Section-drawing parameters for the scene: floors from rooms, the restaurant floor from the type */
export function houseParams(p: ProfileFields) {
  const type = p.hotel_type ?? '';
  const kind = kindOf(type);
  const preset = content.scenarios.find((s) => s.hotelType.toLowerCase() === type.toLowerCase());
  const rooms = kind === 'restaurant' ? 0 : Number(p.rooms) || 0;
  let floors = preset?.floors ?? 5, bays = preset?.bays ?? 6;
  if (rooms) {
    floors = Math.ceil(rooms / 14);
    bays = Math.ceil(rooms / clamp(floors, 2, 9));
  }
  return {
    floors: clamp(floors, 2, 9),
    bays: clamp(bays, 3, 12),
    ground: kind === 'restaurant' ? 'restaurant' : kind === 'both' ? 'lobby+restaurant' : 'lobby',
    roof: preset?.pool ? 'terrace' : /b&b|guesthouse/i.test(type) ? 'pitched' : kind === 'restaurant' ? 'plain' : /apartment/i.test(type) ? 'garden' : 'terrace',
    name: (p.hotel_name ?? '').trim(),
  };
}

let shownKind: HouseKind = 'hotel';
let shownName = '';
let prefilledName = '';
let lastParams = '';

/** Re-renders everything the property card drives. Cheap and idempotent: every input calls it. */
export function renderHouse() {
  const p = readProfile();
  const kind = kindOf(p.hotel_type ?? '');
  const name = (p.hotel_name ?? '').trim();

  if (kind !== shownKind) {
    shownKind = kind;
    html.dataset.house = kind;
    // The heading a section is named by follows the copy on show
    for (const s of $$('[data-chapter]')) {
      if (document.getElementById(`${s.id}-title-r`)) s.setAttribute('aria-labelledby', `${s.id}-title${kind === 'restaurant' ? '-r' : ''}`);
    }
    const rooms = $('[data-rooms-label]');
    if (rooms) rooms.textContent = (kind === 'restaurant' ? rooms.dataset.tables : rooms.dataset.rooms) ?? rooms.textContent;
    refreshRing();
  }

  if (name !== shownName) {
    const named = !!name && name !== shownName;
    shownName = name;
    const head = name ? content.runningHead.named(name, nightDate()) : content.runningHead.tonight;
    for (const el of $$('[data-running-head]')) {
      el.textContent = head;
      if (named && motion.allowed) { el.classList.remove('foil'); void el.offsetWidth; el.classList.add('foil'); }
    }
    const canopy = $('[data-canopy]');
    if (canopy) {
      canopy.textContent = name || H.defaultName;
      canopy.toggleAttribute('data-named', !!name);
    }
  }

  // The scenario chips and the live sentence follow the type
  const type = p.hotel_type ?? '';
  const scenario = content.scenarios.find((s) => s.hotelType.toLowerCase() === type.toLowerCase());
  for (const r of $$<HTMLInputElement>('[data-scenario] input[type="radio"]')) r.checked = !!scenario && r.value === scenario.id;
  const label = $('[data-scenario-label]');
  if (label) label.textContent = scenario?.inline ?? (type ? type.toLowerCase() : content.scenarios[0].inline);

  // The teaser under the card: the calls a night like this would miss
  const e = estimate(p);
  const perNight = e.roi ? Math.round(e.roi.recovered / 30.4) : 0;
  const teaser = $('[data-teaser]'), teaserText = $('[data-teaser-text]');
  if (teaser && teaserText) {
    teaser.hidden = perNight < 1;
    if (perNight >= 1) teaserText.textContent = content.propertyCard.teaser(perNight);
  }

  renderHandover(p, e);
  prefillCard(p, kind, name);

  const params = houseParams(p);
  const key = JSON.stringify(params);
  if (key !== lastParams) {
    lastParams = key;
    try { houseApi()?.rebuild(params); } catch (err) { console.error(err); }
    track('house_rebuilt', { kind, floors: params.floors, bays: params.bays });
  }

  try {
    if (name || type || p.rooms) localStorage.setItem('amariya_house', JSON.stringify({ name, type, rooms: p.rooms ?? '' }));
    else localStorage.removeItem('amariya_house');
  } catch { /* remembered for this page only */ }
}

/** The registration card's house name (until the visitor writes their own) and its house summary */
function prefillCard(p: ProfileFields, kind: HouseKind, name: string) {
  const form = applyForm();
  const field = input(form, 'hotel_name');
  if (field && (field.value === '' || field.value === prefilledName)) {
    field.value = name;
    prefilledName = name;
  }
  const summary = $('[data-reg-house-text]');
  if (summary) {
    const n = (v: unknown) => Number(v).toLocaleString('en-US');
    summary.textContent = [
      p.hotel_type ?? '',
      Number(p.rooms) ? `${n(p.rooms)} ${kind === 'restaurant' ? 'tables' : 'rooms'}` : '',
      Number(p.monthly_calls) ? `${n(p.monthly_calls)} ${content.profile.labels.monthly_calls.toLowerCase()}` : '',
      p.languages ?? '',
    ].filter(Boolean).join(' · ');
  }
}

/* ---------- The morning handover ---------- */

const M = ['\u0001', '\u0002', '\u0003'];
const nums = new Map<string, HTMLElement>();
const numEl = (key: string) => {
  let el = nums.get(key);
  if (!el) { el = document.createElement('b'); el.className = 'num'; nums.set(key, el); }
  return el;
};
/** A line from its content template, the marked figures counting up from where they were */
function writeLine(li: HTMLElement | null, key: string, template: string, values: { n: number; fmt?: (n: number) => string }[]) {
  if (!li) return;
  const nodes = template.split(/([\u0001-\u0003])/).filter(Boolean).map((part) => {
    const i = M.indexOf(part);
    if (i < 0) return part;
    const el = numEl(`${key}${i}`);
    countUp(el, values[i].n, { format: values[i].fmt });
    return el;
  });
  li.replaceChildren(...nodes);
}
const textLine = (template: string, values: string[]) => template.replace(/[\u0001-\u0003]/g, (m) => values[M.indexOf(m)] ?? '');

function renderHandover(p: ProfileFields, e = estimate(p)) {
  const note = $('[data-handover]');
  if (!note) return;
  const name = (p.hotel_name ?? '').trim() || H.defaultName;
  const heading = $('[data-handover-heading]');
  if (heading) heading.textContent = H.heading(name, nightDate(1));
  const r = e.roi;
  note.toggleAttribute('data-empty', !r);
  const line = (k: string) => $<HTMLElement>(`[data-line="${k}"]`, note);
  const send = $<HTMLAnchorElement>('[data-handover-send]', note);
  const subject = encodeURIComponent(H.mail.subject(name));
  if (!r) {
    for (const k of ['missed', 'revenue', 'hours', 'payback', 'minutes', 'ota']) line(k)?.replaceChildren();
    line('ota')?.setAttribute('hidden', '');
    const basis = $('[data-basis]', note);
    if (basis) basis.textContent = '';
    if (send) send.href = `mailto:?subject=${subject}`;
    return;
  }
  const money = (n: number) => fmtMoney(n);
  const count = (n: number) => n.toLocaleString('en-US');
  const mins = roiMinutes(r, e.cfg);
  const lines: [string, string, { n: number; fmt?: (n: number) => string }[]][] = [
    ['missed', H.missed(M[0]), [{ n: r.recovered }]],
    ['revenue', H.revenue(M[0], e.wording), [{ n: r.revenue, fmt: money }]],
    ['hours', H.hours(M[0]), [{ n: r.hours }]],
  ];
  // No recovered revenue (a handful of calls a month), no payback to promise
  if (r.revenue > 0) {
    const days = paybackDays(content.offer.price, r.revenue);
    lines.push(['payback', H.payback(days).replace(String(days), M[0]), [{ n: days }]]);
  } else line('payback')?.replaceChildren();
  lines.push(['minutes', H.minutes(M[0], M[1], M[2]), [{ n: mins.missedOnly }, { n: mins.every }, { n: mins.included }]]);
  const rate = parseFloat(String($<HTMLInputElement>('[data-ota]')?.value ?? '').replace(',', '.'));
  const ota = rate > 0 && rate < 100 ? Math.round((r.revenue * rate) / 100) : 0;
  if (ota) lines.push(['ota', H.ota.line(M[0], String(rate)), [{ n: ota, fmt: money }]]);
  line('ota')?.toggleAttribute('hidden', !ota);
  for (const [k, template, values] of lines) writeLine(line(k), k, template, values);

  const basis = content.roi.basis(r.calls, r.estimatedCalls, Math.round(e.cfg.missedCallRate * 100), fmtMoney(e.cfg.avgBookingValue));
  const basisEl = $('[data-basis]', note);
  if (basisEl) basisEl.textContent = basis;

  const mailBody = [
    H.mail.intro,
    '',
    H.heading(name, nightDate(1)),
    ...lines.map(([, t, v]) => textLine(t, v.map((x) => (x.fmt ?? count)(x.n)))),
    '',
    basis,
    content.roi.disclaimer,
    '',
    `${location.origin}${location.pathname}#handover`,
  ].join('\n');
  if (send) send.href = `mailto:?subject=${subject}&body=${encodeURIComponent(mailBody)}`;
}

/** One A4 page with the handover note only */
export function printHandover() {
  html.dataset.print = 'handover';
  addEventListener('afterprint', () => { delete html.dataset.print; }, { once: true });
  window.print();
  // Some browsers print synchronously and never fire afterprint
  setTimeout(() => { delete html.dataset.print; }, 1000);
}

/* ---------- Moving through the night ---------- */

const ORDER = $$('[data-chapter]');
const MAP: Record<string, string> = {
  welcome: 'welcome', profile: 'house', features: 'restaurant', pricing: 'keys', demo: 'register', apply: 'register', faq: 'faq', footer: 'checkout',
  ...Object.fromEntries(ORDER.map((el) => [el.id, el.id])),
};

/** '23:48 · Room 214' for a chapter in the house as it is now */
export function roomOf(id: string) {
  const c = content.chapters.find((x) => x.id === id);
  if (!c) return '';
  return (shownKind === 'restaurant' && c.restaurant ? c.restaurant.room : c.room);
}
export function labelOf(el: HTMLElement, m?: number) {
  const c = content.chapters.find((x) => x.id === el.id);
  if (!c) return el.id;
  const hour = m !== undefined ? nightHHMM(m) : c.hour === 'now' ? content.ring.now : c.hour;
  return hour ? `${hour} · ${roomOf(c.id)}` : c.title;
}
const minutesOf = (el: HTMLElement) => {
  const h = el.dataset.hour ?? '';
  return /^\d\d:\d\d$/.test(h) ? toNight(h) : null;
};

/** The chapter whose top has passed the middle of the viewport */
export function currentChapter(): HTMLElement | null {
  const line = scroll.y + innerHeight * 0.5;
  let at: HTMLElement | null = ORDER[0] ?? null;
  for (const el of ORDER) if (offsetTop(el) <= line) at = el;
  return at;
}

let followTarget: string | null = null;
let followTimer = 0;
function offerFollow(section: string, el: HTMLElement, m?: number) {
  followTarget = el.id;
  voice.follow(section, labelOf(el, m));
  needle(m ?? minutesOf(el));
  clearTimeout(followTimer);
  followTimer = window.setTimeout(() => clearFollow(), 15000);
}
function clearFollow() {
  followTarget = null;
  needle(null);
}
/** The page tells the presenter which chapter is in view */
export function arrived(id: string) {
  if (followTarget === id) clearFollow();
}

// A move to a chapter stops short by the page's scroll-padding: the cornice, or on phones the reading line under the
// house band (hotels.css), where the clock and the band open a chapter (ring.ts's lead)
const nav = createNavigator(MAP, { offset: () => 0, labels: content.voice.sectionLabels, onFollow: () => {} });

function target(section: string): { el: HTMLElement; m?: number } | null {
  const s = String(section ?? '').trim().toLowerCase().replace(/^#/, '');
  const hm = s.match(/^h-?(\d{1,2}):?(\d{2})$/);
  if (hm) {
    const m = toNight(`${hm[1].padStart(2, '0')}:${hm[2]}`);
    return m <= SPAN ? { el: chapterAt(m).el, m } : null;
  }
  const el = document.getElementById(MAP[s] ?? s);
  return el?.matches('[data-chapter]') ? { el } : null;
}

function setHash(t: { el: HTMLElement; m?: number }) {
  history.replaceState(null, '', t.m !== undefined ? `#h-${nightHHMM(t.m).replace(':', '')}` : `#${t.el.id}`);
}

/** The visible heading of a chapter (a restaurant-only house shows its own) */
function focusHeading(el: HTMLElement) {
  const h = [...el.querySelectorAll<HTMLElement>('h1, h2')].find((x) => x.getClientRects().length);
  h?.focus({ preventScroll: true });
}

/** Each move of the page; a move overtaken by a newer one never lands */
let navSeq = 0;
let lightsPending = 0;
/** More than one chapter away: the house dims (240 ms), holds (120 ms), the page cuts, the lantern relights it */
async function lightsDown(t: { el: HTMLElement; m?: number }, focus: boolean, seq: number) {
  const go = () => {
    if (seq !== navSeq) return;
    if (t.m !== undefined) night.set(t.m, { immediate: true });
    else void scroll.to(t.el, { immediate: true });
    setHash(t);
    if (focus) focusHeading(t.el);
  };
  if (!motion.allowed) return go();
  lightsPending++;
  html.dataset.lightsDown = '';
  await wait(240 + 120);
  go();
  await wait(60);
  if (--lightsPending === 0) delete html.dataset.lightsDown;
}

const isFar = (el: HTMLElement) => {
  const cur = currentChapter();
  return !!cur && Math.abs(ORDER.indexOf(el) - ORDER.indexOf(cur)) > 1;
};

/**
 * Moves to a section, chapter id or hour ('#h-2348'). The agent's moves are polite: within 2.5 s of the visitor's
 * own input they become the follow prompt (her second hand on the ring and the follow note) instead.
 * keepFocus: the ring's keys move the page but leave focus on the slider.
 */
export function navigate(section: string, fromAgent: boolean, keepFocus = false): boolean {
  const t = target(section);
  if (!t) return false;
  const cur = currentChapter();
  if (fromAgent && Date.now() - scroll.lastUserInput < 2500 && t.el !== cur) {
    offerFollow(section, t.el, t.m);
    return true;
  }
  if (followTarget && !fromAgent) clearFollow();
  const seq = ++navSeq;
  const focus = !keepFocus && !fromAgent;
  if (isFar(t.el)) {
    // The same focus rule as a near move: the agent's moves never take the visitor's focus (the composer, a field)
    void lightsDown(t, focus, seq);
    return true;
  }
  if (t.m !== undefined) {
    night.set(t.m);
    setHash(t);
  } else {
    nav.goTo(t.el.id, false);
  }
  if (focus) focusHeading(t.el);
  return true;
}

/* ---------- The registration card ---------- */

/** Field → its error paragraph; true when the field is fine */
export function checkField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  const err = el.id ? document.getElementById(`${el.id}-err`) : null;
  const value = el instanceof HTMLInputElement && el.type === 'checkbox' ? (el.checked ? 'yes' : '') : String(el.value).trim();
  const ok = !el.required || (!!value && (el.getAttribute('type') !== 'email' || EMAIL_RE.test(value)));
  if (ok) el.removeAttribute('aria-invalid');
  else el.setAttribute('aria-invalid', 'true');
  if (err) {
    err.hidden = ok;
    err.textContent = ok ? '' : el.dataset.err ?? '';
  }
  return ok;
}

/** Checks the required fields of a step; focus goes to the first that needs the visitor */
export function checkStep(n: 1 | 2): boolean {
  const panel = $(`[data-step-panel="${n}"]`, applyForm() ?? document);
  if (!panel) return true;
  const bad = $$<HTMLInputElement>('input[required], textarea[required], select[required]', panel).filter((f) => !checkField(f));
  bad[0]?.focus();
  return bad.length === 0;
}

export function showStep(n: 1 | 2, focus: boolean) {
  const form = applyForm();
  if (!form) return;
  const from = Number(form.dataset.step) || 1;
  form.dataset.step = String(n);
  for (const panel of $$<HTMLElement>('[data-step-panel]', form)) panel.hidden = panel.dataset.stepPanel !== String(n);
  for (const mark of $$('[data-step-mark]', form)) {
    const k = Number(mark.dataset.stepMark);
    if (k === n) mark.setAttribute('aria-current', 'step');
    else mark.removeAttribute('aria-current');
    mark.toggleAttribute('data-done', k < n);
  }
  const of = $('[data-stepof]', form);
  if (of) of.textContent = content.apply.stepOf(n, 2);
  const panel = $<HTMLElement>(`[data-step-panel="${n}"]`, form);
  if (from !== n) {
    if (panel && motion.allowed) panel.animate([{ transform: `translateX(${n > from ? 24 : -24}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    track('application_step', { step: n });
  }
  if (focus) $<HTMLElement>('[data-step-title]', panel ?? form)?.focus();
}

export function readApplication(): DemoFields {
  const form = applyForm();
  if (!form) return {};
  const d = new FormData(form);
  const out: DemoFields = {};
  for (const k of ['name', 'hotel_name', 'email', 'phone', 'preferred_time', 'plan', 'notes'] as const) {
    const v = String(d.get(k) ?? '').trim();
    if (v) out[k] = v;
  }
  return out;
}

let sentTo = '';
let sending = false;

function setSending(on: boolean) {
  const form = applyForm();
  const button = $<HTMLButtonElement>('[data-apply-submit]', form ?? document);
  const label = $('[data-submit-label]', form ?? document);
  sending = on;
  if (button) button.disabled = on;
  if (label) label.textContent = on ? content.apply.sending : content.apply.submit;
  form?.setAttribute('aria-busy', String(on));
}

function showDone(qualified: boolean) {
  const form = applyForm();
  const done = $('[data-apply-done]');
  if (!form || !done) return;
  form.hidden = true;
  done.hidden = false;
  const url = meetingsUrl('hotels');
  const meetings = $('[data-meetings]', done);
  const reply = $('[data-done-reply]', done);
  if (qualified && url && meetings) {
    meetings.hidden = false;
    const frame = $<HTMLIFrameElement>('[data-meetings-frame]', meetings);
    const link = $<HTMLAnchorElement>('[data-meetings-link]', meetings);
    if (frame && !frame.src) frame.src = `${url}${url.includes('?') ? '&' : '?'}embed=true`;
    if (link) link.href = url;
    if (reply) reply.textContent = '';
  } else if (reply) {
    reply.textContent = given<string>(content.apply.success.replyTime) ?? content.apply.success.fallback;
  }
  $<HTMLElement>('[data-done-title]', done)?.focus();
}

/** The meetings calendar confirms a booking: say exactly that */
addEventListener('message', (e: MessageEvent) => {
  const url = meetingsUrl('hotels');
  if (!url) return;
  try { if (e.origin !== new URL(url).origin) return; } catch { return; }
  const data = e.data as { meetingBookSucceeded?: boolean; meetingsPayload?: { bookingResponse?: { event?: { dateTime?: number | string } } } } | null;
  if (!data?.meetingBookSucceeded) return;
  const at = data.meetingsPayload?.bookingResponse?.event?.dateTime;
  const when = at ? new Date(at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const title = $('[data-done-title]'), text = $('[data-done-text]');
  if (title) title.textContent = content.apply.success.bookedHeading;
  if (text && when) text.textContent = content.apply.success.booked(when);
  track('meeting_booked');
  voice.contextUpdate(`The visitor booked their 20-minute call with the team${when ? ` for ${when}` : ''}.`, 'meeting');
});

/** Sends the registration card through the adapter: duplicate guard, timeout, the data kept on any error */
export async function sendCard(o: { byAgent: boolean }): Promise<{ ok: boolean; message: string }> {
  const form = applyForm();
  if (!form) return { ok: false, message: content.apply.errors.network };
  if (sending) return { ok: false, message: content.apply.sending };
  const d = new FormData(form);
  const get = (k: string) => String(d.get(k) ?? '').trim();
  const email = get('email').toLowerCase();
  if (sentTo && sentTo === email) return { ok: true, message: content.apply.errors.duplicate };
  const consent = (input(form, 'consent') as HTMLInputElement | null)?.checked;
  const step1 = { name: get('name'), email: get('email'), phone: get('phone'), role: get('role') };
  const step2 = {
    hotel_name: get('hotel_name'), locations: get('locations'), software: get('software'), go_live: get('go_live'),
    preferred_time: get('preferred_time'), notes: get('notes'), plan: get('plan') || 'founding',
    consent: consent ? 'yes' : o.byAgent ? 'asked Amariya to send it' : 'no',
  };
  const qualification = qualify({ role: step1.role, locations: step2.locations, go_live: step2.go_live, open: ledgerCounts('hotels').open });
  const errorEl = $('[data-apply-error]', form);
  if (errorEl) errorEl.hidden = true;
  setSending(true);
  const res = await submitToAdapter({
    industry: 'hotels',
    step1,
    step2,
    hotel_profile: readProfile(),
    roi: estimate().roi,
    qualification,
    submitted_at: new Date().toISOString(),
    conversation_id: voice.conversationId,
    notes: step2.notes || undefined,
  });
  setSending(false);
  if (!res.ok) {
    if (errorEl) { errorEl.textContent = content.apply.errors.network; errorEl.hidden = false; }
    const label = $('[data-submit-label]', form);
    if (label) label.textContent = content.apply.retry;
    return { ok: false, message: content.apply.errors.network };
  }
  sentTo = email;
  track('application_submitted', { qualified: qualification.qualified });
  showDone(qualification.qualified);
  return { ok: true, message: res.message };
}

/* ---------- The presenter ---------- */

const planOf = (plan?: string) => {
  const p = String(plan ?? '').toLowerCase();
  return /enterprise|group/.test(p) ? 'groups' : /starter|professional|founding|licen[cs]e/.test(p) ? 'founding' : null;
};

export const presenter: Presenter = {
  navigate: (section, fromAgent) => navigate(section, fromAgent),

  async setProfile(f) {
    navigate('profile', true);
    const form = profileForm();
    if (!form) return [];
    const names: string[] = [];
    const typing: Promise<unknown>[] = [];
    for (const k of PROFILE_KEYS) {
      const r = setField(form, k, f[k]);
      if (r === false) continue;
      names.push(k);
      if (r instanceof Promise) typing.push(r);
    }
    // Resolves once her typing has finished (the tools read that as "the page has caught up")
    await settleTyping(Promise.all(typing).then(() => renderHouse()));
    return names;
  },

  readProfile,

  async showRoi() {
    await pendingTyping;
    renderHouse();
    navigate('handover', true);
    const note = $('[data-handover]');
    if (note) flash(note);
  },

  spotlight(key: FeatureKey) {
    const el = $<HTMLElement>(`[data-feature="${key}"]`);
    if (!el) return false;
    for (const x of $$('.spotlight')) if (x !== el) x.classList.remove('spotlight');
    el.classList.add('spotlight');
    for (const d of $$<HTMLDetailsElement>('[data-does]', el)) d.open = true;
    navigate(el.id, true);
    voice.activity(content.transcript.activity.showing(labelOf(el)));
    return true;
  },

  recommend(plan: PlanKey, reason?: string) {
    const key = planOf(plan);
    const el = key ? $(`[data-plan="${key}"]`) : null;
    if (!key || !el) return false;
    for (const x of $$('[data-plan]')) {
      x.classList.toggle('recommended', x === el);
      const r = $('[data-plan-reason]', x);
      if (r && x !== el) { r.hidden = true; r.textContent = ''; }
    }
    const r = $('[data-plan-reason]', el);
    if (r) {
      const lead = document.createElement('span');
      lead.className = 'sr-only';
      lead.textContent = `Recommended for you: ${content.apply.plans[key].toLowerCase()}. `;
      r.replaceChildren(lead, reason ? content.keys.recommendTag(shownName || 'you', reason) : content.apply.plans[key]);
      r.hidden = false;
    }
    const hidden = input(applyForm(), 'plan');
    if (hidden) hidden.value = key;
    if (key === 'founding') {
      const next = $<HTMLElement>('[data-keys] [data-state="open"]');
      for (const k of $$('[data-keys] [data-lifted]')) k.removeAttribute('data-lifted');
      if (next) {
        next.setAttribute('data-lifted', '');
        try { (window as unknown as { amariyaKeys?: { lift(n: number): void } }).amariyaKeys?.lift(Number(next.dataset.key)); } catch (err) { console.error(err); }
      }
    }
    navigate('pricing', true);
    return true;
  },

  async fillApplication(f) {
    navigate('demo', true);
    const form = applyForm();
    if (!form) return { filled: [], missing: [] };
    const filled: string[] = [];
    const plan = planOf(f.plan);
    if (plan) {
      const hidden = input(form, 'plan');
      if (hidden) hidden.value = plan;
      filled.push('plan');
    }
    const one = (['name', 'email', 'phone'] as const).filter((k) => f[k]);
    const two = (['hotel_name', 'preferred_time', 'notes'] as const).filter((k) => f[k]);
    filled.unshift(...one, ...two);
    const missing = missingFields({ ...readApplication(), ...f } as Record<string, unknown>, undefined, content.voice.nameLabel);
    await settleTyping((async () => {
      if (one.length) { showStep(1, false); await Promise.all(one.map((k) => setField(form, k, f[k]))); }
      if (two.length) { showStep(2, false); await Promise.all(two.map((k) => setField(form, k, f[k]))); }
    })());
    return { filled, missing };
  },

  readApplication,

  async submitApplication() {
    await pendingTyping;
    const d = readApplication();
    const missing = missingFields({ ...d } as Record<string, unknown>, undefined, content.voice.nameLabel);
    if (missing.length) return { ok: false, message: `Cannot submit yet. Missing: ${missing.join(', ')}.` };
    navigate('demo', true);
    const res = await sendCard({ byAgent: true });
    if (!res.ok) return res;
    return { ok: true, message: res.message === content.apply.errors.duplicate ? res.message : `Registration sent for ${d.name} (${d.email}).` };
  },

  handoff(topic: string, summary: string) {
    voice.activity(`§ ${topic}: ${summary}`);
  },
};

