// Motor de BoxBox: ofertas de cada tirada, parrilla, qualy y carrera.
//
// JavaScript puro, sin DOM y determinista: la misma semilla y las mismas elecciones dan
// exactamente el mismo resultado en el navegador y en el servidor (Edge Functions). Por eso
// el servidor puede verificar el desafío del día y las salas.
//
// Reglas de determinismo: PRNG entero (hash FNV-1a + mulberry32) y solo aritmética básica
// más Math.floor/round/min/max/abs. Nada de sin/exp/pow, que pueden variar entre motores.
// Cada auto usa su propio flujo de números aleatorios por vuelta: lo que decide un jugador
// (por ejemplo entrar a boxes con el safety car) no cambia la suerte de los demás.

export const SLOTS = ["piloto", "coche", "motor", "jefe", "estratega"];
export const SLOT_NAMES = { piloto: "Piloto", coche: "Coche", motor: "Motor", jefe: "Jefe de equipo", estratega: "Estratega" };
export const PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const LAPS = 20;
export const MAX_SHOWN = 12;
export const SC_LAPS = 3;
export const PIT_LOSS = 19;      // segundos que se pierden en una parada normal (sin contar el trabajo de los mecánicos)
export const PIT_LOSS_SC = 12;   // con safety car la parada cuesta bastante menos, pero no es gratis
export const RIVAL_COLORS = ["#4fc3f7", "#81c784", "#ba68c8", "#ffb74d", "#ffd23f", "#64b5f6", "#b0bec5", "#29b6f6", "#5c6bc0",
  "#26a69a", "#80cbc4", "#3949ab", "#ff9800", "#cddc39", "#90a4ae", "#f06292", "#8d6e63", "#e57373", "#d32f2f", "#ef5350",
  "#e53935", "#f44336"];

