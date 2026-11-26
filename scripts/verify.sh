#!/usr/bin/env bash
# Comprobación de integración; requiere los contenedores iniciados.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose config --quiet
docker compose exec -T drupal drush status --fields=drupal-version,db-status,bootstrap
docker compose exec -T drupal drush php:script /opt/balto/scripts/verify-drupal.php
docker compose exec -T drupal drush php:script /opt/balto/scripts/verify-phase2.php
docker compose exec -T drupal drush php:script /opt/balto/scripts/verify-phase3.php
docker compose exec -T drupal drush php:script /opt/balto/scripts/verify-phase4.php
docker compose exec -T drupal php -r '
$url = "http://localhost/user/login";
if (@file_get_contents($url) === false) { fwrite(STDERR, "Drupal no responde.\n"); exit(1); }
echo "OK: página de acceso Drupal.\n";
'
docker compose exec -T n8n node -e '
fetch("http://127.0.0.1:5678/healthz").then(r=>{
  if(!r.ok) process.exit(1);
  console.log("OK: salud de n8n.");
}).catch(()=>process.exit(1));
'
docker compose exec -T n8n node -e '
fetch("http://127.0.0.1:5678/webhook/chat", {
  method: "POST",
  headers: {"Content-Type": "application/json", "Origin": process.env.CHAT_ALLOWED_ORIGIN},
  body: JSON.stringify({message: "hola"}),
  signal: AbortSignal.timeout(30000)
}).then(async r=>{
  const data = await r.json();
  if (!r.ok || data.intent !== "greeting" || typeof data.reply !== "string") process.exit(1);
  console.log("OK: webhook publicado y consulta de n8n a Drupal.");
}).catch(()=>process.exit(1));
'
echo 'Verificación de integración de Fases 1 a 6 terminada correctamente.'
