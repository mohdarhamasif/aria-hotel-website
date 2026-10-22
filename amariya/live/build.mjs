// Builds the live Amariya site from the approved page in src/page.html: node build.mjs
// Output: ./site, deployed with the Vercel CLI to the project behind amariya.legitdesign.studio.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prerender } from './prerender.mjs'

const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'site'), BASE = 'https://amariya.legitdesign.studio'
const NICHES = ['hotels', 'clinics', 'dental']
const src = readFileSync(join(here, 'src/page.html'), 'utf8')
const body = src.slice(src.indexOf('<style>')) // the lines above are only for the claude.ai preview
const homeBody = readFileSync(join(here, 'src/home.html'), 'utf8')
const privacyPage = readFileSync(join(here, 'src/privacy.html'), 'utf8')
const bookedPage = readFileSync(join(here, 'src/booked.html'), 'utf8') // where visitors land after booking the call
const FONTS = ['ranade-400', 'supreme-400', 'supreme-500', 'boska-400', 'bonanova-400', 'bonanova-400-ext']
// Bona Nova is split like Google Fonts serves it: Latin, and the extended Latin range
const BONA_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF'
const BONA = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const faces = [['Ranade', 400, 'ranade-400'], ['Supreme', 400, 'supreme-400'], ['Supreme', 500, 'supreme-500'], ['Boska', 400, 'boska-400'], ['Bona Nova', 400, 'bonanova-400-ext', BONA_EXT], ['Bona Nova', 400, 'bonanova-400', BONA]]
  .map(([f, w, file, range]) => `@font-face{font-family:"${f}";font-weight:${w};font-style:normal;font-display:swap;src:url(/fonts/${file}.woff2) format("woff2")${range ? `;unicode-range:${range}` : ''}}`).join('\n')
