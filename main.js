// main.js - AR demo of the Pressure Lab water bottle: webcam behind, the bottle in front, your fingertip pokes and covers holes.
// Physics and the bottle model are the delivered pressure_lab bottle.js, unchanged (Torricelli jets, draining).
import { THREE, V3, clamp } from './lab.js';
import { RoomEnvironment } from './vendor/addons/environments/RoomEnvironment.js';
import { createBottle } from './bottle.js';

const $ = id => document.getElementById(id);
const Y0 = 40.4, R_OUT = 4.5, DWELL = .7, COVER_PX = 34;
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ renderer / scene (transparent, so the camera shows through)
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .8;
scene.add(new THREE.HemisphereLight('#CFE8FF', '#23344A', .9));
const sun = new THREE.DirectionalLight('#FFFFFF', 2.3); sun.position.set(60, 140, 90); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
const sc = sun.shadow.camera; sc.left = sc.bottom = -110; sc.right = sc.top = 110; sc.near = 1; sc.far = 400; scene.add(sun);
const rimL = new THREE.DirectionalLight('#9FD8FF', .9); rimL.position.set(-80, 60, -80); scene.add(rimL);
// shadow catcher: only the shadow shows on the real table
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: .35 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = .3; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);

// ------------------------------------------------------------------ the bottle (only the first station of the lab)
const ctx = { act: () => { }, toast, sfx, emit: () => { }, camTo: () => { }, camFollow: () => { } };
const B = createBottle(ctx); scene.add(B.group);
B.group.children.slice(0, 20).forEach(o => o.visible = false);          // catch basin + its distance rings: the real table replaces them
const faucet = B.group.children.find(c => c.type === 'Group' && c.children.length === 4 && c.children[0].geometry?.parameters?.height === 100);
B.setLevel(24, 'demo');

function layout() {
  const W = innerWidth, H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H;
  const fx = $('fx'); fx.width = W * devicePixelRatio; fx.height = H * devicePixelRatio;
  // frame the bottle (0..78 cm) plus room for jets on both sides; phones in portrait need more distance for the width
  const tf = Math.tan(THREE.MathUtils.degToRad(15)), dist = Math.max(118 / 2 / tf, 150 / 2 / (tf * camera.aspect));
  camera.position.set(0, 44 + dist * Math.sin(.12), dist * Math.cos(.12)); camera.lookAt(0, 40, 0); camera.updateProjectionMatrix();
}
addEventListener('resize', layout); layout();

// ------------------------------------------------------------------ UI
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
$('bRefill').onclick = () => { B.setLevel(24, 'demo'); B.fill(); };
$('bKeep').onclick = () => { B.setKeep(!B.S.keep); $('bKeep').classList.toggle('on', B.S.keep); };
$('bNew').onclick = () => { B.newBottle(); B.setLevel(24, 'demo'); };
$('bCam').onclick = () => camOn ? stopCam() : startCam();
$('bFlip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startCam(); };

// mouse / touch fallback: tap the bottle to poke (opens at once), tap a hole to tape / untape
const ray = new THREE.Raycaster();
canvas.addEventListener('pointerdown', e => {
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
  const n = B.S.holes.length; B.pick(ray);
  if (B.S.holes.length > n) B.setTape(B.S.holes[B.S.holes.length - 1], false);
});

// ------------------------------------------------------------------ camera + hand tracking
const vid = $('vid'); let facing = matchMedia('(pointer: coarse)').matches ? 'environment' : 'user'; let camOn = false, hand = null, lastVT = -1, tip = null, seen = 0;
async function startCam() {
  try {
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (vid.srcObject) vid.srcObject.getTracks().forEach(t => t.stop()); vid.srcObject = st; vid.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none'; await vid.play(); camOn = true; vid.style.display = ''; $('bCam').classList.add('on');
    hint('Loading hand tracking…');
    if (!hand) await loadHand();
    hint('Hold your fingertip on the bottle to poke a hole · cover a hole to stop it');
  } catch (e) { console.warn(e); camOn = false; vid.style.display = 'none'; $('bCam').classList.remove('on'); hint('No camera: tap the bottle to poke a hole'); }
}
function stopCam() { const s = vid.srcObject; s && s.getTracks().forEach(t => t.stop()); vid.srcObject = null; camOn = false; tip = null; vid.style.display = 'none'; $('bCam').classList.remove('on'); hint('Camera off: tap the bottle to poke a hole'); }
async function loadHand() {
  const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const { FilesetResolver, HandLandmarker } = await import(V + '/vision_bundle.mjs');
  const fs = await FilesetResolver.forVisionTasks(V + '/wasm');
  hand = await HandLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 1,
  });
}
function hint(s) { $('hint').textContent = s; }

