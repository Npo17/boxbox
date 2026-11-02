-- Desafío del día: archivo de días anteriores y aviso por mail.

-- Cuántos jugaron cada día (para la lista "Desafíos anteriores"). Solo la usa la función "diario".
create or replace function public.diario_archivo()
returns table (day date, total bigint)
language sql stable security definer set search_path = public as $$
  select d.day, count(*) from public.desafios d where d.status = 'listo' group by d.day order by d.day desc limit 400
$$;
revoke all on function public.diario_archivo() from public, anon, authenticated;
grant execute on function public.diario_archivo() to service_role;

-- Quién pidió el aviso por mail cuando sale el desafío. Solo cuentas de Google (las de apodo no tienen mail).
-- token: para darse de baja desde el link del mail sin iniciar sesión.
create table if not exists public.avisos (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  activo     boolean not null default true,
  token      uuid not null default gen_random_uuid(),
  ultimo     date,                                   -- último día que se le mandó (para no mandar dos veces)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists avisos_token_uq on public.avisos (token);
alter table public.avisos enable row level security;
revoke all on public.avisos from anon, authenticated;
grant select, insert, update, delete on public.avisos to service_role;
