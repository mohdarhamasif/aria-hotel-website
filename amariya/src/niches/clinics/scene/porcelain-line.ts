// The clinics orb: frosted porcelain lit by the visitor's own sun, and the paper she rests on, in one shader pass.
// Extends the shared porcelain.ts quad (orthographic, analytic sphere, SIMPLEX frost, Gaussian core, pressure rings, halo) with
// sundial lighting and translucency, the paper layer (cast shadow, contact line, AO, the night pool), the engraved graticule,
// glaze crazing, the lithophane (relief, core-lit carving, 500 ms cross-fade), the underglaze mark, the leaning core,
// and the state craft (condensation ring, listening diaphragm, thinking glint, speaking engravings, tones).
// It draws in its own box around the root (2.6 r, widened for the shadow and the pool) on the fixed stage canvas.
import * as THREE from 'three';
import { colors } from '../../../data/colors';
import { SIMPLEX } from '../../../scripts/orb/glsl';
import type { OrbScene } from '../../../scripts/orb/stage';
import { voice } from '../../../scripts/voice/bridge';
import { content } from '../../../data/content/clinics';
import { sun } from './sun';
import { LITHO_H, LITHO_W, MARK_SIZE, drawLithophane, drawMark } from './textures';
import type { World } from './types';

const C = colors.clinics;
/** The shader blends in sRGB, so colours go in as raw sRGB components */
const srgb = (hex: string) => new THREE.Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
/** The paper box never reaches further than this many radii from her centre (a dawn shadow fades out at its edge) */
const REACH = 4.5;
const FADE = 0.5;
const TURN = 0.9;
const CURSOR_LEAN = (8 * Math.PI) / 180;

/** cubic-bezier(.45, 0, .2, 1): the turn-over */
function easeTurn(x: number) {
  const x1 = 0.45, x2 = 0.2, cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 0, by = 3 * (1 - 0) - cy, ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
    t = Math.max(0, Math.min(1, t - err / d));
  }
  return ((ay * t + by) * t + cy) * t;
}

