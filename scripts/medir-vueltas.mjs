// Compara carreras de 20 vueltas con las de vueltas reales de cada GP: abandonos, safety car y qué tan seguido gana un auto fuerte.
// Uso: node scripts/medir-vueltas.mjs [N carreras por circuito]
import { readFileSync } from "node:fs";
import * as E from "../supabase/functions/_shared/engine.js";
const DATA = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/temporadas.json", import.meta.url), "utf8"));
const tracks = JSON.parse(readFileSync(new URL("../supabase/functions/_shared/circuitos.json", import.meta.url), "utf8"));
const N = +process.argv[2] || 120;
const team = (d, c, m) => E.humanFromPicks("me", "#f00", { piloto: { n: "P", y: 2000, r: d }, coche: { r: c }, motor: { r: m }, jefe: { r: 88 }, estratega: { r: 88 } });
const stats = (real, ti, human) => {
  let dnf = 0, sc = 0, win = 0, pod = 0, hd = 0, rain = 0;
  for (let i = 0; i < N; i++) {
    const r = E.runRace({ DATA, tracks, seed: "m" + ti + "-" + i, humans: [human], trackIdx: ti, storm: true, real, laps: 20 });
    dnf += r.cars.filter((c) => c.dnf).length; if (r.sc) sc++;
    const me = r.cars.find((c) => c.human); if (me.dnf) hd++; else { if (me.pos === 1) win++; if (me.pos <= 3) pod++; }
    if (r.rain) rain++;
  }
  return { dnf: dnf / N, sc: sc / N, win: win / N, pod: pod / N, hd: hd / N };
};
const f = (x, d = 2) => x.toFixed(d).padStart(5);
for (const [name, h] of [["equipo fuerte (95/92/92)", team(95, 92, 92)], ["equipo medio (85/84/84)", team(85, 84, 84)], ["equipo flojo (72/70/72)", team(72, 70, 72)]]) {
  console.log(`\n== ${name} · ${N} carreras por circuito ==\ncirc vueltas | abandonos 20/real | SC 20/real | victorias 20/real | podios 20/real | DNF propio 20/real`);
  let a = { dnf: 0, sc: 0, win: 0, pod: 0, hd: 0 }, b = { ...a };
  for (let ti = 0; ti < tracks.length; ti++) {
    const x = stats(false, ti, h), y = stats(true, ti, h);
    for (const k of Object.keys(a)) { a[k] += x[k] / tracks.length; b[k] += y[k] / tracks.length; }
    console.log(`${String(ti).padStart(3)}  ${String(E.lapsFor(ti)).padStart(3)}   | ${f(x.dnf)} ${f(y.dnf)} | ${f(x.sc)} ${f(y.sc)} | ${f(x.win)} ${f(y.win)} | ${f(x.pod)} ${f(y.pod)} | ${f(x.hd)} ${f(y.hd)}`);
  }
  console.log(`PROMEDIO      | ${f(a.dnf)} ${f(b.dnf)} | ${f(a.sc)} ${f(b.sc)} | ${f(a.win)} ${f(b.win)} | ${f(a.pod)} ${f(b.pod)} | ${f(a.hd)} ${f(b.hd)}`);
}
