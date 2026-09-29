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
| `index.html` | Page structure: hero, hotel profile + ROI, features, plans, demo form, conversation dock |
| `styles.css` | Visual design, animations, responsive layout |
| `app.js` | ElevenLabs conversation, client tools the agent calls, transcript, smooth scrolling |
| `config.js` | Agent ID, optional webhook for demo requests, ROI assumptions |
| `AGENT_SETUP.md` | How the ElevenLabs agent is configured: prompt, tools, voice, tone |

## Configuration

Edit `config.js`:

- `AGENT_ID`: your ElevenLabs agent ID. The agent must be public, and your domain must be on its allowlist.
- `FORM_WEBHOOK_URL`: where demo requests are POSTed as JSON (Zapier, Make, n8n or your own API). Without it, requests are only saved in the visitor's browser.
- `ROI`: the assumptions behind the estimate.

## Before going live

- Add any new domain to the agent's allowlist in ElevenLabs (currently `localhost` and `mohdarhamasif.github.io`).
- Set `FORM_WEBHOOK_URL` so you actually receive demo requests.
- Replace the placeholder brand, prices and integrations with your real ones, in both `index.html` and the agent prompt.
