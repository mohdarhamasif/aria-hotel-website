// The agent's client tools (contract 15): the previous site's names, enums and reply sentences, delegating to the
// page's presenter. Also reports the visitor's own scrolling to the agent. window.amariyaTools (alias ariaTools).
import { voice, FEATURES, SECTIONS, type DemoFields, type FeatureKey, type PlanKey, type ProfileFields, type SectionName } from './bridge';
import { roiSummary } from '../apply/roi';
import { missingFields } from '../apply/validate';
import { trackSections } from '../motion/scroll';

type Params = Record<string, unknown> | undefined;
export type Tool = (params?: Params) => string | Promise<string>;

const PROFILE = ['hotel_name', 'hotel_type', 'rooms', 'monthly_calls', 'languages', 'pain_points'] as const;
const DEMO = ['name', 'hotel_name', 'email', 'phone', 'preferred_time', 'plan', 'notes'] as const;
const PLANS: PlanKey[] = ['starter', 'professional', 'enterprise'];
const NOT_READY = 'The page is still loading. Try again in a moment.';

let lastAgentMove = 0;

/** A form the presenter types into. Her values still being typed count as already there, so a second tool call
 *  in quick succession reads the whole picture; get_roi_estimate and submit_demo_request wait for the typing. */
function typist<F extends object>() {
  let typing: Promise<unknown> = Promise.resolve();
  let pending = {} as F;
  return {
    get done() { return typing; },
    read: (shown: F): F => ({ ...shown, ...pending }),
    write(fields: F, type: (f: F) => Promise<unknown>) {
      pending = { ...pending, ...fields };
      const t = type(fields).catch((err) => console.error(err));
      typing = t;
      void t.then(() => { if (typing === t) pending = {} as F; });
    },
  };
}
const profileForm = typist<ProfileFields>();
const applicationForm = typist<DemoFields>();

/** Call before the page moves on the agent's behalf, so it is not reported as the visitor's own scrolling */
export const markAgentMove = () => { lastAgentMove = Date.now(); };

function go(section: string) {
  markAgentMove();
  return voice.presenter?.navigate(section, true) ?? false;
}

/** The fields the agent gave, trimmed; lists joined with commas, numbers kept */
function pick(params: Params, keys: readonly string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of keys) {
    const v = params?.[key];
    if (v === undefined || v === null) continue;
    const value = Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? v : String(v).trim();
    if (value !== '') out[key] = value;
  }
  return out;
}

/* ---------- Activity lines in the niche's words (Transcript.astro carries them as data-activity) ---------- */

type ActivityKey = 'profile' | 'roi' | 'founding' | 'groups' | 'filled' | 'sent';
let activityCopy: Partial<Record<ActivityKey, string>> | null = null;
function did(key: ActivityKey, fallback: string, summary = '') {
  if (!activityCopy) {
    try { activityCopy = JSON.parse(document.querySelector<HTMLElement>('[data-log]')?.dataset.activity || '{}'); } catch { activityCopy = {}; }
  }
  voice.activity((activityCopy?.[key] ?? fallback).replace('{summary}', summary));
}

/** 'The Harbour House · 80 rooms or tables' */
function profileSummary(f: ProfileFields, unitsPlural: string) {
  return Object.entries(f)
    .map(([k, v]) => (k === 'rooms' ? `${v} ${unitsPlural}` : k === 'monthly_calls' ? `${v} calls a month` : String(v)))
    .join(' · ');
}

/* ---------- The tools ---------- */

