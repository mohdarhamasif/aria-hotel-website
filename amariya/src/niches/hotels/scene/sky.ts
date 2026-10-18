// Behind the house: a sky graded by the night (dusk → deep night → dawn), a distant city line whose windows follow
// the hour, and stars between 23:00 and 04:30. The sky is a full-screen triangle that reads each pixel's view ray.
import * as THREE from 'three';
import { colors } from '../../../data/colors';
import type { House } from './generator';

const C = colors.hospitality;
const col = (role: keyof typeof C) => new THREE.Color(C[role]);
const smooth = THREE.MathUtils.smoothstep;

const CLAMP = /* glsl */ `
uniform float uScrimX, uYmax;
vec3 scrim(vec3 c) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return gl_FragCoord.x >= uScrimX && y > uYmax ? c * (uYmax / y) : c;
}`;

const SKY_VS = /* glsl */ `
uniform mat4 uProjInv, uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  // Drawn first with no depth test: any depth inside the clip volume will do (the far plane itself may clip)
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const SKY_FS = /* glsl */ `
${CLAMP}
uniform vec3 uZenith, uHorizon, uDawnCol;
uniform float uDawn;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = mix(uHorizon, uZenith, smoothstep(-0.02, 0.42, d.y));
  // Sunrise: a low glow, warmer to the east
  c += uDawnCol * uDawn * 0.22 * exp(-max(d.y, 0.0) * 9.0) * (0.55 + 0.45 * smoothstep(-0.4, 0.8, d.x));
  gl_FragColor = vec4(scrim(c), 1.0);
  #include <colorspace_fragment>
}`;

const CITY_VS = /* glsl */ `
attribute vec2 aCity;
varying vec2 vCity;
varying float vDist;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vCity = aCity;
  vUv = uv;
  vDist = distance(w.xyz, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CITY_FS = /* glsl */ `
${CLAMP}
uniform vec3 uBg, uHorizon, uWinLit, uWinDim;
uniform float uCityLit, uTime;
varying vec2 vCity;
varying float vDist;
varying vec2 vUv;
void main() {
  float fog = smoothstep(140.0, 300.0, vDist);
  vec3 c;
  if (vCity.x < 0.5) {
    // A building: a shade darker than the horizon, with a faint roof line
    c = mix(uBg * 0.82, uBg * 1.25, step(0.985, vUv.y));
  } else {
    float flicker = 0.92 + 0.08 * sin(uTime * (0.3 + vCity.y) + vCity.y * 40.0);
    float lit = step(vCity.y, uCityLit);
    c = mix(uWinDim * 0.5, uWinLit * 0.5 * flicker, lit);
  }
  gl_FragColor = vec4(scrim(mix(c, uHorizon, fog * 0.7)), 1.0);
  #include <colorspace_fragment>
}`;

const STAR_VS = /* glsl */ `
attribute float aSeed;
uniform float uPx, uTime;
varying float vTwinkle;
void main() {
  vec4 w = vec4(cameraPosition + position, 1.0);
  vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 31.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  gl_PointSize = (1.0 + aSeed * aSeed * 1.6) * uPx;
}`;

const STAR_FS = /* glsl */ `
uniform vec3 uStar;
uniform float uStars, uScrimX;
varying float vTwinkle;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  // Never behind the log column
  if (dot(p, p) > 0.25 || gl_FragCoord.x >= uScrimX) discard;
  gl_FragColor = vec4(uStar * uStars * vTwinkle * (1.0 - dot(p, p) * 3.0), 1.0);
  #include <colorspace_fragment>
}`;

function mulberry(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export type Sky = ReturnType<typeof createSky>;

export function createSky(house: House, camera: THREE.PerspectiveCamera, coarse: boolean) {
  const U = house.uniforms;
  const group = new THREE.Group();
  const zenith = new THREE.Color();
  const night = { h: col('bg-page').lerp(col('sky-dusk'), 0.4), z: col('bg-page') };
  const dusk = { h: col('sky-dusk'), z: col('bg-page').lerp(col('sky-dusk'), 0.45) };
  const dawn = { h: col('dawn'), z: col('bg-page').lerp(col('dawn'), 0.3) };

  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const sky = new THREE.Mesh(tri, new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: zenith }, uHorizon: U.uHorizon, uDawnCol: U.uDawnCol, uDawn: U.uDawn, uScrimX: U.uScrimX, uYmax: U.uYmax,
      uProjInv: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
    },
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;

  // The city line: building silhouettes and their windows, one instanced quad each
  const rnd = mulberry(20241016);
  const maxWindows = coarse ? 200 : 400;
  const items: { x: number; y: number; z: number; w: number; h: number; kind: number; seed: number }[] = [];
  for (let x = -330; x < 330;) {
    const w = 6 + rnd() * 12, h = 6 + rnd() ** 1.6 * 40, z = -175 - rnd() * 70;
    items.push({ x: x + w / 2, y: h / 2, z, w, h, kind: 0, seed: 0 });
    x += w + 1 + rnd() * 6;
  }
  const buildings = items.slice();
  let windows = 0;
  for (const b of buildings) {
    const cols = Math.floor(b.w / 2.4), rows = Math.floor((b.h - 2) / 3.2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (windows >= maxWindows || rnd() > 0.32) continue;
      items.push({ x: b.x - b.w / 2 + (c + 0.5) * (b.w / cols), y: 1.6 + r * 3.2 + 1.2, z: b.z + 0.05, w: 0.9, h: 1.3, kind: 1, seed: rnd() });
      windows++;
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1);
  const aCity = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 2), 2);
  quad.setAttribute('aCity', aCity);
  const cityUniforms = {
    uBg: U.uBg, uHorizon: U.uHorizon, uScrimX: U.uScrimX, uYmax: U.uYmax, uTime: U.uTime,
    uWinLit: { value: col('window-lit') }, uWinDim: { value: col('window-dim') }, uCityLit: { value: 0.5 },
  };
  const city = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({ uniforms: cityUniforms, vertexShader: CITY_VS, fragmentShader: CITY_FS, toneMapped: false }), items.length);
  const m4 = new THREE.Matrix4();
  items.forEach((it, i) => {
    city.setMatrixAt(i, m4.makeScale(it.w, it.h, 1).setPosition(it.x, it.y, it.z));
    aCity.setXY(i, it.kind, it.seed);
  });
  city.frustumCulled = false;
  group.add(sky, city);

  // Stars, on fine pointers only
  const starUniforms = { uStar: { value: col('lantern') }, uStars: { value: 0 }, uPx: { value: 1 }, uTime: U.uTime, uScrimX: U.uScrimX };
  let stars: THREE.Points | null = null;
  if (!coarse) {
    const n = 300, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const az = (rnd() - 0.5) * 3.2, el = 0.08 + rnd() ** 0.8 * 1.15;
      pos.set([Math.sin(az) * Math.cos(el) * 380, Math.sin(el) * 380, -Math.cos(az) * Math.cos(el) * 380], i * 3);
      seed[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: starUniforms, vertexShader: STAR_VS, fragmentShader: STAR_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    stars.frustumCulled = false;
    stars.visible = false;
    group.add(stars);
  }

  return {
    group,
    /** Sky colour, city windows and stars for a minute of the night (0 = 18:00) */
    setTime(m: number) {
      const t = m / 825;
      const k = 1 - smooth(t, 0, 0.22), d = smooth(t, 0.86, 1);
      U.uHorizon.value.copy(night.h).lerp(dusk.h, k).lerp(dawn.h, d * 0.8);
      zenith.copy(night.z).lerp(dusk.z, k).lerp(dawn.z, d);
      // Lit city windows: busy at dinner, thinning through the small hours, a few early risers, out at sunrise
      const lit = m < 120 ? 0.55 : m < 300 ? 0.55 - 0.13 * ((m - 120) / 180) : m < 480 ? 0.42 - 0.26 * ((m - 300) / 180) : m < 660 ? 0.16 - 0.04 * ((m - 480) / 180) : 0.12 + 0.18 * Math.min(1, (m - 660) / 60);
      cityUniforms.uCityLit.value = lit * (1 - d);
      const s = smooth(m, 285, 315) * (1 - smooth(m, 615, 645));
      starUniforms.uStars.value = s;
      if (stars) stars.visible = s > 0.002;
    },
    resize(dpr: number) { starUniforms.uPx.value = dpr; },
    dispose() {
      tri.dispose();
      quad.dispose();
      (sky.material as THREE.Material).dispose();
      (city.material as THREE.Material).dispose();
      if (stars) { stars.geometry.dispose(); (stars.material as THREE.Material).dispose(); }
    },
  };
}
