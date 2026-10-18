// Canvas2D sources for the porcelain's two textures (uploaded as single-channel R8 by the scene).
// Lithophane: 1024×512 equirectangular, white where the porcelain is carved thin (it glows when lit from inside):
// the six feature glyphs on the equator 60° apart, the nine greetings on a +25° band 40° apart, and on the front
// below the equator the clinic's name, '30' or the wordmark. Mark: 512² underglaze stamp, ring text around 'No. NN / 30'.
import type { FeatureKey } from '../../../scripts/voice/bridge';
import type { Greeting } from '../../../data/content/types';
import type { LithoKey } from './types';

export const LITHO_W = 1024;
export const LITHO_H = 512;
export const MARK_SIZE = 512;

/** Line glyphs on a 24-unit grid, stroked */
const GLYPHS: Record<FeatureKey, string> = {
  // A handset: every call, on the first ring
  answering: 'M7.5 3.5c.6 0 1.1.4 1.3 1l1 3.2c.2.6 0 1.2-.5 1.6l-1.6 1.2a12.5 12.5 0 0 0 5.8 5.8l1.2-1.6c.4-.5 1-.7 1.6-.5l3.2 1c.6.2 1 .7 1 1.3V20a1.5 1.5 0 0 1-1.6 1.5C10.6 21 3 13.4 2.5 5.1A1.5 1.5 0 0 1 4 3.5z',
  // A diary page with a tick: booked
  bookings: 'M4 6.5h16v13.5H4z M4 10.5h16 M8.5 4v4 M15.5 4v4 M9 15.2l2 2 4-4.2',
  // Two scripts side by side
  multilingual: 'M3 5.5h10 M8 3.5v2 M10.8 5.5c-.6 3.4-3 6.4-7 8.3 M5.6 8.6c1.2 2.2 3.1 3.8 5.4 4.8 M12.5 20.5l4-9 4 9 M14 17.2h5',
  // A question, answered or handed on
  guest_requests: 'M4 5.5h16v10h-9l-4.5 4v-4H4z M10 8.8a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1v.4 M12 13.4v.2',
  // The next visit comes round again
  upsells: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v4.2h-4.2 M12 8.5V12l2.5 1.5',
  // Linked: your booking software
  integrations: 'M9.5 14.5l5-5 M10.6 6.8l1.6-1.6a3.8 3.8 0 0 1 5.4 5.4l-1.6 1.6 M13.4 17.2l-1.6 1.6a3.8 3.8 0 0 1-5.4-5.4l1.6-1.6',
};

export interface LithoSpec {
  key: LithoKey;
  /** The dial's order (the page may reorder it by the clinic's biggest challenge) */
  order: FeatureKey[];
  name: string;
  greetings: Greeting[];
}

/** First family named in a CSS font variable (the page's self-hosted face) */
function family(variable: string, fallback: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return raw ? raw.split(',')[0].trim() : fallback;
}

/** Waits for the faces a texture needs (never longer than 2.5 s: a missing face falls back, the texture still draws) */
async function fonts(specs: [string, string][]) {
  if (!document.fonts) return;
  const loads = Promise.all(specs.map(([font, text]) => document.fonts.load(font, text).catch(() => [])));
  await Promise.race([document.fonts.ready.then(() => loads), new Promise((r) => setTimeout(r, 2500))]);
}

const x = (lonDeg: number) => (((lonDeg / 360 + 0.5) % 1) + 1) % 1 * LITHO_W;
const y = (latDeg: number) => (0.5 - latDeg / 180) * LITHO_H;

/**
 * Text drawn so it reads undistorted on the sphere: equirect squeezes longitude by cos(lat), so it is pre-stretched by 1/cos(lat),
 * and fitted to `span` degrees of longitude. Wraps across the seam at the back.
 */
