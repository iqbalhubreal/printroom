import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

/* ------------------------------------------------------------------ helpers */
let toastTimer;
function toast(msg, ms = 1800) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
const easeInOut = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const easeIn = k => k * k, easeOut = k => 1 - (1 - k) * (1 - k), linear = k => k;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* tweens driven by the render clock, so sound + motion stay locked together */
const tweens = new Set();
function tween(dur, fn, ease = easeInOut) {
  return new Promise(res => { const t = { el: 0, dur: Math.max(dur, 0.0001), fn, ease, res }; tweens.add(t); fn(ease(0), 0); });
}
const wait = s => tween(s, () => { }, linear);
function updateTweens(dt) { for (const t of [...tweens]) { t.el += dt; const k = Math.min(1, t.el / t.dur); t.fn(t.ease(k), k); if (k >= 1) { tweens.delete(t); t.res(); } } }

/* ------------------------------------------------------------------ renderer / scene */
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 60);
camera.position.set(-1.7, 2.1, 2.9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.9, 0.8, -1.0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.12; controls.maxDistance = 8; controls.maxPolarAngle = Math.PI * 0.495;

function mat(color, rough = 0.7, metal = 0, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }); }
function box(w, h, d, m, x = 0, y = 0, z = 0, parent = scene, cast = true) { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = cast; me.receiveShadow = true; parent.add(me); return me; }
function cyl(rt, rb, h, m, x, y, z, parent = scene, seg = 28, open = false) { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; }
function rod(a, b, r, m, parent = scene) { const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length(); const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m); me.position.copy(a).addScaledVector(dir, .5); me.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize()); me.castShadow = true; parent.add(me); return me; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData = { c, g }; return t; }

/* ------------------------------------------------------------------ lights */
const hemi = new THREE.HemisphereLight(0xffffff, 0xb9b0a3, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-3, 5, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 15 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
sun.target.position.set(0.8, 0.5, -1); scene.add(sun, sun.target);
const neonA = new THREE.PointLight(0xff3fb4, 0, 0, 1.6); neonA.position.set(-1.6, 2.3, -1.3); scene.add(neonA);
const neonB = new THREE.PointLight(0x26e3ff, 0, 0, 1.6); neonB.position.set(2.9, 2.2, -0.8); scene.add(neonB);

/* ------------------------------------------------------------------ room */
const wallMat = mat(0xf1efeb, 0.95);
(function buildRoom() {
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const b = 150 + (i * 37 % 40); g.fillStyle = `rgb(${b + 45},${b + 5},${b - 45})`; g.fillRect(0, i * h / n, w, h / n);
      for (let k = 0; k < 45; k++) { g.strokeStyle = `rgba(90,55,20,${0.04 + Math.random() * 0.08})`; g.lineWidth = 1 + Math.random() * 1.5; g.beginPath(); const y = i * h / n + Math.random() * h / n; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 5, w * .6, y - 5, w, y + 2); g.stroke(); }
      g.fillStyle = 'rgba(60,35,15,.55)'; g.fillRect(0, i * h / n, w, 3); g.fillRect(((i % 2) * w / 2 + w / 4) % w, i * h / n, 3, h / n);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 6), mat(0xffffff, 0.72, 0, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 1); floor.receiveShadow = true; scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 3), wallMat); back.position.set(0, 1.5, -2); back.receiveShadow = true; scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat); left.rotation.y = Math.PI / 2; left.position.set(-3.5, 1.5, 1); left.receiveShadow = true; scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat); right.rotation.y = -Math.PI / 2; right.position.set(3.5, 1.5, 1); right.receiveShadow = true; scene.add(right);
  const skirt = mat(0xffffff, 0.6);
  box(7, 0.1, 0.02, skirt, 0, 0.05, -1.99, scene, false); box(0.02, 0.1, 6, skirt, -3.49, 0.05, 1, scene, false); box(0.02, 0.1, 6, skirt, 3.49, 0.05, 1, scene, false);
})();

/* window */
const skyTex = canvasTex(512, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fc9ff'); gr.addColorStop(1, '#f2f8ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 7; i++) { const x = Math.random() * w, y = 60 + Math.random() * 200; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + k * 22, y + Math.sin(k) * 8, 22 + Math.random() * 14, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = 'rgba(120,150,130,.55)'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, h - 70 - Math.sin(x * .03) * 22 - Math.random() * 12); g.lineTo(w, h); g.fill();
});
const windowMat = new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false });
(function buildWindow() {
  const wx = -1.4, wy = 1.65, ww = 1.1, wh = 1.2;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), windowMat); sky.position.set(wx, wy, -1.995); scene.add(sky);
  const fm = mat(0xfafafa, 0.5);
  box(ww + 0.08, 0.05, 0.06, fm, wx, wy + wh / 2, -1.97); box(ww + 0.08, 0.05, 0.06, fm, wx, wy - wh / 2, -1.97);
  box(0.05, wh, 0.06, fm, wx - ww / 2, wy, -1.97); box(0.05, wh, 0.06, fm, wx + ww / 2, wy, -1.97);
  box(0.03, wh, 0.04, fm, wx, wy, -1.975); box(ww, 0.03, 0.04, fm, wx, wy, -1.975);
  box(ww + 0.2, 0.03, 0.16, fm, wx, wy - wh / 2 - 0.03, -1.92);
})();

/* bookshelf */
(function buildBookshelf() {
  const wood = mat(0x8a5a3b, 0.7); const x = -2.7, z = -1.82, w = 1.0, h = 1.9, d = 0.32;
  box(0.03, h, d, wood, x - w / 2, h / 2, z); box(0.03, h, d, wood, x + w / 2, h / 2, z); box(w, 0.03, d, wood, x, h, z); box(w, h, 0.01, wood, x, h / 2, z - d / 2);
  for (let s = 0; s < 5; s++) {
    const y = 0.05 + s * 0.45; box(w, 0.025, d, wood, x, y, z);
    if (s === 4) continue;
    let bx = x - w / 2 + 0.04;
    while (bx < x + w / 2 - 0.08) {
      const bw = 0.025 + Math.random() * 0.035, bh = 0.22 + Math.random() * 0.15;
      const col = new THREE.Color().setHSL(Math.random(), 0.45, 0.42 + Math.random() * 0.15);
      box(bw, bh, 0.2 + Math.random() * 0.05, mat(col, 0.8), bx + bw / 2, y + 0.0125 + bh / 2, z + 0.02);
      bx += bw + 0.004; if (Math.random() < 0.1) bx += 0.08;
    }
  }
})();

/* poster */
(function buildPoster() {
  const t = canvasTex(600, 850, (g, w, h) => {
    g.fillStyle = '#ffcf4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.save(); g.translate(w / 2, 420 - i * 22); g.rotate((i - 3) * 0.06); g.fillStyle = i % 2 ? '#ffffff' : '#f4f1ea'; g.strokeStyle = '#1d2330'; g.lineWidth = 5; g.fillRect(-150, -100, 300, 200); g.strokeRect(-150, -100, 300, 200); g.restore(); }
    g.fillStyle = '#1d2330'; g.font = '900 96px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('PRINT', w / 2, 650); g.fillText('ROOM', w / 2, 750);
    g.font = '600 26px Inter, sans-serif'; g.fillText('read · print · collate · staple', w / 2, 805);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85), mat(0xffffff, 0.6, 0, { map: t })); p.position.set(1.95, 1.75, -1.99); scene.add(p);
  box(0.62, 0.87, 0.01, mat(0x222222, 0.4), 1.95, 1.75, -1.996, scene, false);
})();

/* clock */
const clockTex = canvasTex(256, 256, () => { });
function drawClock() {
  const { g } = clockTex.userData; const w = 256, c = 128, d = new Date();
  g.clearRect(0, 0, w, w); g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1d2330'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = i % 3 ? 3 : 7; g.beginPath(); g.moveTo(c + Math.sin(a) * 100, c - Math.cos(a) * 100); g.lineTo(c + Math.sin(a) * 116, c - Math.cos(a) * 116); g.stroke(); }
  const hand = (a, len, wdt, col) => { g.strokeStyle = col; g.lineWidth = wdt; g.lineCap = 'round'; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len); g.stroke(); };
  const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = d.getHours() % 12 + m / 60;
  hand(h / 12 * Math.PI * 2, 60, 9, '#1d2330'); hand(m / 60 * Math.PI * 2, 90, 6, '#1d2330'); hand(s / 60 * Math.PI * 2, 100, 2, '#e5484d');
  g.fillStyle = '#e5484d'; g.beginPath(); g.arc(c, c, 6, 0, Math.PI * 2); g.fill();
  clockTex.needsUpdate = true;
}
(function buildClock() {
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 48), new THREE.MeshStandardMaterial({ map: clockTex, transparent: true, roughness: .5 })); face.position.set(0.2, 2.3, -1.985); scene.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.012, 12, 48), mat(0x1d2330, 0.4, 0.3)); rim.position.set(0.2, 2.3, -1.985); scene.add(rim);
  drawClock();
})();

/* rug */
(function buildRug() {
  const t = canvasTex(512, 360, (g, w, h) => {
    g.fillStyle = '#3d5a80'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e0fbfc'; g.lineWidth = 10; g.strokeRect(20, 20, w - 40, h - 40);
    g.strokeStyle = '#ee6c4d'; g.lineWidth = 6; g.strokeRect(42, 42, w - 84, h - 84);
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#98c1d9' : '#ee6c4d'; g.beginPath(); g.arc(80 + i * 44, h / 2, 12, 0, Math.PI * 2); g.fill(); }
  });
  const r = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), mat(0xffffff, 1, 0, { map: t })); r.rotation.x = -Math.PI / 2; r.position.set(0.5, 0.003, 0.15); r.receiveShadow = true; scene.add(r);
})();

/* plant */
(function buildPlant() {
  const x = -1.25, z = -1.6;
  cyl(0.15, 0.11, 0.32, mat(0xc8643b, 0.8), x, 0.16, z); cyl(0.14, 0.14, 0.02, mat(0x3b2a1e, 1), x, 0.31, z);
  const leaf = mat(0x2f8f4e, 0.6);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + Math.random() * .3, tilt = 0.35 + Math.random() * .5, len = 0.32 + Math.random() * .18;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), leaf); l.scale.set(0.35, len / 0.2, 0.1);
    l.position.set(x + Math.sin(a) * Math.sin(tilt) * len * .5, 0.33 + Math.cos(tilt) * len * .5, z + Math.cos(a) * Math.sin(tilt) * len * .5);
    l.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt); l.castShadow = true; scene.add(l);
  }
})();

/* desk + desk items */
const DESK_Y = 0.75;
(function buildDesk() {
  const wood = mat(0xc49a6c, 0.55), leg = mat(0x2a2f38, 0.4, 0.6);
  box(1.6, 0.04, 0.8, wood, 0, DESK_Y - 0.02, -1.15);
  for (const [x, z] of [[-0.75, -1.5], [0.75, -1.5], [-0.75, -0.8], [0.75, -0.8]]) box(0.04, DESK_Y - 0.04, 0.04, leg, x, (DESK_Y - 0.04) / 2, z);
  // keyboard
  const keyTex = canvasTex(512, 160, (g, w, h) => { g.fillStyle = '#2a2e36'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9ecf1'; for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { if (r === 4 && c > 3 && c < 11) continue; g.fillRect(8 + c * 33.4, 8 + r * 30, 28, 25); } g.fillRect(8 + 4 * 33.4, 128, 33.4 * 7 - 5, 25); });
  const km = mat(0x2a2e36, 0.5);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.018, 0.14), [km, km, mat(0xffffff, 0.6, 0, { map: keyTex }), km, km, km]); kb.position.set(-0.15, DESK_Y + 0.009, -0.93); kb.castShadow = true; scene.add(kb);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12), mat(0xe9ecf1, 0.4)); mouse.scale.set(1, 0.45, 1.6); mouse.position.set(0.2, DESK_Y + 0.012, -0.92); mouse.castShadow = true; scene.add(mouse);
  // mug
  const mugM = mat(0xe5484d, 0.35);
  cyl(0.04, 0.036, 0.1, mugM, -0.55, DESK_Y + 0.05, -0.88, scene, 28, true);
  cyl(0.036, 0.036, 0.005, mat(0x3b2416, .3), -0.55, DESK_Y + 0.085, -0.88);
  cyl(0.036, 0.036, 0.004, mugM, -0.55, DESK_Y + 0.002, -0.88);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 10, 20), mugM); handle.position.set(-0.505, DESK_Y + 0.05, -0.88); handle.rotation.y = 0; scene.add(handle);
  // ream of paper
  box(0.21, 0.05, 0.297, mat(0xffffff, 0.9), 0.62, DESK_Y + 0.025, -0.86);
  box(0.212, 0.052, 0.09, mat(0x3b6cff, 0.6), 0.62, DESK_Y + 0.026, -0.86);
})();

