import { BadRequestException } from '@nestjs/common'

import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'

const ALL = [1, 2, 3]
const V2_MARK = "TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1,2,3)"
const MARK_ALL = `(${V2_MARK})`

/** Rango obligatorio en modo Corrected: el filtro baja al ledger. */
const RANGE = { fechaDesde: '2026-08-01', fechaHasta: '2026-08-31' }

/**
 * P7 — predicado del EXISTS de `fixedCount`, sin rango/dealers/snapshot.
 * Alias `f7`, para no chocar con `f` (filas) ni `f2` (detalle).
 */
const FIXED_COUNT_SQL =
  'f7.id_ttk_employee_work = tew.id' +
  ' AND f7.id_dealer_provider = tew.id_dealer_provider' +
  ' AND f7.error_type IN (1,2,3)'

const pendingShape = (extraSql: string, estado = 1) => ({
  estado,
  extraSql,
  extraParams: [],
  skipOuterDateRange: false,
  skipOuterDealerPredicate: false,
  skipOuterEmployeeFilter: false,
  markSql: MARK_ALL,
  markParams: [],
  markDetailSql: `CASE WHEN ${MARK_ALL} THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(TTK_PUNCH_WITH_ERROR(tew.id), '$.res')), '') ELSE NULL END`,
  markDetailParams: [],
  marksCorrections: false,
  // P7 — presentes en TODOS los modos, no solo en only_fixed: la columna
  // `errorCount` tiene sentido sobre todo en Pending.
  currentErrorMarkSql: MARK_ALL,
  fixedCountSql: FIXED_COUNT_SQL,
  fixedCountParams: [],
})

