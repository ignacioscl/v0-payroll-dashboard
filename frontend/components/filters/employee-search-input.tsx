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
  // Match DealerMultiSelect: avoid SSR/client mismatch on `disabled`
  // (Radix trigger + boolean attrs). Apply disable only after mount.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Todos los dealers seleccionados, no solo el primero. Sin selección va vacío:
  // el backend busca en toda la compañía del usuario logueado.
  const idDealers = React.useMemo(
    () =>
      selectedDealers
        .map((dealer) => Number(dealer))
        .filter((id) => Number.isFinite(id) && id > 0)
        .join(','),
    [selectedDealers],
  )

  const employeesQuery = useTtkEmployeeSearch(employeeTerm, idDealers, filtersHydrated)

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
  const isDisabled = mounted && !filtersHydrated

  return (
    <EmployeeCombobox
      value={displayValue}
      onChange={handleChange}
      searchTerm={employeeTerm}
      onSearchTermChange={setEmployeeTerm}
      employees={employeesQuery.data}
      isLoading={employeesQuery.isFetching}
      disabled={isDisabled}
      compact
      placeholder={t('filters.searchEmployee')}
      className={cn(className, inputClassName)}
    />
  )
}
