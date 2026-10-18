// The live string: the lane's hairline (P8's path[data-string]) from under the pearl to the dock.
// Straight between calls; during a call a rose-gold string displaced by up to three standing modes,
// y(x, t) = Σ A_n sin(nπx/L) sin(2π·3n·t + φ_n), each amplitude rising in 40 ms and decaying with τ 180 ms.

const SEGMENTS = 48;
/** Mode n vibrates at 3n Hz */
const HZ = 3;
const PHASES = [0, 1.9, 3.7];
const ATTACK = 0.04, DECAY = 0.18;

const f1 = (n: number) => n.toFixed(1);

export interface LiveString {
  readonly svg: SVGSVGElement | null;
  /**
   * x, y0 → y1: the string in client px (vertical); inv: client → svg user units; live: a call is on and motion is
   * allowed; targets: the three mode amplitudes in px.
   */
  update(dt: number, t: number, x: number, y0: number, y1: number, inv: DOMMatrix, live: boolean, targets: readonly number[]): void;
  dispose(): void;
}

export function createString(): LiveString {
  const path = document.querySelector<SVGPathElement>('path[data-string]');
  const svg = path?.ownerSVGElement ?? null;
  if (!path || !svg) return { svg: null, update() {}, dispose() {} };
  const original = path.getAttribute('d');
  const amps = [0, 0, 0];
  let drawn = '';
  let lit = false;

  return {
    svg,
    update(dt, t, x, y0, y1, m, live, targets) {
      let moving = false;
      for (let n = 0; n < 3; n++) {
        const goal = live ? targets[n] ?? 0 : 0;
        amps[n] += (goal - amps[n]) * (dt > 0 ? 1 - Math.exp(-dt / (goal > amps[n] ? ATTACK : DECAY)) : 1);
        if (amps[n] < 0.02) amps[n] = 0;
        if (amps[n]) moving = true;
      }
      const len = y1 - y0;
      let d = '';
      if (len > 4) {
        const pt = (px: number, py: number) => `${f1(m.a * px + m.c * py + m.e)} ${f1(m.b * px + m.d * py + m.f)}`;
        if (!moving) {
          d = `M${pt(x, y0)}L${pt(x, y1)}`;
        } else {
          for (let i = 0; i <= SEGMENTS; i++) {
            const s = i / SEGMENTS;
            let off = 0;
            for (let n = 0; n < 3; n++) if (amps[n]) off += amps[n] * Math.sin((n + 1) * Math.PI * s) * Math.sin(2 * Math.PI * HZ * (n + 1) * t + PHASES[n]);
            d += `${i ? 'L' : 'M'}${pt(x + off, y0 + s * len)}`;
          }
        }
      }
      if (d !== drawn) path.setAttribute('d', (drawn = d));
      // Rose-gold for the whole call (and while the last vibration dies away)
      const on = live || moving;
      if (on !== lit) {
        lit = on;
        path.toggleAttribute('data-live', on);
        path.style.stroke = on ? 'var(--color-string)' : '';
      }
    },
    dispose() {
      path.removeAttribute('data-live');
      path.style.stroke = '';
      if (original === null) path.removeAttribute('d');
      else path.setAttribute('d', original);
    },
  };
}
