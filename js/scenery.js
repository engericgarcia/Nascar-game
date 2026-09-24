/* ============================================================
   scenery.js - camadas de detalhe em volta da pista:
   arquibancadas em degraus com torcida, cobertura e camarotes,
   torre-placar com a classificação ao vivo, carrinhos e
   guarda-sóis das equipes no box, árvores, estacionamento cheio,
   motorhomes no infield, logotipo pintado na grama.
   ============================================================ */
import * as THREE from 'three';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const SHIRTS = ['#d32f2f', '#1e56c8', '#ffd21f', '#f4f4f4', '#2e9e4a', '#ff8a00', '#222', '#b04fc4', '#7fc6ff', '#a0522d', '#e91e63', '#00a19a'];
const SKIN = ['#f1c9a5', '#d9a47a', '#a8744f', '#6f4a33', '#ffdfc4'];

/* torcida: 8 variações de fileira lado a lado (u), pessoas ao longo de v */
function crowdTex(q) {
  const r = rnd(99);
  return canvasTex(512, q ? 512 : 256, (x, w, h) => {
    const cw = w / 8;
    for (let k = 0; k < 8; k++) {
      const x0 = k * cw;
      // espelho do degrau (concreto)
      const g = x.createLinearGradient(x0, 0, x0 + cw * 0.4, 0);
      g.addColorStop(0, '#6b6f75'); g.addColorStop(1, '#8b9096');
      x.fillStyle = g; x.fillRect(x0, 0, cw * 0.4, h);
      // piso/assentos
      const seat = k % 3 === 0 ? '#2d4f8f' : k % 3 === 1 ? '#8d2a2a' : '#5a5f66';
      x.fillStyle = seat; x.fillRect(x0 + cw * 0.4, 0, cw * 0.6, h);
      // pessoas
      const ph = h / 20;
      for (let j = 0; j < 20; j++) {
        if (r() < 0.12) continue;             // lugar vazio
        const y0 = j * ph + r() * ph * 0.2;
        const shirt = SHIRTS[(r() * SHIRTS.length) | 0];
        x.fillStyle = shirt;
        x.fillRect(x0 + cw * 0.42, y0 + ph * 0.12, cw * 0.36, ph * 0.76);
        x.fillStyle = 'rgba(0,0,0,0.25)';
        x.fillRect(x0 + cw * 0.42, y0 + ph * 0.12, cw * 0.08, ph * 0.76);
        x.fillStyle = SKIN[(r() * SKIN.length) | 0];
        x.beginPath(); x.arc(x0 + cw * 0.84, y0 + ph * 0.5, ph * 0.3, 0, 7); x.fill();
        if (r() < 0.3) { x.fillStyle = r() < 0.5 ? '#c00' : '#111'; x.fillRect(x0 + cw * 0.88, y0 + ph * 0.25, cw * 0.1, ph * 0.5); }   // boné
        if (r() < 0.08) { x.fillStyle = SHIRTS[(r() * SHIRTS.length) | 0]; x.fillRect(x0 + cw * 0.88, y0, cw * 0.12, ph * 1.2); } // bandeira
      }
    }
  }, true);
}

function glassTex() {
  const r = rnd(5);
  return canvasTex(256, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9fc3e6'); g.addColorStop(0.5, '#2a4058'); g.addColorStop(1, '#1b2836');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 16) {
      x.fillStyle = '#d8dde2'; x.fillRect(i, 0, 2, h);
      if (r() < 0.4) { x.fillStyle = 'rgba(255,240,200,0.35)'; x.fillRect(i + 3, h * 0.55, 11, h * 0.35); }
    }
    x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, w, 5); x.fillRect(0, h - 6, w, 6);
  }, true);
}

