// Arma data/coches.json (fichas de los coches) a partir de Jolpica.
// Para cada coche del juego (nombre + año) busca su constructor en esa temporada y guarda: puesto, puntos y victorias del campeonato de
// constructores y los pilotos que lo usaron. // Uso: node scripts/armar-coches.mjs   (necesita haber corrido armar-fichas.mjs: reutiliza promocion/cache-jolpica)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
const DATA = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/temporadas.json", import.meta.url), "utf8"));
const CACHE = new URL("../promocion/cache-jolpica/", import.meta.url);
const UA = { "User-Agent": "BoxBoxFichas/1.0 (https://boxf1box.com; juego gratuito de fans)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function jolpi(path, clave) {
  const f = new URL(clave + ".json", CACHE);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  for (let i = 0; i < 8; i++) {
    const r = await fetch("https://api.jolpi.ca/ergast/f1/" + path).catch(() => null);
    if (r && r.ok) { const j = await r.json(); writeFileSync(f, JSON.stringify(j)); await sleep(350); return j; }
    await sleep(2000 * (i + 1));
  }
  throw new Error("sin respuesta: " + path);
}
const J = async (url) => { for (let i = 0; i < 6; i++) { const r = await fetch(url, { headers: UA }).catch(() => null); if (r && r.ok) return r.json(); await sleep(1500 * (i + 1)); } throw new Error("sin respuesta: " + url); };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const years = Object.keys(DATA).map(Number).sort((a, b) => a - b);

// 1) por temporada: constructores que corrieron, sus pilotos y el campeonato de constructores
const temp = {};   // año -> {C: Map id -> {name, drivers: Map did -> {n, pts, r}, wins}, st: Map id -> {pos, pts, wins}}
for (const y of years) {
  const C = new Map();
  for (const f of readdirSync(CACHE).filter((x) => x.startsWith(`res-${y}-`))) {
    const j = JSON.parse(readFileSync(new URL(f, CACHE), "utf8"));
    for (const r of j.MRData.RaceTable.Races) for (const x of r.Results) {
      const c = x.Constructor, d = x.Driver;
      const e = C.get(c.constructorId) || { name: c.name, drivers: new Map(), wins: 0 }; C.set(c.constructorId, e);
      if (x.position === "1") e.wins++;
      const dd = e.drivers.get(d.driverId) || { n: `${d.givenName[0]}. ${d.familyName}`, pts: 0, r: 0 }; e.drivers.set(d.driverId, dd);
      dd.pts += +x.points || 0; dd.r++;
    }
  }
  let st = new Map();
  if (y >= 1958) {   // antes no había campeonato de constructores
    const j = await jolpi(`${y}/constructorStandings.json?limit=100`, `cst-${y}`);
    const l = j.MRData.StandingsTable.StandingsLists[0];
    st = new Map((l ? l.ConstructorStandings : []).map((s) => [s.Constructor.constructorId, { pos: +s.position, pts: +s.points, wins: +s.wins }]));
  }
  temp[y] = { C, st };
  process.stdout.write(`\r${y}  `);
}
console.log();

// 2) cruce con los coches del juego: el equipo es el comienzo del nombre ("Ferrari F2004", "Team Lotus", "BAR 006")
const ALIAS = [["haas", "haasf1"], ["alpine", "alpinef1"], ["racingbulls", "rbf1"], ["rb", "rbf1"]];
const out = { v: 1, c: {}, s: {} };
let ok = 0; const faltan = [];
for (const y of years) {
  out.s[y] = {};
  const { C, st } = temp[y], cand = [...C.entries()].map(([id, e]) => ({ id, ...e, k: norm(e.name) }));
  for (const row of DATA[y].coche) {
    const nombre = row[0], k = norm(nombre);
    let m = cand.filter((c) => k.startsWith(c.k)).sort((a, b) => b.k.length - a.k.length)[0]
      || cand.filter((c) => c.k.length >= 4 && k.includes(c.k)).sort((a, b) => b.k.length - a.k.length)[0];
    if (!m) for (const [pref, dest] of ALIAS) if (k.startsWith(pref)) { m = cand.find((c) => c.k.startsWith(dest)); if (m) break; }   // nombres de equipo que la API escribe distinto
    if (!m) { faltan.push(`${y} ${nombre}`); continue; }
    const s = st.get(m.id);
    const pil = [...m.drivers.values()].sort((a, b) => b.pts - a.pts || b.r - a.r);
    out.c[m.id] = m.name;
    out.s[y][nombre] = [m.id, s ? s.pos : 0, s ? s.pts : 0, s ? s.wins : m.wins, pil.slice(0, 4).map((d) => [d.n, Math.round(d.pts * 10) / 10]), pil.length];
    ok++;
  }
}
writeFileSync(new URL("../data/coches.json", import.meta.url), JSON.stringify(out));
console.log(`coches cruzados: ${ok} · sin cruzar: ${faltan.length}${faltan.length ? " → " + faltan.slice(0, 25).join(" | ") : ""}`);

// Las fotos de los coches las arma scripts/armar-fotos-coches.mjs (modelo real de cada equipo y temporada).
