// Types shared by the clinics orb world (the page API on window.amariyaPorcelain, the state the scene reads, the events).
import type { FeatureKey } from '../../../scripts/voice/bridge';
import type { Body } from './physics';

/** What the lithophane carves deepest: a feature glyph, the greetings, the clinic's name, '30' or the wordmark */
export type LithoKey = FeatureKey | 'greet' | 'name' | '30' | 'mark';

/** window.amariyaPorcelain: the page's hands on the orb */
export interface PorcelainApi {
  /** Turn her over (900 ms) so the underglaze mark on her base faces the visitor */
  showMark(): void;
  /** Carve this deepest (cross-fades 500 ms); a feature key in the dial also turns her to its detent */
  setLithophane(key: LithoKey): void;
  setClinicName(name: string): void;
  /** Clinic hours as minutes since midnight (values up to 24 are read as hours): they decide when her night falls */
  setHours(open: number, close: number): void;
  /** Roll her onto an element (next to the line on her side when it sits on the line or beyond it) */
  placeOn(target: HTMLElement): void;
  goHome(): void;
  /** She presses into the line, it dents, she hands off (line:handoff) and rebounds */
  pushAcrossLine(): void;
  /** Index of the current point (chapter), 0-based */
  readonly point: number;
  /** Scroll to point n; she rolls along */
  setPoint(n: number): void;
  /** First visit: she falls 24 px onto her anchor on the lift spring and plucks the line once */
  intro(): void;
}

/** State the handle writes and the porcelain scene reads every frame */
export interface World {
  body: Body;
  /** 1 while the cursor is within 1.8 r of her */
  near: number;
  litho: { key: LithoKey; order: FeatureKey[]; name: string; version: number };
  mark: { shown: boolean; n: number };
  /** She must face exactly (dial detents, greetings, the mark): her idle self-turn stops */
  lock: boolean;
  /** In the phone's thumb cradle, or on her way out of it: chrome over the page (html[data-orb-cradle]) */
  cradle: boolean;
}

/** Events on document. Coordinates are viewport px. */
export interface PorcelainEvents {
  /** She pressed into the line hard enough: the question goes to the team */
  'line:handoff': { x: number; y: number };
  /** The dial settled on a detent (user: turned by the visitor rather than by scrolling) */
  'dial:detent': { index: number; key: FeatureKey; user: boolean };
  /** Dropped (or placed by the page) on a [data-point] ring or a [data-ask] target */
  'orb:placed': { target: HTMLElement; via: 'drag' | 'api' };
  /** A sentence for the page's polite live region */
  'orb:status': { text: string };
  /** L on the focused orb: play this point's note */
  'orb:note': { point: string };
  /** Sent by the page: the story's scrubbed clock (null hands the light back to the real time); sweep: an agent's jump */
  'clinic:time': { minutes: number | null; sweep?: boolean };
  /** Sent by the page: the phone rings (two plucked bursts run down the line from the bar) */
  'line:ring': Record<string, never>;
}

declare global {
  interface Window { amariyaPorcelain?: PorcelainApi }
  interface DocumentEventMap {
    'line:handoff': CustomEvent<PorcelainEvents['line:handoff']>;
    'dial:detent': CustomEvent<PorcelainEvents['dial:detent']>;
    'orb:placed': CustomEvent<PorcelainEvents['orb:placed']>;
    'orb:status': CustomEvent<PorcelainEvents['orb:status']>;
    'orb:note': CustomEvent<PorcelainEvents['orb:note']>;
    'clinic:time': CustomEvent<PorcelainEvents['clinic:time']>;
    'line:ring': CustomEvent<PorcelainEvents['line:ring']>;
  }
}