/* ---------------- arquibancadas ---------------- */
export function buildStands(tr, g, quality) {
  const crowd = crowdTex(quality >= 2);
  const matCrowd = new THREE.MeshLambertMaterial({ map: crowd, side: THREE.DoubleSide });
  const matConcrete = new THREE.MeshLambertMaterial({ color: 0xa7abb1, side: THREE.DoubleSide });
  const matRoof = new THREE.MeshLambertMaterial({ color: 0xe9ecef, side: THREE.DoubleSide });
  const matSteel = new THREE.MeshLambertMaterial({ color: 0x6f7780 });
  const matGlass = new THREE.MeshLambertMaterial({ map: glassTex(), side: THREE.DoubleSide });
  const short = tr.L < 1200;
  const pieces = [];
  if (short) pieces.push({ a: 0, b: tr.L, depth: 34, height: 30, roof: false, suites: true });
  else {
    pieces.push({ a: tr.pitStart - 180, b: tr.pitStart + tr.pitLen + 180, depth: 52, height: 40, roof: true, suites: true });
    pieces.push({ a: tr.L / 2 - tr.S * 0.4, b: tr.L / 2 + tr.S * 0.4, depth: 22, height: 15, roof: false, suites: false });
    // curvas 1 e 4 com arquibancadas menores
    pieces.push({ a: tr.pitStart + tr.pitLen + 180, b: tr.pitStart + tr.pitLen + 420, depth: 28, height: 20, roof: false, suites: false });
    pieces.push({ a: tr.pitStart - 420, b: tr.pitStart - 180, depth: 28, height: 20, roof: false, suites: false });
  }
  const outer = tr.W / 2 + 1.6;
  const cols = [];
  for (const P of pieces) {
    const d0 = outer + 7;
    const rows = Math.round(P.depth / (quality >= 2 ? 1.4 : 1.8));
    const tread = P.depth / rows, rise = P.height / rows;
    const base = s => tr.heightAt(s, tr.W / 2) + 2.2;
    // degraus
    const st = tr.L < 1200 ? 5 : 9;
    g.add(tr.sweep(P.a, P.b, st, s => {
      const y0 = base(s);
      const pts = [];
      for (let k = 0; k < rows; k++) {
        const d = d0 + k * tread, y = y0 + k * rise;
        const u0 = (k % 8) / 8;
        pts.push([d, y, u0]);
        pts.push([d, y + rise, u0 + 0.4 / 8]);
        pts.push([d + tread, y + rise, u0 + 1 / 8]);
        if ((k + 1) % 8 === 0) pts.push([d + tread, y + rise, 0]);
      }
      return pts;
    }, matCrowd, 7, true));
    // mureta na frente e parede de trás
    g.add(tr.sweep(P.a, P.b, 8, s => [[d0, -0.4, 0], [d0, base(s), 1]], matConcrete, 20, true));
    const top = s => base(s) + P.height;
    const dBack = d0 + P.depth;
    g.add(tr.sweep(P.a, P.b, 8, s => [[dBack, top(s) + (P.suites ? 7 : 1.2), 0], [dBack, -0.4, 1]], matConcrete, 20, true));
    // camarotes envidraçados no topo
    if (P.suites) {
      g.add(tr.sweep(P.a, P.b, 8, s => [[dBack - 5, top(s) + 0.5, 0], [dBack - 5, top(s) + 6, 1]], matGlass, 16, true));
      g.add(tr.sweep(P.a, P.b, 8, s => [[dBack - 5.5, top(s) + 6.5, 0], [dBack + 0.5, top(s) + 7.2, 1]], matRoof, 20, true));
    }
    // cobertura sobre a metade de cima, com pilares
    if (P.roof && quality > 0) {
      const ry = s => top(s) + 13;
      g.add(tr.sweep(P.a, P.b, 8, s => [[d0 + P.depth * 0.35, ry(s) - 2, 0], [dBack + 2, ry(s), 1]], matRoof, 20, true));
      for (let s = P.a; s < P.b; s += 30) {
        const p = tr.toWorld(s, dBack - 1, new THREE.Vector3());
        cols.push([p.x, base(s), p.z, ry(s) - base(s)]);
      }
    }
  }
  if (cols.length) {
    const colMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 1, 0.8), matSteel, cols.length);
    const m = new THREE.Matrix4();
    cols.forEach(([x, y, z, h], i) => { m.makeScale(1, h, 1); m.setPosition(x, y + h / 2, z); colMesh.setMatrixAt(i, m); });
    g.add(colMesh);
  }
}

