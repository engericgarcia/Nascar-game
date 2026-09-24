/* ============================================================
   cars.js - modelo 3D do stock car (Next Gen) e pintura.
   A carroceria é "moldada" em dezenas de seções transversais
   arredondadas (superelipses), com arcos de roda, capô caído,
   traseira alta e cabine com vidros. Uma única textura por carro
   leva a pintura inteira: número, patrocinadores, faróis, vidros.
   Frente do carro = +z, esquerda = +x, cima = +y.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const CAR_LEN = 5.2;
export const CAR_WID = 1.95;

const Z0 = -2.62, Z1 = 2.7;            // comprimento da carroceria
const GZ0 = -1.62, GZ1 = 1.22;          // cabine
const BODY_V0 = 0.23, BODY_V1 = 0.77;   // faixa do atlas usada pela carroceria
const GH_V0 = 0.01, GH_V1 = 0.2;        // faixa do atlas usada pela cabine

let shared = null;
let texSize = 512;
export function setCarQuality(q) { texSize = [256, 512, 1024][q] || 512; shared = null; }

/* ---------- interpolação suave entre pontos-chave ---------- */
function curve(keys) {
  return z => {
    if (z <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [za, a] = keys[i], [zb, b] = keys[i + 1];
      if (z <= zb) {
        const t = (z - za) / (zb - za);
        const p0 = (keys[i - 1] || keys[i])[1], p3 = (keys[i + 2] || keys[i + 1])[1];
        // Catmull-Rom
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * (2 * a + (-p0 + b) * t + (2 * p0 - 5 * a + 4 * b - p3) * t2 + (-p0 + 3 * a - 3 * b + p3) * t3);
      }
    }
    return keys[keys.length - 1][1];
  };
}

// perfil do Next Gen: meia-largura, altura do teto da lataria, altura do assoalho
const halfW = curve([[-2.62, 0.88], [-2.5, 0.95], [-2.1, 0.975], [-1.45, 0.995], [-0.8, 0.975], [0, 0.968], [0.9, 0.972], [1.55, 0.993], [2.1, 0.965], [2.35, 0.93], [2.52, 0.84], [2.63, 0.72], [2.7, 0.56]]);
const topH = curve([[-2.62, 0.9], [-2.5, 0.985], [-2.0, 0.985], [-1.6, 0.975], [-0.8, 0.935], [0.2, 0.91], [1.1, 0.9], [1.7, 0.85], [2.2, 0.78], [2.45, 0.7], [2.6, 0.58], [2.7, 0.4]]);
const baseY = curve([[-2.62, 0.26], [-2.5, 0.18], [-2.2, 0.16], [2.2, 0.15], [2.55, 0.17], [2.7, 0.22]]);
const WHEELS = [[1.55, 0.44], [-1.45, 0.44]];
function floorY(z) {
  let b = baseY(z);
  for (const [zw, r] of WHEELS) {
    const dz = (z - zw) / r;
    if (Math.abs(dz) < 1) b = Math.max(b, 0.18 + 0.52 * Math.sqrt(1 - dz * dz));
  }
  return b;
}
const roofH = curve([[-1.62, 0.975], [-1.1, 1.2], [-0.72, 1.31], [-0.4, 1.34], [0.3, 1.34], [0.5, 1.3], [0.9, 1.08], [1.22, 0.9]]);

