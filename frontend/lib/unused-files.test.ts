/**
 * Control de archivos y dependencias sin uso (plans/plan-buenas-practicas-v0, etapa 1, cambio 1.8).
 *
 * Arma el grafo de imports desde las raíces (archivos especiales de `app/`, tests, e2e, configs y `app/globals.css`)
 * y falla con la lista de archivos de `components/`, `lib/` y `hooks/` que nadie alcanza. Y falla si una dependencia
 * de `package.json` no la importa ningún archivo. Las excepciones van en una lista cerrada, cada una con su motivo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  FRONTEND_ROOT,
  importedPackages,
  listSourceFiles,
  packageName,
  parseImports,
  reachableFiles,
  resolveLocal,
} from './testing/import-graph'

/** Archivos que nadie importa pero se quedan, con el motivo. */
const UNUSED_FILES_ALLOWED: Record<string, string> = {}

/** Dependencias que ningún archivo importa pero hacen falta, con el motivo. */
const UNIMPORTED_DEPENDENCIES_ALLOWED: Record<string, string> = {
  'react-dom': 'la carga Next para pintar; ningún archivo propio la importa',
  typescript: 'compilador (tsc, next build)',
  '@types/node': 'tipos de Node para tsc',
  '@types/react': 'tipos de React para tsc',
  '@types/react-dom': 'tipos de React DOM para tsc',
  '@types/qs': 'tipos de qs para tsc',
  postcss: 'lo pide @tailwindcss/postcss (postcss.config.mjs)',
  '@tailwindcss/postcss': 'plugin de PostCSS, nombrado como clave en postcss.config.mjs (no es un import)',
}

const CHECKED_DIRS = ['components/', 'lib/', 'hooks/']

describe('archivos sin uso', () => {
  it('todo archivo de components/, lib/ y hooks/ lo alcanza alguna raíz', () => {
    const files = listSourceFiles()
    const reachable = reachableFiles(files)
    const unused = files.filter(
      (f) => CHECKED_DIRS.some((d) => f.startsWith(d)) && !reachable.has(f) && !(f in UNUSED_FILES_ALLOWED),
    )
    expect(unused).toEqual([])
  })

  it('la lista de excepciones no tiene archivos que ya no existen ni que ya se usan', () => {
    const files = new Set(listSourceFiles())
    const reachable = reachableFiles()
    for (const file of Object.keys(UNUSED_FILES_ALLOWED)) {
      expect(files.has(file), file).toBe(true)
      expect(reachable.has(file), file).toBe(false)
    }
  })
})

describe('dependencias sin uso', () => {
  it('toda dependencia de package.json la importa algún archivo', () => {
    const pkg = JSON.parse(readFileSync(join(FRONTEND_ROOT, 'package.json'), 'utf8'))
    const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    const imported = importedPackages()
    const unused = declared.filter((dep) => !imported.has(dep) && !(dep in UNIMPORTED_DEPENDENCIES_ALLOWED))
    expect(unused).toEqual([])
  })
})

describe('el detector', () => {
  it('lee import, export from, import() dinámico, require y @import de CSS', () => {
    const code = [
      "import a from './a'",
      "import type { B } from '@/lib/b'",
      "import * as X from 'xlsx'",
      "import 'side-effect'",
      "export { c } from './c'",
      "const d = await import('exceljs')",
      "const e = require('qs')",
      "// import nope from 'comentado'",
    ].join('\n')
    const refs = parseImports(code)
    expect(refs.map((r) => r.specifier).sort()).toEqual(
      ['./a', './c', '@/lib/b', 'exceljs', 'qs', 'side-effect', 'xlsx'].sort(),
    )
    expect(refs.find((r) => r.specifier === '@/lib/b')?.typeOnly).toBe(true)
    expect(refs.find((r) => r.specifier === 'exceljs')?.dynamic).toBe(true)
    expect(parseImports("@import 'tailwindcss';\n@import 'tw-animate-css';", true).map((r) => r.specifier)).toEqual([
      'tailwindcss',
      'tw-animate-css',
    ])
  })

  it('separa paquetes de archivos propios', () => {
    expect(packageName('@radix-ui/react-dialog')).toBe('@radix-ui/react-dialog')
    expect(packageName('date-fns/locale')).toBe('date-fns')
    expect(packageName('@/lib/utils')).toBeNull()
    expect(packageName('./x')).toBeNull()
    expect(packageName('node:fs')).toBeNull()
  })

  it('resuelve el alias @/ y las rutas relativas a archivos que existen', () => {
    expect(resolveLocal('lib/unused-files.test.ts', '@/lib/utils')).toBe('lib/utils.ts')
    expect(resolveLocal('lib/unused-files.test.ts', './testing/import-graph')).toBe('lib/testing/import-graph.ts')
    expect(resolveLocal('lib/unused-files.test.ts', 'xlsx')).toBeNull()
  })

  it('los archivos especiales de app/ son raíces y lo que importan queda alcanzado', () => {
    const reachable = reachableFiles()
    expect(reachable.has('app/layout.tsx')).toBe(true)
    expect(reachable.has('lib/utils.ts')).toBe(true)
  })
})
