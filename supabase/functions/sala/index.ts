// Edge Function "sala": salas con amigos de BoxBox.
//
// Reglas (ver docs/diseno.md, "Salas de amigos"):
// - Dos semillas secretas por sala: dados y carrera. Se publica solo su hash.
// - Las tiradas se revelan de a una, a pedido, y quedan registradas.
// - Cada elección se valida contra la última tirada revelada a ese jugador.
// - Al cerrar el armado (todos listos o vence el tiempo) se completan los autos
//   incompletos y se revela la semilla de carrera. Cada navegador simula la misma
//   carrera con esa semilla y las elecciones ya validadas, así nadie puede cambiar
//   lo que ven los demás.
//
// Las tablas tienen RLS sin políticas: solo esta función (clave de servicio) las usa.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import DATA from "../_shared/temporadas.json" with { type: "json" };

type Item = [string, string, number];
type Offer = Record<string, { shown: Item[]; total: number }>;
type Roll = { i: number; n: number; year: string; offer: Offer; used: boolean };
type Pick = { n: string; y: string; r: number; auto?: boolean };

const SLOTS = ["piloto", "coche", "motor", "jefe", "estratega"];
const MAX_PLAYERS = 22;
const MAX_REROLLS = 2;
const BUILD_MS = 3 * 60 * 1000;     // tiempo para armar
const RACE_DELAY_MS = 15 * 1000;    // de cierre a largada (qualy + cuenta regresiva)
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const COLORS = ["#ff3b30", "#2fd27a", "#4fc3f7", "#ffd23f", "#b26bff", "#ff9800", "#f06292", "#26a69a",
  "#cddc39", "#90a4ae", "#5c6bc0", "#e57373", "#64b5f6", "#81c784", "#ba68c8", "#ffb74d", "#80cbc4",
  "#8d6e63", "#3949ab", "#f44336", "#29b6f6", "#d32f2f"];
const WORDS = ["MONZA", "SPA", "SUZUKA", "IMOLA", "MONACO", "SENNA", "LAUDA", "FANGIO", "CLARK", "PROST",
  "PIQUET", "INTERLAGOS", "SILVER", "EAU-ROUGE", "TARZAN", "PARABOLICA"];
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ALLOWED_ORIGINS = ["https://boxf1box.com", "https://www.boxf1box.com", "https://npo17.github.io",
  "http://localhost:5173", "http://127.0.0.1:5173"];

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// ---------- utilidades ----------
const enc = new TextEncoder();
async function sha256Hex(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function seedOf(...parts: (string | number)[]) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(parts.join("|"))));
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randU32() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
function randStr(len: number) {
  const v = crypto.getRandomValues(new Uint8Array(len));
  return [...v].map((x) => ALPHABET[x % ALPHABET.length]).join("");
}
function cleanName(s: unknown) {
  return String(s ?? "").replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) || "Piloto";
}
class Fail extends Error { constructor(msg: string, public status = 400) { super(msg); } }

// Misma regla de rareza que el modo solo: las piezas top aparecen menos.
function makeOffer(rng: () => number, year: string): Offer {
  const season = (DATA as Record<string, Record<string, Item[]>>)[year];
  const o: Offer = {};
  for (const k of SLOTS) {
    const all = season[k];
    let shown = all.filter((it) => rng() < (it[2] >= 97 ? 0.3 : it[2] >= 93 ? 0.5 : it[2] >= 88 ? 0.75 : 1));
    if (shown.length < 2) {
      const rest = all.filter((it) => !shown.includes(it)).sort((a, b) => a[2] - b[2]);
      shown = shown.concat(rest.slice(0, 2 - shown.length));
    }
    o[k] = { shown: shown.sort((a, b) => b[2] - a[2]), total: all.length };
  }
  return o;
}
// Tirada i (0..4). n = número de re-sorteo. La base es igual para toda la sala;
// los re-sorteos son propios de cada jugador.
async function rollFor(diceSeed: string, pid: string, i: number, n: number) {
  const rng = mulberry32(n === 0 ? await seedOf(diceSeed, "tirada", i) : await seedOf(diceSeed, pid, i, n));
  const years = Object.keys(DATA).sort();
  const year = years[Math.floor(rng() * years.length)];
  return { i, n, year, offer: makeOffer(rng, year), used: false } as Roll;
}

