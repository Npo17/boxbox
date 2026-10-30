// Reglas de caché de Cloudflare para boxf1box.com: la página y los archivos se sirven desde el borde (sin ir cada vez a GitHub Pages).
// Uso: node scripts/cloudflare-cache.mjs on|off|ver   (necesita CLOUDFLARE_API_TOKEN con permiso de reglas de caché)
const modo = process.argv[2];
if (!['on', 'off', 'ver'].includes(modo)) { console.log('Uso: node scripts/cloudflare-cache.mjs on|off|ver'); process.exit(1); }
const H = { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' };
const api = async (p, o = {}) => { const r = await (await fetch('https://api.cloudflare.com/client/v4' + p, { ...o, headers: H })).json(); if (!r.success) throw new Error(JSON.stringify(r.errors)); return r.result; };
const zone = (await api('/zones?name=boxf1box.com'))[0];
const ruta = `/zones/${zone.id}/rulesets/phases/http_request_cache_settings/entrypoint`;
if (modo === 'ver') {
  try { console.log(JSON.stringify((await api(ruta)).rules?.map((r) => ({ id: r.id, d: r.description, e: r.expression, p: r.action_parameters })), null, 1)); } catch (e) { console.log('sin reglas:', String(e).slice(0, 200)); }
  process.exit(0);
}
const rules = modo === 'off' ? [] : [
  { action: 'set_cache_settings', description: 'BoxBox: página (HTML) en el borde 5 min', enabled: true, expression: '(http.host eq "boxf1box.com")', action_parameters: { cache: true, edge_ttl: { mode: 'override_origin', default: 300 }, browser_ttl: { mode: 'override_origin', default: 300 } } },
  { action: 'set_cache_settings', description: 'BoxBox: archivos estáticos en el borde 1 día', enabled: true, expression: '(http.host eq "boxf1box.com" and (http.request.uri.path.extension in {"js" "css" "svg" "png" "jpg" "webp" "json" "woff2" "ico" "mp3"}))', action_parameters: { cache: true, edge_ttl: { mode: 'override_origin', default: 86400 }, browser_ttl: { mode: 'override_origin', default: 14400 } } },
];
const r = await api(ruta, { method: 'PUT', body: JSON.stringify({ rules }) });
console.log(modo === 'on' ? 'reglas de caché activadas:' : 'reglas de caché quitadas:', (r.rules || []).map((x) => x.description).join(' | ') || '(ninguna)');
