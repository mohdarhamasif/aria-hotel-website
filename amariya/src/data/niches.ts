import type { ThemeKey } from './colors';

export type OrbKind = 'champagne' | 'porcelain' | 'pearl';
export type NicheSlug = 'hotels' | 'clinics' | 'dental';

export interface Niche {
  slug: NicheSlug;
  theme: ThemeKey;
  orb: OrbKind;
  /** Industry switcher label */
  label: string;
  /** Palette name, shown on the front door */
  palette: string;
  title: string;
  description: string;
  /** The niche's ElevenLabs agent: PUBLIC_ELEVENLABS_AGENT_ID_<SLUG>, else the shared agent */
  agentId: string;
  /** Absolute URL of the page */
  canonical: string;
  /** Root-relative OG image path (1200 × 630) */
  ogImage: string;
  /** CSS variable of the display face this page loads (see astro.config.mjs) */
  displayFont: string;
  monoFont?: string;
  smallcapsFont?: string;
  /** Founders' licence. Prices are provisional; issued and held will come from HubSpot. */
  offer: { price: number; cap: number; unit: string; issued: number; held: number; provisional: boolean };
  /** Every font CSS variable this page loads beyond body and brand */
  fonts: string[];
}

export const SITE = 'https://aria-hotel-website.vercel.app';
const SHARED_AGENT = import.meta.env.PUBLIC_ELEVENLABS_AGENT_ID || 'agent_9101m3n1hwxffey830jzf43chj6x';
// Each variable is read by its full name so Vite can inline it at build time
const AGENTS: Record<NicheSlug, string | undefined> = {
  hotels: import.meta.env.PUBLIC_ELEVENLABS_AGENT_ID_HOTELS,
  clinics: import.meta.env.PUBLIC_ELEVENLABS_AGENT_ID_CLINICS,
  dental: import.meta.env.PUBLIC_ELEVENLABS_AGENT_ID_DENTAL,
};
/** Greetings in Arabic and Japanese use these faces; other scripts fall back to system fonts */
const GREETING_FONTS = ['--font-arabic', '--font-jp'];

const make = (n: Omit<Niche, 'agentId' | 'canonical' | 'ogImage' | 'fonts'>): Niche => ({
  ...n,
  agentId: AGENTS[n.slug] || SHARED_AGENT,
  canonical: `${SITE}/${n.slug}`,
  ogImage: `/og/${n.slug}.png`,
  fonts: [n.displayFont, ...[n.smallcapsFont, n.monoFont].filter((f): f is string => !!f), ...GREETING_FONTS],
});

export const niches: Niche[] = [
  make({
    slug: 'hotels',
    theme: 'hospitality',
    orb: 'champagne',
    label: 'Hotels & restaurants',
    palette: 'Forest & Champagne',
    title: 'Amariya · AI receptionist for hotels & restaurants',
    description: 'Amariya answers every call, day and night, books rooms and tables and speaks your guests’ language.',
    displayFont: '--font-display-hospitality',
    smallcapsFont: '--font-smallcaps-hospitality',
    offer: { price: 2500, cap: 30, unit: 'hotels & restaurants', issued: 0, held: 0, provisional: true },
  }),
  make({
    slug: 'clinics',
    theme: 'clinics',
    orb: 'porcelain',
    label: 'Clinics',
    palette: 'Ink & Porcelain',
    title: 'Amariya · AI receptionist for clinics and medical practices',
    description: 'Amariya answers every call, books consultations and appointments and speaks your patients’ language.',
    displayFont: '--font-display-clinics',
    monoFont: '--font-mono',
    offer: { price: 3500, cap: 30, unit: 'clinics', issued: 0, held: 0, provisional: true },
  }),
  make({
    slug: 'dental',
    theme: 'dental',
    orb: 'pearl',
    label: 'Dental',
    palette: 'Rosé & Pearl',
    title: 'Amariya · AI receptionist for dental practices',
    description: 'Amariya answers every call, books check-ups and urgent visits and speaks your patients’ language.',
    displayFont: '--font-display-dental',
    offer: { price: 3000, cap: 30, unit: 'practices', issued: 0, held: 0, provisional: true },
  }),
];

export const getNiche = (slug: NicheSlug): Niche => niches.find((n) => n.slug === slug)!;