/* lamp */
const lampSpot = new THREE.SpotLight(0xffd9a0, 0, 3, 0.75, 0.5, 1.5);
const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 0 });
(function buildLamp() {
  const m = mat(0x1d2330, 0.4, 0.5);
  cyl(0.07, 0.08, 0.02, m, -0.62, DESK_Y + 0.01, -1.3);
  const a = V3(-0.62, DESK_Y + 0.02, -1.3), b = V3(-0.66, DESK_Y + 0.38, -1.38), c = V3(-0.47, DESK_Y + 0.46, -1.18);
  rod(a, b, 0.009, m); rod(b, c, 0.009, m);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 24, 1, true), mat(0x1d2330, 0.4, 0.5, { side: THREE.DoubleSide }));
  head.position.copy(c).add(V3(0.02, -0.03, 0.02)); head.rotation.set(0.35, 0, -0.4); head.castShadow = true; scene.add(head);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), bulbMat); bulb.position.copy(head.position).add(V3(0.01, -0.03, 0.01)); scene.add(bulb);
  lampSpot.position.copy(bulb.position); lampSpot.target.position.set(-0.3, DESK_Y, -0.95); lampSpot.castShadow = true; lampSpot.shadow.mapSize.set(1024, 1024);
  scene.add(lampSpot, lampSpot.target);
})();

/* ------------------------------------------------------------------ devices (screens) */
function makeDevice(name, cw, ch) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { name, c, g, tex, media: { type: null }, scroll: 0, playing: true, loop: true, speed: 120, page: 0, prevPage: 0, slide: 1, slideDir: 1, penPaused: false, penBusy: false, timer: 0, tpp: 3, flash: null, stopAt: null, stopRes: null, dirty: true, layout: [], total: 0, pw: 620 };
}
const comp = makeDevice('Computer', 1024, 640);
const tab = makeDevice('Tablet', 600, 900);

/* monitor */
const monitorG = new THREE.Group(); monitorG.userData.view = 'computer'; scene.add(monitorG);
const MON = { x: -0.15, y: 1.09, z: -1.32 };
(function buildMonitor() {
  const m = mat(0x1d2330, 0.35, 0.3);
  box(0.24, 0.015, 0.16, m, MON.x, DESK_Y + 0.008, MON.z - 0.02, monitorG);
  box(0.04, 0.3, 0.025, m, MON.x, DESK_Y + 0.16, MON.z - 0.05, monitorG);
  box(0.6, 0.38, 0.025, m, MON.x, MON.y, MON.z, monitorG);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.35), new THREE.MeshBasicMaterial({ map: comp.tex, toneMapped: false }));
  screen.position.set(MON.x, MON.y, MON.z + 0.0128); monitorG.add(screen);
})();
const MON_T = V3(MON.x, MON.y, MON.z + 0.013);

/* tablet */
const TW = 0.18, TH = 0.26, SW = 0.16, SH = 0.24, SZ = 0.0046;
const tabletG = new THREE.Group(); tabletG.userData.view = 'tablet'; scene.add(tabletG);
tabletG.rotation.order = 'YXZ'; tabletG.position.set(0.42, DESK_Y + 0.135, -1.18); tabletG.rotation.set(-0.12, -0.32, 0);
const pen = new THREE.Group();
(function buildTablet() {
  const body = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 0.008), mat(0x22252c, 0.35, 0.4)); body.castShadow = true; tabletG.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: tab.tex, toneMapped: false })); screen.position.z = SZ; tabletG.add(screen);
  // stand (stays upright in portrait)
  const sm = mat(0x9aa3b2, 0.35, 0.7);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.006), sm); leg.position.set(0, -0.04, -0.045); leg.rotation.x = 0.45; leg.castShadow = true; tabletG.add(leg);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.03), sm); lip.position.set(0, -TH / 2 - 0.004, 0.008); tabletG.add(lip);
  // magnetic strip on the right edge
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.15, 0.006), mat(0x111111, 0.6)); strip.position.set(TW / 2 + 0.0015, 0, 0); tabletG.add(strip);
  // pen: origin = tip, body along +y
  const pm = mat(0xf2f4f7, 0.3, 0.1);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.014, 16), mat(0x333333, 0.4)); tip.rotation.x = Math.PI; tip.position.y = 0.007; pen.add(tip);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 16), pm); barrel.position.y = 0.014 + 0.065; barrel.castShadow = true; pen.add(barrel);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.012, 16), mat(0x3b6cff, 0.4)); cap.position.y = 0.14; pen.add(cap);
  tabletG.add(pen);
})();
const PEN_REST = V3(TW / 2 + 0.0075, -0.075, 0.0);
pen.position.copy(PEN_REST);
const ARW = { l: { x: 80, y: 836 }, r: { x: 520, y: 836 }, rad: 46 };
const arrowLocal = side => { const a = ARW[side]; return V3((a.x / 600 - .5) * SW, (.5 - a.y / 900) * SH, SZ); };

/* ------------------------------------------------------------------ printer */
const PR = { x: 1.3, z: -1.2, top: 0.62 };
const TRAY_Y = PR.top + 0.056;
const printerG = new THREE.Group(); printerG.userData.view = 'printer'; scene.add(printerG);
const ledMat = new THREE.MeshStandardMaterial({ color: 0x1a3a1a, emissive: 0x33ff66, emissiveIntensity: 0.2 });
(function buildPrinter() {
  box(0.6, PR.top, 0.55, mat(0x5b6474, 0.6), PR.x, PR.top / 2, PR.z, printerG);
  box(0.5, 0.25, 0.42, mat(0xe9ecf1, 0.45), PR.x, PR.top + 0.125, PR.z, printerG);
  box(0.48, 0.02, 0.4, mat(0xcfd5df, 0.4), PR.x, PR.top + 0.26, PR.z, printerG);
  const tray = box(0.36, 0.004, 0.3, mat(0xb8c0cc, 0.5), PR.x, PR.top + 0.36, PR.z - 0.29, printerG); tray.rotation.x = 1.0;
  box(0.42, 0.022, 0.012, mat(0x15181d, 0.8), PR.x, PR.top + 0.072, PR.z + 0.206, printerG);
  box(0.38, 0.006, 0.34, mat(0xb8c0cc, 0.45), PR.x, TRAY_Y - 0.003, PR.z + 0.21 + 0.17, printerG);
  box(0.006, 0.02, 0.34, mat(0xb8c0cc, 0.45), PR.x - 0.19, TRAY_Y + 0.007, PR.z + 0.38, printerG);
  box(0.006, 0.02, 0.34, mat(0xb8c0cc, 0.45), PR.x + 0.19, TRAY_Y + 0.007, PR.z + 0.38, printerG);
  box(0.11, 0.03, 0.07, mat(0x2a2f38, 0.4), PR.x + 0.16, PR.top + 0.265, PR.z + 0.15, printerG);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), ledMat); led.position.set(PR.x + 0.13, PR.top + 0.283, PR.z + 0.16); printerG.add(led);
})();

/* ------------------------------------------------------------------ bundler */
const BU = { x: 2.25, z: -1.3, top: 0.86 };
const CHUTE_A = 0.872, CHUTE_L = 0.653;
const BIN_FLOOR = 0.066;
const bundlerG = new THREE.Group(); bundlerG.userData.view = 'bundler'; scene.add(bundlerG);
let guideL, guideB, head;
(function buildBundler() {
  const body = mat(0x40618c, 0.5), dark = mat(0x1d2330, 0.5, 0.3), metal = mat(0xb8c0cc, 0.35, 0.7);
  box(0.6, BU.top, 0.5, body, BU.x, BU.top / 2, BU.z, bundlerG);
  box(0.46, 0.01, 0.42, dark, BU.x, BU.top + 0.005, BU.z, bundlerG);
  guideL = box(0.008, 0.035, 0.38, metal, BU.x - 0.2, BU.top + 0.027, BU.z, bundlerG);
  guideB = box(0.42, 0.035, 0.008, metal, BU.x, BU.top + 0.027, BU.z - 0.2, bundlerG);
  // gantry
  box(0.025, 0.32, 0.025, metal, BU.x - 0.27, BU.top + 0.16, BU.z - 0.22, bundlerG); box(0.025, 0.32, 0.025, metal, BU.x + 0.27, BU.top + 0.16, BU.z - 0.22, bundlerG);
  box(0.57, 0.03, 0.03, metal, BU.x, BU.top + 0.32, BU.z - 0.22, bundlerG);
  head = new THREE.Group(); head.position.set(BU.x, BU.top + 0.2, BU.z - 0.12);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), mat(0xffb020, 0.4)); hb.castShadow = true; head.add(hb);
  const rodM = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 10), metal); rodM.position.y = 0.095; head.add(rodM);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.03), dark); foot.position.y = -0.028; head.add(foot);
  bundlerG.add(head);
  // chute
  const ch = box(0.42, 0.008, CHUTE_L, metal, BU.x, BU.top - 0.25, BU.z + 0.41, bundlerG); ch.rotation.x = CHUTE_A;
  const r1 = box(0.008, 0.04, CHUTE_L, metal, BU.x - 0.21, BU.top - 0.24, BU.z + 0.41, bundlerG); r1.rotation.x = CHUTE_A;
  const r2 = box(0.008, 0.04, CHUTE_L, metal, BU.x + 0.21, BU.top - 0.24, BU.z + 0.41, bundlerG); r2.rotation.x = CHUTE_A;
  // bin
  const bm = mat(0x2a2f38, 0.6), bz = BU.z + 0.85;
  box(0.5, 0.012, 0.44, bm, BU.x, 0.06, bz, bundlerG);
  box(0.5, 0.26, 0.012, bm, BU.x, 0.19, bz - 0.22, bundlerG); box(0.5, 0.26, 0.012, bm, BU.x, 0.19, bz + 0.22, bundlerG);
  box(0.012, 0.26, 0.44, bm, BU.x - 0.25, 0.19, bz, bundlerG); box(0.012, 0.26, 0.44, bm, BU.x + 0.25, 0.19, bz, bundlerG);
})();
const HEAD_HOME = head.position.clone();
const BIN_C = V3(BU.x, BIN_FLOOR, BU.z + 0.85);

