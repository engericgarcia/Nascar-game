/* ============================================================
   main.js - menus, campeonato, laço principal do jogo.
   ============================================================ */
import { TRACKS, makeField, MPH } from './data.js';
import { Track } from './track.js';
import { RaceSim, serviceName } from './sim.js';
import { View, CAM_NAMES } from './view.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const LS_SET = 'oval500.settings', LS_SEASON = 'oval500.season';

const LAPS = {
  superspeedway: [4, 8, 16, 30],
  intermediate: [5, 10, 20, 40],
  shorttrack: [10, 25, 50, 100],
  paperclip: [10, 25, 50, 100]
};

const settings = Object.assign({
  assist: true, brakeAssist: true, autoGas: false, tilt: false, sound: true, voice: true, kmh: false,
  stages: true, fuel: 'scaled', quality: isMobile() ? 1 : 2, name: 'Você', cam: 'chase'
}, load(LS_SET) || {});

function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100); }

let view = null, hud = null, sim = null, track = null;
let running = false, paused = false, lastT = 0;
let race = null;         // config da corrida atual
let selTrack = 0;
let seasonMode = false;

/* ---------------- telas ---------------- */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
  $('controls').classList.toggle('hidden', id !== null || !running);
}
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  Sound.init();
  const go = b.dataset.go;
  if (!$('settings').classList.contains('hidden')) saveSettingsFromUI();
  if (go === 'quick') { seasonMode = false; openSetup(); }
  else if (go === 'season') openSeason();
  else if (go === 'settings') openSettings();
  else show(go);
}));

function openSetup(fixedTrack) {
  $('setupTitle').textContent = seasonMode ? 'Campeonato — ' + TRACKS[fixedTrack].name : 'Corrida rápida';
  const list = $('trackList');
  list.innerHTML = '';
  TRACKS.forEach((t, i) => {
    if (seasonMode && i !== fixedTrack) return;
    const d = document.createElement('div');
    d.className = 'track' + (i === selTrack ? ' sel' : '');
    d.innerHTML = `<b>${t.name}</b><small>${t.ref}</small><small>${t.kind} · ${t.desc}</small>`;
    const cv = document.createElement('canvas');
    d.appendChild(cv);
    requestAnimationFrame(() => drawTrackThumb(cv, t));
    d.onclick = () => { selTrack = i; openSetup(fixedTrack); };
    list.appendChild(d);
  });
  if (seasonMode) selTrack = fixedTrack;
  const sel = $('optLaps');
  const opts = LAPS[TRACKS[selTrack].id];
  const prev = sel.selectedIndex >= 0 ? sel.selectedIndex : 1;
  sel.innerHTML = opts.map((n, i) => `<option value="${n}">${n} voltas${['  (curta)', '', '', '  (longa)'][i]}</option>`).join('');
  sel.selectedIndex = prev;
  $('optCars').disabled = seasonMode;
  show('setup');
}

const thumbCache = {};
function drawTrackThumb(cv, def) {
  const w = cv.clientWidth || 160, h = cv.clientHeight || 70;
  cv.width = w * 2; cv.height = h * 2;
  const x = cv.getContext('2d');
  const tr = thumbCache[def.id] || (thumbCache[def.id] = new Track(def));
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < tr.N; i++) { minx = Math.min(minx, tr.px[i]); maxx = Math.max(maxx, tr.px[i]); minz = Math.min(minz, tr.pz[i]); maxz = Math.max(maxz, tr.pz[i]); }
  const k = Math.min((cv.width - 20) / (maxx - minx), (cv.height - 20) / (maxz - minz));
  const ox = (cv.width - (maxx - minx) * k) / 2, oz = (cv.height - (maxz - minz) * k) / 2;
  x.lineWidth = 8; x.strokeStyle = '#555c68'; x.lineJoin = 'round';
  x.beginPath();
  for (let i = 0; i < tr.N; i += 3) { const a = ox + (tr.px[i] - minx) * k, b = oz + (tr.pz[i] - minz) * k; i ? x.lineTo(a, b) : x.moveTo(a, b); }
  x.closePath(); x.stroke();
  x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#ffd21f';
  x.fillRect(ox + (tr.px[0] - minx) * k - 4, oz + (tr.pz[0] - minz) * k - 4, 8, 8);
}

