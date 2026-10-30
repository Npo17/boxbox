-- Calendario a medida para las salas de modo carrera: lista de [lugar en el calendario 2026, 1 si lleva sprint]. null = temporada completa.
alter table public.salas add column if not exists calendario jsonb;
