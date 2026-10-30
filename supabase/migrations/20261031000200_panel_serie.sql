-- Panel: suma la serie en el tiempo (por hora o por día) y los últimos eventos, para el tablero tipo Kibana.
create or replace function public.panel_resumen(dias int default 7) returns jsonb
language sql security definer set search_path = public as $$
with ev as (
  select e.*, (e.creado at time zone 'America/Argentina/Buenos_Aires')::date as dia,
    date_trunc(case when dias <= 2 then 'hour' else 'day' end, e.creado at time zone 'America/Argentina/Buenos_Aires') as bucket
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
  'periodo', (select jsonb_build_object('visitantes', count(distinct aid), 'visitas', count(*) filter (where evento = 'visita')) from ev),
  'recurrentes', (select count(*) from (select aid from ev group by aid having count(distinct dia) > 1) t),
  'por_dia', (select coalesce(jsonb_agg(x order by x->>'dia'), '[]'::jsonb) from (
      select jsonb_build_object('dia', dia, 'visitantes', count(distinct aid), 'visitas', count(*) filter (where evento = 'visita'),
        'inicio', count(distinct aid) filter (where evento = 'inicio'), 'fin', count(distinct aid) filter (where evento = 'carrera_fin'),
        'compartio', count(distinct aid) filter (where evento = 'compartir')) x
      from ev group by dia) t),
  'serie', (select coalesce(jsonb_agg(x order by x->>'t'), '[]'::jsonb) from (
      select jsonb_build_object('t', to_char(bucket, 'YYYY-MM-DD"T"HH24:MI'), 'visitantes', count(distinct aid),
        'inicio', count(*) filter (where evento = 'inicio'), 'fin', count(*) filter (where evento = 'carrera_fin'),
        'compartir', count(*) filter (where evento = 'compartir'), 'salas', count(*) filter (where evento in ('sala_creada', 'sala_unida'))) x
      from ev group by bucket) t),
  'tipos', (select coalesce(jsonb_agg(jsonb_build_object('e', evento, 'n', n, 'u', u) order by n desc), '[]'::jsonb) from (
      select evento, count(*) n, count(distinct aid) u from ev where evento <> 'latido' group by evento) t),
  'desglose', (select coalesce(jsonb_agg(jsonb_build_object('e', evento, 'k', k, 'v', v, 'n', n, 'u', u) order by n desc), '[]'::jsonb) from (
      select evento, d.key k, left(d.value, 40) v, count(*) n, count(distinct aid) u
      from ev, jsonb_each_text(ev.datos) d where evento <> 'latido' and d.key <> 'test' group by 1, 2, 3) t),
  'recientes', (select coalesce(jsonb_agg(jsonb_build_object('t', to_char(creado at time zone 'America/Argentina/Buenos_Aires', 'MM-DD HH24:MI:SS'),
        'e', evento, 'd', datos, 'a', left(aid, 6)) order by creado desc), '[]'::jsonb)
      from (select * from ev where evento <> 'latido' order by creado desc limit 40) r)
);
$$;
revoke all on function public.panel_resumen(int) from public, anon, authenticated;
grant execute on function public.panel_resumen(int) to service_role;
