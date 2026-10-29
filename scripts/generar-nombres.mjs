// Baja de StatsF1 (statsf1.com) solo datos de hecho, para poner nombre real a las piezas de las temporadas no curadas:
//   - proveedor del motor de cada escudería en cada temporada (tabla de constructores de cada año)
//   - jefe de equipo (Team Principal) con los años en que ocupó el cargo (página de cada escudería)
// Un pedido por segundo, con caché en scripts/.cache. No se guarda ni se publica ningún texto de la web, solo nombres.
// Uso: node scripts/generar-nombres.mjs  →  scripts/nombres-statsf1.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CACHE = path.join(ROOT, '.cache', 'statsf1');
const OUT = path.join(ROOT, 'nombres-statsf1.json');
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'BoxBox-datos/1.0 (+https://boxf1box.com; proyecto de fans sin fines de lucro; 1 pedido por segundo)';

async function page(slug) {
  const file = path.join(CACHE, slug + '.html');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  for (let t = 0; t < 4; t++) {
    const r = await fetch(`https://www.statsf1.com/es/${slug}.aspx`, { headers: { 'User-Agent': UA } });
    if (r.status === 429 || r.status >= 500) { await sleep(30000); continue; }
    if (!r.ok) return null;
    const html = await r.text();
    fs.writeFileSync(file, html);
    await sleep(1000);
    return html;
  }
  return null;
}
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

const seasons = {}, teams = new Set();
for (let y = 1950; y <= 2026; y++) {
  const html = await page(String(y));
  const tbl = html?.split('TBL_CHP_Cst')[1];
  if (!tbl) { console.log(y, 'sin tabla de constructores'); continue; }
  const rows = [];
  for (const m of tbl.split('</table>')[0].matchAll(/<td class="libelle">([\s\S]*?)<\/td>/g)) {
    const cell = m[1];
    const slugs = [...cell.matchAll(/href="\/es\/([^"]+)\.aspx"/g)].map((x) => x[1]);
    const team = slugs.find((s) => !s.startsWith('moteur-'));
    if (!team) continue;
    const names = [...cell.matchAll(/<a href="\/es\/([^"]+)\.aspx">([\s\S]*?)<\/a>/g)].map((x) => [x[1], text(x[2])]);
    rows.push({ slug: team, team: names.find((n) => n[0] === team)?.[1], engine: names.find((n) => n[0].startsWith('moteur-'))?.[1] ?? null });
    teams.add(team);
  }
  seasons[y] = rows;
  console.log(y, rows.length, 'escuderías');
}

// Jefes de equipo: "Nombre (1966-1970) ➜ Nombre (1970-1982) …"
const principals = {};
for (const slug of teams) {
  const html = await page(slug);
  const blk = html?.split('Team Principal :')[1]?.split('<hr')[0];
  if (!blk) { principals[slug] = []; continue; }
  principals[slug] = [...text(blk.replace(/<br\s*\/?>/g, ' ')).matchAll(/(?:[•➜]\s*)?([^()•➜]+?)\s*\((\d{4})-(\d{4})?\)/g)]
    .map((m) => ({ name: m[1].trim(), from: +m[2], to: m[3] ? +m[3] : 2026 }));
}
fs.writeFileSync(OUT, JSON.stringify({ seasons, principals }, null, 1));
const sinJefe = [...teams].filter((t) => !principals[t].length).length;
console.log(`Listo: ${Object.keys(seasons).length} temporadas, ${teams.size} escuderías (${sinJefe} sin jefe de equipo) → ${OUT}`);