// ---------- números aleatorios ----------
export function hash32(...parts) {
  const s = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rngFor = (...parts) => mulberry32(hash32(...parts));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round1 = (x) => Math.round(x * 10) / 10;

// ---------- ofertas (cada tirada) ----------
// Las piezas top aparecen menos: un 99 sale, pero no siempre.
const appearChance = (r) => (r >= 97 ? 0.08 : r >= 93 ? 0.15 : r >= 88 ? 0.3 : r >= 84 ? 0.6 : 1);

export function makeOffer(DATA, rng, year) {
  const season = DATA[year], o = {};
  for (const k of SLOTS) {
    const all = season[k] || [];
    let shown = all.filter((it) => rng() < appearChance(it[2]));
    if (shown.length < 2) {
      const rest = all.filter((it) => !shown.includes(it)).sort((a, b) => a[2] - b[2]);
      shown = shown.concat(rest.slice(0, 2 - shown.length));
    }
    if (shown.length > MAX_SHOWN) {                     // en 1950 hubo 81 pilotos: solo se muestran 12
      // Sorteo ponderado: los de más media tienen más chances de entrar (si no, Fangio casi nunca saldría entre 80 pilotos).
      shown = shown.map((it) => ({ it, key: Math.pow(rng(), 1 / Math.max(0.25, ((it[2] - 50) / 10) ** 2)) }))
        .sort((a, b) => b.key - a.key).slice(0, MAX_SHOWN).map((x) => x.it);
    }
    o[k] = { shown: shown.sort((a, b) => b[2] - a[2]), total: all.length };
  }
  return o;
}
// Años que tienen alguna pieza para las casillas libres (motor, jefe y estratega solo existen
// en las temporadas curadas a mano).
export const yearsFor = (DATA, free) => Object.keys(DATA).filter((y) => free.some((k) => (DATA[y][k] || []).length));
// Años curados a mano (con motores, jefes y estrategas reales): son los que usa el desafío del día.
// Las demás temporadas tienen esas tres casillas estimadas a partir del resultado de cada escudería.
export const fullYears = (DATA) => Object.keys(DATA).filter((y) => DATA[y].curada && SLOTS.every((k) => (DATA[y][k] || []).length >= 2));
export const rollYear = (DATA, rng, years) => years[Math.floor(rng() * years.length)];

// ---------- autos ----------
export const paceOf = (c) => (c.c - 85) * 0.045 + (c.d - 85) * 0.035 + (c.m - 85) * 0.025;
// Probabilidad de choque por vuelta: solo los pilotos de menos de 75 de media.
export const crashChance = (d) => (d < 75 ? (75 - d) * 0.001 + 0.002 : 0);
// Con lluvia: todos con neumáticos de lluvia, nadie entra a boxes; se va más lento, la habilidad del piloto pesa más
// y se cometen más errores (hasta los buenos pilotos pueden irse largos).
export const RAIN_CHANCE = 0.1;
export const WET_FACTOR = 1.13;
export const SLICK_ON_WET = 1.32;     // slicks sobre pista mojada: muchísimo más lento
export const STORM_CHANCE = 0.07;     // carreras con aviso de tormenta a mitad de carrera (con decisión)
export const STORM_ARRIVES = 0.55;    // probabilidad de que la lluvia anunciada llegue de verdad
export const SC_ON_CRASH = 0.72;       // no todos los choques traen safety car (en seco: ~42% de las carreras)
export const SC_ON_CRASH_WET = 0.5; // con lluvia: ~60%
export const SPRINT_LAPS = 8;
export const SPRINT_PTS = [8, 7, 6, 5, 4, 3, 2, 1];
export const crashChanceWet = (d) => (d < 90 ? (90 - d) * 0.0005 + 0.0008 : 0.0006);

export function humanFromPicks(id, color, picks, label) {
  const p = picks.piloto;
  return { id, driver: p.n, year: p.y, color, name: label || `${p.n} '${String(p.y).slice(2)}`,
    d: p.r, c: picks.coche.r, m: picks.motor.r, j: picks.jefe.r, s: picks.estratega.r };
}

// Rivales: una mezcla de pilotos de toda la historia (algunos estrellas, otros flojos),
// no siempre los mismos 21 de leyenda.
function buildRivals(DATA, seed, need, taken, usedColors) {
  const pool = [];
  for (const y of Object.keys(DATA)) for (const p of DATA[y].piloto) pool.push({ driver: p[0], year: y, r: p[2] });
  // 5 estrellas, 8 buenos, 5 de nivel medio y 3 flojos (de menos de 75: esos son los que chocan)
  const bands = [[90, 101, Math.round(need * 0.24)], [80, 90, Math.round(need * 0.38)], [75, 80, Math.round(need * 0.24)], [0, 75, 0]];
  bands[3][2] = need - bands[0][2] - bands[1][2] - bands[2][2];
  const rng = rngFor(seed, "rivales"), out = [], names = new Set(taken);
  for (const [lo, hi, count] of bands) {
    const cand = pool.filter((x) => x.r >= lo && x.r < hi);
    let tries = 0;
    for (let n = 0; n < count && tries < 5000; tries++) {
      const x = cand[Math.floor(rng() * cand.length)];
      if (!x || names.has(x.driver)) continue;
      names.add(x.driver); out.push(x); n++;
    }
  }
  const palette = RIVAL_COLORS.filter((c) => !usedColors.has(c));
  return out.map((x, i) => {
    const key = "r" + i, R = rngFor(seed, "atributos", key);
    return { key, human: false, driver: x.driver, year: x.year, name: `${x.driver} '${String(x.year).slice(2)}`,
      color: palette[i % palette.length], d: x.r,
      c: clamp(x.r - 7 + Math.round(R() * 9), 50, 99), m: clamp(x.r - 5 + Math.round(R() * 7), 50, 99),
      j: 78 + Math.round(R() * 14), s: 76 + Math.round(R() * 16) };
  });
}

// ---------- carrera completa: qualy + carrera ----------
// humans: [{id, name, driver, year, color, d, c, m, j, s}]
// decisions: { [humanId]: "pit" | "stay" } (qué hace cada jugador con el safety car; sin dato = automático)
// trackIdx: fija el circuito (modo carrera, según el calendario). rain: fuerza lluvia o seco; si no, sale del sorteo de la semilla.
// sprint: carrera corta sin paradas. storm: permite el aviso de tormenta a mitad de carrera (el jugador decide en decisions["r:"+id]).
export function runRace({ DATA, tracks, seed, humans, laps = LAPS, decisions = {}, trackIdx: forcedTrack, rain: forcedRain, sprint = false, storm: allowStorm = false }) {
  seed = String(seed);
  const trackIdx = forcedTrack ?? Math.floor(rngFor(seed, "circuito")() * tracks.length);
  const track = tracks[trackIdx];
  const rain = forcedRain ?? rngFor(seed, "lluvia")() < RAIN_CHANCE;
  const BASE = track.lap, OPT = Math.round(laps / 2), WET = rain ? WET_FACTOR : 1;
  const noPit = rain || sprint;                       // lluvia total y sprint: nadie entra a boxes
  let storm = null;
  if (allowStorm && !rain && !sprint && rngFor(seed, "lluvia")() < RAIN_CHANCE + STORM_CHANCE) {
    const S = rngFor(seed, "tormenta"), ann = 4 + Math.floor(S() * 8);
    storm = { ann, rainLap: ann + 2, arrives: S() < STORM_ARRIVES, p: Math.round(STORM_ARRIVES * 100), T: 0, TR: 0 };
  }

  const hs = humans.map((h) => ({ ...h, key: "h:" + h.id, human: true }));
  const rivals = buildRivals(DATA, seed, Math.max(0, 22 - hs.length), hs.map((h) => h.driver), new Set(hs.map((h) => h.color)));
  const cars = [...hs, ...rivals];

  // qualy a una vuelta
  for (const c of cars) {
    const R = rngFor(seed, "qualy", c.key);
    const n = R();                                   // 1.ª tirada: la suerte de la vuelta (±0,35 s)
    c.luck = Math.min(6, Math.floor((1 - n) * 6) + 1);   // cara del dado: 1 = vuelta mala, 6 = vuelta redonda
    c.q = BASE * WET - 1.9 - paceOf(c) - (c.d - 85) * (rain ? 0.05 : 0.02) + (n - 0.5) * (rain ? 1.2 : 0.7);
    c.qErr = null;
    const err = R(), corner = R(), loss = R();
    if (err < Math.max(0, (rain ? 94 : 88) - c.d) * 0.015) { c.qErr = track.corners[Math.floor(corner * track.corners.length)]; c.q += 1.2 + loss * 1.5; }
  }
  const gridCars = [...cars].sort((a, b) => a.q - b.q);
  gridCars.forEach((c, i) => { c.grid = i + 1; });

  // plan de carrera de cada auto
  for (const c of cars) {
    const R = rngFor(seed, "plan", c.key), e = (96 - c.s) / 5;
    c.pit = Math.max(2, Math.min(laps - 1, OPT + Math.round((R() * 2 - 1) * e)));        // estratega malo = se equivoca de vuelta
    const ex = R(), exLap = R();
    c.extra = c.s < 84 && ex < (84 - c.s) * 0.05 ? Math.min(laps - 1, c.pit + 2 + Math.floor(exLap * 3)) : 0;   // parada de más
    c.stat = round1(2.0 + (95 - c.j) * 0.06 + R() * 0.4);                                  // jefe de equipo = mecánicos
    c.cum = [(c.grid - 1) * 0.35]; c.tp = [0]; c.ev = [];
    c.dnf = 0; c.dnfT = 0; c.stops = 0; c.stopped = false; c.stopLap = 0;
    if (noPit) { c.pit = 0; c.extra = 0; c.stopped = true; }          // lluvia o sprint: nadie entra a boxes
    c.tyre = rain ? "wet" : "slick";
  }

  let sc = null;
  const ev = (c, T, lap, k, txt, extra) => c.ev.push({ T, lap, k, txt, carKey: c.key, ...extra });
  const globalEv = [];
  if (rain) globalEv.push({ T: 0, lap: 1, k: "rain", carKey: null, txt: "🌧️ Pista mojada: todos largan con neumáticos de lluvia y nadie entra a boxes." });

  for (let lap = 1; lap <= laps; lap++) {
    const scNow = !!sc && lap > sc.lap && lap <= sc.lap + SC_LAPS;
    const running = cars.filter((c) => !c.dnf);
    const crashers = [];
    const wetNow = rain || (!!storm && storm.arrives && lap >= storm.rainLap);
    if (storm && lap === storm.ann) {
      storm.T = Math.min(...running.map((c) => c.cum[lap - 1]));
      globalEv.push({ T: storm.T, lap, k: "forecast", carKey: null, txt: `⛈️ Pronóstico: se anuncian lluvias o tormentas (${storm.p}% de probabilidad) en las próximas vueltas. ¿Entrar a boxes por gomas de lluvia?` });
    }
    if (storm && lap === storm.rainLap) {
      storm.TR = Math.min(...running.map((c) => c.cum[lap - 1]));
      globalEv.push(storm.arrives ? { T: storm.TR, lap, k: "rain", carKey: null, txt: "🌧️ ¡Empieza a llover fuerte! Los que siguen con slicks pierden muchísimo tiempo." }
        : { T: storm.TR, lap, k: "green", carKey: null, txt: "☀️ La lluvia no llegó: la pista sigue seca." });
    }
    for (const c of running) {
      const R = rngFor(seed, "vuelta", c.key, lap), r = [];
      for (let i = 0; i < 10; i++) r.push(R());                  // mismas tiradas por auto y vuelta, pase lo que pase
      const T0 = c.cum[lap - 1], age = lap - c.stopLap;
      const onWet = c.tyre === "wet", mis = !scNow && wetNow && !onWet;       // mis: slicks sobre pista mojada
      let t0 = scNow ? BASE * 1.4
        : BASE * (wetNow ? (onWet ? WET_FACTOR : SLICK_ON_WET) : 1) - paceOf(c) - (wetNow ? (c.d - 85) * 0.04 : 0) + (r[0] - 0.5) * (wetNow ? 1.5 : 0.6)
          + (onWet ? (wetNow ? 0 : 2.8) : (wetNow ? 0 : age * 0.22));     // gomas gastadas (con lluvia casi no se gastan; mojadas sobre seco: lentas)
      let tp = 0, why = null;

      // paradas
      if (storm && !scNow || (storm && scNow && lap !== sc.lap + 1)) {
        if (lap === storm.ann + 1 && c.tyre === "slick") {
          const dec = c.human ? decisions["r:" + c.id] : undefined;
          const want = dec === "pit" ? true : dec === "stay" ? false : rngFor(seed, "tormentaIA", c.key)() < clamp((c.s - 65) / 30, 0.15, 0.9);
          if (want) why = "wet";
        } else if (c.tyre === "slick" && storm.arrives && lap >= storm.rainLap + 1) why = "wetlate";
        else if (c.tyre === "wet" && !storm.arrives && lap >= storm.rainLap + 2) why = "dryback";
      }
      if (scNow && lap === sc.lap + 1 && !noPit && !why) {
        const dec = c.human ? decisions[c.id] : undefined;
        if (dec === "pit") why = "sc";
        else if (dec === "stay") why = null;
        else if (!c.stopped) { if (r[6] < clamp((c.s - 65) / 30, 0.15, 0.95)) why = "sc"; }
        else if (age >= 8 && laps - lap >= 6 && r[6] < 0.25 * clamp((c.s - 60) / 35, 0, 1)) why = "sc";
      }
      if (!why && !c.stopped && lap === c.pit) why = scNow ? "sc" : "plan";
      if (!why && c.extra && lap === c.extra && c.stopped && !scNow) why = "extra";
      if (why) {
        tp = (scNow ? PIT_LOSS_SC : PIT_LOSS) + c.stat; c.stops++;
        const late = why === "plan" && Math.abs(c.pit - OPT) >= 3 ? (c.pit > OPT ? " (tarde: las gomas ya estaban muertas)" : " (demasiado pronto)") : "";
        const txt = why === "wet" ? `Box, box: gomas de lluvia por el pronóstico. Parada de ${c.stat}s`
          : why === "wetlate" ? `¡Ya llueve fuerte! Box, box: gomas de lluvia, entramos tarde. Parada de ${c.stat}s`
          : why === "dryback" ? `La lluvia no llegó: volvemos a slicks. Parada de ${c.stat}s`
          : why === "sc" ? `Box, box: aprovechamos el safety car. Parada de ${c.stat}s`
          : why === "extra" ? `Box, box… ¿otra vez? Parada de ${c.stat}s y las gomas estaban bien`
          : `Box, box. Parada de ${c.stat}s${late}`;
        ev(c, T0 + t0, lap, "pit", txt, { why });
        c._stop = true; c._tyre = why === "wet" || why === "wetlate" ? "wet" : why === "dryback" ? "slick" : null;
      } else { c._stop = false; c._tyre = null; }
      if (c.human && lap === OPT + 2 && c.pit > OPT + 2 && !c.stopped && !scNow) ev(c, T0 + t0, lap, "radio", "¡Estas gomas no dan más! ¿Cuándo paro?", { who: "pilot" });

      // incidentes (no con safety car en pista)
      c._crash = false; c._dead = false;
      if (!scNow) {
        if (r[1] < Math.max(0, (wetNow ? 96 : 90) - c.d) * (wetNow ? 0.005 : 0.004) * (mis ? 3 : 1) + (mis ? 0.04 : 0)) {
          const loss = 3 + r[2] * 4; t0 += loss;
          ev(c, T0 + t0 * 0.4, lap, "off", `${c.name} se sale de pista en ${track.corners[Math.floor(r[7] * track.corners.length)]} (−${loss.toFixed(1)}s)`);
        }
        if (r[3] < (wetNow ? crashChanceWet(c.d) : crashChance(c.d)) * (mis ? 3 : 1)) { c._crash = true; crashers.push(c); }
        else if (c.m < 80 && r[4] < (80 - c.m) * 0.0004) {
          c._dead = true; c.dnf = lap; c.dnfT = T0 + t0 * 0.6;
          ev(c, c.dnfT, lap, "engine", `Humo en ${c.name}: motor roto, abandona`);
          if (!sc && r[8] < 0.25 && lap <= laps - SC_LAPS - 1) sc = { lap, T: c.dnfT, by: c.name, why: "motor", laps: SC_LAPS };
        }
      }
      c._t0 = t0; c._tp = tp; c._T0 = T0; c._r = r;
    }

    // choques: se llevan por delante al auto más cercano (a veces) y activan el safety car
    for (const c of crashers) {
      const T0 = c._T0, Tc = T0 + c._t0 * 0.5;
      const near = running.filter((o) => o !== c && !o._crash && !o._dead).sort((a, b) =>
        Math.abs(a.cum[lap - 1] - T0) - Math.abs(b.cum[lap - 1] - T0))[0];
      c.dnf = lap; c.dnfT = Tc;
      const corner = track.corners[Math.floor(c._r[7] * track.corners.length)];
      ev(c, Tc, lap, "crash", near ? `Choque de ${c.name} con ${near.name} en ${corner}. ${c.name} abandona` : `${c.name} se estrella en ${corner} y abandona`);
      if (near) {
        if (c._r[5] < 0.35) {
          near.dnf = lap; near.dnfT = near._T0 + near._t0 * 0.5; near._dead = true;
          ev(near, near.dnfT, lap, "crash", `${near.name} también abandona por el choque`);
        } else near._t0 += 8;
      }
      if (!sc && lap <= laps - SC_LAPS - 1 && c._r[9] < (wetNow ? SC_ON_CRASH_WET : SC_ON_CRASH)) sc = { lap, T: Tc, by: c.name, why: "choque", laps: SC_LAPS };
    }
    if (sc && sc.lap === lap && !sc.announced) {
      sc.announced = true;
      globalEv.push({ T: sc.T, lap, k: "sc", carKey: null, txt: `🚨 SAFETY CAR: ${sc.why === "choque" ? "choque de " : "motor roto de "}${sc.by}. Entran a boxes los que quieren gomas nuevas.` });
    }

    // cierre de la vuelta
    for (const c of running) {
      if (c.dnf) continue;
      c.cum.push(c._T0 + c._t0 + c._tp); c.tp.push(c._tp);
      if (c._stop) { c.stopped = true; c.stopLap = lap; if (c._tyre) c.tyre = c._tyre; }
    }
    // con el safety car el pelotón se junta: las diferencias se achican
    if (scNow) {
      const alive = cars.filter((c) => !c.dnf && c.cum.length > lap).sort((a, b) => a.cum[lap] - b.cum[lap]);
      if (alive.length) {
        const lead = alive[0].cum[lap];
        alive.forEach((c, i) => {
          const target = lead + Math.min(c.cum[lap] - lead, i * 0.8);
          c.cum[lap] = Math.max(target, c.cum[lap - 1] + c.tp[lap] + 8);
        });
      }
      if (lap === sc.lap + SC_LAPS) {
        sc.endT = alive.length ? alive[0].cum[lap] : sc.T;
        globalEv.push({ T: sc.endT, lap, k: "green", carKey: null, txt: "🟢 Bandera verde: se reanuda la carrera." });
      }
    }
  }
  if (sc && sc.endT === undefined) sc.endT = sc.T;

  // radio de los jugadores: cómo va la carrera cada pocas vueltas
  for (const me of hs) {
    if (me.dnf) continue;
    let prev = me.grid;
    for (const lap of [3, 6, 9, 12, 15, 18].filter((l) => l < laps)) {
      if (me.cum.length <= lap) break;
      const alive = cars.filter((c) => c.cum.length > lap).sort((a, b) => a.cum[lap] - b.cum[lap]);
      const p = alive.indexOf(me) + 1, ahead = alive[p - 2];
      const txt = p < prev ? `P${p}. ¡Ganaste ${prev - p} puesto${prev - p > 1 ? "s" : ""}! Sigue así.`
        : p > prev ? `P${p}. Perdimos ${prev === p ? 0 : p - prev} puesto${p - prev > 1 ? "s" : ""}, hay que reaccionar.`
        : ahead ? `P${p}. ${ahead.name} está a ${(me.cum[lap] - ahead.cum[lap]).toFixed(1)}s. Empuja.` : `P${p}. Lideras. Controla el ritmo.`;
      ev(me, me.cum[lap], lap, "radio", txt, { who: "eng" }); prev = p;
    }
  }

  // clasificación final
  const classification = [...cars].sort((a, b) => {
    if (!!a.dnf !== !!b.dnf) return a.dnf ? 1 : -1;
    if (a.dnf && b.dnf) return (b.dnf - a.dnf) || (b.dnfT - a.dnfT);
    return a.cum[laps] - b.cum[laps];
  });
  classification.forEach((c, i) => { c.pos = i + 1; });
  for (const c of cars) for (const k of Object.keys(c)) if (k[0] === "_") delete c[k];

  const events = [...cars.flatMap((c) => c.ev), ...globalEv].sort((a, b) => a.T - b.T);
  return { trackIdx, track, rain, sprint, storm, nopit: noPit, laps, cars, grid: gridCars.map((c) => c.key), classification: classification.map((c) => c.key), sc, events };
}

// Resumen de un jugador: lo que se guarda y se compara en el ranking del desafío del día.
export function summary(race, humanId) {
  const c = race.cars.find((x) => x.key === "h:" + humanId);
  const dnf = !!c.dnf, laps = dnf ? c.dnf - 1 : race.laps;
  return { pos: c.pos, dnf, laps, grid: c.grid, stops: c.stops, pts: dnf ? 0 : PTS[c.pos - 1] || 0,
    time: dnf ? null : Math.round(c.cum[race.laps] * 1000) / 1000,
    // orden del ranking: menor es mejor (los que terminan, por posición y tiempo; los que abandonan, al final)
    orden: dnf ? 1e7 - laps * 1000 : c.pos * 1e5 + Math.round(c.cum[race.laps]) };
}

// Dónde está un auto en el instante T: p = vueltas recorridas (con decimales),
// inPit = está detenido en boxes, out = abandonó.
export function stateAt(c, T) {
  const n = c.cum.length - 1;
  if (T < c.cum[0]) return { p: 0, inPit: false, out: false };
  if (T >= c.cum[n]) {
    if (!c.dnf) return { p: n, inPit: false, out: false };
    if (T >= c.dnfT) return { p: n + 0.5, inPit: false, out: true };
    return { p: n + 0.5 * (T - c.cum[n]) / Math.max(0.001, c.dnfT - c.cum[n]), inPit: false, out: false };
  }
  let k = 1;
  while (k < n && c.cum[k] <= T) k++;
  const start = c.cum[k - 1], end = c.cum[k], tp = c.tp[k] || 0;
  const runEnd = tp > 0 ? Math.max(start + 4, end - tp) : end;
  if (tp > 0 && T >= runEnd) return { p: k, inPit: true, out: false };
  return { p: k - 1 + (T - start) / Math.max(0.001, runEnd - start), inPit: false, out: false };
}

// ---------- desafío del día ----------
// El día cambia a medianoche de Argentina (UTC-3, sin horario de verano).
export const dayKey = (ms = Date.now()) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);
export const nextResetMs = (ms = Date.now()) => Date.parse(dayKey(ms) + "T00:00:00Z") + 3 * 3600 * 1000 + 24 * 3600 * 1000;

