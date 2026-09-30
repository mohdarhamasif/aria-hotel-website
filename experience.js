// The night experience, top to bottom.
// One WebGL particle field sits behind the whole page and reshapes for each
// section: the orb in the hero, a voice waveform and a field of points in the
// story, the orb again beside your estimate, an orbit ring around the
// features, a quiet field behind the plans, and the orb returning at the end.
// Also: text that resolves like a live transcript, outlined numerals that
// drift behind headings, a light that follows the cursor on cards, and small
// particle orbs in the ROI card, dock and start sheet.
// Decorative only: it reads the hooks app.js sets (body[data-state],
// body[data-tone], --level on [data-orb]) and never changes conversation
// state, forms or navigation.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;
const body = document.body;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------- The story opens at the visitor's own time ---------- */
// The outlined clock and the first story line show the local time (12- or
// 24-hour, as the visitor's device prefers) and keep up minute by minute.
// By day, the last beat stops saying the night team sleeps.

const clockBig = $("[data-clock]");
const clockLine = $("[data-clock-line]");
const twelveHour = (new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle || "h12").startsWith("h1");

function clockNow(d = new Date()) {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const hh = twelveHour ? String(h % 12 || 12) : String(h).padStart(2, "0");
  return { hh, mm, line: twelveHour ? `${hh}:${mm} ${h < 12 ? "am" : "pm"}` : `${hh}:${mm}`, night: h >= 21 || h < 6 };
}

// Swap an element's text, keeping the per-letter spans the scrub animation uses
function setLetters(el, text) {
  if (!el.querySelector(".ch")) return void (el.textContent = text);
  const old = $$(".ch", el);
  el.replaceChildren(...[...text].map((c, i) => {
    if (/\s/.test(c)) return " ";
    const s = document.createElement("span");
    s.className = "ch";
    s.textContent = c;
    s.style.setProperty("--r", old[i]?.style.getPropertyValue("--r") || (Math.random() * 0.62).toFixed(3));
    return s;
  }));
  const line = el.closest("[data-split]");
  const label = line && $(".sr-only", line);
  if (label) label.textContent = $("[aria-hidden]", line).textContent.replace(/\s+/g, " ").trim();
}

function tickClock() {
  const t = clockNow();
  if (clockBig) {
    // One inline face inside the grid, so the digits and the blinking colon stay on one line
    const face = clockBig.firstElementChild || clockBig.appendChild(document.createElement("span"));
    const tick = $(".tick", face) || Object.assign(document.createElement("span"), { className: "tick", textContent: ":" });
    face.replaceChildren(t.hh, tick, t.mm);
    clockBig.style.setProperty("--fit", (4 / (t.hh.length + 3)).toFixed(3)); // "12:05" is a digit wider than "2:14"
  }
  if (clockLine && clockLine.textContent.replace(/\s+/g, " ").trim() !== t.line) setLetters(clockLine, t.line);
}

{
  const t = clockNow();
  tickClock();
  const daypart = $("[data-daypart]");
  if (!t.night) {
    // Each page gives its own daytime line; the hotel line is the fallback
    if (daypart) daypart.textContent = daypart.dataset.day || "Your team stays with the guest in front of them.";
    const story = $("#story");
    story?.setAttribute("aria-label", (story.getAttribute("aria-label") || "A night at the front desk").replace(/night/, "day"));
  }
  const next = () => setTimeout(() => { tickClock(); next(); }, 60000 - (Date.now() % 60000) + 50);
  next();
  document.addEventListener("visibilitychange", () => document.hidden || tickClock());
}

/* ---------- Text that resolves like a live transcript ---------- */

function splitText(el) {
  const label = el.textContent.replace(/\s+/g, " ").trim();
  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  visual.append(...el.childNodes);
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent) {
          if (/\s/.test(ch)) { frag.append(" "); continue; }
          const s = document.createElement("span");
          s.className = "ch";
          s.textContent = ch;
          s.style.setProperty("--r", (Math.random() * 0.62).toFixed(3));
          frag.append(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    });
  };
  walk(visual);
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = label;
  el.append(sr, visual);
}

if (!reducedMotion) {
  $$("[data-split]").forEach(splitText);

  // The hero headline resolves on load; the rest as they scroll into view.
  const heroTitle = $(".hero-title");
  const show = () => heroTitle?.classList.add("is-in");
  (document.fonts?.ready || Promise.resolve()).then(() => setTimeout(show, 120));
  setTimeout(show, 1500);

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }),
    { rootMargin: "0px 0px -18% 0px" }
  );
  $$('[data-split="in"]').filter((el) => el !== heroTitle).forEach((el) => io.observe(el));
}

/* ---------- Particle sphere (WebGL) ---------- */

const VERT = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec4 aAlt;   // wave x, wave band, field x, field y
attribute vec2 aMisc;  // seed, field z
uniform float uTime, uRot, uTilt, uPoint, uLevel, uWave, uField, uRing, uWaveSpan;
uniform float uConnect, uThink, uListen, uSpeak, uAlpha, uBright;
uniform vec2 uCenter, uScale, uFieldSpan;
varying vec3 vColor;
varying float vAlpha;

vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }

