// Small synthesised sounds (no files). Off by default, remembered, silent while motion is paused.
// The AudioContext is created or resumed inside a visitor gesture, as browsers require.
import { motion } from './motion/prefs';

export type SoundName = 'ting' | 'bell' | 'tick' | 'pluck' | 'hush' | 'chimeC5G5' | 'chimeG5B5' | 'tink';

const KEY = 'amariya_sound';
let ctx: AudioContext | null = null;

function remembered() {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}

/** Only call inside a gesture */
function wake() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
}

/** A sine (or other wave) with a short attack and an exponential decay */
function tone(c: AudioContext, freq: number, at: number, gain: number, decay: number, attack = 0.005, type: OscillatorType = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + attack + decay + 0.05);
}

/** Struck metal or glass: inharmonic partials, the higher ones quieter and shorter */
function partials(c: AudioContext, base: number, ratios: number[], gain: number, decay: number) {
  ratios.forEach((r, i) => tone(c, base * r, c.currentTime, gain / (i + 1), decay / (1 + i * 0.6), 0.003));
}

function chime(c: AudioContext, a: number, b: number) {
  tone(c, a, c.currentTime, 0.06, 0.35, 0.02);
  tone(c, b, c.currentTime + 0.12, 0.06, 0.35, 0.02);
}

const PRESETS: Record<SoundName, (c: AudioContext) => void> = {
  ting: (c) => partials(c, 1568, [1, 2.76, 5.4, 8.93], 0.05, 1.2),
  bell: (c) => { tone(c, 1318, c.currentTime, 0.05, 1.4, 0.004); tone(c, 2640, c.currentTime, 0.025, 1.4 * 0.6, 0.004); },
  tick: (c) => tone(c, 1600, c.currentTime, 0.04, 0.006, 0.001, 'square'),
  pluck: (c) => { tone(c, 196, c.currentTime, 0.07, 0.6, 0.004, 'triangle'); tone(c, 392, c.currentTime, 0.035, 0.6 * 0.7, 0.004, 'triangle'); },
  hush: (c) => {
    const len = Math.round(c.sampleRate * 0.14);
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), filter = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.8;
    g.gain.value = 0.05;
    src.connect(filter).connect(g).connect(c.destination);
    src.start();
  },
  chimeC5G5: (c) => chime(c, 523.25, 783.99),
  chimeG5B5: (c) => chime(c, 783.99, 987.77),
  tink: (c) => partials(c, 2349, [1, 2.32, 4.25, 6.63], 0.04, 0.5),
};

function sync() {
  document.querySelectorAll<HTMLElement>('[data-sound-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(sound.enabled)));
}

export const sound = {
  enabled: remembered(),
  toggle() {
    sound.enabled = !sound.enabled;
    try { localStorage.setItem(KEY, sound.enabled ? 'on' : 'off'); } catch { /* lasts for this page */ }
    if (sound.enabled) wake();
    sync();
    if (sound.enabled) sound.play('tick');
  },
  play(name: SoundName) {
    if (!sound.enabled || motion.paused || !ctx || ctx.state !== 'running') return;
    try { PRESETS[name](ctx); } catch { /* audio is a nicety */ }
  },
};

document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.('[data-sound-toggle]')) sound.toggle();
});
// Sound remembered as on: the context can only start at the visitor's first gesture
for (const type of ['pointerdown', 'keydown'] as const) addEventListener(type, () => { if (sound.enabled) wake(); }, { capture: true, passive: true });
sync();
