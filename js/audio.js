/* ============================================================
   audio.js - som sintetizado: V8 do carro, ronco do pelotão,
   pneu cantando, batidas e a voz do spotter (fala do sistema).
   Nenhum arquivo de áudio: funciona offline.
   ============================================================ */
export const Sound = {
  ctx: null, ready: false, muted: false, voice: true,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // V8: duas serras (explosões) + quadrada meio tom abaixo, passando por filtro
    const eg = ctx.createGain(); eg.gain.value = 0;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 800; filt.Q.value = 4;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth';
    const o3 = ctx.createOscillator(); o3.type = 'square';
    const g3 = ctx.createGain(); g3.gain.value = 0.3;
    o1.connect(filt); o2.connect(filt); o3.connect(g3); g3.connect(filt);
    // "rumble" do V8: modulação de amplitude
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 18;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.18;
    lfo.connect(lfoG); lfoG.connect(eg.gain);
    filt.connect(eg); eg.connect(this.master);
    [o1, o2, o3, lfo].forEach(o => o.start());
    this.eng = { o1, o2, o3, eg, filt, lfo };

    // ruído (pneu, vento, pelotão)
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const mk = (type, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bf); bf.connect(g); g.connect(this.master); src.start();
      return { g, bf };
    };
    this.skid = mk('bandpass', 1800, 2.5);
    this.wind = mk('lowpass', 500, 0.7);
    // pelotão: outro motor mais grave e abafado
    const pg = ctx.createGain(); pg.gain.value = 0;
    const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 500;
    const p1 = ctx.createOscillator(); p1.type = 'sawtooth';
    const p2 = ctx.createOscillator(); p2.type = 'sawtooth';
    p1.connect(pf); p2.connect(pf); pf.connect(pg); pg.connect(this.master);
    p1.start(); p2.start();
    this.pack = { g: pg, p1, p2, f: pf };
    this.ready = true;
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
    if (m && window.speechSynthesis) speechSynthesis.cancel();
  },

  update(p, packNear, packRpm, active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    const rpm = p.rpm || 0;
    // 8 cilindros: 4 explosões por volta do virabrequim
    const f = rpm / 60 * 4 / 4;
    this.eng.o1.frequency.setTargetAtTime(f * 1.0 + 20, t, 0.03);
    this.eng.o2.frequency.setTargetAtTime(f * 2.01 + 20, t, 0.03);
    this.eng.o3.frequency.setTargetAtTime(f * 0.5 + 10, t, 0.03);
    this.eng.lfo.frequency.setTargetAtTime(f / 8 + 4, t, 0.05);
    this.eng.filt.frequency.setTargetAtTime(400 + p.throttle * 1500 + rpm * 0.12, t, 0.05);
    this.eng.eg.gain.setTargetAtTime(on * (0.1 + p.throttle * 0.16), t, 0.05);
    this.skid.g.gain.setTargetAtTime(on * Math.min(0.25, (p.over || 0) * 0.6 + (p.mode === 'spin' ? 0.25 : 0)), t, 0.04);
    this.wind.g.gain.setTargetAtTime(on * Math.min(0.2, p.v / 450), t, 0.1);
    const pf = packRpm / 60;
    this.pack.p1.frequency.setTargetAtTime(pf + 15, t, 0.1);
    this.pack.p2.frequency.setTargetAtTime(pf * 1.5 + 11, t, 0.1);
    this.pack.g.gain.setTargetAtTime(on * Math.min(0.12, packNear * 0.03), t, 0.15);
  },

  crash(power) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 600 + power * 60;
    const g = ctx.createGain();
    const vol = Math.min(0.9, 0.15 + power * 0.05);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5 + power * 0.03);
    src.connect(bf); bf.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.5);
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
