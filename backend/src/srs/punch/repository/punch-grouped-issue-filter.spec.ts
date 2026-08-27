import { BadRequestException } from '@nestjs/common'

import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'

describe('resolveGroupedIssueFilter', () => {
  it('trata undefined y all como ponchadas activas', () => {
    expect(resolveGroupedIssueFilter(undefined)).toEqual({ estado: 1, extraSql: '' })
    expect(resolveGroupedIssueFilter('all')).toEqual({ estado: 1, extraSql: '' })
  })

  it('only_deletes usa estado 0', () => {
    expect(resolveGroupedIssueFilter('only_deletes')).toEqual({ estado: 0, extraSql: '' })
  })

  it('mapea cada token conocido', () => {
    for (const type of PUNCH_ISSUE_TYPES) {
      expect(() => resolveGroupedIssueFilter(type)).not.toThrow()
    }
    expect(resolveGroupedIssueFilter('only_error').extraSql).toContain('TTK_PUNCH_WITH_ERROR(tew.id)')
    expect(resolveGroupedIssueFilter('without_salary').extraSql).toContain('id_payment_type IS NULL')
  })

  it('un token desconocido da 400, nunca cae en all', () => {
    expect(() => resolveGroupedIssueFilter('only_erors')).toThrow(BadRequestException)
    expect(() => resolveGroupedIssueFilter('only_erors')).toThrow(/issueType/i)
  })
})
