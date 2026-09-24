/* ============================================================
   sim.js - a corrida: física dos carros no espaço da pista,
   vácuo, batidas, IA, box, bandeiras, carro-madrinha,
   estágios e relargadas em fila dupla.
   ============================================================ */
import { finishPoints, stagePoints } from './data.js';
import { CAR_LEN, CAR_WID } from './cars.js';

const G = 9.81;
const CD = 0.00045;           // arrasto aerodinâmico (por massa)
const ROLL = 0.12;            // resistência ao rolamento
const PWR = 322;              // potência / massa (670 cv, 1550 kg)
const BRAKE = 12.5;
const DT = 1 / 120;

const DIFF = {
  facil: { pace: 0.93, power: 0.95, err: 0.4 },
  medio: { pace: 0.972, power: 0.985, err: 0.8 },
  dificil: { pace: 0.995, power: 1.0, err: 1.1 }
};

export class RaceSim {
  constructor(track, field, opts) {
    this.track = track;
    this.opts = opts;
    this.t = 0;
    this.events = [];
    const L = track.L;
    const diff = DIFF[opts.difficulty] || DIFF.medio;
    this.diff = diff;
    this.laps = opts.laps;
    this.extensions = 0;

    // janela de combustível
    const realFuel = { superspeedway: 38, intermediate: 55, shorttrack: 120, paperclip: 100 }[track.def.id] || 50;
    this.fuelLaps = opts.fuel === 'real' ? realFuel : Math.max(4, Math.round(opts.laps * 0.55));
    if (opts.fuel === 'off') this.fuelLaps = 1e6;
    this.tireLaps = opts.fuel === 'off' ? 1e6 : this.fuelLaps * 1.6;

    // perfis de velocidade para 3 faixas
    const W = track.W;
    this.lanes = [-W / 2 + 2, 0, W / 2 - 2];
    this.profiles = this.lanes.map(d => track.speedProfile(d, 1, 10.5));

    // estágios (25% e 50% da corrida, como na Cup)
    this.stages = opts.stages && opts.laps >= 16 ? [Math.round(opts.laps * 0.25), Math.round(opts.laps * 0.5)] : [];
    this.stageDone = [];
    this.stageResults = [];

    // monta os carros na ordem do grid
    const ai = field.slice(1).map((f, i) => ({ f, r: f.skill }));
    ai.sort((a, b) => b.r - a.r);
    const order = ai.map(a => a.f);
    let pPos = opts.gridPos === 'pole' ? 0 : opts.gridPos === 'meio' ? Math.floor(field.length / 2) : field.length - 1;
    if (opts.gridPos === 'aleatorio') pPos = Math.floor(Math.random() * field.length);
    order.splice(pPos, 0, field[0]);

    this.cars = order.map((f, i) => {
      const r = (f.skill - 0.93) / 0.07;
      return {
        info: f, idx: i, player: !!f.player,
        s: 0, d: 0, v: 0, psi: 0, lap: 0, dist: 0,
        fuel: 1, tire: 1, damage: 0,
        mode: 'race', pit: null, pitReq: false, service: 'four',
        steer: 0, throttle: 0, brake: 0, cDes: 0,
        gear: 1, rpm: 0, draft: 0, over: 0, contact: 0,
        pace: f.player ? 1 : diff.pace * (0.975 + 0.025 * r),
        power: f.player ? 1 : diff.power * (0.975 + 0.025 * r),
        dPref: -W / 2 + 1.8 + Math.random() * W * 0.25,
        dTarget: 0, passT: 0, wobble: Math.random() * 10,
        spinRate: 0, slide: 0, recoverT: 0,
        finished: false, finishPos: 0, finishT: 0,
        lapStart: 0, lastLap: 0, bestLap: 0,
        stall: i, lapsLed: 0, points: 0, stagePts: 0,
        startPos: i + 1, pos: i + 1, pitStops: 0, dnf: false
      };
    });
    this.player = this.cars.find(c => c.player);
    this.n = this.cars.length;

    // grid: fila dupla na reta oposta atrás do carro-madrinha
    const s0 = track.wrap(track.pitStart - Math.max(420, L * 0.22));
    this.cars.forEach((c, i) => {
      const row = Math.floor(i / 2);
      c.s = track.wrap(s0 - 12 - row * 10);
      c.d = i % 2 === 0 ? -W / 2 + 2.2 : -W / 2 + 5.4;
      c.dTarget = c.d;
      c.v = 0;
    });
    this.paceSpeed = L > 3000 ? 52 : L > 2000 ? 44 : 25;
    this.paceCar = { s: s0, d: -W / 2 + 3.8, v: 0, active: true, leaving: false, psi: 0 };

    this.state = 'formation';       // formation | green | caution | finished
    this.flag = 'yellow';
    this.cautionLaps = 1;           // volta de apresentação
    this.cautionPending = -1;
    this.doubleFile = true;
    this.finishOrder = [];
    this.checkered = false;
    this.leaderLap = 0;
    this.order = this.cars.slice();
    this.msg('Volta de apresentação', '#ffd400', 'Motores ligados. Volta de apresentação.');
  }

  msg(text, color, speak) { this.events.push({ text, color, speak }); }

  /* ============================================================ */
  update(dt, input) {
    let acc = Math.min(dt, 0.1);
    while (acc > 1e-6) {
      const h = Math.min(DT, acc);
      this.step(h, input);
      acc -= h;
    }
  }

  step(dt, input) {
    const tr = this.track;
    this.t += dt;
    this.updatePaceCar(dt);

    // ordem física na pista (para seguir o da frente)
    const onTrack = this.order.filter(c => c.mode !== 'dnf' && c.mode !== 'pit' && !c.finished);

    for (const c of this.cars) {
      if (c.mode === 'dnf') continue;
      this.control(c, dt, input, onTrack);
      this.physics(c, dt);
    }
    this.collisions(dt);
    this.computeOrder();
    this.raceControl(dt);
  }