const FRAGMENT = /* glsl */ `
uniform vec2 uCentre;
uniform float uRpx, uCssPx;
uniform vec4 uBox;
uniform float uTime, uAmp, uListen, uSpeak, uConnect, uThink, uCalm, uWarmTone;
uniform float uBreath, uCoreR, uCoreGain, uGain, uFrost, uWarm, uRing, uGlint, uHalo, uTier, uMix;
uniform vec2 uWarmAt, uLean;
uniform mat3 uRot;
uniform vec3 uSun;
uniform float uDay, uElev, uLift, uMarkOn;
uniform sampler2D uLitho, uLithoB, uMark;
uniform vec3 uBody, uShade, uGlowDeep, uGlow, uGlowHot, uOrbWarm, uEngrave, uTrans, uInk, uPool, uUnderglaze;
${SIMPLEX}

vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// Cellular noise: distances to the nearest and second-nearest cell points (the glaze's craze lines run where they meet)
vec2 voronoi(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int h = -1; h <= 1; h++) {
    vec3 b = vec3(float(h), float(j), float(k));
    vec3 r = b - f + hash3(i + b);
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}
// One family of 30° grooves: x in radians, arc turns it into surface distance, side says which edge faces the light
vec2 groove(float x, float arc, float side, float px) {
  float s = (fract(x / 0.5235988 + 0.5) - 0.5) * 0.5235988 * arc;
  float g = 1.0 - smoothstep(0.006, 0.006 + px, abs(s));
  float e = s * side;
  float lip = smoothstep(0.006, 0.006 + 0.5 * px, e) * (1.0 - smoothstep(0.006 + px, 0.006 + 2.0 * px, e));
  return vec2(g, lip);
}

void main() {
  vec2 p = (gl_FragCoord.xy - uCentre) / uRpx;
  float rho = length(p);
  float px = 1.0 / uRpx;
  float inside = 1.0 - smoothstep(1.0 - px, 1.0 + px, rho);

  // ---- The paper: the shadow of a sphere on the plane, seen from above ----
  vec2 sxy = length(uSun.xy) > 1e-4 ? normalize(uSun.xy) : vec2(0.0, 1.0);
  float sinT = sin(uElev), cotT = cos(uElev) / sinT;
  vec2 q = p + sxy * (1.0 + 0.35 * uLift) * cotT;
  float e = length(vec2(dot(q, -sxy) * sinT, dot(q, vec2(-sxy.y, sxy.x)))) - 1.0;
  float away = max(rho - 1.0, 0.0);
  float w = 0.08 + 0.22 * away + 0.2 * uLift;
  float cast_ = (1.0 - smoothstep(-w, w, e)) * mix(0.12, 0.07, uLift) / (1.0 + 0.25 * away);
  // The contact line hugs her edge away from the light; lifting her spreads and lightens it
  float de = max(length(p + sxy * mix(6.0, 18.0, uLift) * uCssPx) - 1.0, 0.0);
  float sig = mix(10.0, 28.0, uLift) * uCssPx * 0.55;
  float contact = mix(0.22, 0.12, uLift) * exp(-(de * de) / (sig * sig));
  float ao = 0.12 * (1.0 - smoothstep(1.0, 1.15, rho));
  float shade = min(0.16, cast_ * uDay + (contact + ao) * mix(0.55, 1.0, uDay));
  // At night the core lights the paper instead
  float pool = (1.0 - uDay) * 0.18 * exp(-pow(rho / 2.2, 2.0)) * (0.85 + 0.3 * uSpeak * uAmp);
  float edge = min(min(p.x - uBox.x, uBox.z - p.x), min(p.y - uBox.y, uBox.w - p.y));
  float fade = smoothstep(0.0, ${FADE.toFixed(2)}, edge);
  shade *= fade;
  pool *= fade;
  float halo = exp(-away * 7.0) * (0.12 + 0.2 * uAmp + 0.06 * uListen) * uHalo * (1.0 - smoothstep(1.16, 1.28, rho));
  vec3 paper = uInk * shade + uPool * pool + uGlow * halo;
  float paperA = shade + pool + halo;

  vec3 col = uBody;
  // Everything below runs only on her (with a 4 px margin, so derivatives at the edge stay defined where it shows)
  if (rho < 1.0 + 4.0 * px) {
    float z = sqrt(max(0.0, 1.0 - rho * rho));
    vec3 n = normalize(vec3(p, z));
    vec3 o = uRot * n;

    // Frost: the state's frost x the cursor's warm spot x the listening diaphragm; it lives on her, so it turns with her
    float warm = uWarm * 0.3 * (1.0 - smoothstep(0.0, 0.55, distance(p, uWarmAt)));
    float dia = uListen * (1.0 - smoothstep(0.38, 0.45, rho));
    float frost = uFrost * (1.0 - warm) * (1.0 - dia);
    float clear = clamp(1.0 - frost, 0.0, 1.0);
    vec3 grain = vec3(snoise(o * 9.0 + uTime * 0.02), snoise(o * 9.0 + 19.1), snoise(o * 9.0 + 41.7));
    if (uTier > 0.5) grain += 0.55 * vec3(snoise(o * 23.0 + 7.3), snoise(o * 23.0 + 27.9), snoise(o * 23.0 + 55.1));
    n = normalize(n + (grain * uRot) * 0.035 * frost);

    // The lithophane, equirectangular around her pole (screen-up at rest); no mip seam at the back meridian
    float lat = asin(clamp(o.y, -1.0, 1.0));
    float lon = atan(o.x, o.z);
    vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5);
    dy.x -= floor(dy.x + 0.5);
    float th = textureGrad(uLitho, uv, dx, dy).r;
    if (uMix > 0.0) th = mix(th, textureGrad(uLithoB, uv, dx, dy).r, uMix);
    // Front light shows the carving as faint relief
    if (uTier > 0.5) n = normalize(n + vec3(dFdx(th), dFdy(th), 0.0) * uRpx * 0.002);

    // The underglaze mark on her base, sunk a little into the glaze (mirrored so it reads once she is turned over)
    // Shown only while she is turned over for it (uMarkOn follows the turn): turning 40° a greeting, she would
    // otherwise show her base at the fifth and read "No. 01 / 30" in the story
    float mk = texture(uMark, vec2(-o.x, o.y) * (0.5 / 0.835) + 0.5).r * (1.0 - smoothstep(-0.7, -0.55, o.z)) * uMarkOn;
    n = normalize(n + vec3(dFdx(mk), dFdy(mk), 0.0) * uRpx * 0.0015);

    // The sundial: wrapped diffuse, translucency at the far edge, Blinn-Phong from frosted (36) to cleared (140)
    float ns = dot(n, uSun);
    float lit = mix(0.35, clamp((ns + 0.35) / 1.35, 0.0, 1.0), uDay);
    col = mix(uShade, uBody, lit);
    col = mix(col, uTrans, pow(clamp(-ns, 0.0, 1.0), 2.0) * 0.25 * uDay);
    float nh = max(dot(n, normalize(uSun + vec3(0.0, 0.0, 1.0))), 0.0);
    float spec = pow(nh, mix(36.0, 140.0, clear)) * mix(0.26, 0.45, clear) * uDay;
    if (uTier > 0.5) {
      vec2 F = voronoi(o * 5.5);
      float gap = F.y - F.x;
      spec += 0.25 * (1.0 - smoothstep(0.018, 0.018 + 1.5 * fwidth(gap), gap)) * pow(nh, 12.0) * uDay;
    }
    col = mix(col, uEngrave, th * 0.28);

    // Engraved graticule every 30°: a darker groove with a one-pixel bright lip on the lit side
    float cl = max(cos(lat), 1e-3);
    vec3 sObj = uRot * uSun;
    float pxs = px / max(z, 0.2);
    vec2 gLat = groove(lat, 1.0, sign(dot(vec3(-o.x * o.y, cl * cl, -o.z * o.y) / cl, sObj)), pxs);
    vec2 gLon = groove(lon, cl, sign(dot(vec3(o.z, 0.0, -o.x) / cl, sObj)), pxs / cl);
    float grooves = max(gLat.x, gLon.x);
    col *= 1.0 - 0.06 * grooves;
    col += max(gLat.y, gLon.y) * 0.05 * mix(0.4, 1.0, uDay);
    // Thinking: a glint sweeps the grooves
    float gd = (p.x * 0.8 + p.y * 0.6 - uGlint) / 0.09;
    float band = uThink * exp(-gd * gd);
    col += band * (0.35 * grooves + 0.06);

    // The core: the existing Gaussian light, leaning toward the cursor, breathing, drawn in while she listens
    vec2 cp = p - uLean;
    float cr = length(cp);
    float radius = uCoreR * (1.0 + 0.03 * uBreath);
    float shape = 1.0 + 0.16 * snoise(vec3(o.xy * 1.3, uTime * 0.08));
    float g = exp(-pow(cr / (radius * shape), 2.0) * 1.1);
    float rings = (0.5 + 0.5 * sin(cr * 24.0 - uTime * 5.5)) * exp(-cr * 2.2);
    g = clamp(g + uSpeak * uAmp * rings * 0.35, 0.0, 1.0);
    // Connecting: condensation contracts from her rim to the core
    float rd = (rho - uRing) / 0.045;
    g = max(g, uConnect * 0.5 * exp(-rd * rd));
    vec3 core = mix(uGlowHot, uGlow, smoothstep(0.15, 0.7, g));
    core = mix(core, uGlowDeep, smoothstep(0.8, 1.0, g) * 0.5 * uSpeak * uAmp);
    core = mix(core, uGlowDeep, uListen * 0.45 * smoothstep(0.3, 1.0, g));
    core = mix(core, uGlowHot, clamp(uAmp * 0.6, 0.0, 0.6) * smoothstep(0.3, 1.0, g) * uSpeak);
    core = mix(core, uUnderglaze, uCalm * 0.35 * smoothstep(0.2, 1.0, g));
    core = mix(core, uOrbWarm, uWarmTone * 0.45 * smoothstep(0.7, 1.0, g));
    col = mix(col, core, smoothstep(0.02, 0.85, g) * 0.78 * mix(0.55, 1.0, clear) * uCoreGain);
    // Her words light the carving from inside: thin porcelain glows (T = core · mix(.12, 1, th) · gain)
    float gT = exp(-pow(cr / (radius * 2.4), 2.0));
    col = mix(col, mix(uGlow, uGlowHot, 0.55), clamp(gT * th * uGain * 0.88, 0.0, 1.0) * 0.85);
    // Short chords near the rim let the core through while she speaks
    col = mix(col, uGlow, uSpeak * uAmp * pow(1.0 - z, 3.0) * 0.35);

    col = mix(col, uUnderglaze, mk * 0.85);
    col = mix(col, uBody, pow(1.0 - z, 2.4) * 0.6);
    col += spec;
  }
  gl_FragColor = vec4(col * inside + paper * (1.0 - inside), clamp(inside + paperA * (1.0 - inside), 0.0, 1.0));
}`;

