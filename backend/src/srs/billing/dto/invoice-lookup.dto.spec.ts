import {
  LOOKUP_MAX_ROWS,
  buildDepartmentLookupFilter,
  buildServiceLookupFilter,
  capLookupRows,
} from './invoice-lookup.dto'

describe('invoice lookups — no silent cap (plan-filtros-tope-80)', () => {
  it('defaults to the safety ceiling, not 80', () => {
    expect(buildDepartmentLookupFilter({ idDealer: '1' }).limit).toBe(LOOKUP_MAX_ROWS)
    expect(buildServiceLookupFilter({ idDealer: '1' }).limit).toBe(LOOKUP_MAX_ROWS)
  })

  it('keeps an explicit limit and never goes past the ceiling', () => {
    expect(buildServiceLookupFilter({ idDealer: '1', limit: 30 }).limit).toBe(30)
    expect(buildServiceLookupFilter({ idDealer: '1', limit: 999999 }).limit).toBe(LOOKUP_MAX_ROWS)
  })

  it('reports truncated only when the extra row came back', () => {
    expect(capLookupRows([1, 2, 3], 3)).toEqual({ results: [1, 2, 3], truncated: false })
    expect(capLookupRows([1, 2, 3, 4], 3)).toEqual({ results: [1, 2, 3], truncated: true })
  })
})
