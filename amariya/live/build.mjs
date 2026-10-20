// Builds the live Amariya site from the approved page in src/page.html: node build.mjs
// Output: ./site, deployed with the Vercel CLI to the project behind amariya.legitdesign.studio.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
// Vercel Web Analytics: funnel events go through window.va
const ANALYTICS = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }</script>
<script defer src="/_vercel/insights/script.js"></script>`

const META = {
  hotels: { title: 'Amariya · AI receptionist for hotels and restaurants', desc: 'Amariya answers every call, day and night, books rooms and tables straight into your system and speaks your guests’ language. A founding licence for the first 30 hotels and restaurants.' },
  clinics: { title: 'Amariya · AI receptionist for clinics', desc: 'Amariya answers every call, books consultations and appointments, sends deposit links and passes anything clinical to your team. A founding licence for the first 30 clinics.' },
  dental: { title: 'Amariya · AI receptionist for dental practices', desc: 'Amariya answers every call, books check-ups and urgent visits and moves appointments, in your patients’ language. A founding licence for the first 30 dental practices.' },
}
const LOOK = {
  hotels: { bg: '#101d14', ring: ['#f3e3b5', '#bba16a', '#6f5a2c'], font: 'bonanova-400', price: 2500 },
  clinics: { bg: '#f5f7f9', ring: ['#a9c8ea', '#588cc0', '#2f445b'], font: 'ranade-400', price: 3500 },
  dental: { bg: '#fbf5f5', ring: ['#f4d6cf', '#d09e83', '#7d424e'], font: 'boska-400', price: 3000 },
}
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
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: 'Amariya', description: m.desc, brand: { '@type': 'Brand', name: 'Legit Design Studio' }, offers: { '@type': 'Offer', price: l.price, priceCurrency: 'USD', availability: 'https://schema.org/LimitedAvailability', url: `${BASE}/${n}` } }
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
<script type="application/ld+json">${json(ld)}</script>
<script src="/vendor/lenis.min.js" defer></script>
${ANALYTICS}
</head>
<body>
<script type="application/json" id="site-meta">${json(META)}</script>
${[['<h1 id="h1" tabindex="-1"></h1>', `<h1 id="h1" tabindex="-1">${esc(HERO[n].h1)}</h1>`], ['<p class="lead" id="lead"></p>', `<p class="lead" id="lead">${esc(HERO[n].lead)}</p>`], ['<span id="price"></span>', `<span id="price">$${l.price.toLocaleString('en-US')}</span>`]]
  .reduce((html, [from, to]) => fill(html, from, to), body.replace('/*FONTS*/', () => faces))}
</body>
</html>
`
}

const HOME = {
  title: 'Amariya · AI receptionist for hotels, restaurants, clinics and dental practices',
  desc: 'Amariya answers every call, books into your system and hands over to your team, in your callers’ language. A founding licence for the first 30 businesses in each niche, or monthly plans from $299.',
  bg: '#050506', ring: ['#3e7fd8', '#86d6c4', '#e8622a'],
}
function home() {
  const founding = (name, price, niche) => ({ '@type': 'Offer', name, price, priceCurrency: 'USD', availability: 'https://schema.org/LimitedAvailability', url: `${BASE}/${niche}` })
  const monthly = (name, price) => ({ '@type': 'Offer', name, price, priceCurrency: 'USD', priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'USD', unitCode: 'MON' }, url: `${BASE}/#pricing` })
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: 'Amariya', description: HOME.desc, brand: { '@type': 'Brand', name: 'Legit Design Studio' }, image: `${BASE}/og-home.jpg`, offers: [
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
<script type="application/ld+json">${json(ld)}</script>
${ANALYTICS}
</head>
<body>
${homeBody.replace('/*FONTS*/', () => faces).replace('<!--LENIS-->', () => '<script src="/vendor/lenis.min.js"></script>')}
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
writeFileSync(join(out, 'privacy', 'index.html'), privacyPage.replace('/*FONTS*/', () => faces))
mkdirSync(join(out, 'booked'), { recursive: true })
writeFileSync(join(out, 'booked', 'index.html'), bookedPage.replace('/*FONTS*/', () => faces).replace('<!--ANALYTICS-->', () => ANALYTICS))
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
writeFileSync(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', ...NICHES, 'privacy'].map((n) => `  <url><loc>${BASE}/${n}</loc></url>`).join('\n')}\n</urlset>\n`)
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
// Deploys go to the existing project behind the domain (link once with: cd site && npx vercel link --project aria-hotel-website --scope legitdesignstudio)
console.log('built', out)
