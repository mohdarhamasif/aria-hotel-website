// The orb: the homepage's particle sphere in each niche's own colours (champagne gold for hotels, ink blue
// for clinics, rosé for dental), drawn with plain WebGL on its own canvas above the building, so it is always whole.
// It needs no three.js, so it is on screen while the 3D world (world.js) is still loading.

const VERT = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec4 aAlt;
attribute vec2 aMisc;
uniform float uTime, uRot, uTilt, uPoint, uLevel;
uniform float uConnect, uThink, uListen, uSpeak, uAlpha;
uniform vec2 uCenter, uScale;
varying vec3 vColor;
varying float vAlpha;
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
void main() {
  float seed = aMisc.x;
  vec3 p = aPos;
  float n = sin(dot(p, vec3(4.1, 3.3, 2.7)) + uTime * .8 + seed * 6.2831) * .5 + .5;
  float r = 1. + (n - .5) * .03;
  r += uLevel * (.05 + n * .2);
  r += uSpeak * uLevel * .09 * sin(p.y * 12. - uTime * 7.);
  r += uListen * .035 * sin(p.y * 7. + uTime * 3. + seed * 2.);
  r += uThink * .03 * sin(uTime * 5. + seed * 40.);
  r *= 1. - uConnect * .16 * (.6 + .4 * sin(uTime * 5. + seed * 6.2831));
  vec3 pos = rotX(rotY(p * r, uRot), uTilt);
  float persp = 1. / (1. - pos.z * .22);
  gl_Position = vec4(uCenter + pos.xy * persp * uScale, 0., 1.);
  float front = clamp(pos.z * .5 + .5, 0., 1.);
  float edge = 1. - abs(pos.z);
  vColor = aColor * (.9 + uLevel * .45) * mix(1., 1.15, edge);
  vAlpha = uAlpha * mix(.55, 1.45, edge * edge) * mix(.2, 1., front);
  gl_PointSize = max(1.2, uPoint * persp * (1. + uLevel * .35));
}`
const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - .5;
  float d = length(c);
  if (d > .5) discard;
  float a = min(1., vAlpha * smoothstep(.5, .15, d));
  gl_FragColor = vec4(vColor * a, a);
}`
// Lighter tones above, the niche's signature colour at the middle, its deepest tone below, and a scatter of strays
export const ORB_PAL = {
  hotels: { top: ['#f7ecd0', '#efdcae', '#fff6df'], mid: ['#e4c886', '#d8c08d', '#c9a764'], bottom: ['#b38a3a', '#9c7631', '#c99a4b'], stray: ['#8fb59a', '#fff6df'] },
  clinics: { top: ['#7fa6cf', '#6f95bf', '#8eb3da'], mid: ['#4f7aa6', '#588cc0', '#3b5979'], bottom: ['#2f445b', '#263a50', '#344d68'], stray: ['#a9c8ea', '#86a3c2'] },
  dental: { top: ['#e2b3a8', '#d9a39a', '#e8c0b6'], mid: ['#c48d86', '#d09e83', '#b9796f'], bottom: ['#7d424e', '#8d4d58', '#6b3641'], stray: ['#e6c3bd', '#efc6bf'] },
}
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
function orbColor(y, pal) {
  const t = y + (Math.random() - .5) * .6, r = Math.random()
  const band = t > .15 ? pal.top : t > -.3 ? pal.mid : pal.bottom
  const c = hex(r < .93 ? band[(Math.random() * band.length) | 0] : pal.stray[(Math.random() * pal.stray.length) | 0])
  const k = .85 + Math.random() * .25
  return [c[0] * k, c[1] * k, c[2] * k]
}
export function orbPoints(count, pal) {
  const data = new Float32Array(count * 12)
  for (let i = 0; i < count; i++) {
    const y = Math.random() * 2 - 1, s = Math.sqrt(1 - y * y), a = Math.random() * Math.PI * 2, [r, g, b] = orbColor(y, pal)
    data.set([s * Math.cos(a), y, s * Math.sin(a), r, g, b, Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1], i * 12)
  }
  return data
}
const ORB_UNIFORMS = ['uTime', 'uRot', 'uTilt', 'uPoint', 'uLevel', 'uConnect', 'uThink', 'uListen', 'uSpeak', 'uAlpha', 'uCenter', 'uScale']
export class ParticleOrb {
  constructor(canvas, count) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true })
    if (!gl) throw new Error('WebGL unavailable')
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }
    const prog = gl.createProgram()
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
    gl.useProgram(prog)
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    const attr = (name, size, offset) => { const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 48, offset * 4) }
    gl.bufferData(gl.ARRAY_BUFFER, count * 48, gl.STATIC_DRAW)
    attr('aPos', 3, 0); attr('aColor', 3, 3); attr('aAlt', 4, 6); attr('aMisc', 2, 10)
    this.u = {}; ORB_UNIFORMS.forEach((n) => (this.u[n] = gl.getUniformLocation(prog, n)))
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0)
    Object.assign(this, { gl, canvas, count, dpr: 1 })
  }
  setPoints(data) { const { gl } = this; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW) }
  size(w, h, dpr) {
    w = Math.max(1, w); h = Math.max(1, h)
    if (w !== this.canvas.width || h !== this.canvas.height) { this.canvas.width = w; this.canvas.height = h }
    this.dpr = dpr; this.gl.viewport(0, 0, w, h)
  }
  draw(p) {
    const { gl, u } = this, st = p.states
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform1f(u.uTime, p.time); gl.uniform1f(u.uRot, p.rot); gl.uniform1f(u.uTilt, p.tilt); gl.uniform1f(u.uPoint, p.point * this.dpr); gl.uniform1f(u.uLevel, p.level)
    gl.uniform1f(u.uConnect, st.connecting); gl.uniform1f(u.uThink, st.thinking); gl.uniform1f(u.uListen, st.listening); gl.uniform1f(u.uSpeak, st.speaking)
    gl.uniform1f(u.uAlpha, p.alpha)
    gl.uniform2f(u.uCenter, p.center[0], p.center[1]); gl.uniform2f(u.uScale, p.scale[0], p.scale[1])
    gl.drawArrays(gl.POINTS, 0, this.count)
  }
}
