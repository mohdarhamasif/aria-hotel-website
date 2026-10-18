// /clinics page script: voice config, the presenter, the session, the lens, then every chapter's behaviour
// (bar console, line index, intake, story, call room, dial, The Line, Your clinic, licence, apply, questions,
// the notes letter) and the first-visit intro. The orb boots last.
import { voice, FEATURES, type FeatureKey } from '../../scripts/voice/bridge';
import { boot } from '../../scripts/orb/boot';
import { init as initSession } from '../../scripts/voice/session';
import { init as initTools } from '../../scripts/voice/tools';
import { init as initLevel } from '../../scripts/voice/level';
import { content } from '../../data/content/clinics';
import { scheduler } from '../../scripts/motion/scheduler';
import { offsetTop, scroll, sectionProgress, trackSections } from '../../scripts/motion/scroll';
import { motion } from '../../scripts/motion/prefs';
import { clock, fmtHM } from '../../scripts/motion/clock';
import { playScript, type Playback } from '../../scripts/scripted';
import { track } from '../../scripts/analytics';
import { sound } from '../../scripts/sound';
import type { NicheCall } from '../../data/content/types';
import {
  $, $$, announce, clinicHours, clinicNamed, lensFromType, letterSections, letterText, logHandoff, nav, porcelain, presenter, pushHandoff,
  readProfile, record, relayout, renderAccount, roiSentence, sendApplication,
} from './presenter';
import {
  bandIndex, callLength, challengeFeature, currentLens, dialOrder, dialPosition, detentProgress, initLens, isOpen, peaks, route, secondsOf, storyMinutes,
} from './lens';

const C = content;
const html = document.documentElement;
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const live = () => voice.state !== 'idle';
/** True while the story is pinned and scrubbing the clinic clock */
let storyActive = false;

voice.configure(C.voice);
voice.registerPresenter(presenter);
initLens();
initSession();
initTools();
initLevel();

/* ---------- Printed headings: the hairline draws as the text prints, the first time a chapter arrives ---------- */

const chapterEls = C.chapters.map((c) => document.getElementById(c.id)).filter((e): e is HTMLElement => !!e);
if (motion.allowed) html.dataset.heads = 'print';
const printer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    (e.target as HTMLElement).dataset.printed = '';
    printer.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -18% 0px' });
chapterEls.forEach((c) => printer.observe(c));

// Landmark rings draw themselves (400 ms) the first time they are reached
const rings = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.drawn = ''; rings.unobserve(e.target); }
});
$$('[data-point]').forEach((p) => rings.observe(p));

trackSections(chapterEls.map((c) => c.id), (id) => {
  track('section_viewed', { section: id });
  $$('[data-index-link]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.indexLink === id));
});

/* ---------- Ask Amariya: buttons, drop-to-ask and the FAQ ---------- */

function ask(label: string, question?: string) {
  const q = question ?? `Could you tell me about ${label}?`;
  track('ask', { live: live() });
  if (live()) return voice.sendText(q);
  voice.requestStart('text');
  // The text session opens the Notes with the composer focused; the question waits there, unsent
  const fill = () => {
    const input = $<HTMLInputElement>('[data-log-form] [name="msg"]');
    if (input && !input.value) {
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  requestAnimationFrame(fill);
  window.setTimeout(fill, 450);
}

document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ask-this]');
  if (!b) return;
  const target = b.closest<HTMLElement>('[data-ask]');
  const faq = b.closest<HTMLElement>('[data-faq]');
  if (target) ask(target.dataset.ask ?? '', faq ? target.dataset.ask : undefined);
});

/* ---------- The bar: console glyph on the line, clock, notes ---------- */

const bar = $('[data-bar]');
let barHeight = bar?.offsetHeight || 56;
const barH = () => barHeight;
const desktop = matchMedia('(min-width: 735px)');

function splitAt(y: number) {
  let s = C.chapters[0].split;
  for (let i = 1; i < chapterEls.length; i++) {
    const b = offsetTop(chapterEls[i]);
    const t = clamp01((y - (b - 120)) / 240);
    if (t <= 0) break;
    s += (C.chapters[i].split - s) * smootherstep(t);
  }
  return s;
}

let clusterX = 0, brandRight = 0, lastGx = -1;
function measureBar() {
  if (!bar) return;
  barHeight = bar.offsetHeight || 56;
  // The right-hand cluster starts at the first of its controls that is showing
  const shown = $$('.bar-clock, .bar .dock-timer, .bar .lens-bar, .bar .dock-btn, .bar-take, .bar .sound-toggle, .bar-apply', bar)
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0);
  clusterX = shown.length ? Math.min(...shown.map((r) => r.left)) : innerWidth - 560;
  brandRight = ($('.bar-switcher', bar) ?? $('.bar-brand', bar))?.getBoundingClientRect().right ?? 200;
  lastGx = -1;
}
addEventListener('resize', measureBar, { passive: true });
document.fonts?.ready.then(measureBar);
measureBar();

/**
 * The state glyph sits where the line meets the bar (clamped 360 px … vw − 560 px); the caption reads to its right,
 * or to its left when the controls leave no room on the right.
 */
function placeGlyph() {
  if (!bar || !desktop.matches) return;
  const x = splitAt(scroll.y + barH()) * innerWidth;
  // Never on the right-hand controls: the cluster is wider than the concept's 560 px (clock, lens, Notes, Sound, Pause, Apply)
  const gx = Math.round(Math.max(360, Math.min(innerWidth - 560, clusterX - 34, x)));
  if (gx === lastGx) return;
  lastGx = gx;
  const right = clusterX - gx - 46;
  const left = gx - brandRight - 46;
  const flip = right < 240 && left > right;
  const w = Math.max(96, Math.min(520, flip ? left : right));
  bar.dataset.flip = String(flip);
  bar.style.setProperty('--gx', `${gx}px`);
  bar.style.setProperty('--console-x', `${flip ? gx - 22 - w : gx + 22}px`);
  bar.style.setProperty('--console-w', `${w}px`);
}

