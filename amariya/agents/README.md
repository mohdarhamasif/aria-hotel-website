# Amariya voice agents: ElevenLabs setup

This folder holds everything needed to set up the three Amariya agents in the ElevenLabs dashboard, one per niche. Each niche has its own voice, prompt, first messages, knowledge-base template and test script.

| Niche | Folder | Website page | Founders' licence |
|---|---|---|---|
| Hotels & restaurants | `hotels/` | `/hotels` | $2,500 |
| Physicians & clinics, including aesthetics | `clinics/` | `/clinics` (on the current site: `/aesthetics`) | $3,500 |
| Dental practices | `dental/` | `/dental` | $3,000 |

Each niche folder contains:

- `system-prompt.md`: the full system prompt. Paste the contents of the box into the agent.
- `first-messages.md`: the dashboard first message, production greetings by time of day, website greetings and translated greetings.
- `knowledge-base.md`: the template each client fills in before go-live.
- `test-scenarios.md`: 10 test conversations with expected behaviour, including adversarial ones.

One prompt handles both jobs. The `mode` dynamic variable switches between them:

- `demo`: on the Amariya website. Amariya talks to a prospect (a hotel owner, clinic manager or dentist), offers to role-play a call for their business and explains the founders' licence.
- `production`: on a client's phone line. Amariya answers real callers using that client's profile and knowledge base.

---

## 1. How the agents are organised

| Agent | Voice | Used by | `mode` |
|---|---|---|---|
| Amariya – Hotels & Restaurants | hotels voice | the hotels page on the website | `demo` |
| Amariya – Clinics | clinics voice | the clinics page (`/aesthetics` on the current site) | `demo` |
| Amariya – Dental | dental voice | the dental page | `demo` |
| Amariya – Hotels – {Client name} (one per client) | the niche's voice, or the client's choice | the client's phone line | `production` |
| Amariya – Clinics – {Client name} | as above | as above | `production` |
| Amariya – Dental – {Client name} | as above | as above | `production` |

The three niche agents are the masters. For each paying client, duplicate the master for their niche. ElevenLabs attaches the knowledge base, phone number and transfer numbers to an agent, so each client needs a copy of their own. The prompt stays the same. When you improve a prompt, paste it into the master and then into each client copy.

---

## 2. Create the three master agents

Do this once per niche. Values that differ by niche are in the tables further down.

1. **Create.** In ElevenLabs, go to Agents → Create agent → Blank. Give it the name from the table in section 1.
2. **Agent tab:**
   - **Agent language:** English.
   - **First message:** paste the "Dashboard first message" from the niche's `first-messages.md`. On the website, the page replaces it with a demo greeting on every visit.
   - **System prompt:** paste everything inside the box in the niche's `system-prompt.md`.
   - **Dynamic variables:** once the prompt is saved, the dashboard lists every `{{variable}}` it found. Fill in the test placeholders from section 3. Placeholders are only used when you test in the dashboard. They are never used on real calls (see section 3).
   - **LLM:** choose a fast model with reliable tool calling from the dropdown. Set the temperature to 0.4. Lower values make the agent more literal about policies and prices.
   - **Knowledge base:** none on the masters, because the product facts for demos are in the prompt. Client copies get the client's knowledge base (section 5).
3. **Tools.** Add these:
   - **System tools:** `end_call`, `language_detection` and `skip_turn`. Leave each description blank to use the default. Add `transfer_to_number` only to client copies (section 7), because transfers need a phone line.
   - **Client tools:** the 7 website tools in section 6, with the exact names and JSON.
4. **Voice tab:**
   - **Voice:** the niche's voice.
   - **Model:** the expressive v3 conversational model (`eleven_v3_conversational`), the one the current live agent uses. It understands the audio tags in the prompt and the website greetings.
   - **Settings:** stability 0.35 to 0.45, speed 1.0, similarity at its default.
   - **Suggested audio tags:** warmly, softly, reassuring, thoughtful, curious, laughs softly.
   - **If latency is too high on phone lines:** switch the client copies to Flash v2.5 (multilingual). Also delete the "Audio tags" line from that copy's prompt and remove the tags from its first messages, or they may be read out.
5. **Conversation flow (Advanced tab):** use the values in section 9.
6. **Security tab (masters):**
   - **Authentication:** off. The website connects with only the agent ID.
   - **Allowlist:** add every host the website runs on:
     - `localhost`
     - `aria-hotel-website.vercel.app`
     - `amariya.ai` and `www.amariya.ai`
     - `heyamariya.com` and `www.heyamariya.com`
     - each Vercel preview host you test on
   - **Overrides:** enable First message, TTS speed and TTS stability. The current site sends all three on every visit. If an override is sent but not enabled, the session is refused.
7. **Analysis tab:** add the evaluation criteria and data-collection fields in section 10. They score every conversation, so you can review problems without listening to every call.
8. **Save.** Then test (section 11) before pointing the website at the agent.

---

## 3. Dynamic variables (the contract)

The prompt uses these 10 variables, and the dashboard requires a value for each one when a conversation starts. The values typed into the agent editor are only test placeholders. ElevenLabs does not use them for real web sessions or phone calls, and a missing variable makes the conversation fail. So:

- the website must send all 10 in demo mode (section 4)
- the conversation-initiation webhook must send all 10 for production calls (section 7)

