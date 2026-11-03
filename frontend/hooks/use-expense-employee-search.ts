'use client'

import { useQuery } from '@tanstack/react-query'

import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { fetchExpenseEmployees } from '@/lib/srs-expenses-api'

/**
 * Empleados para Expenses, contra `GET /api/srs-kpis/expenses/employees?term&idDealer` (permisos de
 * Expenses, no la acción 67 de Time Tracking que exige `ttk-employees.php`). Con `idDealer` (csv):
 * asignados a esos dealers (Add/Edit); sin dealer: toda la empresa (filtros Assigned to / Created by).
 * Devuelve `TtkEmployeeOption` para reusar el `EmployeeCombobox` tal cual.
 */
export function useExpenseEmployeeSearch(term: string, idDealer: string | null, enabled: boolean) {
  const trimmed = term.trim()
  return useQuery<TtkEmployeeOption[]>({
    queryKey: ['expense-employees', idDealer ?? '', trimmed],
    queryFn: async () => {
      const res = await fetchExpenseEmployees(trimmed, idDealer)
      return (res.results ?? []).map((e) => ({ id: e.id, nombre: e.name }))
    },
    enabled: enabled && trimmed.length >= 2,
    staleTime: 30_000,
  })
}
