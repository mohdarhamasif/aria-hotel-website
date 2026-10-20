// Checks the built homepage in headless Chrome: node test/home.check.mjs [only]
// `only` runs just the checks whose names contain it. Add a check with check(name, async (page, errors) => ...).
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('C:/projects/aria-hotel-website/amariya/tests/browser/package.json')
const puppeteer = require('puppeteer-core')
const here = dirname(fileURLToPath(import.meta.url)), site = join(here, '../site')
const PORT = 4321, URL_BASE = `http://127.0.0.1:${PORT}`
const only = process.argv[2]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const assert = (ok, msg) => { if (!ok) throw new Error(msg) }

const checks = []
const check = (name, fn) => checks.push([name, fn])
const open = async (page, path, w = 1440, h = 900) => {
  await page.setViewport({ width: w, height: h })
  await page.goto(URL_BASE + path, { waitUntil: 'networkidle0', timeout: 120000 })
}
const get = async (path) => (await fetch(URL_BASE + path)).text()

check('home: title', async (page) => {
  await open(page, '/')
  const t = await page.title()
  assert(t === 'Amariya · AI receptionist for hotels, restaurants, clinics and dental practices', `title is "${t}"`)
})
check('home: canonical', async (page) => {
  await open(page, '/')
  const href = await page.$eval('link[rel=canonical]', (e) => e.getAttribute('href')).catch(() => null)
  assert(href === 'https://amariya.legitdesign.studio/', `canonical is ${href}`)
})
check('home: fonts', async (page) => {
  await open(page, '/')
  const status = await page.evaluate(async () => {
    await document.fonts.ready
    const out = {}
    for (const f of ['Supreme', 'Ranade']) out[f] = [...document.fonts].filter((x) => x.family.replace(/"/g, '') === f).map((x) => x.status)
    return out
  })
  for (const [f, s] of Object.entries(status)) assert(s.length && s.includes('loaded'), `${f} faces: ${JSON.stringify(s)}`)
})
check('home: no errors', async (page, errors) => {
  await open(page, '/')
  await wait(4000)
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  for (let i = 1; i <= 12; i++) { await page.evaluate((y) => scrollTo(0, y), Math.round((max * i) / 12)); await wait(600) }
  assert(!errors.length, errors.join(' | '))
})
check('home: no sideways scroll', async (page) => {
  for (const [w, h] of [[1440, 900], [390, 844], [375, 667]]) {
    await open(page, '/', w, h)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    assert(over === 0, `${w}px wide overflows by ${over}px`)
  }
})
check('niche pages', async (page) => {
  for (const n of ['hotels', 'clinics', 'dental']) {
    await open(page, '/' + n)
    const got = await page.evaluate(() => document.documentElement.dataset.niche)
    assert(got === n, `/${n} has data-niche ${got}`)
  }
})
check('sitemap', async () => {
  assert((await get('/sitemap.xml')).includes('<loc>https://amariya.legitdesign.studio/</loc>'), 'homepage missing from sitemap')
})

// ---------- Voice, text chat and the shared application ----------
const SAM = { name: 'Sam Lee', hotel_name: 'Harbour House', email: 'sam@example.com', phone: '+44 20 7946 0000', business_type: 'hotel' }
const blockSdk = async (page) => {
  await page.setRequestInterception(true)
  page.on('request', (r) => (r.url().includes('@elevenlabs/client') ? r.abort() : r.continue()))
}
const fillAndOpen = async (page) => {
  const reply = await page.evaluate((s) => TOOLS.fill_demo_form(s), SAM)
  await page.evaluate(() => document.querySelector('.js-apply').click())
  return reply
}
check('voice: navigate', async (page) => {
  await open(page, '/')
  const reply = await page.evaluate(() => TOOLS.navigate_to_section({ section: 'pricing' }))
  assert(reply === 'Now showing pricing.', `reply was "${reply}"`)
  await wait(1800)
  // The 1.4 s glide runs on animation frames, which are slow under software WebGL, so allow it to land
  await page.waitForFunction(() => { const y = document.querySelector('#pricing').getBoundingClientRect().top; return y >= -10 && y <= 200 }, { timeout: 8000 })
    .catch(async () => { throw new Error(`#pricing top is ${await page.evaluate(() => document.querySelector('#pricing').getBoundingClientRect().top)}`) })
})
check('voice: unknown section', async (page) => {
  await open(page, '/')
  const reply = await page.evaluate(() => TOOLS.navigate_to_section({ section: 'zzz' }))
  assert(reply === 'Unknown section. Use one of: top, story, problem, demo, features, setup, pricing, questions.', `reply was "${reply}"`)
})
check('voice: fill form', async (page) => {
  await open(page, '/')
  const reply = await fillAndOpen(page)
  assert(reply.endsWith('Everything needed is in.'), `reply was "${reply}"`)
  const v = await page.evaluate(() => ({ business: document.querySelector('#business').value, kind: document.querySelector('#kind').value, open: document.querySelector('#apply').open }))
  assert(v.open && v.business === 'Harbour House' && v.kind === 'hotel', `step 1 holds ${JSON.stringify(v)}`)
  await page.evaluate(() => { document.querySelector('#next').click(); document.querySelector('#next').click() })
  const s3 = await page.evaluate(() => ({ shown: !document.querySelector('[data-step="3"]').hidden, name: document.querySelector('#name').value, email: document.querySelector('#email').value, phone: document.querySelector('#phone').value }))
  assert(s3.shown && s3.name === 'Sam Lee' && s3.email === 'sam@example.com' && s3.phone === '+44 20 7946 0000', `step 3 holds ${JSON.stringify(s3)}`)
})
check('voice: submit', async (page) => {
  await open(page, '/')
  const early = await page.evaluate(() => TOOLS.submit_demo_request())
  assert(early.startsWith('Cannot submit yet. Missing: name, hotel_name, email.'), `early reply was "${early}"`)
  await page.evaluate((s) => TOOLS.fill_demo_form(s), SAM)
  // With no webhook set, nothing can be sent, so the agent must say so rather than claim it was recorded
  const reply = await page.evaluate(() => TOOLS.submit_demo_request())
  assert(reply.startsWith('The application did not go through.'), `reply was "${reply}"`)
})
check('apply: errors and failed send', async (page) => {
  await open(page, '/')
  await page.evaluate(() => document.querySelector('.js-apply').click())
  await page.evaluate(() => document.querySelector('#next').click())
  const e1 = await page.evaluate(() => { const b = document.querySelector('#business'); return { err: document.querySelector('#businessErr').textContent, invalid: b.getAttribute('aria-invalid'), described: b.getAttribute('aria-describedby'), focused: document.activeElement === b } })
  assert(e1.err === 'Add your business name.' && e1.invalid === 'true' && e1.described === 'businessErr' && e1.focused, `step 1 error ${JSON.stringify(e1)}`)
  await page.type('#business', 'Harbour House')
  await page.evaluate(() => { document.querySelector('#next').click(); document.querySelector('#next').click() })
  await page.type('#name', 'Sam Lee'); await page.type('#email', 'sam@example.com')
  await page.evaluate(() => document.querySelector('#next').click())
  await page.waitForFunction(() => !document.querySelector('#applyError').hidden, { timeout: 4000 })
  const r = await page.evaluate(() => ({ text: document.querySelector('#applyError').textContent, href: document.querySelector('#applyError a')?.getAttribute('href') || '', step3: !document.querySelector('[data-step="3"]').hidden, next: document.querySelector('#next').textContent }))
  assert(r.text.startsWith('We couldn’t send your application.') && r.step3 && r.next === 'Send application', `failed send ${JSON.stringify(r)}`)
  assert(r.href.startsWith('mailto:marketing@legitdesign.studio?subject=') && decodeURIComponent(r.href).includes('Business: Harbour House'), `mailto ${r.href}`)
})
check('apply: phone is optional', async (page) => {
  await open(page, '/')
  await page.evaluate(() => { document.querySelector('.js-apply').click(); go(3) })
  await page.type('#name', 'Sam Lee'); await page.type('#email', 'sam@example.com'); await page.type('#phone', '12')
  assert(!(await page.evaluate(() => check(3))), 'a 2-digit phone passed')
  await page.evaluate(() => { document.querySelector('#phone').value = '' })
  assert(await page.evaluate(() => check(3)), 'an empty phone was rejected')
})
check('seats and privacy', async (page) => {
  await open(page, '/')
  const s = await page.evaluate(() => ({ open: document.querySelector('#seatsOpen').textContent, taken: document.querySelectorAll('#dots i.taken').length, privacy: !!document.querySelector('.footer-meta a[href="/privacy"]'), skip: document.querySelector('.skip')?.getAttribute('href') }))
  assert(s.open === '30' && s.taken === 0 && s.privacy && s.skip === '#heroTitle', `homepage ${JSON.stringify(s)}`)
  const p = await get('/privacy')
  assert(p.includes('<h1>Privacy</h1>') && p.includes('ElevenLabs'), 'privacy page missing')
  for (const n of ['hotels', 'clinics', 'dental']) {
    const html = await get('/' + n)
    assert(/<h1 id="h1" tabindex="-1">[^<]+<\/h1>/.test(html), `/${n} has no headline in its HTML`)
    assert(!html.includes('cdn.jsdelivr.net/npm/three'), `/${n} still loads three.js from the CDN`)
  }
})
check('voice: tools', async (page) => {
  await open(page, '/')
  assert((await page.evaluate(() => TOOLS.highlight_feature({ feature: 'zzz' }))) === 'Unknown feature. Use: answering, bookings, multilingual, guest_requests, after_hours, integrations.', 'unknown feature reply')
  await page.evaluate(() => TOOLS.highlight_feature({ feature: 'after_hours' }))
  const spot = await page.evaluate(() => [...document.querySelectorAll('#orbit .pill')].map((p) => p.classList.contains('spot')))
  assert(JSON.stringify(spot) === '[false,false,false,false,true]', `spot classes ${JSON.stringify(spot)}`)
  await page.evaluate(() => TOOLS.update_business_profile({ business_type: 'dental' }))
  const plan = await page.evaluate(() => TOOLS.recommend_plan())
  assert(plan === 'Two ways to pay: the founding licence at $3,000 once for the first 30 dental practices, or monthly plans from $299. Showing pricing now.', `plan reply "${plan}"`)
  const pressed = await page.evaluate(() => document.querySelector('#priceTabs [aria-pressed="true"]').dataset.n)
  assert(pressed === 'dental', `pressed tab ${pressed}`)
  const roi = await page.evaluate(() => TOOLS.get_roi_estimate())
  assert(roi.startsWith('Ask how many calls'), `roi reply "${roi}"`)
})
check('voice: navigate with dialog open', async (page) => {
  await open(page, '/')
  await page.evaluate(() => document.querySelector('.js-apply').click())
  const reply = await page.evaluate(() => TOOLS.navigate_to_section({ section: 'faq' }))
  assert(reply === 'Now showing faq.', `reply was "${reply}"`)
  await page.waitForFunction(() => Math.abs(document.querySelector('#faq').getBoundingClientRect().top) < 40, { timeout: 8000 })
})
check('voice: plan matching and mic label', async (page) => {
  await open(page, '/')
  await page.evaluate(() => TOOLS.update_business_profile({ business_type: 'Aesthetics clinic' }))
  await page.evaluate(() => TOOLS.recommend_plan())
  assert((await page.evaluate(() => document.querySelector('#priceTabs [aria-pressed="true"]').dataset.n)) === 'clinics', 'aesthetics clinic did not pick the clinics tab')
  await page.evaluate(() => TOOLS.update_business_profile({ business_type: 'Hotels' }))
  await page.evaluate(() => TOOLS.recommend_plan())
  assert((await page.evaluate(() => document.querySelector('#priceTabs [aria-pressed="true"]').dataset.n)) === 'hospitality', 'Hotels did not pick hospitality')
  await page.evaluate(() => { convo = {}; setDock('listening', 'Listening', '') })
  const labels = await page.evaluate(() => [document.querySelector('#dockMic').getAttribute('aria-label'), document.querySelector('#dockOrb').getAttribute('aria-label')])
  assert(labels.every((l) => l === 'End the conversation'), `labels ${labels}`)
})
check('voice: orb states', async (page) => {
  await open(page, '/')
  await page.evaluate(() => setDock('speaking', 'Amariya is speaking', 'Hello'))
  await wait(1500)
  const s = await page.evaluate(() => ({ speaking: states.speaking, idle: states.listening, attr: document.querySelector('#dock').dataset.state }))
  assert(s.attr === 'speaking' && s.speaking > 0.8 && s.idle < 0.1, `states ${JSON.stringify(s)}`)
  await page.evaluate(() => setDock('idle'))
  await wait(1500)
  assert((await page.evaluate(() => states.speaking)) < 0.1, 'speaking state did not fall back')
})
check('voice: no agent', async (page, errors) => {
  await blockSdk(page)
  await open(page, '/')
  await page.click('#dockKeys')
  await page.waitForFunction(() => document.querySelector('#dockStatus').textContent === 'Couldn’t connect', { timeout: 4000 })
  assert(!errors.some((e) => e.startsWith('pageerror')), errors.join(' | '))
})
check('voice: mic denied', async (page, errors) => {
  await blockSdk(page)
  await open(page, '/')
  await page.browserContext().overridePermissions(URL_BASE, [])
  await page.click('#dockMic')
  await page.waitForFunction(() => document.querySelector('#dock').dataset.mode === 'text' || document.querySelector('#dockStatus').textContent === 'Couldn’t connect', { timeout: 4000 })
  assert(!errors.some((e) => e.startsWith('pageerror')), errors.join(' | '))
})
check('voice: dock fits', async (page) => {
  await open(page, '/', 375, 667)
  await page.evaluate(() => { document.querySelector('#dock').dataset.mode = 'text' })
  const m = await page.evaluate(() => {
    const d = document.querySelector('#dock'), f = document.querySelector('#dockForm').getBoundingClientRect()
    return { sw: d.scrollWidth, cw: d.clientWidth, form: f.width, over: document.documentElement.scrollWidth - innerWidth, inView: d.getBoundingClientRect().right <= innerWidth }
  })
  assert(m.form > 100, `text field is ${m.form}px wide`)
  assert(m.sw <= m.cw && m.over === 0 && m.inView, `dock ${JSON.stringify(m)}`)
})
check('voice: no preview note', async () => {
  assert(!(await get('/')).includes('Voice opens on the live page'), 'preview note still in the page')
})

const server = spawn(process.execPath, [join(here, 'serve.mjs'), site, String(PORT)], { stdio: 'ignore' })
let browser, failed = 0
try {
  for (let i = 0; i < 50; i++) { if (await fetch(URL_BASE + '/robots.txt').then(() => true, () => false)) break; await wait(100) }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
  for (const [name, fn] of checks) {
    if (only && !name.includes(only)) continue
    const page = await browser.newPage(), errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)))
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 300)))
    try { await fn(page, errors); console.log('PASS', name) } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`) } finally { await page.close() }
  }
  if (!only) {
    const page = await browser.newPage()
    try { await open(page, '/', 1200, 630); await wait(4000); await page.evaluate(() => { document.querySelector('#dock').style.visibility = 'hidden' }); await page.screenshot({ path: join(site, 'og-home.jpg'), type: 'jpeg', quality: 82 }) } finally { await page.close() }
  }
} catch (e) { failed++; console.log('FAIL harness:', e.message) } finally {
  if (browser) await browser.close()
  server.kill()
}
process.exit(failed ? 1 : 0)