/* ---------- construtor de "loft": seções ao longo de z ---------- */
function loft(zs, section, uvOf, capStart, capEnd) {
  const pos = [], uv = [], idx = [];
  let M = 0;
  zs.forEach((z, r) => {
    const pts = section(z);
    M = pts.length;
    for (let k = 0; k < M; k++) {
      pos.push(pts[k][0], pts[k][1], z);
      const [u, v] = uvOf(z, k / (M - 1));
      uv.push(u, v);
    }
  });
  const R = zs.length;
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < M - 1; k++) {
      const a = r * M + k, b = a + 1, c = a + M, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // tampas (frente/traseira) em leque até o centro
  const cap = (r, flip, uvFix) => {
    const base = pos.length / 3;
    let cx = 0, cy = 0;
    for (let k = 0; k < M; k++) { cx += pos[(r * M + k) * 3]; cy += pos[(r * M + k) * 3 + 1]; }
    cx /= M; cy /= M;
    const z = pos[r * M * 3 + 2];
    for (let k = 0; k < M; k++) {
      pos.push(pos[(r * M + k) * 3], pos[(r * M + k) * 3 + 1], z);
      uv.push(uvFix[0], uvFix[1] + (k / (M - 1)) * uvFix[2]);
    }
    pos.push(cx, cy, z); uv.push(uvFix[0], uvFix[1] + uvFix[2] / 2);
    const c = base + M;
    for (let k = 0; k < M - 1; k++) flip ? idx.push(base + k, base + k + 1, c) : idx.push(base + k, c, base + k + 1);
  };
  if (capStart) cap(0, true, capStart);
  if (capEnd) cap(R - 1, false, capEnd);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function range(a, b, n) { const r = []; for (let i = 0; i <= n; i++) r.push(a + (b - a) * i / n); return r; }

function bodyGeo(nSec, M, nArch) {
  // mais seções perto dos arcos das rodas
  const zs = new Set(range(Z0, Z1, nSec).map(z => +z.toFixed(4)));
  for (const [zw, r] of WHEELS) range(zw - r - 0.02, zw + r + 0.02, nArch).forEach(z => zs.add(+z.toFixed(4)));
  const list = [...zs].sort((a, b) => a - b);
  const section = z => {
    const w = halfW(z), h = topH(z), b = floorY(z);
    const yc = (b + h) / 2, hh = (h - b) / 2;
    const pts = [];
    for (let k = 0; k < M; k++) {
      // θ de -90° (embaixo) passando pela direita, topo, esquerda, até 270°
      const th = -Math.PI / 2 + (2 * Math.PI) * k / (M - 1);
      const c = Math.cos(th), s = Math.sin(th);
      const ex = 0.3, ey = s > 0 ? 0.22 : 0.1;      // superelipse: lados retos, cantos redondos
      const x = -w * Math.sign(c) * Math.pow(Math.abs(c), ex);
      let y = yc + hh * Math.sign(s) * Math.pow(Math.abs(s), ey);
      // coroa do teto (capô levemente abaulado)
      if (s > 0) y += 0.025 * Math.pow(Math.abs(c) < 1 ? 1 - Math.abs(c) : 0, 2);
      pts.push([x, y]);
    }
    return pts;
  };
  const uvOf = (z, t) => [(z - Z0) / (Z1 - Z0), BODY_V0 + (BODY_V1 - BODY_V0) * t];
  return loft(list, section, uvOf, [0.004, BODY_V0, BODY_V1 - BODY_V0], [0.996, BODY_V0, BODY_V1 - BODY_V0]);
}

function cabinGeo(nSec, M) {
  const zs = range(GZ0, GZ1, nSec);
  const section = z => {
    const yb = topH(z) - 0.012, yt = Math.max(yb, roofH(z));
    const pts = [];
    for (let k = 0; k < M; k++) {
      const th = Math.PI * k / (M - 1);
      const c = Math.cos(th), s = Math.sin(th);
      const t = Math.pow(s, 0.45);
      const wx = 0.83 + (0.63 - 0.83) * t;
      pts.push([-wx * Math.sign(c) * Math.pow(Math.abs(c), 0.55), yb + (yt - yb) * t + 0.02 * s * s]);
    }
    return pts;
  };
  const uvOf = (z, t) => [(z - GZ0) / (GZ1 - GZ0), GH_V0 + (GH_V1 - GH_V0) * t];
  return loft(zs, section, uvOf);
}

/* pinta cor por vértice para juntar peças num só desenho */
function tint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.index === null) return g;
  return g;
}
function nonIndexedSafe(g) { return g.index ? g : g; }

