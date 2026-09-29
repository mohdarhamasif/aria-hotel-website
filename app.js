// Aria — voice-guided website powered by the ElevenLabs Agents SDK.
// The agent drives the page through "client tools" (see AGENT_SETUP.md).

const CONFIG = window.SITE_CONFIG || {};
const SECTIONS = ["welcome", "profile", "features", "pricing", "demo"];
const SECTION_LABELS = { welcome: "the intro", profile: "your hotel", features: "features", pricing: "plans", demo: "demo booking" };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const dock = $("#dock");
const panel = $("#panel");
const thread = $("#thread");
const statusEl = $("[data-status]");
const captionEl = $("[data-caption]");
const profileForm = $("#profileForm");
const demoForm = $("#demoForm");

let conversation = null;
let mode = "voice"; // "voice" | "text"
let muted = false;
let lastAgentScroll = 0;
let lastUserInput = 0;
let currentSection = "welcome";

$("[data-year]").textContent = new Date().getFullYear();

/* ---------- Small UI helpers ---------- */

const STATUS = {
  idle: "Aria is ready to talk",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Aria is speaking",
};

function setState(state) {
  dock.dataset.state = state;
  dock.dataset.mode = mode;
  document.body.dataset.state = state;
  statusEl.textContent =
    muted && state === "listening" ? "Mic muted" : mode === "text" && state === "listening" ? "Your turn" : STATUS[state];
  $("[data-orb-label]").textContent = state === "idle" ? "Tap to talk" : state === "connecting" ? "Connecting…" : "Tap to end";
  $("[data-live-only]").hidden = state === "idle" || state === "connecting";
  $("#muteBtn").hidden = mode === "text";
}

/** Tint the orb with the emotion of Aria's current line, e.g. [excited] or [softly]. */
const TONES = {
  excited: "bright", playfully: "bright", "laughs softly": "bright",
  softly: "soft", sighs: "soft", thoughtful: "soft",
  reassuring: "calm", warmly: "warm", curious: "warm",
};
function setTone(raw) {
  const tag = (String(raw).match(/\[([^\]]{1,32})\]/) || [])[1]?.toLowerCase();
  dock.dataset.tone = TONES[tag] || "warm";
  document.body.dataset.tone = dock.dataset.tone;
}

/** Strip ElevenLabs v3 audio tags like [warmly] from displayed text. */
const clean = (t) => String(t || "").replace(/\[[^\]]{1,32}\]\s*/g, "").replace(/\s{2,}/g, " ").trim();

function caption(text, who = "ai") {
  captionEl.classList.add("swap");
  setTimeout(() => {
    captionEl.textContent = text;
    captionEl.title = text;
    captionEl.classList.toggle("user", who === "user");
    captionEl.classList.remove("swap");
  }, 120);
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

function flash(el) {
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1400);
}

/* ---------- Conversation thread ---------- */

function openPanel(open = true) {
  panel.hidden = !open;
  dock.classList.toggle("expanded", open);
  const btn = $("#transcriptBtn");
  btn.setAttribute("aria-expanded", String(open));
  btn.setAttribute("aria-label", open ? "Hide conversation" : "Show conversation");
  if (open) thread.scrollTop = thread.scrollHeight;
}

function addMsg(role, text) {
  removeTyping();
  const li = document.createElement("li");
  li.className = `msg ${role}`;
  li.textContent = text;
  thread.append(li);
  thread.scrollTop = thread.scrollHeight;
}

function showTyping() {
  if ($(".msg.typing", thread)) return;
  const li = document.createElement("li");
  li.className = "msg ai typing";
  li.setAttribute("aria-label", "Aria is thinking");
  li.innerHTML = "<i></i><i></i><i></i>";
  thread.append(li);
  thread.scrollTop = thread.scrollHeight;
}
const removeTyping = () => $(".msg.typing", thread)?.remove();

function activity(text) {
  const li = document.createElement("li");
  li.className = "msg activity";
  li.textContent = text;
  const typing = $(".msg.typing", thread);
  typing ? thread.insertBefore(li, typing) : thread.append(li);
  thread.scrollTop = thread.scrollHeight;
}

/* ---------- Smooth, polite scrolling ---------- */

let cancelScroll = null;

