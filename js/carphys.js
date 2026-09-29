/* ============================================================
   carphys.js - física "de verdade" do carro, com números das
   corridas reais:

   PNEUS (por roda: LF, RF, LR, RR)
   - Em oval só se vira à esquerda: o peso vai para a direita,
     então o dianteiro direito (RF) é o que mais gasta e esquenta;
     um dos esquerdos é o que menos gasta (Goodyear / iRacing).
   - Os pneus da direita ganham até ~20 psi ao longo de uma
     sequência de voltas, por causa do calor.
   - Queda de rendimento: Charlotte perde no máximo ~1 s no fim
     da sequência; Bristol ~1 s em 30 voltas; Martinsville bem
     mais. Pneu frio (saindo do box) tem menos aderência na
     primeira volta. Pneu gasto até a lona estoura.
   - Troca de 2 pneus = só os do lado direito.

   VÁCUO / AERODINÂMICA
   - Quem vem atrás tem 20-30% menos arrasto; o da frente também
     ganha um pouco (o de trás "fecha" a baixa pressão dele), por
     isso 3 carros em fila andam mais que 2 e o pelotão é mais
     rápido que um carro sozinho.
   - Vácuo lateral (side draft): quem está do lado, um pouco atrás,
     "rouba" ar do carro da frente e o freia.
   - Ar sujo: atrás de outro carro, a frente perde pressão
     aerodinâmica nas curvas e o carro "sai de frente" (tight).
     Quem está na frente, em ar limpo, contorna melhor.

   DANO (separado em três partes)
   - Aerodinâmica (lataria, bico, aerofólio): mais arrasto e
     menos pressão aerodinâmica, pesa mais em alta velocidade.
   - Suspensão (braço da direção torto): carro "anda de lado",
     menos aderência e gasta pneu muito mais rápido.
   - Motor (radiador amassado batendo de frente): esquenta e perde
     potência; se passar do limite, quebra.
   - No box só dá para remendar (fita e "bear bond"), como na
     regra de carro danificado; suspensão leva mais tempo.
   ============================================================ */

export const LF = 0, RF = 1, LR = 2, RR = 3;
export const AMBIENT = 85;                 // °F
const T_OPT = 195;                         // temperatura ideal da banda de rodagem (°F)

/* vida dos pneus (voltas até o RF chegar a ~25% de borracha) em cada pista, no modo real */
export const TIRE_LIFE = { superspeedway: 130, intermediate: 70, shorttrack: 34, paperclip: 75 };

export function initCar(c) {
  c.tw = [1, 1, 1, 1];                      // borracha restante
  c.tt = [120, 120, 120, 120];              // temperatura
  c.psi0 = [22, 48, 20, 46];                // pressão a frio (esq. baixa, dir. alta)
  c.flat = -1;
  c.dmg = { aero: 0, susp: 0, engine: 0 };
  c.damage = 0;
  c.dirty = 0; c.side = 0; c.push = 0;
  c.gripF = 1; c.gripR = 1; c.gripEff = 1; c.balance = 0;
  c.waterT = 190;
  c.tire = 1;
}

export function tirePsi(c, i) { return c.psi0[i] + (c.tt[i] - AMBIENT) * 0.13; }

function wearGrip(w) { return 0.8 + 0.2 * Math.pow(Math.max(0, w), 0.7); }
function tempGrip(T) { const x = (T - T_OPT) / 110; return Math.max(0.84, 1 - 0.14 * x * x); }
function wheelGrip(c, i) {
  if (c.flat === i) return 0.3;
  return wearGrip(c.tw[i]) * tempGrip(c.tt[i]);
}

/* aderência mecânica de cada eixo (o lado direito carrega mais em oval) */
export function axleGrip(c) {
  const f = 0.65 * wheelGrip(c, RF) + 0.35 * wheelGrip(c, LF);
  const r = 0.6 * wheelGrip(c, RR) + 0.4 * wheelGrip(c, LR);
  const s = 1 - 0.12 * c.dmg.susp;
  return [f * s, r * s];
}

