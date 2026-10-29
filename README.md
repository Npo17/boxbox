# BoxBox 🏁

Tira el dado, sale una temporada de la historia del automovilismo. Elige un piloto, coche, motor, jefe de equipo o estratega de ese año, completa tu auto de 5 casillas, clasifica a una vuelta y corre un Gran Premio en un circuito real contra una parrilla de leyendas.

**Estado:** jugable en [boxf1box.com](https://boxf1box.com). Están **todos los pilotos y escuderías de 1950 a 2026**, con medias calculadas a partir de su temporada real. Motores, jefes de equipo y estrategas solo existen en las temporadas curadas a mano (1976, 1988, 1991, 2004, 2023, 2024 y 2025).

### Datos y medias

- [scripts/generar-temporadas.mjs](scripts/generar-temporadas.mjs) descarga los campeonatos de [Jolpica-F1](https://github.com/jolpica/jolpica-f1) y genera `supabase/functions/_shared/temporadas.json`.
- **Piloto:** 50% posición en el campeonato, 30% puntos respecto del líder y 20% comparación con su compañero de equipo. El campeón tiene al menos 95.
- **Coche:** posición y puntos en el campeonato de constructores (antes de 1958, el mejor piloto de la escudería).
- [scripts/temporadas-curadas.json](scripts/temporadas-curadas.json) tiene las temporadas ajustadas a mano; sus medias pisan a las calculadas.

Después de cambiar los datos: `node scripts/generar-temporadas.mjs` y volver a desplegar la función `sala`.

## Cómo se juega

1. **Tira:** sale un año. Solo ves parte de esa temporada y las piezas top aparecen poco.
2. **Arma:** elige una pieza de ese año para una casilla libre. 5 tiradas, 2 re-sorteos.
3. **Qualy:** una vuelta lanzada con dado. Tu piloto y tu auto deciden dónde largas.
4. **Carrera:** 22 autos, 20 vueltas, una parada obligatoria, radio y dirección de carrera. Un estratega malo para tarde, un piloto flojo se sale o choca, un motor flojo se rompe.
5. **Campeonato:** los 22 pilotos suman 25-18-15-12-10-8-6-4-2-1 en cada carrera que juegas.

También hay desafío del día (los mismos dados para todos ese día), perfil, tema claro u oscuro y campeonatos anteriores.

## Con amigos (salas online)

Hasta 22 jugadores, uno por auto, con código de sala o link de invitación. Todos reciben los mismos dados, tienen 3 minutos para armar y ven la misma carrera a la misma hora.

- **Servidor:** Edge Function `sala` en Supabase ([supabase/functions/sala](supabase/functions/sala/index.ts)). Las tablas ([migración](supabase/migrations/20261029000000_salas.sql)) tienen RLS sin políticas: solo la función puede leerlas.
- **Contra trampas:** las semillas de dados y de carrera son secretas (se publica su hash). Las tiradas se revelan de a una y cada elección se valida en el servidor. Al cerrar el armado se revela la semilla de carrera y cada navegador simula la misma carrera con los autos ya validados.
- **Datos compartidos:** las temporadas están en [supabase/functions/_shared/temporadas.json](supabase/functions/_shared/temporadas.json), que usan el juego y el servidor.

Para desplegar cambios del servidor:

```bash
npx supabase@2.122.0 functions deploy sala --project-ref vljuhibzzwtcswirunfr --no-verify-jwt --use-api
```

Prueba de punta a punta: `node scripts/probar-sala.mjs`.

## Correr en local

Es una página estática, no necesita instalar nada:

```bash
python -m http.server 5173
```

Después abre http://localhost:5173. Con `?laps=4` la carrera es más corta, útil para probar.

## Hoja de ruta

Ver [docs/diseno.md](docs/diseno.md): medias calculadas con datos históricos (Jolpica-F1), login con Google y campeonato guardado (Supabase), salas con amigos, sugerencias y donaciones.

## Aviso

Juego de fans, sin afiliación con la Fórmula 1, la FIA, los equipos ni los pilotos. Los nombres se usan solo como referencia histórica. Sin logos ni fotos: todo está dibujado en SVG. Los trazados de los circuitos vienen de [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT); ver [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
