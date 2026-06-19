# Producción — v0 Payroll Dashboard (Docker)

Desarrollo local → `DOCKER.md`.

| Qué | Valor |
|-----|--------|
| Código v0 | `/home/srssui5/v0-payroll-dashboard` (git) |
| PHP Legacy | `https://main.srssuite.com` (EN) · `https://mooi.srssuite.com` (SP) |
| Dashboard v0 | `https://pro.srssuite.com` → Apache → `127.0.0.1:3010` |
| Face | PM2 → Apache → `127.0.0.1:3002` |

---

## Qué trae git y qué NO

| En git (`git pull`) | Fuera de git (una vez por server) |
|---------------------|-----------------------------------|
| `Dockerfile`, `docker-compose.yml`, código Next | `/home/srssui5/payroll-dashboard.env` |
| | `/home/srssui5/v0-payroll-dashboard/.env` (solo `PAYROLL_ENV_FILE=...`) |
| | `config.php` en `main` |
| | PHP SSO/payroll por FTP (`php/api/sso/*`, etc.) |
| | `.htaccess` proxy en docroot de **`pro`** |

**`git pull` solo no alcanza.** Siempre necesitás el `.env` del server y PHP subido.

---

## Variables (todos los servers)

**`/home/srssui5/payroll-dashboard.env`** (plantilla: `payroll-dashboard.env.example`):

```env
SRS_API_URL=https://main.srssuite.com
SRS_PUBLIC_URL=https://main.srssuite.com
PAYROLL_PUBLIC_URL=https://pro.srssuite.com
SRS_SSO_SECRET=PEGAR_DESDE_config.php
FACE_RECOGNITION_URL=http://host.docker.internal:3002
```

| Variable | Para qué |
|----------|----------|
| `SRS_API_URL` | Contenedor → PHP (host de conexión; suele ser `main`) |
| `SRS_PUBLIC_URL` | **Fallback** Legacy si la sesión no trae `legacyOrigin` (login directo en v0). Default EN → `main` |
| `PAYROLL_PUBLIC_URL` | Redirects del browser en v0 (`pro`) — **mismo valor que `PAYROLL_DASHBOARD_URL` en config.php** |

**Back to Legacy (mooi vs main):** no hace falta `SRS_PUBLIC_URL_SP`. Al abrir v0 desde legacy, PHP guarda `legacyOrigin` en la sesión. "Volver a SRS Legacy" redirige el browser a ese host (`consume.php`); `adopt.php` se llama siempre vía `SRS_API_URL` (mismo `uploads/sso_codes` en el server).

**Variables nuevas:** ninguna. Mismas de siempre.

```bash
chmod 600 /home/srssui5/payroll-dashboard.env
echo 'PAYROLL_ENV_FILE=/home/srssui5/payroll-dashboard.env' > /home/srssui5/v0-payroll-dashboard/.env
```

**`config.php` de `main.srssuite.com` y `mooi.srssuite.com`** (mismos valores en ambos):

```php
define("PAYROLL_DASHBOARD_URL", "https://pro.srssuite.com");
define("PAYROLL_SSO_SECRET", "MISMO_QUE_SRS_SSO_SECRET");
define("FACE_RECOGNITION_API_URL", "http://127.0.0.1:3002");
```

Subir por FTP `PayrollDashboardSsoService.php` (y resto SSO) en **main y mooi** si son docroots separados.

| Variable | Dónde apunta |
|----------|----------------|
| `SRS_API_URL` | Host de conexión server-side (típ. **main**) |
| `SRS_PUBLIC_URL` | Fallback Legacy (**main**) — usuarios SP usan `legacyOrigin` de sesión |
| `PAYROLL_PUBLIC_URL` | **pro** (v0) — redirects SSO; = `PAYROLL_DASHBOARD_URL` en PHP |
| `PAYROLL_DASHBOARD_URL` (PHP) | **pro** (v0) |

**No uses** `SRS_API_URL=http://host.docker.internal` en cPanel (puerto 80 → 406).

---

## `.htaccess` en `pro.srssuite.com` (solo v0, no en `main`)

```apache
DirectoryIndex disabled
RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3010/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3010/$1 [P,L]
```

---

# PROD (DNS apunta a este server)

## 1. Primera vez

```bash
sudo systemctl enable docker && sudo systemctl start docker
cd /home/srssui5/v0-payroll-dashboard
git pull
```

Crear `payroll-dashboard.env` y `.env` (arriba). Subir PHP por FTP. Editar `config.php`.

