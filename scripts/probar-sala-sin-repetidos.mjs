// Prueba: cada jugador tiene tiradas propias y nadie puede repetir piloto, jefe ni estratega (aunque sea de otro año).
// Uso: node scripts/probar-sala-sin-repetidos.mjs [jugadores=10]
const URL = 'https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const call = async (body) => { const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error), { status: r.status }); return j; };
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };
const N = +process.argv[2] || 10, slots = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];
const a = await call({ action: 'create', name: 'R0' }); const code = a.room.code; const P = [{ code, pid: a.pid, secret: a.secret }];
for (let i = 1; i < N; i++) { const b = await call({ action: 'join', code, name: 'R' + i }); P.push({ code, pid: b.pid, secret: b.secret }); }
await call({ action: 'start', ...P[0] });
// 1) todos tiran a la vez: las tiradas son distintas
const first = await Promise.all(P.map((p) => call({ action: 'roll', ...p })));
const years = first.map((r) => r.roll.year), listas = first.map((r) => r.roll.offer.piloto.shown.map((x) => x[0]).join(','));
ok(new Set(years).size > 1, `las tiradas son distintas entre jugadores (años: ${[...new Set(years)].join(', ')})`);
ok(new Set(listas).size > 1, 'las listas de pilotos ofrecidas no son iguales para todos');
// 2) todos eligen un piloto (con las tiradas ya abiertas: si dos coinciden, el segundo recibe aviso y vuelve a elegir)
let conflictos = 0;
for (const [k, p] of P.entries()) {
  let roll = first[k].roll;
  for (let intento = 0; intento < 6; intento++) {
    try { await call({ action: 'pick', ...p, slot: 'piloto', idx: 0 }); break; }
    catch (e) { if (e.status !== 409) throw e; conflictos++; roll = (await call({ action: 'roll', ...p })).roll; }
  }
}
const st = await call({ action: 'state', ...P[0] });
const nombres = []; for (const p of P) { const me = (await call({ action: 'state', ...p })).me.picks.piloto; nombres.push(me && me.n); }
ok(nombres.every(Boolean), `los ${N} eligieron piloto (${conflictos} aviso(s) de pieza ya elegida)`);
ok(new Set(nombres.map((n) => n.toLowerCase())).size === N, `ningún piloto repetido: ${nombres.join(' · ')}`);
// 3) lo que sigue en las tiradas de los demás nunca incluye pilotos ya elegidos
let vistos = 0, repetidos = 0;
for (const p of P) { const r = (await call({ action: 'roll', ...p })).roll; for (const x of r.offer.piloto.shown) { vistos++; if (nombres.includes(x[0]) && x[0] !== nombres[P.indexOf(p)]) repetidos++; } }
ok(repetidos === 0, `en las tiradas siguientes no aparece ningún piloto ya elegido por otro (${vistos} pilotos revisados)`);
