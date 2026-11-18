'use client'

import { DatePicker } from '@/components/filters/date-picker'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { localDateToYmd, todayNyYmd, ymdToLocalDate } from '@/lib/reports/open-invoices-dates'
import { cn } from '@/lib/utils'

/** Solo domingos (react-day-picker `dayOfWeek`: 0 = domingo). */
const NOT_SUNDAY = { dayOfWeek: [1, 2, 3, 4, 5, 6] }

/**
 * Filtro «As of» del header en Open Invoices (plans/plan-reporte-javier §4.3): reemplaza al calendario de rango en esa
 * ruta, como `MonthFilter` en Monthly Closing. Un domingo, nada futuro, siempre con valor (sin «Clear»).
 */
export function SundayFilter({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { t } = useTranslation()
  const { openInvoicesAsOf, setOpenInvoicesAsOf } = useFilters()
  const picker = (
    <DatePicker
      className={cn(!withLabel && className)}
      value={openInvoicesAsOf ? ymdToLocalDate(openInvoicesAsOf) : undefined}
      onChange={(d) => {
        if (d) setOpenInvoicesAsOf(localDateToYmd(d))
      }}
      toDate={ymdToLocalDate(todayNyYmd())}
      disabledDays={NOT_SUNDAY}
      hideClear
    />
  )
  if (!withLabel) return picker
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="whitespace-nowrap text-sm text-muted-foreground">{t('openInvoices.asOf')}</span>
      {picker}
    </span>
  )
}
