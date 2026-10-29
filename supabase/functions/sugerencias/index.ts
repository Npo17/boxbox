// Edge Function "sugerencias": recibe el formulario "Sugerencias y mejoras" del sitio.
// Guarda cada envío en la tabla `sugerencias` (nunca se pierde). El aviso por mail lo manda el navegador (Web3Forms, ver index.html).
// Contra spam: máximo 5 envíos por hora y por IP, y 2000 caracteres de texto.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = ["https://boxf1box.com", "https://www.boxf1box.com", "https://npo17.github.io",
  "http://localhost:5173", "http://127.0.0.1:5173"];
const TIPOS = ["Idea o mejora", "Media injusta", "Error / bug", "Otro"];
const MAX_POR_HORA = 5;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
class Fail extends Error { constructor(msg: string, public status = 400) { super(msg); } }

async function sha(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("boxbox|" + s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function userId(req: Request): Promise<string | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/i);
  if (!m) return null;
  const { data, error } = await db.auth.getUser(m[1]);
  return error || !data.user ? null : data.user.id;
}

async function handle(req: Request, body: any) {
  const tipo = TIPOS.includes(body.tipo) ? body.tipo : "Otro";
  const texto = String(body.texto ?? "").trim().slice(0, 2000);
  const mail = String(body.email ?? "").trim().slice(0, 254);
  if (texto.length < 3) throw new Fail("Escribe tu idea primero.");
  if (mail && !EMAIL_RE.test(mail)) throw new Fail("Ese email no parece válido.");

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "?";
  const ip_hash = await sha(ip);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("sugerencias").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since);
  if ((count ?? 0) >= MAX_POR_HORA) throw new Fail("Mandaste varias seguidas. Prueba de nuevo en un rato.", 429);

  const uid = await userId(req);
  const { error } = await db.from("sugerencias").insert({ tipo, texto, email: mail || null, user_id: uid, ip_hash });
  if (error) throw error;

  return { ok: true };
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
    return new Response(JSON.stringify({ error: e instanceof Fail ? e.message : "Error del servidor" }),
      { status, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
