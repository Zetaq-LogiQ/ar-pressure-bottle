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
  if (gyroOn) { if (drag) drag.moved += Math.abs(dx) + Math.abs(dy); return; }   // the phone's motion turns the view, not drags
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
let hitSrc = null, placed = false, arOn = false;
const show = (id, on) => $(id).classList.toggle('hide', !on);
function hint(s) { $('hint').textContent = s || ''; show('hint', !!s); }

$('bAR').onclick = async () => {
  if (!navigator.xr) return startGyro();                                // iPhone: no WebXR. Called straight from the tap so iOS can ask for motion access
  if (!(await navigator.xr.isSessionSupported('immersive-ar').catch(() => false))) return startGyro();
  try {
    const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: $('ui') } });
    renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session);
    hitSrc = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
    session.addEventListener('end', arEnd);
    arOn = true; placed = false; B.group.visible = false; B.group.scale.setScalar(.01);
    BASIN_PARTS.forEach(o => o.visible = false); catcher.visible = true;
    document.body.style.background = 'transparent';
    show('bAR', false); show('bExit', true); show('bMove', false);
    hint('Move the phone slowly over the floor or a table. When the yellow ring appears, tap to place the bottle.');
  } catch (e) { console.warn(e); toast('Could not start AR on this phone.'); }
};
$('bExit').onclick = () => gyroOn ? stopGyro() : renderer.xr.getSession()?.end();
$('bMove').onclick = () => { if (gyroOn) { gPlaced = false; B.group.visible = false; show('bMove', false); hint('Point the middle of the screen at the floor, then tap to put the bottle there.'); return; } placed = false; B.group.visible = false; show('bMove', false); hint('Tap where the yellow ring is to put the bottle there.'); };
function arEnd() {
  hitSrc = null; arOn = false; placed = false; reticle.visible = false;
  B.group.visible = true; B.group.scale.setScalar(1); B.group.position.set(0, 0, 0); B.group.rotation.set(0, 0, 0);
  BASIN_PARTS.forEach(o => o.visible = true); catcher.visible = false; document.body.style.background = '';
  show('bAR', true); show('bExit', false); show('bMove', false); hint(''); layout();
}
// taps on the buttons and the readout must not also poke the bottle
$('ui').addEventListener('beforexrselect', e => { if (e.target.closest('button, #rd')) e.preventDefault(); });
const m4 = new THREE.Matrix4(), xrRay = new THREE.Raycaster(), UP = V3(0, 1, 0);
ctl.addEventListener('select', () => {
  if (!arOn) return;
  if (!placed) {
    if (!reticle.visible) return;
    B.group.position.setFromMatrixPosition(reticle.matrix);
    const c = renderer.xr.getCamera().position; B.group.rotation.set(0, Math.atan2(c.x - B.group.position.x, c.z - B.group.position.z) - .5, 0);   // turned a little so side jets show
    B.group.visible = true; placed = true; reticle.visible = false; show('bMove', true);
    sun.position.copy(B.group.position).add(V3(.6, 1.6, .9)); sun.target.position.copy(B.group.position);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -1.2; sc.right = sc.top = 1.2; sc.near = .05; sc.far = 5; sc.updateProjectionMatrix();
    rimL.position.copy(B.group.position).add(V3(-1, .6, -1));
    hint(''); toast('Bottle placed. Tap the bottle to make holes. Tap a hole to tape it.'); return;
  }
  m4.identity().extractRotation(ctl.matrixWorld);
  const o = V3(0, 0, 0).setFromMatrixPosition(ctl.matrixWorld), d = V3(0, 0, -1).applyMatrix4(m4);
  const n = B.S.holes.length;
  for (const a of [0, -.02, .02, -.035, .035]) {                       // a finger is wide: a tap just beside the bottle still counts
    xrRay.set(o, d.clone().applyAxisAngle(UP, a)); if (B.pick(xrRay)) break;
  }
  if (B.S.holes.length > n) B.setTape(B.S.holes[B.S.holes.length - 1], false);
});

