// The camera rail: a pose per anchor (where the camera stands, what it looks at, its lens and where on screen the
// subject sits), the ride between two poses, and the night's clock map from scroll to minutes and back.
// DOM-free (three.js maths only), so the maps can be checked in Node.
import * as THREE from 'three';
import type { AnchorKey } from './types';

/** A screen region in CSS px (top-left origin) */
export interface Frame { x: number; y: number; w: number; h: number }

export interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  /** Vertical field of view, degrees */
  fov: number;
  /** Where the target lands on screen, CSS px (the principal point, set with setViewOffset) */
  cx: number;
  cy: number;
}

/** A shot: the point to frame, how far the subject reaches from it (world units: left, right, up, down) and the camera's bearing */
export interface Shot {
  at: THREE.Vector3;
  reach: [number, number, number, number];
  /** Yaw (positive: from the right) and elevation of the camera, radians */
  az: number;
  el: number;
  /** The target's place in the frame, as fractions */
  fx: number;
  fy: number;
}

export const newPose = (): Pose => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 22, cx: 0, cy: 0 });

/** The camera distance that fits the shot's reach inside the frame around its principal point */
export function aim(shot: Shot, frame: Frame, viewH: number, fov: number, out: Pose = newPose()): Pose {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const cx = frame.x + frame.w * shot.fx;
  const cy = frame.y + frame.h * shot.fy;
  const room = [cx - frame.x, frame.x + frame.w - cx, cy - frame.y, frame.y + frame.h - cy];
  let d = 1;
  // A world offset e at distance d spans e·(H/2)/(d·tan) px; it has to fit the room on that side
  for (let i = 0; i < 4; i++) d = Math.max(d, (shot.reach[i] * viewH) / (2 * Math.max(8, room[i]) * tan));
  const ce = Math.cos(shot.el);
  out.target.copy(shot.at);
  out.pos.set(Math.sin(shot.az) * ce, Math.sin(shot.el), Math.cos(shot.az) * ce).multiplyScalar(d).add(shot.at);
  out.fov = fov;
  out.cx = cx;
  out.cy = cy;
  return out;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/**
 * The ride between two poses at s (0–1, already S-curved). A change of floor climbs the lift shaft: the path bows
 * through the shaft's x while the height follows its own S-curve, and the camera draws back a little mid-ride.
 */
export function ride(out: Pose, a: Pose, b: Pose, s: number, shaftX: number): Pose {
  const climb = Math.abs(a.target.y - b.target.y) > 1.6;
  const ys = climb ? THREE.MathUtils.smoothstep(s, 0.2, 0.8) : s;
  const xBow = (xa: number, xb: number) => (climb ? (1 - s) ** 2 * xa + 2 * s * (1 - s) * shaftX + s * s * xb : xa + (xb - xa) * s);
  out.target.set(xBow(a.target.x, b.target.x), a.target.y + (b.target.y - a.target.y) * ys, a.target.z + (b.target.z - a.target.z) * s);
  tmpA.subVectors(a.pos, a.target);
  tmpB.subVectors(b.pos, b.target);
  tmpA.lerp(tmpB, s).multiplyScalar(1 + 0.18 * Math.sin(Math.PI * s) * (climb ? 1 : 0.4));
  out.pos.copy(out.target).add(tmpA);
  out.fov = a.fov + (b.fov - a.fov) * s;
  out.cx = a.cx + (b.cx - a.cx) * s;
  out.cy = a.cy + (b.cy - a.cy) * s;
  return out;
}

/** Exponential approach of one pose to another (τ in seconds); dt 0 snaps */
export function follow(out: Pose, goal: Pose, dt: number, tau: number): Pose {
  const k = dt <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  out.pos.lerp(goal.pos, k);
  out.target.lerp(goal.target, k);
  out.fov += (goal.fov - out.fov) * k;
  out.cx += (goal.cx - out.cx) * k;
  out.cy += (goal.cy - out.cy) * k;
  return out;
}

/** Camera bearing per anchor: yaw, elevation and the subject's place in the frame */
export const BEARING: Record<AnchorKey, { az: number; el: number; fx: number; fy: number }> = {
  // No yaw: the ground line stays level across the screen, at the 64 % the H1 sits on
  prologue: { az: 0, el: 0.05, fx: 0.62, fy: 1 },
  house: { az: 0.22, el: 0.1, fx: 0.5, fy: 0.52 },
  restaurant: { az: -0.14, el: 0.06, fx: 0.5, fy: 0.56 },
  lobby: { az: 0.1, el: 0.05, fx: 0.5, fy: 0.74 },
  room214: { az: 0.18, el: 0.08, fx: 0.5, fy: 0.5 },
  desk: { az: -0.1, el: 0.06, fx: 0.5, fy: 0.56 },
  office: { az: -0.2, el: 0.05, fx: 0.5, fy: 0.55 },
  room507: { az: 0.14, el: 0.07, fx: 0.5, fy: 0.52 },
  handover: { az: 0.06, el: 0.16, fx: 0.5, fy: 0.6 },
  keys: { az: 0, el: 0.02, fx: 0.48, fy: 0.5 },
  register: { az: -0.06, el: 0.08, fx: 0.5, fy: 0.56 },
  faq: { az: -0.06, el: 0.08, fx: 0.5, fy: 0.56 },
  checkout: { az: -0.25, el: -0.04, fx: 0.46, fy: 0.55 },
};

/* ---------- The night's clock map ---------- */

/** A chapter's top on the page (px, capped at the scroll limit) and its minute of the night */
export interface Stop { y: number; m: number }

/** Minutes at scroll y: piecewise-linear between the chapters' tops (the prologue's 'now' may run back to 18:00) */
export function minutesAt(stops: Stop[], y: number): number {
  if (!stops.length) return 0;
  if (y <= stops[0].y) return stops[0].m;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (y < b.y && b.y > a.y) return a.m + ((b.m - a.m) * (y - a.y)) / (b.y - a.y);
  }
  return stops[stops.length - 1].m;
}

/** Scroll y for minute m, along the stretch where the night runs forward (from 18:00 on) */
export function scrollFor(stops: Stop[], m: number): number {
  let first = -1;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (b.m <= a.m || b.y <= a.y) continue;
    if (first < 0) first = i;
    if (m >= a.m && m <= b.m) return a.y + ((b.y - a.y) * (m - a.m)) / (b.m - a.m);
  }
  if (first < 0) return stops[0]?.y ?? 0;
  if (m < stops[first].m) return stops[first].y;
  // Past the last forward stretch: the last chapter that carries that minute
  let y = stops[first].y;
  for (const s of stops) if (s.m <= m) y = Math.max(y, s.y);
  return y;
}

/** The chapter whose top has reached the viewport top (2 px of slack for rounding scrolls) */
export function chapterIndexAt(stops: Stop[], y: number): number {
  let i = 0;
  for (let k = 0; k < stops.length; k++) if (stops[k].y <= y + 2) i = k;
  return i;
}
