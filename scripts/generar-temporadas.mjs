// Genera supabase/functions/_shared/temporadas.json con TODOS los pilotos y escuderías
// de 1950 a 2026 (datos de Jolpica-F1, sucesor de Ergast) y les calcula una media.
//
// - Pilotos: posición en el campeonato, porcentaje de puntos del líder y comparación con
//   su compañero de equipo. El campeón tiene al menos 95.
// - Coches: posición y puntos en el campeonato de constructores (desde 1958); antes de
//   1958 se usa el mejor piloto de cada escudería.
// - Motores, jefes de equipo y estrategas: no hay datos públicos; salen solo de
//   scripts/temporadas-curadas.json.
// - En las temporadas curadas, las medias curadas pisan a las calculadas.
//
// Uso: node scripts/generar-temporadas.mjs   (cachea las respuestas en scripts/.cache)
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.jolpi.ca/ergast/f1';
const FIRST = 1950, LAST = 2026;
const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, '..', 'supabase', 'functions', '_shared', 'temporadas.json');
const CURATED = JSON.parse(fs.readFileSync(path.join(ROOT, 'temporadas-curadas.json'), 'utf8'));
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(p) {
  const file = path.join(CACHE, p.replace(/[\/?=&]/g, '_') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let t = 0; t < 5; t++) {
    const r = await fetch(`${API}/${p}`);
    if (r.status === 429) { console.log('  límite de la API, espero 60s…'); await sleep(60000); continue; }
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    const j = await r.json();
    fs.writeFileSync(file, JSON.stringify(j));
    await sleep(900);
    return j;
  }
  throw new Error(`${p}: demasiados reintentos`);
}

const initials = (given) => given.split(/[\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + '.').join(' ');
// Nombres que la fuente abrevia distinto a como se los conoce
const KNOWN = { fangio: 'J. M. Fangio' };
// Pilotos distintos con el mismo nombre abreviado (Michael/Mick Schumacher, Nelson Piquet padre/hijo):
// el que corrió más temporadas conserva la abreviatura y los demás usan el nombre completo.
const NAMES = new Map();   // driverId -> nombre a mostrar (se completa en una primera pasada)
const nameOf = (d) => NAMES.get(d.driverId) ?? KNOWN[d.driverId] ?? `${initials(d.givenName)} ${d.familyName}`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function rateDrivers(rows) {
  const N = rows.length, maxP = Math.max(1, ...rows.map((r) => +r.points));
  const byTeam = {};
  rows.forEach((r) => (r.Constructors || []).forEach((c) => (byTeam[c.constructorId] ??= []).push(r)));
  return rows.map((r) => {
    const pos = +r.position || N, pts = +r.points;
    const rank = N > 1 ? 1 - (pos - 1) / (N - 1) : 1;
    const share = Math.sqrt(pts / maxP);
    const mates = (r.Constructors || []).flatMap((c) => byTeam[c.constructorId]).filter((m) => m !== r);
    const mateP = Math.max(0, ...mates.map((m) => +m.points));
    const vsMate = pts + mateP > 0 ? pts / (pts + mateP) : 0.5;
    let rating = Math.round(60 + 37 * (0.5 * rank + 0.3 * share + 0.2 * vsMate));
    if (pos === 1) rating = Math.max(rating, 95);
    return [nameOf(r.Driver), (r.Constructors || []).map((c) => c.name).join(' / '), clamp(rating, 55, 99)];
  });
}

function rateCars(year, cRows, dRows) {
  if (cRows.length) {
    const N = cRows.length, maxP = Math.max(1, ...cRows.map((r) => +r.points));
    return cRows.map((r) => {
      const pos = +r.position || N;
      const score = 0.6 * (N > 1 ? 1 - (pos - 1) / (N - 1) : 1) + 0.4 * Math.sqrt(+r.points / maxP);
      return [r.Constructor.name, `auto de ${year}`, clamp(Math.round(60 + 37 * score), 55, 98)];
    });
  }
  // Antes de 1958 no hay campeonato de constructores: se usa el mejor piloto de cada escudería.
  const best = {};
  for (const r of dRows) for (const c of r.Constructors || []) {
    if (!best[c.name] || +r.points > best[c.name]) best[c.name] = +r.points;
  }
  const maxP = Math.max(1, ...Object.values(best));
  const list = Object.entries(best).sort((a, b) => b[1] - a[1]);
  return list.map(([n, p], i) => [n, `auto de ${year}`,
    clamp(Math.round(60 + 37 * (0.6 * (list.length > 1 ? 1 - i / (list.length - 1) : 1) + 0.4 * Math.sqrt(p / maxP))), 55, 98)]);
}

// Primera pasada: detectar nombres repetidos entre pilotos distintos.
{
  const seen = new Map();   // nombre abreviado -> [{id, given, family, first}]
  for (let y = FIRST; y <= LAST; y++) {
    const d = await get(`${y}/driverStandings.json?limit=100`);
    for (const r of d.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? []) {
      const D = r.Driver, short = KNOWN[D.driverId] ?? `${initials(D.givenName)} ${D.familyName}`;
      const list = seen.get(short) ?? [];
      const ex = list.find((x) => x.id === D.driverId);
      if (ex) ex.seasons++; else list.push({ id: D.driverId, given: D.givenName, family: D.familyName, first: y, seasons: 1 });
      seen.set(short, list);
    }
  }
  for (const [short, list] of seen) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.seasons - a.seasons || a.first - b.first);   // el de más temporadas conserva la abreviatura
    list.slice(1).forEach((x) => {
      const full = `${x.given} ${x.family}`;
      NAMES.set(x.id, list.some((o) => o !== x && o.given === x.given) || /_jr$/.test(x.id) ? `${full} Jr.` : full);
    });
    console.log(`Nombre repetido "${short}": ${list.map((x) => NAMES.get(x.id) ?? short).join(' / ')}`);
  }
}

