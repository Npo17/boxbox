-- Panel: velocidad real de las visitas (evento "rendimiento"): percentiles de LCP, CLS, INP y TTFB, con cuántas cargas hay detrás,
-- en total, por celular/compu y por hora o día. Se agrega al resumen existente sin reescribirlo.
create or replace function public.panel_rendimiento(dias int default 7) returns jsonb
language sql security definer set search_path = public as $$
with r as (
  select (e.datos->>'lcp')::numeric lcp, (e.datos->>'cls')::numeric cls, (e.datos->>'inp')::numeric inp, (e.datos->>'ttfb')::numeric ttfb,
    coalesce(e.datos->>'movil','') = 'true' movil,
    date_trunc(case when dias <= 2 then 'hour' else 'day' end, e.creado at time zone 'America/Argentina/Buenos_Aires') bucket
  from public.eventos e
  where e.evento = 'rendimiento' and e.creado >= now() - make_interval(days => greatest(1, least(dias, 90)))
    and coalesce(e.datos->>'test','') <> '1' and (e.datos->>'lcp') ~ '^[0-9]+$'
), q as (
  select movil, count(*) n,
    percentile_cont(0.5) within group (order by lcp) lcp50, percentile_cont(0.75) within group (order by lcp) lcp75,
    percentile_cont(0.9) within group (order by lcp) lcp90, percentile_cont(0.75) within group (order by cls) cls75,
    percentile_cont(0.75) within group (order by inp) inp75, percentile_cont(0.75) within group (order by ttfb) ttfb75,
    count(*) filter (where lcp <= 2500) lcp_bien
  from r group by grouping sets ((), (movil))
)
select jsonb_build_object(
  'total', (select to_jsonb(q) - 'movil' from q where movil is null and n > 0 limit 1),
  'celular', (select to_jsonb(q) - 'movil' from q where movil is true limit 1),
  'compu', (select to_jsonb(q) - 'movil' from q where movil is false limit 1),
  'serie', (select coalesce(jsonb_agg(x order by x->>'t'), '[]'::jsonb) from (
      select jsonb_build_object('t', to_char(bucket, 'YYYY-MM-DD"T"HH24:MI'), 'n', count(*),
        'lcp75', percentile_cont(0.75) within group (order by lcp), 'lcp90', percentile_cont(0.9) within group (order by lcp)) x
      from r group by bucket) t)
);
$$;
revoke all on function public.panel_rendimiento(int) from public, anon, authenticated;
grant execute on function public.panel_rendimiento(int) to service_role;

-- el resumen de siempre + la velocidad (la edge function "panel" no cambia)
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'panel_resumen_base') then
    alter function public.panel_resumen(int) rename to panel_resumen_base;
  end if;
end $$;
create or replace function public.panel_resumen(dias int default 7) returns jsonb
language sql security definer set search_path = public as $$
  select public.panel_resumen_base(dias) || jsonb_build_object('rendimiento', public.panel_rendimiento(dias));
$$;
revoke all on function public.panel_resumen_base(int) from public, anon, authenticated;
grant execute on function public.panel_resumen_base(int) to service_role;
revoke all on function public.panel_resumen(int) from public, anon, authenticated;
grant execute on function public.panel_resumen(int) to service_role;
