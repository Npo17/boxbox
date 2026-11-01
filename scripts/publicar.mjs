// Después de hacer push: espera a que GitHub Pages publique el último commit y recién ahí vacía y calienta la caché de Cloudflare.
// (La página queda 1 día guardada en Cloudflare: si no se vacía, la gente seguiría viendo la versión anterior.)
// Uso: node scripts/publicar.mjs   (necesita gh con sesión iniciada y CLOUDFLARE_API_TOKEN)
import { execSync } from 'node:child_process';
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const head = sh('git rev-parse HEAD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i++) {
  let st = '', commit = '';
  try { [st, commit] = sh(`gh api repos/{owner}/{repo}/pages/builds/latest --jq ".status+\\" \\"+.commit"`).split(' '); } catch (e) {}
  if (commit === head && st === 'built') { console.log('GitHub Pages publicó', head.slice(0, 7)); break; }
  if (commit === head && st === 'errored') { console.log('GitHub Pages falló al publicar', head.slice(0, 7)); process.exit(1); }
  if (i >= 72) { console.log('GitHub Pages no publicó en 12 min (último:', st, commit.slice(0, 7) + ')'); process.exit(1); }
  await sleep(10000);
}
await sleep(15000);   // un respiro: Pages tarda unos segundos en servir lo nuevo en todos lados
console.log(sh('node scripts/cache-purgar-y-calentar.mjs'));
