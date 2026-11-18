// lab.js - shared look helpers for the Pressure Lab (glass, liquid, procedural surfaces, labels). Units: 1 = 1 cm.
// Glass / liquid / surface recipes follow the delivered ch06 video kit (work/video/scenes/_kit/sci.js) so the sim looks like the film.
import * as THREE from './vendor/three.module.js';
export { THREE };
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;

export function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function glassMat(o = {}) {
  return new THREE.MeshPhysicalMaterial({ color: o.tint ?? '#DCEFF5', metalness: 0, roughness: o.rough ?? .04, transparent: true, opacity: o.opacity ?? .16, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.6, ior: 1.5 });
}
export function rimMat(o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(o.color ?? '#CFEAFF') }, uStr: { value: o.strength ?? .9 }, uPow: { value: o.power ?? 2.6 }, uStripe: { value: o.stripe ?? .55 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uStr; uniform float uPow; uniform float uStripe; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN); float f = pow(1.-abs(dot(n, normalize(vV))), uPow); float s = smoothstep(.42,.5,n.x)*(1.-smoothstep(.58,.68,n.x)) + .55*smoothstep(-.62,-.56,n.x)*(1.-smoothstep(-.52,-.46,n.x)); float side = 1. - smoothstep(.55, .9, abs(n.y)); gl_FragColor = vec4(uCol*(f*uStr*(.35+.65*side) + s*uStripe*side), 1.); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
}
// one glass piece: base glass + additive fresnel shell + thin dark edge lines (so glass never melts into the wall)
export function glassPiece(geo, o = {}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(geo, glassMat(o)); base.renderOrder = 20; g.add(base);
  const rim = new THREE.Mesh(geo, rimMat(o)); rim.renderOrder = 21; g.add(rim);
  if (o.edges !== false) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, o.edgeAngle ?? 25), new THREE.LineBasicMaterial({ color: o.edgeColor ?? '#18242F', transparent: true, opacity: o.edgeOpacity ?? .55, depthWrite: false })); e.renderOrder = 22; g.add(e); }
  g.userData.base = base; return g;
}
export function lathe(pts, seg = 48) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), seg); }

// water column with a meniscus ring; setLevel(h) (h in cm above its own origin)
export function liquid(o = {}) {
  const g = new THREE.Group(), r = o.r ?? 3, h = o.h ?? 10, col = new THREE.Color(o.color ?? '#3F9AD8');
  const mat = new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: o.opacity ?? .62, roughness: .08, clearcoat: .6, depthWrite: false, envMapIntensity: .6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 56, 1, true), mat); body.renderOrder = 10; g.add(body);
  const bot = new THREE.Mesh(new THREE.CircleGeometry(r, 56), mat); bot.rotation.x = Math.PI / 2; bot.position.y = .01; bot.renderOrder = 10; g.add(bot);
  const topMat = mat.clone(); topMat.color = col.clone().lerp(new THREE.Color('#ffffff'), .18); topMat.opacity = Math.min(1, (o.opacity ?? .62) + .1);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 56), topMat); top.rotation.x = -Math.PI / 2; top.renderOrder = 11; g.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * .995, Math.max(.03, r * .02), 6, 56), new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), .7), transparent: true, opacity: .9, depthWrite: false }));
  ring.rotation.x = Math.PI / 2; ring.renderOrder = 12; g.add(ring);
  const rimS = new THREE.Mesh(body.geometry, rimMat({ color: col.clone().lerp(new THREE.Color('#ffffff'), .5), strength: .5, stripe: .25 })); rimS.renderOrder = 13; g.add(rimS);
  g.userData.setLevel = (hh) => { const v = hh > .02; body.visible = top.visible = ring.visible = rimS.visible = bot.visible = v; hh = Math.max(.02, hh); body.scale.y = rimS.scale.y = hh; body.position.y = rimS.position.y = hh / 2; top.position.y = hh; ring.position.y = hh + r * .02; };
  g.userData.setLevel(h); g.userData.mat = mat; return g;
}

