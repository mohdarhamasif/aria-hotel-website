// The 3D world: a model of the customer's own building (the orb above it is orb.js).
// The page works out the camera, then sends each frame here to be drawn.
// This runs in a worker (world-worker.js) where the browser allows WebGL there, so building and drawing
// the world never holds up the page; otherwise the page imports it and runs it itself.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm'
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js/+esm'
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js/+esm'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
function seeded(s) { return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const canvas2d = (w, h) => typeof document === 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
let renderer, scene, camera, reduce = false, vw = 1440, hot = -1, lastTime = 0

function radial(stops, size = 128) {
  const c = canvas2d(size, size)
  const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
const glowTex = radial([[0, 'rgba(255,255,255,1)'], [.22, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']])
const dotTex = radial([[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']], 32)

const W = 6.4, D = 5, H = 3.2, T = .14, XS = [-W, 0, W], ZB = -D / 2 + T
const PAL = {
  hotels: { dark: true, exposure: 1.25, bg: '#101d14', sky: '#030805', fog: [32, 84], floor: '#1a2c20', wall: '#15241a', slab: '#1b2f22', furn: '#22382a', fabric: '#2a4434', fabric2: '#b79b62', wood: '#3b3226', linen: '#d8d0bc', metal: '#c8a96a', rug: '#1d3125', lamp: '#ffd79c', window: '#0a1520', edge: '#d8c08d', edgeA: .26, halo: '#e9c98a', haloA: .16 },
  clinics: { dark: false, exposure: 1.08, bg: '#f5f7f9', sky: '#fdfeff', fog: [36, 92], floor: '#e7edf2', wall: '#f7f9fb', slab: '#eef2f6', furn: '#fbfcfd', fabric: '#2f445b', fabric2: '#b3c6da', wood: '#d9cbb8', linen: '#ffffff', metal: '#a5b6c8', rug: '#dfe7ee', lamp: '#fff3df', window: '#d6e4f2', plant: '#91a798', edge: '#2f445b', edgeA: .13, ground: '#dde5ee', shadow: '#2c3e52', dust: '#86a3c2', halo: '#a9c4e4', haloA: .26 },
  dental: { dark: false, exposure: 1.08, bg: '#fbf5f5', sky: '#fffefe', fog: [36, 92], floor: '#f2e6e3', wall: '#fcf6f5', slab: '#f6eceb', furn: '#fefbfa', fabric: '#c48d86', fabric2: '#ead0ca', wood: '#dcc6b5', linen: '#ffffff', metal: '#d09e83', rug: '#eedfdb', lamp: '#fff1e6', window: '#f1dfdb', plant: '#9dad95', edge: '#7d424e', edgeA: .13, ground: '#efe0dc', shadow: '#5b3232', dust: '#cf9d92', halo: '#efc6bf', haloA: .3 },
}
let world, P, M, EM, orb, sparks

function skyTex() {
  const c = canvas2d(2, 256)
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, P.sky); g.addColorStop(.5, P.bg); g.addColorStop(1, P.bg)
  x.fillStyle = g; x.fillRect(0, 0, 2, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function mats() {
  const env = P.dark ? .3 : .7
  const S = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0, envMapIntensity: env, ...o })
  const B = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false })
  const metal = S(P.metal, { metalness: .9, roughness: .3, envMapIntensity: 1.2 })
  return {
    floor: S(P.floor, { roughness: .92 }), wall: S(P.wall), slab: S(P.slab), furn: S(P.furn, { roughness: .55 }),
    fabric: S(P.fabric, { roughness: .95 }), fabric2: S(P.fabric2, { roughness: .95 }), wood: S(P.wood, { roughness: .65 }),
    linen: S(P.linen, { roughness: .95 }), plant: S(P.plant || '#8ea595', { roughness: .9 }), rug: S(P.rug, { roughness: 1 }),
    metal, frame: P.dark ? metal : S(P.furn, { roughness: .5 }), pane: B(P.window), emit: B(P.lamp),
    top: P.dark ? S(P.linen, { roughness: .9 }) : S(P.wood, { roughness: .65 }),
    screen: B(P.dark ? '#3a5845' : P.window), light: B(P.dark ? '#e8dcc0' : '#f6f9fc'),
    art: new THREE.MeshStandardMaterial({ map: artTex(), roughness: .9, envMapIntensity: env }),
  }
}
function mesh(geo, m, x, y, z, o = {}) {
  const me = new THREE.Mesh(geo, m), g = o.g || world
  me.position.set(x, y, z)
  if (o.rx) me.rotation.x = o.rx
  if (o.ry) me.rotation.y = o.ry
  me.castShadow = !P.dark && o.cast !== false; me.receiveShadow = !P.dark
  g.add(me)
  if (o.edge) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), EM); e.position.copy(me.position); e.rotation.copy(me.rotation); g.add(e) }
  return me
}
const box = (w, h, d, x, y, z, m, o = {}) => mesh(o.r ? new RoundedBoxGeometry(w, h, d, 2, Math.min(o.r, w / 2 - .002, h / 2 - .002, d / 2 - .002)) : new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, o)
const cyl = (rt, rb, h, x, y, z, m, o = {}) => mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 28), m, x, y + h / 2, z, o)
const ball = (r, x, y, z, m, o = {}) => mesh(new THREE.SphereGeometry(r, 28, 18), m, x, y, z, o)
function group(x, z, ry = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; world.add(g); return g }
function glow(x, y, z, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: P.lamp, transparent: true, opacity: P.dark ? opacity : opacity * .3, depthWrite: false, blending: P.dark ? THREE.AdditiveBlending : THREE.NormalBlending }))
  s.position.set(x, y, z); s.scale.setScalar(size); world.add(s)
}
function roomLight(x, intensity) { if (!P.dark) return; const l = new THREE.PointLight(P.lamp, intensity, 9, 2); l.position.set(x, H - .5, .3); world.add(l) }

