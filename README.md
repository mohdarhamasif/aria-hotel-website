# Amariya — voice-guided website for an AI receptionist (hotels & clinics)

**Live:** https://aria-hotel-website.vercel.app/ (deployed on Vercel from the `amjad` remote; see "Deploy")

A talking sales website. Visitors press the orb and talk (or type) with **Amariya**, an ElevenLabs voice agent. She guides them through the page as they talk: she scrolls to the right section, fills in their business details, shows an ROI estimate, highlights features, recommends a plan and books a demo.

The product was called **Aria** until October 2026. It was renamed because several other AI receptionists use that name. The repository, the standalone file and a few internal names (`ariaTools`, `aria_visited`) keep the old name.

There is one page per industry, all built from the same template:

| Page | For |
|---|---|
| `/` | The brand, for hotels and clinics, with an industry switcher |
| `/hotels/` | Hotels, resorts, B&Bs, serviced apartments |
| `/aesthetics/` | Aesthetics clinics, med spas, laser and skin clinics |
| `/dental/` | Dental practices and groups |

## Run it locally

The microphone only works over `https://` or on `localhost`, so serve the folder instead of opening the file directly:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Files

| File | What it is |
|---|---|
| `src/page.html` | The page template: hero, profile + ROI, features, plans, demo form, FAQ, conversation dock, SEO head. Everything that changes per industry is a `{{placeholder}}` |
| `industries/site.json` | Brand name, company name, site URL, asset version and the list of pages |
| `industries/<page>.json` | One page's words: hero, story, profile form labels, features, live-call scripts, plans, FAQ, SEO, plus `page`: ROI assumptions, greetings and the context sent to the voice agent |
| `index.html`, `hotels/`, `aesthetics/`, `dental/` | The built pages. Generated, don't edit by hand |
| `tools/build_pages.py` | Builds the pages, `sitemap.xml` and `robots.txt` from the template and content files |
| `styles.css` | The night theme for the whole site: hero, scroll story, sections, dock; responsive and reduced-motion rules |
| `app.js` | ElevenLabs conversation, client tools the agent calls, transcript, smooth scrolling. Reads the page's settings from `window.PAGE` |
| `experience.js` | Decorative layer: the WebGL particle field behind the whole page (it reshapes per section), small orbs in the ROI card, dock and start sheet, the scroll story with the visitor's live local time, the live call card (scripts come from the page), the pinned features transition, the plans eclipse, the demo lights, paragraphs that light up word by word, content that rises into place, and smooth desktop scrolling via [Lenis](https://github.com/darkroomengineering/lenis) (MIT, loaded from jsDelivr; touch devices and reduced motion keep native scrolling) |
| `config.js` | Brand name, default agent ID, optional webhook for demo requests, default ROI assumptions |
| `aria-standalone.html` | The home page in one file. Generated, don't edit by hand |
| `tools/build_standalone.py` | Rebuilds `aria-standalone.html` from `index.html` and the four source files |
| `robots.txt`, `sitemap.xml`, `404.html`, `site.webmanifest` | SEO and crawl files (`sitemap.xml` and `robots.txt` are written by `build_pages.py`) |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.svg/.png` | Icons and the social share image |
| `design-system/aria/MASTER.md` | Design system notes: tokens, style, motion, checklist |
| `AGENT_SETUP.md` | How the ElevenLabs agent is configured: prompt, tools, voice, tone, and what to change for the new name and industries |

## Build

After changing the template, a content file, `styles.css`, `app.js`, `experience.js` or `config.js`:

```bash
python tools/build_pages.py
python tools/build_standalone.py
```

Bump `version` in `industries/site.json` whenever you change the CSS or JS, so browsers fetch the new copy instead of a cached one (the pages load `styles.css?v=<version>`).

To add an industry: copy one of the `industries/*.json` files, change the words, add the page to `pages` in `site.json`, and rebuild. Keep the feature keys (`bookings`, `multilingual`, `guest_requests`, `upsells`, `integrations`) and plan keys (`starter`, `professional`, `enterprise`); the agent's tools use them.

To rename the product: change `brand` and `company` in `industries/site.json` and `BRAND` in `config.js`, rebuild, and rename the agent in ElevenLabs (see `AGENT_SETUP.md`).

## Deploy

The site is static, with no build step on Vercel. `.vercelignore` keeps the notes, tooling, template and content files off the live site.

- Push to `main` on the `amjad` remote to redeploy production: `git push amjad stagging:main`.
- Or deploy from this folder: `npx vercel deploy --prod`.

## Design and SEO tooling

- **UI/UX:** the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill is in `.claude/skills/ui-ux-pro-max/`, so Claude Code picks it up automatically. It needs Python 3 and nothing else. Example search: `python .claude/skills/ui-ux-pro-max/scripts/search.py "form labels inline errors" --domain ux`.
- **SEO:** [claude-seo](https://github.com/AgriciDaniel/claude-seo) installs globally (`install.ps1` / `install.sh`) and needs **Python 3.10+**. After installing, run `/seo audit <url>`.
- Any redesign must keep every ID, `data-*` attribute and form field name that `app.js` uses. The agent's client tools depend on them. The form fields keep their hotel names (`hotel_name`, `rooms`…) on every page; only the labels change.

## Type and icons

- **Fonts:** [Ranade](https://www.fontshare.com/fonts/ranade) for every heading and display line, [Supreme](https://www.fontshare.com/fonts/supreme) for all other text. Both load from Fontshare (free for commercial use under the Fontshare/ITF free font licence).
- **Icons:** [Iconsax](https://iconsax.io), *Linear* style, as inline SVG `<symbol>`s at the top of `src/page.html`. The paths come from the MIT-licensed [iconsax-react](https://github.com/rendinjast/iconsax-react) package. To add one, copy its Linear paths into a new `<symbol id="i-…">` and use it with `<svg><use href="#i-…" /></svg>`.

## Section backdrops

Each section after the hero has its own treatment:

- **Your business (section 2):** a warm blurred blob behind a frosted-glass half globe. The blob sits in a layer clipped to the section, so it never lights the band above. As you scroll through the section it spreads into a soft wash over the whole section.
- **Features:** one pinned scroll transition. The heading starts in the centre with five slim feature tags spread across the screen. As you scroll, the heading moves to the top left, and the tags settle on a ring around the particle sphere. The live call card sits below as a full card. Hover, focus or the agent's `highlight_feature` opens a pill to show its description.
  - The pin only runs on screens wider than 760px with motion allowed. Otherwise the pills are a plain grid (`.orbit-live` in `experience.js` switches between the two).
- **Plans:** an eclipse. A dark planet rises behind the cards with a blue-to-orange rim, and a warm light on the rim slides behind the recommended plan.
- **Book a demo:** a large glass circle with slow blue and mint lights inside it.
- **FAQ:** plain, with no backdrop.

## Configuration

Edit `config.js`:

- `BRAND`: the product name shown in the page's scripts (keep it in step with `industries/site.json`).
- `AGENT_ID`: your ElevenLabs agent ID. The agent must be public, and your domain must be on its allowlist. A page can use its own agent by setting `agentId` in its `industries/<page>.json` → `page`.
- `FORM_WEBHOOK_URL`: where demo requests are POSTed as JSON (Zapier, Make, n8n or your own API). Each request includes the page's `industry`. Without it, requests are only saved in the visitor's browser.
- `ROI`: default assumptions; each page overrides them in its content file.

## Before going live

- Add every domain to the agent's allowlist in ElevenLabs (currently `localhost` and `mohdarhamasif.github.io`; the Vercel domain still needs adding).
- Rename the agent and update its prompt for the new name and industries (see `AGENT_SETUP.md`).
- Set `FORM_WEBHOOK_URL` so you actually receive demo requests.
- When the new domain is registered, set `site_url` in `industries/site.json` and rebuild, so canonical URLs, the sitemap and social tags use it.
- Replace the placeholder prices and integrations with your real ones, in both the content files and the agent prompt.
