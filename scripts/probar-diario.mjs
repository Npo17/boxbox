// Prueba de punta a punta del desafío del día contra el servidor real.
// Crea dos usuarios de prueba, juega el desafío completo, compara el resultado del servidor con el del
// motor local y borra los usuarios (y con ellos sus partidas) al terminar.
// Necesita: haber iniciado sesión con la CLI de Supabase y que el servidor tenga cargado DAILY_SECRET.
// Uso: node scripts/probar-diario.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as E from '../supabase/functions/_shared/engine.js';

const REF = 'vljuhibzzwtcswirunfr', URL = `https://${REF}.supabase.co`, FN = URL + '/functions/v1/diario';
const DATA = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/temporadas.json', import.meta.url), 'utf8'));
const tracks = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), 'utf8'));
let bad = 0;
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) bad++; };

// claves del proyecto (la secreta nunca se imprime)
const keys = JSON.parse(execSync(`npx --yes supabase@2.122.0 projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^[^\[]*/, ''));
const pub = keys.find((k) => k.name === 'default' && k.type === 'publishable').api_key;
const sec = keys.find((k) => k.name === 'default' && k.type === 'secret').api_key;
const admin = (path, opt = {}) => fetch(URL + path, { ...opt, headers: { apikey: sec, Authorization: 'Bearer ' + sec, 'Content-Type': 'application/json', ...(opt.headers || {}) } });

const created = [];
async function newUser(tag) {
  const email = `bbtest-${Date.now()}-${tag}@example.com`, password = 'Bb!' + Math.random().toString(36).slice(2) + 'Aa1';
  const r = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  const u = await r.json(); if (!u.id) throw new Error('no se pudo crear el usuario de prueba: ' + JSON.stringify(u).slice(0, 120));
  created.push(u.id);
  const t = await (await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: pub, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  return { id: u.id, token: t.access_token };
}
const call = async (user, action, extra = {}) => {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...(user ? { Authorization: 'Bearer ' + user.token } : {}) }, body: JSON.stringify({ action, ...extra }) });
  const j = await r.json(); return { status: r.status, ...j };
};

async function play(user, nick, slotsOrder) {
  const out = { rolls: [] };
  for (const slot of slotsOrder) {
    const a = await call(user, 'roll'), a2 = await call(user, 'roll');
    out.rolls.push(a.roll);
    if (JSON.stringify(a.roll) !== JSON.stringify(a2.roll)) out.nonIdempotent = true;
    if (a.roll.offer[slot].shown.some((x) => x.length !== 2)) out.leak = true;      // no deben viajar las medias
    const p = await call(user, 'pick', { slot, idx: 0 });
    if (p.status !== 200) throw new Error('pick falló: ' + JSON.stringify(p));
    out.last = p;
  }
  return out;
}

try {
  console.log('Día del desafío:', E.dayKey());
  const A = await newUser('a'), B = await newUser('b');

  const anon = await call(null, 'estado'); ok(anon.status === 200 && anon.logged === false, 'sin sesión: el estado funciona y dice logged=false');
  ok((await call(null, 'roll')).status === 401, 'sin sesión no se puede tirar (401)');
  const e0 = await call(A, 'estado'); ok(e0.logged && e0.nickname === null && e0.entry === null, 'usuario nuevo: sin nombre y sin partida');
  const noNick = await call(A, 'roll'); ok(noNick.status === 409 && noNick.code === 'nick', 'sin nombre no se puede jugar');
  ok((await call(A, 'apodo', { nickname: 'a' })).status === 400, 'nombre demasiado corto rechazado');
  ok((await call(A, 'apodo', { nickname: '<b>x</b>' })).status === 400, 'nombre con símbolos rechazado');
  const nickA = 'BBTestA' + Math.floor(Math.random() * 1e4), nickB = 'BBTestB' + Math.floor(Math.random() * 1e4);
  ok((await call(A, 'apodo', { nickname: nickA })).nickname === nickA, 'nombre guardado');
  ok((await call(B, 'apodo', { nickname: nickA.toLowerCase() })).status === 409, 'nombre repetido (aunque cambie mayúsculas) rechazado');
  await call(B, 'apodo', { nickname: nickB });

  // misma mano para todos
  const rA = await call(A, 'roll'), rB = await call(B, 'roll');
  ok(JSON.stringify(rA.roll) === JSON.stringify(rB.roll), `la tirada 1 es idéntica para dos usuarios (año ${rA.roll.year})`);
  ok(rA.roll.offer.piloto.shown.every((x) => x.length === 2), 'las ofertas viajan sin medias (ciego)');

  // elecciones inválidas
  ok((await call(A, 'pick', { slot: 'piloto', idx: 99 })).status === 400, 'una pieza que no salió es rechazada');
  ok((await call(A, 'pick', { slot: 'xx', idx: 0 })).status === 400, 'una casilla inválida es rechazada');
  ok((await call(A, 'cerrar')).status === 409, 'no se puede cerrar con el auto incompleto');

  // partida completa de A
  const slots = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];
  const g = await play(A, nickA, slots);
  ok(!g.nonIdempotent, 'pedir la tirada dos veces devuelve la misma');
  ok(!g.leak, 'ninguna tirada reveló las medias');
  ok(g.last.done === true && /^[0-9a-f]{64}$/.test(g.last.raceSeed), 'al completar el auto se entrega la semilla de la carrera');
  ok((await call(A, 'pick', { slot: 'piloto', idx: 0 })).status === 409, 'no se puede elegir después de completar');

  // el resultado oficial del servidor coincide con el del motor local (con y sin safety car)
  const humans = [E.humanFromPicks('me', '#ff3b30', g.last.picks)];
  const local = (dec) => E.summary(E.runRace({ DATA, tracks, seed: g.last.raceSeed, humans, laps: E.LAPS, decisions: dec ? { me: dec } : {} }), 'me');
  const race0 = E.runRace({ DATA, tracks, seed: g.last.raceSeed, humans, laps: E.LAPS });
  const decision = race0.sc && !race0.cars.find((c) => c.human).dnf ? 'pit' : undefined;
  console.log('   safety car hoy:', race0.sc ? `sí (vuelta ${race0.sc.lap})` : 'no', '| decisión:', decision || 'ninguna');
  const cl = await call(A, 'cerrar', decision ? { decision } : {});
  const L = local(decision);
  ok(cl.status === 200 && cl.result.pos === L.pos && cl.result.dnf === L.dnf && cl.result.pts === L.pts, `resultado del servidor = motor local (P${cl.result.pos}, ${cl.result.pts} pts)`);
  ok(Math.abs(Number(cl.result.tiempo) - Number(L.time)) < 0.01 || (L.dnf && cl.result.tiempo == null), 'el tiempo de carrera coincide');
  ok(cl.rank === 1 && cl.total >= 1 && cl.streak === 1, `puesto #${cl.rank} de ${cl.total}, racha ${cl.streak}`);
  const cl2 = await call(A, 'cerrar', { decision: decision === 'pit' ? 'stay' : 'pit' });
  ok(cl2.status === 200 && cl2.result.pos === cl.result.pos, 'cerrar de nuevo no cambia el resultado (una sola partida)');

  // estado, una sola partida por día y ranking
  const e1 = await call(A, 'estado');
  ok(e1.entry.status === 'listo' && e1.entry.result.pos === cl.result.pos && e1.entry.mano.rolls.length === 5 && e1.entry.mano.raceSeed === g.last.raceSeed, 'el estado muestra la partida terminada y la mano para jugar amistoso');
  ok(e1.streak === 1, 'racha de 1 día');
  const again = await call(A, 'roll'); ok(again.status === 409 && again.code === 'jugado', 'no se puede jugar dos veces el mismo día');
  const rk = await call(A, 'ranking', { dia: 'hoy' });
  ok(rk.list.some((r) => r.nickname === nickA && r.mine), 'el ranking de hoy incluye a A (y lo marca como suyo)');
  const rkB = await call(B, 'ranking', { dia: 'hoy' });
  ok(rkB.list.some((r) => r.nickname === nickA && !r.mine), 'para B, la fila de A no figura como suya');
  ok((await call(null, 'ranking', { dia: 'ayer' })).status === 200, 'el ranking de ayer se puede ver sin sesión');

  // B juega distinto: sigue el orden de la mano y su resultado queda detrás o delante según el motor
  const gb = await play(B, nickB, ['estratega', 'jefe', 'motor', 'coche', 'piloto']);
  ok(gb.last.done && gb.last.raceSeed === g.last.raceSeed, 'B recibe la misma carrera que A');
  const cb = await call(B, 'cerrar'); ok(cb.status === 200 && cb.total >= 2, `B también queda registrado (#${cb.rank} de ${cb.total})`);
} catch (e) {
  console.log('❌ ' + e.message); bad++;
} finally {
  for (const id of created) await admin('/auth/v1/admin/users/' + id, { method: 'DELETE' });
  console.log(`(se borraron ${created.length} usuarios de prueba y sus partidas)`);
}
console.log(bad ? `\n❌ ${bad} pruebas fallaron` : '\n✅ Todo OK');
process.exit(bad ? 1 : 0);
