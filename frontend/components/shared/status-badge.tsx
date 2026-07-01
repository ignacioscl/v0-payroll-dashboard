'use client'

import { cn } from '@/lib/utils'
import type { IssueStatus, IssueType } from '@/lib/types'
import { getIssueStatusLabels, getIssueTypeLabels } from '@/lib/i18n/label-helpers'
import { useTranslation } from '@/lib/i18n/locale-context'
import { Clock, CheckCircle, AlertCircle } from 'lucide-react'

interface StatusBadgeProps {
  status: IssueStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation()
  const issueStatusLabels = getIssueStatusLabels(t)

  const config = {
    pending: {
      styles: 'bg-warning/10 text-warning border-warning/20',
      icon: Clock,
    },
    reviewed: {
      styles: 'bg-primary/10 text-primary border-primary/20',
      icon: CheckCircle,
    },
    justified: {
      styles: 'bg-success/10 text-success border-success/20',
      icon: CheckCircle,
    },
  }

  const { styles, icon: Icon } = config[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        styles,
      )}
    >
      <Icon className="h-3 w-3" />
      {issueStatusLabels[status]}
    </span>
  )
}

interface IssueTypeBadgeProps {
  type: IssueType
}

export function IssueTypeBadge({ type }: IssueTypeBadgeProps) {
  const { t } = useTranslation()
  const issueTypeLabels = getIssueTypeLabels(t)

  const styles: Record<IssueType, string> = {
    late_arrival: 'bg-warning/10 text-warning border-warning/20',
    late_departure: 'bg-accent/10 text-accent border-accent/20',
    early_departure: 'bg-warning/10 text-warning border-warning/20',
    missing_entry: 'bg-destructive/10 text-destructive border-destructive/20',
    missing_exit: 'bg-destructive/10 text-destructive border-destructive/20',
    missing_clock_out: 'bg-destructive/10 text-destructive border-destructive/20',
    missing_lunch_out: 'bg-warning/10 text-warning border-warning/20',
    missing_lunch_in: 'bg-warning/10 text-warning border-warning/20',
    extended_lunch: 'bg-chart-5/10 text-chart-5 border-chart-5/20',
    no_punches: 'bg-destructive/10 text-destructive border-destructive/20',
    manual_punch: 'bg-primary/10 text-primary border-primary/20',
    deleted_punch: 'bg-chart-5/10 text-chart-5 border-chart-5/20',
    modified_payment: 'bg-success/10 text-success border-success/20',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        styles[type],
      )}
    >
      <AlertCircle className="h-3 w-3" />
      {issueTypeLabels[type]}
    </span>
  )
}
