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
| `styles.css` | Night opening (hero and scroll story) and the light editorial day theme; responsive and reduced-motion rules |
| `app.js` | ElevenLabs conversation, client tools the agent calls, transcript, smooth scrolling |
| `experience.js` | Decorative layer: the WebGL particle orb (hero, dock, start sheet), the scroll story and the letter-by-letter text. Reads `data-state` and `--level` from `app.js`; changes nothing in it |
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

## Design and SEO tooling

- **UI/UX:** the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill is in `.claude/skills/ui-ux-pro-max/`, so Claude Code picks it up automatically. It needs Python 3 and nothing else. Example search: `python .claude/skills/ui-ux-pro-max/scripts/search.py "form labels inline errors" --domain ux`.
- **SEO:** [claude-seo](https://github.com/AgriciDaniel/claude-seo) installs globally (`install.ps1` / `install.sh`) and needs **Python 3.10+**. After installing, run `/seo audit <url>`.
- The redesign must keep every ID, `data-*` attribute and form field name that `app.js` uses. The agent's client tools depend on them.

## Configuration

Edit `config.js`:

- `AGENT_ID`: your ElevenLabs agent ID. The agent must be public, and your domain must be on its allowlist.
- `FORM_WEBHOOK_URL`: where demo requests are POSTed as JSON (Zapier, Make, n8n or your own API). Without it, requests are only saved in the visitor's browser.
- `ROI`: the assumptions behind the estimate.

## Before going live

- Add any new domain to the agent's allowlist in ElevenLabs (currently `localhost` and `mohdarhamasif.github.io`).
- Set `FORM_WEBHOOK_URL` so you actually receive demo requests.
- Replace the placeholder brand, prices and integrations with your real ones, in both `index.html` and the agent prompt.
