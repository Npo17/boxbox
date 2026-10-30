-- La tabla de eventos la usa solo el servidor (función con la clave de servicio): se le dan los permisos que faltaban.
grant select, insert, delete on public.eventos to service_role;
