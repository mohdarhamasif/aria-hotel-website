// The /hotels scene: one three.js world on the page's fixed canvas, which is the page's background. A section through
// the visitor's own house, drawn in champagne ink on forest; the gimballed champagne lantern that is Amariya, the
// scene's only warm light; the sky and the city by the hour; the key rack (#keys) and the translation plate (#lobby).
// The OrbStage renders it full frame; the Director (scheduler order 10) owns time, the camera rail and the orb root.
// Budget: ≤ 30 draw calls (the transmission pass draws the opaque world twice), ≤ 80k triangles, no post-processing.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { colors } from '../../../data/colors';
import { motion } from '../../../scripts/motion/prefs';
import { voice } from '../../../scripts/voice/bridge';
import type { OrbScene } from '../../../scripts/orb/stage';
import { createDirector } from './director';
import { DEFAULT_HOUSE, PRESETS, createHouse, normalize } from './generator';
import { createKeys } from './keys';
import { createLantern } from './lantern';
import { createSky } from './sky';
import { createTranslation } from './translation';
import type { HouseApi, HouseParams, KeysApi } from './types';

/** The house the visitor described last time, if the page remembered it (amariya_house) */
function remembered(): HouseParams {
  try {
    const raw = localStorage.getItem('amariya_house');
    if (!raw) return { ...DEFAULT_HOUSE };
    const saved = JSON.parse(raw) as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const rooms = saved.rooms;
    return normalize({
      hotel_name: text(saved.hotel_name ?? saved.name),
      hotel_type: text(saved.hotel_type ?? saved.type),
      rooms: typeof rooms === 'number' || typeof rooms === 'string' ? rooms : undefined,
    }, DEFAULT_HOUSE);
  } catch {
    // Private mode or a malformed record: the default house
    return { ...DEFAULT_HOUSE };
  }
}

export function createScene(root: HTMLElement): OrbScene {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 700);
  const house = createHouse(coarse, remembered());
  const sky = createSky(house, camera, coarse);
  const lantern = createLantern(coarse);
  const keys = createKeys(house.solidMaterial, coarse);
  const plate = createTranslation();
  scene.add(sky.group, house.group, keys.group, plate.mesh, lantern.group);
  const director = createDirector({ root, camera, house, lantern });

  /** Under reduced motion or Pause nothing animates: a change made by the page or the agent redraws one still */
  const still = () => { if (!motion.allowed) requestAnimationFrame(() => window.amariyaOrb?.still()); };
  keys.layout(house.layout, director.phone);
  const offLayout = house.onLayout((l) => {
    keys.layout(l, director.phone);
    director.relight();
    still();
  });
  const onTap = () => lantern.ripple(director.time);
  root.addEventListener('orb:tap', onTap);

  const houseApi: HouseApi = {
    rebuild(p) {
      house.rebuild(p, { animate: motion.allowed });
      // A name-only change re-gilds at once; a new house redraws from onLayout after the debounce
      still();
    },
    get params() { return house.params; },
    presets: PRESETS,
    lightRoom(room) { director.lightRoom(room); still(); },
  };
  const keysApi: KeysApi = {
    swing(n) { keys.api.swing(n); still(); },
    lift(n) { keys.api.lift(n); still(); },
    setLedger(l) { keys.api.setLedger(l); still(); },
  };
  window.amariyaNight = director.night;
  window.amariyaHouse = houseApi;
  window.amariyaKeys = keysApi;

  let gl: THREE.WebGLRenderer | null = null;
  let environment: THREE.Texture | null = null;
  let width = 1, height = 1, dpr = 1, frames = 0, shaderTime = 0;

  return {
    alpha: false,
    fullFrame: true,
    setup(renderer) {
      gl = renderer;
      renderer.setClearColor(new THREE.Color(colors.hospitality['bg-page']), 1);
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.transmissionResolutionScale = coarse ? 0.35 : 0.5;
      // The champagne is cut by its own level surface
      renderer.localClippingEnabled = true;
      // Glass and brass are lit by the room environment, like the shared champagne orb; nothing else is
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = environment;
      pmrem.dispose();
    },
    resize(w, h, ratio) {
      width = w;
      height = h;
      dpr = ratio;
      director.resize(w, h, ratio);
      house.resize(ratio);
      sky.resize(ratio);
      keys.layout(house.layout, director.phone);
    },
    update(f) {
      // A still frame (reduced motion, Pause, a redraw on scroll) runs the director first, so the pose is current
      if (f.dt === 0) director.update(performance.now(), 0);
      const allowed = motion.allowed;
      const st = director.state;
      // Shader time stands still with the motion, so a still frame redrawn on scroll does not shimmer
      if (allowed) shaderTime = director.time;
      const time = shaderTime;
      const U = house.uniforms;
      lantern.update(f, { allowed, time, ax: st.ax, bank: st.bank, dawn: U.uDawn.value, px: st.radiusPx * dpr, muted: voice.muted, intro: director.intro });
      // The lantern is the only warm light; the room she is in breathes with her words (≤ +35 %), never with the mic
      U.uWarm.value = lantern.core * (1 - 0.45 * U.uDawn.value);
      U.uAmp.value = f.amp * f.speak;
      house.update(time, allowed, st.camY - 1.25);
      sky.setTime(st.minutes);
      keys.update({ visible: st.anchor === 'keys' || (st.next === 'keys' && st.s > 0), allowed, dt: f.dt, camera, width, height });
      plate.update({ visible: st.anchor === 'lobby', center: st.lanternPos, radius: st.lanternR, camera, time, allowed });
    },
    render(renderer) {
      renderer.render(scene, camera);
      if (import.meta.env.DEV && ++frames === 3) console.info(`[hotels] ${renderer.info.render.calls} draw calls, ${renderer.info.render.triangles} triangles`);
    },
    // Lighter without recompiling a shader: a coarser transmission pass and half the perlage
    degrade() {
      if (gl) gl.transmissionResolutionScale = 0.35;
      lantern.degrade();
    },
    dispose() {
      root.removeEventListener('orb:tap', onTap);
      offLayout();
      director.dispose();
      house.dispose();
      sky.dispose();
      lantern.dispose();
      keys.dispose();
      plate.dispose();
      environment?.dispose();
      delete window.amariyaNight;
      delete window.amariyaHouse;
      delete window.amariyaKeys;
    },
  };
}
