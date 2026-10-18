import * as THREE from 'three';
import { OrbInput } from './input';
import { scheduler } from '../motion/scheduler';
import { motion } from '../motion/prefs';
import { scroll } from '../motion/scroll';

// ponytail: ANGLE's Direct3D 11 backend (Chrome and Edge on Windows) hands back its HLSL compiler's constant-folding
// notes (X4122, "cannot be represented accurately in double precision") as the link log of three's own PMREM shader,
// and three prints any link log as a warning. A log made only of those notes is dropped; every other message passes.
const HLSL_NOTE = /^\(\d+,\d+-\d+\): warning X4122: .*$/;
THREE.setConsoleFunction((type: 'log' | 'warn' | 'error', message: string, ...params: unknown[]) => {
  const log = params[0];
  if (type === 'warn' && message === 'THREE.WebGLProgram: Program Info Log:' && params.length === 1 && typeof log === 'string'
    && log.trim().split('\n').every((line) => HLSL_NOTE.test(line.trim()))) return;
  console[type](message, ...params);
});

export type OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
/** The colour of her current line: warm is the default; the other three have their own weights */
export type Tone = 'warm' | 'bright' | 'soft' | 'calm';

/** The orb root's box in canvas device pixels, GL origin bottom-left */
export interface StageView { x: number; y: number; w: number; h: number }

/** What a scene receives every frame */
export interface OrbFrame {
  /** Seconds since start */
  t: number;
  /** Seconds since the last frame, clamped */
  dt: number;
  /** State weights, blended with τ 90 ms */
  listen: number;
  speak: number;
  connect: number;
  think: number;
  /** Voice level 0–1 (her voice while speaking, the visitor's mic while listening): rises in ~40 ms, falls in ~200 ms */
  amp: number;
  /** Tone weights, blended with τ 250 ms (all 0 = warm) */
  bright: number;
  soft: number;
  calm: number;
  /** Cursor relative to the orb box, -1..1 at its edges, smoothed */
  pointer: THREE.Vector2;
  /** Pose from direct manipulation (radians): yaw turns, pitch nods and springs back */
  yaw: number;
  pitch: number;
  /** 0–1: the visitor is holding the orb */
  grab: number;
  /** 0–1: the cursor is over the orb */
  hover: number;
  /** 0–1: how fast it is spinning (1 ≈ a hard throw) */
  spin: number;
  /** Where the root is on the canvas this frame */
  view: StageView;
  scrollY: number;
  /** px/s */
  scrollV: number;
}

export interface OrbScene {
  /** True when the canvas composites over the page; false when it paints the page colour itself */
  readonly alpha: boolean;
  /** True when the scene paints the whole canvas and positions the .orb root itself (no scissor) */
  readonly fullFrame?: boolean;
  setup(renderer: THREE.WebGLRenderer): void;
  /** The canvas size in CSS px */
  resize(width: number, height: number, dpr: number): void;
  update(frame: OrbFrame): void;
  render(renderer: THREE.WebGLRenderer): void;
  /** Called once if frames stay slower than 20 ms */
  degrade(): void;
  dispose(): void;
}

const COARSE = matchMedia('(pointer: coarse)').matches;
const DPR_CAP = COARSE ? 1.25 : 1.5;
const STATUS: Record<OrbState, string> = {
  idle: 'Amariya is ready',
  connecting: 'Amariya is connecting',
  listening: 'Amariya is listening',
  thinking: 'Amariya is thinking',
  speaking: 'Amariya is speaking',
};
const LABEL: Record<OrbState, string> = {
  idle: 'Amariya. Press Enter to talk. Drag or use the arrow keys to turn her.',
  connecting: 'Amariya is connecting. Press Enter to cancel.',
  listening: 'Amariya is listening. Press Enter to end the conversation.',
  thinking: 'Amariya is thinking. Press Enter to end the conversation.',
  speaking: 'Amariya is speaking. Press Enter to end the conversation.',
};
const TONES = ['bright', 'soft', 'calm'] as const;

export class OrbStage {
  state: OrbState = 'idle';
  tone: Tone = 'warm';
  readonly input: OrbInput;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly frame: OrbFrame = {
    t: 0, dt: 0, listen: 0, speak: 0, connect: 0, think: 0, amp: 0, bright: 0, soft: 0, calm: 0,
    pointer: new THREE.Vector2(), yaw: 0, pitch: 0, grab: 0, hover: 0, spin: 0,
    view: { x: 0, y: 0, w: 1, h: 1 }, scrollY: 0, scrollV: 0,
  };
  /** Last view drawn, so a fixed canvas can clear where the orb was */
  private readonly prev: StageView = { x: 0, y: 0, w: 0, h: 0 };
  private readonly pointerTarget = new THREE.Vector2();
  private ampSource: (t: number) => number = () => 0;
  private removeJob: (() => void) | null = null;
  private stillRaf = 0;
  private last = 0;
  private visible = true;
  private lost = false;
  private live = false;
  private slowFrames = 0;
  private sampled = 0;
  private degraded = false;
  private width = 1;
  private height = 1;
  private dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
  private readonly fixed: boolean;
  private readonly ro: ResizeObserver;
  private readonly io: IntersectionObserver;
  private readonly offMotion: () => void;