// The footer credit on every page: "A product of" the Legit Design Studio mark and name, then the rights line.
// The mark is the studio's own logo; it takes the page's text colour, so it is light on dark pages and dark on light ones.
const LDS_MARK = '<svg viewBox="0 0 70 24" fill="none" aria-hidden="true" focusable="false"><path d="M24.0657 23.874V0.125431H34.2009C40.6763 0.125431 45.9333 5.44578 45.9333 11.9993C45.9333 18.5528 40.6763 23.8731 34.2009 23.8731H24.0657V23.874Z" fill="currentColor"/><path d="M48.1326 11.874C48.1326 5.32052 53.3895 0.000169754 59.865 0.000169754L70.0002 0.000169754C70.0002 6.55367 64.7432 11.874 58.2678 11.874H48.1326Z" fill="currentColor"/><path d="M48.1316 24C48.1316 17.4465 53.3886 12.1261 59.864 12.1261L69.9992 12.1261C69.9992 18.6796 64.7422 24 58.2668 24H48.1316Z" fill="currentColor"/><path d="M13.1206 10.5958V0.125977H0V10.5958V22.2572V23.8746H21.8676V10.5958H13.1206Z" fill="currentColor"/></svg>'
const CREDIT = `<p class="credit"><span class="credit-by">A product of <a class="credit-studio" href="https://www.legitdesign.studio" target="_blank" rel="noopener">${LDS_MARK}Legit Design Studio</a></span> <span class="credit-dot credit-join" aria-hidden="true">•</span> <span class="credit-rest">All Rights Reserved 2026 <span class="credit-dot" aria-hidden="true">•</span> <a class="credit-link" href="/privacy">Privacy</a></span></p>`
const CREDIT_CSS = `.credit { margin: 0; font-size: 13px; line-height: 1.9; color: var(--faint, var(--muted)); text-wrap: balance; }
.credit .credit-studio { display: inline-flex; align-items: center; gap: 8px; margin: 0 2px 0 6px; vertical-align: middle; color: var(--text); font-weight: 500; text-decoration: none; transition: opacity .2s; }
.credit .credit-studio:hover { opacity: .75; }
.credit .credit-studio svg { width: 29px; height: 10px; flex: none; }
.credit .credit-dot { margin: 0 4px; opacity: .7; }
.credit .credit-link { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.credit .credit-link:hover { color: var(--text); }
.credit .credit-by, .credit .credit-rest { white-space: nowrap; }
@media (max-width: 640px) { .credit .credit-join { display: none; } .credit .credit-by, .credit .credit-rest { display: block; } }`
const credit = (html, where) => {
  if (!html.includes('/*CREDIT*/') || !html.includes('<!--CREDIT-->')) throw new Error(`build: the footer credit's placeholders are missing in ${where}`)
  return html.replace('/*CREDIT*/', () => CREDIT_CSS).replace('<!--CREDIT-->', () => CREDIT)
}
// Vercel Web Analytics: funnel events go through window.va
const ANALYTICS = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }</script>
<script defer src="/_vercel/insights/script.js"></script>`

const META = {
  hotels: { crumb: 'Hotels and restaurants', kicker: 'AI receptionist for hotels and restaurants', title: 'AI Receptionist for Hotels & Restaurants, 24/7 | Amariya', desc: 'Answers every guest call in their language, day and night, books rooms and tables into your system and hands VIPs to your desk. Live in 7 days.' },
  clinics: { crumb: 'Clinics', kicker: 'AI receptionist for clinics and med spas', title: 'AI Receptionist for Clinics & Med Spas, 24/7 | Amariya', desc: 'Books consultations, takes deposits and passes anything clinical to your team, day and night, in your patients’ language. Live in 7 days.' },
  dental: { crumb: 'Dental practices', kicker: 'AI receptionist for dental practices', title: 'AI Receptionist for Dental Practices, 24/7 | Amariya', desc: 'Answers every patient call, books check-ups and urgent visits and moves appointments, in your patients’ language. Live in 7 days or a full refund.' },
}
const LOOK = {
  hotels: { bg: '#101d14', ring: ['#f3e3b5', '#bba16a', '#6f5a2c'], font: 'bonanova-400', price: 2500 },
  clinics: { bg: '#f5f7f9', ring: ['#a9c8ea', '#588cc0', '#2f445b'], font: 'ranade-400', price: 3500 },
  dental: { bg: '#fbf5f5', ring: ['#f4d6cf', '#d09e83', '#7d424e'], font: 'boska-400', price: 3000 },
}
// every plan has a one-time setup fee, paid upfront; offers list it as a second part of the price
const SETUP = 500
const withSetup = (price, monthly) => ({ '@type': 'CompoundPriceSpecification', priceCurrency: 'USD', priceComponent: [{ '@type': 'UnitPriceSpecification', name: monthly ? 'Monthly price' : 'Founding licence', price, priceCurrency: 'USD', ...(monthly ? { unitCode: 'MON' } : {}) }, { '@type': 'UnitPriceSpecification', name: 'Setup fee, paid upfront', price: SETUP, priceCurrency: 'USD' }] })
// Who makes Amariya, as published on legitdesign.studio. No founding date or ratings: the first isn't settled, the second doesn't exist yet.
const ORG = { '@type': 'Organization', '@id': 'https://www.legitdesign.studio/#organization', name: 'Legit Design Studio', legalName: 'Legit Design Studio LLC', url: 'https://www.legitdesign.studio', email: 'hello@legitdesign.studio', telephone: '+1-406-300-4254',
  address: { '@type': 'PostalAddress', streetAddress: '1001 South Main Street, STE 600', addressLocality: 'Kalispell', addressRegion: 'MT', postalCode: '59901', addressCountry: 'US' },
  sameAs: ['https://www.linkedin.com/company/legitdesignstudio', 'https://x.com/LegitDesignS', 'https://www.facebook.com/legitdesigns.studio/', 'https://www.instagram.com/legitdesign.studio', 'https://www.behance.net/legitdesignstudio', 'https://dribbble.com/legitdesignstudio', 'https://www.youtube.com/@legitdesign.studio', 'https://www.tiktok.com/@legitdesign.studio'] }
const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) })
const graph = (...nodes) => ({ '@context': 'https://schema.org', '@graph': nodes })
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c')
// The hero copy, read from the niche copy in page.html (hotels, clinics, dental in order) and written into
// each page's HTML, so the headline, intro and price are there before any script runs
const heroCopy = (key) => [...src.matchAll(new RegExp(`^\\s+${key}: (.*),$`, 'gm'))].map((m) => m[1])
const h1s = heroCopy('h1'), leads = heroCopy('lead')
if (h1s.length !== NICHES.length || leads.length !== NICHES.length) throw new Error('hero copy not found for every niche in src/page.html')
const HERO = Object.fromEntries(NICHES.map((n, i) => [n, {
  h1: JSON.parse(h1s[i].replace(/'/g, '"')).map(([w]) => w).filter((w) => w.trim()).join(' '), // ['\n'] is a line break, not a word
  lead: leads[i].slice(1, -1),
}]))
const fill = (html, from, to) => { if (!html.includes(from)) throw new Error(`build: ${from} not found in src/page.html`); return html.replace(from, () => to) }

function page(n, path) {
  const m = META[n], l = LOOK[n]
  const ld = { '@type': 'Product', name: 'Amariya', description: m.desc, brand: { '@id': ORG['@id'] }, image: `${BASE}/og-${n}.jpg`, offers: { '@type': 'Offer', price: l.price, priceCurrency: 'USD', priceSpecification: withSetup(l.price), availability: 'https://schema.org/LimitedAvailability', url: `${BASE}/${n}` } }
  return `<!doctype html>
