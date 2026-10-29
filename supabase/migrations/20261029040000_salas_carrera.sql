-- Salas en modo carrera: calendario 2026 fecha por fecha, con puntos acumulados por jugador.
alter table public.salas
  add column if not exists modo    text    not null default 'normal' check (modo in ('normal','carrera')),
  add column if not exists ronda   int     not null default 0,        -- índice del evento actual (sprint o GP) del calendario
  add column if not exists puntos  jsonb   not null default '{}'::jsonb,  -- pid -> puntos acumulados
  add column if not exists ultimo  jsonb,                                 -- pid -> {pos, dnf, pts} de la última carrera ya contada
  add column if not exists cerrada boolean not null default false;        -- true cuando ya se sumaron los puntos de la carrera actual
