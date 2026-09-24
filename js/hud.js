/* ============================================================
   hud.js - tudo que é desenhado por cima do 3D num canvas 2D,
   no estilo das transmissões de TV: placas inclinadas com
   degradê, cores das equipes, conta-giros em arco, bandeira
   tremulando, mapa com brilho, avisos do spotter.
   No cockpit: painel de alumínio escovado, relógios com aro
   cromado e vidro, chaves, luzes, câmbio em H e santantônio
   com espuma.
   ============================================================ */
import { MPH } from './data.js';
import { serviceName } from './sim.js';

const F = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const FI = (size, weight = 800) => `italic ${weight} ${size}px ${F}`;
const GOLD = '#ffd21f', RED = '#d7261e';

export class Hud {
  constructor(canvas) {
    this.cv = canvas;
    this.x = canvas.getContext('2d');
    this.toasts = [];
    this.time = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr;
    this.dash = null;
    this.mapCache = null;
  }

  toast(text, color) {
    this.toasts.push({ text, color: color || '#fff', t: 3.4, age: 0 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  draw(dt, sim, view, opts) {
    const x = this.x, w = this.w, h = this.h;
    this.time += dt;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const p = view.focus || sim.player;
    const cockpit = view.camMode === 'cockpit';
    if (cockpit) this.drawCockpit(dt, sim, p, view, opts);

    const sc = Math.min(1, w / 820) * (h < 420 ? 0.86 : 1);
    this.drawPosition(sim, p, sc);
    this.drawStandings(sim, p, 10, 10 + 64 * sc, sc);
    this.drawFlag(sim, w, sc, cockpit && view.mirror ? view.mirrorRect().y + view.mirrorRect().h + 6 : 8);
    const mapSize = 124 * sc;
    const mapY = (opts.topButtons || 50) + 2;
    if (!cockpit || w > 700) this.drawMap(sim, w - mapSize - 10, mapY, mapSize);
    if (!cockpit) this.drawMiniDash(sim, p, opts, sc);
    if (view.tvLabel) this.drawTvBug(view.tvLabel, w - 10, mapY + mapSize * 0.66 + 32, sc);
    this.drawSpotter(sim, p);
    this.drawPitInfo(sim, p, cockpit);
    this.drawToasts(dt);
    if (!cockpit) {
      const tt = fmtClock(sim.t);
      x.font = `700 ${12 * Math.max(0.9, sc)}px ${F}`;
      const tw = x.measureText(tt).width + 16;
      const yy = mapY + mapSize * 0.66 + 6;
      pill(x, w - tw - 10, yy, tw, 20, 10); x.fillStyle = 'rgba(8,12,20,0.6)'; x.fill();
      x.fillStyle = '#e8eef6'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(tt, w - tw / 2 - 10, yy + 10.5);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    }
  }

  /* ---------------- posição / volta ---------------- */
  drawPosition(sim, p, sc) {
    const x = this.x;
    x.save();
    x.translate(10, 10); x.scale(sc, sc);
    // sombra
    x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 8; x.shadowOffsetY = 2;
    // bloco vermelho com a posição
    slant(x, 0, 0, 78, 54, 10);
    const g1 = x.createLinearGradient(0, 0, 0, 54); g1.addColorStop(0, '#f23a2e'); g1.addColorStop(1, '#a10f0f');
    x.fillStyle = g1; x.fill();
    x.shadowColor = 'transparent';
    // bloco escuro com a volta
    slant(x, 72, 0, 128, 54, 10);
    const g2 = x.createLinearGradient(0, 0, 0, 54); g2.addColorStop(0, 'rgba(28,36,52,0.92)'); g2.addColorStop(1, 'rgba(8,11,18,0.92)');
    x.fillStyle = g2; x.fill();
    // brilho de cima
    slant(x, 0, 0, 200, 16, 3); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fill();
    x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    x.font = FI(13); x.fillText('POS', 14, 17);
    x.font = FI(34, 900); x.textAlign = 'center';
    x.fillText(String(p.pos), 42, 48);
    x.textAlign = 'left';
    const lapNow = sim.state === 'formation' ? 0 : Math.max(0, Math.min(sim.laps, p.lap + 1));
    x.fillStyle = '#9fb3d9'; x.font = FI(11); x.fillText('VOLTA', 92, 17);
    x.fillStyle = '#fff'; x.font = FI(24, 900); x.fillText(`${lapNow}`, 92, 43);
    const lw = x.measureText(`${lapNow}`).width;
    x.fillStyle = '#9fb3d9'; x.font = FI(15); x.fillText(`/${sim.laps}`, 94 + lw, 43);
    // número do carro em chip nas cores da equipe
    const num = '#' + p.info.num;
    slant(x, 150, 8, 44, 22, 5);
    x.fillStyle = p.info.color; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = contrast(p.info.color); x.font = FI(13, 900); x.textAlign = 'center';
    x.fillText(num, 172, 24);
    x.fillStyle = '#c9d3e3'; x.font = `600 10px ${F}`;
    x.fillText(p.lastLap ? p.lastLap.toFixed(2) + 's' : '—', 170, 46);
    x.textAlign = 'left';
    x.restore();
  }

  /* ---------------- classificação estilo TV ---------------- */
  drawStandings(sim, p, x0, y0, sc) {
    const x = this.x;
    const rk = sim.ranking || sim.cars;
    const pi = rk.indexOf(p);
    const show = new Set([0, 1, 2, 3]);
    for (let i = pi - 1; i <= pi + 1; i++) if (i >= 0 && i < rk.length) show.add(i);
    const idx = [...show].sort((a, b) => a - b);
    const L = sim.track.L;
    const leader = rk[0];
    x.save();
    x.translate(x0, y0); x.scale(sc, sc);
    let y = 0, prev = -1;
    const RW = 196, RH = 19;
    for (const i of idx) {
      if (prev >= 0 && i > prev + 1) {
        x.fillStyle = 'rgba(255,255,255,0.35)';
        for (let d = 0; d < 3; d++) { x.beginPath(); x.arc(18 + d * 7, y + 4, 1.5, 0, 7); x.fill(); }
        y += 9;
      }
      const c = rk[i];
      const me = c === p;
      // fundo inclinado
      slant(x, 0, y, RW, RH, 5);
      const g = x.createLinearGradient(0, y, RW, y);
      if (me) { g.addColorStop(0, 'rgba(215,38,30,0.95)'); g.addColorStop(1, 'rgba(120,10,10,0.8)'); }
      else { g.addColorStop(0, 'rgba(12,17,28,0.88)'); g.addColorStop(1, 'rgba(12,17,28,0.55)'); }
      x.fillStyle = g; x.fill();
      if (me) { x.strokeStyle = GOLD; x.lineWidth = 1.2; x.stroke(); }
      // posição
      slant(x, 0, y, 26, RH, 5);
      x.fillStyle = i === 0 ? GOLD : 'rgba(0,0,0,0.55)'; x.fill();
      x.fillStyle = i === 0 ? '#111' : '#fff';
      x.font = FI(12, 900); x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(i + 1), 14, y + RH / 2 + 1);
      // chip do número nas cores do carro
      slant(x, 28, y + 2, 32, RH - 4, 4);
      x.fillStyle = c.info.color; x.fill();
      x.fillStyle = c.info.color2; x.fillRect(28 + 3, y + RH - 5, 26, 2);
      x.fillStyle = contrast(c.info.color); x.font = FI(11, 900);
      x.fillText(String(c.info.num), 44, y + RH / 2);
      // nome
      x.textAlign = 'left';
      x.fillStyle = '#fff'; x.font = `700 11.5px ${F}`;
      const nm = c.player ? 'VOCÊ' : c.info.name.split(' ').pop().toUpperCase();
      x.fillText(nm.slice(0, 12), 66, y + RH / 2 + 1);
      // intervalo
      let gap = '';
      if (sim.state === 'formation') gap = '';
      else if (i === 0) gap = 'LÍDER';
      else if (c.dnf) gap = 'OUT';
      else if (c.mode === 'pit') gap = 'BOX';
      else {
        const dl = leader.dist - c.dist;
        gap = dl > L ? `-${Math.floor(dl / L)} V` : '+' + (dl / Math.max(20, leader.v || 40)).toFixed(1);
      }
      x.textAlign = 'right';
      x.fillStyle = gap === 'BOX' ? '#6cf' : gap === 'OUT' ? '#f77' : i === 0 ? GOLD : '#c9d3e3';
      x.font = `700 10.5px ${F}`;
      x.fillText(gap, RW - 8, y + RH / 2 + 1);
      x.textAlign = 'left';
      y += RH + 2;
      prev = i;
    }
    x.restore();
    x.textBaseline = 'alphabetic';
  }

  /* ---------------- bandeira tremulando ---------------- */
  drawFlag(sim, w, sc, y0) {
    const x = this.x;
    const f = sim.flag;
    if (f === 'green' && !this.greenFlash) return;
    const small = y0 > 8;
    const fw = (small ? 44 : 62) * sc, fh = (small ? 28 : 40) * sc;
    const cx = w / 2, y = y0;
    const t = this.time;
    // mastro
    x.fillStyle = '#d9dde3'; x.fillRect(cx - fw / 2 - 4, y, 3, fh + 12);
    const cols = 14;
    for (let i = 0; i < cols; i++) {
      const u = i / cols;
      const wav = Math.sin(t * 8 - u * 6) * 3 * u * sc;
      const shade = 0.82 + 0.18 * Math.cos(t * 8 - u * 6);
      const xx = cx - fw / 2 + u * fw;
      if (f === 'checkered') {
        for (let j = 0; j < 5; j++) {
          x.fillStyle = (Math.floor(u * 8) + j) % 2 ? `rgba(20,20,20,${shade})` : `rgba(255,255,255,${shade})`;
          x.fillRect(xx, y + wav + j * fh / 5, fw / cols + 0.6, fh / 5 + 0.5);
        }
      } else {
        const base = { yellow: [255, 212, 0], white: [255, 255, 255], green: [25, 194, 74] }[f] || [140, 140, 140];
        x.fillStyle = `rgb(${base.map(v => Math.round(v * shade)).join(',')})`;
        x.fillRect(xx, y + wav, fw / cols + 0.6, fh);
      }
    }
    let label = { yellow: sim.state === 'formation' ? 'APRESENTAÇÃO' : 'AMARELA', white: 'ÚLTIMA VOLTA', checkered: 'FIM', green: 'VERDE' }[f] || '';
    if (sim.state === 'caution') label += ` · ${Math.max(1, sim.cautionLaps)} P/ RELARGAR`;
    x.font = FI(11); const tw = x.measureText(label).width + 18;
    pill(x, cx - tw / 2, y + fh + 6, tw, 18, 9);
    x.fillStyle = 'rgba(8,12,20,0.75)'; x.fill();
    x.fillStyle = f === 'yellow' ? GOLD : '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, cx, y + fh + 15.5);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }

  /* ---------------- mapa ---------------- */
  drawMap(sim, x0, y0, size) {
    const x = this.x, tr = sim.track;
    if (!this.mapCache || this.mapCache.size !== size || this.mapCache.tr !== tr) {
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (let i = 0; i < tr.N; i++) {
        minx = Math.min(minx, tr.px[i]); maxx = Math.max(maxx, tr.px[i]);
        minz = Math.min(minz, tr.pz[i]); maxz = Math.max(maxz, tr.pz[i]);
      }
      const k = Math.min((size - 20) / (maxx - minx), (size * 0.66 - 16) / (maxz - minz));
      this.mapCache = { size, tr, k, minx, minz, ox: (size - (maxx - minx) * k) / 2, oz: (size * 0.66 - (maxz - minz) * k) / 2 };
    }
    const m = this.mapCache;
    const hgt = size * 0.66;
    const X = px => x0 + m.ox + (px - m.minx) * m.k;
    const Z = pz => y0 + m.oz + (pz - m.minz) * m.k;
    roundRectPath(x, x0, y0, size, hgt, 10);
    const bg = x.createLinearGradient(0, y0, 0, y0 + hgt);
    bg.addColorStop(0, 'rgba(18,26,40,0.72)'); bg.addColorStop(1, 'rgba(6,9,15,0.72)');
    x.fillStyle = bg; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1; x.stroke();
    const path = () => { x.beginPath(); for (let i = 0; i < tr.N; i += 4) { const a = X(tr.px[i]), b = Z(tr.pz[i]); i ? x.lineTo(a, b) : x.moveTo(a, b); } x.closePath(); };
    path(); x.lineJoin = 'round';
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 7; x.stroke();
    x.strokeStyle = '#5c6470'; x.lineWidth = 5; x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 1.2; x.stroke();
    // linha de chegada
    x.fillStyle = '#fff'; x.fillRect(X(tr.px[0]) - 1, Z(tr.pz[0]) - 4, 2, 8);
    const o = {};
    const rk = sim.ranking || sim.cars;
    for (let j = rk.length - 1; j >= 0; j--) {
      const c = rk[j];
      if (c.dnf) continue;
      tr.sample(c.s, o);
      const px = X(o.x), pz = Z(o.z);
      if (c.player) continue;
      x.beginPath(); x.arc(px, pz, j === 0 ? 3 : 2.2, 0, 7);
      x.fillStyle = j === 0 ? GOLD : c.info.color; x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 0.8; x.stroke();
    }
    if (sim.paceCar.active) { tr.sample(sim.paceCar.s, o); x.fillStyle = '#fff'; x.beginPath(); x.arc(X(o.x), Z(o.z), 2.6, 0, 7); x.fill(); }
    const pl = sim.player; tr.sample(pl.s, o);
    const pr = 3.8 + Math.sin(this.time * 6) * 0.8;
    x.beginPath(); x.arc(X(o.x), Z(o.z), pr + 3, 0, 7); x.fillStyle = 'rgba(255,60,40,0.3)'; x.fill();
    x.beginPath(); x.arc(X(o.x), Z(o.z), 3.6, 0, 7); x.fillStyle = '#ff3b2a'; x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 1.2; x.stroke();
  }

  drawTvBug(label, xr, y, sc) {
    const x = this.x;
    x.save();
    x.font = FI(16 * sc, 900);
    const tw = x.measureText(label).width + 22;
    slant(x, xr - tw, y, tw, 24 * sc, 6);
    x.fillStyle = 'rgba(8,12,20,0.8)'; x.fill();
    slant(x, xr - tw, y, 8, 24 * sc, 6);
    x.fillStyle = RED; x.fill();
    x.fillStyle = GOLD; x.textBaseline = 'middle'; x.textAlign = 'center';
    x.fillText(label, xr - tw / 2 + 4, y + 12.5 * sc);
    x.restore();
  }

  /* ---------------- velocímetro/conta-giros em arco ---------------- */
  drawMiniDash(sim, p, opts, sc) {
    const x = this.x, h = this.h;
    const cx = opts.midX || this.w / 2;
    const R = 50 * sc;
    const cy = h - 16 - R * 0.55;
    x.save();
    // painel de vidro
    roundRectPath(x, cx - R * 2.35, cy - R * 1.05, R * 4.7, R * 1.52, 16 * sc);
    const bg = x.createLinearGradient(0, cy - R, 0, cy + R * 0.5);
    bg.addColorStop(0, 'rgba(20,28,42,0.78)'); bg.addColorStop(1, 'rgba(5,8,14,0.85)');
    x.fillStyle = bg; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 1; x.stroke();
    // arco do conta-giros
    const a0 = Math.PI * 0.95, a1 = Math.PI * 2.05;
    const rk = Math.min(1, p.rpm / 10000);
    x.lineCap = 'butt';
    x.strokeStyle = 'rgba(255,255,255,0.1)'; x.lineWidth = 8 * sc;
    x.beginPath(); x.arc(cx, cy, R * 0.85, a0, a1); x.stroke();
    const grd = x.createLinearGradient(cx - R, 0, cx + R, 0);
    grd.addColorStop(0, '#3fd35a'); grd.addColorStop(0.7, '#ffd21f'); grd.addColorStop(1, '#ff3b2a');
    x.strokeStyle = grd;
    x.beginPath(); x.arc(cx, cy, R * 0.85, a0, a0 + (a1 - a0) * rk); x.stroke();
    // marcas
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.2;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * i / 10;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66);
      x.lineTo(cx + Math.cos(a) * R * (i % 5 ? 0.72 : 0.75), cy + Math.sin(a) * R * (i % 5 ? 0.72 : 0.75)); x.stroke();
    }
    // luzes de troca de marcha
    for (let i = 0; i < 5; i++) {
      const on = p.rpm > 8000 + i * 300;
      const lx = cx - R * 0.5 + i * R * 0.25, ly = cy - R * 0.98;
      x.beginPath(); x.arc(lx, ly, 3.2 * sc, 0, 7);
      x.fillStyle = on ? (i < 2 ? '#3fd35a' : i < 4 ? '#ffd21f' : '#ff3b2a') : 'rgba(255,255,255,0.12)';
      if (on) { x.shadowColor = x.fillStyle; x.shadowBlur = 8; }
      x.fill(); x.shadowBlur = 0;
    }
    // velocidade
    const sp = opts.kmh ? Math.round(p.v * 3.6) : Math.round(p.v * MPH);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = FI(30 * sc, 900); x.fillText(String(sp), cx, cy + R * 0.12);
    x.fillStyle = '#9fb3d9'; x.font = `700 ${9 * sc}px ${F}`;
    x.fillText(opts.kmh ? 'KM/H' : 'MPH', cx, cy + R * 0.36);
    // marcha
    roundRectPath(x, cx + R * 1.02, cy - R * 0.62, R * 0.62, R * 0.72, 6);
    x.fillStyle = 'rgba(255,210,31,0.12)'; x.fill(); x.strokeStyle = 'rgba(255,210,31,0.6)'; x.stroke();
    x.fillStyle = GOLD; x.font = FI(24 * sc, 900); x.fillText(String(p.gear), cx + R * 1.33, cy - R * 0.08);
    x.fillStyle = '#9fb3d9'; x.font = `700 ${7.5 * sc}px ${F}`; x.fillText('MARCHA', cx + R * 1.33, cy + R * 0.3);
    // gasolina e pneus
    x.textAlign = 'left';
    miniBar(x, cx - R * 2.15, cy - R * 0.62, R * 0.95, 'GASOLINA', p.fuel, p.fuel < 0.15 ? '#ff3b2a' : GOLD, sc);
    miniBar(x, cx - R * 2.15, cy - R * 0.12, R * 0.95, 'PNEUS', p.tire, p.tire < 0.35 ? '#ff3b2a' : '#6cf', sc);
    // chips de vácuo/dano
    let chipX = cx + R * 1.02;
    if (p.draft > 0.05) { chip(x, chipX, cy + R * 0.18, 'VÁCUO', '#1e88e5', sc); }
    if (p.damage > 0.05) chip(x, cx - R * 2.15, cy + R * 0.28, 'DANO ' + Math.round(p.damage * 100) + '%', '#e65100', sc);
    x.restore();
  }

  drawSpotter(sim, p) {
    const x = this.x, w = this.w, h = this.h;
    let left = false, right = false;
    if (p.mode !== 'pit' && !p.dnf) {
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
    }
    this.spot = { left, right };
    const y = h * 0.48;
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 10);
    const side = (cx, dir) => {
      const g = x.createLinearGradient(cx, 0, cx - dir * 70, 0);
      g.addColorStop(0, `rgba(255,210,31,${0.55 * pulse})`); g.addColorStop(1, 'rgba(255,210,31,0)');
      x.fillStyle = g; x.fillRect(dir > 0 ? cx - 70 : cx, y - 70, 70, 140);
      x.fillStyle = `rgba(255,220,60,${pulse})`;
      for (let k = 0; k < 2; k++) {
        const ox = cx - dir * (14 + k * 16);
        x.beginPath(); x.moveTo(ox, y); x.lineTo(ox - dir * 14, y - 20); x.lineTo(ox - dir * 20, y - 20);
        x.lineTo(ox - dir * 6, y); x.lineTo(ox - dir * 20, y + 20); x.lineTo(ox - dir * 14, y + 20); x.closePath(); x.fill();
      }
    };
    if (left) side(4, -1);
    if (right) side(w - 4, 1);
  }