<html lang="en" data-niche="${n}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.desc)}">
<link rel="canonical" href="${BASE}/${n}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Amariya">
<meta property="og:url" content="${BASE}${path}">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.desc)}">
<meta property="og:image" content="${BASE}/og-${n}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${l.bg}">
<link rel="icon" href="/favicon-${n}.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/supreme-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/${l.font}.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<script type="application/ld+json">${json(graph(ORG, ld, crumbs([['Amariya', BASE + '/'], [m.crumb, `${BASE}/${n}`]])))}</script>
<script src="/vendor/lenis.min.js" defer></script>
${ANALYTICS}
</head>
<body>
<script type="application/json" id="site-meta">${json(META)}</script>
${[['<h1 id="h1" tabindex="-1"></h1>', `<h1 id="h1" tabindex="-1"><span class="kicker">${esc(META[n].kicker)}</span> ${esc(HERO[n].h1)}</h1>`], ['<p class="lead" id="lead"></p>', `<p class="lead" id="lead">${esc(HERO[n].lead)}</p>`], ['<span id="price"></span>', `<span id="price">$${l.price.toLocaleString('en-US')}</span>`]]
  .reduce((html, [from, to]) => fill(html, from, to), credit(body, 'src/page.html').replace('/*FONTS*/', () => faces))}
</body>
</html>
`
}

const HOME = {
  title: 'AI Receptionist for Hotels, Clinics & Dentists | Amariya',
  desc: 'An AI receptionist that answers every call 24/7 in 30+ languages, books into your system and hands off to your team. Live in 7 days or your money back.',
  bg: '#050506', ring: ['#3e7fd8', '#86d6c4', '#e8622a'],
}
function home() {
  const founding = (name, price, niche) => ({ '@type': 'Offer', name, price, priceCurrency: 'USD', priceSpecification: withSetup(price), availability: 'https://schema.org/LimitedAvailability', url: `${BASE}/${niche}` })
  const monthly = (name, price) => ({ '@type': 'Offer', name, price, priceCurrency: 'USD', priceSpecification: withSetup(price, true), url: `${BASE}/#pricing` })
  const ld = { '@type': 'Product', name: 'Amariya', description: HOME.desc, brand: { '@id': ORG['@id'] }, image: `${BASE}/og-home.jpg`, offers: [
    founding('Founding licence for hotels and restaurants', 2500, 'hotels'),
    founding('Founding licence for clinics', 3500, 'clinics'),
    founding('Founding licence for dental practices', 3000, 'dental'),
    monthly('Starter', 299),
    monthly('Professional', 799),
  ] }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(HOME.title)}</title>
