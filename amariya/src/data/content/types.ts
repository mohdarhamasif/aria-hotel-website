// The shape of every string, number and script the three niche pages render.
// A missing field fails `npx tsc --noEmit`. Owner-unconfirmed claims are Pending slots and render nothing.
import type { FeatureKey, PlanKey, ProfileFields, RoiConfig, SectionName, VoiceConfig } from '../../scripts/voice/bridge';
import type { CallLine, CallScript } from '../../scripts/scripted';

export type { FeatureKey, PlanKey, SectionName };

/* ---------- Pending: a claim the owner has not confirmed yet ---------- */

export interface PendingSlot {
  readonly pending: true;
  /** What the owner has to supply; never shown to visitors */
  readonly note: string;
}
export type Pending<T> = T | PendingSlot;

export const pending = (note: string): PendingSlot => ({ pending: true, note });
export const isPending = (v: unknown): v is PendingSlot =>
  typeof v === 'object' && v !== null && (v as Partial<PendingSlot>).pending === true;
/** The confirmed value, or null while the slot is pending (render nothing). */
export const given = <T>(v: Pending<T>): T | null => (isPending(v) ? null : v);

/* ---------- Small shared shapes ---------- */

/** A sentence with one emphasised run, [before, emphasis, after]. The emphasis is set upright (no italics). */
export type Emph = readonly [string, string, string];

export type Dir = 'ltr' | 'rtl';

/** A greeting in another language; `name` is the language's English name for captions and screen readers. */
export interface Greeting {
  text: string;
  lang: string;
  dir: Dir;
  name: string;
}

/** The agent contract's six profile field names. */
export type ProfileKey = keyof ProfileFields;

/** A call line that may carry an English gloss (for translated lines) */
export interface NicheLine extends CallLine {
  gloss?: string;
}

/** A routed request or hand-off that lands on the team's side */
export interface Slip {
  /** Stamp or topic, e.g. 'Concierge', 'MEDICATION' */
  stamp: string;
  text: string;
}

/** A scripted call: always labelled as scripted; names, times and prices in it are examples. */
export interface NicheCall extends CallScript {
  lines: NicheLine[];
  /** A short title for lists, e.g. 'A late check-in' */
  title: string;
  /** Requests routed to the team, shown as slips */
  slips?: Slip[];
  /** A clinical hand-off and the line index (0-based) at which it fires */
  handoff?: { at: number; topic: string; summary: string };
  /** What lands on the team's side, in one line */
  lands?: string;
  /** Hotels: which house plays it ('both' when omitted) */
  house?: HouseKind;
  /** Clinics: the lens this call belongs to (both when omitted) */
  lens?: LensKey;
}

/* ---------- Common to every niche ---------- */

export interface SeoCopy {
  /** ≤ 60 characters */
  title: string;
  /** ≤ 160 characters */
  description: string;
  ogDescription: string;
  twitterDescription: string;
  ogAlt: string;
  websiteName: 'Amariya';
  appSubcategory: string;
  appDescription: string;
  featureList: string[];
  serviceType: string;
  serviceName: string;
  audience: string;
  /** The one-time Offer's description in JSON-LD */
  offerDescription: string;
}

export interface ProfileCopy {
  /** 'Tell Amariya about your clinic' */
  title: Emph;
  labels: Record<ProfileKey, string>;
  placeholders: Record<ProfileKey, string>;
  /** hotel_type options, matched by setField's fuzzy rule (value, text, substring) */
  typeOptions: string[];
  /** 'She fills this in as you talk…' */
  hint: string;
}

export interface RoiCopy extends RoiConfig {
  revenueLabel: string;
  revenueWording: string;
  note: string;
  unitEstimate: string;
  unitsPlural: string;
  /** 'Based on 960 calls a month (estimated…), 25% currently missed and an average booking of $220.' */
  basis: (calls: number, estimated: boolean, missedPct: number, avgValue: string) => string;
  disclaimer: string;
  /** The per-minute rate beyond the 500 included minutes */
  overageRate: Pending<string>;
}

export interface LedgerCounts {
  issued: number;
  held: number;
  open: number;
}

