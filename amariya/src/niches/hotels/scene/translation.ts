// Translation by refraction (the lobby hour): a sentence plate behind the upper part of the glass, drawn ONLY into the
// glass's transmission pass, so it is seen through the champagne lantern and never on screen. The guest's sentence
// slides right to left behind the globe every 4.5 s; outside the glass the page shows it in the caller's words
// (`ul[data-translations] li`: data-src the sentence outside, the item's text, or data-lang, the one through the glass).
import * as THREE from 'three';
import { colors } from '../../../data/colors';
import { content } from '../../../data/content/hotels';
import type { CallLine } from '../../../scripts/scripted';
import { bodyFont, textPlane } from './atlas';

const C = colors.hospitality;
const CYCLE = 4.5;
const H = 128;
const W = 2048;

interface Pair { src: string; text: string; lang: string; rtl: boolean }

const PLATE_VS = /* glsl */ `
uniform float uCrop;
varying vec2 vUv;
void main() {
  vUv = vec2(0.5 + (uv.x - 0.5) * uCrop, uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PLATE_FS = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  // The screen pass is tone-mapped and the transmission pass is not: draw only into the latter, so the plate exists
  // only through the glass (three.js renders transmission without tone mapping into its own target)
  // The write keeps the colour output statically used: a shader that only discards loses it, and the draw then fails
  // with GL_INVALID_OPERATION (missing fragment shader outputs) on every frame
  #ifdef TONE_MAPPING
    gl_FragColor = vec4(0.0);
    discard;
  #endif
  float a = texture2D(uMap, vUv).r;
  if (a < 0.08) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

function readPairs(): Pair[] {
  const items = [...document.querySelectorAll<HTMLElement>('ul[data-translations] li')];
  const fromDom = items
    .map((li) => {
      const named = li.dataset.lang && li.dataset.lang.length > 5 ? li.dataset.lang : '';
      const text = named || li.textContent?.trim() || '';
      const lang = li.lang || li.closest<HTMLElement>('[lang]')?.lang || '';
      return { src: li.dataset.src ?? '', text, lang, rtl: li.dir === 'rtl' || /^(ar|ur|he|fa)\b/.test(lang) };
    })
    .filter((p) => p.text);
  if (fromDom.length) return fromDom;
  // The page has no list yet: the lobby call's own lines, as heard, with their English glosses
  const calls: readonly { id: string; lines: readonly (CallLine & { gloss?: string })[] }[] = content.calls;
  const call = calls.find((c) => c.id === 'spanish-booking');
  return (call?.lines ?? [])
    .filter((l) => l.lang && l.gloss)
    .map((l) => ({ src: l.gloss ?? '', text: l.text, lang: l.lang ?? '', rtl: l.dir === 'rtl' }));
}

export type Translation = ReturnType<typeof createTranslation>;

export function createTranslation() {
  const plane = textPlane(W, H, 72);
  const uniforms = { uMap: { value: plane.texture }, uColor: { value: new THREE.Color(C.lantern) }, uCrop: { value: 1 } };
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader: PLATE_VS, fragmentShader: PLATE_FS, alphaToCoverage: true }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  let pairs: Pair[] = [];
  let list: HTMLElement | null = null;
  let shown = -1;
  let start = -1;
  const right = new THREE.Vector3();
  const upV = new THREE.Vector3();
  const back = new THREE.Vector3();

  function show(i: number) {
    shown = i;
    const p = pairs[i];
    plane.draw(p.text, { font: `400 72px ${bodyFont()}`, lang: p.lang, rtl: p.rtl });
    uniforms.uCrop.value = Math.min(1, (plane.aspect * H) / W);
    // The page can keep its own sentence in step: data-current is the pair, --tr the slide (0 → 1)
    if (list) list.dataset.current = String(i);
  }

  return {
    mesh,
    /** Each frame: shown only in the lobby, behind the glass's upper 44 %, sliding right to left */
    update(o: { visible: boolean; center: THREE.Vector3; radius: number; camera: THREE.Camera; time: number; allowed: boolean }) {
      mesh.visible = o.visible;
      if (!o.visible) { start = -1; return; }
      if (!pairs.length) {
        pairs = readPairs();
        list = document.querySelector<HTMLElement>('ul[data-translations]');
      }
      if (!pairs.length) { mesh.visible = false; return; }
      if (start < 0) start = o.time;
      const elapsed = o.allowed ? o.time - start : 0;
      const i = Math.floor(elapsed / CYCLE) % pairs.length;
      if (i !== shown) show(i);
      const phase = o.allowed ? (elapsed % CYCLE) / CYCLE : 0.5;
      const r = o.radius;
      const h = 0.2 * r;
      const w = h * Math.max(1, plane.aspect);
      mesh.scale.set(w, h, 1);
      right.set(1, 0, 0).applyQuaternion(o.camera.quaternion);
      upV.set(0, 1, 0).applyQuaternion(o.camera.quaternion);
      back.subVectors(o.center, o.camera.position).normalize();
      // From just off the glass's right edge to just off its left: the sentence crosses behind the globe
      const x = (r + w / 2) * (1 - 2 * phase);
      mesh.position.copy(o.center).addScaledVector(right, x).addScaledVector(upV, 0.56 * r).addScaledVector(back, r * 1.15);
      mesh.quaternion.copy(o.camera.quaternion);
      list?.style.setProperty('--tr', phase.toFixed(3));
    },
    dispose() {
      geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      plane.texture.dispose();
    },
  };
}
