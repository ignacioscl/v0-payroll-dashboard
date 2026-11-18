import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { openInvoicesExportLabels } from './open-invoices-export-labels'

/**
 * §4.2 T5 and §7.3 of plans/plan-reporte-javier: the cartel of the screen (frontend `reportRules.openInvoices` and
 * `reportRules.openInvoicesCompare`, EN and ES) and the lines of Report Info of the Excel say the same, word by
 * word. The catalogs are read as text because the frontend is another package.
 */
const dir = join(__dirname, '../../../../frontend/lib/i18n/messages')
// Inside the backend Docker image there is no frontend: the check runs in the local gate.
const frontPresent = existsSync(join(dir, 'en.ts'))
if (!frontPresent) console.warn('SKIPPED open-invoices-labels.spec.ts: the frontend is not here (backend Docker build)')

/** The `itemN` and `title` of one block of `reportRules` in a catalog. */
function cartel(file: string, block: string): { title: string; items: string[] } {
  const source = readFileSync(join(dir, file), 'utf8')
  const rr = source.indexOf('  reportRules: {')
  expect(rr).toBeGreaterThan(-1)
  const start = source.indexOf(`    ${block}: {`, rr)
  expect(start).toBeGreaterThan(-1)
  const body = source.slice(start, source.indexOf('\n    },', start))
  const unquote = (raw: string) => JSON.parse(raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"` : raw) as string
  const value = (key: string) => {
    const m = new RegExp(`${key}:\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`).exec(body)
    return m ? unquote(m[1]) : ''
  }
  const items: string[] = []
  for (let i = 1; value(`item${i}`); i++) items.push(value(`item${i}`))
  return { title: value('title'), items }
}

;(frontPresent ? describe : describe.skip)('Open Invoices: cartel = Report Info', () => {
  it.each([
    ['en', 'en.ts'],
    ['es', 'es.ts'],
  ] as const)('%s: the 8 lines of the report and the 4 of the comparison, word by word', (locale, file) => {
    const labels = openInvoicesExportLabels(locale)
    expect(cartel(file, 'openInvoices')).toEqual({ title: labels.rulesTitle, items: [...labels.rules] })
    expect(cartel(file, 'openInvoicesCompare')).toEqual({ title: labels.compareRulesTitle, items: [...labels.compareRules] })
  })
})
