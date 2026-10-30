// Activa o desactiva el proxy de Cloudflare (nube naranja) en los registros DNS de boxf1box.com.
// Uso: node scripts/cloudflare-proxy.mjs on    -> la gente entra por Cloudflare (más rápido y sin depender de las IP de GitHub)
//      node scripts/cloudflare-proxy.mjs off   -> vuelve a "solo DNS" (como estaba antes)
// Necesita la variable CLOUDFLARE_API_TOKEN.
const on = process.argv[2] === 'on';
if (!['on', 'off'].includes(process.argv[2])) { console.log('Uso: node scripts/cloudflare-proxy.mjs on|off'); process.exit(1); }
const H = { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' };
const api = async (p, o = {}) => { const r = await (await fetch('https://api.cloudflare.com/client/v4' + p, { ...o, headers: H })).json(); if (!r.success) throw new Error(JSON.stringify(r.errors)); return r.result; };
const zone = (await api('/zones?name=boxf1box.com'))[0];
for (const r of await api(`/zones/${zone.id}/dns_records?per_page=50`)) {
  if (!['A', 'AAAA', 'CNAME'].includes(r.type)) continue;
  if (r.proxied === on) { console.log(`${r.type} ${r.name} -> ya estaba ${on ? 'con proxy' : 'solo DNS'}`); continue; }
  await api(`/zones/${zone.id}/dns_records/${r.id}`, { method: 'PATCH', body: JSON.stringify({ proxied: on }) });
  console.log(`${r.type} ${r.name} (${r.content}) -> ${on ? 'con proxy' : 'solo DNS'}`);
}
