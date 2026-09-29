# Design System: Aria — "Editorial Concierge"

Generated with the ui-ux-pro-max skill, then adapted to this project:

```
python .claude/skills/ui-ux-pro-max/scripts/search.py "hotel hospitality luxury concierge editorial" --design-system --persist -p "Aria" --output-dir .
```

The generic hotel suggestion (navy/blue palette, Liquid Glass) was **not** adopted. We kept the existing brand
theme and applied the skill's **Editorial Grid / Magazine** style (`--domain style "editorial magazine serif"`),
which is low-cost and low-risk for performance and accessibility.
The tokens themselves live in `styles.css` `:root`, which is the source of truth.

## Style
- Hotel brochure / magazine: asymmetric 7/5 grids, numbered chapters (No. 01–05), small-caps labels,
  gold hairline and double rules, drop cap in the hero, pull-quote for the plan reason.
- Solid surfaces only: no glassmorphism, no glows or radial blobs, no gradient pill buttons.
- One line-icon family (1.5px stroke SVG `<symbol>`s in `index.html`). No emoji or Unicode glyph icons.
- The voice motif is an arch with a service bell and level bars, replacing the generic AI orb.

## Colors (unchanged theme)
| Role | Token | Value |
|---|---|---|
| Background | `--bg` / `--bg-2` / `--card` | `#0e1116` / `#141922` / `#181e29` |
| Text | `--text` / `--text-soft` / `--muted` | `#f3efe6` / `#d7d3ca` / `#a3a9b6` |
| Accent | `--gold` / `--gold-2` | `#d6b370` / `#f0d9a4` |
| Listening / user | `--teal` | `#5fd0c0` |
| Rules | `--rule` / `--rule-soft` | gold 38% / ivory 9% |
| Ink on gold | `--ink-on-gold` | `#1b1408` |

## Typography
- Display: Fraunces (optical size, italic for emphasis and numerals).
- Body and UI: Inter 400/500/600. Labels are 0.66–0.8rem uppercase with 0.14–0.18em tracking.

## Motion
- Tokens: `--t-fast` 160ms, `--t-base` 320ms, `--t-slow` 700ms. Easings: `--ease-out`, `--ease-in-out`.
- Only transform, opacity, clip-path and stroke-dashoffset are animated.
- Everything is disabled under `prefers-reduced-motion`.
- The motif's states follow `data-state` (idle, connecting, listening, thinking, speaking) and `data-tone`.
  Level-driven parts use `--level`.

## Anti-patterns (from the skill)
- Poor photos; complex booking; emoji icons; placeholder-only labels; infinite decorative animation;
  hover-only affordances; text contrast below 4.5:1.

## Pre-delivery checklist
- [ ] SVG icons only, one family
- [ ] Visible focus states; 44px+ touch targets
- [ ] Text contrast 4.5:1 minimum
- [ ] prefers-reduced-motion respected
- [ ] Responsive at 375, 768, 1024 and 1440px; no horizontal scroll
- [ ] Content not hidden behind the fixed dock
