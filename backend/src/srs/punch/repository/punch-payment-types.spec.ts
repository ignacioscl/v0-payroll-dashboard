import { BadRequestException } from '@nestjs/common'

import {
  buildPaymentTypeFilterSql,
  parsePaymentTypeIds,
  PAYMENT_TYPE_IDS_MAX,
} from './punch-payment-types'

describe('parsePaymentTypeIds', () => {
  it('ausente = sin filtro, no un filtro vacio', () => {
    expect(parsePaymentTypeIds(undefined)).toEqual([])
    expect(parsePaymentTypeIds(null)).toEqual([])
  })

  it('canonicaliza: ordena y saca duplicados', () => {
    expect(parsePaymentTypeIds('101,8,101,8,10')).toEqual([8, 10, 101])
  })

  it('presente y vacio es 400, no "sin filtro"', () => {
    // La UI nunca manda `?idPaymentTypes=`; si llega, es un cliente roto y
    // devolver todas las filas escondería el error.
    expect(() => parsePaymentTypeIds('')).toThrow(BadRequestException)
    expect(() => parsePaymentTypeIds('   ')).toThrow(BadRequestException)
  })

  it('rechaza cualquier cosa que no sea un entero positivo', () => {
    for (const raw of ['0', '-1', '1.5', 'a', '8,', ',8', '8,,10', '8, 10', '01']) {
      expect(() => parsePaymentTypeIds(raw)).toThrow(BadRequestException)
    }
  })

  it('rechaza un array (`?idPaymentTypes[]=8`) en vez de stringificarlo', () => {
    // `(string) []` daria "Array" y se colaria como token invalido mas adelante.
    expect(() => parsePaymentTypeIds(['8'] as unknown)).toThrow(BadRequestException)
    expect(() => parsePaymentTypeIds(8 as unknown)).toThrow(BadRequestException)
  })

  it('corta arriba del tope de 50 ids', () => {
    const ok = Array.from({ length: PAYMENT_TYPE_IDS_MAX }, (_, i) => i + 1).join(',')
    expect(parsePaymentTypeIds(ok)).toHaveLength(PAYMENT_TYPE_IDS_MAX)

    const tooMany = Array.from({ length: PAYMENT_TYPE_IDS_MAX + 1 }, (_, i) => i + 1).join(',')
    expect(() => parsePaymentTypeIds(tooMany)).toThrow(BadRequestException)
  })
})

describe('buildPaymentTypeFilterSql', () => {
  it('sin ids no agrega predicado', () => {
    expect(buildPaymentTypeFilterSql([])).toBe('')
  })

  it('interpola los ids y NO aporta binds', () => {
    // Es la razon de ser del helper: un `?` de cantidad variable correria todos
    // los binds posteriores, que es la trampa numero 1 de este modulo.
    const sql = buildPaymentTypeFilterSql([8, 10])
    expect(sql).toBe(' AND tew.id_payment_type IN (8,10)')
    expect(sql).not.toContain('?')
  })

  it('el SQL es determinista aunque la lista venga desordenada o con repetidos', () => {
    expect(buildPaymentTypeFilterSql([101, 8, 101])).toBe(
      buildPaymentTypeFilterSql([8, 101]),
    )
  })

  it('un id que no paso la reja revienta antes de construir SQL', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => buildPaymentTypeFilterSql([bad])).toThrow(BadRequestException)
    }
    expect(() => buildPaymentTypeFilterSql(['8' as unknown as number])).toThrow(
      BadRequestException,
    )
  })

  it('NO existe una mitad «sin payment type»', () => {
    // «Sin tipo de pago» va por issueType=without_salary (D-6). Si alguna vez
    // aparece un IS NULL aca, alguien reintrodujo el acoplamiento que se saco.
    expect(buildPaymentTypeFilterSql([8])).not.toContain('IS NULL')
  })
})
