'use client'

import { SegmentedControl } from '@/components/shared/segmented-control'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { errorStatusCrossesType, isErrorStatus } from '@/lib/ttk/error-status'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'

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
    <SegmentedControl
      value={notApplied ? '' : errorStatus}
      onValueChange={(value) => {
        // SegmentedControl ya ignora el '' de Radix al des-seleccionar el ítem activo.
        if (!isErrorStatus(value)) return
        setErrorStatus(value)
        if (notApplied) {
          // Igual que clickear la tarjeta Only flagged (`selectShow` de /issues).
          setSelectedType('only_flagged')
          setSelectedTodayLiveStatus(TODAY_LIVE_STATUS_ALL)
        }
      }}
      options={[
        { value: 'pending', label: t('punch.errorStatusPending') },
        { value: 'corrected', label: t('punch.errorStatusCorrected') },
      ]}
      className={className}
      aria-label={t('punch.errorStatus')}
    />
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
