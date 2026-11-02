import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { RecurringRuleDto, SplitTypeDto, UpdateRecurringRuleDto } from './expense-repetitive.dto'

async function fieldsOf<T extends object>(cls: new () => T, input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, input), { whitelist: true })
  return errors.map((e) => e.property)
}

const valid = {
  description: 'Insurance',
  idCompany: 10,
  idCategory: 20,
  amount: '5100.00',
  splitType: 'percent',
  frequency: 'weekly',
  weekDay: 1,
  startDate: '2026-11-02',
  endDate: null,
}

describe('RecurringRuleDto (pareja de frontend/lib/expenses/recurring-form-schema.ts) — lo que rechaza', () => {
  it('acepta una regla válida', async () => {
    expect(await fieldsOf(RecurringRuleDto, valid)).toEqual([])
  })

  it.each([
    ['description vacía', { description: '   ' }, 'description'],
    ['description de más de 64', { description: 'x'.repeat(65) }, 'description'],
    ['amount con letras', { amount: 'abc' }, 'amount'],
    ['amount con tres decimales', { amount: '1.234' }, 'amount'],
    ['splitType inválido', { splitType: 'equal' }, 'splitType'],
    ['frequency inválida', { frequency: 'daily' }, 'frequency'],
    ['weekDay 7', { weekDay: 7 }, 'weekDay'],
    ['weekDay negativo', { weekDay: -1 }, 'weekDay'],
    ['startDate vacía', { startDate: '' }, 'startDate'],
    ['startDate en formato US', { startDate: '11/02/2026' }, 'startDate'],
    ['endDate mal formada', { endDate: '2026-11' }, 'endDate'],
  ])('rechaza %s en su campo', async (_name, patch, field) => {
    expect(await fieldsOf(RecurringRuleDto, { ...valid, ...patch })).toContain(field)
  })

  it('endDate vacía pasa a null (Forever)', () => {
    const dto = plainToInstance(RecurringRuleDto, { ...valid, endDate: '' })
    expect(dto.endDate).toBeNull()
  })

  it('UpdateRecurringRuleDto es parcial y no acepta splitType (se cambia por /split)', async () => {
    expect(await fieldsOf(UpdateRecurringRuleDto, { description: 'Nuevo' })).toEqual([])
    const dto = plainToInstance(UpdateRecurringRuleDto, { splitType: 'fixed' }) as unknown as Record<string, unknown>
    const errors = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true })
    expect(errors.map((e) => e.property)).toContain('splitType')
  })

  it('SplitTypeDto solo acepta percent o fixed', async () => {
    expect(await fieldsOf(SplitTypeDto, { splitType: 'fixed' })).toEqual([])
    expect(await fieldsOf(SplitTypeDto, { splitType: 'equal' })).toContain('splitType')
  })
})
