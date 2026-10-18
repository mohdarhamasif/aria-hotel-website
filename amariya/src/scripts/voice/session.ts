// The ElevenLabs conversation behind the voice bridge (ported from app.js's lifecycle onto contract 7).
// The SDK is its own chunk, warmed 800 ms after load and whenever a talk control is pointed at or focused.
// Niche pages never import this module; they call init() from their page script and talk to `voice`.
import type { TextConversation, VoiceConversation } from '@elevenlabs/client';
import { voice, cleanText, toneOf, type VoiceConfig, type VoiceMode } from './bridge';
import { tools } from './tools';
import { clock } from '../motion/clock';
import { sound, type SoundName } from '../sound';
import { track } from '../analytics';

type Conversation = TextConversation | VoiceConversation;
type Reason = 'user' | 'agent' | 'error';

const BRAND = 'Amariya';
const CHIME: Record<VoiceConfig['industry'], SoundName> = { hotels: 'bell', clinics: 'chimeC5G5', dental: 'chimeG5B5' };
/** Why the microphone could not start (the toast); the call carries on in writing */
const MIC: Record<string, string> = {
  NotAllowedError: 'Microphone access is blocked, so you can write to Amariya instead.',
  NotFoundError: 'No microphone was found, so you can write to Amariya instead.',
  NotReadableError: 'Your microphone is busy in another app, so you can write to Amariya instead.',
  SecurityError: 'The microphone can’t be used on this address, so you can write to Amariya instead.',
};
const MIC_OTHER = 'The microphone didn’t start, so you can write to Amariya instead.';
const ALLOWLIST = 'This address is not on the agent’s allowlist yet.';
const FAILED = 'Couldn’t start the conversation. Please try again.';
const HICCUP = 'Connection hiccup. Please try again.';
/** What she says first when a conversation carries on (a switch, or writing after a call) instead of greeting again */
const CARRY_ON: Record<VoiceMode, string> = { text: 'Of course. Let’s carry on in writing.', voice: 'I’m here. Let’s carry on talking.' };

let sdk: Promise<typeof import('@elevenlabs/client')> | null = null;
const loadSdk = () => (sdk ??= import('@elevenlabs/client').catch((err) => { sdk = null; throw err; }));

let conv: Conversation | null = null;
/** Each start gets a number; callbacks and awaits from an older one are ignored */
let run = 0;
let connecting = false;
let asking = false;
let sheetSeen = false;
/** Date.now() of the conversation's first connect; kept across a voice/text switch so the timer runs on */
let callStart = 0;
let continuing = false;
let lastId: string | null = null;
/** The conversation so far, for the agent when it carries on in a new session */
let history: string[] = [];
let queue: string[] = [];
/** The last typed message, so the SDK's echo of it is not shown twice */
let echo = { text: '', at: 0 };

/** The live conversation, or null (level.ts reads its volumes) */
export const current = () => conv;
/** True while the starting conversation carries on the transcript instead of opening a new one */
export const isContinuation = () => continuing;

/* ---------- Visit context: shapes her greeting, pace and tone (the old maths) ---------- */

let legacyVisit: boolean | null = null;
function visit() {
  let returning = false;
  try {
    legacyVisit ??= !!localStorage.getItem('aria_visited');
    returning = legacyVisit || !!localStorage.getItem('amariya_visited');
    localStorage.setItem('amariya_visited', '1');
  } catch { /* private mode: a new visitor */ }
  const part = clock.now().daypart;
  const mobile = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  // Brisker in the morning, calmer in the evening; a little natural variation per visit
  const pace = { morning: 1.04, afternoon: 1, evening: 0.95 }[part] + (mobile ? 0.02 : 0);
  const jitter = (range: number) => (Math.random() * 2 - 1) * range;
  return {
    part,
    returning,
    dynamicVariables: { time_of_day: part, visitor_status: returning ? 'returning' : 'new', visitor_device: mobile ? 'mobile' : 'desktop' },
    tts: { speed: +(pace + jitter(0.02)).toFixed(2), stability: +(0.3 + jitter(0.04)).toFixed(2) },
  };
}

function greeting(g: VoiceConfig['greetings'], part: string, returning: boolean) {
  const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)] ?? g.evening;
  const line = part === 'evening' && !returning && Math.random() < 0.5 ? g.evening : pick(returning ? g.returning : g.fresh);
  return line.replaceAll('{part}', part);
}

/* ---------- The start sheet (once per page load, before the first voice start) ---------- */

function ask(): Promise<VoiceMode | null> {
  const sheet = document.querySelector<HTMLDialogElement>('dialog[data-sheet]');
  if (!sheet || typeof sheet.showModal !== 'function' || sheet.open) return Promise.resolve('voice');
  asking = true;
  return new Promise((resolve) => {
    sheet.returnValue = '';
    sheet.addEventListener('close', () => {
      asking = false;
      const v = sheet.returnValue;
      if (v === 'voice' || v === 'text') sheetSeen = true;
      resolve(v === 'voice' || v === 'text' ? v : null);
    }, { once: true });
    sheet.showModal();
  });
}

