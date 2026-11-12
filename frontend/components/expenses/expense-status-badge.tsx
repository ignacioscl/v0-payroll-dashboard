'use client'

import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { ExpenseRow } from '@/lib/srs-expenses-api'
import { cn } from '@/lib/utils'

/** Pending approval / Approved / Rejected / «{k} of {n} approved» / Deleted (D1, F2). */
export function ExpenseStatusBadge({ row, className }: { row: ExpenseRow; className?: string }) {
  const { t } = useTranslation()
  if (row.deleted) {
    return (
      <Badge variant="outline" className={cn('font-normal text-muted-foreground', className)}>
        {t('expenses.statusDeleted')}
      </Badge>
    )
  }
  const mixed =
    row.kind === 'group' && row.status === 'pending' && row.approvedCount > 0 && row.approvedCount < row.visibleRows
  if (mixed) {
    return (
      <Badge variant="outline" className={cn('font-normal text-amber-700', className)}>
        {t('expenses.statusPartial', { k: row.approvedCount, n: row.visibleRows })}
      </Badge>
    )
  }
  if (row.status === 'approved') {
    return (
      <Badge variant="secondary" className={cn('font-normal text-emerald-700', className)}>
        {t('expenses.statusApproved')}
      </Badge>
    )
  }
  if (row.status === 'rejected') {
    return (
      <Badge variant="outline" className={cn('font-normal text-destructive', className)}>
        {t('expenses.statusRejected')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={cn('font-normal', className)}>
      {t('expenses.statusPending')}
    </Badge>
  )
}
