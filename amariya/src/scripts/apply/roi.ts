// The ROI estimate, exactly as the previous site computed it, plus payback and the honest minutes meter.
// No runtime imports, so scripts/check-funnel.mjs can run it under plain Node.
import type { ProfileFields, RoiConfig } from '../voice/bridge';

export interface Roi {
  calls: number;
  recovered: number;
  revenue: number;
  hours: number;
  /** True when calls came from the unit count, not the visitor's own monthly calls */
  estimatedCalls: boolean;
}

/** en-US dollars, no cents */
export const fmtMoney = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function computeRoi(p: ProfileFields, c: RoiConfig): Roi | null {
  let calls = Number(p.monthly_calls) || 0;
  // Rough fallback from the unit count (rooms, practitioners, chairs)
  if (!calls && Number(p.rooms)) calls = Math.round(Number(p.rooms) * c.callsPerUnit);
  if (!calls) return null;
  const recovered = Math.round(calls * c.missedCallRate);
  const revenue = Math.round(recovered * c.bookingConversion * c.avgBookingValue);
  const hours = Math.round((calls * c.minutesPerCall) / 60);
  return { calls, recovered, revenue, hours, estimatedCalls: !Number(p.monthly_calls) };
}

/** Days for the licence to pay for itself out of the monthly revenue */
export const paybackDays = (price: number, monthlyRevenue: number) => Math.ceil(price / (monthlyRevenue / 30.4));

/** Call minutes a month: only the calls she recovers, every call, and what the licence includes */
export const minutes = (r: Roi, c: RoiConfig) => ({ missedOnly: r.recovered * c.minutesPerCall, every: r.calls * c.minutesPerCall, included: 500 });

/** The agent's answer, with a pre-rounded spoken figure so it never rounds the exact number itself */
export function roiSummary(p: ProfileFields, c: RoiConfig, wording: { revenueWording: string; unitsPlural: string; licencePrice?: number }): string {
  const roi = computeRoi(p, c);
  if (!roi) return `Not enough data for an ROI estimate yet — ask for the number of ${wording.unitsPlural} or monthly calls.`;
  const k = Math.round(roi.revenue / 500) / 2;
  const spoken = k >= 1 ? `about ${k.toLocaleString('en-US')} thousand dollars` : `about ${Math.round(roi.revenue / 50) * 50} dollars`;
  const payback = wording.licencePrice && roi.revenue > 0 ? ` The founding licence pays for itself in about ${paybackDays(wording.licencePrice, roi.revenue)} days.` : '';
  return `Estimated monthly impact: ${roi.recovered} missed calls recovered, ${fmtMoney(roi.revenue)} in ${wording.revenueWording} (say it as "${spoken} a month"), and ${roi.hours} staff hours freed. Use these exact figures; do not recalculate.${payback}`;
}
