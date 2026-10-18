// Colour system for the three niche sites: OKLCH ramps → semantic roles → every rendered pair measured.
// Writes src/styles/tokens.css (CSS) and src/data/colors.ts (hex values for the WebGL orbs).
// Run: npm run palettes
import { formatHex, clampChroma, wcagContrast, converter } from 'culori';
import fs from 'node:fs';

const toOklch = converter('oklch');
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// Lightness per step: finer at the light end, never pure white or black
const LIGHT_L = [0.975, 0.935, 0.885, 0.815, 0.72, 0.625, 0.535, 0.455, 0.38, 0.305, 0.235];
// Dark-theme neutrals: the dark end spaced wider so surfaces separate
const DARK_L = [0.97, 0.93, 0.875, 0.79, 0.69, 0.59, 0.5, 0.42, 0.35, 0.28, 0.215];
// Vividness as a share of each hue's own sRGB maximum, peaking mid-ramp
const SHAPE = [0.4, 0.55, 0.68, 0.8, 0.92, 1, 0.98, 0.9, 0.8, 0.68, 0.56];
const SHAPE_GOLD = [0.22, 0.35, 0.5, 0.72, 0.9, 1, 0.98, 0.9, 0.78, 0.62, 0.5]; // keeps champagne-50 an ivory
const ERROR_H = 27, SUCCESS_H = 150;

function maxC(l, h) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) / 2;
    const c = clampChroma({ mode: 'oklch', l, c: m, h }, 'oklch');
    if (Math.abs(c.c - m) < 1e-4) lo = m; else hi = m;
  }
  return lo;
}
// The colour exactly as the token declares it: 3 decimals, chroma floored so it stays inside sRGB
function mk(l, c, h) {
  const k = clampChroma({ mode: 'oklch', l, c, h }, 'oklch');
  const col = { mode: 'oklch', l: +l.toFixed(3), c: Math.floor(k.c * 1000) / 1000, h };
  return { col, hex: formatHex(col), css: `oklch(${col.l} ${col.c} ${h})` };
}
const ramp = (h, L, viv, shape) => Object.fromEntries(STEPS.map((s, i) => [s, mk(L[i], maxC(L[i], h) * viv * shape[i], h)]));
const neutral = (h, L, C) => Object.fromEntries(STEPS.map((s, i) => [s, mk(L[i], C[i], h)]));
// Status: only the steps a role consumes (light themes 50 + 700, the dark theme 300 + 900)
const statusSteps = (h, viv) => Object.fromEntries([[50, 0], [300, 3], [700, 7], [900, 9]].map(([s, i]) => [s, mk(LIGHT_L[i], maxC(LIGHT_L[i], h) * viv * SHAPE[i], h)]));
const WHITE = { col: { mode: 'rgb', r: 1, g: 1, b: 1 }, hex: '#ffffff', css: 'oklch(1 0 0)' };
const red = statusSteps(ERROR_H, 0.78), green = statusSteps(SUCCESS_H, 0.6);

