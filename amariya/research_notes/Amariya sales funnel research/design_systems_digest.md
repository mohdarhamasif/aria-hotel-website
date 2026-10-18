# Amariya sales funnel: design-system digest

Sources (design-md-library/brands): **[E]** elevenlabs.md, **[L]** linear.app.md, **[A]** apple.md, **[R]** resend.md. Baseline: amariya/live/src/page.html. Values and rules only; no logos, copy or proprietary fonts.

## 1. What to borrow, per brand

**ElevenLabs [E]** (closest peer: voice AI)
- Display stays light (Waldenburg 300) with negative tracking: -1.92px at 64px (-3%), line height 1.05. Never bold display.
- Body gets slight positive tracking: +0.16px at 16px.
- Pastel orbs (mint #a7e5d3, peach #f4c5a8, sky #a8c8e8) are atmosphere only. Never button fills, text or card backgrounds. Orbs shrink on mobile but never disappear.
- Radius: 16px cards, 24px orb cards, pill for every CTA and badge.
- 96px between sections, 16–24px gaps inside them, max width ~1200px.
- Eyebrow: 12px / 600 / +0.08em, uppercase.
- The featured price tier swaps surface (inverts) instead of adding colour.

**Linear [L]** (dark-canvas discipline)
- Canvas #010102: near-black with a faint blue tint, never #000. Surface ladder #0f1011, #141516, #18191a, #191a1b.
- Text greys: #f7f8f8 ink, #d0d6e0 muted, #8a8f98 subtle, #62666d tertiary.
- Hairlines: #23252a, #34343a, #3e3e44.
- One chromatic accent, only on the brand mark, primary CTA and focus ring (2px at 50% opacity).
- Display tracking -3px at 80px; eyebrow +0.4px. Positive-tracked eyebrows contrast with tight headlines.
- A faint white highlight on the top edge of raised panels. This is the same idea as Amariya's `--glass-top` inset.
- No drop shadows on dark. Depth comes from a lighter surface plus a hairline.
- Card padding 24px, CTA banner 48px. Max width ~1280px.

**Apple [A]** (pacing and restraint)
- One idea per viewport. At least 64px above a headline and 48–64px below. Nothing closer than 40px to the hero object.
- Text-heavy columns about 980px wide. Sections 80px, dropping to 48px on small phones.
- Adjacent dark sections step lightness slightly (#272729, #2a2a2c).
- Exactly one drop shadow, used only on the hero object. Never on cards, buttons or text.
- Frosted sticky bar: 80% fill, `saturate(180%) blur(20px)`, 64px tall, context on the left, action on the right. This is the model for the dock.
- Press state `scale(.95)`. Touch targets at least 44px. At most two CTAs per tile.
- Breakpoints at 1068 and 734px (Amariya already uses these).

**Resend [R]** (dark editorial with glows)
- Hairlines are translucent white: 6% default, 14% strong, 4% dividers. Surfaces: #0a0a0c card, #101012 elevated, #06060a deep.
- Text steps by opacity: ink #fcfdff at 100% / 86% / 70%, then #a1a4a5 and #888e90.
- The primary CTA is the brightest pixel on screen, and there is at most one solid bright surface per viewport.
- Section glow: one radial wash anchored at the top of a section, fading to the canvas within ~600px, at 0.18–0.34 alpha. Never two glows in one section, and no glow inside the hero.
- Spacing: 128px for the hero and the band before the footer, 96px for sections, 64px on mobile.
- Cards 12px radius, 32px padding. A single inset card is at most 640px wide. Hierarchy comes from font family, not weight.

## 2. Recommended blend for Amariya

These stay as they are: Ranade 400 headings, Supreme body, the approved scale (72 / 29 / 18 / 19 / 16 / 14 / 13 / 12 / 11 / stat 34), frosted glass with a bright rim, the particle orb, the dock, and no italics.

```css
--bg: #050506;                         /* original Amariya; near-black, never #000 [L] */
--surface-1: #0b0b0d;                  /* card step [R] */
--surface-2: #121215;                  /* featured licence only [R][L] */
--text: #f7f8f8;                       /* ink [L] */
--muted: rgba(247,248,248,.72);        /* opacity-stepped text [R]; ~10:1 on bg */
--faint: rgba(247,248,248,.56);        /* ~6:1 on bg; floor for 11-13px labels */
--line: rgba(255,255,255,.07);         /* hairline [R] */
--line-strong: rgba(255,255,255,.14);  /* [R] */
--accent: #86d6c4;                     /* mint: the only UI accent [L][A] */
--button: #f4f4f2; --button-text: #050506; /* off-white pill = brightest pixel [R] + pill [E][A] */
--glass-fill: rgba(14,14,18,.48);
--glass-top: rgba(255,255,255,.18);    /* top-edge highlight [L] */
--glass-rim: rgba(255,255,255,.42); --glass-rim-2: rgba(255,255,255,.08);
--glass-shadow: 0 18px 50px rgba(0,0,0,.5); /* floating glass only [A] */
```

- **Colour roles:** mint is the only interface accent, used for focus, live dots, the listening and speaking states of the dock, and the active pill [L][A]. Blue #3e7fd8 and orange #e8622a live only in the orb and in section glows [E][R]. The glow colour rotates by section: blue for the hero and story, mint for the demo, orange for the offer. One glow per section [R].
- **Radius:** 999px for every action (buttons, chips, segmented nav, orbit pills, dock input) [E][A]. 24px for every glass panel; fold today's 20, 26 and 28px into it [E orb card]. 12px for inset elements inside a panel [R][L].
- **Spacing:** 96px between sections, 128px into the offer [R], 64px at 734px and below [R]. Glass padding 32px, or 24px on mobile [R][L]. Gaps inside a panel 16–24px [E].
- **Widths:** 1440px only for the nav and fixed chrome [A]. Content 1200px [E][R]. FAQ and text 760px, prose 64ch [A]. The licence card 500–640px [R].
- **Type ratios:** H1/H2 is 2.48, a bigger jump than L (1.43) or E (1.78). Keep it: it suits one idea per screen [A]. Add no sizes in between. Optional, after a preview: tighten H1 to -0.02em (refs run -0.5% [A] to -3.75% [L]) and loosen the eyebrow from .14em toward .1em [E].
- **Pacing:** hero (orb, H1, one CTA, the dock) → story beats, one per viewport [A] → what she does → demo transcript → offer (surface-2, orange glow) → FAQ → close.
- **Motion:** keep `cubic-bezier(.22,1,.36,1)`, entrances of 600–1200ms and the 70ms word stagger. Press at `scale(.98)` [A, softened]. Hover lift -2px. Only the orb and the dock's live indicator move constantly. Keep the reduced-motion fallback. The dock follows Apple's floating sticky bar: status on the left, action on the right, 44px+ targets [A].

## 3. Do and don't

**Do**
- Hold one chromatic accent. Let the orb carry the other colours [L][A].
- Allow one solid bright CTA per viewport [R].
- Build depth from hairlines, rims and surface steps. Shadows go only under floating glass and the orb [L][A][R].
- Use real product moments as visuals: timestamped transcripts, booking chips, call outcomes. Linear uses product screenshots and Resend uses code windows the same way [L][R].
- Lift the featured licence with a surface step, not colour [E][L][R].
- Build hierarchy from family (Ranade vs Supreme) and size, not bolding [R][E].
- Use tabular numerals for times, prices and seat counts. Keep the orb 40px+ clear of copy [A].

**Don't**
- Don't use purple-to-blue gradients, gradient text, glowing buttons or neon outlines.
- Don't use glows as fills on buttons, text or cards, or put two glows in one section [E][R].
- Don't use a pure #000 canvas or 100% white for long copy [L][R].
- Don't build bento grids of identical icon cards, icons in coloured squares, fake logo strips or "trusted by" filler.
- Don't open every section with eyebrow + H2 + lead. That is the most recognisable template pattern, so vary the openings.
- Don't nest glass inside glass, or add shadows to cards and text [L][A].
- Don't use italics, sizes below 11px, or sizes outside the approved scale.
- Don't use the reference brands' fonts, logos or copy.