const barClock = $('[data-bar-clock]');
const showClock = (now = clock.now()) => {
  if (!barClock) return;
  barClock.textContent = now.line;
  barClock.setAttribute('datetime', `${String(now.h).padStart(2, '0')}:${now.mm}`);
};
showClock();
clock.onMinute(showClock);

voice.on('state', ({ muted }) => {
  if (bar) bar.dataset.muted = String(muted);
  // Controls come and go with the call: the console measures again
  requestAnimationFrame(() => { measureBar(); placeGlyph(); });
});
voice.on('ended', () => $$('.bar [data-take-notes]').forEach((b) => { b.hidden = false; }));

const hero = document.getElementById('welcome');
if (hero) {
  new IntersectionObserver(([e]) => {
    document.body.dataset.heroOut = String(!e.isIntersecting);
    // The bar's talk glyph shows once the hero is out of view: the right-hand cluster grows, so the console re-measures
    requestAnimationFrame(() => { measureBar(); placeGlyph(); });
  }, { rootMargin: '-56px 0px 0px 0px' }).observe(hero);
}

// The orb's own help, extended with the clinics gestures
const orb = $('[data-orb]');
if (orb && $('#orb-help-clinics')) orb.setAttribute('aria-describedby', 'orb-help orb-help-clinics');

// P5's handle reports point moves and notes for the polite region
document.addEventListener('orb:status', (e) => announce(String((e as CustomEvent<{ text?: string }>).detail?.text ?? '')));
document.addEventListener('orb:note', (e) => {
  const p = (e as CustomEvent<{ point?: number | string }>).detail?.point;
  const ch = C.chapters.find((c) => Number(c.point) === Number(p));
  const h = ch && document.getElementById(ch.id)?.querySelector('h1, h2');
  if (ch && h) announce(`${ch.point} · ${ch.title}. ${h.textContent?.replace(/\s+/g, ' ').trim()}`);
});

/* ---------- The Notes panel gets the team's column of hand-offs ---------- */

const log = $('[data-log]');
if (log && !$('[data-handoff-mirror]', log)) {
  const col = document.createElement('section');
  col.className = 'log-team';
  col.dataset.logTeam = '';
  col.setAttribute('aria-labelledby', 'log-team-title');
  const h = document.createElement('h3');
  h.id = 'log-team-title';
  h.className = 'mono';
  h.textContent = 'For your team';
  const ol = document.createElement('ol');
  ol.dataset.handoffMirror = '';
  ol.setAttribute('role', 'list');
  col.append(h, ol);
  log.append(col);
}

/* ---------- The line index (≥ 1100 px) and the Index sheet ---------- */

const index = $('[data-index]');
const wide = matchMedia('(min-width: 1100px)');
const indexPath = $<SVGPathElement>('[data-index-path]');
const indexView = $<SVGPathElement>('[data-index-view]');
let docH = 1;

function layoutIndex() {
  docH = Math.max(1, document.documentElement.scrollHeight);
  if (!index) return;
  const pts: string[] = [];
  chapterEls.forEach((c, i) => {
    const top = (offsetTop(c) / docH) * 1000;
    const bottom = ((offsetTop(c) + c.offsetHeight) / docH) * 1000;
    const x = (C.chapters[i].split * 28).toFixed(1);
    if (i === 0) pts.push(`M${x} ${top.toFixed(1)}`);
    else {
      const px = (C.chapters[i - 1].split * 28).toFixed(1);
      pts.push(`C${px} ${(top + 6).toFixed(1)} ${x} ${(top - 6).toFixed(1)} ${x} ${(top + 12).toFixed(1)}`);
    }
    pts.push(`L${x} ${bottom.toFixed(1)}`);
    const li = $(`[data-index-item="${c.id}"]`, index);
    li?.style.setProperty('--at', String(offsetTop(c) / docH));
  });
  indexPath?.setAttribute('d', pts.join(' '));
}
new ResizeObserver(() => requestAnimationFrame(layoutIndex)).observe(document.body);
document.fonts?.ready.then(layoutIndex);

let lastView = '';
function placeIndexView() {
  if (!indexView || !index || !wide.matches) return;
  const y0 = (scroll.y / docH) * 1000;
  const y1 = ((scroll.y + innerHeight) / docH) * 1000;
  const d = `M5 ${y0.toFixed(1)}H1V${y1.toFixed(1)}H5M23 ${y0.toFixed(1)}H27V${y1.toFixed(1)}H23`;
  if (d !== lastView) indexView.setAttribute('d', (lastView = d));
}

// Dragging the strip scrubs the page; a plain click on a point still follows its link
if (index) {
  let dragging = false, moved = false, startY = 0;
  const to = (clientY: number) => {
    const r = index.getBoundingClientRect();
    const f = clamp01((clientY - r.top) / r.height);
    void scroll.to(Math.max(0, f * docH - innerHeight / 2), { immediate: true });
  };
  index.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startY = e.clientY;
  });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!moved && Math.abs(e.clientY - startY) < 4) return;
    if (!moved) { moved = true; index.setPointerCapture?.(e.pointerId); index.dataset.scrubbing = ''; }
    to(e.clientY);
  });
  const end = () => { dragging = false; delete index.dataset.scrubbing; };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  index.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
}