const LIGHT_ROLES = {
  'bg-page': ['n', 50], 'bg-surface': ['white'], 'bg-raised': ['n', 100], 'border': ['n', 200], 'border-strong': ['n', 500],
  'text-primary': ['n', 950], 'text-secondary': ['n', 700], 'text-tertiary': ['n', 600],
  'accent-ink': ['white'], 'bg-accent-subtle': ['a', 100], 'focus-ring': ['a', 600],
  'success-text': ['green', 700], 'bg-success-subtle': ['green', 50], 'error-text': ['red', 700], 'error-border': ['red', 700],
};
const NICHES = [
  {
    key: 'hospitality', name: 'Forest & Champagne', scheme: 'dark', nName: 'forest', aName: 'champagne', nh: 155, ah: 85,
    n: neutral(155, DARK_L, [0.008, 0.012, 0.018, 0.026, 0.032, 0.034, 0.033, 0.031, 0.029, 0.027, 0.025]),
    a: ramp(85, LIGHT_L, 0.6, SHAPE_GOLD),
    roles: {
      'bg-page': ['n', 950], 'bg-surface': ['n', 900], 'bg-raised': ['n', 800], 'border': ['n', 800], 'border-strong': ['n', 500],
      'text-primary': ['a', 50], 'text-secondary': ['n', 300], 'text-tertiary': ['n', 400],
      'accent-solid': ['a', 400], 'accent-solid-hover': ['a', 300], 'accent-ink': ['n', 950], 'accent-text': ['a', 300],
      'bg-accent-subtle': ['a', 900], 'accent-text-on-subtle': ['a', 100], 'focus-ring': ['a', 300],
      'success-text': ['green', 300], 'bg-success-subtle': ['green', 900], 'error-text': ['red', 300], 'error-border': ['red', 300],
    },
    custom: { dawn: mk(0.80, 0.05, 60) },
    // The Night Log: the house drawn in champagne ink on forest, the lantern, brass and the gilt type
    extra: {
      'scrim': ['n', 950], 'house-line': ['a', 700], 'house-line-lit': ['a', 400], 'house-poche': ['n', 900], 'house-hatch': ['n', 700],
      'window-lit': ['a', 200], 'window-dim': ['a', 800], 'lantern': ['a', 100], 'brass': ['a', 500], 'brass-hi': ['a', 300], 'needle': ['a', 300],
      'now-pin': ['a', 50], 'gilt-lo': ['a', 300], 'gilt-hi': ['a', 100], 'dawn': ['custom', 'dawn'], 'sky-dusk': ['n', 800], 'stamp-ink': ['a', 200],
    },
    pairs: [['gilt-lo', 'bg-page', 4.5, 'text'], ['gilt-hi', 'bg-page', 4.5, 'text'], ['stamp-ink', 'bg-page', 4.5, 'stamp text'], ['brass', 'bg-page', 3, 'graphic']],
    // The house shader may paint up to this much lighter behind the log column's scrim
    worstCase: { bg: 'bg-page', lighten: 0.08, fg: ['text-primary', 'text-secondary', 'text-tertiary', 'accent-text', 'gilt-lo', 'gilt-hi', 'stamp-ink', 'success-text', 'error-text'] },
    // Decorative: the champagne glass orb (no text sits on these)
    orb: { 'orb-glass': ['n', 800], 'orb-highlight': ['a', 50], 'orb-tint': ['a', 400], 'orb-core-deep': ['a', 600], 'orb-core': ['a', 400], 'orb-core-hot': ['a', 100], 'orb-dust': ['a', 300], 'orb-glow': ['a', 500] },
  },
  {
    key: 'clinics', name: 'Ink & Porcelain', scheme: 'light', nName: 'ink', aName: 'steel', nh: 250, ah: 250,
    n: neutral(250, LIGHT_L, [0.004, 0.006, 0.008, 0.011, 0.014, 0.016, 0.018, 0.022, 0.026, 0.032, 0.036]),
    a: ramp(250, LIGHT_L, 0.55, SHAPE),
    roles: { ...LIGHT_ROLES, 'accent-solid': ['a', 800], 'accent-solid-hover': ['a', 900], 'accent-text': ['a', 700], 'accent-text-on-subtle': ['a', 800] },
    custom: { 'orb-warm': mk(0.96, 0.012, 70) },
    // The Line: the hairline, her side and the hand-off slips, the sundial light and the spot plate
    extra: {
      'line': ['a', 600], 'line-quiet': ['a', 300], 'landmark': ['a', 700], 'handoff-bg': ['a', 100], 'handoff-text': ['a', 800], 'note': ['n', 700],
      'her-text': ['a', 700], 'urgent-text': ['red', 700], 'shadow-ink': ['n', 950], 'pool': ['a', 300], 'underglaze': ['a', 700],
      'orb-warm': ['custom', 'orb-warm'], 'plate-glaze': ['a', 500], 'plate-well': ['n', 200], 'orb-engrave': ['a', 200],
    },
    pairs: [
      ['handoff-text', 'handoff-bg', 4.5, 'slip text'], ['her-text', 'bg-page', 4.5, 'text'], ['her-text', 'bg-surface', 4.5, 'text'], ['note', 'bg-page', 4.5, 'text'],
      ['line', 'bg-page', 3, 'the line'], ['landmark', 'bg-page', 3, 'graphic'], ['urgent-text', 'bg-page', 4.5, 'text'],
    ],
    // Decorative: the frosted porcelain orb and its waveform line
    orb: { 'orb-body': ['white'], 'orb-shade': ['n', 200], 'orb-glow-deep': ['a', 800], 'orb-glow': ['a', 500], 'orb-glow-hot': ['a', 300], 'orb-line': ['a', 600] },
  },
  {
    key: 'dental', name: 'Rosé & Pearl', scheme: 'light', nName: 'pearl', aName: 'rose', nh: 20, ah: 8,
    n: neutral(20, LIGHT_L, [0.006, 0.009, 0.012, 0.015, 0.017, 0.018, 0.019, 0.021, 0.024, 0.028, 0.032]),
    a: ramp(8, LIGHT_L, 0.5, SHAPE),
    gold: mk(0.74, 0.07, 50),
    roles: { ...LIGHT_ROLES, 'accent-solid': ['a', 700], 'accent-solid-hover': ['a', 800], 'accent-text': ['a', 700], 'accent-text-on-subtle': ['a', 800], 'decor-sheen': ['gold'] },
    // The evening paper: warmer than the day sheet, light enough for the tertiary text
    custom: { 'orient-green': mk(0.85, 0.05, 150), 'paper-evening': mk(0.952, 0.016, 62) },
    // First Available: the day sheet's rules, bands and seats, the emboss and the evening paper
    extra: {
      'rule': ['gold'], 'now': ['a', 600], 'band': ['n', 100], 'band-edge': ['n', 200], 'band-hatch': ['n', 300], 'ink-wash': ['a', 100], 'seat': ['n', 500],
      'emboss-light': ['white'], 'emboss-shade': ['n', 300], 'paper-shade': ['n', 100], 'paper-evening': ['custom', 'paper-evening'],
      'orb-orient-rose': ['a', 300], 'orb-orient-green': ['custom', 'orient-green'], 'string': ['gold'],
    },
    pairs: [
      ['accent-text', 'ink-wash', 4.5, 'text'], ['text-primary', 'paper-evening', 4.5, 'text'], ['text-secondary', 'paper-evening', 4.5, 'text'],
      ['text-tertiary', 'paper-evening', 4.5, 'text'], ['now', 'bg-page', 3, 'now line'], ['seat', 'bg-page', 3, 'seat outline'],
    ],
    // Decorative: the rosé pearl
    orb: { 'orb-highlight': ['white'], 'orb-body': ['a', 100], 'orb-sheen': ['gold'], 'orb-sheen-listen': ['a', 300], 'orb-edge': ['a', 700], 'orb-shadow': ['n', 950] },
  },
];

