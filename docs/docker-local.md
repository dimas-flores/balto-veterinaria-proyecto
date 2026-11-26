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
