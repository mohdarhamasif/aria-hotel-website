> **Update, 17 October 2026, evening: superseded.** The user rejected the concept designs. A new single-page design, approved by the user, is now **live at https://amariya.legitdesign.studio**. It covers /hotels, /clinics and /dental, with real ElevenLabs voice and chat, music and 3D icons.
> - Source: `amariya/live/src/page.html`.
> - Build: `cd amariya/live && node build.mjs`, which writes `amariya/live/site`.
> - Deploy: `cd amariya/live/site && npx vercel deploy --prod`. The folder is linked to project aria-hotel-website, which now belongs to the legitdesignstudio team (marketing@legitdesign.studio).
> - Never deploy the repo root to that project; it would put the old site back.
> - Rollback target (the old site): https://aria-hotel-website-8jgly955g-amjadomer96-progs-projects.vercel.app.
> - The Astro packages and build workflow below are paused.

# Amariya: handoff for the next session (17 October 2026)

Read this first, then `README.md`. The memory index (`MEMORY.md`) is loaded automatically and points here.

## The job

Amariya is an AI voice receptionist on ElevenLabs Agents, from Legit Design Studio. The previous site, "Aria", was renamed Amariya. It is live and stays untouched.

We are building three separate premium marketing sites, one per niche. Each has its own concept, palette, typography and interactive 3D orb, on one shared engine. Every feature of the previous site must survive, plus substantial new ones.

| Route | Niche | Concept | Palette | Orb |
|---|---|---|---|---|
| `/hotels` | Hotels & restaurants | **The Night Log**: one night, 18:00 to 07:45, drawn as a lit architectural section of the visitor's house; the hour ring is the navigation | Forest & Champagne (dark) | Gimballed champagne lantern |
| `/clinics` | Physicians & clinics, incl. aesthetics | **The Line**: one steel hairline; Amariya's side on the left, the clinicians' side on the right; the orb rolls along it and never crosses | Ink & Porcelain (light) | Frosted porcelain |
| `/dental` | Dental practices | **First Available**: the site is the practice's day sheet; a nacre pearl rolls down the phone column and sets pearls into gaps | Rosé & Pearl (light) | Nacre pearl |

## Where everything is

