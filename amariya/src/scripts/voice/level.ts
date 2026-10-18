// The voice level behind the orb and the dock's mini orb: the agent's output while she speaks, the visitor's
// microphone while she listens (unless muted). A scheduler job that runs only during a voice conversation while
// motion is allowed; it writes voice.level (0–1, smoothed) and :root --amp.
import { voice } from './bridge';
import { current } from './session';
import { scheduler } from '../motion/scheduler';
import { motion } from '../motion/prefs';

const GAIN = 2.2;
const ATTACK = 0.04;
const RELEASE = 0.2;

/** One smoothing step, frame-rate independent: rises with a 40 ms time constant, falls with 200 ms */
export function smooth(from: number, raw: number, dt: number): number {
  const target = Math.min(1, Math.max(0, raw * GAIN));
  return from + (target - from) * (1 - Math.exp(-dt / (target > from ? ATTACK : RELEASE)));
}

let level = 0;
let written = -1;
let stopJob: (() => void) | null = null;

function write(v: number, force = false) {
  voice.level = v;
  // Only real changes touch :root (each write restyles the page)
  if (!force && Math.abs(v - written) < 0.004) return;
  written = v;
  document.documentElement.style.setProperty('--amp', v.toFixed(3));
}

function frame(_now: number, dt: number) {
  const c = current();
  let raw = 0;
  try {
    if (c) raw = voice.state === 'speaking' ? c.getOutputVolume() : voice.state === 'listening' && !voice.muted ? c.getInputVolume() : 0;
  } catch { /* the audio graph is closing */ }
  level = smooth(level, raw, dt);
  write(level);
}

function sync() {
  const want = voice.connectedAt !== null && voice.mode === 'voice' && motion.allowed;
  if (want && !stopJob) {
    stopJob = scheduler.add(frame, 50);
  } else if (!want && stopJob) {
    stopJob();
    stopJob = null;
    level = 0;
    write(0, true);
  }
}

let ready = false;
/** Idempotent; each niche ui.ts calls it */
export function init(): void {
  if (ready) return;
  ready = true;
  for (const event of ['connected', 'ended', 'mode', 'state'] as const) voice.on(event, sync);
  motion.on(sync);
}
