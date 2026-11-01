drop function if exists public.panel_resumen(int);
alter function public.panel_resumen_base(int) rename to panel_resumen;
drop function if exists public.panel_rendimiento(int);
