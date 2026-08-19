# Producción — v0 Payroll Dashboard (Docker)

Desarrollo local → `DOCKER.md` (sin Docker en prod, usás `frontend/.env.local`).

---

## Resumen (léelo primero)

`docker compose up -d --build` levanta **dos contenedores**:

| Contenedor              | Puerto en el host | Qué hace                                |
| ----------------------- | ----------------- | --------------------------------------- |
| `srs-payroll-dashboard` | **3010**          | Next.js — lo que Apache de `pro` proxea |
| `srs-suite-backend`     | **3020**          | NestJS — KPIs (lee MariaDB directo)     |

El **browser solo habla con `3010`**. El backend (`3020`) lo usa el frontend por red interna de Docker (`http://srs-backend:3020`). No hace falta proxy Apache al `:3020`.

**PHP, Face y MariaDB siguen en el host** (Apache/PM2/cPanel). Docker solo corre v0 + Nest.

---

## Ya tenés el front — agregar backend (deploy)

Usá esta sección si **Issues/login/Face ya andan** y el próximo `git pull` trae el backend Nest.
No toques `.htaccess`, `config.php` ni el resto del env del front salvo lo indicado.

### 1. Pull

```bash
cd /home/srssui5/v0-payroll-dashboard
git pull
```

### 2. Una línea al env del front (el que ya tenés)

Editá `/home/srssui5/payroll-dashboard.env` y agregá:

```env
BACKEND_API_URL=http://srs-backend:3020
```

No cambies `SRS_API_URL`, `SRS_SSO_SECRET`, `FACE_RECOGNITION_URL`, etc.

### 3. Crear el env del backend (archivo nuevo)

```bash
cd /home/srssui5/v0-payroll-dashboard
cp backend/srs-backend.env.example /home/srssui5/srs-backend.env
chmod 600 /home/srssui5/srs-backend.env
nano /home/srssui5/srs-backend.env
```

Completá `DB_PASSWORD` (desde `config.php`) y `JWT_SECRET` (= `JWT_AUTH` de PHP).

### 4. Actualizar el `.env` del compose

Editá `/home/srssui5/v0-payroll-dashboard/.env`. Tiene que quedar:

```env
PAYROLL_ENV_FILE=/home/srssui5/payroll-dashboard.env
BACKEND_ENV_FILE=/home/srssui5/srs-backend.env
```

(Si ya tenías la primera línea, solo agregá `BACKEND_ENV_FILE=...`.)

### 5. Firewall + MariaDB (solo si el backend no conecta a la DB)

