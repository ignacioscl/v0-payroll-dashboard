/**
 * Todo pedido del servidor a otro servicio tiene tiempo máximo (regla `.cursor/rules/payroll-api-proxy.mdc`;
 * plans/plan-buenas-practicas-v0, 2.6): en `app/api` y en los archivos de `lib/` que corren en el servidor, ningún
 * `fetch(` suelto. Pasan por `fetchWithHeadersTimeout` (`lib/upstream-fetch.ts`) o sus envoltorios.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')
const RAW_FETCH = /(^|[^.\w])fetch\(/m
/** Un archivo de lib/ corre en el servidor si usa next/server, node:* o variables de entorno del servidor. */
const SERVER_MARK = /from 'next\/server'|from 'node:|process\.env\.(SRS_|BACKEND_|FACE_|SRS_NODE)/

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(full)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : []
  })
}

describe('ningún fetch suelto del servidor', () => {
  it('app/api y lib/ del servidor usan fetchWithHeadersTimeout', () => {
    const candidates = [
      ...files(join(ROOT, 'app', 'api')),
      ...files(join(ROOT, 'lib')).filter((f) => SERVER_MARK.test(readFileSync(f, 'utf-8'))),
    ]
    const offenders = candidates
      .filter((f) => !f.endsWith(join('lib', 'upstream-fetch.ts')))
      .filter((f) => RAW_FETCH.test(readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
      .map((f) => relative(ROOT, f))
    expect(offenders).toEqual([])
  })

  it('el patrón detecta un fetch suelto y deja pasar los envoltorios', () => {
    expect(RAW_FETCH.test("const r = await fetch(url, { cache: 'no-store' })")).toBe(true)
    expect(RAW_FETCH.test('return fetch(target)')).toBe(true)
    expect(RAW_FETCH.test('await fetchBackend(path, token)')).toBe(false)
    expect(RAW_FETCH.test('await fetchWithHeadersTimeout(url, init, ms)')).toBe(false)
    expect(RAW_FETCH.test('await srsFetch(path)')).toBe(false)
  })
})
