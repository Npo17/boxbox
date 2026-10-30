// Edge Function "panel": entrega el resumen de métricas SOLO a quien tenga la clave secreta (PANEL_KEY).
// La usa el panel privado local (no está en la web). Sin la clave devuelve 401 y no revela nada.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("PANEL_KEY") ?? "";

// comparación de tiempo constante
function igual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  const k = req.headers.get("x-panel-key") ?? "";
  if (KEY.length < 24 || !igual(k, KEY)) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const body = await req.json().catch(() => ({}));
  const dias = Math.max(1, Math.min(90, Number(body?.dias) || 7));
  const { data, error } = await db.rpc("panel_resumen", { dias });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
