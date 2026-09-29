/* ============================================================
   audio.js - som sintetizado do V8 da Cup (nenhum arquivo).

   Referências usadas:
   - Motor da Cup: V8 5,86 L (358 pol³), virabrequim cruzado (90°),
     até ~9.800 rpm; 4 explosões por volta do virabrequim
     (600 Hz de fundamental a 9.000 rpm).
   - Ordem de ignição 1-8-4-3-6-5-7-2: as bancadas disparam
     E-D-D-E-D-E-E-D, com intervalos desiguais em cada bancada
     (180-90-180-270°). Esse "tropeço" é o ronco típico do V8.
   - Como nos jogos de corrida (Forza/GT): camadas de escape,
     admissão e mecânica; aliviando o pé some a admissão, o escape
     fica abafado e aparecem os estouros; câmera de dentro é mais
     abafada e com mais mecânica.

   Técnica: um "ciclo" do motor (720°) é montado como trem de
   pulsos de pressão por bancada, com pequenas variações entre
   cilindros e entre ciclos. O ciclo toca em loop e a velocidade
   de reprodução acompanha o rpm. As ressonâncias do escapamento
   são filtros FIXOS depois disso (por isso o timbre não vira
   "esquilo" no giro alto). Os carros vizinhos usam o mesmo
   gerador com Doppler, volume pela distância e estéreo.
   ============================================================ */

const R0 = 3000;                 // rpm em que o ciclo foi gravado no buffer
const CYCLES = 8;                // ciclos com variação (evita som de máquina)
const BANK = 'LRRLRLLR';         // bancada de cada explosão (1-8-4-3-6-5-7-2)