$('btnStart').onclick = () => {
  Sound.init();
  const cfg = {
    track: selTrack,
    laps: +$('optLaps').value,
    cars: seasonMode ? (load(LS_SEASON) || {}).cars || 30 : +$('optCars').value,
    difficulty: $('optDiff').value,
    gridPos: $('optGrid').value
  };
  startRace(cfg);
};

/* ---------------- ajustes ---------------- */
function openSettings() {
  $('setAssist').checked = settings.assist;
  $('setAutoGas').checked = settings.autoGas;
  $('setBrakeAssist').checked = settings.brakeAssist;
  $('setTilt').checked = settings.tilt;
  $('setSound').checked = settings.sound;
  $('setVoice').checked = settings.voice;
  $('setKmh').checked = settings.kmh;
  $('setStages').checked = settings.stages;
  $('setFuel').value = settings.fuel;
  $('setQuality').value = settings.quality;
  $('setName').value = settings.name;
  show('settings');
}
$('setTilt').addEventListener('change', async e => {
  if (e.target.checked) {
    const ok = await Input.enableTilt();
    if (!ok) { e.target.checked = false; alert('O aparelho não liberou o sensor de inclinação.'); }
  }
});
function saveSettingsFromUI() {
  settings.assist = $('setAssist').checked;
  settings.autoGas = $('setAutoGas').checked;
  settings.brakeAssist = $('setBrakeAssist').checked;
  settings.tilt = $('setTilt').checked;
  settings.sound = $('setSound').checked;
  settings.voice = $('setVoice').checked;
  settings.kmh = $('setKmh').checked;
  settings.stages = $('setStages').checked;
  settings.fuel = $('setFuel').value;
  const q = +$('setQuality').value;
  if (q !== settings.quality && view) { stopDemo(); view.renderer.dispose(); view = null; settings.quality = q; startDemo(); }
  settings.quality = q;
  settings.name = $('setName').value.trim() || 'Você';
  save(LS_SET, settings);
  applySettings();
}
function applySettings() {
  Input.assist = settings.assist;
  Input.autoGas = settings.autoGas;
  Input.brakeAssist = settings.brakeAssist;
  Input.tilt = settings.tilt;
  Sound.setMuted(!settings.sound);
  Sound.voice = settings.voice;
}
applySettings();

/* ---------------- campeonato ---------------- */
function newSeason(cars) {
  const s = { cars: cars || 30, round: 0, schedule: [0, 1, 2, 3], points: {}, wins: {}, history: [] };
  save(LS_SEASON, s);
  return s;
}
function openSeason() {
  seasonMode = true;
  let s = load(LS_SEASON) || newSeason(30);
  const field = makeField(s.cars, settings.name);
  const tbl = field.map(f => ({ f, pts: s.points[f.num] || 0, w: s.wins[f.num] || 0 }))
    .sort((a, b) => b.pts - a.pts || b.w - a.w);
  const done = s.round >= s.schedule.length;
  let html = `<div class="row">` + s.schedule.map((ti, i) =>
    `<span class="pill" style="${i === s.round ? 'background:#a10f0f' : ''}">${i + 1}. ${TRACKS[ti].name}${s.history[i] ? ' — ' + s.history[i] + 'º' : ''}</span>`).join('') + `</div>`;
  if (done) html += `<h3 style="text-align:center">🏆 Campeão: ${tbl[0].f.player ? 'VOCÊ!' : '#' + tbl[0].f.num + ' ' + tbl[0].f.name}</h3>`;
  html += `<table class="res"><tr><th>#</th><th>Carro</th><th>Piloto</th><th class="n">Vitórias</th><th class="n">Pontos</th></tr>` +
    tbl.slice(0, 40).map((r, i) => `<tr class="${r.f.player ? 'me' : ''}"><td>${i + 1}</td><td><span class="sw" style="background:${r.f.color}"></span>${r.f.num}</td><td>${r.f.player ? settings.name : r.f.name}</td><td class="n">${r.w}</td><td class="n">${r.pts}</td></tr>`).join('') + `</table>`;
  $('seasonInfo').innerHTML = html;
  $('btnSeasonGo').classList.toggle('hidden', done);
  show('season');
}
$('btnSeasonReset').onclick = () => {
  const n = prompt('Quantos carros no campeonato? (20, 30 ou 40)', '30');
  const c = [20, 30, 40].includes(+n) ? +n : 30;
  newSeason(c); openSeason();
};
$('btnSeasonGo').onclick = () => {
  const s = load(LS_SEASON) || newSeason(30);
  openSetup(s.schedule[s.round]);
};

