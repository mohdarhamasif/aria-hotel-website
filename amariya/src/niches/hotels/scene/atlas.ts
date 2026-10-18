// Every Canvas2D texture of the /hotels scene: the furniture silhouettes, the key fob numbers, the glass's etching,
// the halo, the brass matcap, and the two text planes (the canopy name and the translation plate).
import * as THREE from 'three';
import { colors } from '../../../data/colors';

const C = colors.hospitality;
/** Channel masks, not colours: a drawing's fill in red, its outline in green, a phone's LED in blue; white is a plain mask */
const FILL = 'rgb(255 0 0)';
const LINE = 'rgb(0 255 0)';
const LED = 'rgb(0 0 255)';
const MASK = 'rgb(255 255 255)';
const VOID = 'rgb(0 0 0)';

/** Furniture cells in the 4×4 atlas (256 px each); every drawing stands on its cell's bottom edge */
export const CELL = { bed: 0, table: 1, lamp: 2, cloche: 3, flute: 4, phone: 5, desk: 6, sofa: 7, tree: 8, parasol: 9 } as const;
export type CellName = keyof typeof CELL;
/** Height of the surface things are set on, as a fraction of the cell */
export const TOP = { desk: 0.43, table: 0.33 } as const;

const fontVar = (name: string, fallback: string) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
};
export const displayFont = () => fontVar('--font-display-hospitality', 'Georgia, serif');
export const bodyFont = () => fontVar('--font-body', 'system-ui, sans-serif');

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { c, ctx };
}

function texture(c: HTMLCanvasElement, data = true) {
  const t = new THREE.CanvasTexture(c);
  // Masks are data, not colour: no sRGB decode
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------- Furniture: silhouettes drawn like a section's furniture, filled and outlined ---------- */

type Draw = (ctx: CanvasRenderingContext2D) => void;

function shape(ctx: CanvasRenderingContext2D, path: (ctx: CanvasRenderingContext2D) => void) {
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = FILL;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.stroke();
}
const rect = (x: number, y: number, w: number, h: number): Draw => (ctx) => shape(ctx, (c) => c.rect(x, y, w, h));
const line = (pts: number[]): Draw => (ctx) => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = LINE;
  ctx.stroke();
};

const DRAWINGS: Record<CellName, Draw[]> = {
  bed: [
    rect(14, 120, 22, 132),
    rect(36, 210, 202, 26),
    rect(36, 176, 202, 34),
    (ctx) => shape(ctx, (c) => c.roundRect(44, 158, 50, 20, 8)),
    rect(42, 236, 8, 16), rect(226, 236, 8, 16),
    line([120, 176, 128, 190, 238, 190]),
  ],
  table: [
    rect(70, 164, 116, 8),
    rect(80, 172, 7, 80), rect(170, 172, 7, 80),
    rect(18, 196, 44, 8), rect(18, 136, 7, 116), rect(55, 204, 7, 48),
    rect(194, 196, 44, 8), rect(231, 136, 7, 116), rect(194, 204, 7, 48),
  ],
  lamp: [
    (ctx) => shape(ctx, (c) => { c.moveTo(98, 40); c.lineTo(158, 40); c.lineTo(178, 98); c.lineTo(78, 98); c.closePath(); }),
    rect(125, 98, 6, 146),
    (ctx) => shape(ctx, (c) => c.ellipse(128, 247, 34, 6, 0, 0, Math.PI * 2)),
  ],
  cloche: [
    (ctx) => shape(ctx, (c) => { c.arc(128, 238, 84, Math.PI, 0); c.closePath(); }),
    (ctx) => shape(ctx, (c) => c.arc(128, 148, 10, 0, Math.PI * 2)),
    (ctx) => shape(ctx, (c) => c.ellipse(128, 244, 112, 8, 0, 0, Math.PI * 2)),
  ],
  flute: [
    (ctx) => shape(ctx, (c) => { c.moveTo(104, 40); c.lineTo(152, 40); c.quadraticCurveTo(152, 168, 128, 172); c.quadraticCurveTo(104, 168, 104, 40); }),
    rect(125, 172, 6, 64),
    (ctx) => shape(ctx, (c) => c.ellipse(128, 242, 40, 8, 0, 0, Math.PI * 2)),
    line([106, 92, 150, 92]),
  ],
  phone: [
    (ctx) => shape(ctx, (c) => { c.moveTo(56, 250); c.lineTo(200, 250); c.lineTo(182, 190); c.lineTo(74, 190); c.closePath(); }),
    (ctx) => shape(ctx, (c) => c.roundRect(50, 160, 156, 24, 12)),
    (ctx) => shape(ctx, (c) => c.roundRect(40, 150, 40, 40, 10)),
    (ctx) => shape(ctx, (c) => c.roundRect(176, 150, 40, 40, 10)),
    line([96, 214, 160, 214]),
    (ctx) => { ctx.beginPath(); ctx.arc(176, 230, 9, 0, Math.PI * 2); ctx.fillStyle = LED; ctx.fill(); },
  ],
  desk: [
    rect(6, 140, 244, 12),
    rect(16, 152, 224, 100),
    line([72, 160, 72, 244]), line([128, 160, 128, 244]), line([184, 160, 184, 244]),
    // The desk bell
    (ctx) => shape(ctx, (c) => { c.arc(206, 136, 14, Math.PI, 0); c.closePath(); }),
    rect(203, 116, 6, 8),
  ],
  sofa: [
    (ctx) => shape(ctx, (c) => c.roundRect(26, 150, 204, 54, 18)),
    rect(30, 196, 196, 28),
    (ctx) => shape(ctx, (c) => c.roundRect(12, 172, 30, 60, 10)),
    (ctx) => shape(ctx, (c) => c.roundRect(214, 172, 30, 60, 10)),
    rect(40, 232, 8, 20), rect(208, 232, 8, 20),
  ],
  tree: [
    rect(121, 150, 14, 102),
    (ctx) => shape(ctx, (c) => { c.arc(128, 96, 64, 0, Math.PI * 2); }),
    (ctx) => shape(ctx, (c) => { c.arc(84, 128, 40, 0, Math.PI * 2); }),
    (ctx) => shape(ctx, (c) => { c.arc(172, 128, 40, 0, Math.PI * 2); }),
    line([128, 150, 104, 120]), line([128, 140, 152, 112]),
  ],
  parasol: [
    (ctx) => shape(ctx, (c) => { c.moveTo(28, 92); c.quadraticCurveTo(128, 18, 228, 92); c.quadraticCurveTo(178, 80, 128, 92); c.quadraticCurveTo(78, 80, 28, 92); }),
    rect(125, 60, 6, 192),
    (ctx) => shape(ctx, (c) => { c.moveTo(146, 226); c.lineTo(236, 226); c.lineTo(236, 234); c.lineTo(146, 234); c.closePath(); }),
    line([150, 226, 170, 186]), line([154, 234, 154, 252]), line([230, 234, 230, 252]),
  ],
};

