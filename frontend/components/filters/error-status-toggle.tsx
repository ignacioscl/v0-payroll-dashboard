'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { errorStatusCrossesType, isErrorStatus } from '@/lib/ttk/error-status'
import { cn } from '@/lib/utils'

/**
 * Eje pendiente / corregido.
 *
 * Vive en la barra de filtros, al lado del rango de fechas, porque es un filtro de
 * la misma naturaleza que dealers y rango y tiene que valer igual en las dos
 * pantallas que lo usan.
 *
 * Cuando el radio de Punch Report no está en *Only with errors* (ninguna
 * tarjeta, *Manual punch*, *Without salary*, *Deleted punches*) se muestra
 * **deshabilitado con su hint, no oculto**: si desaparece, el usuario no entiende
 * por qué dejó de filtrar.
 */
export function ErrorStatusToggle({
  className,
  /**
   * El deshabilitado por tipo es exclusivo de `/issues`. En el Dashboard
   * `selectedType` sólo arma deep-links y no filtra nada, así que un usuario que
   * vuelve de Punch Report con *Manual punch* puesto se encontraría el switch
   * trabado sin ninguna causa visible.
   */
  respectSelectedType = false,
}: {
  className?: string
  respectSelectedType?: boolean
}) {
  const { t } = useTranslation()
  const { errorStatus, setErrorStatus, selectedType } = useFilters()

  const disabled = respectSelectedType && !errorStatusCrossesType(selectedType)

  const control = (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={errorStatus}
      disabled={disabled}
      onValueChange={(value) => {
        // Radix emite '' al des-seleccionar el ítem activo: sin este guard el eje
        // se queda sin valor y la grilla pide un issueType vacío.
        if (isErrorStatus(value)) setErrorStatus(value)
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

  if (!disabled) return control

  return (
    <Tooltip>
      {/* El wrapper hace falta: un control deshabilitado no emite eventos de hover. */}
      <TooltipTrigger asChild>
        <span className="inline-flex">{control}</span>
      </TooltipTrigger>
      <TooltipContent>{t('punch.errorStatusNotApplicable')}</TooltipContent>
    </Tooltip>
  )
}
