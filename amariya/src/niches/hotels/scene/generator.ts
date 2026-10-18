// The house: a parametric section kit drawn in champagne ink on forest. Slabs and walls are merged boxes whose cut faces
// carry a hatched poché; each room's back wall and window is one instance of a panel (lit by occupancy with a filament
// flicker); furniture is one instanced set of silhouettes; every edge is one LineSegments drawn in light near the lantern.
// No three.js lights: every surface is lit in its shader by the lantern, the lit windows and, at dawn, the sun.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colors } from '../../../data/colors';
import { CELL, TOP, displayFont, furnitureAtlas, textPlane } from './atlas';
import type { HouseInput, HouseParams, ScenarioId } from './types';

const C = colors.hospitality;
/** World units are metres */
export const BAY = 4;
export const GROUND_H = 4.4;
export const FLOOR_H = 3.3;
export const SLAB = 0.34;
export const WALL = 0.28;
export const DEPTH = 7;
export const SHAFT = 2.6;
const DOOR_H = 2.7;
const MACHINE = 2.8;
/** Windows (one per room, plus the lobby, restaurant and lift car): the largest house, 9 × 12, needs about 100 */
const MAX_PANELS = 220;
const MAX_SPRITES = 360;

export const PRESETS: Record<ScenarioId, Omit<HouseParams, 'name'>> = {
  boutique: { floors: 5, bays: 6, ground: 'lobby', roof: 'garden' },
  resort: { floors: 3, bays: 12, ground: 'lobby+restaurant', roof: 'terrace' },
  restaurant: { floors: 2, bays: 4, ground: 'restaurant', roof: 'pitched' },
  'hotel-restaurant': { floors: 7, bays: 5, ground: 'lobby+restaurant', roof: 'terrace' },
};
export const DEFAULT_HOUSE: HouseParams = { ...PRESETS['hotel-restaurant'], name: '' };

/** hotel_type words → ground floor and roof */
const TYPES: [RegExp, Partial<HouseParams>][] = [
  [/hotel.*restaurant|restaurant.*hotel/i, { ground: 'lobby+restaurant' }],
  [/restaurant/i, { ground: 'restaurant', roof: 'pitched' }],
  [/resort/i, { ground: 'lobby+restaurant', roof: 'terrace' }],
  [/boutique/i, { ground: 'lobby', roof: 'garden' }],
  [/b&b|guest/i, { ground: 'lobby', roof: 'pitched' }],
  [/city/i, { ground: 'lobby+restaurant', roof: 'plain' }],
  [/apartment|chain|group/i, { ground: 'lobby', roof: 'plain' }],
];
const GROUNDS: HouseParams['ground'][] = ['lobby+restaurant', 'restaurant', 'lobby'];
const ROOFS: HouseParams['roof'][] = ['terrace', 'garden', 'plain', 'pitched'];
const int = (v: unknown, lo: number, hi: number, keep: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : keep;
};

/** Merges a rebuild request into the current house */
export function normalize(p: HouseInput, cur: HouseParams): HouseParams {
  const out = { ...cur };
  const type = typeof p.hotel_type === 'string' ? TYPES.find(([re]) => re.test(p.hotel_type as string))?.[1] : undefined;
  if (type) {
    Object.assign(out, type);
    if (type.ground === 'restaurant' && p.floors === undefined) out.floors = 2;
  }
  if (p.ground && GROUNDS.includes(p.ground)) out.ground = p.ground;
  if (p.roof && ROOFS.includes(p.roof)) out.roof = p.roof;
  const rooms = Number(String(p.rooms ?? '').replace(/[^\d.]/g, ''));
  if (rooms > 0 && p.floors === undefined) {
    // A restaurant counts tables: they widen the floor instead of stacking storeys
    if (out.ground === 'restaurant') out.bays = int(Math.ceil(rooms / 4), 3, 12, out.bays);
    else out.floors = int(Math.ceil(rooms / 14), 2, 9, out.floors);
  }
  if (p.floors !== undefined) out.floors = int(p.floors, 2, 9, out.floors);
  if (p.bays !== undefined) out.bays = int(p.bays, 3, 12, out.bays);
  const name = p.name ?? p.hotel_name;
  if (typeof name === 'string') out.name = name.replace(/\s+/g, ' ').trim().slice(0, 48);
  return out;
}

/* ---------- Layout ---------- */

/** A place the lantern visits */
export interface Anchor {
  /** Where the lantern rests */
  at: THREE.Vector3;
  /** What the camera frames: centre and half extents */
  focus: { x: number; y: number; z: number; hw: number; hh: number };
  /** The room's panel (−1: none): lit while the lantern is there, brighter as she speaks */
  panel: number;
  /** 1: the lantern sits on the point (a desk); 0: it hangs centred on it */
  lift: number;
  /** The phone that rings in this room (−1: none) */
  phone: number;
}
export type RoomKey = 'house' | 'restaurant' | 'desk' | 'room214' | 'office' | 'room507' | 'keys' | 'checkout';

interface PanelSpec { x0: number; x1: number; y0: number; y1: number; win: [number, number, number, number]; panes: number; kind: number; seed: number }
interface SpriteSpec { cell: number; x: number; y: number; z: number; s: number; phone: number }