const sheet = $<HTMLDialogElement>('[data-index-sheet]');
$$('[data-index-open]').forEach((b) => b.addEventListener('click', () => sheet?.showModal()));
sheet?.addEventListener('click', (e) => {
  const a = (e.target as Element).closest('a[data-index-link]');
  if (a || e.target === sheet) sheet.close();
});

/* ---------- 00 · Intake ---------- */

const hint = $('[data-hint]');
const push = $<HTMLButtonElement>('[data-push]');
if (push) push.hidden = false;
let hintTimer = 0;
const armHint = () => {
  clearTimeout(hintTimer);
  if (hint?.dataset.on !== undefined) return;
  hintTimer = window.setTimeout(() => {
    if (scroll.y < innerHeight * 0.5) { if (hint) hint.dataset.on = ''; if (push) push.dataset.on = ''; }
  }, 3500);
};
for (const type of ['pointermove', 'keydown', 'wheel', 'touchstart'] as const) addEventListener(type, armHint, { passive: true });
armHint();

push?.addEventListener('click', () => {
  pushHandoff('CLINICAL', C.intake.demoSlip);
  const s = $('[data-intake-slip]');
  if (s) s.hidden = false;
  track('handoff_demo', { how: 'button' });
});

const hourNow = $('[data-hour-now]');
const ringHand = $('[data-ring-hand]');
/** Noon at the top of the 24-hour ring: the hand's angle for minutes since midnight */
const handDeg = (minutes: number) => (((minutes / 60 - 12) / 24) * 360).toFixed(2);
const placeHour = (now = clock.now()) => {
  hourNow?.setAttribute('transform', `rotate(${handDeg(now.minutes)})`);
  if (!storyActive) ringHand?.style.setProperty('--hand', `${handDeg(now.minutes)}deg`);
};
placeHour();
clock.onMinute(placeHour);

/* ---------- Pins: the story and the dial pin unless motion is reduced (scrolling is the visitor's own motion, so Pause keeps them) ---------- */

const story = $('[data-story]');
const dialEl = $('[data-dial]');
/**
 * The story pins only where its pinned screen holds her side and the team's whole: on a short tablet or phone the pin
 * clipped her orb or the team's words, so there it reads as a plain section, as it does under reduced motion
 */
function storyFits() {
  const stage = story?.querySelector<HTMLElement>('.story-stage');
  if (!story || !stage) return true;
  story.dataset.pin = 'on';
  return stage.scrollHeight <= stage.clientHeight + 2;
}
/** The dial likewise: its pinned screen must hold the tallest feature, links and all */
function dialFits() {
  const stage = dialEl?.querySelector<HTMLElement>('.dial-stage');
  if (!dialEl || !stage) return true;
  dialEl.dataset.pin = 'on';
  return stage.scrollHeight <= stage.clientHeight + 2;
}
function pins() {
  const on = motion.reduced ? 'off' : 'on';
  if (story) story.dataset.pin = on === 'on' && storyFits() ? 'on' : 'off';
  if (dialEl) dialEl.dataset.pin = desktop.matches && on === 'on' && dialFits() ? 'on' : 'off';
}
pins();
motion.on(pins);
desktop.addEventListener('change', pins);
// Whether it fits turns on the screen's height and the faces: checked again after a resize and once the fonts are in
let pinsTimer = 0;
addEventListener('resize', () => { clearTimeout(pinsTimer); pinsTimer = window.setTimeout(pins, 150); }, { passive: true });
void document.fonts?.ready.then(pins);

/* ---------- 01 · Right now ---------- */

const S = C.story;
const storyTime = $('[data-story-time]');
const storySituation = $('[data-story-situation]');
const storyStatus = $('[data-story-status]');
const storyClosing = $('[data-story-closing]');
const storyClosed = $('[data-story-closed]');
const storyCount = $('[data-story-count]');
const storyStage = $('[data-story-stage]');
const nightLine = $('[data-night-line]');
const dayNow = $('[data-day-now]');
const greetItems = $$('[data-greeting]');

function lensed(target: HTMLElement, s: string | { medical: string; aesthetic: string }) {
  if (typeof s === 'string') return void (target.textContent = s);
  const m = document.createElement('span');
  m.dataset.lensText = 'medical';
  m.textContent = s.medical;
  const a = document.createElement('span');
  a.dataset.lensText = 'aesthetic';
  a.textContent = s.aesthetic;
  target.replaceChildren(m, a);
}

function storyClock(now = clock.now()) {
  const { open, close } = clinicHours();
  const band = S.situations[bandIndex(now.minutes, S.situations)];
  if (storySituation) lensed(storySituation, band.line);
  if (storyStatus) storyStatus.textContent = band.status;
  // Re-checked every minute: night is 21:00–05:59
  if (storyClosing) storyClosing.textContent = now.night ? S.closing.night : S.closing.day;
  if (storyClosed) storyClosed.hidden = isOpen(now.minutes, open, close);
  $$('[data-story-now]').forEach((n) => { n.textContent = now.line; });
  if (storyTime && !storyActive) storyTime.textContent = now.line;
  if (dayNow) {
    const inSheet = now.minutes >= 480 && now.minutes <= 1080;
    dayNow.hidden = !inSheet;
    dayNow.style.setProperty('--at', `${(((now.minutes - 480) / 600) * 100).toFixed(2)}%`);
  }
}
storyClock();
clock.onMinute(storyClock);

let storyVisible = false, lastBeat = 0, lastGreet = -1, lastMinute = NaN, rang = false;
if (story) new IntersectionObserver(([e]) => { storyVisible = e.isIntersecting; if (!storyVisible) leaveStory(); }).observe(story);