function text(ctx: CanvasRenderingContext2D, s: string, lon: number, lat: number, px: number, font: (px: number) => string, span: number, value: number, dir: 'ltr' | 'rtl' = 'ltr') {
  const stretch = 1 / Math.cos((lat * Math.PI) / 180);
  ctx.font = font(px);
  const room = (span / 360) * LITHO_W;
  const w = ctx.measureText(s).width * stretch;
  const size = w > room ? (px * room) / w : px;
  ctx.font = font(size);
  ctx.direction = dir;
  ctx.fillStyle = `rgb(${Math.round(value * 255)},0,0)`;
  for (const shift of [-LITHO_W, 0, LITHO_W]) {
    ctx.save();
    ctx.translate(x(lon) + shift, y(lat));
    ctx.scale(stretch, 1);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
}

export async function drawLithophane(canvas: HTMLCanvasElement, spec: LithoSpec) {
  const serif = family('--font-display-clinics', 'Georgia');
  const brand = family('--font-brand', 'sans-serif');
  const script = `${serif}, ${family('--font-arabic', 'serif')}, ${family('--font-jp', 'sans-serif')}, serif`;
  const greetFont = (px: number) => `400 ${px}px ${script}`;
  await fonts([
    ...spec.greetings.map((g) => [greetFont(30), g.text] as [string, string]),
    [`300 92px ${serif}`, '30'],
    [`500 64px ${brand}`, 'Amariya'],
    ...(spec.name ? [[`400 48px ${script}`, spec.name] as [string, string]] : []),
  ]);
  canvas.width = LITHO_W;
  canvas.height = LITHO_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LITHO_W, LITHO_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // The equator: one glyph per feature, 60° apart in the dial's order; the one she is talking about carved deepest
  const glyph = 46 / 24;
  spec.order.forEach((key, i) => {
    const value = spec.key === key ? 1 : 0.5;
    ctx.strokeStyle = `rgb(${Math.round(value * 255)},0,0)`;
    ctx.lineWidth = spec.key === key ? 1.8 : 1.5;
    const path = new Path2D(GLYPHS[key]);
    for (const shift of [-LITHO_W, 0, LITHO_W]) {
      ctx.save();
      ctx.translate(x(i * 60) + shift - 12 * glyph, y(0) - 12 * glyph);
      ctx.scale(glyph, glyph);
      ctx.stroke(path);
      ctx.restore();
    }
  });

  // The greetings band, 40° apart: she turns 40° per language
  spec.greetings.forEach((g, k) => text(ctx, g.text, k * 40, 25, 30, greetFont, 34, spec.key === 'greet' ? 1 : 0.4, g.dir));

  // The front, below the equator
  if (spec.key === '30') text(ctx, '30', 0, -32, 92, (px) => `300 ${px}px ${serif}`, 70, 1);
  else if (spec.key === 'mark') text(ctx, 'Amariya', 0, -32, 64, (px) => `500 ${px}px ${brand}`, 110, 1);
  else if (spec.name) text(ctx, spec.name, 0, -32, 48, (px) => `400 ${px}px ${script}`, 110, spec.key === 'name' ? 1 : 0.55);
}

/** The underglaze stamp on her base: ring text around the licence number (drawn upright; the shader mirrors it for the underside) */
export async function drawMark(canvas: HTMLCanvasElement, ring: string, lines: [string, string, string]) {
  const mono = family('--font-mono', 'monospace');
  await fonts([[`500 30px ${mono}`, ring + lines.join('')]]);
  canvas.width = MARK_SIZE;
  canvas.height = MARK_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = MARK_SIZE / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MARK_SIZE, MARK_SIZE);
  ctx.fillStyle = ctx.strokeStyle = '#f00';
  // Two fired rings frame the text
  ctx.lineWidth = 3;
  for (const r of [238, 168]) { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke(); }
  // The ring text runs clockwise from the top, spaced evenly around the whole circle
  ctx.font = `500 30px ${mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...`${ring} · `];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const sum = widths.reduce((a, b) => a + b, 0);
  let angle = -Math.PI / 2;
  chars.forEach((ch, i) => {
    const step = (widths[i] / sum) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(angle + step / 2) * 203, c + Math.sin(angle + step / 2) * 203);
    ctx.rotate(angle + step / 2 + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += step;
  });
  const [number, of, next] = lines;
  ctx.font = `500 74px ${mono}`;
  ctx.fillText(number, c, c - 36);
  ctx.font = `500 42px ${mono}`;
  ctx.fillText(of, c, c + 30);
  ctx.font = `500 24px ${mono}`;
  ctx.fillText(next.toUpperCase(), c, c + 82);
}