void main() {
  float seed = aMisc.x;
  vec3 p = aPos;

  // The surface breathes; the voice pushes it outward.
  float n = sin(dot(p, vec3(4.1, 3.3, 2.7)) + uTime * .8 + seed * 6.2831) * .5 + .5;
  float r = 1. + (n - .5) * .03;
  r += uLevel * (.05 + n * .2);
  r += uSpeak * uLevel * .09 * sin(p.y * 12. - uTime * 7.);
  r += uListen * .035 * sin(p.y * 7. + uTime * 3. + seed * 2.);
  r += uThink * .03 * sin(uTime * 5. + seed * 40.);
  r *= 1. - uConnect * .16 * (.6 + .4 * sin(uTime * 5. + seed * 6.2831));
  vec3 sphere = rotX(rotY(p * r, uRot), uTilt);

  // A mirrored voice waveform across the screen.
  float wx = aAlt.x;
  float env = exp(-wx * wx * 2.2);
  float amp = (.1 + .32 * env) * (.75 + uLevel * 1.8);
  float wy = sin(wx * 7. - uTime * 2.3) * amp + sin(wx * 19. + uTime * 3.7) * .05 * env;
  vec3 wave = vec3(wx * uWaveSpan, wy * (aAlt.y * 2. - 1.), (aAlt.y - .5) * .4);

  // A tilted orbit ring.
  float ang = atan(p.z, p.x) + uTime * .06;
  float rr = 1.55 + (seed - .5) * .34 + sin(ang * 3. + uTime * .5) * .03;
  vec3 ring = rotX(vec3(cos(ang) * rr, (aAlt.y - .5) * .05, sin(ang) * rr), 1.2 + uTilt * .4);

  // A calm field of points filling the screen.
  vec3 field = vec3(aAlt.z * uFieldSpan.x, aAlt.w * uFieldSpan.y, aMisc.y);
  field.xy += vec2(sin(uTime * .15 + seed * 30.), cos(uTime * .12 + seed * 20.)) * .06;

  vec3 pos = mix(sphere, wave, uWave);
  pos = mix(pos, ring, uRing);
  pos = mix(pos, field, uField);

  float persp = 1. / (1. - pos.z * .22);
  gl_Position = vec4(uCenter + pos.xy * persp * uScale, 0., 1.);
  float front = clamp(pos.z * .5 + .5, 0., 1.);
  // Brighter at the rim, as in a real point-cloud sphere seen edge-on.
  float edge = 1. - abs(sphere.z);
  float shaped = (1. - uWave) * (1. - uField) * (1. - uRing);
  float rim = mix(1., mix(.55, 1.45, edge * edge), shaped);
  vColor = aColor * uBright * (.9 + uLevel * .45) * mix(1., 1.15, edge * shaped);
  vAlpha = uAlpha * rim * mix(.2, 1., front) * mix(1., .75 + .25 * sin(uTime * 2. + seed * 50.), uField);
  gl_PointSize = max(1.2, uPoint * persp * (1. + uLevel * .35));
}`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - .5;
  float d = length(c);
  if (d > .5) discard;
  float a = vAlpha * smoothstep(.5, .15, d);
  gl_FragColor = vec4(vColor * a, a);
}`;

// Colours sampled from the reference: deep blues above, mint and pale gold at
// the equator, burnt orange below, with a scatter of stray colours throughout.
const PALETTE = {
  blue: [[0.16, 0.36, 0.68], [0.22, 0.45, 0.78], [0.33, 0.57, 0.86], [0.14, 0.3, 0.58]],
  mint: [[0.53, 0.84, 0.77], [0.45, 0.75, 0.8]],
  gold: [[0.93, 0.83, 0.5], [0.97, 0.72, 0.35]],
  orange: [[0.87, 0.37, 0.12], [0.93, 0.47, 0.18], [0.78, 0.26, 0.1]],
};
const pick = (a) => a[(Math.random() * a.length) | 0];
function colorFor(y) {
  const t = y + (Math.random() - 0.5) * 0.6;
  const r = Math.random();
  let c;
  if (t > 0.15) c = r < 0.88 ? pick(PALETTE.blue) : r < 0.95 ? pick(PALETTE.mint) : pick(PALETTE.gold);
  else if (t > -0.3) c = r < 0.42 ? pick(PALETTE.mint) : r < 0.62 ? pick(PALETTE.gold) : r < 0.82 ? pick(PALETTE.blue) : pick(PALETTE.orange);
  else c = r < 0.86 ? pick(PALETTE.orange) : r < 0.94 ? pick(PALETTE.mint) : pick(PALETTE.gold);
  const k = 0.78 + Math.random() * 0.32;
  return [c[0] * k, c[1] * k, c[2] * k];
}

function buildPoints(count) {
  const data = new Float32Array(count * 12);
  for (let i = 0; i < count; i++) {
    const y = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - y * y);
    const a = Math.random() * Math.PI * 2;
    const [r, g, b] = colorFor(y);
    data.set([
      s * Math.cos(a), y, s * Math.sin(a),
      r, g, b,
      Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1,
      Math.random(), Math.random() * 2 - 1,
    ], i * 12);
  }
  return data;
}

const UNIFORMS = ["uTime", "uRot", "uTilt", "uPoint", "uLevel", "uWave", "uField", "uRing", "uWaveSpan", "uConnect",
  "uThink", "uListen", "uSpeak", "uAlpha", "uBright", "uCenter", "uScale", "uFieldSpan"];

