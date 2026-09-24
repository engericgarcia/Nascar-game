/* ============================================================
   hud.js - tudo que é desenhado por cima do 3D num canvas 2D:
   painel do cockpit (conta-giros, óleo, água, gasolina, câmbio H),
   santantônio e coluna, placar P/L no estilo dos anos 90,
   classificação, mapa, bandeiras e avisos do spotter.
   ============================================================ */
import { MPH } from './data.js';
import { serviceName } from './sim.js';

export class Hud {
  constructor(canvas) {
    this.cv = canvas;
    this.x = canvas.getContext('2d');
    this.toasts = [];
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.dash = null;       // refaz o painel estático
    this.mapCache = null;
  }

  toast(text, color) {
    this.toasts.push({ text, color: color || '#fff', t: 3.2 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  draw(dt, sim, view, opts) {
    const x = this.x, w = this.w, h = this.h;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const p = view.focus || sim.player;
    const cockpit = view.camMode === 'cockpit';
    if (cockpit) this.drawCockpit(sim, p, view, opts);

    // --- placar P / L / número (canto superior esquerdo) ---
    const sc = Math.min(1, w / 820) * (h < 420 ? 0.85 : 1);
    x.save();
    x.translate(8, 8);
    x.scale(sc, sc);
    x.fillStyle = 'rgba(0,0,0,0.78)';
    x.fillRect(0, 0, 200, 66);
    x.strokeStyle = '#555'; x.strokeRect(0.5, 0.5, 199, 65);
    x.font = 'bold 26px "Courier New", monospace';
    x.fillStyle = '#ffd21f';
    x.textBaseline = 'top';
    const lapNow = Math.max(0, Math.min(sim.laps, p.lap + 1));
    const posTxt = 'P' + p.pos;
    x.fillText(posTxt, 8, 4);
    x.fillText('L' + (sim.state === 'formation' ? 0 : lapNow) + '/' + sim.laps, 88, 4);
    x.fillStyle = '#fff';
    x.fillText('#' + p.info.num, 8, 34);
    x.font = 'bold 14px Arial';
    x.fillStyle = '#bbb';
    const last = p.lastLap ? p.lastLap.toFixed(2) + 's' : '--';
    x.fillText('últ ' + last, 88, 40);
    x.restore();

    // --- classificação ---
    this.drawStandings(sim, p, 8, 8 + 72 * sc, sc);

    // --- bandeira ---
    this.drawFlag(sim, w, sc, cockpit && view.mirror ? view.mirrorRect().y + view.mirrorRect().h + 8 : 8);

    // --- mapa ---
    if (!cockpit || w > 700) this.drawMap(sim, w - 118 * sc - 8, 8 + (opts.topButtons || 0), 118 * sc);

    // --- velocímetro e medidores (fora do cockpit) ---
    if (!cockpit) this.drawMiniDash(sim, p, opts, sc);

    // --- TV ---
    if (view.tvLabel) {
      x.font = 'bold 28px Arial Black, Arial';
      x.fillStyle = '#ffd21f'; x.strokeStyle = '#000'; x.lineWidth = 3;
      x.textAlign = 'right';
      const ty0 = (opts.topButtons || 50) + 118 * sc * 0.62 + 12;
      x.strokeText(view.tvLabel, w - 12, ty0);
      x.fillText(view.tvLabel, w - 12, ty0);
      x.textAlign = 'left';
    }

    // --- spotter ---
    this.drawSpotter(sim, p);

    // --- box ---
    if (p.mode === 'pit' && p.pit) {
      const ph = p.pit.phase;
      let t = ph === 'stop' ? `Parado no box: ${p.pit.timer.toFixed(1)}s` : ph === 'in' ? 'Entrando no box…' : ph === 'road' ? `Pit road — limite ${Math.round(sim.track.pitSpeed * MPH)} mph` : 'Saindo do box';
      this.banner(t, '#0c3b66', h * 0.42);
      if (ph === 'stop') {
        const k = 1 - p.pit.timer / p.pit.total;
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(w / 2 - 110, h * 0.42 + 22, 220, 10);
        x.fillStyle = '#3fd35a'; x.fillRect(w / 2 - 110, h * 0.42 + 22, 220 * k, 10);
      }
    } else if (p.pitReq) {
      this.banner('BOX nesta volta: ' + serviceName(p.service), '#0c3b66', h * 0.42);
    } else if (!p.dnf && p.fuel < 1.5 / sim.fuelLaps && sim.fuelLaps < 1e5 && Math.floor(sim.t * 2) % 2) {
      this.banner('Combustível baixo — toque em BOX', '#7a1d10', h * 0.42);
    }
    if ((sim.state === 'formation' || sim.state === 'caution') && !p.finished && p.mode !== 'pit') {
      x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillStyle = '#ffd400';
      x.fillText('Piloto automático sob amarela — toque em BOX para parar', w / 2, h * (cockpit ? 0.6 : 0.5) + (p.pitReq ? 20 : 0));
      x.textAlign = 'left';
    }

    // --- mensagens ---
    let ty = h * 0.18;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t -= dt;
      if (t.t <= 0) { this.toasts.splice(i, 1); continue; }
    }
    this.toasts.forEach(t => {
      x.globalAlpha = Math.min(1, t.t * 2);
      x.font = 'bold 22px Arial Black, Arial';
      x.textAlign = 'center';
      x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,0.85)';
      x.strokeText(t.text, w / 2, ty);
      x.fillStyle = t.color; x.fillText(t.text, w / 2, ty);
      ty += 28;
    });
    x.globalAlpha = 1; x.textAlign = 'left';

    // relógio de corrida (como no replay da TV)
    if (!cockpit) {
      x.font = 'bold 16px "Courier New", monospace';
      x.fillStyle = '#fff'; x.textAlign = 'right';
      x.strokeStyle = '#000'; x.lineWidth = 3;
      const tt = fmtClock(sim.t);
      const yy = h - (opts.bottomPad || 0) - 8;
      x.strokeText(tt, w - 10, yy); x.fillText(tt, w - 10, yy);
      x.textAlign = 'left';
    }
  }

  banner(t, bg, y) {
    const x = this.x, w = this.w;
    x.font = 'bold 16px Arial';
    const tw = x.measureText(t).width + 30;
    x.fillStyle = bg; x.globalAlpha = 0.9;
    x.fillRect(w / 2 - tw / 2, y - 12, tw, 28);
    x.globalAlpha = 1;
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, w / 2, y + 2);
    x.textAlign = 'left'; x.textBaseline = 'top';
  }