/**
 * The story's answer in beat 2 (listening, then speaking) is shown, never announced: the stage writes its status
 * and label, and they are put back in the same task, so the polite region has nothing new to say.
 */
function setStage(state: 'listening' | 'speaking' | null) {
  const stage = window.amariyaOrb;
  const want = state ?? voice.state;
  if (!stage || !orb || live() || stage.state === want) return;
  const status = orb.querySelector('[data-orb-status]');
  const text = status?.textContent ?? '';
  const label = orb.getAttribute('aria-label') ?? '';
  stage.setState(want);
  if (!state) return;
  if (status) status.textContent = text;
  orb.setAttribute('aria-label', label);
}

function leaveStory() {
  if (!storyActive) return;
  storyActive = false;
  delete html.dataset.storyRing;
  placeHour();
  document.dispatchEvent(new CustomEvent('clinic:time', { detail: { minutes: null } }));
  setStage(null);
  lastMinute = NaN;
  storyClock();
}

function frameStory() {
  if (!story || !storyVisible || story.dataset.pin !== 'on') return;
  const p = sectionProgress(story);
  const inside = p > 0 && p < 1;
  if (!inside) return leaveStory();
  storyActive = true;
  html.dataset.storyRing = 'on';
  const now = clock.now();
  const { open, close } = clinicHours();
  const minutes = storyMinutes(p, now.minutes, open, close);
  const m = Math.round(minutes);
  if (m !== lastMinute) {
    lastMinute = m;
    if (storyTime) storyTime.textContent = fmtHM(m);
    ringHand?.style.setProperty('--hand', `${handDeg(m)}deg`);
    document.dispatchEvent(new CustomEvent('clinic:time', { detail: { minutes: ((m % 1440) + 1440) % 1440 } }));
    if (nightLine) nightLine.toggleAttribute('data-on', !isOpen(m, open, close));
  }
  if (!rang && p > 0.02) {
    rang = true;
    document.dispatchEvent(new CustomEvent('line:ring'));
  }
  const beat = p < 0.34 ? 1 : p < 0.67 ? 2 : 3;
  if (beat !== lastBeat) {
    lastBeat = beat;
    if (storyStage) storyStage.dataset.beat = String(beat);
    if (storyCount) storyCount.textContent = S.counter(beat);
    if (beat !== 2) setStage(null);
  }
  story.style.setProperty('--story-p', p.toFixed(4));
  if (beat === 2) {
    // The caption names each greeting in step with the porcelain, which turns 40° per language (P5)
    const local = clamp01((p - 0.34) / 0.33);
    setStage(local < 0.22 ? 'listening' : 'speaking');
    const g = Math.min(greetItems.length - 1, Math.floor(local * greetItems.length));
    if (g !== lastGreet) {
      lastGreet = g;
      greetItems.forEach((li, i) => li.toggleAttribute('aria-current', i === g));
    }
  }
}

/* ---------- 02 · On the line ---------- */

const callRoom = $('[data-call-room]');
const transcript = $<HTMLOListElement>('[data-call-transcript]');
const scrub = $<HTMLInputElement>('[data-call-scrub]');
const readBtn = $<HTMLButtonElement>('[data-call-read]');
const nextBtn = $<HTMLButtonElement>('[data-call-next]');
const wave = $('[data-line-wave]');
const lands = $('[data-call-lands]');
const callSlip = $('[data-call-slip]');
const R = C.callRoom;
/** The lens's first call: the medical lens opens on its own routing call, the aesthetic lens on the list's first */
const firstCall = (lens: 'medical' | 'aesthetic') => (lens === 'medical' ? C.calls.find((c) => c.lens === 'medical') : undefined) ?? C.calls.find((c) => !c.lens || c.lens === lens) ?? C.calls[0];
let call: NicheCall = C.calls.find((c) => !c.lens || c.lens === 'aesthetic') ?? C.calls[0];
let playback: Playback | null = null;
let handoffShown = false;

const labelFor = (who: 'g' | 'a') => (who === 'g' ? R.caller : R.her);

// Lines sit down the line at their timestamps: the gap grows with the seconds between them
if (transcript) {
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => {
      if (!(n instanceof HTMLLIElement) || n.dataset.done !== undefined) return;
      const prev = n.previousElementSibling as HTMLElement | null;
      const gap = prev?.dataset.at && n.dataset.at ? secondsOf(n.dataset.at) - secondsOf(prev.dataset.at) : 0;
      n.style.marginBlockStart = prev ? `${Math.round(Math.min(48, Math.max(12, gap * 5)))}px` : '0px';
    });
  }).observe(transcript, { childList: true });
}

function lineItem(l: NicheCall['lines'][number], i: number) {
  const li = document.createElement('li');
  li.dataset.who = l.who;
  li.dataset.state = 'in';
  if (l.at) li.dataset.at = l.at;
  if (i === 0) li.dataset.static = '';
  li.dir = l.dir ?? 'auto';
  if (l.lang) li.lang = l.lang;
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = `${labelFor(l.who)}, ${l.at ?? ''}: `;
  li.append(sr, l.text);
  if (l.gloss) li.append(gloss(l.gloss));
  return li;
}
const gloss = (text: string) => {
  const g = document.createElement('span');
  g.className = 'gloss';
  g.lang = 'en';
  g.dir = 'ltr';
  g.textContent = text;
  return g;
};
const doneItem = () => {
  const li = document.createElement('li');
  li.dataset.done = '';
  li.dataset.state = 'in';
  li.dir = 'auto';
  li.textContent = call.done;
  return li;
};

