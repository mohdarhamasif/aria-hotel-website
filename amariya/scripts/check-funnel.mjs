// One runnable check for the funnel maths and rules: npm run check:funnel
// (Node strips the TypeScript types; these modules have no runtime imports.)
import assert from 'node:assert/strict';
import { computeRoi, paybackDays, roiSummary, minutes } from '../src/scripts/apply/roi.ts';
import { missingFields, missingMessage } from '../src/scripts/apply/validate.ts';
import { qualify } from '../src/scripts/apply/qualify.ts';
import { fmtHM } from '../src/scripts/motion/clock.ts';

// ROI test vectors from the shared contracts
const vectors = [
  ['hotels', { rooms: 80 }, { missedCallRate: 0.25, bookingConversion: 0.3, avgBookingValue: 220, minutesPerCall: 4, callsPerUnit: 12 }, 2500, [960, 240, 15840, 64, 5]],
  ['clinics', { rooms: 4 }, { missedCallRate: 0.25, bookingConversion: 0.25, avgBookingValue: 435, minutesPerCall: 5, callsPerUnit: 150 }, 3500, [600, 150, 16313, 50, 7]],
  ['dental', { rooms: 5 }, { missedCallRate: 0.25, bookingConversion: 0.3, avgBookingValue: 200, minutesPerCall: 4, callsPerUnit: 180 }, 3000, [900, 225, 13500, 60, 7]],
];
for (const [name, profile, roi, price, [calls, recovered, revenue, hours, payback]] of vectors) {
  const r = computeRoi(profile, roi);
  assert.deepEqual([r.calls, r.recovered, r.revenue, r.hours, r.estimatedCalls], [calls, recovered, revenue, hours, true], name);
  assert.equal(paybackDays(price, r.revenue), payback, `${name} payback`);
  assert.equal(minutes(r, roi).included, 500);
}
const hotels = vectors[0][2];
assert.equal(computeRoi({ monthly_calls: '400', rooms: 80 }, hotels).calls, 400, 'monthly calls win over the room estimate');
assert.equal(computeRoi({}, hotels), null);
assert.equal(
  roiSummary({ rooms: 80 }, hotels, { revenueWording: 'extra direct bookings', unitsPlural: 'rooms', licencePrice: 2500 }),
  'Estimated monthly impact: 240 missed calls recovered, $15,840 in extra direct bookings (say it as "about 16 thousand dollars a month"), and 64 staff hours freed. Use these exact figures; do not recalculate. The founding licence pays for itself in about 5 days.',
);
assert.match(roiSummary({}, hotels, { revenueWording: 'x', unitsPlural: 'rooms' }), /ask for the number of rooms or monthly calls/);

// Validation: the old order and wording
assert.deepEqual(missingFields({}, {}, 'hotel name'), ['name', 'hotel name', 'email']);
assert.deepEqual(missingFields({ hotel_name: 'The Harbour House' }, { name: 'Ana', email: 'ana@' }, 'hotel name'), ['a valid email address']);
assert.deepEqual(missingFields({ hotel_name: 'H' }, { name: 'Ana', email: 'ana@harbour.house' }, 'hotel name'), []);
assert.equal(missingMessage(['name', 'email']), 'Please add name, email.');

// Qualification
const ok = { role: 'General manager', locations: 1, go_live: 'Within 3 months', open: 30 };
assert.equal(qualify(ok).qualified, true);
assert.equal(qualify({ ...ok, role: 'Student' }).qualified, false);
assert.equal(qualify({ ...ok, locations: 0 }).qualified, false);
assert.equal(qualify({ ...ok, go_live: '3–6 months' }).qualified, false);
assert.equal(qualify({ ...ok, go_live: 'Not sure yet' }).qualified, false);
assert.equal(qualify({ ...ok, go_live: '2026-12', today: new Date(2026, 9, 17) }).qualified, true);
assert.equal(qualify({ ...ok, open: 0 }).qualified, false);

// Clock formatting (minutes since midnight, wrapping past 24:00)
assert.equal(fmtHM(64, true), '1:04 am');
assert.equal(fmtHM(13 * 60 + 4, false), '13:04');
assert.equal(fmtHM(18 * 60 + 825, false), '07:45');
assert.equal(fmtHM(0, true), '12:00 am');

console.log('funnel checks pass');
