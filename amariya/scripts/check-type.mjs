// The type scale, enforced: npm run check:type (also run by npm run build).
// Fails if any font-size, `font:` shorthand, SVG font-size attribute or DOM style write in src sets a size that is not
// one of the client-approved tokens (spec/typography.md, defined in src/styles/global.css) or a documented decorative
// token in its own niche. Canvas `ctx.font` strings are texture pixels inside the 3D scenes, not page type, so they are
// not checked.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** The scale: every style's size token */
const SCALE = ['h1', 'h2', 'h3', 'lead', 'body', 'card', 'small', 'eyebrow', 'kicker', 'label', 'stat'].map((s) => `--${s}-size`);
/** Decorative giant numerals and wordmarks: art, not text. One documented token each, allowed only in its niche. */
const DECORATIVE = {
  '--hour-size': 'src/niches/hotels/', // the hour numerals hanging into the log (and riding the phone's band)
  '--plate-size': 'src/niches/hotels/', // the wordmark engraved on the checkout's brass plate
  '--wm-size': 'src/niches/clinics/', // the sign-off wordmark on the line
  '--numeral-size': 'src/niches/dental/', // the embossed outline clock
  '--time-size': 'src/niches/dental/', // the day sheet's chapter times
  '--wordmark-size': 'src/niches/dental/', // the close's wordmark, fitted to the sheet
};
const WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/** null when the declaration is on the scale, else why not */
export function judge(prop, raw, file = '') {
  const value = raw.replace(/!important/i, '').trim();
  if (WIDE.has(value)) return null;
  const allowed = (name) => SCALE.includes(name) || (name in DECORATIVE && file.startsWith(DECORATIVE[name]));
  if (prop === 'font-size') {
    const m = /^var\((--[\w-]+)\)$/.exec(value);
    if (!m) return 'a literal or computed size';
    return allowed(m[1]) ? null : `${m[1]} is not a type token`;
  }
  // The shorthand: drop the line-height after the slash, then exactly one size, which must be a token
  const rest = value.replace(/\/\s*(var\([^)]*\)|[^\s,]+)/, ' ');
  if (/(^|[\s(,])[-+]?\d*\.?\d+(px|r?em|%|[sdl]?v[hw]|vmin|vmax|cq[whib]|pt|pc|ch|ex|cm|mm|in|q)(?![\w-])/i.test(rest)) return 'a literal size';
  if (/\b(calc|clamp|min|max)\(/i.test(rest)) return 'a computed size';
  if (/(^|\s)(xx?-small|small|medium|x{0,3}-?large|smaller|larger)(\s|$)/i.test(rest)) return 'a keyword size';
  const vars = [...rest.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
  const sizes = vars.filter((v) => !/^--font-/.test(v) && !/-weight$/.test(v));
  if (sizes.length !== 1) return sizes.length ? `${sizes.join(', ')}: one size expected` : 'no size token';
  return allowed(sizes[0]) ? null : `${sizes[0]} is not a type token`;
}

// The checker's own check
assert.equal(judge('font-size', 'var(--body-size)'), null);
assert.equal(judge('font-size', 'inherit !important'), null);
assert.equal(judge('font', '500 var(--label-size)/var(--label-lh) var(--font-body)'), null);
assert.equal(judge('font', 'var(--h1-weight) var(--h1-size)/var(--h1-lh) var(--font-display)'), null);
assert.equal(judge('font', 'inherit'), null);
assert.ok(judge('font-size', '13px'));
assert.ok(judge('font-size', '1.14em'));
assert.ok(judge('font-size', 'calc(var(--h1-size) * .7)'));
assert.ok(judge('font-size', 'var(--my-size)'));
assert.ok(judge('font', '500 13px/1.3 var(--font-body)'));
assert.ok(judge('font', '300 clamp(32px, 3.4vw, 44px)/1 var(--font-display)'));
assert.ok(judge('font', '500 100%/1 var(--font-body)'));
assert.ok(judge('font', '500 var(--sneaky)/1 var(--font-body)'));
assert.ok(judge('font-size', 'var(--hour-size)', 'src/niches/dental/dental.css'));
assert.equal(judge('font-size', 'var(--hour-size)', 'src/niches/hotels/hotels.css'), null);

// ---- Walk src
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|astro|ts)$/.test(name)) files.push(p);
  }
})(SRC);

const lineAt = (text, i) => text.slice(0, i).split('\n').length;
const blank = (s) => s.replace(/[^\n]/g, ' ');
const problems = [];
const used = new Map();
let checked = 0;
function css(text, file, offset, whole) {
  // Comments blanked, so positions still map to lines
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  for (const m of clean.matchAll(/(?<![\w-])(font-size|font)\s*:\s*([^;{}"]+)/g)) {
    checked++;
    const why = judge(m[1], m[2], file);
    const line = lineAt(whole, offset + m.index);
    if (why) problems.push(`${file}:${line}  ${m[1]}: ${m[2].trim()}  (${why})`);
    for (const t of m[2].matchAll(/var\((--[\w-]+-size)\)/g)) used.set(t[1], (used.get(t[1]) ?? 0) + 1);
  }
}
for (const p of files) {
  const file = relative(ROOT, p).split(sep).join('/');
  const text = readFileSync(p, 'utf8');
  if (p.endsWith('.css')) css(text, file, 0, text);
  else if (p.endsWith('.astro')) {
    for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css(m[1], file, m.index + m[0].indexOf(m[1]), text);
    for (const m of text.matchAll(/\sstyle=(?:"([^"]*)"|\{`([^`]*)`\})/g)) css(m[1] ?? m[2], file, m.index, text);
    for (const m of text.matchAll(/\sfont-size=/g)) problems.push(`${file}:${lineAt(text, m.index)}  an SVG font-size attribute (set it in CSS with a token)`);
  } else {
    // DOM style writes in scripts; canvas ctx.font is texture pixels and stays out
    for (const m of text.matchAll(/\.style\.(fontSize|font)\s*=\s*([^;\n]+)/g)) problems.push(`${file}:${lineAt(text, m.index)}  style.${m[1]} = ${m[2].trim()}  (set a token custom property instead)`);
    for (const m of text.matchAll(/setProperty\(\s*['"](font-size|font)['"]/g)) problems.push(`${file}:${lineAt(text, m.index)}  setProperty('${m[1]}')  (set a token custom property instead)`);
  }
}

const tally = [...used].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', ');
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ncheck:type: ${problems.length} size(s) off the scale, in ${checked} declarations`);
  process.exit(1);
}
console.log(`check:type: ${checked} declarations, every size on the scale (${tally})`);