export interface Layout {
  params: HouseParams;
  half: number;
  /** Top of the roof slab, and of everything on the roof */
  top: number;
  roofTop: number;
  shaft: [number, number];
  anchors: Record<RoomKey, Anchor>;
  /** The key rack on the lobby's back wall (centre, size) */
  rack: { x: number; y: number; z: number; w: number; h: number };
  /** World rectangle of each panel, for the speaking-room boost */
  rects: [number, number, number, number][];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function plan(p: HouseParams, coarse: boolean) {
  const rnd = mulberry32(p.floors * 131 + p.bays * 17 + p.ground.length * 7 + p.roof.length);
  const solids: THREE.BufferGeometry[] = [];
  const lines: number[] = [];
  const panels: PanelSpec[] = [];
  const sprites: SpriteSpec[] = [];
  const nl = Math.floor(p.bays / 2);
  const nr = p.bays - nl;
  const half = (p.bays * BAY + SHAFT) / 2;
  const s0 = -half + nl * BAY;
  const s1 = s0 + SHAFT;
  const fy = (i: number) => (i <= 0 ? 0 : GROUND_H + (i - 1) * FLOOR_H);
  const top = fy(p.floors);
  const zMid = -DEPTH * 0.5;
  const restaurantOnly = p.ground === 'restaurant';
  const machine = p.roof === 'pitched' ? 0 : MACHINE;
  const lx = (j: number) => -half + j * BAY;
  const rx = (j: number) => s1 + j * BAY;

  const seg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => { lines.push(x0, y0, z0, x1, y1, z1); };
  const edges = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (const z of [z0, z1]) { seg(x0, y0, z, x1, y0, z); seg(x0, y1, z, x1, y1, z); seg(x0, y0, z, x0, y1, z); seg(x1, y0, z, x1, y1, z); }
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) seg(x, y, z0, x, y, z1);
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0 = -DEPTH, z1 = 0, outline = true) => {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;
    solids.push(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).deleteAttribute('uv'));
    if (outline) edges(x0, x1, y0, y1, z0, z1);
  };
  const panel = (x0: number, x1: number, y0: number, y1: number, kind: number, win: [number, number, number, number], panes: number) => {
    panels.push({ x0, x1, y0, y1, kind, win, panes, seed: rnd() });
    return panels.length - 1;
  };
  const room = (x0: number, x1: number, i: number) => panel(x0 + WALL / 2, x1 - WALL / 2, fy(i), fy(i + 1) - SLAB, 0, [0.27, 0.3, 0.73, 0.84], 2);
  const zone = (x0: number, x1: number, i: number) =>
    panel(x0 + WALL / 2, x1 - WALL / 2, fy(i), fy(i + 1) - SLAB, 2, [0.03, 0.2, 0.97, 0.9], Math.max(2, Math.round((x1 - x0) / 1.5)));
  const sprite = (name: keyof typeof CELL, x: number, y: number, z: number, s: number, phone = -1) => {
    if (coarse && !(name === 'bed' || name === 'table' || name === 'desk' || name === 'phone')) return;
    sprites.push({ cell: CELL[name], x, y, z, s, phone });
  };

  /* Ground, earth and street */
  box(-140, 140, -12, 0, -0.8, 0, false);
  solids.push(new THREE.PlaneGeometry(320, 300).rotateX(-Math.PI / 2).translate(0, 0, -150.8).deleteAttribute('uv'));
  seg(-140, 0, 0, 140, 0, 0);
  seg(half + 6, 0, 0, half + 6, -0.18, 0);
  seg(half + 6, -0.18, 0, 140, -0.18, 0);
  // A street lamp by the kerb
  seg(half + 6.6, 0, -0.4, half + 6.6, 4.6, -0.4);
  seg(half + 6.6, 4.6, -0.4, half + 5.6, 4.9, -0.4);
  seg(half + 5.6, 4.9, -0.4, half + 5.6, 4.6, -0.4);

  /* Structure */
  for (let k = 1; k <= p.floors; k++) {
    box(-half, s0, fy(k) - SLAB, fy(k));
    box(s1, half, fy(k) - SLAB, fy(k));
  }
  box(-half, -half + WALL, 0, top);
  box(half - WALL, half, DOOR_H, top);
  box(s0, s0 + WALL, 0, top + machine);
  box(s1 - WALL, s1, 0, top + machine);
  if (machine) box(s0, s1, top + machine - SLAB, top + machine);
  for (const x of [-half, s0, s1, half]) seg(x, 0, 0, x, -0.45, 0);
  for (let j = 1; j < nl; j++) seg(lx(j), 0, 0, lx(j), -0.3, 0);
  for (let j = 1; j < nr; j++) seg(rx(j), 0, 0, rx(j), -0.3, 0);

  // The lift shaft: rails, cross-bracing per floor, cables
  const r0 = s0 + WALL + 0.18, r1 = s1 - WALL - 0.18, zr = -DEPTH + 0.3, shaftTop = top + machine - SLAB;
  seg(r0, 0, zr, r0, shaftTop, zr);
  seg(r1, 0, zr, r1, shaftTop, zr);
  for (let i = 0; i < p.floors; i++) {
    seg(r0, fy(i), zr, r1, fy(i + 1), zr);
    seg(r1, fy(i), zr, r0, fy(i + 1), zr);
  }
  const shaftX = (s0 + s1) / 2;
  seg(shaftX - 0.3, 0.2, zMid, shaftX - 0.3, shaftTop, zMid);
  seg(shaftX + 0.3, 0.2, zMid, shaftX + 0.3, shaftTop, zMid);

  /* Upper floors */
  const roomPanel: number[][] = [];
  for (let i = 1; i < p.floors; i++) {
    const y = fy(i);
    const row: number[] = [];
    if (restaurantOnly && i === 1) {
      // Private dining on the left, the office on the right
      row.push(zone(-half, s0, i), zone(s1, half, i));
      const dw = s0 + half;
      sprite('table', -half + dw * 0.3, y, zMid, 2.0);
      sprite('cloche', -half + dw * 0.3 - 0.2, y + TOP.table * 2.0, zMid + 0.02, 0.55);
      if (dw > 5) sprite('table', -half + dw * 0.72, y, zMid, 2.0);
      if (dw > 5) sprite('flute', -half + dw * 0.72 + 0.3, y + TOP.table * 2.0, zMid + 0.02, 0.42);
      const ox = (s1 + half) / 2;
      sprite('desk', ox, y, zMid, 2.0);
      sprite('lamp', ox + 0.62, y + TOP.desk * 2.0, zMid - 0.05, 0.75);
      sprite('phone', ox - 0.45, y + TOP.desk * 2.0, zMid + 0.02, 0.45, 3);
    } else {
      for (let j = 0; j < nl; j++) row.push(room(lx(j), lx(j + 1), i));
      for (let j = 0; j < nr; j++) row.push(room(rx(j), rx(j + 1), i));
      for (let j = 1; j < nl; j++) box(lx(j) - WALL / 2, lx(j) + WALL / 2, y, fy(i + 1) - SLAB);
      for (let j = 1; j < nr; j++) box(rx(j) - WALL / 2, rx(j) + WALL / 2, y, fy(i + 1) - SLAB);
      const bays = [...Array(nl)].map((_, j) => lx(j)).concat([...Array(nr)].map((_, j) => rx(j)));
      for (const x0 of bays) {
        const cx = x0 + BAY / 2;
        sprite('bed', cx - 0.45, y, zMid - 0.4, 2.4);
        sprite('lamp', cx + 1.2, y, zMid - 1.2, 1.25);
      }
    }
    roomPanel.push(row);
  }

  /* Ground floor */
  let lobbyPanel = -1, restaurantPanel = -1, officePanel = -1;
  let deskX: number, deskTop: number, restaurantX0: number, restaurantX1: number, officeX = 0;
  const tables: number[] = [];
  if (restaurantOnly) {
    restaurantPanel = zone(-half, s0, 0);
    lobbyPanel = zone(s1, half, 0);
    deskX = half - 1.9;
    deskTop = TOP.desk * 1.6;
    sprite('desk', deskX, 0, zMid + 0.6, 1.6);
    sprite('phone', deskX - 0.25, deskTop, zMid + 0.62, 0.42, 0);
    restaurantX0 = -half;
    restaurantX1 = half;
    for (const [a, b] of [[-half, s0], [s1, deskX - 1.2]]) {
      const n = Math.max(0, Math.floor((b - a) / 2.6));
      for (let k = 0; k < n; k++) tables.push(a + (b - a) * ((k + 0.5) / n));
    }
  } else {
    lobbyPanel = zone(s1, half, 0);
    deskX = s1 + Math.min(2.4, (half - s1) / 2);
    deskTop = TOP.desk * 2.6;
    sprite('desk', deskX, 0, zMid + 0.6, 2.6);
    sprite('phone', deskX - 0.6, deskTop, zMid + 0.62, 0.5, 0);
    sprite('flute', deskX + 0.55, deskTop, zMid + 0.62, 0.4);
    if (half - deskX > 4.2) sprite('sofa', deskX + 3.0, 0, zMid - 1.2, 2.2);
    let x0 = -half;
    if (nl >= 2) {
      officePanel = room(lx(0), lx(1), 0);
      box(lx(1) - WALL / 2, lx(1) + WALL / 2, 0, GROUND_H - SLAB);
      officeX = lx(0) + BAY / 2;
      sprite('desk', officeX, 0, zMid, 2.0);
      sprite('lamp', officeX + 0.62, TOP.desk * 2.0, zMid - 0.05, 0.75);
      sprite('phone', officeX - 0.45, TOP.desk * 2.0, zMid + 0.02, 0.45, 3);
      x0 = lx(1);
    }
    restaurantPanel = zone(x0, s0, 0);
    restaurantX0 = x0;
    restaurantX1 = s0;
    const n = Math.max(1, Math.floor((s0 - x0) / 2.6));
    for (let k = 0; k < n; k++) tables.push(x0 + (s0 - x0) * ((k + 0.5) / n));
    if (p.ground === 'lobby+restaurant') {
      // The maître d's stand by the shaft, with the restaurant's phone
      sprite('desk', s0 - 1.0, 0, zMid + 0.9, 1.5);
      sprite('phone', s0 - 1.15, TOP.desk * 1.5, zMid + 0.92, 0.4, 4);
    }
  }
  tables.forEach((x, k) => {
    sprite('table', x, 0, zMid, 2.0);
    if (k === 0) sprite('cloche', x - 0.2, TOP.table * 2.0, zMid + 0.02, 0.55);
    else sprite('flute', x + 0.3, TOP.table * 2.0, zMid + 0.02, 0.42);
  });

  /* Lift car (always last, so it can move) */
  const carW = r1 - r0 - 0.3;
  panels.push({ x0: shaftX - carW / 2, x1: shaftX + carW / 2, y0: 0, y1: 2.5, kind: 1, win: [0, 0, 1, 1], panes: 1, seed: 0 });

  /* Roof */
  let roofTop = top + machine;
  const parapets = (h: number) => {
    box(-half, -half + WALL, top, top + h);
    box(half - WALL, half, top, top + h);
  };
  if (p.roof === 'terrace') {
    parapets(1.1);
    seg(-half, top + 1.05, -0.15, s0, top + 1.05, -0.15);
    seg(s1, top + 1.05, -0.15, half, top + 1.05, -0.15);
    for (let x = -half + 1.4; x < half - 0.6; x += 1.4) if (x < s0 || x > s1) seg(x, top, -0.15, x, top + 1.05, -0.15);
    const px0 = s1 + 0.7, px1 = Math.max(px0 + 3, half - 1.0);
    box(px0, px0 + 0.22, top, top + 0.9, -DEPTH + 0.6, -0.6);
    box(px1 - 0.22, px1, top, top + 0.9, -DEPTH + 0.6, -0.6);
    for (const wy of [0.62, 0.45, 0.28]) {
      for (let x = px0 + 0.3; x < px1 - 0.5; x += 0.5) seg(x, top + wy, -0.6, x + 0.25, top + wy + 0.05, -0.6), seg(x + 0.25, top + wy + 0.05, -0.6, x + 0.5, top + wy, -0.6);
    }
    sprite('parasol', -half + (s0 + half) * 0.3, top, -DEPTH * 0.45, 2.6);
    if (s0 + half > 6) sprite('parasol', -half + (s0 + half) * 0.72, top, -DEPTH * 0.45, 2.6);
    roofTop = Math.max(roofTop, top + 2.6);
  } else if (p.roof === 'garden') {
    parapets(1.1);
    const xs = [-half + 2.2, (s0 - half) / 2 + 0.6, (s1 + half) / 2].filter((x) => x < s0 - 1 || x > s1 + 1);
    for (const x of xs) {
      box(x - 0.8, x + 0.8, top, top + 0.5, -DEPTH + 0.6, -0.5);
      sprite('tree', x, top + 0.5, -DEPTH * 0.45, 3.2);
    }
    roofTop = Math.max(roofTop, top + 3.7);
  } else if (p.roof === 'plain') {
    parapets(0.9);
    box(-half + 1.8, -half + 4.2, top, top + 1.4, -DEPTH + 1, -2);
    for (let x = -half + 2.1; x < -half + 4.1; x += 0.3) seg(x, top + 0.3, -1.99, x, top + 1.1, -1.99);
  } else {
    // Pitched: a gable in section, hatched where it is cut
    const w = half + 0.4, rise = Math.min(5.5, w * 0.42);
    const g = new THREE.BufferGeometry();
    const f = 0, b = -DEPTH;
    const v = [
      -w, top, f, w, top, f, 0, top + rise, f, // cut face
      -w, top, b, 0, top + rise, b, w, top, b, // back
      -w, top, f, 0, top + rise, f, 0, top + rise, b, -w, top, f, 0, top + rise, b, -w, top, b, // left slope
      w, top, f, w, top, b, 0, top + rise, b, w, top, f, 0, top + rise, b, 0, top + rise, f, // right slope
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([...Array(v.length / 3).keys()]);
    g.computeVertexNormals();
    solids.push(g);
    seg(-w, top, f, 0, top + rise, f); seg(0, top + rise, f, w, top, f); seg(-w, top, f, w, top, f);
    seg(-w, top, b, 0, top + rise, b); seg(0, top + rise, b, w, top, b);
    seg(0, top + rise, f, 0, top + rise, b); seg(-w, top, f, -w, top, b); seg(w, top, f, w, top, b);
    roofTop = top + rise;
  }

  /* Canopy and fascia by the door (the name is gilded on the fascia) */
  box(half, half + 3.4, 3.0, 3.3, -3.2, 0);
  box(half + 0.1, half + 3.4, 3.3, 4.05, -0.25, 0);
  seg(half + 3.2, 3.0, -0.1, half + 3.2, 0, -0.1);

  /* Anchors */
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const topFloor = p.floors - 1;
  const bayCentres = (i: number) => (i === 0 ? [] : roomPanel[i - 1]);
  const desk: Anchor = { at: v3(deskX, deskTop, zMid + 0.6), focus: { x: deskX + 0.3, y: 2.1, z: zMid, hw: 3.4, hh: 2.1 }, panel: lobbyPanel, lift: 1, phone: 0 };
  const rcx = (restaurantX0 + restaurantX1) / 2;
  const restaurant: Anchor = {
    at: v3(rcx, 1.5, zMid), focus: { x: rcx, y: GROUND_H / 2, z: zMid, hw: Math.min((restaurantX1 - restaurantX0) / 2 + 0.6, 9), hh: GROUND_H / 2 + 0.5 },
    panel: restaurantPanel, lift: 0, phone: restaurantOnly ? 0 : p.ground === 'lobby+restaurant' ? 4 : -1,
  };
  const roomAnchor = (i: number, x0: number, panelIndex: number, phone: number, up = 0): Anchor => ({
    at: v3(x0 + BAY / 2, fy(i) + FLOOR_H * 0.52, zMid),
    focus: { x: x0 + BAY / 2 - BAY * 0.3, y: fy(i) + FLOOR_H * 0.5 + up, z: zMid, hw: BAY * 1.45, hh: FLOOR_H * 0.95 + up },
    panel: panelIndex, lift: 0, phone,
  });
  let room214: Anchor, room507: Anchor, office: Anchor;
  if (restaurantOnly) {
    const dining = roomPanel[0][0], officeZone = roomPanel[0][1];
    const dx = (s0 - half) / 2;
    room214 = { at: v3(dx, fy(1) + FLOOR_H * 0.5, zMid), focus: { x: dx, y: fy(1) + FLOOR_H * 0.6, z: zMid, hw: Math.max(BAY * 1.3, (s0 + half) / 2 + 0.5), hh: FLOOR_H }, panel: dining, lift: 0, phone: -1 };
    const ox = (s1 + half) / 2;
    office = { at: v3(ox, fy(1) + 1.3, zMid), focus: { x: ox, y: fy(1) + FLOOR_H * 0.5, z: zMid, hw: BAY * 1.3, hh: FLOOR_H * 0.9 }, panel: officeZone, lift: 0, phone: 3 };
    const t9 = tables.length ? tables[tables.length - 1] : deskX - 2;
    room507 = { at: v3(t9, 1.3, zMid), focus: { x: t9, y: GROUND_H / 2, z: zMid, hw: BAY * 1.3, hh: GROUND_H / 2 + 0.4 }, panel: t9 > s1 ? lobbyPanel : restaurantPanel, lift: 0, phone: -1 };
  } else {
    const terrace = p.roof === 'terrace' ? 1.0 : p.roof === 'garden' ? 1.3 : 0.4;
    const rowTop = bayCentres(topFloor);
    room214 = roomAnchor(topFloor, rx(nr - 1), rowTop[rowTop.length - 1], 1, terrace);
    const f5 = Math.min(5, topFloor);
    room507 = roomAnchor(f5, rx(0), bayCentres(f5)[nl], 2);
    office = officePanel >= 0
      ? { at: v3(officeX, 1.3, zMid), focus: { x: officeX + 0.6, y: GROUND_H / 2, z: zMid, hw: BAY * 1.35, hh: GROUND_H / 2 + 0.4 }, panel: officePanel, lift: 0, phone: 3 }
      : roomAnchor(1, lx(0), bayCentres(1)[0], -1);
    // The room phones: on a bedside table in 214 and 507
    for (const [a, id] of [[room214, 1], [room507, 2]] as const) {
      const fx = a.at.x + 1.05, fl = a.at.y - FLOOR_H * 0.52;
      sprite('table', fx, fl, zMid + 0.35, 0.95);
      sprite('phone', fx, fl + TOP.table * 0.95, zMid + 0.37, 0.4, id);
    }
  }
  const rack = { x: deskX + (restaurantOnly ? -0.4 : 0.25), y: 2.45, z: -DEPTH + 0.08, w: 2.6, h: 1.35 };
  const keys: Anchor = { at: v3(rack.x + rack.w / 2 + 0.55, rack.y, rack.z + 0.3), focus: { x: rack.x, y: rack.y, z: rack.z, hw: rack.w / 2 + 0.45, hh: rack.h / 2 + 0.4 }, panel: lobbyPanel, lift: 0, phone: -1 };
  const checkout: Anchor = { at: v3(half + 0.6, 2.5, 0.25), focus: { x: half + 1.6, y: 2.3, z: 0, hw: 5.2, hh: 3 }, panel: -1, lift: 0, phone: -1 };
  const house: Anchor = { at: desk.at.clone(), focus: { x: 1.7, y: roofTop / 2, z: zMid * 0.3, hw: half + 3.8, hh: roofTop / 2 + 0.9 }, panel: -1, lift: 1, phone: -1 };

  const layout: Layout = {
    params: p, half, top, roofTop, shaft: [s0, s1], rack,
    anchors: { house, restaurant, desk, room214, office, room507, keys, checkout },
    rects: panels.map((q) => [q.x0, q.y0, q.x1, q.y1]),
  };
  return { solids, lines, panels, sprites, layout };
}

