// Edge Function "diario": desafío del día de BoxBox.
//
// - Una partida por usuario (Google) y por día. El día cambia a medianoche de Argentina.
// - La mano es la misma para todos y sin medias a la vista: las tiradas salen de un secreto que solo
//   tiene el servidor (HMAC del día), se revelan de a una y cada elección se valida acá.
// - La semilla de la carrera se entrega recién cuando el auto está completo, así nadie puede
//   probar combinaciones de antemano. El resultado oficial lo calcula el servidor con el mismo motor
//   que corre en el navegador (_shared/engine.js).
// - Ranking del día (hoy y ayer) y racha de días seguidos.
//
// Las tablas tienen RLS sin políticas: solo esta función (clave de servicio) las usa.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import DATA from "../_shared/temporadas.json" with { type: "json" };
import TRACKS from "../_shared/circuitos.json" with { type: "json" };
import * as E from "../_shared/engine.js";

const SLOTS: string[] = E.SLOTS;
const ALLOWED_ORIGINS = ["https://boxf1box.com", "https://www.boxf1box.com", "https://npo17.github.io",
  "http://localhost:5173", "http://127.0.0.1:5173"];
const NICK_RE = /^[A-Za-z0-9_.-]{3,16}$/;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SECRET = Deno.env.get("DAILY_SECRET") ?? "";
const enc = new TextEncoder();
class Fail extends Error { constructor(msg: string, public status = 400, public code?: string) { super(msg); } }

async function hmacHex(msg: string) {
  if (!SECRET) throw new Fail("El servidor no está configurado", 500);
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const diceSecret = (day: string) => hmacHex("dados|" + day);
const raceSecret = (day: string) => hmacHex("carrera|" + day);

type Usuario = { id: string; email: string | null; anon: boolean };
async function userFrom(req: Request): Promise<Usuario | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/i);
  if (!m) return null;
  const { data, error } = await db.auth.getUser(m[1]);
  return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null, anon: !!(data.user as any).is_anonymous };
}
const need = (u: Usuario | null): Usuario => { if (!u) throw new Fail("Inicia sesión con Google para jugar el desafío.", 401, "login"); return u; };

// ---------- datos ----------
async function getEntry(uid: string, day: string) {
  const { data } = await db.from("desafios").select("*").eq("user_id", uid).eq("day", day).maybeSingle();
  return data;
}
async function getNick(uid: string): Promise<string | null> {
  const { data } = await db.from("perfiles").select("nickname").eq("user_id", uid).maybeSingle();
  return data?.nickname ?? null;
}
const prevDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
async function streakOf(uid: string, today: string) {
  const { data } = await db.from("desafios").select("day").eq("user_id", uid).eq("status", "listo").order("day", { ascending: false }).limit(400);
  const days = new Set((data ?? []).map((r: any) => String(r.day)));
  let cur = days.has(today) ? today : prevDay(today), n = 0;
  while (days.has(cur)) { n++; cur = prevDay(cur); }
  return n;
}
async function rankOf(day: string, row: any) {
  const base = () => db.from("desafios").select("user_id", { count: "exact", head: true }).eq("day", day).eq("status", "listo");
  const [a, b] = await Promise.all([base().lt("orden", row.orden), base().eq("orden", row.orden).lt("created_at", row.created_at)]);
  return (a.count ?? 0) + (b.count ?? 0) + 1;
}
async function totalOf(day: string) {
  const { count } = await db.from("desafios").select("user_id", { count: "exact", head: true }).eq("day", day).eq("status", "listo");
  return count ?? 0;
}
const pickNames = (p: Record<string, any>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { n: v.n, y: v.y }]));
const resultOf = (e: any) => ({ pos: e.pos, dnf: e.dnf, laps: e.laps, grid: e.grid, stops: e.stops, pts: e.pts, tiempo: e.tiempo == null ? null : Number(e.tiempo), decision: e.decision });

