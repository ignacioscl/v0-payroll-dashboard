'use client'

import { FileText, Fingerprint, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { InvoiceStatementTypeToken } from '@/lib/srs-invoices-api'

export type InvoiceTypeState = Record<InvoiceStatementTypeToken, boolean>

const OPTIONS: { token: InvoiceStatementTypeToken; icon: LucideIcon; labelKey: 'invoices.typeWo' | 'invoices.typeTtk' | 'invoices.typeGeneric' }[] = [
  { token: 'wo', icon: Wrench, labelKey: 'invoices.typeWo' },
  { token: 'ttk', icon: Fingerprint, labelKey: 'invoices.typeTtk' },
  { token: 'generic', icon: FileText, labelKey: 'invoices.typeGeneric' },
]

/** Active-state styling aligned with row type badges in the table. */
const TYPE_ACTIVE: Record<
  InvoiceStatementTypeToken,
  { button: string; icon: string; ring: string; focus: string }
> = {
  wo: {
    button: 'bg-sky-500/10 text-sky-800 dark:text-sky-200',
    icon: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-500/30',
    focus: 'focus-visible:ring-sky-500/50',
  },
  ttk: {
    button: 'bg-violet-500/10 text-violet-800 dark:text-violet-200',
    icon: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500/30',
    focus: 'focus-visible:ring-violet-500/50',
  },
  generic: {
    button: 'bg-amber-500/10 text-amber-900 dark:text-amber-200',
    icon: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500/30',
    focus: 'focus-visible:ring-amber-500/50',
  },
}

export function typesToCsv(state: InvoiceTypeState): string {
  return OPTIONS.filter((o) => state[o.token])
    .map((o) => o.token)
    .join(',')
}

/**
 * Segmented multi-select for statement types (WO / TTK / Generic).
 * At least one type stays on — the last active pill can't be turned off.
 */
export function InvoiceTypeFilter({
  value,
  onChange,
  disabled,
}: {
  value: InvoiceTypeState
  onChange: (next: InvoiceTypeState) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const activeCount = OPTIONS.filter((o) => value[o.token]).length

  const toggle = (token: InvoiceStatementTypeToken) => {
    const isActive = value[token]
    if (isActive && activeCount === 1) return
    onChange({ ...value, [token]: !isActive })
  }

  return (
    <div
      role="group"
      aria-label={t('invoices.typesLabel')}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
    >
      {OPTIONS.map(({ token, icon: Icon, labelKey }) => {
        const active = value[token]
        const isLastActive = active && activeCount === 1
        const accent = TYPE_ACTIVE[token]
        return (
          <button
            key={token}
            type="button"
            aria-pressed={active}
            disabled={disabled || isLastActive}
            onClick={() => toggle(token)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              accent.focus,
              active
                ? cn('shadow-sm ring-1', accent.button, accent.ring)
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              isLastActive && 'cursor-default',
              disabled && 'opacity-60',
            )}
          >
            <Icon
              className={cn('h-3.5 w-3.5 shrink-0', active ? accent.icon : '')}
              strokeWidth={2.25}
            />
            <span className="whitespace-nowrap">{t(labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}