/* ---------- Shaders ---------- */

/** Shared by every house shader: the lantern term, the dawn, the rise seam, the grain, and the contrast clamp behind the log column */
export const HOUSE_GLSL = /* glsl */ `
uniform vec3 uLantern, uLanternCol, uDawnCol, uBg, uGilt, uHorizon;
uniform float uWarm, uAmp, uRange, uTime, uRise, uDawn, uSweep, uScrimX, uYmax, uDim, uReveal;
varying vec3 vWorld;
// The lantern is the only warm light: warmth·max(n·l, 0)/(1 + d²·6)·(1 + .35·amp)
float lanternFall() {
  float d = distance(uLantern, vWorld) / uRange;
  return uWarm * (1.0 + 0.35 * uAmp) / (1.0 + d * d * 6.0);
}
vec3 lit(vec3 albedo, vec3 n) {
  vec3 l = normalize(uLantern - vWorld);
  float lam = max(dot(n, l), 0.0) * lanternFall();
  vec3 sun = normalize(vec3(0.72, 0.34, 0.6));
  float sx = (vWorld.x - uSweep) / 7.0;
  float rake = exp(-sx * sx) * step(-0.01, vWorld.y);
  return albedo * (0.7 + 0.25 * max(n.y, 0.0)) + uLanternCol * lam * 0.16
    + uDawnCol * uDawn * (0.05 * max(dot(n, sun), 0.0) + 0.08 * rake);
}
// Interleaved gradient noise: a blue-noise-like 3 % grain
float grain() { return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5; }
// The 1 px gold seam of a rising house
vec3 seam(vec3 c) {
  float w = fwidth(vWorld.y) * 1.2 + 1e-4;
  return mix(c, uGilt, 1.0 - smoothstep(0.0, w, uRise - vWorld.y));
}
vec4 finish(vec3 c) {
  c *= 1.0 + 0.06 * grain();
  // The porter's light: the drawing appears outward from the lamp; the FAQ holds it at 15 %
  float reveal = 1.0 - smoothstep(uReveal - 4.0, uReveal, distance(vWorld, uLantern));
  c = mix(uBg, c, reveal * uDim);
  // Behind the log column, never brighter than bg-page lightened 8 % (OKLCH L), so text over the scrim keeps its contrast
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (gl_FragCoord.x >= uScrimX && y > uYmax) c *= uYmax / y;
  return vec4(c, 1.0);
}
`;

