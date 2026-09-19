import { BadRequestException } from '@nestjs/common'

import {
  DEFAULT_ERROR_TYPES,
  effectiveErrorTypes,
  errorTypesInList,
  isDefaultErrorTypes,
  isCompleteEffectiveList,
  parseErrorTypes,
  v2Subset,
} from './punch-error-types'

describe('parseErrorTypes', () => {
  it('ausente = default, y queda marcado como no provisto', () => {
    expect(parseErrorTypes(undefined)).toEqual({ provided: false, values: DEFAULT_ERROR_TYPES })
    expect(parseErrorTypes(null)).toEqual({ provided: false, values: DEFAULT_ERROR_TYPES })
  })

  it('ordena ascendente sin deduplicar nada', () => {
    expect(parseErrorTypes('3,1')).toEqual({ provided: true, values: [1, 3] })
    expect(parseErrorTypes('2')).toEqual({ provided: true, values: [2] })
    expect(parseErrorTypes('1,2,3')).toEqual({ provided: true, values: [1, 2, 3] })
    expect(parseErrorTypes('1,2')).toEqual({ provided: true, values: [1, 2] })
    expect(parseErrorTypes('1,2,3,4,5,6,7,8')).toEqual({
      provided: true,
      values: [1, 2, 3, 4, 5, 6, 7, 8],
    })
  })

  it('duplicados son entrada invalida, NO entrada a normalizar', () => {
    expect(() => parseErrorTypes('1,1')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('3,1,1')).toThrow(BadRequestException)
  })

  it('presente y vacio es distinto de ausente: 400', () => {
    expect(() => parseErrorTypes('')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('   ')).toThrow(BadRequestException)
  })

  it('tokens fuera de {1..8} dan 400, no se descartan en silencio', () => {
    expect(() => parseErrorTypes('9')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('0')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('-1')).toThrow(BadRequestException)
  })

  it('la inyeccion no se normaliza a 1: da 400', () => {
    expect(() => parseErrorTypes('1);DROP')).toThrow(BadRequestException)
    expect(() => parseErrorTypes("1' OR '1'='1")).toThrow(BadRequestException)
  })

  it('un array (?errorTypes[]=1) da 400 en vez de convertirse en "Array"', () => {
    expect(() => parseErrorTypes(['1'])).toThrow(BadRequestException)
    expect(() => parseErrorTypes({ 0: '1' })).toThrow(BadRequestException)
    expect(() => parseErrorTypes(1)).toThrow(BadRequestException)
  })
})

describe('isDefaultErrorTypes', () => {
  it('el subconjunto V2 {1,2,3} cuenta como default aunque vengan 4..8', () => {
    expect(isDefaultErrorTypes([1, 2, 3])).toBe(true)
    expect(isDefaultErrorTypes([1, 2, 3, 4, 5, 6, 7, 8])).toBe(true)
    expect(isDefaultErrorTypes([1, 3])).toBe(false)
    expect(isDefaultErrorTypes([])).toBe(false)
  })
})

describe('v2Subset', () => {
  it('se queda con 1,2,3', () => {
    expect(v2Subset([1, 2, 3, 4, 8])).toEqual([1, 2, 3])
    expect(v2Subset([4, 5, 6])).toEqual([])
  })
})

describe('errorTypesInList', () => {
  it('interpola la lista sin placeholders', () => {
    expect(errorTypesInList([1, 3])).toBe('1,3')
    expect(errorTypesInList([1, 2, 3])).toBe('1,2,3')
    expect(errorTypesInList([1, 4, 8])).toBe('1,4,8')
  })

  it('assertea aunque el caller ya haya validado: IN () seria un 1064', () => {
    expect(() => errorTypesInList([])).toThrow(BadRequestException)
    expect(() => errorTypesInList([9])).toThrow(BadRequestException)
  })
})

describe('isCompleteEffectiveList', () => {
  it('All cuando la lista efectiva cubre todo lo que el permiso deja', () => {
    expect(
      isCompleteEffectiveList([1, 2, 3, 4, 5, 6, 7, 8], {
        canViewPaymentType: true,
        includeDeletedFixes: true,
      }),
    ).toBe(true)
    expect(
      isCompleteEffectiveList([1, 2, 3, 4], {
        canViewPaymentType: true,
        includeDeletedFixes: true,
      }),
    ).toBe(false)
    expect(
      isCompleteEffectiveList([1, 2, 3, 5, 8], {
        canViewPaymentType: false,
        includeDeletedFixes: false,
      }),
    ).toBe(true)
  })
})

describe('effectiveErrorTypes', () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8]

  it('saca 4 y 7 sin permiso de pago, 6 sin delete', () => {
    expect(
      effectiveErrorTypes(all, { canViewPaymentType: false, includeDeletedFixes: false }),
    ).toEqual([1, 2, 3, 5, 8])
    expect(
      effectiveErrorTypes(all, { canViewPaymentType: true, includeDeletedFixes: false }),
    ).toEqual([1, 2, 3, 4, 5, 7, 8])
    expect(
      effectiveErrorTypes(all, { canViewPaymentType: true, includeDeletedFixes: true }),
    ).toEqual(all)
  })

  it('externo se queda en 1-3', () => {
    expect(
      effectiveErrorTypes(all, {
        canViewPaymentType: true,
        includeDeletedFixes: true,
        isExternal: true,
      }),
    ).toEqual([1, 2, 3])
  })
})