function texture(canvas: HTMLCanvasElement, red: boolean, wrap: boolean) {
  const t = new THREE.CanvasTexture(canvas);
  if (red) t.format = THREE.RedFormat;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  return t;
}

function blank(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
  return c;
}

export function createPorcelainLine(world: World): OrbScene {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let canvasA = blank(LITHO_W, LITHO_H), canvasB = blank(LITHO_W, LITHO_H);
  const markCanvas = blank(MARK_SIZE, MARK_SIZE);
  let texA = texture(canvasA, true, true), texB = texture(canvasB, true, true);
  const texMark = texture(markCanvas, true, false);

  const uniforms = {
    uCentre: { value: new THREE.Vector2() },
    uRpx: { value: 100 },
    uCssPx: { value: 0.01 },
    uBox: { value: new THREE.Vector4(-1.3, -1.3, 1.3, 1.3) },
    uTime: { value: 0 },
    uAmp: { value: 0 },
    uListen: { value: 0 },
    uSpeak: { value: 0 },
    uConnect: { value: 0 },
    uThink: { value: 0 },
    uCalm: { value: 0 },
    uWarmTone: { value: 1 },
    uBreath: { value: 0 },
    uCoreR: { value: 0.38 },
    uCoreGain: { value: 1 },
    uGain: { value: 0.15 },
    uFrost: { value: 1 },
    uWarm: { value: 0 },
    uRing: { value: 1 },
    uGlint: { value: -2 },
    uHalo: { value: 1 },
    uTier: { value: 1 },
    uMix: { value: 0 },
    uWarmAt: { value: new THREE.Vector2() },
    uLean: { value: new THREE.Vector2() },
    uRot: { value: new THREE.Matrix3() },
    uSun: { value: new THREE.Vector3(0, 0.6, 0.8) },
    uDay: { value: 1 },
    uElev: { value: 0.8 },
    uLift: { value: 0 },
    uLitho: { value: texA },
    uLithoB: { value: texB },
    uMark: { value: texMark },
    uMarkOn: { value: 0 },
    uBody: { value: srgb(C['orb-body']) },
    uShade: { value: srgb(C['orb-shade']) },
    uGlowDeep: { value: srgb(C['orb-glow-deep']) },
    uGlow: { value: srgb(C['orb-glow']) },
    uGlowHot: { value: srgb(C['orb-glow-hot']) },
    uOrbWarm: { value: srgb(C['orb-warm']) },
    uEngrave: { value: srgb(C['orb-engrave']) },
    // Translucency at the far edge: steel-100 (the palette's handoff-bg is that step)
    uTrans: { value: srgb(C['handoff-bg']) },
    uInk: { value: srgb(C['shadow-ink']) },
    uPool: { value: srgb(C.pool) },
    // Steel-700: the mark, and where the core drifts in a calm tone
    uUnderglaze: { value: srgb(C.underglaze) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: FRAGMENT,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  // Orientation: lean · pose (yaw, pitch, self-turn, turn-over) · roll; uploaded as world → object
  const qPose = new THREE.Quaternion(), qLean = new THREE.Quaternion(), qRoll = new THREE.Quaternion(), qStep = new THREE.Quaternion();
  const qFrame = new THREE.Quaternion(), qInv = new THREE.Quaternion(), identity = new THREE.Quaternion();
  const euler = new THREE.Euler(), axis = new THREE.Vector3(), m4 = new THREE.Matrix4();

  let width = 1, height = 1, dpr = 1;
  const box = { x: 0, y: 0, w: 0, h: 0 }, prev = { x: 0, y: 0, w: 0, h: 0 };
  let visible = false;
  let self = 0, turn = 0, breath = 0, frost = 1, warm = 0, near = 0, afterCall = false;
  const lean = new THREE.Vector2();

  // Lithophane: draw the next version into B, cross-fade 500 ms, then swap
  let litho = -1, drawing = false, fadeFrom = -1, markN = -1;
  const spec = () => ({ key: world.litho.key, order: world.litho.order, name: world.litho.name, greetings: content.greetings });
  const redraw = async (instant: boolean) => {
    drawing = true;
    const version = world.litho.version;
    try {
      await drawLithophane(litho < 0 ? canvasA : canvasB, spec());
    } finally {
      drawing = false;
    }
    if (litho < 0 || instant) {
      if (litho >= 0) [canvasA, canvasB, texA, texB] = [canvasB, canvasA, texB, texA];
      texA.needsUpdate = true;
      uniforms.uLitho.value = texA;
      uniforms.uLithoB.value = texB;
      uniforms.uMix.value = 0;
      fadeFrom = -1;
    } else {
      texB.needsUpdate = true;
      fadeFrom = performance.now();
    }
    litho = version;
  };

  function sync(dt: number) {
    if (!drawing && fadeFrom < 0 && world.litho.version !== litho) void redraw(dt === 0);
    if (fadeFrom >= 0) {
      const p = dt === 0 ? 1 : Math.min(1, (performance.now() - fadeFrom) / 1000 / FADE);
      uniforms.uMix.value = p;
      if (p >= 1) {
        [canvasA, canvasB, texA, texB] = [canvasB, canvasA, texB, texA];
        uniforms.uLitho.value = texA;
        uniforms.uLithoB.value = texB;
        uniforms.uMix.value = 0;
        fadeFrom = -1;
      }
    }
    if (world.mark.n !== markN && !drawing) {
      markN = world.mark.n;
      const full = content.licence.mark.underglaze(markN), cut = full.lastIndexOf(' · ');
      const centre = full.slice(cut + 3), slash = centre.indexOf(' / ');
      void drawMark(markCanvas, full.slice(0, cut), [centre.slice(0, slash), centre.slice(slash + 1), content.licence.mark.next]).then(() => { texMark.needsUpdate = true; });
    }
  }

  return {
    alpha: true,
    setup(renderer) {
      const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      texA.anisotropy = texB.anisotropy = aniso;
    },
    resize(w, h, d) {
      width = w;
      height = h;
      dpr = d;
      prev.w = 0;
    },
    update(f) {
      const dt = f.dt;
      const body = world.body;
      sync(dt);
      const v = f.view;
      visible = v.w > 1 && v.h > 1;
      if (!visible) return;
      const R = v.w / 2;
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      uniforms.uCentre.value.set(cx, cy);
      uniforms.uRpx.value = R;
      uniforms.uCssPx.value = dpr / R;

      // The sun (or the night), and the paper box it needs
      const s = sun.reading;
      uniforms.uSun.value.set(s.dir[0], s.dir[1], s.dir[2]);
      uniforms.uDay.value = s.day;
      uniforms.uElev.value = s.el;
      uniforms.uLift.value = Math.max(0, Math.min(1, body.z));
      const ext = { l: 1.3, r: 1.3, b: 1.3, t: 1.3 };
      if (s.day > 0) {
        const sl = Math.hypot(s.dir[0], s.dir[1]) || 1, ux = s.dir[0] / sl, uy = s.dir[1] / sl;
        const cot = Math.cos(s.el) / Math.sin(s.el), a = 1 / Math.sin(s.el) + 0.45, bb = 1.45;
        const ex = -ux * (1 + 0.35 * body.z) * cot, ey = -uy * (1 + 0.35 * body.z) * cot;
        const hx = Math.hypot(a * ux, bb * uy), hy = Math.hypot(a * uy, bb * ux);
        ext.l = Math.max(ext.l, hx - ex + FADE);
        ext.r = Math.max(ext.r, ex + hx + FADE);
        ext.b = Math.max(ext.b, hy - ey + FADE);
        ext.t = Math.max(ext.t, ey + hy + FADE);
      }
      if (s.day < 1) { ext.l = Math.max(ext.l, 3.6); ext.r = Math.max(ext.r, 3.6); ext.b = Math.max(ext.b, 3.6); ext.t = Math.max(ext.t, 3.6); }
      ext.l = Math.min(ext.l, REACH); ext.r = Math.min(ext.r, REACH); ext.b = Math.min(ext.b, REACH); ext.t = Math.min(ext.t, REACH);
      const W = width * dpr, Hh = height * dpr;
      const x0 = Math.max(0, Math.floor(cx - ext.l * R)), y0 = Math.max(0, Math.floor(cy - ext.b * R));
      const x1 = Math.min(W, Math.ceil(cx + ext.r * R)), y1 = Math.min(Hh, Math.ceil(cy + ext.t * R));
      Object.assign(box, { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) });
      uniforms.uBox.value.set(-ext.l, -ext.b, ext.r, ext.t);

      // State craft
      uniforms.uTime.value = f.t;
      uniforms.uAmp.value = f.amp;
      uniforms.uListen.value = f.listen;
      uniforms.uSpeak.value = f.speak;
      uniforms.uConnect.value = f.connect;
      uniforms.uThink.value = f.think;
      uniforms.uCalm.value = f.calm;
      uniforms.uWarmTone.value = Math.max(0, 1 - f.bright - f.soft - f.calm);
      breath += dt * ((2 * Math.PI) / (10 + 4 * f.calm));
      uniforms.uBreath.value = Math.sin(breath);
      const coreR = ((0.38 + (0.3 - 0.38) * f.listen + 0.18 * f.amp * f.speak) * (1 - 0.3 * f.connect)) * (1 - 0.08 * f.listen * f.amp);
      uniforms.uCoreR.value = coreR;
      uniforms.uCoreGain.value = (1 - 0.15 * f.think) * (1 + 0.12 * f.bright);
      uniforms.uGain.value = (0.15 + (0.2 + 0.8 * f.amp - 0.15) * f.speak) * (1 + 0.2 * f.bright);
      uniforms.uHalo.value = 1 - 0.3 * f.soft;
      uniforms.uRing.value = 1 - ((f.t / 1.2) % 1) * (1 - coreR);
      uniforms.uGlint.value = -1.4 + 2.8 * ((f.t / 1.8) % 1);
      // Frost: muted 1.4, connecting 1.25, a call clears it a little; after the call it frosts back over 2.4 s
      const state = voice.state, call = state !== 'idle';
      const target = (voice.muted && call ? 1.4 : state === 'connecting' ? 1.25 : call ? 0.8 : 1) * (1 + 0.2 * f.soft);
      if (call) afterCall = true;
      frost = dt ? frost + (target - frost) * (1 - Math.exp(-dt / (!call && afterCall ? 0.8 : 0.3))) : target;
      if (!call && Math.abs(frost - target) < 0.01) afterCall = false;
      uniforms.uFrost.value = frost;
      // Warm hands on cold porcelain: the cursor's spot clears 30 % in .6 s and frosts back over 4 s
      const hovering = f.hover > 0.5 || world.near > 0.5;
      warm = dt ? warm + ((hovering ? 1 : 0) - warm) * (1 - Math.exp(-dt / (hovering ? 0.6 : 4))) : hovering ? 1 : warm;
      uniforms.uWarm.value = warm;
      const pl = Math.hypot(f.pointer.x, f.pointer.y), k = pl > 0.95 ? 0.95 / pl : 1;
      uniforms.uWarmAt.value.set(f.pointer.x * k, f.pointer.y * k);
      // Attentive: the core leans up to .18 r toward a near cursor, and she tilts up to 8° toward it (τ 250 ms)
      near = dt ? near + (world.near - near) * (1 - Math.exp(-dt / 0.25)) : world.near;
      const dir = pl > 1e-3 ? 1 / pl : 0;
      lean.set(f.pointer.x * dir * near, f.pointer.y * dir * near);
      uniforms.uLean.value.set(lean.x * 0.18, lean.y * 0.18);

      // Orientation
      if (world.lock) self += (Math.round(self / (2 * Math.PI)) * 2 * Math.PI - self) * (dt ? 1 - Math.exp(-dt / 0.4) : 1);
      else self += dt * (0.04 + ((25 * Math.PI) / 180) * f.think);
      const want = world.mark.shown ? 1 : 0;
      turn = dt ? (want > turn ? Math.min(want, turn + dt / TURN) : Math.max(want, turn - dt / TURN)) : want;
      uniforms.uMarkOn.value = turn;
      qPose.setFromEuler(euler.set(f.pitch, f.yaw + self + Math.PI * easeTurn(turn), 0));
      const lx = body.lx + lean.x * CURSOR_LEAN, ly = body.ly + lean.y * CURSOR_LEAN, la = Math.hypot(lx, ly);
      if (la > 1e-5) qLean.setFromAxisAngle(axis.set(-ly / la, lx / la, 0), la);
      else qLean.identity();
      qFrame.multiplyQuaternions(qLean, qPose);
      const w = Math.hypot(body.wx, body.wy);
      if (dt && w * dt > 1e-6) {
        // Roll about the world axis ẑ × v̂, carried into her own frame so the graticule rolls the way she travels
        qStep.setFromAxisAngle(axis.set(body.wx / w, body.wy / w, 0), w * dt);
        qInv.copy(qFrame).invert();
        qRoll.premultiply(qInv.multiply(qStep).multiply(qFrame));
      }
      // At rest a weighted base rights her: the mark goes back underneath, the carving faces front
      if (body.resting && dt) qRoll.slerp(identity, 1 - Math.exp(-dt / 0.6));
      qFrame.multiply(qRoll).invert();
      uniforms.uRot.value.setFromMatrix4(m4.makeRotationFromQuaternion(qFrame));
    },
    render(renderer) {
      if (!visible || !box.w || !box.h) return;
      const d = dpr;
      // The stage cleared and scissored the root's box; this scene draws its own, larger box (the shadow, the pool)
      const ux0 = Math.min(box.x, prev.w ? prev.x : box.x), uy0 = Math.min(box.y, prev.w ? prev.y : box.y);
      const ux1 = Math.max(box.x + box.w, prev.x + prev.w), uy1 = Math.max(box.y + box.h, prev.y + prev.h);
      renderer.setScissorTest(true);
      renderer.setScissor(ux0 / d, uy0 / d, (ux1 - ux0) / d, (uy1 - uy0) / d);
      renderer.setViewport(ux0 / d, uy0 / d, (ux1 - ux0) / d, (uy1 - uy0) / d);
      renderer.clear(true, false, false);
      renderer.setViewport(box.x / d, box.y / d, box.w / d, box.h / d);
      renderer.setScissor(box.x / d, box.y / d, box.w / d, box.h / d);
      renderer.render(scene, camera);
      Object.assign(prev, box);
    },
    degrade() {
      // One frost octave, no crazing, no relief (the stage drops to 1x pixels)
      uniforms.uTier.value = 0;
    },
    dispose() {
      quad.geometry.dispose();
      material.dispose();
      texA.dispose();
      texB.dispose();
      texMark.dispose();
    },
  };
}
