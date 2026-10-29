// Prueba de punta a punta de la Edge Function "sala" con dos jugadores.
// Uso: node scripts/probar-sala.mjs
const URL = 'https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const call = async (body) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error), { status: r.status });
  return j;
};
const ok = (cond, msg) => { console.log((cond ? '✅ ' : '❌ ') + msg); if (!cond) process.exitCode = 1; };

const a = await call({ action: 'create', name: 'Nico<script>' });
ok(/^[A-Z-]+-[A-Z0-9]{3}$/.test(a.room.code), `sala creada: ${a.room.code}`);
ok(a.players[0].name === 'Nicoscript', `nombre limpiado: ${a.players[0].name}`);
ok(a.room.race_seed === null && a.room.dice_seed === null, 'semillas ocultas en el lobby');
const code = a.room.code;
const b = await call({ action: 'join', code, name: 'Lucas' });
ok(b.players.length === 2, 'segundo jugador entró');

try { await call({ action: 'start', code, pid: b.pid, secret: b.secret }); ok(false, 'un invitado no puede largar'); }
catch (e) { ok(e.status === 403, 'un invitado no puede largar'); }
try { await call({ action: 'state', code, pid: a.pid, secret: 'falso' }); ok(false, 'secreto falso rechazado'); }
catch (e) { ok(e.status === 403, 'secreto falso rechazado'); }

await call({ action: 'start', code, pid: a.pid, secret: a.secret });
const slots = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];

// A: tira, re-sortea una vez, elige siempre la primera pieza
let years = [];
for (const [k, slot] of slots.entries()) {
  let r = await call({ action: 'roll', code, pid: a.pid, secret: a.secret });
  if (k === 0) r = await call({ action: 'roll', code, pid: a.pid, secret: a.secret, reroll: true });
  years.push(r.roll.year);
  if (k === 1) {
    try { await call({ action: 'pick', code, pid: a.pid, secret: a.secret, slot, idx: 99 }); ok(false, 'pieza que no salió rechazada'); }
    catch (e) { ok(e.status === 400, 'pieza que no salió rechazada'); }
  }
  await call({ action: 'pick', code, pid: a.pid, secret: a.secret, slot, idx: 0 });
}
const sA = await call({ action: 'state', code, pid: a.pid, secret: a.secret });
ok(sA.me.picks && Object.keys(sA.me.picks).length === 5, `A completó su auto (años ${years.join(', ')})`);
ok(sA.players.find(p => p.pid === b.pid).picks === undefined, 'A no ve las elecciones de B antes de largar');
ok(sA.room.status === 'building', 'sigue armando: falta B');

// B: elige 3 y queda incompleto; se fuerza el cierre no es posible antes del límite,
// así que completa las 5 para cerrar.
for (const slot of slots) {
  await call({ action: 'roll', code, pid: b.pid, secret: b.secret });
  await call({ action: 'pick', code, pid: b.pid, secret: b.secret, slot, idx: 0 });
}
const fin = await call({ action: 'state', code, pid: b.pid, secret: b.secret });
ok(fin.room.status === 'racing', 'con todos listos, la sala pasa a carrera');
ok(/^\d+$/.test(fin.room.race_seed), 'semilla de carrera revelada');
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fin.room.race_seed)))].map(x => x.toString(16).padStart(2, '0')).join('');
ok(hash === fin.room.race_hash, 'la semilla coincide con el hash publicado al crear la sala');
ok(fin.players.every(p => p.picks && Object.keys(p.picks).length === 5), 'ahora se ven los 2 autos');
ok(Date.parse(fin.room.race_start) - fin.now > 5000, 'la largada está programada a futuro');
console.log('sala de prueba:', code);