class ParticleOrb {
  constructor(canvas, count) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL unavailable");
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, buildPoints(count), gl.STATIC_DRAW);
    const attr = (name, size, offset) => {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 48, offset * 4);
    };
    attr("aPos", 3, 0);
    attr("aColor", 3, 3);
    attr("aAlt", 4, 6);
    attr("aMisc", 2, 10);

    this.u = {};
    UNIFORMS.forEach((n) => (this.u[n] = gl.getUniformLocation(prog, n)));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    Object.assign(this, { gl, canvas, count, dpr: 1 });
    this.resize();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.gl.viewport(0, 0, w, h);
  }

  draw(p) {
    const { gl, u } = this;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uTime, p.time);
    gl.uniform1f(u.uRot, p.rot);
    gl.uniform1f(u.uTilt, p.tilt);
    gl.uniform1f(u.uPoint, p.point * this.dpr);
    gl.uniform1f(u.uLevel, p.level);
    gl.uniform1f(u.uWave, p.wave || 0);
    gl.uniform1f(u.uField, p.field || 0);
    gl.uniform1f(u.uRing, p.ring || 0);
    gl.uniform1f(u.uWaveSpan, p.waveSpan || 1);
    gl.uniform2f(u.uFieldSpan, p.fieldSpan?.[0] || 1, p.fieldSpan?.[1] || 1);
    gl.uniform1f(u.uConnect, p.states.connecting);
    gl.uniform1f(u.uThink, p.states.thinking);
    gl.uniform1f(u.uListen, p.states.listening);
    gl.uniform1f(u.uSpeak, p.states.speaking);
    gl.uniform1f(u.uAlpha, p.alpha);
    gl.uniform1f(u.uBright, p.bright);
    gl.uniform2f(u.uCenter, p.center[0], p.center[1]);
    gl.uniform2f(u.uScale, p.scale[0], p.scale[1]);
    gl.drawArrays(gl.POINTS, 0, this.count);
  }
}

/* ---------- Shared state read from app.js hooks ---------- */

const STATE_KEYS = ["connecting", "listening", "thinking", "speaking"];
const QUIET = { connecting: 0, listening: 0, thinking: 0, speaking: 0 };
const states = { ...QUIET };
const TONE_BRIGHT = { bright: 1.15, soft: 0.85, calm: 0.95 };
let bright = 1;
const readLevel = (el) => parseFloat(el?.style.getPropertyValue("--level")) || 0;

function updateStates(dt) {
  const s = body.dataset.state || "idle";
  const k = Math.min(1, dt * 4);
  STATE_KEYS.forEach((key) => (states[key] += ((s === key ? 1 : 0) - states[key]) * k));
  const tone = s === "speaking" ? TONE_BRIGHT[body.dataset.tone] || 1 : 1;
  bright += (tone - bright) * k;
}

const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener("pointermove", (e) => {
  pointer.x = e.clientX / innerWidth - 0.5;
  pointer.y = e.clientY / innerHeight - 0.5;
}, { passive: true });

/* ---------- Scenes: what the particle field becomes in each section ---------- */

const fxCanvas = $(".fx");
const heroOrb = $(".hero-orb");
const heroAnchor = $(".hero-orb [data-orb]");
const hero = $("#welcome");
const story = $("#story");
const beats = $$(".beat");
const beatTime = $(".beat-time");
const greetings = $$(".greetings li");
const storyCount = $(".story-count");
const countEl = $("[data-count]");
const WINDOWS = [[0, 0.28], [0.28, 0.68], [0.68, 1.01]];
const beatVis = [0, 0, 0];

// Each scene is centred on an anchor element (or the screen), with its radius
// as a share of the screen's shorter side.
const SCENES = [
  { el: $("#profile"), anchor: $("#roi"), r: 0.34, alpha: 0.5 },
  { el: $("#features"), custom: () => featureSphere() },
  { el: $("#pricing"), r: 0.32, field: 1, alpha: 0.35 },
  { el: $("#demo"), r: 0.3, field: 1, alpha: 0.14 },
  { el: $("#faq"), r: 0.3, field: 1, alpha: 0.4 },
  { el: $(".footer"), anchor: $(".wordmark"), r: 0.21, alpha: 1 },
].filter((s) => s.el);

const view = { cx: innerWidth / 2, cy: innerHeight * 0.45, radius: 300, wave: 0, ring: 0, field: 0, alpha: 0 };
let storyP = 0;
let rot = 0;
let lastCount = "";
let sceneTarget = null;

function storyProgress() {
  if (!story) return 0;
  const r = story.getBoundingClientRect();
  const span = r.height - innerHeight;
  return span > 0 ? clamp(-r.top / span) : 0;
}

function updateStory(p) {
  beats.forEach((beat, i) => {
    const [a, b] = WINDOWS[i];
    const out = i < beats.length - 1 ? 1 - smooth(b - 0.06, b + 0.01, p) : 1 - smooth(0.96, 1, p);
    const vis = smooth(a - (i ? 0.03 : 0.08), a + 0.05, p) * out;
    beatVis[i] = vis;
    beat.style.setProperty("--vis", vis.toFixed(3));
    beat.style.setProperty("--bp", clamp((p - a) / ((b - a) * 0.6)).toFixed(3));
  });
  if (beatTime) {
    beatTime.style.setProperty("--to", (1 - smooth(0.2, 0.3, p)).toFixed(3));
    beatTime.style.setProperty("--ts", (1.14 - 0.14 * smooth(0, 0.26, p)).toFixed(4));
  }
  if (storyCount) {
    storyCount.style.setProperty("--sp", p.toFixed(3));
    storyCount.style.opacity = (1 - smooth(0.95, 1, p)).toFixed(3);
    const label = `0${p < WINDOWS[1][0] ? 1 : p < WINDOWS[2][0] ? 2 : 3}`;
    if (label !== lastCount && countEl) countEl.textContent = lastCount = label;
  }
}

/* ---------- Languages leave the orb, one at a time ---------- */
// While the second beat is on screen, the orb releases a greeting about once a
// second: it emerges from the centre, fades in as it drifts out past the edge,
// then fades away as the next one arrives. Each release gives the orb a pulse.

