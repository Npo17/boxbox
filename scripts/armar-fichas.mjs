// Arma data/pilotos.json (las fichas de los pilotos) a partir de Jolpica (https://api.jolpi.ca, continuación abierta de Ergast).
// Baja los resultados de cada temporada (se guardan en promocion/cache-jolpica para poder retomar) y los cruza con los pilotos del juego.
// Uso: node scripts/armar-fichas.mjs        (tarda unos minutos por el límite de pedidos de la API)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const DATA = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/temporadas.json", import.meta.url), "utf8"));
const CACHE = new URL("../promocion/cache-jolpica/", import.meta.url);
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, clave) {
  const f = new URL(clave + ".json", CACHE);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  for (let i = 0; i < 8; i++) {
    const r = await fetch("https://api.jolpi.ca/ergast/f1/" + path).catch(() => null);
    if (r && r.ok) { const j = await r.json(); writeFileSync(f, JSON.stringify(j)); await sleep(350); return j; }
    await sleep(2000 * (i + 1));
  }
  throw new Error("sin respuesta: " + path);
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
// nacionalidad (como la devuelve la API) -> código de país (el navegador lo traduce a cada idioma)
const NAT = { American: "US", Argentine: "AR", "Argentinian": "AR", Australian: "AU", Austrian: "AT", Belgian: "BE", Brazilian: "BR", British: "GB", Canadian: "CA", Chilean: "CL", Chinese: "CN", Colombian: "CO", Czech: "CZ", Danish: "DK", Dutch: "NL", Finnish: "FI", French: "FR", German: "DE", Hungarian: "HU", Indian: "IN", Indonesian: "ID", Irish: "IE", Italian: "IT", Japanese: "JP", Liechtensteiner: "LI", Malaysian: "MY", Mexican: "MX", Monegasque: "MC", "New Zealander": "NZ", Polish: "PL", Portuguese: "PT", Rhodesian: "ZW", Russian: "RU", "South African": "ZA", Spanish: "ES", Swedish: "SE", Swiss: "CH", Thai: "TH", Uruguayan: "UY", Venezuelan: "VE", "East German": "DE", Corean: "KR", Korean: "KR", Egyptian: "EG", Moroccan: "MA", Cuban: "CU", Peruvian: "PE", Bolivian: "BO", Estonian: "EE", Lithuanian: "LT", Romanian: "RO", Slovenian: "SI", Turkish: "TR", Luxembourger: "LU", Latvian: "LV", Ukrainian: "UA", Israeli: "IL", "Hong Konger": "HK", Singaporean: "SG", Emirati: "AE", Saudi: "SA", Qatari: "QA", Bahraini: "BH", Kuwaiti: "KW", Greek: "GR", Albanian: "AL", Croatian: "HR", Serbian: "RS", Bulgarian: "BG", Slovak: "SK", Norwegian: "NO", Icelandic: "IS", Philippine: "PH", Vietnamese: "VN", Taiwanese: "TW", Pakistani: "PK", Costa: "CR" };

const years = Object.keys(DATA).map(Number).sort((a, b) => a - b);
const season = {};     // año -> {drivers: Map id -> {...}}, standings: Map id -> {pos, pts, wins}
const drivers = {};    // id -> ficha
let pedidos = 0;
for (const y of years) {
  // resultados de la temporada (de a 100)
  let off = 0, total = 1, rows = [];
  while (off < total) {
    const j = await api(`${y}/results.json?limit=100&offset=${off}`, `res-${y}-${off}`); pedidos++;
    total = +j.MRData.total; const races = j.MRData.RaceTable.Races;
    for (const r of races) for (const x of r.Results) rows.push({ round: r.round, ...x });
    off += 100;
  }
  const st = await api(`${y}/driverStandings.json?limit=100`, `st-${y}`);
  const lista = st.MRData.StandingsTable.StandingsLists[0];
  const standings = new Map((lista ? lista.DriverStandings : []).map((d) => [d.Driver.driverId, { pos: +d.position, pts: +d.points, wins: +d.wins }]));
  const S = new Map();
  for (const x of rows) {
    const d = x.Driver, id = d.driverId;
    if (!drivers[id]) drivers[id] = { id, n: `${d.givenName} ${d.familyName}`, g: d.givenName, f: d.familyName, nat: NAT[d.nationality] || null, b: +String(d.dateOfBirth || "0").slice(0, 4) || null, r: 0, w: 0, p: 0, pl: 0, t: [], y0: y, y1: y };
    const D = drivers[id]; D.r++; D.y1 = Math.max(D.y1, y); D.y0 = Math.min(D.y0, y);
    if (x.position === "1") D.w++; if (+x.position >= 1 && +x.position <= 3) D.p++; if (x.grid === "1") D.pl++;
    const e = S.get(id) || { r: 0, w: 0, pts: 0 }; e.r++; if (x.position === "1") e.w++; e.pts += +x.points || 0; S.set(id, e);
  }
  for (const [id, s] of standings) if (s.pos === 1 && y < 2026 && drivers[id]) drivers[id].t.push(y);
  season[y] = { S, standings };
  process.stdout.write(`\r${y} ok (${pedidos} pedidos)  `);
}
console.log();

// cruce con los nombres del juego: "A. Senna", "J. M. Fangio" o el nombre completo cuando hay homónimos
const out = { v: 1, p: {}, s: {} };
let ok = 0, falta = 0; const faltan = [];
for (const y of years) {
  out.s[y] = {};
  const cand = [...season[y].S.keys()].map((id) => drivers[id]);
  for (const row of DATA[y].piloto) {
    const nombre = row[0], partes = nombre.split(" "), ini = [];
    while (partes.length > 1 && /^[A-ZÁÉÍÓÚÑ]\.$/.test(partes[0])) ini.push(partes.shift()[0]);
    const ape = norm(partes.join(" "));
    let m = ini.length
      ? cand.filter((d) => norm(d.f) === ape && norm(d.g)[0] === norm(ini[0]) && (!ini[1] || (d.g.split(/[\s-]+/)[1] || "").normalize("NFD")[0]?.toLowerCase() === ini[1].toLowerCase() || true))
      : cand.filter((d) => norm(d.n) === norm(nombre));
    if (m.length > 1 && ini[1]) { const m2 = m.filter((d) => (d.g.split(/[\s-]+/)[1] || "")[0]?.toLowerCase() === ini[1].toLowerCase()); if (m2.length) m = m2; }
    if (!m.length && ini.length) m = cand.filter((d) => norm(d.f).endsWith(ape) || ape.endsWith(norm(d.f)));   // apellidos compuestos ("de Angelis")
    if (m.length !== 1) { falta++; faltan.push(`${y} ${nombre}${m.length ? " (ambiguo)" : ""}`); continue; }
    const d = m[0], e = season[y].S.get(d.id), s = season[y].standings.get(d.id);
    out.s[y][nombre] = [d.id, s ? s.pos : 0, s ? s.pts : Math.round(e.pts * 10) / 10, s ? s.wins : e.w, e.r];
    ok++;
  }
}
const usados = new Set(Object.values(out.s).flatMap((o) => Object.values(o).map((v) => v[0])));
for (const id of usados) { const d = drivers[id]; out.p[id] = [d.n, d.nat, d.b, d.t, d.w, d.p, d.pl, d.r, d.y0, d.y1]; }
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../data/pilotos.json", import.meta.url), JSON.stringify(out));
console.log(`cruzados: ${ok} · sin cruzar: ${falta} · pilotos en el archivo: ${usados.size}`);
if (faltan.length) console.log("sin cruzar (muestra):", faltan.slice(0, 40).join(" | "));
