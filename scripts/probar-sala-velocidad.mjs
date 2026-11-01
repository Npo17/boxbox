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
// en vivo: el anfitrión puede cambiarla; vale 1,5 s después, un cambio rápido reemplaza al que todavía no empezó y todos consultan la misma línea de tiempo
await sleep(Math.max(0, rs + 500 - Date.now()));
const c1 = await call({ action: 'velocidad', ...A, value: 2 });
ok(c1.at - c1.now >= 1400 && c1.at - c1.now <= 1600, 'en vivo: el cambio vale 1,5 s después');
const c2 = await call({ action: 'velocidad', ...A, value: 1 });   // cambio de idea antes de que valga el 2×: no debe pasar por 2×
ok(c2.at - c2.now >= 1400 && c2.at - c2.now <= 1600, 'el segundo cambio también vale 1,5 s después');
await falla({ action: 'velocidad', ...B, value: 2 }, 403, 'un invitado tampoco puede cambiarla en vivo');
for (const [n, who] of [['anfitrión', A], ['invitado', B]]) {
  const v = await call({ action: 'vel', ...who });
  ok(v.vel === 0.5 && v.log.length === 1 && v.log[0].v === 1, 'el ' + n + ' ve 0,5× y después directo 1× (el 2× pendiente se reemplazó, sin rebote)');
}
await sleep(2500);
const c3 = await call({ action: 'velocidad', ...A, value: 0.25 });
const v3 = await call({ action: 'vel', ...B });
ok(v3.log.length === 2 && v3.log[0].v === 1 && v3.log[1].v === 0.25 && c3.at > v3.log[0].at, 'un cambio después de que el anterior ya valió se agrega en orden (1× y luego 0,25×)');
console.log('sala de prueba:', code);
