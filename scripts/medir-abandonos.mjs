// Distribución de abandonos por carrera (seco y lluvia). Uso: node scripts/medir-abandonos.mjs
import fs from 'node:fs';
import * as E from '../supabase/functions/_shared/engine.js';
const DATA = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/temporadas.json', import.meta.url), 'utf8'));
const tracks = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), 'utf8'));
const N = 3000, h = { id: 'me', name: 'T', driver: 'T', year: '2023', color: '#f00', d: 90, c: 90, m: 90, j: 90, s: 90 };
for (const [name, opts] of [['seco', { rain: false }], ['lluvia', { rain: true }], ['mezcla real', {}]]) {
  const hist = {}; let tot = 0, ge5 = 0, motor = 0, choque = 0;
  for (let i = 0; i < N; i++) { const r = E.runRace({ DATA, tracks, seed: 'ab' + i, humans: [h], ...opts }); const n = r.cars.filter((c) => c.dnf).length; hist[Math.min(n, 8)] = (hist[Math.min(n, 8)] || 0) + 1; tot += n; if (n >= 5) ge5++;
    for (const e of r.events) { if (e.k === 'engine') motor++; if (e.k === 'crash') choque++ } }
  console.log(name.padEnd(12), 'media', (tot / N).toFixed(2), '| 0:', ((hist[0] || 0) / N * 100).toFixed(0) + '%', '1-2:', (((hist[1] || 0) + (hist[2] || 0)) / N * 100).toFixed(0) + '%', '3-4:', (((hist[3] || 0) + (hist[4] || 0)) / N * 100).toFixed(0) + '%', '5+:', (ge5 / N * 100).toFixed(1) + '%', '| motores/carrera', (motor / N).toFixed(2), 'choques/carrera', (choque / N).toFixed(2));
}
