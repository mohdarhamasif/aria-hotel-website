# Typography brief

The client asked for premium fonts and correct font sizes. Fonts were chosen from the sources in the client's design library (Fontshare, Google Fonts, Uncut, Typewolf, Typescale), measured and licence-checked, and approved by the lead. Only upright styles are used; italics stay banned.

## 1. Fonts

| Role | cssVariable | Provider | Family (exact) | Weights | Notes |
|---|---|---|---|---|---|
| Body, all sites | `--font-body` | `fontProviders.fontshare()` | `Supreme` | 400, 500 | No tabular figures: never use it for times, prices or aligned numbers |
| Brand wordmark | `--font-brand` | `fontProviders.fontshare()` | `Ranade` | 500 | Unchanged |
| Hotels display | `--font-display-hospitality` | `fontProviders.google()` | `Bona Nova` | 400 | Oldstyle figures by default; times and prices use `font-variant-numeric: lining-nums tabular-nums` |
| Hotels small caps | `--font-smallcaps-hospitality` | `fontProviders.google()` | `Bona Nova SC` | 400 | Real small caps, for log headings, room labels and running heads. Google strips small caps from `Bona Nova`, so this family is the only route |
| Clinics display | `--font-display-clinics` | `fontProviders.google()` | `Source Serif 4` | 300, 400 | Must load the display optical size: `options: { experimental: { variableAxis: { opsz: [['8', '60']] } } }`. Without it Google serves the text design. Tabular figures by default. Weight 300 only at 40 px and up; 400 below |
| Clinics data | `--font-mono` | `fontProviders.fontshare()` | `Azeret Mono` | 400, 500 | Fontshare's file keeps the slashed zero and `case`. Capitals and figures at the token size; lowercase runs at 0.9× the token |
| Dental display + utility | `--font-display-dental` | `fontProviders.fontshare()` | `Boska` | 400, 500 | 400 for H1 at 56 px and up; 500 for H2, the phone H1, times and small caps. Real small caps (`font-variant-caps: small-caps` on lowercase text; it has no caps-to-small-caps, so write labels in lowercase or use `text-transform: lowercase` first). Tabular and lining figures: `font-variant-numeric: lining-nums tabular-nums` for times |

- Remove Cormorant Garamond, Newsreader, Instrument Serif and Geist Mono from `astro.config.mjs` once nothing references them. Keep the greeting faces (`--font-arabic`, `--font-jp`) as they are.
- Subsets: `latin` (Boska and Bona Nova also `latin-ext` if the provider offers it).
- `font-synthesis: none` site-wide, so browsers never fake small caps, bold or italics.
- Never use `font-variant-caps` with a Google-served family: Google strips small caps from those files.
- **Licences:** Fontshare fonts are under ITF FFL v2.0, which allows commercial and web use and self-hosting but forbids subsetting and format conversion (Astro copies the woff2 files untouched, which is fine; never run a subsetter on them). The Google families are OFL.

## 2. The approved scale (exact; never drift from it)

All sizes are tokens in `src/styles/global.css`. Breakpoints are 1068 px and 734 px.

| Token | Desktop | ≤ 1068 px | ≤ 734 px | Face | Line-height | Letter-spacing |
|---|---|---|---|---|---|---|
| `--h1-size` | 72 | 56 | 40 | display × k | see display table | see display table |
| `--h2-size` | 29 | 28 | 26 | display × k | 1.15 (1.18 at ≤ 734) | −0.005em (dental 0) |
| `--h3-size` | 18 | 18 | 18 | Supreme 500 | 1.3 | 0 |
| `--lead-size` | 19 | 19 | 17 | Supreme 400 | 1.5 | 0 |
| `--body-size` | 16 | 16 | 16 | Supreme 400 | 1.6 | 0 |
| `--card-size` | 14 | 14 | 14 | Supreme 400 | 1.5 | +0.005em |
| `--small-size` | 13 | 13 | 13 | Supreme 400 | 1.45 | +0.01em |
| `--eyebrow-size` | 12 | 12 | 12 | Supreme 500, capitals | 1.3 | +0.12em |
| `--kicker-size` | 11 | 11 | 11 | Supreme 500 capitals (clinics: Azeret Mono 500) | 1.3 | +0.14em (Azeret +0.06em) |
| `--label-size` | 11 | 11 | 11 | Supreme 500 | 1.3 | +0.06em |
| `--stat-size` | 34 | 34 | 30 | display × k, lining + tabular figures | 1.0 | −0.01em |

### Optical correction per display face

Display faces differ in x-height, so headings set in them use a per-niche factor k (geometric mean of the x-height and cap-height ratios against Supreme). Use these exact pixel values (rounded), set per `[data-theme]`, not a runtime `calc()`:

| Style | Hotels (Bona Nova, k 1.08) | Clinics (Source Serif 4 Display, k 1.06) | Dental (Boska, k 1.00) |
|---|---|---|---|
| H1 desktop / ≤1068 / ≤734 | 78 / 60 / 43 | 76 / 59 / 42 | 72 / 56 / 40 |
| H2 desktop / ≤1068 / ≤734 | 31 / 30 / 28 | 31 / 30 / 28 | 29 / 28 / 26 |
| Stat desktop / ≤734 | 37 / 32 | 36 / 32 | 34 / 30 |
| H1 line-height | 1.04 (1.08 at ≤734) | 1.03 (1.07 at ≤734) | 1.02 (1.06 at ≤734) |
| H1 letter-spacing | −0.01em; −0.005em at ≤1068; 0 at ≤734 | −0.015em; −0.0075em at ≤1068; 0 at ≤734 | −0.005em; −0.0025em at ≤1068; 0 at ≤734 |

- Small-cap labels in Bona Nova SC or Boska: set at 16 px with +0.05em. Their small caps (about 0.53 em tall) then optically match 12 px Supreme capitals.
- Decorative giant numerals or wordmarks (the footer wordmark, an outline clock) are art, not text. Each may use ONE documented token per niche (for example `--display-xl`) with a comment saying so. Nothing else may use a size outside the table.

## 3. Rules

1. **No literal sizes anywhere in `src`.** Every `font-size` and every `font:` shorthand uses a token from the table. Map each existing literal by its role, not its number:
   - running text → body
   - secondary or meta text → card or small
   - tabs, ticks, ruler labels and chips → label
   - eyebrows → eyebrow
   - prices and figures → stat
   - headings by level
2. **Nothing below 11 px.** The 10.5, 10 and 9.5 px sizes in today's CSS all move up to 11 px or larger, and the layouts around them are adjusted so nothing crowds.
3. **Figures:** times, prices and any column of numbers use a face with tabular figures (the niche display face with `lining-nums tabular-nums`, or Azeret Mono on clinics), never Supreme.
4. **One weight change at a time:** headings change weight per the table only. No faux bold.
5. **Line length:** running text stays between about 45 and 75 characters (`max-width` in `ch` or `em`).
6. **Headings:** `text-wrap: balance`. Running text: `text-wrap: pretty`. No widows or orphans in headings at any width.
7. **Check:** `scripts/check-type.mjs` (`npm run check:type`) fails the build if any literal size appears in `src` outside the documented decorative tokens. It runs with the other checks.