export const tools: Record<string, Tool> = {
  navigate_to_section: (params) => {
    const section = String(params?.section ?? '');
    return go(section.trim().toLowerCase()) ? `Now showing the ${section} section.` : `Unknown section. Use one of: ${SECTIONS.join(', ')}.`;
  },

  update_hotel_profile: (params) => {
    const c = voice.config, p = voice.presenter;
    if (!c || !p) return NOT_READY;
    const fields = pick(params, PROFILE) as ProfileFields;
    // ponytail: names are the fields she gave, so the reply goes out at once and the page catches up as it types;
    // a value the page can't take (an unknown type) is still listed. Await setProfile's names if that ever matters.
    const names = Object.keys(fields);
    go('profile');
    if (names.length) {
      profileForm.write(fields, (f) => p.setProfile(f));
      did('profile', `Updated your ${c.businessNoun} profile`, profileSummary(fields, c.unitsPlural));
    }
    return `Updated: ${names.join(', ') || 'nothing'}. ${roiSummary(profileForm.read(p.readProfile()), c.roi, c)}`;
  },

  get_roi_estimate: async () => {
    const c = voice.config, p = voice.presenter;
    if (!c || !p) return NOT_READY;
    go('profile');
    await profileForm.done;
    await p.showRoi();
    did('roi', 'Calculated your estimate');
    return roiSummary(profileForm.read(p.readProfile()), c.roi, c);
  },

  highlight_feature: (params) => {
    const feature = String(params?.feature ?? '').trim().toLowerCase() as FeatureKey;
    go('features');
    return FEATURES.includes(feature) && voice.presenter?.spotlight(feature)
      ? `Highlighting ${feature}.`
      : `Unknown feature. Use: ${FEATURES.join(', ')}.`;
  },

  recommend_plan: (params) => {
    const plan = String(params?.plan ?? '').trim().toLowerCase() as PlanKey;
    const reason = params?.reason ? String(params.reason).trim() : undefined;
    go('pricing');
    const ok = PLANS.includes(plan) && !!voice.presenter?.recommend(plan, reason || undefined);
    if (!ok) return `Unknown plan. Use: ${PLANS.join(', ')}.`;
    // starter and professional are the founding licence; enterprise is the groups option
    if (plan === 'enterprise') did('groups', 'Recommended the groups option');
    else did('founding', 'Recommended the founding licence');
    return `Showing ${plan} as the recommended plan.`;
  },

  fill_demo_form: (params) => {
    const c = voice.config, p = voice.presenter;
    if (!c || !p) return NOT_READY;
    const fields = pick(params, DEMO) as DemoFields;
    const names = Object.keys(fields);
    go('demo');
    if (names.length) {
      applicationForm.write(fields, (f) => p.fillApplication(f));
      did('filled', 'Filled in your application');
    }
    const missing = missingFields({ ...applicationForm.read(p.readApplication()) }, undefined, c.nameLabel);
    return `Filled: ${names.join(', ') || 'nothing'}.` + (missing.length ? ` Still needed: ${missing.join(', ')}.` : ' All required fields are complete.');
  },

  submit_demo_request: async () => {
    const c = voice.config, p = voice.presenter;
    if (!c || !p) return NOT_READY;
    await Promise.all([profileForm.done, applicationForm.done]);
    const missing = missingFields({ ...applicationForm.read(p.readApplication()) }, undefined, c.nameLabel);
    if (missing.length) return `Cannot submit yet. Missing: ${missing.join(', ')}.`;
    go('demo');
    const result = await p.submitApplication();
    if (result.ok) did('sent', 'Application sent');
    return result.message;
  },

  show_handoff: (params) => {
    const topic = String(params?.topic ?? '').trim();
    const summary = String(params?.summary ?? '').trim();
    const p = voice.presenter;
    if (!topic || !p?.handoff) return 'Hand-offs are not shown on this page.';
    p.handoff(topic, summary);
    return `Showing the hand-off to the team: ${topic}.`;
  },
};
// Agents set up for other industries use the neutral name; the hotel name keeps working
tools.update_business_profile = tools.update_hotel_profile!;

declare global {
  interface Window { amariyaTools?: Record<string, Tool>; ariaTools?: Record<string, Tool> }
}

let ready = false;
/** Idempotent; each niche ui.ts calls it */
export function init(): void {
  if (ready) return;
  ready = true;
  // For testing from the browser console
  window.amariyaTools = window.ariaTools = tools;

  // Report navigation the visitor did on their own (the agent's own moves are muted for 1.8 s)
  const sections = new Map<string, SectionName>();
  for (const name of SECTIONS) {
    const el = document.querySelector<HTMLElement>(`[data-section="${name}"]`);
    if (el?.id) sections.set(el.id, name);
  }
  let current: SectionName | null = null;
  trackSections([...sections.keys()], (id) => {
    const name = sections.get(id);
    if (!name || name === current) return;
    current = name;
    if (Date.now() - lastAgentMove > 1800) voice.contextUpdate(`The visitor scrolled to the "${name}" section of the website on their own.`);
  });
}