function partsGeo(lo) {
  const parts = [];
  const add = (g, hex) => { g.deleteAttribute && g.attributes.uv && g.deleteAttribute('uv'); parts.push(tint(g, hex)); };
  // rodas: pneu com banda de rodagem + aro escuro com centro
  for (const [x, z] of [[0.84, 1.55], [-0.84, 1.55], [0.84, -1.45], [-0.84, -1.45]]) {
    if (lo) {
      const t = new THREE.CylinderGeometry(0.345, 0.345, 0.31, 8); t.rotateZ(Math.PI / 2); t.translate(x, 0.345, z); add(t, 0x1a1a1a);
      continue;
    }
    const tire = new THREE.CylinderGeometry(0.345, 0.345, 0.31, 16, 1, false);
    tire.rotateZ(Math.PI / 2); tire.translate(x, 0.345, z); add(tire, 0x151515);
    const side = x > 0 ? 1 : -1;
    const wall = new THREE.TorusGeometry(0.29, 0.05, 4, 14);
    wall.rotateY(Math.PI / 2); wall.translate(x + side * 0.15, 0.345, z); add(wall, 0x222222);
    const rim = new THREE.CylinderGeometry(0.235, 0.235, 0.02, 12);
    rim.rotateZ(Math.PI / 2); rim.translate(x + side * 0.158, 0.345, z); add(rim, 0x3a3d42);
    const hub = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 6);
    hub.rotateZ(Math.PI / 2); hub.translate(x + side * 0.17, 0.345, z); add(hub, 0xc9ccd1);
    // raios do aro
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.BoxGeometry(0.02, 0.4, 0.05);
      sp.rotateX(i * Math.PI / 5); sp.translate(x + side * 0.165, 0.345, z); add(sp, 0x55595f);
    }
  }
  if (lo) {
    const sp = new THREE.BoxGeometry(1.86, 0.2, 0.03); sp.rotateX(-0.35); sp.translate(0, 1.08, -2.56); add(sp, 0x121212);
    return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
  }
  // aerofólio traseiro com placas laterais
  const spoiler = new THREE.BoxGeometry(1.86, 0.2, 0.03);
  spoiler.rotateX(-0.35); spoiler.translate(0, 1.08, -2.56); add(spoiler, 0x121212);
  for (const x of [-0.93, 0.93]) {
    const pl = new THREE.BoxGeometry(0.02, 0.26, 0.34); pl.translate(x, 1.06, -2.5); add(pl, 0x1a1a1a);
  }
  for (const x of [-0.5, 0.5]) {
    const st = new THREE.BoxGeometry(0.03, 0.14, 0.12); st.translate(x, 0.98, -2.52); add(st, 0x111111);
  }
  // splitter, difusor, saias
  const split = new THREE.BoxGeometry(1.5, 0.035, 0.38); split.translate(0, 0.13, 2.45); add(split, 0x101010);
  const diff = new THREE.BoxGeometry(1.7, 0.1, 0.4); diff.rotateX(0.35); diff.translate(0, 0.2, -2.45); add(diff, 0x101010);
  // retrovisores
  for (const x of [-0.86, 0.86]) {
    const m = new THREE.BoxGeometry(0.16, 0.08, 0.1); m.translate(x, 0.99, 0.9); add(m, 0x151515);
    const arm = new THREE.BoxGeometry(0.1, 0.02, 0.03); arm.translate(x * 0.94, 0.95, 0.9); add(arm, 0x151515);
  }
  // escapamentos laterais (Next Gen sai dos dois lados)
  for (const x of [-0.97, 0.97]) {
    const ex = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8); ex.rotateZ(Math.PI / 2); ex.translate(x, 0.24, 0.6); add(ex, 0x8a8a8a);
  }
  // antena e abas do teto
  const ant = new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4); ant.translate(0.3, 1.58, -0.6); add(ant, 0x111111);
  for (const x of [-0.18, 0.18]) {
    const fl = new THREE.BoxGeometry(0.3, 0.012, 0.22); fl.rotateY(x > 0 ? -0.5 : 0.5); fl.translate(x, 1.345, -0.45); add(fl, 0x222222);
  }
  // tomada de gasolina e engate do macaco
  const fuel = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8); fuel.rotateZ(Math.PI / 2); fuel.translate(0.99, 0.72, -1.95); add(fuel, 0x999999);
  return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}

