import { builtinModules } from 'module'
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'

/**
 * Ninguna dependencia de package.json sin uso (plans/plan-buenas-practicas-v0, cambio 1.1). Cada paquete de
 * `dependencies` y `devDependencies` tiene que importarse en algún archivo de src/, scripts/ o test/, o estar en la
 * lista cerrada de abajo con su motivo. Así no vuelve a quedar instalado algo como `mssql` o `passport` sin que nadie
 * lo use. Si falla: se saca el paquete de package.json (y se corre `npm install`), o, si de verdad se usa sin import,
 * se suma acá con el motivo.
 */
const BACKEND = join(__dirname, '..', '..')
const SCAN_DIRS = ['src', 'scripts', 'test']
const THIS_FILE = __filename

/** Se usan sin `import`: cada una con su motivo. Un paquete de esta lista que sí se importa, sobra en la lista. */
const USED_WITHOUT_IMPORT: Record<string, string> = {
  rimraf: 'scripts prebuild, start y debug (rimraf dist)',
  mkdirp: 'script copy-public',
  ncp: 'script copy-public',
  'swagger-ui-express': 'lo pide @nestjs/swagger para servir la UI de SwaggerModule.setup (main.ts)',
  '@nestjs/cli': 'nest build / nest start (scripts build, start, debug)',
  '@nestjs/schematics': 'collection de nest-cli.json',
  jest: 'script test',
  'ts-jest': 'transform de la config de jest en package.json',
  '@types/jest': 'tipos de los globals de jest (describe, it, expect) en los spec',
  'ts-node': 'scripts typeorm y test:debug; corre scripts/*.ts (npx ts-node -T scripts/payroll-parity.ts)',
  'tsconfig-paths': 'script test:debug (-r tsconfig-paths/register)',
  eslint: 'script lint (.eslintrc.js)',
  '@typescript-eslint/eslint-plugin': 'plugin de .eslintrc.js',
  '@typescript-eslint/parser': 'parser de .eslintrc.js',
  'eslint-config-prettier': 'lo pide plugin:prettier/recommended de .eslintrc.js',
  'eslint-plugin-import': 'plugin:import de .eslintrc.js',
  'eslint-plugin-prettier': 'plugin:prettier/recommended de .eslintrc.js',
  prettier: 'script format (.prettierrc.js)',
}

/** Bucket de los módulos de Node (`fs`, `node:path`): los usa `@types/node`. */
const NODE_BUILTINS = 'node'
const BUILTINS = new Set(builtinModules)
const SPECIFIER = /(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*|\bimport\s+|\bjest\.mock\(\s*)['"]([^'"]+)['"]/g

/** Paquetes que nombra un archivo: `@scope/pkg/sub` → `@scope/pkg`, `pkg/sub` → `pkg`; relativos y `src/` no. */
function importedPackages(text: string): Set<string> {
  const out = new Set<string>()
  const re = new RegExp(SPECIFIER.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const spec = m[1]
    if (spec.startsWith('.') || spec.startsWith('/') || spec === 'src' || spec.startsWith('src/')) continue
    const parts = spec.split('/')
    const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
    out.add(name.startsWith('node:') || BUILTINS.has(name) ? NODE_BUILTINS : name)
  }
  return out
}

/** `@types/foo` → `foo`; `@types/scope__pkg` → `@scope/pkg`; `@types/node` → los módulos de Node. */
function typedPackage(typesName: string): string {
  const bare = typesName.slice('@types/'.length)
  return bare.includes('__') ? `@${bare.replace('__', '/')}` : bare
}

function unusedDependencies(deps: string[], used: Set<string>, allowed: Record<string, string>): string[] {
  return deps.filter((dep) => {
    if (used.has(dep) || dep in allowed) return false
    if (dep.startsWith('@types/')) return !used.has(typedPackage(dep))
    return true
  })
}

function sourceFiles(dir: string): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return [] // test/ puede no existir
  }
  const out: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...sourceFiles(full))
    } else if (/\.(ts|js)$/.test(entry.name) && full !== THIS_FILE) out.push(full)
  }
  return out
}

function packageJson(): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8'))
}

describe('dependencias de package.json sin uso', () => {
  const pkg = packageJson()
  const deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
  const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(BACKEND, d)))
  const used = new Set<string>()
  for (const f of files) for (const p of importedPackages(readFileSync(f, 'utf8'))) used.add(p)

  it('cada dependencia se importa en src/, scripts/ o test/, o está en la lista con su motivo', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(unusedDependencies(deps, used, USED_WITHOUT_IMPORT)).toEqual([])
  })

  it('la lista es cerrada: cada paquete está en package.json y no se importa en ningún lado', () => {
    const notInPackageJson = Object.keys(USED_WITHOUT_IMPORT).filter((p) => !deps.includes(p))
    const importersOf = (p: string) =>
      files
        .filter((f) => importedPackages(readFileSync(f, 'utf8')).has(p))
        .map((f) => relative(BACKEND, f).split(sep).join('/'))
    const importedAnyway = Object.keys(USED_WITHOUT_IMPORT)
      .filter((p) => used.has(p))
      .map((p) => `${p} (${importersOf(p).join(', ')})`)
    expect(notInPackageJson).toEqual([])
    expect(importedAnyway).toEqual([])
    for (const reason of Object.values(USED_WITHOUT_IMPORT)) expect(reason.trim().length).toBeGreaterThan(5)
  })

  it('el detector reconoce cada forma de import', () => {
    const text = [
      "import { A } from 'pkg-a'",
      "import 'pkg-side/config'",
      "import * as B from '@scope/pkg-b/sub/path'",
      "const c = require('pkg-c')",
      "const d = await import('pkg-d')",
      "jest.mock('pkg-e')",
      "export { F } from 'pkg-f'",
      "import { join } from 'path'",
      "import { readFile } from 'node:fs/promises'",
      "import { G } from './local'",
      "import { H } from '../up/x'",
      "import { I } from 'src/commons/x'",
    ].join('\n')
    expect([...importedPackages(text)].sort()).toEqual(
      ['@scope/pkg-b', NODE_BUILTINS, 'pkg-a', 'pkg-c', 'pkg-d', 'pkg-e', 'pkg-f', 'pkg-side'].sort(),
    )
  })

  it('el detector marca lo que no se usa y respeta @types y la lista', () => {
    const used = new Set(['pkg-a', '@scope/pkg-b', NODE_BUILTINS])
    const deps = ['pkg-a', '@scope/pkg-b', 'pkg-unused', '@types/pkg-a', '@types/scope__pkg-b', '@types/node', '@types/pkg-unused', 'tool-x']
    expect(unusedDependencies(deps, used, { 'tool-x': 'script build' })).toEqual(['pkg-unused', '@types/pkg-unused'])
    expect(unusedDependencies(['mssql', 'passport'], used, {})).toEqual(['mssql', 'passport'])
  })
})
