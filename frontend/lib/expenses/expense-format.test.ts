/**
 * Formato de los montos de Expenses. Corre con `pnpm vitest run`.
 */
import { describe, expect, it } from 'vitest'

import { amountOnBlur } from './expense-format'

describe('amountOnBlur: el monto que se escribe a mano queda con centavos', () => {
  it('completa los dos decimales de un monto válido', () => {
    expect(amountOnBlur('75')).toBe('75.00')
    expect(amountOnBlur('140')).toBe('140.00')
    expect(amountOnBlur('85.5')).toBe('85.50')
    expect(amountOnBlur(' 12.34 ')).toBe('12.34')
  })

  it('deja como está lo que no es un monto válido, para que el error se vea sobre lo escrito', () => {
    expect(amountOnBlur('')).toBe('')
    expect(amountOnBlur('abc')).toBe('abc')
    expect(amountOnBlur('1,200')).toBe('1,200')
    expect(amountOnBlur('0')).toBe('0')
    expect(amountOnBlur('1.234')).toBe('1.234')
  })
})