/* ------------------------------------------------------------------ sound (all synthesised) */
const sfx = (() => {
  let ctx = null, master, delay, recDest, noiseBuf, motorNode = null, enabled = true, vol = 0.8;
  const media = new WeakSet();
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    delay = ctx.createDelay(1.0); recDest = ctx.createMediaStreamDestination(); master.connect(delay); delay.connect(recDest);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const ok = () => ctx && ctx.state === 'running';
  function noise(dur, { type = 'bandpass', f = 1000, q = 1, f2 = null, gain = .3, attack = .002 } = {}) {
    if (!ok()) return; const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(master); src.start(t, Math.random() * .5); src.stop(t + dur + .05);
  }
  function tone(freq, dur, { type = 'sine', gain = .3, f2 = null } = {}) {
    if (!ok()) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + .05);
  }
  return {
    init, get ctx() { return ctx; }, get stream() { return recDest && recDest.stream; },
    setEnabled(v) { enabled = v; if (master) master.gain.value = enabled ? vol : 0; },
    setVolume(v) { vol = v; if (master && enabled) master.gain.value = v; },
    setDelay(ms) { if (delay) delay.delayTime.value = ms / 1000; },
    connectMedia(el) { init(); if (media.has(el)) return; try { ctx.createMediaElementSource(el).connect(master); media.add(el); } catch (e) { } },
    tick() { noise(.018, { type: 'highpass', f: 3500, gain: .1 }); },
    ink() { noise(.07, { type: 'bandpass', f: 2400 + Math.random() * 1600, q: 5, gain: .13 }); },
    slide() { noise(.35, { type: 'bandpass', f: 900, f2: 2600, q: .8, gain: .2, attack: .05 }); },
    land() { noise(.07, { type: 'lowpass', f: 1200, gain: .16 }); },
    rattle() { noise(.05, { f: 1800, q: 2, gain: .2 }); tone(240, .05, { type: 'square', gain: .025 }); },
    staple() { noise(.03, { type: 'highpass', f: 2000, gain: .4 }); tone(170, .14, { gain: .45, f2: 55 }); tone(3200, .06, { type: 'triangle', gain: .08 }); },
    thud() { tone(95, .28, { gain: .6, f2: 42 }); noise(.14, { type: 'lowpass', f: 420, gain: .45 }); },
    tap() { tone(1900, .025, { type: 'triangle', gain: .16 }); noise(.015, { type: 'highpass', f: 4000, gain: .1 }); },
    whoosh() { noise(.42, { type: 'bandpass', f: 400, f2: 3200, q: 1.2, gain: .17, attack: .12 }); },
    motor(on) {
      if (!ok()) return;
      if (on) {
        if (motorNode) return; const t = ctx.currentTime;
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70; const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 140.7;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.06, t + .2);
        o.connect(lp); o2.connect(lp); lp.connect(g).connect(master); o.start(); o2.start(); motorNode = { o, o2, g };
      } else if (motorNode) {
        const { o, o2, g } = motorNode, t = ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + .25); o.stop(t + .3); o2.stop(t + .3); motorNode = null;
      }
    },
    estimateDelay(frameMs) { init(); const lat = (ctx.baseLatency || 0) + (ctx.outputLatency || 0); return Math.round(lat * 1000 * 0.5 + frameMs * 2); }
  };
})();
addEventListener('pointerdown', () => sfx.init(), { once: false, passive: true });

/* ------------------------------------------------------------------ documents */
const RENDER_W = 700;
let docId = 0;
function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = test; }
  if (line) { g.fillText(line, x, y); y += lh; } return y;
}
function illus(g, kind, x, y, w, h, hue) {
  g.save(); g.translate(x, y); g.fillStyle = `hsl(${hue},60%,94%)`; g.fillRect(0, 0, w, h);
  g.strokeStyle = `hsl(${hue},55%,35%)`; g.fillStyle = `hsl(${hue},55%,55%)`; g.lineWidth = 3; const cx = w / 2, cy = h / 2;
  if (kind === 'cover') { for (let i = 0; i < 5; i++) { g.save(); g.translate(cx, cy + 20 - i * 9); g.rotate((i - 2) * .07); g.fillStyle = '#fff'; g.fillRect(-90, -60, 180, 120); g.strokeRect(-90, -60, 180, 120); g.restore(); } g.fillStyle = '#888'; g.fillRect(cx - 78, cy - 70, 10, 3); }
  if (kind === 'desk') { g.fillRect(cx - 150, cy + 40, 300, 12); g.strokeRect(cx - 70, cy - 70, 140, 90); g.fillRect(cx - 8, cy + 20, 16, 20); g.beginPath(); g.arc(cx + 120, cy + 20, 14, 0, Math.PI * 2); g.stroke(); }
  if (kind === 'tablet') { g.strokeRect(cx - 50, cy - 75, 100, 150); g.beginPath(); g.moveTo(cx - 30, cy + 55); g.lineTo(cx - 40, cy + 62); g.lineTo(cx - 30, cy + 69); g.moveTo(cx + 30, cy + 55); g.lineTo(cx + 40, cy + 62); g.lineTo(cx + 30, cy + 69); g.stroke(); g.save(); g.translate(cx + 75, cy - 10); g.rotate(.5); g.fillRect(-4, -60, 8, 110); g.restore(); }
  if (kind === 'printer') { g.strokeRect(cx - 100, cy - 30, 200, 70); g.fillStyle = '#fff'; g.fillRect(cx - 55, cy - 75, 110, 50); g.strokeRect(cx - 55, cy - 75, 110, 50); g.fillRect(cx - 55, cy + 40, 110, 30); g.strokeRect(cx - 55, cy + 40, 110, 30); }
  if (kind === 'bundler') { for (let i = 0; i < 4; i++) { g.fillStyle = '#fff'; g.fillRect(cx - 80 + i * 3, cy - 55 - i * 3, 160, 110); g.strokeRect(cx - 80 + i * 3, cy - 55 - i * 3, 160, 110); } g.fillStyle = '#555'; g.save(); g.translate(cx - 55, cy - 50); g.rotate(-.78); g.fillRect(-10, -2, 20, 4); g.restore(); }
  if (kind === 'notes') { for (let i = 0; i < 5; i++) { g.strokeRect(30, 20 + i * 30, 18, 18); if (i < 3) { g.beginPath(); g.moveTo(33, 30 + i * 30); g.lineTo(39, 36 + i * 30); g.lineTo(47, 22 + i * 30); g.stroke(); } g.fillRect(62, 26 + i * 30, 120 + (i * 53 % 140), 6); } }
  g.restore();
}
function makeSampleDoc() {
  const W = 595, H = 842, s = RENDER_W / W;
  const data = [
    ['A Field Guide to the Print Room', 'Six short pages on how a document travels from a glowing screen to a neat stapled bundle in the bin.', 'cover'],
    ['1 · The Desk', 'Everything begins at the desk. The monitor reads the document from top to bottom, the keyboard waits, and the lamp keeps the night shift company.', 'desk'],
    ['2 · The Tablet & Pen', 'Standing upright beside the monitor, the tablet shows one page at a time. A stylus lifts off its magnetic edge, glides over an arrow and taps to turn the page.', 'tablet'],
    ['3 · The Printer', 'Each sheet is cut to the true size of its page. It is fed in at the back, inked, and delivered face up into the output tray, building a tidy stack.', 'printer'],
    ['4 · The Bundler', 'The bundler gathers the stack, puts it back in page order whatever order it was printed in, jogs it square and staples it: corner, side or middle.', 'bundler'],
    ['5 · Field Notes', 'Each finished bundle tips down the chute and lands on the last. Count them, inspect them, and when the bin looks lonely, print again.', 'notes']
  ];
  const pages = data.map((d, i) => {
    const c = document.createElement('canvas'); c.width = RENDER_W; c.height = Math.round(H * s); const g = c.getContext('2d'); g.scale(s, s);
    const hue = [215, 28, 160, 350, 260, 45][i];
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = `hsl(${hue},60%,45%)`; g.fillRect(0, 0, W, 12);
    g.fillStyle = '#1d2330';
    if (i === 0) {
      g.font = '800 15px Inter, sans-serif'; g.fillStyle = `hsl(${hue},60%,40%)`; g.fillText('FIELD GUIDE · NO. 1', 60, 110);
      g.fillStyle = '#1d2330'; g.font = '900 46px Inter, sans-serif'; let y = wrapText(g, d[0], 60, 170, 470, 52);
      g.font = '400 17px Inter, sans-serif'; g.fillStyle = '#475467'; wrapText(g, d[1], 60, y + 20, 470, 26);
      illus(g, d[2], 60, 420, 475, 300, hue);
    } else {
      g.font = '800 30px Inter, sans-serif'; g.fillText(d[0], 60, 90);
      g.font = '400 16px Inter, sans-serif'; g.fillStyle = '#344054'; let y = wrapText(g, d[1], 60, 130, 475, 25);
      illus(g, d[2], 60, y + 15, 475, 230, hue); y += 280;
      g.fillStyle = '#d0d5dd'; for (let k = 0; k < 13; k++) { const lw = k % 5 === 4 ? 260 : 440 + (k * 37 % 35); g.fillRect(60, y + k * 24, lw, 8); }
      g.fillStyle = `hsl(${hue},60%,45%)`; g.font = '700 14px Inter, sans-serif'; g.fillText('Tip', 60, y + 13 * 24 + 26);
      g.fillStyle = '#475467'; g.font = 'italic 400 14px Inter, sans-serif'; g.fillText('Watch the tray: pages land face up, ready to be collated.', 95, y + 13 * 24 + 26);
    }
    g.fillStyle = '#98a2b3'; g.font = '600 12px Inter, sans-serif'; g.fillText(`Print Room Field Guide`, 60, H - 40); g.textAlign = 'right'; g.fillText(`Page ${i + 1} of 6`, W - 60, H - 40); g.textAlign = 'left';
    return { w: W, h: H, canvas: c };
  });
  return { id: ++docId, name: 'Field Guide (sample)', pages };
}
const SAMPLE = makeSampleDoc();

async function loadPdf(buf, name) {
  if (!window.pdfjsLib) throw new Error('PDF reader not loaded');
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise; const n = Math.min(pdf.numPages, 80); const pages = [];
  for (let i = 1; i <= n; i++) {
    toast(`Rendering page ${i} of ${n}…`, 4000);
    const p = await pdf.getPage(i); const vp1 = p.getViewport({ scale: 1 }); const vp = p.getViewport({ scale: RENDER_W / vp1.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: g, viewport: vp }).promise;
    pages.push({ w: vp1.width, h: vp1.height, canvas: c });
  }
  if (pdf.numPages > n) toast(`Loaded the first ${n} of ${pdf.numPages} pages`, 2500); else toast(`Loaded ${name}`);
  return { id: ++docId, name, pages };
}

/* ------------------------------------------------------------------ media on devices */
function setPdf(dev, doc) {
  stopVideo(dev);
  dev.media = { type: 'pdf', doc, name: doc.name };
  dev.scroll = 0; dev.page = 0; dev.prevPage = 0; dev.slide = 1; dev.playing = true; dev.timer = 0; dev.dirty = true;
  if (dev === comp) layoutComp();
  refreshDeviceUI(); refreshThumbs();
}
function stopVideo(dev) { if (dev.media.type === 'video') { dev.media.video.pause(); URL.revokeObjectURL(dev.media.video.src); } }
function setVideo(dev, file) {
  stopVideo(dev);
  const v = document.createElement('video'); v.src = URL.createObjectURL(file); v.playsInline = true; v.loop = true; v.preload = 'auto';
  sfx.connectMedia(v); v.play().catch(() => { });
  dev.media = { type: 'video', video: v, name: file.name }; dev.dirty = true; refreshDeviceUI(); refreshThumbs();
}
async function openFile(file, dev) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  try {
    if (isPdf) { const doc = await loadPdf(await file.arrayBuffer(), file.name); setPdf(dev, doc); }
    else if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) { setVideo(dev, file); toast(`Playing ${file.name} on the ${dev.name.toLowerCase()}`); }
    else toast('Please choose a PDF or a video');
  } catch (e) { console.error(e); toast('Could not open that file'); }
}

