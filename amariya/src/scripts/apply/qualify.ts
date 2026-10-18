// Silent qualification of an application. No runtime imports.
// ponytail: owner-defined rules arrive later; until then these four checks are the whole policy.

export interface QualifyInput {
  role?: string;
  locations?: number | string;
  /** 'now', 'this month', 'within 3 months', '3–6 months', 'later', '2026-12' or a date */
  go_live?: string;
  /** Licences still open (ledgerCounts(industry).open) */
  open: number;
  /** For date answers; defaults to now */
  today?: Date;
}

/** Roles that can buy or run the front desk, across hotels, restaurants, clinics and dental practices */
const ROLE = /owner|founder|partner|director|manager|\bgm\b|general manager|head|lead|principal|administrator|operations|ceo|coo|proprietor|dentist|physician|doctor|surgeon|clinician|practitioner|reception|front desk|front office|revenue|chef|maître|maitre/i;
const NOT_A_BUYER = /student|vendor|agency|reseller|journalist|researcher|just looking|job/i;

/** Months from today until go-live, or null when the answer can't be read */
function monthsUntil(answer: string, today: Date): number | null {
  const a = answer.trim().toLowerCase();
  if (!a) return null;
  if (/^(now|asap|immediately|today|this week|this month|right away)/.test(a)) return 0;
  if (/next month/.test(a)) return 1;
  if (/later|not sure|next year|exploring|someday|unsure/.test(a)) return 12;
  const date = a.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (date) return (Number(date[1]) - today.getFullYear()) * 12 + (Number(date[2]) - 1 - today.getMonth());
  // '3–6 months', 'within 3 months', '6+ months': the largest number decides
  const nums = a.match(/\d+/g);
  if (nums) {
    const n = Math.max(...nums.map(Number));
    return /week/.test(a) ? n / 4.3 : /year/.test(a) ? n * 12 : n;
  }
  return null;
}

export function qualify(a: QualifyInput): { qualified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const role = String(a.role ?? '').trim();
  if (!role || NOT_A_BUYER.test(role) || !ROLE.test(role)) reasons.push('role not recognised');
  const locations = Number(a.locations);
  if (!(locations >= 1)) reasons.push('no locations given');
  const months = monthsUntil(String(a.go_live ?? ''), a.today ?? new Date());
  if (months === null || months > 3) reasons.push('go-live later than 3 months');
  if (!(a.open > 0)) reasons.push('no licences open');
  return { qualified: reasons.length === 0, reasons };
}
