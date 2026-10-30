-- Vuelta atrás de la medición anónima: borra la tabla de eventos y sus funciones.
drop function if exists public.panel_resumen(int);
drop function if exists public.eventos_limpiar();
drop table if exists public.eventos;