  drawPitInfo(sim, p, cockpit) {
    const x = this.x, w = this.w, h = this.h;
    const by = h * 0.4;
    if (p.mode === 'pit' && p.pit) {
      const ph = p.pit.phase;
      const t = ph === 'stop' ? `PARADO NO BOX · ${p.pit.timer.toFixed(1)}s` : ph === 'in' ? 'ENTRANDO NO BOX' : ph === 'road' ? `PIT ROAD · LIMITE ${Math.round(sim.track.pitSpeed * MPH)} MPH` : 'SAINDO DO BOX';
      this.banner(t, '#0b4a86', by);
      if (ph === 'stop') {
        const k = 1 - p.pit.timer / p.pit.total;
        pill(x, w / 2 - 110, by + 20, 220, 8, 4); x.fillStyle = 'rgba(0,0,0,0.55)'; x.fill();
        pill(x, w / 2 - 110, by + 20, 220 * k, 8, 4);
        const g = x.createLinearGradient(w / 2 - 110, 0, w / 2 + 110, 0); g.addColorStop(0, '#2ecc71'); g.addColorStop(1, '#a6f07a');
        x.fillStyle = g; x.fill();
      }
    } else if (p.pitReq) {
      this.banner('BOX NESTA VOLTA · ' + serviceName(p.service).toUpperCase(), '#0b4a86', by);
    } else if (!p.dnf && p.fuel < 1.5 / sim.fuelLaps && sim.fuelLaps < 1e5 && Math.floor(sim.t * 2) % 2) {
      this.banner('COMBUSTÍVEL BAIXO · TOQUE EM BOX', '#8a1c0e', by);
    }
    if ((sim.state === 'formation' || sim.state === 'caution') && !p.finished && p.mode !== 'pit') {
      x.font = `700 12px ${F}`; x.textAlign = 'center';
      const t = 'Piloto automático sob amarela — toque em BOX para parar';
      const tw = x.measureText(t).width + 20;
      const yy = h * (cockpit ? 0.58 : 0.5) + (p.pitReq ? 22 : 0);
      pill(x, w / 2 - tw / 2, yy - 12, tw, 22, 11); x.fillStyle = 'rgba(8,12,20,0.55)'; x.fill();
      x.fillStyle = GOLD; x.textBaseline = 'middle'; x.fillText(t, w / 2, yy - 0.5);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    }
  }