<meta name="description" content="${esc(HOME.desc)}">
<link rel="canonical" href="${BASE}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Amariya">
<meta property="og:url" content="${BASE}/">
<meta property="og:title" content="${esc(HOME.title)}">
<meta property="og:description" content="${esc(HOME.desc)}">
<meta property="og:image" content="${BASE}/og-home.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${HOME.bg}">
<link rel="icon" href="/favicon-home.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/ranade-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/supreme-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/supreme-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<script type="application/ld+json">${json(graph(ORG, { '@type': 'WebSite', name: 'Amariya', url: BASE + '/', publisher: { '@id': ORG['@id'] } }, ld))}</script>
${ANALYTICS}
</head>
<body>
${credit(homeBody, 'src/home.html').replace('/*FONTS*/', () => faces).replace('<!--LENIS-->', () => '<script src="/vendor/lenis.min.js"></script>')}
</body>
</html>
`
}

// Start from an empty site folder (keeping only the Vercel link), so nothing stale is ever deployed
mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) if (f !== '.vercel') rmSync(join(out, f), { recursive: true, force: true })
for (const n of NICHES) { mkdirSync(join(out, n), { recursive: true }); writeFileSync(join(out, n, 'index.html'), page(n, '/' + n)) }
writeFileSync(join(out, 'index.html'), home())
mkdirSync(join(out, 'privacy'), { recursive: true })
writeFileSync(join(out, 'privacy', 'index.html'), credit(privacyPage, 'src/privacy.html').replace('/*FONTS*/', () => faces))
mkdirSync(join(out, 'booked'), { recursive: true })
writeFileSync(join(out, 'booked', 'index.html'), credit(bookedPage, 'src/booked.html').replace('/*FONTS*/', () => faces).replace('<!--ANALYTICS-->', () => ANALYTICS))
mkdirSync(join(out, 'fonts'), { recursive: true })
for (const f of FONTS) copyFileSync(join(here, 'src/fonts', f + '.woff2'), join(out, 'fonts', f + '.woff2'))
mkdirSync(join(out, 'vendor'), { recursive: true })
copyFileSync(join(here, '../node_modules/lenis/dist/lenis.min.js'), join(out, 'vendor/lenis.min.js'))
// Files served as they are: the 3D world and orb scripts, the pre-rendered icons, share images and the server function
cpSync(join(here, 'src/static'), out, { recursive: true })
const favicon = (bg, ring) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ring[0]}"/><stop offset=".58" stop-color="${ring[1]}"/><stop offset="1" stop-color="${ring[2]}"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="${bg}"/><circle cx="32" cy="32" r="16.5" fill="none" stroke="url(#g)" stroke-width="6.5"/></svg>`
for (const [n, l] of Object.entries(LOOK)) writeFileSync(join(out, `favicon-${n}.svg`), favicon(l.bg, l.ring))
writeFileSync(join(out, 'favicon-home.svg'), favicon(HOME.bg, HOME.ring))
writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`)
const today = new Date().toISOString().slice(0, 10)
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', ...NICHES, 'privacy'].map((n) => `  <url><loc>${BASE}/${n}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`)
// llms.txt: a plain summary for AI tools (llmstxt.org), from the same facts as the pages
writeFileSync(join(out, 'llms.txt'), `# Amariya\n\n> ${HOME.desc}\n\nAmariya is an AI voice receptionist by Legit Design Studio (https://www.legitdesign.studio). She tells callers she is an AI in her first sentence, answers in 30+ languages, books into the business's own system and hands calls or summaries to staff.\n\n## Pages\n\n- [Amariya](${BASE}/): overview, pricing and questions for all niches\n${NICHES.map((n) => `- [${META[n].kicker}](${BASE}/${n}): ${META[n].desc}`).join('\n')}\n- [Privacy](${BASE}/privacy)\n\n## Pricing\n\n- Founding licence, paid once, for the first 30 businesses in each niche: $2,500 hotels and restaurants, $3,500 clinics, $3,000 dental practices\n- Monthly: Starter $299, Professional $799, Enterprise priced on a call\n- Every plan has a one-time $500 setup fee, paid upfront\n- Live in 7 days or a full refund, then 7 days to change your mind\n\n## Contact\n\n- marketing@legitdesign.studio\n`)
writeFileSync(join(out, 'vercel.json'), JSON.stringify({
  cleanUrls: true,
  trailingSlash: false,
  redirects: [{ source: '/aesthetics', destination: '/clinics', permanent: true }, { source: '/aesthetics/:path*', destination: '/clinics', permanent: true }],
  headers: [
    { source: '/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/(icons|vendor)/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
    { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' }] },
  ],
}, null, 2))
// The full text and figures go into the HTML for crawlers (see prerender.mjs); --no-prerender skips it for a quick local build
if (process.argv.includes('--no-prerender')) console.warn('NOT pre-rendered: do not deploy this build')
else await prerender(out, [['/', 'index.html'], ...NICHES.map((n) => [`/${n}`, `${n}/index.html`])])
// Deploys go to the existing project behind the domain (link once with: cd site && npx vercel link --project aria-hotel-website --scope legitdesignstudio)
console.log('built', out)
