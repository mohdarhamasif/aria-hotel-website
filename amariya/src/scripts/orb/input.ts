// Direct manipulation of the orb: grab and spin with inertia (mouse, pen, touch), keyboard rotation.
// Vertical touch gestures still scroll the page (the root has touch-action: pan-y, so the browser cancels the pointer).
// Gestures beyond turning are reported as bubbling events on the root:
//   orb:tap (press < 250 ms and < 6 px, or Enter/Space), orb:longpress {clientX, clientY} (held 350 ms within 6 px:
//   the orb is lifted and stops turning; a root with data-hold="tilt" keeps turning instead, and a vertical touch then
//   tilts it rather than scrolling), orb:carrymove {clientX, clientY, dx, dy}, orb:drop {clientX, clientY},
//   orb:release (every pointer up), orb:key {key, shiftKey} (keys the orb itself does not use).

/** Radians of spin per orb-radius of drag */
const DRAG_GAIN = 1.6;
/** Pitch (nodding) is limited and springs back; yaw (turning) is free */
const PITCH_LIMIT = 0.55;
/** Seconds for the spin velocity to fall to 1/e after release */
const INERTIA = 1.1;
const SPRING_K = 16;
/** Keyboard: each press adds this much velocity (rad/s), holding keeps it topped up */
const KEY_IMPULSE = 2.4;
const KEY_STEP = 0.12;
const TAP_MS = 250;
const HOLD_MS = 350;
const SLOP = 6;
/** Keys passed on to the page as orb:key */
const PASS_KEYS = new Set(['End', 'PageUp', 'PageDown', 'Escape', 'j', 'k', 'l', 'p', '[', ']']);

export class OrbInput {
  yaw = 0;
  pitch = 0;
  dragging = false;
  /** Lifted by a long press: the pointer carries the orb instead of turning it */
  carrying = false;
  hovering = false;
  /** True when no animation loop runs (paused or reduced motion): input applies instantly, with no inertia */
  direct = false;
  /** Called after any input that changes the pose, so a paused orb can redraw */
  onChange: () => void = () => {};
  private vy = 0;
  private vp = 0;
  private lastX = 0;
  private lastY = 0;
  private lastT = 0;
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private travel = 0;
  private holdTimer = 0;
  /** The long press was confirmed a frame after its timer, once moves already made had been delivered */
  private rechecked = false;
  /** A long press on a root with data-hold="tilt" (no carrying there): the grab goes on, and vertical moves tilt */
  private tilting = false;
  private pointerId = -1;
  /** Detent spring on yaw, cancelled by the next drag */
  private snap: { target: number; k: number; c: number } | null = null;

  constructor(private readonly root: HTMLElement) {
    root.addEventListener('pointerdown', this.onDown);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onUp);
    root.addEventListener('lostpointercapture', this.onUp);
    root.addEventListener('pointerenter', this.onEnter);
    root.addEventListener('pointerleave', this.onLeave);
    root.addEventListener('keydown', this.onKey);
    root.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  /** Angular speed, rad/s */
  get speed() { return Math.hypot(this.vy, this.vp); }

  setPose(yaw: number, pitch: number) {
    this.yaw = yaw;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    this.vy = this.vp = 0;
    this.snap = null;
    this.onChange();
  }

  /** Adds spin velocity (rad/s), as a flick would */
  impulse(vy: number) {
    if (this.direct) return;
    this.vy = Math.max(-10, Math.min(10, this.vy + vy));
  }

  /** Springs the yaw to a detent (k stiffness, c damping); the next drag cancels it */
  snapYawTo(target: number, k = 90, c = 14) {
    if (this.direct) { this.yaw = target; this.vy = 0; this.onChange(); return; }
    this.snap = { target, k, c };
  }

  /**
   * Advance inertia and the pitch spring over real elapsed seconds, in fixed sub-steps,
   * so a slow frame rate changes nothing about how the orb moves. Not called while the orb is still.
   */
  step(elapsed: number) {
    if (this.dragging) return;
    const H = 1 / 120;
    let left = Math.min(elapsed, 2);
    while (left > 0) {
      const dt = Math.min(H, left);
      left -= dt;
      if (this.snap) {
        this.vy += (-this.snap.k * (this.yaw - this.snap.target) - this.snap.c * this.vy) * dt;
      } else {
        this.vy *= Math.exp(-dt / INERTIA);
      }
      this.yaw += this.vy * dt;
      // Critically damped spring brings the pitch back to level
      const a = -SPRING_K * this.pitch - 2 * Math.sqrt(SPRING_K) * this.vp;
      this.vp += a * dt;
      this.pitch += this.vp * dt;
    }
    if (this.snap && Math.abs(this.yaw - this.snap.target) < 1e-4 && Math.abs(this.vy) < 1e-3) { this.yaw = this.snap.target; this.snap = null; }
    if (Math.abs(this.vy) < 1e-3) this.vy = 0;
    if (Math.abs(this.pitch) < 1e-4 && Math.abs(this.vp) < 1e-3) { this.pitch = 0; this.vp = 0; }
  }

  dispose() {
    clearTimeout(this.holdTimer);
    this.root.removeEventListener('pointerdown', this.onDown);
    this.root.removeEventListener('pointermove', this.onMove);
    this.root.removeEventListener('pointerup', this.onUp);
    this.root.removeEventListener('pointercancel', this.onUp);
    this.root.removeEventListener('lostpointercapture', this.onUp);
    this.root.removeEventListener('pointerenter', this.onEnter);
    this.root.removeEventListener('pointerleave', this.onLeave);
    this.root.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('touchmove', this.onTouchMove);
  }

