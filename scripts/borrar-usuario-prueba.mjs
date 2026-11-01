// Borra un usuario de prueba SIN cuenta de Google (anónimo, el de "Jugar con un apodo") a partir de su apodo, con sus partidas.
// Por seguridad no toca usuarios con mail. Uso: node scripts/borrar-usuario-prueba.mjs <apodo>
import { execSync } from 'node:child_process';
const REF = 'vljuhibzzwtcswirunfr', SB = `https://${REF}.supabase.co`, apodo = process.argv[2];
if (!apodo || !/^[A-Za-z0-9._-]{3,16}$/.test(apodo)) { console.log('Uso: node scripts/borrar-usuario-prueba.mjs <apodo>'); process.exit(1); }
const keys = JSON.parse(execSync(`npx --yes supabase@2.122.0 projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^[^\[]*/, ''));
const sec = keys.find((k) => k.name === 'service_role').api_key;
const H = { apikey: sec, Authorization: 'Bearer ' + sec, 'Content-Type': 'application/json' };
const perfil = await (await fetch(`${SB}/rest/v1/perfiles?nickname=eq.${encodeURIComponent(apodo)}&select=user_id`, { headers: H })).json();
if (!Array.isArray(perfil) || !perfil.length) { console.log('No hay ningún usuario con el apodo', apodo); process.exit(0); }
const id = perfil[0].user_id, u = await (await fetch(`${SB}/auth/v1/admin/users/${id}`, { headers: H })).json();
if (!u.is_anonymous || u.email) { console.log('Ese apodo es de una cuenta con mail: no se borra.'); process.exit(1); }
const r = await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: H });
console.log(r.ok ? `Borrado el usuario de prueba "${apodo}" (y su perfil y partidas).` : 'No se pudo borrar: ' + r.status);