// ---------- Living details: phones that ring with their room's call, clocks at the visitor's own time, art on the walls ----------
let RINGS = [], CLOCKS = [], WINDOWS = [], ROOMGLOW = [], curRoom = 0, clockAt = -9, winAt = 0
const ringTex = (() => {
  const c = canvas2d(128, 128)
  const x = c.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 7; x.shadowColor = '#fff'; x.shadowBlur = 10
  x.beginPath(); x.arc(64, 64, 50, 0, Math.PI * 2); x.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
})()
// a quiet abstract print in the niche's colours
function artTex() {
  const c = canvas2d(160, 200)
  const x = c.getContext('2d'), [bg, a, b] = P.dark ? ['#16261b', '#c9a764', '#2f4a39'] : P.fabric === '#2f445b' ? ['#eef2f6', '#2f445b', '#a9c8ea'] : ['#f8eeeb', '#7d424e', '#e6c3bd']
  x.fillStyle = bg; x.fillRect(0, 0, 160, 200)
  x.fillStyle = b; x.beginPath(); x.arc(58, 118, 54, 0, Math.PI * 2); x.fill()
  x.strokeStyle = a; x.lineWidth = 3; x.beginPath(); x.arc(98, 86, 40, Math.PI * .1, Math.PI * 1.35); x.stroke()
  x.fillStyle = a; x.beginPath(); x.arc(112, 150, 9, 0, Math.PI * 2); x.fill()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function art(x, y, w, h) {
  const z = ZB + .02
  box(w + .07, h + .07, .03, x, y - .035, z, M.frame, { cast: false })
  mesh(new THREE.PlaneGeometry(w, h), M.art, x, y + h / 2, z + .02, { cast: false })
}
// a desk phone; its ring of light pulses while its room's call is on screen
function phone(x, y, z, ry = 0) {
  const g = group(x, z, ry); g.position.y = y
  box(.24, .05, .2, 0, 0, 0, M.furn, { r: .02, g }); box(.27, .05, .075, 0, .05, -.045, M.fabric, { r: .03, g })
  box(.08, .012, .06, .06, .05, .05, M.screen, { g, cast: false })
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: P.dark ? P.lamp : P.edge, transparent: true, opacity: 0, depthWrite: false, blending: P.dark ? THREE.AdditiveBlending : THREE.NormalBlending }))
  ring.position.set(x, y + .22, z); world.add(ring)
  RINGS.push({ ring, room: curRoom, phase: (curRoom * .37) % 1 })
}
// a wall clock whose hands show the visitor's own time
function wallClock(x, y) {
  const z = ZB + .02
  cyl(.27, .27, .02, x, y, z, M.metal, { rx: Math.PI / 2, cast: false, seg: 40 })
  cyl(.24, .24, .03, x, y, z + .012, M.linen, { rx: Math.PI / 2, cast: false, seg: 40 })
  const hand = (len, wd) => { const g = new THREE.Group(); g.position.set(x, y + .015, z + .04); world.add(g); box(wd, len, .01, 0, 0, 0, M.fabric, { g, cast: false }); return g }
  CLOCKS.push({ h: hand(.12, .022), m: hand(.18, .014) })
}
function monitor(x, y, z, ry = 0) {
  const g = group(x, z, ry); g.position.y = y
  box(.05, .14, .05, 0, 0, 0, M.metal, { g }); box(.18, .015, .12, 0, 0, 0, M.metal, { g })
  box(.5, .32, .03, 0, .14, 0, M.furn, { r: .012, g }); box(.46, .28, .006, 0, .16, .017, M.screen, { g, cast: false })
}
function liveDetails(time, t) {
  for (const r of RINGS) {
    const on = clamp(1 - Math.abs(t - (1 + r.room)) / .45, 0, 1), p = reduce ? .4 : (time * .85 + r.phase) % 1
    r.ring.material.opacity = on * (1 - p) * (P.dark ? .9 : .6)
    r.ring.scale.setScalar(.2 + p * .85)
  }
  if (time - clockAt > 1) {
    clockAt = time
    const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60
    for (const c of CLOCKS) { c.m.rotation.z = -m / 60 * Math.PI * 2; c.h.rotation.z = -h / 12 * Math.PI * 2 }
  }
  if (WINDOWS.length && !reduce && time > winAt) { winAt = time + 1.6 + Math.random() * 2.6; const w = WINDOWS[(Math.random() * WINDOWS.length) | 0]; w.mesh.material = w.mesh.material === w.lit ? M.pane : w.lit }
  ROOMGLOW.forEach((g, i) => { const want = i === hot ? (P.dark ? .2 : .32) : 0; g.material.opacity += (want - g.material.opacity) * .12 })
}

