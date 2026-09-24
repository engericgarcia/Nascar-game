/* ============================================================
   data.js - pistas, equipes, pilotos e pontuação
   Números das pistas vêm das fichas técnicas reais (comprimento
   em milhas e inclinação das curvas); os nomes são fictícios.
   ============================================================ */

export const MILE = 1609.34;
export const MPH = 2.23694;          // m/s -> mph

/* Cada pista é descrita pelas peças do traçado (retas e curvas).
   bankTurn / bankStraight em graus. */
export const TRACKS = [
  {
    id: 'superspeedway', name: 'Coastal Superspeedway', ref: 'inspirada em Daytona',
    miles: 2.5, kind: 'Superspeedway', bankTurn: 31, bankStraight: 3, bankTri: 18,
    width: 18, triOval: true, power: 0.7,        // placa restritora
    sky: 0x7fb0f0, grass: 0x6f8a4a, desc: '2,5 mi · curvas 31° · tri-oval 18°'
  },
  {
    id: 'intermediate', name: 'Queen City Motor Speedway', ref: 'inspirada em Charlotte',
    miles: 1.5, kind: 'Intermediária', bankTurn: 24, bankStraight: 5, bankTri: 5,
    width: 16, triOval: true, power: 1.0,
    sky: 0x86aee8, grass: 0x6c8c46, desc: '1,5 mi · curvas 24° · retas 5°'
  },
  {
    id: 'shorttrack', name: 'Thunder Valley', ref: 'inspirada em Bristol',
    miles: 0.533, kind: 'Pista curta', bankTurn: 26, bankStraight: 6, bankTri: 6,
    width: 13, triOval: false, power: 1.0,
    sky: 0x9ab8e0, grass: 0x5f7f40, desc: '0,533 mi · curvas 24–28° · muito rápida e apertada'
  },
  {
    id: 'paperclip', name: 'Old Dominion Paperclip', ref: 'inspirada em Martinsville',
    miles: 0.526, kind: 'Pista curta', bankTurn: 12, bankStraight: 0, bankTri: 0,
    width: 13, triOval: false, paperclip: true, power: 1.0,
    sky: 0x8fb4e4, grass: 0x688a44, desc: '0,526 mi · curvas 12° · freadas fortes'
  }
];

/* Pontuação da Cup Series: vitória 55, 2º 35, 3º 34 ... até 1 ponto.
   Estágios 1 e 2 dão 10..1 para os dez primeiros. */
export function finishPoints(pos) {
  if (pos === 1) return 55;
  return Math.max(1, 37 - pos);
}
export function stagePoints(pos) { return pos <= 10 ? 11 - pos : 0; }

const FIRST = ['Rick', 'Dale', 'Tony', 'Kyle', 'Chase', 'Joey', 'Denny', 'Ryan', 'Brad', 'Kevin',
  'Bubba', 'Austin', 'Ross', 'Tyler', 'Erik', 'Chris', 'Daniel', 'Alex', 'Cole', 'Ty',
  'Noah', 'Josh', 'Corey', 'Justin', 'Michael', 'Todd', 'Zane', 'Harrison', 'Carson', 'Shane',
  'Nelson', 'Rubens', 'Felipe', 'Cacá', 'Miguel', 'Hélio', 'Lucas', 'Pedro', 'Bruno', 'Thiago'];
const LAST = ['Walker', 'Harlan', 'Bishop', 'Stroud', 'McCall', 'Loring', 'Hatcher', 'Pruitt', 'Crane', 'Dawson',
  'Rowe', 'Tanner', 'Burke', 'Gentry', 'Holt', 'Sawyer', 'Maddox', 'Keller', 'Rhodes', 'Boone',
  'Colby', 'Ferris', 'Garner', 'Hollis', 'Jarrett', 'Knox', 'Lyle', 'Monroe', 'Nash', 'Oakley',
  'Piquet', 'Barrichello', 'Massa', 'Bueno', 'Fontana', 'Castro', 'Moraes', 'Nunes', 'Senna', 'Vidal'];
const SPONSORS = ['TURBO COLA', 'ACME OIL', 'BIG BURGER', 'SPARK PLUGS', 'RED ROOSTER', 'FASTLANE',
  'GATOR ADE', 'PEAK POWER', 'IRON TOOLS', 'SUNRISE', 'ROCKET', 'NITRO', 'EAGLE AUTO', 'BLUE STAR',
  'MAX TIRE', 'HOT DOGZ', 'CRUNCH', 'VOLT', 'BOLT', 'THUNDER', 'COWBOY', 'WILDCAT', 'COBRA',
  'PIRATE', 'SPEEDY', 'LUCKY 7', 'ALPHA', 'OMEGA', 'SUMMIT', 'HARBOR', 'MUSTANG', 'VIPER',
  'GRIZZLY', 'FALCON', 'HAWK', 'TITAN', 'GLOBAL', 'PRIME', 'ZOOM', 'ORBIT'];
const COLORS = [
  ['#d7261e', '#ffffff'], ['#1c49c9', '#ffd21f'], ['#f6c90e', '#111111'], ['#111111', '#e3232b'],
  ['#1d9e4b', '#ffffff'], ['#ff7a00', '#1a1a1a'], ['#ffffff', '#1c49c9'], ['#6a1bb3', '#ffcc00'],
  ['#00a5d6', '#ffffff'], ['#b8b8b8', '#c3001f'], ['#0d2b6b', '#ff3b30'], ['#e8178a', '#ffffff'],
  ['#2d2d2d', '#35d04a'], ['#8b0000', '#f4d03f'], ['#ffffff', '#d7261e'], ['#004d26', '#f6c90e'],
  ['#ffd400', '#0044cc'], ['#3a3a3a', '#ff8c00'], ['#00b3a4', '#101010'], ['#c0392b', '#2c3e50']
];
const MAKES = ['Chevrolet', 'Ford', 'Toyota'];

/* Monta o grid: número, piloto, cores, patrocinador e habilidade */
export function makeField(n, playerName) {
  const used = new Set([48]);
  const field = [];
  field.push({
    num: 48, name: playerName || 'Você', first: '', color: '#d7261e', color2: '#ffffff',
    sponsor: 'BRASIL RACING', make: 'Chevrolet', skill: 1, player: true
  });
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 1; i < n; i++) {
    let num;
    do { num = 1 + Math.floor(rnd() * 99); } while (used.has(num));
    used.add(num);
    const c = COLORS[i % COLORS.length];
    field.push({
      num, name: FIRST[i % FIRST.length] + ' ' + LAST[(i * 7) % LAST.length],
      color: c[0], color2: c[1], sponsor: SPONSORS[i % SPONSORS.length],
      make: MAKES[i % 3], skill: 0.93 + rnd() * 0.07, aggression: rnd(), player: false
    });
  }
  return field;
}