function played(t: number) {
  const total = callLength(call.lines);
  const f = clamp01(total ? t / total : 1);
  if (scrub) {
    scrub.value = String(Math.round(t));
    scrub.setAttribute('aria-valuetext', `${Math.round(t)} seconds of ${total}`);
  }
  if (wave) wave.dataset.played = f.toFixed(3);
  drawWave(f);
  document.dispatchEvent(new CustomEvent('call:playhead', { detail: { id: call.id, fraction: f } }));
}

function showSlip(fire: boolean) {
  const h = call.handoff;
  if (!h || !callSlip || handoffShown) return;
  handoffShown = true;
  $('[data-call-slip-topic]', callSlip)!.textContent = h.topic;
  $('[data-call-slip-text]', callSlip)!.textContent = h.summary;
  callSlip.hidden = false;
  if (fire) pushHandoff(h.topic, h.summary);
}

/** Renders the call complete up to t seconds (the whole call by default) */
function renderStatic(upTo = Infinity) {
  if (!transcript) return;
  const lines = call.lines.filter((l) => secondsOf(l.at) <= upTo);
  transcript.replaceChildren(...lines.map(lineItem), ...(lines.length === call.lines.length ? [doneItem()] : []));
  const h = call.handoff;
  if (h && lines.length > h.at) showSlip(false);
}

function selectCall(id: string, quiet = false) {
  const next = C.calls.find((c) => c.id === id);
  if (!next || !transcript) return;
  playback?.stop();
  playback = null;
  call = next;
  handoffShown = false;
  if (callSlip) callSlip.hidden = true;
  $$<HTMLButtonElement>('[data-call]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.call === id)));
  transcript.setAttribute('aria-label', `Transcript: ${call.title}`);
  if (lands) lands.textContent = call.lands ?? '';
  const total = callLength(call.lines);
  if (scrub) scrub.max = String(total);
  if (wave) {
    wave.dataset.peaks = JSON.stringify(peaks(call.lines));
    relayout();
  }
  renderStatic();
  played(total);
  if (nextBtn) nextBtn.hidden = true;
  if (!quiet) voice.contextUpdate(`The visitor picked the scripted call “${call.title}” in the call room.`);
}

function readCall() {
  if (!transcript) return;
  playback?.stop();
  handoffShown = false;
  if (callSlip) callSlip.hidden = true;
  transcript.replaceChildren(lineItem(call.lines[0], 0));
  played(secondsOf(call.lines[0].at));
  if (nextBtn) nextBtn.hidden = !motion.allowed;
  const h = call.handoff;
  const pb = playScript(transcript, call, {
    onLine(li, line, i) {
      // playScript writes the words; the label for screen readers and the gloss come after
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = `${labelFor(line.who)}, ${line.at ?? ''}: `;
      li.prepend(sr);
      const g = call.lines[i]?.gloss;
      if (g) li.append(gloss(g));
      played(secondsOf(line.at));
      if (h && i === h.at) showSlip(true);
    },
    onDone() {
      played(callLength(call.lines));
      if (nextBtn) nextBtn.hidden = true;
    },
  });
  playback = pb;
  track('recording_played', { call: call.id, mode: 'read' });
  voice.contextUpdate(`The visitor is reading the scripted call “${call.title}”.`);
}

// The waveform drawn on the page when P5's line is not there (no WebGL): played in ink, the rest quiet
function drawWave(f: number) {
  const svg = $('[data-wave-fallback]');
  if (!svg || !wave) return;
  const pk: number[] = JSON.parse(wave.dataset.peaks || '[]');
  if (!pk.length) return;
  const vertical = desktop.matches;
  const pts = pk.map((v, i) => {
    const t = ((i + 0.5) / pk.length) * 100;
    return vertical ? [50 + v * 46 * (i % 2 ? 1 : -1), t] : [t, 50 + v * 46 * (i % 2 ? 1 : -1)];
  });
  const cut = Math.round(f * pk.length);
  const d = (list: number[][]) => (list.length ? `M${list.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}` : '');
  svg.querySelector('.wave-played')?.setAttribute('d', d(pts.slice(0, cut + 1)));
  svg.querySelector('.wave-unplayed')?.setAttribute('d', d(pts.slice(Math.max(0, cut))));
}

if (callRoom) {
  if (readBtn) readBtn.hidden = false;
  callRoom.addEventListener('click', (e) => {
    const t = e.target as Element;
    const pick = t.closest<HTMLElement>('[data-call]');
    if (pick?.dataset.call) selectCall(pick.dataset.call);
    if (t.closest('[data-call-read]')) readCall();
    if (t.closest('[data-call-next]') && playback && !playback.next() && nextBtn) nextBtn.hidden = true;
  });
  scrub?.addEventListener('input', () => {
    playback?.stop();
    playback = null;
    if (nextBtn) nextBtn.hidden = true;
    const t = Number(scrub.value);
    renderStatic(t);
    played(t);
  });
  scrub?.addEventListener('change', () => voice.contextUpdate(`The visitor scrubbed the scripted call “${call.title}” to ${scrub.value} seconds.`));
  // Dragging the orb along the waveform moves this same range input (P5), so scrubbing has one path
  // The server's transcript, laid out again at its timestamps
  renderStatic();
  played(callLength(call.lines));
}

/* ---------- 03 · What she takes ---------- */

const tabs = $('[data-dial-tabs]');
const items = $('[data-dial-items]');
const teamList = $('.dial-team');
let order: FeatureKey[] = dialOrder(currentLens(), null);
let activeKey: FeatureKey = order[0];
let dialVisible = false, lastP = -1, lastOrder = order.join();

function challenge(): FeatureKey | null {
  const p = readProfile().pain_points;
  return p ? challengeFeature(p.split(',')[0]) : null;
}

function reorderDial() {
  order = dialOrder(currentLens(), challenge());
  order.forEach((k, i) => {
    const tab = $(`[data-dial-tab="${k}"]`);
    const item = $(`[data-dial-item="${k}"]`);
    const team = $(`[data-dial-team="${k}"]`);
    if (tab) { tabs?.append(tab); const pos = $('[data-tab-pos]', tab); if (pos) pos.textContent = `Feature ${i + 1} of ${order.length}: `; }
    if (item) { items?.append(item); const num = $('[data-dial-num]', item); if (num) num.textContent = String(i + 1).padStart(2, '0'); }
    if (team) teamList?.append(team);
    // Sub-positions follow the order, so 'features:<key>' lands on the right detent
    const subEl = $(`[data-sub="features:${k}"]`);
    subEl?.style.setProperty('--f', String(detentProgress(i, order.length)));
  });
  // The porcelain carves its glyphs in the dial's order: it reads the new order when the page measures again
  if (order.join() !== lastOrder) { lastOrder = order.join(); relayout(); }
  setActive(dialEl?.dataset.pin === 'on' ? order[Math.round(dialPosition(Math.max(0, lastP)))] ?? order[0] : activeKey);
}

function setActive(key: FeatureKey) {
  activeKey = key;
  $$('[data-dial-item]').forEach((i) => i.toggleAttribute('data-active', i.dataset.dialItem === key));
  $$('[data-dial-team]').forEach((i) => i.toggleAttribute('data-active', i.dataset.dialTeam === key));
  $$<HTMLButtonElement>('[data-dial-tab]').forEach((t) => {
    const on = t.dataset.dialTab === key;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
}

const subOf = (key: FeatureKey) => $(`[data-sub="features:${key}"]`);
/** Pinned, the page scrolls to the detent and the porcelain follows the scroll; unpinned, she turns to its glyph */
function dialTo(key: FeatureKey, immediate = false) {
  if (dialEl?.dataset.pin === 'on') {
    const s = subOf(key);
    if (s) void scroll.to(s, { duration: 0.6, immediate });
    return;
  }
  setActive(key);
  porcelain()?.setLithophane?.(key);
  sound.play('tick');
}

if (tabs && items) {
  tabs.hidden = false;
  $$('[data-dial-item]').forEach((i) => {
    i.setAttribute('role', 'tabpanel');
    i.setAttribute('aria-labelledby', `tab-${i.dataset.dialItem}`);
    i.tabIndex = 0;
  });
  tabs.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-dial-tab]');
    if (!t) return;
    const key = t.dataset.dialTab as FeatureKey;
    dialTo(key);
    setActive(key);
    voice.contextUpdate(`The visitor opened “${C.features[key].title}” on the dial.`);
  });
  tabs.addEventListener('keydown', (e) => {
    const i = order.indexOf(activeKey);
    const k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? order.length - 1 : null;
    if (k === null) return;
    e.preventDefault();
    const key = order[(k + order.length) % order.length];
    setActive(key);
    $<HTMLButtonElement>(`[data-dial-tab="${key}"]`)?.focus();
    dialTo(key, true);
  });
}
if (dialEl) new IntersectionObserver(([e]) => { dialVisible = e.isIntersecting; }).observe(dialEl);