/* ---------------- corrida ---------------- */
function startRace(cfg) {
  race = cfg;
  show('loading');
  setTimeout(() => {
    try { buildRace(cfg); }
    catch (e) { console.error(e); alert('Erro ao montar a corrida: ' + e.message); show('menu'); }
  }, 30);
}

function buildRace(cfg) {
  stopDemo();
  if (!view) {
    view = new View($('gl'), settings.quality);
    hud = new Hud($('hud'));
  } else view.dispose();
  const def = TRACKS[cfg.track];
  track = new Track(def);
  const field = makeField(cfg.cars, settings.name);
  sim = new RaceSim(track, field, {
    laps: cfg.laps, difficulty: cfg.difficulty, gridPos: cfg.gridPos,
    fuel: settings.fuel === 'scaled' ? 'scaled' : settings.fuel, stages: settings.stages
  });
  view.setup(track, sim);
  view.camMode = settings.cam || 'chase';
  view.focus = null;
  $('camName').textContent = CAM_NAMES[view.camMode];
  updateBoxUI();
  running = true; paused = false;
  lastT = performance.now();
  spotPrev = { left: false, right: false };
  show(null);
  checkRotate();
  measure();
  requestWake();
  try { if (isMobile() && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* ok */ }
}

Input.init();
Input.onCam = () => {
  if (!running) return;
  view.cycleCam();
  settings.cam = view.camMode; save(LS_SET, settings);
  $('camName').textContent = CAM_NAMES[view.camMode];
  hud.toast(CAM_NAMES[view.camMode], '#9fd');
};
Input.onBox = () => {
  if (!running || !sim) return;
  const p = sim.player;
  if (p.mode === 'pit') return;
  p.pitReq = !p.pitReq;
  hud.toast(p.pitReq ? 'Box nesta volta' : 'Box cancelado', '#6cf');
  if (p.pitReq) Sound.say('Entendido, box nesta volta.', true);
  updateBoxUI();
};
Input.onService = () => {
  if (!running || !sim) return;
  const p = sim.player;
  if (p.mode === 'pit' && p.pit && p.pit.phase === 'stop') return;
  const order = ['four', 'two', 'fuel'];
  p.service = order[(order.indexOf(p.service) + 1) % 3];
  updateBoxUI();
};
Input.onPause = () => { if (running) setPause(!paused); };

function updateBoxUI() {
  if (!sim) return;
  const p = sim.player;
  $('svcName').textContent = { four: '4 pneus + gás', two: '2 pneus + gás', fuel: 'Só gasolina' }[p.service];
  $('btnBox').classList.toggle('on', !!p.pitReq);
}

function setPause(v) {
  paused = v;
  if (v) { show('pause'); Sound.update(sim.player, 0, 0, false); }
  else { show(null); lastT = performance.now(); }
}
$('btnResume').onclick = () => setPause(false);
$('btnCamP').onclick = () => { Input.onCam(); };
$('btnRestart').onclick = () => { running = false; startRace(race); };
$('btnQuit').onclick = () => { running = false; Sound.update(sim.player, 0, 0, false); show('menu'); startDemo(); };

document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused) setPause(true); });
window.addEventListener('resize', () => { if (view) view.resize(); if (hud) hud.resize(); checkRotate(); measure(); });

