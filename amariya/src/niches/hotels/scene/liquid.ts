// The champagne in the gimballed glass, in the glass's own units (R = 1): the level surface and its slosh,
// the swirl and its vortex, the fill and the bubble rate. Pure maths, sub-stepped at 120 Hz over the real frame time.
// No three.js and no DOM, so it runs (and is checked) anywhere.

const H = 1 / 120;
/** Surface slosh: a damped oscillator, ωn 6.9 rad/s (≈ 1.1 Hz), ζ .14, capped at ±.42 rad */
const WN = 6.9;
const ZETA = 0.14;
const TILT_CAP = 0.42;
/**
 * How hard the glass's angular acceleration pushes the surface: tuned so a hard throw (0 → 9 rad/s) tilts it about
 * .25 rad and it sloshes 4–5 times, settling in ≈ 3 s. The literal −.02·dω/dt left a 1° ripple nobody could see.
 */
const KICK = 0.19;
/** The liquid catches the glass's turn with τ .42 s and keeps turning after it stops, decaying with τ 1.8 s */
const SPIN_UP = 0.42;
const SPIN_DOWN = 1.8;
const IDLE_FILL = 0.56;

export interface LiquidDrive {
  /** Seconds since the last step (0 for a still frame) */
  dt: number;
  /** Seconds since start, for the breathing */
  t: number;
  /** The glass's turn and nod, rad/s */
  yawRate: number;
  pitchRate: number;
  /** The lantern's sideways acceleration on screen, px/s² */
  ax: number;
  /** Page scroll velocity, px/s (a glass carried upstairs) */
  scrollV: number;
  /** The cursor's circulation around the glass, rad/s */
  circulation: number;
  listen: number;
  speak: number;
  connect: number;
  think: number;
  amp: number;
  bright: number;
  soft: number;
  calm: number;
  /** 0–1 through the first pour (1 = poured) */
  intro: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** Height of the surface above the centre for a volume fraction f of a sphere of radius r (Newton on a²(3r − a) = 4f·r³) */
export function fillHeight(f: number, r = 1): number {
  const v = clamp(f, 0.001, 0.999);
  let a = 2 * r * v;
  for (let i = 0; i < 8; i++) a -= (a * a * (3 * r - a) - 4 * v * r ** 3) / (3 * a * (2 * r - a));
  return a - r;
}

export class Liquid {
  /** Surface tilt about world x (nodding) and z (sideways), rad */
  tiltX = 0;
  tiltZ = 0;
  /** Swirl, rad/s, and the angle it has turned through */
  spin = 0;
  spinAngle = 0;
  /** Volume fraction */
  fill = IDLE_FILL;
  /** Bubbles per second right now (for tests and the emitter) */
  rate = 24;
  private vX = 0;
  private vZ = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private pour = -1;
  private debt = 0;

  /** Vortex depth below the surface plane at the centre, in R */
  get vortex() { return Math.min(0.16, 0.022 * this.spin * this.spin); }
  /** The surface plane's height above the centre, for a liquid sphere of radius r */
  level(r = 0.96) { return fillHeight(this.fill, r); }

  /** Advance over d.dt seconds; returns how many bubbles to release this frame */
  step(d: LiquidDrive): number {
    if (d.dt <= 0) return 0;
    // Angular acceleration of the glass over this frame (−KICK·dω/dt forces the slosh); a scroll is a nod of the glass
    const pitch = d.pitchRate + clamp(-d.scrollV * 0.0006, -0.6, 0.6);
    const aYaw = (d.yawRate - this.lastYaw) / d.dt;
    const aPitch = (pitch - this.lastPitch) / d.dt;
    this.lastYaw = d.yawRate;
    this.lastPitch = pitch;
    // Listening holds the surface mirror-still: the forcing fades and the damping rises
    const hush = 1 - 0.85 * d.listen;
    const zeta = ZETA + 0.8 * d.listen;
    const fX = clamp(-KICK * aPitch, -60, 60) * hush;
    const fZ = clamp(-KICK * aYaw - 0.0016 * d.ax, -60, 60) * hush;
    const circ = clamp(0.15 * d.circulation, -1.6, 1.6);
    const target = d.yawRate + circ + 1.4 * d.think;
    const breathe = IDLE_FILL + 0.012 * Math.sin(2 * Math.PI * 0.15 * d.t);

    if (d.connect > 0.5 && this.pour < 0) this.pour = 0;
    if (d.connect <= 0.5) this.pour = -1;

    let left = Math.min(d.dt, 0.25);
    while (left > 1e-6) {
      const h = Math.min(H, left);
      left -= h;
      this.vX += (-WN * WN * this.tiltX - 2 * zeta * WN * this.vX + fX) * h;
      this.vZ += (-WN * WN * this.tiltZ - 2 * zeta * WN * this.vZ + fZ) * h;
      this.tiltX += this.vX * h;
      this.tiltZ += this.vZ * h;
      if (Math.abs(this.tiltX) > TILT_CAP) { this.tiltX = Math.sign(this.tiltX) * TILT_CAP; this.vX = 0; }
      if (Math.abs(this.tiltZ) > TILT_CAP) { this.tiltZ = Math.sign(this.tiltZ) * TILT_CAP; this.vZ = 0; }
      const catching = Math.abs(target) >= Math.abs(this.spin) && target * this.spin >= 0;
      this.spin += (target - this.spin) * (1 - Math.exp(-h / (catching ? SPIN_UP : SPIN_DOWN)));
      this.spinAngle += this.spin * h;
      if (this.pour >= 0) {
        // Connecting is the pour: 40 % → 58 % over 1.2 s
        this.pour += h;
        this.fill = 0.4 + 0.18 * easeOut(Math.min(1, this.pour / 1.2));
      } else {
        this.fill += (breathe - this.fill) * (1 - Math.exp(-h / 0.6));
      }
    }
    if (d.intro < 1) this.fill = Math.min(this.fill, IDLE_FILL * easeOut(d.intro));

    // Perlage: 24/s at rest, 3/s while she listens, 24 + 300·amp while she speaks, a 30/s bead chain while connecting,
    // and every state fizzes with the shake (200/s per rad/s of turn)
    const w = Math.hypot(d.yawRate, d.pitchRate);
    const rest = Math.max(0, 1 - d.listen - d.speak - d.connect);
    const tone = 1 + 0.4 * d.bright - 0.15 * d.soft - 0.05 * d.calm;
    this.rate = (24 * rest + 3 * d.listen + (24 + 300 * d.amp) * d.speak + 30 * d.connect) * tone + 200 * w;
    this.debt += this.rate * d.dt;
    const n = Math.floor(this.debt);
    this.debt -= n;
    return n;
  }

  /** Reduced motion or Pause: a level, unmoving surface at the state's fill */
  settle(connect: number) {
    this.tiltX = this.tiltZ = this.vX = this.vZ = 0;
    this.spin = 0;
    this.pour = -1;
    this.lastYaw = this.lastPitch = 0;
    this.fill = connect > 0.5 ? 0.58 : IDLE_FILL;
  }
}