export const Sound = {
  ctx: null, ready: false, muted: false, voice: true,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // compressor final: segura os picos quando o pelotão passa
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);

    // ruído branco (pneu, vento, admissão, estouros)
    const len = ctx.sampleRate * 2;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // ciclos do motor: estéreo (esquerda = bancada E, direita = bancada D)
    this.cycleBuf = this.makeCycles(1);
    this.cycleBufB = this.makeCycles(2);   // variação para os outros carros
    this.curve = shaperCurve(2.2);

    this.player = this.makeVoice(this.cycleBuf, true);
    this.others = [0, 1, 2].map(i => this.makeVoice(i % 2 ? this.cycleBuf : this.cycleBufB, false));

    // admissão (ronco de ar na borboleta) e zunido do câmbio de dentes retos
    this.intake = this.noiseLayer('bandpass', 900, 1.2);
    const whine = ctx.createOscillator(); whine.type = 'triangle';
    const wg = ctx.createGain(); wg.gain.value = 0;
    whine.connect(wg); wg.connect(this.master); whine.start();
    this.whine = { o: whine, g: wg };

    // pneu cantando (duas faixas), vento, raspando no muro, torcida
    this.skid = this.noiseLayer('bandpass', 1150, 6);
    this.skid2 = this.noiseLayer('bandpass', 2300, 8);
    this.wind = this.noiseLayer('lowpass', 420, 0.7);
    this.scrape = this.noiseLayer('highpass', 2500, 0.8);
    this.crowd = this.noiseLayer('lowpass', 700, 0.5);

    this.prevThrottle = 0; this.prevGear = 1; this.cutUntil = 0; this.popsLeft = 0; this.nextPop = 0;
    this.ready = true;
  },

  /* ---------- gerador do ciclo de 720° ---------- */
  makeCycles(seed) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const cyc = 120 / R0;                         // 2 voltas em segundos
    const n = Math.round(cyc * CYCLES * sr);
    const buf = ctx.createBuffer(2, n, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let s = seed * 9973 + 17;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const cylAmp = Array.from({ length: 8 }, () => 0.88 + rnd() * 0.24);   // cada cilindro é um pouco diferente
    for (let c = 0; c < CYCLES; c++) {
      for (let k = 0; k < 8; k++) {
        const ang = k * 90 + (rnd() - 0.5) * 3;                           // pequena variação de ignição
        const t0 = (c + ang / 720) * cyc;
        const amp = cylAmp[k] * (0.93 + rnd() * 0.14);
        const ch = BANK[k] === 'L' ? L : R;
        const other = BANK[k] === 'L' ? R : L;
        const i0 = Math.floor(t0 * sr);
        // pulso de pressão: subida rápida, descida mais lenta, com uma leve "batida" da válvula
        const dur = Math.floor(0.012 * sr);
        for (let i = 0; i < dur; i++) {
          const t = i / sr;
          let v = (Math.exp(-t / 0.0016) - Math.exp(-t / 0.00022)) * amp;
          v += 0.18 * Math.exp(-t / 0.0025) * Math.sin(2 * Math.PI * 260 * t) * amp;
          v += (rnd() - 0.5) * 0.08 * Math.exp(-t / 0.002);                // turbulência
          const j = (i0 + i) % n;
          ch[j] += v;
          other[j] += v * 0.35;                                           // as bancadas se misturam no ar
        }
      }
    }
    // tira o nível DC e normaliza
    for (const d of [L, R]) {
      let m = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
      let pk = 0; for (let i = 0; i < n; i++) { d[i] -= m; pk = Math.max(pk, Math.abs(d[i])); }
      for (let i = 0; i < n; i++) d[i] /= pk;
    }
    return buf;
  },

  /* ---------- uma voz de motor: ciclo -> distorção -> escapamento -> volume/estéreo ---------- */
  makeVoice(buffer, main) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    src.loopEnd = buffer.duration;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 35;
    const drive = ctx.createGain(); drive.gain.value = 1;
    const shaper = ctx.createWaveShaper(); shaper.curve = shaperCurve(2.2); shaper.oversample = main ? '2x' : 'none';
    // ressonâncias fixas do escapamento (tubos coletores e saída lateral)
    const r1 = peak(ctx, 115, 1.4, 7);
    const r2 = peak(ctx, 340, 2.2, 5);
    const r3 = peak(ctx, 1150, 2.5, 3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(hp); hp.connect(drive); drive.connect(shaper); shaper.connect(r1); r1.connect(r2); r2.connect(r3); r3.connect(lp); lp.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.master); } else g.connect(this.master);
    src.start(0, Math.random() * buffer.duration);
    return { src, drive, lp, g, pan, r1 };
  },

  noiseLayer(type, f, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bf); bf.connect(g); g.connect(this.master);
    src.start(0, Math.random() * 2);
    return { g, bf };
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
    if (m && window.speechSynthesis) speechSynthesis.cancel();
  },

  silence() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const v of [this.player, ...this.others]) v.g.gain.setTargetAtTime(0, t, 0.05);
    for (const l of [this.intake, this.skid, this.skid2, this.wind, this.scrape, this.crowd]) l.g.gain.setTargetAtTime(0, t, 0.05);
    this.whine.g.gain.setTargetAtTime(0, t, 0.05);
  },

  /* chamado a cada quadro:
     f = { player, cam, near (0..1 perto da câmera), pan, doppler, others: [{rpm, throttle, gain, pan, doppler}] } */
  update(f) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = f.player;
    const inside = f.cam === 'cockpit';
    const rpm = Math.max(900, p.rpm || 0);
    const thr = p.mode === 'spin' ? 0 : p.throttle || 0;
    const near = f.near;

    // --- motor do jogador ---
    const V = this.player;
    // troca de marcha: corte de ignição de ~70 ms
    if (p.gear !== this.prevGear) { if (p.gear > this.prevGear) this.cutUntil = t + 0.07; this.prevGear = p.gear; }
    // limitador de giro: liga/desliga a ~20 Hz
    const limiter = rpm > 9650 && thr > 0.8 && Math.floor(t * 20) % 2 === 0;
    const cut = t < this.cutUntil || limiter;
    V.src.playbackRate.setTargetAtTime(rpm / R0 * f.doppler, t, 0.02);
    const onLoad = 0.35 + 0.65 * thr;
    V.drive.gain.setTargetAtTime(0.9 + thr * 2.4, t, 0.05);                 // acelerando = mais sujo
    // aliviando: escape abafado (tira os médios); de dentro, sempre mais abafado
    const bright = (inside ? 1400 : 2600) + thr * (inside ? 1600 : 4200) + rpm * 0.15;
    V.lp.frequency.setTargetAtTime(bright, t, 0.06);
    const vol = (cut ? 0.12 : 1) * onLoad * (inside ? 0.2 : 0.24) * near;
    V.g.gain.setTargetAtTime(vol, t, cut ? 0.005 : 0.03);
    if (V.pan) V.pan.pan.setTargetAtTime(f.pan || 0, t, 0.05);

    // --- admissão: só com o pé embaixo ---
    this.intake.bf.frequency.setTargetAtTime(500 + rpm * 0.14, t, 0.05);
    this.intake.g.gain.setTargetAtTime(near * thr * thr * (inside ? 0.09 : 0.05) * (rpm / 9000), t, 0.05);
    // --- câmbio de dentes retos: zunido que sobe com a velocidade ---
    this.whine.o.frequency.setTargetAtTime(90 + p.v * 14, t, 0.05);
    this.whine.g.gain.setTargetAtTime(near * (inside ? 0.025 : 0.008) * Math.min(1, p.v / 30) * (1.2 - thr * 0.5), t, 0.1);

    // --- estouros ao aliviar de giro alto (overrun) ---
    if (this.prevThrottle > 0.6 && thr < 0.15 && rpm > 5500) { this.popsLeft = 4 + Math.floor(Math.random() * 6); this.nextPop = t + 0.05; }
    if (this.popsLeft > 0 && t >= this.nextPop && thr < 0.3) {
      this.pop(near * (inside ? 0.25 : 0.4));
      this.popsLeft--; this.nextPop = t + 0.04 + Math.random() * 0.12;
    }
    this.prevThrottle = thr;

    // --- pneu, vento, muro ---
    const sq = Math.min(1, (p.over || 0) * 1.6 + (p.mode === 'spin' ? 0.9 : 0));
    this.skid.g.gain.setTargetAtTime(near * sq * 0.22, t, 0.04);
    this.skid2.g.gain.setTargetAtTime(near * sq * 0.1, t, 0.04);
    this.skid.bf.frequency.setTargetAtTime(1000 + Math.random() * 300, t, 0.02);
    this.wind.g.gain.setTargetAtTime(Math.min(0.22, p.v / 380) * (inside ? 1 : 0.5), t, 0.1);
    this.scrape.g.gain.setTargetAtTime(near * Math.min(0.3, (p.scrape || 0) * 0.35), t, 0.03);
    this.crowd.g.gain.setTargetAtTime(f.crowd || 0, t, 0.4);

    // --- carros vizinhos (Doppler, distância, estéreo) ---
    this.others.forEach((v, i) => {
      const o = f.others[i];
      if (!o) { v.g.gain.setTargetAtTime(0, t, 0.08); return; }
      v.src.playbackRate.setTargetAtTime(Math.max(0.3, o.rpm) / R0 * o.doppler, t, 0.03);
      v.drive.gain.setTargetAtTime(0.9 + o.throttle * 2, t, 0.1);
      v.lp.frequency.setTargetAtTime((inside ? 1100 : 2200) + o.throttle * 2500, t, 0.1);
      v.g.gain.setTargetAtTime(o.gain * (0.35 + 0.65 * o.throttle) * (inside ? 0.12 : 0.18), t, 0.05);
      if (v.pan) v.pan.pan.setTargetAtTime(o.pan, t, 0.05);
    });
  },

  /* estouro do escapamento */
  pop(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 350 + Math.random() * 500; bf.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * (0.5 + Math.random() * 0.5), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.05);
    src.connect(bf); bf.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.15);
  },

  crash(power) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // pancada grave de ruído
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 500 + power * 80;
    const g = ctx.createGain();
    const vol = Math.min(0.9, 0.18 + power * 0.05);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45 + power * 0.03);
    src.connect(bf); bf.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 1.5);
    // chapa de metal: parciais desafinados que somem rápido
    for (const fr of [310, 587, 1130, 1790]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr * (0.95 + Math.random() * 0.1);
      const og = ctx.createGain();
      og.gain.setValueAtTime(Math.min(0.08, power * 0.006), t);
      og.gain.exponentialRampToValueAtTime(0.0005, t + 0.25 + Math.random() * 0.2);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.6);
    }
  },

  /* torcida vibrando (largada, vitória) */
  cheer(sec) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.crowd.g.gain.cancelScheduledValues(t);
    this.crowd.g.gain.setTargetAtTime(0.12, t, 0.3);
    this.crowd.g.gain.setTargetAtTime(0.02, t + sec, 1.2);
  },

  beep(freq, dur) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  },

  /* spotter: fala curta em português */
  lastSay: 0,
  say(text, force) {
    if (!this.voice || this.muted || !window.speechSynthesis) return;
    const now = performance.now();
    if (!force && now - this.lastSay < 1400) return;
    this.lastSay = now;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR'; u.rate = 1.25; u.pitch = 0.9; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* sem voz no aparelho */ }
  }
};

function peak(ctx, f, q, gain) {
  const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.Q.value = q; b.gain.value = gain;
  return b;
}
/* saturação suave (tanh) */
function shaperCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
