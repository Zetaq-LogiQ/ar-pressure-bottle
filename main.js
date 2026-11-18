// main.js - Pressure Bottle demo: the Pressure Lab water bottle on its own. Tap the bottle to make holes, tap a hole to tape / open it.
// Physics and the bottle model are the delivered pressure_lab bottle.js, unchanged (Torricelli jets, draining).
import { THREE, V3, clamp, lerp } from './lab.js';
import { RoomEnvironment } from './vendor/addons/environments/RoomEnvironment.js';
import { createBottle } from './bottle.js';

const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ renderer / scene
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .8;
scene.add(new THREE.HemisphereLight('#CFE8FF', '#23344A', .9));
const sun = new THREE.DirectionalLight('#FFFFFF', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; scene.add(sun, sun.target);
const rimL = new THREE.DirectionalLight('#9FD8FF', .9); scene.add(rimL);
const camera = new THREE.PerspectiveCamera(30, 1, .5, 5000);

// ------------------------------------------------------------------ the bottle
const ctx = { act: () => { }, toast, sfx, emit: () => { }, camTo: () => { }, camFollow: () => { } };
const B = createBottle(ctx); scene.add(B.group);
B.setLevel(24, 'demo');

// ------------------------------------------------------------------ camera: frames the bottle and every jet's landing mark
const cam = { t: V3(0, 40, 0), yaw: 28, pitch: 14, zoom: 1, fitW: 60, fitH: 80 };
function fitPoints(r) {
  const pts = [V3(-6, 1, 0), V3(6, 1, 0), V3(0, 77.5, 0), V3(-5.5, 40, 0), V3(5.5, 40, 0), V3(0, 40, -5.5), V3(0, 40, 5.5)];
  for (const o of B.S.holes) { const J = o.jet; if (J.splash.visible) { pts.push(J.splash.position.clone()); if (J.tag.visible) { const tp = J.tag.position.clone().add(V3(0, 2, 0)); pts.push(tp.clone().addScaledVector(r, 7), tp.clone().addScaledVector(r, -7)); } } }   // tags are about 14 cm wide
  return pts;
}
function fit(k) {
  const y = THREE.MathUtils.degToRad(cam.yaw), p = THREE.MathUtils.degToRad(cam.pitch);
  const r = V3(Math.cos(y), 0, -Math.sin(y)), u = V3(-Math.sin(p) * Math.sin(y), Math.cos(p), -Math.sin(p) * Math.cos(y)), R = V3(0, 36, 0);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const P of fitPoints(r)) { const d = P.clone().sub(R), a = d.dot(r), b = d.dot(u); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
  const m = 8 + .1 * Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const t = R.clone().addScaledVector(r, cx).addScaledVector(u, cy);
  cam.t.lerp(t, k); cam.fitW = lerp(cam.fitW, x1 - x0 + 2 * m, k); cam.fitH = lerp(cam.fitH, y1 - y0 + 2 * m, k);
}
// space the UI takes: readout on top, buttons at the bottom
function view() { const W = innerWidth, H = innerHeight, top = $('rd').offsetHeight + 20, bot = $('bar').offsetHeight + 28; return { W, H, h: Math.max(100, H - top - bot), off: (top - bot) / 2 }; }
function updateCamera(dt) {
  fit(Math.min(1, dt * 3));
  const v = view(), tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(cam.fitH / 2 / (tf * v.h / v.H), cam.fitW / 2 / (tf * camera.aspect * .94)) * cam.zoom;
  const y = THREE.MathUtils.degToRad(cam.yaw), p = THREE.MathUtils.degToRad(cam.pitch);
  camera.position.set(cam.t.x + dist * Math.sin(y) * Math.cos(p), cam.t.y + dist * Math.sin(p), cam.t.z + dist * Math.cos(y) * Math.cos(p));
  camera.lookAt(cam.t);
  camera.setViewOffset(v.W, v.H, 0, -v.off, v.W, v.H);                  // keep the scene centred between the readout and the buttons
  camera.near = Math.max(.5, dist / 200); camera.far = dist * 40 + 2000; camera.updateProjectionMatrix();
  const s = Math.max(cam.fitW, cam.fitH) * .9; sun.position.set(cam.t.x + s * .8, cam.t.y + s * 1.6, cam.t.z + s * .9); sun.target.position.copy(cam.t);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -s; sc.right = sc.top = s; sc.near = 1; sc.far = s * 5; sc.updateProjectionMatrix();
  rimL.position.set(cam.t.x - s, cam.t.y + s * .6, cam.t.z - s);
}
function layout() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; }
addEventListener('resize', layout); layout();

// ------------------------------------------------------------------ input: tap = poke / tape, drag = turn, pinch or wheel = zoom
const ray = new THREE.Raycaster(), ptr = new Map(); let drag = null, pinch0 = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 1) drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  else { drag = null; const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', e => {
  if (!ptr.has(e.pointerId)) return; const q = ptr.get(e.pointerId), dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (ptr.size === 1 && drag) { drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 8) { cam.yaw -= dx * .3; cam.pitch = clamp(cam.pitch + dy * .25, -5, 60); } }
  else if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) cam.zoom = clamp(cam.zoom * pinch0 / d, .4, 2.2); pinch0 = d; }
});
function up(e) {
  if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
  if (drag && drag.moved <= 8 && performance.now() - drag.t < 600) tap(e.clientX, e.clientY);
  drag = null; if (ptr.size < 2) pinch0 = 0;
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * .001), .4, 2.2); }, { passive: false });
function tap(x, y) {
  const n = B.S.holes.length;
  for (const dx of [0, -10, 10, -18, 18]) {                             // a finger is wide: a tap just beside the bottle still counts
    ray.setFromCamera(new THREE.Vector2((x + dx) / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), camera);
    if (B.pick(ray)) break;
  }
  if (B.S.holes.length > n) B.setTape(B.S.holes[B.S.holes.length - 1], false);   // a new hole opens at once
}

// ------------------------------------------------------------------ buttons
$('bRefill').onclick = () => { B.setLevel(24, 'demo'); B.fill(); };
$('bKeep').onclick = () => { B.setKeep(!B.S.keep); $('bKeep').classList.toggle('on', B.S.keep); };
$('bTape').onclick = () => { if (!B.S.holes.length) return toast('Tap the bottle to make a hole first.'); B.tapeAll(); sfx('tap'); };
$('bOpen').onclick = () => { if (!B.S.holes.length) return toast('Tap the bottle to make a hole first.'); B.S.holes.forEach(o => B.setTape(o, false)); sfx('rip'); };
$('bNew').onclick = () => { B.newBottle(); B.setLevel(24, 'demo'); };

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
let actx = null;
function sfx(k) {
  try {
    actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.setValueAtTime(k === 'poke' ? 880 : 420, t); o.frequency.exponentialRampToValueAtTime(k === 'poke' ? 300 : 200, t + .08);
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .13);
  } catch (e) { }
}

// ------------------------------------------------------------------ loop
let last = performance.now(), rdT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  B.update(dt, now / 1000);
  rdT -= dt; if (rdT <= 0) { $('rd').innerHTML = B.readout().replace('Tap the bottle to poke a hole.', 'Tap the bottle to make a hole. Tap a hole to tape it.'); rdT = .25; }
  updateCamera(dt); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// test hook
window.__demo = { B, camera, tap };
