// Prueba las estrategias de gomas del motor.
// 1) Sin elegir estrategia, la carrera es idéntica a la del motor anterior (se compara con el commit indicado).
// 2) Mide el rendimiento de cada opción según el desgaste de la pista y la media del estratega.
// Uso: node scripts/probar-estrategias.mjs [commit-anterior] [N]
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import * as E from "../supabase/functions/_shared/engine.js";
const DATA = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/temporadas.json", import.meta.url), "utf8"));
const tracks = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/circuitos.json", import.meta.url), "utf8"));
const prev = process.argv[2] || "HEAD", N = +process.argv[3] || 60;
const tmp = new URL("./_engine_anterior.mjs", import.meta.url);
writeFileSync(tmp, execSync(`git show ${prev}:supabase/functions/_shared/engine.js`, { cwd: new URL("..", import.meta.url), maxBuffer: 1e8 }).toString());
const O = await import(tmp.href);
const team = (s) => E.humanFromPicks("me", "#f00", { piloto: { n: "P", y: 2000, r: 88 }, coche: { r: 88 }, motor: { r: 88 }, jefe: { r: 88 }, estratega: { r: s } });
const sig = (r) => JSON.stringify([r.classification, r.cars.map((c) => [c.key, c.stops, +c.cum[c.cum.length - 1].toFixed(3), c.dnf])]);

// 1) igualdad sin estrategia
let iguales = 0, total = 0;
for (let ti = 0; ti < tracks.length; ti += 3) for (let i = 0; i < 12; i++) {
  const o = { DATA, tracks, seed: "q" + ti + "-" + i, humans: [team(80)], trackIdx: ti, storm: true, real: true };
  total++; if (sig(O.runRace(o)) === sig(E.runRace(o))) iguales++;
}
console.log(`Sin elegir estrategia: ${iguales}/${total} carreras idénticas al motor anterior (${prev})`);

// 2) rendimiento de cada opción
const lvlName = ["bajo", "normal", "alto"];
const res = {};   // [nivel][opción] = {n, tiempo}
const pend = [];
for (let ti = 0; ti < tracks.length; ti++) for (let i = 0; i < N / 4; i++) {
  const seed = "e" + ti + "-" + i;
  const base = E.runRace({ DATA, tracks, seed, humans: [team(95)], trackIdx: ti, real: true });
  if (base.rain) continue;
  const lvl = [0.28, 0.72].reduce((a, t, k) => (a), 0);
  pend.push({ seed, ti });
}
const degOf = (seed) => { const x = E.rngFor(String(seed), "desgaste")(); return x < 0.28 ? 0 : x < 0.72 ? 1 : 2; };
const medias = {};
for (const { seed, ti } of pend) {
  const d = degOf(seed), pos = {};
  for (const id of ["A", "B", "C"]) {
    const r = E.runRace({ DATA, tracks, seed, humans: [team(95)], trackIdx: ti, real: true, decisions: { "s:me": id } });
    const me = r.cars.find((c) => c.human); if (me.dnf) continue;
    pos[id] = me.pos + (me.cum[r.laps] - r.cars.find((c) => c.pos === 1).cum[r.laps]) * 0.01;
  }
  if (Object.keys(pos).length < 3) continue;
  medias[d] ??= { n: 0, A: 0, B: 0, C: 0 }; medias[d].n++; for (const id of ["A", "B", "C"]) medias[d][id] += pos[id];
}
console.log("\nPuesto medio (más bajo = mejor), estratega 95, por desgaste de la pista:");
for (const d of [0, 1, 2]) { const m = medias[d]; if (m) console.log(`  desgaste ${lvlName[d].padEnd(6)} (${String(m.n).padStart(3)} carreras)  A (1 parada) ${(m.A / m.n).toFixed(2)}   B (2 paradas) ${(m.B / m.n).toFixed(2)}   C (blanda→dura) ${(m.C / m.n).toFixed(2)}`); }
// opciones y avisos
let ok = 0, tot = 0;
for (let i = 0; i < 400; i++) { const s = 60 + (i % 5) * 9; const o = E.strategyOptions({ seed: "z" + i, key: "h:me", laps: 28, rain: false, s }); const tr = E.STRAT_BEST[degOf("z" + i)]; tot++; if (o.rec === tr) ok++; }
console.log(`\nAcierto del aviso del estratega (medias 60 a 96): ${(ok / tot * 100).toFixed(0)}%`);
for (const s of [60, 75, 90, 96]) { let a = 0; for (let i = 0; i < 400; i++) { const o = E.strategyOptions({ seed: "y" + i, key: "h:me", laps: 28, rain: false, s }); if (o.rec === E.STRAT_BEST[degOf("y" + i)]) a++; } console.log(`  estratega ${s}: acierta ${(a / 4).toFixed(0)}%`); }
console.log("Ejemplo de opciones (28 vueltas, estratega 80):", JSON.stringify(E.strategyOptions({ seed: "demo", key: "h:me", laps: 28, rain: false, s: 80 }).opts.map((o) => [o.id, o.stints.map((x) => x.c + ":" + x.a + "-" + x.b).join(" ")])));
