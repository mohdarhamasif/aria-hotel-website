import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { colors } from '../../data/colors';
import type { OrbScene } from './stage';

// Dental: an opaque rosé pearl with a thin-film sheen that slides across it, and rose edges.
const C = colors.dental;
const FOV = 22;
/** Pearl radius as a share of the canvas half-height */
const FILL = 0.64;

/** Smooth tileable noise for the iridescence thickness; scrolling it slides the sheen over the pearl */
function thicknessTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const n = 0.5 + 0.18 * Math.sin(u * 2 + Math.sin(v * 3) * 1.3) + 0.16 * Math.sin(v * 2 + Math.sin(u * 3 + 1) * 1.1) + 0.1 * Math.sin((u + v) * 3 + 2) + 0.06 * Math.sin((u - v) * 5);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, Math.round(n * 255)));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Soft round alpha mask for the shadow under the pearl (the shadow's colour comes from its token) */
function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createPearl(): OrbScene {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.position.set(0, 0, 1 / Math.sin(Math.atan(half * FILL)));

  const group = new THREE.Group();
  scene.add(group);
  const inverse = new THREE.Quaternion();

  const thickness = thicknessTexture();
  const sheenBase = new THREE.Color(C['orb-sheen']);
  const sheenListen = new THREE.Color(C['orb-sheen-listen']);
  const pearlUniforms = {
    uEdge: { value: new THREE.Color(C['orb-edge']) },
    uEdgeAmt: { value: 0.32 },
    uDimple: { value: 0 },
    uPointerDir: { value: new THREE.Vector3(0, 0, 1) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(C['orb-body']),
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    sheen: 0.5,
    sheenColor: sheenBase.clone(),
    sheenRoughness: 0.3,
    iridescence: 1,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 820],
    iridescenceThicknessMap: thickness,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pearlUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uDimple; uniform vec3 uPointerDir;')
      // Listening: the pearl dimples gently toward the cursor
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed -= normal * uDimple * smoothstep(0.82, 1.0, dot(normalize(position), uPointerDir));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uEdge; uniform float uEdgeAmt;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nfloat orbFresnel = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, orbFresnel * uEdgeAmt);');
  };
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), material);
  group.add(pearl);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture(),
    color: new THREE.Color(C['orb-shadow']),
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  shadow.position.set(0, -1.24, -0.3);
  scene.add(shadow);

  let environment: THREE.Texture | null = null;

  return {
    alpha: true,
    setup(renderer) {
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      const pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = environment;
      pmrem.dispose();
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    update(f) {
      // Idle: a slow float; the shadow tightens and fades as the pearl rises
      const float = Math.sin(f.t * 0.6) * 0.035;
      group.position.y = 0.1 + float;
      shadow.scale.set(1.9 * (1 - float * 0.8), 0.34 * (1 - float * 0.8), 1);
      shadowMaterial.opacity = 0.2 - float * 0.6;
      // Highlights glide as the studio light turns; the sheen slides across the surface
      scene.environmentRotation.y = f.t * 0.06;
      thickness.offset.set(f.t * 0.012, f.t * 0.007);
      // Speaking: swells with the voice and the sheen rises; listening: the sheen turns pinker
      pearl.scale.setScalar(1 + 0.015 * f.speak + 0.05 * f.amp - 0.015 * f.grab);
      material.sheen = 0.5 + 0.5 * f.amp + 0.2 * f.spin;
      material.sheenColor.copy(sheenBase).lerp(sheenListen, f.listen);
      // Turned by hand; a thrown pearl keeps rolling until the inertia fades
      group.rotation.set(f.pitch, f.yaw, 0);
      // The dimple follows the cursor in view space, so it is mapped back into the pearl's own frame
      pearlUniforms.uDimple.value = 0.025 * f.hover + 0.07 * f.listen;
      pearlUniforms.uPointerDir.value.set(f.pointer.x * 0.7, f.pointer.y * 0.7, 1).normalize().applyQuaternion(inverse.copy(group.quaternion).invert());
    },
    render(renderer) {
      renderer.render(scene, camera);
    },
    degrade() {
      material.iridescence = 0.6;
    },
    dispose() {
      environment?.dispose();
      thickness.dispose();
      shadowMaterial.map?.dispose();
      for (const mesh of [pearl, shadow]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
