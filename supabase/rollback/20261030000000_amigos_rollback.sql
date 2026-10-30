-- DESHACER la migración 20261030000000_amigos.sql (solo si hace falta dejar la base como antes).
-- OJO: borra la lista de amistades y los trofeos guardados en la cuenta. El resto del juego no depende de esto:
-- la versión anterior de la función "sala" y de la web funcionan igual con o sin estas columnas,
-- así que NO hace falta correrlo para volver atrás; es solo para limpiar.
drop table if exists public.amistades;
alter table public.jugadores   drop column if exists user_id;
alter table public.campeonatos drop column if exists trofeos;
