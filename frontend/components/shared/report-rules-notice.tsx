'use client'

import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
 * «What this screen counts» notice (T2.1 of plans/plan-totales-income-centavos/PLAN.md): bold
 * title and a short list, from `reportRules.<screen>.title` / `.itemN`. Texts approved word by word
 * (C1–C6); they are not changed without Ignacio's OK.
 */
export function ReportRulesNotice({ screen }: { screen: ReportRulesScreen }) {
  const { t } = useTranslation()
  const items = Array.from({ length: ITEM_COUNT[screen] }, (_, i) => `item${i + 1}`)
  return (
    <Alert className="border-sky-500/30 bg-sky-500/5">
      <Info className="h-4 w-4 text-sky-700 dark:text-sky-300" />
      <AlertDescription className="min-w-0 text-foreground/80">
        <p className="font-semibold text-foreground">{t(`reportRules.${screen}.title`)}</p>
        <ul className="list-disc space-y-0.5 pl-4 text-sm">
          {items.map((k) => (
            <li key={k}>{t(`reportRules.${screen}.${k}`)}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