  constructor(private readonly root: HTMLElement, private readonly canvas: HTMLCanvasElement, private readonly scene: OrbScene, mode: 'inline' | 'fixed' = 'inline') {
    this.fixed = mode === 'fixed';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: scene.alpha, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.autoClear = !this.fixed || !!scene.fullFrame;
    if (scene.alpha) this.renderer.setClearColor(0x000000, 0);
    scene.setup(this.renderer);
    this.input = new OrbInput(root);
    // A paused or reduced-motion orb still turns under the hand: redraw one frame per input
    this.input.onChange = this.requestStill;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    // A full-frame scene is the page background, so it never stops for the root leaving the screen
    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting || !!scene.fullFrame;
      if (!this.visible) this.clear();
      this.kick();
    }, { rootMargin: '120px' });
    this.io.observe(root);
    document.addEventListener('visibilitychange', this.kick);
    addEventListener('pointermove', this.onPointer, { passive: true });
    // A fixed canvas follows the root on scroll even when nothing animates
    if (this.fixed) addEventListener('scroll', this.onScroll, { passive: true });
    this.offMotion = motion.on(this.kick);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
    this.kick();
  }

  setState(state: OrbState) {
    this.state = state;
    this.root.dataset.state = state;
    this.root.setAttribute('aria-label', LABEL[state]);
    const status = this.root.querySelector('[data-orb-status]');
    if (status) status.textContent = STATUS[state];
    if (!this.animating()) this.still();
  }

  setTone(tone: Tone) {
    this.tone = tone;
    this.root.dataset.tone = tone;
    if (!this.animating()) this.still();
  }

  /** Where the voice level comes from: the agent's audio (or the visitor's mic) in production, a generator in the preview */
  setAmpSource(source: (t: number) => number) { this.ampSource = source; }

  /** The page's Pause motion control (shared with every other animation) */
  setPaused(paused: boolean) { motion.setPaused(paused); }
  get isPaused() { return motion.paused; }

  /** The current pose, for tests and for scenes outside the stage */
  get pose() { return { yaw: this.input.yaw, pitch: this.input.pitch, speed: this.input.speed, dragging: this.input.dragging }; }

  /** Reduced motion or paused: one settled frame, so state changes and the pose still show */
  still() {
    if (!this.visible || document.hidden || this.lost) return;
    const f = this.frame;
    f.listen = this.state === 'listening' ? 1 : 0;
    f.speak = this.state === 'speaking' ? 1 : 0;
    f.connect = this.state === 'connecting' ? 1 : 0;
    f.think = this.state === 'thinking' ? 1 : 0;
    for (const k of TONES) f[k] = this.tone === k ? 1 : 0;
    f.amp = this.state === 'speaking' ? 0.45 : 0;
    f.dt = 0;
    f.yaw = this.input.yaw;
    f.pitch = this.input.pitch;
    f.grab = this.input.dragging || this.input.carrying ? 1 : 0;
    f.hover = this.input.hovering ? 1 : 0;
    f.spin = 0;
    f.scrollY = scroll.y;
    f.scrollV = 0;
    this.measure();
    this.scene.update(f);
    this.draw();
  }

  dispose() {
    this.removeJob?.();
    cancelAnimationFrame(this.stillRaf);
    this.ro.disconnect();
    this.io.disconnect();
    this.offMotion();
    document.removeEventListener('visibilitychange', this.kick);
    removeEventListener('pointermove', this.onPointer);
    removeEventListener('scroll', this.onScroll);
    this.input.dispose();
    this.scene.dispose();
    this.renderer.dispose();
  }

  private animating() { return this.visible && !document.hidden && !this.lost && motion.allowed; }

  private kick = () => {
    this.input.direct = !this.animating();
    if (this.animating()) {
      if (!this.removeJob) { this.last = 0; this.removeJob = scheduler.add(this.loop, 100); }
    } else {
      this.removeJob?.();
      this.removeJob = null;
      this.still();
    }
  };

  private requestStill = () => {
    if (!this.animating() && !this.stillRaf) this.stillRaf = requestAnimationFrame(() => { this.stillRaf = 0; this.still(); });
  };

  private onScroll = () => this.requestStill();

  private loop = (now: number) => {
    const elapsed = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    // Scene effects use a clamped dt; the hand physics gets the real elapsed time
    this.input.step(elapsed);
    const dt = Math.min(elapsed, 0.1);
    this.step(dt);
    this.draw();
    this.watch(dt);
  };

  private step(dt: number) {
    const f = this.frame;
    f.t += dt;
    f.dt = dt;
    const k = 1 - Math.exp(-dt / 0.09);
    f.listen += ((this.state === 'listening' ? 1 : 0) - f.listen) * k;
    f.speak += ((this.state === 'speaking' ? 1 : 0) - f.speak) * k;
    f.connect += ((this.state === 'connecting' ? 1 : 0) - f.connect) * k;
    f.think += ((this.state === 'thinking' ? 1 : 0) - f.think) * k;
    const kt = 1 - Math.exp(-dt / 0.25);
    for (const key of TONES) f[key] += ((this.tone === key ? 1 : 0) - f[key]) * kt;
    const voiced = this.state === 'speaking' || this.state === 'listening';
    const target = voiced ? Math.min(1, Math.max(0, this.ampSource(f.t) || 0)) : 0;
    f.amp += (target - f.amp) * (1 - Math.exp(-dt / (target > f.amp ? 0.04 : 0.2)));
    f.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt / 0.25));
    f.yaw = this.input.yaw;
    f.pitch = this.input.pitch;
    const kq = 1 - Math.exp(-dt / 0.12);
    f.grab += ((this.input.dragging || this.input.carrying ? 1 : 0) - f.grab) * kq;
    f.hover += ((this.input.hovering ? 1 : 0) - f.hover) * kq;
    f.spin += (Math.min(1, this.input.speed / 8) - f.spin) * kq;
    f.scrollY = scroll.y;
    f.scrollV = scroll.v;
    this.measure();
    this.scene.update(f);
  }

  /** The root's box on the canvas: the only layout read per frame */
  private measure() {
    const v = this.frame.view;
    if (!this.fixed) {
      v.x = 0; v.y = 0; v.w = Math.round(this.width * this.dpr); v.h = Math.round(this.height * this.dpr);
      return;
    }
    // ponytail: a full-frame scene draws the whole canvas and places the root itself, so its box is not read: that read
    // came after the frame's style writes and forced a style and layout pass of the page (~25 ms a frame on /hotels)
    if (this.scene.fullFrame) {
      v.x = 0; v.y = 0; v.w = Math.round(this.width * this.dpr); v.h = Math.round(this.height * this.dpr);
      return;
    }
    const r = this.root.getBoundingClientRect();
    v.x = Math.round(r.left * this.dpr);
    v.y = Math.round((this.height - r.bottom) * this.dpr);
    v.w = Math.max(1, Math.round(r.width * this.dpr));
    v.h = Math.max(1, Math.round(r.height * this.dpr));
  }

  private draw() {
    const gl = this.renderer, v = this.frame.view, p = this.prev, d = this.dpr;
    if (this.fixed && !this.scene.fullFrame) {
      // Clear where the orb was and where it is now, then draw inside its box only
      const x0 = Math.min(v.x, p.w ? p.x : v.x), y0 = Math.min(v.y, p.w ? p.y : v.y);
      const x1 = Math.max(v.x + v.w, p.x + p.w), y1 = Math.max(v.y + v.h, p.y + p.h);
      gl.setScissorTest(true);
      gl.setScissor(x0 / d, y0 / d, (x1 - x0) / d, (y1 - y0) / d);
      gl.setViewport(x0 / d, y0 / d, (x1 - x0) / d, (y1 - y0) / d);
      gl.clear();
      gl.setViewport(v.x / d, v.y / d, v.w / d, v.h / d);
      gl.setScissor(v.x / d, v.y / d, v.w / d, v.h / d);
      this.scene.render(gl);
      gl.setScissorTest(false);
      Object.assign(p, v);
    } else {
      this.scene.render(gl);
    }
    if (!this.live) {
      this.live = true;
      requestAnimationFrame(() => this.root.classList.add('is-live'));
    }
  }

  /** The root left the screen: wipe its last frame from a fixed canvas */
  private clear() {
    if (!this.fixed || this.scene.fullFrame || this.lost) return;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.clear();
    Object.assign(this.prev, { x: 0, y: 0, w: 0, h: 0 });
  }

  /** Slow device: after a warm-up, if frames average over 20 ms, drop to 1x pixels and lighter effects once */
  private watch(dt: number) {
    if (this.degraded || this.frame.t < 1.5) return;
    this.sampled++;
    if (dt > 0.02) this.slowFrames++;
    if (this.sampled < 90) return;
    if (this.slowFrames / this.sampled > 0.6) {
      this.degraded = true;
      this.dpr = 1;
      this.renderer.setPixelRatio(1);
      this.scene.degrade();
      this.resize();
    }
    this.sampled = this.slowFrames = 0;
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    Object.assign(this.prev, { x: 0, y: 0, w: 0, h: 0 });
    this.scene.resize(w, h, this.dpr);
    if (!this.animating()) this.still();
  }

  private onPointer = (e: PointerEvent) => {
    const r = this.root.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    this.pointerTarget.set(Math.max(-1.5, Math.min(1.5, x)), Math.max(-1.5, Math.min(1.5, y)));
  };

  /** The still image comes back and stays: the page keeps working without the GPU */
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.root.classList.remove('is-live');
    this.live = false;
    this.kick();
  };

}