/** null when the microphone works (its tracks are stopped again at once), else the error's name */
async function micProblem(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return 'SecurityError';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (err) {
    return (err as DOMException | null)?.name || 'Error';
  }
}

/** The agent's allowlist refused this origin (a 403 for WebRTC, a policy close for the text socket) */
function refused(err: unknown) {
  const e = err as { message?: string; closeReason?: string; closeCode?: number } | null;
  return /allow|\b403\b/i.test(`${e?.message ?? ''} ${e?.closeReason ?? ''}`) || e?.closeCode === 1008;
}

function remember(role: 'user' | 'agent', text: string) {
  history.push(`${role === 'user' ? 'Visitor' : BRAND}: ${text.slice(0, 400)}`);
  if (history.length > 40) history.shift();
}

/* ---------- Lifecycle ---------- */

/** Opens a conversation. carry: keep the transcript and tell the agent what was said so far. */
async function open(mode: VoiceMode, carry: boolean, how = '') {
  const cfg = voice.config;
  if (!cfg) return voice.simulate();
  const id = ++run;
  connecting = true;
  continuing = carry;
  if (!carry) history = [];
  voice.setMode(mode);
  if (mode === 'text') voice.muted = false;
  voice.setState('connecting');
  continuing = false;
  voice.caption(mode === 'voice' ? `Allow microphone access to talk with ${BRAND}…` : 'Opening the chat…');

  try {
    if (mode === 'voice') {
      const problem = await micProblem();
      if (id !== run) return;
      if (problem !== null) {
        voice.note(MIC[problem] ?? MIC_OTHER);
        track('mic_denied', { reason: problem });
        track('fell_back_to_text');
        mode = 'text';
        voice.setMode('text');
        voice.caption('Opening the chat…');
      }
    }
    const { Conversation } = await loadSdk();
    if (id !== run) return;
    const v = visit();
    const session = await Conversation.startSession({
      agentId: cfg.agentId,
      ...(mode === 'voice' ? { connectionType: 'webrtc' as const } : { textOnly: true }),
      dynamicVariables: v.dynamicVariables,
      overrides: { agent: { firstMessage: carry ? CARRY_ON[mode] : greeting(cfg.greetings, v.part, v.returning) }, tts: v.tts },
      clientTools: tools,
      onConnect: ({ conversationId }) => { if (id === run) connected(conversationId, mode, cfg); },
      onDisconnect: (details) => { if (id === run) finish(details.reason); },
      onError: (message) => {
        // Tool failures are answered to the agent; only connection trouble is the visitor's business
        if (id === run && !/client tool/i.test(String(message))) voice.note(HICCUP);
      },
      onModeChange: ({ mode: m }) => { if (id === run) turn(m); },
      onMessage: ({ role, message }) => { if (id === run) heard(role, message); },
    });
    if (id !== run) return void session.endSession().catch(() => {});
    conv = session;
    connecting = false;
    // Until each niche has its own agent, the page tells the shared one who she is and what this page means
    contextUpdate(cfg.agentContext);
    // The queued messages are the newest lines; she gets those as messages, not as history
    const said = history.slice(0, history.length - queue.length);
    if (carry && said.length) {
      contextUpdate(`The visitor ${how || `carried on by ${mode === 'text' ? 'writing' : 'talking'}`}. This continues the same conversation, so don't greet them again or ask for what they already told you. What was said so far:\n${said.join('\n')}`);
    }
    for (const text of queue.splice(0)) post(text);
  } catch (err) {
    if (id !== run) return;
    console.error(err);
    voice.note(refused(err) ? ALLOWLIST : FAILED);
    finish('error');
  }
}

function connected(conversationId: string, mode: VoiceMode, cfg: VoiceConfig) {
  lastId = conversationId;
  voice.connected(conversationId);
  if (callStart) {
    voice.connectedAt = callStart;
  } else {
    callStart = voice.connectedAt ?? Date.now();
    track('call_started', { mode });
    sound.play(CHIME[cfg.industry]);
  }
  voice.setState('thinking');
  voice.caption(`${BRAND} is joining…`);
  voice.typing(true);
}

/** Back to idle: from a disconnect, a stop or a failed start */
function finish(reason: Reason) {
  run++;
  conv = null;
  connecting = false;
  queue = [];
  voice.typing(false);
  if (callStart) {
    const seconds = Math.round((Date.now() - callStart) / 1000);
    voice.ended(reason, seconds);
    track('call_ended', { reason, seconds });
  }
  callStart = 0;
  voice.setState('idle');
  const dock = voice.config?.dock;
  if (dock) voice.caption(history.length ? dock.captionAfter : dock.captionIdle);
}