// Tirada i del desafío: la misma para todos los que comparten el secreto. Solo sortea años con las
// 5 casillas completas (así nadie se queda sin piezas) y mezcla el orden de cada lista para que no
// se pueda adivinar la media por la posición (las ofertas normales salen ordenadas de mejor a peor).
export function dailyRoll(DATA, secret, i) {
  const years = fullYears(DATA).sort();
  const rng = rngFor(secret, "tirada", i);
  const year = rollYear(DATA, rng, years);
  const offer = makeOffer(DATA, rng, year);
  for (const k of SLOTS) {
    const sh = offer[k].shown, r2 = rngFor(secret, "orden", i, k);
    for (let a = sh.length - 1; a > 0; a--) { const b = Math.floor(r2() * (a + 1)); [sh[a], sh[b]] = [sh[b], sh[a]]; }
  }
  return { i, year, offer };
}
// Lo que se le muestra al jugador durante el desafío: sin las medias.
export const blindView = (roll) => ({ i: roll.i, year: roll.year,
  offer: Object.fromEntries(SLOTS.map((k) => [k, { total: roll.offer[k].total, shown: roll.offer[k].shown.map((x) => [x[0], x[1]]) }])) });

// ---------- modo carrera 2026 ----------
// Calendario (t = circuito en circuitos.json). El GP de Arabia Saudí figura como cancelado y se saltea.
// "Bahrein en Malasia" se corre en el trazado de Baréin: no hay trazado de Malasia.
export const CAL_2026 = [
  { gp: "Australia", date: "8 mar", t: 0 }, { gp: "China", date: "15 mar", t: 1, sprint: true }, { gp: "Japón", date: "29 mar", t: 2 },
  { gp: "Arabia Saudí", date: "—", cancel: true },
  { gp: "Miami", date: "3 may", t: 5, sprint: true }, { gp: "Canadá", date: "24 may", t: 6, sprint: true }, { gp: "Mónaco", date: "7 jun", t: 7 },
  { gp: "Barcelona-Catalunya", date: "14 jun", t: 8 }, { gp: "Austria", date: "28 jun", t: 9 }, { gp: "Gran Bretaña", date: "5 jul", t: 10, sprint: true },
  { gp: "Bélgica", date: "19 jul", t: 11 }, { gp: "Hungría", date: "26 jul", t: 12 }, { gp: "Países Bajos", date: "23 ago", t: 13, sprint: true },
  { gp: "Italia", date: "6 sep", t: 14 }, { gp: "España (Madrid)", date: "13 sep", t: 15 }, { gp: "Azerbaiyán", date: "26 sep", t: 16 },
  { gp: "Bahrein en Malasia", date: "4 oct", t: 3 }, { gp: "Singapur", date: "11 oct", t: 17, sprint: true }, { gp: "Estados Unidos", date: "25 oct", t: 18 },
  { gp: "México", date: "1 nov", t: 19 }, { gp: "São Paulo", date: "8 nov", t: 20 }, { gp: "Las Vegas", date: "22 nov", t: 21 },
  { gp: "Catar", date: "29 nov", t: 22 }, { gp: "Abu Dabi", date: "6 dic", t: 23 }];
// Eventos de una sala de carrera: en cada fin de semana con sprint, primero la sprint y después el GP (k = "sprint" | "gp").
export const eventos2026 = () => CAL_2026.flatMap((c, i) => c.cancel ? [] :
  [...(c.sprint ? [{ i, k: "sprint", t: c.t, gp: c.gp, date: c.date }] : []), { i, k: "gp", t: c.t, gp: c.gp, date: c.date }]);
