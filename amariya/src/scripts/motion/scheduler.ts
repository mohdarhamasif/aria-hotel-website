// One frame loop for the whole page, on requestAnimationFrame. Jobs run in order:
// 0 Lenis, 10 directors/physics, 50 default, 90 DOM writes, 100 the orb stage. Read before you write inside a job.
// ponytail: the loop was gsap.ticker; nothing on the pages tweens with GSAP, so the platform's own frame callback does
// the same job without 27 KB (gzipped) of GSAP on every page's first load. Bring gsap back with its first tween.

/** now: performance.now() in ms; dt: seconds since the last frame, clamped to .05 */
type Job = (now: number, dt: number) => void;

const jobs: { fn: Job; order: number }[] = [];
let running = false;
let last = 0;
let raf = 0;

function tick() {
  raf = requestAnimationFrame(tick);
  const now = performance.now();
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  // A copy, so a job may remove itself (or add another) mid-frame
  for (const job of jobs.slice()) {
    try { job.fn(now, dt); } catch (err) { console.error(err); }
  }
}

export const scheduler = {
  /** Adds a job (and starts the loop); returns its remover */
  add(fn: Job, order = 50): () => void {
    const job = { fn, order };
    const i = jobs.findIndex((j) => j.order > order);
    jobs.splice(i < 0 ? jobs.length : i, 0, job);
    scheduler.start();
    return () => {
      const k = jobs.indexOf(job);
      if (k >= 0) jobs.splice(k, 1);
    };
  },
  start() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  },
  stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  },
  get running() { return running; },
};
