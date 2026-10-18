// The Director owns time on /hotels. Every frame (scheduler order 10) it reads the scroll once, turns it into the
// minute of the night (the NightClock: piecewise-linear through the chapters' tops) and the chapter's progress, then
// sets the camera on its rail, the lantern's place and size, the sky, the lit windows, the CSS variables
// (--t, --gx/--gy, --ox/--oy/--or, --band and --bandf on phones) and moves the .orb root over the lantern.
// No layout reads per frame: chapter offsets come from scroll.ts's cache (ResizeObserver, fonts.ready, resize).
import * as THREE from 'three';
import { scheduler } from '../../../scripts/motion/scheduler';
import { offsetTop, scroll } from '../../../scripts/motion/scroll';
import { motion } from '../../../scripts/motion/prefs';
import { clock } from '../../../scripts/motion/clock';
import { voice } from '../../../scripts/voice/bridge';
import { BEARING, aim, chapterIndexAt, follow, minutesAt, newPose, ride, scrollFor, type Frame, type Shot, type Stop } from './poses';
import type { House, RoomKey } from './generator';
import type { Lantern } from './lantern';
import type { AnchorKey, ChapterInfo, NightApi, NightEvent } from './types';
import { lead } from '../ring';

const NIGHT = 825;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = THREE.MathUtils.smoothstep;

/** Chapter id → where the camera and the lantern go */
const BY_ID: Record<string, AnchorKey> = {
  welcome: 'prologue', house: 'house', restaurant: 'restaurant', lobby: 'lobby', 'room-214': 'room214', 'night-desk': 'desk',
  'back-office': 'office', 'room-507': 'room507', handover: 'handover', keys: 'keys', register: 'register', faq: 'faq', checkout: 'checkout',
};
const ANCHORS = new Set<string>(Object.values(BY_ID));
/** Anchor → the room of the house it sits in */
export const ROOM: Record<AnchorKey, RoomKey> = {
  prologue: 'desk', house: 'house', restaurant: 'restaurant', lobby: 'desk', room214: 'room214', desk: 'desk', office: 'office',
  room507: 'room507', handover: 'desk', keys: 'keys', register: 'desk', faq: 'desk', checkout: 'checkout',
};
/** Chapters with a call: their room's phone rings */
const CALLS = new Set<AnchorKey>(['restaurant', 'lobby', 'room214', 'desk', 'office', 'room507']);

/** The visitor's hour as minutes since 18:00, inside the night; 18:00 by day */
function nowMinutes() {
  const m = (clock.now().minutes - 1080 + 1440) % 1440;
  return m <= NIGHT ? m : 0;
}

