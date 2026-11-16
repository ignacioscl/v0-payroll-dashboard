/**
 * Enlaces internos (plans/plan-buenas-practicas-v0, 4.8, P2; regla global «Cambiar de pantalla es instantáneo», punto
 * 1; `.cursor/rules/navigation.mdc`). El `<a href="/…">` interno lo prohíbe ESLint (3.2.2); acá:
 * - `next/link` solo en el componente de enlace común (`components/shared/app-link.tsx`);
 * - `router.push` / `router.replace` solo después de una acción, en una lista cerrada con su motivo;
 * - nada navega con `window.location` (cerrar sesión y volver al legacy van por un formulario POST).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const sources = ['app', 'components', 'lib', 'hooks']
  .flatMap((d) => walk(path.join(ROOT, d)))
  .map((f) => ({ file: path.relative(ROOT, f), src: fs.readFileSync(f, 'utf8') }))

/** Únicos lugares con `router.push` / `router.replace`, y por qué. */
const ROUTER_NAVIGATION_ALLOWED: Record<string, string> = {
  'components/auth/login-form.tsx': 'después de ingresar',
  'components/filters/employee-search-input.tsx': 'después de elegir un empleado',
  'app/(dashboard)/expenses/page.tsx': 'limpia la dirección después de aplicar sus filtros',
  'app/(dashboard)/issues/page.tsx': 'limpia la dirección después de aplicar sus filtros',
}

describe('enlaces internos', () => {
  it("`from 'next/link'` solo en components/shared/app-link.tsx", () => {
    const offenders = sources
      .filter(({ src }) => /from ['"]next\/link['"]/.test(src))
      .map(({ file }) => file)
    expect(offenders).toEqual(['components/shared/app-link.tsx'])
  })

  it('router.push / router.replace solo en la lista cerrada', () => {
    const offenders = sources
      .filter(({ src }) => /\brouter\.(push|replace)\(/.test(src))
      .map(({ file }) => file)
      .filter((file) => !(file in ROUTER_NAVIGATION_ALLOWED))
    expect(offenders).toEqual([])
  })

  it('nada navega con window.location', () => {
    const offenders = sources
      .filter(({ src }) => /\bwindow\.location\b|\blocation\.(href|assign|replace)\b/.test(src))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })
})
