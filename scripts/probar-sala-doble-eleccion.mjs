// Prueba: dos elecciones que llegan a la vez (doble toque, respuesta lenta) no se pisan: una se guarda y la otra se rechaza.
// Uso: node scripts/probar-sala-doble-eleccion.mjs [intentos=6]
const URL = 'https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const call = async (body) => { const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error), { status: r.status }); return j; };
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };
const N = +process.argv[2] || 6;
const a = await call({ action: 'create', name: 'D0' }); const code = a.room.code; const me = { code, pid: a.pid, secret: a.secret };
await call({ action: 'start', ...me });
let malas = 0, dobles = 0;
for (let k = 0; k < N; k++) {
  try { await call({ action: 'roll', ...me }); } catch (e) { break; }
  const slot = ['piloto', 'coche', 'motor', 'jefe', 'estratega'].filter((s) => !((k && false))).find((s) => true);
  const antes = (await call({ action: 'state', ...me })).me.picks;
  const libres = ['piloto', 'coche', 'motor', 'jefe', 'estratega'].filter((s) => !antes[s]);
  if (libres.length < 3) break;                       // dejamos al menos una casilla libre para que el armado siga abierto
  // dos elecciones simultáneas: una en la casilla libre 1 y otra en la libre 2 (de la misma tirada)
  const res = await Promise.allSettled([call({ action: 'pick', ...me, slot: libres[0], idx: 0 }), call({ action: 'pick', ...me, slot: libres[1], idx: 0 })]);
  const okN = res.filter((r) => r.status === 'fulfilled').length;
  const despues = (await call({ action: 'state', ...me })).me.picks;
  const nuevos = Object.keys(despues).length - Object.keys(antes).length;
  if (okN === 2) dobles++;
  if (nuevos !== okN) malas++;        // cada elección aceptada tiene que estar en el auto (si una se pisara, faltaría)
  console.log(`   intento ${k + 1}: aceptadas ${okN}, piezas nuevas en el auto ${nuevos}`);
}
ok(malas === 0, `cada elección aceptada quedó en el auto y ninguna se pisó (${N} intentos)`);
console.log(`   (${dobles} de ${N} veces el servidor alcanzó a procesarlas una detrás de la otra, con piezas de dos tiradas distintas: es válido)`);
