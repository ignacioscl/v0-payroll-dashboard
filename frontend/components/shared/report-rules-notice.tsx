'use client'

import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { Messages } from '@/lib/i18n/messages/schema'

type ReportRulesScreen = keyof Messages['reportRules']

/** How many items each notice has (keys `itemN` in the catalogs). */
const ITEM_COUNT: Record<ReportRulesScreen, number> = {
  billing: 6,
  collections: 2,
  payroll: 2,
  productionVsGoal: 5,
  invoices: 2,
  incomeByDealer: 4,
}

/**
 * «What this screen counts» notice (T2.1 of plans/plan-totales-income-centavos/PLAN.md): one line
 * with the info icon and the title; a click opens the list in a popover, like the help of the KPI
 * cards (plans/plan-demo-prime-piecework-avisos §7.2). Texts from `reportRules.<screen>.title` /
 * `.itemN`, approved word by word (C1–C6); they are not changed without Ignacio's OK.
 */
export function ReportRulesNotice({ screen }: { screen: ReportRulesScreen }) {
  const { t } = useTranslation()
  const items = Array.from({ length: ITEM_COUNT[screen] }, (_, i) => `item${i + 1}`)
  const title = t(`reportRules.${screen}.title`)
  return (
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-0 max-w-full cursor-pointer items-start gap-1.5 rounded text-left text-sm font-medium text-sky-700 transition-colors hover:text-sky-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-sky-300 dark:hover:text-sky-100"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">{title}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] text-foreground/80">
          <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-sm">
            {items.map((k) => (
              <li key={k}>{t(`reportRules.${screen}.${k}`)}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
