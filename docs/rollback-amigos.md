# Rollback del sistema de amigos

**Punto de retorno:** etiqueta git `antes-amigos` (commit `d632578`). Es exactamente lo que estaba en línea antes de agregar amigos
(función `sala` versión 32, web con "Räikkönen +1").

## Cómo se publica (para poder volver atrás sin que nadie lo note)
1. Migración **aditiva** (no borra ni cambia nada existente): tabla `amistades` + columnas `jugadores.user_id` y `campeonatos.trofeos`.
2. Se despliega `amigos` (función nueva: nadie la usa todavía) y después `sala`.
3. Se prueba contra el servidor real (`node scripts/probar-amigos.mjs` + pruebas de salas).
4. **Recién si todo pasa** se publica la web (`git push`). Hasta ese momento los usuarios no ven nada nuevo.

## Si algo sale mal
| Situación | Qué hacer |
|---|---|
| Falla una prueba antes de publicar la web | `node scripts/rollback-amigos.mjs --aplicar` (restaura `sala` y borra `amigos`). La web nunca cambió. |
| Ya se publicó la web y hay errores | Igual que arriba, y después `git commit -am "Rollback: amigos"` + `git push` (la web vuelve a la versión anterior en ~1 minuto). |
| Quiero dejar también la base limpia | Agregar `--db` (borra amistades y trofeos de la cuenta). **No es necesario** para volver atrás. |
| Solo falla algo menor del cliente | Revertir ese commit con `git revert <commit>` y `git push`. |

La migración es compatible hacia atrás: la función `sala` anterior y la web anterior funcionan igual con las columnas nuevas presentes.
