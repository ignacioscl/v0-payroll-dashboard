# Proyecto

Backend SRS Suite

## Installation

```bash
$ npm install
```

## DB init / Migration

```bash
npm run typeorm -- migration:create src/migrations/{name}
```

ejemplo para crear una migracion empty

```bash
npm run typeorm -- migration:create src/migrations/initDB
```

## DB run

```bash
npm run typeorm -- migration:run -d src/typeorm.config.ts
```

## Features

### Generate

To generate modules you must execute the following command

`yarn create-feature <MODULE_NAME>`

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
en la vps $pm2 start ecosystem.config.js
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

# 1. Crear tu archivo .env.prod con las variables de producción

cp .env .env.prod

# Edita .env.prod con los valores de producción

# 2. Iniciar con PM2

pm2 start ecosystem.config.js

# 3. Ver que esté usando el archivo correcto

pm2 show srs-suite-backend

backend/
├── .env.dev # Variables para desarrollo
├── .env.prod # Variables para producción
├── .env.local # Variables locales (git ignored)
└── ecosystem.config.M2
pm2 start ecosystem.config.js

# 3. Ver que esté usando el archivo correcto

pm2 show srs-suite-backend

```

# .env.prod
NODE_ENV=production
PORT=8100
API_ENDPOINT=https://tu-dominio-produccion.com

# Base de datos de producción
DB_CONNECTION=mysql
DB_HOST=tu-servidor-prod.com
DB_PORT=3306
DB_USERNAME=usuario_prod
DB_PASSWORD=password_seguro_prod
DB_DATABASE=db_prod
DB_LOGGING=false

# JWT con secretos de producción
JWT_SECRET=secreto_jwt_super_seguro_para_produccion
TOKEN_EXPIRES_IN=1h
REFRESH_EXPIRES_IN=7d

# Admin inicial
INIT_ADMIN=admin@tudominio.com
INIT_ADMIN_PASSWORD=password_admin_seguro

# Sentry para producción
SENTRY_DSN=tu_sentry_dsn_prod
```