- **Repo:** `C:\projects\aria-hotel-website`, branch `stagging`.
  - Remotes: `origin` (do not touch) and `amjad` (the user's private GitHub).
  - Old-site commits 225de70, 12a5753 and e7bdebe are not pushed to `amjad` yet.
  - `amariya/` is untracked and `.vercelignore` is modified (adds `amariya`). Nothing new is committed.
- **Old live site:** the repo root, deployed with the Vercel CLI to https://aria-hotel-website.vercel.app (scope amjadomer96-progs-projects). Never modify it.
- **New project:** `amariya/`. Astro 7.3.8 is pinned because local Node is 22.13.1. Also three 0.186.1, gsap 3.15.0, lenis, @elevenlabs/client 1.25.0. Vite 8 with rolldown, TypeScript strict.
- **Spec:** `amariya/spec/`
  - `build-spec.json`: the architect's draft spec. The red-team pass was skipped for speed.
  - `concepts.json`: the three judged concepts in full.
  - `inventory.json`: the previous site's features and DOM contract.
  - `packages.json`: the 9 build packages and their files.
  - `typography.md`: the font and size brief. Approved but **NOT applied yet**.
- **Voice agent kits:** `amariya/agents/` (README plus system prompts, first messages, knowledge-base templates and test calls per niche). The user still has to set the agents up in ElevenLabs.
- **Browser tests:** `amariya/tests/browser/*.mjs` (critshots, orbshots, motiontest, dragtest, plus contrast probes).
  - They need `puppeteer-core@25.14.0` (and `culori@4.0.2` for the contrast probes). Install them in that folder: `npm init -y && npm i puppeteer-core@25.14.0 culori@4.0.2`.
  - Chrome is at `C:/Program Files/Google/Chrome/Application/chrome.exe`, run headless with `--enable-unsafe-swiftshader --use-angle=swiftshader`.
- **Build workflow:** `amariya/scripts/build-workflow.js`.
  - Stages: Foundation → Build → Integrate → Typography → Review/Fix loop → Verify.
  - Review per niche: a design jury (all four widths), an AI-slop hunter (1440 and 390) and a QA lead (1440, 1024 and 390). Every issue is fixed, all severities, for up to 3 rounds.
- **Live progress board for the user:** https://claude.ai/artifact/M6cBr4frGDzS7fGjyBTNoW. Its db collections are `meta/board`, `stages/*` and `log/*`; update them with ArtifactData.

## State when this session ended

- **Done:** all 9 packages (P0–P8) are built on disk:
  - foundation engine and contracts
  - content for all niches
  - voice and chat
  - each niche's 3D scene
  - each niche's page UI
- **Integration was in progress, about 7 hours in, and the session ending stops it.** It had:
  - fixed type errors, including source code a shell heredoc had garbled
  - measured performance: the hotels scene takes about 24 draw calls per frame, clinics 1
  - updated the browser tests for the new pages
  - started a deep layout and z-index pass on /hotels (the hour ring, prologue, seat, basement band)
  - captured review screenshots (r0, r1) in the old session's temporary folder

  Its exact finishing state is unknown, so **start by re-running integration.**
- **Typography:** not applied. The audit found about 380 literal font sizes across the niche CSS, sizes below 11 px (10.5, 10, 9.5) and a drifted global scale.
- **Review rounds:** not started.

## How to continue

1. Install the test dependencies in `amariya/tests/browser` (see above).
2. Run the workflow from integration onwards, so the built packages are not rebuilt. In a new session, pass the script inline or use a script path the session can read:

```js
Workflow({
  scriptPath: 'C:\\projects\\aria-hotel-website\\amariya\\scripts\\build-workflow.js',
  args: {
    startAt: 'integrate',
    scratch: 'C:\\projects\\aria-hotel-website\\amariya\\tests\\browser',
    board: 'https://claude.ai/artifact/M6cBr4frGDzS7fGjyBTNoW',
    packages: /* the JSON array in amariya/spec/packages.json */
  }
})
```

The stages' prompts say "test scripts live in `${scratch}`, puppeteer-core is installed there", so `scratch` must be the folder with the tests and puppeteer-core. Review screenshots go to `${scratch}\crit\r<N>`.

3. When it finishes:
   - show the user the screenshots in `Downloads\amariya-site-preview`
   - run a local preview: `cd amariya && npx astro build && npx astro preview --port 4321`
   - update the board

## The user's standing rules

- **Standard:** perfect design, not a single mistake, nothing the user would need to change. Not even 1% "AI-looking" (no AI slop in visuals or copy). No rush: take the time needed.
- **No italics anywhere.**
- **Colours:** only `--color-*` role tokens, generated by `npm run palettes`, with every pair measured at AA.
- **Implementation:** follow Ponytail (`~/.claude/skills/ponytail/SKILL.md`): reuse, then stdlib, then native platform, then installed dependencies, then the minimum code. But never cut requested features, craft, accessibility or safety.
- **Previews before applying anything major.** Deploy only when asked, with the Vercel CLI. Never commit or push unless asked.
- **The user is cost-conscious about usage**, and the account hits session limits. When a limit hits, resume after the reset. The user declined switching to free-claude-code for this build.
- **Machine:** 6 GB RAM and a nearly full C: drive (often under 1 GB free). Run one headless Chrome at a time and close it after. Ask the user to free disk space when it drops below about 1 GB.

## Decisions already made

- **Palettes:** Forest & Champagne, Ink & Porcelain and Rosé & Pearl, as OKLCH ramps; see `scripts/palettes.mjs`.
- **Fonts** (see `spec/typography.md`, all commercially licensed):
  - hotels: Bona Nova + Bona Nova SC (Google)
  - clinics: Source Serif 4 at display optical size + Azeret Mono (Fontshare)
  - dental: Boska (Fontshare)
  - body: Supreme; wordmark: Ranade
- **Size scale (the user's own):** H1 72/56/40, H2 29/28/26, H3 18, lead 19/17, body 16, card 14, small 13, eyebrow 12, kicker/label 11, stat 34/30, with a per-face optical factor (hotels 1.08, clinics 1.06, dental 1.00). Nothing below 11 px.
- **Founders' offer:** a lifetime licence for the first 30 per niche, at $2,500 hotels & restaurants, $3,500 clinics and $3,000 dental (provisional).
  - It includes Professional features for life and 500 call minutes a month (extra at cost, no rollover), done-for-you setup, one location per licence, and "Live in 7 days or your money back".
  - Flow: apply in 2 steps, then book a 20-minute call on HubSpot, then an invoice.
  - The spots-left count shows real numbers only: no timers, no crossed-out prices.
- **HubSpot:** contact plus deal per application; meetings link per niche; private-app key in Vercel env vars, entered by the user.
- **Environment variables:** `PUBLIC_ELEVENLABS_AGENT_ID_HOTELS` / `_CLINICS` / `_DENTAL`, `PUBLIC_APPLY_WEBHOOK_URL` and `PUBLIC_HUBSPOT_MEETINGS_HOTELS` / `_CLINICS` / `_DENTAL`.

## Waiting on the user

- **Free disk space** on C:.
- **ElevenLabs:** create the three agents from `amariya/agents/README.md`, choose the voices and send the agent IDs. Add the site domains to the agents' allowlists, including aria-hotel-website.vercel.app for the old site.
- **HubSpot:** meetings links, and the webhook or private-app key.
- **The decision list** in `amariya/agents/README.md`: transfer numbers, deposits, SMS, recording disclosure, and data agreements for clinics and dental.
- **Domains:** amariya.ai or heyamariya.com, and a trademark check.
- **Pushing** the old-site commits to `amjad`, when asked.