// ---------- acceso a datos ----------
async function getRoom(code: string) {
  const { data, error } = await db.from("salas").select("*").eq("code", code).maybeSingle();
  if (error) throw new Fail("Error leyendo la sala", 500);
  if (!data) throw new Fail("No existe esa sala. Revisa el código.", 404);
  if (Date.now() - Date.parse(data.created_at) > ROOM_TTL_MS) throw new Fail("Esa sala ya expiró.", 410);
  return data;
}
async function getPlayers(code: string) {
  const { data, error } = await db.from("jugadores").select("*").eq("sala", code).order("joined_at");
  if (error) throw new Fail("Error leyendo jugadores", 500);
  return data ?? [];
}
async function auth(code: string, pid: string, secret: string) {
  const { data } = await db.from("jugadores").select("*").eq("sala", code).eq("pid", String(pid ?? "")).maybeSingle();
  if (!data || data.secret_hash !== (await sha256Hex(String(secret ?? "")))) throw new Fail("No estás en esta sala.", 403);
  return data;
}
async function newPlayer(code: string, name: string, color: string) {
  const pid = randStr(10), secret = crypto.randomUUID() + randStr(8);
  const { error } = await db.from("jugadores").insert({ sala: code, pid, secret_hash: await sha256Hex(secret), name, color });
  if (error) throw new Fail("No se pudo entrar a la sala", 500);
  return { pid, secret };
}

// Cierre del armado: completa autos incompletos y pasa a carrera. Idempotente.
async function maybeLock(room: Record<string, any>) {
  if (room.status !== "building") return room;
  const players = await getPlayers(room.code);
  const expired = room.deadline && Date.now() >= Date.parse(room.deadline);
  if (!expired && !(players.length && players.every((p) => p.done))) return room;
  for (const p of players) {
    if (p.done) continue;
    const picks: Record<string, Pick> = { ...p.picks };
    let i = Object.keys(picks).length;
    for (const slot of SLOTS) {
      if (picks[slot]) continue;
      const roll = await rollFor(room.dice_seed, p.pid, i++, 0);
      const worst = roll.offer[slot].shown.reduce((a, b) => (b[2] < a[2] ? b : a));
      picks[slot] = { n: worst[0], y: roll.year, r: worst[2], auto: true };
    }
    await db.from("jugadores").update({ picks, done: true }).eq("sala", room.code).eq("pid", p.pid);
  }
  const race_start = new Date(Date.now() + RACE_DELAY_MS).toISOString();
  const { data } = await db.from("salas").update({ status: "racing", race_start })
    .eq("code", room.code).eq("status", "building").select("*").maybeSingle();
  return data ?? (await getRoom(room.code));
}

async function stateFor(room: Record<string, any>, me: Record<string, any> | null) {
  const players = await getPlayers(room.code);
  const racing = room.status === "racing";
  const current = me ? (me.rolls as Roll[]).find((r) => !r.used) ?? null : null;
  return {
    now: Date.now(),
    room: {
      code: room.code, status: room.status, host: room.host,
      deadline: room.deadline, race_start: room.race_start,
      dice_hash: room.dice_hash, race_hash: room.race_hash,
      race_seed: racing ? room.race_seed : null,
      dice_seed: racing ? room.dice_seed : null,
    },
    players: players.map((p) => ({
      pid: p.pid, name: p.name, color: p.color, done: p.done,
      filled: Object.keys(p.picks).length,
      picks: racing ? p.picks : undefined,          // ocultas hasta la largada
    })),
    me: me ? { pid: me.pid, picks: me.picks, rerolls: me.rerolls, current } : null,
  };
}