// Where each greeting settles, in orb radii from the centre. Consecutive
// greetings always land on opposite sides, so two never overlap.
const GREET_SLOTS = [[1.75, -0.3], [-1.25, -1.1], [1.25, -1.1], [-1.75, -0.3]];
const greetState = greetings.map(() => ({ t: -1, sx: 0, sy: 0, w: 0 }));
let greetNext = 0;
let greetIdx = 0;
let emit = 0;

function updateGreetings(dt, active) {
  const vw = innerWidth;
  if (active && time >= greetNext) {
    const i = greetIdx % greetings.length;
    const [sx, sy] = GREET_SLOTS[greetIdx % GREET_SLOTS.length];
    Object.assign(greetState[i], { t: 0, sx, sy, w: greetings[i].offsetWidth });
    greetIdx++;
    greetNext = time + 1.05;
    emit = 1;
  }
  if (!active) greetNext = Math.min(greetNext, time + 0.3);
  const R = Math.max(60, view.radius);
  greetings.forEach((li, i) => {
    const g = greetState[i];
    if (g.t < 0) {
      if (li.style.opacity !== "0") li.style.opacity = "0";
      return;
    }
    g.t += dt / (active ? 2.1 : 0.5); // leave quickly once the beat is over
    if (g.t >= 1) {
      g.t = -1;
      li.style.opacity = "0";
      return;
    }
    const t = g.t;
    // Emerge from the centre, travel out to the slot, then drift a little further
    const out = 1 - Math.pow(1 - clamp(t / 0.5), 3);
    const reach = R * (0.06 + 0.94 * out + 0.16 * clamp((t - 0.5) / 0.5));
    const half = g.w / 2 + 16;
    const x = clamp(g.sx * reach, -vw / 2 + half, vw / 2 - half);
    const y = g.sy * reach;
    const blur = (1 - smooth(0, 0.35, t)) * 10 + smooth(0.72, 1, t) * 4;
    li.style.opacity = (smooth(0, 0.3, t) * (1 - smooth(0.64, 1, t))).toFixed(3);
    li.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : "none";
    li.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(0.5 + 0.5 * out).toFixed(3)})`;
  });
}

// Which scene owns the middle of the screen right now?
function currentScene() {
  const mid = innerHeight * 0.5;
  const storyRect = story?.getBoundingClientRect();
  if (!storyRect || storyRect.bottom > mid) return "opening"; // hero + story are scroll-driven
  for (const s of SCENES) {
    const r = s.el.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) return s;
  }
  return sceneTarget; // between sections: hold the last shape
}

function drawField(time, dt) {
  const vw = innerWidth;
  const vh = innerHeight;
  const minSide = Math.min(vw, vh);
  const scene = currentScene();
  let target;
  let k;

  // The story keeps its own progress whenever it is on screen, even when
  // the guide jumps the page past it.
  const sr = story?.getBoundingClientRect();
  if (sr && sr.bottom > 0 && sr.top < vh) {
    const goal = reducedMotion ? 0 : storyProgress();
    storyP += (goal - storyP) * Math.min(1, dt * 7);
    if (Math.abs(goal - storyP) > 0.35) storyP = goal;
    if (!reducedMotion) {
      updateStory(storyP);
      updateGreetings(dt, beatVis[1] > 0.55);
    }
  }

  if (scene === "opening" || !scene) {
    // The orb glides from its place in the hero to the story's centre.
    const or = heroOrb.getBoundingClientRect();
    const hand = smooth(0, hero.offsetHeight * 0.7, scrollY);
    const rectR = or.width / 2;
    target = {
      cx: lerp(or.left + rectR, vw / 2, hand),
      cy: lerp(or.top + or.height / 2, vh * 0.38, hand),
      radius: lerp(rectR, minSide * 0.24, hand),
      wave: smooth(0.06, 0.15, storyP) * (1 - smooth(0.2, 0.28, storyP)),
      field: smooth(0.68, 0.82, storyP),
      ring: 0,
      alpha: 1,
    };
    k = Math.min(1, dt * 12);
  } else {
    sceneTarget = scene;
    const a = scene.anchor?.getBoundingClientRect();
    const c = scene.custom?.();
    target = c ? { ...c, wave: 0, field: 0, ring: 0 } : {
      cx: a ? a.left + a.width / 2 : vw / 2,
      cy: a ? a.top + a.height / 2 : vh / 2,
      radius: minSide * scene.r * (vw < 760 ? 1.15 : 1),
      wave: 0,
      field: scene.field || 0,
      ring: scene.ring || 0,
      alpha: scene.alpha * (vw < 760 ? 0.8 : 1),
    };
    k = Math.min(1, dt * 2.2);
  }

  // Position follows quickly; shape and brightness ease more slowly.
  const kPos = scene === "opening" || !scene ? k : Math.min(1, dt * 5);
  if (reducedMotion) Object.assign(view, target);
  else for (const key in target) {
    const kk = key === "cx" || key === "cy" || key === "radius" ? kPos : key === "alpha" ? Math.min(k, dt * 1.6) : k;
    view[key] += (target[key] - view[key]) * kk;
  }

  emit = Math.max(0, emit - dt * 1.6);
  const level = readLevel(heroAnchor) + emit * emit * 0.45;
  pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.5);
  pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.5);
  rot += dt * (0.09 + level * 0.6 + states.thinking * 0.5 + states.connecting * 0.8);

  const cr = fxCanvas.getBoundingClientRect();
  const radius = Math.max(40, view.radius);
  fieldGL.resize();
  fieldGL.draw({
    time, level, states, bright,
    rot: rot + pointer.sx * 0.35,
    tilt: 0.28 + pointer.sy * 0.14,
    point: 1.4 * clamp(radius / 380, 0.8, 1.15),
    wave: view.wave, field: view.field, ring: view.ring,
    waveSpan: (vw / 2 / radius) * 0.94,
    fieldSpan: [vw / 2 / radius, vh / 2 / radius],
    alpha: view.alpha,
    center: [((view.cx - cr.left) / cr.width) * 2 - 1, 1 - ((view.cy - cr.top) / cr.height) * 2],
    scale: [(radius / cr.width) * 2, (radius / cr.height) * 2],
  });
}

/* ---------- The footer wordmark drifts as you scroll ---------- */

const drifters = $$(".wordmark");
function updateDrift() {
  const vh = innerHeight;
  drifters.forEach((el) => {
    const r = el.parentElement.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) return;
    const p = (vh - r.top) / (vh + r.height); // 0 entering, 1 leaving
    el.style.setProperty("--py", `${((0.5 - p) * 90).toFixed(1)}px`);
  });
}

/* ---------- Scroll transitions ---------- */
// Smooth, weighted scrolling on desktop; paragraphs that light up word by word;
// each section's content rising into place as it arrives; and the soft glows
// drifting a little slower than the page.

let lenis = null;
async function startSmoothScroll() {
  if (reducedMotion || matchMedia("(pointer: coarse)").matches) return; // touch keeps native scrolling
  try {
    const { default: Lenis } = await import("https://cdn.jsdelivr.net/npm/lenis@1.3.26/+esm");
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true, autoRaf: false });
  } catch (err) {
    console.warn("Smooth scrolling unavailable —", err.message);
  }
}
$(".scroll-cue")?.addEventListener("click", (e) => {
  if (!lenis) return;
  e.preventDefault();
  lenis.scrollTo("#story", { duration: 1.6 });
});

const scrubs = reducedMotion ? [] : $$("[data-scrub]").map((el) => {
  const words = el.textContent.trim().split(/\s+/).map((w) => Object.assign(document.createElement("span"), { className: "w", textContent: w }));
  el.replaceChildren(...words.flatMap((w, i) => (i ? [" ", w] : [w])));
  return { el, words, lit: -1 };
});
const risers = reducedMotion ? [] : $$(".profile-grid, .bento, .plan-grid, .demo-main, .faq-list, .footer-cta");
const glows = reducedMotion ? [] : $$(".hero, .content .section, .footer");

function updateScrollFx() {
  const vh = innerHeight;
  for (const s of scrubs) {
    const r = s.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    const lit = Math.round(clamp((vh * 0.92 - r.top) / (vh * 0.5)) * s.words.length);
    if (lit === s.lit) continue;
    s.words.forEach((w, i) => w.classList.toggle("on", i < lit));
    s.lit = lit;
  }
  for (const el of risers) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -vh * 0.2 || r.top > vh * 1.2) continue;
    const e = 1 - Math.pow(1 - clamp((vh - r.top) / (vh * 0.75)), 3);
    el.style.transform = e > 0.999 ? "" : `translate3d(0, ${((1 - e) * 110).toFixed(1)}px, 0) scale(${(0.94 + 0.06 * e).toFixed(4)})`;
  }
  for (const el of glows) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const p = (vh - r.top) / (vh + r.height);
    el.style.setProperty("--gy", `${((0.5 - p) * 120).toFixed(1)}px`);
  }
}

/* ---------- Section 2: the warm light spreads down the section as you scroll ---------- */
// It starts as a small blob on the glass globe's rim and ends as a soft wash
// over the whole section. Its layer is clipped to the section in CSS.

const profileEl = $("#profile");
const profileHead = $("#profile .section-head");
const profileBlob = $(".profile-glow i");

function updateProfileGlow() {
  if (!profileBlob || reducedMotion) return;
  const vh = innerHeight;
  const r = profileEl.getBoundingClientRect();
  if (r.bottom < -100 || r.top > vh + 100) return;
  // 0 while the heading arrives, 1 when the end of the section reaches the bottom of the screen
  const t = clamp((vh * 0.3 - r.top) / Math.max(1, r.height - vh * 0.7));
  const e = t * t * (3 - 2 * t);
  const y = lerp(profileHead.offsetTop + 10, r.height * 0.5, e);
  const k = lerp(1, Math.max(2.4, (r.height * 1.05) / profileBlob.offsetHeight), e);
  profileBlob.style.transform = `translate(-50%, -50%) translate3d(0, ${(y - profileBlob.offsetTop).toFixed(1)}px, 0) scale(${k.toFixed(3)})`;
  profileBlob.style.opacity = lerp(1, 0.34, e).toFixed(3);
}

/* ---------- Section 3: the sphere with feature pills ---------- */
// One pinned scroll transition (after mdx.so): at first the heading sits on the
// sphere and the pills are spread wide (A); then the heading moves to the
// corner, the paragraph appears, and the pills gather close around the
// sphere (B). Phones and reduced motion get a static grid instead.

const featuresEl = $("#features");
const stage = $(".feature-stage");
const pin = $(".feature-pin");
const fhA = $(".fh-a");
const fhB = $(".fh-b");
const lede = $(".feature-lede");
const orbitEl = $(".orbit");
const slots = $$(".orbit-slot");
const PILL_A = [[0.14, 0.15], [0.86, 0.2], [0.08, 0.72], [0.93, 0.66], [0.27, 0.86]]; // share of the whole screen
// In B the pills sit evenly round the sphere, 72 degrees apart with one at the top
// (degrees clockwise from the right), each the same gap from its edge
const PILL_ANGLE = [-90, -18, 198, 54, 126];
const wideScreen = matchMedia("(min-width: 761px)");
let stageLive = false;
let stageE = 0;

function setStageLive() {
  stageLive = !reducedMotion && wideScreen.matches && !!stage;
  featuresEl?.classList.toggle("orbit-live", stageLive);
  if (!stageLive) [fhA, fhB, lede, ...slots].forEach((el) => el && ["transform", "opacity", "filter"].forEach((k) => (el.style[k] = "")));
}
setStageLive();
wideScreen.addEventListener?.("change", setStageLive);

function stageGeometry() {
  const r = pin.getBoundingClientRect();
  // On tall, narrow screens the sphere shrinks so the tags still fit beside it
  const base = Math.min(innerHeight, innerWidth * 0.62);
  const R = lerp(0.3, 0.21, stageE) * base;
  return { r, W: r.width, H: r.height, cx: r.width / 2, cy: lerp(0.5, 0.545, stageE) * r.height, R, gap: Math.max(28, R * 0.2) };
}

// Where the page's particle sphere sits while section 3 owns the screen
function featureSphere() {
  const minSide = Math.min(innerWidth, innerHeight);
  if (stageLive) {
    const g = stageGeometry();
    return { cx: g.r.left + g.cx, cy: g.r.top + g.cy, radius: g.R, alpha: 1 };
  }
  const o = orbitEl.getBoundingClientRect();
  return { cx: o.left + o.width / 2, cy: o.top + o.height / 2, radius: minSide * 0.34, alpha: 0.45 };
}

// How far along direction (a, b) to centre a hw x hh box so its nearest point is `target` from the origin
function clearDistance(a, b, hw, hh, target) {
  let lo = 0;
  let hi = target + hw + hh;
  for (let n = 0; n < 24; n++) {
    const d = (lo + hi) / 2;
    if (Math.hypot(Math.max(0, d * a - hw), Math.max(0, d * b - hh)) < target) lo = d;
    else hi = d;
  }
  return hi;
}

function updateFeatureStage() {
  if (!stageLive) return;
  const vh = innerHeight;
  const sr = stage.getBoundingClientRect();
  if (sr.bottom < -80 || sr.top > vh + 80) return;
  const t = clamp((clamp(-sr.top / (sr.height - vh)) - 0.15) / 0.5);
  stageE = t * t * (3 - 2 * t);
  const e = stageE;
  const g = stageGeometry();
  // The centred heading clears first, the pills settle by the sphere, then the
  // corner heading and paragraph arrive, so nothing crosses on the way
  const aOut = clamp(e * 2.2);
  fhA.style.transform = `translate(-50%, -50%) translate3d(0, ${(-e * 60).toFixed(1)}px, 0) scale(${(1 - 0.12 * e).toFixed(4)})`;
  fhA.style.opacity = (1 - aOut).toFixed(3);
  fhA.style.filter = aOut > 0.02 ? `blur(${(aOut * 8).toFixed(1)}px)` : "";
  const bIn = clamp((e - 0.5) / 0.45);
  fhB.style.opacity = bIn.toFixed(3);
  fhB.style.transform = `translate3d(0, ${((1 - bIn) * 16).toFixed(1)}px, 0)`;
  const lIn = clamp((e - 0.55) / 0.4);
  lede.style.opacity = lIn.toFixed(3);
  lede.style.transform = `translate3d(0, ${((1 - lIn) * 24).toFixed(1)}px, 0)`;
  const m = 1 - (1 - clamp(e / 0.85)) ** 3;
  const vw = document.documentElement.clientWidth;
  const breath = Math.sin(time * 0.9) * 4;
  slots.forEach((slot, i) => {
    const w = slot.offsetWidth;
    const h = slot.offsetHeight;
    const pill = slot.firstElementChild;
    // Place by the closed size, so a pill that opens under the pointer stays put
    if (!slot._w || !pill.matches(":hover, :focus, .spotlight")) [slot._w, slot._h] = [w, h];
    const [ax, ay] = PILL_A[i % PILL_A.length];
    const th = (PILL_ANGLE[i % PILL_ANGLE.length] * Math.PI) / 180;
    const ux = Math.cos(th);
    const uy = Math.sin(th);
    // Far enough out that the pill's nearest edge is `gap` from the sphere; all breathe together
    const d = clearDistance(Math.abs(ux), Math.abs(uy), slot._w / 2, slot._h / 2, g.R + g.gap) + breath;
    const bob = Math.sin(time * 0.9 + i * 1.7) * 6 * (1 - m);
    // Spread across the whole screen in A, round the sphere in B (screen coordinates)
    const x = clamp(lerp(ax * vw, g.r.left + g.cx + ux * d, m), w / 2 + 16, vw - w / 2 - 16) - g.r.left;
    const y = clamp(lerp(ay * g.H, g.cy + uy * d, m), h / 2 + 16, g.H - h / 2 - 92) + bob; // clear of the dock
    slot.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px, 0)`;
    // The sphere lights the glass on the side facing it: blue from its top half, orange from its bottom
    const vx = g.cx - x;
    const vy = g.cy - y;
    const len = Math.hypot(vx, vy) || 1;
    const k = clamp(0.5 + (y - g.cy) / (g.R * 3));
    pill.style.setProperty("--lx", `${(50 + (50 * vx) / len).toFixed(1)}%`);
    pill.style.setProperty("--ly", `${(50 + (70 * vy) / len).toFixed(1)}%`);
    pill.style.setProperty("--tint", `${Math.round(lerp(120, 255, k))} ${Math.round(lerp(160, 140, k))} ${Math.round(lerp(255, 70, k))}`);
    pill.style.setProperty("--ta", (0.05 + 0.15 * m).toFixed(3));
  });
}

