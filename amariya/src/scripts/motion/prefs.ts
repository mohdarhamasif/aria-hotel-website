// Motion preferences: the system's reduced-motion setting plus the page's own Pause motion control.
// Writes html[data-motion="on"|"paused"|"reduced"], wires every [data-orb-pause] button and remembers the choice.

const KEY = 'amariya_motion';
const query = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set<() => void>();

function remembered() {
  try { return localStorage.getItem(KEY) === 'paused'; } catch { return false; }
}

export const motion = {
  reduced: query.matches,
  paused: remembered(),
  /** True when things may move on their own */
  get allowed() { return !motion.reduced && !motion.paused; },
  setPaused(paused: boolean) {
    if (paused === motion.paused) return;
    motion.paused = paused;
    try { localStorage.setItem(KEY, paused ? 'paused' : 'on'); } catch { /* private mode: the choice lasts for this page */ }
    apply();
  },
  /** Called on every change; returns the remover */
  on(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
};

function sync(button: HTMLElement) {
  button.setAttribute('aria-pressed', String(motion.paused));
  const label = button.querySelector('[data-motion-label]') ?? button;
  label.textContent = motion.paused ? 'Play motion' : 'Pause motion';
}

/** Animations Pause stopped (CSS transitions and script animations: CSS can only pause CSS animations) */
const held = new Set<Animation>();
function hold(paused: boolean) {
  if (typeof document.getAnimations !== 'function') return;
  if (paused) {
    for (const a of document.getAnimations()) if (a.playState === 'running') { a.pause(); held.add(a); }
  } else {
    for (const a of held) { try { a.play(); } catch { /* finished or removed meanwhile */ } }
    held.clear();
  }
}

function apply() {
  document.documentElement.dataset.motion = motion.reduced ? 'reduced' : motion.paused ? 'paused' : 'on';
  // Pause freezes every running animation where it is; reduced motion is handled by each animation (none start)
  hold(motion.paused);
  document.querySelectorAll<HTMLElement>('[data-orb-pause]').forEach(sync);
  listeners.forEach((cb) => {
    try { cb(); } catch (err) { console.error(err); }
  });
}

query.addEventListener('change', () => {
  motion.reduced = query.matches;
  apply();
});
// Delegated, so buttons rendered later work too
document.addEventListener('click', (e) => {
  const button = (e.target as Element | null)?.closest?.('[data-orb-pause]');
  if (button) motion.setPaused(!motion.paused);
});
apply();
