// Aria — the night experience, top to bottom.
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
const WINDOWS = [[0, 0.3], [0.3, 0.64], [0.64, 1.01]];

// Each scene is centred on an anchor element (or the screen), with its radius
// as a share of the screen's shorter side.
const SCENES = [
  { el: $("#profile"), anchor: $("#roi"), r: 0.34, alpha: 0.5 },
  { el: $("#features"), anchor: $("#features .bento"), r: 0.3, ring: 1, alpha: 0.55 },
  { el: $("#pricing"), r: 0.32, field: 1, alpha: 0.45 },
  { el: $("#demo"), anchor: $(".demo-copy"), r: 0.3, alpha: 0.6 },
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
    beat.style.setProperty("--vis", vis.toFixed(3));
    beat.style.setProperty("--bp", clamp((p - a) / ((b - a) * 0.6)).toFixed(3));
  });
  if (beatTime) {
    beatTime.style.setProperty("--to", (1 - smooth(0.2, 0.3, p)).toFixed(3));
    beatTime.style.setProperty("--ts", (1.14 - 0.14 * smooth(0, 0.26, p)).toFixed(4));
  }
  // Greetings in many languages rise past, as if spoken into the room.
  const g = clamp((p - 0.3) / 0.34);
  const reach = Math.max(innerWidth, innerHeight) * 0.55;
  greetings.forEach((li, i) => {
    const t = clamp((g - i * 0.07) / 0.45);
    if (t <= 0 || t >= 1) { li.style.opacity = "0"; return; }
    const a = -Math.PI * (0.1 + 0.8 * (i / (greetings.length - 1)));
    const d = Math.pow(t, 1.3) * reach;
    li.style.opacity = (Math.sin(t * Math.PI) * 0.55).toFixed(3);
    li.style.transform = `translate(-50%, -50%) translate3d(${(Math.cos(a) * d * 1.1).toFixed(1)}px, ${(Math.sin(a) * d * 0.5).toFixed(1)}px, 0) scale(${(0.4 + t * 1.5).toFixed(3)})`;
  });
  if (storyCount) {
    storyCount.style.setProperty("--sp", p.toFixed(3));
    storyCount.style.opacity = (1 - smooth(0.95, 1, p)).toFixed(3);
    const label = `0${p < WINDOWS[1][0] ? 1 : p < WINDOWS[2][0] ? 2 : 3}`;
    if (label !== lastCount && countEl) countEl.textContent = lastCount = label;
  }
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
  // Aria jumps the page past it.
  const sr = story?.getBoundingClientRect();
  if (sr && sr.bottom > 0 && sr.top < vh) {
    const goal = reducedMotion ? 0 : storyProgress();
    storyP += (goal - storyP) * Math.min(1, dt * 7);
    if (Math.abs(goal - storyP) > 0.35) storyP = goal;
    if (!reducedMotion) updateStory(storyP);
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
      wave: smooth(0.3, 0.42, storyP) * (1 - smooth(0.62, 0.72, storyP)),
      field: smooth(0.64, 0.8, storyP),
      ring: 0,
      alpha: 1,
    };
    k = Math.min(1, dt * 12);
  } else {
    sceneTarget = scene;
    const a = scene.anchor?.getBoundingClientRect();
    target = {
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

  const level = readLevel(heroAnchor);
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

/* ---------- Outlined numerals and the wordmark drift as you scroll ---------- */

const drifters = $$(".section-num, .wordmark");
function updateDrift() {
  const vh = innerHeight;
  drifters.forEach((el) => {
    const r = el.parentElement.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) return;
    const p = (vh - r.top) / (vh + r.height); // 0 entering, 1 leaving
    el.style.setProperty("--py", `${((0.5 - p) * (el.classList.contains("wordmark") ? 90 : 140)).toFixed(1)}px`);
  });
}

/* ---------- Top bar: transparent at the top, glass once you scroll ---------- */

function updateTop() {
  const top = scrollY < 40 ? "1" : "0";
  if (body.dataset.top !== top) body.dataset.top = top;
}
addEventListener("scroll", updateTop, { passive: true });
updateTop();

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
    console.warn("Aria: particle field disabled —", err.message);
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
  updateStates(dt);
  if (fieldGL) drawField(time, dt);
  updateDrift();
  minis.forEach((m) => drawMini(m, time, dt));
  requestAnimationFrame(frame);
}

function stillFrames() {
  // Reduced motion: still frames, redrawn only when something changes.
  const still = () => {
    if (fieldGL) drawField(2, 0.016);
    minis.forEach((m) => drawMini(m, 2, 0));
  };
  still();
  addEventListener("resize", still);
  addEventListener("scroll", still, { passive: true });
  const sheet = $("#startSheet");
  if (sheet) new MutationObserver(still).observe(sheet, { attributes: true, attributeFilter: ["open"] });
}

function boot() {
  createGL();
  if (reducedMotion) stillFrames();
  else requestAnimationFrame((now) => { last = now; frame(now); });
}

// Start the particles after the page has painted, so they never delay the first view.
if ("requestIdleCallback" in window) requestIdleCallback(boot, { timeout: 500 });
else setTimeout(boot, 120);