  /* ---------------- controle (IA / jogador / piloto automático) ---------------- */
  control(c, dt, input, onTrack) {
    if (c.mode === 'spin' || c.mode === 'recover') return;
    if (c.mode === 'pit') return this.pitControl(c, dt);

    const auto = this.state === 'formation' || this.state === 'caution' || c.finished;
    if (c.player && !auto) {
      // jogador
      c.throttle = c.fuel > 0 ? input.throttle : 0;
      c.brake = input.brake;
      c.steer = input.steer;
      const v = Math.max(c.v, 1);
      const tr = this.track;
      const k = tr.curvAt(c.s);
      const kLane = k / (1 + c.d * k);
      if (input.assist) {
        const psiMax = Math.min(0.3, Math.max(0.035, 5 / Math.max(v, 8)));
        const psiT = -c.steer * psiMax;
        c.cDes = kLane * Math.cos(c.psi) + (psiT - c.psi) * 3.2 / Math.max(v, 5);
      } else {
        const kT = 1 / tr.R;
        const cm = Math.max(kT * 1.7, 0.7 / (v + 6));
        c.cDes = -c.steer * cm;
      }
      // assistência de freio: não deixa passar do limite da curva
      if (input.brakeAssist) {
        const grip = (0.88 + 0.12 * c.tire) * (1 - 0.15 * c.damage);
        const lim = Math.min(this.profileAt(c, c.s + c.v * 0.35, c.d), this.profileAt(c, c.s, c.d)) * Math.sqrt(grip) * 1.005;
        const e = lim - c.v;
        if (e < 0.5) c.throttle = Math.min(c.throttle, Math.max(0, 0.3 + e * 0.5));
        if (e < -0.8) c.brake = Math.max(c.brake, Math.min(1, -e * 0.4));
      }
      if (c.pitReq && this.nearPitEntry(c)) this.enterPit(c);
      if (c.fuel <= 0 && !c.pitReq) { c.pitReq = true; this.msg('Sem combustível! Indo para o box', '#ff5a3c', 'Sem combustível, vem para o box'); }
      return;
    }

    if (auto) this.followControl(c, dt, onTrack);
    else this.aiControl(c, dt);
    if (c.pitReq && this.nearPitEntry(c) && this.pitOpen()) this.enterPit(c);
  }

  pitOpen() { return this.state === 'green' || this.state === 'caution'; }

  nearPitEntry(c) {
    const tr = this.track;
    const dd = tr.delta(c.s, tr.pitStart);
    return dd > 60 && dd < 230;
  }

  steerTo(c, dTarget, maxLat) {
    const tr = this.track;
    const v = Math.max(c.v, 1);
    const k = tr.curvAt(c.s);
    const kLane = k / (1 + c.d * k);
    const lat = Math.max(-maxLat, Math.min(maxLat, (dTarget - c.d) * 0.9));
    const psiT = -Math.max(-0.14, Math.min(0.14, lat / Math.max(v, 6)));
    c.cDes = kLane * Math.cos(c.psi) + (psiT - c.psi) * 3.5 / Math.max(v, 5);
  }

  /* velocidade máxima que a aderência permite na faixa atual (e um pouco à frente) */
  gripSpeed(c) {
    const tr = this.track;
    const grip = (0.88 + 0.12 * c.tire) * (1 - 0.15 * c.damage);
    let vm = 200;
    for (const ahead of [0, 12, 28]) {
      const s = c.s + ahead;
      const k = Math.abs(tr.curvAt(s));
      if (k < 1e-4) continue;
      const kl = k / Math.max(0.3, 1 + c.d * k);
      const bank = c.d >= -tr.W / 2 - 0.3 ? tr.bankAt(s) : 0;
      let v = 40;
      for (let i = 0; i < 4; i++) v = Math.sqrt(tr.maxLatAccel(bank, v, grip) / kl);
      vm = Math.min(vm, v * 0.94 + ahead * 0.35);
    }
    return vm;
  }

  speedTo(c, vT) {
    if (c.mode === 'pit' || this.state !== 'green' || c.finished) vT = Math.min(vT, this.gripSpeed(c));
    const e = vT - c.v;
    if (e > 0.3) { c.throttle = Math.min(1, 0.35 + e * 0.6); c.brake = 0; }
    else if (e < -0.6) { c.throttle = 0; c.brake = Math.min(1, -e * 0.45); }
    else { c.throttle = 0.25 + e * 0.2; c.brake = 0; }
    if (c.fuel <= 0) c.throttle = 0;
  }

  profileAt(c, s, d) {
    const tr = this.track;
    const i = Math.floor(tr.wrap(s) / tr.ds) % tr.N;
    const [a, b, e] = this.lanes;
    const p = this.profiles;
    if (d <= b) { const t = Math.max(0, Math.min(1, (d - a) / (b - a))); return p[0][i] + (p[1][i] - p[0][i]) * t; }
    const t = Math.max(0, Math.min(1, (d - b) / (e - b)));
    return p[1][i] + (p[2][i] - p[1][i]) * t;
  }

