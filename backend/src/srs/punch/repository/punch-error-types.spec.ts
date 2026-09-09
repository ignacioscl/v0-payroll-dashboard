import { BadRequestException } from '@nestjs/common'

import {
  DEFAULT_ERROR_TYPES,
  errorTypesInList,
  isDefaultErrorTypes,
  parseErrorTypes,
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
  })

  it('duplicados son entrada invalida, NO entrada a normalizar', () => {
    expect(() => parseErrorTypes('1,1')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('3,1,1')).toThrow(BadRequestException)
  })

  it('presente y vacio es distinto de ausente: 400', () => {
    expect(() => parseErrorTypes('')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('   ')).toThrow(BadRequestException)
  })

  it('tokens fuera de {1,2,3} dan 400, no se descartan en silencio', () => {
    expect(() => parseErrorTypes('9')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('1,4')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('0')).toThrow(BadRequestException)
    expect(() => parseErrorTypes('-1')).toThrow(BadRequestException)
  })

  it('la inyeccion no se normaliza a 1: da 400', () => {
    // GeneralUtils::sanitizeIntCsv castea con (int) y esto sobreviviria como "1".
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
  it('sólo la lista completa cuenta como default', () => {
    expect(isDefaultErrorTypes([1, 2, 3])).toBe(true)
    expect(isDefaultErrorTypes([1, 3])).toBe(false)
    expect(isDefaultErrorTypes([])).toBe(false)
  })
})

describe('errorTypesInList', () => {
  it('interpola la lista sin placeholders', () => {
    expect(errorTypesInList([1, 3])).toBe('1,3')
    expect(errorTypesInList([1, 2, 3])).toBe('1,2,3')
  })

  it('assertea aunque el caller ya haya validado: IN () seria un 1064', () => {
    expect(() => errorTypesInList([])).toThrow(BadRequestException)
    expect(() => errorTypesInList([9])).toThrow(BadRequestException)
  })
})