export interface OfferCopy {
  price: number;
  currency: 'USD';
  /** '$2,500' */
  priceLabel: string;
  cap: number;
  unit: string;
  issued: number;
  held: number;
  provisional: boolean;
  inclusions: string[];
  guarantee: string;
  after: string;
  groupsNote: string;
  /** Why thirty, in the owner's words */
  why: Pending<string>;
  /** '30 founding licences · 0 issued · 0 held · 30 open' */
  ledger: (c: LedgerCounts) => string;
  /** What 'held' means, for the ledger note */
  heldNote: string;
  /** 'An approved application and a 20-minute call…' */
  holds: string;
}

export interface FeatureCopy {
  title: string;
  desc: string;
  /** A short, checkable proof line */
  proof?: Pending<string>;
  /** What it means for the team */
  team?: string;
}

export interface FaqItem {
  q: string;
  a: Pending<string>;
}

export interface FaqTab {
  id: string;
  label: string;
  items: FaqItem[];
}

export interface FieldCopy {
  label: string;
  placeholder?: string;
  hint?: string;
}

export interface OptionCopy {
  value: string;
  label: string;
}

export type ApplyFieldKey =
  | 'name'
  | 'hotel_name'
  | 'email'
  | 'phone'
  | 'preferred_time'
  | 'notes'
  | 'locations'
  | 'role'
  | 'software'
  | 'go_live'
  | 'consent';

export interface ApplyCopy {
  eyebrow: string;
  title: string;
  lede: string;
  /** Step headings, in order */
  steps: [{ label: string; heading: string }, { label: string; heading: string }];
  /** 'Step 1 of 2' */
  stepOf: (n: number, total: number) => string;
  fields: Record<ApplyFieldKey, FieldCopy>;
  /** Roles qualification recognises */
  roles: string[];
  /** Go-live options; `months` drives qualification (≤ 3 qualifies), null = not sure */
  goLive: (OptionCopy & { months: number | null })[];
  /** The plan field's two values */
  plans: { founding: string; groups: string };
  next: string;
  back: string;
  submit: string;
  sending: string;
  retry: string;
  errors: { email: string; network: string; timeout: string; duplicate: string };
  /** 'What happens next', four steps */
  nextSteps: { title: string; text: string }[];
  success: {
    heading: string;
    text: string;
    /** 'Your call is on Thu 10:20 …' once the meetings embed reports a booking */
    booked: (when: string) => string;
    bookedHeading: string;
    /** The owner's reply time; until confirmed, `fallback` is shown */
    replyTime: Pending<string>;
    fallback: string;
  };
  meetings: { heading: string; frameTitle: string; link: string };
  /** Shown inside <noscript>; the address is pending until the owner gives one */
  noscript: { line: string; email: Pending<string>; subject: string };
}

export interface TranscriptCopy {
  title: string;
  you: string;
  her: string;
  placeholder: string;
  send: string;
  close: string;
  print: string;
  continueWriting: string;
  feedback: { question: string; like: string; dislike: string; thanks: string };
  /** Ending lines by onDisconnect reason */
  ended: { user: string; agent: string; error: string };
  /** 'Entry closed · 3 min 12 s · ended by you' */
  summary: (duration: string, ended: string) => string;
  /** Mic missing or refused: the call falls back to text */
  noMic: string;
  /** Activity lines for the agent's actions */
  activity: {
    profile: (summary: string) => string;
    roi: string;
    showing: (label: string) => string;
    founding: string;
    groups: string;
    filled: string;
    sent: string;
  };
}

export interface LegalCopy {
  /** Link URLs */
  privacy: Pending<string>;
  terms: Pending<string>;
  recording: Pending<string>;
  /** One line on how the demo call is processed, for the start sheet */
  recordingLine: Pending<string>;
  labels: { privacy: string; terms: string; recording: string };
}

export interface CommonContent {
  slug: 'hotels' | 'clinics' | 'dental';
  seo: SeoCopy;
  voice: VoiceConfig;
  /** Who it is built for (the old marquee) */
  builtFor: { sr: string; items: string[] };
  profile: ProfileCopy;
  roi: RoiCopy;
  offer: OfferCopy;
  features: Record<FeatureKey, FeatureCopy>;
  /** 'Everything your front desk does on the phone' */
  featuresIntro: { title: Emph; lede: string };
  /** Shown with every scripted call */
  callsNote: string;
  calls: NicheCall[];
  faqTabs: FaqTab[];
  faqTitle: Emph;
  /** 'Ask Amariya this' */
  askThis: string;
  footer: { line: string; title: Emph; cta: string };
  apply: ApplyCopy;
  transcript: TranscriptCopy;
  legal: LegalCopy;
  jsonLd(): object;
}

