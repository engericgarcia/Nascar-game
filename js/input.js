/* ============================================================
   input.js - controles de toque (volante deslizante, pedais
   analógicos), inclinação do celular e teclado.
   ============================================================ */
export const Input = {
  steer: 0, throttle: 0, brake: 0,
  assist: true, brakeAssist: true, autoGas: false, tilt: false,
  touchSteer: 0, touchGas: 0, touchBrake: 0,
  keys: {},
  tiltVal: 0,
  onCam: null, onBox: null, onPause: null, onService: null,

  init() {
    const $ = id => document.getElementById(id);
    this.bindSteer($('steer'), $('steerKnob'));
    this.bindPedal($('gas'), v => this.touchGas = v);
    this.bindPedal($('brake'), v => this.touchBrake = v);
    const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn && fn(); });
    tap($('btnCam'), () => this.onCam && this.onCam());
    tap($('btnBox'), () => this.onBox && this.onBox());
    tap($('btnService'), () => this.onService && this.onService());
    tap($('btnPause'), () => this.onPause && this.onPause());

    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyC') this.onCam && this.onCam();
      if (e.code === 'KeyB') this.onBox && this.onBox();
      if (e.code === 'KeyV') this.onService && this.onService();
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause && this.onPause();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    window.addEventListener('deviceorientation', e => this.orient(e));
  },

  bindSteer(el, knob) {
    let id = null;
    const set = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      let v = (e.clientX - cx) / (r.width * 0.42);
      v = Math.max(-1, Math.min(1, v));
      if (Math.abs(v) < 0.06) v = 0;
      this.touchSteer = v;
      knob.style.transform = `translateX(${v * r.width * 0.42}px)`;
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ } set(e); el.classList.add('on');
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; this.touchSteer = 0; knob.style.transform = ''; el.classList.remove('on');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  },

  bindPedal(el, cb) {
    let id = null;
    const set = e => {
      const r = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      const v = 0.45 + 0.55 * t;       // mais embaixo = mais fundo
      cb(v);
      el.style.setProperty('--press', v.toFixed(2));
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ } set(e); el.classList.add('on');
      if (navigator.vibrate) navigator.vibrate(8);
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; cb(0); el.classList.remove('on'); el.style.setProperty('--press', 0);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  },

  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        return r === 'granted';
      }
      return true;
    } catch (e) { return false; }
  },

  orient(e) {
    if (e.beta === null) return;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let v;
    if (ang === 90) v = e.beta;
    else if (ang === -90 || ang === 270) v = -e.beta;
    else v = e.gamma;
    this.tiltVal = Math.max(-1, Math.min(1, v / 22));
  },

  update(dt) {
    const k = this.keys;
    const kl = k.ArrowLeft || k.KeyA, kr = k.ArrowRight || k.KeyD;
    const ku = k.ArrowUp || k.KeyW, kd = k.ArrowDown || k.KeyS || k.Space;
    let target = this.touchSteer;
    if (kl || kr) target = (kr ? 1 : 0) - (kl ? 1 : 0);
    else if (this.tilt && !this.touchSteer) target = Math.abs(this.tiltVal) < 0.05 ? 0 : this.tiltVal;
    // teclado muda aos poucos (dá para dosar a direção)
    const rate = (kl || kr) ? 3.2 : 12;
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    this.brake = Math.max(this.touchBrake, kd ? 1 : 0);
    let gas = Math.max(this.touchGas, ku ? 1 : 0);
    if (this.autoGas && this.brake === 0) gas = Math.max(gas, 1);
    this.throttle = this.brake > 0 && gas < 0.5 ? 0 : gas;
    return this;
  }
};
