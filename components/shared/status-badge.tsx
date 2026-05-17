import { cn } from '@/lib/utils'
import type { IssueStatus, IssueType } from '@/lib/types'
import { issueStatusLabels, issueTypeLabels } from '@/lib/types'

interface StatusBadgeProps {
  status: IssueStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    pending: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
    reviewed: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
    justified: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
      styles[status]
    )}>
      {issueStatusLabels[status]}
    </span>
  )
}

interface IssueTypeBadgeProps {
  type: IssueType
}

export function IssueTypeBadge({ type }: IssueTypeBadgeProps) {
  const styles: Record<IssueType, string> = {
    late_arrival: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    late_departure: 'bg-cyan-500/20 text-cyan-600 border-cyan-500/30',
    early_departure: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
    missing_entry: 'bg-red-500/20 text-red-600 border-red-500/30',
    missing_exit: 'bg-red-500/20 text-red-600 border-red-500/30',
    missing_clock_out: 'bg-red-500/20 text-red-600 border-red-500/30',
    missing_lunch_out: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
    missing_lunch_in: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
    extended_lunch: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
    no_punches: 'bg-red-600/20 text-red-600 border-red-600/30',
    manual_punch: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
    deleted_punch: 'bg-purple-500/20 text-purple-600 border-purple-500/30',
    modified_payment: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30'
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
      styles[type]
    )}>
      {issueTypeLabels[type]}
    </span>
  )
}
