/**
 * Grafo de imports del front, para los controles que leen el código (archivos y dependencias sin uso,
 * imports pesados). Solo lo usan los tests: nada de la app lo importa.
 *
 * Lee `import … from`, `export … from`, `import('…')`, `require('…')` y los `@import` de CSS. Resuelve `@/…`
 * (alias de `tsconfig.json`) y rutas relativas; lo demás es un paquete.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

export const FRONTEND_ROOT = resolve(__dirname, '..', '..')

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SKIP_DIRS = new Set(['node_modules', '.next', 'test-results', 'playwright-report', 'public'])

/** Archivos especiales de `app/` que Next carga solo (raíces del grafo). */
const NEXT_SPECIAL_FILES = new Set([
  'page',
  'layout',
  'route',
  'loading',
  'error',
  'global-error',
  'not-found',
  'forbidden',
  'unauthorized',
  'template',
  'default',
  'opengraph-image',
  'twitter-image',
  'icon',
  'apple-icon',
  'sitemap',
  'robots',
  'manifest',
])

/** Archivos de la raíz que carga una herramienta (Next, Playwright, Vitest, PostCSS). */
const ROOT_ENTRY_FILES = [
  'next.config.mjs',
  'next.config.ts',
  'playwright.config.ts',
  'vitest.config.ts',
  'postcss.config.mjs',
  'instrumentation.ts',
  'instrumentation-client.ts',
  'proxy.ts',
  'middleware.ts',
  'next-env.d.ts',
]

export function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/** Todos los archivos de código y CSS bajo `dir` (ruta relativa al front, con `/`). */
export function listSourceFiles(dir = FRONTEND_ROOT): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(current, name)
      if (statSync(full).isDirectory()) walk(full)
      else if ([...CODE_EXTENSIONS, '.css'].some((ext) => name.endsWith(ext))) {
        out.push(toPosix(relative(FRONTEND_ROOT, full)))
      }
    }
  }
  walk(dir)
  return out.sort()
}

export function readSource(file: string): string {
  return readFileSync(join(FRONTEND_ROOT, file), 'utf8')
}

/** Especificadores que importa un archivo (con su forma: `type` si es solo de tipos). */
export interface ImportRef {
  specifier: string
  typeOnly: boolean
  dynamic: boolean
  /** Lo que se importa, tal cual (`* as X`, `{ a, b }`, `X`), vacío en `import 'x'` y en dinámicos. */
  clause: string
}

/** Saca comentarios de línea y de bloque (los que no están dentro de un string simple). */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

export function parseImports(code: string, isCss = false): ImportRef[] {
  const refs: ImportRef[] = []
  if (isCss) {
    for (const m of code.matchAll(/@(?:import|plugin|reference)\s+['"]([^'"]+)['"]/g)) {
      refs.push({ specifier: m[1], typeOnly: false, dynamic: false, clause: '' })
    }
    return refs
  }
  const src = stripComments(code)
  for (const m of src.matchAll(/(?:^|[\s;])import\s+(type\s+)?([^'"`;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    refs.push({ specifier: m[3], typeOnly: Boolean(m[1]), dynamic: false, clause: m[2].trim() })
  }
  for (const m of src.matchAll(/(?:^|[\s;])import\s+['"]([^'"]+)['"]/g)) {
    refs.push({ specifier: m[1], typeOnly: false, dynamic: false, clause: '' })
  }
  for (const m of src.matchAll(/(?:^|[\s;])export\s+(type\s+)?(?:\*|\{[\s\S]*?\})(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/g)) {
    refs.push({ specifier: m[2], typeOnly: Boolean(m[1]), dynamic: false, clause: '' })
  }
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    refs.push({ specifier: m[1], typeOnly: false, dynamic: true, clause: '' })
  }
  for (const m of src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    refs.push({ specifier: m[1], typeOnly: false, dynamic: false, clause: '' })
  }
  return refs
}

/** Nombre del paquete de un especificador (`@scope/pkg/x` → `@scope/pkg`); `null` si es un archivo propio. */
export function packageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/')) return null
  if (specifier.startsWith('node:')) return null
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function resolveFile(base: string): string | null {
  const candidates = [base, ...CODE_EXTENSIONS.map((ext) => base + ext), ...CODE_EXTENSIONS.map((ext) => join(base, 'index' + ext))]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** Archivo propio al que apunta un especificador, relativo al front; `null` si es un paquete. */
export function resolveLocal(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(FRONTEND_ROOT, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(FRONTEND_ROOT, dirname(fromFile), specifier)
  else return null
  const hit = resolveFile(base)
  return hit ? toPosix(relative(FRONTEND_ROOT, hit)) : null
}

function isEntry(file: string): boolean {
  if (ROOT_ENTRY_FILES.includes(file)) return true
  if (file.startsWith('e2e/')) return true
  if (/\.test\.(tsx?|mjs)$/.test(file)) return true
  if (file === 'app/globals.css') return true
  if (file.startsWith('app/')) {
    const name = file.split('/').pop()!.replace(/\.[^.]+$/, '')
    return NEXT_SPECIAL_FILES.has(name)
  }
  return false
}

/** Archivos alcanzables desde las raíces (archivos especiales de Next, tests, e2e, configs, `globals.css`). */
export function reachableFiles(files = listSourceFiles()): Set<string> {
  const seen = new Set<string>()
  const queue = files.filter(isEntry)
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const ref of parseImports(readSource(file), file.endsWith('.css'))) {
      const local = resolveLocal(file, ref.specifier)
      if (local && !seen.has(local)) queue.push(local)
    }
  }
  return seen
}

/** Paquetes que importa algún archivo del front (código, CSS y configs). */
export function importedPackages(files = listSourceFiles()): Set<string> {
  const out = new Set<string>()
  for (const file of files) {
    for (const ref of parseImports(readSource(file), file.endsWith('.css'))) {
      const pkg = packageName(ref.specifier)
      if (pkg) out.add(pkg)
    }
  }
  return out
}