  aiControl(c, dt) {
    const tr = this.track, W = tr.W;
    const grip = (0.88 + 0.12 * c.tire) * (1 - 0.15 * c.damage);
    let vT = Math.min(this.profileAt(c, c.s + c.v * 0.4, c.d), this.profileAt(c, c.s, c.d)) * c.pace * Math.sqrt(grip);

    // tráfego à frente
    let ahead = null, gapA = 1e9;
    let leftBusy = false, rightBusy = false;
    for (const o of this.cars) {
      if (o === c || o.mode === 'dnf' || o.mode === 'pit') continue;
      const ds = tr.delta(c.s, o.s);
      const dd = o.d - c.d;
      if (ds > 0 && ds < 45 && Math.abs(dd) < 2.3 && ds < gapA) { gapA = ds; ahead = o; }
      if (ds > -8 && ds < 14) {
        if (dd < -0.5 && dd > -4.6) leftBusy = true;
        if (dd > 0.5 && dd < 4.6) rightBusy = true;
      }
    }
    c.passT -= dt;
    if (ahead) {
      const closing = c.v - ahead.v;
      // tenta ultrapassar se estiver mais rápido ou pegando vácuo
      if (gapA < 22 && (closing > 0.5 || vT > ahead.v + 1 || c.draft > 0.12) && c.passT <= 0) {
        const outside = Math.min(W / 2 - 1.4, ahead.d + 3.4);
        const inside = Math.max(-W / 2 + 1.1, ahead.d - 3.4);
        const canOut = !rightBusy && outside - ahead.d > 2.5;
        const canIn = !leftBusy && ahead.d - inside > 2.5;
        if (canIn && (!canOut || Math.random() < 0.55)) { c.dTarget = inside; c.passT = 4; }
        else if (canOut) { c.dTarget = outside; c.passT = 4; }
      }
      // sem espaço: tira o pé
      if (gapA < 16 && Math.abs(ahead.d - c.d) < 2.2) {
        vT = Math.min(vT, ahead.v + (gapA - 7) * 0.45);
      }
    } else if (c.passT <= 0) {
      // volta para a linha preferida quando der
      const want = c.dPref;
      if ((want < c.d && !leftBusy) || (want > c.d && !rightBusy)) c.dTarget = want;
    }
    // quem está do lado: abre espaço
    for (const o of this.cars) {
      if (o === c || o.mode === 'dnf' || o.mode === 'pit') continue;
      const ds = tr.delta(c.s, o.s);
      if (Math.abs(ds) < CAR_LEN + 0.8) {
        const dd = o.d - c.d;
        if (dd > 0 && dd < 2.6) c.dTarget = Math.min(c.dTarget, o.d - 2.3);
        if (dd < 0 && dd > -2.6) c.dTarget = Math.max(c.dTarget, o.d + 2.3);
      }
    }
    c.dTarget = Math.max(-W / 2 + 1.1, Math.min(W / 2 - 1.4, c.dTarget));
    // pequenos erros humanos
    c.wobble += dt;
    const wob = Math.sin(c.wobble * 0.7) * 0.25 * this.diff.err;
    this.steerTo(c, c.dTarget + wob, 3.2);
    this.speedTo(c, vT);

    // raramente um piloto erra e roda sozinho
    if (this.state === 'green' && c.v > 30 && Math.random() < dt * 0.00005 * this.diff.err * (1.3 - c.pace)) {
      this.startSpin(c, 1, 'solo');
    }
    // decisão de box em bandeira verde
    const lapFuel = 1 / this.fuelLaps;
    const left = this.laps - c.lap;
    if (!c.pitReq && c.fuel < lapFuel * 1.4 && left * lapFuel > c.fuel) { c.pitReq = true; c.service = 'four'; }
    if (!c.pitReq && c.damage > 0.45) { c.pitReq = true; c.service = 'four'; }
  }

  /* segue o carro da frente (bandeira amarela e volta de apresentação) */
  followControl(c, dt, onTrack) {
    const tr = this.track, W = tr.W;
    if (c.finished) {
      // volta de desaceleração
      this.steerTo(c, -W / 2 + 2 + (c.finishPos % 3) * 3, 2);
      this.speedTo(c, Math.max(12, this.paceSpeed * 0.8));
      return;
    }
    const r = onTrack.indexOf(c);
    const inside = -W / 2 + 2.2, outside = -W / 2 + 5.6;
    let lane = inside, refS, gap, refV;
    const pc = this.paceCar;
    const dbl = this.doubleFile;
    if (r < 0) { this.steerTo(c, c.d, 2); this.speedTo(c, this.paceSpeed); return; }
    if (dbl) {
      lane = r % 2 === 0 ? inside : outside;
      const ref = r >= 2 ? onTrack[r - 2] : null;
      if (ref) { refS = ref.s; refV = ref.v; gap = 10; }
      else if (pc.active && !pc.leaving) { refS = pc.s; refV = pc.v; gap = 18; }
    } else {
      const ref = r >= 1 ? onTrack[r - 1] : null;
      if (ref) { refS = ref.s; refV = ref.v; gap = 12; }
      else if (pc.active && !pc.leaving) { refS = pc.s; refV = pc.v; gap = 18; }
    }
    let vT;
    if (refS === undefined) {
      // líder depois que o madrinha saiu: segura o ritmo até a zona de relargada
      vT = this.paceSpeed;
    } else {
      const err = tr.delta(c.s, refS) - gap;
      vT = refV + Math.max(-10, Math.min(14, err * 0.6));
      if (err > 60) vT = Math.max(vT, 60);
    }
    // freia com calma e nunca acerta quem está logo à frente
    vT = Math.max(vT, c.v - 2.5);
    for (const o of onTrack) {
      if (o === c) continue;
      const ds = tr.delta(c.s, o.s);
      if (ds > 0 && ds < 14 && Math.abs(o.d - c.d) < 2.3) vT = Math.min(vT, o.v + (ds - 8) * 0.5);
    }
    if (pc.active && !pc.leaving) {
      const ds = tr.delta(c.s, pc.s);
      if (ds > 0 && ds < 16 && Math.abs(pc.d - c.d) < 2.3) vT = Math.min(vT, pc.v + (ds - 10) * 0.5);
    }
    this.steerTo(c, lane, 2.2);
    this.speedTo(c, Math.max(0, vT));
    // box sob amarela
    if (this.state === 'caution' && !c.player && !c.pitReq && this.cautionLaps >= 1 && !this.pitDecided.has(c)) {
      this.pitDecided.add(c);
      const lapsLeft = this.laps - c.lap;
      const need = lapsLeft / this.fuelLaps > c.fuel;
      const worn = c.fuel < 0.5 || c.tire < 0.45 || c.damage > 0.15;
      const smart = need && c.fuel < 0.8 && lapsLeft <= this.fuelLaps;   // parada que leva até o fim
      if ((worn || smart) && lapsLeft > 3 && c.lap >= 2 && Math.random() < 0.9) {
        c.pitReq = true;
        c.service = lapsLeft < this.fuelLaps * 0.4 ? 'two' : 'four';
      }
    }
  }

