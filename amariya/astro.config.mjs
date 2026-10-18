// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// Fonts are downloaded at build time and self-hosted. Each page loads only the families it uses (see Base.astro).
// Upright styles only, and only the weights spec/typography.md lists: the type system has no italics and no faux bold.
// Fontshare's files (ITF FFL v2.0) are copied as served: never subset or convert them.
export default defineConfig({
  site: 'https://aria-hotel-website.vercel.app',
  // One entry covers /aesthetics and /aesthetics/ (Astro treats them as the same route)
  redirects: { '/aesthetics': '/clinics' },
  fonts: [
    { provider: fontProviders.fontshare(), name: 'Supreme', cssVariable: '--font-body', weights: [400, 500], styles: ['normal'], fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'] },
    { provider: fontProviders.fontshare(), name: 'Ranade', cssVariable: '--font-brand', weights: [500], styles: ['normal'], fallbacks: ['ui-sans-serif', 'sans-serif'] },
    // Hotels: Bona Nova (oldstyle figures by default) and its small-caps family (Google strips smcp from Bona Nova)
    { provider: fontProviders.google(), name: 'Bona Nova', cssVariable: '--font-display-hospitality', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], fallbacks: ['Georgia', 'serif'] },
    { provider: fontProviders.google(), name: 'Bona Nova SC', cssVariable: '--font-smallcaps-hospitality', weights: [400], styles: ['normal'], subsets: ['latin'], fallbacks: ['Georgia', 'serif'] },
    // Clinics: Source Serif 4 with its whole optical-size axis, so headings get the display cut (Google serves the text
    // cut without it); Azeret Mono for the chart's data
    { provider: fontProviders.google(), name: 'Source Serif 4', cssVariable: '--font-display-clinics', weights: [300, 400], styles: ['normal'], subsets: ['latin'], fallbacks: ['Georgia', 'serif'], options: { experimental: { variableAxis: { opsz: [['8', '60']] } } } },
    { provider: fontProviders.fontshare(), name: 'Azeret Mono', cssVariable: '--font-mono', weights: [400, 500], styles: ['normal'], fallbacks: ['ui-monospace', 'monospace'] },
    // Dental: Boska for display and utility (real small caps, lining and tabular figures)
    { provider: fontProviders.fontshare(), name: 'Boska', cssVariable: '--font-display-dental', weights: [400, 500], styles: ['normal'], fallbacks: ['Georgia', 'serif'] },
    // Greetings in other scripts (loaded without preload, only where the page lists them)
    { provider: fontProviders.google(), name: 'Noto Naskh Arabic', cssVariable: '--font-arabic', weights: [400], styles: ['normal'], subsets: ['arabic'], fallbacks: ['serif'] },
    { provider: fontProviders.google(), name: 'Noto Sans JP', cssVariable: '--font-jp', weights: [400], styles: ['normal'], subsets: ['japanese', 'latin'], fallbacks: ['sans-serif'] },
  ],
  vite: {
    // ponytail: the one chunk past Vite's 500 kB advice is the ElevenLabs voice client (~590 kB minified), imported only
    // when a visitor starts a conversation; the ceiling sits just above it, so any other chunk that grows that big still warns
    build: { chunkSizeWarningLimit: 640 },
  },
});
