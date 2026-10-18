// Copy and helpers shared by the three niche modules: the brand, the founders' offer wording,
// legal link slots, the greeting pool and the JSON-LD graph.
import { getNiche, SITE, type NicheSlug } from '../niches';
import { given, pending, type FaqTab, type Greeting, type LedgerCounts, type LegalCopy, type SeoCopy } from './types';

export const brand = 'Amariya';
export const company = 'Amariya AI';
export const poweredBy = 'Voice powered by ElevenLabs';

export const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** The four things every founding licence includes */
export const inclusions = [
  'Professional features for life',
  '500 call minutes a month, extra at cost',
  'Done-for-you setup',
  'One location per licence',
];
export const guarantee = 'Live in 7 days or your money back.';
export const after = 'After the 30: plans from $299 a month.';
export const includedMinutes = 500;

/** '30 founding licences · 0 issued · 0 held · 30 open' */
export const ledger = (c: LedgerCounts, cap = 30) =>
  `${cap} founding licences · ${c.issued} issued · ${c.held} held · ${c.open} open`;
export const heldNote = 'Held means an application is in and its call is booked.';
export const holds = 'An approved application and a 20-minute call hold your place. You pay only on the invoice after the call.';

export const why = pending('Why only thirty founding licences, in the owner’s words.');
export const overageRate = pending('The per-minute rate for minutes beyond the 500 included (billed at cost).');
export const replyTime = pending('How soon the team replies to an application that is not offered a call on the page, e.g. “within one working day”.');
export const contactEmail = pending('The address applications go to when JavaScript is off.');

export const legal: LegalCopy = {
  privacy: pending('Privacy policy URL'),
  terms: pending('Terms URL'),
  recording: pending('Recording notice URL'),
  recordingLine: pending('One line, worded by the owner, on how demo calls are recorded and processed.'),
  labels: { privacy: 'Privacy', terms: 'Terms', recording: 'Recording notice' },
};

/** Spoken and printed greetings, by language */
export const greetingPool = {
  en: { text: 'Hello', lang: 'en', dir: 'ltr', name: 'English' },
  es: { text: 'Hola', lang: 'es', dir: 'ltr', name: 'Spanish' },
  fr: { text: 'Bonjour', lang: 'fr', dir: 'ltr', name: 'French' },
  ar: { text: 'مرحبا', lang: 'ar', dir: 'rtl', name: 'Arabic' },
  it: { text: 'Ciao', lang: 'it', dir: 'ltr', name: 'Italian' },
  ja: { text: 'こんにちは', lang: 'ja', dir: 'ltr', name: 'Japanese' },
  pt: { text: 'Olá', lang: 'pt', dir: 'ltr', name: 'Portuguese' },
  de: { text: 'Hallo', lang: 'de', dir: 'ltr', name: 'German' },
  deFormal: { text: 'Guten Tag', lang: 'de', dir: 'ltr', name: 'German' },
  tr: { text: 'Merhaba', lang: 'tr', dir: 'ltr', name: 'Turkish' },
  ru: { text: 'Здравствуйте', lang: 'ru', dir: 'ltr', name: 'Russian' },
  zh: { text: '您好', lang: 'zh', dir: 'ltr', name: 'Mandarin' },
  pl: { text: 'Dzień dobry', lang: 'pl', dir: 'ltr', name: 'Polish' },
  hi: { text: 'नमस्ते', lang: 'hi', dir: 'ltr', name: 'Hindi' },
  ur: { text: 'السلام علیکم', lang: 'ur', dir: 'rtl', name: 'Urdu' },
} satisfies Record<string, Greeting>;

/** The agent's identity rule, first in every agentContext */
export const identity =
  'Your name is Amariya. Always introduce and refer to yourself as Amariya, never by any other name. You are an AI and you say so whenever someone asks; never claim to be human.';

