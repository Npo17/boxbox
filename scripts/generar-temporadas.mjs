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
// Motores y jefes de equipo reales por temporada (scripts/generar-nombres.mjs); opcional.
const NOMBRES = fs.existsSync(path.join(ROOT, 'nombres-statsf1.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'nombres-statsf1.json'), 'utf8')) : null;
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' ').replace(/ f1 team| racing| team|scuderia/g, '').replace(/\s+/g, ' ').trim();
const same = (a, b) => { const x = norm(a), z = norm(b); return x === z || x.split(' ')[0] === z.split(' ')[0]; };

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
const MANUAL = {};   // medias fijadas a mano para pilotos sin puntos: 'driverId:año' -> media
const NAMES = new Map();  // driverId -> nombre a mostrar (se completa en una primera pasada)
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
  // La tabla del campeonato solo trae a los que sumaron puntos: se agregan los que corrieron sin puntuar (con su escudería).
  const inTable = new Set(dRows.map((r) => r.Driver.driverId));
  const extra = new Map();
  for (let off = 0; ; off += 100) {
    const res = await get(`${y}/results.json?limit=100&offset=${off}`);
    const races = res.MRData.RaceTable.Races;
    for (const race of races) for (const r of race.Results) {
      if (inTable.has(r.Driver.driverId)) continue;
      const e = extra.get(r.Driver.driverId) ?? { Driver: r.Driver, Constructors: [], position: '', points: '0' };
      if (!e.Constructors.some((c) => c.constructorId === r.Constructor.constructorId)) e.Constructors.push(r.Constructor);
      extra.set(r.Driver.driverId, e);
    }
    if (off + 100 >= +res.MRData.total) break;
  }
  const sinPuntos = [...extra.values()].map((r) => [nameOf(r.Driver), r.Constructors.map((c) => c.name).join(' / '), MANUAL[`${r.Driver.driverId}:${y}`] ?? 60]);
  if (y === 1952) sinPuntos.push(['J. M. Fangio', 'Maserati', 90]);   // la fuente no lo registra en 1952 (corrió Monza, abandonó)
  const season = { piloto: [...rateDrivers(dRows), ...sinPuntos], coche: rateCars(y, cRows, dRows), motor: [], jefe: [], estratega: [] };

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
  if (cur) season.curada = true;     // temporada ajustada a mano: la usa el desafío del día
  else {
    // Sin datos públicos de motores, jefes de equipo ni estrategas: se estiman a partir del resultado de cada
    // escudería (su coche) con una variación fija por pieza. Así todas las temporadas tienen las 5 casillas.
    const wob = (s) => { let x = 7; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) % 9973; return (x % 9) - 4; };   // -4..+4, siempre igual
    for (const [team, , r] of season.coche) {
      // Nombres reales (StatsF1, ver generar-nombres.mjs): motor y jefe de equipo. Si no hay dato, queda el genérico.
      const row = (NOMBRES?.seasons[y] ?? []).find((x) => same(x.team, team));
      const boss = row && (NOMBRES.principals[row.slug] ?? []).filter((p) => p.from <= y && y <= p.to).pop();
      const usedBoss = season.jefe.some((j) => j[0] === boss?.name);
      season.motor.push([row?.engine ? `Motor ${row.engine}` : `Motor ${team}`, `${team} · media estimada`, clamp(r + wob(y + 'm' + team), 55, 96)]);
      season.jefe.push([boss && !usedBoss ? boss.name : `Jefe de ${team}`, `${team} · media estimada`, clamp(r + wob(y + 'j' + team), 55, 96)]);
      season.estratega.push([`Estratega de ${team}`, 'media estimada', clamp(r + wob(y + 'e' + team), 55, 96)]);
    }
  }
  for (const k of ['piloto', 'coche', 'motor', 'jefe', 'estratega']) season[k].sort((a, b) => b[2] - a[2]);
  out[y] = season;
  console.log(`${y}: ${season.piloto.length} pilotos, ${season.coche.length} coches${cur ? ' (curada)' : ''}`);
}

fs.writeFileSync(OUT, JSON.stringify(out).replace(/\],"/g, '],\n"'));
const total = Object.values(out).reduce((a, s) => a + s.piloto.length, 0);
console.log(`Listo: ${Object.keys(out).length} temporadas, ${total} pilotos-temporada → ${OUT}`);
