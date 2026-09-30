// Site configuration — edit these values.
window.SITE_CONFIG = {
  // The product name shown across the site. The voice agent's own name is set in ElevenLabs.
  BRAND: "Amariya",

  // Your ElevenLabs agent ID (ElevenLabs dashboard → Agents → your agent → "Agent ID").
  // The agent must be public (authentication off) for the browser to connect directly.
  AGENT_ID: "agent_9101m3n1hwxffey830jzf43chj6x",

  // Optional: a URL that receives demo requests as JSON (Zapier, Make, n8n, your own API…).
  // Leave empty to only save requests in the browser (localStorage) and the console.
  FORM_WEBHOOK_URL: "",

  // Default assumptions for the ROI estimate. Each industry page overrides them
  // (see industries/<page>.json → page.roi).
  ROI: {
    missedCallRate: 0.25,     // share of calls a busy front desk misses today
    bookingConversion: 0.3,   // share of recovered calls that turn into bookings
    avgBookingValue: 220,     // average booking value (USD)
    minutesPerCall: 4,        // staff minutes per call handled by the AI
  },
};
