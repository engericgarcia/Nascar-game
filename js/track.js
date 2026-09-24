/* ============================================================
   track.js - geometria do oval (linha central, inclinação,
   box) e construção da pista 3D: asfalto, muro, alambrado,
   arquibancadas, pit road, linha de chegada e cenário.

   Coordenadas da pista: s = distância ao longo da linha
   central (0 = linha de chegada), d = deslocamento lateral
   (positivo = para fora/muro, negativo = para o infield).
   Os carros correm no sentido anti-horário (curvas à esquerda).
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { MILE } from './data.js';

const DEG = Math.PI / 180;

export class Track {
  constructor(def) {
    this.def = def;
    this.W = def.width;                       // largura do asfalto
    this.apron = def.width > 15 ? 7 : 5;      // faixa de concreto interna
    this.buildCenterline();
    this.buildPitRoad();
  }

  /* ---------- linha central ---------- */
  buildCenterline() {
    const d = this.def;
    const L = d.miles * MILE;
    // retas proporcionais ao tipo de pista (medidas das originais)
    let S;
    if (d.id === 'superspeedway') S = 915;
    else if (d.id === 'intermediate') S = 450;
    else if (d.paperclip) S = 244;
    else S = 198;
    const R = (L - 2 * S) / (2 * Math.PI);
    const bump = d.triOval ? (d.id === 'superspeedway' ? 70 : 30) : 0;

    // polígono cru a cada ~1 m, começando no meio da reta dos boxes
    const raw = [];
    const step = 1;
    // reta da frente (z = +R), x de 0 até S/2, curvas, reta oposta, volta
    const push = (x, z) => raw.push([x, z]);
    const front = (x) => {
      const t = (x + S / 2) / S;
      return R + bump * (1 - Math.abs(2 * t - 1));
    };
    for (let x = 0; x < S / 2; x += step) push(x, front(x));
    const arcN = Math.ceil(Math.PI * R / step);
    for (let i = 0; i < arcN; i++) {
      const a = Math.PI / 2 - Math.PI * i / arcN;
      push(S / 2 + R * Math.cos(a), R * Math.sin(a));
    }
    for (let x = S / 2; x > -S / 2; x -= step) push(x, -R);
    for (let i = 0; i < arcN; i++) {
      const a = -Math.PI / 2 - Math.PI * i / arcN;
      push(-S / 2 + R * Math.cos(a), R * Math.sin(a));
    }
    for (let x = -S / 2; x < 0; x += step) push(x, front(x));

    // suaviza: cria as espirais de transição e arredonda o bico do tri-oval
    const win = Math.max(8, Math.round(R * 0.22));
    let pts = raw;
    for (let pass = 0; pass < 3; pass++) pts = smoothClosed(pts, win);

    // reamostra com espaçamento uniforme
    const n0 = pts.length;
    const cum = [0];
    for (let i = 1; i <= n0; i++) {
      const a = pts[i - 1], b = pts[i % n0];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const len0 = cum[n0];
    const scale = L / len0;            // acerta o comprimento oficial
    const N = Math.round(L / 2);
    const ds = L / N;
    const px = new Float32Array(N), pz = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i * ds / scale;
      while (cum[j + 1] < target) j++;
      const t = (target - cum[j]) / (cum[j + 1] - cum[j]);
      const a = pts[j], b = pts[(j + 1) % n0];
      px[i] = (a[0] + (b[0] - a[0]) * t) * scale;
      pz[i] = (a[1] + (b[1] - a[1]) * t) * scale;
    }

    // tangente e normal (normal aponta para fora: direita do carro)
    const fx = new Float32Array(N), fz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = px[b] - px[a], dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz);
      fx[i] = dx / l; fz[i] = dz / l;
    }
    // sentido: curvas precisam ser à esquerda (curvatura positiva)
    let ksum = 0;
    const curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const b = (i + 1) % N;
      // esquerda = (fz, -fx)
      const k = ((fx[b] - fx[i]) * fz[i] + (fz[b] - fz[i]) * -fx[i]) / ds;
      curv[i] = k; ksum += k;
    }
    if (ksum < 0) {                  // espelha em z para inverter o sentido
      for (let i = 0; i < N; i++) { pz[i] = -pz[i]; fz[i] = -fz[i]; curv[i] = -curv[i]; }
    }
    // curvatura suavizada
    const k2 = smooth1(curv, 6);

    // inclinação: cresce com a curvatura
    const kTurn = 1 / R;
    const bank = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const f = Math.min(1, Math.abs(k2[i]) / (kTurn * 0.85));
      const e = f * f * (3 - 2 * f);
      let b = d.bankStraight + (d.bankTurn - d.bankStraight) * e;
      // bico do tri-oval tem inclinação própria
      if (d.triOval && Math.abs(i * ds - 0) < 250 || (d.triOval && L - i * ds < 250)) {
        b = Math.max(b, d.bankTri * Math.min(1, Math.abs(k2[i]) / (kTurn * 0.2)));
      }
      bank[i] = b * DEG;
    }
    const bank2 = smooth1(bank, Math.round(40 / ds));

    this.L = L; this.N = N; this.ds = ds; this.R = R; this.S = S;
    this.px = px; this.pz = pz; this.fx = fx; this.fz = fz;
    this.k = k2; this.bank = bank2;
  }

  /* índice fracionário para s qualquer (com volta) */
  wrap(s) { const L = this.L; s %= L; return s < 0 ? s + L : s; }
  /* diferença assinada b - a no menor sentido */
  delta(a, b) {
    let x = b - a; const L = this.L;
    if (x > L / 2) x -= L; else if (x < -L / 2) x += L;
    return x;
  }

  /* amostra interpolada da linha central */
  sample(s, o) {
    s = this.wrap(s);
    const f = s / this.ds;
    const i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    o.x = this.px[i] + (this.px[j] - this.px[i]) * t;
    o.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    let fx = this.fx[i] + (this.fx[j] - this.fx[i]) * t;
    let fz = this.fz[i] + (this.fz[j] - this.fz[i]) * t;
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    o.fx = fx; o.fz = fz;
    o.nx = -fz; o.nz = fx;           // direita (para fora)
    o.k = this.k[i] + (this.k[j] - this.k[i]) * t;
    o.bank = this.bank[i] + (this.bank[j] - this.bank[i]) * t;
    return o;
  }

  curvAt(s) {
    const f = this.wrap(s) / this.ds;
    const i = Math.floor(f) % this.N;
    return this.k[i];
  }
  bankAt(s) {
    const f = this.wrap(s) / this.ds;
    const i = Math.floor(f) % this.N;
    return this.bank[i];
  }

  /* altura da superfície na posição (s,d) */
  heightAt(s, d, bankV) {
    const b = bankV === undefined ? this.bankAt(s) : bankV;
    const rel = d + this.W / 2;
    if (rel >= 0) return Math.min(rel, this.W + 0.5) * Math.tan(b);
    // concreto interno cai até a grama
    return Math.max(rel * 0.05, -0.35);
  }

  /* posição 3D */
  toWorld(s, d, out) {
    const o = this.sample(s, _tmp);
    out.x = o.x + o.nx * d;
    out.z = o.z + o.nz * d;
    out.y = this.heightAt(s, d, o.bank);
    return out;
  }

  /* ---------- pit road ---------- */
  buildPitRoad() {
    // reta da frente = trecho com pouca curvatura em torno de s = 0
    const kT = 1 / this.R;
    let a = 0, b = 0;
    while (Math.abs(this.curvAt(-a)) < kT * 0.35 && a < this.L / 3) a += 2;
    while (Math.abs(this.curvAt(b)) < kT * 0.35 && b < this.L / 3) b += 2;
    const inner = -this.W / 2 - this.apron;
    // pista curta: o box entra pelas curvas (como em Bristol) para caber 40 vagas
    const need = 150 + 40 * 7 + 20;
    if (a + b < need) { const ex = (need - a - b) / 2; a += ex; b += ex; }
    this.pitStart = this.wrap(-a + 10);        // começo do asfalto do box
    this.pitLen = a + b - 20;
    this.pitEnd = this.wrap(this.pitStart + this.pitLen);
    this.pitGrass = 5;                          // canteiro entre pista e box
    this.pitOuter = inner - this.pitGrass;      // borda da pit road do lado da pista
    this.pitWidth = 11;
    this.pitInner = this.pitOuter - this.pitWidth;
    this.pitFast = this.pitOuter - 3;           // faixa de rolagem
    this.pitStallD = this.pitInner + 3.2;       // faixa das vagas
    this.pitSpeed = this.L < 1200 ? 17.9 : 24.6; // 40 mph / 55 mph
  }

  /* s relativo ao início da pit road (0..pitLen dentro dela) */
  pitRel(s) { return this.wrap(s - this.pitStart); }

  /* vagas: a do pole fica mais perto da saída */
  stallS(i, n) {
    const usable = this.pitLen - 150;
    const sp = Math.max(7, Math.min(16, usable / n));
    return this.wrap(this.pitEnd - 70 - i * sp);
  }

  /* ---------- perfil de velocidade (usado pela IA) ---------- */
  maxLatAccel(bank, v, grip) {
    const g = 9.81;
    const mu = 1.0 * grip * (1 + v * v / 60000);   // pneu + pressão aerodinâmica
    const tb = Math.tan(bank);
    const den = Math.max(0.15, 1 - mu * tb);
    return g * (mu + tb) / den;
  }

  speedProfile(d, grip, brake) {
    const N = this.N, v = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.abs(this.k[i]) / (1 + d * Math.abs(this.k[i]));
      let lim = 120;
      if (k > 1e-5) {
        // resolve v² k = aMax(v) por iteração
        let vv = 60;
        for (let it = 0; it < 6; it++) vv = Math.sqrt(this.maxLatAccel(this.bank[i], vv, grip) / k);
        lim = Math.min(120, vv);
      }
      v[i] = lim;
    }
    // passagem de trás para frente: frenagem
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * this.ds));
      }
    }
    return v;
  }

  /* ============================================================
     Construção 3D
     ============================================================ */
  build(scene, quality) {
    const g = new THREE.Group();
    const W = this.W, L = this.L;
    const inner = -W / 2, outer = W / 2;
    const step = Math.max(2, L / 1400);

    const asphaltTex = makeAsphalt();
    asphaltTex.repeat.set(1, 1);
    const matAsphalt = new THREE.MeshLambertMaterial({ map: asphaltTex });
    const matApron = new THREE.MeshLambertMaterial({ map: makeConcrete(), color: 0xbdbdb8 });
    const matPit = new THREE.MeshLambertMaterial({ map: asphaltTex, color: 0x9a9a9a });
    const matGrass = new THREE.MeshLambertMaterial({ color: this.def.grass });
    const matWhite = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, polygonOffset: true, polygonOffsetFactor: -2 });
    const matYellow = new THREE.MeshBasicMaterial({ color: 0xf2c91a, polygonOffset: true, polygonOffsetFactor: -2 });
    const matGroove = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });

    // asfalto (inclinado)
    g.add(this.sweep(0, L, step, s => [
      [inner, this.heightAt(s, inner), 0], [outer, this.heightAt(s, outer), W / 8]
    ], matAsphalt, 8));
    // faixa de borracha (onde os carros andam)
    g.add(this.sweep(0, L, step, s => {
      const c = inner + 3 + Math.abs(this.curvAt(s)) * this.R * 1.2;
      return [[c - 1.8, this.heightAt(s, c - 1.8) + 0.01, 0], [c + 1.8, this.heightAt(s, c + 1.8) + 0.01, 1]];
    }, matGroove, 10));
    // concreto interno (apron)
    g.add(this.sweep(0, L, step, s => [
      [inner - this.apron, -0.35, 0], [inner, 0, 1]
    ], matApron, 6));
    // linhas: branca na borda interna e amarela no apron
    g.add(this.sweep(0, L, step, s => [[inner + 0.05, this.heightAt(s, inner + 0.05) + 0.02, 0], [inner + 0.35, this.heightAt(s, inner + 0.35) + 0.02, 1]], matWhite, 10));
    g.add(this.sweep(0, L, step, s => {
      const a = inner - 1.4, b = inner - 1.05;
      return [[a, this.heightAt(s, a) + 0.02, 0], [b, this.heightAt(s, b) + 0.02, 1]];
    }, matYellow, 10));
    // faixas tracejadas separando as linhas (como na TV)
    const dash = [];
    for (let s = 0; s < L; s += 18) {
      for (const fr of [1 / 3, 2 / 3]) {
        const dd = inner + W * fr;
        dash.push(this.sweepGeo(s, s + 7, 3.5, ss => [[dd - 0.12, this.heightAt(ss, dd - 0.12) + 0.02, 0], [dd + 0.12, this.heightAt(ss, dd + 0.12) + 0.02, 1]], 10));
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(dash), new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 })));

    // muro externo (SAFER) + faixa azul
    const wallTex = makeWallTex();
    const matWall = new THREE.MeshLambertMaterial({ map: wallTex });
    const wd = outer + 0.25;
    g.add(this.sweep(0, L, step, s => {
      const y = this.heightAt(s, outer);
      return [[wd, y - 0.2, 0], [wd, y + 1.25, 1]];
    }, matWall, 12, true));
    // topo do muro
    g.add(this.sweep(0, L, step, s => {
      const y = this.heightAt(s, outer) + 1.25;
      return [[wd, y, 0], [wd + 0.8, y, 1]];
    }, new THREE.MeshLambertMaterial({ color: 0xdcdcdc }), 12));

    // alambrado
    const fenceTex = makeFenceTex();
    const matFence = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false });
    g.add(this.sweep(0, L, step, s => {
      const y = this.heightAt(s, outer) + 1.25;
      return [[wd + 0.8, y, 0], [wd + 1.6, y + 6.5, 1]];
    }, matFence, 6, true, 6.5));
    // postes do alambrado
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 7, 5);
    const posts = [];
    for (let s = 0; s < L; s += 10) {
      const p = this.toWorld(s, wd + 1.2, new THREE.Vector3());
      p.y = this.heightAt(s, outer) + 1.25 + 3.3;
      posts.push(p);
    }
    const postMesh = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: 0x777777 }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); postMesh.setMatrixAt(i, m4); });
    g.add(postMesh);

    // chão: grama em tudo
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matGrass);
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < this.N; i++) {
      minx = Math.min(minx, this.px[i]); maxx = Math.max(maxx, this.px[i]);
      minz = Math.min(minz, this.pz[i]); maxz = Math.max(maxz, this.pz[i]);
    }
    const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
    this.center = new THREE.Vector3(cx, 0, cz);
    this.radius = Math.max(maxx - minx, maxz - minz) / 2;
    ground.scale.set(maxx - minx + 2400, maxz - minz + 2400, 1);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.4, cz);
    g.add(ground);
    // estacionamento fora da pista (cinza)
    const lot = new THREE.Mesh(new THREE.RingGeometry(this.radius + 90, this.radius + 260, 48), new THREE.MeshLambertMaterial({ color: 0x7c7c78 }));
    lot.rotation.x = -Math.PI / 2; lot.position.set(cx, -0.38, cz);
    g.add(lot);

    // pit road
    this.buildPitMeshes(g, step, matPit, matGrass, matWhite, matYellow);

    // linha de chegada xadrez + pórtico da bandeira
    const chk = makeChecker();
    const matChk = new THREE.MeshBasicMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -3 });
    g.add(this.sweep(-1, 1, 1, s => [[inner - this.apron, this.heightAt(s, inner - this.apron) + 0.03, 0], [outer, this.heightAt(s, outer) + 0.03, 12]], matChk, 2));
    this.buildFlagStand(g);

    // arquibancadas
    this.buildStands(g, quality);

    // torres de iluminação e prédio da torre de controle
    this.buildInfield(g);

    // montanhas ao fundo
    g.add(makeHills(this.center, this.radius + 1600));

    scene.add(g);
    this.group = g;
  }

  /* gera geometria varrendo um perfil transversal ao longo de s */
  sweepGeo(s0, s1, step, profile, vLen, vertical, vScaleV) {
    const pos = [], uv = [], idx = [];
    const o = {};
    let row = 0, cols = 0;
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    for (let r = 0; r <= n; r++) {
      const s = s0 + (s1 - s0) * r / n;
      this.sample(s, o);
      const prof = profile(s);
      cols = prof.length;
      for (const [d, y, u] of prof) {
        pos.push(o.x + o.nx * d, y, o.z + o.nz * d);
        uv.push(vScaleV ? u : u, s / (vLen || 10));
      }
      row++;
    }
    for (let r = 0; r < row - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, cc = a + cols, dd = cc + 1;
        idx.push(a, cc, b, b, cc, dd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // superfícies deitadas precisam olhar para cima (o sentido da pista pode inverter o giro)
    if (!vertical && geo.attributes.normal.getY(0) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    return geo;
  }
  sweep(s0, s1, step, profile, mat, vLen, vertical, vScaleV) {
    const m = new THREE.Mesh(this.sweepGeo(s0, s1, step, profile, vLen, vertical, vScaleV), mat);
    if (vertical) m.material.side = THREE.DoubleSide;
    return m;
  }

  buildPitMeshes(g, step, matPit, matGrass, matWhite, matYellow) {
    const inner = -this.W / 2 - this.apron;
    const s0 = this.pitStart - 60, len = this.pitLen + 120;
    const y = -0.34;
    // asfalto da pit road (inclui as rampas de entrada/saída)
    g.add(this.sweep(s0, s0 + len, 2, s => [[this.pitInner - 0.5, y, 0], [inner, y, 2]], matPit, 8));
    // canteiro de grama entre a pista e o box, afinando nas pontas
    g.add(this.sweep(this.pitStart + 40, this.pitStart + this.pitLen - 40, 2, s => {
      const r = this.pitRel(s);
      const t = Math.min(1, Math.min(r - 40, this.pitLen - 40 - r) / 90);
      const a = inner - 0.6, b = inner - 0.6 - this.pitGrass * t;
      return [[b, y + 0.03, 0], [a, y + 0.03, 1]];
    }, new THREE.MeshLambertMaterial({ color: this.def.grass, polygonOffset: true, polygonOffsetFactor: -2 }), 6));
    // linha de velocidade do box (branca) e faixa das vagas
    g.add(this.sweep(this.pitStart, this.pitStart + this.pitLen, 2, s => [[this.pitOuter - 0.2, y + 0.04, 0], [this.pitOuter, y + 0.04, 1]], matWhite, 10));
    g.add(this.sweep(this.pitStart, this.pitStart + this.pitLen, 2, s => [[this.pitStallD + 2.2, y + 0.04, 0], [this.pitStallD + 2.4, y + 0.04, 1]], matYellow, 10));
    // muro do box (lado de dentro)
    const pw = this.pitInner - 0.5;
    const matPW = new THREE.MeshLambertMaterial({ map: makeWallTex(true) });
    g.add(this.sweep(this.pitStart + 20, this.pitStart + this.pitLen - 20, 2, s => [[pw, y, 0], [pw, y + 1.0, 1]], matPW, 12, true));
    // área das equipes atrás do muro
    g.add(this.sweep(this.pitStart + 20, this.pitStart + this.pitLen - 20, 2, s => [[pw - 9, y + 0.02, 0], [pw, y + 0.02, 1]], new THREE.MeshLambertMaterial({ color: 0x8d8d88 }), 8));
    // marcas de cada vaga (feitas quando o grid é conhecido)
    this.pitGroup = g;
  }

  /* marcas das vagas + tendas das equipes */
  buildStalls(field) {
    const g = new THREE.Group();
    const y = -0.3;
    const geos = [];
    const n = field.length;
    const usable = this.pitLen - 150;
    const sp = Math.max(7, Math.min(16, usable / n));
    for (let i = 0; i <= n; i++) {
      const s = this.stallS(i, n) + sp / 2;
      geos.push(this.sweepGeo(s - 0.12, s + 0.12, 0.24, ss => [[this.pitInner, y, 0], [this.pitStallD + 2.4, y, 1]], 10));
    }
    g.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4 })));
    // placa com o número de cada carro na vaga (em cima do muro)
    field.forEach((c, i) => {
      const s = this.stallS(i, n);
      const p = this.toWorld(s, this.pitInner - 1.8, new THREE.Vector3());
      const tex = numberSign(c.num, c.color, c.color2);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
      sign.position.set(p.x, -0.3 + 2.3, p.z);
      const o = this.sample(s, {});
      sign.lookAt(p.x + o.nx, -0.3 + 2.3, p.z + o.nz);
      g.add(sign);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 4), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      pole.position.set(p.x, 0.7, p.z);
      g.add(pole);
    });
    this.group.add(g);
    this.stallGroup = g;
  }

  buildFlagStand(g) {
    const inner = -this.W / 2 - this.apron;
    const o = this.sample(0, {});
    const mat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    const hOut = this.heightAt(0, this.W / 2);
    const a = new THREE.Vector3(o.x + o.nx * (this.W / 2 + 1.5), 0, o.z + o.nz * (this.W / 2 + 1.5));
    const b = new THREE.Vector3(o.x + o.nx * (inner - 1), 0, o.z + o.nz * (inner - 1));
    const H = 9 + hOut;
    const mk = (p, y0) => {
      const h = H - y0;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), mat);
      pole.position.set(p.x, y0 + h / 2, p.z);
      g.add(pole);
    };
    mk(a, hOut); mk(b, -0.35);
    const span = a.distanceTo(b);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 1.2), mat);
    beam.position.set((a.x + b.x) / 2, H, (a.z + b.z) / 2);
    beam.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    g.add(beam);
    // painel com as luzes das bandeiras
    const panel = new THREE.Mesh(new THREE.BoxGeometry(span * 0.6, 1.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    panel.position.copy(beam.position); panel.position.y -= 1.3;
    panel.rotation.y = beam.rotation.y;
    g.add(panel);
    // cabine do bandeirinha no lado de fora
    const booth = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    booth.position.set(a.x + o.nx * 2, H + 1.2, a.z + o.nz * 2);
    g.add(booth);
    this.flagLight = new THREE.Mesh(new THREE.BoxGeometry(span * 0.55, 0.8, 0.12), new THREE.MeshBasicMaterial({ color: 0x19c24a }));
    this.flagLight.position.copy(panel.position);
    this.flagLight.rotation.y = beam.rotation.y;
    g.add(this.flagLight);
  }

  setFlagLight(flag) {
    if (!this.flagLight) return;
    const c = { green: 0x19c24a, yellow: 0xffd400, white: 0xffffff, checkered: 0x222222, none: 0x333333 }[flag] || 0x333333;
    this.flagLight.material.color.setHex(c);
  }

  buildStands(g, quality) {
    const outer = this.W / 2 + 1.6;
    const crowd = makeCrowd();
    const matCrowd = new THREE.MeshLambertMaterial({ map: crowd });
    const matBack = new THREE.MeshLambertMaterial({ color: 0x9a9fa6 });
    const matRoof = new THREE.MeshLambertMaterial({ color: 0x5b6470 });
    // trechos: sempre na reta da frente; em pista curta, em volta toda
    const pieces = [];
    const short = this.L < 1200;
    if (short) pieces.push([0, this.L, 26, 30]);
    else {
      pieces.push([this.pitStart - 150, this.pitStart + this.pitLen + 150, 45, 38]);
      // um pouco na reta oposta
      pieces.push([this.L / 2 - this.S * 0.35, this.L / 2 + this.S * 0.35, 18, 14]);
    }
    for (const [a, b, depth, height] of pieces) {
      const d0 = outer + 6;
      const d1 = d0 + depth;
      const slope = height / depth;
      g.add(this.sweep(a, b, 4, s => {
        const y0 = this.heightAt(s, this.W / 2) + 2.5;
        return [[d0, y0, 0], [d1, y0 + depth * slope, depth / 10]];
      }, matCrowd, 12));
      // parede de trás e cobertura
      g.add(this.sweep(a, b, 4, s => {
        const y0 = this.heightAt(s, this.W / 2) + 2.5;
        return [[d1, y0 + depth * slope, 0], [d1, -0.4, 1]];
      }, matBack, 20, true));
      g.add(this.sweep(a, b, 4, s => {
        const y0 = this.heightAt(s, this.W / 2) + 2.5;
        return [[d0 - 0.2, y0, 0], [d0 - 0.2, -0.4, 1]];
      }, matBack, 20, true));
      if (!short && quality > 0) {
        g.add(this.sweep(a, b, 4, s => {
          const y0 = this.heightAt(s, this.W / 2) + 2.5 + depth * slope + 6;
          return [[d0 + depth * 0.45, y0 - 1.5, 0], [d1 + 1, y0, 1]];
        }, matRoof, 20, true));
      }
    }
    // placas de publicidade no muro da reta
    const ads = makeAdsTex();
    const matAds = new THREE.MeshBasicMaterial({ map: ads, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    g.add(this.sweep(this.pitStart, this.pitStart + this.pitLen, 3, s => {
      const y = this.heightAt(s, this.W / 2);
      return [[this.W / 2 + 0.2, y + 0.25, 0], [this.W / 2 + 0.2, y + 1.15, 1]];
    }, matAds, 60, true));
  }

  buildInfield(g) {
    // torres de luz em volta
    const matPole = new THREE.MeshLambertMaterial({ color: 0x6d6d6d });
    const matLamp = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
    const poleGeo = new THREE.CylinderGeometry(0.25, 0.4, 32, 6);
    const lampGeo = new THREE.BoxGeometry(4, 2, 0.6);
    const n = Math.max(10, Math.round(this.L / 180));
    for (let i = 0; i < n; i++) {
      const s = this.L * i / n + 30;
      const p = this.toWorld(s, -this.W / 2 - this.apron - 14, new THREE.Vector3());
      const rel = this.pitRel(s);
      if (rel < this.pitLen + 40) continue;     // sem poste na área do box
      const pole = new THREE.Mesh(poleGeo, matPole);
      pole.position.set(p.x, 15.6, p.z);
      g.add(pole);
      const lamp = new THREE.Mesh(lampGeo, matLamp);
      lamp.position.set(p.x, 31.5, p.z);
      const o = this.sample(s, {});
      lamp.rotation.y = Math.atan2(o.nx, o.nz);
      g.add(lamp);
    }
    // torre de controle atrás do box
    const s = this.pitStart + this.pitLen * 0.5;
    const p = this.toWorld(s, this.pitInner - 40, new THREE.Vector3());
    const tower = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 12), new THREE.MeshLambertMaterial({ color: 0xd8d8d0 }));
    tower.position.set(p.x, 9, p.z);
    const o = this.sample(s, {});
    tower.rotation.y = -Math.atan2(o.fz, o.fx);
    g.add(tower);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(24.2, 4, 12.2), new THREE.MeshLambertMaterial({ color: 0x223344 }));
    glass.position.set(p.x, 15, p.z); glass.rotation.y = tower.rotation.y;
    g.add(glass);
    // garagens
    for (let i = 0; i < 4; i++) {
      const q = this.toWorld(this.pitStart + this.pitLen * (0.15 + i * 0.22), this.pitInner - 80, new THREE.Vector3());
      const gar = new THREE.Mesh(new THREE.BoxGeometry(50, 6, 16), new THREE.MeshLambertMaterial({ color: 0xb9bcc2 }));
      gar.position.set(q.x, 3, q.z); gar.rotation.y = tower.rotation.y;
      g.add(gar);
    }
    // lago no infield das pistas grandes
    if (this.L > 3000) {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshLambertMaterial({ color: 0x3d6f99 }));
      lake.scale.set(this.S * 0.35, this.R * 0.35, 1);
      lake.rotation.x = -Math.PI / 2;
      const q = this.toWorld(this.L / 2, -this.R * 0.6, new THREE.Vector3());
      lake.position.set(q.x, -0.37, q.z);
      g.add(lake);
    }
  }
}

