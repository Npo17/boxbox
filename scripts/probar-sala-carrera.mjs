// Prueba de punta a punta de una sala en modo carrera con dos jugadores: Australia (GP) y la sprint + GP de China.
// Tarda unos 4 minutos (hay que esperar la largada y el conteo de puntos). Uso: node scripts/probar-sala-carrera.mjs
const URL = 'https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const call = async (body) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error), { status: r.status });
  return j;
};
const ok = (cond, msg) => { console.log((cond ? '✅ ' : '❌ ') + msg); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slots = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];

const a = await call({ action: 'create', name: 'Ana', modo: 'carrera' });
const code = a.room.code, b = await call({ action: 'join', code, name: 'Beto' });
const A = { code, pid: a.pid, secret: a.secret }, B = { code, pid: b.pid, secret: b.secret };
ok(a.room.modo === 'carrera' && a.room.evento.gp === 'Australia' && a.room.evento.k === 'gp', 'sala de carrera: primer evento = GP de Australia');
ok(a.room.total === 29, `calendario de ${a.room.total} eventos (23 GP + 6 sprints)`);

async function build() {
  for (const who of [A, B]) for (const slot of slots) {
    await call({ action: 'roll', ...who }); await call({ action: 'pick', ...who, slot, idx: 0 });
  }
}
async function waitFor(pred, ms, step = 5000) {
  const end = Date.now() + ms; let s;
  while (Date.now() < end) { s = await call({ action: 'state', ...A }); if (pred(s)) return s; await sleep(step); }
  return s;
}

await call({ action: 'start', ...A }); await build();
let s = await call({ action: 'state', ...A });
ok(s.room.status === 'racing' && s.players.every((p) => p.picks.piloto), 'armado cerrado: en carrera, con los autos de todos');
try { await call({ action: 'next', ...B }); ok(false, 'un invitado no puede pasar de fecha'); } catch (e) { ok(e.status === 403, 'un invitado no puede pasar de fecha'); }
try { await call({ action: 'next', ...A }); ok(false, 'no se puede pasar de fecha antes de que termine la carrera'); } catch (e) { ok(e.status === 409, 'no se puede pasar de fecha antes de que termine la carrera'); }
console.log('esperando que termine la carrera de Australia (~100 s)…');
s = await waitFor((x) => x.room.cerrada, 150000);
ok(s.room.cerrada, 'carrera contada por el servidor');
const pts = Object.values(s.room.puntos).reduce((t, x) => t + x, 0);
ok(Object.keys(s.room.ultimo).length === 2, 'resultado de cada jugador guardado');
console.log('   puntos:', JSON.stringify(s.room.puntos), 'último:', JSON.stringify(s.room.ultimo));

s = await call({ action: 'next', ...A });
ok(s.room.status === 'lobby' && s.room.ronda === 1 && s.room.evento.k === 'sprint' && s.room.evento.gp === 'China', 'siguiente fecha: sprint de China, de nuevo en la sala');
ok(JSON.stringify(s.room.puntos) === JSON.stringify((await call({ action: 'state', ...B })).room.puntos), 'los puntos se conservan entre fechas');
ok((await call({ action: 'state', ...A })).me.picks.piloto === undefined, 'los autos se reinician para la nueva fecha');

await call({ action: 'start', ...A }); await build();
s = await call({ action: 'state', ...A });
ok(s.room.status === 'racing' && s.room.evento.k === 'sprint', 'sprint de China lista');
const pilotos = s.players.map((p) => p.picks.piloto.n).join('|');
console.log('esperando que termine la sprint (~100 s)…');
s = await waitFor((x) => x.room.cerrada, 150000);
ok(s.room.cerrada, 'sprint contada');
const sprintTotal = Object.values(s.room.puntos).reduce((t, x) => t + x, 0);
ok(sprintTotal > pts && sprintTotal - pts <= 8 + 7, `la sprint sumó ${sprintTotal - pts} puntos (máximo 8 + 7)`);

s = await call({ action: 'next', ...A });
ok(s.room.status === 'racing' && s.room.evento.k === 'gp' && s.room.evento.gp === 'China' && !s.room.cerrada, 'mismo fin de semana: GP de China sin volver a armar');
ok(s.players.map((p) => p.picks.piloto.n).join('|') === pilotos, 'mismos autos en la sprint y en el GP');
console.log(`\nsala de prueba: ${code}`);
process.exit(process.exitCode || 0);
