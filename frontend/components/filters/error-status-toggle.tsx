'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { errorStatusCrossesType, isErrorStatus } from '@/lib/ttk/error-status'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import { cn } from '@/lib/utils'

/**
 * Eje pendiente / corregido.
 *
 * Vive en la barra de filtros, al lado del rango de fechas, porque es un filtro de
 * la misma naturaleza que dealers y rango y tiene que valer igual en las dos
 * pantallas que lo usan.
 *
 * Cuando Punch Report no está en *Only flagged* (All punches) el eje no filtra,
 * así que no marca ninguna opción. Igual se puede clickear: elegir un estado pasa
 * la lista a *Only flagged*, lo mismo que clickear esa tarjeta, y fija el estado.
 */
export function ErrorStatusToggle({
  className,
  /**
   * El cruce con el tipo es exclusivo de `/issues`. En el Dashboard `selectedType`
   * sólo arma deep-links y no filtra nada, así que ahí el switch no mira el tipo.
   */
  respectSelectedType = false,
}: {
  className?: string
  respectSelectedType?: boolean
}) {
  const { t } = useTranslation()
  const { errorStatus, setErrorStatus, selectedType, setSelectedType, setSelectedTodayLiveStatus } =
    useFilters()

  const notApplied = respectSelectedType && !errorStatusCrossesType(selectedType)

  const control = (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={notApplied ? '' : errorStatus}
      onValueChange={(value) => {
        // Radix emite '' al des-seleccionar el ítem activo: sin este guard el eje
        // se queda sin valor y la grilla pide un issueType vacío.
        if (!isErrorStatus(value)) return
        setErrorStatus(value)
        if (notApplied) {
          // Igual que clickear la tarjeta Only flagged (`selectShow` de /issues).
          setSelectedType('only_flagged')
          setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
        }
      }}
      className={cn('shrink-0', className)}
      aria-label={t('punch.errorStatus')}
    >
      <ToggleGroupItem value="pending" className="cursor-pointer px-3">
        {t('punch.errorStatusPending')}
      </ToggleGroupItem>
      <ToggleGroupItem value="corrected" className="cursor-pointer px-3">
        {t('punch.errorStatusCorrected')}
      </ToggleGroupItem>
    </ToggleGroup>
  )

  if (!notApplied) return control

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{control}</span>
      </TooltipTrigger>
      <TooltipContent>{t('punch.errorStatusNotApplicable')}</TooltipContent>
    </Tooltip>
  )
}
