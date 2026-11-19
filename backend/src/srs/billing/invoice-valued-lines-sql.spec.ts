/**
 * T1 of plans/plan-reporte-javier/PLAN.md: the valued-lines engine moved out of
 * InvoiceRepository.exportWoValuedLines without changing the «Invoice with Wo Details» Excel.
 * `__fixtures__/wo-valued-lines-before-t1.json` is the SQL and params exportWoValuedLines sent before
 * the move (captured from main on 11/17/2026 with three filters). The only allowed change is the
 * `puesto` column of `lin`, which the export does not read (its mapping takes named columns).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { InvoiceRepository } from './repository/invoice.repository'
import { VALUED_LINES_PUESTO_COLUMN, bindSqlParams } from './invoice-valued-lines-sql'

type Captured = { sql: string; params: unknown[] }

const before: Captured[] = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'wo-valued-lines-before-t1.json'), 'utf8'),
)

async function captureNow(): Promise<Captured[]> {
  const calls: Captured[] = []
  const repo = new InvoiceRepository({
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params })
      return []
    },
  } as never)
  await repo.exportWoValuedLines({ idDealerProvider: 79, invoiceServiceIds: [], departmentIds: [], payed: '' } as never, [101, 202])
  await repo.exportWoValuedLines({ idDealerProvider: 79, invoiceServiceIds: [5, 6], departmentIds: [7], payed: '0' } as never, [303])
  await repo.exportWoValuedLines({ idDealerProvider: 79, invoiceServiceIds: [], departmentIds: [], payed: '1' } as never, [404])
  return calls
}

describe('exportWoValuedLines after T1 (shared engine)', () => {
  it('sends the same SQL as before, except the puesto column of lin, and the same params', async () => {
    const now = await captureNow()
    expect(now).toHaveLength(before.length)
    now.forEach((call, i) => {
      expect(call.sql.split(VALUED_LINES_PUESTO_COLUMN)).toHaveLength(2)
      expect(call.sql.replace(VALUED_LINES_PUESTO_COLUMN, '')).toBe(before[i].sql)
      expect(call.params).toEqual(before[i].params)
    })
  })

  it('does not query with no invoices', async () => {
    const repo = new InvoiceRepository({ query: async () => { throw new Error('no query expected') } } as never)
    await expect(repo.exportWoValuedLines({ idDealerProvider: 79 } as never, [])).resolves.toEqual([])
  })
})

describe('bindSqlParams', () => {
  it('keeps the order of ? and :prov', () => {
    const b = bindSqlParams('a = ? AND p = :prov AND b = ? AND q = :prov', 79, ['x', 'y'])
    expect(b.sql).toBe('a = ? AND p = ? AND b = ? AND q = ?')
    expect(b.params).toEqual(['x', 79, 'y', 79])
  })

  it('does not touch :provider or other names', () => {
    expect(bindSqlParams(':provider :prov', 1).sql).toBe(':provider ?')
  })

  it('throws when the counts do not match', () => {
    expect(() => bindSqlParams('? ?', 1, ['a'])).toThrow()
    expect(() => bindSqlParams('?', 1, ['a', 'b'])).toThrow()
  })
})
