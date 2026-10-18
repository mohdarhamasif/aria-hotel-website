// Her body on the page: lift, carry, throw, roll, the home spring, magnets, walls and the Line she cannot cross.
// World units are page px from main's top-left, y down. Fixed 120 Hz sub-steps (semi-implicit Euler), frames clamped to 1/30 s.
// No DOM here, so selfCheck() at the bottom runs in Node:
//   npx rolldown src/niches/clinics/scene/physics.ts --file <tmp>/physics.mjs && node -e "import('file:///<tmp>/physics.mjs').then((m) => m.selfCheck())"
import { sunAt } from './sun';

const H = 1 / 120;
const LIFT = { k: 420, c: 22 };
const RADIUS = { k: 60, c: 2 * Math.sqrt(60) };
const HOME = { k: 140, c: 19.4, max: 2600 };
const MAGNET = { k: 320, c: 25 };
/** Carry: the orb trails the pointer by τ 16 ms; a release throws with the velocity of the last 80 ms */
const DRAG_TAU = 0.016;
const TRAIL = 0.08;
const THROW_MAX = 4000;
const THROW_TAU = 0.32;
const STOP = 40;
const WALL = { k: 900, e: 0.35 };
const LINE = { k: 520, c: 18, dent: 28, press: 24, hold: 0.12, impact: 900, e: 0.35, cooldown: 1.2 };
/** The pointer acts like a spring of 1/τ²: against the line's 520 the orb gives way to ~88 % of the push */
const GIVE = LINE.k / (LINE.k + 1 / (DRAG_TAU * DRAG_TAU));
const PUSH = 1100;
/** A slow press that hands off is sent back out at this speed (px/s) */
const KICK = 320;
const ROLL_MAX = 1.2 * 2 * Math.PI;
const SPIN_TAU = 0.9;
const LEAN_MAX = (12 * Math.PI) / 180;
const SCROLL_LEAN = (6 * Math.PI) / 180;
const LEAN_TAU = 0.12;

export type Mode =
  /** At rest on her anchor (a pinned chapter carries her with it) */
  | 'attached'
  /** Rolling back to her anchor on the home spring */
  | 'home'
  /** Lifted by a long press, following the pointer */
  | 'carry'
  /** Thrown or bounced: slides to a stop and stays */
  | 'free'
  /** Pushed into the line by a button or key: bounces, then comes home */
  | 'push'
  /** On the magnet spring onto a drop target, and staying there */
  | 'placed'
  /** Stopped where the visitor left her */
  | 'parked';

export interface LineHit {
  /** Foot of the perpendicular on the line */
  x: number;
  y: number;
  /** Unit normal toward her side */
  nx: number;
  ny: number;
  /** Signed distance from the line, positive on her side */
  d: number;
  /** Arc length of the foot along the line */
  s: number;
}

export interface Env {
  /** Springs and inertia; false under reduced motion or Pause, when everything snaps */
  smooth: boolean;
  home: { x: number; y: number };
  /** The anchor's velocity while a pinned chapter carries it with the scroll (px/s; 0 when it is fixed to the page) */
  carrierVx: number;
  carrierVy: number;
  radius: number;
  /** The viewport below the bar, in world px */
  walls: { left: number; right: number; top: number; bottom: number };
  /** Page scroll velocity (px/s): she leans up to 6° with it */
  scrollV: number;
  probe: (x: number, y: number) => LineHit | null;
  /** Her home lies on the paper on her side of the line (false for the phone's thumb cradle, which is chrome) */
  paper: boolean;
}

/** Nearest detent index for a yaw (the dial's glyph i faces the visitor at yaw −i·step), and that detent's yaw */
export function nearestDetent(yaw: number, step: number, count: number) {
  const k = Math.round(-yaw / step);
  return { index: ((k % count) + count) % count, yaw: -k * step };
}

