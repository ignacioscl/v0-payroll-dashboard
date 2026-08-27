import { BadRequestException } from '@nestjs/common'

import { isPunchIssueType } from '../punch-issue-types'

/** Maps Issues page `selectedType` → punch-level SQL (mirrors TTKEmployeeDao::getWhere). */
export function resolveGroupedIssueFilter(issueType?: string): {
  estado: number
  extraSql: string
} {
  const type = (issueType ?? 'all').trim() || 'all'

  if (!isPunchIssueType(type)) {
    throw new BadRequestException(`Invalid issueType: ${type}`)
  }

  if (type === 'only_deletes') {
    return { estado: 0, extraSql: '' }
  }

  switch (type) {
    case 'only_error':
      return { estado: 1, extraSql: ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL' }
    case 'only_error_clockout':
      return { estado: 1, extraSql: " AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 1" }
    case 'only_error_break':
      return { estado: 1, extraSql: " AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = 2" }
    case 'manual_punch':
      return { estado: 1, extraSql: ' AND tew.manual_create = 1' }
    case 'without_salary':
      return { estado: 1, extraSql: ' AND tew.id_payment_type IS NULL' }
    case 'only_fixed':
      return { estado: 1, extraSql: ' AND tew.fixed_at IS NOT NULL' }
    default:
      return { estado: 1, extraSql: '' }
  }
}