const WORLD_VS = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SOLID_FS = /* glsl */ `
${HOUSE_GLSL}
uniform vec3 uPoche, uHatchCol;
uniform float uHatch;
varying vec3 vN;
void main() {
  if (vWorld.y > uRise) discard;
  vec3 n = normalize(vN);
  vec3 c;
  if (n.z > 0.9 && vWorld.z > -0.03) {
    // A cut face: poché with a 45° hatch, drawn in screen space like ink
    float u = (gl_FragCoord.x + gl_FragCoord.y) * uHatch;
    float tri = abs(fract(u) - 0.5) * 2.0;
    float aa = fwidth(u) * 2.0;
    c = mix(uPoche, uHatchCol, smoothstep(0.5 - aa, 0.5 + aa, tri)) + uLanternCol * lanternFall() * 0.04;
  } else {
    c = lit(uPoche * (n.y > 0.5 ? 1.3 : 0.75), n);
    c = mix(c, uHorizon, smoothstep(25.0, 220.0, -vWorld.z) * step(0.5, n.y) * 0.85);
  }
  gl_FragColor = finish(seam(c));
  #include <colorspace_fragment>
}`;

const LINE_VS = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const LINE_FS = /* glsl */ `
${HOUSE_GLSL}
uniform vec3 uLine, uLineLit;
uniform vec2 uFade;
varying float vDepth;
void main() {
  if (vWorld.y > uRise) discard;
  // Ink drawn in light: brighter near the lantern, fading with depth
  vec3 c = mix(uLine, uLineLit, clamp(lanternFall() * 1.5, 0.0, 1.0));
  c = mix(c, uBg, smoothstep(uFade.x, uFade.y, vDepth) * 0.75);
  gl_FragColor = finish(c);
  #include <colorspace_fragment>
}`;