export class Body {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Lift: 0 on the paper, 1 held */
  z = 0;
  vz = 0;
  /** Extra height above the anchor (px, negative is up) that falls on the lift spring: the intro */
  fall = 0;
  vfall = 0;
  r = 132;
  vr = 0;
  mode: Mode = 'attached';
  /** Rolling: angular velocity (rad/s) about the screen axes, x right, y up */
  wx = 0;
  wy = 0;
  /** Lean (radians) of her top toward screen x and y (y up) */
  lx = 0;
  ly = 0;
  /** Penetration into the line (px) and the nearest point on it, for the dent */
  depth = 0;
  foot: LineHit | null = null;
  /** A drop target pulling a carried orb in (set by the handle), and where a placed orb rests */
  magnet: { x: number; y: number } | null = null;
  target: { x: number; y: number } | null = null;
  onHandoff: (x: number, y: number) => void = () => {};
  onPluck: (s: number, amp: number) => void = () => {};
  onLand: () => void = () => {};

  private t = 0;
  private acc = 0;
  private px = 0;
  private py = 0;
  private gx = 0;
  private gy = 0;
  /** t, x, y of the last 80 ms of carrying */
  private trail: number[] = [];
  private contact = false;
  /** When the current press reached 24 px (−1: not pressing that hard) */
  private pressedAt = -1;
  private cooldown = -Infinity;
  private bounceUntil = -Infinity;
  /** Speed into the line at the last hand-off impact, for the rebound */
  private impact = 0;
  /** Reduced motion: a push holds the dent for 900 ms, then she snaps home */
  private pushN: [number, number] | null = null;
  private pushUntil = 0;

