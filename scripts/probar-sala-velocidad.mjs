// Prueba la velocidad de la carrera en una sala: solo el anfitrión la elige, antes de largar, y se revela a todos. Uso: node scripts/probar-sala-velocidad.mjs
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
const falla = async (body, status, msg) => { try { await call(body); ok(false, msg) } catch (e) { ok(e.status === status, msg) } };
await falla({ action: 'velocidad', ...B, value: 0.5 }, 403, 'un invitado no puede elegir la velocidad');
await falla({ action: 'velocidad', ...A, value: 3 }, 400, 'una velocidad inválida se rechaza');
await call({ action: 'velocidad', ...A, value: 2 }); await call({ action: 'velocidad', ...A, value: 0.5 });   // el anfitrión cambia de idea
ok(s.room.vel === undefined, 'antes de largar nadie ve la velocidad elegida');
const rs = Date.parse(s.room.race_start) - s.now + Date.now();
await sleep(Math.max(0, rs - 3000 + 600 - Date.now()));
for (const who of [A, B]) { const t = await call({ action: 'state', ...who }); ok(t.room.vel === 0.5, 'a 3 s de largar todos ven la velocidad del anfitrión (0,5×)'); }
await falla({ action: 'velocidad', ...A, value: 1 }, 409, 'pasado el plazo ni el anfitrión puede cambiarla');
console.log('sala de prueba:', code);
