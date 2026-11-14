# Payroll dashboard (Next.js) — production image
# PHP / face / otros servicios corren en el host con PM2; este contenedor solo expone v0.
# Un solo gestor de paquetes: pnpm, la versión fija de `packageManager` en package.json (corepack la baja).

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Identificador del deploy (plans/plan-buenas-practicas-v0, 2.11): Next lo guarda en el build, agrega `?dpl=` a los
# archivos y recarga una pestaña vieja en el próximo clic. Sin él el build falla en vez de salir sin protección:
# DEPLOYMENT_ID=$(git rev-parse --short HEAD) docker compose up -d --build
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
RUN test -n "$NEXT_DEPLOYMENT_ID" || (echo "Falta DEPLOYMENT_ID: DEPLOYMENT_ID=\$(git rev-parse --short HEAD) docker compose up -d --build" && exit 1)
RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3010

CMD ["node", "server.js"]