/** The SDK's speaking/listening turns (voice only; a text session's turns follow its messages) */
function turn(m: 'speaking' | 'listening') {
  if (voice.mode === 'text') return;
  if (m === 'speaking') {
    voice.typing(false);
    voice.setState('speaking');
  } else if (voice.state !== 'thinking') {
    voice.setState('listening');
  }
}

function heard(role: 'user' | 'agent', raw: string) {
  if (role === 'agent') voice.setTone(toneOf(raw));
  const text = cleanText(raw);
  if (!text) return;
  if (role === 'user' && text === echo.text && Date.now() - echo.at < 1500) return;
  remember(role, text);
  voice.message(role, text);
  voice.caption(role === 'user' ? `You: ${text}` : text, role);
  if (role === 'user') {
    voice.setState('thinking');
    voice.typing(true);
  } else {
    voice.typing(false);
    if (voice.mode === 'text') voice.setState('listening');
    else if (voice.state === 'thinking') voice.setState('speaking');
  }
}

function post(text: string) {
  echo = { text, at: Date.now() };
  try { conv?.sendUserMessage(text); } catch (err) { console.error(err); }
  voice.setState('thinking');
  voice.typing(true);
}

/* ---------- The binding (contract 7) ---------- */

async function start(mode: VoiceMode) {
  // Double-start guard: one conversation at a time
  if (connecting || asking) return;
  if (conv) {
    // Talk while writing switches over; Write while talking just opens the log (Transcript.astro)
    if (mode === 'voice' && voice.mode === 'text') await switchMode('voice');
    return;
  }
  if (voice.state !== 'idle') voice.stop(); // the preview call is playing
  if (mode === 'voice' && !sheetSeen) {
    const choice = await ask();
    if (!choice) return;
    mode = choice;
  }
  await open(mode, false);
}

async function stop() {
  const c = conv;
  if (!c) {
    if (connecting || voice.state !== 'idle') finish('user');
    return;
  }
  try { await c.endSession(); } catch (err) { console.error(err); }
  if (conv === c) finish('user'); // onDisconnect did not arrive
}

function sendText(raw: string) {
  const text = raw.trim();
  if (!text) return;
  // Writing after a call (or before any) starts a text conversation that carries on the log
  if (!conv && !connecting) void open('text', history.length > 0, 'carried on by writing after the call ended');
  remember('user', text);
  voice.message('user', text);
  voice.caption(`You: ${text}`, 'user');
  if (conv) post(text);
  else queue.push(text);
}

function contextUpdate(text: string, contextId?: string) {
  try { conv?.sendContextualUpdate(text, contextId ? { contextId } : undefined); } catch (err) { console.warn(err); }
}

/** Ends the live session and opens one in the other mode, keeping the transcript */
export async function switchMode(target: VoiceMode) {
  if (!conv || connecting || asking || target === voice.mode) return;
  if (target === 'voice' && !sheetSeen && (await ask()) !== 'voice') return;
  const old = conv;
  if (!old || connecting) return; // it ended while the sheet was open
  conv = null;
  run++; // the old session's callbacks are ignored from here
  voice.activity(target === 'text' ? 'Switched to writing' : 'Switched to voice');
  void old.endSession().catch(() => {});
  await open(target, true, `switched from ${target === 'text' ? 'talking to writing' : 'writing to talking'}`);
}

/** 'Continue by writing' after a call */
export function resume() {
  if (conv || connecting || asking) return;
  void open('text', history.length > 0, 'carried on by writing after the call ended');
}

/** The visitor's rating of the conversation: live over the socket, or afterwards through the API */
export async function feedback(like: boolean) {
  try {
    if (conv?.isOpen()) return conv.sendFeedback(like);
    if (lastId) await (await loadSdk()).postOverallFeedback(lastId, like);
  } catch (err) {
    console.warn(err);
  }
}

let ready = false;
/** Idempotent; each niche ui.ts calls it */
export function init(): void {
  if (ready) return;
  ready = true;
  voice.bind({
    start,
    stop,
    setMuted: (muted) => { try { conv?.setMicMuted(muted); } catch (err) { console.warn(err); } },
    sendText,
    sendActivity: () => { try { conv?.sendUserActivity(); } catch { /* nothing to tell */ } },
    contextUpdate,
  });

  // Warm the SDK so starting feels instant
  const warm = () => { if (!sdk) loadSdk().catch(() => {}); };
  const TALK = '[data-orb-talk], [data-dock-talk], [data-orb]';
  const onTalk = (e: Event) => { if ((e.target as Element | null)?.closest?.(TALK)) warm(); };
  document.addEventListener('pointerover', onTalk, { passive: true });
  document.addEventListener('focusin', onTalk);
  if (document.readyState === 'complete') setTimeout(warm, 800);
  else addEventListener('load', () => setTimeout(warm, 800), { once: true });
  // Release the microphone when the page goes away
  addEventListener('pagehide', () => { void conv?.endSession().catch(() => {}); });
}