  banner(t, bg, y) {
    const x = this.x, w = this.w;
    x.font = FI(14, 800);
    const tw = x.measureText(t).width + 40;
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.4)'; x.shadowBlur = 10;
    slant(x, w / 2 - tw / 2, y - 14, tw, 28, 8);
    const g = x.createLinearGradient(0, y - 14, 0, y + 14);
    g.addColorStop(0, shadeCss(bg, 1.35)); g.addColorStop(1, bg);
    x.fillStyle = g; x.fill();
    x.restore();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t, w / 2, y + 1);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }

  drawToasts(dt) {
    const x = this.x, w = this.w, h = this.h;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t -= dt; t.age += dt;
      if (t.t <= 0) this.toasts.splice(i, 1);
    }
    let ty = h * 0.2;
    for (const t of this.toasts) {
      const a = Math.min(1, t.t * 2, t.age * 5);
      const slide = (1 - Math.min(1, t.age * 5)) * 40;
      x.globalAlpha = a;
      x.font = FI(18, 900);
      const tw = x.measureText(t.text).width + 36;
      const x0 = w / 2 - tw / 2 + slide;
      slant(x, x0, ty - 15, tw, 30, 8);
      x.fillStyle = 'rgba(8,12,20,0.78)'; x.fill();
      slant(x, x0, ty - 15, 10, 30, 8);
      x.fillStyle = t.color; x.fill();
      x.fillStyle = t.color; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(t.text, x0 + tw / 2 + 4, ty + 1);
      ty += 36;
    }
    x.globalAlpha = 1; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }

  /* ============================================================
     Cockpit
     ============================================================ */
  drawCockpit(dt, sim, p, view, opts) {
    const x = this.x, w = this.w, h = this.h;
    if (!this.dash || this.dash.w !== w || this.dash.h !== h) this.buildDash();
    const D = this.dash;
    // tremor com a velocidade e nas batidas
    const vib = Math.min(1.6, p.v / 60) + (p.contact || 0) * 6 + (p.scrape || 0) * 3;
    const ox = (Math.random() - 0.5) * vib, oy = (Math.random() - 0.5) * vib;
    x.save(); x.translate(ox, oy);
    x.drawImage(D.cv, 0, 0, w, h);
    const needle = (g, val, min, max, a0, a1) => {
      const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
      const a = a0 + (a1 - a0) * t;
      const ex = g.x + Math.cos(a) * g.r * 0.82, ey = g.y + Math.sin(a) * g.r * 0.82;
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = Math.max(2, g.r * 0.07);
      x.beginPath(); x.moveTo(g.x + 2, g.y + 3); x.lineTo(ex + 2, ey + 3); x.stroke();
      x.strokeStyle = '#e8261a'; x.lineWidth = Math.max(2, g.r * 0.065);
      x.beginPath(); x.moveTo(g.x - Math.cos(a) * g.r * 0.15, g.y - Math.sin(a) * g.r * 0.15); x.lineTo(ex, ey); x.stroke();
      const hub = x.createRadialGradient(g.x - g.r * 0.04, g.y - g.r * 0.04, 1, g.x, g.y, g.r * 0.14);
      hub.addColorStop(0, '#666'); hub.addColorStop(1, '#0a0a0a');
      x.fillStyle = hub; x.beginPath(); x.arc(g.x, g.y, g.r * 0.13, 0, 7); x.fill();
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
    // vidro dos relógios (reflexo por cima dos ponteiros)
    x.drawImage(D.glass, 0, 0, w, h);
    // velocidade digital (LCD)
    const sp = opts.kmh ? Math.round(p.v * 3.6) : Math.round(p.v * MPH);
    x.font = `700 ${D.digH}px "Courier New", monospace`;
    x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,90,60,0.12)'; x.fillText('888', D.dig.x + D.dig.w - 6, D.dig.y + D.dig.h / 2 + 1);
    x.shadowColor = '#ff5a3c'; x.shadowBlur = 8;
    x.fillStyle = '#ff6a4c'; x.fillText(String(sp).padStart(3, ' '), D.dig.x + D.dig.w - 6, D.dig.y + D.dig.h / 2 + 1);
    x.shadowBlur = 0;
    x.textAlign = 'left';
    // luzes de aviso
    const warn = (L, on, col) => {
      x.beginPath(); x.arc(L.x, L.y, L.r, 0, 7);
      if (on) { x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 12; x.fill(); x.shadowBlur = 0; }
      else { x.fillStyle = 'rgba(60,10,10,0.9)'; x.fill(); }
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(L.x - L.r * 0.3, L.y - L.r * 0.3, L.r * 0.3, 0, 7); x.fill();
    };
    warn(D.lights[0], p.fuel < 0.12, '#ff3b1f');
    warn(D.lights[1], water > 235, '#ff3b1f');
    warn(D.lights[2], p.rpm > 9300, '#ffcc00');
    warn(D.lights[3], p.mode === 'pit', '#33ccff');
    // câmbio H: bola na marcha atual
    const S = D.shift;
    const gp = [[0, 0], [0, S.gy0], [0, S.gy1], [S.gx2, S.gy0], [S.gx2, S.gy1]][p.gear];
    const kb = x.createRadialGradient(S.x + gp[0] - S.r * 0.3, S.y + gp[1] - S.r * 0.3, 1, S.x + gp[0], S.y + gp[1], S.r * 1.3);
    kb.addColorStop(0, '#fff'); kb.addColorStop(0.5, '#9a9a9a'); kb.addColorStop(1, '#222');
    x.fillStyle = kb; x.beginPath(); x.arc(S.x + gp[0], S.y + gp[1], S.r * 1.2, 0, 7); x.fill();
    x.fillStyle = GOLD; x.font = FI(S.r * 2.2, 900);
    x.fillText(p.gear, S.x + S.gx2 + S.r * 2.2, S.y + S.gy0);
    // moldura do retrovisor
    if (view.mirror) {
      const r = view.mirrorRect();
      x.strokeStyle = '#0c0c0c'; x.lineWidth = 7;
      roundRectPath(x, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 8); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.15)'; x.lineWidth = 1;
      roundRectPath(x, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 6); x.stroke();
      x.fillStyle = '#0c0c0c'; x.fillRect(r.x + r.w / 2 - 4, 0, 8, r.y);
    }
    x.restore();
  }

  buildDash() {
    const w = this.w, h = this.h, dpr = this.dpr;
    const mk = () => { const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr; const x = c.getContext('2d'); x.scale(dpr, dpr); return [c, x]; };
    const [cv, x] = mk();
    const [gcv, gx2] = mk();
    const D = { cv, glass: gcv, w, h, g: {} };
    const dashTop = h * 0.68;

    // reflexo/sujeira leve no para-brisa
    const ws = x.createLinearGradient(0, 0, w, dashTop);
    ws.addColorStop(0, 'rgba(255,255,255,0.05)'); ws.addColorStop(0.5, 'rgba(255,255,255,0)'); ws.addColorStop(1, 'rgba(255,255,255,0.04)');
    x.fillStyle = ws; x.fillRect(0, 0, w, dashTop);

    // barra de cima (teto) com espuma
    const bar = (x0, y0, x1, y1, width) => {
      const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
      x.save(); x.translate(x0, y0); x.rotate(ang);
      const g = x.createLinearGradient(0, -width / 2, 0, width / 2);
      g.addColorStop(0, '#2a2a2a'); g.addColorStop(0.35, '#0e0e0e'); g.addColorStop(1, '#050505');
      x.fillStyle = g;
      roundRectPath(x, 0, -width / 2, len, width, width * 0.45); x.fill();
      // costura da espuma
      x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 1;
      x.setLineDash([4, 5]); x.beginPath(); x.moveTo(4, -width * 0.2); x.lineTo(len - 4, -width * 0.2); x.stroke(); x.setLineDash([]);
      x.restore();
    };
    x.fillStyle = '#060606'; x.fillRect(0, 0, w, h * 0.03);
    bar(-10, h * 0.03, w + 10, h * 0.03, h * 0.05);
    // colunas (A-pillars) e barra central do para-brisa
    bar(w * 0.72, -10, w * 0.81, dashTop, w * 0.045);
    bar(w * 0.54, -10, w * 0.595, dashTop * 0.78, w * 0.012);
    // lado esquerdo: coluna grossa e barra do banco (tipo "Earnhardt bar")
    bar(w * 0.09, -10, w * 0.03, h * 0.5, w * 0.1);
    bar(-10, h * 0.45, w * 0.1, dashTop, w * 0.06);
    // rede da janela à direita (malha diagonal)
    x.save();
    x.beginPath(); x.moveTo(w * 0.84, h * 0.04); x.lineTo(w, h * 0.04); x.lineTo(w, dashTop); x.lineTo(w * 0.83, dashTop); x.closePath(); x.clip();
    x.strokeStyle = 'rgba(15,15,15,0.92)'; x.lineWidth = 2.2;
    for (let i = -20; i < 30; i++) {
      x.beginPath(); x.moveTo(w * 0.8 + i * 14, h * 0.04); x.lineTo(w * 0.8 + i * 14 + dashTop, dashTop + h * 0.04); x.stroke();
      x.beginPath(); x.moveTo(w * 0.8 + i * 14, h * 0.04); x.lineTo(w * 0.8 + i * 14 - dashTop, dashTop + h * 0.04); x.stroke();
    }
    x.restore();
    x.fillStyle = '#0a0a0a';
    x.beginPath(); x.moveTo(w, 0); x.lineTo(w * 0.965, 0); x.lineTo(w * 0.985, dashTop); x.lineTo(w, dashTop); x.fill();

    // topo do painel (couro/vinil preto)
    const top = x.createLinearGradient(0, dashTop - h * 0.07, 0, dashTop + h * 0.02);
    top.addColorStop(0, '#2b2b2b'); top.addColorStop(1, '#0d0d0d');
    x.fillStyle = top;
    x.beginPath();
    x.moveTo(0, dashTop - h * 0.02);
    x.quadraticCurveTo(w * 0.5, dashTop - h * 0.075, w, dashTop - h * 0.02);
    x.lineTo(w, h); x.lineTo(0, h); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, dashTop - h * 0.02); x.quadraticCurveTo(w * 0.5, dashTop - h * 0.075, w, dashTop - h * 0.02); x.stroke();

    // chapa de alumínio escovado
    const panel = () => {
      x.beginPath();
      x.moveTo(w * 0.08, dashTop + h * 0.012);
      x.quadraticCurveTo(w * 0.5, dashTop - h * 0.042, w * 0.99, dashTop + h * 0.012);
      x.lineTo(w * 0.99, h); x.lineTo(w * 0.08, h); x.closePath();
    };
    panel();
    const pg = x.createLinearGradient(0, dashTop, 0, h);
    pg.addColorStop(0, '#b9bcc1'); pg.addColorStop(0.35, '#dfe2e6'); pg.addColorStop(0.6, '#a9adb3'); pg.addColorStop(1, '#8a8e94');
    x.fillStyle = pg; x.fill();
    x.save(); panel(); x.clip();
    for (let yy = dashTop - h * 0.05; yy < h; yy += 1.5) {
      x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.07})`;
      x.fillRect(0, yy, w, 1);
    }
    // reflexo diagonal
    const rf = x.createLinearGradient(w * 0.2, dashTop, w * 0.5, h);
    rf.addColorStop(0, 'rgba(255,255,255,0)'); rf.addColorStop(0.5, 'rgba(255,255,255,0.18)'); rf.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rf; x.fillRect(0, dashTop - h * 0.05, w, h);
    x.restore();
    // borda e rebites
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2; panel(); x.stroke();
    for (let i = 0; i < 24; i++) {
      const rx = w * (0.1 + i * 0.037), ry = h - 7;
      const rg = x.createRadialGradient(rx - 0.6, ry - 0.6, 0.2, rx, ry, 2.4);
      rg.addColorStop(0, '#fff'); rg.addColorStop(1, '#555');
      x.fillStyle = rg; x.beginPath(); x.arc(rx, ry, 2.2, 0, 7); x.fill();
    }

    const gh = h - dashTop;
    const R = Math.min(gh * 0.42, w * 0.058);
    const cy = dashTop + gh * 0.52;
    const gauge = (cx, r, label, ticks, a0, a1, big, red) => {
      // sombra embaixo
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(cx + 2, cy + 4, r * 1.14, 0, 7); x.fill();
      // aro cromado
      const bz = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      bz.addColorStop(0, '#fdfdfd'); bz.addColorStop(0.45, '#8a8f96'); bz.addColorStop(0.55, '#5b6068'); bz.addColorStop(1, '#e6e8eb');
      x.fillStyle = bz; x.beginPath(); x.arc(cx, cy, r * 1.13, 0, 7); x.fill();
      x.fillStyle = '#141414'; x.beginPath(); x.arc(cx, cy, r * 1.03, 0, 7); x.fill();
      // mostrador
      const face = x.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
      face.addColorStop(0, '#ffffff'); face.addColorStop(1, '#dcdcd4');
      x.fillStyle = face; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      if (red) {
        x.strokeStyle = '#e8261a'; x.lineWidth = r * 0.1;
        x.beginPath(); x.arc(cx, cy, r * 0.87, a0 + (a1 - a0) * red, a1); x.stroke();
      }
      x.strokeStyle = '#111'; x.fillStyle = '#111';
      x.font = `800 ${Math.max(8, r * (big ? 0.19 : 0.21))}px ${F}`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const n = (ticks.length - 1) * 4;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n;
        const major = i % 4 === 0;
        x.lineWidth = major ? 2 : 1;
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94);
        x.lineTo(cx + Math.cos(a) * r * (major ? 0.78 : 0.86), cy + Math.sin(a) * r * (major ? 0.78 : 0.86)); x.stroke();
        if (major) { const t = ticks[i / 4]; if (t !== '') x.fillText(t, cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6); }
      }
      x.font = `800 ${Math.max(6.5, r * 0.14)}px ${F}`;
      x.fillStyle = '#333';
      label.split('\n').forEach((ln, i) => x.fillText(ln, cx, cy + r * (0.42 + i * 0.16)));
      // vidro (no canvas de reflexo, desenhado por cima dos ponteiros)
      const gl = gx2.createLinearGradient(cx - r, cy - r, cx + r * 0.3, cy + r * 0.3);
      gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.08)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      gx2.fillStyle = gl;
      gx2.beginPath(); gx2.arc(cx, cy, r * 0.97, Math.PI * 0.9, Math.PI * 1.8); gx2.arc(cx + r * 0.14, cy + r * 0.2, r * 0.92, Math.PI * 1.8, Math.PI * 0.9, true); gx2.fill();
      return { x: cx, y: cy, r };
    };
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    let gx = w / 2 - R * 2.25;
    D.g.fuel = gauge(gx, R * 0.85, 'FUEL', ['E', '', '½', '', 'F'], A0, A1);
    gx += R * 2.25;
    D.g.tach = gauge(gx, R * 1.25, 'RPM\nx1000', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], Math.PI * 0.62, Math.PI * 2.1, true, 0.92);
    gx += R * 2.3;
    D.g.oilp = gauge(gx, R * 0.85, 'OIL\nPRESSURE', ['20', '50', '80', '110', '140'], A0, A1);
    gx += R * 1.95;
    D.g.oilt = gauge(gx, R * 0.85, 'OIL\nTEMP', ['100', '150', '200', '250', '300'], A0, A1, false, 0.85);
    gx += R * 1.95;
    D.g.water = gauge(gx, R * 0.85, 'WATER\nTEMP', ['150', '175', '200', '225', '250'], A0, A1, false, 0.85);
    // velocímetro digital (LCD vermelho)
    const dw = R * 1.35, dh = R * 0.46;
    D.dig = { x: Math.max(w * 0.1, D.g.fuel.x - R * 0.9 - dw * 0.5), y: dashTop + gh * 0.06, w: dw, h: dh };
    x.fillStyle = '#2c2f33'; roundRectPath(x, D.dig.x - 3, D.dig.y - 3, dw + 6, dh + 6, 6); x.fill();
    x.fillStyle = '#0a0506'; roundRectPath(x, D.dig.x, D.dig.y, dw, dh, 4); x.fill();
    x.fillStyle = '#e8261a'; x.font = `800 ${dh * 0.3}px ${F}`;
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('MPH', D.dig.x + 5, D.dig.y + dh * 0.5);
    D.digH = dh * 0.78;
    // luzes de aviso com moldura
    D.lights = [];
    for (let i = 0; i < 4; i++) {
      const L = { x: D.g.tach.x - R * 0.9 + i * R * 0.6, y: dashTop + gh * 0.07, r: R * 0.1 };
      x.fillStyle = '#6a6e74'; x.beginPath(); x.arc(L.x, L.y, L.r * 1.5, 0, 7); x.fill();
      x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(L.x, L.y, L.r * 1.2, 0, 7); x.fill();
      D.lights.push(L);
    }
    // chaves (toggle switches) do lado direito
    const swx0 = D.g.water.x + R * 1.3;
    const labels = ['IGN', 'FUEL', 'FAN', 'START'];
    for (let i = 0; i < 4 && swx0 + i * R * 0.5 < w * 0.985; i++) {
      const sx = swx0 + i * R * 0.5, sy = cy + R * 0.1;
      x.fillStyle = '#2a2d31'; roundRectPath(x, sx - R * 0.16, sy - R * 0.36, R * 0.32, R * 0.72, 4); x.fill();
      const lg = x.createLinearGradient(sx - 3, 0, sx + 3, 0); lg.addColorStop(0, '#fff'); lg.addColorStop(1, '#777');
      x.fillStyle = lg; roundRectPath(x, sx - R * 0.05, sy - R * 0.32, R * 0.1, R * 0.34, 3); x.fill();
      x.fillStyle = i === 3 ? '#e8261a' : '#222'; x.font = `800 ${R * 0.13}px ${F}`; x.textAlign = 'center';
      x.fillText(labels[i], sx, sy + R * 0.52);
    }
    // câmbio em H
    const sx = Math.max(w * 0.11, D.g.fuel.x - R * 1.9), sy = cy + R * 0.05;
    const S = { x: sx, y: sy, gx2: R * 0.6, gy0: -R * 0.48, gy1: R * 0.48, r: R * 0.12 };
    const plate = x.createLinearGradient(0, sy - R * 0.8, 0, sy + R * 0.8);
    plate.addColorStop(0, '#3a3d42'); plate.addColorStop(1, '#16181b');
    x.fillStyle = plate; roundRectPath(x, sx - R * 0.35, sy - R * 0.8, R * 1.3, R * 1.6, 8); x.fill();
    x.strokeStyle = '#0a0a0a'; x.lineWidth = R * 0.1; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(sx, sy - R * 0.48); x.lineTo(sx, sy + R * 0.48);
    x.moveTo(sx + S.gx2, sy - R * 0.48); x.lineTo(sx + S.gx2, sy + R * 0.48);
    x.moveTo(sx, sy); x.lineTo(sx + S.gx2, sy); x.stroke();
    x.fillStyle = '#d9dde3'; x.font = `800 ${R * 0.19}px ${F}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('1', sx - R * 0.22, sy - R * 0.5); x.fillText('2', sx - R * 0.22, sy + R * 0.5);
    x.fillText('3', sx + S.gx2 + R * 0.2, sy - R * 0.5); x.fillText('4', sx + S.gx2 + R * 0.2, sy + R * 0.5);
    x.textAlign = 'left';
    D.shift = S;
    this.dash = D;
  }
}

