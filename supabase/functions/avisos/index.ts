// Edge Function "avisos": manda el mail "ya está el desafío del día" a quienes lo pidieron.
//
// - POST con el encabezado x-cron-key (lo llama pg_cron una vez por día): manda el aviso a todos los que lo tienen
//   activado y todavía no jugaron hoy. Nunca dos veces el mismo día (columna "ultimo").
// - GET ?baja=<token>: el link del mail para no recibir más avisos, sin iniciar sesión.
// Los mails salen por Resend (RESEND_API_KEY). Sin esa clave no manda nada.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as E from "../_shared/engine.js";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_KEY = Deno.env.get("CRON_KEY") ?? "";
const FROM = Deno.env.get("AVISOS_FROM") ?? "BoxBox <desafio@boxf1box.com>";
const SITE = "https://boxf1box.com";
const FN_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/avisos";

const pagina = (titulo: string, txt: string) => new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BoxBox</title><body style="margin:0;background:#0b1a14;color:#f3efe2;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:16px">
<div><h1 style="font-size:24px;margin:0 0 8px">${titulo}</h1><p style="color:#9fb3a8;margin:0 0 18px">${txt}</p>
<a href="${SITE}/?desafio" style="color:#ffb31a;font-weight:700">Ir a BoxBox →</a></div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

function mail(token: string) {
  const baja = `${FN_URL}?baja=${token}`;
  return {
    subject: "🏁 Ya está el desafío del día",
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1a14"><tr><td align="center" style="padding:28px 16px;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px"><tr><td style="background:#111;border:2px solid #ffb31a;border-radius:14px;padding:24px;color:#f3efe2;text-align:left">
    <div style="letter-spacing:3px;font-size:11px;color:#7fa08f;text-transform:uppercase">Desafío del día</div>
    <h1 style="font-size:26px;margin:6px 0 10px;text-transform:uppercase;color:#f3efe2">Hay mano nueva</h1>
    <p style="color:#c9d6cf;margin:0 0 18px">La misma mano para todos, sin ver las medias. Arma tu auto, corre y mira dónde quedas en el ranking. Si jugaste ayer, no cortes la racha.</p>
    <a href="${SITE}/?desafio" style="display:inline-block;background:#ffb31a;color:#111;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Jugar el desafío →</a>
  </td></tr>
  <tr><td align="center" style="padding-top:14px;font-size:12px;color:#7fa08f">Te llega porque lo activaste en BoxBox. <a href="${baja}" style="color:#7fa08f">No quiero más avisos</a></td></tr></table>
</td></tr></table>`,
    text: `Ya está el desafío del día de BoxBox. Jugalo en ${SITE}/?desafio\n\nNo quiero más avisos: ${baja}`,
    headers: { "List-Unsubscribe": `<${baja}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

async function mandarTodos() {
  if (!RESEND) return { error: "Falta RESEND_API_KEY" };
  const hoy = E.dayKey();
  const { data: subs } = await db.from("avisos").select("user_id,email,token,ultimo").eq("activo", true).limit(5000);
  const pend = (subs ?? []).filter((s: any) => String(s.ultimo ?? "") !== hoy);
  if (!pend.length) return { enviados: 0 };
  // los que ya jugaron hoy no necesitan el aviso
  const { data: jugaron } = await db.from("desafios").select("user_id").eq("day", hoy).in("user_id", pend.map((s: any) => s.user_id));
  const ya = new Set((jugaron ?? []).map((r: any) => r.user_id));
  const lista = pend.filter((s: any) => !ya.has(s.user_id));
  let enviados = 0;
  for (let i = 0; i < lista.length; i += 100) {          // Resend acepta hasta 100 por pedido
    const lote = lista.slice(i, i + 100);
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST", headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
      body: JSON.stringify(lote.map((s: any) => ({ from: FROM, to: [s.email], ...mail(s.token) }))),
    });
    if (!r.ok) { console.error("Resend", r.status, await r.text()); break; }
    await db.from("avisos").update({ ultimo: hoy }).in("user_id", lote.map((s: any) => s.user_id));
    enviados += lote.length;
  }
  return { enviados, yaJugaron: ya.size };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const baja = url.searchParams.get("baja");
  if (baja) {
    if (/^[0-9a-f-]{36}$/i.test(baja)) await db.from("avisos").update({ activo: false, updated_at: new Date().toISOString() }).eq("token", baja);
    return pagina("Listo", "No te vamos a mandar más avisos del desafío. Puedes volver a activarlos desde el desafío del día.");
  }
  if (req.method === "POST" && CRON_KEY && req.headers.get("x-cron-key") === CRON_KEY) {
    return new Response(JSON.stringify(await mandarTodos()), { headers: { "Content-Type": "application/json" } });
  }
  return new Response("No", { status: 403 });
});