const PANEL_VS = /* glsl */ `
attribute vec4 aWin;
attribute vec4 aInfo;
attribute vec3 aLit;
uniform float uTime;
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vWin;
varying vec4 vInfo;
varying vec2 vSize;
varying float vLit;
// A filament warming up: 0 → .6 in 80 ms, → .4 in 60 ms, → 1 in 500 ms
float filament(float e) {
  if (e < 0.08) return 0.6 * e / 0.08;
  if (e < 0.14) return 0.6 - 0.2 * (e - 0.08) / 0.06;
  return 0.4 + 0.6 * smoothstep(0.0, 1.0, (e - 0.14) / 0.5);
}
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  vWin = aWin;
  vInfo = aInfo;
  vSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  float e = uTime - aLit.z;
  float k = e < 0.0 ? 0.0 : (aLit.y > aLit.x ? filament(e) : smoothstep(0.0, 0.35, e));
  vLit = mix(aLit.x, aLit.y, k);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PANEL_FS = /* glsl */ `
${HOUSE_GLSL}
uniform vec3 uPoche, uWinLit, uWinDim, uLine, uLineLit;
uniform vec4 uActive;
varying vec2 vUv;
varying vec4 vWin;
varying vec4 vInfo;
varying vec2 vSize;
varying float vLit;
float ink(float d) { return 1.0 - smoothstep(0.0, fwidth(vUv.x * vSize.x) * 1.4 + 1e-5, d); }
void main() {
  if (vWorld.y > uRise) discard;
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec2 p = vUv * vSize;
  float prox = clamp(lanternFall() * 1.5, 0.0, 1.0);
  vec3 line = mix(uLine, uLineLit, max(prox, vLit * 0.6));
  vec3 c;
  if (vInfo.y > 0.5 && vInfo.y < 1.5) {
    // The lift car: a warm cage and its doors
    float border = min(min(p.x, vSize.x - p.x), min(p.y, vSize.y - p.y));
    float doors = abs(p.x - vSize.x * 0.5) + step(p.y, 0.12) + step(vSize.y - 0.35, p.y);
    c = mix(lit(uPoche, n) + uWinLit * 0.14, line, max(ink(border - 0.03), ink(doors)));
  } else {
    // A room: its back wall, the spill of its own light, and its window with frame, mullions and transom
    float speaking = step(uActive.x, vWorld.x) * step(vWorld.x, uActive.z) * step(uActive.y, vWorld.y) * step(vWorld.y, uActive.w);
    float boost = 1.0 + 0.35 * uAmp * speaking;
    vec4 wr = vec4(vWin.xy * vSize, vWin.zw * vSize);
    vec2 wc = (wr.xy + wr.zw) * 0.5;
    vec2 sd = (p - wc) / vec2(vSize.x * 0.45, vSize.y * 0.5);
    vec3 wall = lit(uPoche * 0.9, n) + uWinLit * vLit * exp(-dot(sd, sd) * 1.6) * 0.2 * boost;
    float inside = step(wr.x, p.x) * step(p.x, wr.z) * step(wr.y, p.y) * step(p.y, wr.w);
    vec2 q = clamp((p - wr.xy) / max(wr.zw - wr.xy, vec2(1e-3)), 0.0, 1.0);
    vec3 glass = mix(uWinDim * 0.55, uWinLit * (0.72 + 0.28 * q.y) * boost, vLit);
    c = mix(wall, glass, inside);
    float mull = abs(fract(q.x * vInfo.x + 0.5) - 0.5) / vInfo.x * (wr.z - wr.x);
    float transom = abs(q.y - 0.64) * (wr.w - wr.y);
    float frame = min(min(abs(p.x - wr.x), abs(p.x - wr.z)), min(abs(p.y - wr.y), abs(p.y - wr.w)));
    float near = step(wr.x - 0.05, p.x) * step(p.x, wr.z + 0.05) * step(wr.y - 0.05, p.y) * step(p.y, wr.w + 0.05);
    c = mix(c, line, max(inside * ink(min(mull, transom)), near * ink(frame)));
  }
  gl_FragColor = finish(seam(c));
  #include <colorspace_fragment>
}`;

const SPRITE_VS = /* glsl */ `
attribute vec2 aSprite;
varying vec3 vWorld;
varying vec2 vAtlas;
varying float vPhone;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vAtlas = vec2(mod(aSprite.x, 4.0), 3.0 - floor(aSprite.x / 4.0)) * 0.25 + uv * 0.25;
  vPhone = aSprite.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SPRITE_FS = /* glsl */ `
${HOUSE_GLSL}
uniform sampler2D uAtlas;
uniform vec3 uFill, uLine, uLineLit, uLed;
uniform vec2 uRing;
varying vec2 vAtlas;
varying float vPhone;
void main() {
  if (vWorld.y > uRise) discard;
  vec3 m = texture2D(uAtlas, vAtlas).rgb;
  float a = max(max(m.r, m.g), m.b);
  if (a < 0.05) discard;
  vec3 c = lit(uFill, vec3(0.0, 0.0, 1.0));
  c = mix(c, mix(uLine, uLineLit, clamp(lanternFall() * 1.5, 0.0, 1.0)), m.g);
  // The phone's LED: the ringing room blinks the double ring, every other phone shows a dim dot
  float led = vPhone < -0.5 ? 0.0 : (abs(vPhone - uRing.x) < 0.5 ? uRing.y : 0.12);
  c = mix(c, uLed, m.b * led);
  gl_FragColor = vec4(finish(seam(c)).rgb, a);
  #include <colorspace_fragment>
}`;

