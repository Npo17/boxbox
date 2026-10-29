// Compara carreras en seco y con lluvia (abandonos, safety car, victorias de un auto de 90). Uso: node scripts/medir-lluvia.mjs
import fs from 'node:fs';
import * as E from '../supabase/functions/_shared/engine.js';
const DATA = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/temporadas.json', import.meta.url), 'utf8'));
const tracks = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), 'utf8'));
const N = 400;
for (const rain of [false, true]) {
  let dnf = 0, sc = 0, wins = 0, stops = 0, hdnf = 0, tt = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const h = { id: 'a', name: "Tú '23", driver: 'Tú', year: '2023', color: '#ff3b30', d: 90, c: 90, m: 90, j: 90, s: 90 };
    const r = E.runRace({ DATA, tracks, seed: 'm' + i, humans: [h], rain });
    dnf += r.cars.filter((c) => c.dnf).length; if (r.sc) sc++; const me = r.cars.find((c) => c.human);
    stops += r.cars.reduce((t, c) => t + c.stops, 0); if (me.dnf) hdnf++; else if (me.pos === 1) wins++;
    const w = r.cars.filter((c) => !c.dnf).map((c) => c.cum[r.laps]); tt += Math.min(...w) / r.track.lap; n++;
  }
  console.log(rain ? 'LLUVIA' : 'SECO  ', `abandonos/carrera ${(dnf / N).toFixed(1)} · safety car ${(100 * sc / N).toFixed(0)}% · paradas/carrera ${(stops / N).toFixed(1)} · tu auto de 90: gana ${(100 * wins / N).toFixed(0)}%, abandona ${(100 * hdnf / N).toFixed(0)}% · ganador tarda ${(tt / n).toFixed(1)} vueltas-de-seco`);
}
