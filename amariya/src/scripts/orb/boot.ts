// Starts the page's orb and connects it to the voice bridge.
// The talk controls work at once; Three.js and the niche scene load only once the page is idle.
// Without WebGL 2, or on any error, the CSS still of the orb stays and the controls keep working.
import type { OrbScene, OrbStage, OrbState } from './stage';
import { voice } from '../voice/bridge';

declare global {
  interface Window { amariyaOrb?: OrbStage }
}

const SCENES: Record<string, () => Promise<(root: HTMLElement) => OrbScene>> = {
  champagne: () => import('../../niches/hotels/scene/index').then((m) => m.createScene),
  porcelain: () => import('../../niches/clinics/scene/index').then((m) => m.createScene),
  pearl: () => import('../../niches/dental/scene/index').then((m) => m.createScene),
};

const STATUS: Record<OrbState, string> = {
  idle: 'Amariya is ready',
  connecting: 'Amariya is connecting',
  listening: 'Amariya is listening',
  thinking: 'Amariya is thinking',
  speaking: 'Amariya is speaking',
};

function supportsWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200));
const toggle = () => (voice.state === 'idle' ? voice.requestStart('voice') : voice.stop());

let booted = false;
let stage: OrbStage | null = null;

/** Idempotent: the OrbRoot component and the niche page may both call it */
export function boot() {
  if (booted) return;
  booted = true;
  window.amariyaVoice = voice;
  const root = document.querySelector<HTMLElement>('[data-orb]');

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (target?.closest?.('[data-orb-talk]')) voice.requestStart('voice');
    else if (target?.closest?.('[data-orb-type]')) voice.requestStart('text');
  });
  if (!root) return;
  root.addEventListener('orb:tap', toggle);
  voice.on('state', ({ state }) => {
    if (stage) return stage.setState(state);
    root.dataset.state = state;
    const status = root.querySelector('[data-orb-status]');
    if (status) status.textContent = STATUS[state];
  });
  voice.on('tone', ({ tone }) => stage?.setTone(tone));

  const start = () => idle(() => void load(root));
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

async function load(root: HTMLElement) {
  const fixed = root.dataset.orbCanvas === 'fixed';
  const canvas = fixed ? document.querySelector<HTMLCanvasElement>('[data-stage-canvas]') : root.querySelector('canvas');
  const scene = SCENES[root.dataset.orb ?? ''];
  if (!canvas || !scene || !supportsWebGL2()) return stillOnly(root);
  try {
    const [{ OrbStage }, create] = await Promise.all([import('./stage'), scene()]);
    stage = new OrbStage(root, canvas, create(root), fixed ? 'fixed' : 'inline');
    stage.setAmpSource(() => voice.level);
    if (voice.state !== 'idle') stage.setState(voice.state);
    if (voice.tone !== 'warm') stage.setTone(voice.tone);
    window.amariyaOrb = stage;
  } catch (err) {
    console.warn('Orb stayed on its still image:', err);
    stillOnly(root);
  }
}

/** No 3D: the still orb is still the talk button */
function stillOnly(root: HTMLElement) {
  root.addEventListener('click', toggle);
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      toggle();
    }
  });
}
