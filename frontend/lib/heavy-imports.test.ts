/**
 * Lo pesado se carga al usarse (plans/plan-buenas-practicas-v0, etapa 1, 1.6; doc de Next
 * `02-guides/lazy-loading.md`; https://motion.dev/docs/react-reduce-bundle-size).
 *
 * Falla si un archivo de la app importa estático y con valor `exceljs` (va con `await import()` al exportar);
 * si importa `recharts` fuera de la lista cerrada; si importa estático un gráfico que solo se carga por `next/dynamic`;
 * o si importa de `framer-motion` algo que no sea `m`, `LazyMotion`, `AnimatePresence` o las funciones (`domMax`).
 */
import { describe, expect, it } from 'vitest'

import { listSourceFiles, parseImports, readSource, resolveLocal, type ImportRef } from './testing/import-graph'

/** Se cargan solo con `import()`. */
const ON_DEMAND_PACKAGES = ['exceljs']

/**
 * Los únicos que importan recharts. En el inicio e Income by Dealer el gráfico es lo principal de la pantalla y se ve al
 * entrar: diferirlo no ahorra (cada ruta ya lleva solo lo suyo) y agrega un salto. Los 5 de Business KPIs van cada uno
 * en una solapa y se cargan con `next/dynamic`.
 */
const RECHARTS_ALLOWED = new Set([
  'app/(dashboard)/page.tsx',
  'app/(dashboard)/reports/income-by-dealer/page.tsx',
  'components/dashboard/production-week-chart.tsx',
  'components/dashboard/billing-week-chart.tsx',
  'components/dashboard/unbilled-aging-chart.tsx',
  'components/dashboard/invoice-collection-month-chart.tsx',
  'components/dashboard/payroll-by-type-chart.tsx',
])

/** Gráficos que solo se cargan por `next/dynamic`: nadie los importa estático. */
const DYNAMIC_ONLY_FILES = new Set([
  'components/dashboard/production-week-chart.tsx',
  'components/dashboard/billing-week-chart.tsx',
  'components/dashboard/unbilled-aging-chart.tsx',
  'components/dashboard/invoice-collection-month-chart.tsx',
  'components/dashboard/payroll-by-type-chart.tsx',
])

const MOTION_ALLOWED_NAMES = new Set(['m', 'LazyMotion', 'AnimatePresence', 'domAnimation', 'domMax'])

/** Nombres que trae un `import { a, b as c }` (el nombre exportado, no el local). */
export function importedNames(clause: string): string[] {
  const braces = clause.match(/\{([\s\S]*)\}/)
  const named = braces
    ? braces[1]
        .split(',')
        .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
    : []
  const rest = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim()
  if (rest.startsWith('* as')) return [...named, '*']
  if (rest) return [...named, 'default']
  return named
}

/** Problemas de un archivo según las reglas de arriba. */
export function heavyImportProblems(file: string, refs: ImportRef[]): string[] {
  const problems: string[] = []
  for (const ref of refs) {
    if (ref.typeOnly || ref.dynamic) continue
    const pkg = ref.specifier
    if (ON_DEMAND_PACKAGES.includes(pkg)) {
      // `import { type A, type B } from 'exceljs'` no trae la librería; cualquier otra forma sí.
      const clause = ref.clause.trim()
      const inlineTypesOnly =
        /^\{[\s\S]*\}$/.test(clause) &&
        clause
          .slice(1, -1)
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .every((part) => part.startsWith('type '))
      if (!inlineTypesOnly) problems.push(`${file}: importa ${pkg} estático (va con await import())`)
    }
    if (pkg === 'recharts' && !RECHARTS_ALLOWED.has(file)) problems.push(`${file}: importa recharts`)
    if (pkg === 'framer-motion') {
      const bad = importedNames(ref.clause).filter((n) => !MOTION_ALLOWED_NAMES.has(n))
      if (bad.length > 0) problems.push(`${file}: importa ${bad.join(', ')} de framer-motion (usar m dentro de LazyMotion)`)
    }
    const local = resolveLocal(file, ref.specifier)
    if (local && DYNAMIC_ONLY_FILES.has(local)) problems.push(`${file}: importa estático ${local} (va con next/dynamic)`)
  }
  return problems
}

const APP_DIRS = ['app/', 'components/', 'lib/', 'hooks/']

describe('imports pesados', () => {
  it('exceljs, recharts, los gráficos de Business KPIs y framer-motion se cargan como corresponde', () => {
    const problems: string[] = []
    for (const file of listSourceFiles()) {
      if (!APP_DIRS.some((d) => file.startsWith(d)) || file.endsWith('.css')) continue
      if (/\.test\.(tsx?|mjs)$/.test(file) || file.startsWith('lib/testing/')) continue
      problems.push(...heavyImportProblems(file, parseImports(readSource(file))))
    }
    expect(problems).toEqual([])
  })
})

describe('el detector', () => {
  const check = (file: string, code: string) => heavyImportProblems(file, parseImports(code))

  it('marca exceljs estático y deja pasar import type e import()', () => {
    expect(check('lib/a.ts', "import * as XLSX from 'exceljs'")).toHaveLength(1)
    expect(check('lib/a.ts', "import ExcelJS from 'exceljs'")).toHaveLength(1)
    expect(check('lib/a.ts', "import { utils } from 'exceljs'")).toHaveLength(1)
    expect(check('lib/a.ts', "import type ExcelJS from 'exceljs'")).toEqual([])
    expect(check('lib/a.ts', "import type { WorkSheet } from 'exceljs'")).toEqual([])
    expect(check('lib/a.ts', "const XLSX = await import('exceljs')")).toEqual([])
  })

  it('recharts solo en la lista', () => {
    expect(check('components/x.tsx', "import { BarChart } from 'recharts'")).toHaveLength(1)
    expect(check('app/(dashboard)/page.tsx', "import { BarChart } from 'recharts'")).toEqual([])
  })

  it('un gráfico de Business KPIs importado estático', () => {
    expect(
      check('app/(dashboard)/reports/business-kpis/page.tsx', "import { BillingWeekChart } from '@/components/dashboard/billing-week-chart'"),
    ).toHaveLength(1)
  })

  it('framer-motion: motion no, m sí', () => {
    expect(check('components/x.tsx', "import { motion } from 'framer-motion'")).toHaveLength(1)
    expect(check('components/x.tsx', "import { m, AnimatePresence } from 'framer-motion'")).toEqual([])
    expect(check('components/x.tsx', "import { m as motion } from 'framer-motion'")).toEqual([])
  })
})