const out = {};
for (let y = FIRST; y <= LAST; y++) {
  const d = await get(`${y}/driverStandings.json?limit=100`);
  const c = y >= 1958 ? await get(`${y}/constructorStandings.json?limit=100`) : null;
  const dRows = d.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
  const cRows = c?.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [];
  const season = { piloto: rateDrivers(dRows), coche: rateCars(y, cRows, dRows), motor: [], jefe: [], estratega: [] };

  const cur = CURATED[y];
  if (cur) {
    // Pilotos: la media curada pisa a la calculada; los curados que falten se agregan.
    const fam = (n) => n.split(' ').pop().toLowerCase();
    for (const cp of cur.piloto) {
      const hit = season.piloto.find((p) => p[0] === cp[0]) || season.piloto.find((p) => fam(p[0]) === fam(cp[0]));
      if (hit) { hit[0] = cp[0]; hit[1] = cp[1]; hit[2] = cp[2]; } else season.piloto.push(cp);
    }
    // Coches: el curado (con modelo exacto: MP4/4, F2004…) reemplaza a su escudería; el resto queda.
    const w1 = (n) => n.split(/\s+/)[0].toLowerCase();
    const used = new Set();
    season.coche = season.coche.map((c) => {
      const cc = cur.coche.find((x) => !used.has(x) && w1(x[0]) === w1(c[0]));
      if (cc) { used.add(cc); return cc; }
      return c;
    });
    for (const cc of cur.coche) if (!used.has(cc)) season.coche.push(cc);
    season.motor = cur.motor; season.jefe = cur.jefe; season.estratega = cur.estratega;
  }
  for (const k of Object.keys(season)) season[k].sort((a, b) => b[2] - a[2]);
  out[y] = season;
  console.log(`${y}: ${season.piloto.length} pilotos, ${season.coche.length} coches${cur ? ' (curada)' : ''}`);
}

fs.writeFileSync(OUT, JSON.stringify(out).replace(/\],"/g, '],\n"'));
const total = Object.values(out).reduce((a, s) => a + s.piloto.length, 0);
console.log(`Listo: ${Object.keys(out).length} temporadas, ${total} pilotos-temporada → ${OUT}`);
