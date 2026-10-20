// Runs the orb (orb.js) and the 3D world (world.js) off the page's main thread. It first says whether
// WebGL works here; if not, the page runs them itself. The orb starts at once; the world joins when
// three.js has arrived, so the hero is whole while the building is still on its way.
import { ParticleOrb, orbPoints, ORB_PAL } from './orb.js'

// Is there WebGL at all, and is it on a GPU? Without one (software rendering), building the world takes
// seconds of every core and then crawls, so the page shows the orb without the building instead.
const probe = (o) => {
  try {
    const c = new OffscreenCanvas(1, 1), gl = c.getContext('webgl2', o) || c.getContext('webgl', o)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch { return false }
}
const webgl = probe(), gpu = webgl && probe({ failIfMajorPerformanceCaveat: true })
postMessage({ type: 'probe', ok: webgl })

let orb = null, world = null, worldState = gpu ? 'loading' : 'none', niche = null, size = null
const fail = (err) => postMessage({ type: 'fail', message: err.message })
const orbSize = (m) => { const d = Math.min(m.dpr, 2); orb?.size(Math.round(m.ow * d), Math.round(m.oh * d), d) }
onmessage = ({ data: m }) => {
  try {
    if (m.type === 'init') {
      niche = m.niche; size = m
      try { orb = new ParticleOrb(m.orbCanvas, m.w < 735 ? 11000 : 26000); orbSize(m); orb.setPoints(orbPoints(orb.count, ORB_PAL[niche])) } catch (err) { orb = null; fail(err) }
      if (gpu) import('./world.js').then((w) => { w.init({ ...m, ...size }); w.setNiche(niche); world = w; worldState = 'ready' }).catch((err) => { worldState = 'none'; fail(err) })
    } else if (m.type === 'niche') {
      niche = m.niche
      orb?.setPoints(orbPoints(orb.count, ORB_PAL[niche]))
      world?.setNiche(niche)
    } else if (m.type === 'size') {
      size = m; orbSize(m); world?.setSize(m.w, m.h, m.dpr)
    } else if (m.type === 'frame') {
      world?.frame(m)
      orb?.draw(m.draw)
    }
  } catch (err) { fail(err) }
  if (m.type === 'frame') postMessage({ type: 'frame', niche, world: worldState })
}
