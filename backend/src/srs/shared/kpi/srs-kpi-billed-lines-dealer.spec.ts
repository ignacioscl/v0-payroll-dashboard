import { billedBaseOpts, genericBilledLinesSql, ttkBilledLinesSql, woBilledLinesSql } from './srs-kpi-billed-lines'
import { buildDealerRestrictionClause, removedDealersProvider } from './srs-kpi-dealer-filter'
import { includeRemovedDealersForSession } from './srs-kpi-filter'

const BASE = {
  idDealerProvider: 188,
  idUsuario: 5,
  dealerIds: [192, 193],
  fechaDesde: '2024-01-01',
  fechaHasta: '2024-12-31',
  includeZero: false,
  skipDealerRestriction: true,
}

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length
}

describe("groupBy 'dealer' (Income by Dealer, T1.1)", () => {
  const { wo, ttk, gen } = billedBaseOpts(BASE)
  const opts = { groupBy: 'dealer' as const, productionValue: true }

  it('WO: selects c.id AS dealerId and groups by it', () => {
    const q = woBilledLinesSql({ ...wo, ...opts })
    expect(q.sql).toContain('c.id AS dealerId,')
    expect(q.sql.trim().endsWith('GROUP BY 1')).toBe(true)
    expect(countPlaceholders(q.sql)).toBe(q.params.length)
  })

  it('TTK: selects c.id AS dealerId and groups by it', () => {
    const q = ttkBilledLinesSql({ ...ttk, ...opts })
    expect(q.sql).toContain('c.id AS dealerId,')
    expect(q.sql.trim().endsWith('GROUP BY 1')).toBe(true)
    expect(countPlaceholders(q.sql)).toBe(q.params.length)
  })

  it('Generic: free lines and punches re-summed by dealerId', () => {
    const q = genericBilledLinesSql({ ...gen, ...opts })
    expect(q.sql).toContain('SELECT g.dealerId,')
    expect(q.sql).toContain(') g GROUP BY 1')
    expect(q.sql.match(/c\.id AS dealerId,/g)?.length).toBe(2)
    expect(countPlaceholders(q.sql)).toBe(q.params.length)
  })

  it('without groupBy nothing changes', () => {
    expect(woBilledLinesSql(wo).sql).not.toContain('dealerId')
  })
})

describe('«Include removed dealers» (T1.7, backend only: no screen sends it yet)', () => {
  it('only Admin General / Admin Company get it, whatever the request says', () => {
    expect(includeRemovedDealersForSession(true, 'true')).toBe(true)
    expect(includeRemovedDealersForSession(false, 'true')).toBe(false)
    expect(includeRemovedDealersForSession(false, true)).toBe(false)
    expect(includeRemovedDealersForSession(true, undefined)).toBe(false)
  })

  it('the provider of the clause is always the session one', () => {
    expect(removedDealersProvider({ ...BASE, includeRemovedDealers: true })).toBe(188)
    expect(removedDealersProvider({ ...BASE, includeRemovedDealers: false })).toBeNull()
    expect(removedDealersProvider({ ...BASE, skipDealerRestriction: false, includeRemovedDealers: true })).toBeNull()
  })

  it('a restricted user keeps RESTRICTION_DEALER_V2 and never gets the removed dealers', () => {
    const c = buildDealerRestrictionClause(5, [192], false, 188)
    expect(c.and).toBe(' AND RESTRICTION_DEALER_V2(?, c.id) = 1 AND c.id IN (?)')
    expect(c.params).toEqual([5, 192])
  })

  it('off = exactly the combo clause of today', () => {
    expect(buildDealerRestrictionClause(5, [192, 193], true, null)).toEqual({
      and: ' AND c.id IN (?,?)',
      params: [192, 193],
    })
  })
})
