// The one voice module niche code imports: a small store + event emitter between the page, the orb and the
// ElevenLabs session (session.ts registers itself with bind()). Without a session it plays a simulated call.
import type { OrbState, Tone } from '../orb/stage';
import { scheduler } from '../motion/scheduler';

export type VoiceState = OrbState;
export type VoiceMode = 'voice' | 'text';
export type SectionName = 'welcome' | 'profile' | 'features' | 'pricing' | 'demo';
export type FeatureKey = 'answering' | 'bookings' | 'multilingual' | 'guest_requests' | 'upsells' | 'integrations';
export type PlanKey = 'starter' | 'professional' | 'enterprise';
export type { Tone };

export const SECTIONS: SectionName[] = ['welcome', 'profile', 'features', 'pricing', 'demo'];
export const FEATURES: FeatureKey[] = ['answering', 'bookings', 'multilingual', 'guest_requests', 'upsells', 'integrations'];

export interface ProfileFields {
  hotel_name?: string;
  hotel_type?: string;
  rooms?: number | string;
  monthly_calls?: number | string;
  languages?: string;
  pain_points?: string;
}

export interface DemoFields {
  name?: string;
  hotel_name?: string;
  email?: string;
  phone?: string;
  preferred_time?: string;
  plan?: string;
  notes?: string;
}

export interface RoiConfig {
  missedCallRate: number;
  bookingConversion: number;
  avgBookingValue: number;
  minutesPerCall: number;
  callsPerUnit: number;
}

export interface DockCopy {
  aria: string;
  status: Record<VoiceState, string>;
  muted: string;
  yourTurn: string;
  captionIdle: string;
  captionAfter: string;
  talk: string;
  end: string;
  write: string;
  log: string;
  mute: string;
  unmute: string;
  toText: string;
  toVoice: string;
  header?: string;
}

export interface SheetCopy {
  title: string;
  lines: { lead: string; rest: string }[];
  micTest: string;
  privacy?: string;
  start: string;
  type: string;
  close: string;
}

export interface VoiceConfig {
  industry: 'hotels' | 'clinics' | 'dental';
  agentId: string;
  greetings: { evening: string; returning: string[]; fresh: string[] };
  agentContext: string;
  businessNoun: string;
  nameLabel: string;
  unitsPlural: string;
  unitEstimate: string;
  revenueWording: string;
  sectionLabels: Record<SectionName, string>;
  roi: RoiConfig;
  licencePrice: number;
  dock: DockCopy;
  sheet: SheetCopy;
}

export interface Presenter {
  navigate(section: string, fromAgent: boolean): boolean;
  setProfile(f: ProfileFields): Promise<string[]>;
  readProfile(): ProfileFields;
  showRoi(): Promise<void>;
  spotlight(key: FeatureKey): boolean;
  recommend(plan: PlanKey, reason?: string): boolean;
  fillApplication(f: DemoFields): Promise<{ filled: string[]; missing: string[] }>;
  readApplication(): DemoFields;
  submitApplication(): Promise<{ ok: boolean; message: string }>;
  handoff?(topic: string, summary: string): void;
}

export interface SessionBinding {
  start(mode: VoiceMode): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;
  sendText(text: string): void;
  sendActivity(): void;
  contextUpdate(text: string, id?: string): void;
}

export interface VoiceEvents {
  state: { state: VoiceState; mode: VoiceMode; muted: boolean };
  tone: { tone: Tone };
  message: { role: 'user' | 'agent'; text: string; time: number };
  activity: { text: string };
  caption: { text: string; who: 'user' | 'agent' };
  typing: { on: boolean };
  connected: { conversationId: string };
  ended: { reason: 'user' | 'agent' | 'error'; duration: number };
  error: { message: string };
  note: { text: string };
  follow: { section: string; label: string };
  mode: { mode: VoiceMode };
}
type Listener<K extends keyof VoiceEvents> = (e: VoiceEvents[K]) => void;

/** ElevenLabs v3 audio tags the agent may open a line with, mapped to the orb's tone */
const TONES: Record<string, Tone> = {
  excited: 'bright', playfully: 'bright', 'laughs softly': 'bright',
  softly: 'soft', sighs: 'soft', thoughtful: 'soft',
  reassuring: 'calm', warmly: 'warm', curious: 'warm',
};
/** The tone of a line from its first [tag]; 'warm' when there is none */
export const toneOf = (raw: string): Tone => TONES[(String(raw).match(/\[([^\]]{1,32})\]/) || [])[1]?.toLowerCase() ?? ''] ?? 'warm';
/** Strip audio tags like [warmly] from displayed text */
export const cleanText = (t: string) => String(t || '').replace(/\[[^\]]{1,32}\]\s*/g, '').replace(/\s{2,}/g, ' ').trim();

/** Syllables at about 5 per second, with short pauses between phrases (the preview's voice level) */
export function speechLike(t: number) {
  const phrase = t % 1.7 < 1.3 ? 1 : 0.08;
  const syllable = Math.abs(Math.sin(t * Math.PI * 4.6) * Math.sin(t * Math.PI * 1.35 + 1.1));
  const grain = 0.5 + 0.5 * Math.sin(t * 17.3) * Math.sin(t * 6.7);
  return phrase * Math.min(1, 0.12 + 0.75 * syllable + 0.2 * grain);
}