// Every pair the pages render: [foreground, background, required ratio, kind]
const PAIRS = [
  ['text-primary', 'bg-page', 4.5, 'text'], ['text-primary', 'bg-surface', 4.5, 'text'], ['text-primary', 'bg-raised', 4.5, 'text'], ['text-primary', 'bg-accent-subtle', 4.5, 'text'],
  ['text-secondary', 'bg-page', 4.5, 'text'], ['text-secondary', 'bg-surface', 4.5, 'text'], ['text-secondary', 'bg-raised', 4.5, 'text'],
  ['text-tertiary', 'bg-page', 4.5, 'text, placeholder'], ['text-tertiary', 'bg-surface', 4.5, 'text'],
  ['accent-ink', 'accent-solid', 4.5, 'button label'], ['accent-ink', 'accent-solid-hover', 4.5, 'button label'],
  ['accent-text', 'bg-page', 4.5, 'text'], ['accent-text', 'bg-surface', 4.5, 'text'], ['accent-text-on-subtle', 'bg-accent-subtle', 4.5, 'badge text'],
  ['success-text', 'bg-page', 4.5, 'text'], ['success-text', 'bg-surface', 4.5, 'text'], ['success-text', 'bg-success-subtle', 4.5, 'text'],
  ['error-text', 'bg-page', 4.5, 'text'], ['error-text', 'bg-surface', 4.5, 'text'],
  ['border-strong', 'bg-surface', 3, 'input boundary'], ['border-strong', 'bg-page', 3, 'input boundary'], ['error-border', 'bg-surface', 3, 'invalid input'],
  ['focus-ring', 'bg-page', 3, 'focus indicator'], ['focus-ring', 'bg-surface', 3, 'focus indicator'],
];

function resolve(t, map) {
  const src = { n: t.n, a: t.a, red, green };
  return Object.fromEntries(Object.entries(map).map(([role, [r, s]]) => {
    if (r === 'white') return [role, { ...WHITE, prim: 'white' }];
    if (r === 'gold') return [role, { ...t.gold, prim: `${t.aName}-gold` }];
    if (r === 'custom') return [role, { ...t.custom[s], prim: `${t.aName}-${s}` }];
    const prim = { n: t.nName, a: t.aName, red: 'red', green: 'green' }[r];
    return [role, { ...src[r][s], prim: `${prim}-${s}` }];
  }));
}

