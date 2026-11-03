import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { AddDealersDto, AssignDto } from './expense-dealer-assign.dto'

async function fieldsOf<T extends object>(cls: new () => T, input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, input), { whitelist: true })
  return errors.map((e) => e.property)
}

describe('AssignDto / AddDealersDto (tabla de dealers de la regla) — lo que rechazan', () => {
  it('AssignDto acepta Automatic, un porcentaje Manual y un monto fijo bien formados', async () => {
    expect(await fieldsOf(AssignDto, { automatic: true })).toEqual([])
    expect(await fieldsOf(AssignDto, { automatic: false, percentage: '33.33' })).toEqual([])
    expect(await fieldsOf(AssignDto, { fixedAmount: 3500 })).toEqual([])
    expect(await fieldsOf(AssignDto, { percentage: '0', allowAnyTotal: '1' })).toEqual([])
  })

  it.each([
    ['porcentaje con letras', { percentage: 'abc' }, 'percentage'],
    ['porcentaje con tres decimales', { percentage: '10.123' }, 'percentage'],
    ['porcentaje negativo', { percentage: '-1' }, 'percentage'],
    ['monto con letras', { fixedAmount: 'abc' }, 'fixedAmount'],
    ['monto negativo', { fixedAmount: '-5' }, 'fixedAmount'],
    ['automatic que no es booleano', { automatic: 'maybe' }, 'automatic'],
  ])('AssignDto rechaza %s en su campo', async (_name, input, field) => {
    expect(await fieldsOf(AssignDto, input)).toContain(field)
  })

  it('AddDealersDto exige al menos un id entero positivo', async () => {
    expect(await fieldsOf(AddDealersDto, { idDealers: [] })).toContain('idDealers')
    expect(await fieldsOf(AddDealersDto, { idDealers: ['a'] })).toContain('idDealers')
    expect(await fieldsOf(AddDealersDto, { idDealers: [0] })).toContain('idDealers')
    expect(await fieldsOf(AddDealersDto, { idDealers: ['408', 86], allowAnyTotal: true })).toEqual([])
  })
})
