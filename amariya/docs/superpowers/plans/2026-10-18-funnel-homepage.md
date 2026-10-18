# Amariya Funnel Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the approved Amariya sales funnel as the homepage of amariya.legitdesign.studio, with real ElevenLabs voice and text chat, keeping the niche pages at /hotels, /clinics and /dental.

**Architecture:** The live site is a static build. `amariya/live/build.mjs` turns HTML sources in `amariya/live/src/` into `amariya/live/site/`, which is deployed with the Vercel CLI. We add a second source, `src/home.html`, which is the approved funnel, and write it to `site/index.html` with its own head. Today that file holds the hotels page. The voice code is ported from the niche page (`src/page.html:679-816`) into the funnel's classic script. Browser checks live in `amariya/live/test/` and run against the built site through a local static server.

**Tech Stack:** Static HTML, CSS and JS; Node 20+ for the build; WebGL (raw, with the funnel's ParticleOrb); three.js 0.160.0 from jsdelivr for the 3D icons; Lenis vendored at `/vendor/lenis.min.js`; ElevenLabs `@elevenlabs/client@1.25.0` as ESM from jsdelivr; puppeteer-core from `amariya/tests/browser` driving `C:/Program Files/Google/Chrome/Application/chrome.exe`.

**Spec:** the approved preview source `C:\Users\user\AppData\Local\Temp\claude\c--projects-aria-hotel-website\13b5b690-193a-4c7b-92ca-1aba395fcc1b\scratchpad\funnel\funnel.src.html` (artifact version 4, https://claude.ai/artifact/E2FaweNJwPjoYtJunxPFEu). User decisions on 2026-10-18:
- the funnel is the homepage;
- the 7 setup days stay as drafted;
- HubSpot is deferred, both for applications and for the automatic seat count;
- no cancellation line for the monthly plans.

## Global Constraints

- Do not commit, push or deploy; the user deploys only on request. The `amariya/` folder is not under git, so nothing gets committed.
- Copy: no em dashes (—) or en dashes (–) anywhere, and no italic type (`em` stays `font-style: normal`).
- Type scale (px): H1 72/56/40, H2 29/28/26, H3 18, lead 19/17, body 16, card 14, small 13, eyebrow 12, label 11. Nothing below 11px in page UI.
- Keep the approved design exactly. The only visible change is the dock (Task 2).
- Agent ID `agent_9101m3n1hwxffey830jzf43chj6x`; SDK URL `https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm`.
- Amariya says she is an AI receptionist in her first sentence. She makes no HIPAA or GDPR claims, gives no medical or clinical advice, and states no cancellation or minimum-term terms.
- `APPLY_WEBHOOK` stays `''` and the seat count stays static (30 of 30) until the HubSpot work. This blocks deploy: applications have no destination yet, and the user must be told before any deploy.
- The machine has very little disk (about 350 MB free) and 6 GB RAM. Run one headless Chrome at a time, save screenshots as JPEG at quality 70, and delete them after review.
- Platform: Windows with Git Bash and PowerShell. Use the paths exactly as written.

## Review Focus

1. **The agent can't be reached:** the domain isn't on the agent allowlist yet, or the network blocks jsdelivr. The dock must say "Couldn’t connect", the page must keep working, and there must be no uncaught errors. Covered by Task 2 check `voice: no agent`.
2. **The visitor denies microphone access:** the page falls back to a text chat, as the niche pages do, and doesn't get stuck on "Connecting". Covered by Task 2 check `voice: mic denied`.
3. **The visitor gives details by voice, then opens the application form:** the fields arrive filled in. Covered by Task 2 check `voice: fill form`.
4. **Small phones (375×667) in text mode:** the dock input and status don't overflow and the page has no sideways scroll. Covered by Task 2 check `voice: dock fits`.
5. **The niche pages still build and route:** /hotels, /clinics and /dental keep working now that `/` is the funnel. Covered by Task 1 check `niche pages`.

---

### Task 1: The funnel as the homepage

**Files:**
- Create: `amariya/live/src/home.html` (copy of the spec file without its first two lines, the preview-only `<title>` and the `claude:viewport-fit-sides` meta)
- Modify: `amariya/live/build.mjs:66-75` (write the homepage, favicon and sitemap entry)
- Create: `amariya/live/test/serve.mjs` (copy of `...\scratchpad\serve.mjs`, unchanged)
- Create: `amariya/live/test/home.check.mjs`

**Interfaces:**
- Produces `node amariya/live/test/home.check.mjs [only]`. It starts `test/serve.mjs site 4321` as a child process, runs the named checks (optionally only those whose names contain `only`), prints `PASS name` or `FAIL name: reason` for each, exits 1 on any failure, and kills the server. Each check is `check(name, async (page) => void)`, and it throws on failure. Task 2 adds checks to this file.
- Produces `site/index.html` (the funnel), `site/favicon-home.svg` and `site/og-home.jpg`. The image is captured by the check run.
- Element ids that Task 2 relies on (already in the spec file): `#dock`, `#dockStatus`, `#dockCaption`, `.js-talk`, `.js-apply`, `#apply`, `#applyForm`, the form fields `#program #kind #locations #business #calls #software #name #email #phone #country`, and the sections `#welcome #story #problem #call #features #golive #pricing #faq`.

- [ ] **Step 1: Write the checks** in `test/home.check.mjs`, using puppeteer-core loaded through `createRequire('C:/projects/aria-hotel-website/amariya/tests/browser/package.json')`. Launch Chrome with the args `--enable-unsafe-swiftshader --use-angle=swiftshader`. Collect `pageerror` and console `error` messages per check. The checks:
  - `home: title`: at `/`, `document.title === 'Amariya · AI receptionist for hotels, restaurants, clinics and dental practices'`.
  - `home: canonical`: `link[rel=canonical]` has the href `https://amariya.legitdesign.studio/`.
  - `home: fonts`: after `document.fonts.ready`, both `Supreme` and `Ranade` have a `FontFace` in `document.fonts` with `status === 'loaded'`. Don't use `fonts.check()`, which passes when a face is missing.
  - `home: no errors`: at 1440×900, load `/` and wait 4 s, then scroll to the bottom in 12 equal steps 600 ms apart. Zero errors collected.
  - `home: no sideways scroll`: at 1440×900, 390×844 and 375×667, `document.documentElement.scrollWidth - innerWidth === 0`.
  - `niche pages`: for each of `/hotels`, `/clinics` and `/dental`, `document.documentElement.dataset.niche` equals the path without its slash.
  - `sitemap`: `/sitemap.xml` contains `<loc>https://amariya.legitdesign.studio/</loc>`.
  - After the checks, set the viewport to 1200×630, load `/`, wait 4 s and screenshot the viewport to `site/og-home.jpg` (JPEG, quality 82).
- [ ] **Step 2: Run them to see them fail.** Run `cd amariya/live && node build.mjs && node test/home.check.mjs`. Expected: `FAIL home: title`, because `/` is still the hotels page.
- [ ] **Step 3: Create `src/home.html`** from the spec file, minus its first two lines. Leave the `/*FONTS*/` and `<!--LENIS-->` placeholders in place.
- [ ] **Step 4: Add `home()` to `build.mjs`** and call it in place of `writeFileSync(join(out, 'index.html'), page('hotels', '/'))`. The head follows `page()`'s pattern:
  - `<html lang="en">` and the title from the `home: title` check.
  - Description: `Amariya answers every call, books into your system and hands over to your team, in your callers’ language. A founding licence for the first 30 businesses in each niche, or monthly plans from $299.`
  - The canonical and `og:url` are `${BASE}/`, and `og:image` is `${BASE}/og-home.jpg` at 1200×630.
  - `theme-color` is `#050506` and the icon is `/favicon-home.svg`.
  - Preload `/fonts/ranade-400.woff2`, `/fonts/supreme-400.woff2` and `/fonts/supreme-500.woff2`, and preconnect to `https://cdn.jsdelivr.net`.
  - JSON-LD: a `Product` named Amariya with brand Legit Design Studio and five `Offer`s:
    - founding licence for hotels and restaurants, 2500;
    - founding licence for clinics, 3500;
    - founding licence for dental practices, 3000;
    - Starter, 299;
    - Professional, 799.
    All are in USD. The founding offers have `availability: https://schema.org/LimitedAvailability`. The monthly offers carry a `UnitPriceSpecification` with `unitCode: 'MON'`.
  - In the body, replace `/*FONTS*/` with the existing `faces` string and `<!--LENIS-->` with `<script src="/vendor/lenis.min.js"></script>`. It must not be deferred, because the inline script reads `window.Lenis`.
  - Write `favicon-home.svg` with the existing favicon template, using background `#050506` and ring stops `#3e7fd8`, `#86d6c4` and `#e8622a`.
  - The sitemap lists `${BASE}/` first, then the three niches.
- [ ] **Step 5: Run the checks to see them pass.** Run `cd amariya/live && node build.mjs && node test/home.check.mjs`. Expected: every line `PASS`, exit code 0, and `site/og-home.jpg` exists. Open the JPEG and confirm it shows the hero orb and headline.

### Task 2: Real voice, text chat and the shared application

**Files:**
- Modify: `amariya/live/src/home.html`, which holds the dock markup and CSS, the classic `<script id="main">` and the ParticleOrb uniforms
- Modify: `amariya/live/test/home.check.mjs` (add checks)

**Interfaces:**
- Consumes the ids listed in Task 1.
- Produces these globals in the classic script, which the checks call:
  - `TOOLS`: client tools keyed by the names the agent already uses: `navigate_to_section`, `update_hotel_profile`, `update_business_profile`, `get_roi_estimate`, `highlight_feature`, `recommend_plan`, `fill_demo_form` and `submit_demo_request`.
  - `APPLICATION`: a plain object.
  - `startConvo(mode: 'voice' | 'text', opener?: string): Promise<void>`
  - `setDock(state: 'idle'|'connecting'|'listening'|'thinking'|'speaking'|'chat', status?: string|null, text?: string|null): void`
  - `sendApplication(data: object): Promise<boolean>`

- [ ] **Step 1: Write the checks** (all at 1440×900 unless stated):
  - `voice: navigate`: `TOOLS.navigate_to_section({ section: 'pricing' })` returns `'Now showing pricing.'`. After 1.8 s, `#pricing` has its `getBoundingClientRect().top` between -10 and 200.
  - `voice: unknown section`: `TOOLS.navigate_to_section({ section: 'zzz' })` returns `'Unknown section. Use one of: top, story, problem, demo, features, setup, pricing, questions.'`
  - `voice: fill form`: `TOOLS.fill_demo_form({ name: 'Sam Lee', hotel_name: 'Harbour House', email: 'sam@example.com', phone: '+44 20 7946 0000', business_type: 'hotel' })` returns a string ending `Everything needed is in.` Then clicking the first `.js-apply` gives `#business` the value `'Harbour House'` and `#kind` the value `'hotel'`. Submitting steps 1 and 2 shows step 3 with `#name 'Sam Lee'`, `#email 'sam@example.com'` and `#phone '+44 20 7946 0000'`.
  - `voice: submit`: after the fill above, `await TOOLS.submit_demo_request()` returns a string starting `Application recorded for Sam Lee (sam@example.com).`
  - `voice: no agent`: abort every request whose URL contains `@elevenlabs/client`, then click `#dockKeys`. Within 4 s `#dockStatus` reads `Couldn’t connect`, and no `pageerror` fires.
  - `voice: mic denied`: block the same SDK URL, set `browserContext.overridePermissions(origin, [])`, then click `#dockMic`. Within 4 s `#dock` has `data-mode="text"` or `#dockStatus` reads `Couldn’t connect`. It must never stay on `Connecting`.
  - `voice: dock fits`: at 375×667, with `#dock` set to `data-mode="text"`, `#dock.scrollWidth <= #dock.clientWidth` and the page has no sideways scroll.
  - `voice: no preview note`: the HTML has no `Voice opens on the live page`.
- [ ] **Step 2: Run them to see them fail.** Run `cd amariya/live && node build.mjs && node test/home.check.mjs voice`. Expected: `FAIL voice: navigate` with `TOOLS is not defined`.
- [ ] **Step 3: Replace the dock markup** with the live dock's structure (`src/page.html:471-484`):
  - the root `#dock` gets `data-state="idle"` and `data-mode="voice"`;
  - `#dockOrb` keeps its `orb orb-sm` canvas host;
  - `#dockStatus` is a span followed by `.wave` with five `i`;
  - `#dockCaption` stays;
  - add the `#dockForm` text input, `#dockMic` with mic and end icons, and `#dockKeys`.

  Add the `#i-keys` symbol (`src/page.html:367`) to the sprite. Port the dock CSS (`src/page.html:302-329`) using the funnel's tokens:
  - `var(--accent)` becomes `var(--orb-mint)`;
  - `var(--label)` becomes `var(--label-size)`;
  - `var(--small)` becomes `var(--small-size)`;
  - the input text is `var(--text)`.

  Keep the dock's look and size otherwise.
- [ ] **Step 4: Port the voice module** from `src/page.html:679-757` into the classic script, replacing the preview's `.js-talk` click handler. The module covers `setDock`, `visitVars`, `startConvo`, `send`, `endConvo`, `endUi`, `convoLevel` and `talk`. Drop the `Music` calls and `niche`. These strings are fixed:
  - The greeting override is ``(part) => `Good ${part}, I’m Amariya, an AI receptionist. I answer the phones for hotels, restaurants, clinics and dental practices. What kind of business do you run?` ``
  - `contextFor()` returns this, verbatim: `Your name is Amariya; always call yourself Amariya. The visitor is on the main Amariya page, which covers hotels, restaurants, clinics and dental practices. There are two ways to buy. First, the founding licence, paid once: $2,500 for hotels and restaurants, $3,500 for clinics, $3,000 for dental practices, for the first 30 businesses in each niche. It includes Professional features for life, 500 call minutes a month (extra minutes at cost, unused minutes do not roll over), done-for-you setup and one location per licence. She goes live within 7 days or the money is refunded in full, and after she goes live there are 7 more days to ask for a refund for any reason. Second, monthly plans: Starter at $299 a month (one location, 500 calls, bookings and FAQs, 5 languages), Professional at $799 a month (up to 3 locations, 2,500 calls, books into their software, 30+ languages, upsells and analytics) and Enterprise, priced on request (multi-location, custom voice, a dedicated success manager, unlimited calls). Do not state cancellation or minimum-term terms; say the team confirms terms on the call. Never give medical or clinical advice; clinical questions are for the clinic’s own team. Make no claims about HIPAA or GDPR. To apply, collect the visitor’s name, business name, email, phone and a good time for a 20-minute call; call fill_demo_form with what you have, then submit_demo_request. The team follows up to arrange the call, then sends an invoice. Profile fields: hotel_name is the business name, business_type is hotel, restaurant, clinic or dental, rooms is rooms, practitioners or chairs, monthly_calls is calls per month. Sections you can show with navigate_to_section: top, story, problem, demo, features, setup, pricing, questions.`
  - Bind `talk` to every `.js-talk` and to `#dockMic`. Port the `#dockKeys`, `#dockForm` and `#dockInput` handlers from `src/page.html:806-813`.
  - Load the SDK 1.5 s after `load`, as the niche page does.
  - `lenis.stop()` while the apply dialog is open is already in place; leave it.
- [ ] **Step 5: Add `TOOLS`**, ported from `src/page.html:759-802`, with these funnel mappings:
  - `navigate_to_section` uses `SECTIONS`:
    - `top`, `home`, `hero` → `#welcome` (scroll to 0);
    - `story` → `#story`;
    - `problem` → `#problem`;
    - `demo`, `how`, `call` → `#call`;
    - `features` → `#features`;
    - `setup`, `days`, `golive` → `#golive`;
    - `pricing`, `plans`, `plan`, `offer`, `licence`, `license`, `apply`, `contact` → `#pricing`;
    - `faq`, `questions` → `#faq`.

    It scrolls with `lenis.scrollTo(el, { duration: 1.4 })`, or with `el.scrollIntoView({ behavior: 'smooth' })` when Lenis is off.
  - `highlight_feature` maps these features to pill indexes in `#orbit`:
    - `bookings` and `integrations` → 0;
    - `multilingual` → 1;
    - `answering` → 2;
    - `guest_requests` → 3;
    - `after_hours` → 4.

    It navigates to `features` and adds the class `spot` for 5 s. The CSS is `.pill.spot { border-color: rgba(134,214,196,.6); box-shadow: 0 0 0 4px rgba(134,214,196,.14), inset 0 1px 0 rgba(255,255,255,.2); }`. Any other value returns `'Unknown feature. Use: answering, bookings, multilingual, guest_requests, after_hours, integrations.'`
  - `recommend_plan`: if `PROFILE.business_type` is clinic or dental, click that `#priceTabs` button; for hotel or restaurant, click the hospitality one. Then navigate to `pricing` and return `` `Two ways to pay: the founding licence at ${price} once for the first 30 ${who}, or monthly plans from $299. Showing pricing now.` ``, taking price and who from the pressed tab's `OFFER` entry.
  - `fill_demo_form` merges its fields into `APPLICATION`. When the dialog opens, empty fields are filled from `APPLICATION`:
    - `hotel_name` → `#business`;
    - `business_type` → `#kind`, if it matches an option value;
    - `name` → `#name`;
    - `email` → `#email`;
    - `phone` → `#phone`.
  - `submit_demo_request` calls `sendApplication({ ...APPLICATION, source: 'voice', page: location.href, at: new Date().toISOString() })`. Its return strings are the niche page's.
  - The form's final submit also calls `sendApplication` with the form data and `source: 'form'`, without waiting for it. The thank-you text is unchanged.
  - `sendApplication` POSTs JSON to `APPLY_WEBHOOK` when it is set and returns true; otherwise it returns false.
- [ ] **Step 6: Make the orbs answer the voice.**
  - `ParticleOrb.draw` reads `p.states.connecting`, `listening`, `thinking` and `speaking` into `uConnect`, `uListen`, `uThink` and `uSpeak`, replacing the hard-coded zeros.
  - In `frame`, ease a `states` object toward 1 for the current `voice` state and 0 for the rest, at a rate of `dt * 4`. Ease `level` toward `convoLevel()` at `dt * 10`, and set `--level` on `#dock`.
  - `drawField` passes `states` and `Math.max(level, emit * emit * 0.45)`. `drawMini` passes `states` and `level`. The setup orb keeps level 0 and quiet states.
- [ ] **Step 7: Run all the checks to see them pass.** Run `cd amariya/live && node build.mjs && node test/home.check.mjs`. Expected: every line `PASS`, including Task 1's, and exit code 0.
