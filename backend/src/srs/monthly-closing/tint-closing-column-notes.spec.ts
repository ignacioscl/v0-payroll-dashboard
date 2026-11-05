import { readFileSync } from 'fs'
import { join } from 'path'
import { TINT_CLOSING_COLUMN_NOTES_IN_ORDER } from './tint-closing-column-notes'

/**
 * P9 of plans/plan-reporte-tint: the cartel of the screen (frontend en.ts `reportRules.tintClosing.itemN`)
 * and the notes on the Excel headers say the same, word by word. The catalog is read as text because the
 * frontend is another package.
 */
function cartelItems(): string[] {
  const enPath = join(__dirname, '../../../../frontend/lib/i18n/messages/en.ts')
  const source = readFileSync(enPath, 'utf8')
  const start = source.indexOf('tintClosing: {')
  expect(start).toBeGreaterThan(-1)
  const block = source.slice(start, source.indexOf('\n    },', start))
  const items: string[] = []
  const re = /item(\d+):\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g
  for (let m = re.exec(block); m; m = re.exec(block)) {
    items[Number(m[1]) - 1] = m[3].replace(/\\(.)/g, '$1')
  }
  return items
}

describe('Window Tint Closing: cartel = notes of the Excel', () => {
  it('has one cartel item per column, with the same text', () => {
    expect(cartelItems()).toEqual([...TINT_CLOSING_COLUMN_NOTES_IN_ORDER])
  })
})
