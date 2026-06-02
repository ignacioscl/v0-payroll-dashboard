# Producción — v0 Payroll Dashboard (Docker)

Desarrollo local → `DOCKER.md`.

| Qué | Valor |
|-----|--------|
| Código | `/home/srssui5/v0-payroll-dashboard` |
| PHP Legacy | `https://main.srssuite.com` (PM2, mismo servidor) |
| Face recognition | PM2 en el host → Apache hace proxy a `127.0.0.1:3002` |
| v0 (este Docker) | puerto **3010** |

**Editá solo esto antes de los comandos:**

- `V0_URL` = URL HTTPS donde los usuarios abren el dashboard (ej. `https://payroll.srssuite.com`).
- `SSO_SECRET` = mismo valor que `PAYROLL_SSO_SECRET` en `config.php` de prod.

---

## Dos archivos `.env` (no confundir)

| Archivo | Para qué |
|---------|----------|
| `/home/srssui5/payroll-dashboard.env` | Secretos de Next (SRS_*, FACE_*) |
| `/home/srssui5/v0-payroll-dashboard/.env` | Una línea: ruta del archivo de arriba (solo Docker Compose) |

---

## 1. Docker al boot

```bash
sudo systemctl enable docker
sudo systemctl start docker
docker compose version
```

---

## 2. Crear secretos (`payroll-dashboard.env`)

```bash
nano /home/srssui5/payroll-dashboard.env
```

Pegar (cambiar `SSO_SECRET`):

```env
SRS_API_URL=http://host.docker.internal
SRS_PUBLIC_URL=https://main.srssuite.com
SRS_SSO_SECRET=SSO_SECRET
FACE_RECOGNITION_URL=http://host.docker.internal:3002
```

```bash
chmod 600 /home/srssui5/payroll-dashboard.env
```

> Face en prod: Apache reenvía a `127.0.0.1:3002`. Desde el contenedor v0 es `host.docker.internal:3002`.

---

## 3. Decirle a Compose dónde está el env

```bash
echo 'PAYROLL_ENV_FILE=/home/srssui5/payroll-dashboard.env' > /home/srssui5/v0-payroll-dashboard/.env
```

---

## 4. PHP — `config.php` (prod)

En el `config.php` de `main.srssuite.com`:

```php
define("PAYROLL_DASHBOARD_URL", "V0_URL");
define("PAYROLL_SSO_SECRET", "SSO_SECRET");
```

`V0_URL` = misma URL HTTPS del dashboard (paso 0).  
`SSO_SECRET` = mismo que `SRS_SSO_SECRET` del paso 2.

---

## 5. Código en el servidor

El proyecto debe estar en:

```text
/home/srssui5/v0-payroll-dashboard/
```

(con `Dockerfile`, `docker-compose.yml`, etc.)

---

## 6. Build y arranque

```bash
cd /home/srssui5/v0-payroll-dashboard
docker compose up -d --build
```

---

## 7. Comprobar

```bash
docker compose ps
docker compose logs payroll-dashboard --tail 30
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3010/login
```

Esperado: `200` y contenedor `Up`.

```bash
docker inspect srs-payroll-dashboard --format '{{.HostConfig.RestartPolicy.Name}}'
```

Esperado: `always` (reinicia solo si cae o si reiniciás el server).

---

## 8. HTTPS delante de v0 (Apache o nginx)

El contenedor solo escucha **3010**. En cPanel/Apache, proxy al puerto 3010 (igual que face usa 3002).

Ejemplo Apache (`V0_URL` = `https://payroll.srssuite.com`):

```apache
RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3010/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3010/$1 [P,L]
```

v0 **debe** ir por HTTPS en el navegador (cookies `secure` en producción).

---

## 9. Probar

1. Abrir `V0_URL/login` → login con usuario payroll.
2. En `https://main.srssuite.com` → abrir dashboard SSO → misma sesión.
3. Probar PHP desde el contenedor:

```bash
docker exec srs-payroll-dashboard wget -qO- \
  --header="Content-Type: application/json" \
  --header="X-Payroll-Sso-Secret: SSO_SECRET" \
  --post-data='{"email":"x","password":"y"}' \
  http://host.docker.internal/php/api/sso/login.php 2>&1 | head -c 150
```

JSON (aunque diga invalid password) = OK. HTML 404 = revisar `SRS_PUBLIC_URL`.

---

## 10. Comandos útiles

```bash
cd /home/srssui5/v0-payroll-dashboard

docker compose logs -f payroll-dashboard
docker compose restart payroll-dashboard          # cambiaste payroll-dashboard.env
docker compose up -d --build                      # cambiaste código
docker compose down                               # parar
```

---

## Si falla el login (404)

```bash
curl -H "Host: main.srssuite.com" -I http://127.0.0.1/php/api/sso/login.php
```

Tiene que responder Apache/PHP, no 404 genérico.
