// Prueba la estrategia de gomas en una sala: elegir antes de largar, plazo y revelación. Tarda ~40 s. Uso: node scripts/probar-sala-estrategia.mjs
const URL = 'https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const call = async (body) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error), { status: r.status }); return j;
};
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slots = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];
const a = await call({ action: 'create', name: 'Ana', modo: 'carrera' }), code = a.room.code, b = await call({ action: 'join', code, name: 'Beto' });
const A = { code, pid: a.pid, secret: a.secret }, B = { code, pid: b.pid, secret: b.secret };
await call({ action: 'start', ...A });
for (const who of [A, B]) for (const slot of slots) { await call({ action: 'roll', ...who }); await call({ action: 'pick', ...who, slot, idx: 0 }); }
let s = await call({ action: 'state', ...A });
ok(s.room.status === 'racing' && s.room.est_rev === false, 'en carrera, estrategias todavía ocultas');
try { await call({ action: 'estrategia', ...A, choice: 'Z' }); ok(false, 'estrategia inválida rechazada'); } catch (e) { ok(e.status === 400, 'estrategia inválida rechazada'); }
await call({ action: 'estrategia', ...A, choice: 'B' }); await call({ action: 'estrategia', ...B, choice: 'C' });
await call({ action: 'estrategia', ...A, choice: 'A' });      // cambiar de idea antes del plazo
ok(s.players.every((p) => p.est === undefined), 'nadie ve la elección de otro antes de tiempo');
const rs = Date.parse(s.room.race_start) - s.now + Date.now();      // largada en hora local
await sleep(Math.max(0, rs - 3000 + 600 - Date.now()));
s = await call({ action: 'state', ...A });
ok(s.room.est_rev === true, 'a 3 s de largar se revelan las estrategias');
ok(s.players.find((p) => p.pid === A.pid).est === 'A' && s.players.find((p) => p.pid === B.pid).est === 'C', 'se ve la última elección de cada jugador (A y C)');
try { await call({ action: 'estrategia', ...A, choice: 'B' }); ok(false, 'plazo cerrado'); } catch (e) { ok(e.status === 409, 'pasado el plazo ya no se puede cambiar'); }
console.log('sala de prueba:', code);
