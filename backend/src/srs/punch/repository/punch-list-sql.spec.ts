import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  buildPunchListExportSql,
  buildPunchListFromWhere,
  buildPunchListPageSql,
} from './punch-list-sql'

const filter: SrsKpiFilter = {
  idDealerProvider: 79,
  idUsuario: 42,
  dealerIds: [639, 286],
  fechaDesde: '2026-01-01',
  fechaHasta: '2026-01-31',
  filterDateDone: false,
  includeZero: false,
  skipDealerRestriction: false,
}

const opts = {
  minHours: 4,
  maxHours: 12,
  idPaymentTypes: [101, 8],
  search: 'juan',
  issueType: 'only_error' as const,
  todayLiveStatus: 'working' as const,
  includeAmounts: true,
  includePaymentTypeName: true,
}

describe('punch-list SQL compartido', () => {
  it('list y export producen el mismo FROM/WHERE y los mismos params de filtro', () => {
    const shared = buildPunchListFromWhere(filter, opts)
    const page = buildPunchListPageSql(filter, {
      ...opts,
      pageSize: 25,
      sort: 'employee',
      dir: 'desc',
      afterValue: 'Ana',
      afterId: 9,
    })
    const exp = buildPunchListExportSql(filter, opts)

    expect(page.fromWhere).toBe(shared.fromWhere)
    expect(exp.fromWhere).toBe(shared.fromWhere)
    expect(page.baseParams).toEqual(shared.params)
    expect(exp.params).toEqual(shared.params)
  })

  it('el export ordena por punch_in DESC, igual que la grilla, y no tiene LIMIT ni cursor', () => {
    const exp = buildPunchListExportSql(filter, opts)
    expect(exp.sql).toMatch(/ORDER BY tew\.punch_in DESC, tew\.id DESC\s*$/i)
    expect(exp.sql).not.toMatch(/LIMIT/i)
    expect(exp.sql).not.toContain('after')
    expect(exp.params).not.toContain('Ana')
  })

  it('la grilla agrega cursor, sort y LIMIT', () => {
    const page = buildPunchListPageSql(filter, {
      ...opts,
      pageSize: 25,
      sort: 'employee',
      dir: 'desc',
      afterValue: 'Ana',
      afterId: 9,
    })
    expect(page.sql).toContain('ORDER BY u.nombre DESC')
    expect(page.sql).toContain('LIMIT ?')
    expect(page.params[page.params.length - 1]).toBe(26)
    expect(page.params).toEqual(expect.arrayContaining(['Ana', 9]))
  })

  /* ---------------------------------------------------------------------- */
  /* Orden de binds — el error que no se ve hasta que la grilla devuelve      */
  /* otro período. Contar `?` contra params.length NO alcanza: hay que        */
  /* comparar el ORDEN.                                                      */
  /* ---------------------------------------------------------------------- */

  it('en modo Pending los binds van estado, provider, dealers, rango, resto', () => {
    const { fromWhere, params } = buildPunchListFromWhere(filter, opts)
    expect((fromWhere.match(/\?/g) ?? []).length).toBe(params.length)
    // Interpolado y canonico: ordenado y sin duplicados.
    expect(fromWhere).toContain('AND tew.id_payment_type IN (8,101)')
    expect(params).toEqual([
      1, // issue.estado
      79, // provider
      42, // RESTRICTION_DEALER_V2(idUsuario, ...)
      639,
      286,
      '2026-01-01',
      '2026-01-31',
      // payment type NO aparece: los ids se INTERPOLAN, no se bindean
      // (punch-payment-types.ts). Es justamente lo que hace que agregar este
      // filtro no corra el orden de los binds posteriores.
      '%juan%', // search
      4,
      12,
    ])
  })

  it('en modo Corrected desaparecen estado, rango y dealers de AFUERA, y reaparecen adentro', () => {
    const { fromWhere, params } = buildPunchListFromWhere(filter, {
      ...opts,
      issueType: 'only_fixed',
    })
    expect((fromWhere.match(/\?/g) ?? []).length).toBe(params.length)
    // El rango exterior sobre tew.punch_in ya no existe.
    expect(fromWhere).not.toContain('tew.punch_in >= ?')
    // El predicado de dealers tampoco; el JOIN sí, porque el SELECT proyecta c.id.
    expect(fromWhere).not.toContain('RESTRICTION_DEALER_V2')
    expect(fromWhere).toContain('JOIN CONTRATISTA c ON c.id = tew.id_dealer')
    expect(params).toEqual([
      1, // estado: sin permiso de eliminadas sigue viajando
      79, // provider — NUNCA se omite
      '2026-01-01', // extraParams: rango sobre f.punch_date
      '2026-01-31',
      639, // extraParams: f.id_dealer
      286,
      // idem: payment type va interpolado, no bindeado
      '%juan%',
      4,
      12,
    ])
  })

  it('con permiso de eliminadas el bind de estado desaparece del todo', () => {
    const { fromWhere, params } = buildPunchListFromWhere(filter, {
      ...opts,
      issueType: 'only_fixed',
      includeDeletedFixes: true,
    })
    expect(fromWhere).not.toContain('tew.estado = ?')
    expect((fromWhere.match(/\?/g) ?? []).length).toBe(params.length)
    expect(params[0]).toBe(79)
  })

  it('el snapshot aplica en TODOS los modos, no sólo en Corrected', () => {
    for (const issueType of ['only_error', 'only_fixed'] as const) {
      const { fromWhere, params } = buildPunchListFromWhere(filter, {
        ...opts,
        issueType,
        snapshotAt: '2026-09-06 12:00:00',
      })
      expect(fromWhere).toContain('tew.punch_in <= ?')
      expect(params).toContain('2026-09-06 12:00:00')
      expect((fromWhere.match(/\?/g) ?? []).length).toBe(params.length)
    }
  })

  it('las columnas de corregidos son SÓLO del export y SÓLO en modo Corrected', () => {
    const page = buildPunchListPageSql(filter, { ...opts, issueType: 'only_fixed', pageSize: 25 })
    expect(page.sql).not.toContain('corrected_types')

    const exportCorrected = buildPunchListExportSql(filter, { ...opts, issueType: 'only_fixed' })
    expect(exportCorrected.sql).toContain('corrected_types')
    expect(exportCorrected.sql).toContain('last_corrected_at')
    // Y no agregan un solo bind: el fragmento de tipos se interpola.
    expect((exportCorrected.sql.match(/\?/g) ?? []).length).toBe(exportCorrected.params.length)

    const exportPending = buildPunchListExportSql(filter, opts)
    expect(exportPending.sql).not.toContain('corrected_types')
  })

  it('sin permiso de importes no selecciona hourly_rate ni type_payment de tew', () => {
    const withAmounts = buildPunchListExportSql(filter, { ...opts, includeAmounts: true })
    const without = buildPunchListExportSql(filter, { ...opts, includeAmounts: false })
    expect(withAmounts.sql).toContain('tew.hourly_rate')
    expect(without.sql).not.toContain('tew.hourly_rate')
    expect(without.sql).not.toContain('tew.type_payment')
    expect(without.fromWhere).toBe(withAmounts.fromWhere)
  })

  it('si no se pasa includeAmounts, no selecciona tew.hourly_rate', () => {
    const omitted = buildPunchListExportSql(filter, { issueType: 'all' })
    expect(omitted.sql).not.toContain('tew.hourly_rate')
    expect(omitted.sql).not.toContain('tew.type_payment')
  })
})