/* espaço livre entre o volante e os pedais (para o velocímetro) */
const layout = { top: 50, mid: 0 };
function measure() {
  if ($('controls').classList.contains('hidden')) return;
  const a = $('steer').getBoundingClientRect(), b = $('pedals').getBoundingClientRect(), t = $('topbar').getBoundingClientRect();
  layout.mid = (a.right + b.left) / 2;
  layout.top = t.bottom + 4;
}

function checkRotate() {
  $('rotate').classList.toggle('hidden', !(running && isMobile() && window.innerHeight > window.innerWidth));
}

let wakeLock = null;
async function requestWake() {
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch (e) { /* ok */ }
}

/* ---------------- laço principal ---------------- */
let spotPrev = { left: false, right: false }, spotClearT = 0;
let fpsAcc = 0, fpsN = 0;

/* ---------------- corrida de demonstração no fundo do menu ---------------- */
let demo = null, demoLast = 0;
function startDemo() {
  if (running) return;
  try {
    if (!view) { view = new View($('gl'), settings.quality); hud = new Hud($('hud')); }
    else view.dispose();
    const ti = Math.floor(Math.random() * TRACKS.length);
    const tr = new Track(TRACKS[ti]);
    const sm = new RaceSim(tr, makeField(24, 'Demo'), { laps: 999, difficulty: 'dificil', gridPos: 'meio', fuel: 'off', stages: false, demo: true });
    const inp = { steer: 0, throttle: 0, brake: 0, assist: true };
    for (let i = 0; i < 4000 && sm.state !== 'green'; i++) sm.update(1 / 20, inp);
    for (let i = 0; i < 200; i++) sm.update(1 / 20, inp);
    sm.events.length = 0;
    track = tr;
    view.setup(tr, sm);
    demo = { sim: sm, t: 0, cam: 0, inp };
    demoShot();
    $('gl').classList.add('demo');
    const hx = hud.x; hx.setTransform(1, 0, 0, 1, 0, 0); hx.clearRect(0, 0, hud.cv.width, hud.cv.height);
  } catch (e) { console.error(e); demo = null; }
}
function demoShot() {
  const cams = ['tv', 'heli', 'chase', 'tv'];
  view.camMode = cams[demo.cam % cams.length];
  const rk = demo.sim.ranking || demo.sim.cars;
  view.focus = rk[Math.floor(Math.random() * Math.min(10, rk.length))];
  view.first = true;
  demo.cam++;
}
function stopDemo() { demo = null; $('gl').classList.remove('demo'); if (view) view.focus = null; }

