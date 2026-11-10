'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney, fmtQty } from '@/lib/kpi-money'
import { fetchIncomeByDealerServices, type IncomeServicesDealer } from '@/lib/srs-kpis-api'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import { cn } from '@/lib/utils'

/**
 * The open row of Income by Dealer (plans/plan-income-by-dealer-por-servicio §5.2 and T3): the services of one dealer in
 * one year, asked alone (one dealer and one year per request). Markup of the Expenses sub-table (`GroupRows`).
 */
export function IncomeDealerServices({
  dealerId,
  fechaDesde,
  fechaHasta,
  filterDateDone,
  wrap,
}: {
  dealerId: number
  /** The range of that year, as the backend cropped it. */
  fechaDesde: string
  fechaHasta: string
  filterDateDone: boolean
  wrap: string
}) {
  const { t } = useTranslation()
  // Without «Include removed dealers»: sent, the request of one dealer would also bring every removed one (T3). A removed
  // dealer is still found by its id, so the answer does not depend on the switch and the key does not carry it.
  const query = useQuery({
    queryKey: ['srs-kpi', 'income-by-dealer-services', { fechaDesde, fechaHasta, idDealer: dealerId, filterDateDone }],
    queryFn: () => fetchIncomeByDealerServices({ fechaDesde, fechaHasta, idDealer: String(dealerId), filterDateDone }),
  })

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    )
  }
  if (query.isError) {
    return (
      <p className="px-3 py-3 text-xs text-destructive">
        {isSrsBusyError(query.error) ? t('common.serverBusy') : t('common.failedToLoad')}
      </p>
    )
  }
  // Its own dealer, never the first one or the totals of the year.
  const d = query.data?.years[0]?.dealers.find((x) => x.dealerId === dealerId)
  if (!d) return <p className="px-3 py-3 text-xs text-muted-foreground">{t('incomeByDealer.noData')}</p>
  return <ServicesTable d={d} wrap={wrap} />
}

function ServicesTable({ d, wrap }: { d: IncomeServicesDealer; wrap: string }) {
  const { t } = useTranslation()
  const num = 'py-1 pl-2 text-right tabular-nums'
  const head = 'py-1 font-medium text-muted-foreground'
  const total = 'border-t border-border/50 font-semibold'
  const section = (title: string) => (
    <tr>
      <td colSpan={4} className={cn('pb-1 pt-3 font-semibold', wrap)}>
        {title}
      </td>
    </tr>
  )
  return (
    <div className="min-w-0 px-3 py-2" data-testid="income-dealer-services">
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col />
          <col className="w-14 sm:w-32" />
          <col className="w-16 sm:w-32" />
          <col className="w-24 sm:w-40" />
        </colgroup>
        <tbody>
          {d.wo.services.length > 0 ? (
            <>
              {section(t('incomeByDealer.sectionWo'))}
              <tr>
                <th className={cn(head, 'text-left')}>{t('incomeByDealer.colService')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colQty')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colVehicles')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colIncome')}</th>
              </tr>
              {d.wo.services.map((s) => (
                <tr key={s.service} className="border-t border-border/50">
                  <td className={cn('py-1 pr-2', wrap)}>{s.service}</td>
                  <td className={num}>{fmtQty(s.qty)}</td>
                  <td className={num}>{fmtQty(s.vehicles)}</td>
                  <td className={num}>{fmtMoney(s.income)}</td>
                </tr>
              ))}
              <tr className={total} data-testid="income-services-total-wo">
                <td className={cn('py-1 pr-2', wrap)}>{t('incomeByDealer.totalWo')}</td>
                <td className={num}>{fmtQty(d.wo.qty)}</td>
                <td className={num}>{fmtQty(d.wo.vehicles)}</td>
                <td className={num}>{fmtMoney(d.wo.income)}</td>
              </tr>
            </>
          ) : null}

          {d.generic.lines.length > 0 ? (
            <>
              {section(t('incomeByDealer.sectionGeneric'))}
              <tr>
                <th className={cn(head, 'text-left')}>{t('incomeByDealer.colDescription')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colQty')}</th>
                <th />
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colIncome')}</th>
              </tr>
              {d.generic.lines.map((g, i) => (
                <tr key={`${g.description}-${i}`} className="border-t border-border/50">
                  <td className={cn('py-1 pr-2', wrap)}>{g.description}</td>
                  <td className={num}>{g.qty === null ? '' : fmtQty(g.qty)}</td>
                  <td />
                  <td className={num}>{fmtMoney(g.income)}</td>
                </tr>
              ))}
              <tr className={total}>
                <td className={cn('py-1 pr-2', wrap)}>{t('incomeByDealer.totalGeneric')}</td>
                <td />
                <td />
                <td className={num}>{fmtMoney(d.generic.income)}</td>
              </tr>
            </>
          ) : null}

          {d.ttk.lines.length > 0 ? (
            <>
              {section(t('incomeByDealer.sectionTtk'))}
              <tr>
                <th className={cn(head, 'text-left')}>{t('incomeByDealer.colEmployee')}</th>
                <th />
                <th />
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colIncome')}</th>
              </tr>
              {d.ttk.lines.map((l) => (
                <tr key={l.employee} className="border-t border-border/50">
                  <td className={cn('py-1 pr-2', wrap)}>{l.employee}</td>
                  <td />
                  <td />
                  <td className={num}>{fmtMoney(l.income)}</td>
                </tr>
              ))}
              <tr className={total}>
                <td className={cn('py-1 pr-2', wrap)}>{t('incomeByDealer.totalTtk')}</td>
                <td />
                <td />
                <td className={num}>{fmtMoney(d.ttk.income)}</td>
              </tr>
            </>
          ) : null}

          <tr className="border-t-2 border-border font-semibold text-sm" data-testid="income-services-total-dealer">
            <td colSpan={3} className={cn('pb-1 pr-2 pt-3', wrap)}>
              {t('incomeByDealer.totalDealer', { dealer: d.dealer })}
            </td>
            <td className="pb-1 pl-2 pt-3 text-right tabular-nums">{fmtMoney(d.income)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
