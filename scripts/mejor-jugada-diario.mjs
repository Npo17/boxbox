// La mejor jugada posible del desafío del día (para aprender, después de jugarlo).
// La mano es la misma para todos: un usuario de prueba tira los 5 dados para conocerla (sin cerrar la carrera, así no entra al ranking)
// y se borra al terminar. Después se prueban todas las combinaciones con el mismo motor del juego.
// Uso: node scripts/mejor-jugada-diario.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as E from '../supabase/functions/_shared/engine.js';

const REF = 'vljuhibzzwtcswirunfr', SB = `https://${REF}.supabase.co`, FN = SB + '/functions/v1/diario';
const DATA = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/temporadas.json', import.meta.url), 'utf8'));
const tracks = JSON.parse(fs.readFileSync(new URL('../supabase/functions/_shared/circuitos.json', import.meta.url), 'utf8'));
const SLOTS = ['piloto', 'coche', 'motor', 'jefe', 'estratega'];
const keys = JSON.parse(execSync(`npx --yes supabase@2.122.0 projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^[^\[]*/, ''));
const pub = keys.find((k) => k.name === 'default' && k.type === 'publishable').api_key;
const sec = keys.find((k) => k.name === 'service_role').api_key;
const admin = (path, opt = {}) => fetch(SB + path, { ...opt, headers: { apikey: sec, Authorization: 'Bearer ' + sec, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
const call = async (user, action, extra = {}) => {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', Authorization: 'Bearer ' + user.token }, body: JSON.stringify({ action, ...extra }) });
  return { status: r.status, ...(await r.json()) };
};

// 1) conocer la mano de hoy
let user = null; const rolls = []; let raceSeed = null;
try {
  const email = `bbtest-${Date.now()}-mejor@example.com`, password = 'Bb!' + Math.random().toString(36).slice(2) + 'Aa1';
  const u = await (await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  if (!u.id) throw new Error('no se pudo crear el usuario de prueba');
  const t = await (await fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: pub, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  user = { id: u.id, token: t.access_token };
  await call(user, 'apodo', { nickname: 'BBMejor' + Math.floor(Math.random() * 1e5) });
  const libres = [...SLOTS];
  for (let i = 0; i < 5; i++) {
    const r = await call(user, 'roll'); rolls.push(r.roll);
    const slot = libres.find((s) => r.roll.offer[s].shown.length) ?? libres[0];
    const p = await call(user, 'pick', { slot, idx: 0 }); libres.splice(libres.indexOf(slot), 1);
    if (p.done) raceSeed = p.raceSeed;
  }
} finally {
  if (user) await admin('/auth/v1/admin/users/' + user.id, { method: 'DELETE' });
}
if (!raceSeed) throw new Error('no se pudo conocer la carrera de hoy');

// 2) medias de cada pieza (la tirada viaja sin medias: se buscan en los datos)
const media = (slot, year, name) => (DATA[year][slot === 'estratega' ? 'estratega' : slot] || []).find((x) => x[0] === name)?.[2] ?? 0;
const ofertas = rolls.map((r) => Object.fromEntries(SLOTS.map((s) => [s, r.offer[s].shown.map((x) => ({ n: x[0], y: r.year, r: media(s, r.year, x[0]) }))])));
console.log('Día', E.dayKey(), '· tiradas:', rolls.map((r) => r.year).join(', '));

// 3) todas las formas de repartir las 5 tiradas en las 5 casillas, con las 3 mejores piezas de cada una
const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
const carrera = (picks, dec) => { const race = E.runRace({ DATA, tracks, seed: raceSeed, humans: [E.humanFromPicks('me', '#ff3b30', picks)], real: true, decisions: dec }); return { race, s: E.summary(race, 'me') } };
const peor = (a, b) => (a.dnf - b.dnf) || (a.pos - b.pos) || ((a.time ?? 1e9) - (b.time ?? 1e9));
let mejores = [];
for (const orden of perms(SLOTS)) {
  if (orden.some((s, i) => !ofertas[i][s].length)) continue;
  const opciones = orden.map((s, i) => [...ofertas[i][s]].sort((a, b) => b.r - a.r).slice(0, 3));
  const idx = [0, 0, 0, 0, 0];
  for (;;) {
    const picks = {}; orden.forEach((s, i) => { picks[s] = opciones[i][idx[i]] });
    const base = carrera(picks, {}), tr = base.race, est = tr.rain ? ['W', 'I'] : tr.sprint ? [] : ['A', 'B', 'C'];
    for (const e of est.length ? est : [null]) {
      const dec = e ? { 's:me': e } : {}, r = e ? carrera(picks, dec) : base;
      mejores.push({ reparto: orden, picks, est: e, ...r.s, sc: !!r.race.sc && !r.race.nopit });
    }
    let k = 4; while (k >= 0 && ++idx[k] >= opciones[k].length) idx[k--] = 0; if (k < 0) break;
  }
  mejores.sort(peor); mejores = mejores.slice(0, 40);
}
// 4) a las mejores se les prueba también qué hacer con el safety car
const final = [];
for (const m of mejores) for (const sc of m.sc ? [undefined, 'pit', 'stay'] : [undefined]) {
  const dec = { ...(m.est ? { 's:me': m.est } : {}), ...(sc ? { me: sc } : {}) }; const r = carrera(m.picks, dec);
  final.push({ ...m, scDec: sc ?? 'automático', ...r.s });
}
final.sort(peor);
const fmt = (m) => `P${m.dnf ? 'DNF' : m.pos} · ` + SLOTS.map((s) => `${s} ${m.picks[s].n} '${String(m.picks[s].y).slice(2)} (${m.picks[s].r}, tirada ${m.reparto.indexOf(s) + 1})`).join(' · ') + ` · estrategia ${m.est ?? '-'} · safety car: ${m.scDec}`;
console.log('\nMejor jugada:\n  ' + fmt(final[0]));
console.log('\nOtras muy buenas:\n' + final.slice(1, 5).map((m) => '  ' + fmt(m)).join('\n'));
console.log('\nOfertas de cada tirada (casilla: piezas con media):');
ofertas.forEach((o, i) => console.log(`  Tirada ${i + 1} (${rolls[i].year}): ` + SLOTS.filter((s) => o[s].length).map((s) => s + ' ' + o[s].map((x) => `${x.n} ${x.r}`).join(', ')).join(' | ')));
console.log(`\nCarrera: ${final[0].race ? '' : ''}semilla ${raceSeed.slice(0, 6)}…`);
