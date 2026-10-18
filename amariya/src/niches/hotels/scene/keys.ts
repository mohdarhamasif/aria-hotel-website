// The key rack behind the desk (chapter #keys only): thirty brass keys, one per founding licence, each a damped
// pendulum on its hook. The ledger reads by shape: an issued key is gone and an engraved plate hangs in its place,
// a held key's fob is turned and tinted, an open key hangs. Her recommendation lifts the next open key toward you.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from '../../../data/colors';
import { ledgerCounts } from '../../../scripts/apply/adapter';
import { brassMatcap, numberAtlas } from './atlas';
import type { Layout } from './generator';
import type { KeysApi } from './types';

const C = colors.hospitality;
const col = (role: keyof typeof C) => new THREE.Color(C[role]);
const COUNT = 30;
/** θ'' = −(g/L)·sinθ − 1.6·θ': g/L 81.7 (≈ 1.44 Hz) */
const G_L = 81.7;
const DAMP = 1.6;
const STATE = { open: 0, held: 1, issued: 2 } as const;

function keyGeometry() {
  const part = (g: THREE.BufferGeometry, id: number) => {
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(id), 1));
    return g;
  };
  // Hook (0), key: bow, blade, bit, fob ring (1), fob (2), the 'Issued' plate (3). Hung from the origin, facing +z
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, 0.025), 0),
    part(new THREE.CylinderGeometry(0.006, 0.006, 0.022, 6).translate(0, 0.011, 0.05), 0),
    part(new THREE.TorusGeometry(0.03, 0.007, 6, 16).translate(0, -0.034, 0.05), 1),
    part(new THREE.BoxGeometry(0.012, 0.13, 0.006).translate(0, -0.13, 0.05), 1),
    part(new THREE.BoxGeometry(0.022, 0.012, 0.006).translate(0.012, -0.17, 0.05), 1),
    part(new THREE.BoxGeometry(0.018, 0.01, 0.006).translate(0.01, -0.145, 0.05), 1),
    part(new THREE.TorusGeometry(0.012, 0.003, 5, 10).translate(0, -0.205, 0.05), 1),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 6).rotateX(Math.PI / 2).scale(1, 1.5, 1).translate(0, -0.27, 0.05), 2),
    part(new THREE.BoxGeometry(0.11, 0.04, 0.006).translate(0, -0.06, 0.02), 3),
  ]);
}

const KEY_VS_COMMON = /* glsl */ `
attribute float aPart;
attribute vec4 aKey;
varying float vPart;
varying float vState;
varying vec2 vNum;
varying float vFront;
mat3 rz(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 ry(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rx(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
bool keyShown() {
  float issued = step(1.5, aKey.y);
  return aPart < 0.5 || (aPart > 2.5 ? issued > 0.5 : issued < 0.5);
}
bool heldFob() { return aPart > 1.5 && aPart < 2.5 && aKey.y > 0.5 && aKey.y < 1.5; }
// The key swings about the hook tip and, lifted, rises 6 cm and tilts toward the visitor; a held fob is turned
mat3 keyTurn() { return (aPart > 0.5 && aPart < 2.5) ? rz(aKey.z) * rx(-0.35 * aKey.w) : mat3(1.0); }
vec3 keyMove(vec3 p) {
  if (!keyShown()) return vec3(0.0);
  if (aPart < 0.5 || aPart > 2.5) return p;
  vec3 fob = vec3(0.0, -0.27, 0.05), pivot = vec3(0.0, 0.0, 0.05);
  if (heldFob()) p = ry(0.9) * (p - fob) + fob;
  return keyTurn() * (p - pivot) + pivot + vec3(0.0, 0.06, 0.05) * aKey.w;
}
vec3 keyNormal(vec3 n) { return keyTurn() * (heldFob() ? ry(0.9) * n : n); }
`;

export type Keys = ReturnType<typeof createKeys>;

