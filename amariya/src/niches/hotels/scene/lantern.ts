// Amariya's body on /hotels: a blown-glass globe half full of luminous champagne, hung on two pins in a brass gimbal
// with a bail. The glass turns under the hand; the champagne stays level (it sloshes, swirls and fizzes, see liquid.ts),
// its surface carries the voice states, and its glow is the scene's only warm light (the house shaders read `core`).
// Glass and brass are physical materials lit by the RoomEnvironment PMREM; everything else is shader-lit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from '../../../data/colors';
import type { OrbFrame } from '../../../scripts/orb/stage';
import { etchMap, haloTexture } from './atlas';
import { Liquid } from './liquid';

const C = colors.hospitality;
const col = (role: keyof typeof C) => new THREE.Color(C[role]);
const R_LIQUID = 0.96;
/** Champagne absorbs blue most: Beer–Lambert transmittance exp(−σ) over one radius, σ ≈ (.9, 1.3, 3.2) per R */
const ABSORB = new THREE.Color(Math.exp(-0.9), Math.exp(-1.3), Math.exp(-3.2));
/** Where the beads are born, fixed to the glass (so they turn with it and show the rotation) */
const NUCLEI = [new THREE.Vector3(0.28, -0.62, 0.12), new THREE.Vector3(-0.3, -0.58, -0.2), new THREE.Vector3(0.04, -0.7, 0.3)];
const CHAIN = new THREE.Vector3(0, -0.82, 0);

const POINTS_VS = /* glsl */ `
attribute vec4 aData;
uniform float uTime, uPx, uRiseBoost, uSpin, uGather, uLift, uHelix, uVortex;
uniform vec4 uSurface;
varying float vKind;
varying float vSeed;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void main() {
  vec3 p = position;
  float size;
  vKind = aData.x;
  vSeed = aData.z;
  if (aData.x < 0.5) {
    // A gold fleck: Brownian drift below the surface, turning with the swirl, gathering while she listens, lifting as she speaks
    float s = aData.z;
    p += 0.05 * vec3(sin(uTime * 0.37 + s * 50.0), sin(uTime * 0.29 + s * 31.0), cos(uTime * 0.33 + s * 17.0));
    p.xz = rot(uSpin * (0.6 + 0.4 * s)) * p.xz;
    p.xz *= mix(1.0, 0.45, uGather);
    p.y = mix(p.y, -0.25, uGather * 0.35) + 0.08 * uLift;
    size = 0.009 * (0.7 + 0.6 * s);
    if (dot(p, uSurface.xyz) > uSurface.w - 0.02 || dot(p, p) > 0.84) size = 0.0;
  } else {
    // A bead: rises toward world-up at .18–.32 R/s, grows 1 → 1.7×, swirls with the liquid, gone at the surface
    float age = uTime - aData.y;
    float speed = mix(0.18, 0.32, aData.z) * uRiseBoost;
    p.y += speed * age;
    p.xz = rot(uSpin - aData.w) * p.xz;
    p.xz += 0.012 * vec2(sin(age * 7.0 + aData.z * 40.0), cos(age * 6.0 + aData.z * 23.0));
    p.xz += uHelix * 0.06 * vec2(cos(age * 5.0 + aData.z * 6.283), sin(age * 5.0 + aData.z * 6.283));
    size = 0.013 * (1.0 + 0.7 * clamp(age * speed / 1.4, 0.0, 1.0));
    float surface = uSurface.w - uVortex * max(0.0, 1.0 - dot(p.xz, p.xz) / 0.8);
    if (age < 0.0 || age > 12.0 || dot(p, uSurface.xyz) > surface || dot(p, p) > 0.88) size = 0.0;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, size * 2.0 * uPx);
  // A point of size 0 may still draw 1 px: send spent beads outside the clip volume instead
  if (size <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}`;

const POINTS_FS = /* glsl */ `
uniform vec3 uBead, uBeadHi, uFleck;
uniform float uGlint;
varying float vKind;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  // A bead is a bright rim round a darker heart; a fleck is solid gold that glints as she speaks
  vec3 col = vKind > 0.5 ? mix(uBead, uBeadHi, smoothstep(0.06, 0.2, r2)) : uFleck * (0.75 + 0.5 * vSeed) * (1.0 + uGlint * step(0.9, vSeed));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SURFACE_VS = /* glsl */ `
