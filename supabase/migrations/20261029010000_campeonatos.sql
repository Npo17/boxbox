-- Campeonato de pilotos guardado en la cuenta (login con Google).
-- Cada usuario solo puede leer y escribir SU fila (RLS con auth.uid()).

create table if not exists public.campeonatos (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  campeonato jsonb not null default '{}'::jsonb,   -- puntos, carreras y victorias por piloto
  stats      jsonb not null default '{}'::jsonb,   -- carreras, victorias, podios, mejor resultado
  historial  jsonb not null default '[]'::jsonb,   -- campeonatos anteriores
  updated_at timestamptz not null default now()
);

alter table public.campeonatos enable row level security;

drop policy if exists "leer el propio" on public.campeonatos;
drop policy if exists "crear el propio" on public.campeonatos;
drop policy if exists "editar el propio" on public.campeonatos;
create policy "leer el propio"   on public.campeonatos for select to authenticated using ((select auth.uid()) = user_id);
create policy "crear el propio"  on public.campeonatos for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "editar el propio" on public.campeonatos for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.campeonatos from anon;
grant select, insert, update on public.campeonatos to authenticated;
grant select, insert, update, delete on public.campeonatos to service_role;
