// The nacre pearl: pearl.ts's rosé MeshPhysicalMaterial (same body, sheen, clearcoat and thin film) extended with
// nacre orient overtones at the rim, speech ripples, polish (lustre and a mirror patch), tone, a jeweller's lamp,
// and one plane behind it on the paper for the contact shadow, the listening halo and a faint thin-film caustic.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { colors } from '../../../data/colors';
import type { OrbFrame } from '../../../scripts/orb/stage';

const C = colors.dental;
const FOV = 22;
/** The root box is 2.6 pearl radii: the pearl fills 1/1.3 of its half-size, the rest is the shadow's pad */
const FILL = 1 / 1.3;
const HALF = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const DIST = 1 / Math.sin(Math.atan(HALF * FILL));
/** Plane units per screen pearl-radius on the paper (z = −1): the pearl's rim seen against the paper */
const SIL = (DIST + 1) / Math.sqrt(DIST * DIST - 1);
const TAU = Math.PI * 2;
const CAMERA_YAW = THREE.MathUtils.degToRad(3);
const LAMP = 0.9;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;

/** What the hand and the sheet did to the pearl this frame (physics.ts) */
export interface NacreInput {
  /** Pearl radius, CSS px */
  radius: number;
  /** px toward the viewer (carried); negative while it dips into the paper on a set */
  lift: number;
  /** 0–1 lifted out of its recess: scale 1.04, the shadow widens and softens */
  carry: number;
  /** 0–1 polish */
  lustre: number;
  /** View-space direction of the point being polished this frame, or null */
  patch: THREE.Vector3 | null;
  /** Paper-relative travel since the last frame (px, DOM axes): the pearl rolls without slipping */
  rollX: number;
  rollY: number;
}

