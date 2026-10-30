// Vuelve atrás el sistema de amigos: deja la función "sala" y la web como estaban en la etiqueta git "antes-amigos"
// y borra la función "amigos". Uso:
//   node scripts/rollback-amigos.mjs            -> muestra qué haría (no cambia nada)
//   node scripts/rollback-amigos.mjs --aplicar  -> lo hace (restaura archivos, despliega, borra la función; NO hace commit ni push)
//   node scripts/rollback-amigos.mjs --aplicar --db -> además borra tablas/columnas nuevas (pierde amistades y trofeos de la cuenta)
import { execSync } from 'node:child_process';
const REF = 'vljuhibzzwtcswirunfr', TAG = 'antes-amigos';
const aplicar = process.argv.includes('--aplicar'), db = process.argv.includes('--db');
const sh = (c) => { console.log('$ ' + c); if (aplicar) console.log(execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim().slice(-300)); };
const ARCHIVOS = 'supabase/functions/sala/index.ts game.js index.html lang';
console.log(aplicar ? 'APLICANDO el rollback…\n' : 'Simulación (agregá --aplicar para hacerlo):\n');
sh(`git checkout ${TAG} -- ${ARCHIVOS}`);                                                       // 1. archivos como estaban antes
sh(`npx --yes supabase@2.122.0 functions deploy sala --project-ref ${REF} --no-verify-jwt --use-api`);       // 2. la función de salas vuelve a la versión anterior
sh(`npx --yes supabase@2.122.0 functions delete amigos --project-ref ${REF}`);                  // 3. se borra la función nueva
if (db) sh(`npx --yes supabase@2.122.0 db query --linked -f supabase/rollback/20261030000000_amigos_rollback.sql`);   // 4. (opcional) la base
console.log('\nQuedan estos archivos restaurados en tu carpeta, sin commit. Para que la web publicada también vuelva atrás:');
console.log('  git rm -r --cached supabase/functions/amigos -q; git commit -am "Rollback: amigos" ; git push');
console.log('Para comprobarlo: node scripts/probar-sala.mjs  y abrir https://boxf1box.com (Ctrl+F5).');
