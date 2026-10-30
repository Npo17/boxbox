// Pone la versión (?v=…) en los archivos que carga index.html, calculada con el contenido de cada uno.
// Así, cuando cambian, todos los navegadores los bajan de nuevo en vez de usar copias viejas del caché (GitHub Pages guarda 10 minutos).
// Correr antes de cada commit que toque game.js, tracks.js, lang/, supabase/functions/_shared/ o index.html:  node scripts/sellar.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root));
const files = ['game.js', 'tracks.js', 'supabase/functions/_shared/engine.js', 'supabase/functions/_shared/temporadas.json', ...fs.readdirSync(new URL('lang/', root)).sort().map((f) => 'lang/' + f)];
const h = crypto.createHash('sha1'); for (const f of files) { h.update(f); h.update(read(f)); }
const V = h.digest('hex').slice(0, 8);
let html = read('index.html').toString('utf8');
const before = html;
html = html.replace(/(src="game\.js)(\?v=[0-9a-f]+)?"/, `$1?v=${V}"`)
  .replace(/(src="tracks\.js)(\?v=[0-9a-f]+)?"/, `$1?v=${V}"`)
  .replace(/(href="supabase\/functions\/_shared\/temporadas\.json)(\?v=[0-9a-f]+)?"/, `$1?v=${V}"`)
  .replace(/(href="supabase\/functions\/_shared\/engine\.js)(\?v=[0-9a-f]+)?"/, `$1?v=${V}"`);
if (html !== before) fs.writeFileSync(new URL('index.html', root), html);
console.log('versión', V, html !== before ? '(index.html actualizado)' : '(sin cambios)');
