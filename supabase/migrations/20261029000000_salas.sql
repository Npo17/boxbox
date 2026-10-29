-- Salas con amigos (BoxBox)
-- Seguridad: RLS activado y SIN políticas. Ningún navegador puede leer ni escribir
-- estas tablas directamente; solo la Edge Function "sala" (con la clave de servicio).
-- Así las semillas secretas y los autos de los demás quedan ocultos hasta la largada.

create table if not exists public.salas (
  code        text primary key,
  host        text not null,
  status      text not null default 'lobby' check (status in ('lobby','building','racing')),
  dice_seed   text not null,              -- secreta: decide los años y ofertas de cada tirada
  race_seed   text not null,              -- secreta hasta el cierre: circuito, qualy y carrera
  dice_hash   text not null,              -- sha256 publicado para poder verificar al final
  race_hash   text not null,
  deadline    timestamptz,
  race_start  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.jugadores (
  sala        text not null references public.salas(code) on delete cascade,
  pid         text not null,
  secret_hash text not null,
  name        text not null,
  color       text not null,
  joined_at   timestamptz not null default now(),
  rolls       jsonb not null default '[]'::jsonb,
  picks       jsonb not null default '{}'::jsonb,
  rerolls     int  not null default 0,
  done        boolean not null default false,
  primary key (sala, pid)
);

create index if not exists salas_created_at_idx on public.salas (created_at);

alter table public.salas     enable row level security;
alter table public.jugadores enable row level security;

revoke all on public.salas     from anon, authenticated;
revoke all on public.jugadores from anon, authenticated;

-- Solo el rol del servidor (usado por la Edge Function) puede operar sobre las tablas.
grant select, insert, update, delete on public.salas     to service_role;
grant select, insert, update, delete on public.jugadores to service_role;
