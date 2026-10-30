-- Medición anónima del recorrido en el sitio: un evento por paso (visita, empieza partida, termina carrera, comparte…).
-- Sin nombre, correo ni IP: solo un id al azar por navegador. Se borra a los 90 días. Solo el servidor (service role) lee y escribe.
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  aid text not null,
  sesion text not null,
  evento text not null,
  datos jsonb not null default '{}'::jsonb
);
create index if not exists eventos_creado_idx on public.eventos (creado);
create index if not exists eventos_evento_creado_idx on public.eventos (evento, creado);
create index if not exists eventos_aid_creado_idx on public.eventos (aid, creado);
alter table public.eventos enable row level security;   -- sin políticas: nadie con la clave pública puede leer ni escribir

-- Resumen para el panel privado (lo llama la función "panel" con la clave secreta). Días en horario de Argentina.
create or replace function public.panel_resumen(dias int default 7) returns jsonb
language sql security definer set search_path = public as $$
with ev as (
  select e.*, (e.creado at time zone 'America/Argentina/Buenos_Aires')::date as dia
  from public.eventos e
  where e.creado >= now() - make_interval(days => greatest(1, least(dias, 90)))
    and coalesce(e.datos->>'test','') <> '1'
)
select jsonb_build_object(
  'generado', now(),
  'dias', greatest(1, least(dias, 90)),
  'en_vivo', (select count(distinct aid) from public.eventos where creado >= now() - interval '2 minutes' and coalesce(datos->>'test','') <> '1'),
  'hoy', (select jsonb_build_object('visitantes', count(distinct aid), 'visitas', count(*) filter (where evento = 'visita'))
          from ev where dia = (now() at time zone 'America/Argentina/Buenos_Aires')::date),
  'recurrentes', (select count(*) from (select aid from ev group by aid having count(distinct dia) > 1) t),
  'por_dia', (select coalesce(jsonb_agg(x order by x->>'dia'), '[]'::jsonb) from (
      select jsonb_build_object('dia', dia, 'visitantes', count(distinct aid), 'visitas', count(*) filter (where evento = 'visita'),
        'inicio', count(distinct aid) filter (where evento = 'inicio'), 'fin', count(distinct aid) filter (where evento = 'carrera_fin'),
        'compartio', count(distinct aid) filter (where evento = 'compartir')) x
      from ev group by dia) t),
  'tipos', (select coalesce(jsonb_agg(jsonb_build_object('e', evento, 'n', n, 'u', u) order by n desc), '[]'::jsonb) from (
      select evento, count(*) n, count(distinct aid) u from ev where evento <> 'latido' group by evento) t),
  'desglose', (select coalesce(jsonb_agg(jsonb_build_object('e', evento, 'k', k, 'v', v, 'n', n, 'u', u) order by n desc), '[]'::jsonb) from (
      select evento, d.key k, left(d.value, 40) v, count(*) n, count(distinct aid) u
      from ev, jsonb_each_text(ev.datos) d where evento <> 'latido' and d.key <> 'test' group by 1, 2, 3) t),
  'por_hora', (select coalesce(jsonb_agg(x order by x->>'h'), '[]'::jsonb) from (
      select jsonb_build_object('h', to_char(date_trunc('hour', creado at time zone 'America/Argentina/Buenos_Aires'), 'MM-DD HH24"h"'), 'visitantes', count(distinct aid)) x
      from ev where creado >= now() - interval '24 hours' group by date_trunc('hour', creado at time zone 'America/Argentina/Buenos_Aires')) t)
);
$$;
revoke all on function public.panel_resumen(int) from public, anon, authenticated;
grant execute on function public.panel_resumen(int) to service_role;

-- Limpieza: borra lo de más de 90 días (la llama la función "eventos" de vez en cuando)
create or replace function public.eventos_limpiar() returns void
language sql security definer set search_path = public as $$
  delete from public.eventos where creado < now() - interval '90 days';
$$;
revoke all on function public.eventos_limpiar() from public, anon, authenticated;
grant execute on function public.eventos_limpiar() to service_role;
