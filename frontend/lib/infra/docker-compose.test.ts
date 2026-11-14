/**
 * Infra del deploy (plans/plan-buenas-practicas-v0, 2.13.11): puertos solo en 127.0.0.1, identificador del deploy
 * obligatorio en el build del front y cierre limpio del Nest. Lee `../docker-compose.yml`, que no está dentro de la
 * imagen: cuando el build de Docker corra los tests (etapa 3, gate), este archivo queda afuera.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FRONT = join(__dirname, '..', '..')
const compose = readFileSync(join(FRONT, '..', 'docker-compose.yml'), 'utf-8')
const dockerfile = readFileSync(join(FRONT, 'Dockerfile'), 'utf-8')

/** El bloque de un servicio del compose (desde `  nombre:` hasta el próximo servicio). */
function serviceBlock(name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`)
  expect(start, `servicio ${name}`).toBeGreaterThan(-1)
  const rest = compose.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\nnetworks:/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

function publishedPorts(block: string): string[] {
  const m = /\n {4}ports:\n((?: {6}(?:#.*|- .*)\n)+)/.exec(block)
  if (!m) return []
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).replace(/["']/g, ''))
}

describe('docker-compose y Dockerfile', () => {
  it.each(['payroll-dashboard', 'srs-backend'])('%s publica sus puertos solo en 127.0.0.1', (name) => {
    const ports = publishedPorts(serviceBlock(name))
    expect(ports.length).toBeGreaterThan(0)
    for (const p of ports) expect(p).toMatch(/^127\.0\.0\.1:/)
  })

  it('el front recibe NEXT_DEPLOYMENT_ID en el build', () => {
    expect(serviceBlock('payroll-dashboard')).toMatch(/\n {6}args:\n(?: {8}#.*\n)* {8}NEXT_DEPLOYMENT_ID: \$\{DEPLOYMENT_ID:-\}/)
  })

  it('el front recibe SRS_LEGACY_ORIGINS en el build y el Dockerfile falla sin ella', () => {
    expect(serviceBlock('payroll-dashboard')).toMatch(/ {8}SRS_LEGACY_ORIGINS: \$\{SRS_LEGACY_ORIGINS:-\}/)
    expect(dockerfile).toContain('ARG SRS_LEGACY_ORIGINS')
    expect(dockerfile).toMatch(/RUN test -n "\$SRS_LEGACY_ORIGINS"/)
  })

  it('los dos builds reciben el contexto shared y corren el gate', () => {
    expect(serviceBlock('payroll-dashboard')).toMatch(/additional_contexts:\n {8}shared: \.\/shared/)
    expect(serviceBlock('srs-backend')).toMatch(/additional_contexts:\n {8}shared: \.\/shared/)
    expect(dockerfile).toMatch(/RUN pnpm run lint && pnpm run test:unit/)
    const back = readFileSync(join(FRONT, '..', 'backend', 'Dockerfile'), 'utf-8')
    expect(back).toMatch(/RUN npm run lint && npm run typecheck && npm run test:unit/)
  })

  it('el backend tiene stop_grace_period', () => {
    expect(serviceBlock('srs-backend')).toMatch(/\n {4}stop_grace_period: \d+s/)
  })

  it('los dos montan su carpeta de errores', () => {
    expect(serviceBlock('payroll-dashboard')).toContain('./logs/front:/app/logs')
    expect(serviceBlock('srs-backend')).toContain('./logs/backend:/app/logs')
  })

  it('el Dockerfile del front falla sin NEXT_DEPLOYMENT_ID', () => {
    expect(dockerfile).toContain('ARG NEXT_DEPLOYMENT_ID')
    expect(dockerfile).toMatch(/RUN test -n "\$NEXT_DEPLOYMENT_ID"/)
    expect(dockerfile.indexOf('RUN test -n')).toBeLessThan(dockerfile.indexOf('RUN pnpm run build'))
  })
})
