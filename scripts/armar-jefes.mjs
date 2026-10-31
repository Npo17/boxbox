// Arma data/jefes.json (fichas de los jefes de equipo) a partir de las temporadas del juego, Jolpica, Wikipedia/Wikidata y Wikimedia Commons.
// 1) Identifica a cada persona (los nombres del juego van abreviados o completos: "R. Dennis", "Ron Dennis").
// 2) Busca su página de Wikipedia y de Wikidata: nacimiento, fallecimiento, país y foto (solo si tiene licencia libre en Commons).
// 3) Estadísticas desde el juego y Jolpica: en cuántas temporadas figura, qué campeonatos de constructores ganó su equipo, puntos y victorias del equipo.
// Formato: { p: { id: [nombre, país, nacido, fallecido, [equipos], y0, y1, temporadas, [títulos], puntos, victorias, foto|0] }, s: { año: { "nombre del juego": id|0 } } }
// Uso: node scripts/armar-jefes.mjs   (necesita promocion/cache-jolpica: node scripts/armar-fichas.mjs y armar-coches.mjs)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const DATA = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/temporadas.json", import.meta.url), "utf8"));
const CACHE = new URL("../promocion/cache-jolpica/", import.meta.url);
const UA = { "User-Agent": "BoxBoxFichas/1.0 (https://boxf1box.com; juego gratuito de fans)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (url, opts = {}) => { for (let i = 0; i < 6; i++) { const r = await fetch(url, { headers: { ...UA, ...opts } }).catch(() => null); if (r && r.ok) return r.json(); await sleep(1500 * (i + 1)); } throw new Error("sin respuesta: " + url); };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const years = Object.keys(DATA).map(Number).sort((a, b) => a - b);

// ---------- 1) personas ----------
const apariciones = [];   // {y, nombre, equipo}
for (const y of years) for (const j of DATA[y].jefe || []) apariciones.push({ y, nombre: j[0], equipo: String(j[1]).split(" · ")[0] });
const esGenerico = (n) => /^Jefe de /i.test(n);
const esAbrev = (n) => /^([A-ZÁÉÍÓÚÑ]\.\s?)+/.test(n);
const partes = (n) => { const t = n.split(/\s+/); const ini = []; while (t.length > 1 && /^[A-ZÁÉÍÓÚÑ]\.$/.test(t[0])) ini.push(t.shift()[0]); return { ini, ape: t.join(" ") }; };
const completos = new Set(apariciones.map((a) => a.nombre).filter((n) => !esGenerico(n) && !esAbrev(n)));
const canon = new Map();   // nombre del juego -> nombre completo canónico
for (const n of new Set(apariciones.map((a) => a.nombre))) {
  if (esGenerico(n)) continue;
  if (!esAbrev(n)) { canon.set(n, n); continue; }
  const { ini, ape } = partes(n);
  const c = [...completos].filter((f) => norm(f.split(" ").slice(1).join(" ")) === norm(ape) && norm(f)[0] === norm(ini[0]));
  canon.set(n, c.length === 1 ? c[0] : n);   // si no hay forma completa, se queda abreviado (se resuelve por Wikipedia con el equipo)
}
// apellidos compuestos u otras variantes: "Nombre Apellido" vs "N. Apellido Segundo"
const personas = new Map();   // nombre canónico -> {aparece: [{y,equipo,nombre}]}
for (const a of apariciones) { if (esGenerico(a.nombre)) continue; const c = canon.get(a.nombre); (personas.get(c) || personas.set(c, { c, ap: [] }).get(c)).ap.push(a); }
console.log("personas distintas:", personas.size, "· apariciones con nombre:", [...personas.values()].reduce((s, p) => s + p.ap.length, 0), "· genéricas:", apariciones.filter((a) => esGenerico(a.nombre)).length);

// ---------- 2) Wikipedia / Wikidata ----------
const EXT = {};   // título de Wikipedia -> extracto
async function wp(params) { return J("https://en.wikipedia.org/w/api.php?format=json&" + params); }
async function resolver(p) {
  const equipo = p.ap[0].equipo, abrev = esAbrev(p.c);
  const intentos = abrev ? [] : [p.c];
  const consultas = [`${p.c} Formula One team principal`, `${p.c} ${equipo} Formula One`];
  let titulo = null;
  const valido = async (t) => {
    const j = await wp("action=query&redirects=1&prop=extracts|pageprops|categories&cllimit=200&exintro=1&explaintext=1&exchars=500&ppprop=wikibase_item&titles=" + encodeURIComponent(t));
    const pg = Object.values(j.query.pages)[0]; if (!pg || pg.missing !== undefined) return null;
    const ex = pg.extract || "";
    const apellido = norm(partes(p.c).ape.split(" ").pop());
    if (!norm(pg.title).includes(apellido)) return null;
    const cats = (pg.categories || []).map((c) => c.title).join(" ");
    if (!/(Formula One|Grand Prix|motorsport|racing|team principal|engineer|constructor|manager|motor racing)/i.test(ex) && !/(Formula One|motorsport|racing|Racing)/.test(cats)) return null;
    return { titulo: pg.title, qid: pg.pageprops && pg.pageprops.wikibase_item };
  };
  for (const t of intentos) { const r = await valido(t); if (r) return r; await sleep(120); }
  for (const q of consultas) {
    const j = await wp("action=query&list=search&srlimit=4&srsearch=" + encodeURIComponent(q));
    for (const s of j.query.search) { const r = await valido(s.title); if (r) return r; await sleep(120); }
  }
  return null;
}
const wiki = {};
let n = 0;
for (const p of personas.values()) { wiki[p.c] = await resolver(p); n++; process.stdout.write(`\rWikipedia ${n}/${personas.size}  `); await sleep(120); }
console.log("\npersonas con página de Wikipedia:", Object.values(wiki).filter(Boolean).length, "de", personas.size);

// Wikidata: nacimiento, fallecimiento, país (código ISO) e imagen
const qids = [...new Set(Object.values(wiki).filter((w) => w && w.qid).map((w) => w.qid))];
const wd = {};
for (let i = 0; i < qids.length; i += 60) {
  const lote = qids.slice(i, i + 60);
  const q = `SELECT ?item ?nac ?mur ?iso ?img WHERE { VALUES ?item { ${lote.map((x) => "wd:" + x).join(" ")} } OPTIONAL{?item wdt:P569 ?nac} OPTIONAL{?item wdt:P570 ?mur} OPTIONAL{?item wdt:P27 ?pais. ?pais wdt:P297 ?iso} OPTIONAL{?item wdt:P18 ?img} }`;
  const j = await J("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { Accept: "application/sparql-results+json" });
  for (const b of j.results.bindings) {
    const id = b.item.value.split("/").pop(), e = wd[id] || (wd[id] = {});
    if (b.nac && !e.nac) e.nac = +b.nac.value.slice(0, 4) || null; if (b.mur && !e.mur) e.mur = +b.mur.value.slice(0, 4) || null;
    if (b.iso && !e.iso) e.iso = b.iso.value; if (b.img && !e.img) e.img = decodeURIComponent(b.img.value.split("/").pop());
  }
  await sleep(300);
}

// Commons: licencia, autor y miniatura (solo libres)
const strip = (h) => String(h || "").replace(/^https?:\/\/(?:www\.)?flickr\.com\/photos\/([^\/\s]+).*$/i, "$1 (Flickr)").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
const LIBRE = /^(CC0|CC BY|CC BY-SA|Public domain|PD)/i, foto = {};
const porImg = new Map(Object.entries(wd).filter(([, e]) => e.img).map(([q, e]) => ["File:" + e.img.replace(/_/g, " "), q]));
const files = [...porImg.keys()];
for (let i = 0; i < files.length; i += 40) {
  const lote = files.slice(i, i + 40);
  const j = await J("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&titles=" + encodeURIComponent(lote.join("|")));
  const q = j.query, mapa = new Map(); for (const nn of q.normalized || []) mapa.set(nn.to, nn.from);
  for (const pg of Object.values(q.pages)) {
    const qid = porImg.get(mapa.get(pg.title) || pg.title); if (!qid) continue;
    const ii = pg.imageinfo && pg.imageinfo[0]; if (!ii) continue;
    const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
    if (!LIBRE.test(lic) || strip(m.NonFree && m.NonFree.value) === "true") continue;
    let autor = strip(m.Artist && m.Artist.value).replace(/^Original:\s*/i, "").replace(/^File:[^:]*:\s*/i, "");
    if (autor.length > 60) autor = autor.slice(0, 57).replace(/\s+\S*$/, "") + "…";
    foto[qid] = [ii.thumburl.split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"), autor || "Autor desconocido", lic, ii.descriptionurl];
  }
  await sleep(250);
}

// ---------- 3) estadísticas del equipo en cada temporada en que figura ----------
const tempo = {};   // año -> {constructores: [{id,name,k}], st: Map id -> {pos, pts, wins}}
for (const y of years) {
  const C = new Map(), wins = new Map();
  for (const f of readdirSync(CACHE).filter((x) => x.startsWith(`res-${y}-`))) {
    const j = JSON.parse(readFileSync(new URL(f, CACHE), "utf8"));
    for (const r of j.MRData.RaceTable.Races) for (const x of r.Results) { C.set(x.Constructor.constructorId, x.Constructor.name); if (x.position === "1") wins.set(x.Constructor.constructorId, (wins.get(x.Constructor.constructorId) || 0) + 1); }
  }
  const stf = new URL(`cst-${y}.json`, CACHE); const st = new Map();
  if (existsSync(stf)) { const l = JSON.parse(readFileSync(stf, "utf8")).MRData.StandingsTable.StandingsLists[0]; for (const s of l ? l.ConstructorStandings : []) st.set(s.Constructor.constructorId, { pos: +s.position, pts: +s.points, wins: +s.wins }); }
  tempo[y] = { cons: [...C.entries()].map(([id, name]) => ({ id, name, k: norm(name) })), st, wins };
}
const ALIAS = [["haas", "haasf1"], ["alpine", "alpinef1"], ["racingbulls", "rbf1"], ["rb", "rbf1"], ["bmwsauber", "bmwsauber"], ["lotus", "teamlotus"], ["tororosso", "tororosso"], ["alphatauri", "alphatauri"]];
function constructorDe(y, equipo) {
  const k = norm(equipo), t = tempo[y]; if (!t) return null;
  let m = t.cons.filter((c) => k.startsWith(c.k) || c.k.startsWith(k)).sort((a, b) => b.k.length - a.k.length)[0];
  if (!m) for (const [pref, dest] of ALIAS) if (k.startsWith(pref)) { m = t.cons.find((c) => c.k.startsWith(dest)); if (m) break; }
  return m || null;
}
const out = { v: 1, p: {}, s: {} }; let sinEquipo = 0; let id = 0;
for (const p of personas.values()) {
  const w = wiki[p.c], e = w && w.qid ? wd[w.qid] || {} : {};
  const ys = new Set(), equipos = [], titulos = []; let pts = 0, vic = 0;
  for (const a of p.ap) {
    if (ys.has(a.y)) continue; ys.add(a.y);
    const c = constructorDe(a.y, a.equipo); if (!c) { sinEquipo++; if (!equipos.includes(a.equipo)) equipos.push(a.equipo); continue; }
    const s = tempo[a.y].st.get(c.id);
    if (!equipos.includes(c.name)) equipos.push(c.name);
    if (s) { pts += s.pts; vic += s.wins; if (s.pos === 1 && a.y < 2026) titulos.push(a.y); } else vic += tempo[a.y].wins.get(c.id) || 0;
  }
  const yy = [...ys].sort((a, b) => a - b), pid = "j" + ++id;
  const f = w && w.qid && foto[w.qid] ? foto[w.qid] : 0;
  out.p[pid] = [(w ? w.titulo : p.c).replace(/\s*\([^)]*\)\s*$/, ""), e.iso || "", e.nac || 0, e.mur || 0, equipos, yy[0], yy[yy.length - 1], yy.length, titulos, Math.round(pts), vic, f];
  for (const a of p.ap) (out.s[a.y] || (out.s[a.y] = {}))[a.nombre] = pid;
}
writeFileSync(new URL("../data/jefes.json", import.meta.url), JSON.stringify(out));
const tot = Object.keys(out.p).length, conWiki = Object.values(out.p).filter((x) => x[2]).length, conFoto = Object.values(out.p).filter((x) => x[11]).length;
console.log(`jefes: ${tot} · con nacimiento: ${conWiki} · con foto libre: ${conFoto} · apariciones sin equipo cruzado: ${sinEquipo}`);
const sin = [...personas.values()].filter((p) => !wiki[p.c]).map((p) => p.c);
console.log("sin página de Wikipedia (muestra):", sin.slice(0, 25).join(" | "), "· total:", sin.length);
