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

// ------------------------------------------------------------------ camera: fixed framing - the bottle stays in one place
// frames the bottle and the farthest any jet can land (most jets land within 60 cm of the wall), so new holes never move the view
const cam = { t: V3(0, 40, 0), yaw: 28, pitch: 14, zoom: 1, fitW: 60, fitH: 80 };
const FIXED = [V3(0, 77.5, 0)]; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; FIXED.push(V3(Math.sin(a) * 64, 1, Math.cos(a) * 64), V3(Math.sin(a) * 64, 9, Math.cos(a) * 64)); }
function fitPoints() { return FIXED; }
function fit(k) {
  const y = THREE.MathUtils.degToRad(cam.yaw), p = THREE.MathUtils.degToRad(cam.pitch);
  const r = V3(Math.cos(y), 0, -Math.sin(y)), u = V3(-Math.sin(p) * Math.sin(y), Math.cos(p), -Math.sin(p) * Math.cos(y)), R = V3(0, 36, 0);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const P of fitPoints()) { const d = P.clone().sub(R), a = d.dot(r), b = d.dot(u); x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
  const m = 3, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
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
function layout() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; cam.zoom = camera.aspect < .8 ? .8 : 1; }   // phones in portrait: a little closer
addEventListener('resize', layout); layout();
fit(1);                                                                    // start already framed: no zoom-in on load

