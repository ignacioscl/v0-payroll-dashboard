/**
 * Estructura de la navegación (plans/plan-buenas-practicas-v0, 4.8, P1; regla global «Cambiar de pantalla es
 * instantáneo», puntos 2 y 3; `.cursor/rules/navigation.mdc`):
 * - ninguna pantalla dibuja el marco (menú, barra): va en el layout;
 * - todo nivel con layout y toda carpeta con más de una pantalla tiene su `loading.tsx` con el esqueleto;
 * - ningún `Suspense` deja la pantalla en blanco.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
const rel = (p: string) => path.relative(ROOT, p)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const appFiles = walk(path.join(ROOT, 'app'))
const DASHBOARD = path.join(ROOT, 'app', '(dashboard)')

describe('el marco va en el layout', () => {
  it('ningún page.tsx ni loading.tsx importa sidebar, header ni main-layout', () => {
    const frame = /from ['"]@\/components\/layout\/(sidebar|header|main-layout)['"]/
    const offenders = appFiles
      .filter((f) => /\/(page|loading)\.tsx$/.test(f))
      .filter((f) => frame.test(fs.readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('loading.tsx por nivel', () => {
  it('toda carpeta del panel con layout.tsx o con más de una pantalla debajo tiene loading.tsx', () => {
    const dirs = [DASHBOARD, ...walk(DASHBOARD).map(path.dirname)].filter((d, i, all) => all.indexOf(d) === i)
    const pagesUnder = (dir: string) => walk(dir).filter((f) => f.endsWith(`${path.sep}page.tsx`)).length
    const missing = dirs
      .filter((dir) => fs.existsSync(path.join(dir, 'layout.tsx')) || pagesUnder(dir) > 1)
      .filter((dir) => !fs.existsSync(path.join(dir, 'loading.tsx')))
      .map(rel)
    expect(missing).toEqual([])
  })

  it('cada loading.tsx del panel dibuja el esqueleto común', () => {
    const loadings = walk(DASHBOARD).filter((f) => f.endsWith(`${path.sep}loading.tsx`))
    expect(loadings.length).toBeGreaterThan(0)
    for (const f of loadings) expect(fs.readFileSync(f, 'utf8'), rel(f)).toContain('<ContentSkeleton />')
  })
})

describe('ningún Suspense en blanco', () => {
  it('ningún archivo de app/ ni components/ tiene fallback={null} ni un <Suspense> sin fallback', () => {
    const files = [...appFiles, ...walk(path.join(ROOT, 'components'))].filter((f) => /\.tsx?$/.test(f))
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8')
        return /fallback=\{null\}/.test(src) || /<(React\.)?Suspense\s*>/.test(src)
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})