// P5 reports a detent when the visitor turns the orb by hand
document.addEventListener('dial:detent', (e) => {
  const { key, user } = (e as CustomEvent<{ key?: FeatureKey; user?: boolean }>).detail ?? {};
  if (!key || !FEATURES.includes(key)) return;
  setActive(key);
  // Only a turn by hand moves the page: a detent the scroll itself passes (the visitor's or the agent's journey through
  // the pin) would otherwise start a second scroll that cancels the first and parks the page on the dial
  if (!user) return;
  requestAnimationFrame(() => {
    if (dialEl?.dataset.pin !== 'on') return;
    const want = detentProgress(order.indexOf(key), order.length);
    if (Math.abs(sectionProgress(dialEl) - want) > 0.08) dialTo(key);
  });
});
// The agent's spotlight
document.addEventListener('dial:select', (e) => {
  const { key, fromAgent } = (e as CustomEvent<{ key: FeatureKey; fromAgent?: boolean }>).detail;
  if (dialEl?.dataset.pin === 'on') nav.goTo(`features:${key}`, !!fromAgent);
  else { dialTo(key); nav.goTo('features', !!fromAgent); }
});

function frameDial() {
  if (!dialEl || !dialVisible || dialEl.dataset.pin !== 'on') return;
  const p = sectionProgress(dialEl);
  if (p === lastP) return;
  lastP = p;
  // The porcelain turns with the scroll itself (P5); the panels and the tablist follow the same 70/30 dwell
  const key = order[Math.round(dialPosition(p, order.length))] ?? order[0];
  if (key !== activeKey) setActive(key);
}

/* ---------- 04 · The line ---------- */

const answers = $('[data-answers]');
const urgent = $('[data-urgent]');
const L = C.line;

function answer(text: string, q: string) {
  if (!answers) return;
  const li = document.createElement('li');
  const who = document.createElement('p');
  who.className = 'answer-who mono';
  who.textContent = `${R.her} · ${clock.now().line}`;
  const asked = document.createElement('p');
  asked.className = 'answer-q';
  asked.textContent = q;
  const said = document.createElement('p');
  said.className = 'answer-a';
  said.textContent = text;
  li.append(who, asked, said);
  answers.prepend(li);
  while (answers.children.length > 3) answers.lastElementChild?.remove();
}

