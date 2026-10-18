# Clinics: first messages

Every first message says that Amariya is an AI. The prompt relies on this, so it never repeats the greeting. For clinics, it also matters before callers share anything about their health.

**Where each message comes from:**

- **Production calls:**
  - The agent's First message field (section 1) is the default.
  - The conversation-initiation webhook can replace it on each call with a greeting from section 2, based on the clinic's opening hours. Send it as `conversation_config_override.agent.first_message` (see the README, section 7).
  - Put the real clinic name in place of `{{business_name}}` before sending. `{{emergency_number}}` can be filled in the same way.
- **Website (demo):** the page replaces the first message on every visit.
  - On the current site, it picks from `page.greetings` in `industries/aesthetics.json` (section 3).
  - On the new Astro site (`/clinics`), pass the greeting as `overrides.agent.firstMessage`.

**Tokens:**

- `{{...}}`: ElevenLabs dynamic variables.
- `{brand}` and `{part}`: website tokens.
- Words in square brackets are v3 audio tags. Remove them if the agent uses Flash v2.5.

---

## 1. Dashboard first message

Paste this into the agent's First message field:

```text
Thank you for calling {{business_name}}, good {{time_of_day}}. This is Amariya, the clinic's AI receptionist. How can I help you today?
```

---

## 2. Production greetings (for the webhook)

| When | First message |
|---|---|
| Open, 05:00–11:59 | `Good morning, {{business_name}}. This is Amariya, the clinic's AI receptionist. How can I help you today?` |
| Open, 12:00–17:59 | `Good afternoon, thank you for calling {{business_name}}. I'm Amariya, the clinic's AI receptionist. How can I help?` |
| Open, 18:00 or later | `Good evening, {{business_name}}. This is Amariya, the clinic's AI receptionist. How can I help you this evening?` |
| Open, but the team is with patients (`staff_available` is `no`) | `Thank you for calling {{business_name}}. This is Amariya, the clinic's AI receptionist. The team is with patients right now, but I can book appointments, answer questions and take a message. How can I help?` |
| Closed (evenings, weekends, holidays) | `Thank you for calling {{business_name}}. This is Amariya, the clinic's AI receptionist. The clinic is closed right now, but I can book appointments, answer questions and take messages for the team. If this is a medical emergency, please hang up and call {{emergency_number}}. How can I help?` |

Variants for particular clinics:

| Use when | First message |
|---|---|
| Aesthetics clinic or med spa | `Thank you for calling {{business_name}}, good {{time_of_day}}. I'm Amariya, the clinic's AI receptionist. Are you calling to book a consultation, or about an existing appointment?` |
| Calls are recorded (if the owner decides to say so) | `Thank you for calling {{business_name}}. This is Amariya, the clinic's AI receptionist. Calls may be recorded so we can look after you properly. How can I help?` |
| Medical practice with a separate urgent line | `Thank you for calling {{business_name}}. This is Amariya, the practice's AI receptionist. If you need urgent medical help, please hang up and call {{emergency_number}}. Otherwise, how can I help you today?` |

---

## 3. Website greetings (demo)

These are ready to paste over `page.greetings` in `industries/aesthetics.json`. On the new site, they also work for `/clinics`, which covers every type of clinic.

```json
"greetings": {
  "evening": "Good evening... [warmly] thanks for stopping by this late. I'm {brand}, an AI receptionist for clinics, and I'll show you around. So, what's your clinic called?",
  "returning": [
    "Oh, welcome back! [warmly] It's {brand}, your AI guide, again. Remind me, what's the name of your clinic?",
    "Hey, you're back! [laughs softly] {brand} here, the AI receptionist. Shall we pick up where we left off? What's your clinic called?"
  ],
  "fresh": [
    "Good {part}! [warmly] I'm {brand}, an AI receptionist for clinics. I'll show you around, and if you like, I'll answer a patient call for your clinic so you can hear me at work. What's it called?",
    "Hi, lovely to meet you. [warmly] I'm {brand}, the AI receptionist who answers the phone for clinics, and leaves every clinical question to your team. What's the name of your clinic?",
    "Hello, and good {part}! I'm {brand}, an AI receptionist for clinics. [curious] Tell me a little about your clinic, and I'll show you how I'd answer its phone. What's it called?"
  ]
}
```

On the new Astro site, use the same lines with "Amariya" in place of `{brand}` and the visitor's part of the day in place of `{part}`.

---

## 4. Translated first messages (language presets)

When you add a language in the dashboard, set its first message from this list. It's used when a conversation starts in that language. A caller who switches language mid-call is handled by `language_detection`. Ask a native speaker to check these before go-live.

| Language | First message |
|---|---|
| Arabic (`ar`) | `شكراً لاتصالك بـ {{business_name}}. معك أماريا، موظفة الاستقبال الافتراضية بالذكاء الاصطناعي. كيف يمكنني مساعدتك؟` |
| Russian (`ru`) | `Спасибо за звонок в {{business_name}}. С вами Амария, виртуальный администратор с искусственным интеллектом. Чем могу помочь?` |
| Spanish (`es`) | `Gracias por llamar a {{business_name}}. Le atiende Amariya, la recepcionista virtual con inteligencia artificial. ¿En qué puedo ayudarle?` |
| French (`fr`) | `Merci d'avoir appelé {{business_name}}. Ici Amariya, la réceptionniste IA de la clinique. Comment puis-je vous aider ?` |
| German (`de`) | `Vielen Dank für Ihren Anruf bei {{business_name}}. Hier ist Amariya, die KI-Rezeptionistin der Klinik. Wie kann ich Ihnen helfen?` |
