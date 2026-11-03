'use client'

import * as React from 'react'
import { ChevronDown, Filter, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

/** Etiqueta de un campo dentro del panel, como en `InvoiceFilterDeck`. */
export const FILTER_FIELD_LABEL = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

export type FilterPanelChip = { key: string; label: string; onRemove: () => void }

/**
 * Panel de filtros plegable de una lista: tarjeta con título, cantidad de activos, chips y «Clear all».
 * Mismo diseño que `InvoiceFilterDeck` y `PunchReportFilterPanel`. Cerrado por defecto, se abre solo
 * cuando entra un filtro activo y recuerda lo que eligió el usuario en la sesión.
 */
export function FilterPanel({ storageKey, chips, children }: { storageKey: string; chips: FilterPanelChip[]; children: React.ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [hydrated, setHydrated] = React.useState(false)
  const prevActiveKey = React.useRef('')
  const activeKey = chips.map((c) => c.key).join('|')

  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved === '1') setOpen(true)
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [storageKey])

  React.useEffect(() => {
    if (!hydrated) return
    if (activeKey && activeKey !== prevActiveKey.current) setOpen(true)
    prevActiveKey.current = activeKey
  }, [activeKey, hydrated])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    try {
      sessionStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <Filter className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-foreground">{t('invoices.filterPanelTitle')}</span>
          <span className="flex-1" />
          {chips.length > 0 ? (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {t('invoices.filtersActive', { count: chips.length })}
            </span>
          ) : null}
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 pr-1.5 text-[11px] font-medium text-foreground"
            >
              {chip.label}
              <button
                type="button"
                className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`${t('common.clear')} ${chip.label}`}
                onClick={chip.onRemove}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer gap-1 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => chips.forEach((chip) => chip.onRemove())}
          >
            <X className="size-3" />
            {t('common.clearAll')}
          </Button>
        </div>
      ) : null}

      <CollapsibleContent className="border-t border-border px-4 py-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
