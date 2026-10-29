// Extrae de tracks.js los datos de cada circuito SIN el dibujo (para el servidor).
// El orden de la lista debe ser el mismo que en tracks.js: el motor elige el circuito por posición.
// Uso: node scripts/generar-circuitos.mjs
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../tracks.js', import.meta.url), 'utf8');
const TRACKS = new Function(src + '; return TRACKS;')();
const out = TRACKS.map(({ round, gp, circuit, city, km, lap, corners }) => ({ round, gp, circuit, city, km, lap, corners }));
fs.writeFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), JSON.stringify(out));
console.log(out.length + ' circuitos');