  /** Seconds on the body's own clock (advances with every step) */
  get time() { return this.t; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get resting() { return (this.mode === 'attached' || this.mode === 'parked' || this.mode === 'placed') && this.z < 0.02; }

  reset(x: number, y: number, r: number) {
    Object.assign(this, { x, y, r, vx: 0, vy: 0, vr: 0, z: 0, vz: 0, fall: 0, vfall: 0, mode: 'attached' as Mode });
    this.contact = false;
  }

  carry(px: number, py: number) {
    this.mode = 'carry';
    this.gx = px - this.x;
    this.gy = py - this.y;
    this.px = px;
    this.py = py;
    this.trail = [];
    this.magnet = null;
  }

  move(px: number, py: number) {
    this.px = px;
    this.py = py;
  }

  /** Release a carried orb: onto the magnet's target, thrown, or (without motion) where it is. Returns the new mode. */
  drop(smooth: boolean): Mode {
    if (this.mode !== 'carry') return this.mode;
    if (this.magnet) return this.placeAt(this.magnet.x, this.magnet.y, smooth);
    const [vx, vy] = this.throwVelocity();
    if (smooth && Math.hypot(vx, vy) > STOP) {
      this.vx = vx;
      this.vy = vy;
      this.mode = 'free';
    } else {
      this.vx = this.vy = 0;
      this.mode = 'parked';
    }
    return this.mode;
  }

  placeAt(x: number, y: number, smooth: boolean): Mode {
    this.target = { x, y };
    this.mode = 'placed';
    if (!smooth) { this.x = x; this.y = y; this.vx = this.vy = 0; }
    return this.mode;
  }

  goHome() {
    if (this.mode !== 'attached') this.mode = 'home';
  }

  /** A throw with this velocity (px/s) */
  fling(vx: number, vy: number) {
    this.mode = 'free';
    this.vx = vx;
    this.vy = vy;
  }

  /** Push her into the line along −n (n: the normal toward her side); she bounces off it and rolls home */
  push(nx: number, ny: number, smooth: boolean) {
    this.mode = 'push';
    if (smooth) {
      this.vx = -nx * PUSH;
      this.vy = -ny * PUSH;
    } else {
      this.pushN = [nx, ny];
      this.pushUntil = this.t + 0.9;
    }
  }

  /** The intro: lift her dy px above the anchor and let her fall onto it */
  dropIn(dy: number) {
    this.fall = -Math.abs(dy);
    this.vfall = 0;
  }

  step(elapsed: number, env: Env) {
    const dt = Math.min(Math.max(elapsed, 0), 1 / 30);
    if (!env.smooth) return this.snap(dt, env);
    this.acc += dt;
    while (this.acc >= H) {
      this.acc -= H;
      this.sub(env);
    }
    this.spin(dt, env);
    if (this.mode !== 'carry' && this.mode !== 'free' && this.mode !== 'push') this.measure(env);
  }

  /** Reduced motion or Pause: no inertia, no springs; the drag is 1:1 and everything else snaps */
  private snap(dt: number, env: Env) {
    this.t += dt;
    this.acc = 0;
    this.z = this.mode === 'carry' ? 1 : 0;
    this.r = env.radius;
    this.vz = this.vr = this.vfall = this.fall = 0;
    this.wx = this.wy = this.lx = this.ly = 0;
    switch (this.mode) {
      case 'carry': {
        const [x, y] = this.clampToWalls(this.px - this.gx, this.py - this.gy, env);
        this.x = x;
        this.y = y;
        break;
      }
      case 'push': {
        if (this.pushN && this.t < this.pushUntil) {
          // Into the line by the full dent, held: the line shows it without vibrating
          const hit = env.probe(env.home.x, env.home.y);
          const n = hit ? [hit.nx, hit.ny] : this.pushN;
          const into = LINE.dent + (hit ? hit.d - this.r : 0);
          this.x = env.home.x - n[0] * into;
          this.y = env.home.y - n[1] * into;
          break;
        }
        this.pushN = null;
        this.mode = 'attached';
        this.x = env.home.x;
        this.y = env.home.y;
        break;
      }
      case 'home':
      case 'attached':
        this.mode = 'attached';
        this.x = env.home.x;
        this.y = env.home.y;
        break;
      case 'placed':
        if (this.target) { this.x = this.target.x; this.y = this.target.y; }
        break;
      case 'free':
        this.mode = 'parked';
        break;
    }
    this.vx = this.vy = 0;
    if (this.mode === 'carry' || this.mode === 'push') this.collide(env, 'hard');
    else this.measure(env);
  }

  private sub(env: Env) {
    this.t += H;
    // Lift and the intro's fall share the lift spring (ζ .54: one small bounce)
    const lift = this.mode === 'carry' ? 1 : 0;
    this.vz += (-LIFT.k * (this.z - lift) - LIFT.c * this.vz) * H;
    this.z += this.vz * H;
    if (this.fall !== 0 || this.vfall !== 0) {
      const above = this.fall < 0;
      this.vfall += (-LIFT.k * this.fall - LIFT.c * this.vfall) * H;
      this.fall += this.vfall * H;
      if (above && this.fall >= 0) this.onLand();
      if (Math.abs(this.fall) < 0.05 && Math.abs(this.vfall) < 1) this.fall = this.vfall = 0;
    }
    // Radius per chapter: critically damped
    this.vr += (-RADIUS.k * (this.r - env.radius) - RADIUS.c * this.vr) * H;
    this.r += this.vr * H;

    switch (this.mode) {
      case 'attached':
        this.x = env.home.x;
        this.y = env.home.y;
        this.vx = env.carrierVx;
        this.vy = env.carrierVy;
        return;
      case 'home':
      case 'placed': {
        const home = this.mode === 'home';
        const to = home || !this.target ? env.home : this.target;
        const k = home ? HOME.k : MAGNET.k, c = home ? HOME.c : MAGNET.c;
        const cvx = home ? env.carrierVx : 0, cvy = home ? env.carrierVy : 0;
        this.vx += (k * (to.x - this.x) - c * (this.vx - cvx)) * H;
        this.vy += (k * (to.y - this.y) - c * (this.vy - cvy)) * H;
        const rel = Math.hypot(this.vx - cvx, this.vy - cvy);
        if (rel > HOME.max) {
          this.vx = cvx + ((this.vx - cvx) * HOME.max) / rel;
          this.vy = cvy + ((this.vy - cvy) * HOME.max) / rel;
        }
        this.x += this.vx * H;
        this.y += this.vy * H;
        // On her way she rolls along the line, never across it (no hand-off: nobody is pushing)
        if (!home || env.paper) this.slideAlong(env);
        if (home && Math.hypot(to.x - this.x, to.y - this.y) < 0.6 && rel < 12) this.mode = 'attached';
        return;
      }
      case 'carry': {
        if (this.t < this.bounceUntil) this.slide(env);
        else if (this.magnet) {
          this.vx += (MAGNET.k * (this.magnet.x - this.x) - MAGNET.c * this.vx) * H;
          this.vy += (MAGNET.k * (this.magnet.y - this.y) - MAGNET.c * this.vy) * H;
          this.x += this.vx * H;
          this.y += this.vy * H;
        } else {
          const [tx, ty] = this.clampToWalls(this.px - this.gx, this.py - this.gy, env);
          const k = 1 - Math.exp(-H / DRAG_TAU);
          const nx = this.x + (tx - this.x) * k, ny = this.y + (ty - this.y) * k;
          this.vx = (nx - this.x) / H;
          this.vy = (ny - this.y) / H;
          this.x = nx;
          this.y = ny;
        }
        this.trail.push(this.t, this.x, this.y);
        while (this.trail.length > 3 && this.t - this.trail[0] > TRAIL) this.trail.splice(0, 3);
        this.collide(env, this.t < this.bounceUntil || this.magnet ? 'force' : 'give');
        return;
      }
      case 'free':
      case 'push':
        this.slide(env);
        this.collide(env, 'force');
        if (Math.hypot(this.vx, this.vy) < STOP && !this.contact) {
          this.vx = this.vy = 0;
          this.mode = this.mode === 'push' ? 'home' : 'parked';
        }
        return;
      case 'parked':
        this.vx = this.vy = 0;
        return;
    }
  }

  /** Throw decay e^(−t/.32 s) with the walls' penalty springs (k 900) and a .35 bounce */
  private slide(env: Env) {
    const decay = Math.exp(-H / THROW_TAU);
    this.vx *= decay;
    this.vy *= decay;
    const w = env.walls, r = this.r;
    if (w.right - w.left > 2 * r) {
      if (this.x < w.left + r) { this.vx += WALL.k * (w.left + r - this.x) * H; if (this.vx < 0) this.vx *= -WALL.e; }
      if (this.x > w.right - r) { this.vx -= WALL.k * (this.x - w.right + r) * H; if (this.vx > 0) this.vx *= -WALL.e; }
    }
    if (w.bottom - w.top > 2 * r) {
      if (this.y < w.top + r) { this.vy += WALL.k * (w.top + r - this.y) * H; if (this.vy < 0) this.vy *= -WALL.e; }
      if (this.y > w.bottom - r) { this.vy -= WALL.k * (this.y - w.bottom + r) * H; if (this.vy > 0) this.vy *= -WALL.e; }
    }
    this.x += this.vx * H;
    this.y += this.vy * H;
  }

  private clampToWalls(x: number, y: number, env: Env): [number, number] {
    const w = env.walls, r = this.r;
    if (w.right - w.left > 2 * r) x = Math.max(w.left + r, Math.min(w.right - r, x));
    if (w.bottom - w.top > 2 * r) y = Math.max(w.top + r, Math.min(w.bottom - r, y));
    return [x, y];
  }

  /**
   * The Line. She can press into it up to 28 px; a hand-off fires at ≥ 24 px held for 120 ms or an impact ≥ 900 px/s,
   * with a .35 rebound and a 1.2 s cooldown; leaving contact plucks the line.
   * force: penalty spring k 520, c 18 on the velocity; give: the carried orb yields to the pointer's stiffer spring;
   * hard: reduced motion, a plain limit.
   */
  private collide(env: Env, how: 'force' | 'give' | 'hard') {
    const hit = env.probe(this.x, this.y);
    const p = hit && hit.d > -this.r ? this.r - hit.d : 0;
    this.foot = hit;
    if (!hit || p <= 0) {
      if (this.contact) {
        this.contact = false;
        // Leaving after a hand-off impact: the rebound carries .35 of the impact speed
        if (hit && this.impact > 0 && how !== 'hard') {
          const out = this.vx * hit.nx + this.vy * hit.ny, want = LINE.e * this.impact;
          if (out < want) { this.vx += hit.nx * (want - out); this.vy += hit.ny * (want - out); }
        }
        this.impact = 0;
        if (how !== 'hard') this.onPluck(hit ? hit.s : 0, Math.min(14, 0.012 * Math.hypot(this.vx, this.vy)));
      }
      this.pressedAt = -1;
      this.depth = 0;
      return;
    }
    const vn = this.vx * hit.nx + this.vy * hit.ny;
    if (!this.contact) {
      this.contact = true;
      if (-vn >= LINE.impact) this.handoff(hit, vn, how);
    }
    let depth = p;
    if (how === 'give') {
      this.x += hit.nx * p * GIVE;
      this.y += hit.ny * p * GIVE;
      depth = p * (1 - GIVE);
    } else if (how === 'force') {
      const a = LINE.k * p - LINE.c * vn;
      this.vx += hit.nx * a * H;
      this.vy += hit.ny * a * H;
    }
    if (depth > LINE.dent) {
      this.x += hit.nx * (depth - LINE.dent);
      this.y += hit.ny * (depth - LINE.dent);
      const into = this.vx * hit.nx + this.vy * hit.ny;
      if (into < 0) { this.vx -= hit.nx * into; this.vy -= hit.ny * into; }
      depth = LINE.dent;
    }
    this.depth = depth;
    if (depth >= LINE.press) {
      if (this.pressedAt < 0) this.pressedAt = this.t;
      const held = how === 'hard' || this.t - this.pressedAt >= LINE.hold - 1e-9;
      if (held && this.handoff(hit, Math.min(vn, 0), how)) this.pressedAt = -1;
    } else this.pressedAt = -1;
  }

  private handoff(hit: LineHit, vn: number, how: 'force' | 'give' | 'hard') {
    if (this.t < this.cooldown) return false;
    this.cooldown = this.t + LINE.cooldown;
    this.onHandoff(hit.x, hit.y);
    if (how === 'hard') return true;
    // An impact dents the line on the penalty spring and rebounds at .35 when contact breaks;
    // a slow press is kicked back out so the refusal reads as a bounce
    this.impact = Math.max(-vn, 0);
    if (this.impact < LINE.impact) {
      const along = this.vx * hit.nx + this.vy * hit.ny;
      this.vx += hit.nx * (KICK - along);
      this.vy += hit.ny * (KICK - along);
    }
    if (this.mode === 'carry') this.bounceUntil = this.t + 0.28;
    return true;
  }

  /** At rest and homing: the dent is geometry only (nothing dents in the phone's cradle, which is off the paper) */
  private measure(env: Env) {
    const hit = env.probe(this.x, this.y);
    const onPaper = env.paper || this.mode === 'placed' || this.mode === 'parked';
    this.foot = hit;
    this.depth = onPaper && hit && hit.d > -this.r ? Math.max(0, Math.min(LINE.dent, this.r - hit.d)) : 0;
    if (!this.depth) this.contact = false;
  }

  /** Keeps her on her side without any of the contact's consequences: she slides along the line instead of through it */
  private slideAlong(env: Env) {
    const hit = env.probe(this.x, this.y);
    if (!hit || hit.d <= -this.r) return;
    const p = this.r - hit.d;
    if (p <= 0) return;
    this.x += hit.nx * p;
    this.y += hit.ny * p;
    const vn = this.vx * hit.nx + this.vy * hit.ny;
    if (vn < 0) { this.vx -= hit.nx * vn; this.vy -= hit.ny * vn; }
  }

  private throwVelocity(): [number, number] {
    const n = this.trail.length;
    if (n < 6) return [0, 0];
    const dt = this.trail[n - 3] - this.trail[0];
    // Held still before letting go: no throw
    if (dt < 0.016 || this.t - this.trail[n - 3] > 0.05) return [0, 0];
    let vx = (this.trail[n - 2] - this.trail[1]) / dt, vy = (this.trail[n - 1] - this.trail[2]) / dt;
    const v = Math.hypot(vx, vy);
    if (v > THROW_MAX) { vx *= THROW_MAX / v; vy *= THROW_MAX / v; }
    return [vx, vy];
  }

  /** Rolling ω = v / r about ẑ × v̂, so the graticule really rolls; it spins down over .9 s; lean ≤ 12° into the motion */
  private spin(dt: number, env: Env) {
    const carried = this.mode === 'attached' || this.mode === 'home';
    const rvx = this.vx - (carried ? env.carrierVx : 0), rvy = this.vy - (carried ? env.carrierVy : 0);
    const speed = this.mode === 'attached' ? 0 : Math.hypot(rvx, rvy);
    if (speed > STOP) {
      // Moving right turns her about +y; moving down the page (y down) about +x
      let wx = rvy / this.r, wy = rvx / this.r;
      const w = Math.hypot(wx, wy);
      if (w > ROLL_MAX) { wx *= ROLL_MAX / w; wy *= ROLL_MAX / w; }
      this.wx = wx;
      this.wy = wy;
    } else {
      const k = Math.exp(-dt / SPIN_TAU);
      this.wx *= k;
      this.wy *= k;
    }
    const a = speed ? (LEAN_MAX * Math.tanh(speed / 1200)) / speed : 0;
    const tx = rvx * a, ty = -rvy * a + SCROLL_LEAN * Math.tanh(env.scrollV / 1500);
    const k = 1 - Math.exp(-dt / LEAN_TAU);
    this.lx += (tx - this.lx) * k;
    this.ly += (ty - this.ly) * k;
  }
}

/** The runnable check for the sundial and the Line's physics (throws on the first failure) */
export function selfCheck() {
  const ok = (cond: boolean, what: string) => { if (!cond) throw new Error(`selfCheck: ${what}`); };
  const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

  // The sun: 06:00 low on the left, noon high at the top, 18:30 a third into dusk, 23:00 night
  const s6 = sunAt(360), s12 = sunAt(720), s1830 = sunAt(1110), s23 = sunAt(1380);
  ok(near(s6.az, 0) && near(s6.el, 0.18) && s6.dir[0] < -0.98 && near(s6.day, 1 / 3), '06:00: low light from the left, a third of the way out of dawn');
  ok(s12.el > 0.78 && s12.el < 0.8 && s12.dir[1] > 0.6 && s12.day === 1, 'noon: high light from the top');
  ok(near(s1830.day, 2 / 3) && s1830.dir[0] > 0.5, '18:30: a third of the way into dusk, light from the right');
  ok(s23.day === 0 && sunAt(300).day === 0, '23:00 and 05:00: night');
  ok(near(sunAt(1065, { open: 540, close: 1020 }).day, 0.5), 'a clinic closing at 17:00 is half dark at 17:45');
  ok(sunAt(120, { open: 1200, close: 360 }).day === 1, 'a clinic open overnight is lit at 02:00');

  // The dial's detents: 60° apart, the nearest one wins, indices wrap
  const step = Math.PI / 3;
  ok(nearestDetent(-step * 2 - 0.4, step, 6).index === 2 && nearestDetent(step, step, 6).index === 5, 'detent snapping');

  // The Line: vertical at x = 500, her side to the left; she rests tangent to it at r 100
  const probe = (x: number, y: number): LineHit => ({ x: 500, y, nx: -1, ny: 0, d: 500 - x, s: y });
  const env: Env = {
    smooth: true, home: { x: 399, y: 400 }, carrierVx: 0, carrierVy: 0, radius: 100, scrollV: 0, probe, paper: true,
    walls: { left: 0, right: 2000, top: -1e6, bottom: 1e6 },
  };
  const run = (b: Body, seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) { b.step(1 / 60, env); each?.(); }
  };

