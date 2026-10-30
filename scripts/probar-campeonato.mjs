// Pruebas del campeonato de pilotos en salas de carrera (cuándo hay campeón). Uso: node scripts/probar-campeonato.mjs
import * as E from '../supabase/functions/_shared/engine.js';
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };
const EV = E.eventos2026();
ok(EV.length === 29, '29 eventos');
const c = (ronda, cerrada, puntos, wins, n = 2) => E.campeonato(EV, ronda, cerrada, puntos, wins, n);
ok(c(0, true, { a: 25, b: 18 }) === null, 'después de la primera carrera nadie es campeón');
ok(c(5, true, { a: 100, b: 90 }) === null, 'con puntos en juego y poca diferencia no hay campeón');
// al final de la temporada (último evento ya contado) gana el líder
const ult = EV.length - 1;
const f = c(ult, true, { a: 300, b: 290 });
ok(f && f.pid === 'a' && f.final, 'al terminar la temporada, el líder es campeón (final)');
// desempate por victorias
const t = c(ult, true, { a: 300, b: 300 }, { a: 2, b: 5 });
ok(t && t.pid === 'b', 'con puntos iguales gana quien tiene más victorias');
// campeón matemático: quedan los últimos eventos y el líder saca más de lo que queda
const act = EV.length - 3;                           // evento actual ya contado: quedan los 2 últimos
const rest = EV.slice(act + 1).reduce((s, e) => s + (e.k === 'gp' ? 25 : 8), 0);
const m = c(act, true, { a: 200 + rest + 1, b: 200 });
ok(m && m.pid === 'a' && !m.final && m.faltan === rest, `campeón matemático antes de terminar (quedan ${rest} puntos y saca ${rest + 1} de ventaja)`);
ok(c(act, true, { a: 200 + rest, b: 200 }) === null, 'si el segundo todavía puede igualarlo, no es matemático');
ok(c(ult, true, { a: 300 }, {}, 1) === null, 'con un solo jugador no hay campeón');
ok(c(ult, true, { a: 0, b: 0 }) === null, 'sin puntos no hay campeón');
ok(c(ult, false, { a: 300, b: 280 }) === null, 'si falta contar la última carrera y puede alcanzarlo, todavía no hay campeón');
