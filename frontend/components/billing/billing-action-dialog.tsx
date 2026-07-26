'use client'

import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type BillingActionTone = 'sky' | 'emerald' | 'violet' | 'amber' | 'slate'

const TONE: Record<
  BillingActionTone,
  { wrap: string; icon: string }
> = {
  sky: {
    wrap: 'bg-accent/12 ring-accent/20',
    icon: 'text-accent dark:text-accent',
  },
  emerald: {
    wrap: 'bg-emerald-500/12 ring-emerald-500/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  violet: {
    wrap: 'bg-violet-500/12 ring-violet-500/20',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  amber: {
    wrap: 'bg-amber-500/12 ring-amber-500/20',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  slate: {
    wrap: 'bg-muted ring-border/60',
    icon: 'text-foreground/70',
  },
}

export function BillingActionDialog({
  open,
  onOpenChange,
  tone = 'sky',
  icon: Icon,
  title,
  subtitle,
  children,
  cancelLabel,
  confirmLabel,
  confirmIcon: ConfirmIcon,
  onConfirm,
  pending = false,
  pendingLabel,
  confirmDisabled = false,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tone?: BillingActionTone
  icon: LucideIcon
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  cancelLabel: string
  confirmLabel: string
  confirmIcon?: LucideIcon
  onConfirm: () => void | Promise<void>
  pending?: boolean
  pendingLabel?: string
  confirmDisabled?: boolean
  className?: string
}) {
  const toneCfg = TONE[tone]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          'gap-0 overflow-hidden p-0 sm:max-w-lg',
          className,
        )}
      >
        <div className="flex items-start gap-4 border-b border-border/70 px-5 py-4">
          <div
            className={cn(
              'mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full ring-4',
              toneCfg.wrap,
            )}
            aria-hidden
          >
            <Icon className={cn('size-5', toneCfg.icon)} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 space-y-1 pr-6">
            <DialogTitle className="text-base font-semibold tracking-tight">
              {title}
            </DialogTitle>
            {subtitle ? (
              <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
                {subtitle}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </div>
        </div>

        <div className="max-h-[min(60vh,28rem)] space-y-5 overflow-y-auto px-5 py-4">
          {children}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-5 py-3.5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={pending || confirmDisabled}
            onClick={() => void onConfirm()}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : ConfirmIcon ? (
              <ConfirmIcon className="size-4" />
            ) : null}
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Section label inside billing action dialogs. */
export function BillingActionSection({
  title,
  hint,
  children,
  className,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="space-y-0.5">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </h3>
        {hint ? <p className="text-[11px] leading-snug text-muted-foreground/90">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** Selectable radio/checkbox tile — denser than a bare Select. */
export function BillingOptionTile({
  selected,
  onSelect,
  title,
  description,
  icon: Icon,
  disabled,
  className,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description?: string
  icon?: LucideIcon
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected
          ? 'border-primary/55 bg-primary/5 ring-1 ring-primary/25'
          : 'border-border/80 bg-card hover:bg-muted/40',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
        )}
        aria-hidden
      >
        {selected ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
      </span>
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

/** Toggle row with checkbox affordance, for secondary options. */
export function BillingToggleRow({
  checked,
  onCheckedChange,
  title,
  description,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  title: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      aria-pressed={checked}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-left transition-colors',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        checked && 'border-border bg-muted/35',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40 bg-background',
        )}
        aria-hidden
      >
        {checked ? (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}