  /* ---------------- box ---------------- */
  enterPit(c) {
    c.mode = 'pit';
    c.pit = { phase: 'in', timer: 0, total: 0 };
    c.pitReq = false;
    if (c.player) this.msg('Entrando no box', '#6cf', 'Box, box. Limite de velocidade.');
  }

  pitControl(c, dt) {
    const tr = this.track, p = c.pit;
    const stallS = tr.stallS(c.stall, this.n);
    const rel = tr.pitRel(c.s);
    const inRoad = rel < tr.pitLen;
    const toStart = tr.delta(c.s, tr.pitStart);
    const apron = -tr.W / 2 - tr.apron / 2;
    if (p.phase === 'in') {
      // desce para o apron e freia até a velocidade do box
      const dist = Math.max(0, toStart);
      const vT = Math.sqrt(tr.pitSpeed * tr.pitSpeed + 2 * 9 * dist);
      const t = Math.max(0, Math.min(1, 1 - (dist - 20) / 140));
      this.steerTo(c, c.d + (apron - c.d) * t, 4);
      this.speedTo(c, vT);
      if (toStart <= 0 && inRoad) p.phase = 'road';
    } else if (p.phase === 'road') {
      const toStall = tr.delta(c.s, stallS);
      let vT = tr.pitSpeed;
      let dT = tr.pitFast;
      if (toStall < 45) vT = Math.min(vT, Math.sqrt(2 * 5.5 * Math.max(0, toStall - 0.3)));
      if (toStall < 16) dT = tr.pitStallD;
      // não bate no carro da frente no box (quem está parado depois da minha vaga não atrapalha)
      for (const o of this.cars) {
        if (o === c || o.mode !== 'pit') continue;
        const ds = tr.delta(c.s, o.s);
        if (o.pit && o.pit.phase === 'stop' && ds > toStall - 1) continue;
        if (ds > 0 && ds < 11 && Math.abs(o.d - c.d) < 2.3) vT = Math.min(vT, o.v + (ds - 6.5) * 0.5);
      }
      this.steerTo(c, dT, toStall < 16 ? 4 : 2.2);
      this.speedTo(c, Math.max(0, vT));
      c.brake = Math.max(c.brake, c.v > tr.pitSpeed + 0.5 ? 1 : 0);
      if (toStall < 0.8 && c.v < 2.5) {
        p.phase = 'stop';
        c.v = 0; c.throttle = 0; c.brake = 1;
        const t4 = c.service === 'four' ? 10.4 + Math.random() * 1.4 : c.service === 'two' ? 5.6 + Math.random() : 0;
        const tf = (1 - c.fuel) * 9.5 + 1.2;
        const rep = c.damage > 0.15 ? 5 + c.damage * 8 : 0;
        p.total = p.timer = Math.max(t4, tf) + rep;
        c.pitStops++;
        if (c.player) this.msg('Parada: ' + serviceName(c.service), '#6cf', 'Parado. ' + serviceName(c.service));
      }
      if (toStall < -3) { p.phase = 'out'; }  // passou da vaga (não deve acontecer)
    } else if (p.phase === 'stop') {
      c.v = 0; c.throttle = 0; c.brake = 1; c.cDes = 0;
      c.psi *= 0.9;
      p.timer -= dt;
      if (p.timer <= 0) {
        c.fuel = 1;
        if (c.service === 'four') c.tire = 1;
        else if (c.service === 'two') c.tire = Math.min(1, 0.5 + c.tire * 0.5 + 0.25);
        if (c.damage > 0.15) c.damage *= 0.35;
        p.phase = 'out';
        if (c.player) this.msg('Vai, vai, vai!', '#3f3', 'Vai, vai, vai!');
      }
    } else if (p.phase === 'out') {
      let vT = tr.pitSpeed;
      for (const o of this.cars) {
        if (o === c || o.mode !== 'pit') continue;
        const ds = tr.delta(c.s, o.s);
        if (ds > 0 && ds < 11 && Math.abs(o.d - c.d) < 2.3) vT = Math.min(vT, o.v + (ds - 6.5) * 0.5);
      }
      this.steerTo(c, tr.pitFast, 1.6);
      this.speedTo(c, Math.max(0, vT));
      if (rel > tr.pitLen - 25 && rel < tr.pitLen + 400) { p.phase = 'merge'; p.mergeS = c.s; }
    } else if (p.phase === 'merge') {
      // fica embaixo da linha de saída até a curva 1 e sobe aos poucos
      const run = tr.delta(p.mergeS, c.s);
      const t = Math.max(0, Math.min(1, run / 160));
      const target = tr.pitFast + (-tr.W / 2 + 1.5 - tr.pitFast) * t;
      this.steerTo(c, target, 3);
      const vT = this.state === 'caution' ? this.paceSpeed + 12 : this.profileAt(c, c.s + 20, -tr.W / 2 + 2) * c.pace;
      this.speedTo(c, vT);
      if (run > 200) {
        c.mode = 'race'; c.pit = null; c.dTarget = -tr.W / 2 + 1.5;
      }
    }
  }

