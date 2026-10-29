-- Desafío del día: perfiles (apodo para el ranking) y una partida por usuario y día.
-- Seguridad: RLS activado y SIN políticas. Los navegadores no pueden leer ni escribir estas tablas;
-- solo la Edge Function "diario" (con la clave de servicio), que valida cada paso y calcula el resultado.

create table if not exists public.perfiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null check (nickname ~ '^[A-Za-z0-9_.-]{3,16}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists perfiles_nickname_uq on public.perfiles (lower(nickname));

create table if not exists public.desafios (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,                       -- día en horario de Argentina
  status     text not null default 'armando' check (status in ('armando','corriendo','listo')),
  rolls      jsonb not null default '[]'::jsonb,  -- tiradas reveladas (con las medias, solo del lado del servidor)
  picks      jsonb not null default '{}'::jsonb,
  decision   text,                                -- qué hizo con el safety car: pit | stay
  pos        int,
  dnf        boolean,
  laps       int,
  grid       int,
  stops      int,
  pts        int,
  tiempo     numeric,
  orden      numeric,                             -- menor es mejor: se usa para el ranking
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists desafios_ranking_idx on public.desafios (day, orden) where status = 'listo';

alter table public.perfiles  enable row level security;
alter table public.desafios  enable row level security;
revoke all on public.perfiles from anon, authenticated;
revoke all on public.desafios from anon, authenticated;
grant select, insert, update, delete on public.perfiles to service_role;
grant select, insert, update, delete on public.desafios to service_role;
