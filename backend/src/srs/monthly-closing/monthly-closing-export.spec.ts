import type { ClosingRowDto } from './dto/monthly-closing.dto'
import { closingSummaryColumns } from './monthly-closing-export'

// «Without dealer» en el Summary del Excel: solo Payroll (plan-reunion-juan-18-11, 19/11). Igual que la pantalla.
const row = (dealerId: number, dealer: string): ClosingRowDto =>
  ({
    dealerId,
    dealer,
    income: 1000,
    payroll: 400,
    expenses: 100,
    profit: 500,
    pct: 50,
    accident: 20,
    vehicles: 3,
    nonTint: false,
  }) as unknown as ClosingRowDto

const values = (scope: 'all' | 'tint', r: ClosingRowDto) =>
  Object.fromEntries(closingSummaryColumns(scope, () => false).map((c) => [c.header, c.value(r)]))

describe('closingSummaryColumns', () => {
  it.each(['all', 'tint'] as const)('%s: Without dealer lleva solo Payroll; las demás celdas van vacías', (scope) => {
    const v = values(scope, row(0, 'Without dealer'))
    expect(v.Dealer).toBe('Without dealer')
    expect(v.Payroll).toBe(400)
    for (const [header, value] of Object.entries(v)) {
      if (header !== 'Dealer' && header !== 'Payroll') expect(value).toBeNull()
    }
  })

  it.each(['all', 'tint'] as const)('%s: un dealer y el Total siguen con todas sus columnas', (scope) => {
    for (const r of [row(7, 'Dealer'), row(-1, 'Total')]) {
      const v = values(scope, r)
      expect(v).toMatchObject({ Income: 1000, Payroll: 400, Expenses: 100, 'Profit/Loss': 500, '%': 50 })
      if (scope === 'tint') expect(v.Vehicles).toBe(3)
    }
  })
})
