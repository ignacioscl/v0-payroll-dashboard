'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/i18n/locale-context'

/**
 * «Removed» next to the name of a dealer removed with «Remove», on the rows that show because
 * «Include removed dealers» is on (§5 of plans/plan-totales-income-centavos/PLAN.md, D10).
 */
export function RemovedDealerBadge() {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-default px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
          {t('businessKpis.removedDealerTag')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{t('businessKpis.removedDealerTagHelp')}</TooltipContent>
    </Tooltip>
  )
}