export function createKeys(board: THREE.Material, coarse: boolean) {
  const group = new THREE.Group();
  group.visible = false;
  const numbers = numberAtlas();
  const matcap = coarse ? brassMatcap() : null;
  // Brass lit by the PMREM; a painted matcap on coarse pointers
  const material: THREE.MeshStandardMaterial | THREE.MeshMatcapMaterial = matcap
    ? new THREE.MeshMatcapMaterial({ color: col('orb-highlight'), matcap })
    : new THREE.MeshStandardMaterial({ color: col('brass'), metalness: 1, roughness: 0.32, envMapIntensity: 1.1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNumbers = { value: numbers };
    shader.uniforms.uHeld = { value: col('house-line') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${KEY_VS_COMMON}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = keyNormal(normal);')
      .replace('#include <begin_vertex>', `vec3 transformed = keyMove(position);
        vPart = aPart;
        vState = aKey.y;
        vFront = normal.z;
        float cell = aKey.x;
        vNum = aPart > 2.5
          ? vec2(position.x / 0.11 + 0.5, ((position.y + 0.06) / 0.04 + 0.5) / 8.0)
          : (vec2(mod(cell, 8.0), 7.0 - floor(cell / 8.0)) + vec2(position.x / 0.08 + 0.5, (position.y + 0.27) / 0.12 + 0.5)) / 8.0;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNumbers;
        uniform vec3 uHeld;
        varying float vPart;
        varying float vState;
        varying vec2 vNum;
        varying float vFront;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Fob numbers 01–30 and the engraved 'Issued' plate; a held fob is tinted
        if (vPart > 1.5 && vPart < 2.5 && vState > 0.5 && vState < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, uHeld, 0.7);
        if (vPart > 1.5 && vFront > 0.5) diffuseColor.rgb *= 1.0 - 0.78 * texture2D(uNumbers, vNum).r;`);
  };

  const geometry = keyGeometry();
  const aKey = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aKey', aKey);
  const keys = new THREE.InstancedMesh(geometry, material, COUNT);
  keys.frustumCulled = false;
  const boardGeometry = new THREE.BoxGeometry(1, 1, 0.06);
  const boardMesh = new THREE.Mesh(boardGeometry, board);
  group.add(boardMesh, keys);

  const theta = new Float32Array(COUNT);
  const omega = new Float32Array(COUNT);
  const lift = new Float32Array(COUNT);
  const state = new Uint8Array(COUNT);
  const hooks: THREE.Vector3[] = Array.from({ length: COUNT }, () => new THREE.Vector3());
  const screen = new Float32Array(COUNT * 2);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let lifted = -1;
  let pointer = { x: -1e4, y: -1e4, vx: 0, t: 0, moved: false };

  const onPointer = (e: PointerEvent) => {
    const dt = Math.max(1, e.timeStamp - pointer.t) / 1000;
    const vx = pointer.t ? (e.clientX - pointer.x) / dt : 0;
    pointer = { x: e.clientX, y: e.clientY, vx: Math.max(-4000, Math.min(4000, vx)), t: e.timeStamp, moved: true };
  };
  addEventListener('pointermove', onPointer, { passive: true });

  function setLedger(l: { issued: number; held: number }) {
    const issued = Math.max(0, Math.min(COUNT, Math.round(l.issued) || 0));
    const held = Math.max(0, Math.min(COUNT - issued, Math.round(l.held) || 0));
    for (let i = 0; i < COUNT; i++) state[i] = i < issued ? STATE.issued : i < issued + held ? STATE.held : STATE.open;
    if (lifted >= 0 && state[lifted] !== STATE.open) lifted = -1;
  }
  setLedger(ledgerCounts('hotels'));

  const api: KeysApi = {
    swing(n) {
      const i = Math.round(n) - 1;
      if (i >= 0 && i < COUNT && state[i] !== STATE.issued) omega[i] += omega[i] >= 0 ? 2.4 : -2.4;
    },
    lift(n) {
      const i = n === undefined ? state.indexOf(STATE.open) : Math.round(n) - 1;
      lifted = i >= 0 && i < COUNT && state[i] === STATE.open ? i : -1;
    },
    setLedger,
  };

  return {
    group,
    api,
    /** Hangs the hooks on the rack: 10 × 3 on wide screens, 6 × 5 on phones */
    layout(l: Layout, phone: boolean) {
      const r = l.rack;
      const cols = phone ? 6 : 10, rows = phone ? 5 : 3;
      const w = phone ? 1.7 : r.w, h = phone ? 2.05 : r.h;
      boardMesh.scale.set(w + 0.24, h + 0.26, 1);
      boardMesh.position.set(r.x, r.y, r.z);
      for (let i = 0; i < COUNT; i++) {
        const c = i % cols, row = Math.floor(i / cols);
        hooks[i].set(r.x - w / 2 + (c + 0.5) * (w / cols), r.y + h / 2 - row * (h / rows) - 0.05, r.z + 0.03);
        keys.setMatrixAt(i, m4.makeTranslation(hooks[i].x, hooks[i].y, hooks[i].z));
      }
      keys.instanceMatrix.needsUpdate = true;
    },
    update(o: { visible: boolean; allowed: boolean; dt: number; camera: THREE.Camera; width: number; height: number }) {
      group.visible = o.visible;
      if (!o.visible) { pointer.moved = false; return; }
      const dt = o.allowed ? o.dt : 0;
      // A passing cursor pushes the keys within 120 px (v × .002 rad/s per px/s, at most ±3 rad/s)
      if (pointer.moved && dt > 0) {
        for (let i = 0; i < COUNT; i++) {
          const d = Math.hypot(screen[i * 2] - pointer.x, screen[i * 2 + 1] - pointer.y);
          if (d > 120) continue;
          const push = Math.max(-3, Math.min(3, pointer.vx * 0.002 * (1 - d / 120)));
          if (Math.abs(push) > Math.abs(omega[i])) omega[i] = push;
        }
      }
      pointer.moved = false;
      for (let i = 0; i < COUNT; i++) {
        if (dt > 0) {
          let left = Math.min(dt, 0.1);
          while (left > 1e-6) {
            const h = Math.min(1 / 120, left);
            left -= h;
            omega[i] += (-G_L * Math.sin(theta[i]) - DAMP * omega[i]) * h;
            theta[i] += omega[i] * h;
          }
          lift[i] += ((i === lifted ? 1 : 0) - lift[i]) * (1 - Math.exp(-dt / 0.18));
        } else {
          theta[i] = omega[i] = 0;
          lift[i] = i === lifted ? 1 : 0;
        }
        aKey.setXYZW(i, i, state[i], theta[i], lift[i]);
        // Where the key hangs on screen, for the cursor next frame (no layout reads: a projection)
        v.copy(hooks[i]).setY(hooks[i].y - 0.15).project(o.camera);
        screen[i * 2] = (v.x + 1) * 0.5 * o.width;
        screen[i * 2 + 1] = (1 - v.y) * 0.5 * o.height;
      }
      aKey.needsUpdate = true;
    },
    dispose() {
      removeEventListener('pointermove', onPointer);
      geometry.dispose();
      boardGeometry.dispose();
      material.dispose();
      numbers.dispose();
      matcap?.dispose();
    },
  };
}