/* computer screen */
function layoutComp() {
  const d = comp.media.doc; let y = 24; comp.layout = d.pages.map(p => { const h = comp.pw * p.h / p.w; const r = { y, h }; y += h + 26; return r; }); comp.total = y;
}
const compMax = () => Math.max(0, comp.total - (comp.c.height - 40));
function fitDraw(g, src, sw, sh, x, y, w, h) { const s = Math.min(w / sw, h / sh); const dw = sw * s, dh = sh * s; g.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
function drawComp() {
  const { g, c } = comp, W = c.width, H = c.height;
  g.fillStyle = '#2b2f38'; g.fillRect(0, 0, W, H);
  if (comp.media.type === 'pdf') {
    const d = comp.media.doc, x = (W - comp.pw) / 2;
    for (let i = 0; i < comp.layout.length; i++) {
      const L = comp.layout[i], y = L.y - comp.scroll + 40; if (y + L.h < 40 || y > H) continue;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 5, y + 5, comp.pw, L.h); g.drawImage(d.pages[i].canvas, x, y, comp.pw, L.h);
    }
    g.fillStyle = '#1b1e25'; g.fillRect(0, 0, W, 40);
    g.fillStyle = '#e6e9ef'; g.font = '600 17px Inter, sans-serif'; g.fillText('📄 ' + comp.media.name, 16, 26);
    let cur = 0; for (let i = 0; i < comp.layout.length; i++) if (comp.layout[i].y <= comp.scroll + 200) cur = i;
    g.textAlign = 'right'; g.fillText(`${cur + 1} / ${d.pages.length}${comp.playing ? '' : '  ❚❚'}`, W - 20, 26); g.textAlign = 'left';
    const max = compMax(), th = Math.max(40, (H - 40) * (H - 40) / (comp.total || 1));
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(W - 12, 44, 6, H - 48); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(W - 12, 44 + (H - 48 - th) * (max ? comp.scroll / max : 0), 6, th);
  } else if (comp.media.type === 'video') drawVideo(g, comp.media.video, W, H);
  else placeholder(g, W, H);
  comp.tex.needsUpdate = true;
}
function drawVideo(g, v, W, H, area) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const a = area || { x: 0, y: 0, w: W, h: H - 36 };
  if (v.videoWidth) fitDraw(g, v, v.videoWidth, v.videoHeight, a.x, a.y, a.w, a.h);
  const p = v.duration ? v.currentTime / v.duration : 0;
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(20, H - 22, W - 40, 6); g.fillStyle = '#6d8dff'; g.fillRect(20, H - 22, (W - 40) * p, 6);
  g.fillStyle = '#fff'; g.font = '600 15px Inter, sans-serif'; g.fillText(v.paused ? '▶' : '❚❚', 20, H - 30); if (v.muted) g.fillText('🔇', 48, H - 30);
}
function placeholder(g, W, H) { g.fillStyle = '#9aa3b2'; g.font = '600 26px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('Drop a PDF or video', W / 2, H / 2); g.textAlign = 'left'; }

/* tablet screen */
function drawTab() {
  const { g, c } = tab, W = c.width, H = c.height;
  g.fillStyle = '#14161b'; g.fillRect(0, 0, W, H);
  if (tab.media.type === 'pdf') {
    const d = tab.media.doc, area = { x: 22, y: 22, w: W - 44, h: H - 44 - 120 };
    const drawPage = (i, off) => { const p = d.pages[i]; const s = Math.min(area.w / p.w, area.h / p.h); const pw = p.w * s, ph = p.h * s; g.drawImage(p.canvas, area.x + (area.w - pw) / 2 + off, area.y + (area.h - ph) / 2, pw, ph); };
    g.save(); g.beginPath(); g.rect(0, 0, W, area.y + area.h + 10); g.clip();
    if (tab.slide < 1) { const e = easeInOut(tab.slide); drawPage(tab.prevPage, -tab.slideDir * e * W); drawPage(tab.page, tab.slideDir * (1 - e) * W); } else drawPage(tab.page, 0);
    g.restore();
    for (const side of ['l', 'r']) {
      const a = ARW[side], fl = tab.flash && ((tab.flash.side < 0) === (side === 'l')) ? 1 - tab.flash.t : 0;
      g.fillStyle = fl > 0 ? `rgba(90,130,255,${0.25 + fl * 0.7})` : 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(a.x, a.y, ARW.rad * (1 + fl * 0.12), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; const dx = side === 'l' ? -1 : 1;
      g.beginPath(); g.moveTo(a.x - dx * 9, a.y - 18); g.lineTo(a.x + dx * 11, a.y); g.lineTo(a.x - dx * 9, a.y + 18); g.stroke();
    }
    g.fillStyle = '#cfd5e0'; g.font = '700 30px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(`${tab.page + 1} / ${d.pages.length}`, W / 2, 846); g.textAlign = 'left';
  } else if (tab.media.type === 'video') drawVideo(g, tab.media.video, W, H, { x: 0, y: 40, w: W, h: H - 120 });
  else placeholder(g, W, H);
  tab.tex.needsUpdate = true;
}

/* pen: lift → glide → tap → page slides */
async function penTurn(dir) {
  if (tab.penBusy || tab.media.type !== 'pdf') return false;
  const n = tab.media.doc.pages.length; let next = tab.page + dir;
  if (next < 0 || next >= n) { if (!tab.loop) return false; next = (next + n) % n; }
  tab.penBusy = true;
  const sp = Math.min(1, Math.max(0.45, tab.tpp / 3));
  const arrow = arrowLocal(dir > 0 ? 'r' : 'l'), hover = arrow.clone().add(V3(0, -0.004, 0.03)), touch = arrow.clone().add(V3(0, 0, 0.0015));
  const rest = PEN_REST.clone(), lifted = rest.clone().add(V3(0.012, 0.01, 0.03));
  await tween(0.25 * sp, e => { pen.position.lerpVectors(rest, lifted, e); pen.rotation.x = e * 0.5; pen.rotation.z = -e * 0.25; });
  await tween(0.45 * sp, e => { pen.position.lerpVectors(lifted, hover, e); pen.position.z += Math.sin(e * Math.PI) * 0.02; pen.rotation.x = 0.5 + e * 0.35; });
  await tween(0.12 * sp, e => { pen.position.lerpVectors(hover, touch, e); }, easeIn);
  sfx.tap(); tab.flash = { side: dir, t: 0 };
  tab.prevPage = tab.page; tab.page = next; tab.slideDir = dir; tab.slide = 0; sfx.whoosh();
  tween(0.45 * sp, e => { tab.slide = e; }).then(() => tab.slide = 1);
  await tween(0.12 * sp, e => { pen.position.lerpVectors(touch, hover, e); }, easeOut);
  await tween(0.5 * sp, e => { pen.position.lerpVectors(hover, rest, e); pen.position.z += Math.sin(e * Math.PI) * 0.015; pen.rotation.x = 0.85 * (1 - e); pen.rotation.z = -0.25 * (1 - e); });
  tab.penBusy = false; return true;
}

/* ------------------------------------------------------------------ paper */
const PAPERS = [{ n: 'White', c: '#ffffff' }, { n: 'Cream', c: '#f6eed8' }, { n: 'Sky', c: '#d9e9f8' }, { n: 'Mint', c: '#d9f2e2' }, { n: 'Blush', c: '#f8dde1' }, { n: 'Lemon', c: '#f7f0c0' }];
const paperColor = new THREE.Color('#ffffff');
function sheetSize(pg) { let w = pg.w / 72 * 0.0254, h = pg.h / 72 * 0.0254; const m = Math.max(w, h); if (m > 0.34) { const s = 0.34 / m; w *= s; h *= s; } return [w, h]; }
function makeSheet(doc, i) {
  const [w, h] = sheetSize(doc.pages[i]); const g = new THREE.Group();
  const sourceCanvas = doc.pages[i].canvas;
  const printCanvas = document.createElement('canvas');
  printCanvas.width = sourceCanvas.width; printCanvas.height = sourceCanvas.height;
  const printCtx = printCanvas.getContext('2d');
  const printTexture = new THREE.CanvasTexture(printCanvas);
  printTexture.colorSpace = THREE.SRGBColorSpace; printTexture.anisotropy = 8;

  // The solid sheet stays blank. A transparent print layer is revealed as the page exits.
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: paperColor.clone(), roughness: .9 }));
  front.rotation.x = -Math.PI / 2; front.castShadow = true; front.receiveShadow = true;
  const printLayerMaterial = new THREE.MeshBasicMaterial({ map: printTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  printLayerMaterial.userData.ownedTexture = printTexture;
  const printLayer = new THREE.Mesh(new THREE.PlaneGeometry(w, h), printLayerMaterial);
  printLayer.rotation.x = -Math.PI / 2; printLayer.position.y = 0.0002;
  const backS = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: paperColor.clone(), roughness: .9 }));
  backS.rotation.x = Math.PI / 2; backS.position.y = -0.0002;
  g.add(front, printLayer, backS);
  g.userData = { page: i, w, h, doc, sourceCanvas, printCanvas, printCtx, printTexture, printStep: -1 };
  scene.add(g); return g;
}
function revealSheetPrint(sheet, progress) {
  const d = sheet.userData;
  if (!d.printCtx || !d.sourceCanvas) return;
  const steps = 20, step = Math.max(0, Math.min(steps, Math.round(progress * steps)));
  if (step === d.printStep) return;
  d.printStep = step;
  d.printCtx.clearRect(0, 0, d.printCanvas.width, d.printCanvas.height);
  const revealHeight = Math.ceil(d.sourceCanvas.height * step / steps);
  if (revealHeight > 0) {
    d.printCtx.drawImage(d.sourceCanvas, 0, 0, d.sourceCanvas.width, revealHeight, 0, 0, d.printCanvas.width, revealHeight);
  }
  d.printTexture.needsUpdate = true;
}
function disposeObj(o) { o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { if (x.userData && x.userData.ownedTexture) x.userData.ownedTexture.dispose(); x.dispose(); }); } }); o.parent && o.parent.remove(o); }

/* ------------------------------------------------------------------ printing */
let mSpeed = 1, printOrder = 0;
const tray = []; let printChain = Promise.resolve(); let printingJobs = 0;
function queuePrint(doc, idxs, hooks = {}) { if (!idxs.length) { toast('No pages selected'); return printChain; } printingJobs++; printChain = printChain.then(() => printJob(doc, idxs, hooks)).finally(() => printingJobs--); return printChain; }
async function printJob(doc, idxs, hooks) {
  sfx.motor(true); ledMat.emissiveIntensity = 2;
  for (let n = 0; n < idxs.length; n++) await printSheet(doc, idxs[n], hooks, n);
  sfx.motor(false); ledMat.emissiveIntensity = 0.2; updateTrayCount();
}
async function printSheet(doc, i, hooks, n) {
  const s = makeSheet(doc, i), { h } = s.userData, sp = 1 / mSpeed;
  hooks.sheet && hooks.sheet(n, i, 'feed');
  const a = V3(PR.x, PR.top + 0.26 + h * 0.42, PR.z - 0.2 - h * 0.25), b = V3(PR.x, PR.top + 0.2, PR.z - 0.1);
  s.rotation.x = 1.0; sfx.slide();
  await tween(0.55 * sp, e => s.position.lerpVectors(a, b, e));
  s.visible = false;
  // ink pass, sounds tied to animation ticks
  let lastK = -1;
  await tween(0.7 * sp, (e, k) => { const step = Math.floor(k * 7); if (step !== lastK) { lastK = step; if (step < 7) sfx.ink(); } }, linear);
  hooks.sheet && hooks.sheet(n, i, 'out');
  s.rotation.x = 0; s.rotation.y = (Math.random() - .5) * 0.02;
  revealSheetPrint(s, 0); s.visible = true;
  const stackY = TRAY_Y + 0.001 + tray.length * 0.0015;
  const c = V3(PR.x, PR.top + 0.072, PR.z), d = V3(PR.x + (Math.random() - .5) * 0.006, PR.top + 0.072, Math.min(PR.z + 0.21 + h / 2 + 0.01, PR.z + 0.55 - h / 2 + 0.03));
  sfx.slide();
  await tween(0.9 * sp, e => { s.position.lerpVectors(c, d, e); revealSheetPrint(s, e); }, easeOut);
  const y0 = s.position.y; await tween(0.22 * sp, e => { s.position.y = y0 + (stackY - y0) * e; }, easeIn);
  sfx.land();
  tray.push({ obj: s, page: i, order: printOrder++, doc }); updateTrayCount();
}
function clearTray() { tray.splice(0).forEach(t => disposeObj(t.obj)); updateTrayCount(); }
function updateTrayCount() { $('#trayCount').textContent = tray.length; }

