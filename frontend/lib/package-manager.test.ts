/**
 * Un solo gestor de paquetes y el mismo bundler en dev y en build (plans/plan-buenas-practicas-v0, etapa 1, 1.5).
 *
 * Con dos lockfiles, lo que se prueba en la Mac (pnpm) no es lo que sale a producción (el Dockerfile instalaba con
 * npm): ya resolvían React y Tailwind en versiones distintas. Y con `next dev --webpack` y `next build` en Turbopack,
 * un error de bundling aparecía recién en el build (doc de Next: `03-api-reference/08-turbopack.md`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { FRONTEND_ROOT } from './testing/import-graph'

const pkg = JSON.parse(readFileSync(join(FRONTEND_ROOT, 'package.json'), 'utf8'))
const dockerfile = readFileSync(join(FRONTEND_ROOT, 'Dockerfile'), 'utf8')

/** `true` si el comando de Next pide webpack. */
export function usesWebpack(command: string): boolean {
  return /\s--webpack\b/.test(command)
}

describe('gestor de paquetes', () => {
  it('solo pnpm-lock.yaml: no conviven package-lock.json ni yarn.lock', () => {
    expect(existsSync(join(FRONTEND_ROOT, 'pnpm-lock.yaml'))).toBe(true)
    expect(existsSync(join(FRONTEND_ROOT, 'package-lock.json'))).toBe(false)
    expect(existsSync(join(FRONTEND_ROOT, 'yarn.lock'))).toBe(false)
  })

  it('package.json fija la versión de pnpm', () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
  })

  it('el Dockerfile instala con pnpm y el lockfile congelado', () => {
    expect(dockerfile).toMatch(/pnpm install --frozen-lockfile/)
    expect(dockerfile).toMatch(/COPY package\.json pnpm-lock\.yaml/)
    expect(dockerfile).not.toMatch(/npm ci|package-lock/)
  })
})

describe('bundler', () => {
  it('dev y build usan el mismo bundler', () => {
    expect(usesWebpack(pkg.scripts.dev)).toBe(usesWebpack(pkg.scripts.build))
  })

  it('el detector ve --webpack', () => {
    expect(usesWebpack('next dev --webpack')).toBe(true)
    expect(usesWebpack("NODE_OPTIONS='x' next build --webpack")).toBe(true)
    expect(usesWebpack('next dev')).toBe(false)
  })
})
