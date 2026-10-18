import * as THREE from 'three';
import { colors } from '../../data/colors';
import { SIMPLEX } from './glsl';
import type { OrbFrame, OrbScene } from './stage';

// Clinics: frosted porcelain glass with a calm blue core, drawn in one shader pass (the lightest of the three).
const C = colors.clinics;
/** Sphere radius as a share of the canvas half-size; the corner brackets sit outside it */
const RADIUS = 0.72;

/** The shader blends in sRGB, so colours go in as raw sRGB components */
const srgb = (hex: string) => new THREE.Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

export function createPorcelain(root: HTMLElement): OrbScene {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const wave = root.querySelector<SVGPathElement>('[data-wave]');
  const rotation = new THREE.Matrix4();
  const euler = new THREE.Euler();

  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAmp: { value: 0 },
    uListen: { value: 0 },
    uSpeak: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
    uHover: { value: 0 },
    uRot: { value: new THREE.Matrix3() },
    uFrost: { value: 1 },
    uBody: { value: srgb(C['orb-body']) },
    uShade: { value: srgb(C['orb-shade']) },
    uGlowDeep: { value: srgb(C['orb-glow-deep']) },
    uGlow: { value: srgb(C['orb-glow']) },
    uGlowHot: { value: srgb(C['orb-glow-hot']) },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uRes, uPointer;
        uniform float uTime, uAmp, uListen, uSpeak, uFrost, uHover;
        uniform mat3 uRot;
        uniform vec3 uBody, uShade, uGlowDeep, uGlow, uGlowHot;
        varying vec2 vUv;
        ${SIMPLEX}
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          p.x *= uRes.x / uRes.y;
          p /= ${RADIUS.toFixed(2)};
          float r = length(p);
          float aa = 3.0 / (${RADIUS.toFixed(2)} * min(uRes.x, uRes.y));
          float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
          float z = sqrt(max(0.0, 1.0 - r * r));
          vec3 n = vec3(p, z);

          // The frost pattern lives on the sphere, so turning the orb turns it; the light stays where it is
          vec3 s = uRot * n;
          // Frost: fine noise tilts the surface; the cursor clears it, fully while listening
          float clearing = max(uListen, 0.7 * uHover) * (1.0 - smoothstep(0.0, 0.55, distance(p, uPointer / ${RADIUS.toFixed(2)})));
          float frost = 0.035 * uFrost * (1.0 - 0.85 * clearing);
          vec3 grain = vec3(snoise(s * 9.0 + uTime * 0.02), snoise(s * 9.0 + 19.1), snoise(s * 9.0 + 41.7));
          n = normalize(n + grain * frost);

          // Soft porcelain light from the upper left
          vec3 L = normalize(vec3(-0.45, 0.62, 0.64));
          float diffuse = clamp((dot(n, L) + 0.6) / 1.6, 0.0, 1.0);
          vec3 col = mix(uShade, uBody, diffuse);
          float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 36.0) * 0.28;

          // The core: deep steel at the centre, blue around it, breathing every 10 s and swelling with the voice
          float radius = 0.44 + 0.15 * uAmp + 0.03 * sin(uTime * 0.628) - 0.07 * uListen;
          float shape = 1.0 + 0.16 * snoise(vec3(s.xy * 1.3, uTime * 0.08));
          float g = exp(-pow(r / (radius * shape), 2.0) * 1.1);
          float rings = (0.5 + 0.5 * sin(r * 24.0 - uTime * 5.5)) * exp(-r * 2.2);
          g = clamp(g + uSpeak * uAmp * rings * 0.35, 0.0, 1.0);
          vec3 core = mix(uGlowHot, uGlow, smoothstep(0.15, 0.7, g));
          core = mix(core, uGlowDeep, smoothstep(0.8, 1.0, g) * 0.5 * uSpeak * uAmp);
          core = mix(core, uGlowHot, clamp(uAmp * 0.6, 0.0, 0.6) * smoothstep(0.3, 1.0, g));
          col = mix(col, core, smoothstep(0.02, 0.85, g) * 0.78);

          // Milky rim, then the highlight
          col = mix(col, uBody, pow(1.0 - z, 2.4) * 0.6);
          col += spec;

          // A faint blue halo outside the sphere; output is premultiplied for the transparent canvas
          float halo = exp(-max(r - 1.0, 0.0) * 7.0) * (0.14 + 0.22 * uAmp + 0.06 * uListen) * (1.0 - inside) * (1.0 - smoothstep(1.2, 1.36, r));
          gl_FragColor = vec4(col * inside + uGlow * halo, clamp(inside + halo, 0.0, 1.0));
        }`,
    }),
  );
  scene.add(quad);

  // The waveform line: flat and calm when idle, a trace while listening, the voice while speaking
  const wavePath = (f: OrbFrame) => {
    let d = '';
    for (let i = 0; i <= 64; i++) {
      const x = i / 64;
      const envelope = Math.sin(Math.PI * x);
      const idle = 0.35 * Math.sin(x * 9 + f.t * 1.2);
      const listen = f.listen * 1.6 * Math.sin(x * 23 - f.t * 6) * Math.sin(x * 5 + f.t);
      const speak = f.speak * f.amp * 7 * Math.sin(x * 31 - f.t * 9) * (0.6 + 0.4 * Math.sin(x * 7 + f.t * 3));
      d += `${i ? ' L' : 'M'}${(x * 100).toFixed(2)} ${(10 - envelope * (idle + listen + speak)).toFixed(2)}`;
    }
    return d;
  };

  return {
    alpha: true,
    setup() {},
    resize(width, height, dpr) {
      uniforms.uRes.value.set(width * dpr, height * dpr);
    },
    update(f) {
      uniforms.uTime.value = f.t;
      uniforms.uAmp.value = f.amp;
      uniforms.uListen.value = f.listen;
      uniforms.uSpeak.value = f.speak;
      uniforms.uPointer.value.copy(f.pointer);
      uniforms.uHover.value = f.hover;
      uniforms.uRot.value.setFromMatrix4(rotation.makeRotationFromEuler(euler.set(f.pitch, f.yaw + f.t * 0.03, 0)));
      if (wave) {
        wave.setAttribute('d', wavePath(f));
        wave.style.opacity = String(0.3 + 0.7 * Math.max(f.listen, f.speak));
      }
    },
    render(renderer) {
      renderer.render(scene, camera);
    },
    degrade() {
      uniforms.uFrost.value = 0.6;
    },
    dispose() {
      quad.geometry.dispose();
      quad.material.dispose();
    },
  };
}