// landmark (video space, 0..1) -> screen pixels, matching the mirrored object-fit: cover video
function toScreen(lm) {
  const W = innerWidth, H = innerHeight, vw = vid.videoWidth || 1280, vh = vid.videoHeight || 720, s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s; return { x: (W - dw) / 2 + (facing === 'user' ? 1 - lm.x : lm.x) * dw, y: (H - dh) / 2 + lm.y * dh };
}
function track() {
  if (!camOn || !hand || vid.readyState < 2 || vid.currentTime === lastVT) return;
  lastVT = vid.currentTime;
  const r = hand.detectForVideo(vid, performance.now());
  if (r.landmarks && r.landmarks.length) {
    const p = toScreen(r.landmarks[0][8]);                                   // index fingertip
    tip = tip ? { x: tip.x + (p.x - tip.x) * .55, y: tip.y + (p.y - tip.y) * .55 } : p; seen = performance.now();
  } else if (performance.now() - seen > 250) tip = null;
}

// ------------------------------------------------------------------ fingertip actions
const plane = new THREE.Plane(V3(0, 0, 1), 0), hit = V3(0, 0, 0);
let dwell = 0, cool = 0, dwellAt = null, state = '';
function fingerOnWall(p) {
  ray.setFromCamera(new THREE.Vector2(p.x / innerWidth * 2 - 1, -p.y / innerHeight * 2 + 1), camera);
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  if (Math.abs(hit.x) > R_OUT + 1.5 || hit.y < Y0 + .6 || hit.y > Y0 + B.HMAX) return null;
  const side = hit.x >= 0 ? 1 : -1;
  return { h: hit.y - Y0, th: side * (Math.PI / 2 - .3) };                // jets leave sideways, a little toward you, so you see the curve
}
function holeScreen(o) { const w = B.wallPoint(o.h, o.th).project(camera); return { x: (w.x + 1) / 2 * innerWidth, y: (1 - w.y) / 2 * innerHeight }; }
function fingerStep(dt) {
  state = ''; cool = Math.max(0, cool - dt);
  // covering: a hole under the fingertip is plugged while the finger stays there
  let covering = null;
  for (const o of B.S.holes) {
    const q = holeScreen(o), near = tip && Math.hypot(q.x - tip.x, q.y - tip.y) < COVER_PX;
    if (near && !covering) covering = o;
    if (o.byFinger && o !== covering) { B.setTape(o, false); o.byFinger = false; }
  }
  if (covering) { if (!covering.taped) { B.setTape(covering, true); covering.byFinger = true; } dwell = 0; state = 'cover'; return; }
  if (!tip) { dwell = 0; return; }
  const w = fingerOnWall(tip);
  if (!w || cool > 0) { dwell = 0; return; }
  if (dwellAt && Math.hypot(tip.x - dwellAt.x, tip.y - dwellAt.y) > 22) dwell = 0;
  if (dwell === 0) dwellAt = { ...tip };
  dwell += dt; state = 'aim';
  if (dwell >= DWELL) {
    const o = B.poke(w.h, w.th); if (o) B.setTape(o, false);
    dwell = 0; cool = .9; state = '';
  }
}

// overlay: fingertip dot + poke progress ring
const fx = $('fx'), g2 = fx.getContext('2d');
function drawFx() {
  const k = devicePixelRatio; g2.setTransform(k, 0, 0, k, 0, 0); g2.clearRect(0, 0, innerWidth, innerHeight);
  if (!tip) return;
  g2.beginPath(); g2.arc(tip.x, tip.y, 7, 0, Math.PI * 2); g2.fillStyle = state === 'cover' ? '#FFD36B' : '#7FE0FF'; g2.fill();
  g2.lineWidth = 2; g2.strokeStyle = 'rgba(255,255,255,.9)'; g2.stroke();
  if (state === 'aim') { g2.beginPath(); g2.arc(tip.x, tip.y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dwell / DWELL); g2.lineWidth = 4; g2.strokeStyle = '#FFD36B'; g2.stroke(); }
  if (state === 'cover') { g2.font = '600 13px Segoe UI, system-ui'; g2.fillStyle = '#FFD36B'; g2.fillText('covering', tip.x + 14, tip.y - 12); }
}

// ------------------------------------------------------------------ loop
let last = performance.now(), rdT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  track(); fingerStep(dt);
  B.update(dt, now / 1000);
  if (faucet) faucet.visible = B.S.keep;
  rdT -= dt; if (rdT <= 0) { $('rd').innerHTML = B.readout().replace('Tap the bottle to poke a hole.', camOn ? 'Hold your fingertip on the bottle.' : 'Tap the bottle to poke a hole.'); rdT = .25; }
  renderer.render(scene, camera); drawFx();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (params.has('nocam')) { vid.style.display = 'none'; $('bCam').classList.remove('on'); hint('Tap the bottle to poke a hole'); } else startCam();
// test hook
window.__demo = { B, camera, holeScreen, setTip: p => { tip = p; seen = performance.now() + 1e9; } };