/* ---------- Section 4: the planet rises; its rim lights up behind the chosen plan ---------- */

const planStage = $(".plan-stage");
const planet = $(".planet");
const planGridEl = $(".plan-grid");

function placeRimLight() {
  if (!planet) return;
  const rec = $(".plan.recommended");
  planet.style.setProperty("--hl", rec ? "1" : "0");
  if (!rec) return;
  const c = rec.getBoundingClientRect();
  const pr = planet.getBoundingClientRect();
  planet.style.setProperty("--hx", `${Math.round(c.left + c.width / 2 - pr.left)}px`);
}
if (planGridEl) new MutationObserver(placeRimLight).observe(planGridEl, { attributes: true, subtree: true, attributeFilter: ["class"] });
addEventListener("resize", placeRimLight, { passive: true });

function updateEclipse() {
  if (!planStage || !planet) return;
  const vh = innerHeight;
  const r = planStage.getBoundingClientRect();
  if (r.bottom < -200 || r.top > vh + 200) return;
  const e = 1 - Math.pow(1 - clamp((vh - r.top) / (vh * 0.9)), 3);
  planet.style.setProperty("--rise", `${((1 - e) * 180).toFixed(1)}px`);
  planet.style.setProperty("--glow", e.toFixed(3));
}

/* ---------- Section 5: the two lights drift with the scroll ---------- */