// Cierra la carrera: el servidor calcula el resultado oficial con el mismo motor del juego.
async function finalizar(uid: string, day: string, entry: any, decision?: string, estrategia?: string) {
  if (entry.status === "listo") return entry;
  const seed = await raceSecret(day);
  const race = E.runRace({ DATA, tracks: TRACKS, seed, humans: [E.humanFromPicks("me", "#ff3b30", entry.picks)], real: true,
    decisions: { ...(decision === "pit" || decision === "stay" ? { me: decision } : {}), ...(estrategia ? { "s:me": estrategia } : {}) } });   // estrategia de gomas elegida antes de largar
  const s = E.summary(race, "me");
  const { data } = await db.from("desafios").update({
    status: "listo", decision: decision === "pit" || decision === "stay" ? decision : null, pos: s.pos, dnf: s.dnf, laps: s.laps,
    grid: s.grid, stops: s.stops, pts: s.pts, tiempo: s.time, orden: s.orden, updated_at: new Date().toISOString(),
  }).eq("user_id", uid).eq("day", day).neq("status", "listo").select("*").maybeSingle();
  return data ?? await getEntry(uid, day);
}

async function fullState(user: Usuario | null, day: string) {
  const out: any = { day, now: Date.now(), nextAt: E.nextResetMs(), logged: !!user, nickname: null, entry: null, streak: 0, total: 0, aviso: null };
  if (!user) { out.total = await totalOf(day); return out; }
  // Las lecturas no dependen entre sí: en paralelo (antes eran una tras otra).
  const [total, nickname, found, streak, aviso] = await Promise.all([totalOf(day), getNick(user.id), getEntry(user.id, day), streakOf(user.id, day), avisoDe(user)]);
  out.total = total; out.nickname = nickname; out.streak = streak; out.aviso = aviso;
  let entry = found;
  // si recargó con la carrera a medias, se cierra sin su decisión del safety car
  if (entry && entry.status === "corriendo") {
    entry = await finalizar(user.id, day, entry);
    if (entry?.status === "listo") out.streak = await streakOf(user.id, day);   // recién terminó: la racha cambió
  }
  if (entry) {
    out.entry = { status: entry.status, picks: entry.status === "listo" ? entry.picks : pickNames(entry.picks), nPicks: Object.keys(entry.picks).length };
    if (entry.status === "listo") {
      out.entry.result = resultOf(entry);
      out.entry.rank = await rankOf(day, entry);
      out.entry.mano = { rolls: (entry.rolls as any[]).map((r) => ({ i: r.i, year: r.year, offer: r.offer })), raceSeed: await raceSecret(day) };
    }
  }
  return out;
}

// ---------- archivo, tu semana y aviso por mail ----------
const PRIMER_DIA = "2026-10-29";                       // el día que arrancó el desafío
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const daysBack = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") - n * 86400000).toISOString().slice(0, 10);
const trackOf = async (day: string) => TRACKS[Math.floor(E.rngFor(String(await raceSecret(day)), "circuito")() * TRACKS.length)].gp;
// null = no puede pedirlo (sin cuenta de Google); true/false = si lo tiene activado
async function avisoDe(user: Usuario) {
  if (user.anon || !user.email) return null;
  const { data } = await db.from("avisos").select("activo").eq("user_id", user.id).maybeSingle();
  return !!data?.activo;
}