// procedural tileable surface textures (value-noise fbm, seeded) - same family as the video kit
const TEXC = new Map();
function makeFbm(R, base = 8, oct = 5) {
  const grids = []; for (let o = 0; o < oct; o++) { const N = base << o, gg = new Float32Array(N * N); for (let i = 0; i < gg.length; i++) gg[i] = R(); grids.push([N, gg]); }
  return (u, v) => { let s = 0, a = .5, tot = 0; for (const [N, g] of grids) { const x = u * N, y = v * N, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), i0 = ((i % N) + N) % N, j0 = ((j % N) + N) % N, i1 = (i0 + 1) % N, j1 = (j0 + 1) % N; s += a * ((g[j0 * N + i0] * (1 - sx) + g[j0 * N + i1] * sx) * (1 - sy) + (g[j1 * N + i0] * (1 - sx) + g[j1 * N + i1] * sx) * sy); tot += a; a *= .5; } return s / tot; };
}
export function surfaceTex(kind, o = {}) {
  const key = kind + JSON.stringify(o.color || '') + (o.tiles || '');
  let t = TEXC.get(key);
  if (!t) {
    const N = o.res ?? 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
    const R = mulberry(kind.length * 97 + 13), F = makeFbm(R, kind === 'wood' ? 4 : 8, 5), F2 = makeFbm(R, 32, 2);
    const base = new THREE.Color(o.color ?? '#777'), B = [base.r * 255, base.g * 255, base.b * 255], tn = o.tiles ?? 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N; let k = 1, add = 0;
      if (kind === 'wood') { const w = F(u * .6, v * 2), ring = Math.sin((v * 40 + w * 9) * Math.PI); k = .9 + ring * .06 + (F2(u * 4, v) - .5) * .18 + (w - .5) * .2; }
      else if (kind === 'tiles') { const tx = u * tn, ty = v * tn, fx = tx - Math.floor(tx), fy = ty - Math.floor(ty), gr = Math.min(fx, fy, 1 - fx, 1 - fy); k = gr < .03 ? .7 : .95 + (F2(u, v) - .5) * .06; }
      else if (kind === 'sand') { k = .86 + (F(u, v) - .5) * .3 + (F2(u * 2, v * 2) - .5) * .3; const sp = R(); if (sp > .97) add = 20; else if (sp < .03) add = -18; }
      else if (kind === 'snow') { k = .96 + (F(u, v) - .5) * .08 + (F2(u, v) - .5) * .05; if (R() > .995) add = 12; }
      else if (kind === 'foam') { const p = F2(u * 2, v * 2); k = .9 + (p - .5) * .35 + (F(u, v) - .5) * .1; if (R() > .9) add = -14; }
      else { k = .9 + (F(u, v) - .5) * .28 + (F2(u, v) - .5) * .1; if (R() > .993) add = 10; }
      const i = (y * N + x) * 4; d[i] = clamp(B[0] * k + add, 0, 255); d[i + 1] = clamp(B[1] * k + add, 0, 255); d[i + 2] = clamp(B[2] * k + add, 0, 255); d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; TEXC.set(key, t);
  }
  const tt = t.clone(); tt.needsUpdate = true; if (o.repeat) tt.repeat.set(...o.repeat); return tt;
}
export function surface(kind, o = {}) { const t = surfaceTex(kind, o); return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: o.bump ?? .3, roughness: o.roughness ?? .7, metalness: o.metalness ?? 0 }); }

// text on a canvas -> sprite-like plane (always readable, used for scale numbers and tags in the scene)
export function textTex(text, o = {}) {
  const fs = o.size ?? 44, pad = 12, c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `700 ${fs}px Segoe UI, system-ui, sans-serif`; const w = Math.ceil(g.measureText(text).width) + pad * 2, h = fs + pad * 2;
  c.width = w; c.height = h; g.font = `700 ${fs}px Segoe UI, system-ui, sans-serif`;
  if (o.bg) { g.fillStyle = o.bg; const r = h / 2; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill(); }
  g.fillStyle = o.color ?? '#fff'; g.textBaseline = 'middle'; g.fillText(text, pad, h / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { t, aspect: w / h };
}
export function textSprite(text, height, o = {}) {
  const { t, aspect } = textTex(text, o); const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true });
  const s = new THREE.Sprite(m); s.scale.set(height * aspect, height, 1); s.renderOrder = 30; return s;
}
export function fmt(n, dp = 0) { if (!isFinite(n)) return '-'; return n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp }); }