function chair(x, z, ry, seat = M.fabric) {
  const g = group(x, z, ry)
  box(.46, .07, .46, 0, .44, 0, seat, { r: .03, g }); box(.46, .46, .06, 0, .51, -.2, seat, { r: .03, g })
  for (const [a, b] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) cyl(.015, .015, .44, a, 0, b, M.metal, { g, seg: 8 })
}
function armchair(x, z, ry) {
  const g = group(x, z, ry)
  box(.86, .38, .8, 0, 0, 0, M.fabric, { r: .1, g }); box(.86, .52, .18, 0, .3, -.31, M.fabric, { r: .08, g })
  box(.16, .26, .8, -.35, .3, 0, M.fabric, { r: .07, g }); box(.16, .26, .8, .35, .3, 0, M.fabric, { r: .07, g })
}
function table(x, z, r) { cyl(r, r, .04, x, .72, z, M.top); cyl(.035, .035, .72, x, 0, z, M.metal, { seg: 12 }); cyl(.22, .22, .02, x, 0, z, M.metal) }
function plant(x, z, s = 1) {
  cyl(.2 * s, .16 * s, .42 * s, x, 0, z, M.furn)
  for (const [a, b, c, r] of [[0, .8, 0, .32], [-.17, .66, .08, .22], [.18, .7, -.06, .24], [.04, 1.02, .05, .22]]) ball(r * s, x + a * s, b * s, z + c * s, M.plant)
}
function pendant(x, z, drop) {
  cyl(.006, .006, drop, x, H - drop, z, M.metal, { seg: 6, cast: false })
  cyl(.06, .2, .2, x, H - drop - .2, z, M.metal, { seg: 24 })
  ball(.07, x, H - drop - .2, z, M.emit, { cast: false })
  glow(x, H - drop - .28, z, 1.1, .5)
}
function windowPane(x, y, w, h) {
  const z = ZB + .012
  box(w, h, .02, x, y, z, M.pane, { cast: false })
  for (const [bw, bh, bx, by] of [[w + .08, .05, x, y - .04], [w + .08, .05, x, y + h], [.05, h, x - w / 2, y], [.05, h, x + w / 2, y], [.035, h, x, y]]) box(bw, bh, .05, bx, by, z + .02, M.frame, { cast: false })
}
function reception(cx, deskX, chairsSide) {
  box(4.4, .012, 2.8, cx, 0, .1, M.rug, { cast: false })
  box(2.6, 1.0, .7, cx + deskX, 0, -1.35, M.furn, { r: .08 }); box(2.72, .05, .82, cx + deskX, 1.0, -1.35, M.wood, { r: .02 })
  windowPane(cx - deskX * 1.9, 1.0, 1.6, 1.5)
  for (const z of [-.9, -.25, .4]) chair(cx + chairsSide * 2.75, z, -chairsSide * Math.PI / 2)
  plant(cx - chairsSide * 2.6, -1.75, 1.1)
  monitor(cx + deskX + .55, 1.05, -1.45, -deskX * .35); phone(cx + deskX - .65, 1.05, -1.3, deskX * .2)
  wallClock(cx + deskX, 2.45); art(cx + deskX * 2.3, 1.25, .62, .78)
  box(.9, .4, .5, cx + chairsSide * 2.0, 0, 1.25, M.wood, { r: .03 })
}