Use the text `not provided` for anything unknown. The prompt treats that as "unknown, don't guess".

| Variable | Demo value (website) | Production value (webhook) | Used for |
|---|---|---|---|
| `mode` | `demo` | `production` | switches between prospect guide and live receptionist |
| `business_name` | `not provided` | e.g. `The Harbour House` | greeting, transfers, messages |
| `business_type` | `not provided` | e.g. `Boutique hotel, 42 rooms, with the Olive restaurant (60 seats)` | what to offer (rooms, tables, consultations, check-ups) |
| `business_profile` | `not provided` | 3 to 8 short sentences: address, today's hours, the facts asked most (max about 1,500 characters) | quick facts without searching the knowledge base |
| `local_datetime` | browser time, e.g. `Friday 16 October 2026 at 21:40` | the business's local time in the same format | working out "tomorrow", "this Saturday" |
| `time_of_day` | `morning`, `afternoon` or `evening` (the site already sends this) | same, in the business's time zone | greetings |
| `staff_available` | `no` | `yes` if a person can take a transfer right now, otherwise `no` | transfer or take a message |
| `booking_integration` | `not provided` | `live` (tools write to the PMS, reservation or practice system) or `request_only` (the team confirms) | confirm a booking or take a request |
| `emergency_number` | `not provided` | `911`, `999`, `112`, etc. for the client's country | emergencies |
| `caller_phone` | `not provided` | the caller ID, or `withheld` | offering to text the number they're calling from |

The prompt also reads `{{system__is_text_only}}`, a system variable that ElevenLabs fills in itself. Don't send it.

Test placeholders for the dashboard. Use the demo set first, then the production set:

| Variable | Demo test | Production test (hotels) | Production test (clinics) | Production test (dental) |
|---|---|---|---|---|
| `mode` | `demo` | `production` | `production` | `production` |
| `business_name` | `not provided` | `The Harbour House` | `Linden Skin Clinic` | `Bright Smile Dental` |
| `business_type` | `not provided` | `Boutique hotel, 42 rooms, with the Olive restaurant (60 seats)` | `Aesthetics clinic and med spa, 4 practitioners` | `General and cosmetic dental practice, 5 chairs` |
| `business_profile` | `not provided` | `14 Marine Parade, Brighton. Front desk 24 hours. Olive restaurant open Tuesday to Sunday, 6 pm to 10 pm. Check-in 3 pm, check-out 11 am. Parking 18 pounds a night, book ahead.` | `22 Linden Street, Manchester. Open Monday to Saturday, 9 am to 7 pm. Consultation deposit 50 pounds, taken off the treatment price.` | `8 Elm Road, Leeds. Open Monday to Friday, 8 am to 6 pm, closed 1 to 2 pm. Urgent slots daily at 8:30 am and 2 pm.` |
| `local_datetime` | `Friday 16 October 2026 at 21:40` | same | same | same |
| `time_of_day` | `evening` | `evening` | `evening` | `evening` |
| `staff_available` | `no` | `yes` | `no` | `no` |
| `booking_integration` | `not provided` | `live` | `live` | `request_only` |
| `emergency_number` | `not provided` | `999` | `999` | `999` |
| `caller_phone` | `not provided` | `+44 7700 900123` | `+44 7700 900456` | `+44 7700 900789` |

The `+44 7700 900` numbers are a UK range reserved for fiction, so they are safe to use in tests.

---

## 4. Website: what to change

The agent IDs below are placeholders. Use the real IDs from each agent's page in ElevenLabs. Agent IDs are public by design (they ship in the page's JavaScript). Keep the API key out of the website and this repo.

### 4a. Current site (repo root: `/`, `/hotels/`, `/aesthetics/`, `/dental/`)

1. **Send the new dynamic variables first.** Otherwise the new agents refuse to start. In `app.js`, inside `visitContext()`, replace the `dynamicVariables` line with:

   ```js
   dynamicVariables: {
     mode: "demo",
     time_of_day: part,
     local_datetime: new Date().toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
     business_name: "not provided",
     business_type: "not provided",
     business_profile: "not provided",
     staff_available: "no",
     booking_integration: "not provided",
     emergency_number: "not provided",
     caller_phone: "not provided",
     visitor_status: returning ? "returning" : "new",
     visitor_device: mobile ? "mobile" : "desktop",
   },
   ```

   `visitor_status` and `visitor_device` are kept so the old Sales Guide agent on the home page keeps working.

2. **Agent IDs per page.** Add `agentId` to the `page` block of each content file:

   | File | `page.agentId` |
   |---|---|
   | `industries/hotels.json` | `"<HOTELS_AGENT_ID>"` |
   | `industries/aesthetics.json` | `"<CLINICS_AGENT_ID>"` |
   | `industries/dental.json` | `"<DENTAL_AGENT_ID>"` |
   | `industries/home.json` | leave it out to keep using `AGENT_ID` in `config.js` (the existing Sales Guide), or set it to the hotels agent |

