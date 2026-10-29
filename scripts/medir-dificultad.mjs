// Mide qué tan difícil es el juego: un jugador "codicioso" (siempre elige la pieza de más media que le toca)
// arma 500 autos y corre; se informa la media del auto y cuánto gana. Uso: node scripts/medir-dificultad.mjs
import fs from 'node:fs';
import * as E from '../supabase/functions/_shared/engine.js';
const DATA = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/temporadas.json', import.meta.url), 'utf8'));
const tracks = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), 'utf8'));
const N = 500, REROLLS = 2;
let sum = 0, wins = 0, podium = 0, top10 = 0, dnf = 0; const hist = {};
for (let i = 0; i < N; i++) {
  const rng = E.rngFor('dif', i), picks = {}; let free = [...E.SLOTS], rerolls = REROLLS;
  while (free.length) {
    const years = E.yearsFor(DATA, free); const year = E.rollYear(DATA, rng, years);
    const offer = E.makeOffer(DATA, rng, year);
    let best = null; for (const k of free) for (const it of offer[k].shown) if (!best || it[2] > best.r) best = { k, r: it[2], it, year };
    // con un re-sorteo disponible, repite si lo mejor que salió es menor a 90
    if (rerolls > 0 && (!best || best.r < 90)) { rerolls--; continue; }
    picks[best.k] = { n: best.it[0], y: best.year, r: best.r }; free = free.filter((k) => k !== best.k);
  }
  const avg = E.SLOTS.reduce((s, k) => s + picks[k].r, 0) / 5; sum += avg; hist[Math.floor(avg / 5) * 5] = (hist[Math.floor(avg / 5) * 5] || 0) + 1;
  const race = E.runRace({ DATA, tracks, seed: 'dif' + i, humans: [E.humanFromPicks('me', '#f00', picks)] });
  const h = race.cars.find((c) => c.human);
  if (h.dnf) dnf++; else { if (h.pos === 1) wins++; if (h.pos <= 3) podium++; if (h.pos <= 10) top10++; }
}
console.log(`Media del auto armado: ${(sum / N).toFixed(1)}  (por tramos de 5: ${JSON.stringify(hist)})`);
console.log(`Gana ${(100 * wins / N).toFixed(0)}% · podio ${(100 * podium / N).toFixed(0)}% · top 10 ${(100 * top10 / N).toFixed(0)}% · abandona ${(100 * dnf / N).toFixed(0)}%`);