/* desgaste e temperatura a cada passo
   u = uso lateral (0..1), over = quanto passou do limite, br/th = freio/acelerador */
export function tireStep(c, dt, v, u, over, br, th, wearK) {
  const load = [0.55, 1.0, 0.5, 0.85];     // quanto cada roda trabalha na curva à esquerda
  const brake = [0.8, 1.0, 0.35, 0.4];
  const drive = [0, 0, 0.7, 1.0];
  const toe = 1 + 2.5 * c.dmg.susp;        // suspensão torta arrasta o pneu
  for (let i = 0; i < 4; i++) {
    const work = 0.12 + u * load[i] * 0.9 + br * brake[i] * 0.5 + th * drive[i] * 0.12 * Math.max(0, 1 - v / 40) + Math.min(1, over) * 1.2 * load[i];
    // temperatura: esquenta trabalhando, esfria com o vento
    const heat = v * (0.003 + 0.025 * u * load[i] + 0.02 * br * brake[i] + 0.03 * Math.min(1, over) * load[i]) * toe;
    c.tt[i] = Math.min(330, c.tt[i] + (heat - (c.tt[i] - AMBIENT) * 0.012 * (1 + v / 120)) * dt);
    const hot = 1 + Math.min(1.5, Math.max(0, (c.tt[i] - 235) / 60));   // superaquecido gasta mais
    if (c.flat !== i) c.tw[i] = Math.max(0, c.tw[i] - v * dt * wearK * work * hot * toe);
  }
  c.tire = Math.min(c.tw[RF], c.tw[RR], c.tw[LF], c.tw[LR]);
}

/* estouro: pneu gasto até a lona (ou muito quente) pode furar */
export function checkFlat(c, dt) {
  if (c.flat >= 0) return -1;
  for (let i = 0; i < 4; i++) {
    const risk = c.tw[i] < 0.06 ? (0.06 - c.tw[i]) * 6 : 0;
    const heat = c.tt[i] > 300 ? (c.tt[i] - 300) * 0.002 : 0;
    if (Math.random() < (risk + heat) * dt) { c.flat = i; return i; }
  }
  return -1;
}

export function addDamage(c, aero, susp, engine) {
  const d = c.dmg;
  d.aero = Math.min(1, d.aero + aero);
  d.susp = Math.min(1, d.susp + susp);
  d.engine = Math.min(1, d.engine + engine);
  c.damage = Math.min(1, d.aero * 0.5 + d.susp * 0.45 + d.engine * 0.35);
}
export function destroyed(c) { return c.dmg.aero >= 1 || c.dmg.susp >= 1 || c.dmg.engine >= 1; }

/* serviço de box: pneus novos (frios) e remendos */
export function service(c, kind) {
  const cold = AMBIENT + 20;
  const idx = kind === 'four' ? [0, 1, 2, 3] : kind === 'two' ? [RF, RR] : [];
  for (const i of idx) { c.tw[i] = 1; c.tt[i] = cold; if (c.flat === i) c.flat = -1; }
  if (c.flat >= 0) { c.tw[c.flat] = 1; c.tt[c.flat] = cold; c.flat = -1; }
  c.tire = Math.min(...c.tw);
  // remendo: fita e massa na lataria, alinhamento da suspensão
  c.dmg.aero *= 0.45;
  c.dmg.susp *= 0.3;
  c.damage = Math.min(1, c.dmg.aero * 0.5 + c.dmg.susp * 0.45 + c.dmg.engine * 0.35);
}
export function repairTime(c) {
  return (c.dmg.aero > 0.1 ? 3 + c.dmg.aero * 10 : 0) + (c.dmg.susp > 0.08 ? 6 + c.dmg.susp * 18 : 0) + (c.flat >= 0 ? 2 : 0);
}