function sortQuestion(q: string, kind: string, scripted?: { answer?: string; handoff?: { topic: string; summary: string } }) {
  record.asked.push({ q, route: kind });
  track('line_sorted', { route: kind, free: !scripted });
  if (kind === 'administrative') answer(scripted?.answer ?? L.freeAnswer, q);
  else if (kind === 'emergency') {
    if (urgent) urgent.hidden = false;
    logHandoff('URGENT', L.freeHandoff(q));
  } else {
    const h = scripted?.handoff ?? { topic: kind === 'unsure' ? 'FOR THE TEAM' : 'CLINICAL', summary: L.freeHandoff(q) };
    pushHandoff(h.topic, h.summary);
  }
  voice.contextUpdate(`The visitor tried The Line with “${q}”: sorted as ${kind}.`);
}

document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-ask-question]');
  if (!b) return;
  const q = L.questions[Number(b.dataset.q)];
  if (!q) return;
  if (live()) return voice.sendText(q.q);
  sortQuestion(q.q, q.kind, q);
});
$<HTMLFormElement>('[data-ask-free]')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = (e.currentTarget as HTMLFormElement).elements.namedItem('question') as HTMLInputElement;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  if (live()) return voice.sendText(q);
  sortQuestion(q, route(q, L.rules));
});

/* ---------- Drop-to-ask: P5 places the orb on a target ---------- */

document.addEventListener('orb:placed', (e) => {
  const target = (e as CustomEvent<{ target?: Element }>).detail?.target;
  if (!(target instanceof Element)) return;
  track('orb_dropped');
  const question = target.closest<HTMLElement>('[data-ask-question]');
  if (question) return question.click();
  const point = target.closest<HTMLElement>('[data-point]');
  if (point) {
    const ch = C.chapters.find((c) => c.point === point.dataset.point);
    if (ch) announce(`Placed on point ${ch.point}: ${ch.title}`);
    return;
  }
  const at = target.closest<HTMLElement>('[data-ask]');
  if (!at?.dataset.ask) return;
  if (live()) voice.contextUpdate(`The visitor placed Amariya on “${at.dataset.ask}” on the page.`);
  ask(at.dataset.ask, at.matches('[data-faq]') ? at.dataset.ask : undefined);
});

/* ---------- 05 · Your clinic ---------- */

const profileForm = $<HTMLFormElement>('form[data-profile]');
const slider = $<HTMLInputElement>('[data-calls-slider]');
let editTimer = 0;
const reportEdit = () => {
  clearTimeout(editTimer);
  editTimer = window.setTimeout(() => voice.contextUpdate(`The visitor edited their clinic profile by hand: ${JSON.stringify(readProfile())}. ${roiSentence()}`), 1200);
};

function hoursChanged() {
  const { open, close } = clinicHours();
  porcelain()?.setHours?.(open, close);
  storyClock();
}

if (profileForm) {
  profileForm.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    renderAccount();
    if (t.name === 'hotel_name' && t.value.trim()) clinicNamed(t.value.trim());
    if (t.name === 'monthly_calls' && slider) slider.value = String(Number(t.value) || 0);
    if (t.name === 'pain_points' || t.name === 'pain_points_other') reorderDial();
    if (e.isTrusted) reportEdit();
  });
  profileForm.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'hotel_type' && t.checked) lensFromType(t.value);
    if (t.name === 'opens' || t.name === 'closes') {
      hoursChanged();
      const { open, close } = clinicHours();
      voice.contextUpdate(`The visitor set their clinic hours to ${fmtHM(open, false)}–${fmtHM(close, false)}.`);
    }
    if (t.name === 'pain_points') reorderDial();
  });
  profileForm.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-step]');
    if (!b) return;
    const input = document.getElementById(b.dataset.stepFor ?? '') as HTMLInputElement | null;
    if (!input) return;
    // An empty field steps from the number it shows (its placeholder, 4 practitioners): + reads as 5, not 1
    const from = input.value.trim() === '' ? Number(input.placeholder) || 0 : Number(input.value) || 0;
    const v = Math.max(Number(input.min) || 0, from + Number(b.dataset.step));
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    reportEdit();
  });
  slider?.addEventListener('input', () => {
    const calls = profileForm.elements.namedItem('monthly_calls');
    if (calls instanceof HTMLInputElement) {
      calls.value = slider.value === '0' ? '' : slider.value;
      calls.dispatchEvent(new Event('input', { bubbles: true }));
    }
    reportEdit();
  });
  profileForm.addEventListener('submit', (e) => e.preventDefault());
}
renderAccount();

document.addEventListener('lens:change', (e) => {
  const { lens, source } = (e as CustomEvent<{ lens: 'medical' | 'aesthetic'; source: string }>).detail;
  reorderDial();
  renderAccount();
  // The call room cues the lens's first call, unless the visitor is in the middle of reading one
  if (!playback || (call.lens && call.lens !== lens)) selectCall(firstCall(lens).id, true);
  if (source === 'visitor') voice.contextUpdate(`The visitor switched the page to read as ${lens === 'medical' ? 'a medical practice' : 'an aesthetic clinic'}.`);
});
reorderDial();
if (currentLens() === 'medical') selectCall(firstCall('medical').id, true);

/* ---------- 06 · Founding licence: the mark ---------- */

