// Mide cuánto tarda cada acción de la sala (ida y vuelta completa) y cuánto sube con muchos jugadores consultando a la vez.
// Uso: node scripts/medir-latencia-sala.mjs [jugadores=12]
const URL = 'https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const call = async (body) => { const t = performance.now(); const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return [j, performance.now() - t]; };
const N = +process.argv[2] || 12, slots = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const [a] = await call({ action: 'create', name: 'L0' }); const code = a.room.code; const P = [{ code, pid: a.pid, secret: a.secret }];
for (let i = 1; i < N; i++) { const [b] = await call({ action: 'join', code, name: 'L' + i }); P.push({ code, pid: b.pid, secret: b.secret }); }
await call({ action: 'start', ...P[0] });
const t = { roll: [], pick: [], state: [] };
// un jugador solo (sin carga)
for (const slot of slots.slice(0, 3)) { let [r, ms] = await call({ action: 'roll', ...P[0] }); t.roll.push(ms); [r, ms] = await call({ action: 'pick', ...P[0], slot, idx: 0 }); t.pick.push(ms); }
for (let i = 0; i < 3; i++) { const [, ms] = await call({ action: 'state', ...P[0] }); t.state.push(ms); }
console.log(`Sala de ${N} jugadores, un jugador a la vez: roll ${med(t.roll).toFixed(0)} ms · pick ${med(t.pick).toFixed(0)} ms · state ${med(t.state).toFixed(0)} ms`);
// todos consultan el estado a la vez (lo que pasa cuando alguien elige una pieza y todos se enteran)
const burst = await Promise.all(P.map(async (p) => (await call({ action: 'state', ...p }))[1]));
console.log(`Los ${N} consultan el estado a la vez: mediana ${med([...burst]).toFixed(0)} ms · peor ${Math.max(...burst).toFixed(0)} ms`);
// todos eligen a la vez
const burst2 = await Promise.all(P.slice(1).map(async (p) => { const [, a] = await call({ action: 'roll', ...p }); const [, b] = await call({ action: 'pick', ...p, slot: 'piloto', idx: 0 }); return [a, b]; }));
console.log(`Los otros ${N - 1} tiran y eligen a la vez: roll mediana ${med(burst2.map((x) => x[0])).toFixed(0)} ms · pick mediana ${med(burst2.map((x) => x[1])).toFixed(0)} ms (peor pick ${Math.max(...burst2.map((x) => x[1])).toFixed(0)} ms)`);
