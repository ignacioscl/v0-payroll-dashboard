# Payroll dashboard en Docker (puerto 3010) — desarrollo local

**Producción (`main.srssuite.com`, `/home/srssui5/v0-payroll-dashboard`): usar `docker_prod.md`.**

Único componente dockerizado; **PHP Legacy, face API y el resto siguen en PM2** en el mismo servidor.

## Requisitos en el servidor

- Docker + Docker Compose v2
- **Docker habilitado al boot** (para que v0 vuelva solo tras reiniciar el servidor):
  ```bash
  sudo systemctl enable docker
  sudo systemctl start docker
  ```
- Archivo de entorno en el host, por defecto: `/opt/srs/payroll-dashboard.env`
- Nginx (o similar) opcional delante de `3010` para HTTPS

## Siempre encendido (auto-reinicio)

El servicio usa `restart: always` en `docker-compose.yml`:

| Evento | Comportamiento |
|--------|----------------|
| Proceso Node/Next se cae (exit ≠ 0) | Docker levanta el contenedor de nuevo |
| Contenedor se detiene por error | Reinicio automático |
| Reinicio del servidor (reboot) | Al arrancar Docker, el contenedor sube solo (si antes estaba creado con `compose up -d`) |
| `docker compose stop` manual | Queda parado hasta que lo vuelvas a levantar o reinicies el servidor (con `always`, al reiniciar **Docker** el contenedor puede volver a arrancar) |

Equivalente a PM2 `autorestart: true` para este único servicio.

Verificar después de un deploy:

```bash
docker inspect srs-payroll-dashboard --format '{{.HostConfig.RestartPolicy.Name}}'
# debe mostrar: always
```

## Configuración

1. Copiar variables de ejemplo:

   ```bash
   sudo mkdir -p /opt/srs
   sudo cp .env.production.example /opt/srs/payroll-dashboard.env
   sudo chmod 600 /opt/srs/payroll-dashboard.env
   ```

2. Editar `/opt/srs/payroll-dashboard.env`:

   - `SRS_API_URL`: URL base hacia PHP (sin `/php/...`). Ej. `http://host.docker.internal` si Apache publica el puerto 80 en el host.
   - `SRS_PUBLIC_URL`: URL pública del sitio PHP (ej. `http://srs.com`). El contenedor v0 envía `Host: srs.com` en cada llamada a PHP (Apache vhost).
   - **Local con php-dev en Docker:** opcional `cp docker-compose.override.example.yml docker-compose.override.yml` y `SRS_API_URL=http://php-dev-apache`.
   - `SRS_SSO_SECRET`: igual que `PAYROLL_SSO_SECRET` en PHP.
   - `FACE_RECOGNITION_URL`: URL interna hacia el servicio face en el host si lo usás.

3. Ruta alternativa al env:

   ```bash
   export PAYROLL_ENV_FILE=/ruta/custom/payroll-dashboard.env
   docker compose up -d --build
   ```

## Arranque

```bash
cd v0-payroll-dashboard
docker compose up -d --build
```

App: `http://<servidor>:3010`

## Comandos útiles

```bash
docker compose logs -f payroll-dashboard
docker compose restart payroll-dashboard
docker compose up -d --build   # tras cambios de código
```

Tras cambiar solo `/opt/srs/payroll-dashboard.env`:

```bash
docker compose restart payroll-dashboard
```

## Red (contenedor → PM2 en host)

`docker-compose.yml` define `host.docker.internal:host-gateway` para que el contenedor alcance servicios en `localhost` del servidor.

Si `SRS_API_URL=http://host.docker.internal` no alcanza PHP, probá la IP del bridge Docker (p. ej. `172.17.0.1`) o la URL interna de nginx.

## Proxy HTTPS (recomendado)

Ejemplo nginx hacia el contenedor:

```nginx
location / {
  proxy_pass http://127.0.0.1:3010;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Las cookies de sesión usan `secure` en `NODE_ENV=production`; conviene HTTPS en el dominio de v0.

## Imagen sin compose

```bash
docker build -t srs-payroll-dashboard .
docker run -d --name srs-payroll-dashboard \
  --restart always \
  -p 3010:3010 \
  --env-file /opt/srs/payroll-dashboard.env \
  -v /opt/srs/payroll-dashboard.env:/app/.env.production:ro \
  --add-host=host.docker.internal:host-gateway \
  srs-payroll-dashboard
```
