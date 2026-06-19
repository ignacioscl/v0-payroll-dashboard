'use client'

import { Hand } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n/locale-context'

export function PunchManualIndicator() {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer rounded-sm text-sky-600 transition-colors hover:bg-sky-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-400"
          aria-label={t('punch.manual')}
        >
          <Hand className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <p className="text-xs font-medium text-foreground">{t('punch.manual')}</p>
      </PopoverContent>
    </Popover>
  )
}
