'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createExpense,
  deleteExpense,
  deleteGroup,
  fetchExpense,
  fetchExpenseLog,
  fetchExpenseSummary,
  restoreExpense,
  restoreGroup,
  setExpenseApproval,
  setGroupApproval,
  updateExpense,
  type CreateExpensePayload,
  type ExpenseDetail,
  type ExpenseListFilters,
  type ExpenseLogRow,
  type ExpenseSummary,
  type UpdateExpensePayload,
} from '@/lib/srs-expenses-api'

export const EXPENSES_LIST_KEY = ['expenses-list'] as const
export const EXPENSES_SUMMARY_KEY = ['expenses-summary'] as const
export const EXPENSES_ANALYTICS_KEY = ['expenses-analytics'] as const
export const expenseDetailKey = (id: number) => ['expense-detail', id] as const
export const expenseLogKey = (id: number) => ['expense-log', id] as const

/** Tarjetas de la lista: mismos filtros que la grilla (F2). */
export function useExpenseSummary(filters: ExpenseListFilters | null) {
  return useQuery<ExpenseSummary>({
    queryKey: [...EXPENSES_SUMMARY_KEY, filters],
    queryFn: () => fetchExpenseSummary(filters as ExpenseListFilters),
    enabled: filters !== null,
    placeholderData: keepPreviousData,
  })
}

export function useExpenseDetail(id: number | null) {
  return useQuery<ExpenseDetail>({
    queryKey: expenseDetailKey(id ?? 0),
    queryFn: () => fetchExpense(id as number),
    enabled: id !== null && id > 0,
  })
}

export function useExpenseLog(id: number | null, enabled = true) {
  return useQuery<ExpenseLogRow[]>({
    queryKey: expenseLogKey(id ?? 0),
    queryFn: async () => (await fetchExpenseLog(id as number)).data,
    enabled: enabled && id !== null && id > 0,
  })
}

/** Toda escritura refresca lista, tarjetas, analytics, detalle y log, y el catálogo (D4: última categoría). */
export function invalidateExpenses(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: EXPENSES_LIST_KEY })
  void queryClient.invalidateQueries({ queryKey: EXPENSES_SUMMARY_KEY })
  void queryClient.invalidateQueries({ queryKey: EXPENSES_ANALYTICS_KEY })
  void queryClient.invalidateQueries({ queryKey: ['expense-detail'] })
  void queryClient.invalidateQueries({ queryKey: ['expense-log'] })
  void queryClient.invalidateQueries({ queryKey: ['expenses-catalog'] })
}

export function useCreateExpense() {
  const queryClient = useQueryClient()
  return useMutation<ExpenseDetail, Error, CreateExpensePayload>({
    mutationFn: createExpense,
    onSuccess: () => invalidateExpenses(queryClient),
  })
}

export function useUpdateExpense() {
  const queryClient = useQueryClient()
  return useMutation<ExpenseDetail, Error, { id: number; payload: UpdateExpensePayload }>({
    mutationFn: ({ id, payload }) => updateExpense(id, payload),
    onSuccess: () => invalidateExpenses(queryClient),
  })
}

export type ExpenseRowTarget = { kind: 'single'; id: number } | { kind: 'group'; groupId: number }

export type ExpenseRowAction = { action: 'approve' | 'reject' | 'delete' | 'restore'; target: ExpenseRowTarget }

/** Approve / Reject / Delete / Restore de una fila o de un grupo. */
export function useExpenseRowAction() {
  const queryClient = useQueryClient()
  return useMutation<unknown, Error, ExpenseRowAction>({
    mutationFn: async ({ action, target }) => {
      if (action === 'restore') {
        return target.kind === 'group' ? restoreGroup(target.groupId) : restoreExpense(target.id)
      }
      if (action === 'delete') {
        return target.kind === 'group' ? deleteGroup(target.groupId) : deleteExpense(target.id)
      }
      const approved = action === 'approve'
      return target.kind === 'group'
        ? setGroupApproval(target.groupId, approved)
        : setExpenseApproval(target.id, approved)
    },
    onSuccess: () => invalidateExpenses(queryClient),
  })
}