## 2. Levantar

```bash
cd /home/srssui5/v0-payroll-dashboard
docker compose up -d --build
```

El `docker-compose.yml` del repo trae solo:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
  - "srs.com:host-gateway"
```

En **prod** suele alcanzar — el contenedor resuelve `main.srssuite.com` por DNS al mismo server.

## 3. Verificar

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3010/login
docker exec srs-payroll-dashboard wget -O- --no-check-certificate \
  --header="Content-Type: application/json" \
  --header="X-Payroll-Sso-Secret: TU_SECRET" \
  --post-data='{"email":"x","password":"y"}' \
  https://main.srssuite.com/php/api/sso/login.php
```

JSON `"Invalid username or password"` = OK.

## 4. Deploys siguientes

```bash
cd /home/srssui5/v0-payroll-dashboard
git pull
docker compose up -d --build
```

(Solo cambiaste `.env` → `docker compose restart payroll-dashboard`.)

## 5. Si el login falla en prod

Agregar **a mano** en `docker-compose.yml` la IP de **este** server (ver sección TEST abajo), luego:

```bash
docker compose up -d --force-recreate
```

---

# TEST (ded5831 — DNS de `main` apunta a OTRO server)

Usás `/etc/hosts` en tu Mac para entrar. En el server de test el DNS público **no** apunta acá → el contenedor iría al server equivocado sin override.

## Extra obligatorio en `docker-compose.yml`

Editar en el server (no viene en git):

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
  - "main.srssuite.com:209.182.192.87"
```

Reemplazá por la **IP pública del server de test** (no la de prod).

```bash
docker compose up -d --force-recreate
docker exec srs-payroll-dashboard getent hosts main.srssuite.com
```

Tiene que mostrar la IP del test (`209.182.192.87`), **no** `172.17.0.1`.

El resto igual que prod: mismo `payroll-dashboard.env` (`SRS_API_URL=https://main.srssuite.com`).

## Acceso desde tu PC

En `/etc/hosts` de tu Mac:

```
IP_TEST  main.srssuite.com
IP_TEST  pro.srssuite.com
```

---

## Comandos útiles

```bash
cd /home/srssui5/v0-payroll-dashboard
docker compose logs -f payroll-dashboard
docker compose restart payroll-dashboard
docker compose up -d --build
docker compose down
```

---

## Errores frecuentes

| Error | Causa | Fix |
|-------|-------|-----|
| 406 HTML | `SRS_PUBLIC_URL=pro` o HTTP :80 | `SRS_API_URL=https://main.srssuite.com` |
| 404 contenedor | `main` → `172.17.0.1` o DNS a otro server | `extra_hosts: main.srssuite.com:IP` |
| 405 JSON en browser GET | Normal | `login.php` solo POST |
| `git pull` y no anda | Falta `.env` o PHP FTP | Crear env + subir `php/api/sso/*` |
| 500 en `/api/face/*` | CSF bloquea `br-*` → Face (ConnectTimeoutError) | Ver sección **Face + CSF** abajo |

---

## Face + CSF (firewall cPanel)

CSF bloquea por defecto tráfico desde la red bridge Docker (`172.20.0.0/16`) al host.
El contenedor hace timeout al llamar a `host.docker.internal:3002` → Next devuelve 500.

### Diagnóstico

```bash
# Desde el contenedor — si cuelga, es CSF
docker exec srs-payroll-dashboard wget -T 5 -qO- http://172.20.0.1:3002/ 2>&1
# Desde el host — si responde, es solo firewall
curl -s http://172.20.0.1:3002/
```

### Solución permanente (una vez por server)

Agregar regla específica en `/etc/csf/csfpre.sh` **en el server** (no está en el repo):

```bash
cat >> /etc/csf/csfpre.sh << 'EOF'

# v0 Docker Compose -> Face API :3002
iptables -I INPUT 1 -s 172.20.0.0/16 -p tcp --dport 3002 -j ACCEPT
EOF

chmod +x /etc/csf/csfpre.sh
csf -r
```

Verificar:

```bash
docker exec srs-payroll-dashboard wget -T 5 -qO- http://172.20.0.1:3002/ 2>&1 | head
# Debe responder: {"data":null,"status":"error","error":{"message":"Error token"...}}
```

La subnet `172.20.0.0/16` está fijada en `docker-compose.yml` (`networks.default.ipam`), por lo que no cambia al recrear el compose.