/* ---------------- torre-placar com a classificação ---------------- */
export class Pylon {
  constructor(tr, g) {
    this.cv = document.createElement('canvas');
    this.cv.width = 64; this.cv.height = 512;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const s = tr.wrap(tr.pitStart + tr.pitLen * 0.62);
    const p = tr.toWorld(s, tr.pitInner - 26, new THREE.Vector3());
    const o = tr.sample(s, {});
    const H = 34, Wd = 4.2;
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.8, H + 2, 1.4), new THREE.MeshLambertMaterial({ color: 0x1c1f24 }));
    frame.position.y = H / 2 + 4;
    const faceMat = new THREE.MeshBasicMaterial({ map: this.tex });
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(Wd, H), faceMat);
      face.position.set(0, H / 2 + 4, side * 0.72);
      if (side < 0) face.rotation.y = Math.PI;
      grp.add(face);
    }
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1), new THREE.MeshLambertMaterial({ color: 0x555 }));
    leg.position.y = 2;
    grp.add(frame, leg);
    grp.position.set(p.x, -0.35, p.z);
    // de frente para a reta
    grp.rotation.y = Math.atan2(o.nx, o.nz);
    g.add(grp);
    this.t = 0;
  }
  update(dt, ranking) {
    this.t -= dt;
    if (this.t > 0 || !ranking) return;
    this.t = 1;
    const x = this.cv.getContext('2d');
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 64, 512);
    x.fillStyle = '#c8102e'; x.fillRect(0, 0, 64, 34);
    x.fillStyle = '#fff'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('POS', 32, 18);
    for (let i = 0; i < 10 && i < ranking.length; i++) {
      const y = 40 + i * 47;
      x.fillStyle = '#1a1a1a'; x.fillRect(4, y, 56, 42);
      x.fillStyle = '#ffd21f'; x.font = 'bold 34px "Courier New", monospace';
      x.fillText(String(ranking[i].info.num), 32, y + 22);
    }
    this.tex.needsUpdate = true;
  }
}

