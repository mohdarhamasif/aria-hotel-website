import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { colors } from '../../data/colors';
import { SIMPLEX } from './glsl';
import type { OrbScene } from './stage';

// Hotels & restaurants: champagne liquid glass with a glowing core and gold dust, refracted by the glass.
const C = colors.hospitality;
const FOV = 22;
/** The canvas is 1.7x the orb, so the orb's radius fills 1/1.7 of the half-height */
const FILL = 1 / 1.7;
const BG_Z = -2.5;

export function createChampagne(): OrbScene {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const distance = 1 / Math.sin(Math.atan(half * FILL));
  camera.position.set(0, 0, distance);

  // Backdrop: the exact page colour plus a soft champagne glow, so the glass has light to bend.
  // It fades to the page colour before the canvas edge, so the canvas has no visible border.
  const bgUniforms = {
    uBg: { value: new THREE.Color(C['bg-page']) },
    uGlow: { value: new THREE.Color(C['orb-glow']) },
    uGlowAmt: { value: 0.4 },
  };
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: bgUniforms,
      depthWrite: false,
      toneMapped: false,
      vertexShader: /* glsl */ `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uBg, uGlow; uniform float uGlowAmt; varying vec2 vUv;
        void main() {
          float r = length((vUv - 0.5) * 2.0);
          float g = exp(-r * r * 5.0) * uGlowAmt * (1.0 - smoothstep(0.7, 0.97, r));
          gl_FragColor = vec4(uBg + uGlow * g, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  backdrop.position.z = BG_Z;
  scene.add(backdrop);

  const orb = new THREE.Group();
  scene.add(orb);

  // Glass: physical transmission, with the surface pushed in and out by noise and normals rebuilt to match
  const glassUniforms = { uTime: { value: 0 }, uNoise: { value: 0.03 }, uRipple: { value: 0 } };
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.06,
    transmission: 1,
    thickness: 1.4,
    ior: 1.5,
    dispersion: coarse ? 0 : 0.3,
    attenuationColor: new THREE.Color(C['orb-tint']),
    attenuationDistance: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.9,
  });
  glass.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, glassUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform float uTime, uNoise, uRipple;
        ${SIMPLEX}
        vec3 orbDisplace(vec3 p) {
          vec3 n = normalize(p);
          float h = snoise(n * 1.2 + vec3(0.0, uTime * 0.2, uTime * 0.1)) * uNoise;
          // Listening: rings travel inward toward the visitor
          float facing = clamp(normalize(normalMatrix * n).z, -1.0, 1.0);
          h -= uRipple * 0.01 * sin(acos(facing) * 12.0 + uTime * 5.0);
          return p + n * h;
        }
        vec3 orbTangent(vec3 v) { return normalize(abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.0) : vec3(0.0, -v.z, v.y)); }`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec3 orbN = normalize(position);
        vec3 orbT = orbTangent(orbN);
        vec3 orbB = normalize(cross(orbN, orbT));
        vec3 orbP = orbDisplace(position);
        vec3 objectNormal = normalize(cross(orbDisplace(position + orbT * 0.01) - orbP, orbDisplace(position + orbB * 0.01) - orbP));`)
      .replace('#include <begin_vertex>', 'vec3 transformed = orbP;');
  };
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, coarse ? 40 : 72), glass);
  orb.add(sphere);

  // Core: an opaque swirl of champagne light, so the transmission pass captures and bends it
  const coreUniforms = {
    uTime: { value: 0 },
    uBright: { value: 0.6 },
    uDeep: { value: new THREE.Color(C['orb-core-deep']) },
    uMid: { value: new THREE.Color(C['orb-core']) },
    uHot: { value: new THREE.Color(C['orb-core-hot']) },
  };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.44, 12),
    new THREE.ShaderMaterial({
      uniforms: coreUniforms,
      vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN;
        void main() { vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uBright; uniform vec3 uDeep, uMid, uHot; varying vec3 vP; varying vec3 vN;
        ${SIMPLEX}
        void main() {
          float n = fbm(vP * 2.6 + vec3(0.0, uTime * 0.18, -uTime * 0.11)) * 0.5 + 0.5;
          float swirl = fbm(vec3(vP.xy * 3.2, uTime * 0.07) + n * 1.4) * 0.5 + 0.5;
          float face = clamp(normalize(vN).z, 0.0, 1.0);
          vec3 col = mix(uDeep, uMid, smoothstep(0.3, 0.75, swirl));
          col = mix(col, uHot, pow(smoothstep(0.4, 1.0, n * (0.55 + 0.45 * face)), 2.0));
          gl_FragColor = vec4(col * uBright, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  orb.add(core);

  // Gold dust: opaque round points inside the glass (opaque, so they are refracted too)
  const count = coarse ? 800 : 2000;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(0.5 + 0.38 * Math.cbrt(Math.random()));
    v.toArray(positions, i * 3);
    seeds[i] = Math.random();
    sizes[i] = 0.8 + 2.2 * Math.random() ** 3;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const dustUniforms = {
    uTime: { value: 0 },
    uGather: { value: 0 },
    uBurst: { value: 0 },
    uScale: { value: 1 },
    uBright: { value: 1 },
    uGold: { value: new THREE.Color(C['orb-dust']) },
  };
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      vertexShader: /* glsl */ `attribute float aSeed; attribute float aSize;
        uniform float uTime, uGather, uBurst, uScale; varying float vSeed;
        void main() {
          vec3 p = position;
          float a = uTime * (0.06 + aSeed * 0.08);
          p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
          p += 0.025 * vec3(sin(uTime * 0.7 + aSeed * 40.0), cos(uTime * 0.55 + aSeed * 23.0), sin(uTime * 0.62 + aSeed * 11.0));
          p *= mix(1.0, 0.5, uGather) * (1.0 + 0.08 * uBurst * (0.5 + aSeed));
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / -mv.z;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uGold; uniform float uBright; varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          if (dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(uGold * uBright * (0.7 + 0.6 * vSeed), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  orb.add(dust);

  let environment: THREE.Texture | null = null;
  let gl: THREE.WebGLRenderer | null = null;

  return {
    alpha: false,
    setup(renderer) {
      gl = renderer;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.transmissionResolutionScale = 0.5;
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = environment;
      pmrem.dispose();
    },
    resize(width, height, dpr) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const planeHeight = 2 * (distance - BG_Z) * half * 1.02;
      backdrop.scale.set(planeHeight * camera.aspect, planeHeight, 1);
      dustUniforms.uScale.value = dpr * distance * (height / 900) * 1.4;
    },
    update(f) {
      const breath = Math.sin(f.t * 0.9) * 0.015;
      // Held: settles slightly in the hand; thrown: the glass stretches a touch with the spin
      orb.scale.setScalar(1 + breath + 0.025 * f.amp - 0.02 * f.grab);
      orb.rotation.y = f.t * 0.08 + f.yaw + f.pointer.x * 0.2 * (1 - f.grab);
      orb.rotation.x = f.pitch - f.pointer.y * 0.14 * (1 - f.grab);
      glassUniforms.uTime.value = f.t;
      glassUniforms.uNoise.value = 0.012 + 0.04 * f.amp + 0.008 * f.listen + 0.02 * f.spin;
      glassUniforms.uRipple.value = f.listen;
      coreUniforms.uTime.value = f.t;
      coreUniforms.uBright.value = (1.3 + 0.9 * f.amp) * (1 - 0.3 * f.listen) + 0.06 * Math.sin(f.t * 0.9);
      dustUniforms.uTime.value = f.t;
      dustUniforms.uGather.value = f.listen;
      dustUniforms.uBurst.value = THREE.MathUtils.smoothstep(f.amp, 0.5, 0.95);
      dustUniforms.uBright.value = 0.9 + 0.8 * f.amp;
      bgUniforms.uGlowAmt.value = 0.36 + 0.06 * Math.sin(f.t * 0.9) + 0.4 * f.amp + 0.08 * f.listen + 0.08 * f.hover + 0.1 * f.spin;
    },
    render(renderer) {
      renderer.render(scene, camera);
    },
    // Lighter without recompiling shaders (a recompile would stall the slow device that triggered this)
    degrade() {
      if (gl) gl.transmissionResolutionScale = 0.35;
      dustGeometry.setDrawRange(0, count >> 1);
    },
    dispose() {
      environment?.dispose();
      for (const mesh of [backdrop, sphere, core, dust]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
