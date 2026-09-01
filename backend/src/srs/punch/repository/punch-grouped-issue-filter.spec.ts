import { BadRequestException } from '@nestjs/common'

import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'

const ALL = [1, 2, 3]
const MARK_ALL = "TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1,2,3)"

describe('resolveGroupedIssueFilter', () => {
  it('trata undefined y all como ponchadas activas', () => {
    expect(resolveGroupedIssueFilter(undefined)).toEqual({
      estado: 1,
      extraSql: '',
      markSql: MARK_ALL,
    })
    expect(resolveGroupedIssueFilter('all')).toEqual({
      estado: 1,
      extraSql: '',
      markSql: MARK_ALL,
    })
  })

  it('only_deletes usa estado 0', () => {
    expect(resolveGroupedIssueFilter('only_deletes')).toEqual({
      estado: 0,
      extraSql: '',
      markSql: MARK_ALL,
    })
  })

  it('mapea cada token conocido', () => {
    for (const type of PUNCH_ISSUE_TYPES) {
      expect(() => resolveGroupedIssueFilter(type)).not.toThrow()
    }
    expect(resolveGroupedIssueFilter('without_salary').extraSql).toContain('id_payment_type IS NULL')
  })

  it('un token desconocido da 400, nunca cae en all', () => {
    expect(() => resolveGroupedIssueFilter('only_erors')).toThrow(BadRequestException)
    expect(() => resolveGroupedIssueFilter('only_erors')).toThrow(/issueType/i)
  })

  /* ---------------------------------------------------------------------- */
  /* Tabla de verdad issueType x lista blanca (T.0.2 del plan)               */
  /* ---------------------------------------------------------------------- */

  describe('lista blanca de tipos de error', () => {
    it('all y los filtros que no son de error NO filtran filas por la lista', () => {
      for (const type of ['all', 'manual_punch', 'without_salary', 'only_fixed'] as const) {
        const partial = resolveGroupedIssueFilter(type, [1, 3])
        const full = resolveGroupedIssueFilter(type, ALL)
        expect(partial.extraSql).toBe(full.extraSql)
      }
    })

    it('la marca de error SIEMPRE sigue la lista, aun con issueType=all', () => {
      expect(resolveGroupedIssueFilter('all', [1, 3]).markSql).toBe(
        "TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1,3)",
      )
    })

    it('only_error con lista default se queda en V1, exactamente como hoy', () => {
      expect(resolveGroupedIssueFilter('only_error', ALL).extraSql).toBe(
        ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL',
      )
      // Sin el segundo argumento tiene que dar lo mismo (compatibilidad hacia atras).
      expect(resolveGroupedIssueFilter('only_error').extraSql).toBe(
        ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL',
      )
    })

    it('only_error con lista parcial pasa a V2 IN (lista)', () => {
      expect(resolveGroupedIssueFilter('only_error', [1, 3]).extraSql).toBe(
        " AND TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1,3)",
      )
    })

    it('un tipo especifico incluido filtra por ese codigo', () => {
      expect(resolveGroupedIssueFilter('only_error_clockout', [1, 3]).extraSql).toBe(
        " AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 1",
      )
      expect(resolveGroupedIssueFilter('only_error_break', ALL).extraSql).toBe(
        " AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 2",
      )
      expect(resolveGroupedIssueFilter('only_error_20h', ALL).extraSql).toBe(
        " AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 3",
      )
    })

    it('la exclusion gana sobre el filtro especifico: vacio duro, nunca filas del tipo excluido', () => {
      expect(resolveGroupedIssueFilter('only_error_break', [1, 3]).extraSql).toBe(' AND 1=0')
      expect(resolveGroupedIssueFilter('only_error_clockout', [2]).extraSql).toBe(' AND 1=0')
      expect(resolveGroupedIssueFilter('only_error_20h', [1, 2]).extraSql).toBe(' AND 1=0')
    })

    it('only_error_20h NO cae en el default permisivo: filtra por el codigo 3', () => {
      // Regresion: antes el switch tenia un `default` que devolvia el listado
      // COMPLETO sin filtrar, con 200 y en silencio.
      const res = resolveGroupedIssueFilter('only_error_20h', ALL)
      expect(res.extraSql).not.toBe('')
      expect(res.extraSql).toContain('= 3')
    })

    it('una lista vacia no llega al SQL: tira 400 en vez de IN ()', () => {
      expect(() => resolveGroupedIssueFilter('only_error', [])).toThrow(BadRequestException)
    })

    it('un codigo fuera de {1,2,3} tira 400 antes de interpolar', () => {
      expect(() => resolveGroupedIssueFilter('all', [9])).toThrow(BadRequestException)
    })

    it('la lista se interpola: no agrega placeholders', () => {
      for (const type of PUNCH_ISSUE_TYPES) {
        const res = resolveGroupedIssueFilter(type, [1, 3])
        expect(res.extraSql).not.toContain('?')
        expect(res.markSql).not.toContain('?')
      }
    })
  })
})
