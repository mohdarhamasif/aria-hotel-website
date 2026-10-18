// Where applications go. PUBLIC_APPLY_WEBHOOK_URL set: POST JSON there (8 s timeout). Otherwise: kept in this
// browser (localStorage amariya_applications) and logged, until the HubSpot endpoint exists.
import { getNiche, type NicheSlug } from '../../data/niches';
import type { ProfileFields } from '../voice/bridge';
import type { Roi } from './roi';

export interface ApplicationPayload {
  industry: NicheSlug;
  step1: Record<string, unknown>;
  step2: Record<string, unknown>;
  hotel_profile: ProfileFields;
  roi?: Roi | null;
  qualification: { qualified: boolean; reasons: string[] };
  submitted_at: string;
  conversation_id: string | null;
  notes?: string;
}

export interface SubmitResult { ok: boolean; id: string; message: string }

const KEY = 'amariya_applications';
const WEBHOOK: string | undefined = import.meta.env.PUBLIC_APPLY_WEBHOOK_URL;
/** email + industry → id, for this page session */
const sent = new Map<string, string>();

const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export async function submitApplication(p: ApplicationPayload, o: { timeoutMs?: number } = {}): Promise<SubmitResult> {
  const email = String(p.step2.email ?? p.step1.email ?? '').trim().toLowerCase();
  const key = `${email}|${p.industry}`;
  const previous = sent.get(key);
  if (previous) return { ok: true, id: previous, message: 'We already have your application.' };
  const id = newId();

  if (WEBHOOK) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), o.timeoutMs ?? 8000);
    try {
      const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...p }), signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('Application not sent:', err);
      return { ok: false, id, message: 'That didn’t go through. Your details are still here, please try again.' };
    } finally {
      clearTimeout(timer);
    }
  } else {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || '[]');
      all.push({ id, ...p });
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* storage blocked: the console copy below is the record */ }
    console.info('Application:', { id, ...p });
  }
  sent.set(key, id);
  return { ok: true, id, message: 'Application received.' };
}

/** The niche's HubSpot meetings link, when configured */
export function meetingsUrl(industry: NicheSlug): string | null {
  const urls: Record<NicheSlug, string | undefined> = {
    hotels: import.meta.env.PUBLIC_HUBSPOT_MEETINGS_HOTELS,
    clinics: import.meta.env.PUBLIC_HUBSPOT_MEETINGS_CLINICS,
    dental: import.meta.env.PUBLIC_HUBSPOT_MEETINGS_DENTAL,
  };
  return urls[industry] || null;
}

/** Founding licences: issued, held and open. ponytail: read from niches.ts until HubSpot serves the counts. */
export function ledgerCounts(industry: NicheSlug): { issued: number; held: number; open: number } {
  const { cap, issued, held } = getNiche(industry).offer;
  return { issued, held, open: Math.max(0, cap - issued - held) };
}