const listeners: { [K in keyof VoiceEvents]?: Set<Listener<K>> } = {};
let binding: SessionBinding | null = null;
let simTimers: number[] = [];
let simStop: (() => void) | null = null;

function emit<K extends keyof VoiceEvents>(name: K, payload: VoiceEvents[K]) {
  (listeners[name] as Set<Listener<K>> | undefined)?.forEach((cb) => {
    try { cb(payload); } catch (err) { console.error(err); }
  });
}

function body(key: string, value: string) {
  if (typeof document !== 'undefined' && document.body) document.body.dataset[key] = value;
}

function endSimulation() {
  simTimers.forEach(clearTimeout);
  simTimers = [];
  simStop?.();
  simStop = null;
  voice.level = 0;
}

export const voice = {
  state: 'idle' as VoiceState,
  mode: 'voice' as VoiceMode,
  tone: 'warm' as Tone,
  muted: false,
  /** 0–1, smoothed: the agent's output while speaking, the visitor's mic while listening (written by level.ts) */
  level: 0,
  connectedAt: null as number | null,
  conversationId: null as string | null,
  config: null as VoiceConfig | null,
  presenter: null as Presenter | null,

  configure(c: VoiceConfig) {
    voice.config = c;
    body('state', voice.state);
    body('mode', voice.mode);
    body('tone', voice.tone);
  },
  registerPresenter(p: Presenter) { voice.presenter = p; },
  bind(b: SessionBinding) { binding = b; },
  get bound() { return !!binding; },

  /** Start a conversation; with no session registered, the preview plays a simulated one */
  requestStart(mode: VoiceMode) {
    if (binding) return void binding.start(mode).catch((err) => { console.error(err); voice.error('Could not start the conversation.'); });
    voice.simulate();
  },
  stop() {
    if (simStop || simTimers.length) {
      endSimulation();
      voice.setState('idle');
      return;
    }
    if (binding) return void binding.stop().catch((err) => console.error(err));
    voice.setState('idle');
  },
  setMuted(muted: boolean) {
    voice.muted = muted;
    binding?.setMuted(muted);
    emit('state', { state: voice.state, mode: voice.mode, muted });
  },
  sendText(text: string) { binding?.sendText(text); },
  sendActivity() { binding?.sendActivity(); },
  contextUpdate(text: string, id?: string) { binding?.contextUpdate(text, id); },

  setState(state: VoiceState) {
    voice.state = state;
    if (state === 'idle') voice.muted = false;
    body('state', state);
    emit('state', { state, mode: voice.mode, muted: voice.muted });
  },
  setTone(tone: Tone) {
    if (tone === voice.tone) return;
    voice.tone = tone;
    body('tone', tone);
    emit('tone', { tone });
  },
  setMode(mode: VoiceMode) {
    voice.mode = mode;
    body('mode', mode);
    emit('mode', { mode });
  },
  message(role: 'user' | 'agent', text: string) { emit('message', { role, text, time: Date.now() }); },
  activity(text: string) { emit('activity', { text }); },
  caption(text: string, who: 'user' | 'agent' = 'agent') { emit('caption', { text, who }); },
  typing(on: boolean) { emit('typing', { on }); },
  /** A short notice for the visitor (the toast) */
  note(text: string) { emit('note', { text }); },
  error(message: string) {
    emit('error', { message });
    voice.note(message);
  },
  /** The agent wants to show a section while the visitor is reading: offer it instead of scrolling */
  follow(section: string, label: string) { emit('follow', { section, label }); },
  connected(conversationId: string) {
    voice.connectedAt = Date.now();
    voice.conversationId = conversationId;
    emit('connected', { conversationId });
  },
  ended(reason: 'user' | 'agent' | 'error', duration: number) {
    voice.connectedAt = null;
    emit('ended', { reason, duration });
  },

  /** The preview's call: listening 0–1.8 s, speaking with a speech-like level, idle at 7.6 s */
  simulate() {
    endSimulation();
    voice.setMode('voice');
    voice.setState('listening');
    const t0 = performance.now();
    // Listening: a quiet room tone from the "mic"; speaking: syllables
    simStop = scheduler.add((now) => {
      const t = (now - t0) / 1000;
      voice.level = voice.state === 'speaking' ? speechLike(t) : voice.state === 'listening' ? 0.12 * speechLike(t * 0.7 + 3) : 0;
    }, 50);
    simTimers = [
      window.setTimeout(() => voice.setState('speaking'), 1800),
      window.setTimeout(() => { endSimulation(); voice.setState('idle'); }, 7600),
    ];
  },

  on<K extends keyof VoiceEvents>(name: K, cb: Listener<K>): () => void {
    const set = (listeners[name] ??= new Set() as never) as Set<Listener<K>>;
    set.add(cb);
    return () => { set.delete(cb); };
  },
};

export type Voice = typeof voice;

declare global {
  interface Window { amariyaVoice?: Voice }
}
