'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calculator, Hash, Plus, Receipt, Tag } from 'lucide-react'

import { KPICard } from '@/components/dashboard/kpi-card'
import { CatalogCombobox, type CatalogChoice } from '@/components/expenses/catalog-combobox'
import { ExpenseEmployeeCombobox } from '@/components/expenses/expense-employee-combobox'
import { ExpenseFormDialog, type ExpenseFormTarget } from '@/components/expenses/expense-form-dialog'
import { ExpensesDataTable } from '@/components/expenses/expenses-data-table'
import { FilterPanel, FILTER_FIELD_LABEL, type FilterPanelChip } from '@/components/shared/filter-panel'
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
import { expenseListDefaultRange, isSameYmdRange } from '@/lib/filters/expense-list-date-range'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { ExpenseListFilters, ExpenseStatus } from '@/lib/srs-expenses-api'

type StatusFilter = 'all' | ExpenseStatus

function ExpensesListPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, hasPermission } = useSrsMe()
  const {
    dateRange,
    setDateRange,
    dateRangeIsDefault,
    showDefaultDateRange,
    selectedDealers,
    setSelectedDealers,
    filtersHydrated,
  } = useFilters()

  const canAccess = canAccessExpenses(hasPermission, user?.isSystemAdmin, user?.hasExpenses)
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
  const [formTarget, setFormTarget] = React.useState<ExpenseFormTarget | null>(null)

  // Llegada desde Analytics (click en una fila):
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
    // Dealer: el filtro de dealers es el combo del header.
    if (idDealerParam && /^\d+$/.test(idDealerParam)) setSelectedDealers([idDealerParam])
    if (from && isRealYmd(from)) {
      const toValue = to && isRealYmd(to) ? to : from
      setDateRange({ from: ymdToDate(from), to: ymdToDate(toValue) })
    }
    router.replace('/expenses')
  }, [filtersHydrated, router, searchParams, setDateRange, setSelectedDealers])

  // Mientras el usuario no eligió fechas, los 7 días hasta hoy (las demás pantallas terminan ayer), y el
  // calendario del header los muestra. Un enlace de Analytics con fechas manda: los dos effects ven el
  // mismo `dateRangeIsDefault` del render, así que se mira la URL (plans/plan-expenses-rango-hoy, M1).
  // Al salir, si sigue sin tocar, se devuelve el rango que había, así las demás pantallas no cambian.
  const rangeBeforeList = React.useRef<{ saved: boolean; range: typeof dateRange }>({ saved: false, range: undefined })
  const isDefaultRef = React.useRef(dateRangeIsDefault)
  React.useEffect(() => {
    isDefaultRef.current = dateRangeIsDefault
  }, [dateRangeIsDefault])
  const urlHasDates = Boolean(searchParams.get('from') || searchParams.get('to'))
  React.useEffect(() => {
    if (!filtersHydrated || !dateRangeIsDefault || urlHasDates) return
    const target = expenseListDefaultRange()
    if (isSameYmdRange(dateRange, target)) return
    if (!rangeBeforeList.current.saved) rangeBeforeList.current = { saved: true, range: dateRange }
    showDefaultDateRange(target)
  }, [filtersHydrated, dateRangeIsDefault, urlHasDates, dateRange, showDefaultDateRange])
  React.useEffect(() => {
    const before = rangeBeforeList
    return () => {
      if (isDefaultRef.current && before.current.saved) showDefaultDateRange(before.current.range)
    }
  }, [showDefaultDateRange])

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

  const filterChips: FilterPanelChip[] = [
    ...(company ? [{ key: 'company', label: `${t('expenses.company')}: ${company.name}`, onRemove: () => setCompany(null) }] : []),
    ...(category ? [{ key: 'category', label: `${t('expenses.category')}: ${category.name}`, onRemove: () => setCategory(null) }] : []),
    ...(author ? [{ key: 'author', label: `${t('expenses.assignedTo')}: ${author.nombre}`, onRemove: () => setAuthor(null) }] : []),
    ...(createdBy ? [{ key: 'createdBy', label: `${t('expenses.createdBy')}: ${createdBy.nombre}`, onRemove: () => setCreatedBy(null) }] : []),
    ...(status !== 'all'
      ? [{ key: 'status', label: statusOptions.find((o) => o.value === status)?.label ?? status, onRemove: () => setStatus('all') }]
      : []),
    ...(amountMin.trim() ? [{ key: 'amountMin', label: `${t('expenses.amountFrom')}: ${amountMin.trim()}`, onRemove: () => setAmountMin('') }] : []),
    ...(amountMax.trim() ? [{ key: 'amountMax', label: `${t('expenses.amountTo')}: ${amountMax.trim()}`, onRemove: () => setAmountMax('') }] : []),
    ...(showDeleted ? [{ key: 'deleted', label: t('expenses.showDeleted'), onRemove: () => setShowDeleted(false) }] : []),
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        icon={<Receipt />}
        actions={
          canAdd ? (
            <Button size="sm" className="gap-1.5" onClick={() => setFormTarget({ kind: 'new' })}>
              <Plus className="size-4" />
              {t('expenses.addExpense')}
            </Button>
          ) : undefined
        }
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeaderToLoad')}</p>
      ) : !from ? (
        <p className="text-sm text-muted-foreground">{t('filters.selectDates')}</p>
      ) : null}

      <FilterPanel storageKey="expense-filters-open" chips={filterChips}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 space-y-1">
          <Label className={FILTER_FIELD_LABEL}>{t('expenses.company')}</Label>
          <CatalogCombobox kind="companies" value={company} onChange={setCompany} allowCreate={false} compact />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className={FILTER_FIELD_LABEL}>{t('expenses.category')}</Label>
          <CatalogCombobox kind="categories" value={category} onChange={setCategory} allowCreate={false} compact />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className={FILTER_FIELD_LABEL}>{t('expenses.assignedTo')}</Label>
          <ExpenseEmployeeCombobox value={author} onChange={setAuthor} idDealer={null} compact placeholder={t('expenses.all')} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className={FILTER_FIELD_LABEL}>{t('expenses.createdBy')}</Label>
          <ExpenseEmployeeCombobox value={createdBy} onChange={setCreatedBy} idDealer={null} compact placeholder={t('expenses.all')} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="exp-status" className={FILTER_FIELD_LABEL}>
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
          <Label htmlFor="exp-amount-min" className={FILTER_FIELD_LABEL}>
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
          <Label htmlFor="exp-amount-max" className={FILTER_FIELD_LABEL}>
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
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
          <Switch id="exp-show-deleted" checked={showDeleted} onCheckedChange={setShowDeleted} className="cursor-pointer" />
          <Label htmlFor="exp-show-deleted" className="cursor-pointer text-sm">
            {t('expenses.showDeleted')}
          </Label>
          </div>
        </div>
      </FilterPanel>

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

      <ExpensesDataTable filters={filters} canApprove={canApprove} canEdit={canEdit} />

      <ExpenseFormDialog target={formTarget} onClose={() => setFormTarget(null)} />
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
