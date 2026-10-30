// Edge Function "amigos": lista de amigos de BoxBox.
//
// - Hace falta iniciar sesión (Google) y tener un apodo (el mismo del ranking del desafío del día).
// - Pedido de amistad -> el otro acepta o rechaza. Si los dos se piden a la vez, quedan amigos.
// - El perfil completo (estadísticas y trofeos) solo lo ven los amigos; cualquiera ve el apodo y si ya son amigos.
// - Quién está conectado y las invitaciones a una sala viajan por Supabase Realtime (en el navegador), no pasan por acá.
//
// La tabla amistades tiene RLS sin políticas: solo esta función (clave de servicio) la usa.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = ["https://boxf1box.com", "https://www.boxf1box.com", "https://npo17.github.io",
  "http://localhost:5173", "http://127.0.0.1:5173"];
const NICK_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const MAX_AMIGOS = 100, MAX_ENVIADAS = 30;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
class Fail extends Error { constructor(msg: string, public status = 400, public code?: string) { super(msg); } }

async function userFrom(req: Request): Promise<{ id: string } | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/i);
  if (!m) return null;
  const { data, error } = await db.auth.getUser(m[1]);
  return error || !data.user ? null : { id: data.user.id };
}

async function nicks(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db.from("perfiles").select("user_id,nickname").in("user_id", ids);
  return new Map((data ?? []).map((p: any) => [p.user_id, p.nickname]));
}

async function lista(uid: string) {
  const [{ data: mias }, { data: recibidas }] = await Promise.all([
    db.from("amistades").select("amigo_id,estado").eq("user_id", uid),
    db.from("amistades").select("user_id").eq("amigo_id", uid).eq("estado", "pendiente"),
  ]);
  const amigos = (mias ?? []).filter((r: any) => r.estado === "aceptada").map((r: any) => r.amigo_id);
  const enviadas = (mias ?? []).filter((r: any) => r.estado === "pendiente").map((r: any) => r.amigo_id);
  const entran = (recibidas ?? []).map((r: any) => r.user_id);
  const nk = await nicks([uid, ...amigos, ...enviadas, ...entran]);
  const f = (id: string) => ({ uid: id, nick: nk.get(id) ?? "Piloto" });
  return { uid, nick: nk.get(uid) ?? null, amigos: amigos.map(f).sort((a, b) => a.nick.localeCompare(b.nick)), recibidas: entran.map(f), enviadas: enviadas.map(f) };
}

async function relacion(yo: string, otro: string): Promise<"amigo" | "enviada" | "recibida" | "ninguna"> {
  const { data } = await db.from("amistades").select("user_id,amigo_id,estado")
    .or(`and(user_id.eq.${yo},amigo_id.eq.${otro}),and(user_id.eq.${otro},amigo_id.eq.${yo})`);
  const rows = data ?? [];
  if (rows.some((r: any) => r.user_id === yo && r.estado === "aceptada")) return "amigo";
  if (rows.some((r: any) => r.user_id === yo)) return "enviada";
  if (rows.some((r: any) => r.user_id === otro)) return "recibida";
  return "ninguna";
}

async function resolver(body: any): Promise<string> {
  if (body.uid) {
    const uid = String(body.uid);
    if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Fail("Jugador inválido.");
    return uid;
  }
  const nick = String(body.nick ?? "").trim();
  if (!NICK_RE.test(nick)) throw new Fail("Escribí el apodo completo (3 a 16 letras, números, punto, guion o guion bajo).");
  const { data } = await db.from("perfiles").select("user_id").ilike("nickname", nick).maybeSingle();
  if (!data) throw new Fail("No encontramos a nadie con ese apodo.", 404);
  return data.user_id;
}