const demoBackdrop = $(".demo-backdrop");
const blobs = $$(".blob");
function updateDemoLights() {
  if (!demoBackdrop) return;
  const vh = innerHeight;
  const r = demoBackdrop.getBoundingClientRect();
  if (r.bottom < 0 || r.top > vh) return;
  const p = (vh - r.top) / (vh + r.height) - 0.5;
  blobs.forEach((b, i) => (b.style.translate = `0 ${((i ? -1 : 1) * p * 180).toFixed(1)}px`));
}

/* ---------- The live call in the features card ---------- */
// Three short calls play in turn. Each line arrives after a typing pause,
// the guide's replies stream in word by word, and every line sends a ripple
// through the dot field from the side of whoever is speaking.

const pageCalls = (() => {
  try { return JSON.parse($("#callScripts")?.textContent || "null"); } catch { return null; }
})();
const CALLS = pageCalls || [
  { meta: "Room 214 · 11:48 pm", done: "Cabana booked for 9 pm", lines: [
    ["g", "Is the pool open late?"],
    ["a", "Until 11pm tonight — want me to book you a cabana?"],
    ["g", "Perfect, yes please."],
  ] },
  { meta: "Room 507 · 7:02 am", done: "Late checkout added", lines: [
    ["g", "Could we check out at 2pm tomorrow?"],
    ["a", "Of course — I've added a 2pm late checkout for room 507."],
    ["g", "Wonderful, thank you."],
  ] },
  { meta: "New caller · 9:15 pm", done: "Reserva confirmada · 1 noche", lines: [
    ["g", "¿Tienen una habitación para el viernes?"],
    ["a", "¡Sí! Una doble con vista al mar por 189 €. ¿Se la reservo?"],
    ["g", "Sí, por favor."],
  ] },
];

