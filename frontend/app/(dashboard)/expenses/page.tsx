'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, Calculator, Hash, Plus, Receipt, Tag } from 'lucide-react'

import { KPICard } from '@/components/dashboard/kpi-card'
import { CatalogCombobox, type CatalogChoice } from '@/components/expenses/catalog-combobox'
import { ExpenseEmployeeCombobox } from '@/components/expenses/expense-employee-combobox'
import { ExpensesDataTable } from '@/components/expenses/expenses-data-table'
import { AccessDenied } from '@/components/layout/access-denied'
import { PageHeading } from '@/components/layout/page-heading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useExpenseSummary } from '@/hooks/use-expenses-list'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import {
  canAccessExpenses,
  canAddExpenses,
  canApproveExpenses,
  canEditExpenses,
} from '@/lib/auth/expenses-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { fmtAmount, toYmd, ymdToDate } from '@/lib/expenses/expense-format'
import { isRealYmd, isValidAmount } from '@/lib/expenses/expense-rules'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { ExpenseListFilters, ExpenseStatus } from '@/lib/srs-expenses-api'

type StatusFilter = 'all' | ExpenseStatus

function ExpensesListPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, hasPermission } = useSrsMe()
  const { dateRange, setDateRange, selectedDealers, setSelectedDealers, filtersHydrated } = useFilters()

  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin)
  const canAdd = canAddExpenses(hasPermission, user?.isSystemAdmin)
  const canApprove = canApproveExpenses(hasPermission, user?.isSystemAdmin)
  const canEdit = canEditExpenses(hasPermission, user?.isSystemAdmin)

  const [company, setCompany] = React.useState<CatalogChoice | null>(null)
  const [category, setCategory] = React.useState<CatalogChoice | null>(null)
  const [author, setAuthor] = React.useState<TtkEmployeeOption | null>(null)
  const [createdBy, setCreatedBy] = React.useState<TtkEmployeeOption | null>(null)
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [amountMin, setAmountMin] = React.useState('')
  const [amountMax, setAmountMax] = React.useState('')
  const [showDeleted, setShowDeleted] = React.useState(false)

  // Llegada desde Analytics (click en una fila) o desde Add Expense (fecha fuera del rango):
  // `?idCategory|idCompany|idDealer&name=…&from&to`. Se aplica una vez y se limpia la URL.
  const appliedParams = React.useRef(false)
  React.useEffect(() => {
    if (appliedParams.current || !filtersHydrated) return
    const idCategory = searchParams.get('idCategory')
    const idCompany = searchParams.get('idCompany')
    const idDealerParam = searchParams.get('idDealer')
    const name = searchParams.get('name') ?? ''
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!idCategory && !idCompany && !idDealerParam && !from && !to) return
    appliedParams.current = true
    if (idCategory) setCategory({ id: Number(idCategory), name })
    if (idCompany) setCompany({ id: Number(idCompany), name })
    // Branch: el filtro de dealers es el combo del header.
    if (idDealerParam && /^\d+$/.test(idDealerParam)) setSelectedDealers([idDealerParam])
    if (from && isRealYmd(from)) {
      const toValue = to && isRealYmd(to) ? to : from
      setDateRange({ from: ymdToDate(from), to: ymdToDate(toValue) })
    }
    router.replace('/expenses')
  }, [filtersHydrated, router, searchParams, setDateRange, setSelectedDealers])

  const from = toYmd(dateRange?.from)
  const to = toYmd(dateRange?.to ?? dateRange?.from)
  const ready = filtersHydrated && !loading && canAccess && selectedDealers.length > 0 && Boolean(from)

  const filters = React.useMemo<ExpenseListFilters | null>(() => {
    if (!ready) return null
    return {
      from,
      to,
      idDealer: selectedDealers.join(','),
      idCompany: company?.id ?? undefined,
      idCategory: category?.id ?? undefined,
      idAuthor: author?.id,
      idCreatedBy: createdBy?.id,
      status: status === 'all' ? undefined : status,
      amountMin: amountMin.trim() && isValidAmount(amountMin.trim()) ? amountMin.trim() : undefined,
      amountMax: amountMax.trim() && isValidAmount(amountMax.trim()) ? amountMax.trim() : undefined,
      deleted: showDeleted ? 1 : 0,
    }
  }, [ready, from, to, selectedDealers, company, category, author, createdBy, status, amountMin, amountMax, showDeleted])

  const summary = useExpenseSummary(filters)

  if (!loading && !canAccess) {
    return <AccessDenied message={t('expenses.noAccess')} />
  }

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('expenses.all') },
    { value: 'pending', label: t('expenses.statusPending') },
    { value: 'approved', label: t('expenses.statusApproved') },
    { value: 'rejected', label: t('expenses.statusRejected') },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        icon={<Receipt />}
        actions={
          canAdd ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/expenses/new">
                <Plus className="size-4" />
                {t('expenses.addExpense')}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeaderToLoad')}</p>
      ) : !from ? (
        <p className="text-sm text-muted-foreground">{t('filters.selectDates')}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          inline
          title={t('expenses.totalExpenses')}
          value={summary.data ? fmtAmount(summary.data.total) : '—'}
          icon={<Receipt />}
          loading={summary.isLoading}
        />
        <KPICard
          inline
          title={t('expenses.expensesCount')}
          value={summary.data ? summary.data.count.toLocaleString() : '—'}
          icon={<Hash />}
          variant="info"
          loading={summary.isLoading}
        />
        <KPICard
          inline
          title={t('expenses.average')}
          value={summary.data ? fmtAmount(summary.data.average) : '—'}
          icon={<Calculator />}
          variant="violet"
          loading={summary.isLoading}
        />
        <KPICard
          inline
          title={t('expenses.topCategory')}
          value={summary.data?.topCategory?.name ?? '—'}
          subtitle={summary.data?.topCategory ? fmtAmount(summary.data.topCategory.total) : undefined}
          icon={<Tag />}
          variant="success"
          loading={summary.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 space-y-1">
          <Label className="text-xs text-muted-foreground">{t('expenses.company')}</Label>
          <CatalogCombobox kind="companies" value={company} onChange={setCompany} allowCreate={false} compact />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs text-muted-foreground">{t('expenses.category')}</Label>
          <CatalogCombobox kind="categories" value={category} onChange={setCategory} allowCreate={false} compact />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs text-muted-foreground">{t('expenses.assignedTo')}</Label>
          <ExpenseEmployeeCombobox value={author} onChange={setAuthor} idDealer={null} compact placeholder={t('expenses.all')} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs text-muted-foreground">{t('expenses.createdBy')}</Label>
          <ExpenseEmployeeCombobox value={createdBy} onChange={setCreatedBy} idDealer={null} compact placeholder={t('expenses.all')} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="exp-status" className="text-xs text-muted-foreground">
            {t('expenses.status')}
          </Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger id="exp-status" className="h-8 w-full cursor-pointer text-xs">
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
        <div className="min-w-0 space-y-1">
          <Label htmlFor="exp-amount-min" className="text-xs text-muted-foreground">
            {t('expenses.amountFrom')}
          </Label>
          <Input
            id="exp-amount-min"
            inputMode="decimal"
            className="h-8 text-xs"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="exp-amount-max" className="text-xs text-muted-foreground">
            {t('expenses.amountTo')}
          </Label>
          <Input
            id="exp-amount-max"
            inputMode="decimal"
            className="h-8 text-xs"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex min-w-0 items-center gap-2 pt-5">
          <Switch id="exp-show-deleted" checked={showDeleted} onCheckedChange={setShowDeleted} className="cursor-pointer" />
          <Label htmlFor="exp-show-deleted" className="cursor-pointer text-sm">
            {t('expenses.showDeleted')}
          </Label>
        </div>
      </div>

      <ExpensesDataTable filters={filters} canApprove={canApprove} canEdit={canEdit} />

      <div className="text-xs text-muted-foreground">
        <Link href="/expenses/analytics" className="inline-flex items-center gap-1 hover:underline">
          <BarChart3 className="size-3.5" />
          {t('nav.expensesAnalytics')}
        </Link>
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  return (
    <React.Suspense fallback={null}>
      <ExpensesListPage />
    </React.Suspense>
  )
}
