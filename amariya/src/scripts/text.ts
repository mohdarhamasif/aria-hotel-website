// Text helpers for the agent's hands on the page: typing into fields like a person, matching selects and chips,
// the field flash and number count-ups (ported from app.js).
import { motion } from './motion/prefs';

export { fmtMoney } from './apply/roi';

type Field = HTMLInputElement | HTMLTextAreaElement;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timers = new WeakMap<Element, number>();

/** Adds .flash for ms (the field's "she wrote this" glow) */
export function flash(el: Element, ms = 1400) {
  el.classList.remove('flash');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('flash');
  clearTimeout(timers.get(el));
  timers.set(el, window.setTimeout(() => el.classList.remove('flash'), ms));
}

const changed = (el: Element) => {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

/** Types text into a field at 14–40 ms a character; instant over 60 characters, under reduced motion or Pause */
export async function typeInto(el: Field, text: string, o: { instant?: boolean } = {}): Promise<void> {
  el.classList.add('filling');
  if (o.instant || !motion.allowed || text.length > 60) {
    el.value = text;
  } else {
    el.value = '';
    for (const ch of text) {
      el.value += ch;
      await sleep(14 + Math.random() * 26);
    }
  }
  el.classList.remove('filling');
  changed(el);
  flash(el);
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();
/** value, then visible text, then a substring of the text */
function fuzzy<T>(items: T[], v: string, value: (t: T) => string, text: (t: T) => string): T | undefined {
  return items.find((i) => norm(value(i)) === v) ?? items.find((i) => norm(text(i)) === v) ?? items.find((i) => !!v && norm(text(i)).includes(v));
}

/**
 * Sets a named field from the agent: true when set at once, a promise while it types, false when not applicable.
 * Selects, radios and chips ([data-chip-value] inside a fieldset named after the field) match fuzzily.
 */
export function setField(form: HTMLFormElement, name: string, value: unknown): boolean | Promise<boolean> {
  if (value === undefined || value === null || value === '') return false;
  const v = norm(Array.isArray(value) ? value.join(', ') : String(value));
  const el = form.elements.namedItem(name);

  if (el instanceof HTMLSelectElement) {
    const opt = fuzzy([...el.options], v, (o) => o.value, (o) => o.text);
    if (!opt) return false;
    el.value = opt.value || opt.text;
    changed(el);
    flash(el);
    return true;
  }
  const radios = el instanceof RadioNodeList ? [...el].filter((r): r is HTMLInputElement => r instanceof HTMLInputElement && r.type === 'radio') : el instanceof HTMLInputElement && el.type === 'radio' ? [el] : [];
  if (radios.length) {
    const radio = fuzzy(radios, v, (r) => r.value, (r) => r.labels?.[0]?.textContent ?? r.value);
    if (!radio) return false;
    radio.checked = true;
    changed(radio);
    flash(radio.closest('label') ?? radio);
    return true;
  }
  const fieldset = form.querySelector<HTMLFieldSetElement>(`fieldset[name="${name}"], fieldset[data-field="${name}"]`);
  const chips = fieldset ? [...fieldset.querySelectorAll<HTMLElement>('[data-chip-value]')] : [];
  if (chips.length) {
    const chip = fuzzy(chips, v, (c) => c.dataset.chipValue ?? '', (c) => c.textContent ?? '');
    if (!chip) return false;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    const hidden = el instanceof HTMLInputElement ? el : null;
    if (hidden) hidden.value = chip.dataset.chipValue ?? '';
    changed(chip);
    flash(chip);
    return true;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    if (el.type === 'hidden') { el.value = text; changed(el); return true; }
    if (el.value === text) return true;
    return typeInto(el, text).then(() => true);
  }
  return false;
}

/** Counts a number up from its last value (data-value) over ms with an ease-out cubic; instant without motion */
export function countUp(el: HTMLElement, value: number, o: { ms?: number; format?: (n: number) => string } = {}) {
  const fmt = o.format ?? ((n: number) => n.toLocaleString('en-US'));
  const from = Number(el.dataset.value) || 0;
  el.dataset.value = String(value);
  if (!motion.allowed || from === value) { el.textContent = fmt(value); return; }
  const ms = o.ms ?? 900, t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1 && el.dataset.value === String(value)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
