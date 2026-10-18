// Scripted calls: lines arrive after a typing pause, Amariya's replies stream in word by word (ported from experience.js).
import { motion } from './motion/prefs';
import type { FeatureKey } from './voice/bridge';

export interface CallLine {
  /** g = the caller (guest/patient), a = Amariya */
  who: 'g' | 'a';
  text: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  /** A timestamp shown with the line, e.g. '03:10' */
  at?: string;
}

export interface CallScript {
  id: string;
  meta: string;
  done: string;
  time?: string;
  feature?: FeatureKey;
  lines: CallLine[];
  /** Real recordings only; never synthesised for the page */
  audio?: { src: string; alignment: unknown };
}

export interface PlayOptions {
  onLine?: (li: HTMLLIElement, line: CallLine, index: number) => void;
  onDone?: (li: HTMLLIElement) => void;
  /** Render every line complete at once (also under reduced motion or Pause) */
  static?: boolean;
}

export interface Playback {
  promise: Promise<void>;
  /** Stop playing; lines already shown stay */
  stop(): void;
  /** Skip the current pause and show the next line now; false when nothing is left */
  next(): boolean;
}

const TYPING = { g: 800, a: 1200 } as const;
const PER_WORD = 75;

function lineItem(line: CallLine, state: 'typing' | 'in') {
  const li = document.createElement('li');
  li.dataset.who = line.who;
  li.dataset.state = state;
  li.dir = line.dir ?? 'auto';
  if (line.lang) li.lang = line.lang;
  if (line.at) li.dataset.at = line.at;
  return li;
}

function words(li: HTMLLIElement, text: string, on: boolean) {
  const spans = text.split(' ').map((w) => {
    const s = document.createElement('span');
    s.className = on ? 'w on' : 'w';
    s.textContent = w;
    return s;
  });
  spans.forEach((s, i) => li.append(s, i < spans.length - 1 ? ' ' : ''));
  return spans;
}

function doneItem(text: string) {
  const li = document.createElement('li');
  li.dataset.done = '';
  li.dataset.state = 'in';
  li.dir = 'auto';
  li.textContent = text;
  return li;
}

/**
 * Plays a call into an <ol>. The first line is expected to be static HTML already in the list ([data-static]),
 * so the script starts from the second. Under reduced motion or Pause every line renders complete at once.
 */
export function playScript(list: HTMLOListElement, script: CallScript, o: PlayOptions = {}): Playback {
  const skipFirst = !!list.querySelector('[data-static]');
  const lines = script.lines.slice(skipFirst ? 1 : 0);
  const offset = skipFirst ? 1 : 0;
  let stopped = false;
  let skip: (() => void) | null = null;
  /** Set by next(): the coming line shows at once */
  let hurry = false;
  let index = 0;

  if (o.static || !motion.allowed) {
    lines.forEach((line, i) => {
      const li = lineItem(line, 'in');
      li.textContent = line.text;
      list.append(li);
      o.onLine?.(li, line, i + offset);
    });
    const done = doneItem(script.done);
    list.append(done);
    o.onDone?.(done);
    return { promise: Promise.resolve(), stop() {}, next: () => false };
  }

  // A wait the visitor (or next()) can cut short
  const wait = (ms: number) => new Promise<void>((resolve) => {
    const id = window.setTimeout(() => { skip = null; resolve(); }, ms);
    skip = () => { clearTimeout(id); skip = null; resolve(); };
  });

  const run = async () => {
    for (; index < lines.length; index++) {
      if (stopped) return;
      const line = lines[index];
      const li = lineItem(line, 'typing');
      li.setAttribute('aria-hidden', 'true');
      li.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
      list.append(li);
      if (!hurry) await wait(TYPING[line.who]);
      if (stopped) return void li.remove();
      li.replaceChildren();
      li.removeAttribute('aria-hidden');
      li.dataset.state = 'in';
      if (line.who === 'a') {
        for (const s of words(li, line.text, false)) {
          if (stopped) break;
          s.classList.add('on');
          if (!hurry) await wait(PER_WORD);
        }
        li.querySelectorAll('.w').forEach((s) => s.classList.add('on'));
      } else {
        li.textContent = line.text;
      }
      hurry = false;
      o.onLine?.(li, line, index + offset);
      await wait(900 + line.text.length * 22);
    }
    if (stopped) return;
    const done = doneItem(script.done);
    list.append(done);
    o.onDone?.(done);
  };

  return {
    promise: run(),
    stop() { stopped = true; skip?.(); },
    next() {
      if (stopped || index >= lines.length) return false;
      hurry = true;
      skip?.();
      return true;
    },
  };
}
