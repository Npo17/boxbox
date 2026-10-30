-- Amigos: quién es cada jugador de una sala (si inició sesión), trofeos en la cuenta y la lista de amistades.
-- RLS activado y SIN políticas en amistades: solo la Edge Function "amigos" (clave de servicio) la lee y escribe.

alter table public.jugadores add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.campeonatos add column if not exists trofeos jsonb not null default '[]'::jsonb;

create table if not exists public.amistades (
  user_id    uuid not null references auth.users(id) on delete cascade,   -- quien pidió (o quien tiene al amigo)
  amigo_id   uuid not null references auth.users(id) on delete cascade,
  estado     text not null check (estado in ('pendiente','aceptada')),
  created_at timestamptz not null default now(),
  primary key (user_id, amigo_id),
  check (user_id <> amigo_id)
);
create index if not exists amistades_amigo_idx on public.amistades (amigo_id);

alter table public.amistades enable row level security;
revoke all on public.amistades from anon, authenticated;
grant select, insert, update, delete on public.amistades to service_role;