  /* ---------------- física ---------------- */
  physics(c, dt) {
    const tr = this.track, W = tr.W;
    const o = tr.sample(c.s, _o);
    const k = o.k;
    const onAsphalt = c.d >= -W / 2 - 0.3;
    const inPitArea = tr.pitRel(c.s) < tr.pitLen;
    let bank = onAsphalt ? o.bank : 0;
    const grass = c.d < -W / 2 - tr.apron && !(inPitArea && c.d > tr.pitInner - 1 && c.d < tr.pitOuter + 0.5) && c.mode !== 'pit';
    let surf = grass ? 0.55 : 1;
    const grip = (0.88 + 0.12 * c.tire) * (1 - 0.15 * c.damage) * surf;
    const v = c.v;

    if (c.mode === 'spin') {
      // rodando: desliza na direção em que ia e perde velocidade
      c.psi += c.spinRate * dt;
      c.spinRate *= Math.exp(-0.9 * dt);
      c.v = Math.max(0, v - (7 + (grass ? 6 : 0)) * dt);
      const sdot = c.v * Math.cos(c.slide) / (1 + c.d * k);
      c.s = tr.wrap(c.s + sdot * dt);
      c.d += -c.v * Math.sin(c.slide) * dt;
      // na inclinação, carro lento escorrega para baixo
      if (c.v < 25) c.d -= Math.sin(bank) * (25 - c.v) * 0.08 * dt;
      this.walls(c, dt);
      if (c.v < 1.5) {
        c.mode = c.damage >= 1 ? 'dnf' : 'recover';
        c.recoverT = 2.2;
        if (c.mode === 'dnf') this.retire(c);
      }
      this.engine(c, 0);
      return;
    }
    if (c.mode === 'recover') {
      // gira de volta para a frente e segue
      c.psi = wrapAng(c.psi);
      c.psi += (0 - c.psi) * Math.min(1, dt * 2.5);
      c.recoverT -= dt;
      if (c.recoverT <= 0) { c.mode = 'race'; c.psi = 0; c.dTarget = c.d; if (c.damage > 0.2 && !c.player) c.pitReq = true; }
      this.engine(c, 0);
      return;
    }

    // --- longitudinal ---
    const powerK = this.track.def.power * c.power * (1 - 0.25 * c.damage);
    const fe = c.throttle * Math.min(8.2, PWR * powerK / Math.max(v, 1));
    const drag = CD * v * v * (1 - c.draft) + ROLL + (grass ? 6 : 0);
    const fb = c.brake * BRAKE * Math.min(1, grip + 0.1);

    // --- lateral: limite de aderência com inclinação ---
    let cMaxL, cMaxR;
    {
      const mu = 1.0 * grip * (1 + v * v / 60000);
      const tb = Math.tan(bank);
      const aL = G * (mu + tb) / Math.max(0.15, 1 - mu * tb);
      const aR = G * Math.max(0.05, mu - tb) / (1 + mu * tb);
      const v2 = Math.max(v * v, 1);
      cMaxL = aL / v2; cMaxR = aR / v2;
    }
    let cc = c.cDes;
    let over = 0;
    if (cc > cMaxL) { over = (cc - cMaxL) / cMaxL; cc = cMaxL; }
    else if (cc < -cMaxR) { over = (-cMaxR - cc) / cMaxR; cc = -cMaxR; }
    c.over = over;
    const scrub = Math.min(3, over * 4);

    c.v = Math.max(0, v + (fe - drag - fb - scrub) * dt);
    const sdot = c.v * Math.cos(c.psi) / (1 + c.d * k);
    c.psi += (c.v * cc - k * sdot) * dt;
    c.s = tr.wrap(c.s + sdot * dt);
    c.d += -c.v * Math.sin(c.psi) * dt;

    // consumo e desgaste
    const lat = c.v * c.v * Math.abs(cc) / Math.max(1, (cc >= 0 ? cMaxL : cMaxR) * c.v * c.v);
    c.fuel = Math.max(0, c.fuel - c.throttle * c.v * dt / (this.fuelLaps * tr.L) * 1.12);
    c.tire = Math.max(0, c.tire - c.v * dt / (this.tireLaps * tr.L) * (0.45 + lat * 0.9 + over * 2));

    this.walls(c, dt);
    this.engine(c, c.throttle);
  }

  walls(c, dt) {
    const tr = this.track, W = tr.W;
    const dMax = W / 2 - CAR_WID / 2 - 0.05;
    if (c.d > dMax) {
      c.d = dMax;
      const ang = c.mode === 'spin' ? c.slide : c.psi;
      const vn = c.v * Math.sin(-ang);
      if (vn > 0) {
        if (c.mode === 'spin') {
          c.slide = -c.slide * 0.3; c.v *= 0.75;
          c.damage = Math.min(1, c.damage + vn * 0.03);
        } else if (vn > 8.5 && this.state === 'green') {
          c.damage = Math.min(1, c.damage + vn * 0.035);
          c.v = Math.max(0, c.v - vn * 0.6);
          this.startSpin(c, -1, 'wall');
          this.hit = { car: c, power: vn };
        } else {
          c.v = Math.max(0, c.v - vn * 0.9 - 4 * dt);
          c.psi = 0.012;
          c.damage = Math.min(0.95, c.damage + vn * 0.006);
          c.contact = Math.max(c.contact, vn / 8);
          if (c.player) this.hit = { car: c, power: vn };
        }
      }
    }
    // limite interno: grama (ou canteiro do box)
    const inPit = tr.pitRel(c.s) < tr.pitLen;
    let dMin;
    if (c.mode === 'pit') dMin = tr.pitInner + CAR_WID / 2;
    else if (inPit && tr.pitRel(c.s) > 40 && tr.pitRel(c.s) < tr.pitLen - 40) dMin = -W / 2 - tr.apron + 0.2;
    else dMin = -W / 2 - tr.apron - 8;
    if (c.d < dMin) {
      c.d = dMin;
      if (c.mode === 'spin') c.slide = -c.slide * 0.3;
      else if (c.psi > 0) c.psi = -0.01;
      c.v *= 1 - 0.6 * dt;
    }
  }

