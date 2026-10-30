// Prueba de punta a punta de la lista de amigos contra el servidor real.
// Crea tres usuarios de prueba, juega pedidos/aceptar/perfil/quitar, mira que la sala guarde quién es cada jugador y los borra al terminar.
// Necesita haber iniciado sesión con la CLI de Supabase. Uso: node scripts/probar-amigos.mjs
import { execSync } from 'node:child_process';

const REF = 'vljuhibzzwtcswirunfr', SB = `https://${REF}.supabase.co`, FN = SB + '/functions/v1/amigos', SALA = SB + '/functions/v1/sala';
let bad = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) bad++; };
const keys = JSON.parse(execSync(`npx --yes supabase@2.122.0 projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^[^\[]*/, ''));
const pub = keys.find((k) => k.name === 'default' && k.type === 'publishable').api_key, sec = keys.find((k) => k.name === 'service_role').api_key;
const admin = (path, opt = {}) => fetch(SB + path, { ...opt, headers: { apikey: sec, Authorization: 'Bearer ' + sec, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
const created = [];
async function newUser(tag) {
  const email = `bbamigo-${Date.now()}-${tag}@example.com`, password = 'Bb!' + Math.random().toString(36).slice(2) + 'Aa1';
  const u = await (await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  if (!u.id) throw new Error('no se pudo crear el usuario de prueba');
  created.push(u.id);
  const t = await (await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: pub, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  return { id: u.id, token: t.access_token };
}
const call = async (user, action, extra = {}) => {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(user ? { Authorization: 'Bearer ' + user.token } : {}) }, body: JSON.stringify({ action, ...extra }) });
  return { status: r.status, ...(await r.json()) };
};
try {
  const [a, b, c] = [await newUser('a'), await newUser('b'), await newUser('c')];
  const na = 'Ana' + Date.now().toString(36).slice(-4), nb = 'Beto' + Date.now().toString(36).slice(-4);
  ok((await call(null, 'yo')).status === 401, 'sin sesión no se puede usar amigos');
  ok((await call(a, 'solicitar', { nick: 'nadie123' })).code === 'nick', 'sin apodo no se puede pedir amistad');
  ok((await call(a, 'nick', { nickname: 'x' })).status === 400, 'apodo inválido rechazado');
  ok((await call(a, 'nick', { nickname: na })).nick === na, 'apodo guardado');
  ok((await call(b, 'nick', { nickname: nb })).nick === nb, 'el otro también elige apodo');
  ok((await call(c, 'nick', { nickname: na })).status === 409, 'no se puede repetir un apodo');
  ok((await call(a, 'solicitar', { nick: 'noExisteNadie' })).status === 404, 'apodo que no existe: aviso');
  ok((await call(a, 'solicitar', { uid: a.id })).status === 400, 'no podés agregarte a vos mismo');
  let r = await call(a, 'solicitar', { nick: nb });
  ok(r.enviadas.length === 1 && r.amigos.length === 0, 'pedido enviado por apodo');
  r = await call(b, 'yo');
  ok(r.recibidas.length === 1 && r.recibidas[0].nick === na, 'el otro ve el pedido recibido');
  let p = await call(a, 'perfil', { uid: b.id });
  ok(p.relacion === 'enviada' && !p.stats, 'con el pedido pendiente no se ve el perfil completo');
  p = await call(c, 'perfil', { uid: b.id });
  ok(p.relacion === 'ninguna' && p.nick === nb && !p.stats && !p.trofeos, 'un desconocido solo ve el apodo');
  r = await call(b, 'responder', { uid: a.id, aceptar: true });
  ok(r.amigos.length === 1 && r.amigos[0].nick === na && !r.recibidas.length, 'pedido aceptado: ya son amigos');
  r = await call(a, 'yo');
  ok(r.amigos.length === 1 && r.amigos[0].nick === nb && !r.enviadas.length, 'el que pidió también ve al amigo');
  p = await call(a, 'perfil', { uid: b.id });
  ok(p.relacion === 'amigo' && p.stats && Array.isArray(p.trofeos), 'un amigo ve el perfil completo (estadísticas y trofeos)');
  ok((await call(a, 'solicitar', { uid: b.id })).amigos.length === 1, 'pedir de nuevo a un amigo no duplica nada');
  // pedidos cruzados: c y a se piden a la vez -> quedan amigos
  await call(c, 'nick', { nickname: 'Caro' + Date.now().toString(36).slice(-4) });
  await call(c, 'solicitar', { uid: a.id }); r = await call(a, 'solicitar', { uid: c.id });
  ok(r.amigos.length === 2, 'si los dos se piden, quedan amigos sin aceptar');
  // la sala guarda quién es cada jugador con sesión
  const sala = async (body) => (await (await fetch(SALA, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) })).json());
  const s1 = await sala({ action: 'create', name: 'Ana', token: a.token });
  ok(s1.players[0].uid === a.id, 'la sala sabe quién es el jugador que inició sesión');
  const s2 = await sala({ action: 'join', code: s1.room.code, name: 'Beto', token: b.token });
  const s3 = await sala({ action: 'join', code: s1.room.code, name: 'Anónimo' });
  ok(s2.players.find((x) => x.name === 'Beto').uid === b.id && s3.players.find((x) => x.name === 'Anónimo').uid === undefined, 'los que no inician sesión siguen siendo anónimos');
  r = await call(a, 'quitar', { uid: b.id });
  ok(r.amigos.length === 1 && !(await call(b, 'yo')).amigos.some((x) => x.nick === na), 'quitar amigo lo saca de las dos listas');
  p = await call(a, 'perfil', { uid: b.id });
  ok(p.relacion === 'ninguna' && !p.stats, 'al quitarlo ya no se ve su perfil completo');
} finally {
  for (const id of created) await admin('/auth/v1/admin/users/' + id, { method: 'DELETE' });
  console.log(`(se borraron ${created.length} usuarios de prueba)`);
}
if (bad) process.exitCode = 1; else console.log('\n✅ Todo OK');