  drawFlag(sim, w, sc, y0) {
    const x = this.x;
    const f = sim.flag;
    if (f === 'green' && sim.t % 1000 > 0 && !this.greenFlash) return;
    const cx = w / 2, y = y0;
    const fw = (y0 > 8 ? 46 : 70) * sc, fh = (y0 > 8 ? 28 : 44) * sc;
    x.save();
    x.translate(cx - fw / 2, y);
    if (f === 'checkered') {
      const n = 7, q = fw / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * q, j * fh / 4, q, fh / 4); }
    } else {
      x.fillStyle = { yellow: '#ffd400', white: '#fff', green: '#19c24a' }[f] || '#888';
      x.fillRect(0, 0, fw, fh);
    }
    x.strokeStyle = '#000'; x.lineWidth = 2; x.strokeRect(0, 0, fw, fh);
    x.restore();
    x.font = 'bold 12px Arial'; x.textAlign = 'center';
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 3;
    let label = { yellow: sim.state === 'formation' ? 'APRESENTAÇÃO' : 'AMARELA', white: 'ÚLTIMA VOLTA', checkered: 'FIM', green: 'VERDE' }[f] || '';
    if (sim.state === 'caution') label += ` · ${Math.max(1, sim.cautionLaps)} p/ relargar`;
    x.strokeText(label, cx, y + fh + 4); x.fillText(label, cx, y + fh + 4);
    x.textAlign = 'left';
  }

  drawStandings(sim, p, x0, y0, sc) {
    const x = this.x;
    const rk = sim.ranking || sim.cars;
    const lines = [];
    const pi = rk.indexOf(p);
    const show = new Set([0, 1, 2, 3]);
    for (let i = pi - 1; i <= pi + 1; i++) if (i >= 0 && i < rk.length) show.add(i);
    const idx = [...show].sort((a, b) => a - b);
    const L = sim.track.L;
    const leader = rk[0];
    x.save();
    x.translate(x0, y0);
    x.scale(sc, sc);
    let y = 0;
    let prev = -1;
    x.font = 'bold 13px Arial';
    for (const i of idx) {
      if (prev >= 0 && i > prev + 1) { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, y, 200, 8); y += 9; }
      const c = rk[i];
      x.fillStyle = c === p ? 'rgba(200,30,20,0.85)' : 'rgba(0,0,0,0.6)';
      x.fillRect(0, y, 200, 19);
      x.fillStyle = c.info.color; x.fillRect(26, y + 3, 5, 13);
      x.fillStyle = '#ffd21f'; x.textBaseline = 'middle';
      x.fillText(String(i + 1), 4, y + 10);
      x.fillStyle = '#fff';
      x.fillText('#' + c.info.num, 36, y + 10);
      const nm = c.player ? 'VOCÊ' : c.info.name.split(' ').pop().toUpperCase();
      x.fillText(nm.slice(0, 11), 72, y + 10);
      let gap = '';
      if (i === 0) gap = 'Líder';
      else if (c.dnf) gap = 'OUT';
      else if (c.mode === 'pit') gap = 'BOX';
      else {
        const dl = leader.dist - c.dist;
        if (dl > L) gap = '-' + Math.floor(dl / L) + (Math.floor(dl / L) > 1 ? ' v' : ' v');
        else gap = '+' + (dl / Math.max(20, leader.v || 40)).toFixed(1);
      }
      if (sim.state === 'formation') gap = '';
      x.fillStyle = '#ccc'; x.textAlign = 'right';
      x.fillText(gap, 196, y + 10);
      x.textAlign = 'left';
      y += 20;
      prev = i;
    }
    x.restore();
    x.textBaseline = 'top';
  }

  drawMap(sim, x0, y0, size) {
    const x = this.x, tr = sim.track;
    if (!this.mapCache || this.mapCache.size !== size || this.mapCache.tr !== tr) {
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (let i = 0; i < tr.N; i++) {
        minx = Math.min(minx, tr.px[i]); maxx = Math.max(maxx, tr.px[i]);
        minz = Math.min(minz, tr.pz[i]); maxz = Math.max(maxz, tr.pz[i]);
      }
      const k = (size - 16) / Math.max(maxx - minx, maxz - minz);
      this.mapCache = { size, tr, k, minx, minz, ox: (size - (maxx - minx) * k) / 2, oz: (size * 0.62 - (maxz - minz) * k) / 2 };
    }
    const m = this.mapCache;
    const hgt = size * 0.62;
    const X = (px) => x0 + m.ox + (px - m.minx) * m.k;
    const Z = (pz) => y0 + m.oz + (pz - m.minz) * m.k;
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(x0, y0, size, hgt);
    x.strokeStyle = '#ddd'; x.lineWidth = 3;
    x.beginPath();
    for (let i = 0; i < tr.N; i += 4) { const a = X(tr.px[i]), b = Z(tr.pz[i]); i ? x.lineTo(a, b) : x.moveTo(a, b); }
    x.closePath(); x.stroke();
    const o = {};
    for (const c of sim.cars) {
      if (c.dnf) continue;
      tr.sample(c.s, o);
      x.fillStyle = c.player ? '#ff2a1a' : '#ffd21f';
      const r = c.player ? 3.5 : 2;
      x.fillRect(X(o.x) - r, Z(o.z) - r, r * 2, r * 2);
    }
    if (sim.paceCar.active) { tr.sample(sim.paceCar.s, o); x.fillStyle = '#fff'; x.fillRect(X(o.x) - 2.5, Z(o.z) - 2.5, 5, 5); }
  }

  drawMiniDash(sim, p, opts, sc) {
    const x = this.x, w = this.w, h = this.h;
    const cx = opts.midX || w / 2, y = h - (opts.bottomPad || 0) - 58 * sc;
    x.save();
    x.translate(cx, y);
    x.scale(sc, sc);
    x.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(x, -120, -6, 240, 58, 10); x.fill();
    const sp = opts.kmh ? Math.round(p.v * 3.6) : Math.round(p.v * MPH);
    x.fillStyle = '#fff'; x.font = 'bold 34px "Courier New", monospace'; x.textAlign = 'right';
    x.fillText(sp, -18, 0);
    x.font = 'bold 12px Arial'; x.fillStyle = '#aaa'; x.textAlign = 'left';
    x.fillText(opts.kmh ? 'km/h' : 'mph', -14, 20);
    x.fillStyle = '#ffd21f'; x.font = 'bold 24px Arial';
    x.fillText(p.gear, 24, 4);
    // barra de rpm
    const rk = Math.min(1, p.rpm / 10000);
    x.fillStyle = '#333'; x.fillRect(-110, 38, 220, 6);
    x.fillStyle = rk > 0.92 ? '#f33' : '#3fd35a'; x.fillRect(-110, 38, 220 * rk, 6);
    // gasolina e pneus
    bar(x, 56, 4, 50, 'GAS', p.fuel, p.fuel < 0.15 ? '#f33' : '#ffd21f');
    bar(x, 56, 20, 50, 'PNEU', p.tire, p.tire < 0.35 ? '#f33' : '#6cf');
    if (p.damage > 0.05) bar(x, -110, 4, 40, 'DANO', p.damage, '#f60');
    if (p.draft > 0.05) { x.fillStyle = '#6cf'; x.font = 'bold 11px Arial'; x.fillText('VÁCUO', -110, 22); }
    x.restore();
  }

  drawSpotter(sim, p) {
    const x = this.x, w = this.w, h = this.h;
    if (p.mode === 'pit' || p.dnf) return;
    let left = false, right = false;
    const tr = sim.track;
    for (const o of sim.cars) {
      if (o === p || o.dnf || o.mode === 'pit') continue;
      const ds = tr.delta(p.s, o.s);
      if (Math.abs(ds) < 6.2) {
        const dd = o.d - p.d;
        if (dd < -0.8 && dd > -5) left = true;
        if (dd > 0.8 && dd < 5) right = true;
      }
    }
    this.spot = { left, right };
    const y = h * 0.52;
    x.globalAlpha = 0.85;
    if (left) { x.fillStyle = '#ffd21f'; arrow(x, 18, y, -1); }
    if (right) { x.fillStyle = '#ffd21f'; arrow(x, w - 18, y, 1); }
    x.globalAlpha = 1;
  }

  /* ---------------- painel do cockpit ---------------- */
  drawCockpit(sim, p, view, opts) {
    const x = this.x, w = this.w, h = this.h;
    if (!this.dash || this.dash.w !== w || this.dash.h !== h) this.buildDash();
    x.drawImage(this.dash.cv, 0, 0, w, h);
    const D = this.dash;
    // ponteiros
    const needle = (g, val, min, max, a0, a1) => {
      const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
      const a = a0 + (a1 - a0) * t;
      x.strokeStyle = '#e8261a'; x.lineWidth = Math.max(2, g.r * 0.07);
      x.lineCap = 'round';
      x.beginPath(); x.moveTo(g.x, g.y);
      x.lineTo(g.x + Math.cos(a) * g.r * 0.8, g.y + Math.sin(a) * g.r * 0.8); x.stroke();
      x.fillStyle = '#111'; x.beginPath(); x.arc(g.x, g.y, g.r * 0.12, 0, 7); x.fill();
    };
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    const oilP = p.rpm > 2000 ? 55 + p.rpm / 400 : 20;
    const water = 190 + p.draft * 110 + p.damage * 60 + (p.v < 5 ? 20 : 0);
    const oilT = 220 + p.rpm / 300 + p.damage * 30;
    needle(D.g.fuel, p.fuel, 0, 1, A0, A1);
    needle(D.g.tach, p.rpm, 0, 10000, Math.PI * 0.62, Math.PI * 2.1);
    needle(D.g.oilp, oilP, 20, 140, A0, A1);
    needle(D.g.oilt, oilT, 100, 300, A0, A1);
    needle(D.g.water, water, 150, 250, A0, A1);
    // velocidade digital
    const sp = opts.kmh ? Math.round(p.v * 3.6) : Math.round(p.v * MPH);
    x.fillStyle = '#e8e8e8'; x.font = `bold ${D.digH}px "Courier New", monospace`;
    x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillText(String(sp).padStart(3, ' '), D.dig.x + D.dig.w - 4, D.dig.y + D.dig.h / 2 + 1);
    x.textAlign = 'left';
    // luzes de aviso
    const warn = (L, on, col) => { x.fillStyle = on ? col : '#4a1111'; x.beginPath(); x.arc(L.x, L.y, L.r, 0, 7); x.fill(); };
    warn(D.lights[0], p.fuel < 0.12, '#ff3b1f');
    warn(D.lights[1], water > 235, '#ff3b1f');
    warn(D.lights[2], p.rpm > 9300, '#ffcc00');
    warn(D.lights[3], p.mode === 'pit', '#33ccff');
    // câmbio H com a bola na marcha atual
    const S = D.shift;
    const gp = [[0, 0], [S.gx, S.gy0], [S.gx, S.gy1], [S.gx2, S.gy0], [S.gx2, S.gy1]][p.gear];
    x.fillStyle = '#ddd'; x.beginPath(); x.arc(S.x + gp[0], S.y + gp[1], S.r, 0, 7); x.fill();
    x.fillStyle = '#ffd21f'; x.font = `bold ${S.r * 1.6}px Arial`;
    x.fillText(p.gear, S.x + S.gx2 + S.r * 2, S.y + S.gy0 - 4);
    // moldura do retrovisor
    if (view.mirror) {
      const r = view.mirrorRect();
      x.strokeStyle = '#111'; x.lineWidth = 6;
      roundRect(x, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 6); x.stroke();
    }
    // tremor da batida
  }

  buildDash() {
    const w = this.w, h = this.h, dpr = this.dpr;
    const cv = document.createElement('canvas');
    cv.width = w * dpr; cv.height = h * dpr;
    const x = cv.getContext('2d');
    x.scale(dpr, dpr);
    const D = { cv, w, h, g: {} };
    const dashTop = h * 0.68;
    // santantônio: barras pretas
    x.fillStyle = '#0c0c0c';
    x.fillRect(0, 0, w, h * 0.028);
    // coluna direita (A-pillar) e barra do para-brisa
    x.beginPath();
    x.moveTo(w * 0.70, 0); x.lineTo(w * 0.745, 0); x.lineTo(w * 0.83, dashTop); x.lineTo(w * 0.79, dashTop);
    x.fill();
    x.beginPath();
    x.moveTo(w * 0.535, 0); x.lineTo(w * 0.55, 0); x.lineTo(w * 0.60, dashTop * 0.75); x.lineTo(w * 0.585, dashTop * 0.75);
    x.fill();
    // lado esquerdo: coluna + barra do banco
    const grad = x.createLinearGradient(0, 0, w * 0.2, 0);
    grad.addColorStop(0, '#050505'); grad.addColorStop(1, '#222');
    x.fillStyle = grad;
    x.beginPath();
    x.moveTo(0, 0); x.lineTo(w * 0.12, 0); x.lineTo(w * 0.06, h * 0.45); x.lineTo(w * 0.1, dashTop); x.lineTo(0, dashTop);
    x.fill();
    // rede da janela à direita
    x.strokeStyle = 'rgba(20,20,20,0.9)'; x.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      x.beginPath(); x.moveTo(w * (0.86 + i * 0.022), h * 0.05); x.lineTo(w * (0.84 + i * 0.026), dashTop); x.stroke();
    }
    x.fillStyle = '#0c0c0c';
    x.fillRect(w * 0.83, 0, w * 0.17, h * 0.05);
    x.beginPath(); x.moveTo(w, 0); x.lineTo(w * 0.96, 0); x.lineTo(w * 0.98, dashTop); x.lineTo(w, dashTop); x.fill();
    // topo do painel
    x.fillStyle = '#1b1b1b';
    x.beginPath();
    x.moveTo(0, dashTop - h * 0.02);
    x.quadraticCurveTo(w * 0.5, dashTop - h * 0.07, w, dashTop - h * 0.02);
    x.lineTo(w, h); x.lineTo(0, h); x.fill();
    // chapa de alumínio do painel
    const pg = x.createLinearGradient(0, dashTop, 0, h);
    pg.addColorStop(0, '#9b9ea3'); pg.addColorStop(0.5, '#c9ccd0'); pg.addColorStop(1, '#8a8d92');
    x.fillStyle = pg;
    x.beginPath();
    x.moveTo(w * 0.08, dashTop + h * 0.01);
    x.quadraticCurveTo(w * 0.5, dashTop - h * 0.045, w * 0.99, dashTop + h * 0.01);
    x.lineTo(w * 0.99, h); x.lineTo(w * 0.08, h); x.fill();
    // rebites
    x.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 24; i++) { x.beginPath(); x.arc(w * (0.1 + i * 0.037), h - 6, 1.6, 0, 7); x.fill(); }

    const gh = h - dashTop;
    const R = Math.min(gh * 0.42, w * 0.058);
    const cy = dashTop + gh * 0.52;
    const gauge = (cx, r, label, ticks, a0, a1, big) => {
      x.fillStyle = '#222'; x.beginPath(); x.arc(cx, cy, r * 1.1, 0, 7); x.fill();
      x.fillStyle = '#f4f4f0'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.strokeStyle = '#111'; x.lineWidth = 1.5;
      x.fillStyle = '#111';
      x.font = `bold ${Math.max(8, r * (big ? 0.2 : 0.22))}px Arial`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      ticks.forEach((t, i) => {
        const a = a0 + (a1 - a0) * i / (ticks.length - 1);
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
        x.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); x.stroke();
        if (t !== '') x.fillText(t, cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
      });
      x.font = `bold ${Math.max(7, r * 0.15)}px Arial`;
      label.split('\n').forEach((ln, i) => x.fillText(ln, cx, cy + r * (0.42 + i * 0.17)));
      return { x: cx, y: cy, r };
    };
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    let gx = w / 2 - R * 2.25;
    D.g.fuel = gauge(gx, R * 0.85, 'FUEL', ['E', '', '½', '', 'F'], A0, A1);
    gx += R * 2.25;
    D.g.tach = gauge(gx, R * 1.25, 'RPM', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], Math.PI * 0.62, Math.PI * 2.1, true);
    // faixa vermelha do conta-giros
    x.strokeStyle = '#e8261a'; x.lineWidth = R * 0.08;
    x.beginPath(); x.arc(D.g.tach.x, D.g.tach.y, D.g.tach.r * 0.86, Math.PI * 0.62 + (Math.PI * 1.48) * 0.92, Math.PI * 2.1); x.stroke();
    gx += R * 2.3;
    D.g.oilp = gauge(gx, R * 0.85, 'OIL\nPRESSURE', ['20', '50', '80', '110', '140'], A0, A1);
    gx += R * 1.95;
    D.g.oilt = gauge(gx, R * 0.85, 'OIL\nTEMP', ['100', '150', '200', '250', '300'], A0, A1);
    gx += R * 1.95;
    D.g.water = gauge(gx, R * 0.85, 'WATER\nTEMP', ['150', '175', '200', '225', '250'], A0, A1);
    // velocímetro digital
    const dw = R * 1.3, dh = R * 0.42;
    D.dig = { x: w * 0.3 - R * 1.6 - dw * 0.2, y: dashTop + gh * 0.08, w: dw, h: dh };
    D.dig.x = Math.max(w * 0.1, D.g.fuel.x - R * 0.9 - dw * 0.5);
    x.fillStyle = '#0d0d0d'; roundRect(x, D.dig.x, D.dig.y, dw, dh, 4); x.fill();
    x.fillStyle = '#e8261a'; x.font = `bold ${dh * 0.35}px Arial`;
    x.textAlign = 'left'; x.fillText('MPH', D.dig.x + 4, D.dig.y + dh * 0.5);
    D.digH = dh * 0.8;
    // luzes de aviso
    D.lights = [];
    for (let i = 0; i < 4; i++) D.lights.push({ x: D.g.tach.x - R * 0.9 + i * R * 0.6, y: dashTop + gh * 0.08, r: R * 0.1 });
    // câmbio em H
    const sx = Math.max(w * 0.11, D.g.fuel.x - R * 1.9), sy = cy - R * 0.1;
    const S = { x: sx, y: sy, gx: 0, gx2: R * 0.6, gy0: -R * 0.5, gy1: R * 0.5, r: R * 0.13 };
    x.strokeStyle = '#ddd'; x.lineWidth = R * 0.06;
    x.fillStyle = '#2a2a2a'; roundRect(x, sx - R * 0.3, sy - R * 0.8, R * 1.2, R * 1.6, 6); x.fill();
    x.beginPath();
    x.moveTo(sx, sy - R * 0.5); x.lineTo(sx, sy + R * 0.5);
    x.moveTo(sx + S.gx2, sy - R * 0.5); x.lineTo(sx + S.gx2, sy + R * 0.5);
    x.moveTo(sx, sy); x.lineTo(sx + S.gx2, sy); x.stroke();
    x.fillStyle = '#fff'; x.font = `bold ${R * 0.2}px Arial`;
    x.fillText('1', sx - R * 0.2, sy - R * 0.55); x.fillText('2', sx - R * 0.2, sy + R * 0.55);
    x.fillText('3', sx + S.gx2 + R * 0.08, sy - R * 0.55); x.fillText('4', sx + S.gx2 + R * 0.08, sy + R * 0.55);
    D.shift = S;
    this.dash = D;
  }
}

function bar(x, bx, by, bw, label, v, col) {
  x.font = 'bold 9px Arial'; x.fillStyle = '#aaa'; x.textAlign = 'left';
  x.fillText(label, bx, by - 1);
  x.fillStyle = '#333'; x.fillRect(bx, by + 8, bw, 5);
  x.fillStyle = col; x.fillRect(bx, by + 8, bw * Math.max(0, Math.min(1, v)), 5);
}
function arrow(x, cx, cy, dir) {
  x.beginPath();
  x.moveTo(cx, cy); x.lineTo(cx - dir * 22, cy - 30); x.lineTo(cx - dir * 22, cy + 30); x.closePath(); x.fill();
  x.fillRect(dir > 0 ? cx - 34 : cx + 24, cy - 30, 10, 60);
}
function roundRect(x, a, b, w, h, r) {
  x.beginPath();
  x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
  x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
  x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
  x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
}
function fmtClock(t) {
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