// ------------------------------------------------------------------ camera + gyroscope mode (iPhone, and Android phones without AR)
// The back camera shows the room; the phone's motion sensor turns the 3D view with the phone, so the bottle stays where you put it
// while you turn and tilt. It does not know when you walk, so stand in one place. The floor is taken as 1.3 m below the phone.
const vid = $('vid'), EYE = 1.3, LONG_FOV = 63;                         // LONG_FOV: field of view across the long side of a phone's main camera
let gyroOn = false, gPlaced = false, ori = null;
const qScreen = new THREE.Quaternion(), qX = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5)), eul = new THREE.Euler(), ZEE = V3(0, 0, 1);
const onOri = e => { if (e.alpha != null) ori = e; };
async function startGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return toast('Motion access is needed so the bottle can stay in place. Allow it and try again.');
    }
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    vid.srcObject = st; await vid.play();
  } catch (e) { console.warn(e); return toast('Could not open the camera. Allow camera access and try again.'); }
  addEventListener('deviceorientation', onOri);
  gyroOn = true; gPlaced = false; B.group.visible = false; B.group.scale.setScalar(.01); B.group.position.set(0, 0, 0);
  BASIN_PARTS.forEach(o => o.visible = false); catcher.visible = true;
  document.body.style.background = 'transparent'; show('vid', true);
  camera.clearViewOffset(); camera.position.set(0, EYE, 0); camera.near = .02; camera.far = 50;
  show('bAR', false); show('bExit', true); show('bMove', false);
  hint('Point the middle of the screen at the floor a little in front of you, then tap to put the bottle there.');
}
function stopGyro() {
  removeEventListener('deviceorientation', onOri); ori = null;
  const st = vid.srcObject; st && st.getTracks().forEach(t => t.stop()); vid.srcObject = null; show('vid', false);
  gyroOn = false; gPlaced = false; reticle.visible = false; camera.quaternion.identity();
  B.group.visible = true; B.group.scale.setScalar(1); B.group.position.set(0, 0, 0); B.group.rotation.set(0, 0, 0);
  BASIN_PARTS.forEach(o => o.visible = true); catcher.visible = false; document.body.style.background = '';
  show('bAR', true); show('bExit', false); show('bMove', false); hint(''); layout();
}
// match the 3D camera to the phone camera picture (the video is scaled to cover the screen)
function gyroFov() {
  const vw = vid.videoWidth || 720, vh = vid.videoHeight || 1280, f = Math.max(vw, vh) / 2 / Math.tan(THREE.MathUtils.degToRad(LONG_FOV / 2));
  const s = Math.max(innerWidth / vw, innerHeight / vh);
  return THREE.MathUtils.radToDeg(2 * Math.atan(innerHeight / 2 / s / f));
}
const floor = new THREE.Plane(V3(0, 1, 0), 0), fHit = V3(0, 0, 0), gRay = new THREE.Raycaster();
function floorAt(x, y) {
  gRay.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1), camera);
  const p = gRay.ray.intersectPlane(floor, fHit); return p && p.distanceTo(camera.position) < 6 ? p.clone() : null;
}
function gyroFrame() {
  if (ori) {                                                            // device orientation -> camera rotation (same maths as three.js DeviceOrientationControls)
    const D = THREE.MathUtils.degToRad, o = D(screen.orientation?.angle ?? window.orientation ?? 0);
    eul.set(D(ori.beta), D(ori.alpha), -D(ori.gamma), 'YXZ'); camera.quaternion.setFromEuler(eul).multiply(qX).multiply(qScreen.setFromAxisAngle(ZEE, -o));
  }
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
    B.group.visible = true; gPlaced = true; reticle.visible = false; show('bMove', true);
    sun.position.copy(B.group.position).add(V3(.6, 1.6, .9)); sun.target.position.copy(B.group.position);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -1.2; sc.right = sc.top = 1.2; sc.near = .05; sc.far = 5; sc.updateProjectionMatrix();
    rimL.position.copy(B.group.position).add(V3(-1, .6, -1));
    hint(''); toast('Bottle placed. Stand still and turn the phone to look around. Tap the bottle to make holes.'); return;
  }
  tap(x, y);
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
  if (gyroOn) gyroFrame();
  if (FAUCET) FAUCET.visible = !(arOn || gyroOn) || B.S.keep;
  B.update(dt, now / 1000);
  rdT -= dt; if (rdT <= 0) { $('rd').innerHTML = B.readout().replace('Tap the bottle to poke a hole.', 'Tap the bottle to make a hole. Tap a hole to tape it.'); rdT = .25; }
  if (!arOn && !gyroOn) updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
// test hook
window.__demo = { B, camera, tap, startGyro, gyroTap, get gyroOn() { return gyroOn; } };
