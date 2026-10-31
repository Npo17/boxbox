// Después de un deploy: vacía la caché de Cloudflare y vuelve a pedir los archivos principales para que el primer visitante no pague el viaje a GitHub Pages.
// Uso: node scripts/cache-purgar-y-calentar.mjs [--solo-calentar]   (vaciar necesita CLOUDFLARE_API_TOKEN; --solo-calentar no necesita nada y lo corre una tarea programada cada 15 min)
const SITE = 'https://boxf1box.com', H = { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' };
const api = async (p, o = {}) => { const r = await (await fetch('https://api.cloudflare.com/client/v4' + p, { ...o, headers: H })).json(); if (!r.success) throw new Error(p + ' ' + JSON.stringify(r.errors)); return r.result; };
if (!process.argv.includes('--solo-calentar')) {   // con --solo-calentar no hace falta token: solo vuelve a pedir los archivos
  const zona = (await api('/zones?name=boxf1box.com'))[0].id;
  await api(`/zones/${zona}/purge_cache`, { method: 'POST', body: JSON.stringify({ purge_everything: true }) });
  console.log('caché vaciada');
}
const html = await (await fetch(SITE + '/?w=' + Date.now())).text();
const rutas = new Set(['/', '/game.js', '/supabase/functions/_shared/engine.js', '/supabase/functions/_shared/temporadas.json', ...[...html.matchAll(/(?:src|href)="(\/?[^"#:]+\.(?:js|css|json|webp|png|svg))(\?[^"]*)?"/g)].map((m) => '/' + m[1].replace(/^\//, '') + (m[2] || ''))]);
for (const l of ['en', 'pt', 'fr', 'it', 'de', 'pl', 'tr']) rutas.add(`/lang/${l}.js`);
for (const d of ['pilotos', 'fotos', 'coches', 'fotos-coches', 'jefes']) rutas.add(`/data/${d}.json`);
let ok = 0, mal = [];
await Promise.all([...rutas].map(async (r) => { for (let i = 0; i < 3; i++) { const x = await fetch(SITE + r).catch(() => null); if (x && x.ok) { await x.arrayBuffer(); ok++; return; } } mal.push(r); }));
console.log(`calentados ${ok}/${rutas.size}` + (mal.length ? ' · sin respuesta: ' + mal.join(', ') : ''));