// ponytail: pearl.ts keeps its texture helper private, so the same tileable thin-film noise is generated here
function thicknessTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TAU, v = (y / size) * TAU;
      const n = 0.5 + 0.18 * Math.sin(u * 2 + Math.sin(v * 3) * 1.3) + 0.16 * Math.sin(v * 2 + Math.sin(u * 3 + 1) * 1.1) + 0.1 * Math.sin((u + v) * 3 + 2) + 0.06 * Math.sin((u - v) * 5);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(Math.round(n * 255), 0, 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const PLANE_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Units: screen pearl radii (the pearl's rim is 1, the root box's edge 1.3)
const PLANE_FRAGMENT = /* glsl */ `
uniform vec3 uShadow, uHalo, uRose, uGreen, uGold;
uniform float uSil, uShadowA, uSpread, uSoft, uHaloR, uHaloA, uCausticA, uCausticAng, uCausticPhase;
uniform vec2 uOff;
varying vec2 vP;
void main() {
  vec2 p = vP / uSil;
  // Contact shadow: a tight core at the rim and a soft penumbra, thrown away from the lamp
  float r = length((p - uOff) / uSpread);
  float shadow = uShadowA * (0.7 * (1.0 - smoothstep(0.94, 1.07 + uSoft, r)) + 0.3 * (1.0 - smoothstep(0.96, 1.24 + uSoft, r)));
  float rr = length(p);
  // Listening: a rose ring whose radius follows the visitor's voice
  float hd = (rr - uHaloR) / 0.035;
  float halo = uHaloA * exp(-hd * hd);
  // Nacre light on the paper: thin-film bands in a crescent, drifting as the room turns
  float side = pow(0.5 + 0.5 * cos(atan(p.y, p.x + 1e-5) - uCausticAng), 3.0);
  float caustic = uCausticA * side * smoothstep(1.02, 1.1, rr) * (1.0 - smoothstep(1.14, 1.26, rr));
  float band = fract(rr * 6.0 - uCausticPhase) * 3.0;
  vec3 film = band < 1.0 ? mix(uRose, uGold, band) : band < 2.0 ? mix(uGold, uGreen, band - 1.0) : mix(uGreen, uRose, band - 2.0);
  // Nothing reaches the box's edge, so the scissor never shows
  float edge = 1.0 - smoothstep(1.18, 1.28, max(abs(p.x), abs(p.y)));
  shadow *= edge; halo *= edge; caustic *= edge;
  vec3 c = uShadow * shadow; float a = shadow;
  c = film * caustic + c * (1.0 - caustic); a = caustic + a * (1.0 - caustic);
  c = uHalo * halo + c * (1.0 - halo); a = halo + a * (1.0 - halo);
  gl_FragColor = vec4(a > 0.0 ? c / a : c, a);
  #include <colorspace_fragment>
}`;

export function createNacre() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);
  const group = new THREE.Group();
  scene.add(group);

  // The jeweller's lamp: warm, top left, fixed while the room turns
  const lamp = new THREE.DirectionalLight(new THREE.Color(C['orb-highlight']).lerp(new THREE.Color(C['orb-sheen']), 0.1), LAMP);
  lamp.position.set(-2.2, 2.6, 3);
  scene.add(lamp);

  const thickness = thicknessTexture();
  const sheenGold = new THREE.Color(C['orb-sheen']);
  const sheenListen = new THREE.Color(C['orb-sheen-listen']);
  // pearl-200 (the border role): calm cools the sheen toward the paper
  const sheenCalm = new THREE.Color(C.border);
  const u = {
    uDimple: { value: 0 },
    uPointerDir: { value: new THREE.Vector3(0, 0, 1) },
    uEdge: { value: new THREE.Color(C['orb-edge']) },
    uEdgeAmt: { value: 0.16 },
    uOrientRose: { value: new THREE.Color(C['orb-orient-rose']) },
    uOrientGreen: { value: new THREE.Color(C['orb-orient-green']) },
    uRing: { value: 0 },
    uPhase: { value: 0 },
    /** Polished patch: object-space centre and strength */
    uPatch: { value: new THREE.Vector4(0, 0, 1, 0) },
    /** The sheen sliding over the surface: the thin-film map's offset */
    uSlide: { value: new THREE.Vector2() },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(C['orb-body']),
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    sheen: 0.5,
    sheenColor: sheenGold.clone(),
    sheenRoughness: 0.3,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 820],
    iridescenceThicknessMap: thickness,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uDimple; uniform vec3 uPointerDir; varying vec3 vObj;')
      // Listening: the pearl dimples gently toward the cursor
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\ntransformed -= normal * uDimple * smoothstep(0.82, 1.0, dot(normalize(position), uPointerDir));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uEdge, uOrientRose, uOrientGreen; uniform float uEdgeAmt, uRing, uPhase; uniform vec4 uPatch; uniform vec2 uSlide; varying vec3 vObj;')
      .replace('#include <lights_physical_fragment>', /* glsl */ `#include <lights_physical_fragment>
        // The film is mapped from the pearl's own surface (three planes), so rolling never shows a pole or a seam
        vec3 nacreN = normalize(vObj);
        vec3 nacreW = pow(abs(nacreN), vec3(4.0));
        nacreW /= nacreW.x + nacreW.y + nacreW.z;
        float nacreTm = 0.5;
        #ifdef USE_IRIDESCENCE_THICKNESSMAP
          nacreTm = texture2D(iridescenceThicknessMap, nacreN.yz * 0.5 + uSlide).g * nacreW.x
            + texture2D(iridescenceThicknessMap, nacreN.zx * 0.5 + uSlide).g * nacreW.y
            + texture2D(iridescenceThicknessMap, nacreN.xy * 0.5 + uSlide).g * nacreW.z;
        #endif
        // Speech: rings of film ripple out from the crown, the point facing the viewer
        float nacreCrown = acos(clamp(normal.z, -1.0, 1.0));
        float nacreT = nacreTm + 0.06 * uRing * sin(12.0 * nacreCrown - uPhase);
        // Polish: the rubbed patch turns coherent and becomes a mirror of the room
        float nacrePatch = uPatch.w * (1.0 - smoothstep(0.2, 0.35, distance(nacreN, uPatch.xyz)));
        #ifdef USE_IRIDESCENCE
          vec2 nacreRange = mix(vec2(iridescenceThicknessMinimum, iridescenceThicknessMaximum), vec2(260.0, 640.0), nacrePatch);
          material.iridescenceThickness = mix(nacreRange.x, nacreRange.y, nacreT);
        #endif
        material.roughness = mix(material.roughness, 0.025, nacrePatch);
        #ifdef USE_CLEARCOAT
          material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.0525, nacrePatch);
        #endif`)
      .replace('#include <opaque_fragment>', /* glsl */ `#include <opaque_fragment>
        // Orient: at grazing angles real nacre shows pink and green overtones, not white
        float nacreF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        float nacreF2 = nacreF * nacreF;
        float nacreSplit = smoothstep(0.3, 0.7, nacreTm);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uOrientRose, nacreF2 * 0.14 * (1.0 - nacreSplit));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uOrientGreen, nacreF2 * 0.14 * nacreSplit);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, pow(nacreF, 4.0) * uEdgeAmt);`);
  };
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), material);
  group.add(pearl);

  const p = {
    uShadow: { value: new THREE.Color(C['orb-shadow']) },
    uHalo: { value: new THREE.Color(C['orb-sheen-listen']) },
    uRose: { value: new THREE.Color(C['orb-orient-rose']) },
    uGreen: { value: new THREE.Color(C['orb-orient-green']) },
    uGold: { value: new THREE.Color(C['orb-sheen']) },
    uSil: { value: SIL },
    uShadowA: { value: 0.2 },
    uSpread: { value: 1 },
    uSoft: { value: 0 },
    uOff: { value: new THREE.Vector2(0.06, -0.08) },
    uHaloR: { value: 1.1 },
    uHaloA: { value: 0 },
    uCausticA: { value: 0.12 },
    uCausticAng: { value: -Math.PI / 4 },
    uCausticPhase: { value: 0 },
  };
  const paperMaterial = new THREE.ShaderMaterial({ uniforms: p, vertexShader: PLANE_VERTEX, fragmentShader: PLANE_FRAGMENT, transparent: true, depthWrite: false });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), paperMaterial);
  paper.position.z = -1;
  scene.add(paper);

  const q = new THREE.Quaternion(), dq = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  const axis = new THREE.Vector3(), dir = new THREE.Vector3();
  let environment: THREE.Texture | null = null;
  let aspect = 1, lastYaw = 0, lastPitch = 0, envAngle = 0, nudgeX = 0, nudgeY = 0, camYaw = 0, degraded = false;

  return {
    setup(renderer: THREE.WebGLRenderer) {
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environment = pmrem.fromScene(room, 0.04).texture;
      scene.environment = environment;
      room.dispose();
      pmrem.dispose();
    },

    update(f: OrbFrame, s: NacreInput) {
      const dt = f.dt;
      if (f.view.w / f.view.h !== aspect) {
        camera.aspect = aspect = f.view.w / f.view.h;
        camera.updateProjectionMatrix();
      }
      const radius = Math.max(1, s.radius);

      // Orientation: every turn is applied in the viewer's frame, so the hand, the rolling and the drift compose
      dq.setFromAxisAngle(Y, f.yaw - lastYaw);
      q.premultiply(dq);
      dq.setFromAxisAngle(X, f.pitch - lastPitch);
      q.premultiply(dq);
      lastYaw = f.yaw;
      lastPitch = f.pitch;
      // Rolling without slipping: Δθ = |Δp| / R about the paper's normal × the direction of travel
      const roll = Math.hypot(s.rollX, s.rollY);
      if (roll > 1e-3) {
        axis.set(s.rollY, s.rollX, 0).normalize();
        q.premultiply(dq.setFromAxisAngle(axis, roll / radius));
      }
      // Thinking: a slow precession
      if (f.think > 0.001 && dt) q.premultiply(dq.setFromAxisAngle(Y, 0.4 * f.think * dt));
      group.quaternion.copy(q.normalize());
      inverse.copy(q).invert();

      // Lifted toward the viewer (connecting, carried) or dipping into the paper on a set
      const liftPx = 6 * f.connect + s.lift;
      group.position.z = liftPx / radius;
      // Idle breathing ±.4 % at .15 Hz; speaking swells with her voice; lifted pearls read 4 % larger
      pearl.scale.setScalar(1 + 0.004 * Math.sin(TAU * 0.15 * f.t) + 0.05 * f.amp * f.speak + 0.04 * s.carry);

      // The room turns (6× while connecting, half speed when calm); a cursor within 1.5 R nudges it toward the hand
      envAngle += dt * 0.06 * (1 - 0.5 * f.calm) * (1 + 5 * f.connect);
      const px = f.pointer.x * 1.3, py = f.pointer.y * 1.3;
      const near = 1 - smooth(Math.hypot(px, py), 1.4, 1.6);
      const ke = dt ? 1 - Math.exp(-dt / 0.25) : 0;
      nudgeX += (0.25 * clamp(px / 1.5, -1, 1) * near - nudgeX) * ke;
      nudgeY += (0.25 * clamp(py / 1.5, -1, 1) * near - nudgeY) * ke;
      scene.environmentRotation.set(-nudgeY, envAngle + nudgeX, 0);
      // and the camera yaws up to 3° with it, for parallax against the paper
      camYaw += (CAMERA_YAW * clamp(px / 1.5, -1, 1) * near - camYaw) * (dt ? 1 - Math.exp(-dt / 0.4) : 0);
      camera.position.set(DIST * Math.sin(camYaw), 0, DIST * Math.cos(camYaw));
      camera.lookAt(0, 0, 0);

      // The film slides (4× while thinking); polish narrows it, bright widens it
      u.uSlide.value.x += dt * 0.012 * (1 + 3 * f.think);
      u.uSlide.value.y += dt * 0.007 * (1 + 3 * f.think);
      const lustre = clamp(s.lustre, 0, 1);
      material.iridescenceThicknessRange[0] = lerp(lerp(120, 100, f.bright), 260, lustre);
      material.iridescenceThicknessRange[1] = lerp(lerp(820, 900, f.bright), 640, lustre);
      material.iridescenceIOR = 1.3 + 0.06 * f.bright;
      material.iridescence = degraded ? 0.6 : 1;
      lamp.intensity = LAMP * (1 + 0.3 * f.bright);
      material.clearcoatRoughness = lerp(lerp(0.03, 0.015, lustre), 0.12, f.soft);
      material.sheen = clamp(lerp(0.5, 0.3, f.soft) + 0.5 * f.amp * f.speak + 0.5 * lustre, 0, 1);
      material.sheenColor.copy(sheenGold).lerp(sheenListen, f.listen).lerp(sheenCalm, f.calm * (1 - f.listen));

      // Speech ripples at syllable rate: the louder her voice, the faster and stronger
      u.uRing.value = f.speak * (0.25 + 0.75 * f.amp);
      u.uPhase.value = (u.uPhase.value + dt * TAU * (0.8 + 4 * f.amp) * f.speak) % (TAU * 64);

      // The dimple follows the cursor; the point under it is mapped into the pearl's own frame
      u.uDimple.value = 0.025 * f.hover + 0.07 * f.listen;
      const d2 = px * px + py * py;
      dir.set(px, py, d2 < 1 ? Math.sqrt(1 - d2) : 0.2).normalize().applyQuaternion(inverse);
      u.uPointerDir.value.copy(dir);
      // The polished patch is stamped where the hand rubs, and stays there as the pearl turns
      if (s.patch) {
        dir.copy(s.patch).applyQuaternion(inverse).normalize();
        u.uPatch.value.set(dir.x, dir.y, dir.z, 0);
      }
      u.uPatch.value.w = degraded ? 0 : lustre;

      // The paper: the shadow tightens while connecting, widens and softens when lifted, deepens on a dip;
      // listening turns it into a halo whose radius follows the visitor's voice
      const liftN = clamp(liftPx / 14, 0, 1), dipN = clamp(-s.lift / 6, 0, 1);
      p.uSpread.value = lerp(1, 0.7, f.connect) * (1 + 0.25 * liftN) * (1 - 0.06 * dipN);
      p.uSoft.value = 0.12 * liftN;
      p.uShadowA.value = 0.2 * (1 - 0.45 * liftN) * (1 - 0.65 * f.listen) * (1 + 0.4 * dipN);
      p.uOff.value.set(0.06, -0.08).multiplyScalar(1 + 1.6 * liftN);
      p.uHaloR.value = 1.1 + 0.25 * f.amp * f.listen;
      p.uHaloA.value = f.listen * (0.4 + 0.35 * f.amp);
      p.uCausticA.value = 0.12 * (1 - 0.5 * f.listen);
      p.uCausticAng.value = -Math.PI / 4 + 0.5 * envAngle;
      p.uCausticPhase.value = (envAngle * 0.8) % 1;
    },

    render(renderer: THREE.WebGLRenderer) {
      renderer.render(scene, camera);
    },

    /** Slow device: a lighter sphere, weaker film, and polish as lustre only (no mirror patch) */
    degrade() {
      degraded = true;
      pearl.geometry.dispose();
      pearl.geometry = new THREE.SphereGeometry(1, 64, 48);
    },

    dispose() {
      environment?.dispose();
      thickness.dispose();
      pearl.geometry.dispose();
      material.dispose();
      paper.geometry.dispose();
      paperMaterial.dispose();
    },
  };
}