/* ---------- Hotels: The Night Log ---------- */

export type HouseKind = 'hotel' | 'restaurant' | 'both';

export interface Scenario {
  id: 'boutique' | 'resort' | 'restaurant' | 'hotel-restaurant';
  label: string;
  /** Lower case, for the live sentence */
  inline: string;
  /** The hotel_type value it sets */
  hotelType: string;
  kind: HouseKind;
  floors: number;
  bays: number;
  pool: boolean;
  privateDining: boolean;
}

/** The parts of a log entry that a restaurant-only house replaces */
export interface ChapterVariant {
  room: string;
  title: string;
  lede: string;
  h2: string;
  summary: string;
  log: string[];
  stamp: string;
  calls: string[];
  annotation: string;
}

export interface HotelChapter {
  id: string;
  section: SectionName | null;
  /** 'HH:MM', 'now' for the prologue, '' for chapters off the clock */
  hour: string;
  /** Minutes since 18:00 (0–825); null for chapters off the clock */
  minutes: number | null;
  room: string;
  title: string;
  /** One line under the title */
  lede: string;
  /** Names the hour and room in words */
  h2: string;
  /** One line for the Night index */
  summary: string;
  /** Lines written into the night log */
  log: string[];
  stamp?: string;
  feature?: FeatureKey;
  span: string;
  /** Call ids played in this entry, in order */
  calls: string[];
  /** 'What she does here' */
  does?: string;
  /** Annotation label on the drawing */
  annotation: string;
  /** Lines added only for houses with rooms */
  hotelLog?: string[];
  /** Replaces the entry in a restaurant-only house */
  restaurant?: ChapterVariant;
  /** Day/night closing line, re-checked every minute */
  closing?: { day: string; night: string };
}

export interface HotelsContent extends CommonContent {
  slug: 'hotels';
  chapters: HotelChapter[];
  prologue: {
    /** "It's 1:04 am where you are, at your" */
    lead: (time: string) => string;
    staticTime: string;
    end: string;
    chooseLabel: string;
    h1: string;
    lede: string;
    primary: string;
    ring: string;
    write: string;
    look: string;
    offerLine: (open: number) => string;
    coaster: string;
    restaurantWording: string;
  };
  scenarios: Scenario[];
  propertyCard: {
    eyebrow: string;
    title: string;
    teaser: (n: number) => string;
    teaserLink: string;
    welcomeBack: (name: string) => string;
    forget: string;
    tablesLabel: string;
  };
  handover: {
    eyebrow: string;
    defaultName: string;
    heading: (name: string, date: string) => string;
    missed: (n: string) => string;
    revenue: (money: string, wording: string) => string;
    hours: (n: string) => string;
    payback: (days: number) => string;
    minutes: (missedOnly: string, every: string, included: string) => string;
    ota: { label: string; line: (money: string, rate: string) => string };
    restaurant: { spendLabel: string; needs: string; roi: Pending<RoiConfig> };
    empty: string;
    print: string;
    send: string;
    mail: { subject: (name: string) => string; intro: string };
  };
  claims: {
    /** 'Books direct, so no OTA commission' */
    otaCommission: Pending<string>;
    /** PMS and booking-system names */
    systems: Pending<string>;
  };
  keys: {
    eyebrow: string;
    title: string;
    price: string;
    plate: string;
    whyLabel: string;
    after: string;
    keyItem: (n: number, state: 'open' | 'held' | 'issued') => string;
    fob: (open: number) => string;
    recommendTag: (name: string, reason: string) => string;
  };
  registration: {
    eyebrow: string;
    title: string;
    stepLabels: [string, string];
  };
  nightIndex: { title: string; lede: string; open: string; close: string; navLabel: string };
  ring: { label: string; valueText: (time: string, room: string, feature: string, n: number, of: number) => string; now: string };
  follow: { lead: (hour: string, room: string) => string; action: string };
  runningHead: { tonight: string; named: (name: string, date: string) => string };
  faqIntro: { eyebrow: string; title: string };
  checkout: { eyebrow: string; plate: string; also: string; poweredBy: string };
  /** Greetings for the lobby hour, the visitor's own language first */
  greetings: Greeting[];
  translation: { label: string; note: string };
}