3. **Remove `page.agentContext`** from `hotels.json`, `aesthetics.json` and `dental.json`. It was a stopgap for the shared agent, and the new prompts cover it. Keep it in `home.json` while home still uses the Sales Guide.
4. **Optional:** replace `page.greetings` in the three files with the website greetings in each niche's `first-messages.md`. They keep the same `{brand}` and `{part}` tokens.
5. **Optional, but it makes the profile form fit the new niches:**
   - add `"Restaurant"` and `"Hotel with restaurant"` to `profile.type_options` in `hotels.json`
   - add `"Medical practice"` and `"Specialist clinic"` to `aesthetics.json`

   The `update_business_profile` tool can only pick an option that exists.
6. **Rebuild** with `python tools/build_pages.py`. Test on `localhost` (section 11), then deploy when you're ready.

### 4b. New Astro site (`amariya/`)

The orb's talk button is still a preview (`src/scripts/orb/boot.ts`). To connect the agents:

1. **Store the IDs with the niche copy.** In `src/data/niches.ts`, add `agentId: string;` to the `Niche` interface, then add an ID to each niche:

   ```ts
   { slug: 'hotels',  /* … */ agentId: '<HOTELS_AGENT_ID>'  },
   { slug: 'clinics', /* … */ agentId: '<CLINICS_AGENT_ID>' },
   { slug: 'dental',  /* … */ agentId: '<DENTAL_AGENT_ID>'  },
   ```

2. **Start the session from the talk button** instead of the simulated states. This sketch uses the same SDK as the current site:

   ```ts
   const { Conversation } = await import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm');
   const conversation = await Conversation.startSession({
     agentId,                                   // from niches.ts, passed to the page as a data attribute
     connectionType: 'webrtc',
     dynamicVariables: { mode: 'demo', /* the other 9, as in 4a */ },
     overrides: { agent: { firstMessage: greeting } },   // a greeting from first-messages.md
     clientTools,                               // only the website tools this page actually has
     onModeChange: ({ mode }) => stage.setState(mode === 'speaking' ? 'speaking' : 'listening'),
     onDisconnect: () => stage.setState('idle'),
   });
   stage.setAmpSource(() => conversation.getOutputVolume());
   ```

   The new pages don't have the profile, pricing or demo-form sections yet. Pass only the tools the page supports. The prompt tells Amariya to stop using website tools as soon as one returns an error, so she carries on by voice and points visitors to the "Apply for a founding licence" button.

3. **Allowlist.** Add the production and preview hosts to each master agent's allowlist (section 2, step 6).

---

## 5. Knowledge base

**Master agents:** no knowledge base. Everything a prospect needs is in the prompt.

**Client copies:**

1. Send the client the niche's `knowledge-base.md` and fill it in together during onboarding. It is part of the done-for-you setup.
2. Delete the guidance lines and any section that doesn't apply. Keep the section headings. Every price needs a currency, and every rule needs exact wording.
3. In the client agent, go to Knowledge base → Add document. Upload the file (Markdown, text, PDF or DOCX), or paste it as text.
4. Turn on RAG if the document is longer than a few pages. RAG keeps latency down by sending only the relevant parts to the model. Short documents can stay fully in context.
5. Write the document in the business's main language. Amariya translates for callers.
6. When anything changes (prices, hours, policies), update the document and re-upload it. Put the review date at the top. The clinical sections of the clinics and dental templates must be signed off by the client's clinical lead.

---

## 6. Website client tools (exact JSON)

These match the tools the website registers in `app.js` (`clientTools`, exposed as `window.ariaTools`). Register the same 7 on all three master agents. The site answers to both `update_hotel_profile` and `update_business_profile`. Register only `update_business_profile`, which is the neutral name the prompts use.

Settings for all 7:

| Setting | Value |
|---|---|
| Wait for response | on (the agent needs the result: ROI figures, missing fields, errors) |
| Pre-tool speech | off (they're instant and nobody needs a "one moment") |
| Interruptions | allow |
| Execution mode | immediate |

| Tool | Response timeout | What it does on the page |
|---|---|---|
| `navigate_to_section` | 5 s | scrolls to welcome, profile, features, pricing or demo |
| `update_business_profile` | 5 s | types the details into the profile form; returns what was updated plus an ROI summary |
| `get_roi_estimate` | 10 s | waits for typing to finish, flashes the ROI card, returns the estimate with a pre-rounded spoken figure |
| `highlight_feature` | 5 s | scrolls to features and spotlights one |
| `recommend_plan` | 5 s | marks a plan as recommended, shows the reason and preselects it in the demo form |
| `fill_demo_form` | 5 s | fills the demo/call request form; returns the fields still missing (name, business name, valid email) |
| `submit_demo_request` | 15 s | submits the form (saved locally and posted to `FORM_WEBHOOK_URL`); refuses if required fields are missing |

If the dashboard tool form has a JSON view, paste each block into it. Otherwise copy the fields across. The `parameters` object is the parameter list.

```json
{
  "type": "client",
  "name": "navigate_to_section",
  "description": "Demo mode only. Scroll the website to a section so the visitor sees what you are talking about.",
  "expects_response": true,
  "response_timeout_secs": 5,
  "pre_tool_speech": "off",
  "parameters": {
    "type": "object",
    "properties": {
      "section": {
        "type": "string",
        "enum": ["welcome", "profile", "features", "pricing", "demo"],
        "description": "welcome = intro, profile = the visitor's business details and ROI estimate, features = what Amariya does, pricing = plans, demo = the request-a-call form."
      }
    },
    "required": ["section"]
  }
}
```

```json
{
  "type": "client",
  "name": "update_business_profile",
  "description": "Demo mode only. Fill in the visitor's business details on the page as soon as you learn each one. Send only the fields you learned. Returns which fields were updated and an ROI summary.",
  "expects_response": true,
  "response_timeout_secs": 5,
  "pre_tool_speech": "off",
  "parameters": {
    "type": "object",
    "properties": {
      "hotel_name": { "type": "string", "description": "Name of the visitor's business: the hotel, restaurant, clinic or dental practice." },
      "hotel_type": { "type": "string", "description": "Type of business in the page's wording, e.g. 'Boutique hotel', 'Resort', 'Med spa / aesthetics clinic', 'Dermatology clinic', 'General dentistry', 'Orthodontics'." },
      "rooms": { "type": "number", "description": "Size of the business: hotel rooms; for clinics, the number of practitioners; for dental practices, the number of dental chairs. Leave out for a restaurant without rooms." },
      "monthly_calls": { "type": "number", "description": "Roughly how many phone calls the business gets per month. A guess is fine." },
      "languages": { "type": "string", "description": "Languages their guests or patients speak, comma-separated." },
      "pain_points": { "type": "string", "description": "Their biggest front-desk or phone problem, in their own words, short." }
    },
    "required": []
  }
}
```

```json
{
  "type": "client",
  "name": "get_roi_estimate",
  "description": "Demo mode only. Show and return the estimated monthly impact for the visitor's business. Use after you know the size or monthly calls. Use the exact figures and spoken form it returns.",
  "expects_response": true,
  "response_timeout_secs": 10,
  "pre_tool_speech": "off"
}
```

```json
{
  "type": "client",
  "name": "highlight_feature",
  "description": "Demo mode only. Scroll to the features section and spotlight one feature that matches the visitor's problem.",
  "expects_response": true,
  "response_timeout_secs": 5,
  "pre_tool_speech": "off",
  "parameters": {
    "type": "object",
    "properties": {
      "feature": {
        "type": "string",
        "enum": ["answering", "bookings", "multilingual", "guest_requests", "upsells", "integrations"],
        "description": "answering = 24/7 call answering; bookings = rooms and tables, consultations, or appointments; multilingual = 30+ languages; guest_requests = guest requests (hotels), patient questions (clinics), urgent calls (dental); upsells = upsells (hotels), rebooking and packages (clinics), recalls and rebooking (dental); integrations = PMS, clinic or practice software."
      }
    },
    "required": ["feature"]
  }
}
```

```json
{
  "type": "client",
  "name": "recommend_plan",
  "description": "Demo mode only. Scroll to pricing and mark one monthly plan as recommended, with a one-sentence reason shown on the page.",
  "expects_response": true,
  "response_timeout_secs": 5,
  "pre_tool_speech": "off",
  "parameters": {
    "type": "object",
    "properties": {
      "plan": { "type": "string", "enum": ["starter", "professional", "enterprise"], "description": "The plan to recommend." },
      "reason": { "type": "string", "description": "One short sentence explaining why this plan fits them." }
    },
    "required": ["plan"]
  }
}
```

```json
{
  "type": "client",
  "name": "fill_demo_form",
  "description": "Demo mode only. Fill the request-a-call form as you learn each detail. Returns which required fields are still missing (name, business name, a valid email).",
  "expects_response": true,
  "response_timeout_secs": 5,
  "pre_tool_speech": "off",
  "parameters": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "The visitor's full name." },
      "hotel_name": { "type": "string", "description": "Their business name (hotel, restaurant, clinic or practice)." },
      "email": { "type": "string", "description": "Their email address, exactly as confirmed." },
      "phone": { "type": "string", "description": "Their phone number, optional." },
      "preferred_time": { "type": "string", "description": "When they would like the 20-minute call, e.g. 'Thursday afternoon'." },
      "plan": { "type": "string", "enum": ["starter", "professional", "enterprise"], "description": "Plan of interest. Use professional for founders' licence interest." },
      "notes": { "type": "string", "description": "Short notes for the team, starting with \"Founders' licence: <niche>\" when relevant, then size, systems, languages and main problem." }
    },
    "required": []
  }
}
```

```json
{
  "type": "client",
  "name": "submit_demo_request",
  "description": "Demo mode only. Submit the request-a-call form. Call only after reading the details back and getting a clear yes. Returns an error listing missing fields if the form is incomplete.",
  "expects_response": true,
  "response_timeout_secs": 15,
  "pre_tool_speech": "off"
}
```

You can test each tool from the browser console on the website: `ariaTools.highlight_feature({ feature: "bookings" })`.

---

## 7. Production setup for each client

Do this for every client as part of the done-for-you setup.

1. **Duplicate** the niche master and name it "Amariya – {Niche} – {Client name}". Remove the 7 website client tools from the copy. Phone calls have no web page to answer them, and the prompt already limits them to demo mode, so removing them avoids a wasted call if the model reaches for one.
2. **Knowledge base:** attach the client's filled-in document (section 5).
3. **Phone number:** in the Phone numbers area, import the client's number (Twilio or SIP trunk) and assign it to the client agent. The client either forwards their existing line to it or gives it out.
4. **Conversation-initiation webhook:** this supplies the 10 variables on every call.
   - In the workspace's Agents settings, set the webhook URL. Then, in the client agent's Security tab, turn on fetching initiation data for inbound calls.
   - When a call comes in, ElevenLabs sends `caller_id`, `agent_id`, `called_number` and `call_sid`. The endpoint looks the client up by `agent_id` or `called_number`, works out the local time, whether staff are on duty and the greeting, and must answer fast. A small serverless function next to the planned HubSpot routes is enough.
   - Example response:

   ```json
   {
     "type": "conversation_initiation_client_data",
     "dynamic_variables": {
       "mode": "production",
       "business_name": "The Harbour House",
       "business_type": "Boutique hotel, 42 rooms, with the Olive restaurant (60 seats)",
       "business_profile": "14 Marine Parade, Brighton. Front desk 24 hours. Olive restaurant open Tuesday to Sunday, 6 pm to 10 pm. Check-in 3 pm, check-out 11 am. Parking 18 pounds a night, book ahead.",
       "local_datetime": "Friday 16 October 2026 at 21:40",
       "time_of_day": "evening",
       "staff_available": "yes",
       "booking_integration": "live",
       "emergency_number": "999",
       "caller_phone": "+44 7700 900123"
     },
     "conversation_config_override": {
       "agent": {
         "first_message": "Thank you for calling The Harbour House, good evening. This is Amariya, the AI receptionist. How can I help you?",
         "language": "en"
       }
     }
   }
   ```

   The `conversation_config_override` block is optional. It lets the webhook pick the greeting by time of day from `first-messages.md` and set the default language. Enable the First message and Language overrides on the client agent if you use it.

5. **Transfers:** add the `transfer_to_number` system tool with the client's numbers. Use conference (warm) transfers so the colleague hears Amariya's one-line summary first. One rule per destination, each with a condition:

   | Niche | Destination | Condition |
   |---|---|---|
   | Hotels | Front desk | caller asks for a person; urgent problem at the property; anything the prompt says to transfer |
   | Hotels | Reservations | group bookings, corporate rates, complex or disputed bookings |
   | Hotels | Restaurant | large parties, private dining, detailed allergy questions |
   | Hotels | Duty manager | complaints, billing disputes, compensation or policy exceptions |
   | Clinics | Reception | caller asks for a person; booking problems |
   | Clinics | Clinical or on-call line | urgent concern after a treatment; clinical question the caller wants answered today |
   | Clinics | Practice manager or billing | complaints, deposit or fee disputes, refund requests |
   | Dental | Reception | caller asks for a person; booking or insurance problems |
   | Dental | Dental team or on-call dentist | same-day urgent problems while the practice is open; after-hours on-call if the practice has one |
   | Dental | Practice manager or billing | complaints, fee or insurance disputes |

   Never add a transfer rule to a number the client hasn't approved for live calls. When `staff_available` is `no`, Amariya takes a message instead.

6. **Production tools (server tools):** these connect Amariya to the client's systems. Build them as webhook tools during setup. Until a client's systems are connected, send `booking_integration: "request_only"`. Amariya then takes every booking as a request with `take_message`, so only `take_message` and `send_text_message` are needed on day one.
   - Every tool sends `{{system__agent_id}}` in a header (for example `X-Amariya-Agent`) so the endpoint knows which client it is.
   - Store the endpoint's secret in the ElevenLabs secrets store and reference it in the Authorization header. Never put it in the prompt.
   - Timeouts: 10 s for lookups, 15 s for bookings.
   - Pre-tool speech: auto.
   - Interruptions on the `book_` and `cancel_` tools: "disable during tool", so a booking isn't cut off half-way.

   Each tool should return short JSON with plain words, for example:
   - `{"status": "confirmed", "confirmation_code": "HB7K2Q", "payment_link_required": false}`
   - `{"status": "failed", "reason": "room no longer available"}`

   The prompt only says "booked" when `status` is `confirmed`.

   **Hotels & restaurants** (request body schemas):

   ```json
   {
     "check_room_availability": {
       "type": "object",
       "properties": {
         "check_in": { "type": "string", "description": "Arrival date, YYYY-MM-DD." },
         "check_out": { "type": "string", "description": "Departure date, YYYY-MM-DD." },
         "adults": { "type": "integer", "description": "Number of adults." },
         "children": { "type": "integer", "description": "Number of children, 0 if none." },
         "children_ages": { "type": "string", "description": "Ages, comma-separated, only if the knowledge base says rates depend on age." },
         "room_preference": { "type": "string", "description": "Room type, bed or view the caller asked for, if any." },
         "accessible_room": { "type": "boolean", "description": "True if the caller needs an accessible room." }
       },
       "required": ["check_in", "check_out", "adults"]
     },
     "book_room": {
       "type": "object",
       "properties": {
         "option_id": { "type": "string", "description": "The option_id returned by check_room_availability." },
         "check_in": { "type": "string" },
         "check_out": { "type": "string" },
         "adults": { "type": "integer" },
         "children": { "type": "integer" },
         "first_name": { "type": "string" },
         "last_name": { "type": "string", "description": "As spelled by the caller." },
         "phone": { "type": "string", "description": "Mobile number in international format." },
         "email": { "type": "string" },
         "arrival_time": { "type": "string", "description": "Estimated arrival, HH:MM." },
         "special_requests": { "type": "string" }
       },
       "required": ["option_id", "check_in", "check_out", "adults", "first_name", "last_name", "phone"]
     },
     "check_table_availability": {
       "type": "object",
       "properties": {
         "date": { "type": "string", "description": "YYYY-MM-DD." },
         "time": { "type": "string", "description": "HH:MM, 24-hour." },
         "party_size": { "type": "integer" },
         "area": { "type": "string", "description": "Seating preference if asked, e.g. terrace." }
       },
       "required": ["date", "time", "party_size"]
     },
     "book_table": {
       "type": "object",
       "properties": {
         "date": { "type": "string" },
         "time": { "type": "string" },
         "party_size": { "type": "integer" },
         "name": { "type": "string" },
         "phone": { "type": "string" },
         "email": { "type": "string" },
         "notes": { "type": "string", "description": "Allergies, dietary needs, accessibility, occasion, exactly as the caller said." }
       },
       "required": ["date", "time", "party_size", "name", "phone"]
     },
     "find_reservation": {
       "type": "object",
       "properties": {
         "reservation_type": { "type": "string", "enum": ["room", "table"] },
         "confirmation_code": { "type": "string" },
         "last_name": { "type": "string" },
         "date": { "type": "string", "description": "Arrival or reservation date, YYYY-MM-DD." }
       },
       "required": ["reservation_type"]
     },
     "change_reservation": {
       "type": "object",
       "properties": {
         "reservation_id": { "type": "string" },
         "reservation_type": { "type": "string", "enum": ["room", "table"] },
         "new_check_in": { "type": "string" },
         "new_check_out": { "type": "string" },
         "new_option_id": { "type": "string" },
         "new_date": { "type": "string" },
         "new_time": { "type": "string" },
         "new_party_size": { "type": "integer" },
         "notes": { "type": "string" }
       },
       "required": ["reservation_id", "reservation_type"]
     },
     "cancel_reservation": {
       "type": "object",
       "properties": {
         "reservation_id": { "type": "string" },
         "reservation_type": { "type": "string", "enum": ["room", "table"] },
         "reason": { "type": "string" }
       },
       "required": ["reservation_id", "reservation_type"]
     },
     "send_text_message": {
       "type": "object",
       "properties": {
         "phone": { "type": "string" },
         "purpose": { "type": "string", "enum": ["booking_confirmation", "payment_link", "directions", "menu", "booking_link"] },
         "reference": { "type": "string", "description": "Confirmation code or reservation id, if any." }
       },
       "required": ["phone", "purpose"]
     },
     "take_message": {
       "type": "object",
       "properties": {
         "caller_name": { "type": "string" },
         "phone": { "type": "string" },
         "team": { "type": "string", "enum": ["front_desk", "reservations", "restaurant", "events", "housekeeping", "maintenance", "concierge", "manager"] },
         "category": { "type": "string", "enum": ["booking_request", "guest_request", "callback", "complaint", "billing", "lost_property", "message_for_guest", "other"] },
         "urgency": { "type": "string", "enum": ["routine", "today", "urgent"] },
         "summary": { "type": "string", "description": "One or two sentences with every detail the team needs." },
         "room_number": { "type": "string" },
         "best_time_to_call": { "type": "string" },
         "caller_language": { "type": "string" }
       },
       "required": ["caller_name", "phone", "team", "category", "urgency", "summary"]
     }
   }
   ```

   **Clinics** and **dental** use the same tool names. Create them separately for each niche, because the enum values differ.

   ```json
   {
     "check_availability": {
       "type": "object",
       "properties": {
         "appointment_type": { "type": "string", "description": "The appointment or treatment name exactly as written in the knowledge base." },
         "practitioner": { "type": "string", "description": "Preferred clinician, if any." },
         "location": { "type": "string", "description": "Preferred location, if the business has several." },
         "date_from": { "type": "string", "description": "Earliest date, YYYY-MM-DD." },
         "date_to": { "type": "string", "description": "Latest date, YYYY-MM-DD." },
         "time_preference": { "type": "string", "enum": ["any", "morning", "afternoon", "evening"] },
         "urgent": { "type": "boolean", "description": "Dental: true to search urgent slots." }
       },
       "required": ["appointment_type", "date_from"]
     },
     "book_appointment": {
       "type": "object",
       "properties": {
         "slot_id": { "type": "string", "description": "The slot_id returned by check_availability." },
         "appointment_type": { "type": "string" },
         "first_name": { "type": "string" },
         "last_name": { "type": "string" },
         "date_of_birth": { "type": "string", "description": "YYYY-MM-DD." },
         "phone": { "type": "string" },
         "email": { "type": "string" },
         "new_patient": { "type": "boolean" },
         "booked_by": { "type": "string", "description": "If someone books for another person, e.g. 'mother, Sarah Khan'." },
         "notes": { "type": "string", "description": "Short and non-clinical, e.g. 'nervous patient', 'needs step-free access'." },
         "insurance_provider": { "type": "string", "description": "Dental, only if the practice verifies insurance before visits." },
         "insurance_member_id": { "type": "string", "description": "Dental, only if the practice verifies insurance before visits." },
         "insurance_policy_holder": { "type": "string", "description": "Name and date of birth of the policy holder, if not the patient." }
       },
       "required": ["slot_id", "appointment_type", "first_name", "last_name", "date_of_birth", "phone"]
     },
     "find_appointment": {
       "type": "object",
       "properties": {
         "last_name": { "type": "string" },
         "date_of_birth": { "type": "string", "description": "YYYY-MM-DD. The endpoint only returns appointments when last name and date of birth match a patient." },
         "appointment_date": { "type": "string", "description": "YYYY-MM-DD, if the caller gave it." }
       },
       "required": ["last_name", "date_of_birth"]
     },
     "reschedule_appointment": {
       "type": "object",
       "properties": {
         "appointment_id": { "type": "string" },
         "new_slot_id": { "type": "string" }
       },
       "required": ["appointment_id", "new_slot_id"]
     },
     "cancel_appointment": {
       "type": "object",
       "properties": {
         "appointment_id": { "type": "string" },
         "reason": { "type": "string", "description": "Short and non-clinical." }
       },
       "required": ["appointment_id"]
     },
     "send_text_message": {
       "type": "object",
       "properties": {
         "phone": { "type": "string" },
         "purpose": {
           "type": "string",
           "enum": ["appointment_confirmation", "deposit_link", "intake_form", "directions", "price_list"],
           "description": "Dental uses: appointment_confirmation, new_patient_forms, payment_link, directions, insurance_form."
         },
         "reference": { "type": "string", "description": "Appointment id, if any." }
       },
       "required": ["phone", "purpose"]
     },
     "take_message": {
       "type": "object",
       "properties": {
         "caller_name": { "type": "string" },
         "phone": { "type": "string" },
         "date_of_birth": { "type": "string" },
         "team": {
           "type": "string",
           "enum": ["reception", "clinical_team", "billing", "manager"],
           "description": "Dental uses: reception, dental_team, billing, manager."
         },
         "category": {
           "type": "string",
           "enum": ["booking_request", "callback", "clinical_question", "post_treatment_concern", "prescription_request", "results", "complaint", "billing", "other"],
           "description": "Dental uses: booking_request, callback, urgent_dental, clinical_question, insurance, billing, complaint, other."
         },
         "urgency": { "type": "string", "enum": ["routine", "today", "urgent"] },
         "summary": { "type": "string", "description": "Minimal: what they need, without health details beyond what the team needs to act." },
         "best_time_to_call": { "type": "string" },
         "caller_language": { "type": "string" }
       },
       "required": ["caller_name", "phone", "team", "category", "urgency", "summary"]
     }
   }
   ```

   For dental, replace the enum lists with the values in each description.
7. **Security tab (client copies):**
   - Turn authentication on and leave the allowlist empty. Client agents answer the phone only, and nobody should be able to start a web session with their ID.
   - Enable only the overrides the webhook uses.
8. **Language:** set the agent language to the client's main language. Add every language their callers use (section 8).
9. **Conversation flow:** use the production column in section 9. The founders' licence includes 500 minutes a month, so the maximum call duration protects the allowance.
10. **Privacy (clinics and dental):** decide on retention and recording before go-live (see "Decisions" at the end).
11. **Test:** run the niche's `test-scenarios.md` against the client copy with real phone calls, and fix anything in the knowledge base. Then forward the client's line. The 7-day guarantee clock is running, so keep a checklist.

---

## 8. Language settings

- **Default language:**
  - masters: English
  - client copies: the client's main language
- **Additional languages:** add all the languages the client's callers speak. Add every available language to the three masters, so prospects can test any of them.

  Language detection can only switch to languages added here. The founders' licence includes Professional features, so 30+ languages are available.
- **System tool:** `language_detection`, with the description left blank. It switches language when the caller speaks another language or asks for one.
- **First message per language:** when you add a language, the dashboard lets you set the first message for it. Use the translations in each `first-messages.md`. They are spoken when a conversation starts in that language, for example when the webhook sets `"language": "es"` for a Spanish-language client. A caller who switches mid-call is handled by `language_detection`.
- **Knowledge base:** one language (the business's). Amariya translates.
- **Keywords (Advanced tab):** add the business name, room and treatment names, practitioner names, and system names such as Mews or Invisalign. This helps speech recognition with unusual words.

---

## 9. Turn-taking and latency

| Setting | Hotels & restaurants | Clinics | Dental | Why |
|---|---|---|---|---|
| Take turn after silence (turn timeout) | 7 s | 8 s | 8 s | Callers check diaries, look for confirmation codes and spell names. |
| Turn eagerness | Normal | Patient | Patient | Patients are often older, nervous or in pain, and they read out dates of birth and insurance numbers. |
| Interruptions | On | On | On | Callers correct details mid-sentence. |
| Soft timeout | 3 s, LLM-generated filler on | same | same | A short "one moment" instead of silence while the model or a tool works. |
| Max conversation duration, masters (demo) | 900 s | 900 s | 900 s | Enough for a guided tour plus a role-play. |
| Max conversation duration, client copies | 600 s | 600 s | 600 s | Protects the 500-minute allowance. Longer calls are rare, and the prompt hands them to the team. |

Latency checklist:

- The website already connects over WebRTC, which is the lowest-latency option.
- Pick a fast LLM. Test time to first word on a real phone line, not just in the browser. If it's regularly over about 1.5 seconds, try Flash v2.5 on the client copy (and remove the audio tags).
- Use RAG on long knowledge bases. Keep `business_profile` under about 1,500 characters.
- Keep server-tool endpoints fast (under 2 seconds). Pre-tool speech on "auto" covers slower lookups.
- Keep the conversation-initiation webhook well under a second. It runs while the phone rings.

---

## 10. Analysis: evaluation criteria and data collection

Add these on each agent's Analysis tab.

**Evaluation criteria** (each is scored success or failure on every conversation):

| Name | Prompt |
|---|---|
| `ai_disclosed` | The agent said it was an AI at the start or when asked, and never claimed or implied it was human. |
| `no_invented_facts` | Every price, availability, policy, hour and discount the agent stated came from the knowledge base, the business profile or a tool result, or was clearly labelled as a demo sample. |
| `confirmed_before_action` | Before any booking, change, cancellation or form submission, the agent read the details back and got a clear yes. |
| `correct_escalation` | Emergencies were sent to emergency services, urgent issues were transferred or logged as urgent, and nothing was promised that needs a person's approval. |
| `no_clinical_advice` (clinics and dental only) | The agent gave no medical or dental advice: no diagnosis, no judgement of symptoms, no medicine or treatment recommendations, no suitability or safety claims, beyond reading text the knowledge base marks as read verbatim. |
| `privacy_respected` | The agent shared no information about another guest or patient, and checked identity before discussing or changing an existing booking. |

**Data collection:**

| Field | Type | Description |
|---|---|---|
| `call_intent` | string | Main reason for the call, e.g. room booking, table, consultation, urgent toothache, question, complaint, wrong number, demo. |
| `outcome` | string | booked, request taken, transferred, message taken, answered, emergency redirected, no action. |
| `caller_language` | string | The language the conversation mostly used. |
| `booking_reference` | string | Confirmation code or appointment id, if any. |
| `lead_business_name` | string | Demo: the prospect's business name. |
| `lead_email` | string | Demo: the prospect's email, if given. |
| `founders_interest` | boolean | Demo: did the prospect show interest in the founders' licence? |
| `role_play_done` | boolean | Demo: did the agent run a role-play call? |

A post-call webhook can push the demo fields into HubSpot next to the application data.

---

## 11. How to test

1. **In the dashboard:** use the agent's test button with the demo placeholders, then switch the placeholders to the production set and test again. Run the conversations in the niche's `test-scenarios.md`.
2. **Tests tab:** recreate each scenario as an ElevenLabs test so you can rerun them all after every prompt change:
   - simulation tests: paste the caller script as the simulated user's instructions and the "Pass if" lines as success criteria
   - tool-call tests: for the confirm-before-booking rules
3. **Website, locally:** on the current site, run `python -m http.server 8080` in the repo root and open `http://localhost:8080/hotels/`. Check that:
   - the profile form fills in as you talk
   - the ROI figures are read out correctly
   - submitting the form needs your spoken yes

   For the Astro site, run `npm run dev` in `amariya/` and use `http://localhost:4321/hotels` (`localhost` must be on the allowlist).
4. **Phone (client copies):** call from a mobile, from a withheld number and from abroad. Test with background noise, in a second language, and by interrupting mid-read-back.
5. **Review:** after the first 20 real calls, read the transcripts with the evaluation results. Fix knowledge-base gaps first. Change the prompt only for patterns, not one-off calls.

---

## Decisions the owner must make

1. **Voices and model:** confirm the voice for each niche. Choose v3 conversational (expressive, slower) or Flash v2.5 (faster) for phone lines after a latency test, and pick the LLM.
2. **Home page agent:** keep the existing Sales Guide on `/`, or point it at one of the new agents.
3. **AI disclosure and recording notice:** the production greetings say "AI receptionist" up front. That's recommended because EU AI Act transparency rules apply from August 2026, and several US states have their own rules. Decide whether greetings also say calls are recorded. ElevenLabs keeps audio and transcripts unless retention is changed, and some places require consent.
4. **Health data (clinics and dental):** before the first clinic or dental client goes live, check:
   - whether you need a business associate agreement (US) or a data processing agreement (UK and EU) with ElevenLabs and the LLM provider
   - data residency
   - retention periods or zero-retention mode
   - whether to record clinical calls at all
5. **Transfers, per client:** which numbers, warm or blind, who covers nights and weekends, and what "staff available" means hour by hour.
6. **Deposit policy, per clinic:**
   - the amount
   - whether it's taken off the treatment price
   - whether it's refundable
   - the payment deadline before a slot is released
   - which payment provider creates the links
7. **Text messages:** the SMS provider and sender name for `send_text_message`, and the exact wording of each text template.
8. **Booking integrations, per client:** which systems connect at launch (`live`) and which start as `request_only`. Also what callback time the team commits to for requests.
9. **Emergency and crisis numbers** per client country. Clinics also need an after-hours urgent route that the clinical lead approves.
10. **Founders' licence terms:** the prompts state these as current, so confirm them:
    - the prices (provisional)
    - "one location per licence"
    - "unused minutes don't roll over"
    - "about 200 typical calls"
    - what counts as "live" for the 7-day refund
11. **Domains:** buy and allowlist `amariya.ai` and `heyamariya.com`, or update the allowlist to the domains you actually use.
12. **Who approves exceptions:** the duty manager or practice manager each client names for refunds, compensation and policy exceptions. Amariya never approves them herself.