/* ------------------------------------------------------------------ bundling */
const bundles = []; let bundleChain = Promise.resolve(); let binHeight = 0;
function staplePositions(style, w, h) {
  const m = 0.014;
  if (style === 'corner') return [{ x: -w / 2 + m + .004, z: -h / 2 + m + .004, rot: Math.PI / 4 }];
  if (style === 'side') return [{ x: -w / 2 + m, z: -h / 4, rot: Math.PI / 2 }, { x: -w / 2 + m, z: h / 4, rot: Math.PI / 2 }];
  return [{ x: 0, z: -h / 4, rot: Math.PI / 2 }, { x: 0, z: h / 4, rot: Math.PI / 2 }];
}
function queueBundle(style, hooks = {}) { bundleChain = bundleChain.then(() => printChain).then(() => runBundle(style, hooks)); return bundleChain; }
async function runBundle(style, hooks = {}) {
  if (!tray.length) { toast('The output tray is empty: print something first'); return null; }
  const sp = 1 / mSpeed, sheets = tray.splice(0); updateTrayCount();
  const sorted = [...sheets].sort((a, b) => a.doc.id - b.doc.id || a.page - b.page || a.order - b.order);
  const place = [...sorted].reverse(); // last page first so page 1 ends on top
  const bedBase = BU.top + 0.011;
  hooks.phase && hooks.phase('collate');
  for (let k = 0; k < place.length; k++) {
    const s = place[k].obj, from = s.position.clone(), to = V3(BU.x + (Math.random() - .5) * 0.022, bedBase + k * 0.0015, BU.z + (Math.random() - .5) * 0.022);
    const r0 = s.rotation.y, r1 = (Math.random() - .5) * 0.09; sfx.slide();
    await tween(0.55 * sp, e => { s.position.lerpVectors(from, to, e); s.position.y += Math.sin(e * Math.PI) * 0.16; s.rotation.y = r0 + (r1 - r0) * e; });
    sfx.land();
  }
  // jog square
  hooks.phase && hooks.phase('jog');
  const st = place.map(p => ({ o: p.obj, x: p.obj.position.x, z: p.obj.position.z, r: p.obj.rotation.y }));
  const gx = guideL.position.x, gz = guideB.position.z; let cyc = -1;
  await tween(1.0 * sp, (e, k) => {
    const c = Math.floor(k * 5); if (c !== cyc && c < 5) { cyc = c; sfx.rattle(); }
    const shake = Math.sin(k * Math.PI * 10) * 0.007 * (1 - k);
    guideL.position.x = gx + Math.max(0, shake); guideB.position.z = gz + Math.max(0, shake);
    st.forEach(q => { q.o.position.x = q.x + (BU.x - q.x) * k + shake * 0.3; q.o.position.z = q.z + (BU.z - q.z) * k; q.o.rotation.y = q.r * (1 - k); });
  }, linear);
  guideL.position.x = gx; guideB.position.z = gz;
  // staple
  hooks.phase && hooks.phase('staple');
  const group = new THREE.Group(); group.position.set(BU.x, bedBase, BU.z); scene.add(group); place.forEach(p => group.attach(p.obj));
  const w = Math.max(...place.map(p => p.obj.userData.w)), h = Math.max(...place.map(p => p.obj.userData.h));
  const top = bedBase + place.length * 0.0015, pressY = top + 0.031, stapleM = mat(0xc9ced6, .25, .9);
  for (const p of staplePositions(style, w, h)) {
    const h0 = head.position.clone(), h1 = V3(BU.x + p.x, h0.y, BU.z + p.z), r0 = head.rotation.y;
    await tween(0.4 * sp, e => { head.position.lerpVectors(h0, h1, e); head.rotation.y = r0 + (p.rot - r0) * e; });
    const hy = head.position.y;
    await tween(0.13 * sp, e => head.position.y = hy + (pressY - hy) * e, easeIn);
    sfx.staple();
    const sm = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.0012, 0.0018), stapleM); sm.position.set(p.x, top - bedBase + 0.0007, p.z); sm.rotation.y = p.rot; group.add(sm);
    await tween(0.2 * sp, e => head.position.y = pressY + (hy - pressY) * e, easeOut);
  }
  const h0 = head.position.clone(), hr = head.rotation.y; tween(0.4 * sp, e => { head.position.lerpVectors(h0, HEAD_HOME, e); head.rotation.y = hr * (1 - e); });
  // tip down the chute
  hooks.phase && hooks.phase('drop');
  const dirC = V3(0, -Math.sin(CHUTE_A), Math.cos(CHUTE_A)), nrm = V3(0, Math.cos(CHUTE_A), Math.sin(CHUTE_A));
  const C0 = V3(BU.x, BU.top + 0.012, BU.z + 0.2);
  const start = C0.clone().addScaledVector(dirC, h / 2).addScaledVector(nrm, 0.006), end = C0.clone().addScaledVector(dirC, CHUTE_L - h * 0.15).addScaledVector(nrm, 0.006);
  const g0 = group.position.clone();
  await tween(0.8 * sp, e => { group.position.lerpVectors(g0, start, e); group.rotation.x = CHUTE_A * e; }, easeInOut);
  sfx.whoosh(); sfx.slide();
  await tween(0.8 * sp, e => group.position.lerpVectors(start, end, e), easeInOut);
  const thick = place.length * 0.0015 + 0.002;
  const land = V3(BIN_C.x + (Math.random() - .5) * 0.04, BIN_FLOOR + binHeight + 0.001, BIN_C.z + (Math.random() - .5) * 0.04), ry = (Math.random() - .5) * 0.3;
  const e0 = group.position.clone();
  // Keep the stack's proportions steady while it settles from the chute onto the bin.
  await tween(0.95 * sp, e => { group.position.lerpVectors(e0, land, e); group.rotation.x = CHUTE_A * (1 - easeInOut(e)); group.rotation.y = ry * easeInOut(e); }, easeInOut);
  sfx.thud(); binHeight += thick;
  const b = { group, pages: sorted.map(s => s.page + 1), style, doc: sorted[0].doc.name };
  bundles.push(b); refreshBundleList(); return b;
}
function emptyBin() { bundles.splice(0).forEach(b => disposeObj(b.group)); binHeight = 0; refreshBundleList(); }
function refreshBundleList() {
  const ul = $('#bundleList'); if (!bundles.length) { ul.innerHTML = '<li class="hint">No bundles yet.</li>'; return; }
  ul.innerHTML = bundles.map((b, i) => `<li><b>#${i + 1}</b> · pages ${formatRange(b.pages.map(p => p - 1))} · ${b.pages.length} sheet(s) · ${b.style}</li>`).reverse().join('');
}

/* ------------------------------------------------------------------ ranges */
function parseRange(str, n) {
  const out = new Set();
  for (const part of String(str).split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) continue;
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    for (let k = a; k <= b; k++) if (k >= 1 && k <= n) out.add(k - 1);
  }
  return [...out].sort((a, b) => a - b);
}
function formatRange(idxs) {
  const s = [...new Set(idxs)].sort((a, b) => a - b), parts = []; let i = 0;
  while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; parts.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : `${s[i] + 1}`); i = j + 1; }
  return parts.join(', ');
}

/* ------------------------------------------------------------------ camera */
let camToken = 0;
function camTo(pos, target, dur, ease = easeInOut) {
  const tok = ++camToken, p0 = camera.position.clone(), t0 = controls.target.clone();
  if (dur <= 0.001 || (reduceMotion && !director.active)) { camera.position.copy(pos); controls.target.copy(target); return Promise.resolve(); }
  return tween(dur, e => { if (tok !== camToken) return; camera.position.lerpVectors(p0, pos, e); controls.target.lerpVectors(t0, target, e); }, ease);
}
const VIEWS = {
  room: { pos: [-1.7, 2.1, 2.9], t: [0.9, 0.8, -1.0] },
  computer: { pos: [-0.15, 1.12, -0.5], t: [-0.15, 1.08, -1.31] },
  tablet: { pos: [0.6, 0.97, -0.78], t: [0.42, 0.89, -1.18] },
  printer: { pos: [1.0, 1.35, -0.3], t: [1.3, 0.72, -1.05] },
  bundler: { pos: [1.85, 1.5, 0.15], t: [2.25, 0.6, -0.9] },
  studio: { pos: [0.4, 1.85, 2.0], t: [1.1, 0.8, -1.0] }
};
let activeView = 'room';
function showPanel() { $('#panel').classList.remove('hidden'); }
function hidePanel() { $('#panel').classList.add('hidden'); }
function setView(v, fly = true) {
  activeView = v;
  document.querySelectorAll('#views button,#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('.sec').forEach(sec => sec.classList.toggle('on', sec.id === 'sec-' + v));
  showPanel();
  if (fly && !director.active) { const V = VIEWS[v]; camTo(V3(...V.pos), V3(...V.t), 1.3); }
}
function toggleMobileTab(v) {
  const panel = $('#panel');
  if (activeView === v && !panel.classList.contains('hidden')) {
    hidePanel();
    return;
  }
  setView(v);
}

/* click a machine to fly in */
const ray = new THREE.Raycaster(); let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => downXY = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY || director.active) return; const dx = e.clientX - downXY[0], dy = e.clientY - downXY[1]; downXY = null; if (dx * dx + dy * dy > 36) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hit = ray.intersectObjects([monitorG, tabletG, printerG, bundlerG], true)[0];
  if (hit) { let o = hit.object; while (o && !o.userData.view) o = o.parent; if (o) setView(o.userData.view); }
});

/* ------------------------------------------------------------------ looks */
const LOOKS = {
  studio: { name: 'Studio', bg: 0xdfe3ea, wall: 0xf1efeb, hemi: [0xffffff, 0xb9b0a3, 1.1], sun: [0xffffff, 2.2], sunPos: [-3, 5, 3], lamp: 0, win: 0xffffff, exp: 1.0, neon: 0 },
  morning: { name: 'Morning light', bg: 0xcfe3f5, wall: 0xeef2f6, hemi: [0xdbeaff, 0xa8a090, 1.0], sun: [0xeaf4ff, 3.0], sunPos: [-4.5, 3.6, 1.2], lamp: 0, win: 0xe6f2ff, exp: 1.05, neon: 0 },
  golden: { name: 'Golden hour', bg: 0xf2c79a, wall: 0xf3e2cc, hemi: [0xffd7a8, 0x806040, 0.7], sun: [0xffa45c, 3.4], sunPos: [-5, 2.0, 2], lamp: 0.3, win: 0xffc48a, exp: 1.0, neon: 0 },
  night: { name: 'Night (desk lamp)', bg: 0x0b1020, wall: 0x8f96a8, hemi: [0x34406a, 0x101018, 0.22], sun: [0x7f9cff, 0.22], sunPos: [-3, 5, 3], lamp: 1, win: 0x223366, exp: 1.15, neon: 0 },
  neon: { name: 'Neon', bg: 0x120a24, wall: 0x6c5a8c, hemi: [0x6040a0, 0x100820, 0.35], sun: [0xb070ff, 0.4], sunPos: [-3, 5, 3], lamp: 0.15, win: 0x6040b0, exp: 1.1, neon: 1 },
  mint: { name: 'Pastel mint', bg: 0xdff5ec, wall: 0xd4f0e2, hemi: [0xf4fffa, 0xb8d8c8, 1.25], sun: [0xffffff, 1.8], sunPos: [-3, 5, 3], lamp: 0, win: 0xeafff6, exp: 1.05, neon: 0 }
};
const LOOK_KEYS = Object.keys(LOOKS);
function applyLook(k) {
  const L = LOOKS[k]; if (!L) return;
  scene.background = new THREE.Color(L.bg); wallMat.color.set(L.wall);
  hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.set(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.sunPos);
  lampSpot.intensity = L.lamp * 9; bulbMat.emissiveIntensity = L.lamp * 3;
  windowMat.color.set(L.win); renderer.toneMappingExposure = L.exp;
  neonA.intensity = neonB.intensity = L.neon * 9;
  $('#look').value = k;
}