/* ---------- Clinics: The Line ---------- */

export interface Lens<T> {
  medical: T;
  aesthetic: T;
}
/** A string, or one per lens where the wording differs */
export type Lensed = string | Lens<string>;
export type LensKey = keyof Lens<unknown>;

export interface ClinicChapter {
  id: string;
  point: string;
  title: string;
  section: SectionName | 'story' | 'call' | 'line' | 'faq' | 'signoff';
  split: number;
}

export interface Situation {
  /** Hour band, 'HH:MM'–'HH:MM' (to is exclusive) */
  from: string;
  to: string;
  line: Lensed;
  /** Team side, mono */
  status: string;
}

export interface DialItem {
  key: FeatureKey;
  title: Lensed;
  sentences: [Lensed, Lensed];
  proof: string;
  team: string;
}

export interface LineQuestion {
  q: string;
  kind: 'administrative' | 'clinical';
  /** Her one-line answer (administrative; an example clinic) */
  answer?: string;
  handoff?: { topic: string; summary: string };
}

export interface ClinicsContent extends CommonContent {
  slug: 'clinics';
  chapters: ClinicChapter[];
  sides: { her: string; team: string };
  lens: {
    label: string;
    labels: Lens<string>;
    eyebrowLabels: Lens<string>;
    /** Which hotel_type options set which lens */
    byType: Record<string, LensKey>;
  };
  intake: {
    eyebrow: string;
    h1: { her: [string, string]; team: [string, string] };
    lede: Lensed;
    team: string;
    talk: string;
    text: string;
    note: { before: string; link: string };
    hint: string;
    hintButton: string;
    demoSlip: string;
    strip: (c: LedgerCounts) => string[];
    stripAction: string;
    shortHint: string;
  };
  story: {
    label: string;
    situations: Situation[];
    /** The old story's first beat, after the time */
    beat0: Lens<Emph>;
    beat1: Emph;
    beat2: Lens<string>;
    booking: Lens<string>;
    closing: { day: string; night: string };
    nightLine: string;
    closed: string;
    counter: (n: number) => string;
  };
  greetings: Greeting[];
  callRoom: {
    title: string;
    /** Per lens: it counts the calls that lens shows */
    lede: Lensed;
    read: string;
    play: string;
    caller: string;
    her: string;
    lands: string;
    scrub: string;
    next: string;
    /** The urgent-symptoms call ships only after the owner confirms its escalation wording */
    urgentCall: Pending<NicheCall>;
  };
  dial: { title: string; lede: string; items: DialItem[]; hearCall: string };
  line: {
    title: string;
    ask: string;
    freeLabel: string;
    freeSubmit: string;
    unsure: string;
    honest: string;
    questions: LineQuestion[];
    /** Free-text sorting, checked in this order (emergency, clinical, administrative; no match → your team).
     *  Each entry matches case-insensitively at the start of a word, so 'bruis' matches 'bruising'. */
    rules: { emergency: string[]; clinical: string[]; administrative: string[] };
    freeAnswer: string;
    freeHandoff: (q: string) => string;
    handoffPrefix: string;
    logTitle: string;
    staysTitle: string;
    stays: string[];
    emergency: { instruction: Pending<Record<string, string>>; urgent: string };
    consentTitle: string;
    consent: { id: 'C1' | 'C2' | 'C3' | 'C4'; title: string; body: Pending<string> }[];
    chatbot: { q: string; a: string };
  };
  clinic: {
    title: string;
    herHeading: string;
    teamHeading: string;
    hours: { opens: FieldCopy; closes: FieldCopy; defaults: { opens: string; closes: string } };
    avgValue: FieldCopy;
    languageChips: string[];
    challengeChips: string[];
    other: string;
    noted: string;
    account: {
      calls: string;
      recovered: string;
      revenue: string;
      hours: string;
      outOfHours: string;
      payback: string;
      minutes: string;
      outOfHoursValue: (pct: number) => string;
      paybackValue: (days: number) => string;
      minutesValue: (missedOnly: string, every: string) => string;
      included: string;
      footnote: string;
      medicalNeedsValue: string;
      medicalRoi: Pending<RoiConfig>;
    };
    curve: { threshold: string; crossing: (day: number) => string; text: (day: number | null, price: string) => string };
  };
  licence: {
    price: string;
    for: string;
    holdsHeading: string;
    mark: {
      underglaze: (n: number) => string;
      caption: (n: number) => string;
      apply: (n: number) => string;
      next: string;
    };
    plateLabel: string;
    course: { title: string; days: { day: number; title: string; timing: Pending<string> }[]; ring: string };
    payback: (days: number) => string;
    recommend: (reason: string) => string;
  };
  applyExtras: {
    whatsapp: string;
    received: (time: string) => string;
    groupsNote: string;
  };
  questionsGroups: { her: string; team: string };
  signoff: { line: string; talk: string; apply: string; notes: string };
  letter: {
    title: string;
    intro: string;
    sections: { profile: string; estimate: string; handled: string; handedOff: string; recommendation: string; next: string; log: string; transcript: string };
    copy: string;
    print: string;
    mail: string;
    nextStep: string;
  };
  topBar: { brandLabel: string; menu: string; notes: string; apply: string; index: string; talk: string; type: string };
  follow: (point: string, label: string) => string;
  marginNote: (action: string, time: string) => string;
}