// ------------------------------------------------------------------ input: tap = poke / tape, drag = turn, pinch or wheel = zoom
const ray = new THREE.Raycaster(), ptr = new Map(); let drag = null, pinch0 = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 1) drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  else { drag = null; const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', e => {
  if (!ptr.has(e.pointerId)) return; const q = ptr.get(e.pointerId), dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY;
  if (gyroOn) {                                                         // the phone's motion turns the view; a sideways swipe spins the bottle (see its back)
    if (drag) { drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 8 && gPlaced && ptr.size === 1) B.group.rotation.y += dx * .012; }
    return;
  }
  if (ptr.size === 1 && drag) { drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 8) { cam.yaw -= dx * .3; cam.pitch = clamp(cam.pitch + dy * .25, -5, 60); } }
  else if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) cam.zoom = clamp(cam.zoom * pinch0 / d, .4, 2.2); pinch0 = d; }
});
function up(e) {
  if (!ptr.has(e.pointerId)) return; ptr.delete(e.pointerId);
  if (drag && drag.moved <= 8 && performance.now() - drag.t < 600) (gyroOn ? gyroTap : tap)(e.clientX, e.clientY);
  drag = null; if (ptr.size < 2) pinch0 = 0;
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (gyroOn) return; cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * .001), .4, 2.2); }, { passive: false });
// where a ray meets the bottle wall (bottle cm units); a ray passing up to TOL cm beside the bottle still counts (a finger is wide)
const Y0B = 40.4, R_WALL = 4.65, TOL = 3;
function aimRay(r) {
  B.group.updateMatrixWorld();
  const inv = B.group.matrixWorld.clone().invert(), o = r.origin.clone().applyMatrix4(inv), d = r.direction.clone().transformDirection(inv);
  const A = d.x * d.x + d.z * d.z; if (A < 1e-9) return null;
  const Bq = 2 * (o.x * d.x + o.z * d.z), C = o.x * o.x + o.z * o.z - R_WALL * R_WALL, disc = Bq * Bq - 4 * A * C;
  let t;
  if (disc >= 0) t = (-Bq - Math.sqrt(disc)) / (2 * A);                 // hits the wall
  else { t = -(o.x * d.x + o.z * d.z) / A; const q = o.clone().addScaledVector(d, t); if (Math.hypot(q.x, q.z) > R_WALL + TOL) return null; }   // near miss
  if (t < 0) return null;
  const p = o.clone().addScaledVector(d, t); if (p.y < Y0B + .5 || p.y > Y0B + B.HMAX) return null;
  return { h: p.y - Y0B, th: Math.atan2(p.x, p.z) };
}
// act at that spot: on a hole -> tape / open it, else make a new (open) hole
function pokeAt(a) {
  for (const o of B.S.holes) {
    const da = Math.abs(((o.th - a.th + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (Math.abs(o.h - a.h) < 1.5 && da * R_WALL < 2.2) { B.setTape(o, !o.taped); sfx(o.taped ? 'tap' : 'rip'); return true; }
  }
  const hole = B.poke(a.h, a.th); if (hole) { B.setTape(hole, false); return true; }
  return false;
}
function tap(x, y) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), camera);
  const a = aimRay(ray.ray); return a ? pokeAt(a) : false;
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

// ------------------------------------------------------------------ AR: place the real-size bottle on your floor or table (WebXR, Android Chrome)
// The lab works in cm; in AR the bottle group is scaled 0.01 so 1 cm = 1 cm in your room. The catch tray is hidden: jets land on the real floor.
renderer.xr.enabled = true;
const BASIN_PARTS = B.group.children.slice(0, 20);                      // catch tray, pool, distance rings and their labels
const FAUCET = B.group.children.find(c => c.type === 'Group' && c.children.length === 4 && c.children[0].geometry?.parameters?.height === 100);
const catcher = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: .4 }));
catcher.rotation.x = -Math.PI / 2; catcher.position.y = .3; catcher.receiveShadow = true; catcher.visible = false; B.group.add(catcher);
const reticle = new THREE.Mesh(new THREE.RingGeometry(.09, .115, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#FFD36B' }));
reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
const ctl = renderer.xr.getController(0); scene.add(ctl);
let hitSrc = null, placed = false, arOn = false, arSize = 1;            // arSize: how many times real size the model is drawn in AR
function applySize() {
  B.group.scale.setScalar(.01 * arSize);
  const sc = sun.shadow.camera, r = 1.2 * arSize; sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.near = .05; sc.far = 5 * arSize; sc.updateProjectionMatrix();
  sun.position.copy(B.group.position).add(V3(.6, 1.6, .9).multiplyScalar(arSize)); sun.target.position.copy(B.group.position);
}
$('bBig').onclick = () => { arSize = Math.min(5, arSize * 1.25); applySize(); toast('Size: ' + arSize.toFixed(1) + '× real'); };
$('bSmall').onclick = () => { arSize = Math.max(.5, arSize / 1.25); applySize(); toast('Size: ' + arSize.toFixed(1) + '× real'); };
const sizeBtns = on => { show('bBig', on); show('bSmall', on); };
const show = (id, on) => $(id).classList.toggle('hide', !on);
function hint(s) { $('hint').textContent = s || ''; show('hint', !!s); }

$('bAR').onclick = async () => {
  if (!navigator.xr) return startGyro();                                // iPhone: no WebXR. Called straight from the tap so iOS can ask for motion access
  if (!(await navigator.xr.isSessionSupported('immersive-ar').catch(() => false))) return startGyro();
  try {
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'camera-access'], domOverlay: { root: $('ui') } });
    renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session);
    hitSrc = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
    session.addEventListener('end', arEnd); session.addEventListener('select', onXRSelect);
    arHandOK = !!(session.enabledFeatures && session.enabledFeatures.includes('camera-access')); glBind = null; camFB = null;
    arOn = true; placed = false; B.group.visible = false; arSize = 1; applySize();
    BASIN_PARTS.forEach(o => o.visible = false); catcher.visible = true;
    document.body.style.background = 'transparent';
    show('bAR', false); show('bHand', false); show('bExit', true); show('bMove', false);
    hint('Move the phone slowly over the floor or a table. When the yellow ring appears, tap to place the bottle.');
  } catch (e) { console.warn(e); toast('Could not start AR on this phone.'); }
};
$('bHand').onclick = () => startGyro();
$('bExit').onclick = () => gyroOn ? stopGyro() : renderer.xr.getSession()?.end();
$('bMove').onclick = () => { sizeBtns(false); show('fit', false); if (gyroOn) { gPlaced = false; B.group.visible = false; show('bMove', false); hint('Point the middle of the screen at the floor, then tap to put the bottle there.'); return; } placed = false; B.group.visible = false; show('bMove', false); hint('Tap where the yellow ring is to put the bottle there.'); };
function arEnd() {
  hitSrc = null; arOn = false; arHandOK = false; tipPt = pinchPt = null; dwell = 0; show('hand', false); placed = false; reticle.visible = false;
  B.group.visible = true; B.group.scale.setScalar(1); B.group.position.set(0, 0, 0); B.group.rotation.set(0, 0, 0);
  BASIN_PARTS.forEach(o => o.visible = true); catcher.visible = false; document.body.style.background = '';
  sizeBtns(false); show('bAR', true); show('bHand', true); show('bExit', false); show('bMove', false); hint(''); layout();
}
// taps on the buttons and the readout must not also poke the bottle
$('ui').addEventListener('beforexrselect', e => { if (e.target.closest('button, #rd')) e.preventDefault(); });
const m4 = new THREE.Matrix4(), xrRay = new THREE.Raycaster(), UP = V3(0, 1, 0);
function onXRSelect(e) {
  if (!arOn) return;
  if (!placed) {
    if (!reticle.visible) return;
    B.group.position.setFromMatrixPosition(reticle.matrix);
    const c = renderer.xr.getCamera().position; B.group.rotation.set(0, Math.atan2(c.x - B.group.position.x, c.z - B.group.position.z) - .5, 0);   // turned a little so side jets show
    B.group.visible = true; placed = true; reticle.visible = false; show('bMove', true);
    applySize(); sizeBtns(true);
    rimL.position.copy(B.group.position).add(V3(-1, .6, -1));
    hint(''); toast(arHandOK ? 'Bottle placed. Touch it with your fingertip and hold, or tap it.' : 'Bottle placed. Tap the bottle to make holes. Tap a hole to tape it.');
    if (arHandOK) loadHand(); else handStatus('Hand needs a newer Chrome: use taps'); return;
  }
  const pose = e.frame && e.frame.getPose(e.inputSource.targetRaySpace, renderer.xr.getReferenceSpace());   // the tap's ray at the moment of the tap
  if (!pose) return;
  m4.fromArray(pose.transform.matrix);
  const a = aimRay(new THREE.Ray(V3(0, 0, 0).setFromMatrixPosition(m4), V3(0, 0, -1).transformDirection(m4)));
  if (a) pokeAt(a);
}

