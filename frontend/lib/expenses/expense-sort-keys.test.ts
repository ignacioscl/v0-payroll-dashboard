/**
 * Contrato entre el front y el Nest: toda columna ordenable de Expenses List manda una clave que el
 * DTO del Nest acepta. Con una clave de más, GET /srs/expenses da 400 y la lista queda vacía aunque
 * las tarjetas (summary, sin orden) den bien.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8')

describe('Expenses List: claves de orden', () => {
  it('cada sortKey del front está en EXPENSE_SORT_KEYS del Nest', () => {
    const dto = read('../../../backend/src/srs/expenses/dto/expense-list-query.dto.ts')
    const block = /EXPENSE_SORT_KEYS = \[([\s\S]*?)\]/.exec(dto)?.[1] ?? ''
    const allowed = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(allowed.length).toBeGreaterThan(0)

    const table = read('../../components/expenses/expenses-data-table.tsx')
    const used = [...table.matchAll(/sortKey: '(\w+)'/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)

    expect(used.filter((key) => !allowed.includes(key))).toEqual([])
  })
})
