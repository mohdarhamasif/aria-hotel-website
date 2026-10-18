# Hotels & restaurants: first messages

Every first message says that Amariya is an AI. The prompt relies on this, so it never repeats the greeting.

**Where each message comes from:**

- **Production calls:**
  - The agent's First message field (section 1) is the default.
  - The conversation-initiation webhook can replace it on each call with a time-of-day greeting from section 2. Send it as `conversation_config_override.agent.first_message` (see the README, section 7).
  - Put the real business name in place of `{{business_name}}` before sending.
- **Website (demo):** the page replaces the first message on every visit.
  - On the current site, it picks from `page.greetings` in `industries/hotels.json` (section 3).
  - On the new Astro site, pass the greeting as `overrides.agent.firstMessage`.

**Tokens:**

- `{{...}}`: ElevenLabs dynamic variables, filled in by ElevenLabs.
- `{brand}` and `{part}`: website tokens, filled in by the site. `{brand}` becomes "Amariya", and `{part}` becomes morning, afternoon or evening.
- Words in square brackets, such as `[warmly]`, are v3 audio tags. Remove them if the agent uses Flash v2.5.

---

## 1. Dashboard first message

Paste this into the agent's First message field:

```text
Thank you for calling {{business_name}}, good {{time_of_day}}. This is Amariya, the AI receptionist. How can I help you?
```

---

## 2. Production greetings by time of day (for the webhook)

The webhook picks one using the business's local time and whether the team is on duty.

| When (local time) | Team on duty | First message |
|---|---|---|
| 05:00–11:59 | any | `Good morning, {{business_name}}. This is Amariya, the AI receptionist. How can I help you today?` |
| 12:00–17:59 | any | `Good afternoon, thank you for calling {{business_name}}. I'm Amariya, the AI receptionist. How can I help?` |
| 18:00–21:59 | any | `Good evening, {{business_name}}. This is Amariya, the AI receptionist. How can I help you this evening?` |
| 22:00–04:59 | yes (24-hour front desk) | `Good evening, you're through to {{business_name}}. This is Amariya, the AI receptionist. How can I help you tonight?` |
| 22:00–04:59 | no | `Thank you for calling {{business_name}}. This is Amariya, the AI receptionist. The team has finished for the night, but I can help with bookings and questions and pass anything else on first thing. How can I help?` |

Variants for particular businesses:

| Use when | First message |
|---|---|
| Restaurant only, open hours | `Thank you for calling {{business_name}}. This is Amariya, the restaurant's AI receptionist. Are you calling about a table?` |
| Restaurant only, closed | `Thank you for calling {{business_name}}. This is Amariya, the restaurant's AI receptionist. We're closed right now, but I can book a table or answer a question for you. How can I help?` |
| Calls are recorded (if the owner decides to say so) | `Thank you for calling {{business_name}}, good {{time_of_day}}. This is Amariya, the AI receptionist. Calls may be recorded so we can look after you properly. How can I help?` |
| Luxury property, more formal | `Good {{time_of_day}}, and welcome to {{business_name}}. My name is Amariya, the hotel's AI concierge. How may I help you?` |

---

## 3. Website greetings (demo)

These are ready to paste over `page.greetings` in `industries/hotels.json`. The site picks the `evening` line for some first-time evening visitors, a `returning` line for repeat visitors, and a `fresh` line otherwise.

```json
"greetings": {
  "evening": "Good evening... [warmly] thanks for stopping by this late. I'm {brand}, an AI receptionist for hotels and restaurants, and I'll show you around. So, what's your place called?",
  "returning": [
    "Oh, welcome back! [warmly] It's {brand}, your AI guide, again. Remind me, what's the name of your hotel or restaurant?",
    "Hey, you're back! [laughs softly] {brand} here, the AI receptionist. Shall we pick up where we left off? What's your place called?"
  ],
  "fresh": [
    "Good {part}! [warmly] I'm {brand}, an AI receptionist for hotels and restaurants. I'll show you around, and if you like, I'll answer a call for your business so you can hear me at work. What's it called?",
    "Hi, lovely to meet you. [warmly] I'm {brand}, the AI receptionist who answers the phone for hotels and restaurants, day and night. What's the name of your place?",
    "Hello, and good {part}! I'm {brand}, an AI receptionist. [curious] Tell me about your hotel or restaurant, and I'll show you how I'd answer its phone. What's it called?"
  ]
}
```

On the new Astro site, use the same lines with "Amariya" in place of `{brand}` and the visitor's part of the day in place of `{part}`.

---

## 4. Translated first messages (language presets)

When you add a language in the dashboard, set its first message from this list. It's used when a conversation starts in that language, for example when the webhook sets `"language": "es"` for a Spanish-speaking client. A caller who switches language mid-call is handled by `language_detection`.

These leave out the time of day, because `{{time_of_day}}` is always sent in English. Ask a native speaker to check them before go-live.

| Language | First message |
|---|---|
| Spanish (`es`) | `Gracias por llamar a {{business_name}}. Le atiende Amariya, la recepcionista virtual con inteligencia artificial. ¿En qué puedo ayudarle?` |
| French (`fr`) | `Merci d'avoir appelé {{business_name}}. Ici Amariya, la réceptionniste IA. Comment puis-je vous aider ?` |
| German (`de`) | `Vielen Dank für Ihren Anruf bei {{business_name}}. Hier ist Amariya, die KI-Rezeptionistin. Wie kann ich Ihnen helfen?` |
| Italian (`it`) | `Grazie per aver chiamato {{business_name}}. Sono Amariya, la receptionist virtuale con intelligenza artificiale. Come posso aiutarla?` |
| Portuguese (`pt`) | `Obrigada por ligar para {{business_name}}. Fala a Amariya, a recepcionista virtual com inteligência artificial. Em que posso ajudar?` |
| Arabic (`ar`) | `شكراً لاتصالك بـ {{business_name}}. معك أماريا، موظفة الاستقبال الافتراضية بالذكاء الاصطناعي. كيف يمكنني مساعدتك؟` |
| Chinese, Mandarin (`zh`) | `感谢致电{{business_name}}。我是Amariya，人工智能前台接待。请问有什么可以帮您？` |
