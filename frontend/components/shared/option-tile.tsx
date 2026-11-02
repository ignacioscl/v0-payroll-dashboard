'use client'

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Single-choice tile: the tile itself shows the selection, no radio dot (rule
 * selection-tiles-no-radio). Shared by Billing (`BillingOptionTile`) and Expenses.
 */
export function OptionTile({
  selected,
  onSelect,
  title,
  description,
  icon: Icon,
  disabled,
  className,
  dataField,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description?: string
  icon?: LucideIcon
  disabled?: boolean
  className?: string
  /** Form field this tile answers (`focusFirstInvalidField` looks it up by `data-field`). */
  dataField?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      data-field={dataField}
      className={cn(
        'flex w-full cursor-pointer items-start rounded-lg border px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected
          ? 'border-primary/55 bg-primary/5 ring-1 ring-primary/25'
          : 'border-border/80 bg-card hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} /> : null}
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}