/* ------------------------------------------------------------------ captions (burned into video) */
const captions = { hook: { text: '', a: 0, t: 0 }, step: { text: '', a: 0, t: 0 }, closing: { text: '', a: 0, t: 0 } };
let capStyle = 'bold', capAspect = '16:9';
function setCaption(k, text) { if (!text) return clearCaption(k); captions[k].text = text; captions[k].t = 1; }
function clearCaption(k) { captions[k].t = 0; }
function updateCaptions(dt) { for (const c of Object.values(captions)) c.a += Math.sign(c.t - c.a) * Math.min(Math.abs(c.t - c.a), dt * 5); }
function drawCaptions(g, W, H) {
  // safe zones: keep away from the top/bottom strips (and right rail) that Reels/Shorts cover
  const Z = capAspect === '9:16' ? { hook: .23, step: .66, closing: .44, w: .76, x: .47 } : capAspect === '1:1' ? { hook: .14, step: .8, closing: .5, w: .8, x: .5 } : { hook: .14, step: .84, closing: .5, w: .7, x: .5 };
  const base = Math.min(W, H);
  for (const k of ['hook', 'step', 'closing']) {
    const c = captions[k]; if (c.a <= 0.01 || !c.text) continue;
    const size = base * (k === 'step' ? 0.05 : 0.072), x = W * Z.x, maxW = W * Z.w;
    g.save(); g.globalAlpha = c.a; g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = capStyle === 'bold' ? c.text.toUpperCase() : c.text;
    g.font = `${capStyle === 'minimal' ? 600 : capStyle === 'box' ? 800 : 900} ${size}px Inter, sans-serif`;
    const words = txt.split(' '), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line);
    const lh = size * 1.18, y0 = H * Z[k] - (lines.length - 1) * lh / 2 + (1 - c.a) * size * 0.4;
    lines.forEach((l, i) => {
      const y = y0 + i * lh;
      if (capStyle === 'box') { const tw = g.measureText(l).width + size * 0.7; g.fillStyle = 'rgba(15,18,24,.82)'; roundRect(g, x - tw / 2, y - lh / 2, tw, lh, size * 0.25); g.fill(); g.fillStyle = '#fff'; g.fillText(l, x, y); }
      else if (capStyle === 'minimal') { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = size * 0.35; g.fillStyle = '#fff'; g.fillText(l, x, y); }
      else { g.lineJoin = 'round'; g.lineWidth = size * 0.2; g.strokeStyle = '#000'; g.strokeText(l, x, y); g.fillStyle = k === 'hook' ? '#ffe14d' : '#fff'; g.fillText(l, x, y); }
    });
    g.restore();
  }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ------------------------------------------------------------------ recording */
const compCanvas = $('#comp'), cg = compCanvas.getContext('2d');
let rec = null, lastRec = null;
function frameDims(aspect, res) { if (aspect === '9:16') return res >= 1080 ? [1080, 1920] : [720, 1280]; if (aspect === '1:1') return res >= 1080 ? [1080, 1080] : [720, 720]; return res >= 1080 ? [1920, 1080] : [1280, 720]; }
function pickMime() {
  const list = ['video/mp4;codecs="avc1.42E01E, mp4a.40.2"', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (!window.MediaRecorder) return null; return list.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
}
function startRecording(aspect, res) {
  if (!window.MediaRecorder || !compCanvas.captureStream) { toast('Recording is not supported in this browser'); return false; }
  sfx.init();
  const [W, H] = frameDims(aspect, res); capAspect = aspect;
  compCanvas.width = W; compCanvas.height = H; compCanvas.style.display = 'block';
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  const tracks = [...compCanvas.captureStream(30).getVideoTracks()];
  if (sfx.stream) tracks.push(...sfx.stream.getAudioTracks());
  const mime = pickMime(); let mr;
  try { mr = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: res >= 1080 ? 10e6 : 6e6 } : {}); }
  catch (e) { mr = new MediaRecorder(new MediaStream(tracks)); }
  const chunks = []; mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec = { mr, chunks, W, H, start: performance.now(), mime: mr.mimeType || mime || 'video/webm' };
  mr.start(500); $('#recbadge').style.display = 'block'; $('#stopBtn').disabled = false;
  return true;
}
async function stopRecording() {
  if (!rec) return; const r = rec; rec = null;
  const done = new Promise(res => r.mr.onstop = res); r.mr.stop(); await done;
  const durMs = performance.now() - r.start, isMp4 = /mp4/.test(r.mime);
  let blob = new Blob(r.chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' });
  try { blob = isMp4 ? await patchMp4Duration(blob, durMs / 1000) : await fixWebmDuration(blob, durMs); } catch (e) { console.warn('duration patch failed', e); }
  if (lastRec) URL.revokeObjectURL(lastRec.url);
  lastRec = { blob, url: URL.createObjectURL(blob), ext: isMp4 ? 'mp4' : 'webm', dur: durMs / 1000 };
  compCanvas.style.display = 'none'; $('#recbadge').style.display = 'none'; $('#stopBtn').disabled = true; $('#previewBtn').disabled = false;
  onResize(); showPreview();
}
function showPreview() {
  if (!lastRec) return; const v = $('#pv'); v.src = lastRec.url;
  $('#saveA').href = lastRec.url; $('#saveA').download = `print-room-${Date.now()}.${lastRec.ext}`;
  $('#pvTitle').textContent = `Your recording · ${lastRec.dur.toFixed(1)} s · ${lastRec.ext.toUpperCase()}`;
  $('#modal').classList.add('on');
}
/* write the real duration so gallery apps don't show 0:00 */
async function patchMp4Duration(blob, secs) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
  const find = (name, from, to) => { const a = [...name].map(ch => ch.charCodeAt(0)); for (let i = from; i < to - 4; i++) if (buf[i] === a[0] && buf[i + 1] === a[1] && buf[i + 2] === a[2] && buf[i + 3] === a[3]) return i; return -1; };
  const w64 = (p, v) => { v = Math.round(v); const hi = Math.floor(v / 4294967296); dv.setUint32(p, hi); dv.setUint32(p + 4, v - hi * 4294967296); };
  const moov = find('moov', 0, Math.min(buf.length, 1 << 22)); if (moov < 0) return blob;
  const end = Math.min(buf.length, moov - 4 + dv.getUint32(moov - 4));
  let i = find('mvhd', moov, end); if (i < 0) return blob;
  let p = i + 4, v = buf[p]; p += 4; let ts;
  if (v === 1) { p += 16; ts = dv.getUint32(p); p += 4; w64(p, secs * ts); } else { p += 8; ts = dv.getUint32(p); p += 4; dv.setUint32(p, Math.round(secs * ts)); }
  for (let j = find('tkhd', moov, end); j >= 0; j = find('tkhd', j + 4, end)) { let q = j + 4; const tv = buf[q]; q += 4; if (tv === 1) { q += 24; w64(q, secs * ts); } else { q += 16; dv.setUint32(q, Math.round(secs * ts)); } }
  for (let j = find('mdhd', moov, end); j >= 0; j = find('mdhd', j + 4, end)) { let q = j + 4; const mv = buf[q]; q += 4; if (mv === 1) { q += 16; const mts = dv.getUint32(q); q += 4; w64(q, secs * mts); } else { q += 8; const mts = dv.getUint32(q); q += 4; dv.setUint32(q, Math.round(secs * mts)); } }
  const m = find('mehd', moov, end); if (m >= 0) { let q = m + 4; const mv = buf[q]; q += 4; if (mv === 1) w64(q, secs * ts); else dv.setUint32(q, Math.round(secs * ts)); }
  return new Blob([buf], { type: 'video/mp4' });
}
async function fixWebmDuration(blob, durationMs) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let i = -1; for (let k = 0; k < Math.min(buf.length - 4, 16384); k++) if (buf[k] === 0x15 && buf[k + 1] === 0x49 && buf[k + 2] === 0xA9 && buf[k + 3] === 0x66) { i = k; break; }
  if (i < 0) return blob;
  const sp = i + 4, first = buf[sp]; let len = 1, mask = 0x80; while (len <= 8 && !(first & mask)) { len++; mask >>= 1; } if (len > 8) return blob;
  let size = first & (mask - 1); for (let k = 1; k < len; k++) size = size * 256 + buf[sp + k];
  const cs = sp + len;
  for (let k = cs; k < cs + size - 1 && k < buf.length - 1; k++) if (buf[k] === 0x44 && buf[k + 1] === 0x89) return blob;
  const dur = new Uint8Array(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88; new DataView(dur.buffer).setFloat64(3, durationMs);
  const ns = size + 11; if (ns >= Math.pow(2, 7 * len) - 1) return blob;
  const sb = new Uint8Array(len); let v = ns; for (let k = len - 1; k >= 0; k--) { sb[k] = v & 0xff; v = Math.floor(v / 256); } sb[0] |= (0x80 >> (len - 1));
  const out = new Uint8Array(buf.length + 11); out.set(buf.subarray(0, sp), 0); out.set(sb, sp); out.set(dur, cs); out.set(buf.subarray(cs), cs + 11);
  return new Blob([out], { type: blob.type });
}

/* ------------------------------------------------------------------ studio director */
const director = { active: false, abort: false };
const RECIPES = {
  satisfying: { speed: 0.6, cam: 'smooth', shake: false, capStyle: 'minimal', steps: false, dist: 0.72, hook: 'Oddly satisfying: paper, start to finish', close: 'Watch it again?' },
  explainer: { speed: 1.7, cam: 'cuts', shake: false, capStyle: 'box', steps: true, dist: 1.0, hook: 'How a document becomes a bundle', close: 'Read · Print · Collate · Staple' },
  cinematic: { speed: 0.9, cam: 'smooth', shake: true, capStyle: 'minimal', steps: false, dist: 1.1, hook: 'The Print Room', close: 'Fin.', look: 'golden' },
  hook: { speed: 1.3, cam: 'cuts', shake: true, capStyle: 'bold', steps: true, dist: 0.9, hook: 'Wait for the staple…', close: 'Did you see that drop?', open: 3 }
};
function applyRecipe(k) {
  const R = RECIPES[k]; if (!R) return;
  $('#stSpeed').value = R.speed; $('#stSpeedVal').textContent = R.speed.toFixed(1) + '×'; $('#stCam').value = R.cam; $('#stShake').checked = R.shake;
  $('#stCapStyle').value = R.capStyle; $('#stSteps').checked = R.steps; $('#stHook').value = R.hook; $('#stClose').value = R.close;
  if (R.look) { $('#stRandLook').checked = false; applyLook(R.look); }
}
function readStudio() {
  const recipe = $('#stRecipe').value, R = RECIPES[recipe] || {};
  return {
    src: $('#stSrc').value, pages: Math.max(1, +$('#stPages').value || 3), print: $('#stPrint').value, speed: +$('#stSpeed').value, staple: $('#stStaple').value,
    cuts: $('#stCam').value === 'cuts', shake: $('#stShake').checked, aspect: $('#stAspect').value, res: +$('#stRes').value,
    randomLook: $('#stRandLook').checked, paper: $('#stPaper').value, seed: Math.max(1, (+$('#stVar').value | 0) || 1),
    hook: $('#stHook').value.trim(), close: $('#stClose').value.trim(), steps: $('#stSteps').checked, capStyle: $('#stCapStyle').value,
    dist: R.dist || 1, open: R.open
  };
}
function orbitPos(t, yaw, pitch, dist) { return V3(t.x + Math.sin(yaw) * Math.cos(pitch) * dist, t.y + Math.sin(pitch) * dist, t.z + Math.cos(yaw) * Math.cos(pitch) * dist); }
let D = null, shotId = 0, shakeAmp = 0, shakeT = 0;
async function camShot(t, a, b, dur) {
  const id = ++shotId, f = D.frameF, m = D.mirror;
  const A = orbitPos(t, a[0] * m, a[1], a[2] * f), B = orbitPos(t, b[0] * m, b[1], b[2] * f);
  if (D.cuts) { camToken++; camera.position.copy(A); controls.target.copy(t); await camTo(B, t, dur, linear); }
  else { await camTo(A, t, Math.min(1.1, Math.max(0.5, dur * 0.35))); if (id !== shotId) return; await camTo(B, t, dur, easeInOut); }
}
const chk = () => { if (director.abort) throw new Error('abort'); };
function ensurePdf(dev) { if (dev.media.type !== 'pdf') setPdf(dev, SAMPLE); return dev.media.doc; }
const tabletWorld = local => tabletG.localToWorld(local.clone());

