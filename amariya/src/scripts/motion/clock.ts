// The visitor's own time, 12- or 24-hour as their device prefers, kept up minute by minute (ported from experience.js).

export type Daypart = 'morning' | 'afternoon' | 'evening';
export interface ClockReading {
  h: number;
  m: number;
  /** Minutes since midnight */
  minutes: number;
  hh: string;
  mm: string;
  twelveHour: boolean;
  /** '1:04 am' or '13:04' */
  line: string;
  /** 21:00–05:59 */
  night: boolean;
  daypart: Daypart;
}

const twelveHour = (new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || 'h12').startsWith('h1');

/** 'H:MM am' or 'HH:MM' for minutes since midnight (wraps past 24:00) */
export function fmtHM(minutes: number, twelve = twelveHour): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  return twelve ? `${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}` : `${String(h).padStart(2, '0')}:${mm}`;
}

function read(d = new Date()): ClockReading {
  const h = d.getHours(), m = d.getMinutes();
  return {
    h, m,
    minutes: h * 60 + m,
    hh: twelveHour ? String(h % 12 || 12) : String(h).padStart(2, '0'),
    mm: String(m).padStart(2, '0'),
    twelveHour,
    line: fmtHM(h * 60 + m),
    night: h >= 21 || h < 6,
    daypart: h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening',
  };
}

const subscribers = new Set<(now: ClockReading) => void>();
let timer = 0;
const tick = () => {
  const now = read();
  subscribers.forEach((cb) => cb(now));
};
const onVisible = () => { if (!document.hidden) tick(); };
// Minute-aligned, 50 ms after the minute turns
const schedule = () => { timer = window.setTimeout(() => { tick(); schedule(); }, 60000 - (Date.now() % 60000) + 50); };

export const clock = {
  now: () => read(),
  /** Calls cb at every minute and when the tab comes back; returns the remover */
  onMinute(cb: (now: ClockReading) => void): () => void {
    subscribers.add(cb);
    if (subscribers.size === 1) {
      schedule();
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      subscribers.delete(cb);
      if (!subscribers.size) {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  },
};