  /* câmbio de 4 marchas (como o H do painel) */
  engine(c, thr) {
    const vTop = Math.cbrt(PWR * this.track.def.power / CD) * 1.06;
    const tops = [0.36, 0.56, 0.78, 1.0];
    if (c.mode === 'pit' && c.pit && c.pit.phase === 'stop') c.gear = 1;
    let g = c.gear;
    const rpmOf = gg => 9500 * c.v / (tops[gg - 1] * vTop);
    if (rpmOf(g) > 9200 && g < 4) g++;
    else if (g > 1 && rpmOf(g - 1) < 7600) g--;
    c.gear = g;
    const target = Math.max(1500 + thr * 1200, Math.min(9900, rpmOf(g)));
    c.rpm += (target - c.rpm) * 0.2;
  }

  startSpin(c, dir, why) {
    if (c.mode === 'spin' || c.mode === 'dnf') return;
    if (this.debug) this.debug.push([this.t.toFixed(1), this.state, c.info.num, c.mode, c.pit && c.pit.phase, why, c.v.toFixed(0), c.d.toFixed(1)].join(' '));
    c.mode = 'spin';
    c.slide = c.psi;
    c.spinRate = (dir || (Math.random() < 0.5 ? -1 : 1)) * (4 + Math.random() * 3);
    c.damage = Math.min(1, c.damage + 0.12);
    if (c.pit) { c.pit = null; }
    if (this.state === 'green' && this.cautionPending < 0) this.cautionPending = 2.0;
    if (c.player) this.msg('Rodou!', '#ff5a3c', 'Segura, segura!');
  }

  retire(c) {
    c.mode = 'dnf'; c.dnf = true; c.v = 0;
    c.retireT = this.t; c.retireLap = c.lap;
    this.msg(`#${c.info.num} ${c.info.name} abandona`, '#aaa');
  }

  /* ---------------- vácuo e batidas ---------------- */
  collisions(dt) {
    const tr = this.track;
    const calm = this.state !== 'green';     // sob amarela ninguém se machuca
    const cars = this.cars;
    for (const c of cars) c.draft = 0;
    const n = cars.length;
    for (let i = 0; i < n; i++) {
      const a = cars[i];
      if (a.mode === 'dnf' && this.t - a.retireT > 4) continue;
      for (let j = i + 1; j < n; j++) {
        const b = cars[j];
        if (b.mode === 'dnf' && this.t - b.retireT > 4) continue;
        let ds = tr.delta(a.s, b.s);           // b à frente de a se > 0
        const dd = b.d - a.d;
        const ads = Math.abs(ds), add = Math.abs(dd);
        // vácuo: quem vem atrás ganha, o da frente ganha um pouco com o empurrão
        if (ads < 45 && add < 2.2 && a.mode !== 'pit' && b.mode !== 'pit') {
          const back = ds > 0 ? a : b, front = ds > 0 ? b : a;
          const f = 0.34 * (1 - ads / 45);
          back.draft = Math.max(back.draft, f);
          if (ads < 9) front.draft = Math.max(front.draft, 0.07);
        }
        if (ads > CAR_LEN || add > CAR_WID + 0.05) continue;
        if ((a.mode === 'pit') !== (b.mode === 'pit') && (a.d < tr.pitOuter || b.d < tr.pitOuter)) continue;
        const ox = CAR_LEN - ads, oy = CAR_WID + 0.05 - add;
        if (oy / CAR_WID < ox / CAR_LEN) {
          // batida lateral
          const sgn = dd >= 0 ? 1 : -1;
          a.d -= sgn * oy / 2; b.d += sgn * oy / 2;
          const va = -a.v * Math.sin(a.psi), vb = -b.v * Math.sin(b.psi);
          const rel = (va - vb) * sgn;          // aproximação
          if (rel > 0) {
            const hard = rel > 7.5;
            if (a.mode === 'race') a.psi += sgn * 0.02;
            if (b.mode === 'race') b.psi -= sgn * 0.02;
            a.contact = Math.max(a.contact, rel / 6); b.contact = Math.max(b.contact, rel / 6);
            if (!calm) {
              a.damage = Math.min(0.95, a.damage + rel * 0.004);
              b.damage = Math.min(0.95, b.damage + rel * 0.004);
            }
            if (hard && !calm && Math.random() < 0.3) this.startSpin(Math.random() < 0.5 ? a : b, 0, 'side');
            if (a.player || b.player) this.hit = { car: a.player ? a : b, power: rel };
          }
        } else {
          // batida de trás: quem vem atrás empurra
          const back = ds > 0 ? a : b, front = ds > 0 ? b : a;
          const sep = ox / 2;
          back.s = tr.wrap(back.s - sep); front.s = tr.wrap(front.s + sep);
          const dv = back.v - front.v;
          if (dv > 0) {
            back.v -= dv * 0.55; front.v += dv * 0.4;
            back.contact = Math.max(back.contact, dv / 8); front.contact = Math.max(front.contact, dv / 8);
            if (!calm) back.damage = Math.min(0.95, back.damage + dv * 0.006);
            // toque desalinhado a alta velocidade: o da frente roda
            if (dv > 9 && add > 0.8 && front.mode === 'race' && !calm) {
              this.startSpin(front, dd * (ds > 0 ? 1 : -1) > 0 ? -1 : 1, 'hook');
              front.slide = front.psi + (dd > 0 ? -0.25 : 0.25);
            }
            if (a.player || b.player) this.hit = { car: a.player ? a : b, power: dv };
          }
        }
      }
    }
  }

