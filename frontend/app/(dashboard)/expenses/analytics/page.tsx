'use client'

import * as React from 'react'
import { PieChart, Receipt, TrendingUp } from 'lucide-react'

import { KPICard } from '@/components/dashboard/kpi-card'
import { AnalyticsTable } from '@/components/expenses/analytics-table'
import { RemovedDealersSwitch } from '@/components/filters/removed-dealers-switch'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useExpenseAnalytics } from '@/hooks/use-expense-analytics'
import { useRemovedDealersSwitch } from '@/hooks/use-removed-dealers-available'
import { canAccessExpenses } from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { fmtAmount, toYmd } from '@/lib/expenses/expense-format'
import { toCents } from '@/lib/expenses/expense-rules'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { AnalyticsGroupBy, AnalyticsParams, ExpenseStatus } from '@/lib/srs-expenses-api'

type StatusFilter = 'all' | ExpenseStatus

export default function ExpensesAnalyticsPage() {
  const { t } = useTranslation()
  const { user, loading, hasPermission } = useSrsMe()
  const { dateRange, selectedDealers, filtersHydrated } = useFilters()
  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)
  const [tab, setTab] = React.useState<AnalyticsGroupBy>('category')
  const [status, setStatus] = React.useState<StatusFilter>('all')

  const from = toYmd(dateRange?.from)
  const to = toYmd(dateRange?.to ?? dateRange?.from)
  const ready = filtersHydrated && !loading && canAccess && selectedDealers.length > 0 && Boolean(from)

  // «Include removed dealers» solo en la solapa Branch (rule include-removed-dealers).
  const removedDealers = useRemovedDealersSwitch({
    fechaDesde: from || undefined,
    fechaHasta: to || undefined,
    filterDateDone: false,
    ready: ready && tab === 'dealer',
  })

  const params = React.useMemo<AnalyticsParams | null>(() => {
    if (!ready) return null
    return {
      groupBy: tab,
      from,
      to,
      idDealer: selectedDealers.join(','),
      status: status === 'all' ? undefined : status,
      includeRemovedDealers: tab === 'dealer' ? removedDealers.include : false,
    }
  }, [ready, tab, from, to, selectedDealers, status, removedDealers.include])

  const query = useExpenseAnalytics(params)

  if (!loading && !canAccess) return <AccessDenied message={t('expenses.noAccess')} />

  const data = query.data
  const delta = data ? (toCents(data.total) - toCents(data.prevTotal)) / 100 : null
  const deltaPct = data && toCents(data.prevTotal) > 0 ? ((toCents(data.total) - toCents(data.prevTotal)) / toCents(data.prevTotal)) * 100 : null

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('expenses.all') },
    { value: 'pending', label: t('expenses.statusPending') },
    { value: 'approved', label: t('expenses.statusApproved') },
    { value: 'rejected', label: t('expenses.statusRejected') },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading title={t('expenses.analyticsTitle')} subtitle={t('expenses.analyticsSubtitle')} icon={<PieChart />} variant="success" />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeaderToLoad')}</p>
      ) : !from ? (
        <p className="text-sm text-muted-foreground">{t('filters.selectDates')}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="an-status" className="text-xs text-muted-foreground">
            {t('expenses.status')}
          </Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger id="an-status" className="h-8 w-full cursor-pointer text-xs sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="cursor-pointer">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {tab === 'dealer' ? <RemovedDealersSwitch id="include-removed-dealers-expenses" state={removedDealers} disabled={!ready} /> : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KPICard inline title={t('expenses.totalExpenses')} value={data ? fmtAmount(data.total) : '—'} icon={<Receipt />} loading={query.isLoading} />
        <KPICard
          inline
          title={t('expenses.vsPrevious')}
          value={delta === null ? '—' : `${delta > 0 ? '+' : ''}${fmtAmount(delta.toFixed(2))}`}
          subtitle={
            data
              ? `${t('expenses.previousPeriod')}: ${fmtAmount(data.prevTotal)}${deltaPct !== null ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}`
              : undefined
          }
          icon={<TrendingUp />}
          variant={delta !== null && delta > 0 ? 'warning' : 'success'}
          loading={query.isLoading}
        />
      </div>

      {query.error ? (
        <p className="text-sm text-destructive" role="alert">
          {query.error.message}
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as AnalyticsGroupBy)} className="min-w-0 gap-4">
        <TabsList className="grid w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="category" className="cursor-pointer">{t('expenses.tabCategory')}</TabsTrigger>
          <TabsTrigger value="company" className="cursor-pointer">{t('expenses.tabCompany')}</TabsTrigger>
          <TabsTrigger value="dealer" className="cursor-pointer">{t('expenses.tabBranch')}</TabsTrigger>
        </TabsList>
        {(['category', 'company', 'dealer'] as const).map((g) => (
          <TabsContent key={g} value={g} className="min-w-0">
            {tab === g ? (
              <AnalyticsTable
                params={params}
                data={data}
                loading={query.isLoading}
                removedIds={g === 'dealer' ? removedDealers.removedIds : undefined}
              />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
