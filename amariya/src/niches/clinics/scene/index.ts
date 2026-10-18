// /clinics: the sundial porcelain on the page's fixed stage canvas, and the world she lives in (her body, the Line, the gestures).
import type { OrbScene } from '../../../scripts/orb/stage';
import { startWorld } from './handle';
import { createPorcelainLine } from './porcelain-line';

export function createScene(root: HTMLElement): OrbScene {
  return createPorcelainLine(startWorld(root));
}