const ROOMS = {
  hotels: [
    (cx) => { // front desk
      box(4.6, .012, 3, cx, 0, .1, M.rug, { cast: false })
      box(2.8, 1.0, .72, cx, 0, -1.3, M.furn, { r: .05 }); box(3.0, .05, .9, cx, 1.0, -1.3, M.metal, { r: .02 })
      mesh(new THREE.SphereGeometry(.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, cx + .95, 1.06, -1.15); cyl(.12, .12, .015, cx + .95, 1.05, -1.15, M.metal)
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) box(.12, .16, .02, cx - .9 + c * .36, 1.5 + r * .34, ZB + .02, M.metal, { cast: false })
      armchair(cx - 2.1, .9, .5); armchair(cx + 2.1, .9, -.5)
      pendant(cx - .8, -1.3, .8); pendant(cx + .8, -1.3, .8)
      phone(cx - .85, 1.05, -1.2, .25)
      const tg = group(cx + 1.75, .15, -.4) // luggage trolley
      box(.82, .04, .5, 0, .08, 0, M.metal, { g: tg }); for (const s of [-1, 1]) cyl(.018, .018, 1.25, s * .38, .08, 0, M.metal, { g: tg, seg: 8 })
      mesh(new THREE.CylinderGeometry(.018, .018, .8, 8), M.metal, 0, 1.33, 0, { g: tg, rx: 0 }).rotation.z = Math.PI / 2
      box(.42, .5, .24, -.16, .12, 0, M.fabric2, { r: .04, g: tg }); box(.32, .38, .22, .2, .12, .02, M.fabric, { r: .04, g: tg })
      roomLight(cx, 10)
    },
    (cx) => { // restaurant
      box(5.4, .44, .6, cx, 0, ZB + .32, M.fabric, { r: .06 }); box(5.4, .6, .16, cx, .44, ZB + .1, M.fabric, { r: .06 })
      for (const x of [-1.8, 0, 1.8]) { table(cx + x, -1.15, .36); chair(cx + x, -.55, Math.PI); pendant(cx + x, -1.15, 1.05); cyl(.02, .02, .08, cx + x, .76, -1.15, M.emit, { cast: false }); glow(cx + x, .86, -1.15, .5, .6) }
      for (const x of [-1.2, 1.2]) { table(cx + x, 1.1, .42); chair(cx + x - .55, 1.1, Math.PI / 2); chair(cx + x + .55, 1.1, -Math.PI / 2) }
      art(cx - 1.25, 1.45, .7, .5); art(cx + 1.25, 1.45, .7, .5)
      box(.5, 1.0, .38, cx + 2.55, 0, 1.75, M.wood, { r: .03 }); phone(cx + 2.55, 1.0, 1.75, -.4)
      roomLight(cx, 8)
    },
    (cx) => { // guest room
      const bx = cx - 1.0
      box(2.3, 1.2, .1, bx, 0, ZB + .05, M.fabric, { r: .04 })
      box(2.0, .3, 2.2, bx, 0, ZB + 1.2, M.furn, { r: .04 }); box(1.94, .2, 2.12, bx, .3, ZB + 1.21, M.linen, { r: .08 })
      box(1.98, .05, 1.1, bx, .5, ZB + 1.7, M.fabric2, { r: .025 })
      box(.68, .15, .36, bx - .48, .5, ZB + .38, M.linen, { r: .07 }); box(.68, .15, .36, bx + .48, .5, ZB + .38, M.linen, { r: .07 })
      for (const s of [-1, 1]) { box(.44, .5, .4, bx + s * 1.42, 0, ZB + .3, M.furn, { r: .03 }); cyl(.05, .07, .26, bx + s * 1.42, .5, ZB + .3, M.metal); cyl(.12, .17, .2, bx + s * 1.42, .76, ZB + .3, M.emit, { cast: false }); glow(bx + s * 1.42, .9, ZB + .3, 1.0, .55) }
      windowPane(cx + 1.9, .9, 1.3, 1.6)
      armchair(cx + 2.1, .7, -.7)
      phone(bx - 1.46, .5, ZB + .44, .2)
      roomLight(cx, 7)
    },
  ],
  clinics: [
    (cx) => reception(cx, .9, -1),
    (cx) => { // consulting room
      box(1.6, .05, .8, cx - 1.7, .72, -1.3, M.wood, { r: .02 }); box(.06, .72, .7, cx - 2.45, 0, -1.3, M.wood); box(.06, .72, .7, cx - .95, 0, -1.3, M.wood)
      box(.5, .32, .03, cx - 1.7, .82, -1.58, M.fabric); cyl(.02, .02, .08, cx - 1.7, .76, -1.58, M.metal, { seg: 8 })
      chair(cx - 1.7, -2.0, 0); chair(cx - 2.05, -.55, Math.PI); chair(cx - 1.35, -.55, Math.PI)
      box(.7, .6, 1.9, cx + 1.9, 0, -1.0, M.furn, { r: .04 }); box(.72, .12, 1.9, cx + 1.9, .6, -1.0, M.fabric2, { r: .05 }); box(.72, .1, .65, cx + 1.9, .74, -1.75, M.fabric2, { r: .04, rx: .5 })
      windowPane(cx, 1.15, 1.5, 1.3)
      monitor(cx - 1.35, .77, -1.45, .3); phone(cx - 2.15, .77, -1.25, -.2); art(cx + 1.9, 1.5, .6, .74)
    },
    (cx) => { // after-hours lounge
      box(2.4, .4, .9, cx - 1.0, 0, ZB + .55, M.fabric, { r: .1 }); box(2.4, .5, .22, cx - 1.0, .3, ZB + .16, M.fabric, { r: .09 })
      box(.22, .3, .9, cx - 2.11, .3, ZB + .55, M.fabric, { r: .08 }); box(.22, .3, .9, cx + .11, .3, ZB + .55, M.fabric, { r: .08 })
      cyl(.45, .45, .04, cx - 1.0, .4, -.6, M.wood); cyl(.04, .04, .4, cx - 1.0, 0, -.6, M.metal, { seg: 12 })
      cyl(.15, .15, .02, cx + .7, 0, ZB + .4, M.metal); cyl(.012, .012, 1.5, cx + .7, 0, ZB + .4, M.metal, { seg: 6 }); cyl(.1, .18, .22, cx + .7, 1.5, ZB + .4, M.emit, { cast: false })
      windowPane(cx + 1.8, .7, 1.5, 1.9)
      plant(cx + 2.6, .9, 1.25)
      phone(cx - 1.0, .44, -.6, .4); art(cx - 1.0, 1.42, 1.1, .62)
    },
  ],
  dental: [
    (cx) => reception(cx, -.9, 1),
    (cx) => dentalRoom(cx, 1),
    (cx) => dentalRoom(cx, -1),
  ],
}
function dentalChair(x, z, ry) {
  const g = group(x, z, ry)
  cyl(.24, .3, .3, 0, 0, 0, M.furn, { g }); cyl(.08, .08, .26, 0, .3, 0, M.metal, { g })
  box(.62, .14, .78, 0, .54, .05, M.fabric, { r: .06, g })
  box(.6, .12, .9, 0, .62, -.68, M.fabric, { r: .06, g, rx: .5 })
  box(.34, .1, .3, 0, .93, -1.18, M.fabric, { r: .05, g, rx: .5 })
  box(.54, .12, .7, 0, .43, .68, M.fabric, { r: .06, g, rx: .32 })
  box(.08, .05, .5, .36, .78, -.05, M.furn, { r: .02, g })
}
function dentalRoom(cx, f) {
  dentalChair(cx - 1.25 * f, -.6, .35 * f)
  cyl(.022, .022, .95, cx - 1.05 * f, H - .95, -.4, M.metal, { cast: false, seg: 8 })
  box(.46, .07, .26, cx - 1.05 * f, H - 1.02, -.4, M.furn, { r: .03 }); box(.3, .015, .14, cx - 1.05 * f, H - 1.035, -.4, M.emit, { cast: false })
  box(2.2, .86, .58, cx + 1.3 * f, 0, ZB + .3, M.furn, { r: .03 }); box(2.26, .04, .62, cx + 1.3 * f, .86, ZB + .31, M.wood, { r: .015 })
  cyl(.16, .14, .03, cx + 1.0 * f, .9, ZB + .32, M.metal)
  box(2.2, .6, .34, cx + 1.3 * f, 1.75, ZB + .17, M.furn, { r: .03 })
  cyl(.2, .2, .06, cx - .3 * f, .5, .3, M.fabric); cyl(.03, .03, .5, cx - .3 * f, 0, .3, M.metal, { seg: 8 })
  windowPane(cx - 1.2 * f, 1.25, 1.2, 1.2)
  box(.62, .46, .03, cx - .2 * f, 1.3, ZB + .03, M.frame, { cast: false }); box(.56, .4, .01, cx - .2 * f, 1.33, ZB + .05, M.light, { cast: false })
  phone(cx + 1.85 * f, .9, ZB + .36, -.2 * f)
}
function hotelUpper() {
  const y0 = H + .22, fh = 2.5, w = W * 3 + T, d = D - .4, z0 = -.2, rnd = seeded(7)
  box(w, fh * 2, d, 0, y0, z0, M.wall, { edge: true, cast: false })
  box(w + .06, .08, d + .06, 0, y0 + fh - .04, z0, M.metal, { cast: false })
  box(w + .2, .26, d + .2, 0, y0 + fh * 2, z0, M.slab, { edge: true, cast: false })
  const zf = z0 + d / 2 + .006, cols = 14
  for (let f = 0; f < 2; f++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + .75 + c * ((w - 1.5) / (cols - 1)), lit = rnd() < .45
    const litMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.lamp).multiplyScalar(.14 + rnd() * .24), toneMapped: false })
    const win = mesh(new THREE.PlaneGeometry(.72, 1.25), lit ? litMat : M.pane, x, y0 + 1.2 + f * fh, zf, { cast: false })
    WINDOWS.push({ mesh: win, lit: litMat })
  }
  const city = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: P.halo, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
  city.position.set(0, 2, -40); city.scale.set(90, 26, 1); world.add(city)
}
function points(n, spread, size, color, opacity, fog) {
  const pos = new Float32Array(n * 3), spd = new Float32Array(n), rnd = seeded(5)
  for (let i = 0; i < n; i++) { spread(pos, i, rnd); spd[i] = .04 + rnd() * .08 }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTex, color, transparent: true, opacity, depthWrite: false, fog }))
  world.add(p); return { p, spd }
}
function buildOrb(n) {
  // the orb in the scene is only an anchor: the page moves it along the camera path (and at the hotel it carries a warm light);
  // the orb you see is drawn by orb.js on its own canvas
  orb = new THREE.Group(); world.add(orb)
  if (n === 'hotels') orb.add(new THREE.PointLight(P.lamp, 5, 7, 2))
}
function buildWorld(n) {
  if (world) { scene.remove(world); world.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose()) }) }
  P = PAL[n]; world = new THREE.Group(); scene.add(world)
  RINGS = []; CLOCKS = []; WINDOWS = []; ROOMGLOW = []
  M = mats()
  EM = new THREE.LineBasicMaterial({ color: P.edge, transparent: true, opacity: P.edgeA, depthWrite: false })
  scene.background?.dispose?.(); scene.background = skyTex()
  scene.fog = new THREE.Fog(P.bg, P.fog[0], P.fog[1])
  renderer.toneMappingExposure = P.exposure
  renderer.shadowMap.enabled = !P.dark
  if (P.dark) {
    world.add(new THREE.HemisphereLight('#7f9a8c', '#08100b', .6))
    const moon = new THREE.DirectionalLight('#a9c0cf', .5); moon.position.set(-12, 20, 14); world.add(moon)
    world.add(new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2).translate(0, -.4, 0), new THREE.MeshStandardMaterial({ color: P.bg, roughness: 1, envMapIntensity: 0 })))
  } else {
    world.add(new THREE.HemisphereLight('#ffffff', P.ground, 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 2.6); sun.position.set(-8, 14, 13); sun.castShadow = true
    sun.shadow.mapSize.set(vw < 735 ? 1024 : 2048, vw < 735 ? 512 : 1024); Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 9, bottom: -9, near: 2, far: 50 })
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03
    world.add(sun)
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2).translate(0, -.4, 0), new THREE.ShadowMaterial({ color: P.shadow, opacity: .09 }))
    catcher.receiveShadow = true; world.add(catcher)
  }
  // the model: base, back wall, side walls; the roof is lifted off so you can look in, except at the hotel
  box(W * 3 + 1.2, .4, D + 1.6, 0, -.4, .4, M.floor, { edge: true })
  box(W * 3 + T, H, T, 0, 0, -D / 2 + T / 2, M.wall, { edge: true })
  for (const x of [-1.5, -.5, .5, 1.5]) box(T, H, D, x * W, 0, 0, M.wall, { edge: true })
  ROOMS[n].forEach((fn, i) => { curRoom = i; fn(XS[i]) })
  if (n === 'hotels') wallClock(XS[0] - 1.8, 2.3)
  XS.forEach((x) => {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: P.dark ? P.lamp : P.halo, transparent: true, opacity: 0, depthWrite: false, blending: P.dark ? THREE.AdditiveBlending : THREE.NormalBlending }))
    g.position.set(x, 1.4, 0); g.scale.set(W * 1.05, H * 1.2, 1); world.add(g); ROOMGLOW.push(g)
  })
  if (P.dark) {
    box(W * 3 + T, .22, D, 0, H, 0, M.slab, { edge: true, cast: false })
    hotelUpper()
    sparks = points(1100, (a, i, r) => { const th = Math.PI + r() * Math.PI, el = .02 + Math.pow(r(), 1.6) * .55; a.set([Math.cos(th) * Math.cos(el) * 95, Math.sin(el) * 95, Math.sin(th) * Math.cos(el) * 95], i * 3) }, .2, '#f4e9cc', .8, false)
    sparks.kind = 'stars'
  } else {
    sparks = points(220, (a, i, r) => a.set([(r() - .5) * W * 3, .2 + r() * 2.8, -D / 2 + .3 + r() * (D - .2)], i * 3), .028, P.dust, .6, true)
    sparks.kind = 'dust'
  }
  buildOrb(n)
}

