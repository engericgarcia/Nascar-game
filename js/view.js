/* ============================================================
   view.js - cena 3D: posiciona os carros, carro-madrinha,
   equipes de box e as câmeras (cockpit, perseguição, TV,
   helicóptero) + retrovisor no cockpit.
   ============================================================ */
import * as THREE from 'three';
import { makeCarMesh, makePaceCar, makeCrew, setCarQuality } from './cars.js';
import { Sky, Effects, horizonColor, SUN_DIR } from './env.js';
import { Pylon, buildPitBoxes } from './scenery.js';

export const CAMS = ['cockpit', 'chase', 'tv', 'heli'];
export const CAM_NAMES = { cockpit: 'Cockpit', chase: 'Perseguição', tv: 'TV', heli: 'Helicóptero' };

const UP = new THREE.Vector3(0, 1, 0);

export class View {
  constructor(canvas, quality) {
    this.quality = quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality >= 1, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][quality]));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    setCarQuality(quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 7000);
    this.mirrorCam = new THREE.PerspectiveCamera(28, 4, 0.5, 900);
    this.addLights();
    this.camMode = 'chase';
    this.tvIndex = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camDir = new THREE.Vector3(0, 0, 1);
    this.first = true;
    this.resize();
  }

  addLights() {
    const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x5d6a44, 1.25);
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.4);
    sun.position.copy(SUN_DIR);
    this.scene.add(hemi, sun);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  setup(track, sim) {
    this.track = track;
    this.sim = sim;
    const def = track.def;
    const hz = horizonColor(def);
    this.scene.background = hz;
    this.scene.fog = new THREE.Fog(hz, track.L > 3000 ? 1100 : 600, track.L > 3000 ? 5200 : 2800);
    track.build(this.scene, this.quality);
    track.buildStalls(sim.cars.map(c => c.info));
    buildPitBoxes(track, track.group, sim.cars.map(c => c.info));
    this.pylon = new Pylon(track, track.group);
    this.skyObj = new Sky(this.scene, this.renderer, def, track.center, track.radius, this.quality);
    this.fx = new Effects(this.scene, this.quality);
    this.meshes = sim.cars.map(c => {
      const m = makeCarMesh(c.info, this.quality);
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      return m;
    });
    this.pace = makePaceCar(this.quality);
    this.pace.matrixAutoUpdate = false;
    this.scene.add(this.pace);
    // equipes de box (grupo reaproveitado entre carros)
    this.crews = [];
    for (let i = 0; i < 8; i++) {
      const cr = makeCrew(0xffffff);
      cr.visible = false;
      this.scene.add(cr);
      this.crews.push({ g: cr, car: null });
    }
    // câmeras de TV em volta do oval
    const n = Math.max(6, Math.round(track.L / 320));
    this.tvCams = [];
    for (let i = 0; i < n; i++) {
      const s = track.L * (i + 0.5) / n;
      // câmeras no infield, em torres de alturas diferentes (como na transmissão)
      const d = -track.W / 2 - track.apron - (i % 2 ? 16 : 28);
      const p = track.toWorld(s, d, new THREE.Vector3());
      p.y = (i % 2 ? 10 : 22) + (track.L > 3000 ? 8 : 0);
      this.tvCams.push({ s, pos: p });
    }
    this.first = true;
  }

  /* matriz do carro a partir de (s, d, psi) */
  carMatrix(s, d, psi, lift, m) {
    const tr = this.track;
    const o = tr.sample(s, _o);
    const onAsphalt = d > -tr.W / 2 - 0.2;
    const b = onAsphalt ? o.bank : Math.atan(0.05) * (d > -tr.W / 2 - tr.apron ? 1 : 0);
    _p.set(o.x + o.nx * d, tr.heightAt(s, d, o.bank) + (lift || 0), o.z + o.nz * d);
    // frente girada psi para a esquerda
    const lx = o.fz, lz = -o.fx;
    const cs = Math.cos(psi), sn = Math.sin(psi);
    _f.set(o.fx * cs + lx * sn, 0, o.fz * cs + lz * sn);
    _n.set(-o.nx * Math.sin(b), Math.cos(b), -o.nz * Math.sin(b));
    _x.crossVectors(_n, _f).normalize();
    _z.crossVectors(_x, _n).normalize();
    m.makeBasis(_x, _n, _z);
    m.setPosition(_p);
    return m;
  }

  update(dt, hudInfo) {
    const sim = this.sim, tr = this.track;
    const cars = sim.cars;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], m = this.meshes[i];
      if (c.mode === 'dnf' && sim.t - c.retireT > 4) { m.visible = false; continue; }
      m.visible = true;
      let lift = 0;
      if (c.mode === 'pit' && c.pit && c.pit.phase === 'stop') {
        const el = c.pit.total - c.pit.timer;
        if (el > 0.8 && c.pit.timer > 0.6) lift = 0.12;
      }
      // leve balanço com a velocidade
      this.carMatrix(c.s, c.d, c.psi, lift + Math.sin(sim.t * 30 + i) * 0.004 * Math.min(1, c.v / 30), m.matrix);
      m.matrixWorldNeedsUpdate = true;
    }
    const pc = sim.paceCar;
    this.pace.visible = pc.active;
    if (pc.active) {
      this.carMatrix(pc.s, pc.d, 0, 0, this.pace.matrix);
      this.pace.matrixWorldNeedsUpdate = true;
      const [l1, l2] = this.pace.userData.lights;
      const on = Math.floor(sim.t * 5) % 2;
      l1.material.color.setHex(on ? 0xffb000 : 0x442200);
      l2.material.color.setHex(on ? 0x442200 : 0xffb000);
    }
    this.updateCrews(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.skyObj.update(sim.t, this.camera);
    this.pylon.update(dt, sim.ranking);
  }

  /* fumaça, faíscas e marcas de pneu */
  updateEffects(dt) {
    const sim = this.sim, fx = this.fx;
    const cars = sim.cars;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], m = this.meshes[i];
      if (!m.visible && !(this.camMode === 'cockpit' && c === (this.focus || sim.player))) continue;
      const mm = m.matrix;
      _x.setFromMatrixColumn(mm, 0).normalize();     // esquerda
      _z.setFromMatrixColumn(mm, 2).normalize();     // frente
      const spin = c.mode === 'spin';
      const slide = c.over > 0.35 && c.v > 15;
      const burn = c.finished && c.finishPos === 1 && sim.t - c.finishT > 3 && sim.t - c.finishT < 9;
      const wheels = spin ? WHEEL_POS : WHEEL_POS.slice(2);
      if (spin || slide || burn) {
        wheels.forEach((w, k) => {
          const wp = _w.set(w[0], 0.02, w[1]).applyMatrix4(mm);
          fx.skid(i * 4 + k + (spin ? 0 : 2), wp, _x);
          const rate = spin ? 30 : burn ? 45 : 6 + c.over * 10;
          if (Math.random() < dt * rate) {
            _v.copy(_z).multiplyScalar(c.v * 0.3).add(_r.set(Math.random() - 0.5, 1 + Math.random(), Math.random() - 0.5));
            fx.smoke.emit(_w.set(w[0], 0.35, w[1]).applyMatrix4(mm), _v, 2.2, 2.6, SMOKE, 0.55, 3.2);
          }
        });
      } else {
        for (let k = 0; k < 4; k++) fx.endSkid(i * 4 + k);
      }
      // faíscas raspando no muro (lado direito) ou em outro carro
      const sparkRate = (c.scrape || 0) * 90 + Math.max(0, c.contact - 0.3) * 60;
      if (sparkRate > 1 && c.v > 10) {
        const n = Math.min(6, Math.floor(sparkRate * dt + Math.random()));
        for (let k = 0; k < n; k++) {
          const side = c.scrape > 0.1 ? -0.98 : (Math.random() < 0.5 ? -0.98 : 0.98);
          const p = _w.set(side, 0.25 + Math.random() * 0.4, (Math.random() - 0.3) * 4).applyMatrix4(mm);
          _v.copy(_z).multiplyScalar(c.v * (0.55 + Math.random() * 0.3)).add(_r.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6));
          fx.sparks.emit(p, _v, 0.55, 0.35 + Math.random() * 0.35, Math.random() < 0.5 ? SPARK1 : SPARK2, 1, 0);
        }
      }
      // carro muito danificado solta fumaça do motor
      if (c.damage > 0.55 && c.mode !== 'dnf' && Math.random() < dt * 10) {
        _v.copy(_z).multiplyScalar(c.v * 0.2).add(_r.set(0, 1.5, 0));
        fx.smoke.emit(_w.set(0, 0.9, 2.0).applyMatrix4(mm), _v, 1.4, 2.2, DMG, 0.5, 2.2);
      }
    }
    fx.update(dt);
  }

  updateCrews() {
    const sim = this.sim, tr = this.track;
    // libera equipes de carros que já saíram
    for (const cr of this.crews) {
      if (cr.car && (cr.car.mode !== 'pit' || !cr.car.pit || cr.car.pit.phase === 'merge')) { cr.car = null; cr.g.visible = false; }
    }
    for (const c of sim.cars) {
      if (c.mode !== 'pit' || !c.pit) continue;
      const ph = c.pit.phase;
      if (ph !== 'road' && ph !== 'stop' && ph !== 'out') continue;
      let cr = this.crews.find(x => x.car === c);
      if (!cr) {
        cr = this.crews.find(x => !x.car);
        if (!cr) continue;
        cr.car = c; cr.g.visible = true;
        cr.g.children.forEach(p => p.children[0].material.color.set(c.info.color));
      }
      const stallS = tr.stallS(c.stall, sim.n);
      // posições: esperando atrás do muro, ou em volta do carro
      const wallD = tr.pitInner - 1.2;
      let t = 0;
      if (ph === 'stop') t = Math.min(1, (c.pit.total - c.pit.timer) / 0.7);
      if (ph === 'stop' && c.pit.timer < 0.8) t = c.pit.timer / 0.8;
      const spots = [[1.2, 1.5], [1.2, -1.4], [-1.2, 1.5], [-1.2, -1.4], [1.3, 0.1]]; // (lado, frente)
      cr.g.children.forEach((p, k) => {
        const [side, fw] = spots[k];
        const sWait = stallS + (k - 2) * 1.2;
        const sCar = stallS + fw;
        const dCar = tr.pitStallD - side;          // lado direito do carro = +d
        const s = sWait + (sCar - sWait) * t;
        const d = wallD + (dCar - wallD) * t;
        tr.toWorld(s, d, _p);
        p.position.set(_p.x, -0.34 + (ph === 'stop' && t > 0 && t < 1 ? Math.sin(t * Math.PI) * 0.8 : 0), _p.z);
        // agachados trocando pneu
        p.scale.y = ph === 'stop' && t >= 1 && k < 4 ? 0.65 : 1;
        p.lookAt(tr.toWorld(sCar, tr.pitStallD, _q).x, p.position.y, _q.z);
      });
    }
  }

  cycleCam() {
    const i = CAMS.indexOf(this.camMode);
    this.camMode = CAMS[(i + 1) % CAMS.length];
    this.first = true;
  }

  updateCamera(dt) {
    const sim = this.sim, tr = this.track, cam = this.camera;
    const c = this.focus || sim.player;
    const i = sim.cars.indexOf(c);
    const m = this.meshes[i].matrix;
    _p.setFromMatrixPosition(m);
    _z.setFromMatrixColumn(m, 2);         // frente
    _n.setFromMatrixColumn(m, 1);         // cima
    const k = this.first ? 1 : 1 - Math.exp(-dt * 8);
    this.meshes.forEach((mm, j) => { if (j === i) mm.visible = this.camMode !== 'cockpit' && mm.visible; });
    cam.up.copy(UP);
    let fov = 62;
    this.tvLabel = null;
    if (this.camMode === 'cockpit') {
      // olho do piloto (sentado à esquerda do centro)
      _q.set(0.36, 1.08, -0.15).applyMatrix4(m);
      cam.position.copy(_q);
      _q.copy(_p).addScaledVector(_z, 60).addScaledVector(_n, 1.0);
      cam.up.copy(_n);
      cam.lookAt(_q);
      fov = 66;
    } else if (this.camMode === 'chase' || this.camMode === 'heli') {
      // direção suavizada (sem atraso de posição: o carro fica sempre no lugar)
      const fwd = _f.copy(_z); fwd.y = 0; fwd.normalize();
      if (c.mode === 'spin' || c.mode === 'recover') { const o = tr.sample(c.s, _o); fwd.set(o.fx, 0, o.fz); }
      if (this.first) this.camDir.copy(fwd);
      else { this.camDir.lerp(fwd, 1 - Math.exp(-dt * 6)); this.camDir.normalize(); }
      const dir = this.camDir;
      if (this.camMode === 'chase') {
        cam.position.copy(_p).addScaledVector(dir, -9.5).addScaledVector(_n, 3.2);
        cam.position.y += 0.3;
        this.camLook.copy(_p).addScaledVector(dir, 7).addScaledVector(_n, 1.1);
        cam.up.copy(UP).lerp(_n, 0.6).normalize();
        cam.lookAt(this.camLook);
        fov = 58 + Math.min(12, c.v / 8);
      } else {
        const right = _x.set(-dir.z, 0, dir.x);
        cam.position.copy(_p).addScaledVector(dir, -32).addScaledVector(right, 12);
        cam.position.y += 30;
        this.camLook.copy(_p).addScaledVector(dir, 22);
        cam.lookAt(this.camLook);
        fov = 55;
      }
    } else {
      // TV: câmera fixa mais perto à frente do carro, com zoom
      let best = 0, bd = 1e9;
      const n = this.tvCams.length;
      for (let j = 0; j < n; j++) {
        const dd = tr.delta(c.s, this.tvCams[j].s);
        const score = dd > -tr.L / n * 0.35 ? dd : dd + tr.L;
        if (score < bd) { bd = score; best = j; }
      }
      this.tvIndex = best;
      const tc = this.tvCams[best];
      cam.position.copy(tc.pos);
      if (this.first || this.lastTv !== best) this.camLook.copy(_p);
      this.camLook.lerp(_p, 1 - Math.exp(-dt * 12));
      cam.lookAt(this.camLook);
      const dist = tc.pos.distanceTo(_p);
      fov = THREE.MathUtils.clamp(2 * Math.atan(11 / dist) * 180 / Math.PI, 5, 60);
      this.lastTv = best;
      this.tvLabel = 'TV ' + (best + 1);
    }
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.first = false;

    // retrovisor
    this.mirror = this.camMode === 'cockpit' && this.quality >= 1;
    if (this.mirror) {
      _q.set(0.0, 1.2, 0.2).applyMatrix4(m);
      this.mirrorCam.position.copy(_q);
      _q.copy(_p).addScaledVector(_z, -60);
      this.mirrorCam.up.copy(_n);
      this.mirrorCam.lookAt(_q);
    }
  }

  mirrorRect() {
    const w = this.w, h = this.h;
    const mw = Math.min(w * 0.3, 300), mh = mw * 0.22;
    return { x: w * 0.5 - mw / 2, y: h * 0.035, w: mw, h: mh };
  }

  render() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.w, this.h);
    this.fx.setScale(r, this.camera);
    r.render(this.scene, this.camera);
    if (this.mirror) {
      // retrovisor: renderiza para trás numa textura e desenha espelhada
      if (!this.mirrorRT) {
        this.mirrorRT = new THREE.WebGLRenderTarget(384, 88);
        this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
        this.mirrorRT.texture.wrapS = THREE.RepeatWrapping;
        this.mirrorRT.texture.repeat.x = -1;
        this.mirrorScene = new THREE.Scene();
        this.mirrorOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.mirrorScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture, depthTest: false })));
      }
      const mr = this.mirrorRect();
      this.mirrorCam.aspect = mr.w / mr.h;
      this.mirrorCam.updateProjectionMatrix();
      r.setRenderTarget(this.mirrorRT);
      r.render(this.scene, this.mirrorCam);
      r.setRenderTarget(null);
      const y = this.h - mr.y - mr.h;
      r.autoClear = false;
      r.setViewport(mr.x, y, mr.w, mr.h);
      r.render(this.mirrorScene, this.mirrorOrtho);
      r.autoClear = true;
      r.setViewport(0, 0, this.w, this.h);
    }
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); });
      }
    });
    this.scene.clear();
    if (this.scene.environment) { this.scene.environment.dispose(); this.scene.environment = null; }
    this.addLights();
  }
}

const WHEEL_POS = [[0.84, 1.55], [-0.84, 1.55], [0.84, -1.45], [-0.84, -1.45]];
const SMOKE = new THREE.Color(0.86, 0.86, 0.86), DMG = new THREE.Color(0.18, 0.18, 0.2);
const SPARK1 = new THREE.Color(1, 0.75, 0.3), SPARK2 = new THREE.Color(1, 0.95, 0.7);
const _w = new THREE.Vector3(), _v = new THREE.Vector3(), _r = new THREE.Vector3();
const _o = {};
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _f = new THREE.Vector3();
const _n = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
