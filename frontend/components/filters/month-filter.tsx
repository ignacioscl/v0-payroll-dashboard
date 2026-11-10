'use client'

import { useMemo, useState } from 'react'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { closingMonthLabel, closingMonthOptions } from '@/lib/reports/monthly-closing-month'
import { cn } from '@/lib/utils'

type MonthOption = { id: string; label: string }

/**
 * Filtro de mes del header en Monthly Closing y Window Tint Closing (MC §5.4.1): reemplaza al calendario en esas
 * rutas, como `IncomeYearFilter` en Income by Dealer. Combo de una selección con búsqueda (regla
 * searchable-combobox: más de 80 meses), del mes actual de New York a 2020-01.
 */
export function MonthFilter({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { closingMonth, setClosingMonth } = useFilters()
  const [term, setTerm] = useState('')
  const options = useMemo<MonthOption[]>(
    () => closingMonthOptions().map((id) => ({ id, label: closingMonthLabel(id) })),
    [],
  )
  const value = useMemo(() => options.find((o) => o.id === closingMonth) ?? null, [options, closingMonth])
  const items = useMemo(() => {
    const q = term.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.id.includes(q)) : options
  }, [options, term])

  return (
    <SearchableCombobox<MonthOption>
      value={value}
      onChange={(next) => setClosingMonth(next?.id ?? '')}
      searchTerm={term}
      onSearchTermChange={setTerm}
      items={items}
      serverSideSearch
      getItemKey={(o) => o.id}
      getItemLabel={(o) => o.label}
      placeholder={t('monthlyClosing.monthPlaceholder')}
      searchPlaceholder={t('monthlyClosing.monthPlaceholder')}
      emptyTitle={t('monthlyClosing.monthNoResults')}
      showFooterHint={false}
      className={cn('h-9 w-[200px] py-0', className)}
    />
  )
}