const mark = $('[data-mark]');
const showMarkBtn = $<HTMLButtonElement>('[data-show-mark]');
let markShown = false;
function revealMark(how: string) {
  porcelain()?.showMark?.();
  if (markShown) return;
  markShown = true;
  if (mark) delete mark.dataset.wait;
  track('mark_revealed', { how });
  voice.contextUpdate('The visitor turned the orb over and read the edition mark: the next open founding licence.');
}
if (mark) mark.dataset.wait = '';
if (showMarkBtn) {
  showMarkBtn.hidden = false;
  showMarkBtn.addEventListener('click', () => revealMark('button'));
}
document.addEventListener('licence:mark', () => revealMark('recommend'));
const plate = $('[data-plate]');
if (plate) {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    revealMark('scroll');
    voice.contextUpdate('The visitor is looking at the founding licence and the register of thirty.');
  }, { rootMargin: '-35% 0px -35% 0px' });
  io.observe(plate);
  plate.addEventListener('animationend', () => plate.classList.remove('sweep'));
}

/* ---------- 07 · Apply ---------- */

const applyForm = $<HTMLFormElement>('form[data-apply]');
if (applyForm) {
  applyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void sendApplication('visitor');
  });
  applyForm.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'hotel_name' && e.isTrusted) t.dataset.auto = 'false';
    if (t.name === 'locations') {
      const note = $('[data-groups-note]');
      if (note) note.hidden = !(Number(t.value) > 1);
    }
    if (t.getAttribute('aria-invalid') !== null && t.value.trim()) t.removeAttribute('aria-invalid');
  });
  let step2 = false;
  applyForm.addEventListener('focusin', (e) => {
    if (step2 || !(e.target as Element).closest('[data-step="2"]')) return;
    step2 = true;
    track('application_step', { step: 2 });
    voice.contextUpdate('The visitor moved on to step 2 of the application: who she hands to.');
  });
}

/* ---------- 08 · Questions ---------- */

$$<HTMLDetailsElement>('[data-faq]').forEach((d) => d.addEventListener('toggle', () => {
  if (!d.open) return;
  track('faq_opened');
  voice.contextUpdate(`The visitor opened the question “${d.dataset.ask}”.`);
}));

/* ---------- Take the notes ---------- */

const letter = $<HTMLDialogElement>('[data-letter]');
const letterBody = $('[data-letter-body]');
const withTranscript = $<HTMLInputElement>('[data-letter-transcript]');
const letterStatus = $('[data-letter-status]');

function writeLetter() {
  if (!letterBody) return;
  const date = $('[data-letter-date]');
  if (date) date.textContent = new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  letterBody.replaceChildren(...letterSections(!!withTranscript?.checked).map((s) => {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.className = 'mono';
    h.textContent = s.title;
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    s.lines.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      li.dir = 'auto';
      ul.append(li);
    });
    sec.append(h, ul);
    return sec;
  }));
  const mail = $<HTMLAnchorElement>('[data-letter-mail]');
  if (mail) {
    // Mail clients cut long links: the letter without the transcript, capped
    const body = letterText(false).slice(0, 1800);
    mail.href = `mailto:?subject=${encodeURIComponent(C.letter.title)}&body=${encodeURIComponent(body)}`;
  }
}

document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest?.('[data-take-notes]') || !letter) return;
  writeLetter();
  letter.showModal();
  track('notes_taken');
});
withTranscript?.addEventListener('change', writeLetter);
$('[data-letter-print]')?.addEventListener('click', () => {
  html.classList.add('print-letter');
  addEventListener('afterprint', () => html.classList.remove('print-letter'), { once: true });
  print();
});
$('[data-letter-copy]')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(letterText(!!withTranscript?.checked));
    if (letterStatus) letterStatus.textContent = 'Copied.';
  } catch {
    if (letterStatus) letterStatus.textContent = 'Copying is blocked here; print or email the notes instead.';
  }
});

/* ---------- The first visit: the line draws, the orb falls onto its anchor and plucks once (≤ 1.1 s) ---------- */

function intro() {
  let seen = false;
  try {
    seen = !!localStorage.getItem('amariya_intro');
    localStorage.setItem('amariya_intro', '1');
  } catch { seen = true; }
  if (seen || !motion.allowed || scroll.y > 8 || (location.hash && location.hash !== '#welcome')) return;
  html.dataset.intro = 'on';
  const INPUT = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  let touched = false;
  const end = () => {
    delete html.dataset.intro;
    for (const t of INPUT) removeEventListener(t, onInput);
  };
  const onInput = () => { touched = true; end(); delete html.dataset.introLine; };
  for (const t of INPUT) addEventListener(t, onInput, { passive: true });
  // The still falls 24 px onto its anchor and the brackets settle, within 1.1 s
  window.setTimeout(end, 1100);
  // When the porcelain and the Line arrive: the line draws from the bar down the first screen (900 ms)
  // while she falls onto her anchor on the lift spring and plucks it once (P5's intro)
  const svg = $('[data-line]');
  if (!svg) return;
  const draw = () => {
    if (touched || scroll.y > innerHeight / 2) return;
    html.dataset.introLine = 'on';
    porcelain()?.intro?.();
    window.setTimeout(() => { delete html.dataset.introLine; }, 960);
  };
  if (svg.firstElementChild) return draw();
  const mo = new MutationObserver(() => { if (svg.firstElementChild) { mo.disconnect(); draw(); } });
  mo.observe(svg, { childList: true, subtree: true });
  window.setTimeout(() => mo.disconnect(), 6000);
}
intro();

/* ---------- One frame job for the page's DOM writes ---------- */

let lastY = NaN;
scheduler.add(() => {
  const moved = scroll.y !== lastY;
  lastY = scroll.y;
  if (!moved) return;
  placeGlyph();
  placeIndexView();
  frameStory();
  frameDial();
}, 90);
addEventListener('resize', () => { lastY = NaN; lastGx = -1; lastP = -1; }, { passive: true });

boot();