const NAME_VS = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const NAME_FS = /* glsl */ `
${HOUSE_GLSL}
uniform sampler2D uName;
uniform vec3 uBrass, uBrassHi;
varying vec2 vUv;
void main() {
  if (vWorld.y > uRise) discard;
  float a = texture2D(uName, vUv).r;
  if (a < 0.05) discard;
  // Gilded: brass, brighter in the lantern's light and at sunrise, with a slow sheen
  vec3 c = mix(uBrass, uBrassHi, clamp(lanternFall() * 1.4 + uDawn * 0.6, 0.0, 1.0));
  c = mix(c, uGilt, 0.3 * smoothstep(0.75, 1.0, sin(vWorld.x * 0.9 - uTime * 0.6) * 0.5 + 0.5));
  gl_FragColor = vec4(finish(c).rgb, a);
  #include <colorspace_fragment>
}`;

/* ---------- The house ---------- */

const col = (role: keyof typeof C) => new THREE.Color(C[role]);

/** Linear luminance ceiling behind the log column: OKLab L of a near-neutral colour is cbrt(Y), so +8 % L is (cbrt(Y) + .08)³ */
function ceiling() {
  const bg = col('bg-page');
  const y = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
  // ponytail: exact for greys, within a hair for bg-page's low chroma; a full OKLCH round trip if the page colour turns saturated
  return (Math.cbrt(y) + 0.08) ** 3;
}