async function runShoot() {
  if (director.active || rec) return;
  if ($('#stAuto').checked) $('#stVar').value = 1 + Math.floor(Math.random() * 99999);
  const o = readStudio(), rng = mulberry32(o.seed * 2654435761 >>> 0), j = (v, a = 0.15) => v + (rng() - .5) * a;
  director.active = true; director.abort = false; controls.enabled = false; setStudioButtons(true);
  const prevSpeed = mSpeed;
  try {
    // setup with variation
    if (o.randomLook) applyLook(LOOK_KEYS[Math.floor(rng() * LOOK_KEYS.length)]); else rng();
    paperColor.set(o.paper === 'random' ? PAPERS[Math.floor(rng() * PAPERS.length)].c : o.paper);
    clearTray(); emptyBin();
    const dev = o.src === 'tablet' ? tab : comp, doc = ensurePdf(dev), n = doc.pages.length;
    let printIdx = parseRange(o.print, n); if (!printIdx.length) printIdx = [0];
    capStyle = o.capStyle; mSpeed = o.speed;
    D = { cuts: o.cuts, mirror: rng() < .5 ? -1 : 1, frameF: (o.aspect === '9:16' ? 1.55 : o.aspect === '1:1' ? 1.15 : 1) * o.dist * (0.88 + rng() * 0.3) };
    shakeAmp = o.shake && !reduceMotion ? 0.0045 : 0;
    if (dev === comp) { comp.scroll = 0; comp.playing = false; comp.dirty = true; } else { tab.page = 0; tab.slide = 1; tab.dirty = true; }
    const devT = dev === comp ? MON_T.clone() : tabletWorld(V3(0, 0, SZ));
    $('#stStatus').textContent = `Shooting variation #${o.seed}…`;
    // pre-position for the opening, then roll
    const openType = o.open != null ? o.open : Math.floor(rng() * 4);
    const ROOM_T = V3(1.0, 0.85, -1.1);
    const OPEN = [
      [ROOM_T, [j(.55), j(.32, .1), 4.2], [j(.38), .27, 3.3], 3.2],
      [V3(0.1, 0.9, -1.15), [j(-.95), .07, 1.5], [j(-.35), .12, 1.25], 3.2],
      [V3(1.1, 0.7, -1.0), [j(.05), 1.3, 2.9], [j(.35), 1.18, 2.4], 3.2],
      [devT, [j(.12), .05, .22], [j(.3), .16, .8], o.open === 3 ? 1.8 : 2.8]
    ][openType];
    camToken++; camera.position.copy(orbitPos(OPEN[0], OPEN[1][0] * D.mirror, OPEN[1][1], OPEN[1][2] * D.frameF)); controls.target.copy(OPEN[0]); controls.update();
    if (!startRecording(o.aspect, o.res)) throw new Error('norec');
    await wait(0.15);
    setCaption('hook', o.hook);
    const savedCuts = D.cuts; D.cuts = true; await camShot(OPEN[0], OPEN[1], OPEN[2], OPEN[3]); D.cuts = savedCuts; chk();
    clearCaption('hook');

    // 1. read: scroll or page turns
    if (o.steps) setCaption('step', dev === comp ? '1 · Read on screen' : '1 · Turn the pages');
    if (dev === comp) {
      const target = Math.min(compMax(), o.pages >= n ? compMax() : comp.layout[o.pages].y);
      comp.speed = 150 * o.speed; comp.loop = false;
      let done = false;
      const scrolled = new Promise(res => { comp.stopAt = Math.max(1, target); comp.stopRes = res; comp.playing = true; }).then(() => done = true);
      const dur = Math.max(2, target / comp.speed);
      if (D.cuts) {
        (async () => { const S = [[[j(.3), j(.1, .08), .85], [j(.2), .1, .7]], [[j(-.15), .02, .3], [j(-.05), .03, .26]], [[j(-.7), .15, 1.1], [j(-.55), .14, .95]]]; let k = 0; while (!done && !director.abort) { const s = S[k++ % 3]; await camShot(devT, s[0], s[1], 2.3 / Math.sqrt(o.speed)); } })();
      } else camShot(devT, [j(.4), .14, 1.0], [j(.1), .05, .55], dur);
      await scrolled; chk();
    } else {
      const tpp = 2.7 / o.speed; tab.tpp = tpp;
      for (let k = 0; k < o.pages; k++) {
        const arrowW = tabletWorld(arrowLocal('r'));
        if (D.cuts) camShot(k % 2 ? arrowW : devT, k % 2 ? [j(.5), .25, .22] : [j(.25), .1, .55], k % 2 ? [j(.4), .22, .2] : [j(.15), .08, .48], tpp);
        else if (k === 0) camShot(devT, [j(.5), .2, .75], [j(.15), .08, .45], tpp * o.pages);
        const ok = await penTurn(1); chk(); if (!ok) break;
        await wait(Math.max(0.3, tpp - 1.6)); chk();
      }
    }

    // 2. print
    if (o.steps) setCaption('step', '2 · Print'); else clearCaption('step');
    const PR_T = V3(PR.x, PR.top + 0.15, PR.z), FEED_T = V3(PR.x, PR.top + 0.3, PR.z - 0.2), TRAY_T = V3(PR.x, PR.top + 0.06, PR.z + 0.36);
    camShot(PR_T, [j(.6), j(.38, .1), 1.15], [j(.42), .3, .95], 2.2);
    await queuePrint(doc, printIdx, {
      sheet: (k, i, stage) => {
        if (stage === 'feed' && (D.cuts ? k % 2 === 0 : k === 0) && k > 0) camShot(FEED_T, [j(.9), .5, .6], [j(.75), .45, .52], 1.2 / o.speed);
        if (stage === 'out' && (D.cuts || k === printIdx.length - 1 || k % 2 === 0)) camShot(TRAY_T, [j(-.3), j(.3, .1), .62], [j(-.15), .25, .5], 1.4 / o.speed);
      }
    }); chk();
    await wait(0.3);

    // 3-4. collate, staple, drop
    const BED_T = V3(BU.x, BU.top + 0.03, BU.z), HEAD_T = V3(BU.x, BU.top + 0.06, BU.z - 0.05), CHUTE_T = V3(BU.x, 0.42, BU.z + 0.6);
    const bundle = await queueBundle(o.staple, {
      phase: ph => {
        if (ph === 'collate') { if (o.steps) setCaption('step', '3 · Collate in page order'); camShot(BED_T, [j(.55), .6, 1.0], [j(.35), .55, .85], 2.0); }
        if (ph === 'jog') camShot(BED_T, [j(-.35), .3, .6], [j(-.2), .28, .5], 1.0 / o.speed);
        if (ph === 'staple') { if (o.steps) setCaption('step', '4 · Staple'); camShot(HEAD_T, [j(.25), .28, .45], [j(.15), .22, .36], 1.8 / o.speed); }
        if (ph === 'drop') { if (o.steps) setCaption('step', '5 · Into the bin'); camShot(CHUTE_T, [j(.95), .25, 1.15], [j(.8), .22, 1.0], 1.6 / o.speed); }
      }
    }); chk();
    await wait(0.4);

    // inspection
    if (bundle) {
      if (o.steps) setCaption('step', 'Finished bundle'); else clearCaption('step');
      const bt = bundle.group.position.clone().add(V3(0, 0.01, 0)), y0 = j(0, 1.2);
      await camShot(bt, [y0, .95, .5], [y0 + 1.1, .85, .4], 3.2); chk();
    }
    clearCaption('step');

    // wrap
    setCaption('closing', o.close);
    await camShot(ROOM_T, [j(.3), .3, 2.6], [j(.45), .33, 3.6], 3.0);
    await wait(0.4);
    clearCaption('closing'); await wait(0.35);
    $('#stStatus').textContent = `Done: variation #${o.seed}. Type it back in (with "new variation" off) to repeat this shoot.`;
  } catch (e) {
    if (e.message !== 'norec') $('#stStatus').textContent = director.abort ? 'Shoot stopped.' : 'Shoot failed: ' + e.message;
    if (e.message !== 'abort' && e.message !== 'norec') console.error(e);
  } finally {
    Object.keys(captions).forEach(clearCaption);
    mSpeed = prevSpeed; shakeAmp = 0; comp.stopAt = null; comp.stopRes = null; comp.loop = $('#cLoop').checked; comp.speed = +$('#cSpeed').value; tab.tpp = +$('#tTpp').value;
    if (rec) await stopRecording();
    director.active = false; controls.enabled = true; setStudioButtons(false);
  }
}
function setStudioButtons(busy) { $('#shootBtn').disabled = busy; $('#manualBtn').disabled = busy && !rec; }
async function toggleManual() {
  if (rec && !director.active) { await stopRecording(); $('#manualBtn').textContent = '⏺ Record what I do'; $('#stStatus').textContent = 'Recording saved.'; return; }
  if (director.active) return;
  const o = readStudio(); capStyle = o.capStyle;
  const V = VIEWS[o.src]; await camTo(V3(...V.pos), V3(...V.t), 0.8);
  if (startRecording(o.aspect, o.res)) { $('#manualBtn').textContent = '■ Stop recording'; $('#stStatus').textContent = 'Recording your moves: orbit, zoom, print, bundle…'; }
}

/* ------------------------------------------------------------------ UI wiring */
function refreshDeviceUI() {
  for (const [dev, p] of [[comp, 'c'], [tab, 't']]) {
    const t = dev.media.type; $(`#${p}Pdf`).style.display = t === 'pdf' ? '' : 'none'; $(`#${p}Vid`).style.display = t === 'video' ? '' : 'none';
    $(`#${p}Info`).textContent = t === 'pdf' ? `${dev.media.name} · ${dev.media.doc.pages.length} page(s)` : t === 'video' ? `Video: ${dev.media.name}` : 'Nothing loaded.';
    if (t === 'video') { $(`#${p}Play`).textContent = dev.media.video.paused ? 'Play' : 'Pause'; $(`#${p}Mute`).textContent = dev.media.video.muted ? 'Unmute' : 'Mute'; dev.media.video.loop = $(`#${p}VLoop`).checked; }
  }
  $('#cPause').textContent = comp.playing ? 'Pause' : 'Play'; $('#tPause').textContent = tab.penPaused ? 'Resume pen' : 'Pause pen';
}
let prSel = new Set();
let thumbDocId = null;
function printerDoc() {
  const d = $('#prSrc').value === 'tablet' ? tab : comp, o = d === comp ? tab : comp;
  return d.media.type === 'pdf' ? d.media.doc : o.media.type === 'pdf' ? o.media.doc : SAMPLE;
}
function refreshThumbs() {
  const doc = printerDoc(), el = $('#thumbs');
  if (thumbDocId !== doc.id) { thumbDocId = doc.id; prSel = new Set(doc.pages.map((_, i) => i)); }
  el.innerHTML = '';
  doc.pages.forEach((p, i) => {
    if (!p.thumb) { const c = document.createElement('canvas'); c.width = 110; c.height = Math.round(110 * p.canvas.height / p.canvas.width); c.getContext('2d').drawImage(p.canvas, 0, 0, c.width, c.height); p.thumb = c.toDataURL('image/jpeg', 0.7); }
    const d = document.createElement('div'); d.className = prSel.has(i) ? 'sel' : ''; d.innerHTML = `<img src="${p.thumb}" alt="Page ${i + 1}"><span>${i + 1}</span>`; d.title = `Page ${i + 1}`;
    d.onclick = () => { prSel.has(i) ? prSel.delete(i) : prSel.add(i); d.classList.toggle('sel'); $('#range').value = formatRange([...prSel]); };
    el.appendChild(d);
  });
  $('#range').value = formatRange([...prSel]);
}

