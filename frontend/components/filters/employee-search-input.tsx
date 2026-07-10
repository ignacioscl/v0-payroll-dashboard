'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { EmployeeCombobox } from '@/components/ttk/employee-combobox'
import { useFilters } from '@/lib/filter-context'
import { useTtkEmployeeSearch, type TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

const ISSUES_PATH = '/issues'

function isIssuesRoute(pathname: string): boolean {
  return pathname === ISSUES_PATH || pathname.startsWith(`${ISSUES_PATH}/`)
}

interface EmployeeSearchInputProps {
  className?: string
  /** @deprecated use className — kept for mobile sheet compat */
  inputClassName?: string
}

/**
 * Header employee scope for Issues only. Selection is cleared when leaving
 * /issues so it does not collide with page-local employee filters (e.g. invoices).
 */
export function EmployeeSearchInput({
  className,
  inputClassName,
}: EmployeeSearchInputProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const isIssuesPage = isIssuesRoute(pathname)
  const {
    selectedDealers,
    selectedEmployee,
    setSelectedEmployee,
    setSearch,
    filtersHydrated,
  } = useFilters()

  const [employeeTerm, setEmployeeTerm] = React.useState('')

  const idDealer = React.useMemo(() => {
    if (selectedDealers.length === 0) return null
    const id = Number(selectedDealers[0])
    return Number.isFinite(id) && id > 0 ? id : null
  }, [selectedDealers])

  const employeesQuery = useTtkEmployeeSearch(
    employeeTerm,
    idDealer,
    filtersHydrated && idDealer != null,
  )

  React.useEffect(() => {
    if (!filtersHydrated || isIssuesPage) return
    setSelectedEmployee(null)
    setEmployeeTerm('')
  }, [isIssuesPage, filtersHydrated, setSelectedEmployee])

  const handleChange = React.useCallback(
    (employee: TtkEmployeeOption | null) => {
      if (!employee) {
        setSelectedEmployee(null)
        setSearch('')
        setEmployeeTerm('')
        return
      }
      setSelectedEmployee(employee)
      setSearch('')
      setEmployeeTerm('')
      if (!isIssuesRoute(pathname)) {
        router.push(ISSUES_PATH)
      }
    },
    [pathname, router, setSearch, setSelectedEmployee],
  )

  const displayValue = isIssuesPage ? selectedEmployee : null

  return (
    <EmployeeCombobox
      value={displayValue}
      onChange={handleChange}
      searchTerm={employeeTerm}
      onSearchTermChange={setEmployeeTerm}
      employees={employeesQuery.data}
      isLoading={employeesQuery.isFetching}
      disabled={!filtersHydrated}
      dealerSelected={idDealer != null}
      compact
      placeholder={t('filters.searchEmployee')}
      className={cn(className, inputClassName)}
    />
  )
}
