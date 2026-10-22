// Sends each Amariya application to HubSpot, so the token stays on the server: a contact (created, or updated
// when the email is already known) and a deal linked to it, with every answer in the deal's description.
// Takes the homepage form, the niche page form and the agent's applications. Only the site's own pages may send.
const SITE = 'https://amariya.legitdesign.studio'
const API = 'https://api.hubapi.com'
const PLANS = { founding: 'Founding licence', starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' }
const FOUNDING = { hotels: 2500, clinics: 3500, dental: 3000 }
const MONTHLY = { starter: 299, professional: 799 }
const SETUP = 500 // one-time, paid upfront, on every plan

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max)
// The homepage asks for a business type, the niche pages know their niche
function nicheOf(d) {
  const n = str(d.niche || d.kind || d.business_type, 40).toLowerCase()
  return /^(hotel|restaurant)/.test(n) ? 'hotels' : /^(clinic|aesth)/.test(n) ? 'clinics' : /^dent/.test(n) ? 'dental' : ''
}
function details(d, niche) {
  const rows = [
    ['Setup fee', `$${SETUP}, paid upfront`], ['Plan', PLANS[str(d.program || d.plan, 20)] || str(d.program || d.plan, 40)], ['Niche', niche], ['Business type', d.kind || d.business_type],
    ['Locations', d.locations], ['Rooms, practitioners or chairs', d.rooms], ['Calls per month', d.calls || d.monthly_calls],
    ['Calls go unanswered', [].concat(d.missed || []).join(', ')], ['Booking or practice software', d.software],
    ['Good time for a call', d.preferred_time], ['Notes', d.notes], ['Country', d.country],
    ['Sent from', `${str(d.source, 20) || 'form'} on ${str(d.page, 200)}`], ['Conversation ID', d.conversation_id],
  ]
  if (d.profile && typeof d.profile === 'object') for (const [k, v] of Object.entries(d.profile)) rows.push([`Profile: ${str(k, 40)}`, v])
  return rows.map(([k, v]) => [k, str(v, 2000)]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
}

async function hubspot(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}
// The first stage of the deals pipeline, looked up once per server start (pipelines can be renamed in HubSpot)
let stage = null
async function firstStage(token) {
  if (stage) return stage
  const r = await hubspot(token, 'GET', '/crm/v3/pipelines/deals')
  const p = r.ok && (r.data.results || []).sort((a, b) => a.displayOrder - b.displayOrder)[0]
  const s = p && (p.stages || []).sort((a, b) => a.displayOrder - b.displayOrder)[0]
  if (!s) throw new Error(`pipelines ${r.status}`)
  return (stage = { pipeline: p.id, dealstage: s.id })
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (req.headers.origin !== SITE) return res.status(403).json({ error: 'Not allowed' })
  const token = process.env.HUBSPOT_TOKEN
  if (!token) return res.status(500).json({ error: 'Not configured' })
  const d = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  // A hidden field people never see; anything in it came from a bot, which gets a quiet yes and nothing else
  if (str(d.website)) return res.status(200).json({ ok: true })

  const email = str(d.email, 200).toLowerCase(), name = str(d.name, 120), business = str(d.business || d.hotel_name, 200)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !business) return res.status(400).json({ error: 'Name, business and a valid email are needed' })
  const niche = nicheOf(d), plan = PLANS[str(d.program || d.plan, 20)] ? str(d.program || d.plan, 20) : 'founding'
  const [firstname, ...rest] = name.split(/\s+/)
  const contact = Object.fromEntries(Object.entries({ email, firstname, lastname: rest.join(' '), phone: str(d.phone, 40), company: business, country: str(d.country, 80) }).filter(([, v]) => v))

  try {
    // A new contact, or the existing one updated: HubSpot answers 409 with the existing ID when the email is known
    let c = await hubspot(token, 'POST', '/crm/v3/objects/contacts', { properties: contact })
    let contactId = c.data.id
    if (c.status === 409) {
      contactId = String(c.data.message || '').match(/Existing ID: (\d+)/)?.[1]
      if (contactId) c = await hubspot(token, 'PATCH', `/crm/v3/objects/contacts/${contactId}`, { properties: contact })
    }
    if (!c.ok || !contactId) return res.status(502).json({ error: `HubSpot contact ${c.status}`, message: str(c.data.message, 200) })

    // the founding licence's amount is what is paid upfront (licence and setup); monthly plans keep their monthly price, with the setup fee in the description
    const amount = plan === 'founding' ? FOUNDING[niche] && FOUNDING[niche] + SETUP : MONTHLY[plan]
    const deal = await hubspot(token, 'POST', '/crm/v3/objects/deals', {
      properties: { dealname: `Amariya · ${PLANS[plan]} · ${business}`.slice(0, 250), description: details(d, niche), ...(amount ? { amount: String(amount) } : {}), ...(await firstStage(token)) },
      associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }],
    })
    if (!deal.ok) return res.status(502).json({ error: `HubSpot deal ${deal.status}`, message: str(deal.data.message, 200) })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(502).json({ error: 'HubSpot could not be reached', message: str(e.message, 200) })
  }
}
