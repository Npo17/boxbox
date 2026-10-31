// Arma data/fotos.json: la foto de cada piloto, solo si está en Wikimedia Commons con licencia libre (CC, dominio público).
// Para cada piloto toma la imagen principal de su página de Wikipedia (el enlace viene de Jolpica) y comprueba en Commons su licencia y su autor.
// Cada entrada: id -> [miniatura, autor, licencia, página de la foto en Commons]. Uso: node scripts/armar-fotos.mjs (necesita haber corrido armar-fichas.mjs)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const CACHE = new URL("../promocion/cache-jolpica/", import.meta.url);
const UA = { "User-Agent": "BoxBoxFichas/1.0 (https://boxf1box.com; juego gratuito de fans)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (url) => { for (let i = 0; i < 6; i++) { const r = await fetch(url, { headers: UA }).catch(() => null); if (r && r.ok) return r.json(); await sleep(1500 * (i + 1)); } throw new Error("sin respuesta: " + url); };

// piloto -> título de Wikipedia (el enlace sale de los resultados guardados)
const fichas = JSON.parse(readFileSync(new URL("../data/pilotos.json", import.meta.url), "utf8"));
const usados = new Set(Object.keys(fichas.p)), titulo = {};
for (const f of readdirSync(CACHE)) {
  if (!f.startsWith("res-")) continue;
  const j = JSON.parse(readFileSync(new URL(f, CACHE), "utf8"));
  for (const r of j.MRData.RaceTable.Races) for (const x of r.Results) {
    const id = x.Driver.driverId, u = x.Driver.url;
    if (usados.has(id) && u && !titulo[id]) { const m = /\/wiki\/([^#?]+)/.exec(u); if (m) titulo[id] = decodeURIComponent(m[1]).replace(/_/g, " "); }
  }
}
console.log("pilotos con página de Wikipedia:", Object.keys(titulo).length, "de", usados.size);

// 1) imagen principal de cada página (de a 40)
const porTitulo = new Map(Object.entries(titulo).map(([id, t]) => [t, id]));
const archivo = {};   // id -> nombre de archivo
const ts = [...porTitulo.keys()];
for (let i = 0; i < ts.length; i += 40) {
  const lote = ts.slice(i, i + 40);
  const j = await J("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=" + encodeURIComponent(lote.join("|")));
  const q = j.query, mapa = new Map(); for (const n of q.normalized || []) mapa.set(n.to, n.from); for (const r of q.redirects || []) mapa.set(r.to, mapa.get(r.from) || r.from);
  for (const p of Object.values(q.pages)) { if (!p.pageimage) continue; const orig = mapa.get(p.title) || p.title, id = porTitulo.get(orig) || porTitulo.get(p.title); if (id) archivo[id] = p.pageimage; }
  process.stdout.write(`\rpáginas ${Math.min(i + 40, ts.length)}/${ts.length}  `);
  await sleep(300);
}
console.log("\ncon imagen principal:", Object.keys(archivo).length);

// 1b) los que Wikipedia no resolvió: imagen del elemento de Wikidata (P18, siempre de Commons)
{
  const faltan = Object.keys(titulo).filter((id) => !archivo[id]), qid = {};
  for (let i = 0; i < faltan.length; i += 40) {
    const lote = faltan.slice(i, i + 40);
    const j = await J("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=" + encodeURIComponent(lote.map((id) => titulo[id]).join("|")));
    const q = j.query, mapa = new Map(); for (const n of q.normalized || []) mapa.set(n.to, n.from); for (const r of q.redirects || []) mapa.set(r.to, mapa.get(r.from) || r.from);
    for (const p of Object.values(q.pages)) { const id = porTitulo.get(mapa.get(p.title) || p.title); if (id && p.pageprops && p.pageprops.wikibase_item) qid[id] = p.pageprops.wikibase_item; }
    await sleep(300);
  }
  let n = 0;
  for (const [id, q] of Object.entries(qid)) {
    const j = await J("https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P18&entity=" + q);
    const c = (j.claims && j.claims.P18 || []).sort((a, b) => (b.rank === "preferred") - (a.rank === "preferred"))[0];
    if (c && c.mainsnak && c.mainsnak.datavalue) { archivo[id] = c.mainsnak.datavalue.value; n++; }
    await sleep(120);
  }
  console.log("imágenes extra desde Wikidata:", n);
}

// 1c) fotos elegidas a mano para quienes la imagen principal no es libre (se comprueba la licencia igual que las demás)
const A_MANO = { hamilton: "Lewis Hamilton 2016 Malaysia 1.jpg", prost: "Alain Prost at the 1988 Hungarian Grand Prix.tiff" };
for (const [id, f] of Object.entries(A_MANO)) if (usados.has(id)) archivo[id] = f;

// 2) licencia, autor y miniatura en Commons (si el archivo no está en Commons, es de uso restringido: se descarta)
const strip = (h) => String(h || "").replace(/^https?:\/\/(?:www\.)?flickr\.com\/photos\/([^\/\s]+).*$/i, "$1 (Flickr)").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
const LIBRE = /^(CC0|CC BY|CC BY-SA|Public domain|PD)/i;
const out = {}, ids = Object.keys(archivo);
let sinLicencia = 0, fuera = 0;
for (let i = 0; i < ids.length; i += 40) {
  const lote = ids.slice(i, i + 40), porFile = new Map(lote.map((id) => ["File:" + archivo[id].replace(/_/g, " "), id]));
  const j = await J("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=320&titles=" + encodeURIComponent([...porFile.keys()].join("|")));
  const q = j.query, mapa = new Map(); for (const n of q.normalized || []) mapa.set(n.to, n.from);
  for (const p of Object.values(q.pages)) {
    const orig = mapa.get(p.title) || p.title, id = porFile.get(orig) || porFile.get(p.title);
    if (!id) continue;
    const ii = p.imageinfo && p.imageinfo[0]; if (!ii) { fuera++; continue; }
    const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
    if (!LIBRE.test(lic) || strip(m.NonFree && m.NonFree.value) === "true") { sinLicencia++; continue; }
    let autor = strip(m.Artist && m.Artist.value).replace(/^Original:\s*/i, "").replace(/^File:[^:]*:\s*/i, "").replace(/\s*\(?talk\)?$/i, "");
    if (autor.length > 60) autor = autor.slice(0, 57).replace(/\s+\S*$/, "") + "…";
    out[id] = [ii.thumburl.split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/"), autor || "Autor desconocido", lic, ii.descriptionurl];
  }
  process.stdout.write(`\rcommons ${Math.min(i + 40, ids.length)}/${ids.length}  `);
  await sleep(300);
}
// fotos cargadas a mano (archivos en data/fotos-locales; sin licencia libre conocida, el autor figura como desconocido)
Object.assign(out, { mansell: ["data/fotos-locales/mansell.jpg", "Autor desconocido", "", ""] });
writeFileSync(new URL("../data/fotos.json", import.meta.url), JSON.stringify(out));
console.log(`\nfotos libres: ${Object.keys(out).length} de ${usados.size} pilotos · fuera de Commons: ${fuera} · licencia no libre: ${sinLicencia}`);