describe('resolveGroupedIssueFilter', () => {
  it('trata undefined y all como ponchadas activas', () => {
    expect(resolveGroupedIssueFilter()).toEqual(pendingShape(''))
    expect(resolveGroupedIssueFilter({ issueType: 'all' })).toEqual(pendingShape(''))
  })

  it('only_deletes usa estado 0', () => {
    expect(resolveGroupedIssueFilter({ issueType: 'only_deletes' })).toEqual(pendingShape('', 0))
  })

  it('mapea cada token conocido', () => {
    for (const type of PUNCH_ISSUE_TYPES) {
      expect(() => resolveGroupedIssueFilter({ issueType: type, ...RANGE })).not.toThrow()
    }
    expect(resolveGroupedIssueFilter({ issueType: 'without_salary' }).extraSql).toContain(
      'id_payment_type IS NULL',
    )
  })

  it('un token desconocido da 400, nunca cae en all', () => {
    expect(() => resolveGroupedIssueFilter({ issueType: 'only_erors' })).toThrow(BadRequestException)
    expect(() => resolveGroupedIssueFilter({ issueType: 'only_erors' })).toThrow(/issueType/i)
  })

  /* ---------------------------------------------------------------------- */
  /* Tabla de verdad issueType x lista blanca                                */
  /* ---------------------------------------------------------------------- */

  describe('lista blanca de tipos de error', () => {
    it('all y los filtros que NO son de error no filtran filas por la lista', () => {
      // `only_fixed` salió de esta lista a propósito: su EXISTS SÍ respeta la lista
      // blanca. Ver el caso de abajo. Antes estaba acá y por eso este spec rompe.
      for (const type of ['all', 'manual_punch', 'without_salary'] as const) {
        const partial = resolveGroupedIssueFilter({ issueType: type, errorTypes: [1, 3] })
        const full = resolveGroupedIssueFilter({ issueType: type, errorTypes: ALL })
        expect(partial.extraSql).toBe(full.extraSql)
      }
    })

    it('only_fixed SÍ respeta la lista: el ledger se filtra por error_type', () => {
      const partial = resolveGroupedIssueFilter({
        issueType: 'only_fixed',
        errorTypes: [1, 3],
        ...RANGE,
      })
      const full = resolveGroupedIssueFilter({ issueType: 'only_fixed', errorTypes: ALL, ...RANGE })
      expect(partial.extraSql).not.toBe(full.extraSql)
      expect(partial.extraSql).toContain('f.error_type IN (1,3)')
      expect(full.extraSql).toContain('f.error_type IN (1,2,3)')
    })

    it('la marca de error SIEMPRE sigue la lista, aun con issueType=all', () => {
      expect(resolveGroupedIssueFilter({ issueType: 'all', errorTypes: [1, 3] }).markSql).toBe(
        "(TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1,3))",
      )
    })

    it('only_error con lista default se queda en V1, exactamente como hoy', () => {
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error', errorTypes: ALL }).extraSql,
      ).toBe(' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL')
      // Sin errorTypes tiene que dar lo mismo (compatibilidad hacia atras).
      expect(resolveGroupedIssueFilter({ issueType: 'only_error' }).extraSql).toBe(
        ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL',
      )
    })

    it('only_error con lista parcial pasa a V2 IN (lista)', () => {
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error', errorTypes: [1, 3] }).extraSql,
      ).toBe(" AND TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1,3)")
    })

    it('un tipo especifico incluido filtra por ese codigo', () => {
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error_clockout', errorTypes: [1, 3] }).extraSql,
      ).toBe(" AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 1")
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error_break', errorTypes: ALL }).extraSql,
      ).toBe(" AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 2")
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error_20h', errorTypes: ALL }).extraSql,
      ).toBe(" AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 3")
    })

    it('la exclusion gana sobre el filtro especifico: vacio duro, nunca filas del tipo excluido', () => {
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error_break', errorTypes: [1, 3] }).extraSql,
      ).toBe(' AND 1=0')
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error_clockout', errorTypes: [2] }).extraSql,
      ).toBe(' AND 1=0')
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_error_20h', errorTypes: [1, 2] }).extraSql,
      ).toBe(' AND 1=0')
    })

    it('only_error_20h NO cae en el default permisivo: filtra por el codigo 3', () => {
      // Regresion: antes el switch tenia un `default` que devolvia el listado
      // COMPLETO sin filtrar, con 200 y en silencio.
      const res = resolveGroupedIssueFilter({ issueType: 'only_error_20h', errorTypes: ALL })
      expect(res.extraSql).not.toBe('')
      expect(res.extraSql).toContain('= 3')
    })

    it('una lista vacia es vacio duro, no IN ()', () => {
      expect(resolveGroupedIssueFilter({ issueType: 'only_error', errorTypes: [] }).extraSql).toBe(
        ' AND 1=0',
      )
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_flagged', errorTypes: [] }).extraSql,
      ).toBe(' AND 1=0')
    })

    it('un codigo fuera de {1,2,3} tira 400 antes de interpolar', () => {
      expect(() => resolveGroupedIssueFilter({ issueType: 'all', errorTypes: [9] })).toThrow(
        BadRequestException,
      )
    })

    it('la lista se interpola: no agrega placeholders donde no corresponde', () => {
      for (const type of PUNCH_ISSUE_TYPES) {
        const res = resolveGroupedIssueFilter({ issueType: type, errorTypes: [1, 3] })
        // Sin rango, dealers ni snapshot, ni siquiera `only_fixed` emite binds:
        // el fragmento de tipos NUNCA los agrega.
        expect(res.extraSql).not.toContain('?')
        expect(res.markSql).not.toContain('?')
      }
    })

    it('only_flagged pending OR-ea V2, sin salario y Fake GPS', () => {
      const res = resolveGroupedIssueFilter({
        issueType: 'only_flagged',
        errorTypes: [1, 4, 8],
      })
      expect(res.estado).toBe(1)
      expect(res.extraSql).toContain("TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1)")
      expect(res.extraSql).toContain('id_payment_type IS NULL')
      expect(res.extraSql).toContain('TTK_EMPLOYEE_WORK_EXT')
      expect(res.skipOuterDateRange).toBe(false)
    })
  })

  /* ---------------------------------------------------------------------- */
  /* Modo Corrected                                                          */
  /* ---------------------------------------------------------------------- */

  describe('only_fixed', () => {
    it('deja de mirar tew.fixed_at y pasa al registro de correcciones', () => {
      const res = resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE })
      expect(res.extraSql).not.toContain('fixed_at IS NOT NULL')
      expect(res.extraSql).toContain('EXISTS (SELECT 1 FROM TTK_PUNCH_ERROR_FIX f')
    })

    it('correlaciona por ponchada Y por provider: el join simple haría full scan', () => {
      const res = resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE })
      expect(res.extraSql).toContain('f.id_ttk_employee_work = tew.id')
      expect(res.extraSql).toContain('f.id_dealer_provider = tew.id_dealer_provider')
    })

    it('el rango va sobre f.punch_date y se omite el exterior', () => {
      const res = resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE })
      expect(res.extraSql).toContain('f.punch_date >= ? AND f.punch_date <= ?')
      expect(res.skipOuterDateRange).toBe(true)
      expect(res.extraParams.slice(0, 2)).toEqual(['2026-08-01', '2026-08-31'])
    })

    it('el dealer se resuelve sobre el evento, y el predicado exterior se omite', () => {
      const res = resolveGroupedIssueFilter({
        issueType: 'only_fixed',
        ...RANGE,
        dealerIds: [10, 20],
      })
      expect(res.extraSql).toContain('f.id_dealer IN (?,?)')
      expect(res.skipOuterDealerPredicate).toBe(true)
      expect(res.extraParams).toEqual(['2026-08-01', '2026-08-31', 10, 20])
    })

    it('el filtro de empleado NO se mueve adentro: la ponchada no se puede reasignar', () => {
      const res = resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE })
      expect(res.skipOuterEmployeeFilter).toBe(false)
      expect(res.extraSql).not.toContain('f.id_employee')
    })

    it('el snapshot congela tambien el ledger, y va al final de los binds', () => {
      const res = resolveGroupedIssueFilter({
        issueType: 'only_fixed',
        ...RANGE,
        dealerIds: [10],
        snapshotAt: '2026-09-06 12:00:00',
      })
      expect(res.extraSql).toContain('f.fixed_at <= ?')
      expect(res.extraParams).toEqual(['2026-08-01', '2026-08-31', 10, '2026-09-06 12:00:00'])
    })

    it('el orden de los binds empata con el orden de los ? del texto', () => {
      const res = resolveGroupedIssueFilter({
        issueType: 'only_fixed',
        ...RANGE,
        dealerIds: [10, 20, 30],
        snapshotAt: '2026-09-06 12:00:00',
      })
      expect((res.extraSql.match(/\?/g) ?? []).length).toBe(res.extraParams.length)
    })

    it('sin permiso de eliminadas conserva estado=1; con permiso lo omite', () => {
      expect(resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE }).estado).toBe(1)
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE, includeDeletedFixes: false })
          .estado,
      ).toBe(1)
      expect(
        resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE, includeDeletedFixes: true })
          .estado,
      ).toBeNull()
    })

    it('la columna del grupo cambia de FUENTE, no sólo de etiqueta (D-B)', () => {
      const res = resolveGroupedIssueFilter({ issueType: 'only_fixed', ...RANGE })
      expect(res.marksCorrections).toBe(true)
      // Toda fila que llegó ya pasó el EXISTS: preguntar de nuevo sería repetir el
      // mismo predicado y sus binds sin cambiar una respuesta.
      expect(res.markSql).toBe('1')
      expect(res.markParams).toEqual([])
      // El detalle son los tipos CORREGIDOS, no el error que la ponchada tiene hoy.
      expect(res.markDetailSql).toContain('f2.error_type')
      expect(res.markDetailSql).not.toContain('TTK_PUNCH_WITH_ERROR')
      expect((res.markDetailSql.match(/\?/g) ?? []).length).toBe(res.markDetailParams.length)
    })

    it('en modo pendiente la columna sigue respondiendo "¿tiene errores?"', () => {
      const res = resolveGroupedIssueFilter({ issueType: 'only_error', errorTypes: ALL })
      expect(res.marksCorrections).toBe(false)
      expect(res.markDetailSql).toContain('TTK_PUNCH_WITH_ERROR(tew.id)')
      expect(res.markDetailParams).toEqual([])
    })

    it('Manual va scoped a punch_in y dealers; el exterior de estado sigue 1 sin delete', () => {
      const res = resolveGroupedIssueFilter({
        issueType: 'only_fixed',
        errorTypes: [5],
        ...RANGE,
        dealerIds: [10, 20],
        includeDeletedFixes: false,
      })
      expect(res.estado).toBe(1)
      expect(res.skipOuterDateRange).toBe(true)
      expect(res.extraSql).toContain('tew.manual_create = 1')
      expect(res.extraSql).toContain('tew.estado = 1')
      expect(res.extraSql).toContain('tew.punch_in >= ?')
      expect(res.extraSql).toContain('tew.id_dealer IN (?,?)')
      expect(res.extraSql).not.toContain('TTK_PUNCH_ERROR_FIX')
      expect(res.extraParams).toEqual(['2026-08-01', '2026-08-31', 10, 20])
    })

    it('sin permiso, Manual incluido no abre el estado exterior', () => {
      const res = resolveGroupedIssueFilter({
        issueType: 'only_fixed',
        errorTypes: [1, 5],
        ...RANGE,
        includeDeletedFixes: false,
      })
      expect(res.estado).toBe(1)
    })
  })
})
