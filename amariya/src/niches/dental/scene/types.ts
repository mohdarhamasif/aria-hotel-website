// The pearl's contract with the /dental page (P8 reads this file).
//
// DOM the scene uses (all optional: without them the pearl simply stays where the page put it):
// - The .orb root: position absolute. The scene owns its `transform` (translate in px, no CSS transition on it) and
//   its `--orb` (the box, which includes the 1.3× pad for the shadow and halo: the pearl's diameter is --orb / 1.3).
//   Before the 3D loads the CSS still sits wherever the page placed it; the scene then rolls the pearl in from the left.
// - Recesses: `[data-slot="<id>"][data-time="HH:MM"]`, in time order. `[data-anchor]` marks the recesses the pearl
//   rests in while reading (hero, tally, one per working-day entry, footer baseline); `[data-open]` marks gaps the
//   pearl can be dropped into. Optional `--slot-orb: <px>` on a recess sets the pearl's box there (defaults: hero
//   360, lane 180, footer 240; phones ≤ 734 px: 234, 72, 160). While the pearl is carried, an open recess within
//   40 px of it gets `data-reach`. While the sheet scrolls she rolls down the recess column at the reading line
//   (38svh), on phones too, so keep that column free of text between recesses.
// - `svg[data-trace]`: the roll trace is drawn in it (a group with a clip hole under the pearl).
// - `path[data-string]`: the lane's hairline. The scene keeps it straight from under the pearl to the dock's top;
//   during a call it gets `data-live` and vibrates (rose-gold, var(--color-string)).
//
// Events:
// - document 'pearl:arrive' {slot}: the pearl's slot changed (scrolling between anchors, a set, a carry).
// - document 'sheet:fill' {slot, time}: the visitor (or carryTo) set the pearl into an open gap: ink its call.
// - root 'orb:status' {text} (bubbles): keyboard carrying, for the page's polite live region.
// Keys on the focused pearl: Shift+↑/↓ carry between recesses, Enter/Space set, Escape puts her back, J/K and
// PageUp/PageDown jump entry to entry, Home returns to the first anchor (the 07:45 "Now" recess), hold P to polish.

export interface PearlApi {
  /** 0–1: sets the lustre and polishes the face toward the viewer; it fades over ~20 s */
  polish(level: number): void;
  readonly lustre: number;
  /** Lifts her out of her recess where she is (as a long press does) */
  lift(): void;
  /** Sets her into an open recess within 40 px, otherwise she rolls back to the nearest anchor */
  drop(): void;
  /** Carries her to any element (scrolling it to the reading line) and sets her there; an open recess is filled */
  carryTo(target: HTMLElement): Promise<void>;
  /** Moves her into a recess by its data-slot id (no fill, no sound) */
  setSlot(id: string): void;
  /** The data-slot id she rests in, or null before the page has recesses */
  readonly currentSlot: string | null;
  /** Called with the slot id whenever she arrives somewhere new; returns the remover */
  onArrive(cb: (slot: string) => void): () => void;
}

export interface PearlArriveDetail { slot: string }
export interface SheetFillDetail { slot: string; time: string }
export interface OrbStatusDetail { text: string }

declare global {
  interface Window {
    /** Set once the dental scene has loaded (undefined without WebGL 2) */
    amariyaPearl?: PearlApi;
  }
  interface DocumentEventMap {
    'pearl:arrive': CustomEvent<PearlArriveDetail>;
    'sheet:fill': CustomEvent<SheetFillDetail>;
    'orb:status': CustomEvent<OrbStatusDetail>;
  }
}