/* ---------------- carrinhos e guarda-sóis das equipes ---------------- */
export function buildPitBoxes(tr, g, field) {
  const n = field.length;
  const cart = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 2.6, 1.6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const umb = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 0.7, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), n);
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 4), new THREE.MeshLambertMaterial({ color: 0x888888 }), n);
  const tires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 1.2, 10), new THREE.MeshLambertMaterial({ color: 0x151515 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  const o = {};
  field.forEach((f, i) => {
    const s = tr.stallS(i, n);
    tr.sample(s, o);
    const ang = Math.atan2(o.fx, o.fz);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const p = tr.toWorld(s + 1.5, tr.pitInner - 3.2, new THREE.Vector3());
    m.compose(new THREE.Vector3(p.x, -0.35 + 1.3, p.z), q, sc); cart.setMatrixAt(i, m);
    cart.setColorAt(i, c.set(f.color));
    const pu = tr.toWorld(s - 1.5, tr.pitInner - 3.2, new THREE.Vector3());
    m.compose(new THREE.Vector3(pu.x, -0.35 + 3.3, pu.z), q, sc); umb.setMatrixAt(i, m);
    umb.setColorAt(i, c.set(i % 2 ? f.color2 : f.color));
    m.compose(new THREE.Vector3(pu.x, -0.35 + 1.5, pu.z), q, sc); pole.setMatrixAt(i, m);
    const pt = tr.toWorld(s - 3.2, tr.pitInner - 2.2, new THREE.Vector3());
    m.compose(new THREE.Vector3(pt.x, -0.35 + 0.6, pt.z), q, sc); tires.setMatrixAt(i, m);
  });
  cart.instanceColor.needsUpdate = true; umb.instanceColor.needsUpdate = true;
  const grp = new THREE.Group();
  grp.add(cart, umb, pole, tires);
  g.add(grp);
  return grp;
}

/* ---------------- árvores, estacionamento, motorhomes ---------------- */
export function buildSurroundings(tr, g, quality) {
  const r = rnd(1234);
  const cx = tr.center.x, cz = tr.center.z, R = tr.radius;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  // árvores
  const nT = quality === 0 ? 180 : 420;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 5, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0x5b4130 }), nT);
  const crownGeo = new THREE.IcosahedronGeometry(4, 0);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), nT);
  for (let i = 0; i < nT; i++) {
    const a = r() * Math.PI * 2;
    const d = R + 290 + r() * 420;
    const x = cx + Math.cos(a) * d * 1.05, z = cz + Math.sin(a) * d * 0.95;
    const s = 0.8 + r() * 1.1;
    q.setFromAxisAngle(up, r() * 6);
    m.compose(new THREE.Vector3(x, 2.1 * s, z), q, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 6.5 * s, z), q, new THREE.Vector3(s, s * (1 + r() * 0.5), s)); crown.setMatrixAt(i, m);
    crown.setColorAt(i, c.setHSL(0.24 + r() * 0.08, 0.45 + r() * 0.2, 0.22 + r() * 0.12));
  }
  crown.instanceColor.needsUpdate = true;
  g.add(trunk, crown);

  // carros no estacionamento (anel cinza em volta)
  const nC = quality === 0 ? 300 : 900;
  const carGeo = new THREE.BoxGeometry(1.9, 1.4, 4.5); carGeo.translate(0, 0.7, 0);
  const lot = new THREE.InstancedMesh(carGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), nC);
  const colors = ['#e8e8e8', '#222', '#8a8f96', '#b71c1c', '#1c3f94', '#c9c9c9', '#3c5a3c', '#e0c080', '#5b0d0d'];
  let k = 0;
  for (let ring = 0; ring < 6 && k < nC; ring++) {
    const d = R + 110 + ring * 22;
    const per = Math.floor(2 * Math.PI * d / 2.9);
    for (let j = 0; j < per && k < nC; j++) {
      if (r() < 0.3) continue;
      const a = j / per * Math.PI * 2;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      q.setFromAxisAngle(up, -a);
      m.compose(new THREE.Vector3(x, -0.38, z), q, new THREE.Vector3(1, 0.9 + r() * 0.4, 1));
      lot.setMatrixAt(k, m);
      lot.setColorAt(k, c.set(colors[(r() * colors.length) | 0]));
      k++;
    }
  }
  lot.count = k;
  lot.instanceColor.needsUpdate = true;
  g.add(lot);

  // motorhomes no infield (lado da reta oposta)
  const nR = tr.L > 2000 ? 70 : 24;
  const rvGeo = new THREE.BoxGeometry(2.6, 3.4, 12); rvGeo.translate(0, 1.7, 0);
  const rv = new THREE.InstancedMesh(rvGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), nR);
  const o = {};
  for (let i = 0; i < nR; i++) {
    const row = i % 2;
    const s = tr.L / 2 - tr.S * 0.4 + (Math.floor(i / 2) / (nR / 2)) * tr.S * 0.8;
    tr.sample(s, o);
    const d = -tr.W / 2 - tr.apron - 30 - row * 16;
    const p = tr.toWorld(s, d, new THREE.Vector3());
    q.setFromAxisAngle(up, Math.atan2(o.nx, o.nz));
    m.compose(new THREE.Vector3(p.x, -0.36, p.z), q, new THREE.Vector3(1, 1, 1));
    rv.setMatrixAt(i, m);
    rv.setColorAt(i, c.set(['#f2f2f0', '#e6e2d6', '#dfe6ee'][i % 3]));
  }
  rv.instanceColor.needsUpdate = true;
  g.add(rv);
}

/* ---------------- logotipo pintado na grama ---------------- */
export function buildLogos(tr, g) {
  const tex = canvasTex(1024, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.font = 'italic 900 170px "Arial Black", Impact, Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 14; x.strokeStyle = 'rgba(255,255,255,0.85)';
    x.strokeText('OVAL 500', w / 2, h / 2);
    x.fillStyle = 'rgba(200,16,46,0.9)'; x.fillText('OVAL 500', w / 2, h / 2);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const place = (s, d, len) => {
    const o = tr.sample(s, {});
    const p = tr.toWorld(s, d, new THREE.Vector3());
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 4), mat);
    pl.rotation.x = -Math.PI / 2;
    pl.rotation.z = -Math.atan2(o.fz, o.fx) + Math.PI;
    pl.position.set(p.x, -0.33, p.z);
    g.add(pl);
  };
  // na grama da reta oposta e no infield perto da largada
  place(tr.L / 2, -tr.W / 2 - tr.apron - 12, Math.min(90, tr.S * 0.5));
}