let failing = 0;
for (const t of NICHES) {
  t.resolved = resolve(t, { ...t.roles, ...t.extra });
  t.orbResolved = resolve(t, t.orb);
  t.results = [...PAIRS, ...t.pairs].map(([fg, bg, need, kind]) => ({ fg, bg, need, kind, ratio: wcagContrast(t.resolved[fg].col, t.resolved[bg].col) }));
  if (t.worstCase) {
    // The background as the brightest the scene may paint it: OKLCH lightness raised by the given amount
    const bg = t.resolved[t.worstCase.bg].col;
    const lit = { mode: 'oklch', ...toOklch(bg), l: toOklch(bg).l + t.worstCase.lighten };
    for (const fg of t.worstCase.fg) t.results.push({ fg, bg: `${t.worstCase.bg} +${t.worstCase.lighten} L`, need: 4.5, kind: 'worst case', ratio: wcagContrast(t.resolved[fg].col, lit) });
  }
  const fails = t.results.filter((r) => r.ratio < r.need);
  failing += fails.length;
  console.log(`${t.name}: ${fails.length ? fails.map((r) => `FAIL ${r.ratio.toFixed(2)}:1 ${r.fg} on ${r.bg} (needs ${r.need})`).join('; ') : `all ${t.results.length} pairs pass`}`);
}

// ---- tokens.css: primitives by hue, semantic tokens by role, one block per theme
const prim = [];
for (const t of NICHES) {
  prim.push(`  /* ${t.name}: ${t.nName} ${t.nh}°, ${t.aName} ${t.ah}° */`);
  for (const s of STEPS) prim.push(`  --${t.nName}-${s}: ${t.n[s].css}; /* ${t.n[s].hex} */`);
  for (const s of STEPS) prim.push(`  --${t.aName}-${s}: ${t.a[s].css}; /* ${t.a[s].hex} */`);
  if (t.gold) prim.push(`  --${t.aName}-gold: ${t.gold.css}; /* ${t.gold.hex}, decorative only */`);
  for (const [name, c] of Object.entries(t.custom ?? {})) prim.push(`  --${t.aName}-${name}: ${c.css}; /* ${c.hex} */`);
}
const used = new Set(NICHES.flatMap((t) => Object.values(t.resolved).map((v) => v.prim)));
prim.push(`  /* Status: only the steps a role uses */`);
for (const [name, r] of [['red', red], ['green', green]]) for (const s of [50, 300, 700, 900]) if (used.has(`${name}-${s}`)) prim.push(`  --${name}-${s}: ${r[s].css}; /* ${r[s].hex} */`);
let css = `/* Generated by scripts/palettes.mjs — edit the script, not this file.\n   Primitives are never used in components; components use --color-* only. */\n:root {\n  --white: oklch(1 0 0);\n${prim.join('\n')}\n}\n`;
for (const t of NICHES) {
  css += `\n[data-theme="${t.key}"] {\n  color-scheme: ${t.scheme};\n`;
  for (const [role, v] of Object.entries(t.resolved)) css += `  --color-${role}: var(--${v.prim});\n`;
  css += `  /* decorative: orb */\n`;
  for (const [role, v] of Object.entries(t.orbResolved)) css += `  --color-${role}: var(--${v.prim});\n`;
  css += `}\n`;
}
const root = new URL('../', import.meta.url);
fs.writeFileSync(new URL('src/styles/tokens.css', root), css);

// ---- colors.ts: the same roles as hex, for WebGL code that can't read CSS variables
const ts = `// Generated by scripts/palettes.mjs — edit the script, not this file.\nexport const colors = ${JSON.stringify(Object.fromEntries(NICHES.map((t) => [t.key, Object.fromEntries([...Object.entries(t.resolved), ...Object.entries(t.orbResolved)].map(([k, v]) => [k, v.hex]))])), null, 2)} as const;\n\nexport type ThemeKey = keyof typeof colors;\n`;
fs.writeFileSync(new URL('src/data/colors.ts', root), ts);
console.log(`wrote src/styles/tokens.css and src/data/colors.ts${failing ? ` — ${failing} FAILING PAIRS` : ''}`);
if (failing) process.exitCode = 1;
