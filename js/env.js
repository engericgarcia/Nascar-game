/* ============================================================
   env.js - céu com degradê e sol, nuvens, reflexo do ambiente
   (para a pintura brilhar), dirigível, e efeitos: fumaça de
   pneu, faíscas e marcas de pneu no asfalto.
   ============================================================ */
import * as THREE from 'three';

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  col += vec3(1.0, 0.92, 0.75) * (pow(sd, 700.0) * 3.0 + pow(sd, 12.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.35).normalize();

function skyMaterial(def) {
  const top = new THREE.Color(def.sky).multiplyScalar(0.62);
  top.offsetHSL(0.02, 0.15, -0.05);
  const hor = new THREE.Color(def.sky).lerp(new THREE.Color(0xf2f5f8), 0.55);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: top }, uHorizon: { value: hor },
      uGround: { value: new THREE.Color(0x8a9178) }, uSun: { value: SUN_DIR.clone() }
    },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false
  });
}

export function horizonColor(def) {
  return new THREE.Color(def.sky).lerp(new THREE.Color(0xf2f5f8), 0.55);
}

export class Sky {
  constructor(scene, renderer, def, center, radius, quality) {
    this.group = new THREE.Group();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial(def));
    sky.scale.setScalar(6000);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    this.group.add(sky);

    // reflexo do ambiente (PMREM a partir de um céu parecido)
    if (quality > 0) {
      const envScene = new THREE.Scene();
      const s2 = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial(def));
      envScene.add(s2);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x55604a }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -1.5;
      envScene.add(ground);
      // "arquibancadas" claras no horizonte refletem na lataria
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.3), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd0d4da : 0x9aa2ab }));
        const a = i / 8 * Math.PI * 2;
        b.position.set(Math.cos(a) * 8, -0.6, Math.sin(a) * 8); b.lookAt(0, -0.6, 0);
        envScene.add(b);
      }
      const pm = new THREE.PMREMGenerator(renderer);
      this.envTex = pm.fromScene(envScene, 0.02).texture;
      scene.environment = this.envTex;
      pm.dispose();
    }

    // nuvens
    const cloudTex = makeCloudTex();
    const r = mulberry(7);
    const nClouds = quality === 0 ? 8 : 18;
    for (let i = 0; i < nClouds; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.75 + r() * 0.25 });
      const sp = new THREE.Sprite(mat);
      const a = r() * Math.PI * 2, d = radius + 1800 + r() * 1800;
      sp.position.set(center.x + Math.cos(a) * d, 350 + r() * 700, center.z + Math.sin(a) * d);
      const s = 500 + r() * 700;
      sp.scale.set(s, s * 0.42, 1);
      sp.renderOrder = -5;
      this.group.add(sp);
    }

    // dirigível dando voltas sobre a pista
    this.blimp = makeBlimp();
    this.blimpR = radius * 0.7;
    this.center = center.clone();
    this.group.add(this.blimp);
    scene.add(this.group);
  }

  update(t, camera) {
    this.sky.position.copy(camera.position);
    const a = t * 0.012;
    this.blimp.position.set(this.center.x + Math.cos(a) * this.blimpR, 170, this.center.z + Math.sin(a) * this.blimpR);
    this.blimp.rotation.y = -a;
  }
}

function mulberry(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function makeCloudTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const r = mulberry(3);
  for (let i = 0; i < 22; i++) {
    const cx = 40 + r() * 176, cy = 50 + r() * 40, rad = 18 + r() * 34;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
  }
  // base levemente acinzentada
  const g2 = x.createLinearGradient(0, 60, 0, 128);
  g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(120,130,150,0.12)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = g2; x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBlimp() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e9ecef'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = '#0d2b6b'; x.fillRect(0, 50, 512, 30);
  x.font = 'italic 900 26px Arial Black, Arial'; x.fillStyle = '#ffd21f'; x.textAlign = 'center';
  x.fillText('OVAL 500', 128, 74); x.fillText('OVAL 500', 384, 74);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), new THREE.MeshLambertMaterial({ map: tex }));
  body.scale.set(9, 9, 34);
  body.rotation.y = Math.PI / 2;
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 8), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  gondola.position.y = -9.5;
  g.add(body, gondola);
  for (const [ry, rz] of [[0, 0], [0, Math.PI / 2]]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 12, 6), new THREE.MeshLambertMaterial({ color: 0x0d2b6b }));
    fin.rotation.z = rz; fin.position.x = 30;
    g.add(fin);
  }
  return g;
}

/* ============================================================
   Efeitos: partículas (fumaça/faísca) e marcas de pneu
   ============================================================ */
const P_VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale;
varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  vA = aAlpha; vC = aColor;
}`;
const P_FS = `
varying float vA; varying vec3 vC;
uniform float uSoft;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = uSoft > 0.5 ? smoothstep(0.5, 0.0, d) : smoothstep(0.5, 0.25, d);
  gl_FragColor = vec4(vC, a * vA);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, n, additive, soft) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n); this.col = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n);
    this.a0 = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft ? 1 : 0 } },
      vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.gravity = additive ? -9.8 : 0.6;
    this.additive = additive;
    scene.add(this.pts);
  }
  emit(p, v, size, life, color, alpha, grow) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grow[i] = grow || 0;
    this.a0[i] = alpha;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
  }
  update(dt) {
    const drag = this.additive ? 0.6 : 1.8;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const f = Math.exp(-drag * dt);
      this.vel[i * 3] *= f; this.vel[i * 3 + 2] *= f;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * f + this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * (this.additive ? k : k * (1 - k) * 4);
    }
    const g = this.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
  }
}

class Skids {
  constructor(scene, n) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 4 * 3);
    const idx = [];
    for (let q = 0; q < n; q++) { const b = q * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  add(a, b, side) {
    // quadrilátero de a até b com largura 0.28 (side = vetor lateral)
    const q = this.i; this.i = (q + 1) % this.n;
    const P = this.pos, o = q * 12, w = 0.14;
    const put = (k, p, s) => { P[o + k * 3] = p.x + side.x * s; P[o + k * 3 + 1] = p.y + 0.04; P[o + k * 3 + 2] = p.z + side.z * s; };
    put(0, a, -w); put(1, a, w); put(2, b, -w); put(3, b, w);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, quality) {
    this.smoke = new Particles(scene, quality === 0 ? 150 : 400, false, true);
    this.sparks = new Particles(scene, quality === 0 ? 80 : 220, true, false);
    this.skids = new Skids(scene, quality === 0 ? 300 : 900);
    this.last = new Map();
  }
  setScale(renderer, camera) {
    const h = renderer.domElement.height;
    const s = h / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.smoke.mat.uniforms.uScale.value = s;
    this.sparks.mat.uniforms.uScale.value = s;
  }
  update(dt) { this.smoke.update(dt); this.sparks.update(dt); }
  /* marca de pneu contínua por roda */
  skid(key, p, side) {
    const prev = this.last.get(key);
    if (prev && prev.distanceToSquared(p) < 16 && prev.distanceToSquared(p) > 0.25) this.skids.add(prev, p, side);
    if (!prev || prev.distanceToSquared(p) > 0.25) this.last.set(key, p.clone());
  }
  endSkid(key) { this.last.delete(key); }
}
