// Pruebas masivas del motor de carrera (determinismo, DNF, safety car, consistencia).
// Uso: node scripts/probar-motor.mjs
import fs from 'node:fs';
import * as E from '../supabase/functions/_shared/engine.js';
const DATA = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/temporadas.json', import.meta.url), 'utf8'));
const tracks = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), 'utf8'));
let bad = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) bad++; };
const human = (r) => ({ id: 'a', name: "Tú '23", driver: 'Tú', year: '2023', color: '#ff3b30', d: r, c: r, m: r, j: r, s: r });
const N = 600;

// determinismo
const a = E.runRace({ DATA, tracks, seed: 'x1', humans: [human(90)] }), b = E.runRace({ DATA, tracks, seed: 'x1', humans: [human(90)] });
ok(JSON.stringify(a) === JSON.stringify(b), 'misma semilla y mismas elecciones: resultado idéntico');

const stats = (r, decisions) => {
  let races = 0, withSC = 0, dnfTotal = 0, lowCars = 0, lowDnf = 0, hiCars = 0, hiDnf = 0, humanDnf = 0, wins = 0, podium = 0, n22 = 0, tmin = 1e9, tmax = 0, scLapAvg = 0;
  const problems = [];
  for (let i = 0; i < N; i++) {
    const race = E.runRace({ DATA, tracks, seed: 's' + i, humans: [human(r)], decisions });
    races++; if (race.cars.length === 22) n22++;
    if (race.sc) { withSC++; scLapAvg += race.sc.lap; }
    for (const c of race.cars) {
      if (c.dnf) dnfTotal++;
      if (!c.human) { if (c.d < 75) { lowCars++; if (c.dnf) lowDnf++; } else { hiCars++; if (c.dnf) hiDnf++; } }
      for (let k = 1; k < c.cum.length; k++) if (!(c.cum[k] > c.cum[k - 1])) problems.push(`${c.key} cum no crece en vuelta ${k} (seed s${i})`);
      if (c.cum.some((x) => !Number.isFinite(x))) problems.push('NaN en ' + c.key);
      if (!c.dnf && c.cum.length !== race.laps + 1) problems.push(`${c.key} terminó con ${c.cum.length - 1} vueltas`);
    }
    const h = race.cars.find((c) => c.human);
    if (h.dnf) humanDnf++; else { if (h.pos === 1) wins++; if (h.pos <= 3) podium++; }
    if (new Set(race.classification).size !== 22) problems.push('clasificación incompleta s' + i);
    const t = race.cars.filter((c) => !c.dnf).map((c) => c.cum[race.laps]); tmin = Math.min(tmin, ...t); tmax = Math.max(tmax, ...t);
    for (const e of race.events) if (!Number.isFinite(e.T)) problems.push('evento sin tiempo');
  }
  return { races, n22, withSC, dnfPerRace: dnfTotal / races, lowRate: lowDnf / Math.max(1, lowCars), hiRate: hiDnf / Math.max(1, hiCars), lowPerRace: lowCars / races, humanDnf, wins, podium, scLap: scLapAvg / Math.max(1, withSC), tmin, tmax, problems };
};

const s90 = stats(90);
console.log(`\nPiloto de 90 de media, ${N} carreras:`);
console.log(`  autos por carrera: 22 en ${s90.n22}/${N}`);
console.log(`  safety car: ${(100 * s90.withSC / N).toFixed(0)}% de las carreras (vuelta media ${s90.scLap.toFixed(1)})`);
console.log(`  abandonos por carrera: ${s90.dnfPerRace.toFixed(2)}`);
console.log(`  rivales con menos de 75 por carrera: ${s90.lowPerRace.toFixed(1)}; abandonan el ${(100 * s90.lowRate).toFixed(0)}% (los de 75 o más: ${(100 * s90.hiRate).toFixed(1)}%)`);
console.log(`  tu piloto de 90: gana ${(100 * s90.wins / N).toFixed(0)}%, podio ${(100 * s90.podium / N).toFixed(0)}%, abandona ${(100 * s90.humanDnf / N).toFixed(0)}%`);
ok(s90.problems.length === 0, 'tiempos crecientes, sin NaN y todos terminan las 20 vueltas' + (s90.problems.length ? ': ' + s90.problems.slice(0, 3).join('; ') : ''));
ok(s90.n22 === N, 'siempre hay 22 autos');
ok(s90.lowRate > 0.25 && s90.lowRate < 0.7, `los pilotos de menos de 75 abandonan seguido (${(100 * s90.lowRate).toFixed(0)}%)`);
ok(s90.hiRate < 0.05, `los de 75 o más casi no abandonan (${(100 * s90.hiRate).toFixed(1)}%)`);
ok(s90.withSC / N > 0.35 && s90.withSC / N < 0.85, 'el safety car sale en una parte razonable de las carreras');
ok(s90.dnfPerRace >= 0.8 && s90.dnfPerRace <= 3.5, 'entre 1 y 3 abandonos por carrera');
const s94 = stats(94);
console.log(`Piloto de 94 de media: gana ${(100 * s94.wins / N).toFixed(0)}%, podio ${(100 * s94.podium / N).toFixed(0)}%`);
ok(s94.wins / N > 0.2 && s94.wins / N < 0.85, 'un auto de 94 gana seguido pero no siempre');
ok(s90.podium / N > 0.15, 'un auto de 90 llega al podio a veces');

const s60 = stats(60);
console.log(`\nPiloto de 60 de media: abandona ${(100 * s60.humanDnf / N).toFixed(0)}% de las carreras`);
ok(s60.humanDnf / N > 0.3 && s60.humanDnf / N < 0.8, 'un piloto flojo choca seguido');

// la decisión con el safety car cambia el resultado del jugador (y solo cuando hay safety car)
let diff = 0, withSc = 0, better = 0, worse = 0, same = 0;
for (let i = 0; i < N; i++) {
  const base = E.runRace({ DATA, tracks, seed: 'd' + i, humans: [human(88)], decisions: { a: 'stay' } });
  const pit = E.runRace({ DATA, tracks, seed: 'd' + i, humans: [human(88)], decisions: { a: 'pit' } });
  const hb = base.cars.find((c) => c.human), hp = pit.cars.find((c) => c.human);
  if (!base.sc) { if (JSON.stringify(base.classification) !== JSON.stringify(pit.classification)) diff++; continue; }
  withSc++;
  // lo que pasó antes del safety car es idéntico
  const before = (r) => r.cars.map((c) => c.cum.slice(0, base.sc.lap + 1).join(',')).join('|');
  if (before(base) !== before(pit)) diff++;
  if (hb.dnf || hp.dnf) { same++; continue; }
  if (hp.pos < hb.pos) better++; else if (hp.pos > hb.pos) worse++; else same++;
}
console.log(`\nDecisión con safety car (${withSc} carreras con SC): entrar a boxes mejora ${better}, empeora ${worse}, igual ${same}`);
ok(diff === 0, 'sin safety car la decisión no cambia nada, y antes del safety car todo es idéntico');
ok(better + worse > 0, 'la decisión sí cambia el resultado cuando hay safety car');

console.log(bad ? `\n❌ ${bad} pruebas fallaron` : '\n✅ Todo OK');
process.exit(bad ? 1 : 0);
