// Arma data/fotos-coches.json: la foto del modelo real de cada coche del juego (equipo + temporada), si tiene licencia libre en Wikimedia Commons.
// El modelo sale de las categorías de Wikipedia "<año> Formula One season cars" (p. ej. 2001 → "Sauber C20"); la foto, de la imagen principal de su página.
// Formato: { p: [[miniatura, autor, licencia, página en Commons, modelo], ...], k: { "año|nombre del coche": índice en p } }
// Uso: node scripts/armar-fotos-coches.mjs (necesita data/coches.json: node scripts/armar-coches.mjs)
import { readFileSync, writeFileSync } from "node:fs";
const DATA = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/temporadas.json", import.meta.url), "utf8"));
const COCHES = JSON.parse(readFileSync(new URL("../data/coches.json", import.meta.url), "utf8"));
const UA = { "User-Agent": "BoxBoxFichas/1.0 (https://boxf1box.com; juego gratuito de fans)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (url) => { for (let i = 0; i < 6; i++) { const r = await fetch(url, { headers: UA }).catch(() => null); if (r && r.ok) return r.json(); await sleep(1500 * (i + 1)); } throw new Error("sin respuesta: " + url); };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const years = Object.keys(DATA).map(Number).sort((a, b) => a - b);

// 1) modelos de cada temporada (categoría de Wikipedia)
const modelos = {};
for (const y of years) {
  const j = await J("https://en.wikipedia.org/w/api.php?action=query&format=json&list=categorymembers&cmlimit=200&cmtype=page&cmtitle=" + encodeURIComponent(`Category:${y} Formula One season cars`));
  modelos[y] = (j.query.categorymembers || []).map((x) => x.title);
  process.stdout.write(`\rcategorías ${y}  `);
  await sleep(150);
}
console.log();

// 2) candidatos de cada coche del juego: páginas cuyo título empieza con el equipo (nombre del constructor o primera palabra)
const candidatos = {};   // "año|nombre" -> [títulos] (propios de la temporada primero; luego los de la anterior y la siguiente)
const todos = new Set();
const buscar = (y, nombre) => {
  const hit = COCHES.s[y] && COCHES.s[y][nombre], cname = hit ? COCHES.c[hit[0]] : "";
  const claves = new Set([norm(cname), norm(cname.replace(/^Team /i, "")), norm(cname.split(/[ -]/)[0]), norm(nombre.split(/[ -]/)[0])].filter((k) => k.length >= 3));
  const c = (modelos[y] || []).filter((t) => [...claves].some((k) => norm(t).startsWith(k)));
  // el nombre del juego ya es un modelo ("McLaren MP4/4"): ese primero; si no, el más nuevo (título más largo y de numeración mayor: FW14B antes que FW14)
  const exacto = (x) => norm(x) === norm(nombre) ? 1 : 0;
  const num = (x) => Math.max(0, ...(x.replace(/d{4}/g, "").match(/d+/g) || []).map(Number));   // el modelo de numeración más alta es el más nuevo (Lotus 25 antes que Lotus 18/21)
  return c.sort((a, b) => exacto(b) - exacto(a) || num(b) - num(a) || norm(b).length - norm(a).length || b.localeCompare(a));
};
for (const y of years) for (const row of DATA[y].coche) {
  const nombre = row[0];
  let c = buscar(y, nombre);
  if (!c.length) c = [...buscar(y - 1, nombre), ...buscar(y + 1, nombre)].map((x) => x);   // modelo de la temporada vecina (un mismo coche suele correr dos años)
  candidatos[`${y}|${nombre}`] = c; for (const t of c) todos.add(t);
}
console.log("coches con al menos un modelo candidato:", Object.values(candidatos).filter((c) => c.length).length, "de", Object.keys(candidatos).length, "· páginas distintas:", todos.size);

// 3) imagen principal de cada página
const archivo = {}, ts = [...todos];
for (let i = 0; i < ts.length; i += 40) {
  const lote = ts.slice(i, i + 40);
  const j = await J("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=" + encodeURIComponent(lote.join("|")));
  const q = j.query, mapa = new Map(); for (const n of q.normalized || []) mapa.set(n.to, n.from); for (const r of q.redirects || []) mapa.set(r.to, mapa.get(r.from) || r.from);
  for (const p of Object.values(q.pages)) if (p.pageimage) archivo[mapa.get(p.title) || p.title] = p.pageimage;
  process.stdout.write(`\rpáginas ${Math.min(i + 40, ts.length)}/${ts.length}  `);
  await sleep(250);
}
console.log("\npáginas con imagen principal:", Object.keys(archivo).length);

// 4) licencia, autor y miniatura en Commons (solo libres)
const strip = (h) => String(h || "").replace(/^https?:\/\/(?:www\.)?flickr\.com\/photos\/([^\/\s]+).*$/i, "$1 (Flickr)").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
const LIBRE = /^(CC0|CC BY|CC BY-SA|Public domain|PD)/i, foto = {}, titulos = Object.keys(archivo);
for (let i = 0; i < titulos.length; i += 40) {
  const lote = titulos.slice(i, i + 40), porFile = new Map(lote.map((t) => ["File:" + archivo[t].replace(/_/g, " "), t]));
  const j = await J("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&titles=" + encodeURIComponent([...porFile.keys()].join("|")));
  const q = j.query, mapa = new Map(); for (const n of q.normalized || []) mapa.set(n.to, n.from);
  for (const p of Object.values(q.pages)) {
    const t = porFile.get(mapa.get(p.title) || p.title); if (!t) continue;
    const ii = p.imageinfo && p.imageinfo[0]; if (!ii) continue;
    const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
    if (!LIBRE.test(lic) || strip(m.NonFree && m.NonFree.value) === "true") continue;
    let autor = strip(m.Artist && m.Artist.value).replace(/^Original:\s*/i, "").replace(/^File:[^:]*:\s*/i, "");
    if (autor.length > 60) autor = autor.slice(0, 57).replace(/\s+\S*$/, "") + "…";
    foto[t] = [ii.thumburl.split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"), autor || "Autor desconocido", lic, ii.descriptionurl, t];
  }
  process.stdout.write(`\rcommons ${Math.min(i + 40, titulos.length)}/${titulos.length}  `);
  await sleep(250);
}
console.log("\nmodelos con foto libre:", Object.keys(foto).length);

// 4b) modelos cuya imagen principal no es libre: se busca en Commons un archivo con el nombre del modelo en el título
{
  let rescatados = 0;
  for (const t of ts.filter((x) => !foto[x])) {
    const k = norm(t);
    const j = await J("https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=12&srsearch=" + encodeURIComponent('"' + t + '"'));
    const cand = (j.query.search || []).map((x) => x.title).filter((x) => norm(x).includes(k) && /\.(jpe?g|png)$/i.test(x));
    if (!cand.length) { await sleep(150); continue; }
    const ij = await J("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&titles=" + encodeURIComponent(cand.slice(0, 6).join("|")));
    for (const p of Object.values(ij.query.pages)) {
      const ii = p.imageinfo && p.imageinfo[0]; if (!ii || foto[t]) continue;
      const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
      if (!LIBRE.test(lic) || strip(m.NonFree && m.NonFree.value) === "true") continue;
      let autor = strip(m.Artist && m.Artist.value).replace(/^Original:\s*/i, "").replace(/^File:[^:]*:\s*/i, "");
      if (autor.length > 60) autor = autor.slice(0, 57).replace(/\s+\S*$/, "") + "…";
      foto[t] = [ii.thumburl.split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"), autor || "Autor desconocido", lic, ii.descriptionurl, t]; rescatados++;
    }
    await sleep(200);
  }
  console.log("modelos rescatados buscando en Commons:", rescatados);
}

// 5) para cada coche, la foto del primer candidato que tenga
const p = [], idx = new Map(), k = {}; let con = 0; const sin = [];
for (const [clave, c] of Object.entries(candidatos)) {
  const t = c.find((x) => foto[x]); if (!t) { if (c.length) sin.push(clave); continue; }
  if (!idx.has(t)) { idx.set(t, p.length); p.push(foto[t]); }
  k[clave] = idx.get(t); con++;
}
writeFileSync(new URL("../data/fotos-coches.json", import.meta.url), JSON.stringify({ p, k }));
console.log(`coches con foto del modelo real: ${con} de ${Object.keys(candidatos).length} (${(con / Object.keys(candidatos).length * 100).toFixed(0)} %) · fotos distintas: ${p.length}`);
console.log("con modelo pero sin foto libre (muestra):", sin.slice(0, 15).join(" | "));
const sinModelo = Object.entries(candidatos).filter(([, c]) => !c.length).map(([c]) => c);
console.log("sin modelo en la categoría (muestra):", sinModelo.slice(0, 15).join(" | "), "· total:", sinModelo.length);
