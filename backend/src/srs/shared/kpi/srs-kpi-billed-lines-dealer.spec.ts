import { billedBaseOpts, genericBilledLinesSql, ttkBilledLinesSql, woBilledLinesSql } from './srs-kpi-billed-lines'
import {
  buildDealerRestrictionClause,
  removedDealersAvailableSql,
  removedDealersProvider,
} from './srs-kpi-dealer-filter'
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

describe('«Include removed dealers» (T1.7 + §4)', () => {
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

  it('on = combo OR removed by this provider (DEALER_REL_REMOVED, D8) and not added again', () => {
    const c = buildDealerRestrictionClause(5, [192, 193], true, 188)
    expect(c.and).toContain('c.id IN (?,?) OR (c.id IN (SELECT drr.id_dealer_customer FROM DEALER_REL_REMOVED drr')
    expect(c.and).toContain('WHERE drr.id_dealer_provider = ?')
    expect(c.and).toContain('NOT EXISTS (SELECT 1 FROM DEALER_REL dr_rm')
    expect(c.params).toEqual([192, 193, 188, 188])
    expect(countPlaceholders(c.and)).toBe(c.params.length)
  })

  it('on: the builders keep placeholders and params aligned', () => {
    const { wo, ttk, gen } = billedBaseOpts({ ...BASE, includeRemovedDealers: true })
    for (const q of [woBilledLinesSql(wo), ttkBilledLinesSql(ttk), genericBilledLinesSql(gen)]) {
      expect(q.sql).toContain('DEALER_REL_REMOVED')
      expect(countPlaceholders(q.sql)).toBe(q.params.length)
    }
  })
})

describe('removed-dealers-available (§4.3)', () => {
  const RANGE = { fechaDesde: '2024-04-23', fechaHasta: '2024-04-23' }

  it('every table filtered by the session provider; dates and params aligned', () => {
    const q = removedDealersAvailableSql(188, RANGE, false, 8)
    expect(countPlaceholders(q.sql)).toBe(q.params.length)
    expect(q.params.filter((p) => p === 188)).toHaveLength(6)
    expect(q.sql).toContain('i.id_dealer_provider = ?')
    expect(q.sql).toContain('s.id_dealer_provider = ?')
    expect(q.sql.match(/DEALER_REL_REMOVED/g)).toHaveLength(2)
    expect(q.sql).toContain('DATE(i.fecha_alta) >= ?')
    expect(q.sql).not.toContain('i.id_workflow')
  })

  it('Filter by completion date: Done date and only Done WO (G1)', () => {
    const q = removedDealersAvailableSql(188, RANGE, true, 8)
    expect(q.sql).toContain('DATE(i.date_last_chg_workflow) >= ?')
    expect(q.sql).toContain('AND i.id_workflow = 8')
    expect(countPlaceholders(q.sql)).toBe(q.params.length)
  })

  it('no range («Owed, all dates»): no date condition', () => {
    const q = removedDealersAvailableSql(188, null, false, 8)
    expect(q.sql).not.toContain('fecha_alta')
    expect(q.sql).not.toContain('s.fecha_desde')
    expect(q.params).toEqual([188, 188, 188, 188, 188, 188])
  })
})
