'use client'

import { BookOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/i18n/locale-context'

/** Static PDF in `public/docs` (source: docs/roles-guide, plans/plan-manual-roles). English only. */
export const ROLES_GUIDE_URL = '/docs/SRS-PRO-Roles-Guide.pdf'

/** «Guide» button for the Roles and Role Templates headers: opens the Roles guide PDF in a new tab. */
export function RolesGuideButton() {
  const { t } = useTranslation()
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5">
            <a href={ROLES_GUIDE_URL} target="_blank" rel="noopener noreferrer">
              <BookOpen className="size-4" aria-hidden />
              {t('roles.guide')}
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('roles.guideTooltip')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
