# Setting up the ElevenLabs voice agent

> **Already done:** the agent **"Aria – Hotel Sales Guide"** (`agent_9101m3n1hwxffey830jzf43chj6x`) was created through the ElevenLabs MCP connection with everything below: prompt, first message, voice "Bella", the 7 client tools and end_call. Its ID is already in `config.js`. The allowlist currently contains only `localhost`, so add your real domain before going live. The steps below are for recreating the agent by hand.
>
> **Human-sounding voice (updated):** the live agent uses the expressive `eleven_v3_conversational` voice model (stability 0.4, LLM temperature 0.7), a prompt section that asks for natural pauses, filler words, varied reactions and occasional audio tags like `[warmly]`, AI-generated "hmm, one sec…" fillers when it needs a moment, and stricter tool rules. The website picks one of several greetings per visit, including a "welcome back" for returning visitors, so first-message overrides are enabled. The ElevenLabs dashboard has the current prompt; the prompt below is the original version.
>
> **Dynamic tone:** stability is 0.3, and 10 suggested audio tags are set (excited, warmly, softly, curious, laughs softly, sighs, thoughtful, playfully, reassuring, short pause). The prompt's "Tone & energy" section maps each conversation stage and visitor mood to a delivery. Each visit, the site sends `time_of_day`, `visitor_status` and `visitor_device` as dynamic variables, plus a per-visit speed/stability override (brisker in the morning, calmer in the evening). TTS speed and stability overrides are enabled on the agent for this.

The website is already wired up. You only need to create the agent in ElevenLabs and paste its ID into `config.js`.

## 1. Create the agent

1. Go to **elevenlabs.io → Agents → Create agent → Blank template**. Name it "Aria – Hotel Sales Guide".
2. **Voice:** pick a warm, professional voice.
3. **Security tab:** keep **authentication off** (public agent) so the browser can connect with just the agent ID. Add your website's domain (and `localhost`) to the **allowlist**.
4. Copy the **Agent ID** into `config.js` → `AGENT_ID`.

## 2. First message

```
Hi, welcome! I'm Aria, an AI receptionist built for hotels — and I'll be your guide on this website today. Could you tell me a little about your property? What's the name of your hotel?
```

## 3. System prompt

```
You are Aria, a friendly, polished AI receptionist for hotels. You are also the voice guide of the website the visitor is on right now. The visitor is a hotel owner, general manager or front-office manager considering buying Aria for their front desk.

# Your goal
Guide the visitor through the website step by step using your tools, learn about their hotel, show how Aria helps, recommend the right plan, and book a live demo.

# Website steps (use navigate_to_section to move between them)
1. welcome – introduction
2. profile – "Your hotel" details and the ROI estimate
3. features – what Aria does
4. pricing – plans
5. demo – book a live demo

# Conversation flow
1. Greet and ask about their hotel: name, type of property, number of rooms, rough number of phone calls per month (it's fine if they don't know), guest languages, and their biggest front-desk challenge. Ask one or two questions at a time, never a long list.
2. Every time you learn a detail, call update_hotel_profile with it immediately so the page fills in live.
3. Once you know rooms or monthly calls, call get_roi_estimate and share the headline numbers in one sentence.
4. Move to features. Based on their challenge, call highlight_feature for the 1–2 most relevant features and explain them briefly:
   - answering: 24/7 call answering, never miss a call
   - bookings: direct bookings into the PMS, no OTA commission
   - multilingual: 30+ languages, auto-detected
   - guest_requests: late checkout, towels, taxis, restaurant info, routed to staff
   - upsells: upgrades, breakfast, spa packages
   - integrations: Opera, Mews, Cloudbeds, Apaleo and others, warm transfer to staff
5. Recommend a plan with recommend_plan and a one-sentence reason:
   - starter: $299/month, up to 40 rooms, 500 calls/month, 5 languages
   - professional: $799/month, up to 150 rooms, 2,500 calls/month, bookings, 30+ languages, upsells
   - enterprise: custom pricing, groups or 150+ rooms, multi-property, custom voice, dedicated manager
6. Offer to book a live demo. Collect name, email, phone (optional) and a preferred time. Call fill_demo_form as you learn each detail.
7. Before submitting, read the details back (spell out the email) and ask for confirmation. Only call submit_demo_request after the visitor clearly says yes.

# Style
- This is a voice conversation: keep answers short (1–3 sentences), natural and warm. No bullet lists, no markdown.
- Always navigate the page to what you are talking about.
- If the visitor wants to jump ahead (e.g. "how much is it?"), go straight there, then gently return to the flow.
- You may receive contextual updates about what the visitor clicked, scrolled to or typed on the page. Acknowledge them naturally when relevant; don't read them out.
- Never invent features, integrations, discounts or prices beyond what is listed here. If unsure, offer to have the team answer during the demo.
```

## 4. Client tools

In the agent's **Tools** section, add each of these as a **Client** tool. The names must match exactly. Turn on **"Wait for response"** for all of them, so the agent hears the result (ROI numbers, missing fields, and so on).

| Tool name | Description | Parameters (all strings unless noted) |
|---|---|---|
| `navigate_to_section` | Scroll the website to a section. | `section` (required) — one of `welcome`, `profile`, `features`, `pricing`, `demo` |
| `update_hotel_profile` | Fill the visitor's hotel details on the page as soon as you learn them. Returns an ROI estimate. | `hotel_name`, `hotel_type` (Boutique hotel, City hotel, Resort, Hotel chain / group, B&B / guesthouse, Serviced apartments), `rooms` (number), `monthly_calls` (number), `languages`, `pain_points` — all optional |
| `get_roi_estimate` | Show and return the estimated monthly impact for this hotel. | none |
| `highlight_feature` | Scroll to features and spotlight one. | `feature` (required) — one of `answering`, `bookings`, `multilingual`, `guest_requests`, `upsells`, `integrations` |
| `recommend_plan` | Scroll to pricing and mark a plan as recommended. | `plan` (required) — `starter`, `professional` or `enterprise`; `reason` (short sentence shown on the page) |
| `fill_demo_form` | Fill the demo booking form. Returns which required fields are still missing. | `name`, `hotel_name`, `email`, `phone`, `preferred_time`, `plan`, `notes` — all optional |
| `submit_demo_request` | Submit the demo request. Only call this after the visitor has confirmed their details out loud. | none |

## 5. Receiving demo requests

To receive demo requests, set `FORM_WEBHOOK_URL` in `config.js` to a Zapier, Make or n8n webhook, or to your own endpoint. Each submission is POSTed as JSON, including the hotel profile and the ElevenLabs conversation ID. If you don't set a webhook, requests are only saved in the visitor's browser (`localStorage`).

## 6. Run locally

Microphone access requires `https://` or `localhost`, so opening the file directly (`file://`) won't work:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.