function buildShared() {
  const hq = texSize >= 512;
  const bodyAll = mergeGeometries([bodyGeo(hq ? 48 : 34, hq ? 22 : 18, hq ? 12 : 8), cabinGeo(hq ? 24 : 16, hq ? 13 : 10)]);
  const bodyLo = mergeGeometries([bodyGeo(18, 12, 4), cabinGeo(8, 6)]);
  const parts = partsGeo(false);
  const partsLo = partsGeo(true);
  const partsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.2 });

  // sombra com formato do carro (retângulo arredondado difuso)
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  // camadas concêntricas = borda difusa (funciona em qualquer navegador)
  for (let i = 12; i >= 0; i--) {
    x.fillStyle = `rgba(0,0,0,${0.075})`;
    const m = 4 + i;
    const r = 10 + i;
    x.beginPath();
    if (x.roundRect) x.roundRect(m, m, 64 - 2 * m, 128 - 2 * m, r); else x.rect(m, m, 64 - 2 * m, 128 - 2 * m);
    x.fill();
  }
  const shTex = new THREE.CanvasTexture(c);
  const shadowGeo = new THREE.PlaneGeometry(2.8, 6.4); shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 });
  shared = { bodyAll, bodyLo, parts, partsLo, partsMat, shadowGeo, shadowMat };
}

/* ============================================================
   Pintura
   ============================================================ */
const bu = z => (z - Z0) / (Z1 - Z0);             // z -> u da carroceria
const gu = z => (z - GZ0) / (GZ1 - GZ0);          // z -> u da cabine

