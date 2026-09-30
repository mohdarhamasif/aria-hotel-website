# Aria — voice-guided website for an AI hotel receptionist

**Live:** https://mohdarhamasif.github.io/aria-hotel-website/

A talking sales website. Visitors press the orb and talk (or type) with **Aria**, an ElevenLabs voice agent. Aria guides them through the page as they talk: she scrolls to the right section, fills in their hotel details, shows an ROI estimate, highlights features, recommends a plan and books a demo.

## Run it locally

The microphone only works over `https://` or on `localhost`, so serve the folder instead of opening the file directly:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Files

| File | What it is |
|---|---|
| `index.html` | Page structure: hero, hotel profile + ROI, features, plans, demo form, FAQ, conversation dock. Also the SEO head (meta, Open Graph, JSON-LD) |
| `styles.css` | The night theme for the whole site: hero, scroll story, sections, dock; responsive and reduced-motion rules |
| `app.js` | ElevenLabs conversation, client tools the agent calls, transcript, smooth scrolling |
| `experience.js` | Decorative layer: the WebGL particle field behind the whole page (it reshapes per section), small orbs in the ROI card, dock and start sheet, the scroll story (greetings leave the orb one at a time), the live call card, the pinned features transition, the plans eclipse, the demo lights, paragraphs that light up word by word, content that rises into place, and smooth desktop scrolling via [Lenis](https://github.com/darkroomengineering/lenis) (MIT, loaded from jsDelivr; touch devices and reduced motion keep native scrolling). Reads `data-state` and `--level` from `app.js`; changes nothing in it |
| `config.js` | Agent ID, optional webhook for demo requests, ROI assumptions |
| `aria-standalone.html` | The whole site in one file. Generated, don't edit by hand |
| `tools/build_standalone.py` | Rebuilds `aria-standalone.html` from the five source files |
| `robots.txt`, `sitemap.xml`, `404.html`, `site.webmanifest` | SEO and crawl files |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.svg/.png` | Icons and the social share image |
| `design-system/aria/MASTER.md` | Design system notes: tokens, style, motion, checklist |
| `AGENT_SETUP.md` | How the ElevenLabs agent is configured: prompt, tools, voice, tone |

## Standalone build

After changing `index.html`, `styles.css`, `app.js`, `experience.js` or `config.js`, regenerate the single-file version:

```bash
python tools/build_standalone.py
```

`index.html` loads the CSS and JS with a version tag (`styles.css?v=9`). Bump the number when you change those files, so browsers fetch the new copy instead of a cached one.

## Design and SEO tooling

- **UI/UX:** the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill is in `.claude/skills/ui-ux-pro-max/`, so Claude Code picks it up automatically. It needs Python 3 and nothing else. Example search: `python .claude/skills/ui-ux-pro-max/scripts/search.py "form labels inline errors" --domain ux`.
- **SEO:** [claude-seo](https://github.com/AgriciDaniel/claude-seo) installs globally (`install.ps1` / `install.sh`) and needs **Python 3.10+**. After installing, run `/seo audit <url>`.
- The redesign must keep every ID, `data-*` attribute and form field name that `app.js` uses. The agent's client tools depend on them.

## Type and icons

- **Fonts:** [Ranade](https://www.fontshare.com/fonts/ranade) for every heading and display line, [Supreme](https://www.fontshare.com/fonts/supreme) for all other text. Both load from Fontshare (free for commercial use under the Fontshare/ITF free font licence).
- **Icons:** [Iconsax](https://iconsax.io), *Linear* style, as inline SVG `<symbol>`s at the top of `index.html`. The paths come from the MIT-licensed [iconsax-react](https://github.com/rendinjast/iconsax-react) package. To add one, copy its Linear paths into a new `<symbol id="i-…">` and use it with `<svg><use href="#i-…" /></svg>`.

## Section backdrops

Each section after the hero has its own treatment:

- **Your hotel:** a warm blurred blob behind a frosted-glass half globe. The blob sits in a layer clipped to the section, so it never lights the band above. As you scroll through the section it spreads into a soft wash over the whole section.
- **Features:** one pinned scroll transition. The heading starts in the centre with five slim feature tags spread across the screen. As you scroll, the heading moves to the top left, and the tags settle on a ring around the particle sphere. The live call card sits below as a full card. Hover, focus or Aria's `highlight_feature` opens a pill to show its description.
  - The pin only runs on screens wider than 760px with motion allowed. Otherwise the pills are a plain grid (`.orbit-live` in `experience.js` switches between the two).
- **Plans:** an eclipse. A dark planet rises behind the cards with a blue-to-orange rim, and a warm light on the rim slides behind the plan Aria recommends.
- **Book a demo:** a large glass circle with slow blue and mint lights inside it.
- **FAQ:** plain, with no backdrop.

## Configuration

Edit `config.js`:

- `AGENT_ID`: your ElevenLabs agent ID. The agent must be public, and your domain must be on its allowlist.
- `FORM_WEBHOOK_URL`: where demo requests are POSTed as JSON (Zapier, Make, n8n or your own API). Without it, requests are only saved in the visitor's browser.
- `ROI`: the assumptions behind the estimate.

## Before going live

- Add any new domain to the agent's allowlist in ElevenLabs (currently `localhost` and `mohdarhamasif.github.io`).
- Set `FORM_WEBHOOK_URL` so you actually receive demo requests.
- Replace the placeholder brand, prices and integrations with your real ones, in both `index.html` and the agent prompt.