Si ya tenés CSF para Face (`:3002`), agregá la regla para **`:3306`** — ver sección [Firewall CSF](#firewall-csf-una-vez-por-server).

En MySQL:

```sql
mysql -e "
CREATE USER IF NOT EXISTS 'srssui5_srs'@'172.20.%' IDENTIFIED BY 'juanWQE45_=';
GRANT SELECT ON srssui5_srs.* TO 'srssui5_srs'@'172.20.%';
FLUSH PRIVILEGES;
"
```

### 6. Rebuild y levantar

```bash
cd /home/srssui5/v0-payroll-dashboard
docker compose up -d --build
```

Levanta `srs-suite-backend` (nuevo) y recrea el front con `BACKEND_API_URL`.

### 7. Verificar

```bash
curl -s -o /dev/null -w "frontend: %{http_code}\n" http://127.0.0.1:3010/login
curl -s http://127.0.0.1:3020/api/health
docker exec srs-payroll-dashboard wget -qO- http://srs-backend:3020/api/health
docker compose ps
```

Los dos contenedores deben estar `Up` / `healthy`.

| Si falla                 | Mirá                                       |
| ------------------------ | ------------------------------------------ |
| Issues/login OK, KPIs no | Paso 2 + `docker compose logs srs-backend` |
| Backend `unhealthy`      | Paso 5 (CSF `:3306` + GRANT)               |
| KPIs 401                 | `JWT_SECRET` ≠ `JWT_AUTH` en PHP (paso 3)  |

**No hace falta tocar:** `.htaccess` de `pro`, Apache, SSO, Face (si ya andaban).

Detalle de cada variable → secciones [Archivo A](#archivo-a--variables-del-frontend-next), [Archivo B](#archivo-b--variables-del-backend-nestjs) y [Errores frecuentes](#errores-frecuentes).

---

## Mapa del server

| Qué           | Dónde                                                  |
| ------------- | ------------------------------------------------------ |
| Código (git)  | `/home/srssui5/v0-payroll-dashboard`                   |
| PHP Legacy EN | `https://main.srssuite.com`                            |
| PHP Legacy SP | `https://mooi.srssuite.com`                            |
| Dashboard v0  | `https://pro.srssuite.com` → Apache → `127.0.0.1:3010` |
| Face API      | PM2 en host → `127.0.0.1:3002`                         |
| MariaDB       | Host → puerto `3306`                                   |

---

## Qué trae `git pull` y qué NO

| Viene en git                              | Lo creás vos en el server (una vez)              |
| ----------------------------------------- | ------------------------------------------------ |
| `docker-compose.yml`, Dockerfiles, código | **Archivo A** — env del frontend (ver abajo)     |
|                                           | **Archivo B** — env del backend Nest (ver abajo) |
|                                           | **Archivo C** — `.env` del compose (solo rutas)  |
|                                           | `config.php` en **main** y **mooi**              |
|                                           | PHP SSO/payroll por FTP                          |
|                                           | `.htaccess` proxy en docroot de **pro**          |
|                                           | Reglas CSF en el firewall (Face + MariaDB)       |

**`git pull` solo no alcanza.** Sin los archivos A, B y C el deploy falla o los KPIs no andan.

---

## Los 3 archivos de configuración (fuera de git)

Usamos rutas bajo `/home/srssui5/`. Si preferís `/opt/srs/`, cambiá las rutas en el **Archivo C** y al crear A y B.

### Archivo A — variables del frontend (Next) {#archivo-a--variables-del-frontend-next}

**Ruta en el server:** `/home/srssui5/payroll-dashboard.env`  
**Plantilla en git:** `frontend/payroll-dashboard.env.example`

```bash
cd /home/srssui5/v0-payroll-dashboard
cp frontend/payroll-dashboard.env.example /home/srssui5/payroll-dashboard.env
chmod 600 /home/srssui5/payroll-dashboard.env
nano /home/srssui5/payroll-dashboard.env   # completar secretos
```

Contenido (valores de ejemplo prod):

```env
# --- PHP Legacy (server-side desde el contenedor Next) ---
SRS_API_URL=https://main.srssuite.com
SRS_PUBLIC_URL=https://main.srssuite.com
PAYROLL_PUBLIC_URL=https://pro.srssuite.com
SRS_SSO_SECRET=PEGAR_DESDE_config.php_PAYROLL_SSO_SECRET

# --- Face API (PM2 en el host) ---
# Usar IP del gateway Docker (172.20.0.1), NO host.docker.internal:3002 (CSF lo bloquea).
FACE_RECOGNITION_URL=http://172.20.0.1:3002

# --- Backend Nest (red interna Docker) — OBLIGATORIO para KPIs ---
BACKEND_API_URL=http://srs-backend:3020
```

| Variable               | Para qué                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SRS_API_URL`          | Next → PHP (`main`). **No** uses `pro` ni `host.docker.internal` acá.                                                 |
| `SRS_PUBLIC_URL`       | Fallback “volver a Legacy” si el usuario entró directo al login de v0                                                 |
| `PAYROLL_PUBLIC_URL`   | Redirects SSO en v0. **Igual** que `PAYROLL_DASHBOARD_URL` en `config.php`                                            |
| `SRS_SSO_SECRET`       | **Igual** que `PAYROLL_SSO_SECRET` en `config.php`                                                                    |
| `FACE_RECOGNITION_URL` | Thumbnails / fotos de punch → `172.20.0.1:3002`                                                                       |
| `BACKEND_API_URL`      | Next → Nest por red Docker. **Sin esto los KPIs fallan** (intenta `localhost:3020` dentro del contenedor equivocado). |

**mooi vs main:** no hace falta `SRS_PUBLIC_URL_SP`. Si el usuario entra desde legacy, PHP guarda `legacyOrigin` en sesión y “Volver a SRS” usa ese host.

---

### Archivo B — variables del backend (NestJS) {#archivo-b--variables-del-backend-nestjs}

**Ruta en el server:** `/home/srssui5/srs-backend.env`  
**Plantilla en git:** `backend/srs-backend.env.example`

```bash
cp backend/srs-backend.env.example /home/srssui5/srs-backend.env
chmod 600 /home/srssui5/srs-backend.env
nano /home/srssui5/srs-backend.env
```

Contenido:

```env
NODE_ENV=production
PORT=3020

DB_CONNECTION=mysql
DB_HOST=host.docker.internal
DB_PORT=3306
DB_USERNAME=srssui5_srs
DB_PASSWORD=PEGAR_DESDE_config.php
DB_DATABASE=srssui5_srs
DB_POOL=5
DB_LOGGING=false
DEBUG_QUERIES=false

# Mismo valor que JWT_AUTH en config.php de PHP
JWT_SECRET=PEGAR_DESDE_config.php_JWT_AUTH
```

> **No confundir** con `backend-apis/.env.template` del repo raíz — ese es otro proyecto. Este backend vive en `v0-payroll-dashboard/backend/`.

---

### Archivo C — rutas para Docker Compose

**Ruta:** `/home/srssui5/v0-payroll-dashboard/.env`  
**Plantilla en git:** `.env.compose.example`

```bash
cat > /home/srssui5/v0-payroll-dashboard/.env << 'EOF'
PAYROLL_ENV_FILE=/home/srssui5/payroll-dashboard.env
BACKEND_ENV_FILE=/home/srssui5/srs-backend.env
EOF
```

Sin este archivo, Compose busca por defecto `/opt/srs/payroll-dashboard.env` y `/opt/srs/srs-backend.env` (que en cPanel **no existen**).

---

## PHP (`config.php` en main y mooi)

Mismos valores en **ambos** docroots:

```php
define("PAYROLL_DASHBOARD_URL", "https://pro.srssuite.com");
define("PAYROLL_SSO_SECRET", "MISMO_QUE_SRS_SSO_SECRET_en_Archivo_A");
define("FACE_RECOGNITION_API_URL", "http://127.0.0.1:3002");
// JWT_AUTH en PHP = JWT_SECRET en Archivo B
```

Subir por FTP `php/api/sso/*` y payroll si hubo cambios.

---

## Apache — `.htaccess` en `pro.srssuite.com` (solo v0)

```apache
DirectoryIndex disabled
RewriteEngine On
RewriteRule ^$ http://127.0.0.1:3010/ [P,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://127.0.0.1:3010/$1 [P,L]
```

No proxear `:3020` — el browser no lo necesita.

---

## Firewall CSF (una vez por server) {#firewall-csf-una-vez-por-server}

Docker usa la subnet fija **`172.20.0.0/16`** (gateway del host = **`172.20.0.1`**). CSF bloquea por defecto tráfico desde esa red al host.

Necesitás **tres reglas** en `/etc/csf/csfpre.sh`:

```bash
cat >> /etc/csf/csfpre.sh << 'EOF'

# v0 Docker -> Face API :3002
iptables -I INPUT 1 -s 172.20.0.0/16 -p tcp --dport 3002 -j ACCEPT
# v0 Docker -> MariaDB :3306 (backend Nest)
iptables -I INPUT 1 -s 172.20.0.0/16 -p tcp --dport 3306 -j ACCEPT
# v0 Docker: trafico ENTRE contenedores (frontend -> backend :3020, cadena FORWARD)
iptables -I FORWARD 1 -s 172.20.0.0/16 -d 172.20.0.0/16 -j ACCEPT
EOF

chmod +x /etc/csf/csfpre.sh
csf -r
```

> ⚠️ **La regla FORWARD es tan crítica como las INPUT.** Incidente 2026-08-12: al recargar CSF
> pisó las cadenas de Docker y el tráfico contenedor→contenedor quedó muerto durante días con TODO
> "healthy" (los healthchecks son localhost adentro de cada contenedor). Síntoma: cada request a
> `/api/srs-kpis/*` cuelga y termina en 500 pelado, mientras el passthrough PHP (que va al host)
> funciona. Fix inmediato: `systemctl restart docker` (reescribe las reglas de Docker). Fix duradero:
> la regla FORWARD de arriba.

### MariaDB — GRANT para la subnet Docker

Desde el host (como root de MySQL), ajustá usuario/password:

```sql
-- Ejemplo: permitir al usuario de la app desde la red Docker
GRANT SELECT ON srssui5_srs.* TO 'srssui5_srs'@'172.20.%' IDENTIFIED BY 'TU_PASSWORD';
FLUSH PRIVILEGES;
```

Si el backend no conecta a DB, revisá CSF `:3306` y este GRANT.

---

## Checklist primera vez en prod

```bash
# 1. Docker
sudo systemctl enable docker && sudo systemctl start docker

# 2. Código
cd /home/srssui5/v0-payroll-dashboard
git pull

# 3. Archivos A, B, C (ver secciones arriba)
# 4. config.php main + mooi
# 5. PHP por FTP si aplica
# 6. .htaccess en pro
# 7. CSF + GRANT MariaDB

# 8. Levantar
docker compose up -d --build
```

---

## Verificar que todo anda

```bash
# Frontend
curl -s -o /dev/null -w "frontend login: %{http_code}\n" http://127.0.0.1:3010/login

# Backend (health)
curl -s http://127.0.0.1:3020/api/health

# Frontend → Backend (red Docker interna)
docker exec srs-payroll-dashboard wget -qO- http://srs-backend:3020/api/health

# PHP desde el contenedor (login SSO)
docker exec srs-payroll-dashboard wget -O- --no-check-certificate \
  --header="Content-Type: application/json" \
  --header="X-Payroll-Sso-Secret: TU_SECRET" \
  --post-data='{"email":"x","password":"y"}' \
  https://main.srssuite.com/php/api/sso/login.php
# Respuesta JSON "Invalid username or password" = OK (llegó a PHP)

# Face desde el contenedor
docker exec srs-payroll-dashboard wget -T 5 -qO- http://172.20.0.1:3002/ 2>&1 | head
# Debe responder JSON (aunque sea error de token)

# Contenedores vivos
docker compose ps
```

---

## Deploys siguientes

```bash
cd /home/srssui5/v0-payroll-dashboard
git pull
docker compose up -d --build
```

Solo cambiaste variables (sin código):

```bash
docker compose restart payroll-dashboard   # Archivo A
docker compose restart srs-backend       # Archivo B
```

---

## Si el login PHP falla desde el contenedor

El contenedor puede resolver `main.srssuite.com` al server equivocado. Agregar **en el server** (no en git) en `docker-compose.yml` bajo `payroll-dashboard.extra_hosts` y `srs-backend.extra_hosts`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
  - "main.srssuite.com:IP_PUBLICA_DE_ESTE_SERVER"
```

```bash
docker compose up -d --force-recreate
docker exec srs-payroll-dashboard getent hosts main.srssuite.com
```

---

# Server de TEST (DNS de `main` apunta a OTRO server)

Igual que prod, pero **obligatorio** el `extra_hosts` con la IP del server de test (ver sección anterior). En tu Mac, `/etc/hosts`:

```
IP_TEST  main.srssuite.com
IP_TEST  pro.srssuite.com
```

---

## Comandos útiles

```bash
cd /home/srssui5/v0-payroll-dashboard
docker compose logs -f payroll-dashboard
docker compose logs -f srs-backend
docker compose restart payroll-dashboard srs-backend
docker compose up -d --build
docker compose down
```

---

## Errores frecuentes

| Síntoma                                  | Causa                                      | Fix                                                       |
| ---------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| 406 HTML al llamar PHP                   | `SRS_API_URL` apunta a `pro` o HTTP :80    | `SRS_API_URL=https://main.srssuite.com`                   |
| Login OK en browser, falla en contenedor | DNS de `main` → otro server o `172.17.0.1` | `extra_hosts: main.srssuite.com:IP`                       |
| 500 en `/api/face/*`                     | CSF bloquea Docker → `:3002`               | Regla CSF + `FACE_RECOGNITION_URL=http://172.20.0.1:3002` |
| 500 pelado en TODO `/api/srs-kpis/*` (cuelga y explota) con contenedores "healthy" y PHP andando | CSF pisó las cadenas de Docker → tráfico contenedor→contenedor muerto (FORWARD). Test: `docker exec srs-payroll-dashboard wget -qO- http://srs-backend:3020/api/health` cuelga | `systemctl restart docker` ya; regla FORWARD en `csfpre.sh` para siempre (sección CSF) |
| KPIs en blanco / 502                     | Falta `BACKEND_API_URL` o backend caído    | Archivo A + `docker compose logs srs-backend`             |
| Backend unhealthy                        | No llega a MariaDB                         | CSF `:3306` + GRANT `172.20.%` + password en Archivo B    |
| KPIs 401                                 | `JWT_SECRET` ≠ `JWT_AUTH` de PHP           | Igualar en Archivo B y `config.php`                       |
| `INSERT/UPDATE command denied to user 'srssui5_srs'@'172.20.x.x'` en una mutación Nest | La cuenta MySQL de Docker (`'srssui5_srs'@'172.20.%'`) nació sólo-lectura; cada feature nueva de Nest que escribe en tablas nuevas necesita su GRANT (los permisos son por tabla, mínimo privilegio). Pasó 2026-08-17 con el alta de invoices genéricas | Como root: `mysql -e "GRANT INSERT, UPDATE ON srssui5_srs.<TABLA> TO 'srssui5_srs'@'172.20.%';"` — sin reiniciar nada. Ya otorgadas: INVOICE_STATEMENT, INVOICE_STATEMENT_INV_REL, LOG_CHANGE, GENERIC_DATA |
| `git pull` y no arranca                  | Faltan Archivos A/B/C                      | Crear envs (no vienen en git)                             |
| Contenedor busca `/opt/srs/...`          | Falta Archivo C                            | Crear `.env` del compose con rutas `/home/srssui5/...`    |

---

## Dev local vs prod (referencia rápida)

|                   | Dev local                             | Prod Docker                                       |
| ----------------- | ------------------------------------- | ------------------------------------------------- |
| Env frontend      | `frontend/.env.local`                 | `/home/srssui5/payroll-dashboard.env` (Archivo A) |
| Env backend       | `backend/.env`                        | `/home/srssui5/srs-backend.env` (Archivo B)       |
| Next              | `npm run dev` :3000                   | contenedor :3010                                  |
| Nest              | `npm run start` :3020                 | contenedor :3020                                  |
| `BACKEND_API_URL` | `http://localhost:3020`               | `http://srs-backend:3020`                         |
| Face              | `http://localhost:3008` (o tu PM2)    | `http://172.20.0.1:3002`                          |
| DB Nest           | `host.docker.internal:3307` (php-dev) | `host.docker.internal:3306`                       |
