-- Salas públicas: cualquiera las ve en una lista y se puede unir sin código.
alter table public.salas add column if not exists publica boolean not null default false;
create index if not exists salas_publicas_idx on public.salas (created_at desc) where publica and status = 'lobby';
