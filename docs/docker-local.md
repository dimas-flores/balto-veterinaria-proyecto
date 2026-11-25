# Docker local sin contraseña de administrador

En la computadora de desarrollo, el servicio Docker del sistema está detenido y `sudo` requiere contraseña. Se levantó un motor **Docker Rootless separado**, con los datos dentro de `~/.local/share/balto-dev/docker`. No se cambió el servicio del sistema ni el contexto global de Docker.

Esta alternativa se verificó en Linux x86_64 con Docker 29.8.2, `newuidmap`, `newgidmap` y rangos de usuario ya configurados en `/etc/subuid` y `/etc/subgid`. No sustituye la instalación normal de Docker Desktop para Windows/macOS ni el aprovisionamiento de EC2 en Fase 9. [Requisitos oficiales de Docker Rootless](https://docs.docker.com/engine/security/rootless/).

## Retomar el proyecto en esta computadora

1. Abre una terminal en `/home/sae/balto-veterinaria`.
2. Comprueba o inicia el motor local:

   ```bash
   bash scripts/start-local-docker.sh
   ```

3. Ejecuta el `export DOCKER_HOST=...` que imprime el script. En esta computadora es:

   ```bash
   export DOCKER_HOST=unix:///run/user/1000/balto-docker.sock
   ```

4. Levanta la demo con `docker compose up -d`.
5. Abre <http://localhost:8080> y ejecuta `bash scripts/verify.sh`.

**Resultado esperado:** la tienda usa el motor local con sus volúmenes previos. Si cierras sesión o reinicias la computadora, repite estos pasos; el motor no se instaló como un servicio permanente.

## Reconstruir después de cambiar código

En esta máquina, las descargas de construcción eran lentas desde la red bridge del motor Rootless. Usa el archivo opcional que da acceso a la red del equipo **solo durante la construcción**:

```bash
docker compose -f docker-compose.yml -f docker-compose.rootless.yml up -d --build
```

**Resultado esperado:** reconstrucción con las dependencias fijadas y servicios operativos en la misma red `backend`. MariaDB sigue sin publicar un puerto y Drupal/n8n se mantienen enlazados a `127.0.0.1`.

No necesitas este archivo opcional en un Docker Engine normal. Para volver a usar el motor predeterminado en tu terminal, ejecuta `unset DOCKER_HOST`.

## Abrir la demo por IP (red del aula)

Con `localhost` la tienda solo funciona en esta computadora: si otra persona entra por la IP, su navegador envía el chat a **su propio** `localhost:5678` y n8n además rechaza el origen. Para trabajar con IP:

```bash
python3 scripts/configure-local-ip.py          # detecta la IP; o --ip 192.168.1.50
docker compose up -d --force-recreate drupal n8n
```

El script cambia solo URL y puertos del `.env`: publica Drupal y n8n en `0.0.0.0`, usa `http://IP:8080` para la tienda y `http://IP:5678/webhook/chat` para el chat, y agrega la IP a `DRUPAL_TRUSTED_HOSTS`. Al arrancar, n8n vuelve a importar `n8n/workflows/chatbot.json` con esa IP en **Recibir chat** (orígenes permitidos), **¿Qué pregunta el cliente?** y **Armar la respuesta**. `CHAT_ALLOWED_ORIGIN` admite varios orígenes separados por coma.

**Resultado esperado:** desde otro equipo de la misma red se abre `http://IP:8080` y el chat responde. Si la IP cambia (otra red Wi‑Fi), repite los dos comandos. Para volver a solo este equipo: `python3 scripts/configure-local-ip.py --localhost`.

El archivo `n8n/workflows/chatbot.json` del repositorio trae la IP pública de EC2 (`http://3.211.103.160`), así que también se puede importar a mano en el n8n de AWS. Para generarlo con otra IP: `BALTO_PUBLIC_ORIGIN=http://IP:8080 python3 scripts/generate-chat-workflow.py`.
