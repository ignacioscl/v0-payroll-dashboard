'use client'

import { Info } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RemovedDealersSwitchState } from '@/hooks/use-removed-dealers-available'
import { useTranslation } from '@/lib/i18n/locale-context'

/**
 * «Include removed dealers», next to «Filter by completion date». Renders nothing unless the
 * screen's useRemovedDealersSwitch says it is visible (rule include-removed-dealers).
 */
export function RemovedDealersSwitch({
  id,
  state,
  disabled,
}: {
  id: string
  state: RemovedDealersSwitchState
  disabled?: boolean
}) {
  const { t } = useTranslation()
  if (!state.visible) return null
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={state.checked} onCheckedChange={state.setChecked} disabled={disabled} />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {t('businessKpis.includeRemovedDealers')}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-pointer text-muted-foreground hover:text-foreground"
            aria-label={t('businessKpis.includeRemovedDealersHelp')}
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{t('businessKpis.includeRemovedDealersHelp')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
