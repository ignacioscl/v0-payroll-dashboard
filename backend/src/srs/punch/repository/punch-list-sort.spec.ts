import { BadRequestException } from '@nestjs/common'

import { PUNCH_LIST_SORTS } from '../dto/punch-list.dto'
import { assertCursorShape, coerceAfterValue, PUNCH_SORT_SPECS } from './punch-list-sort'
import { buildPunchListPageSql } from './punch-list-sql'
import type { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'

const filter: SrsKpiFilter = {
  idDealerProvider: 79,
  idUsuario: 42,
  dealerIds: [639],
  fechaDesde: '2026-01-01',
  fechaHasta: '2026-01-31',
  filterDateDone: false,
  includeZero: false,
  skipDealerRestriction: false,
}

const base = { pageSize: 25, issueType: 'all' as const }

describe('PUNCH_SORT_SPECS', () => {
  it('cubre TODA la whitelist del endpoint, sin huecos', () => {
    // Si alguien agrega un sort al DTO y se olvida del spec, el ORDER BY caeria
    // a `punchIn` en silencio: BUG-07 otra vez.
    for (const sort of PUNCH_LIST_SORTS) {
      expect(PUNCH_SORT_SPECS[sort]).toBeDefined()
      expect(PUNCH_SORT_SPECS[sort].order).toBeTruthy()
      expect(PUNCH_SORT_SPECS[sort].cursor).toBeTruthy()
    }
  })

  it('las columnas NOT NULL no son nulables y el resto si', () => {
    // `punch_in` y `u.nombre` son NOT NULL en el DDL: sin ellos el camino por
    // defecto perderia el index-ordered.
    expect(PUNCH_SORT_SPECS.punchIn.nullable).toBe(false)
    expect(PUNCH_SORT_SPECS.employee.nullable).toBe(false)
    for (const sort of ['punchOut', 'breakStart', 'breakEnd', 'timeWork', 'timeBreak', 'paymentType'] as const) {
      expect(PUNCH_SORT_SPECS[sort].nullable).toBe(true)
    }
  })

  it('D-10 — Time break ordena por SEGUNDOS, no por el decimal', () => {
    // El decimal tiene 36 s de granularidad y la celda muestra los segundos
    // exactos: ordenar por el decimal es exactamente lo que BUG-07 reporta.
    expect(PUNCH_SORT_SPECS.timeBreak.order).toContain('TIME_TO_SEC')
    expect(PUNCH_SORT_SPECS.timeBreak.order).not.toContain('TTK_CALCULATE_TIME_DAY')
  })

  it('Time work ordena por LA MISMA expresion que produce la celda', () => {
    expect(PUNCH_SORT_SPECS.timeWork.order).toBe(PUNCH_SORT_SPECS.timeWork.cursor)
    expect(PUNCH_SORT_SPECS.timeWork.order).toContain('TTK_CALCULATE_TIME_DAY')
  })
})

describe('ORDER BY', () => {
  it('el camino por defecto NO emite termino lider (queda index-ordered)', () => {
    const { sql } = buildPunchListPageSql(filter, { ...base, sort: 'punchIn', dir: 'desc' })
    expect(sql).toContain('ORDER BY tew.punch_in DESC, tew.id DESC')
    expect(sql).not.toContain('IS NULL) ASC')
  })

  it('una columna nulable manda los vacios al final en ASC **y** en DESC', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const { sql } = buildPunchListPageSql(filter, { ...base, sort: 'timeBreak', dir })
      // El termino lider va SIEMPRE ASC: eso es lo que los deja al final en las
      // dos direcciones. Si alguna vez sale con la direccion del sort, los
      // vacios se mudan de punta segun hacia donde ordenes (el bug de hoy).
      expect(sql).toContain('IS NULL) ASC,')
      expect(sql).toContain(`${dir.toUpperCase()}, tew.id ${dir.toUpperCase()}`)
    }
  })
})

