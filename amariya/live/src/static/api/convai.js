// Gives the Amariya pages a one-time pass to talk to the ElevenLabs agent, so the API key stays on the server.
// Voice gets a conversation token (WebRTC), text gets a signed URL (websocket). Only the site's own pages may ask.
const AGENT_ID = 'agent_9101m3n1hwxffey830jzf43chj6x'
const SITE = 'https://amariya.legitdesign.studio'

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (req.headers.origin !== SITE) return res.status(403).json({ error: 'Not allowed' })
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return res.status(500).json({ error: 'Not configured' })
  const text = req.query.mode === 'text'
  const url = `https://api.elevenlabs.io/v1/convai/conversation/${text ? 'get-signed-url' : 'token'}?agent_id=${AGENT_ID}`
  try {
    const r = await fetch(url, { headers: { 'xi-api-key': key } })
    // ElevenLabs' own reason (never the key) helps fix a key that lacks a permission
    if (!r.ok) { const d = await r.json().catch(() => ({})); return res.status(502).json({ error: `ElevenLabs answered ${r.status}`, reason: String(d.detail?.status || ''), message: String(d.detail?.message || d.detail || '').slice(0, 200) }) }
    const data = await r.json()
    return res.status(200).json(text ? { signedUrl: data.signed_url } : { conversationToken: data.token })
  } catch {
    return res.status(502).json({ error: 'ElevenLabs could not be reached' })
  }
}
