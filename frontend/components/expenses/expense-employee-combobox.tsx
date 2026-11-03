'use client'

import * as React from 'react'

import { EmployeeCombobox } from '@/components/ttk/employee-combobox'
import { useExpenseEmployeeSearch } from '@/hooks/use-expense-employee-search'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'

interface ExpenseEmployeeComboboxProps {
  value: TtkEmployeeOption | null
  onChange: (value: TtkEmployeeOption | null) => void
  /** csv de dealers (Add/Edit) o null (filtros: toda la empresa). */
  idDealer: string | null
  /** Add/Edit: con dealers elegidos; sin ellos muestra «Pick a dealer first.». */
  requireDealer?: boolean
  disabled?: boolean
  placeholder?: string
  compact?: boolean
  className?: string
  dataField?: string
}

/** `EmployeeCombobox` (el componente visual) con el buscador de Expenses (`/expenses/employees`). */
export function ExpenseEmployeeCombobox({
  value,
  onChange,
  idDealer,
  requireDealer = false,
  disabled,
  placeholder,
  compact,
  className,
  dataField,
}: ExpenseEmployeeComboboxProps) {
  const [term, setTerm] = React.useState('')
  const dealerSelected = !requireDealer || Boolean(idDealer && idDealer.length > 0)
  const query = useExpenseEmployeeSearch(term, idDealer, !disabled && dealerSelected)

  return (
    <div data-field={dataField} className="min-w-0">
      <EmployeeCombobox
        value={value}
        onChange={onChange}
        searchTerm={term}
        onSearchTermChange={setTerm}
        employees={query.data}
        isLoading={query.isFetching}
        disabled={disabled}
        placeholder={placeholder}
        dealerSelected={dealerSelected}
        compact={compact}
        className={className}
      />
    </div>
  )
}