  /** False when a listener called preventDefault() */
  private emit(name: string, detail?: object) {
    return this.root.dispatchEvent(new CustomEvent(name, { bubbles: true, cancelable: true, detail }));
  }

  private radius() { return Math.max(1, this.root.clientWidth / 2); }

  private onEnter = () => { this.hovering = true; };
  private onLeave = () => { this.hovering = false; };

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.dragging || this.carrying) return;
    this.dragging = true;
    this.snap = null;
    this.pointerId = e.pointerId;
    try { this.root.setPointerCapture(e.pointerId); } catch { /* an inactive pointer id: the drag still works while over the orb */ }
    this.root.dataset.grab = 'true';
    this.lastX = this.downX = e.clientX;
    this.lastY = this.downY = e.clientY;
    this.lastT = this.downT = e.timeStamp;
    this.travel = 0;
    this.rechecked = false;
    this.vy = this.vp = 0;
    clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(this.lift, HOLD_MS);
    e.preventDefault();
  };

  /** Long press: the orb is lifted; it stops turning and follows the pointer (or, with data-hold="tilt", keeps turning) */
  private lift = () => {
    if (!this.dragging || this.travel >= SLOP || this.tilting) return;
    // Pointer moves are delivered with the next frame: confirm the stillness after it, so a drag that began while a
    // long frame was rendering (a slow device) is never taken for a long press
    if (!this.rechecked) {
      this.rechecked = true;
      requestAnimationFrame(() => this.lift());
      return;
    }
    if (this.root.dataset.hold === 'tilt') {
      this.tilting = true;
      this.root.style.touchAction = 'none';
      this.emit('orb:longpress', { clientX: this.lastX, clientY: this.lastY });
      return;
    }
    this.dragging = false;
    this.carrying = true;
    this.vy = this.vp = 0;
    delete this.root.dataset.grab;
    this.root.dataset.carry = 'true';
    this.root.style.touchAction = 'none';
    this.emit('orb:longpress', { clientX: this.lastX, clientY: this.lastY });
    this.onChange();
  };

  private onTouchMove = (e: TouchEvent) => {
    if ((this.carrying || this.tilting) && e.cancelable) e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.travel = Math.max(this.travel, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
    if (this.carrying) {
      this.emit('orb:carrymove', { clientX: e.clientX, clientY: e.clientY, dx: e.clientX - this.lastX, dy: e.clientY - this.lastY });
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      return;
    }
    if (!this.dragging) return;
    if (this.travel >= SLOP) clearTimeout(this.holdTimer);
    const r = this.radius();
    const dyaw = ((e.clientX - this.lastX) / r) * DRAG_GAIN;
    const dpitch = ((e.clientY - this.lastY) / r) * DRAG_GAIN * 0.75;
    const dt = Math.max(1e-3, (e.timeStamp - this.lastT) / 1000);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastT = e.timeStamp;
    this.yaw += dyaw;
    // Rubber band past the pitch limit
    const over = Math.max(0, Math.abs(this.pitch) - PITCH_LIMIT);
    this.pitch += dpitch / (1 + over * 6);
    // Velocity from this move, smoothed so release feels like a throw, not a jitter
    const k = 0.5;
    this.vy += ((dyaw / dt) - this.vy) * k;
    this.vp += ((dpitch / dt) - this.vp) * k;
    this.onChange();
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId && e.type !== 'lostpointercapture') return;
    if (!this.dragging && !this.carrying) return;
    clearTimeout(this.holdTimer);
    this.pointerId = -1;
    if (this.carrying) {
      this.carrying = false;
      delete this.root.dataset.carry;
      this.root.style.touchAction = '';
      if (e.type === 'pointerup') this.emit('orb:drop', { clientX: e.clientX, clientY: e.clientY });
      this.emit('orb:release');
      this.onChange();
      return;
    }
    this.dragging = false;
    if (this.tilting) { this.tilting = false; this.root.style.touchAction = ''; }
    delete this.root.dataset.grab;
    // A throw older than ~120 ms has stopped: no inertia from a held-then-released pointer
    if (e.timeStamp - this.lastT > 120 || this.direct) { this.vy = 0; this.vp = 0; }
    this.vy = Math.max(-10, Math.min(10, this.vy));
    this.vp = Math.max(-6, Math.min(6, this.vp));
    const tap = e.type === 'pointerup' && e.timeStamp - this.downT < TAP_MS && this.travel < SLOP;
    this.emit('orb:release');
    if (tap) this.emit('orb:tap');
    this.onChange();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.repeat) return;
      e.preventDefault();
      this.emit('orb:tap');
      return;
    }
    const dir = e.shiftKey ? undefined : { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Home') {
      this.yaw = 0; this.pitch = 0; this.vy = 0; this.vp = 0;
      this.snap = null;
    } else if (dir) {
      this.snap = null;
      this.yaw += dir[0] * KEY_STEP;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + dir[1] * KEY_STEP));
      if (!this.direct) {
        this.vy = dir[0] ? dir[0] * KEY_IMPULSE : this.vy;
      }
    } else {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // A listener that handles the key calls preventDefault() on orb:key, which keeps the key from the page
      if ((PASS_KEYS.has(key) || (e.shiftKey && e.key.startsWith('Arrow'))) && !this.emit('orb:key', { key: e.key, shiftKey: e.shiftKey })) e.preventDefault();
      return;
    }
    e.preventDefault();
    this.onChange();
  };
}