  // 1. A hard throw into the line hands off once, on impact, never dents past 28 px and bounces back
  let handoffs = 0, plucks = 0, deepest = 0;
  const a = new Body();
  a.reset(399, 400, 100);
  a.onHandoff = () => handoffs++;
  a.onPluck = (_s, amp) => { if (amp > 0) plucks++; };
  a.fling(1500, 0);
  run(a, 1.5, () => { deepest = Math.max(deepest, a.depth); });
  ok(handoffs === 1, `one hand-off from a 1500 px/s throw (got ${handoffs})`);
  ok(deepest <= 28 + 1e-6 && deepest > 5, `the dent stays within 28 px (deepest ${deepest.toFixed(1)})`);
  ok(a.x < 400 && plucks >= 1, 'she bounced back off the line and plucked it');

  // 2. Carried slowly into the line (the pointer 36 px past the tangent over 400 ms): the hand-off waits for 120 ms
  //    at ≥ 24 px, and the 1.2 s cooldown spaces the next one
  const press = (past: number, seconds: number) => {
    const body = new Body();
    body.reset(399, 400, 100);
    const times: number[] = [];
    let since = -1;
    body.onHandoff = () => times.push(body.time);
    body.carry(399, 400);
    let t = 0;
    run(body, seconds, () => {
      t += 1 / 60;
      body.move(399 + past * Math.min(1, t / 0.4), 400);
      if (since < 0 && body.depth >= 24) since = body.time;
    });
    return { body, times, since };
  };
  const b = press(36, 2.6);
  ok(b.times.length >= 2 && b.since > 0 && b.times[0] - b.since >= 0.12 - 1 / 120, `a slow press waits 120 ms (${b.since.toFixed(3)} → ${b.times[0]?.toFixed(3)})`);
  ok(b.times[1] - b.times[0] >= 1.2 - 1e-9, `the cooldown spaces hand-offs (${b.times.map((t) => t.toFixed(2)).join(', ')})`);

