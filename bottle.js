// bottle.js - Station 1: the water-pressure bottle (Activity 6.2 + holes at different heights).
// Physics (exact, ideal fluid): speed out of a hole at depth d below the surface v = sqrt(2 g d) (Torricelli);
// the jet is a projectile: x = v t, y = y0 - g t^2 / 2 (true parabola). Draining: dH/dt = -sum(Cd a v) / A_bottle, Cd = 0.61.
// Bottle stands on a stand 40 cm above the catch basin (stand height > water height, so the lowest hole lands farthest).
import { THREE, V3, glassPiece, lathe, liquid, surface, textSprite, clamp, fmt } from './lab.js';

export const G = 9.81, RHO = 1000;
const R_OUT = 4.5, R_IN = 4.35, Y0 = 40.4, BODY = 28, HMAX = 26.5, HOLE_R = 0.2, CD = 0.61;
const A_HOLE = Math.PI * HOLE_R * HOLE_R, A_IN = Math.PI * R_IN * R_IN, BASIN_Y = 0.8, CUP = { x: 50, z: 0, r: 4.0, h: 7, rin: 3.7, fill: .6 };
const NSEG = 44, NRAD = 8;

export function createBottle(ctx) {
  const g = new THREE.Group(); g.name = 'bottle_station';
  const S = { H: 22, keep: false, holes: [], nextId: 1, cupOn: false, cupFill: 0, cupHitT: 0, flowT: 0, lastPokeH: null, pour: 0 };

  // ---- basin (catch tray) with a radial scale
  const basin = new THREE.Mesh(lathe([[0, 0], [96, 0], [97.5, .4], [97.5, 3.2], [96.6, 3.2], [96.2, .5], [0, .5]], 96), new THREE.MeshStandardMaterial({ color: '#2E6F8E', roughness: .45, metalness: .1 }));
  basin.receiveShadow = true; g.add(basin);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(96.1, 96), new THREE.MeshPhysicalMaterial({ color: '#69C3EA', transparent: true, opacity: .42, roughness: .06, clearcoat: 1, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = BASIN_Y; pool.renderOrder = 5; g.add(pool);
  const tickM = new THREE.MeshBasicMaterial({ color: '#E9F6FF' });
  for (let r = 10; r <= 90; r += 10) {   // distance rings measured from the bottle wall (r = wall + distance)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R_OUT + r, r % 50 === 0 ? .32 : .2, 4, 120), tickM); ring.rotation.x = Math.PI / 2; ring.position.y = .62; g.add(ring);
    const t = textSprite(r + ' cm', 3.2, { color: '#EAF6FF', bg: 'rgba(15,40,60,.55)' }); t.position.set(R_OUT + r, 3.4, 6); g.add(t);
  }
  // ---- stand (pedestal + top plate)
  const steel = new THREE.MeshStandardMaterial({ color: '#C9D4DE', metalness: .85, roughness: .3 });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 39.5, 32), new THREE.MeshStandardMaterial({ color: '#5B6BD6', roughness: .4, metalness: .2 })); ped.position.y = .5 + 39.5 / 2 - .5; ped.castShadow = true; g.add(ped);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT + .5, R_OUT + .5, 1, 48), steel); plate.position.y = 39.5; plate.castShadow = true; plate.receiveShadow = true; g.add(plate);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.2, 48), new THREE.MeshStandardMaterial({ color: '#3D4AA8', roughness: .5 })); foot.position.y = 1.05; g.add(foot);

  // ---- the bottle (open top, no cap)
  const prof = [[0, 40], [R_OUT - .6, 40], [R_OUT, 40.6], [R_OUT, 40 + BODY], [3.1, 40 + BODY + 3.2], [1.5, 40 + BODY + 5.6], [1.5, 40 + BODY + 8.2], [1.85, 40 + BODY + 8.5], [1.85, 40 + BODY + 9.2], [1.35, 40 + BODY + 9.2], [1.35, 40 + BODY + 5.7], [2.95, 40 + BODY + 3.2], [R_IN, 40 + BODY], [R_IN, Y0], [0, Y0]];
  const bottle = glassPiece(lathe(prof, 72), { tint: '#E3F4FA', opacity: .14, edgeOpacity: .5, edgeAngle: 30 }); g.add(bottle);
  // printed height scale on the bottle (ticks every cm, numbers every 5 cm) on the side facing the viewer
  const SC_TH = -0.55;
  const tk = []; for (let h = 0; h <= 26; h++) { const len = h % 5 === 0 ? .26 : .13; for (let k = 0; k < 2; k++) { const a0 = SC_TH + (k ? len : 0); tk.push(Math.sin(a0) * (R_OUT + .03), Y0 + h, Math.cos(a0) * (R_OUT + .03)); } }
  const tkG = new THREE.BufferGeometry(); tkG.setAttribute('position', new THREE.Float32BufferAttribute(tk, 3));
  const tkL = new THREE.LineSegments(tkG, new THREE.LineBasicMaterial({ color: '#F4FAFF', transparent: true, opacity: .95, depthWrite: false })); tkL.renderOrder = 24; g.add(tkL);
  for (let h = 5; h <= 25; h += 5) { const s = textSprite(String(h), 1.5, { color: '#fff', bg: 'rgba(20,40,70,.6)' }); s.position.set(Math.sin(SC_TH - .25) * (R_OUT + 1.2), Y0 + h, Math.cos(SC_TH - .25) * (R_OUT + 1.2)); g.add(s); }
  const water = liquid({ r: R_IN - .03, h: S.H, color: '#2F8FD8', opacity: .6 }); water.position.y = Y0; g.add(water);
  // pick target (invisible): the bottle wall where holes can be poked
  const pickCyl = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT + .15, R_OUT + .15, HMAX, 48, 1, true), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  pickCyl.position.y = Y0 + HMAX / 2 + .25; g.add(pickCyl);
  // guide ring: height of the last hole (a needle guide), helps poke more holes at the same height
  const guide = new THREE.Mesh(new THREE.TorusGeometry(R_OUT + .08, .05, 4, 72), new THREE.MeshBasicMaterial({ color: '#FFD36B', transparent: true, opacity: .8, depthWrite: false }));
  guide.rotation.x = Math.PI / 2; guide.visible = false; guide.renderOrder = 25; g.add(guide);

  // ---- tap above (keeps the level steady)
  const faucet = new THREE.Group(); g.add(faucet);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 100, 20), steel); col.position.set(0, 50, -19); faucet.add(col);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 19, 20), steel); arm.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(0, 0, 1)); arm.position.set(0, 94, -9.5); faucet.add(arm);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, 6, 20), steel); spout.position.set(0, 91, 0); faucet.add(spout);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1, 6), new THREE.MeshStandardMaterial({ color: '#E8577E', roughness: .4 })); knob.position.set(0, 97, -19); faucet.add(knob);
  const streamM = new THREE.MeshPhysicalMaterial({ color: '#8FD3F5', transparent: true, opacity: .7, roughness: .05, clearcoat: 1, depthWrite: false });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(.32, .26, 1, 12, 1, true), streamM); stream.renderOrder = 19; stream.visible = false; g.add(stream);

  // ---- target cup (task hit_cup)
  const cup = new THREE.Group(); cup.position.set(CUP.x, BASIN_Y - .3, CUP.z); cup.visible = false; g.add(cup);
  cup.add(glassPiece(lathe([[0, 0], [CUP.r - .3, 0], [CUP.r, .3], [CUP.r, CUP.h], [CUP.rin, CUP.h], [CUP.rin, .5], [0, .5]], 48), { tint: '#FFE3F0', opacity: .22 }));
  const cupBand = new THREE.Mesh(new THREE.CylinderGeometry(CUP.r + .04, CUP.r + .04, 1.2, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#F05A8C', roughness: .4, side: THREE.DoubleSide })); cupBand.position.y = .5 + CUP.fill * (CUP.h - 1); cupBand.scale.y = .35; cup.add(cupBand);
  const cupWater = liquid({ r: CUP.rin - .05, h: .01, color: '#2F8FD8' }); cupWater.position.y = .5; cup.add(cupWater);
  const cupTag = textSprite('cup', 2.6, { color: '#fff', bg: 'rgba(200,60,110,.75)' }); cupTag.position.set(0, CUP.h + 3.5, 0); cup.add(cupTag);

  // ---- holes, tape, jets
  const holeM = new THREE.MeshStandardMaterial({ color: '#0D1620', roughness: .6 });
  const tapeM = new THREE.MeshStandardMaterial({ color: '#F2CF5B', roughness: .75 });
  const jetTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, '#9ED8F7'); gr.addColorStop(1, '#ffffff'); x.fillStyle = gr; x.fillRect(0, 0, 64, 8); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  function makeJet() {
    const pos = new Float32Array((NSEG + 1) * NRAD * 3), nor = new Float32Array(pos.length), uv = new Float32Array((NSEG + 1) * NRAD * 2), idx = [];
    for (let i = 0; i < NSEG; i++) for (let j = 0; j < NRAD; j++) { const a = i * NRAD + j, b = i * NRAD + (j + 1) % NRAD, c = a + NRAD, d = b + NRAD; idx.push(a, c, b, b, c, d); }
    for (let i = 0; i <= NSEG; i++) for (let j = 0; j < NRAD; j++) { uv[(i * NRAD + j) * 2] = i / NSEG * 6; uv[(i * NRAD + j) * 2 + 1] = j / NRAD; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#CFEFFF', map: jetTex.clone(), transparent: true, opacity: .92, roughness: .15, metalness: 0, emissive: '#4FB6F0', emissiveIntensity: .55, depthWrite: false }));
    m.material.map.needsUpdate = true; m.renderOrder = 19; m.frustumCulled = false; m.visible = false; g.add(m);
    const splash = new THREE.Mesh(new THREE.TorusGeometry(1, .12, 6, 28), new THREE.MeshBasicMaterial({ color: '#E8F7FF', transparent: true, opacity: .8, depthWrite: false })); splash.rotation.x = Math.PI / 2; splash.visible = false; g.add(splash);
    const tag = textSprite('00 cm', 3.2, { color: '#08202E', bg: 'rgba(255,224,130,.92)' }); tag.visible = false; g.add(tag);
    return { m, splash, tag, tagText: '' };
  }
  function holeMesh(hole) {
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + .05, .06, 6, 20), holeM); grp.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R, 16), new THREE.MeshBasicMaterial({ color: '#05090E' })); disc.position.z = -.02; grp.add(disc);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.25, .1), tapeM); tape.position.z = .14; tape.castShadow = true; grp.add(tape);
    grp.position.set(Math.sin(hole.th) * (R_OUT + .02), Y0 + hole.h, Math.cos(hole.th) * (R_OUT + .02)); grp.rotation.y = hole.th;
    g.add(grp); hole.mesh = grp; hole.tape = tape; hole.jet = makeJet();
  }
  function removeHole(hole) { g.remove(hole.mesh); for (const o of [hole.jet.m, hole.jet.splash, hole.jet.tag]) { g.remove(o); o.geometry && o.geometry.dispose(); } }

  // jet path for a hole (world units cm, time s)
  function jetPath(hole) {
    const d = S.H - hole.h; if (hole.taped || d <= 0.05) return null;
    const v = Math.sqrt(2 * G * d / 100) * 100;                      // cm/s
    const y0 = Y0 + hole.h, dir = V3(Math.sin(hole.th), 0, Math.cos(hole.th)), p0 = V3(dir.x * (R_OUT + .05), y0, dir.z * (R_OUT + .05));
    const gc = G * 100;                                                // cm/s^2
    // landing: basin water, or the cup top if the jet reaches the cup mouth there
    let tEnd = Math.sqrt(2 * (y0 - BASIN_Y) / gc), inCup = false;
    if (S.cupOn) {
      const yTop = cup.position.y + CUP.h, tc = Math.sqrt(2 * (y0 - yTop) / gc), pc = p0.clone().addScaledVector(dir, v * tc);
      const dx = pc.x - CUP.x, dz = pc.z - CUP.z;
      if (Math.hypot(dx, dz) < CUP.rin - HOLE_R) { inCup = true; tEnd = Math.sqrt(2 * (y0 - (cup.position.y + .5 + S.cupFill * (CUP.h - 1))) / gc); }
    }
    const tLand = Math.sqrt(2 * (y0 - BASIN_Y) / gc);
    return { v, d, y0, dir, p0, tEnd, inCup, dist: v * tLand, rim: v * Math.sqrt(Math.max(0, 2 * (y0 - (cup.position.y + CUP.h)) / gc)) };   // rim = distance from the wall where the jet passes the cup-mouth height   // dist = horizontal distance from the bottle wall to the landing point
  }
  function drawJet(hole, P, t) {
    const J = hole.jet, m = J.m; if (!P) { m.visible = J.splash.visible = J.tag.visible = false; return; }
    m.visible = true; const pos = m.geometry.attributes.position.array, nor = m.geometry.attributes.normal.array, gc = G * 100;
    const side = V3(-P.dir.z, 0, P.dir.x);
    for (let i = 0; i <= NSEG; i++) {
      const tt = P.tEnd * i / NSEG, x = P.v * tt, y = P.y0 - .5 * gc * tt * tt, vy = -gc * tt, sp = Math.hypot(P.v, vy);
      const r = Math.max(.34, HOLE_R * 2.2 * Math.sqrt(P.v / sp));      // drawn a little thicker than the 4 mm jet so it can be seen; thins as it speeds up
      const tx = P.v / sp, ty = vy / sp; const c = V3(P.p0.x + P.dir.x * x, y, P.p0.z + P.dir.z * x);
      const nUp = V3(-P.dir.x * ty, tx, -P.dir.z * ty);                 // normal in the vertical plane of the jet
      for (let j = 0; j < NRAD; j++) {
        const a = j / NRAD * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (i * NRAD + j) * 3;
        const nx = nUp.x * ca + side.x * sa, ny = nUp.y * ca, nz = nUp.z * ca + side.z * sa;
        pos[k] = c.x + nx * r; pos[k + 1] = c.y + ny * r; pos[k + 2] = c.z + nz * r; nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.normal.needsUpdate = true; m.geometry.computeBoundingSphere();
    m.material.map.offset.x = -(t * P.v / 40) % 1;
    const xe = P.v * P.tEnd, ye = P.y0 - .5 * gc * P.tEnd * P.tEnd, pe = V3(P.p0.x + P.dir.x * xe, ye + .05, P.p0.z + P.dir.z * xe);
    J.splash.visible = true; J.splash.position.copy(pe); const ph = (t * 3 + hole.id * .37) % 1; J.splash.scale.setScalar(.6 + ph * 1.6); J.splash.material.opacity = .8 * (1 - ph);
    if (!P.inCup) {
      J.tag.visible = true; const txt = Math.round(P.dist) + ' cm';
      if (txt !== J.tagText) { const s2 = textSprite(txt, 3.2, { color: '#08202E', bg: 'rgba(255,224,130,.92)' }); J.tag.material.map.dispose(); J.tag.material.map = s2.material.map; J.tag.scale.copy(s2.scale); J.tagText = txt; }
      J.tag.position.set(pe.x, 4.6 + (hole.id % 3) * 3.4, pe.z);
    } else J.tag.visible = false;
  }

  // ---- public actions
  function poke(h, th) {
    if (S.holes.length >= 8) { ctx.toast('This bottle already has 8 holes. Tap New bottle to start again.'); return null; }
    h = Math.round(clamp(h, 1, 26));
    for (const o of S.holes) { let da = Math.abs(((o.th - th + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (Math.abs(o.h - h) < 1 && da * R_OUT < 1.6) return null; }
    const hole = { id: S.nextId++, h, th, taped: true }; holeMesh(hole); S.holes.push(hole); S.lastPokeH = h; guide.visible = true; guide.position.y = Y0 + h;
    ctx.act('poke', 'hole_at_' + Math.round(((th * 180 / Math.PI) + 360) % 360) + 'deg', h); ctx.sfx('poke'); return hole;
  }
  function setTape(hole, on) { hole.taped = on; hole.tape.visible = on; }
  function untapeAll() { let n = 0; for (const o of S.holes) if (o.taped) { setTape(o, false); n++; } if (n) { ctx.act('remove_tape', 'all', n); ctx.sfx('rip'); } else ctx.toast('No tape to remove. Tap the bottle to poke a hole first.'); }
  function tapeAll() { for (const o of S.holes) setTape(o, true); ctx.act('tape', 'all', S.holes.length); }
  function newBottle() { for (const o of S.holes) removeHole(o); S.holes = []; S.lastPokeH = null; guide.visible = false; ctx.act('new', 'bottle', 1); }
  function setLevel(h, src = 'slider') { S.H = clamp(h, 0, HMAX); if (src === 'slider') ctx.act('set', 'water_level', Math.round(S.H * 10) / 10); }
  function setKeep(v) { S.keep = v; ctx.act('toggle', 'keep_level', v); }

  // pick: tap a hole -> tape/untape, else poke a hole where the bottle was tapped
  function pick(ray) {
    // analytic ray / cylinder test (robust, no mesh seams): nearest hit on the wall r = R_OUT + .15, within the hole range
    const inv = g.matrixWorld.clone().invert(), o = ray.ray.origin.clone().applyMatrix4(inv), d = ray.ray.direction.clone().transformDirection(inv), Rp = R_OUT + .15;
    const A = d.x * d.x + d.z * d.z, B = 2 * (o.x * d.x + o.z * d.z), C = o.x * o.x + o.z * o.z - Rp * Rp, disc = B * B - 4 * A * C;
    if (A < 1e-9 || disc < 0) return false; const tt = (-B - Math.sqrt(disc)) / (2 * A); if (tt < 0) return false;
    const p = o.clone().addScaledVector(d, tt); if (p.y < Y0 + .4 || p.y > Y0 + HMAX + .3) return false; let h = p.y - Y0; const th = Math.atan2(p.x, p.z);
    for (const o of S.holes) { let da = Math.abs(((o.th - th + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (Math.abs(o.h - h) < 1.1 && da * R_OUT < 1.4) { setTape(o, !o.taped); ctx.act(o.taped ? 'tape' : 'remove_tape', 'hole', o.h); ctx.sfx(o.taped ? 'tap' : 'rip'); return true; } }
    if (S.lastPokeH != null && Math.abs(h - S.lastPokeH) < 1.25) h = S.lastPokeH;   // needle guide snap
    poke(h, th); return true;
  }

  // ---- per frame
  const tmpV = V3(0, 0, 0);
  function update(dt, t) {
    let outflow = 0; const paths = [];
    for (const o of S.holes) { const P = jetPath(o); paths.push(P); if (P) outflow += CD * A_HOLE * P.v; drawJet(o, P, t); }
    if (S.keep) { S.pour = outflow; } else { S.pour = 0; if (outflow > 0) S.H = Math.max(0, S.H - outflow / A_IN * dt); }
    water.userData.setLevel(S.H);
    const top = Y0 + S.H; stream.visible = S.keep && outflow > 0 || S.fillingT > 0; if (S.fillingT > 0) S.fillingT -= dt;
    if (stream.visible) { const y1 = 88, y2 = top; stream.scale.y = y1 - y2; stream.position.set(0, (y1 + y2) / 2, 0); }
    // cup
    cup.visible = S.cupOn; S.cupHitNow = false;
    if (S.cupOn) { let inflow = 0; S.holes.forEach((o, i) => { const P = paths[i]; if (P && P.inCup) inflow += CD * A_HOLE * P.v; }); S.cupHitNow = inflow > 0; if (inflow > 0) S.cupFill = Math.min(1, S.cupFill + inflow * dt / (Math.PI * CUP.rin * CUP.rin * (CUP.h - 1))); cupWater.userData.setLevel(S.cupFill * (CUP.h - 1)); }
    S.paths = paths;
  }
  function readout() {
    const rows = S.holes.map((o, i) => ({ o, P: S.paths && S.paths[i] })).sort((a, b) => a.o.h - b.o.h);
    let h = `<div class="rt">Water height <b>${S.H.toFixed(1)} cm</b>${S.keep ? ' <span class="tagk">kept steady</span>' : ''}</div>`;
    if (!rows.length) return h + `<div class="rs">Tap the bottle to poke a hole.</div>`;
    h += `<table><tr><th>hole at</th><th>depth</th><th>water pressure</th><th>speed</th><th>lands</th></tr>`;
    const maxR = innerWidth < 600 ? 4 : 8;
    for (const { o, P } of rows.slice(0, maxR)) {
      const d = Math.max(0, S.H - o.h), p = RHO * G * d / 100;
      h += `<tr class="${o.taped ? 'tp' : ''}"><td>${o.h} cm</td><td>${d.toFixed(1)} cm</td><td>${fmt(p)} Pa</td><td>${P ? (P.v / 100).toFixed(2) + ' m/s' : (o.taped ? 'taped' : 'dry')}</td><td>${P ? (P.inCup ? 'in cup' : Math.round(P.dist) + ' cm') : '-'}</td></tr>`;
    }
    return h + '</table>' + (rows.length > maxR ? `<div class="rs">+ ${rows.length - maxR} more holes</div>` : '');
  }
  function state() {
    return { H: S.H, keep: S.keep, cupOn: S.cupOn, cupFill: S.cupFill, cupHit: !!S.cupHitNow,
      holes: S.holes.map((o, i) => ({ h: o.h, th: o.th, taped: o.taped, flowing: !!(S.paths && S.paths[i]), dist: S.paths && S.paths[i] ? S.paths[i].dist : null, rim: S.paths && S.paths[i] ? S.paths[i].rim : null, inCup: !!(S.paths && S.paths[i] && S.paths[i].inCup) })) };
  }
  // screen helper for tests: world point on the wall at (h, th)
  function wallPoint(h, th) { return g.localToWorld(V3(Math.sin(th) * (R_OUT + .1), Y0 + h, Math.cos(th) * (R_OUT + .1))); }
  return {
    id: 'bottle', group: g, S, update, pick, readout, state, poke, setTape, untapeAll, tapeAll, newBottle, setLevel, setKeep, wallPoint, HMAX,
    fill() { S.fillingT = .6; },
    showCup(v) { S.cupOn = v; if (v) { S.cupFill = 0; } },
    cam: { target: [18, 40, 0], dist: 175, yaw: 24, pitch: 12, minD: 50, maxD: 320 },
    pickables: [pickCyl],
  };
}