/* ---------------- utilidades de desenho ---------------- */
function slant(x, a, b, w, h, k) {
  x.beginPath();
  x.moveTo(a + k, b); x.lineTo(a + w, b); x.lineTo(a + w - k, b + h); x.lineTo(a, b + h); x.closePath();
}
function pill(x, a, b, w, h, r) { roundRectPath(x, a, b, Math.max(w, 2 * r), h, r); }
function roundRectPath(x, a, b, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
  x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
  x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
  x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b); x.closePath();
}
function miniBar(x, bx, by, bw, label, v, col, sc) {
  x.font = `800 ${8 * sc}px ${F}`; x.fillStyle = '#9fb3d9'; x.textBaseline = 'alphabetic';
  x.fillText(label, bx, by);
  pill(x, bx, by + 4, bw, 6 * sc, 3 * sc); x.fillStyle = 'rgba(255,255,255,0.1)'; x.fill();
  pill(x, bx, by + 4, Math.max(0.01, bw * Math.max(0, Math.min(1, v))), 6 * sc, 3 * sc); x.fillStyle = col; x.fill();
}
function chip(x, cx, cy, t, col, sc) {
  x.font = `800 ${8.5 * sc}px ${F}`;
  const tw = x.measureText(t).width + 12;
  pill(x, cx, cy, tw, 14 * sc, 7 * sc);
  x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 8; x.fill(); x.shadowBlur = 0;
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillText(t, cx + 6, cy + 7.5 * sc);
  x.textBaseline = 'alphabetic';
}
function contrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return r * 0.3 + g * 0.59 + b * 0.11 > 150 ? '#111' : '#fff';
}
function shadeCss(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function fmtClock(t) {
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
