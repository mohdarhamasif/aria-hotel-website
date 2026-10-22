// Pre-renders the built pages, so search engines, AI tools and link previews get the full text and the real
// figures instead of empty containers: each page runs once in Chrome and the content its code fills in is
// written back into the HTML. Visitors see no difference; the page's code still runs and fills the same content.
// Needs Chrome (CHROME_PATH, or the default Windows install) and puppeteer-core from ../tests/browser.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Never baked in: canvases, live states, form messages, the calendar and the room tags that float over the 3D world
const SKIP = new Set(['world', 'veil', 'orbfx', 'tags', 'booking', 'demoError', 'doneText', 'applyError', 'featureNote', 'thread', 'toast'])
// Filled by code although not empty in the source: the plan scale (it holds the 'you' marker) and the savings figures
const EXTRA = ['id="tiers"', 'data-roi="recovered"', 'data-roi="revenue"', 'data-roi="hours"']

// Replaces the inner HTML of the one tag carrying `attr` (like id="qs"), counting nested tags of the same name.
// Only real tags count, so the same text inside a script (a selector, say) is ignored.
export function replaceInner(html, attr, inner) {
  const found = [...html.matchAll(new RegExp(`<([a-z][a-z0-9]*)\\b[^<>]*\\s${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s/>]`, 'gi'))]
  if (found.length !== 1) throw new Error(`prerender: ${attr} must be on exactly one tag, found ${found.length}`)
  const name = found[0][1], start = html.indexOf('>', found[0].index) + 1
  const tag = new RegExp(`<(/?)${name}(?=[\\s>])`, 'gi')
  tag.lastIndex = start
  for (let depth = 1, m; (m = tag.exec(html));) if ((depth += m[1] ? -1 : 1) === 0) return html.slice(0, start) + inner + html.slice(m.index)
  throw new Error(`prerender: no closing </${name}> for ${attr}`)
}

export async function prerender(out, pages) {
  const require = createRequire(new URL('../tests/browser/package.json', import.meta.url))
  const puppeteer = require('puppeteer-core')
  const port = 4300 + Math.floor(Math.random() * 90), base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, [fileURLToPath(new URL('./test/serve.mjs', import.meta.url)), out, String(port)], { stdio: 'ignore' })
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' })
  try {
    for (let i = 0; i < 50 && !(await fetch(base + '/robots.txt').then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 100))
    for (const [path, file] of pages) {
      let html = readFileSync(join(out, file), 'utf8')
      // the containers that are empty in the HTML, found by their id or data-list
      const empty = [...html.matchAll(/<(\w+)\b[^>]*?\b((?:id|data-list)="[^"]+")[^>]*><\/\1>/g)].map((m) => m[2]).filter((a) => !SKIP.has(a.slice(4, -1)))
      const targets = [...empty, ...EXTRA.filter((a) => html.includes(a))]
      const page = await browser.newPage()
      // reduced motion: figures land at once instead of counting up
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction(() => document.querySelector('#qs')?.children.length > 0 && [...document.querySelectorAll('[data-roi]')].every((b) => b.dataset.value), { timeout: 30000 })
      const filled = await page.evaluate((targets) => targets.map((a) => document.querySelector(`[${a}]`)?.innerHTML.trim() ?? ''), targets)
      const faq = await page.evaluate(() => [...document.querySelectorAll('#qs details')].map((d) => [d.querySelector('summary')?.textContent.trim(), d.querySelector('p')?.textContent.trim()]).filter(([q, a]) => q && a))
      await page.close()
      targets.forEach((a, i) => { if (filled[i]) html = replaceInner(html, a, filled[i]) })
      // the questions as FAQPage data, from the same rendered questions visitors read
      const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
      if (faq.length) html = html.replace('</head>', () => `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>\n</head>`)
      // self-check: the figures and the questions are in the HTML now
      if (/data-roi="[a-z]+">\$?0</.test(html) || !/id="qs"[^>]*>\s*<details/.test(html)) throw new Error(`prerender: ${path} still has empty figures or questions`)
      writeFileSync(join(out, file), html)
    }
  } finally { await browser.close(); server.kill() }
}