const _tmp = {};

/* ---------- utilidades de suavização ---------- */
function smoothClosed(pts, w) {
  const n = pts.length, out = new Array(n);
  let sx = 0, sz = 0;
  for (let i = -w; i <= w; i++) { const p = pts[(i + n) % n]; sx += p[0]; sz += p[1]; }
  const c = 2 * w + 1;
  for (let i = 0; i < n; i++) {
    out[i] = [sx / c, sz / c];
    const add = pts[(i + w + 1) % n], rem = pts[(i - w + n) % n];
    sx += add[0] - rem[0]; sz += add[1] - rem[1];
  }
  return out;
}
function smooth1(a, w) {
  const n = a.length, out = new Float32Array(n);
  let s = 0;
  for (let i = -w; i <= w; i++) s += a[(i + n) % n];
  const c = 2 * w + 1;
  for (let i = 0; i < n; i++) {
    out[i] = s / c;
    s += a[(i + w + 1) % n] - a[(i - w + n) % n];
  }
  return out;
}

/* ---------- texturas desenhadas na hora ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

function makeAsphalt() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#5a5b5e'; x.fillRect(0, 0, w, h);
    const img = x.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
  }, true);
}
function makeConcrete() {
  return canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#c9c9c4'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(0, 0, w, 1);
  }, true);
}
function makeWallTex(pit) {
  return canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#f0f0ee'; x.fillRect(0, 0, w, h);
    x.fillStyle = pit ? '#c8102e' : '#1b3f9c';
    x.fillRect(0, h * 0.78, w, h * 0.12);
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(w - 1, 0, 1, h);
    // marcas de pneu
    for (let i = 0; i < 6; i++) {
      x.fillStyle = `rgba(20,20,20,${Math.random() * 0.25})`;
      x.fillRect(Math.random() * w, h * (0.35 + Math.random() * 0.3), 12 + Math.random() * 20, 3);
    }
  }, true);
}
function makeFenceTex() {
  return canvasTex(64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = 'rgba(200,200,200,0.9)'; x.lineWidth = 1.5;
    for (let i = -w; i < w * 2; i += 8) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke();
      x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke();
    }
    x.fillStyle = '#999'; x.fillRect(0, 0, w, 3);
  }, true);
}
function makeChecker() {
  return canvasTex(64, 64, (x, w, h) => {
    const n = 8, q = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
      x.fillRect(i * q, j * q, q, q);
    }
  }, true);
}
/* torcida: pixels coloridos, igual aos jogos dos anos 90 */
function makeCrowd() {
  return canvasTex(128, 128, (x, w, h) => {
    const cols = ['#d33', '#36c', '#fd3', '#fff', '#2a2', '#f80', '#222', '#c6c', '#8cf', '#a52', '#eee'];
    for (let j = 0; j < h; j += 2) {
      x.fillStyle = j % 8 < 2 ? '#6e6e6e' : '#8a8a8a';
      x.fillRect(0, j, w, 2);
      for (let i = 0; i < w; i += 2) {
        if (Math.random() < 0.8) {
          x.fillStyle = cols[(Math.random() * cols.length) | 0];
          x.fillRect(i, j, 2, 2);
        }
      }
    }
  }, true);
}
function makeAdsTex() {
  const ads = ['TURBO COLA', 'MAX TIRE', 'ACME OIL', 'BIG BURGER', 'SPEEDWAY', 'ROCKET', 'NITRO', 'GREEN FLAG'];
  const cols = [['#c8102e', '#fff'], ['#fff', '#1b3f9c'], ['#111', '#fd3'], ['#1b3f9c', '#fff'], ['#fd3', '#111'], ['#1d9e4b', '#fff']];
  return canvasTex(1024, 64, (x, w, h) => {
    const n = ads.length, q = w / n;
    for (let i = 0; i < n; i++) {
      const c = cols[i % cols.length];
      x.fillStyle = c[0]; x.fillRect(i * q, 0, q, h);
      x.fillStyle = c[1]; x.font = 'bold 36px Arial Black, Arial';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(ads[i], i * q + q / 2, h / 2 + 2, q - 10);
    }
  }, true);
}
function numberSign(num, c1, c2) {
  return canvasTex(64, 48, (x, w, h) => {
    x.fillStyle = c1; x.fillRect(0, 0, w, h);
    x.fillStyle = c2; x.font = 'bold 36px Arial Black, Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(num, w / 2, h / 2 + 2);
  });
}
function makeHills(center, r) {
  const tex = canvasTex(1024, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const layer = (col, base, amp, f) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, h);
      for (let i = 0; i <= w; i += 4) {
        const y = base - amp * (0.5 + 0.5 * Math.sin(i * f) * Math.sin(i * f * 2.7 + 1.3));
        x.lineTo(i, y);
      }
      x.lineTo(w, h); x.fill();
    };
    layer('#8fa5b8', 70, 55, 0.012);
    layer('#6f8a66', 95, 40, 0.02);
    layer('#5d7a4e', 115, 22, 0.035);
  }, true);
  tex.repeat.set(4, 1);
  const geo = new THREE.CylinderGeometry(r, r, 260, 64, 1, true);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.position.set(center.x, 110, center.z);
  m.renderOrder = -1;
  return m;
}