export type House = ReturnType<typeof createHouse>;

export function createHouse(coarse: boolean, initial: HouseParams) {
  const uniforms = {
    uLantern: { value: new THREE.Vector3(0, 1.5, -2.5) },
    uLanternCol: { value: col('orb-core') },
    uDawnCol: { value: col('dawn') },
    uBg: { value: col('bg-page') },
    uGilt: { value: col('gilt-hi') },
    uHorizon: { value: col('bg-page') },
    uWarm: { value: 1 },
    uAmp: { value: 0 },
    uRange: { value: 7 },
    uTime: { value: 0 },
    uRise: { value: 1e4 },
    uDawn: { value: 0 },
    uSweep: { value: -200 },
    uScrimX: { value: 1e6 },
    uYmax: { value: ceiling() },
    uDim: { value: 1 },
    uReveal: { value: 1e4 },
  };
  const ink = { uLine: { value: col('house-line') }, uLineLit: { value: col('house-line-lit') } };
  const base = { toneMapped: false } as const;

  const solidMaterial = new THREE.ShaderMaterial({
    ...base,
    uniforms: { ...uniforms, uPoche: { value: col('house-poche') }, uHatchCol: { value: col('house-hatch') }, uHatch: { value: 1 / 7 } },
    vertexShader: WORLD_VS,
    fragmentShader: SOLID_FS,
    // The ink sits on the cut faces: push the faces back a hair
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const lineMaterial = new THREE.ShaderMaterial({
    ...base,
    uniforms: { ...uniforms, ...ink, uFade: { value: new THREE.Vector2(1e5, 1e5 + 1) } },
    vertexShader: LINE_VS,
    fragmentShader: LINE_FS,
  });
  const panelMaterial = new THREE.ShaderMaterial({
    ...base,
    uniforms: { ...uniforms, ...ink, uPoche: { value: col('house-poche') }, uWinLit: { value: col('window-lit') }, uWinDim: { value: col('window-dim') }, uActive: { value: new THREE.Vector4(1, 1, 0, 0) } },
    vertexShader: PANEL_VS,
    fragmentShader: PANEL_FS,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const atlas = furnitureAtlas();
  const spriteMaterial = new THREE.ShaderMaterial({
    ...base,
    uniforms: { ...uniforms, ...ink, uAtlas: { value: atlas }, uFill: { value: col('bg-page') }, uLed: { value: col('brass-hi') }, uRing: { value: new THREE.Vector2(-1, 0) } },
    vertexShader: SPRITE_VS,
    fragmentShader: SPRITE_FS,
    alphaToCoverage: true,
  });
  const name = textPlane(1024, 160, 104);
  const nameMaterial = new THREE.ShaderMaterial({
    ...base,
    uniforms: { ...uniforms, uName: { value: name.texture }, uBrass: { value: col('brass') }, uBrassHi: { value: col('brass-hi') } },
    vertexShader: NAME_VS,
    fragmentShader: NAME_FS,
    alphaToCoverage: true,
  });

  const group = new THREE.Group();
  const solids = new THREE.Mesh(new THREE.BufferGeometry(), solidMaterial);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);

  const plane = new THREE.PlaneGeometry(1, 1);
  const panelGeometry = plane.clone();
  const aWin = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PANELS * 4), 4);
  const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PANELS * 4), 4);
  const aLit = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PANELS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  panelGeometry.setAttribute('aWin', aWin);
  panelGeometry.setAttribute('aInfo', aInfo);
  panelGeometry.setAttribute('aLit', aLit);
  const panels = new THREE.InstancedMesh(panelGeometry, panelMaterial, MAX_PANELS);
  panels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const spriteGeometry = plane.clone();
  const aSprite = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 2), 2);
  spriteGeometry.setAttribute('aSprite', aSprite);
  const sprites = new THREE.InstancedMesh(spriteGeometry, spriteMaterial, MAX_SPRITES);

  const nameMesh = new THREE.Mesh(plane, nameMaterial);
  for (const o of [panels, sprites, lines, solids, nameMesh]) o.frustumCulled = false;
  group.add(solids, panels, sprites, nameMesh, lines);

  let params = { ...initial };
  let layout = null as unknown as Layout;
  let gilded: string | null = null;
  let seeds: number[] = [];
  let kinds: number[] = [];
  let car = -1;
  let carY = -1;
  const on: boolean[] = [];
  let litDirty = false;
  let rise = -1;
  let timer = 0;
  let pending: HouseParams | null = null;
  const listeners = new Set<(l: Layout) => void>();
  const m4 = new THREE.Matrix4();

  /** Redrawn only when the name changes (and once more when Bona Nova arrives) */
  function gild(text: string) {
    if (text === gilded) return;
    gilded = text;
    const font = `400 104px ${displayFont()}`;
    const draw = () => name.draw(text.toLocaleUpperCase('en-GB'), { font });
    draw();
    if (text && document.fonts && !document.fonts.check(font)) document.fonts.load(font).then(() => { if (gilded === text) draw(); }).catch(() => {});
  }

  function build(p: HouseParams, animate: boolean, now: number) {
    const t0 = performance.now();
    const built = plan(p, coarse);
    const merged = mergeGeometries(built.solids);
    built.solids.forEach((g) => g.dispose());
    if (!merged) return;
    solids.geometry.dispose();
    solids.geometry = merged;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(built.lines, 3));
    lines.geometry.dispose();
    lines.geometry = lg;

    const n = Math.min(MAX_PANELS, built.panels.length);
    seeds = [];
    kinds = [];
    on.length = 0;
    built.panels.slice(0, n).forEach((q, i) => {
      m4.makeScale(q.x1 - q.x0, q.y1 - q.y0, 1).setPosition((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, -DEPTH + 0.02);
      panels.setMatrixAt(i, m4);
      aWin.setXYZW(i, ...q.win);
      aInfo.setXYZW(i, q.panes, q.kind, q.seed, 0);
      const lit = q.kind === 1 ? 1 : 0;
      aLit.setXYZ(i, lit, lit, -1e4);
      seeds.push(q.seed);
      kinds.push(q.kind);
      on.push(lit === 1);
    });
    car = n - 1;
    carY = -1;
    panels.count = n;
    panels.instanceMatrix.clearUpdateRanges();
    panels.instanceMatrix.needsUpdate = true;
    aWin.needsUpdate = aInfo.needsUpdate = aLit.needsUpdate = true;

    const ns = Math.min(MAX_SPRITES, built.sprites.length);
    built.sprites.slice(0, ns).forEach((s, i) => {
      m4.makeScale(s.s, s.s, 1).setPosition(s.x, s.y + s.s / 2, s.z);
      sprites.setMatrixAt(i, m4);
      aSprite.setXY(i, s.cell, s.phone);
    });
    sprites.count = ns;
    sprites.instanceMatrix.needsUpdate = true;
    aSprite.needsUpdate = true;

    const half = built.layout.half;
    nameMesh.scale.set(3.1, 3.1 * (160 / 1024), 1);
    nameMesh.position.set(half + 1.75, 3.675, 0.012);
    gild(p.name);
    params = p;
    layout = built.layout;
    rise = animate ? now : -1;
    uniforms.uRise.value = animate ? 0 : 1e4;
    listeners.forEach((cb) => cb(layout));
    if (import.meta.env.DEV) console.info(`[hotels] house rebuilt in ${(performance.now() - t0).toFixed(1)} ms`);
  }

  build(params, false, 0);

  return {
    group,
    uniforms,
    solidMaterial,
    get params() { return params; },
    get layout() { return layout; },
    /** Panel count, seeds (stable switch-on order) and kinds (0 room, 1 lift car, 2 lobby/restaurant glazing) */
    get seeds() { return seeds; },
    get kinds() { return kinds; },
    isOn: (i: number) => on[i] === true,
    /** Switches a panel's light; `at` is the uniform time it happens (the filament plays from there) */
    setLit(i: number, lit: boolean, at: number) {
      if (i < 0 || i >= on.length || on[i] === lit || i === car) return;
      on[i] = lit;
      aLit.setXYZ(i, lit ? 0 : 1, lit ? 1 : 0, at);
      litDirty = true;
    },
    onLayout(cb: (l: Layout) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    /** Debounced rebuild; a name-only change re-gilds at once */
    rebuild(input: HouseInput, o: { immediate?: boolean; animate?: boolean; now?: number } = {}) {
      const next = normalize(input, pending ?? params);
      const same = (['floors', 'bays', 'ground', 'roof'] as const).every((k) => next[k] === params[k]);
      clearTimeout(timer);
      if (same && !o.immediate) {
        pending = null;
        if (next.name !== params.name) { params = { ...params, name: next.name }; gild(next.name); }
        return;
      }
      pending = next;
      const run = () => {
        timer = 0;
        const p = pending;
        pending = null;
        if (p) build(p, o.animate ?? true, o.now ?? uniforms.uTime.value);
      };
      if (o.immediate) run();
      else timer = window.setTimeout(run, 150);
    },
    /** The lift car rides with the camera; the rising house climbs 900 ms */
    update(time: number, animate: boolean, carTarget: number) {
      uniforms.uTime.value = time;
      if (rise >= 0) {
        const k = animate ? Math.min(1, (time - rise) / 0.9) : 1;
        uniforms.uRise.value = k >= 1 ? 1e4 : (1 - (1 - k) ** 3) * (layout.roofTop + 1);
        if (k >= 1) rise = -1;
      }
      const y = Math.max(0, Math.min(layout.top - 2.6 - SLAB, carTarget));
      if (car >= 0 && Math.abs(y - carY) > 1e-3) {
        carY = y;
        panels.getMatrixAt(car, m4);
        m4.elements[13] = y + 1.25;
        panels.setMatrixAt(car, m4);
        panels.instanceMatrix.clearUpdateRanges();
        panels.instanceMatrix.addUpdateRange(car * 16, 16);
        panels.instanceMatrix.needsUpdate = true;
      }
      if (litDirty) { aLit.needsUpdate = true; litDirty = false; }
    },
    resize(dpr: number) { solidMaterial.uniforms.uHatch.value = 1 / (7 * dpr); },
    setRing(phone: number, level: number) { spriteMaterial.uniforms.uRing.value.set(phone, level); },
    setActive(rect: [number, number, number, number] | null) {
      const v = panelMaterial.uniforms.uActive.value as THREE.Vector4;
      if (rect) v.set(rect[0], rect[1], rect[2], rect[3]); else v.set(1, 1, 0, 0);
    },
    setFade(near: number, far: number) {
      if (!coarse) (lineMaterial.uniforms.uFade.value as THREE.Vector2).set(near, Math.max(near + 1, far));
    },
    dispose() {
      clearTimeout(timer);
      solids.geometry.dispose();
      lines.geometry.dispose();
      panelGeometry.dispose();
      spriteGeometry.dispose();
      plane.dispose();
      atlas.dispose();
      name.texture.dispose();
      for (const m of [solidMaterial, lineMaterial, panelMaterial, spriteMaterial, nameMaterial]) m.dispose();
    },
  };
}