// Track real visitor input so Aria doesn't yank the page while they're reading.
["wheel", "touchmove", "keydown", "pointerdown"].forEach((ev) =>
  addEventListener(ev, (e) => {
    if (e.target.closest?.("#dock, .sheet, .follow-pill")) return;
    lastUserInput = Date.now();
    cancelScroll?.();
  }, { passive: true })
);

function smoothScrollTo(el) {
  cancelScroll?.();
  const offset = $(".topbar").offsetHeight + 12;
  const target = Math.max(0, el.getBoundingClientRect().top + scrollY - offset);
  if (reducedMotion) return scrollTo({ top: target, behavior: "instant" });
  const start = scrollY;
  const dist = target - start;
  const dur = Math.min(1100, Math.max(500, Math.abs(dist) * 0.45));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const t0 = performance.now();
  let raf;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    scrollTo({ top: start + dist * ease(p), behavior: "instant" });
    if (p < 1) raf = requestAnimationFrame(step);
    else cancelScroll = null;
  };
  raf = requestAnimationFrame(step);
  cancelScroll = () => { cancelAnimationFrame(raf); cancelScroll = null; };
}

const pill = $("#followPill");
let pillTarget = null;

function goTo(section, fromAgent = false) {
  const el = document.getElementById(section);
  if (!el) return false;
  if (fromAgent) {
    lastAgentScroll = Date.now();
    // Visitor is actively scrolling or reading: offer to follow instead of hijacking the page.
    if (Date.now() - lastUserInput < 2500 && section !== currentSection) {
      pillTarget = section;
      $("b", pill).textContent = SECTION_LABELS[section] || section;
      pill.hidden = false;
      return true;
    }
  }
  pill.hidden = true;
  smoothScrollTo(el);
  history.replaceState(null, "", `#${section}`);
  return true;
}

pill.addEventListener("click", () => {
  pill.hidden = true;
  if (!pillTarget) return;
  lastAgentScroll = Date.now();
  smoothScrollTo(document.getElementById(pillTarget));
});

/* ---------- Step tracking & reveal ---------- */

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      if (id === currentSection) return;
      currentSection = id;
      if (id === pillTarget) pill.hidden = true;
      const idx = SECTIONS.indexOf(id);
      $$(".step").forEach((s, i) => {
        s.classList.toggle("active", i === idx);
        s.classList.toggle("done", i < idx);
        s.toggleAttribute("aria-current", i === idx);
      });
      // Only report navigation the visitor did themselves.
      if (Date.now() - lastAgentScroll > 1800) {
        contextUpdate(`The visitor scrolled to the "${id}" section of the website on their own.`);
      }
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
SECTIONS.forEach((id) => observer.observe(document.getElementById(id)));

const revealer = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    revealer.unobserve(e.target);
  }),
  { rootMargin: "0px 0px -8% 0px" }
);
$$(".section:not(.hero) .section-head, .section:not(.hero) .card").forEach((el) => {
  const cards = [...el.parentElement.children].filter((c) => c.classList.contains("card"));
  const i = cards.indexOf(el);
  if (i > 0) el.style.setProperty("--d", `${Math.min(i, 5) * 0.07}s`);
  el.classList.add("reveal");
  revealer.observe(el);
});

$$("[data-nav]").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    goTo(a.dataset.nav);
  })
);

/** Tell the agent what the visitor did on their own, without interrupting it. */
function contextUpdate(text) {
  try { conversation?.sendContextualUpdate(text); } catch (e) { console.warn(e); }
}

/* ---------- Hotel profile + ROI ---------- */

const fmtMoney = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const readProfile = () => Object.fromEntries(new FormData(profileForm));

function computeRoi(p = readProfile()) {
  const r = CONFIG.ROI || {};
  let calls = Number(p.monthly_calls) || 0;
  // Rough fallback: ~12 calls per room per month.
  if (!calls && Number(p.rooms)) calls = Math.round(Number(p.rooms) * 12);
  if (!calls) return null;
  const recovered = Math.round(calls * (r.missedCallRate ?? 0.25));
  const revenue = Math.round(recovered * (r.bookingConversion ?? 0.3) * (r.avgBookingValue ?? 220));
  const hours = Math.round((calls * (r.minutesPerCall ?? 4)) / 60);
  return { calls, recovered, revenue, hours, estimatedCalls: !Number(p.monthly_calls) };
}