// ------------------------------------------------------------------ camera + gyroscope mode (iPhone, and Android phones without AR)
// The back camera shows the room; the phone's motion sensor turns the 3D view with the phone, so the bottle stays where you put it
// while you turn and tilt. It does not know when you walk, so stand in one place. The floor is taken as 1.3 m below the phone.
const vid = $('vid'), EYE = 1.3;
let longFov = 63;                                                       // field of view across the long side of the phone's main camera (Camera fit slider)
try { const f = +localStorage.getItem('pb_fov'); if (f >= 45 && f <= 85) longFov = f; } catch (e) { }
$('fitR').value = longFov;
$('fitR').oninput = e => { longFov = +e.target.value; try { localStorage.setItem('pb_fov', longFov); } catch (_) { } };
let gyroOn = false, gPlaced = false, ori = null;
const qScreen = new THREE.Quaternion(), qX = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5)), eul = new THREE.Euler(), ZEE = V3(0, 0, 1);
const onOri = e => { if (e.alpha != null) ori = e; };
// Android: RelativeOrientationSensor (gyroscope + accelerometer, no compass) is smoother than deviceorientation
let sensor = null, sensQ = null; const qFix = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -Math.PI / 2), qT = new THREE.Quaternion();
function startSensor() {
  if (typeof RelativeOrientationSensor === 'undefined') return;
  try {
    sensor = new RelativeOrientationSensor({ frequency: 60, referenceFrame: 'screen' });
    sensor.addEventListener('reading', () => { sensQ = sensor && sensor.quaternion; });
    sensor.addEventListener('error', e => { console.warn(e.error); sensor = null; sensQ = null; });
    sensor.start();
  } catch (e) { console.warn(e); sensor = null; }
}
async function startGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return toast('Motion access is needed so the bottle can stay in place. Allow it and try again.');
    }
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    vid.srcObject = st; await vid.play();
  } catch (e) { console.warn(e); return toast('Could not open the camera. Allow camera access and try again.'); }
  addEventListener('deviceorientation', onOri); startSensor(); loadHand();
  gyroOn = true; gPlaced = false; B.group.visible = false; B.group.position.set(0, 0, 0); arSize = 2; applySize();
  BASIN_PARTS.forEach(o => o.visible = false); catcher.visible = true;
  document.body.style.background = 'transparent'; show('vid', true);
  camera.clearViewOffset(); camera.position.set(0, EYE, 0); camera.near = .02; camera.far = 50;
  show('bAR', false); show('bHand', false); show('bExit', true); show('bMove', false);
  hint('Point the middle of the screen at the floor a little in front of you, then tap (or pinch) to put the bottle there.');
}
function stopGyro() {
  removeEventListener('deviceorientation', onOri); ori = null; try { sensor && sensor.stop(); } catch (e) { } sensor = null; sensQ = null; show('fit', false); pinchPt = tipPt = null; pinchOn = false; dwell = 0; show('hand', false);
  const st = vid.srcObject; st && st.getTracks().forEach(t => t.stop()); vid.srcObject = null; show('vid', false);
  gyroOn = false; gPlaced = false; reticle.visible = false; camera.quaternion.identity();
  B.group.visible = true; B.group.scale.setScalar(1); B.group.position.set(0, 0, 0); B.group.rotation.set(0, 0, 0);
  BASIN_PARTS.forEach(o => o.visible = true); catcher.visible = false; document.body.style.background = '';
  sizeBtns(false); show('bAR', true); show('bHand', true); show('bExit', false); show('bMove', false); hint(''); layout();
}
// match the 3D camera to the phone camera picture (the video is scaled to cover the screen)
function gyroFov() {
  const vw = vid.videoWidth || 720, vh = vid.videoHeight || 1280, f = Math.max(vw, vh) / 2 / Math.tan(THREE.MathUtils.degToRad(longFov / 2));
  const s = Math.max(innerWidth / vw, innerHeight / vh);
  return THREE.MathUtils.radToDeg(2 * Math.atan(innerHeight / 2 / s / f));
}
const floor = new THREE.Plane(V3(0, 1, 0), 0), fHit = V3(0, 0, 0), gRay = new THREE.Raycaster();
function floorAt(x, y) {
  gRay.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), camera);
  const p = gRay.ray.intersectPlane(floor, fHit); return p && p.distanceTo(camera.position) < 6 ? p.clone() : null;
}
function gyroFrame() {
  let got = false;
  if (sensQ) { qT.fromArray(sensQ).premultiply(qFix); got = true; }      // sensor frame: screen axes in a z-up world -> three.js y-up world
  else if (ori) {                                                       // device orientation -> camera rotation (same maths as three.js DeviceOrientationControls)
    const D = THREE.MathUtils.degToRad, o = D(screen.orientation?.angle ?? window.orientation ?? 0);
    eul.set(D(ori.beta), D(ori.alpha), -D(ori.gamma), 'YXZ'); qT.setFromEuler(eul).multiply(qX).multiply(qScreen.setFromAxisAngle(ZEE, -o)); got = true;
  }
  if (got) { if (camera.quaternion.angleTo(qT) > .5) camera.quaternion.copy(qT); else camera.quaternion.slerp(qT, sensQ ? .85 : .5); }   // light smoothing takes out the shake
  camera.aspect = innerWidth / innerHeight; camera.fov = gyroFov(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  if (!gPlaced) {
    const p = floorAt(innerWidth / 2, innerHeight / 2); reticle.visible = !!p;
    if (p) reticle.matrix.makeTranslation(p.x, p.y + .002, p.z);
  }
}
function gyroTap(x, y) {
  if (!gPlaced) {
    if (!reticle.visible) return toast('Point the middle of the screen at the floor first.');
    B.group.position.setFromMatrixPosition(reticle.matrix);
    B.group.rotation.set(0, Math.atan2(camera.position.x - B.group.position.x, camera.position.z - B.group.position.z) - .5, 0);   // turned a little so side jets show
    B.group.visible = true; gPlaced = true; reticle.visible = false; show('bMove', true); show('fit', true);
    applySize(); sizeBtns(true);
    rimL.position.copy(B.group.position).add(V3(-1, .6, -1));
    hint(''); toast('Bottle placed. Touch the bottle with your fingertip and hold, or tap it. Swipe sideways to spin it.'); return;
  }
  tap(x, y);
}

// ------------------------------------------------------------------ your hand in front of the back camera
// MediaPipe finds the hand in the camera picture. Hold your fingertip on the bottle for half a second to poke a hole
// (or tape / open a hole there). A pinch (thumb tip touches index tip) acts like a tap at that spot.
// Two camera sources: "Use my hand" mode reads the <video>; Android's full AR reads the AR camera picture (WebXR camera-access).
let hand = null, handBusy = false, handT = 0, pinchOn = false, pinchPt = null, handSeen = 0, handCPU = false, handErr = 0;
let tipPt = null, dwell = 0, dwellAt = null, cool = 0, arHandOK = false;
const DWELL = .5, handRay = new THREE.Raycaster();
async function loadHand() {
  if (hand || handBusy) return; handBusy = true; handStatus('Loading hand tracking…');
  try {
    const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const { FilesetResolver, HandLandmarker } = await import(V + '/vision_bundle.mjs');
    const fs = await FilesetResolver.forVisionTasks(V + '/wasm');
    const opts = d => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate: d }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .4, minTrackingConfidence: .4 });
    hand = handCPU ? await HandLandmarker.createFromOptions(fs, opts('CPU'))
                   : await HandLandmarker.createFromOptions(fs, opts('GPU')).catch(() => { handCPU = true; return HandLandmarker.createFromOptions(fs, opts('CPU')); });
    handStatus('Show your hand to the camera');
  } catch (e) { console.warn(e); handStatus('Hand tracking could not load. Use screen taps.'); }
  handBusy = false;
}
function handStatus(t) { $('hand').textContent = t; show('hand', (gyroOn || arOn) && !!t); }
function detect(src, now) {
  try { const r = hand.detectForVideo(src, now); handErr = 0; return r; }
  catch (e) {                                                           // some phones fail on the GPU path: switch to the CPU one
    console.warn(e);
    if (++handErr > 5 && !handCPU) { handCPU = true; try { hand.close(); } catch (_) { } hand = null; handStatus('Switching hand tracking to safe mode…'); loadHand(); }
    else handStatus('Hand tracking error: ' + (e.message || e).toString().slice(0, 40));
    return null;
  }
}
// shared: landmarks -> fingertip dot, hold-to-poke, pinch. toScr maps picture (0..1) to screen px; rayAt(pt) gives the world ray there.
function handLogic(r, now, step, toScr, rayAt, ready, act) {
  cool = Math.max(0, cool - step);
  const L = r && r.landmarks && r.landmarks[0];
  if (!L) { if (now - handSeen > 400) { pinchPt = tipPt = null; pinchOn = false; dwell = 0; handStatus('Show your hand to the camera'); } return; }
  handSeen = now;
  const tp = toScr(L[8]);
  tipPt = tipPt ? { x: tipPt.x + (tp.x - tipPt.x) * .6, y: tipPt.y + (tp.y - tipPt.y) * .6 } : tp;
  const aim = ready ? aimRay(rayAt(tipPt)) : null;
  if (aim && cool === 0) {
    if (dwellAt && Math.hypot(tipPt.x - dwellAt.x, tipPt.y - dwellAt.y) > 40) dwell = 0;
    if (dwell === 0) dwellAt = { ...tipPt };
    dwell += step;
    if (dwell >= DWELL) { pokeAt(aim); dwell = 0; cool = 1; }
  } else dwell = 0;
  const d = (a, b) => Math.hypot(L[a].x - L[b].x, L[a].y - L[b].y), size = d(0, 9) || 1, gap = d(4, 8) / size;
  const a = toScr(L[4]), b = toScr(L[8]), p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  pinchPt = pinchPt ? { x: pinchPt.x + (p.x - pinchPt.x) * .6, y: pinchPt.y + (p.y - pinchPt.y) * .6 } : p;
  if (!pinchOn && gap < .28) { pinchOn = true; act(pinchPt); sfx('poke'); }                         // pinch closes: act once
  else if (pinchOn && gap > .45) pinchOn = false;                                                    // pinch opens again: ready for the next one
  handStatus(!ready ? 'Hand found. Place the bottle first' : aim ? 'On the bottle: hold still…' : 'Hand found: touch the bottle');
}