export function init(o) {
  reduce = o.reduced; vw = o.w
  renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, o.w / o.h, .1, 300)
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture
  setSize(o.w, o.h, o.dpr, o.ow, o.oh)
}
export function setNiche(n) { buildWorld(n) }
export function setSize(w, h, dpr) {
  vw = w
  renderer.setPixelRatio(Math.min(dpr, 1.5)); renderer.setSize(w, h, false)
  camera.aspect = w / h; camera.updateProjectionMatrix()
}
// One frame: the camera (position and its three axes), the orb's place and size, the scroll's camera time,
// the clock and the room under the pointer
const basis = new THREE.Matrix4()
export function frame(f) {
  if (!world) return
  const [x, y, z, ax, ay, az, bx, by, bz, cx, cy, cz] = f.cam, dt = clamp(f.time - lastTime, 0, .05)
  lastTime = f.time
  camera.position.set(x, y, z)
  camera.quaternion.setFromRotationMatrix(basis.set(ax, bx, cx, 0, ay, by, cy, 0, az, bz, cz, 0, 0, 0, 0, 1))
  camera.updateMatrixWorld()
  orb.position.set(f.orb[0], f.orb[1], f.orb[2]); orb.scale.setScalar(f.orb[3])
  hot = f.hot
  if (!reduce) {
    if (sparks.kind === 'stars') sparks.p.rotation.y = Math.sin(f.time * .02) * .02
    else {
      const a = sparks.p.geometry.attributes.position
      for (let k = 0; k < a.count; k++) { let y = a.getY(k) + sparks.spd[k] * dt; if (y > 3.05) y = .2; a.setY(k, y) }
      a.needsUpdate = true
    }
  }
  liveDetails(f.time, f.t)
  renderer.render(scene, camera)
}
