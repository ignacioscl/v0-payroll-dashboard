'use client'

import { CheckCheck, Trash2 } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { errorTypeLabel, type ErrorTypeCode } from '@/lib/ttk/error-type-meta'
import { useTranslation } from '@/lib/i18n/locale-context'
import { formatUsDateTimeForExport } from '@/lib/format-us-datetime'
import type { TtkListRowFix } from '@/lib/ttk/ttk-list-types'

/**
 * Un chip por EVENTO de corrección, con su tipo y su fecha.
 *
 * La grilla lista ponchadas y el card cuenta eventos: una ponchada con dos
 * correcciones es una fila con dos chips. `fixedAt` legacy no puede alimentar
 * esto —es una sola marca por ponchada, y nula en los dos casos que este modo
 * viene a mostrar—, por eso los eventos viajan en `fixes[]`.
 *
 * Cada chip lleva TAMBIÉN su `punchDate`: el filtro va por esa fecha pero la fila
 * se muestra y se ordena por `punch_in`. Si alguna vez divergen, se ve acá en vez
 * de quedar escondido.
 */
export function PunchFixChips({ fixes }: { fixes?: TtkListRowFix[] }) {
  const { t } = useTranslation()
  if (!fixes || fixes.length === 0) return null

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {fixes.map((fix, i) => (
        <Tooltip key={`${fix.errorType}-${fix.fixedAt}-${i}`}>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-default items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              <CheckCheck className="h-2.5 w-2.5" />
              {errorTypeLabel(t, fix.errorType as ErrorTypeCode)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-0.5 text-xs">
              <span>{formatUsDateTimeForExport(fix.fixedAt)}</span>
              {fix.fixedByName ? (
                <span>{`${t('punch.correctedBy')}: ${fix.fixedByName}`}</span>
              ) : null}
              <span className="text-muted-foreground">{fix.punchDate}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}

/** La ponchada fue eliminada. En modo Corrected sigue en la lista: la corrección existió. */
export function PunchDeletedChip() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
      <Trash2 className="h-2.5 w-2.5" />
      {t('punch.deletedPunchChip')}
    </span>
  )
}