// "Use my hand" mode: the <video> covers the screen, the back camera is not mirrored
function vidToScreen(lm) {
  const W = innerWidth, H = innerHeight, vw = vid.videoWidth || 720, vh = vid.videoHeight || 1280, s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
  return { x: (W - dw) / 2 + lm.x * dw, y: (H - dh) / 2 + lm.y * dh };
}
function handStep(now) {
  if (!hand || vid.readyState < 2 || now - handT < 60) return;
  const step = Math.min(.2, (now - handT) / 1000); handT = now;         // about 15 checks a second: keeps up on a phone
  const r = detect(vid, now); if (!r) return;
  handLogic(r, now, step, vidToScreen,
    pt => { handRay.setFromCamera(new THREE.Vector2(pt.x / innerWidth * 2 - 1, -pt.y / innerHeight * 2 + 1), camera); return handRay.ray; },
    gPlaced, pt => gyroTap(pt.x, pt.y));
}

// Android full AR: copy the AR camera picture (a GPU texture) into a small canvas for MediaPipe, about 11 times a second
const gl = renderer.getContext(); let glBind = null, camFB = null, camProg = null, camBuf = null, camPix = null, camCv = null, camCtx = null, camW = 0, camH = 0;
function camSetup(w, h) {
  camW = 256; camH = Math.max(64, Math.round(256 * h / w));
  const sh = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  camProg = gl.createProgram();
  gl.attachShader(camProg, sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(camProg, sh(gl.FRAGMENT_SHADER, 'precision mediump float; uniform sampler2D t; varying vec2 uv; void main(){ gl_FragColor = texture2D(t, vec2(uv.x, 1. - uv.y)); }'));   // flipped: rows come out top first
  gl.linkProgram(camProg);
  camBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, camBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const out = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, out); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, camW, camH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  camFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, camFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
  camPix = new Uint8ClampedArray(camW * camH * 4); camCv = document.createElement('canvas'); camCv.width = camW; camCv.height = camH; camCtx = camCv.getContext('2d');
}
const Pm = new THREE.Matrix4(), Vm = new THREE.Matrix4();
function arHandStep(now, xrFrame) {
  if (!hand || !arHandOK || now - handT < 90) return;
  const view = xrFrame.getViewerPose(renderer.xr.getReferenceSpace())?.views[0];
  if (!view || !view.camera) return;
  const step = Math.min(.2, (now - handT) / 1000); handT = now;
  try {
    glBind = glBind || new XRWebGLBinding(renderer.xr.getSession(), gl);
    const tex = glBind.getCameraImage(view.camera); if (!tex) return;
    if (!camFB) camSetup(view.camera.width, view.camera.height);
    if (gl.bindVertexArray) gl.bindVertexArray(null);                  // keep three.js' own vertex state untouched
    gl.bindFramebuffer(gl.FRAMEBUFFER, camFB); gl.viewport(0, 0, camW, camH);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(camProg); gl.bindBuffer(gl.ARRAY_BUFFER, camBuf);
    const loc = gl.getAttribLocation(camProg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(camProg, 't'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, camW, camH, gl.RGBA, gl.UNSIGNED_BYTE, camPix);
    gl.disableVertexAttribArray(loc);
  } catch (e) { console.warn(e); renderer.resetState(); handStatus('Hand: no camera picture in AR. Use taps.'); arHandOK = false; return; }
  renderer.resetState();                                                // three.js re-binds everything it needs for its own drawing
  camCtx.putImageData(new ImageData(camPix, camW, camH), 0, 0);
  Pm.fromArray(view.projectionMatrix).invert(); Vm.fromArray(view.transform.matrix);
  const rayAt = pt => {                                                 // screen px -> world ray through the AR camera
    const o = V3(0, 0, 0).setFromMatrixPosition(Vm);
    const q = V3(pt.x / innerWidth * 2 - 1, -pt.y / innerHeight * 2 + 1, .5).applyMatrix4(Pm).applyMatrix4(Vm);
    return new THREE.Ray(o, q.sub(o).normalize());
  };
  const r = detect(camCv, now); if (!r) return;
  handLogic(r, now, step, lm => ({ x: lm.x * innerWidth, y: lm.y * innerHeight }), rayAt, placed,
    pt => { const a = aimRay(rayAt(pt)); if (a) pokeAt(a); });
}

const fxC = $('fx'), fx2 = fxC.getContext('2d');
function drawHand() {
  const k = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  if (fxC.width !== Math.round(W * k)) { fxC.width = Math.round(W * k); fxC.height = Math.round(H * k); }
  fx2.setTransform(k, 0, 0, k, 0, 0); fx2.clearRect(0, 0, W, H);
  if (!(gyroOn || arOn) || !tipPt) return;
  fx2.beginPath(); fx2.arc(tipPt.x, tipPt.y, pinchOn ? 13 : 10, 0, Math.PI * 2);   // your fingertip as the phone sees it
  fx2.fillStyle = pinchOn ? 'rgba(120,230,140,.9)' : 'rgba(127,224,255,.8)'; fx2.fill();
  fx2.lineWidth = 3; fx2.strokeStyle = '#fff'; fx2.stroke();
  if (dwell > 0) { fx2.beginPath(); fx2.arc(tipPt.x, tipPt.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dwell / DWELL); fx2.lineWidth = 5; fx2.strokeStyle = '#FFD36B'; fx2.stroke(); }
}

// ------------------------------------------------------------------ loop
let last = performance.now(), rdT = 0;
function frame(now, xrFrame) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (arOn && xrFrame && hitSrc && !placed) {
    const res = xrFrame.getHitTestResults(hitSrc), ref = renderer.xr.getReferenceSpace();
    const pose = res.length && res[0].getPose(ref);
    reticle.visible = !!pose; if (pose) reticle.matrix.fromArray(pose.transform.matrix);
  }
  if (gyroOn) { gyroFrame(); handStep(now); }
  if (arOn && xrFrame && placed) arHandStep(now, xrFrame);
  if (FAUCET) FAUCET.visible = !(arOn || gyroOn) || B.S.keep;
  B.update(dt, now / 1000);
  rdT -= dt; if (rdT <= 0) { $('rd').innerHTML = B.readout().replace('Tap the bottle to poke a hole.', 'Tap the bottle to make a hole. Tap a hole to tape it.'); rdT = .25; }
  if (!arOn && !gyroOn) updateCamera(dt);
  renderer.render(scene, camera); drawHand();
}
renderer.setAnimationLoop(frame);
// test hook
window.__demo = { B, camera, tap, startGyro, gyroTap, get gyroOn() { return gyroOn; } };
