// The /hotels scene's public contract: the night clock, the house and the key rack, as the page (and tests) see them.
// The scene module exposes them on window once three.js has loaded (the page is idle by then); before that they are undefined.

/** Where the camera and the lantern go for a chapter */
export type AnchorKey =
  | 'prologue' | 'house' | 'restaurant' | 'lobby' | 'room214' | 'desk' | 'office'
  | 'room507' | 'handover' | 'keys' | 'register' | 'faq' | 'checkout';

export interface ChapterInfo {
  /** The chapter id (data-chapter), e.g. 'room-214' */
  id: string;
  /** 'HH:MM', 'now' (the prologue) or '' (off the clock) */
  hour: string;
  /** Minutes since 18:00, 0–825; the prologue reads the visitor's own hour (18:00 by day) */
  minutes: number;
  anchor: AnchorKey;
  /** The data-room text */
  room: string;
  el: HTMLElement;
}

export interface NightEvent {
  minutes: number;
  chapter: ChapterInfo;
  /** 0–1 through the chapter */
  progress: number;
}

export interface NightApi {
  /** Minutes since 18:00 at the current scroll position */
  readonly minutes: number;
  readonly chapters: ChapterInfo[];
  /** Scrolls the page to that minute of the night (0 = 18:00, 825 = 07:45) */
  setMinutes(m: number, o?: { immediate?: boolean }): Promise<void>;
  /** The 'lights down' hook: setMinutes with an instant cut (the DOM scrim is the page's) */
  jump(m: number): Promise<void>;
  /** The chapter on the clock at that minute (the last one at or before it), in page order */
  chapterAt(m: number): ChapterInfo | null;
  /** Called when the minute or the chapter changes; returns the remover */
  on(cb: (e: NightEvent) => void): () => void;
}

export type Ground = 'lobby+restaurant' | 'restaurant' | 'lobby';
export type Roof = 'terrace' | 'garden' | 'plain' | 'pitched';
export type ScenarioId = 'boutique' | 'resort' | 'restaurant' | 'hotel-restaurant';

export interface HouseParams {
  /** 2–9; from rooms: ceil(rooms / 14) */
  floors: number;
  /** 3–12 */
  bays: number;
  ground: Ground;
  roof: Roof;
  /** Gilded on the canopy; '' leaves the fascia blank */
  name: string;
}

/** rebuild() also takes the Property Card's own words: rooms sets the floors, hotel_type the ground floor and roof, hotel_name the name */
export type HouseInput = Partial<HouseParams> & { rooms?: number | string; hotel_type?: string; hotel_name?: string };

export interface HouseApi {
  /** Debounced 150 ms; the new house rises in 900 ms. A name-only change just re-gilds the canopy */
  rebuild(p: HouseInput): void;
  readonly params: HouseParams;
  /** The four scenario chips (no name, so a chip keeps the house's name) */
  readonly presets: Record<ScenarioId, Omit<HouseParams, 'name'>>;
  /** Keeps a room lit: an anchor key ('room214') or a chapter id ('room-214') */
  lightRoom(room: string): void;
  carry?: never;
}

export interface KeysApi {
  /** Swings key n (1–30) and turns its fob to the visitor */
  swing(n: number): void;
  /** Key n (default: the next open one) rises 6 cm off its hook and turns toward the visitor */
  lift(n?: number): void;
  /** Keys 1..issued are taken (an engraved plate hangs instead), the next `held` are held, the rest hang open */
  setLedger(l: { issued: number; held: number }): void;
}

declare global {
  interface Window {
    amariyaNight?: NightApi;
    amariyaHouse?: HouseApi;
    amariyaKeys?: KeysApi;
  }
}