describe('cursor de 3 partes', () => {
  it('sin cursor no agrega predicado', () => {
    const { sql } = buildPunchListPageSql(filter, { ...base, sort: 'timeBreak' })
    expect(sql).not.toContain('<=>')
  })

  it('en el tramo con valor usa la comparacion normal', () => {
    const { sql, params } = buildPunchListPageSql(filter, {
      ...base,
      sort: 'timeBreak',
      dir: 'asc',
      afterEmpty: '0',
      afterValue: '3600',
      afterId: 10,
    })
    expect(sql).toContain('<=>')
    // El bind numerico viaja como NUMERO, no como string.
    expect(params).toContain(3600)
    expect(params).not.toContain('3600')
  })

  it('en el tramo de vacios el bind es `null` literal', () => {
    const { params } = buildPunchListPageSql(filter, {
      ...base,
      sort: 'timeBreak',
      dir: 'asc',
      afterEmpty: '1',
      afterId: 10,
    })
    // `<=>` contra NULL es lo unico que hace que el tramo vacio desempate por
    // id en vez de evaporarse: con `=` normal, NULL = NULL da NULL y la pagina
    // 2 del tramo vuelve VACIA.
    expect(params).toContain(null)
    expect(params).not.toContain('')
    expect(params).not.toContain('null')
  })

  it('una columna no nulable conserva el cursor de 3 binds de siempre', () => {
    const { sql, params } = buildPunchListPageSql(filter, {
      ...base,
      sort: 'employee',
      dir: 'asc',
      afterValue: 'Ana',
      afterId: 9,
    })
    expect(sql).not.toContain('<=>')
    expect(params).toEqual(expect.arrayContaining(['Ana', 9]))
  })
})

describe('coerceAfterValue', () => {
  it('un sort numerico rechaza texto, NaN e Infinity', () => {
    for (const raw of ['abc', 'NaN', 'Infinity', '']) {
      expect(() => coerceAfterValue(PUNCH_SORT_SPECS.timeBreak, raw)).toThrow(BadRequestException)
    }
    expect(coerceAfterValue(PUNCH_SORT_SPECS.timeBreak, '3600')).toBe(3600)
  })

  it('un sort de fecha exige el formato de la base', () => {
    expect(() => coerceAfterValue(PUNCH_SORT_SPECS.punchOut, '2026-01-01')).toThrow(
      BadRequestException,
    )
    expect(coerceAfterValue(PUNCH_SORT_SPECS.punchOut, '2026-01-01 08:30:00')).toBe(
      '2026-01-01 08:30:00',
    )
  })

  it('un sort de texto pasa tal cual', () => {
    expect(coerceAfterValue(PUNCH_SORT_SPECS.employee, "O'Brien")).toBe("O'Brien")
  })
})

describe('assertCursorShape', () => {
  it('acepta la primera pagina y las dos formas completas', () => {
    expect(() => assertCursorShape({})).not.toThrow()
    expect(() =>
      assertCursorShape({ afterEmpty: '0', afterValue: 'x', afterId: 1 }),
    ).not.toThrow()
    // afterEmpty=1 solo tiene sentido en una columna CON tramo de vacios.
    expect(() =>
      assertCursorShape({ sort: 'timeBreak', afterEmpty: '1', afterId: 1 }),
    ).not.toThrow()
    // Compatibilidad: sin afterEmpty se lee como '0'. Es lo que mantiene vivo al
    // paginador del export de Grouped, que fuerza sort=punchIn.
    expect(() => assertCursorShape({ afterValue: 'x', afterId: 1 })).not.toThrow()
  })

  it('rechaza las combinaciones imposibles', () => {
    expect(() =>
      assertCursorShape({ sort: 'timeBreak', afterEmpty: '1', afterValue: 'x', afterId: 1 }),
    ).toThrow(BadRequestException)
    expect(() => assertCursorShape({ sort: 'timeBreak', afterEmpty: '1' })).toThrow(
      BadRequestException,
    )
    expect(() => assertCursorShape({ afterId: 1 })).toThrow(BadRequestException)
    expect(() => assertCursorShape({ afterValue: 'x' })).toThrow(BadRequestException)
  })

  it('afterEmpty=1 en una columna SIN vacios es 400, no una lista reiniciada', () => {
    // `u.nombre` y `tew.punch_in` son NOT NULL: no existe tramo de vacios. Sin
    // este corte el SQL quedaba `u.nombre > ''`, que matchea TODAS las filas.
    for (const sort of ['employee', 'punchIn'] as const) {
      expect(() => assertCursorShape({ sort, afterEmpty: '1', afterId: 5 })).toThrow(
        BadRequestException,
      )
    }
  })
})