function frame(now) {
  requestAnimationFrame(frame);
  if (demo && !running) {
    let dt = Math.min(0.05, (now - demoLast) / 1000); demoLast = now;
    if (dt <= 0) return;
    demo.sim.update(dt, demo.inp);
    demo.sim.events.length = 0; demo.sim.hit = null;
    demo.t += dt;
    if (demo.t > 7) { demo.t = 0; demoShot(); }
    view.update(dt);
    view.render();
    return;
  }
  if (!running || paused) return;
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  const inp = Input.update(dt);
  sim.update(dt, inp);

  // eventos da corrida
  for (const e of sim.events) {
    hud.toast(e.text, e.color);
    if (e.speak) Sound.say(e.speak, true);
    if (/VERDE|verde/.test(e.text)) { hud.greenFlash = true; setTimeout(() => hud && (hud.greenFlash = false), 3000); }
  }
  sim.events.length = 0;
  if (sim.hit) { Sound.crash(sim.hit.power); if (navigator.vibrate) navigator.vibrate(Math.min(200, sim.hit.power * 15)); sim.hit = null; }
  updateBoxUI();

  view.update(dt);
  view.render();
  hud.draw(dt, sim, view, { kmh: settings.kmh, bottomPad: 0, topButtons: layout.top, midX: layout.mid });

  // spotter
  const sp = hud.spot || {};
  if (sim.player.mode !== 'pit') {
    if (sp.left && sp.right && !(spotPrev.left && spotPrev.right)) Sound.say('Três lado a lado!');
    else if (sp.left && !spotPrev.left) Sound.say('Carro por dentro');
    else if (sp.right && !spotPrev.right) Sound.say('Carro por fora');
    if ((spotPrev.left || spotPrev.right) && !sp.left && !sp.right) spotClearT = now;
    if (spotClearT && now - spotClearT > 500 && !sp.left && !sp.right) { Sound.say('Livre'); spotClearT = 0; }
    if (sp.left || sp.right) spotClearT = spotClearT && (sp.left || sp.right) ? 0 : spotClearT;
  }
  spotPrev = { left: !!sp.left, right: !!sp.right };

  // som
  let near = 0, packRpm = 0;
  const p = sim.player;
  for (const c of sim.cars) {
    if (c === p || c.dnf) continue;
    const ds = Math.abs(track.delta(p.s, c.s));
    if (ds < 60) { near += 1 - ds / 60; packRpm += c.rpm * (1 - ds / 60); }
  }
  Sound.update(p, near, near ? packRpm / near : 0, true);

  if (sim.done) finishRace();
}
requestAnimationFrame(frame);
setTimeout(startDemo, 50);

/* ---------------- resultado ---------------- */
function finishRace() {
  running = false;
  Sound.update(sim.player, 0, 0, false);
  const res = sim.results();
  const me = res.find(r => r.player);
  const def = track.def;
  $('resTitle').textContent = `${def.name} — ${me.pos}º lugar`;
  const fmt = t => t ? t.toFixed(3) + 's' : '—';
  const mph = t => t ? (track.L / t * MPH).toFixed(1) : '—';
  let html = '';
  if (sim.stageResults.length) {
    html += '<div class="row">' + sim.stageResults.map(s => `<span class="pill">Estágio ${s.stage}: #${s.top[0]} vence</span>`).join('') + '</div>';
  }
  const best = res.find(r => r.fastest);
  if (best) html += `<div class="row"><span class="pill">Volta mais rápida: #${best.num} ${fmt(best.best)} (${mph(best.best)} mph)</span><span class="pill">Suas paradas: ${sim.player.pitStops}</span></div>`;
  html += `<table class="res"><tr><th>Pos</th><th>Carro</th><th>Piloto</th><th class="n">Larg.</th><th class="n">Voltas</th><th class="n">Lid.</th><th>Situação</th><th class="n">Melhor</th><th class="n">Pts</th></tr>` +
    res.map(r => `<tr class="${r.player ? 'me' : ''}"><td>${r.pos}</td><td><span class="sw" style="background:${r.color}"></span>${r.num}</td><td>${r.player ? settings.name : r.name}</td><td class="n">${r.start}</td><td class="n">${r.laps}</td><td class="n">${r.led}</td><td>${r.status}</td><td class="n">${fmt(r.best)}</td><td class="n">${r.points}</td></tr>`).join('') + '</table>';
  $('resBody').innerHTML = html;

  if (seasonMode) {
    const s = load(LS_SEASON) || newSeason(30);
    if (s.round < s.schedule.length) {
      res.forEach(r => {
        s.points[r.num] = (s.points[r.num] || 0) + r.points;
        if (r.pos === 1) s.wins[r.num] = (s.wins[r.num] || 0) + 1;
      });
      s.history[s.round] = me.pos;
      s.round++;
      save(LS_SEASON, s);
    }
    $('btnResNext').textContent = 'Classificação ›';
  } else $('btnResNext').textContent = 'Correr de novo ›';
  show('results');
}
$('btnResMenu').onclick = () => { show('menu'); startDemo(); };
$('btnResNext').onclick = () => { if (seasonMode) openSeason(); else startRace(race); };

// Test hook para depuração no navegador
window.__game = { get sim() { return sim; }, get view() { return view; }, settings };