/* ---------- Dental: First Available ---------- */

export interface DentalScene {
  from: string;
  to: string;
  name: string;
  /** '2:32 pm. Chair 1 is mid-crown. A new patient calls with a toothache.' */
  line: (time: string) => string;
  call: string;
  booked: { time: string; label: string; lang?: string };
  /** After this time the booked slot moves to `late` (the afternoon's 3:40 pm has passed) */
  lateAfter?: string;
  late?: { time: string; label: string; call: string };
}

export interface PracticeType {
  id: 'general' | 'cosmetic' | 'orthodontics' | 'pediatric' | 'specialist' | 'group';
  chip: string;
  hotelType: string;
  bands: string[];
  intakeLine: string;
}

export interface WorkingEntry {
  id: string;
  time: string;
  feature: FeatureKey;
  title: string;
  desc: string;
  call: string;
  outcome: string;
  /** An owner-confirmed claim about this entry */
  claim?: Pending<string>;
}

export interface DentalChapter {
  id: string;
  time: string;
  title: string;
  section: SectionName | 'never' | 'faq' | 'close';
}

export interface DentalContent extends CommonContent {
  slug: 'dental';
  chapters: DentalChapter[];
  header: { sheet: string; practicePlaceholder: string; tabsLabel: string };
  hero: {
    title: Emph;
    lede: string;
    apply: string;
    readOn: string;
    offerEntry: (open: number) => string;
    talk: { idle: string; connecting: string; live: string };
    type: string;
    staticTime: string;
  };
  scenes: DentalScene[];
  beats: { greeting: string; booked: string; closing: { day: string; night: string }; label: string };
  practiceTypes: PracticeType[];
  intake: { title: string; chipsLabel: string; chairsMore: string; footnote: string };
  tally: {
    title: string;
    calls: string;
    missed: string;
    recovered: string;
    revenue: string;
    hours: string;
    payback: (days: number) => string;
    minutes: (m: string) => string;
    estimate: string;
  };
  workingDay: { title: string; lede: string; entries: WorkingEntry[]; gapHint: string; tapHint: string; hear: string; enableSound: string };
  neverDoes: { title: string; lines: Pending<string>[] };
  licenceLine: {
    title: string;
    line: string;
    provisional: string;
    seats: { open: string; held: string; issued: string; label: string };
    sevenDays: { title: string; days: { days: string; label: string }[]; line: string };
    groups: { title: string; text: string };
    recommend: (reason: string) => string;
  };
  applySlip: {
    title: string;
    block: string;
    pick: string;
    qualifying: { label: string; options: string[] };
    chairsLocations: string;
    status: { received: string; booked: string };
  };
  notesColumn: { title: string; lede: string; lateCall: string };
  close: { lines: [string, string, string]; talk: string; credits: (year: number) => string };
  edgeTab: string;
  ruler: { label: string; afterHours: string; now: string };
  follow: (time: string, label: string) => string;
  greetings: Greeting[];
}