const callCard = $(".call-demo");
const callThread = $("[data-call-thread]");
const callMeta = $("[data-call-meta]");
const callTimer = $("[data-call-timer]");
const callCanvas = $(".call-field");
const callCtx = callCanvas?.getContext("2d");
const ripples = [];
let callVisible = false;
let callStart = performance.now();
let dots = [];
let fieldSize = { w: 0, h: 0, dpr: 1 };

function layoutDots() {
  if (!callCanvas) return;
  const r = callCanvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (!r.width || (r.width === fieldSize.w && r.height === fieldSize.h && dpr === fieldSize.dpr)) return;
  fieldSize = { w: r.width, h: r.height, dpr };
  callCanvas.width = Math.round(r.width * dpr);
  callCanvas.height = Math.round(r.height * dpr);
  dots = [];
  const gap = 22;
  for (let y = gap / 2; y < r.height; y += gap) {
    for (let x = gap / 2; x < r.width; x += gap) {
      const c = colorFor(1 - (y / r.height) * 2).map((v) => Math.min(255, Math.round(v * 255)));
      dots.push({ x: x + (Math.random() - 0.5) * 5, y: y + (Math.random() - 0.5) * 5, c: c.join(","), a: 0.16 + Math.random() * 0.26, ph: Math.random() * 6.28 });
    }
  }
}

function drawDots(t) {
  const { w, h, dpr } = fieldSize;
  if (!callCtx || !w) return;
  callCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  callCtx.clearRect(0, 0, w, h);
  while (ripples.length && t - ripples[0].t0 > 2.6) ripples.shift();
  for (const d of dots) {
    let dx = 0, dy = 0, glow = 0;
    for (const rp of ripples) {
      const age = t - rp.t0;
      const vx = d.x - rp.x, vy = d.y - rp.y;
      const dist = Math.hypot(vx, vy) || 1;
      const band = Math.exp(-((dist - age * 280) ** 2) / 1100) * (1 - age / 2.6);
      dx += (vx / dist) * band * 6;
      dy += (vy / dist) * band * 6;
      glow += band;
    }
    const twinkle = 0.7 + 0.3 * Math.sin(t * 1.3 + d.ph);
    const a = Math.min(1, d.a * twinkle + glow * 0.85);
    const size = 1.6 + glow * 1.8;
    callCtx.fillStyle = `rgba(${d.c},${a.toFixed(3)})`;
    callCtx.fillRect(d.x + dx - size / 2, d.y + dy - size / 2, size, size);
  }
}