// ---------- acciones ----------
async function handle(req: Request, body: Record<string, any>) {
  const action = String(body.action ?? "");
  const user = await userFrom(req);
  const day = E.dayKey();

  if (action === "estado") return await fullState(user, day);

  if (action === "ranking") {
    const d = body.dia === "ayer" ? prevDay(day) : day;
    const { data } = await db.from("desafios").select("user_id,pos,dnf,laps,tiempo,pts,orden,created_at").eq("day", d).eq("status", "listo")
      .order("orden", { ascending: true }).order("created_at", { ascending: true }).limit(50);
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r: any) => r.user_id))];
    const { data: perf } = ids.length ? await db.from("perfiles").select("user_id,nickname").in("user_id", ids) : { data: [] };
    const nick = new Map((perf ?? []).map((p: any) => [p.user_id, p.nickname]));
    const list = rows.map((r: any, i: number) => ({ rank: i + 1, nickname: nick.get(r.user_id) ?? "Piloto", pos: r.pos, dnf: r.dnf, laps: r.laps,
      tiempo: r.tiempo == null ? null : Number(r.tiempo), pts: r.pts, mine: !!user && r.user_id === user.id }));
    let mine: any = null;
    if (user) {
      const e = await getEntry(user.id, d);
      if (e && e.status === "listo") {
        mine = { rank: await rankOf(d, e), nickname: await getNick(user.id) ?? "Tú", pos: e.pos, dnf: e.dnf, laps: e.laps, tiempo: e.tiempo == null ? null : Number(e.tiempo), pts: e.pts, mine: true };
      }
    }
    return { day: d, total: await totalOf(d), list, mine };
  }

  // Desafíos anteriores: todos los días desde que arrancó (sin hoy), con cuántos jugaron, el circuito y tu resultado.
  if (action === "archivo") {
    const { data: cuentas } = await db.rpc("diario_archivo");
    const total = new Map((cuentas ?? []).map((r: any) => [String(r.day), Number(r.total)]));
    const mios = new Map<string, any>();
    if (user) {
      const { data } = await db.from("desafios").select("day,pos,dnf,laps").eq("user_id", user.id).eq("status", "listo").lt("day", day).gte("day", PRIMER_DIA);
      for (const r of data ?? []) mios.set(String(r.day), { pos: r.pos, dnf: r.dnf, laps: r.laps });
    }
    const dias: any[] = [];
    for (let d = daysBack(day, 1); d >= PRIMER_DIA && dias.length < 400; d = daysBack(d, 1))
      dias.push({ day: d, gp: await trackOf(d), total: total.get(d) ?? 0, mine: mios.get(d) ?? null });
    return { dias };
  }

  // La mano de un día que ya cerró, para jugarlo como amistoso (fuera del ranking). La de hoy nunca se entrega.
  if (action === "mano") {
    const d = String(body.dia ?? "");
    if (!DIA_RE.test(d) || d < PRIMER_DIA || d >= day) throw new Fail("Ese desafío no está en el archivo.");
    const dice = await diceSecret(d);
    return { day: d, rolls: [0, 1, 2, 3, 4].map((i) => E.dailyRoll(DATA, dice, i)), raceSeed: await raceSecret(d) };
  }

  // Desafío del archivo jugado como amistoso: en qué puesto habría quedado ese día (no se guarda nada).
  if (action === "comparar") {
    const d = String(body.dia ?? ""), orden = Number(body.orden);
    if (!DIA_RE.test(d) || d < PRIMER_DIA || d >= day || !Number.isFinite(orden)) throw new Fail("Datos inválidos.");
    const { count } = await db.from("desafios").select("user_id", { count: "exact", head: true }).eq("day", d).eq("status", "listo").lt("orden", orden);
    return { rank: (count ?? 0) + 1, total: await totalOf(d) };
  }

  // Tu semana: tus desafíos de los últimos 7 días con el puesto en el ranking, y los totales de siempre (para los logros).
  if (action === "semana") {
    const u = need(user);
    const { data } = await db.from("desafios").select("day,pos,dnf,laps,grid,stops,picks,tiempo,orden,created_at,updated_at").eq("user_id", u.id).eq("status", "listo")
      .order("day", { ascending: false }).limit(400);
    const rows = data ?? [], desde = daysBack(day, 6);
    // el puesto de cada día (los últimos 60, para no hacer cientos de consultas)
    const conRank = await Promise.all(rows.slice(0, 60).map(async (r: any) => {
      const d = String(r.day);
      const [rank, total] = await Promise.all([rankOf(d, r), d >= desde ? totalOf(d) : Promise.resolve(0)]);
      return { day: d, pos: r.pos, dnf: r.dnf, laps: r.laps, tiempo: r.tiempo == null ? null : Number(r.tiempo), rank, total };
    }));
    const semana = conRank.filter((r) => r.day >= desde);
    for (const r of semana) (r as any).gp = await trackOf(r.day);
    // mejor racha de siempre
    const dias = rows.map((r: any) => String(r.day)).sort();
    let mejor = 0, run = 0, prev = "";
    for (const d of dias) { run = prev && daysBack(d, 1) === prev ? run + 1 : 1; mejor = Math.max(mejor, run); prev = d; }
    // los desafíos jugados antes de que existieran los logros (para recuperarlos y llenar el historial)
    const hist: any[] = [];
    for (const r of rows.slice(0, 60)) {
      const p = (r as any).picks ?? {};
      hist.push({ day: String(r.day), t: Date.parse((r as any).updated_at ?? (r as any).created_at), pos: r.pos, dnf: !!r.dnf, grid: (r as any).grid, stops: (r as any).stops,
        gp: await trackOf(String(r.day)), pi: p.piloto?.n ?? "", y: +(p.piloto?.y ?? 0), anios: SLOTS.map((s) => +(p[s]?.y ?? 0)).filter(Boolean) });
    }
    return { semana, hist, jugados: rows.length, ganados: conRank.filter((r) => r.rank === 1).length, podios: conRank.filter((r) => r.rank <= 3).length,
      racha: await streakOf(u.id, day), mejorRacha: mejor };
  }

  // Aviso por mail cuando sale el desafío (solo cuentas de Google).
  if (action === "aviso") {
    const u = need(user);
    if (u.anon || !u.email) throw new Fail("Para recibir el aviso por mail, entra con Google.", 400, "google");
    const activo = !!body.activo;
    const { error } = await db.from("avisos").upsert({ user_id: u.id, email: u.email, activo, updated_at: new Date().toISOString() });
    if (error) throw new Fail("No se pudo guardar el aviso", 500);
    return { aviso: activo };
  }

  if (action === "apodo") {
    const u = need(user), nick = String(body.nickname ?? "").trim();
    if (!NICK_RE.test(nick)) throw new Fail("El nombre debe tener entre 3 y 16 letras, números, punto, guion o guion bajo.", 400, "nick");
    const { error } = await db.from("perfiles").upsert({ user_id: u.id, nickname: nick });
    if (error) {
      if ((error as any).code === "23505") throw new Fail("Ese nombre ya está en uso. Elige otro.", 409, "nick");
      throw new Fail("No se pudo guardar el nombre", 500);
    }
    return { nickname: nick };
  }

  if (action === "roll") {
    const u = need(user);
    if (!(await getNick(u.id))) throw new Fail("Elige tu nombre para el ranking antes de jugar.", 409, "nick");
    let entry = await getEntry(u.id, day);
    if (!entry) {
      const { data, error } = await db.from("desafios").insert({ user_id: u.id, day }).select("*").maybeSingle();
      if (error && !data) entry = await getEntry(u.id, day); else entry = data;
    }
    if (!entry || entry.status !== "armando") throw new Fail("Ya jugaste el desafío de hoy. Vuelve mañana.", 409, "jugado");
    const rolls = entry.rolls as any[], i = Object.keys(entry.picks).length;
    let open = rolls.find((r) => !r.used);
    if (!open) {
      open = { ...E.dailyRoll(DATA, await diceSecret(day), i), used: false };
      rolls.push(open);
      await db.from("desafios").update({ rolls, updated_at: new Date().toISOString() }).eq("user_id", u.id).eq("day", day);
    }
    return { roll: E.blindView(open), picks: pickNames(entry.picks) };
  }

  if (action === "pick") {
    const u = need(user);
    const entry = await getEntry(u.id, day);
    if (!entry || entry.status !== "armando") throw new Fail("Ya no puedes elegir.", 409);
    const slot = String(body.slot ?? ""), idx = Number(body.idx);
    if (!SLOTS.includes(slot)) throw new Fail("Casilla inválida.");
    const picks = { ...entry.picks } as Record<string, any>, rolls = entry.rolls as any[];
    if (picks[slot]) throw new Fail("Esa casilla ya está ocupada.", 409);
    const open = rolls.find((r) => !r.used);
    if (!open) throw new Fail("Primero tira el dado.", 409);
    const it = open.offer[slot]?.shown?.[idx];
    if (!it) throw new Fail("Esa pieza no salió en tu tirada.");
    picks[slot] = { n: it[0], y: open.year, r: it[2] };
    open.used = true;
    const done = SLOTS.every((s) => picks[s]);
    const { error } = await db.from("desafios").update({ picks, rolls, status: done ? "corriendo" : "armando", updated_at: new Date().toISOString() })
      .eq("user_id", u.id).eq("day", day).eq("status", "armando");
    if (error) throw new Fail("No se pudo guardar tu elección", 500);
    if (!done) return { done: false, picks: pickNames(picks) };
    return { done: true, raceSeed: await raceSecret(day), picks };      // recién ahora se conoce la carrera
  }

  if (action === "cerrar") {
    const u = need(user);
    const entry = await getEntry(u.id, day);
    if (!entry || entry.status === "armando") throw new Fail("Todavía no completaste tu auto.", 409);
    const est = /^[ABCWI]$/.test(String(body.estrategia ?? "")) ? String(body.estrategia) : undefined;
    const done = await finalizar(u.id, day, entry, body.decision ? String(body.decision) : undefined, est);
    return { result: resultOf(done), rank: await rankOf(day, done), total: await totalOf(day), streak: await streakOf(u.id, day) };
  }

  throw new Fail("Acción desconocida.");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    return new Response(JSON.stringify(await handle(req, body)), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    const status = e instanceof Fail ? e.status : 500;
    if (!(e instanceof Fail)) console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Fail ? e.message : "Error del servidor", code: e instanceof Fail ? e.code : undefined }),
      { status, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