  /* ---------------- classificação ---------------- */
  computeOrder() {
    const L = this.track.L;
    for (const c of this.cars) {
      let s = c.s;
      if (this.state === 'formation') { c.dist = -c.idx; continue; }
      c.dist = c.lap * L + s;
    }
    const arr = this.cars.slice();
    arr.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return b.lap - a.lap || a.finishPos - b.finishPos;
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      if (a.dnf) return b.retireLap - a.retireLap || b.dist - a.dist;
      return b.dist - a.dist;
    });
    arr.forEach((c, i) => c.pos = i + 1);
    this.ranking = arr;
    // ordem física na pista (fila atrás do carro-madrinha), usada sob amarela
    const tr = this.track, pc = this.paceCar;
    let ref;
    if (pc.active) ref = pc.s;
    else { const f = this.order && this.order.find(c => !c.dnf && c.mode !== 'pit'); ref = f ? f.s + 30 : 0; }
    const beh = c => { let b = tr.wrap(ref - c.s); if (b > L * 0.85) b -= L; return b; };
    for (const c of this.cars) c.beh = beh(c);
    this.order = this.cars.filter(c => !c.dnf).sort((a, b) => a.beh - b.beh);
  }

  /* ---------------- bandeiras, voltas, carro-madrinha ---------------- */
  crossLine(c) {
    if (this.state === 'formation') return;
    const now = this.t;
    if (c.lap >= 0 && c.lapStart > 0) {
      c.lastLap = now - c.lapStart;
      if (!c.bestLap || c.lastLap < c.bestLap) c.bestLap = c.lastLap;
    }
    c.lapStart = now;
    c.lap++;
    if (c.finished) return;
    if (this.checkered) {
      c.finished = true;
      c.finishT = now;
      this.finishOrder.push(c);
      c.finishPos = this.finishOrder.length;
      const fp = this.finishOrder.filter(o => o.lap >= c.lap).length;
      if (c.player) this.msg(`Você terminou em ${fp}º`, '#fff', `Terminou em ${fp}º lugar`);
      return;
    }
    // líder completando voltas
    if (c === this.ranking[0] || c.lap > this.leaderLap) {
      if (c.lap > this.leaderLap) {
        this.leaderLap = c.lap;
        if (c.lap >= 1) c.lapsLed++;
        this.onLeaderLap(c);
      }
    }
  }

  onLeaderLap(leader) {
    const lap = leader.lap;
    if (lap >= this.laps) {
      this.checkered = true;
      this.flag = 'checkered';
      leader.finished = true; leader.finishT = this.t;
      this.finishOrder.push(leader); leader.finishPos = 1;
      this.state = 'finished';
      this.msg(`Bandeira quadriculada! #${leader.info.num} vence`, '#fff',
        leader.player ? 'Você venceu! Vitória!' : 'Bandeira quadriculada.');
      this.finishTime = this.t;
      return;
    }
    if (this.state === 'caution') {
      this.cautionLaps--;
      if (this.cautionLaps === 1) { this.doubleFile = true; this.msg('Relargada na próxima volta — fila dupla', '#ffd400', 'Relargada na próxima volta.'); }
    }
    // fim de estágio
    const si = this.stages.indexOf(lap);
    if (si >= 0 && !this.stageDone[si]) {
      this.stageDone[si] = true;
      const res = this.ranking.filter(c => !c.dnf).slice(0, 10);
      res.forEach((c, i) => { c.stagePts += stagePoints(i + 1); });
      this.stageResults.push({ stage: si + 1, top: res.map(c => c.info.num) });
      this.msg(`Fim do estágio ${si + 1}: #${res[0].info.num} vence`, '#ffd400', `Fim do estágio ${si + 1}`);
      if (this.state === 'green') this.throwCaution('Fim de estágio', this.track.L > 2000 ? 1 : 2);
    }
    if (this.state === 'green' && lap === this.laps - 1) {
      this.flag = 'white';
      this.msg('Bandeira branca: última volta!', '#fff', 'Última volta!');
    }
  }

  throwCaution(reason, laps) {
    this.state = 'caution';
    this.flag = 'yellow';
    this.doubleFile = false;
    this.cautionLaps = laps || 2;
    this.pitDecided = new Set();
    this.doubleFileAt = this.cautionLaps <= 1 ? this.t + 18 : 0;
    const leader = this.ranking.find(c => !c.dnf && c.mode !== 'pit' && c.mode !== 'spin');
    const pc = this.paceCar;
    pc.active = true; pc.leaving = false;
    pc.s = this.track.wrap((leader ? leader.s : 0) + 180);
    pc.d = -this.track.W / 2 + 3; pc.v = leader ? Math.min(leader.v, 45) : this.paceSpeed;
    // prorrogação (overtime) se a amarela sair no fim
    if (this.leaderLap >= this.laps - 2 && this.extensions < 1) {
      const nl = this.leaderLap + this.cautionLaps + 2;
      if (nl > this.laps) { this.laps = nl; this.extensions++; this.msg('Prorrogação (overtime)', '#ffd400'); }
    }
    this.msg(`Bandeira amarela: ${reason}`, '#ffd400', 'Bandeira amarela! Amarela! Box aberto.');
  }

  updatePaceCar(dt) {
    const pc = this.paceCar, tr = this.track;
    if (!pc.active) return;
    // sai para o box na última volta de amarela / apresentação
    const toPit = tr.delta(pc.s, tr.pitStart);
    if (!pc.leaving && this.cautionLaps <= 1 && (this.state === 'formation' || this.state === 'caution') && toPit > 0 && toPit < 90) {
      const leader = this.order.find(c => !c.dnf && c.mode !== 'pit');
      if (!leader || tr.delta(leader.s, pc.s) < 40) {
        pc.leaving = true;
        this.msg('Carro-madrinha saindo — prepare a relargada', '#ffd400', 'Madrinha saindo. Prepara.');
      }
    }
    let vT = this.paceSpeed;
    let dT = -tr.W / 2 + 3.8;
    if (this.state === 'formation' && this.t < 4) vT = 0;
    if (pc.leaving) {
      const rel = tr.pitRel(pc.s);
      dT = rel < tr.pitLen ? tr.pitFast : -tr.W / 2 - tr.apron / 2;
      vT = tr.pitSpeed;
      if (rel < tr.pitLen && rel > tr.pitLen * 0.6) { pc.active = false; }
    }
    // madrinha acelera para alcançar a frente do pelotão
    const leader = this.order.find(c => !c.dnf && c.mode !== 'pit');
    if (!pc.leaving && leader && this.state === 'caution') {
      const gap = tr.delta(leader.s, pc.s);
      if (gap > 60) vT = this.paceSpeed + 6;
    }
    pc.v += Math.max(-8 * dt, Math.min(5 * dt, vT - pc.v));
    const k = tr.curvAt(pc.s);
    pc.s = tr.wrap(pc.s + pc.v * dt / (1 + pc.d * k));
    pc.d += (dT - pc.d) * Math.min(1, dt * 0.8);
  }

  raceControl(dt) {
    const tr = this.track;
    if (this.state === 'caution' && this.doubleFileAt && this.t > this.doubleFileAt) {
      this.doubleFileAt = 0; this.doubleFile = true;
      this.msg('Relargada nesta volta — fila dupla', '#ffd400', 'Relargada nesta volta.');
    }
    // detecta cruzamento da linha
    for (const c of this.cars) {
      if (c.prevS !== undefined && c.mode !== 'dnf') {
        if (c.prevS > tr.L * 0.75 && c.s < tr.L * 0.25) this.crossLine(c);
      }
      c.prevS = c.s;
    }
    // bandeira amarela pendente depois de uma batida
    if (this.cautionPending >= 0) {
      this.cautionPending -= dt;
      if (this.cautionPending < 0) {
        if (this.state === 'green' && !this.checkered) this.throwCaution('acidente', this.track.L > 2000 ? 1 : 2);
      }
    }
    // relargada: líder acelera na zona antes da linha
    if ((this.state === 'formation' || this.state === 'caution') && this.paceCar.leaving) {
      const leader = this.order.find(c => !c.dnf && c.mode !== 'pit');
      if (leader && tr.delta(leader.s, 0) > 0 && tr.delta(leader.s, 0) < 75) {
        const wasFormation = this.state === 'formation';
        this.state = 'green';
        this.flag = this.leaderLap === this.laps - 1 ? 'white' : 'green';
        this.cautionLaps = 0;
        this.doubleFile = false;
        if (wasFormation) {
          for (const c of this.cars) { c.lap = -1; c.lapStart = 0; }
          this.leaderLap = -1;
          this.msg('BANDEIRA VERDE!', '#19c24a', 'Verde, verde, verde!');
        } else {
          this.msg('Relargada! Bandeira verde', '#19c24a', 'Verde, verde!');
        }
        // quem não parou decide a faixa preferida de novo
        for (const c of this.cars) c.passT = 0;
      }
    }
    // fim: 40 s depois da quadriculada, ou quando todos cruzaram
    if (this.checkered) {
      const running = this.cars.filter(c => !c.finished && !c.dnf);
      if (running.length === 0 || this.t - this.finishTime > 45) this.done = true;
      if (this.player.finished && this.t - this.player.finishT > 6) this.done = true;
    }
    if (this.player.dnf && !this.done) {
      if (!this.playerOutT) this.playerOutT = this.t;
      if (this.t - this.playerOutT > 5) this.done = true;
    }
    tr.setFlagLight && (this.flagShown !== this.flag) && (tr.setFlagLight(this.flag), this.flagShown = this.flag);
  }

  /* resultado final com pontos */
  results() {
    const final = this.ranking.slice();
    let mostLed = null;
    for (const c of this.cars) if (!mostLed || c.lapsLed > mostLed.lapsLed) mostLed = c;
    let fastest = null;
    for (const c of this.cars) if (c.bestLap && (!fastest || c.bestLap < fastest.bestLap)) fastest = c;
    return final.map((c, i) => ({
      pos: i + 1, num: c.info.num, name: c.info.name, player: c.player, make: c.info.make,
      laps: Math.max(0, c.lap), status: c.dnf ? 'Abandonou' : c.finished ? 'Terminou' : 'Na pista',
      best: c.bestLap, led: c.lapsLed, stagePts: c.stagePts, start: c.startPos,
      points: finishPoints(i + 1) + c.stagePts + (c === fastest ? 1 : 0),
      fastest: c === fastest, color: c.info.color
    }));
  }
}

const _o = {};
function wrapAng(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
export function serviceName(s) { return s === 'four' ? '4 pneus + gasolina' : s === 'two' ? '2 pneus + gasolina' : 'só gasolina'; }