uniform float uDiscR, uVortex, uTime, uListenAmp;
uniform vec4 uRings[6];
varying vec3 vView;
varying float vR;
void main() {
  float r = length(position.xy);
  float rr = r * uDiscR;
  // The swirl dips the centre; listening draws fine rings inward; her syllables send rings outward
  float h = -uVortex * (1.0 - r * r) * (1.0 - r * r);
  h += uListenAmp * sin(rr * 38.0 + uTime * 6.0);
  for (int i = 0; i < 6; i++) {
    vec4 g = uRings[i];
    float age = uTime - g.x;
    if (g.y <= 0.0 || age < 0.0 || age > 3.0) continue;
    float front = g.z > 0.0 ? 0.35 * age : uDiscR - 0.35 * age;
    float d = rr - front;
    h += g.y * exp(-d * d * 90.0) * cos(d * 42.0) * exp(-age * 1.2);
  }
  vR = r;
  vec4 mv = modelViewMatrix * vec4(position.xy, h * (1.0 - smoothstep(0.92, 1.0, r)), 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const SURFACE_FS = /* glsl */ `
uniform vec3 uLo, uHi, uRim, uFrost;
uniform float uCore, uMuted;
varying vec3 vView;
varying float vR;
void main() {
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 v = normalize(-vView);
  float fres = pow(1.0 - abs(dot(n, v)), 3.0);
  float spec = pow(max(dot(reflect(-v, n), normalize(vec3(0.3, 0.85, 0.4))), 0.0), 48.0);
  vec3 c = mix(uLo, uHi, 0.3 + 0.7 * fres) * uCore + uHi * spec * 0.7;
  // The meniscus: a bright line where the champagne meets the glass
  c = mix(c, uRim * (0.85 + 0.3 * uCore), smoothstep(0.88, 0.98, vR));
  // Muted: a fine frost ring forms at the meniscus
  c = mix(c, uFrost, uMuted * 0.85 * smoothstep(0.78, 0.88, vR) * (1.0 - smoothstep(0.95, 1.0, vR)));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface LanternDrive {
  /** Motion allowed (not reduced, not paused) */
  allowed: boolean;
  /** Seconds, the shared clock of every scene shader */
  time: number;
  /** The lantern's sideways acceleration on screen, px/s² */
  ax: number;
  /** Bank into its travel, rad (≤ .12) */
  bank: number;
  /** 0–1 dawn */
  dawn: number;
  /** Its projected radius in device px */
  px: number;
  muted: boolean;
  /** 0–1 through the first pour */
  intro: number;
}

export type Lantern = ReturnType<typeof createLantern>;

export function createLantern(coarse: boolean) {
  const root = new THREE.Group();
  const ring = new THREE.Group();
  const glassGroup = new THREE.Group();
  root.add(ring);
  ring.add(glassGroup);

  // The glass, with an etched band and an 'A' cut into it so its turn always reads
  const etch = etchMap();
  const glass = new THREE.MeshPhysicalMaterial({
    color: col('orb-highlight'),
    metalness: 0,
    roughness: 1,
    roughnessMap: etch,
    transmission: 1,
    thickness: 1.4,
    ior: 1.5,
    dispersion: coarse ? 0 : 0.3,
    attenuationColor: col('orb-tint'),
    attenuationDistance: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.9,
  });
  const sphere = new THREE.SphereGeometry(1, coarse ? 48 : 72, coarse ? 32 : 48);
  const glassMesh = new THREE.Mesh(sphere, glass);
  glassGroup.add(glassMesh);

  // The gimbal: a brass ring with two pins at 3 and 9 o'clock and a bail on top
  const brass = new THREE.MeshStandardMaterial({ color: col('brass'), metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
  const parts = [
    new THREE.TorusGeometry(1.06, 0.022, 10, coarse ? 64 : 96),
    new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12).rotateZ(Math.PI / 2).translate(1.02, 0, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12).rotateZ(Math.PI / 2).translate(-1.02, 0, 0),
    new THREE.TorusGeometry(0.26, 0.016, 8, 32, Math.PI).translate(0, 1.04, 0),
    new THREE.SphereGeometry(0.035, 12, 8).translate(0, 1.31, 0),
  ];
  const gimbalGeometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  const gimbal = new THREE.Mesh(gimbalGeometry, brass);
  ring.add(gimbal);

  // The champagne: a transmissive body cut by its level surface, the surface itself, and the perlage and flecks
  const plane = new THREE.Plane();
  const liquidMaterial = new THREE.MeshPhysicalMaterial({
    color: col('lantern'),
    metalness: 0,
    roughness: 0.12,
    transmission: 0.6,
    thickness: 0.9,
    ior: 1.34,
    attenuationColor: ABSORB,
    attenuationDistance: 1,
    emissive: col('orb-core'),
    emissiveIntensity: 0.4,
    side: THREE.DoubleSide,
    clippingPlanes: [plane],
    envMapIntensity: 0.6,
  });
  const liquidGeometry = new THREE.SphereGeometry(R_LIQUID, coarse ? 40 : 56, coarse ? 28 : 40);
  const liquidMesh = new THREE.Mesh(liquidGeometry, liquidMaterial);
  liquidMesh.renderOrder = -1;
  root.add(liquidMesh);

  const rings = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1, 0));
  const surfaceUniforms = {
    uDiscR: { value: 0.9 }, uVortex: { value: 0 }, uTime: { value: 0 }, uListenAmp: { value: 0 }, uRings: { value: rings },
    uLo: { value: col('orb-core-deep') }, uHi: { value: col('orb-core-hot') }, uRim: { value: col('brass-hi') }, uFrost: { value: col('orb-highlight') },
    uCore: { value: 1 }, uMuted: { value: 0 },
  };
  const discGeometry = new THREE.RingGeometry(0.001, 1, coarse ? 40 : 64, 10);
  const surface = new THREE.Mesh(discGeometry, new THREE.ShaderMaterial({ uniforms: surfaceUniforms, vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS, side: THREE.DoubleSide }));
  surface.frustumCulled = false;
  root.add(surface);

  const NF = 300;
  const NB = coarse ? 220 : 600;
  let activeBeads = NB;
  const pos = new Float32Array((NF + NB) * 3);
  const data = new Float32Array((NF + NB) * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < NF; i++) {
    // Flecks below the surface: inside the lower part of the sphere
    v.randomDirection().multiplyScalar(0.15 + 0.7 * Math.cbrt(Math.random()));
    v.y = -Math.abs(v.y) * 0.9 - 0.05;
    v.toArray(pos, i * 3);
    data.set([0, 0, Math.random(), 0], i * 4);
  }
  for (let i = NF; i < NF + NB; i++) data.set([1, -1e4, Math.random(), 0], i * 4);
  const pointsGeometry = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aData = new THREE.BufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage);
  pointsGeometry.setAttribute('position', aPos);
  pointsGeometry.setAttribute('aData', aData);
  const pointsUniforms = {
    uTime: { value: 0 }, uPx: { value: 100 }, uRiseBoost: { value: 1 }, uSpin: { value: 0 }, uGather: { value: 0 }, uLift: { value: 0 },
    uHelix: { value: 0 }, uVortex: { value: 0 }, uSurface: { value: new THREE.Vector4(0, 1, 0, 0.08) }, uGlint: { value: 0 },
    uBead: { value: col('orb-core') }, uBeadHi: { value: col('orb-core-hot') }, uFleck: { value: col('orb-dust') },
  };
  const points = new THREE.Points(pointsGeometry, new THREE.ShaderMaterial({ uniforms: pointsUniforms, vertexShader: POINTS_VS, fragmentShader: POINTS_FS }));
  points.frustumCulled = false;
  root.add(points);

  // One additive halo, no bloom: hidden inside the glass by its depth, so it reads as light around it
  const haloMap = haloTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color: col('orb-glow'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  halo.scale.setScalar(3.4);
  root.add(halo);

  const liquid = new Liquid();
  const emissive = new THREE.Color();
  const warm = col('orb-core'), ivory = col('lantern'), hot = col('orb-core-hot');
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const lastPointer = new THREE.Vector2();
  let lastYaw = 0, lastPitch = 0, head = 0, ringHead = 0, lastRing = -10, quiet = true;
  const lean = new THREE.Vector2();
  const tilt = new THREE.Euler();
  const tmp = new THREE.Vector3();
  let core = 1;
  let radius = 1;

  function emit(n: number, time: number, chain: number) {
    // The nuclei are fixed to the glass: turn them with the gimbal and the glass
    q.copy(ring.quaternion).multiply(glassGroup.quaternion);
    const h = liquid.level(R_LIQUID);
    for (let k = 0; k < n; k++) {
      // Connecting gathers the beads into one chain rising from the bottom of the glass
      if (Math.random() < chain) v.copy(CHAIN);
      else v.copy(NUCLEI[head % 3]).applyQuaternion(q);
      if (v.dot(up) > h - 0.04) { head++; continue; }
      const i = NF + (head % activeBeads);
      head++;
      aPos.setXYZ(i, v.x + (Math.random() - 0.5) * 0.02, v.y, v.z + (Math.random() - 0.5) * 0.02);
      aData.setXYZW(i, 1, time, Math.random(), liquid.spinAngle);
    }
    aPos.needsUpdate = aData.needsUpdate = true;
  }

  function addRing(time: number, amp: number, outward: boolean) {
    rings[ringHead % 6].set(time, amp, outward ? 1 : -1, 0);
    ringHead++;
  }

  return {
    group: root,
    /** The lantern's glow, 0.5–2: the house reads it as the warmth of the only light */
    get core() { return core; },
    get rate() { return liquid.rate; },
    /** Bubbles the frame released, for tests */
    liquid,
    place(p: THREE.Vector3, r: number) {
      root.position.copy(p);
      root.scale.setScalar(r);
      radius = r;
      // Thickness scales with the object; the absorption distance has to as well
      glass.attenuationDistance = 2.2 * r;
      liquidMaterial.attenuationDistance = 1.0 * r;
    },
    /** A tap with the sound off: a silent ripple on the meniscus */
    ripple(time: number) { addRing(time, 0.012, true); },
    update(f: OrbFrame, d: LanternDrive) {
      const dt = d.allowed ? f.dt : 0;
      const yawRate = dt > 0 ? THREE.MathUtils.clamp((f.yaw - lastYaw) / dt, -12, 12) : 0;
      const pitchRate = dt > 0 ? THREE.MathUtils.clamp((f.pitch - lastPitch) / dt, -12, 12) : 0;
      lastYaw = f.yaw;
      lastPitch = f.pitch;

      // Hover: within 1.6 R the glass leans toward the cursor (≤ .12 rad), and circling it stirs the champagne
      const pl = f.pointer.length();
      const near = (1 - THREE.MathUtils.smoothstep(pl, 1.25, 1.6)) * (1 - f.grab);
      let circulation = 0;
      if (dt > 0) {
        const vx = (f.pointer.x - lastPointer.x) / dt, vy = (f.pointer.y - lastPointer.y) / dt;
        circulation = (f.pointer.x * vy - f.pointer.y * vx) * near;
        const k = 1 - Math.exp(-dt / 0.25);
        lean.x += (-f.pointer.y * 0.08 * near - lean.x) * k;
        lean.y += (-f.pointer.x * 0.12 * near - lean.y) * k;
      } else if (!d.allowed) {
        lean.set(0, 0);
      }
      lastPointer.copy(f.pointer);
      ring.rotation.set(lean.x, f.yaw, d.allowed ? d.bank + lean.y : 0, 'ZXY');
      glassGroup.rotation.x = f.pitch + 0.06;

      let n = 0;
      if (d.allowed) {
        n = liquid.step({
          dt, t: d.time, yawRate, pitchRate, ax: d.ax, scrollV: f.scrollV, circulation,
          listen: f.listen, speak: f.speak, connect: f.connect, think: f.think, amp: f.amp,
          bright: f.bright, soft: f.soft, calm: f.calm, intro: d.intro,
        });
      } else {
        liquid.settle(f.connect);
      }

      // The level surface: world-up tilted by the slosh, at the fill's height
      up.set(0, 1, 0).applyEuler(tilt.set(liquid.tiltX, 0, liquid.tiltZ));
      const h = liquid.level(R_LIQUID);
      const discR = Math.sqrt(Math.max(1e-4, R_LIQUID * R_LIQUID - h * h));
      plane.setFromNormalAndCoplanarPoint(v.copy(up).negate(), tmp.copy(up).multiplyScalar(h * radius).add(root.position));
      surface.position.copy(up).multiplyScalar(h);
      surface.quaternion.setFromUnitVectors(zAxis, up);
      surface.scale.set(discR, discR, 1);

      // Perlage, capped so a bead finishes its rise before its slot comes round again
      if (n > 0 && dt > 0) emit(Math.min(n, Math.ceil((activeBeads / 2.2) * dt) + 1), d.time, f.connect);

      // Surface rings: inward while she listens, outward at her syllable peaks (at most 6 a second)
      surfaceUniforms.uListenAmp.value = d.allowed ? 0.012 * f.amp * f.listen : 0;
      if (d.allowed && f.speak > 0.5) {
        if (f.amp > 0.35 && quiet && d.time - lastRing > 1 / 6) { addRing(d.time, 0.005 + 0.01 * f.amp, true); lastRing = d.time; quiet = false; }
        if (f.amp < 0.25) quiet = true;
      }

      // The core: 1.0 at rest; she holds her breath while listening (−25 %, cooler); .7 + amp as she speaks;
      // a candle flicker (±4 %) while thinking; +12 % under the hand; tone and dawn shade it
      const flicker = 1 + 0.04 * f.think * (d.allowed ? Math.sin(d.time * 11) * Math.sin(d.time * 7.3) : 0);
      core = (1 + 0.06 * Math.sin(d.time * 0.94)) * (1 - f.speak) + (0.7 + f.amp) * f.speak;
      core *= (1 - 0.25 * f.listen) * flicker * (1 + 0.12 * f.hover) * (1 + 0.15 * f.bright - 0.15 * f.soft) * (1 - 0.3 * d.dawn);
      const cool = Math.min(1, 0.6 * f.listen + 0.5 * f.calm + 0.7 * d.dawn);
      emissive.copy(warm).lerp(hot, 0.3 * f.bright).lerp(ivory, cool);
      liquidMaterial.emissive.copy(emissive);
      liquidMaterial.emissiveIntensity = 0.42 * core;
      surfaceUniforms.uCore.value = core;
      surfaceUniforms.uMuted.value = d.muted ? 1 : 0;
      surfaceUniforms.uVortex.value = liquid.vortex;
      surfaceUniforms.uDiscR.value = discR;
      surfaceUniforms.uTime.value = d.time;
      (halo.material as THREE.SpriteMaterial).opacity = 0.16 + 0.2 * core;

      const pu = pointsUniforms;
      pu.uTime.value = d.time;
      pu.uPx.value = d.px;
      pu.uSpin.value = liquid.spinAngle;
      pu.uVortex.value = liquid.vortex;
      pu.uSurface.value.set(up.x, up.y, up.z, h);
      pu.uGather.value = f.listen;
      pu.uLift.value = f.speak;
      pu.uHelix.value = f.think;
      pu.uGlint.value = f.amp * f.speak;
      pu.uRiseBoost.value = Math.abs(f.scrollV) > 1200 ? 1.1 : 1;
      // Reduced motion and Pause: no bubbles in flight
      points.geometry.setDrawRange(0, d.allowed ? NF + activeBeads : NF);
    },
    degrade() {
      activeBeads = NB >> 1;
    },
    dispose() {
      for (const g of [sphere, gimbalGeometry, liquidGeometry, discGeometry, pointsGeometry]) g.dispose();
      for (const m of [glass, brass, liquidMaterial, surface.material, points.material, halo.material] as THREE.Material[]) m.dispose();
      etch.dispose();
      haloMap.dispose();
    },
  };
}