function initUI() {
  document.querySelectorAll('#views button').forEach(b => b.onclick = () => setView(b.dataset.v));
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => toggleMobileTab(b.dataset.v));
  $('#closePanel').onclick = hidePanel;
  // Drag the panel by its small header strip. Pointer events work with mouse, pen and touch.
  const panel = $('#panel'), dragHandle = $('#panelDrag');
  let panelDrag = null;
  dragHandle.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    if (panel.classList.contains('hidden')) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = `${r.width}px`;
    panelDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, width: r.width, height: r.height };
    dragHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  dragHandle.addEventListener('pointermove', e => {
    if (!panelDrag || panelDrag.id !== e.pointerId) return;
    const maxLeft = Math.max(8, innerWidth - panelDrag.width - 8);
    const maxTop = Math.max(8, innerHeight - panelDrag.height - 8);
    const left = Math.min(maxLeft, Math.max(8, panelDrag.left + e.clientX - panelDrag.x));
    const top = Math.min(maxTop, Math.max(8, panelDrag.top + e.clientY - panelDrag.y));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });
  const stopPanelDrag = e => {
    if (panelDrag && (e.pointerId === undefined || panelDrag.id === e.pointerId)) panelDrag = null;
  };
  dragHandle.addEventListener('pointerup', stopPanelDrag);
  dragHandle.addEventListener('pointercancel', stopPanelDrag);
  // room
  $('#look').innerHTML = LOOK_KEYS.map(k => `<option value="${k}">${LOOKS[k].name}</option>`).join(''); $('#look').onchange = e => applyLook(e.target.value);
  $('#paper').innerHTML = PAPERS.map(p => `<option value="${p.c}">${p.n}</option>`).join(''); $('#paper').onchange = e => paperColor.set(e.target.value);
  $('#stPaper').innerHTML = `<option value="random">Random colour</option>` + PAPERS.map(p => `<option value="${p.c}">${p.n}</option>`).join('');
  $('#mspeed').oninput = e => mSpeed = +e.target.value;
  $('#sound').onchange = e => { sfx.init(); sfx.setEnabled(e.target.checked); };
  $('#vol').oninput = e => { sfx.init(); sfx.setVolume(+e.target.value); };
  const setDelay = ms => { $('#delay').value = ms; $('#delayVal').textContent = ms + ' ms'; sfx.setDelay(ms); };
  $('#delay').oninput = e => { sfx.init(); setDelay(+e.target.value); };
  $('#measure').onclick = async () => {
    sfx.init(); toast('Measuring frame timing…'); const times = []; let lastT = performance.now();
    await new Promise(res => { let n = 0; const f = t => { times.push(t - lastT); lastT = t; if (++n < 60) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    times.sort((a, b) => a - b); const frame = times[Math.floor(times.length / 2)] || 16.7; const ms = Math.min(400, sfx.estimateDelay(frame));
    setDelay(ms); toast(`Sound delay set to ${ms} ms`);
  };
  $('#sampleBoth').onclick = () => { setPdf(comp, SAMPLE); setPdf(tab, SAMPLE); toast('Sample guide loaded'); };
  // computer
  $('#cOpen').onclick = () => $('#cFile').click(); $('#cFile').onchange = e => { openFile(e.target.files[0], comp); e.target.value = ''; };
  $('#cSample').onclick = () => setPdf(comp, SAMPLE);
  $('#cSpeed').oninput = e => comp.speed = +e.target.value;
  $('#cLoop').onchange = e => comp.loop = e.target.checked;
  $('#cPause').onclick = () => { if (comp.media.type !== 'pdf') return; if (!comp.playing && comp.scroll >= compMax()) comp.scroll = 0; comp.playing = !comp.playing; comp.dirty = true; refreshDeviceUI(); };
  $('#cTop').onclick = () => { comp.scroll = 0; comp.dirty = true; };
  $('#cPos').addEventListener('pointerdown', () => comp.dragging = true); addEventListener('pointerup', () => comp.dragging = false);
  $('#cPos').oninput = e => { comp.scroll = +e.target.value / 1000 * compMax(); comp.dirty = true; };
  // tablet
  $('#tOpen').onclick = () => $('#tFile').click(); $('#tFile').onchange = e => { openFile(e.target.files[0], tab); e.target.value = ''; };
  $('#tSample').onclick = () => setPdf(tab, SAMPLE);
  $('#tTpp').oninput = e => { tab.tpp = +e.target.value; $('#tTppVal').textContent = tab.tpp + ' s'; };
  $('#tLoop').onchange = e => tab.loop = e.target.checked;
  $('#tPause').onclick = () => { tab.penPaused = !tab.penPaused; tab.timer = 0; refreshDeviceUI(); };
  $('#tPrev').onclick = () => penTurn(-1); $('#tNext').onclick = () => penTurn(1);
  // video controls (both devices)
  for (const [dev, p] of [[comp, 'c'], [tab, 't']]) {
    $(`#${p}Play`).onclick = () => { const v = dev.media.video; if (!v) return; v.paused ? v.play() : v.pause(); refreshDeviceUI(); };
    $(`#${p}Mute`).onclick = () => { const v = dev.media.video; if (!v) return; v.muted = !v.muted; refreshDeviceUI(); };
    $(`#${p}VLoop`).onchange = e => { if (dev.media.video) dev.media.video.loop = e.target.checked; };
    $(`#${p}Seek`).addEventListener('pointerdown', () => dev.seeking = true); addEventListener('pointerup', () => dev.seeking = false);
    $(`#${p}Seek`).oninput = e => { const v = dev.media.video; if (v && v.duration) v.currentTime = +e.target.value / 1000 * v.duration; };
  }
  // printer
  $('#prSrc').onchange = refreshThumbs;
  $('#range').oninput = e => { const doc = printerDoc(); prSel = new Set(parseRange(e.target.value, doc.pages.length)); document.querySelectorAll('#thumbs div').forEach((d, i) => d.classList.toggle('sel', prSel.has(i))); };
  $('#selAll').onclick = () => { prSel = new Set(printerDoc().pages.map((_, i) => i)); refreshThumbs(); };
  $('#selNone').onclick = () => { prSel = new Set(); refreshThumbs(); };
  $('#printBtn').onclick = () => { sfx.init(); queuePrint(printerDoc(), [...prSel].sort((a, b) => a - b)); };
  $('#clearTray').onclick = () => { if (printingJobs) return toast('Wait for the printer to finish'); clearTray(); };
  // bundler
  $('#bundleBtn').onclick = () => { sfx.init(); queueBundle($('#staple').value); };
  $('#showLast').onclick = () => { const b = bundles[bundles.length - 1]; if (!b) return toast('No bundles yet'); const t = b.group.position.clone(); camTo(orbitPos(t, 0.35, 1.0, 0.55), t, 1.2); };
  $('#emptyBin').onclick = emptyBin;
  // studio
  $('#stRecipe').onchange = e => applyRecipe(e.target.value);
  $('#stSpeed').oninput = e => $('#stSpeedVal').textContent = (+e.target.value).toFixed(1) + '×';
  $('#stDice').onclick = () => { $('#stVar').value = 1 + Math.floor(Math.random() * 99999); };
  $('#stVar').oninput = () => $('#stAuto').checked = false;
  $('#shootBtn').onclick = () => { sfx.init(); runShoot(); };
  $('#manualBtn').onclick = () => { sfx.init(); toggleManual(); };
  $('#stopBtn').onclick = () => { if (director.active) director.abort = true; else if (rec) toggleManual(); };
  $('#previewBtn').onclick = showPreview;
  $('#closeModal').onclick = () => { $('#modal').classList.remove('on'); $('#pv').pause(); };
  addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal').classList.contains('on')) $('#closeModal').click(); else if (director.active) director.abort = true; } });
  // drag & drop anywhere
  let dragDepth = 0;
  addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('#drop').classList.add('on'); });
  addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('on'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('on'); sfx.init(); const f = e.dataTransfer.files[0]; openFile(f, activeView === 'tablet' ? tab : comp); });
  // On phones, keep the scene clear until the user taps a bottom tab.
  if (matchMedia('(max-width:760px)').matches) panel.classList.add('hidden');
}

/* ------------------------------------------------------------------ loop */
function updateDevices(dt) {
  // computer
  if (comp.media.type === 'pdf') {
    if (comp.playing) {
      const max = compMax(), prev = comp.scroll; comp.scroll += comp.speed * dt;
      if (comp.stopAt != null && comp.scroll >= comp.stopAt) { comp.scroll = comp.stopAt; comp.playing = false; const r = comp.stopRes; comp.stopAt = comp.stopRes = null; r && r(); refreshDeviceUI(); }
      if (comp.scroll >= max) { if (comp.loop && !director.active) comp.scroll = 0; else { comp.scroll = max; comp.playing = false; const r = comp.stopRes; comp.stopAt = comp.stopRes = null; r && r(); refreshDeviceUI(); } }
      if (Math.floor(comp.scroll / 48) !== Math.floor(prev / 48)) sfx.tick();
      comp.dirty = true;
    }
    if (!comp.dragging) $('#cPos').value = compMax() ? comp.scroll / compMax() * 1000 : 0;
  }
  if (comp.media.type === 'video') { comp.dirty = true; const v = comp.media.video; if (!comp.seeking && v.duration) $('#cSeek').value = v.currentTime / v.duration * 1000; }
  if (comp.dirty) { drawComp(); comp.dirty = false; }
  // tablet
  if (tab.media.type === 'pdf' && !tab.penPaused && !tab.penBusy && !director.active) { tab.timer += dt; if (tab.timer >= tab.tpp) { tab.timer = 0; penTurn(1); } }
  if (tab.flash) { tab.flash.t += dt * 2.5; if (tab.flash.t >= 1) tab.flash = null; tab.dirty = true; }
  if (tab.slide < 1) tab.dirty = true;
  if (tab.media.type === 'video') { tab.dirty = true; const v = tab.media.video; if (!tab.seeking && v.duration) $('#tSeek').value = v.currentTime / v.duration * 1000; }
  if (tab.dirty) { drawTab(); tab.dirty = false; }
}
let last = performance.now(), clockAcc = 0, recAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  updateTweens(dt); updateDevices(dt); updateCaptions(dt);
  clockAcc += dt; if (clockAcc > 1) { clockAcc = 0; drawClock(); }
  if (printingJobs) ledMat.emissiveIntensity = 1 + Math.sin(now * 0.012) * 0.8;
  controls.update();
  const sp = camera.position.clone(), sq = camera.quaternion.clone();
  if (shakeAmp > 0) { shakeT += dt; const n = (a, b, c) => Math.sin(shakeT * a) * .5 + Math.sin(shakeT * b + 1.3) * .3 + Math.sin(shakeT * c + 2.1) * .2; camera.rotateX(n(1.3, 2.9, 5.1) * shakeAmp); camera.rotateY(n(1.7, 3.3, 4.3) * shakeAmp); camera.rotateZ(n(0.9, 2.1, 3.7) * shakeAmp * 0.5); }
  renderer.render(scene, camera);
  camera.position.copy(sp); camera.quaternion.copy(sq);
  if (rec) {
    cg.drawImage(renderer.domElement, 0, 0, rec.W, rec.H); drawCaptions(cg, rec.W, rec.H);
    recAcc += dt; if (recAcc > 0.25) { recAcc = 0; const s = Math.floor((now - rec.start) / 1000); $('#recbadge').textContent = `● REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  }
}
function onResize() {
  if (rec) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const panel = $('#panel');
  if (panel && panel.style.left && !panel.classList.contains('hidden')) {
    const maxWidth = Math.max(240, innerWidth - 16);
    if (panel.getBoundingClientRect().width > maxWidth) panel.style.width = `${maxWidth}px`;
    const r = panel.getBoundingClientRect();
    const maxLeft = Math.max(8, innerWidth - r.width - 8);
    const maxTop = Math.max(8, innerHeight - r.height - 8);
    panel.style.left = `${Math.min(maxLeft, Math.max(8, r.left))}px`;
    panel.style.top = `${Math.min(maxTop, Math.max(8, r.top))}px`;
  }
}
addEventListener('resize', onResize);

/* ------------------------------------------------------------------ start */
initUI();
applyLook('studio');
setPdf(comp, SAMPLE); setPdf(tab, SAMPLE);
$('#cSpeed').dispatchEvent(new Event('input'));
refreshBundleList();
$('#loading').remove();
requestAnimationFrame(frame);
setTimeout(() => toast('Click a machine to fly in · drop a PDF anywhere', 3000), 600);