export function furnitureAtlas(): THREE.CanvasTexture {
  const { c, ctx } = canvas(1024, 1024);
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [name, i] of Object.entries(CELL) as [CellName, number][]) {
    ctx.save();
    ctx.translate((i % 4) * 256, Math.floor(i / 4) * 256);
    for (const d of DRAWINGS[name]) d(ctx);
    ctx.restore();
  }
  const t = texture(c);
  t.generateMipmaps = true;
  return t;
}

/** UV rectangle of a furniture cell (flipY: canvas row 0 is v = 1) */
export function cellUv(i: number): [number, number] {
  return [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 4];
}

/* ---------- Key fobs: numbers 01–30 in an 8×8 grid of 64 px; the 'Issued' plate across the last row ---------- */

export function numberAtlas(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = MASK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const draw = () => {
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = MASK;
    ctx.font = `400 34px ${displayFont()}`;
    for (let n = 1; n <= 30; n++) ctx.fillText(String(n).padStart(2, '0'), ((n - 1) % 8) * 64 + 32, Math.floor((n - 1) / 8) * 64 + 34);
    ctx.font = `400 30px ${displayFont()}`;
    ctx.fillText('ISSUED', 256, 480);
  };
  draw();
  const t = texture(c);
  document.fonts?.load(`400 34px ${displayFont()}`).then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

/* ---------- The glass: a roughness map (green) with an etched band above the champagne and an 'A' monogram ---------- */

export function etchMap(): THREE.CanvasTexture {
  const { c, ctx } = canvas(512, 256);
  const draw = () => {
    // Clear glass reads .06 roughness; the etching .5
    ctx.fillStyle = 'rgb(15 15 15)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgb(128 128 128)';
    ctx.fillRect(0, 103, 512, 10);
    ctx.fillRect(0, 99, 512, 1.5);
    ctx.fillRect(0, 116, 512, 1.5);
    // Equirectangular: u = .25 faces the visitor at rest
    ctx.font = `400 54px ${displayFont()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgb(140 140 140)';
    ctx.fillText('A', 128, 66);
  };
  draw();
  const t = texture(c);
  document.fonts?.load(`400 54px ${displayFont()}`).then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

/* ---------- Halo and matcap ---------- */

export function haloTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgb(255 255 255 / .55)');
  g.addColorStop(0.4, 'rgb(255 255 255 / .32)');
  g.addColorStop(0.7, 'rgb(255 255 255 / .08)');
  g.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(c);
}

/** Brass for coarse pointers (no PMREM): a lit sphere painted in the brass roles */
export function brassMatcap(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(46, 40, 4, 64, 64, 66);
  g.addColorStop(0, C['gilt-hi']);
  g.addColorStop(0.3, C['brass-hi']);
  g.addColorStop(0.65, C.brass);
  g.addColorStop(1, C['house-line']);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(c, false);
}

/* ---------- Text planes ---------- */

export interface TextPlane { texture: THREE.CanvasTexture; aspect: number; draw(text: string, o?: { font?: string; lang?: string; rtl?: boolean }): void }

/** A white-on-black text mask, the text fitted to the canvas width; aspect is the drawn text's width over the canvas height */
export function textPlane(w: number, h: number, size: number): TextPlane {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, w, h);
  const plane: TextPlane = {
    texture: texture(c),
    aspect: 1,
    draw(text, o = {}) {
      ctx.fillStyle = VOID;
      ctx.fillRect(0, 0, w, h);
      if (!text) { plane.aspect = 1; plane.texture.needsUpdate = true; return; }
      const font = o.font ?? `400 ${size}px ${displayFont()}`;
      ctx.font = font;
      ctx.direction = o.rtl ? 'rtl' : 'ltr';
      if (o.lang) c.lang = o.lang;
      const measured = ctx.measureText(text).width;
      const scale = Math.min(1, (w * 0.96) / Math.max(1, measured));
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = MASK;
      ctx.fillText(text, 0, size * 0.04);
      ctx.restore();
      plane.aspect = (Math.min(measured * scale, w) + size * 0.6) / h;
      plane.texture.needsUpdate = true;
    },
  };
  return plane;
}
