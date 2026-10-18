// The roll trace: a 1 px rose-gold line the pearl leaves on the paper as it rolls, each piece fading over 2 s.
// Drawn in the page's svg[data-trace], above the canvas, so a clip hole keeps it off the pearl's face.
import { motion } from '../../../scripts/motion/prefs';

const NS = 'http://www.w3.org/2000/svg';
/** A new path every 100 ms, so the line fades out in short steps behind the pearl */
const PIECE_MS = 100;
const FADE_MS = 2000;
const HOLE_ID = 'pearl-trace-hole';

/** Client px → the svg's user units */
const map = (m: DOMMatrix, x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] as const;
const f1 = (n: number) => n.toFixed(1);

export interface Trace {
  readonly svg: SVGSVGElement | null;
  /** True while any piece is still fading (the hole must follow the pearl) */
  readonly busy: boolean;
  /** Adds the pearl's centre (client px) at time now (ms) */
  add(x: number, y: number, now: number, inv: DOMMatrix): void;
  /** Ends the line: the next point starts a new one (after a jump) */
  lift(): void;
  /** Moves the clip hole to the pearl (client px, radius px) */
  hole(x: number, y: number, r: number, inv: DOMMatrix): void;
  dispose(): void;
}

export function createTrace(): Trace {
  const svg = document.querySelector<SVGSVGElement>('svg[data-trace]');
  if (!svg) return { svg: null, busy: false, add() {}, lift() {}, hole() {}, dispose() {} };

  const defs = document.createElementNS(NS, 'defs');
  const clip = document.createElementNS(NS, 'clipPath');
  clip.id = HOLE_ID;
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const cut = document.createElementNS(NS, 'path');
  cut.setAttribute('clip-rule', 'evenodd');
  clip.append(cut);
  defs.append(clip);
  const group = document.createElementNS(NS, 'g');
  group.setAttribute('clip-path', `url(#${HOLE_ID})`);
  group.setAttribute('fill', 'none');
  group.setAttribute('aria-hidden', 'true');
  group.style.cssText = 'stroke: var(--color-decor-sheen); stroke-width: 1px; stroke-linecap: round; stroke-linejoin: round; pointer-events: none';
  svg.append(defs, group);

  const fading = new Set<Animation>();
  let path: SVGPathElement | null = null;
  let d = '';
  let born = 0;
  let last: readonly [number, number] | null = null;
  let holeD = '';

  // Pause motion holds the fading pieces where they are, like every other animation on the page
  const offMotion = motion.on(() => fading.forEach((a) => (motion.paused ? a.pause() : a.play())));

  return {
    svg,
    get busy() { return fading.size > 0; },
    add(x, y, now, inv) {
      const p = map(inv, x, y);
      if (!path || now - born > PIECE_MS) {
        path = document.createElementNS(NS, 'path');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        // Each piece starts where the last ended, so the line stays whole
        d = last ? `M${f1(last[0])} ${f1(last[1])}L${f1(p[0])} ${f1(p[1])}` : `M${f1(p[0])} ${f1(p[1])}`;
        born = now;
        group.append(path);
        const piece = path;
        const fade = piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'linear', fill: 'forwards' });
        fading.add(fade);
        fade.onfinish = () => { fading.delete(fade); piece.remove(); };
      } else {
        d += `L${f1(p[0])} ${f1(p[1])}`;
      }
      path.setAttribute('d', d);
      last = p;
    },
    lift() { path = null; last = null; },
    hole(x, y, r, inv) {
      const [cx, cy] = map(inv, x, y);
      const ru = r * Math.sqrt(Math.abs(inv.a * inv.d - inv.b * inv.c));
      // Everything, minus a disc under the pearl (even-odd)
      const next = `M-1e5 -1e5H1e5V1e5H-1e5Z M${f1(cx - ru)} ${f1(cy)}a${f1(ru)} ${f1(ru)} 0 1 0 ${f1(2 * ru)} 0a${f1(ru)} ${f1(ru)} 0 1 0 ${f1(-2 * ru)} 0Z`;
      if (next !== holeD) cut.setAttribute('d', (holeD = next));
    },
    dispose() {
      offMotion();
      fading.forEach((a) => a.cancel());
      defs.remove();
      group.remove();
    },
  };
}