  // 3. A gentle lean on the line (< 24 px) never hands off
  const c = press(21, 2);
  ok(c.times.length === 0 && c.body.depth > 10 && c.body.depth < 24, `a gentle press dents without a hand-off (depth ${c.body.depth.toFixed(1)})`);

  // 4. The home spring brings her back from far away within the speed cap, then she rests on the anchor
  const d = new Body();
  d.reset(399, 400, 100);
  d.x = 399;
  d.y = -1600;
  d.goHome();
  let fastest = 0;
  run(d, 3, () => { fastest = Math.max(fastest, d.speed); });
  ok(fastest <= 2600 + 1e-6 && d.mode === 'attached' && near(d.y, 400, 1e-9), `home spring (max ${fastest.toFixed(0)} px/s, mode ${d.mode})`);
  ok(Math.abs(d.wx) < 0.5, 'she stops rolling once she rests');

  // 4b. Homing from beside the line she slides along it, never across (and never hands off: nobody pushed)
  const h = new Body();
  h.reset(399, 400, 100);
  h.x = 430;
  h.y = -600;
  let crossed = 0, sent = 0;
  h.onHandoff = () => sent++;
  h.goHome();
  run(h, 3, () => { crossed = Math.max(crossed, h.x - 400); });
  ok(crossed <= 1e-6 && sent === 0 && h.mode === 'attached', `homing keeps her side of the line (over by ${crossed.toFixed(2)} px)`);

  // 5. Reduced motion: a push holds a full 28 px dent, hands off at once, and she is home after 900 ms
  const e = new Body();
  e.reset(399, 400, 100);
  let still = 0;
  e.onHandoff = () => still++;
  e.push(-1, 0, false);
  const reduced = { ...env, smooth: false };
  e.step(1 / 60, reduced);
  ok(still === 1 && near(e.depth, 28, 1e-6), `reduced-motion push dents 28 px and hands off (depth ${e.depth})`);
  for (let i = 0; i < 60; i++) e.step(1 / 60, reduced);
  ok(e.mode === 'attached' && near(e.x, 399), 'and snaps home after 900 ms');
  return 'physics and sun checks passed';
}
