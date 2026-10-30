-- Vuelta atrás del calendario a medida: las salas que lo usen pasan a la temporada completa.
alter table public.salas drop column if exists calendario;