async function handle(req: Request, body: any) {
  const user = await userFrom(req);
  if (!user) throw new Fail("Inicia sesión con Google para usar amigos.", 401, "login");
  const me = user.id, action = String(body.action ?? "");

  if (action === "yo") return await lista(me);

  if (action === "nick") {
    const nick = String(body.nickname ?? "").trim();
    if (!NICK_RE.test(nick)) throw new Fail("El apodo debe tener entre 3 y 16 letras, números, punto, guion o guion bajo.", 400, "nick");
    const { error } = await db.from("perfiles").upsert({ user_id: me, nickname: nick });
    if (error) throw new Fail(error.code === "23505" ? "Ese apodo ya lo usa otra persona." : "No se pudo guardar el apodo.", error.code === "23505" ? 409 : 500, "nick");
    return await lista(me);
  }

  // para todo lo demás hace falta apodo: así el otro sabe quién le escribe
  const [mi] = await Promise.all([nicks([me])]);
  if (!mi.get(me)) throw new Fail("Primero elegí tu apodo.", 409, "nick");

  if (action === "solicitar") {
    const otro = await resolver(body);
    if (otro === me) throw new Fail("Ese eres tú.");
    const { data: existe } = await db.auth.admin.getUserById(otro);
    if (!existe?.user) throw new Fail("No encontramos a ese jugador.", 404);
    const rel = await relacion(me, otro);
    if (rel === "amigo" || rel === "enviada") return await lista(me);
    if (rel === "recibida") {                                           // los dos se pidieron: quedan amigos
      await db.from("amistades").update({ estado: "aceptada" }).eq("user_id", otro).eq("amigo_id", me);
      await db.from("amistades").upsert({ user_id: me, amigo_id: otro, estado: "aceptada" });
      return await lista(me);
    }
    const [{ count: n }, { count: e }] = await Promise.all([
      db.from("amistades").select("amigo_id", { count: "exact", head: true }).eq("user_id", me).eq("estado", "aceptada"),
      db.from("amistades").select("amigo_id", { count: "exact", head: true }).eq("user_id", me).eq("estado", "pendiente"),
    ]);
    if ((n ?? 0) >= MAX_AMIGOS) throw new Fail("Llegaste al máximo de amigos.");
    if ((e ?? 0) >= MAX_ENVIADAS) throw new Fail("Tenés muchos pedidos sin responder. Esperá a que contesten.");
    await db.from("amistades").upsert({ user_id: me, amigo_id: otro, estado: "pendiente" });
    return await lista(me);
  }

  if (action === "responder") {
    const otro = await resolver(body);
    const { data: fila } = await db.from("amistades").select("estado").eq("user_id", otro).eq("amigo_id", me).eq("estado", "pendiente").maybeSingle();
    if (!fila) throw new Fail("Ese pedido ya no existe.", 404);
    if (body.aceptar) {
      await db.from("amistades").update({ estado: "aceptada" }).eq("user_id", otro).eq("amigo_id", me);
      await db.from("amistades").upsert({ user_id: me, amigo_id: otro, estado: "aceptada" });
    } else await db.from("amistades").delete().eq("user_id", otro).eq("amigo_id", me);
    return await lista(me);
  }

  if (action === "quitar") {
    const otro = await resolver(body);
    await db.from("amistades").delete().or(`and(user_id.eq.${me},amigo_id.eq.${otro}),and(user_id.eq.${otro},amigo_id.eq.${me})`);
    return await lista(me);
  }

  if (action === "perfil") {
    const otro = await resolver(body);
    const [rel, nk] = await Promise.all([otro === me ? Promise.resolve("amigo" as const) : relacion(me, otro), nicks([otro])]);
    const out: any = { uid: otro, nick: nk.get(otro) ?? "Piloto", relacion: otro === me ? "yo" : rel };
    if (rel === "amigo") {
      const { data } = await db.from("campeonatos").select("stats,trofeos,historial").eq("user_id", otro).maybeSingle();
      out.stats = data?.stats ?? { races: 0, wins: 0, podiums: 0, best: null };
      out.trofeos = (data?.trofeos ?? []).slice(0, 20);
      out.historial = (data?.historial ?? []).slice(0, 5);
    }
    return out;
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
