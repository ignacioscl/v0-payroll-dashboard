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
  idPaymentType: 101,
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
