// Edge Function "eventos": recibe los eventos anónimos del recorrido (visita, empieza partida, termina carrera, comparte…).
// No guarda IP ni datos personales. Acepta lotes de hasta 40 eventos con nombres de una lista fija y datos chicos.
// Contra abuso: tope de eventos por lote y por navegador por minuto.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = ["https://boxf1box.com", "https://www.boxf1box.com", "https://npo17.github.io",
  "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5180", "http://127.0.0.1:5180"];
const NOMBRES = new Set([
  "visita", "latido", "inicio", "carrera_fin", "compartir", "sala_creada", "sala_unida", "amigo_pedido", "idioma", "fondo", "intervalo",
  "apoyo_abre", "apoyo_mp", "apoyo_kofi", "apoyo_cafecito", "red_click", "login_click", "login_ok", "sugerencias_abre", "sugerencias_envia",
  "desafio_abre", "desafio_juega", "perfil_abre", "amigos_abre", "chat_abre",
]);
const ID_RE = /^[a-z0-9]{4,24}$/;
const MAX_LOTE = 40, MAX_POR_MIN = 120;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function limpiar(d: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!d || typeof d !== "object") return out;
  for (const [k, v] of Object.entries(d as Record<string, unknown>).slice(0, 6)) {
    if (!/^[a-z_]{1,16}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 40);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405, headers: cors });
  // Solo desde el sitio (los navegadores mandan Origin; sin Origin no se acepta)
  if (!ALLOWED_ORIGINS.includes(origin)) return new Response("No permitido", { status: 403, headers: cors });
  try {
    const body = JSON.parse(await req.text());
    const lista = Array.isArray(body?.ev) ? body.ev.slice(0, MAX_LOTE) : [];
    const filas: { aid: string; sesion: string; evento: string; datos: Record<string, unknown> }[] = [];
    for (const x of lista) {
      if (!x || !NOMBRES.has(x.e) || !ID_RE.test(String(x.a)) || !ID_RE.test(String(x.s))) continue;
      filas.push({ aid: String(x.a), sesion: String(x.s), evento: x.e, datos: limpiar(x.d) });
    }
    if (filas.length) {
      // tope por navegador y minuto (cuenta lo ya guardado)
      const { count } = await db.from("eventos").select("id", { count: "exact", head: true }).eq("aid", filas[0].aid).gte("creado", new Date(Date.now() - 60_000).toISOString());
      if ((count ?? 0) + filas.length <= MAX_POR_MIN) {
        const { error } = await db.from("eventos").insert(filas);
        if (error) console.error("eventos insert", error.message);
      }
      if (Math.random() < 0.01) await db.rpc("eventos_limpiar");   // limpieza ocasional de lo viejo
    }
    return new Response(null, { status: 204, headers: cors });
  } catch (e) {
    console.error("eventos", e);
    return new Response(null, { status: 204, headers: cors });   // nunca romper el juego por la medición
  }
});
