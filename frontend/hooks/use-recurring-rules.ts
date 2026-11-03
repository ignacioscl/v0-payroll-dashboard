'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addRuleDealers,
  changeRuleSplit,
  createRule,
  deleteRule,
  fetchRule,
  fetchRules,
  removeRuleAssign,
  updateRule,
  updateRuleAssign,
  type AssignPayload,
  type CreateRulePayload,
  type RuleDetail,
  type RuleListResponse,
  type RuleSplit,
  type UpdateRulePayload,
} from '@/lib/srs-expenses-api'

export const RULES_LIST_KEY = ['expense-rules-list'] as const
export const ruleDetailKey = (id: number) => ['expense-rule', id] as const

export function useRecurringRulesList(params: { term?: string; page: number; pageSize?: number }, enabled = true) {
  return useQuery<RuleListResponse>({
    queryKey: [...RULES_LIST_KEY, params],
    queryFn: () => fetchRules(params),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useRecurringRule(id: number | null) {
  return useQuery<RuleDetail>({
    queryKey: ruleDetailKey(id ?? 0),
    queryFn: () => fetchRule(id as number),
    enabled: id !== null && id > 0,
  })
}

function invalidateRules(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: RULES_LIST_KEY })
}

export function useCreateRule() {
  const queryClient = useQueryClient()
  return useMutation<RuleDetail, Error, CreateRulePayload>({
    mutationFn: createRule,
    onSuccess: (rule) => {
      queryClient.setQueryData(ruleDetailKey(rule.id), rule)
      invalidateRules(queryClient)
    },
  })
}

export function useUpdateRule() {
  const queryClient = useQueryClient()
  return useMutation<RuleDetail, Error, { id: number; payload: UpdateRulePayload }>({
    mutationFn: ({ id, payload }) => updateRule(id, payload),
    onSuccess: (rule) => {
      queryClient.setQueryData(ruleDetailKey(rule.id), rule)
      invalidateRules(queryClient)
    },
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: deleteRule,
    onSuccess: () => invalidateRules(queryClient),
  })
}

/**
 * Todo lo que toca la tabla de dealers devuelve la regla entera: se escribe con `setQueryData` en la
 * query del detalle, así la tabla actualiza sus valores en su lugar sin desmontar nada (F4.2, T5.5).
 */
function useRuleWrite<TVars>(mutationFn: (vars: TVars) => Promise<RuleDetail>) {
  const queryClient = useQueryClient()
  return useMutation<RuleDetail, Error, TVars>({
    mutationFn,
    onSuccess: (rule) => {
      queryClient.setQueryData(ruleDetailKey(rule.id), rule)
      invalidateRules(queryClient)
    },
  })
}

export function useChangeRuleSplit() {
  return useRuleWrite<{ id: number; splitType: RuleSplit }>(({ id, splitType }) => changeRuleSplit(id, splitType))
}

export function useAddRuleDealers() {
  return useRuleWrite<{ id: number; idDealers: number[]; allowAnyTotal: boolean }>(({ id, idDealers, allowAnyTotal }) =>
    addRuleDealers(id, idDealers, allowAnyTotal),
  )
}

export function useUpdateRuleAssign() {
  return useRuleWrite<{ id: number; idAssign: number; payload: AssignPayload }>(({ id, idAssign, payload }) =>
    updateRuleAssign(id, idAssign, payload),
  )
}

export function useRemoveRuleAssign() {
  return useRuleWrite<{ id: number; idAssign: number; allowAnyTotal: boolean }>(({ id, idAssign, allowAnyTotal }) =>
    removeRuleAssign(id, idAssign, allowAnyTotal),
  )
}