function livery(c) {
  const W = texSize, H = Math.round(texSize * 0.625);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const X = u => u * W;
  const BY = v => (1 - (BODY_V0 + (BODY_V1 - BODY_V0) * v)) * H;   // v da carroceria -> y do canvas
  const GY = v => (1 - (GH_V0 + (GH_V1 - GH_V0) * v)) * H;
  const k = W / 512;
  const c1 = c.color, c2 = c.color2;
  const c3 = c.color3 || shade(c1, -0.35);

  // ---------- carroceria ----------
  x.fillStyle = c1; x.fillRect(0, BY(1) - 2, W, BY(0) - BY(1) + 4);
  // leve degradê: mais escuro embaixo (dá volume)
  const bandTop = (v0, v1, flip) => {
    const g = x.createLinearGradient(0, BY(v0), 0, BY(v1));
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  };
  x.fillStyle = bandTop(0.1, 0.22); x.fillRect(0, BY(0.22), W, BY(0.1) - BY(0.22));
  x.fillStyle = bandTop(0.9, 0.78); x.fillRect(0, BY(0.9), W, BY(0.78) - BY(0.9));

  // desenho da pintura (varia por equipe)
  const design = c.design !== undefined ? c.design : (c.num * 7) % 5;
  x.save();
  const sideBand = (v0, v1, fn) => { x.save(); x.beginPath(); x.rect(0, BY(v1), W, BY(v0) - BY(v1)); x.clip(); fn(); x.restore(); };
  if (design === 0) {
    // faixas duplas de ponta a ponta sobre o capô/teto/tampa
    x.fillStyle = c2;
    x.fillRect(0, BY(0.535), W, BY(0.505) - BY(0.535));
    x.fillRect(0, BY(0.495), W, BY(0.465) - BY(0.495));
  } else if (design === 1) {
    // "swoosh" nas laterais
    for (const [v0, v1] of [[0.12, 0.38], [0.62, 0.88]]) sideBand(v0, v1, () => {
      x.fillStyle = c2;
      x.beginPath();
      x.moveTo(X(0.0), BY(v0 + 0.02)); x.bezierCurveTo(X(0.35), BY(v0 + 0.02), X(0.55), BY(v1 - 0.02), X(1), BY(v1 - 0.03));
      x.lineTo(X(1), BY(v1)); x.bezierCurveTo(X(0.5), BY(v1 + 0.01), X(0.3), BY(v0 + 0.1), X(0), BY(v0 + 0.1));
      x.fill();
    });
  } else if (design === 2) {
    // duas cores: metade traseira na cor secundária com corte diagonal
    x.fillStyle = c3;
    x.beginPath(); x.moveTo(0, BY(1)); x.lineTo(X(0.3), BY(1)); x.lineTo(X(0.42), BY(0)); x.lineTo(0, BY(0)); x.fill();
    x.fillStyle = c2;
    x.beginPath(); x.moveTo(X(0.3), BY(1)); x.lineTo(X(0.33), BY(1)); x.lineTo(X(0.45), BY(0)); x.lineTo(X(0.42), BY(0)); x.fill();
  } else if (design === 3) {
    // blocos em ângulo na frente
    x.fillStyle = c2;
    for (let i = 0; i < 3; i++) {
      x.beginPath(); const u0 = 0.7 + i * 0.07;
      x.moveTo(X(u0), BY(0)); x.lineTo(X(u0 + 0.04), BY(0)); x.lineTo(X(u0 + 0.1), BY(1)); x.lineTo(X(u0 + 0.06), BY(1)); x.fill();
    }
  } else {
    // "chamas" / dentes na parte de baixo
    for (const [v0, v1] of [[0.0, 0.3], [0.7, 1.0]]) sideBand(v0, v1, () => {
      x.fillStyle = c2;
      const low = v0 < 0.5;
      x.beginPath(); x.moveTo(0, BY(low ? v0 : v1));
      for (let u = 0; u <= 1.001; u += 0.05) {
        const tip = (Math.floor(u * 20) % 2) ? 0.05 : 0.13;
        x.lineTo(X(u), BY(low ? v0 + tip : v1 - tip));
      }
      x.lineTo(W, BY(low ? v0 : v1)); x.fill();
    });
  }
  x.restore();

  // linha fina de filete no alto das laterais
  x.fillStyle = c2;
  x.fillRect(0, BY(0.365), W, 2 * k); x.fillRect(0, BY(0.635), W, 2 * k);

  // faróis e lanternas adesivados (como nos stock cars)
  const lamp = (u0, u1, v0, v1, col, glow) => {
    const g = x.createLinearGradient(X(u0), 0, X(u1), 0);
    g.addColorStop(0, col); g.addColorStop(1, glow);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(X(u0), BY(v0)); x.lineTo(X(u1), BY(v0 + 0.02)); x.lineTo(X(u1), BY(v1)); x.lineTo(X(u0 + 0.01), BY(v1)); x.fill();
  };
  lamp(0.935, 0.985, 0.335, 0.42, '#d8d8c8', '#fffbe0');
  lamp(0.935, 0.985, 0.58, 0.665, '#d8d8c8', '#fffbe0');
  // grade da frente
  // parte de baixo da frente: grade e entradas de ar (a tampa usa a última coluna)
  x.fillStyle = '#161616';
  x.fillRect(X(0.975), BY(0.34), X(1) - X(0.975) + 2, BY(0.0) - BY(0.34));
  x.fillRect(X(0.975), BY(1), X(1) - X(0.975) + 2, BY(0.66) - BY(1));
  x.fillRect(X(0.985), BY(0.62), X(1) - X(0.985) + 2, BY(0.38) - BY(0.62));
  x.fillStyle = 'rgba(255,255,255,0.12)';
  for (let v = 0.05; v < 0.3; v += 0.04) x.fillRect(X(0.975), BY(v), X(1) - X(0.975), 1);
  // lanternas
  x.fillStyle = '#b3121b'; x.fillRect(0, BY(0.66), X(0.03), BY(0.34) - BY(0.66));
  x.fillStyle = '#ff4040'; x.fillRect(0, BY(0.43), X(0.018), BY(0.36) - BY(0.43)); x.fillRect(0, BY(0.64), X(0.018), BY(0.57) - BY(0.64));

  // --- texto em uma região (com rotação) ---
  const text = (str, cx, cy, maxW, size, color, stroke, rot, font) => {
    x.save();
    x.translate(cx, cy); x.rotate(rot || 0);
    x.font = font || `italic 900 ${size}px "Arial Black", Impact, Arial`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (stroke) { x.lineWidth = Math.max(2, size * 0.14); x.strokeStyle = stroke; x.lineJoin = 'round'; x.strokeText(str, 0, 0, maxW); }
    x.fillStyle = color; x.fillText(str, 0, 0, maxW);
    x.restore();
  };
  const numCol = light(c1) ? '#111' : '#fff';
  const numStroke = light(c1) ? '#fff' : '#000';
  const sponsor = c.sponsor;

  // lateral direita (v ≈ 0.12..0.38): texto normal; esquerda (0.62..0.88): girado 180°
  const side = (vc, rot) => {
    const y = BY(vc);
    const vh = BY(vc - 0.1) - BY(vc + 0.1);
    // número na porta dentro de um "círculo" (placa branca arredondada)
    const cx = X(0.505);
    x.save(); x.translate(cx, y); x.rotate(rot);
    x.fillStyle = c2 === c1 ? '#fff' : shade(c2, 0);
    x.globalAlpha = 0.95;
    x.beginPath(); x.ellipse(0, 0, X(0.09), vh * 0.5, 0, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
    x.restore();
    text(String(c.num), cx, y + (rot ? -1 : 1) * vh * 0.02, X(0.15), vh * 0.78, light(c2) ? '#111' : '#fff', light(c2) ? '#fff' : '#000', rot);
    // patrocinador no painel traseiro e marca no paralama dianteiro
    const sx = rot ? X(0.64) : X(0.355);
    text(sponsor.split(' ')[0], rot ? X(0.66) : X(0.35), y - (rot ? -1 : 1) * vh * 0.18, X(0.09), vh * 0.3, '#fff', '#000', rot);
    text(c.make.toUpperCase(), rot ? X(0.34) : X(0.66), y - (rot ? -1 : 1) * vh * 0.22, X(0.08), vh * 0.18, numCol, null, rot, `bold ${Math.round(vh * 0.18)}px Arial`);
    // adesivos de contingência (pequenos retângulos coloridos)
    const cols = ['#ffd21f', '#ffffff', '#1b3f9c', '#e32', '#111', '#2a2'];
    for (let i = 0; i < 6; i++) {
      const u = (rot ? 0.33 : 0.61) + (i % 3) * 0.022;
      const vv = vc + (rot ? 1 : -1) * (0.035 + Math.floor(i / 3) * 0.03);
      x.fillStyle = cols[i]; x.fillRect(X(u), BY(vv) - vh * 0.06, X(0.018), vh * 0.1);
    }
    // nome do piloto acima da porta (como no vidro, mas aqui na lataria)
    text((c.first ? c.first[0] + '. ' : '') + c.name.split(' ').pop().toUpperCase(), cx, y - (rot ? -1 : 1) * vh * 0.42, X(0.14), vh * 0.12, numCol, null, rot, `bold ${Math.round(vh * 0.12)}px Arial`);
  };
  side(0.25, 0);
  side(0.75, Math.PI);

  // capô: patrocinador grande atravessado
  const hy = BY(0.5), hx = X(0.84);
  text(sponsor, hx, hy, BY(0.4) - BY(0.6), X(0.07), '#fff', '#000', -Math.PI / 2);
  // pinos do capô e entradas NACA
  x.fillStyle = 'rgba(0,0,0,0.5)';
  for (const v of [0.42, 0.58]) { x.beginPath(); x.arc(X(0.935), BY(v), 2 * k, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.beginPath(); x.moveTo(X(0.73), BY(0.53)); x.lineTo(X(0.77), BY(0.535)); x.lineTo(X(0.77), BY(0.565)); x.fill();
  // tampa traseira: número pequeno
  text(String(c.num), X(0.1), BY(0.5), X(0.1), X(0.05), numCol, null, -Math.PI / 2);

  // ---------- cabine (vidros) ----------
  const gTop = GY(1), gBot = GY(0);
  const glass = x.createLinearGradient(0, gTop, 0, gBot);
  glass.addColorStop(0, '#223040'); glass.addColorStop(0.5, '#0e141b'); glass.addColorStop(1, '#223040');
  x.fillStyle = glass; x.fillRect(0, gTop - 2, W, gBot - gTop + 4);
  // reflexos no para-brisa
  x.fillStyle = 'rgba(180,210,255,0.18)';
  x.beginPath(); x.moveTo(X(0.78), GY(0.3)); x.lineTo(X(0.86), GY(0.3)); x.lineTo(X(0.95), GY(0.7)); x.lineTo(X(0.87), GY(0.7)); x.fill();
  // teto na cor do carro
  const r0 = gu(-0.72), r1 = gu(0.38);
  x.fillStyle = c1;
  x.fillRect(X(r0), GY(0.73), X(r1) - X(r0), GY(0.27) - GY(0.73));
  // colunas (trilhos do teto que viram colunas A e C) e coluna B
  x.fillRect(0, GY(0.29), W, GY(0.24) - GY(0.29));
  x.fillRect(0, GY(0.76), W, GY(0.71) - GY(0.76));
  x.fillRect(0, GY(0.05), W, GY(0) - GY(0.05));
  x.fillRect(0, GY(1), W, GY(0.95) - GY(1));
  for (const vv of [[0, 0.27], [0.73, 1]]) x.fillRect(X(gu(-0.3)), GY(vv[1]), X(0.03), GY(vv[0]) - GY(vv[1]));
  // número do teto (lido de quem olha pelo lado direito)
  x.fillStyle = light(c1) ? '#111' : '#fff';
  x.fillRect(X(r0 + 0.03), GY(0.68), X(r1 - r0 - 0.06), GY(0.32) - GY(0.68));
  text(String(c.num), X((r0 + r1) / 2), GY(0.5), X(r1 - r0 - 0.1), (GY(0.32) - GY(0.68)) * 0.95, light(c1) ? '#fff' : '#111', null, 0);
  // rede da janela do piloto (lado esquerdo = v alto)
  x.strokeStyle = 'rgba(0,0,0,0.85)'; x.lineWidth = Math.max(1, 1.5 * k);
  const n0 = gu(-0.25), n1 = gu(0.45);
  for (let u = n0; u <= n1; u += 0.02) { x.beginPath(); x.moveTo(X(u), GY(0.72)); x.lineTo(X(u), GY(0.95)); x.stroke(); }
  for (let v = 0.74; v <= 0.95; v += 0.05) { x.beginPath(); x.moveTo(X(n0), GY(v)); x.lineTo(X(n1), GY(v)); x.stroke(); }
  // nome no vidro traseiro lateral
  text(c.name.split(' ').pop().toUpperCase(), X(gu(-1.0)), GY(0.13), X(0.14), (GY(0.05) - GY(0.22)) * 0.5, '#fff', null, 0, `bold ${Math.round((GY(0.05) - GY(0.22)) * 0.5)}px Arial`);

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function light(hex) {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.6;
}
function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f < 0) c.multiplyScalar(1 + f); else c.lerp(new THREE.Color(1, 1, 1), f);
  return '#' + c.getHexString();
}

export function makeCarMesh(c, quality) {
  if (!shared) buildShared();
  const root = new THREE.Group();
  const map = livery(c);
  const mat = quality === 0
    ? new THREE.MeshLambertMaterial({ map })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.25, envMapIntensity: 1.1 });
  // nível de detalhe: de perto o carro completo, de longe uma versão leve
  const hi = new THREE.Group();
  hi.add(new THREE.Mesh(shared.bodyAll, mat), new THREE.Mesh(shared.parts, shared.partsMat));
  const lo = new THREE.Group();
  lo.add(new THREE.Mesh(shared.bodyLo, mat), new THREE.Mesh(shared.partsLo, shared.partsMat));
  const lod = new THREE.LOD();
  lod.addLevel(hi, 0);
  lod.addLevel(lo, 55);
  const sh = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
  sh.position.y = 0.03;
  root.add(sh, lod);
  root.userData.mat = mat;
  return root;
}

