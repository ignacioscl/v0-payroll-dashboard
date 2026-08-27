'use client'

import { Eye, EyeOff, Lock, Trash2, type LucideIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { InvoiceDeletedMode } from '@/lib/invoice-search-lock'
import { useTranslation } from '@/lib/i18n/locale-context'

const OPTIONS: {
  value: InvoiceDeletedMode
  icon: LucideIcon
  labelKey:
    | 'invoices.filterDeletedHide'
    | 'invoices.filterDeletedOnly'
    | 'invoices.filterDeletedAll'
  tooltipKey:
    | 'invoices.filterDeletedHideTooltip'
    | 'invoices.filterDeletedOnlyTooltip'
    | 'invoices.filterDeletedAllTooltip'
}[] = [
  {
    value: 'hide',
    icon: EyeOff,
    labelKey: 'invoices.filterDeletedHide',
    tooltipKey: 'invoices.filterDeletedHideTooltip',
  },
  {
    value: 'only',
    icon: Trash2,
    labelKey: 'invoices.filterDeletedOnly',
    tooltipKey: 'invoices.filterDeletedOnlyTooltip',
  },
  {
    value: 'all',
    icon: Eye,
    labelKey: 'invoices.filterDeletedAll',
    tooltipKey: 'invoices.filterDeletedAllTooltip',
  },
]

/**
 * Exclusive Hide / Only / Show all. Not InvoiceTypeFilter (that one is multi-select).
 */
export function InvoiceDeletedFilter({
  value,
  onChange,
  disabled,
  locked,
}: {
  value: InvoiceDeletedMode
  onChange: (next: InvoiceDeletedMode) => void
  disabled?: boolean
  locked?: boolean
}) {
  const { t } = useTranslation()
  const frozen = Boolean(disabled || locked)

  return (
    <div className={cn('inline-flex items-center gap-1.5', locked && 'opacity-70')}>
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {locked ? <Lock className="size-2.5" aria-hidden /> : null}
        {t('invoices.filterDeletedLabel')}
      </span>
      <div
        role="radiogroup"
        aria-label={t('invoices.filterDeletedLabel')}
        aria-disabled={frozen}
        className="inline-flex h-7 shrink-0 items-center gap-px rounded-md border border-border/60 bg-muted/30 p-px"
      >
        {OPTIONS.map(({ value: option, icon: Icon, labelKey, tooltipKey }) => {
          const active = value === option
          return (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={frozen}
                    onClick={() => onChange(option)}
                    className={cn(
                      'inline-flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium leading-none transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50',
                      frozen ? 'cursor-not-allowed' : 'cursor-pointer',
                      active
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3 shrink-0" strokeWidth={2.25} />
                    <span className="whitespace-nowrap">{t(labelKey)}</span>
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {locked ? t('invoices.filterDeletedForced') : t(tooltipKey)}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
