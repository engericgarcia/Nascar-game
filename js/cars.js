/* ============================================================
   cars.js - modelo 3D do stock car e pintura de cada equipe.
   Cada carro usa poucas malhas (lataria, vidros, adesivos,
   peças pretas e sombra) para rodar liso no celular.
   Frente do carro = +z, esquerda = +x, cima = +y.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export const CAR_LEN = 5.2;
export const CAR_WID = 1.95;

let shared = null;

function profileGeo(pts, width) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);          // perfil em (z,y), largura em x
  g.translate(width / 2, 0, 0);
  g.clearGroups();
  return g;
}

function buildShared() {
  // lataria: perfil lateral do Next Gen (bico baixo, capô longo, traseira alta)
  const body = profileGeo([
    [-2.6, 0.2], [2.5, 0.16], [2.66, 0.36], [2.6, 0.6], [2.35, 0.78],
    [1.15, 0.9], [-1.55, 0.93], [-2.55, 0.98], [-2.62, 0.7]
  ], CAR_WID);
  // cabine (mais estreita)
  const cabin = profileGeo([
    [-1.6, 0.9], [-0.75, 1.3], [0.35, 1.33], [1.2, 0.9]
  ], 1.56);
  // peças pretas: rodas, aerofólio, splitter, para-choques
  const parts = [];
  const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12);
  wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[0.86, 1.55], [-0.86, 1.55], [0.86, -1.45], [-0.86, -1.45]]) {
    const w = wheel.clone(); w.translate(x, 0.34, z); parts.push(w);
  }
  const spoiler = new THREE.BoxGeometry(1.9, 0.26, 0.05);
  spoiler.rotateX(-0.25);
  spoiler.translate(0, 1.12, -2.55);
  parts.push(spoiler);
  for (const x of [-0.8, 0.8]) {
    const st = new THREE.BoxGeometry(0.05, 0.2, 0.3); st.translate(x, 1.02, -2.5); parts.push(st);
  }
  const split = new THREE.BoxGeometry(1.9, 0.06, 0.4); split.translate(0, 0.14, 2.45); parts.push(split);
  const grille = new THREE.BoxGeometry(1.4, 0.18, 0.05); grille.translate(0, 0.42, 2.66); parts.push(grille);
  const partsGeo = mergeGeometries(parts);

  // adesivos: laterais, teto e capô, todos mapeados num atlas 512x256
  // atlas: [0..512]x[0..128] = lateral; [0..256]x[128..256] = teto; [256..512]x[128..256] = capô
  const decals = [];
  const quad = (w, h, u0, v0, u1, v1) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    // PlaneGeometry: (0,1) (1,1) (0,0) (1,0)
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    return g;
  };
  // lado esquerdo (x+) e direito (x-)
  const sideL = quad(4.7, 0.6, 0, 0.5, 1, 1);
  sideL.rotateY(Math.PI / 2); sideL.translate(CAR_WID / 2 + 0.006, 0.57, -0.1);
  const sideR = quad(4.7, 0.6, 0, 0.5, 1, 1);
  sideR.rotateY(-Math.PI / 2); sideR.translate(-CAR_WID / 2 - 0.006, 0.57, -0.1);
  // teto (placa com número)
  const roof = quad(1.5, 1.08, 0, 0, 0.5, 0.5);
  roof.rotateX(-Math.PI / 2); roof.rotateY(Math.PI); roof.translate(0, 1.335, -0.2);
  // capô: inclinado de acordo com o perfil (0.9 em z=1.15, 0.78 em z=2.35)
  const hood = quad(1.7, 1.15, 0.5, 0, 1, 0.5);
  hood.rotateX(-Math.PI / 2); hood.rotateY(Math.PI);
  hood.rotateX(-0.1);
  hood.translate(0, 0.855, 1.75);
  // lateral: número também aparece nas portas da cabine? não - basta a lateral
  decals.push(sideL, sideR, roof, hood);
  const decalGeo = mergeGeometries(decals);

  // vidros com moldura escura
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b232c });
  const partsMat = new THREE.MeshLambertMaterial({ color: 0x151515 });

  // sombra
  const shTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const shadowGeo = new THREE.PlaneGeometry(2.6, 6.2);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });

  shared = { body, cabin, partsGeo, decalGeo, glassMat, partsMat, shadowGeo, shadowMat };
}

/* pinta o atlas do carro */
function livery(c) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const x = cv.getContext('2d');
  // --- lateral (0..128 de altura) ---
  x.fillStyle = c.color; x.fillRect(0, 0, 512, 128);
  // faixa diagonal na cor secundária
  x.fillStyle = c.color2;
  x.beginPath(); x.moveTo(300, 128); x.lineTo(360, 0); x.lineTo(400, 0); x.lineTo(340, 128); x.fill();
  x.fillRect(0, 108, 512, 8);
  // número grande na porta (meio da lateral)
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'italic 900 104px Arial Black, Impact, Arial';
  x.lineWidth = 8; x.strokeStyle = '#000';
  x.strokeText(c.num, 238, 62);
  x.fillStyle = c.color2 === '#111111' ? '#ffffff' : c.color2;
  x.fillText(c.num, 238, 62);
  // patrocinador no quarto traseiro e dianteiro
  x.font = 'bold 26px Arial Black, Arial';
  x.fillStyle = '#fff'; x.fillRect(12, 34, 110, 40);
  x.fillStyle = '#111'; x.fillText(c.sponsor.split(' ')[0], 67, 55, 104);
  x.fillStyle = c.color2; x.font = 'bold 20px Arial';
  x.fillText(c.make.toUpperCase(), 450, 40);
  // pequenos adesivos de contingência
  const small = ['#ffcc00', '#fff', '#1b3f9c', '#e00'];
  for (let i = 0; i < 4; i++) { x.fillStyle = small[i]; x.fillRect(410 + i * 22, 80, 18, 12); }
  // --- teto (0..256 x 128..256) ---
  x.fillStyle = c.color; x.fillRect(0, 128, 256, 128);
  x.fillStyle = '#fff'; x.fillRect(40, 140, 176, 104);
  x.save();
  x.translate(128, 192); x.rotate(Math.PI / 2);
  x.fillStyle = '#111'; x.font = 'italic 900 96px Arial Black, Impact, Arial';
  x.fillText(c.num, 0, 4);
  x.restore();
  // --- capô (256..512 x 128..256) ---
  x.fillStyle = c.color; x.fillRect(256, 128, 256, 128);
  x.fillStyle = c.color2;
  x.fillRect(256 + 118, 128, 20, 128);
  x.save();
  x.translate(384, 192); x.rotate(-Math.PI / 2);
  x.font = 'bold 40px Arial Black, Arial';
  x.lineWidth = 6; x.strokeStyle = '#000';
  x.strokeText(c.sponsor, 0, 0, 120);
  x.fillStyle = '#fff'; x.fillText(c.sponsor, 0, 0, 120);
  x.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeCarMesh(c) {
  if (!shared) buildShared();
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: c.color });
  const body = new THREE.Mesh(shared.body, bodyMat);
  const cabin = new THREE.Mesh(shared.cabin, shared.glassMat);
  const decal = new THREE.Mesh(shared.decalGeo, new THREE.MeshLambertMaterial({ map: livery(c), polygonOffset: true, polygonOffsetFactor: -2 }));
  const parts = new THREE.Mesh(shared.partsGeo, shared.partsMat);
  const sh = new THREE.Mesh(shared.shadowGeo, shared.shadowMat);
  sh.position.y = 0.03;
  root.add(sh, body, cabin, decal, parts);
  root.userData.bodyMat = bodyMat;
  return root;
}

/* carro-madrinha (pace car) */
export function makePaceCar() {
  const c = { num: '', color: '#f2f2f2', color2: '#ffd400', sponsor: 'PACE CAR', make: 'Chevrolet' };
  const m = makeCarMesh(c);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0xffa500 }));
  bar.position.set(0, 1.42, -0.2);
  m.add(bar);
  m.userData.lightbar = bar;
  return m;
}

/* integrantes da equipe de box (5 por carro, como na regra) */
export function makeCrew(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const head = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const bodyGeo = new THREE.BoxGeometry(0.45, 1.1, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 6, 5);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Group();
    const b = new THREE.Mesh(bodyGeo, mat); b.position.y = 0.75;
    const h = new THREE.Mesh(headGeo, head); h.position.y = 1.45;
    p.add(b, h);
    g.add(p);
  }
  return g;
}