// ---------- acciones ----------
async function handle(body: Record<string, any>) {
  const action = String(body.action ?? "");
  const code = String(body.code ?? "").toUpperCase().trim();

  if (action === "create") {
    // limpieza perezosa de salas viejas
    await db.from("salas").delete().lt("created_at", new Date(Date.now() - ROOM_TTL_MS).toISOString());
    const dice_seed = String(randU32()), race_seed = String(randU32());
    let newCode = "";
    for (let t = 0; t < 5 && !newCode; t++) {
      const c = `${WORDS[randU32() % WORDS.length]}-${randStr(3)}`;
      const { error } = await db.from("salas").insert({
        code: c, host: "pendiente", dice_seed, race_seed,
        dice_hash: await sha256Hex(dice_seed), race_hash: await sha256Hex(race_seed),
      });
      if (!error) newCode = c;
    }
    if (!newCode) throw new Fail("No se pudo crear la sala, prueba de nuevo.", 500);
    const p = await newPlayer(newCode, cleanName(body.name), COLORS[0]);
    await db.from("salas").update({ host: p.pid }).eq("code", newCode);
    const room = await getRoom(newCode);
    return { ...p, ...(await stateFor(room, await auth(newCode, p.pid, p.secret))) };
  }

  if (action === "join") {
    const room = await getRoom(code);
    if (room.status !== "lobby") throw new Fail("La carrera de esa sala ya empezó.", 409);
    const players = await getPlayers(code);
    if (players.length >= MAX_PLAYERS) throw new Fail("La sala está llena (22 autos).", 409);
    const used = new Set(players.map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[players.length % COLORS.length];
    const p = await newPlayer(code, cleanName(body.name), color);
    return { ...p, ...(await stateFor(room, await auth(code, p.pid, p.secret))) };
  }

  const me = await auth(code, body.pid, body.secret);
  let room = await getRoom(code);

  if (action === "state") {
    room = await maybeLock(room);
    return await stateFor(room, await auth(code, body.pid, body.secret));
  }

  if (action === "start") {
    if (room.host !== me.pid) throw new Fail("Solo quien creó la sala puede largar.", 403);
    if (room.status !== "lobby") throw new Fail("La sala ya empezó.", 409);
    const deadline = new Date(Date.now() + BUILD_MS).toISOString();
    await db.from("salas").update({ status: "building", deadline }).eq("code", code).eq("status", "lobby");
    return await stateFor(await getRoom(code), me);
  }

  if (action === "roll") {
    if (room.status !== "building") throw new Fail("Ahora no se puede tirar.", 409);
    if (me.done) throw new Fail("Tu auto ya está completo.", 409);
    const rolls = me.rolls as Roll[];
    const open = rolls.find((r) => !r.used);
    const i = Object.keys(me.picks).length;
    let rerolls = me.rerolls;
    let roll: Roll;
    if (open && !body.reroll) {
      roll = open;                                   // ya tiene una tirada sin usar: se la devuelve
    } else if (open && body.reroll) {
      if (rerolls >= MAX_REROLLS) throw new Fail("No te quedan re-sorteos.", 409);
      rerolls++;
      roll = await rollFor(room.dice_seed, me.pid, i, open.n + 1);
      open.used = true;                              // la tirada anterior se descarta
      rolls.push(roll);
    } else {
      roll = await rollFor(room.dice_seed, me.pid, i, 0);
      rolls.push(roll);
    }
    await db.from("jugadores").update({ rolls, rerolls }).eq("sala", code).eq("pid", me.pid);
    return { roll, rerolls };
  }

  if (action === "pick") {
    if (room.status !== "building") throw new Fail("El armado ya cerró.", 409);
    const slot = String(body.slot ?? ""), idx = Number(body.idx);
    if (!SLOTS.includes(slot)) throw new Fail("Casilla inválida.");
    const picks: Record<string, Pick> = { ...me.picks };
    if (picks[slot]) throw new Fail("Esa casilla ya está ocupada.", 409);
    const rolls = me.rolls as Roll[];
    const open = rolls.find((r) => !r.used);
    if (!open) throw new Fail("Primero tira el dado.", 409);
    const it = open.offer[slot]?.shown?.[idx];
    if (!it) throw new Fail("Esa pieza no salió en tu tirada.");
    picks[slot] = { n: it[0], y: open.year, r: it[2] };
    open.used = true;
    const done = SLOTS.every((s) => picks[s]);
    await db.from("jugadores").update({ picks, rolls, done }).eq("sala", code).eq("pid", me.pid);
    room = await maybeLock(room);
    return await stateFor(room, await auth(code, body.pid, body.secret));
  }

  if (action === "leave") {
    if (room.status === "lobby") await db.from("jugadores").delete().eq("sala", code).eq("pid", me.pid);
    return { ok: true };
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
    const out = await handle(body);
    return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    const status = e instanceof Fail ? e.status : 500;
    const message = e instanceof Fail ? e.message : "Error del servidor";
    if (!(e instanceof Fail)) console.error(e);
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