/* carro-madrinha (pace car) com giroflex */
export function makePaceCar(quality) {
  const c = { num: 'PACE', name: 'Pace Car', first: '', color: '#f4f4f4', color2: '#ffc400', color3: '#e0e0e0', sponsor: 'OVAL 500', make: 'Chevrolet', design: 0 };
  const m = makeCarMesh(c, quality);
  const bar = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.22), new THREE.MeshBasicMaterial({ color: 0xffa500 }));
  const l2 = l1.clone(); l2.material = new THREE.MeshBasicMaterial({ color: 0xffa500 });
  l1.position.x = -0.3; l2.position.x = 0.3; l1.position.y = l2.position.y = 0.08;
  bar.add(base, l1, l2);
  bar.position.set(0, 1.39, -0.15);
  m.add(bar);
  m.userData.lights = [l1, l2];
  return m;
}

/* integrantes da equipe de box: bonequinhos com capacete, braços e pernas */
let crewGeo = null;
export function makeCrew(color) {
  if (!crewGeo) {
    const parts = [];
    const add = (g, hex) => { if (g.attributes.uv) g.deleteAttribute('uv'); parts.push(tint(g.index ? g.toNonIndexed() : g, hex)); };
    const torso = new THREE.CylinderGeometry(0.2, 0.16, 0.62, 8); torso.translate(0, 1.12, 0); add(torso, 0xffffff);
    for (const x of [-0.1, 0.1]) {
      const leg = new THREE.CylinderGeometry(0.075, 0.065, 0.8, 6); leg.translate(x, 0.42, 0); add(leg, 0xffffff);
      const shoe = new THREE.BoxGeometry(0.12, 0.07, 0.24); shoe.translate(x, 0.035, 0.05); add(shoe, 0x222222);
    }
    for (const x of [-0.26, 0.26]) {
      const arm = new THREE.CylinderGeometry(0.055, 0.05, 0.6, 6); arm.rotateZ(x > 0 ? 0.35 : -0.35); arm.translate(x, 1.1, 0.05); add(arm, 0xffffff);
    }
    const helmet = new THREE.SphereGeometry(0.15, 10, 8); helmet.scale(1, 1.1, 1.05); helmet.translate(0, 1.6, 0); add(helmet, 0x303030);
    const visor = new THREE.BoxGeometry(0.2, 0.07, 0.05); visor.translate(0, 1.6, 0.14); add(visor, 0x111111);
    crewGeo = mergeGeometries(parts);
    crewGeo.computeVertexNormals();
  }
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, vertexColors: true });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(crewGeo, mat));
    g.add(p);
  }
  g.userData.mat = mat;
  return g;
}