function ripple(el, who) {
  if (!callCanvas) return;
  const c = callCanvas.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = who === "g" ? r.left - c.left + 24 : who === "a" ? r.right - c.left - 24 : r.left - c.left + r.width / 2;
  ripples.push({ x, y: r.top - c.top + r.height / 2, t0: time });
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
async function whenVisible() {
  while (!callVisible || document.hidden) await wait(250);
}
function node(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.dir = "auto";
  if (text) d.textContent = text;
  return d;
}

async function playCall(call) {
  callThread.classList.remove("out");
  callThread.replaceChildren();
  callMeta.textContent = call.meta;
  callStart = performance.now();
  for (const [who, text] of call.lines) {
    await whenVisible();
    const typing = node(`mini-bubble ${who} typing enter`);
    typing.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    callThread.append(typing);
    await wait(who === "a" ? 1200 : 800);
    const bubble = node(`mini-bubble ${who} enter`, who === "a" ? "" : text);
    typing.replaceWith(bubble);
    ripple(bubble, who);
    if (who === "a") {
      // The reply streams in, word by word
      const words = text.split(" ").map((w) => {
        const s = document.createElement("span");
        s.className = "w";
        s.textContent = w;
        return s;
      });
      words.forEach((s, i) => bubble.append(s, i < words.length - 1 ? " " : ""));
      for (const s of words) {
        s.classList.add("on");
        await wait(75);
      }
    }
    await wait(900 + text.length * 22);
  }
  const done = node("call-done enter");
  done.innerHTML = '<svg aria-hidden="true"><use href="#i-tick" /></svg>';
  done.append(Object.assign(document.createElement("span"), { textContent: call.done, dir: "auto" }));
  callThread.append(done);
  ripple(done, "done");
  await wait(3000);
  callThread.classList.add("out");
  await wait(650);
}

async function runCalls() {
  for (let i = 0; ; i++) {
    await whenVisible();
    await playCall(CALLS[i % CALLS.length]);
  }
}

function updateCallTimer() {
  if (!callTimer) return;
  const s = Math.floor((performance.now() - callStart) / 1000);
  const label = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  if (callTimer.textContent !== label) callTimer.textContent = label;
}

if (callCard && callThread) {
  new IntersectionObserver(([e]) => {
    callVisible = e.isIntersecting;
    if (callVisible) layoutDots();
  }, { threshold: 0.2 }).observe(callCard);
  addEventListener("resize", layoutDots, { passive: true });
  if (!reducedMotion) runCalls();
}

/* ---------- A light that follows the cursor on cards ---------- */

if (matchMedia("(hover: hover)").matches) {
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });
}

/* ---------- Small orbs: ROI card, dock and start sheet ---------- */

let fieldGL = null;
const minis = [];

function createGL() {
  try {
    if (fxCanvas) fieldGL = new ParticleOrb(fxCanvas, innerWidth < 700 ? 11000 : 26000);
  } catch (err) {
    console.warn("Particle field disabled —", err.message);
    root.classList.add("no-webgl");
    return;
  }
  // [selector, points, is decorative (ignores the voice)]
  [[".roi-orb", 2200, true], [".dock .orb-sm", 1400, false], [".sheet .orb-xs", 2400, false]].forEach(([sel, count, still]) => {
    const host = $(sel);
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);
    try {
      minis.push({ host, still, gl: new ParticleOrb(canvas, count), rot: Math.random() * 6 });
    } catch {
      canvas.remove();
    }
  });
}

function drawMini(m, time, dt) {
  if (!m.host.getClientRects().length) return; // closed dialog
  const r = m.host.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return; // off screen
  const level = m.still ? 0 : readLevel(m.host);
  m.rot += dt * (0.25 + level * 0.8 + (m.still ? 0 : states.thinking * 0.6));
  m.gl.resize();
  m.gl.draw({
    time, level, bright,
    states: m.still ? QUIET : states,
    rot: m.rot, tilt: 0.3, point: 1.15,
    alpha: 1,
    center: [0, 0],
    scale: [0.8, 0.8],
  });
}

/* ---------- Loop ---------- */

let last = performance.now();
let time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  lenis?.raf(now);
  updateStates(dt);
  updateScrollFx();
  updateProfileGlow();
  updateFeatureStage();
  updateEclipse();
  updateDemoLights();
  if (fieldGL) drawField(time, dt);
  updateDrift();
  minis.forEach((m) => drawMini(m, time, dt));
  if (callVisible) {
    drawDots(time);
    updateCallTimer();
  }
  requestAnimationFrame(frame);
}

function stillFrames() {
  // Reduced motion: still frames, redrawn only when something changes.
  const still = () => {
    if (fieldGL) drawField(2, 0.016);
    minis.forEach((m) => drawMini(m, 2, 0));
    if (callVisible) {
      layoutDots();
      drawDots(2);
    }
  };
  still();
  addEventListener("resize", still);
  addEventListener("scroll", still, { passive: true });
  const sheet = $("#startSheet");
  if (sheet) new MutationObserver(still).observe(sheet, { attributes: true, attributeFilter: ["open"] });
}

function boot() {
  createGL();
  startSmoothScroll();
  if (reducedMotion) stillFrames();
  else requestAnimationFrame((now) => { last = now; frame(now); });
}

// Start the particles after the page has painted, so they never delay the first view.
if ("requestIdleCallback" in window) requestIdleCallback(boot, { timeout: 500 });
else setTimeout(boot, 120);
