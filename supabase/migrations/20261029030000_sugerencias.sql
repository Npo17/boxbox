-- Sugerencias del formulario del sitio. RLS sin políticas: solo la Edge Function "sugerencias" (clave de servicio) escribe y lee.

create table if not exists public.sugerencias (
  id         bigint generated always as identity primary key,
  tipo       text not null,
  texto      text not null check (char_length(texto) between 3 and 2000),
  email      text,
  user_id    uuid references auth.users(id) on delete set null,
  ip_hash    text,
  enviada    boolean not null default false,   -- true si el aviso por mail salió bien
  created_at timestamptz not null default now()
);
create index if not exists sugerencias_ip_idx on public.sugerencias (ip_hash, created_at desc);

alter table public.sugerencias enable row level security;
revoke all on public.sugerencias from anon, authenticated;
grant select, insert, update, delete on public.sugerencias to service_role;