function countUp(el, to, fmt = (n) => n.toLocaleString()) {
  const from = Number(el.dataset.value) || 0;
  el.dataset.value = to;
  if (reducedMotion || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 900);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderRoi() {
  const roi = computeRoi();
  const name = readProfile().hotel_name;
  $("[data-roi-title]").textContent = name ? `What Aria could recover for ${name} each month` : "What Aria could recover each month";
  if (!roi) return;
  countUp($('[data-roi="recovered"]'), roi.recovered);
  countUp($('[data-roi="revenue"]'), roi.revenue, fmtMoney);
  countUp($('[data-roi="hours"]'), roi.hours);
  $("[data-roi-note]").textContent =
    `Based on ${roi.calls.toLocaleString()} calls/month${roi.estimatedCalls ? " (estimated from room count)" : ""}, ` +
    `${Math.round((CONFIG.ROI?.missedCallRate ?? 0.25) * 100)}% currently missed and an average booking of ${fmtMoney(CONFIG.ROI?.avgBookingValue ?? 220)}.`;
}

function roiSummary(p) {
  const roi = computeRoi(p);
  if (!roi) return "Not enough data for an ROI estimate yet — ask for the number of rooms or monthly calls.";
  // Pre-rounded spoken form so the agent doesn't round the exact figure itself (and get it wrong).
  const k = Math.round(roi.revenue / 500) / 2;
  const spoken = k >= 1 ? `about ${k.toLocaleString("en-US")} thousand dollars` : `about ${Math.round(roi.revenue / 50) * 50} dollars`;
  return `Estimated monthly impact: ${roi.recovered} missed calls recovered, ${fmtMoney(roi.revenue)} in extra direct bookings (say it as "${spoken} a month"), and ${roi.hours} staff hours freed. Use these exact figures; do not recalculate.`;
}

/** Type text into a field like a person would, so visitors see Aria "writing". */
async function typeInto(el, text) {
  el.classList.add("filling");
  if (reducedMotion || text.length > 60) {
    el.value = text;
  } else {
    el.value = "";
    for (const ch of text) {
      el.value += ch;
      await sleep(14 + Math.random() * 26);
    }
  }
  el.classList.remove("filling");
  flash(el);
}

/** Returns a promise when the field animates, true when set instantly, false when not applicable. */
function setField(form, name, value) {
  const el = form.elements[name];
  if (!el || value === undefined || value === null || value === "") return false;
  if (el.tagName === "SELECT") {
    const v = String(value).toLowerCase();
    const opt = [...el.options].find(
      (o) => o.value.toLowerCase() === v || o.text.toLowerCase() === v || (v && o.text.toLowerCase().includes(v))
    );
    if (!opt) return false;
    el.value = opt.value || opt.text;
    flash(el);
    return true;
  }
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  if (el.value === text) return true;
  return typeInto(el, text);
}

/** Set several fields; returns the names that were set and a promise for when typing finishes. */
function fillForm(form, fields, params) {
  const results = fields.map((k) => [k, setField(form, k, params[k])]).filter(([, r]) => r);
  return { names: results.map(([k]) => k), done: Promise.all(results.map(([, r]) => r)) };
}

let profileDebounce;
profileForm.addEventListener("input", (e) => {
  if (!e.isTrusted) return;
  renderRoi();
  clearTimeout(profileDebounce);
  profileDebounce = setTimeout(
    () => contextUpdate(`The visitor edited their hotel profile by hand: ${JSON.stringify(readProfile())}. ${roiSummary()}`),
    1200
  );
});

/* ---------- Features & plans ---------- */

function spotlightFeature(key) {
  const el = $(`[data-feature="${key}"]`);
  if (!el) return false;
  $$(".feature").forEach((f) => f.classList.remove("spotlight"));
  el.classList.add("spotlight");
  return true;
}

function recommendPlan(plan, reason) {
  const el = $(`[data-plan="${plan}"]`);
  if (!el) return false;
  $$(".plan").forEach((p) => p.classList.remove("recommended"));
  el.classList.add("recommended");
  const r = $("[data-plan-reason]");
  if (reason) {
    r.textContent = `Why ${el.querySelector("h3").textContent}: ${reason}`;
    r.hidden = false;
  }
  demoForm.elements.plan.value = plan;
  return true;
}

/* ---------- Demo request ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function missingDemoFields(d = Object.fromEntries(new FormData(demoForm))) {
  const missing = [];
  if (!d.name) missing.push("name");
  if (!d.hotel_name) missing.push("hotel name");
  if (!d.email) missing.push("email");
  else if (!EMAIL_RE.test(d.email)) missing.push("a valid email address");
  return missing;
}

async function submitDemo() {
  const data = {
    ...Object.fromEntries(new FormData(demoForm)),
    hotel_profile: readProfile(),
    submitted_at: new Date().toISOString(),
    conversation_id: conversation?.getId?.() ?? null,
  };
  try {
    const all = JSON.parse(localStorage.getItem("aria_demo_requests") || "[]");
    all.push(data);
    localStorage.setItem("aria_demo_requests", JSON.stringify(all));
  } catch {}
  console.info("Demo request:", data);
  if (CONFIG.FORM_WEBHOOK_URL) {
    try {
      await fetch(CONFIG.FORM_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } catch (e) {
      console.error("Webhook failed", e);
    }
  }
  $("[data-confirm-text]").textContent =
    `Thanks ${data.name}! We'll email ${data.email} to confirm your demo${data.preferred_time ? ` for ${data.preferred_time}` : ""}.`;
  demoForm.hidden = true;
  const ok = $("#demoSuccess");
  ok.hidden = false;
  goTo("demo", true);
  ok.focus({ preventScroll: true });
  return data;
}

demoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const missing = missingDemoFields();
  if (missing.length) return toast(`Please add your ${missing.join(", ")}.`);
  const data = await submitDemo();
  contextUpdate(`The visitor submitted the demo request form themselves: ${JSON.stringify(data)}.`);
});

/* ---------- Client tools (called by the ElevenLabs agent) ---------- */

let pendingTyping = Promise.resolve();

const clientTools = {
  navigate_to_section: ({ section }) => {
    const ok = goTo(String(section || "").toLowerCase(), true);
    return ok ? `Now showing the ${section} section.` : `Unknown section. Use one of: ${SECTIONS.join(", ")}.`;
  },

  update_hotel_profile: (params = {}) => {
    goTo("profile", true);
    const { names, done } = fillForm(profileForm, ["hotel_name", "hotel_type", "rooms", "monthly_calls", "languages", "pain_points"], params);
    if (params.hotel_name) fillForm(demoForm, ["hotel_name"], params);
    pendingTyping = done.then(renderRoi);
    if (names.length) activity("Updated your hotel profile");
    // Answer immediately from the final values; the page catches up as it types.
    return `Updated: ${names.join(", ") || "nothing"}. ${roiSummary({ ...readProfile(), ...params })}`;
  },

  get_roi_estimate: async () => {
    goTo("profile", true);
    await pendingTyping;
    flash($("#roi"));
    activity("Calculated your estimate");
    return roiSummary();
  },

  highlight_feature: ({ feature }) => {
    goTo("features", true);
    return spotlightFeature(feature)
      ? `Highlighting ${feature}.`
      : "Unknown feature. Use: answering, bookings, multilingual, guest_requests, upsells, integrations.";
  },

  recommend_plan: ({ plan, reason }) => {
    goTo("pricing", true);
    const ok = recommendPlan(String(plan || "").toLowerCase(), reason);
    if (ok) activity(`Recommended the ${plan} plan`);
    return ok ? `Showing ${plan} as the recommended plan.` : "Unknown plan. Use: starter, professional, enterprise.";
  },

  fill_demo_form: (params = {}) => {
    goTo("demo", true);
    const fields = ["name", "hotel_name", "email", "phone", "preferred_time", "plan", "notes"];
    const { names, done } = fillForm(demoForm, fields, params);
    pendingTyping = done;
    if (names.length) activity("Filled in your demo details");
    const missing = missingDemoFields({ ...Object.fromEntries(new FormData(demoForm)), ...params });
    return `Filled: ${names.join(", ") || "nothing"}.` + (missing.length ? ` Still needed: ${missing.join(", ")}.` : " All required fields are complete.");
  },

  submit_demo_request: async () => {
    await pendingTyping;
    const missing = missingDemoFields();
    if (missing.length) return `Cannot submit yet. Missing: ${missing.join(", ")}.`;
    const data = await submitDemo();
    activity("Demo request sent");
    return `Demo request submitted for ${data.name} (${data.email}).`;
  },
};

// Exposed for testing tools from the browser console.
window.ariaTools = clientTools;

/* ---------- Visit context: shapes Aria's tone, pace and greeting ---------- */

function visitContext() {
  let returning = false;
  try {
    returning = !!localStorage.getItem("aria_visited");
    localStorage.setItem("aria_visited", "1");
  } catch {}
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const mobile = matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  // Brisker in the morning, calmer in the evening; a little natural variation per visit.
  const pace = { morning: 1.04, afternoon: 1.0, evening: 0.95 }[part] + (mobile ? 0.02 : 0);
  const jitter = (range) => (Math.random() * 2 - 1) * range;
  return {
    part,
    returning,
    dynamicVariables: { time_of_day: part, visitor_status: returning ? "returning" : "new", visitor_device: mobile ? "mobile" : "desktop" },
    tts: { speed: +(pace + jitter(0.02)).toFixed(2), stability: +(0.3 + jitter(0.04)).toFixed(2) },
  };
}

/* ---------- Varied, human greetings ---------- */

function pickGreeting({ part, returning }) {
  if (part === "evening" && !returning && Math.random() < 0.5) {
    return "Good evening... [warmly] thanks for stopping by this late. I'm Aria — I look after hotel front desks, and I'll show you around. So, what's your hotel called?";
  }
  if (returning) {
    return pick([
      "Oh — welcome back! [warmly] Good to hear from you again. So... remind me, what's the name of your hotel?",
      "Hey, you're back! [laughs softly] Okay, let's pick up where we left off — what's your hotel called?",
    ]);
  }
  return pick([
    `Good ${part}! [warmly] I'm Aria... I'm an AI receptionist for hotels, and I'll be showing you around today. So, first things first — what's your hotel called?`,
    "Hey there... welcome! [warmly] I'm Aria — I'm an AI receptionist for hotels, and, um, I'll be your guide around here today. So, tell me — what's the name of your hotel?",
    "Hi! Oh, lovely to meet you. [warmly] I'm Aria — I basically run the front desk for hotels, and I'll walk you through how. What's the name of your place?",
    `Hello, and good ${part}! I'm Aria. [curious] I'd love to hear a bit about your hotel before I show you anything... what's it called?`,
  ]);
}

/* ---------- Conversation lifecycle ---------- */

let Conversation;
async function loadSdk() {
  if (!Conversation) ({ Conversation } = await import("https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm"));
  return Conversation;
}
// Warm up the SDK so starting feels instant.
addEventListener("load", () => setTimeout(() => loadSdk().catch(() => {}), 800));

/** Soft two-note chime when Aria joins. */
function chime() {
  try {
    const ctx = new AudioContext();
    [[660, 0], [880, 0.12]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {}
}

let sheetSeen = false;
function requestStart(preferred) {
  if (!CONFIG.AGENT_ID || CONFIG.AGENT_ID === "YOUR_AGENT_ID") {
    toast("Add your ElevenLabs agent ID in config.js to enable voice.");
    return;
  }
  if (preferred === "text") return start("text");
  if (sheetSeen) return start("voice");
  const sheet = $("#startSheet");
  sheet.returnValue = "";
  sheet.showModal();
  sheet.addEventListener("close", () => {
    if (sheet.returnValue === "voice" || sheet.returnValue === "text") {
      sheetSeen = true;
      start(sheet.returnValue);
    }
  }, { once: true });
}

async function start(chosen) {
  mode = chosen;
  thread.innerHTML = "";
  setState("connecting");
  caption(mode === "voice" ? "Allow microphone access to talk with Aria…" : "Opening the chat…");
  try {
    if (mode === "voice") await navigator.mediaDevices.getUserMedia({ audio: true });
    const SDK = await loadSdk();
    const ctx = visitContext();
    conversation = await SDK.startSession({
      agentId: CONFIG.AGENT_ID,
      ...(mode === "voice" ? { connectionType: "webrtc" } : { textOnly: true }),
      dynamicVariables: ctx.dynamicVariables,
      overrides: { agent: { firstMessage: pickGreeting(ctx) }, tts: ctx.tts },
      clientTools,
      onConnect: () => {
        chime();
        setState("thinking");
        caption("Aria is joining…");
        showTyping();
        if (mode === "text") {
          openPanel(true);
          $("#typeForm").elements.msg.focus();
        }
      },
      onDisconnect: () => stopUi(),
      onError: (err) => {
        console.error(err);
        toast("Connection hiccup — please try again.");
      },
      onModeChange: ({ mode: m }) => {
        if (mode === "text") return;
        if (m === "speaking") {
          removeTyping();
          setState("speaking");
        } else if (dock.dataset.state !== "thinking") {
          setState("listening");
        }
      },
      onMessage: (msg) => {
        const who = msg.role === "user" || msg.source === "user" ? "user" : "ai";
        if (who === "ai") setTone(msg.message);
        const text = clean(msg.message);
        if (!text) return;
        addMsg(who, text);
        caption(who === "user" ? `You: ${text}` : text, who);
        if (who === "user") {
          setState("thinking");
          showTyping();
        } else if (mode === "text" || dock.dataset.state === "thinking") {
          setState(mode === "text" ? "listening" : "speaking");
        }
      },
    });
  } catch (err) {
    console.error(err);
    stopUi();
    if (err?.name === "NotAllowedError") {
      toast("No microphone access — switching to text chat.");
      return start("text");
    }
    toast("Couldn't start the conversation. Please try again.");
  }
}

async function stop() {
  const c = conversation;
  conversation = null;
  stopUi();
  try { await c?.endSession(); } catch {}
}

function stopUi() {
  conversation = null;
  muted = false;
  $("#muteBtn").setAttribute("aria-pressed", "false");
  removeTyping();
  openPanel(false);
  setState("idle");
  caption(thread.children.length ? "Thanks for chatting — tap the orb to pick it back up." : "Press the orb and say hello.");
}

$$(".js-talk").forEach((b) =>
  b.addEventListener("click", () => {
    const state = dock.dataset.state;
    if (state === "idle") requestStart("voice");
    else if (state !== "connecting") stop();
  })
);
$$(".js-type").forEach((b) =>
  b.addEventListener("click", () => (dock.dataset.state === "idle" ? requestStart("text") : openPanel(true)))
);
$("#endBtn").addEventListener("click", stop);
$("#transcriptBtn").addEventListener("click", () => openPanel(panel.hidden));
$("#collapseBtn").addEventListener("click", () => openPanel(false));
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panel.hidden && !$("#startSheet").open) openPanel(false);
});
$("#muteBtn").addEventListener("click", (e) => {
  muted = !muted;
  conversation?.setMicMuted(muted);
  e.currentTarget.setAttribute("aria-pressed", String(muted));
  e.currentTarget.setAttribute("aria-label", muted ? "Unmute microphone" : "Mute microphone");
  setState(dock.dataset.state);
});
$("#typeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = e.currentTarget.elements.msg;
  const text = input.value.trim();
  if (!text || !conversation) return;
  conversation.sendUserMessage(text);
  addMsg("user", text);
  caption(`You: ${text}`, "user");
  setState("thinking");
  showTyping();
  input.value = "";
});
$("#typeForm").addEventListener("input", () => conversation?.sendUserActivity());

/* ---------- Audio-reactive orb + waveform ---------- */

const levelEls = [...$$("[data-orb]"), $(".wave")];
let smooth = 0;
function animate() {
  let level = 0;
  if (conversation && mode === "voice") {
    try {
      const s = dock.dataset.state;
      level = s === "speaking" ? conversation.getOutputVolume() : s === "listening" && !muted ? conversation.getInputVolume() : 0;
    } catch {}
  }
  smooth += (Math.min(1, level * 2.2) - smooth) * 0.35;
  const v = smooth.toFixed(3);
  levelEls.forEach((o) => o.style.setProperty("--level", v));
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

setState("idle");
renderRoi();