function readChapters(): ChapterInfo[] {
  let prev = 0;
  return [...document.querySelectorAll<HTMLElement>('section[data-chapter], footer[data-chapter]')].map((el) => {
    const id = el.dataset.chapter || el.id;
    const hour = el.dataset.hour ?? '';
    let minutes = prev;
    if (hour === 'now') minutes = nowMinutes();
    else if (/^\d{1,2}:\d{2}$/.test(hour)) {
      const [h, m] = hour.split(':').map(Number);
      minutes = Math.min(NIGHT, (h * 60 + m - 1080 + 1440) % 1440);
    }
    if (hour !== 'now') prev = minutes;
    const roomKey = (el.dataset.room ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const anchor = BY_ID[id] ?? (ANCHORS.has(roomKey) ? (roomKey as AnchorKey) : 'house');
    return { id, hour, minutes, anchor, room: el.dataset.room ?? '', el };
  });
}

/** Window occupancy by the hour: ~25 % at dusk (out at dinner), 40 % in the evening, 12 % from 02:00 to 05:00, waking toward 07:00 */
export function occupancy(m: number) {
  if (m < 120) return 0.25 + (0.15 * m) / 120;
  if (m < 300) return 0.4;
  if (m < 480) return 0.4 - (0.28 * (m - 300)) / 180;
  if (m < 660) return 0.12;
  return 0.12 + 0.2 * Math.min(1, (m - 660) / 90);
}

export interface DirectorParts {
  root: HTMLElement;
  camera: THREE.PerspectiveCamera;
  house: House;
  lantern: Lantern;
}

export type Director = ReturnType<typeof createDirector>;

export function createDirector({ root, camera, house, lantern }: DirectorParts) {
  const U = house.uniforms;
  const chapters = readChapters();
  if (!chapters.length) throw new Error('No [data-chapter] sections on the page');
  const stops: Stop[] = chapters.map((c) => ({ y: 0, m: c.minutes }));
  const listeners = new Set<(e: NightEvent) => void>();
  const t0 = performance.now();

  let W = innerWidth, H = innerHeight, dpr = 1, svh = innerHeight, maxY = 1, barH = 72, dockH = 72;
  let phone = false, tablet = false;
  let minutes = chapters[0].minutes, index = 0, progress = 0, s = 0;
  let a: AnchorKey = chapters[0].anchor, b: AnchorKey = a;
  let time = 0, band = 0;
  let extraLit = -1, bucket = -1, litKey = '', nextIdle = 0;
  let lastEmit = -1, lastChapter = -1;
  let ready = false;

  // The porter's light: the drawing appears outward from the lamp and the glass pours (1.6–1.8 s);
  // skipped on return visits, under reduced motion or Pause, and ended by any input
  let introStart = -1;
  let introDone = !motion.allowed || (() => { try { return !!localStorage.getItem('amariya_visited'); } catch { return false; } })();
  const endIntro = () => { introDone = true; };
  const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  for (const t of INPUTS) addEventListener(t, endIntro, { passive: true, once: true });

  let intro = introDone ? 1 : 0;

  // The camera on its rail and the lantern's spring, in screen space (CSS px)
  const pa = newPose(), pb = newPose(), goal = newPose(), cam = newPose();
  let camReady = false;
  const L = { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, ax: 0, ready: false };
  const shot: Shot = { at: new THREE.Vector3(), reach: [1, 1, 1, 1], az: 0, el: 0, fx: 0.5, fy: 0.5 };
  const v = new THREE.Vector3(), dir = new THREE.Vector3(), at = new THREE.Vector3();
  const lanternPos = new THREE.Vector3();
  const fa: Frame = { x: 0, y: 0, w: 1, h: 1 }, fb: Frame = { x: 0, y: 0, w: 1, h: 1 }, fp: Frame = { x: 0, y: 0, w: 1, h: 1 };
  const screen = { x: 0, y: 0 };
  let lanternR = 1, bank = 0;

  // Layout constants, measured on resize only
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  // Its width is the page's scrim column (--scrim-w), so the house frame ends exactly where the log column's scrim begins
  probe.style.cssText = 'position:fixed;top:0;left:0;width:var(--scrim-w,0px);height:100svh;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const px = (name: string, fallback: number) => {
    const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  // The prologue's layout is the page's (P4's CSS): the lantern's seat, the ground line (the basement's top edge) and,
  // on phones, the title block that sits at the foot of the house band. Measured here, so drawing and type agree.
  const seatEl = document.querySelector<HTMLElement>('[data-seat]');
  const groundEl = document.querySelector<HTMLElement>('.prologue .basement');
  const titleEl = document.querySelector<HTMLElement>('.prologue .pro-title');
  const seat = { x: 0, y: 0, r: 0 };
  let groundY = 0, titleTop = 0, scrimW = 0;
  function measure() {
    W = innerWidth;
    H = innerHeight;
    svh = probe.offsetHeight || H;
    scrimW = probe.offsetWidth;
    phone = W < 734;
    tablet = !phone && W < 1068;
    barH = px('--bar-h', phone ? 56 : 72);
    dockH = px('--dock-h', phone ? 64 : 72);
    maxY = Math.max(1, document.documentElement.scrollHeight - H);
    if (chapters[0].hour === 'now') chapters[0].minutes = stops[0].m = nowMinutes();
    // Document offsets (the prologue is the top of the page, so they are its screen positions at rest)
    const y0 = window.scrollY;
    const g = groundEl?.getBoundingClientRect();
    groundY = g && g.height ? g.top + y0 : svh * (phone ? 0.44 : 0.64);
    const tt = titleEl?.getBoundingClientRect();
    titleTop = tt && tt.height ? tt.top + y0 : groundY;
    const sb = seatEl?.getBoundingClientRect();
    if (sb && sb.width) Object.assign(seat, { x: sb.left + sb.width / 2, y: sb.top + y0 + sb.height / 2, r: sb.width / 2 });
    else Object.assign(seat, { x: W * 0.62, y: groundY * 0.55, r: Math.min(0.19 * svh, 0.38 * W) });
  }
  const ro = new ResizeObserver(() => measure());
  ro.observe(document.body);
  // The title's height moves with its fonts and wrapping, without resizing the page
  if (titleEl) ro.observe(titleEl);
  const offMinute = clock.onMinute(() => { if (chapters[0].hour === 'now') chapters[0].minutes = stops[0].m = nowMinutes(); });

  /** The house's part of the screen: columns 1–8 on desktops, 58 % on tablets, the top band on phones */
  function frameFor(anchor: AnchorKey, p: number, out: Frame): Frame {
    // The prologue's drawing stands on the ground line; on phones, on the title block at the foot of the band
    if (anchor === 'prologue') return Object.assign(out, { x: 0, y: barH, w: W, h: Math.max(80, (phone ? titleTop : groundY) - barH) });
    // Phones: the band above the hour numeral that hangs 66 px up from its bottom edge (P4's .band-hour)
    if (phone) return Object.assign(out, { x: 0, y: barH, w: W, h: Math.max(80, bandFor(anchor, p) - barH - 66) });
    // Up to the scrim column (P4's --scrim-w: the frame, the log column, the numerals' hang); the old estimate as a fallback
    const colW = (W - 96 - 11 * 48) / 12;
    const w = scrimW > 0 ? W - scrimW : tablet ? W * 0.58 : W - Math.min(440, colW * 4 + 3 * 48) - 96;
    return Object.assign(out, { x: 0, y: barH, w: Math.max(200, w), h: Math.max(120, H - barH - dockH) });
  }
  /** Phones: the house band starts at 44svh as a chapter opens and settles to 30svh as its text scrolls */
  // In the prologue the band ends where the title block begins (56svh at most), so the title scrolls under the drawing
  // like every other line of the page instead of riding up over the lantern; it eases to 44svh as the prologue leaves
  const bandFor = (anchor: AnchorKey, p: number) => {
    if (anchor !== 'prologue') return svh * (0.44 - 0.14 * smooth(p, 0.15, 0.55));
    const rest = titleTop > barH ? Math.min(svh * 0.56, titleTop) : svh * 0.56;
    return rest + (svh * 0.44 - rest) * smooth(p, 0.55, 1);
  };

  /** The lantern's radius per chapter, CSS px */
  function radiusFor(anchor: AnchorKey) {
    // Desktop: the seat the page keeps for her (sized so the ring and the coaster clear the ground line).
    // Phones: the glass and its ring (1.35 r) fit between the cornice and the title block.
    if (anchor === 'prologue') return phone ? Math.max(24, Math.min(0.19 * svh, 0.38 * W, (titleTop - barH - 16) / 2.7)) : seat.r;
    if (anchor === 'lobby') return Math.min(0.3 * svh, 0.34 * W);
    if (anchor === 'handover') return 80;
    if (anchor === 'checkout') return 64;
    return phone ? 36 : tablet ? 42 : 48;
  }

  function poseFor(anchor: AnchorKey, p: number, out: typeof pa) {
    const l = house.layout;
    const bear = BEARING[anchor];
    const frame = frameFor(anchor, p, fp);
    if (anchor === 'prologue') {
      // The whole house above the drawing's ground line, the lobby desk under the lantern's seat (right of the
      // title on desktops; the street beyond the door may run off the edge there, so it is not fitted)
      const d = l.anchors.desk.at;
      shot.at.set(d.x, 0, 0);
      shot.reach = [d.x + l.half + 1, l.half - d.x + (phone ? 4.8 : 1.2), l.roofTop + 1.2, 0];
      shot.fx = phone ? 0.5 : Math.min(0.9, Math.max(0.5, seat.x / W));
    } else {
      const f = l.anchors[ROOM[anchor]].focus;
      shot.at.set(f.x, f.y, f.z);
      // Phones hang the keys 6 × 5 on a narrower, taller rack (keys.ts)
      const hw = anchor === 'keys' && phone ? 1.15 : f.hw, hh = anchor === 'keys' && phone ? 1.33 : f.hh;
      shot.reach = [hw, hw, hh, hh];
      shot.fx = bear.fx;
    }
    shot.az = bear.az;
    shot.el = bear.el;
    shot.fy = bear.fy;
    return aim(shot, frame, H, phone ? 30 : 22, out);
  }

  function applyCamera() {
    camera.position.copy(cam.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target);
    camera.fov = cam.fov;
    camera.aspect = W / H;
    // The target lands on its frame's principal point, not the canvas centre
    camera.setViewOffset(W, H, W / 2 - cam.cx, H / 2 - cam.cy, W, H);
    camera.updateMatrixWorld();
  }

  /** Projects a world point to CSS px */
  function project(p: THREE.Vector3, out: { x: number; y: number }) {
    v.copy(p).project(camera);
    out.x = (v.x + 1) * 0.5 * W;
    out.y = (1 - v.y) * 0.5 * H;
    return out;
  }

  /** The unit view ray through a screen point (CSS px), into `dir` */
  function ray(x: number, y: number) {
    return dir.set((x / W) * 2 - 1, -(y / H) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
  }

  /** Lantern placement: on the ray through its screen centre, as far back as it can hang in front of the drawing */
  function placeLantern(anchorZ: number) {
    ray(L.x, L.y);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const sinT = Math.sin(Math.atan((L.r / (H / 2)) * tanHalf));
    const occluder = camera.position.z > 0.5 ? 0 : anchorZ;
    let dl = (camera.position.z - occluder - 0.3) / Math.max(0.05, -dir.z + sinT);
    dl = Math.max(dl, camera.near * 6);
    lanternR = dl * sinT;
    lanternPos.copy(camera.position).addScaledVector(dir, dl);
    lantern.place(lanternPos, lanternR);
    // Her light falls from just under her centre, at the depth of the room she is in
    ray(L.x, L.y + L.r * 0.7);
    const t = Math.abs(dir.z) > 1e-3 ? (anchorZ - camera.position.z) / dir.z : 10;
    U.uLantern.value.copy(camera.position).addScaledVector(dir, Math.max(0.5, t));
  }

  const css: Record<string, string> = {};
  // ponytail: on :root, as the page contract has them, and on each element whose rules read them (the glass's ring, the
  // coaster, the phone's band numeral, room tag and canvas clip, the gilt and the key fobs; a new reader joins this
  // list): hotels.css registers them as not inherited, so the :root write restyles :root alone
  const rootStyle = document.documentElement.style;
  const varTargets = [...document.querySelectorAll<HTMLElement>('.ring-glass, .coaster, .room-tag, .band-hour, [data-stage-canvas], .fob, .gilt')];
  function setVar(name: string, value: string, readers = true) {
    if (css[name] === value) return;
    css[name] = value;
    rootStyle.setProperty(name, value);
    if (readers) for (const el of varTargets) el.style.setProperty(name, value);
  }
  let rootTransform = '', rootSize = '', interactive = true;
  root.style.position = 'fixed';
  root.style.top = '0';
  root.style.left = '0';
  root.style.margin = '0';
  root.style.willChange = 'transform';
  // Above the chapters (content is layer 1), so a positioned section never takes the drag or the tap from the glass
  root.style.zIndex = 'var(--z-overlay, 2)';

  /** Lights: occupancy by the hour, the lantern's room, the lobby and restaurant by their hours, dawn puts them out */
  function lights(force: boolean) {
    const l = house.layout;
    const roomA = l.anchors[ROOM[a]], roomB = l.anchors[ROOM[b]];
    const keep = new Set<number>();
    if (progress >= 0.2 || !motion.allowed) keep.add(roomA.panel);
    if (s > 0.5) keep.add(roomB.panel);
    if (extraLit >= 0) keep.add(extraLit);
    const dawn = minutes / NIGHT > 0.88;
    const nb = Math.round(minutes / 5);
    const key = [...keep].join(',') + (dawn ? 'd' : '');
    if (!force && nb === bucket && key === litKey) return;
    const entering = !introDone && introStart >= 0;
    const wasDawn = bucket >= 0 && bucket * 5 / NIGHT > 0.88;
    bucket = nb;
    litKey = key;
    const occ = occupancy(minutes);
    const seeds = house.seeds, kinds = house.kinds;
    const lobby = l.anchors.desk.panel, restaurant = l.anchors.restaurant.panel;
    for (let i = 0; i < seeds.length; i++) {
      if (kinds[i] === 1) continue;
      let lit: boolean;
      if (keep.has(i)) lit = true;
      else if (dawn) lit = false;
      else if (i === lobby) lit = true;
      else if (i === restaurant) lit = minutes < 330;
      else if (kinds[i] === 2) lit = minutes < 300;
      else lit = seeds[i] < occ;
      // Instantly when still; in seeded order over 4 s at dawn; staggered over the porter's light
      const delay = !motion.allowed ? -1e4 : dawn && !wasDawn ? seeds[i] * 4 : entering ? seeds[i] * 1.4 : 0;
      house.setLit(i, lit, delay === -1e4 ? -1e4 : time + delay);
    }
  }

  function update(now: number, dt: number) {
    const allowed = motion.allowed;
    time = (now - t0) / 1000;
    if (!ready) { measure(); ready = true; }
    const l = house.layout;
    if (!introDone && introStart < 0) introStart = time;

    // NightClock: scroll → minutes, chapter and its progress (on phones a chapter opens at the reading line under the band)
    refreshStops();
    const y = scroll.y;
    minutes = minutesAt(stops, y);
    index = chapterIndexAt(stops, y);
    const next = Math.min(index + 1, chapters.length - 1);
    const y0 = stops[index].y, y1 = next > index ? stops[next].y : maxY;
    progress = y1 > y0 ? clamp((y - y0) / (y1 - y0), 0, 1) : 1;
    // The camera moves on an S-curve over the last 30 % of each chapter; under reduced motion or Pause it holds the chapter's pose
    s = allowed && next > index ? smooth(progress, 0.7, 1) : 0;
    a = chapters[index].anchor;
    b = chapters[next].anchor;
    const t = minutes / NIGHT;

    // Camera rail (smoothing τ 120 ms)
    poseFor(a, progress, pa);
    poseFor(b, 0, pb);
    ride(goal, pa, pb, s, (l.shaft[0] + l.shaft[1]) / 2);
    if (!camReady || !allowed || dt <= 0) {
      cam.pos.copy(goal.pos); cam.target.copy(goal.target);
      cam.fov = goal.fov; cam.cx = goal.cx; cam.cy = goal.cy;
      camReady = true;
    } else {
      follow(cam, goal, dt, 0.12);
    }
    applyCamera();

    // The lantern's target: its room's resting point on screen, sized per chapter, inside the house's frame
    const A = l.anchors[ROOM[a]], B = l.anchors[ROOM[b]];
    at.lerpVectors(A.at, B.at, s);
    const p = project(at, screen);
    const R = radiusFor(a) + (radiusFor(b) - radiusFor(a)) * s;
    const lift = A.lift + (B.lift - A.lift) * s;
    frameFor(a, progress, fa);
    frameFor(b, 0, fb);
    const fx = fa.x + (fb.x - fa.x) * s, fy = fa.y + (fb.y - fa.y) * s, fw = fa.w + (fb.w - fa.w) * s, fh = fa.h + (fb.h - fa.h) * s;
    // Where the hour ring shows around the glass (the prologue and the lobby), the ring has to fit the frame too
    const ringed = (k: AnchorKey) => k === 'prologue' || k === 'lobby';
    const kr = ringed(a) || ringed(b) ? 1.36 : 1;
    let r = Math.min(R, fw / (2 * kr) - 4, fh / (2 * kr) - 4);
    // Connecting: the globe dips 18 px, leaning in
    const dip = voice.state === 'connecting' ? 18 : 0;
    let tx = fw > 2 * kr * r + 8 ? clamp(p.x, fx + kr * r + 4, fx + fw - kr * r - 4) : fx + fw / 2;
    let ty = fh > 2 * kr * r + 8 ? clamp(p.y - r * lift * 1.05 + dip, fy + kr * r + 4, fy + fh - kr * r - 4) : fy + fh / 2;
    if (a === 'prologue') {
      // The prologue's place is the page's: the seat on desktops, centred above the title block on phones
      const pr = radiusFor('prologue');
      const px0 = phone ? W / 2 : seat.x, py0 = (phone ? barH + (titleTop - barH) / 2 : seat.y) + dip;
      tx = px0 + (tx - px0) * s;
      ty = py0 + (ty - py0) * s;
      r = pr + (r - pr) * s;
    }
    if (!L.ready || !allowed || dt <= 0) {
      L.x = tx; L.y = ty; L.r = Math.max(4, r);
      L.vx = L.vy = L.vr = L.ax = 0;
      L.ready = true;
    } else {
      // A critically damped spring, ω 5 rad/s (settles in ≈ .9 s), sub-stepped
      const w = 5, vx0 = L.vx;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(1 / 120, left);
        left -= h;
        L.vx += (w * w * (tx - L.x) - 2 * w * L.vx) * h;
        L.vy += (w * w * (ty - L.y) - 2 * w * L.vy) * h;
        L.vr += (w * w * (Math.max(4, r) - L.r) - 2 * w * L.vr) * h;
        L.x += L.vx * h;
        L.y += L.vy * h;
        L.r += L.vr * h;
      }
      L.ax = (L.vx - vx0) / dt;
    }
    // Banks into its travel, at most .12 rad
    bank = allowed ? clamp(-L.vx * 0.00015, -0.12, 0.12) : 0;
    placeLantern(A.at.z + (B.at.z - A.at.z) * s);

    // Dawn and the facade's raking sunrise
    U.uDawn.value = smooth(t, 0.88, 1);
    U.uSweep.value = -l.half - 12 + (2 * l.half + 24) * smooth(t, 0.88, 1);
    U.uDim.value = (a === 'faq' ? 0.15 : 1) + ((b === 'faq' ? 0.15 : 1) - (a === 'faq' ? 0.15 : 1)) * s;
    // Behind the log column, the drawing never outshines the scrim's measured envelope (off where no text sits over it)
    U.uScrimX.value = phone || (a === 'prologue' && progress < 0.5) ? 1e6 : fa.w * dpr;
    house.setFade(cam.pos.distanceTo(cam.target) * 0.95, cam.pos.distanceTo(cam.target) * 2.6);

    // Lit windows by the hour; the room she is in brightens with her voice; its phone rings, then glows answered
    lights(false);
    const roomNow = s > 0.5 ? B : A;
    house.setActive(roomNow.panel >= 0 ? l.rects[roomNow.panel] : null);
    if (allowed && time > nextIdle) {
      // Idle life: a window turns on or off every 6–12 s
      if (nextIdle > 0) {
        const kinds = house.kinds;
        const i = Math.floor(Math.random() * kinds.length);
        if (kinds[i] === 0 && i !== A.panel && i !== B.panel && minutes / NIGHT <= 0.88) house.setLit(i, !house.isOn(i), time);
      }
      nextIdle = time + 6 + Math.random() * 6;
    }
    const ringing = CALLS.has(a) ? A.phone : -1;
    const blink = (time % 3) < 0.4 || ((time % 3) >= 0.6 && (time % 3) < 1.0) ? 1 : 0.1;
    house.setRing(ringing, !allowed ? 1 : progress < 0.1 ? 0.12 : progress < 0.3 ? blink : 1);

    // The porter's light
    const introP = introDone ? 1 : clamp((time - introStart) / 1.8, 0, 1);
    if (introP >= 1) introDone = true;
    U.uReveal.value = introDone ? 1e4 : (1 - (1 - Math.min(1, (time - introStart) / 1.6)) ** 3) * (l.roofTop + 40);
    intro = introP;

    // Phones: the house band's height, for the page's clip
    band = phone ? bandFor(a, progress) + (bandFor(b, 0) - bandFor(a, progress)) * s : 0;

    // CSS variables and the orb root over the lantern (one transform per frame, no layout reads); --t (the night, 0–1)
    // has no rule reading it, so it goes to :root only
    setVar('--t', t.toFixed(4), false);
    setVar('--ox', `${L.x.toFixed(1)}px`);
    setVar('--oy', `${L.y.toFixed(1)}px`);
    setVar('--or', `${L.r.toFixed(1)}px`);
    setVar('--gx', `${L.x.toFixed(0)}px`);
    setVar('--gy', `${L.y.toFixed(0)}px`);
    if (phone) {
      setVar('--band', `${band.toFixed(1)}px`);
      // The page's clip, band numeral and room tag read the same band (svh units), so drawing and clip agree
      setVar('--bandf', ((band / svh) * 100).toFixed(2));
    }
    const tf = `translate(${(L.x - L.r).toFixed(1)}px, ${(L.y - L.r).toFixed(1)}px)`;
    if (tf !== rootTransform) { rootTransform = tf; root.style.transform = tf; }
    const size = `${(2 * L.r).toFixed(1)}px`;
    if (size !== rootSize) { rootSize = size; root.style.setProperty('--orb', size); }
    // Under 22 px the glass is too small to press (a target under 44 px): the desk slip carries Ring
    const canPress = L.r >= 22;
    if (canPress !== interactive) {
      interactive = canPress;
      root.tabIndex = canPress ? 0 : -1;
      root.style.pointerEvents = canPress ? '' : 'none';
      if (!canPress && document.activeElement === root) root.blur();
    }

    // Night events: the minute or the chapter changed
    if (Math.abs(minutes - lastEmit) > 0.01 || index !== lastChapter) {
      lastEmit = minutes;
      lastChapter = index;
      const e: NightEvent = { minutes, chapter: chapters[index], progress };
      listeners.forEach((cb) => { try { cb(e); } catch (err) { console.error(err); } });
    }
  }

  function refreshStops() {
    const ahead = lead();
    for (let k = 0; k < chapters.length; k++) stops[k].y = Math.min(Math.max(0, offsetTop(chapters[k].el) - (k ? ahead : 0)), maxY);
  }

  const night: NightApi = {
    get minutes() { return minutes; },
    chapters,
    setMinutes(m, o = {}) {
      if (!ready) measure();
      refreshStops();
      const target = scrollFor(stops, clamp(Number(m) || 0, 0, NIGHT));
      const d = Math.abs(target - scroll.y);
      return scroll.to(target, { immediate: !!o.immediate, duration: clamp(d * 0.45, 500, 1100) / 1000 });
    },
    jump: (m) => night.setMinutes(m, { immediate: true }),
    chapterAt(m) {
      // Chapters on the clock, in page order: the last one at or before m (the first one before 18:00)
      let found: ChapterInfo | null = null;
      for (const c of chapters) if (/^\d/.test(c.hour) && (!found || c.minutes <= m)) found = c;
      return found;
    },
    on(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };

  const removeJob = scheduler.add((now, dt) => update(now, dt), 10);

  return {
    night,
    /** Runs the frame now (still frames under reduced motion or Pause call it before drawing) */
    update,
    get time() { return time; },
    get intro() { return intro; },
    get phone() { return phone; },
    get state() { return { anchor: a, next: b, s, progress, minutes, ax: L.ax, bank, radiusPx: L.r, lanternR, lanternPos, camY: cam.target.y }; },
    /** Keeps a room lit (anchor key or chapter id) */
    lightRoom(room: string) {
      const key = (BY_ID[room] ?? room) as AnchorKey;
      const r = ROOM[key];
      extraLit = r ? house.layout.anchors[r].panel : -1;
      lights(true);
    },
    relight() { bucket = -1; lights(true); },
    resize(_w: number, _h: number, d: number) {
      dpr = d;
      measure();
    },
    dispose() {
      removeJob();
      ro.disconnect();
      offMinute();
      probe.remove();
      for (const t of INPUTS) removeEventListener(t, endIntro);
      for (const name of Object.keys(css)) { rootStyle.removeProperty(name); for (const el of varTargets) el.style.removeProperty(name); }
    },
  };
}
