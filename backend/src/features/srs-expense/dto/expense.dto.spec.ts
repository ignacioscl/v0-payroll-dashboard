import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { AttachmentLogDto, CreateExpenseDto, UpdateExpenseDto } from './expense.dto'

async function errorsOf(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateExpenseDto, input)
  const errors = await validate(dto, { whitelist: true })
  const fields: string[] = []
  const walk = (list: typeof errors, parent = '') => {
    for (const e of list) {
      const field = parent ? `${parent}.${e.property}` : e.property
      if (e.constraints) fields.push(field)
      if (e.children?.length) walk(e.children, field)
    }
  }
  walk(errors)
  return fields
}

const valid = {
  ticketDate: '2026-11-02',
  idCompany: 10,
  idCategory: 20,
  mode: 'single',
  idDealer: 408,
  totalAmount: '125.50',
}

describe('CreateExpenseDto (pareja de frontend/lib/expenses/expense-form-schema.ts) — lo que rechaza', () => {
  it('acepta un gasto suelto válido', async () => {
    expect(await errorsOf(valid)).toEqual([])
  })

  it.each([
    ['fecha vacía', { ticketDate: '' }, 'ticketDate'],
    ['fecha en formato US', { ticketDate: '11/02/2026' }, 'ticketDate'],
    ['monto con letras', { totalAmount: 'abc' }, 'totalAmount'],
    ['monto negativo', { totalAmount: '-1' }, 'totalAmount'],
    ['monto con tres decimales', { totalAmount: '10.123' }, 'totalAmount'],
    ['monto de nueve enteros', { totalAmount: '100000000' }, 'totalAmount'],
    ['description de más de 255', { description: 'x'.repeat(256) }, 'description'],
    ['receipt de más de 64', { receiptNumber: 'x'.repeat(65) }, 'receiptNumber'],
    ['notes de más de 512', { notes: 'x'.repeat(513) }, 'notes'],
    ['modo inválido', { mode: 'half' }, 'mode'],
    ['idDealer 0', { idDealer: 0 }, 'idDealer'],
    ['idAuthor negativo', { idAuthor: -3 }, 'idAuthor'],
    ['nombre de compañía nueva de más de 128', { newCompanyName: 'x'.repeat(129) }, 'newCompanyName'],
  ])('rechaza %s en su campo', async (_name, patch, field) => {
    expect(await errorsOf({ ...valid, ...patch })).toContain(field)
  })

  it('rechaza un porcentaje inválido dentro de branches, con el índice en el campo', async () => {
    const fields = await errorsOf({
      ...valid,
      mode: 'percent',
      idDealer: undefined,
      branches: [
        { idDealer: 408, percentage: '60' },
        { idDealer: 86, percentage: 'abc' },
      ],
    })
    expect(fields).toContain('branches.1.percentage')
  })

  it('rechaza un monto con tres decimales dentro de branches (By amount)', async () => {
    const fields = await errorsOf({
      ...valid,
      mode: 'amount',
      idDealer: undefined,
      totalAmount: undefined,
      branches: [
        { idDealer: 408, amount: '10.00' },
        { idDealer: 86, amount: '0.001' },
      ],
    })
    expect(fields).toContain('branches.1.amount')
  })

  it('acepta un reparto By percentage bien formado (la suma la controla el facade)', async () => {
    const fields = await errorsOf({
      ...valid,
      mode: 'percent',
      idDealer: undefined,
      branches: [
        { idDealer: 408, percentage: '60' },
        { idDealer: 86, percentage: '40' },
      ],
    })
    expect(fields).toEqual([])
  })

  it('UpdateExpenseDto acepta kind group y rechaza otro kind', async () => {
    const ok = await validate(plainToInstance(UpdateExpenseDto, { ...valid, kind: 'group' }), { whitelist: true })
    expect(ok).toEqual([])
    const bad = await validate(plainToInstance(UpdateExpenseDto, { ...valid, kind: 'other' }), { whitelist: true })
    expect(bad.map((e) => e.property)).toContain('kind')
  })

  it('UpdateExpenseDto acepta el cuerpo de solo textos (sin ticketDate ni mode) y sigue validando lo que viene', async () => {
    const textOnly = await validate(plainToInstance(UpdateExpenseDto, { description: 'Otra', receiptNumber: 'B-2', notes: '', kind: 'group' }), { whitelist: true })
    expect(textOnly).toEqual([])
    const badDate = await validate(plainToInstance(UpdateExpenseDto, { ...valid, ticketDate: '11/02/2026' }), { whitelist: true })
    expect(badDate.map((e) => e.property)).toContain('ticketDate')
    const badMode = await validate(plainToInstance(UpdateExpenseDto, { ...valid, mode: 'half' }), { whitelist: true })
    expect(badMode.map((e) => e.property)).toContain('mode')
    const badAmount = await validate(plainToInstance(UpdateExpenseDto, { ...valid, totalAmount: 'abc' }), { whitelist: true })
    expect(badAmount.map((e) => e.property)).toContain('totalAmount')
    const dto = plainToInstance(UpdateExpenseDto, { ...valid, totalAmount: 12.5, description: '  hola ' })
    expect(dto.totalAmount).toBe('12.5')
    expect(dto.description).toBe('hola')
  })

  it('AttachmentLogDto: filename de 1 a 255; vacío o más largo se rechaza', async () => {
    expect(await validate(plainToInstance(AttachmentLogDto, { filename: ' receipt.jpg ' }))).toEqual([])
    expect(plainToInstance(AttachmentLogDto, { filename: ' receipt.jpg ' }).filename).toBe('receipt.jpg')
    expect((await validate(plainToInstance(AttachmentLogDto, { filename: '   ' }))).map((e) => e.property)).toEqual(['filename'])
    expect((await validate(plainToInstance(AttachmentLogDto, {}))).map((e) => e.property)).toEqual(['filename'])
    expect((await validate(plainToInstance(AttachmentLogDto, { filename: 'x'.repeat(256) }))).map((e) => e.property)).toEqual(['filename'])
  })

  it('recorta espacios de borde y convierte números a string de monto', () => {
    const dto = plainToInstance(CreateExpenseDto, { ...valid, description: '  hola  ', totalAmount: 12.5 })
    expect(dto.description).toBe('hola')
    expect(dto.totalAmount).toBe('12.5')
  })
})
