'use client'

import { useMemo } from 'react'
import { DateRangePicker } from '@/components/filters/date-range-picker'
import { DealerMultiSelect } from '@/components/filters/dealer-multi-select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'

/**
 * Primer año del combo: en PROD (copia del 16/10/2026) las WO arrancan el 16/10/2017 con 163 WO y el
 * volumen real en 2018 (8,931 WO). Decidido por Ignacio el 24/10/2026: desde 2018.
 */
export const INCOME_FIRST_YEAR = 2018

/** Años del combo, de mayor a menor: del año en curso a INCOME_FIRST_YEAR. */
export function incomeYearOptions(today = new Date()): number[] {
  const out: number[] = []
  for (let y = today.getFullYear(); y >= INCOME_FIRST_YEAR; y--) out.push(y)
  return out
}

/** Años que cubre un rango del calendario (para marcar el combo al pasar a «By year»). */
function yearsOfRange(from: Date | undefined, to: Date | undefined): number[] {
  if (!from) return []
  const end = to ?? from
  const out: number[] = []
  for (let y = end.getFullYear(); y >= from.getFullYear(); y--) {
    if (y >= INCOME_FIRST_YEAR) out.push(y)
  }
  return out
}

/**
 * Combo de años: wrapper fino sobre DealerMultiSelect (regla searchable-combobox: la multi-selección
 * va por el genérico), con el orden fijo de mayor a menor.
 */
function YearMultiSelect({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { incomeYears, setIncomeYears } = useFilters()
  const options = useMemo(
    () => incomeYearOptions().map((y) => ({ id: String(y), label: String(y) })),
    [],
  )
  const value = useMemo(() => incomeYears.map(String), [incomeYears])
  return (
    <DealerMultiSelect
      dealers={options}
      value={value}
      onChange={(next) => setIncomeYears(next.map(Number))}
      keepOrder
      placeholder={t('incomeByDealer.yearsPlaceholder')}
      allSelectedLabel={t('incomeByDealer.allYears')}
      searchPlaceholder={t('incomeByDealer.yearsPlaceholder')}
      manySelectedLabel={(count) => t('incomeByDealer.yearsCount', { count })}
      className={cn('min-w-[180px] w-[180px]', className)}
    />
  )
}

/**
 * Filtro de fechas del header en Income by Dealer: switch «By year»; apagado, el calendario de
 * siempre; prendido, el combo de años. El calendario no se toca, así que las otras pantallas
 * siguen con sus fechas.
 */
export function IncomeYearFilter({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { dateRange, setDateRange, incomeYearMode, setIncomeYearMode, incomeYears, setIncomeYears } =
    useFilters()

  const onModeChange = (on: boolean) => {
    if (on && incomeYears.length === 0) {
      setIncomeYears(yearsOfRange(dateRange?.from, dateRange?.to))
    }
    setIncomeYearMode(on)
  }

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      <div className="flex shrink-0 items-center gap-2">
        <Switch id="income-year-mode" checked={incomeYearMode} onCheckedChange={onModeChange} />
        <Label htmlFor="income-year-mode" className="cursor-pointer text-sm font-normal">
          {t('incomeByDealer.byYear')}
        </Label>
      </div>
      {incomeYearMode ? (
        <YearMultiSelect className="shrink-0" />
      ) : (
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      )}
    </div>
  )
}