/** The founders' offer, as the agent should describe it */
export const offerForAgent = (price: number, unit: string) =>
  `There are no monthly plans on this page. The offer is a founding lifetime licence for the first 30 ${unit}: ${fmtUsd(price)} once (the price is provisional), with Professional features for life, 500 call minutes a month (extra minutes billed at cost), done-for-you setup and one location per licence. The guarantee: live in 7 days or the money back. After the 30, plans start at $299 a month. For recommend_plan, starter or professional both mean the founding licence and enterprise means groups with several locations, planned on the call. To apply, the visitor fills in a two-step application, then has a 20-minute call with the team; the invoice follows the call. Never promise prices, integrations, discounts or terms beyond these; if unsure, say the team will answer on the call.`;

/* ---------- Application copy shared by the three funnels ---------- */

export const stepOf = (n: number, total: number) => `Step ${n} of ${total}`;
export const goLive = [
  { value: 'asap', label: 'As soon as possible', months: 0 },
  { value: '1-month', label: 'Within a month', months: 1 },
  { value: '3-months', label: 'Within three months', months: 3 },
  { value: 'later', label: 'Later than that', months: 6 },
  { value: 'unsure', label: 'Not sure yet', months: null },
];
export const applyErrors = {
  email: 'Add an email we can reach you at.',
  network: 'That didn’t go through. Your details are still here, so please try again.',
  timeout: 'This is taking longer than it should. Your details are still here, so please try again.',
  duplicate: 'We already have this application, so there’s no need to send it twice.',
};
export const meetings = {
  heading: 'A 20-minute call with our team',
  frameTitle: 'Book a 20-minute call with the Amariya team',
  link: 'Open the calendar in a new tab',
};
export const consent = 'Amariya AI may contact me by email or phone about this application.';
export const roiBasis =
  (unitEstimate: string, noun: string) => (calls: number, estimated: boolean, missedPct: number, avgValue: string) =>
    `Based on ${calls.toLocaleString('en-US')} calls a month${estimated ? ` (${unitEstimate})` : ''}, ${missedPct}% currently missed and an average ${noun} of ${avgValue}.`;
export const disclaimer = 'Estimate. Your numbers will differ.';

interface JsonLdInput {
  slug: NicheSlug;
  seo: SeoCopy;
  pricingId: string;
  applyId: string;
  faqTabs: FaqTab[];
  /** Extra offers beyond the one-time founding licence */
  extraOffers?: object[];
}

/** Organization, one WebSite named Amariya, SoftwareApplication with a one-time Offer, Service and FAQPage. */
export function buildJsonLd({ slug, seo, pricingId, applyId, faqTabs, extraOffers = [] }: JsonLdInput): object {
  const niche = getNiche(slug);
  const url = niche.canonical;
  const org = `${SITE}/#organization`;
  const faq = faqTabs.flatMap((tab) => tab.items).flatMap(({ q, a }) => {
    const answer = given(a);
    return answer ? [{ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: answer } }] : [];
  });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': org, name: company, brand: { '@type': 'Brand', name: brand }, url: `${SITE}/`, logo: `${SITE}/favicon.svg` },
      { '@type': 'WebSite', '@id': `${SITE}/#website`, name: seo.websiteName, url: `${SITE}/`, publisher: { '@id': org } },
      {
        '@type': 'SoftwareApplication',
        '@id': `${url}#app`,
        name: brand,
        url,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: seo.appSubcategory,
        operatingSystem: 'Web',
        description: seo.appDescription,
        featureList: seo.featureList,
        publisher: { '@id': org },
        offers: [
          {
            '@type': 'Offer',
            price: niche.offer.price,
            priceCurrency: 'USD',
            description: seo.offerDescription,
            url: `${url}#${pricingId}`,
            availability: 'https://schema.org/LimitedAvailability',
            seller: { '@id': org },
          },
          ...extraOffers,
        ],
      },
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: seo.serviceName,
        serviceType: seo.serviceType,
        description: seo.description,
        provider: { '@id': org },
        audience: { '@type': 'BusinessAudience', audienceType: seo.audience },
        url,
        availableChannel: { '@type': 'ServiceChannel', serviceUrl: `${url}#${applyId}`, name: 'Apply for a founding licence' },
      },
      ...(faq.length ? [{ '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: faq }] : []),
    ],
  };
}
