import { z } from 'zod'

import type { CatalogChoiceValue } from '@/lib/expenses/expense-form-schema'
import { EXPENSE_LIMITS, validateAmount, validateRuleDates } from '@/lib/expenses/expense-rules'
import type { CreateRulePayload, RuleDetail, UpdateRulePayload } from '@/lib/srs-expenses-api'

/** Pareja de `RecurringRuleDto` (backend/src/features/srs-expense-repetitive/dto). */

export interface RecurringFormValues {
  description: string
  company: CatalogChoiceValue | null
  category: CatalogChoiceValue | null
  startDate: string
  endDate: string
  frequency: 'monthly' | 'weekly'
  /** '' o '0'..'6'. */
  weekDay: string
  /** Switch «Split by fixed amount». */
  splitFixed: boolean
  amount: string
}

export interface RecurringFormMessages {
  errDescription: string
  errUpTo: string
  errChooseCompany: string
  errChooseCategory: string
  errStartDate: string
  endBeforeStart: string
  errWeekDay: string
  errAmount: string
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
}

const choice = z
  .object({
    id: z.number().nullable(),
    name: z.string(),
    active: z.boolean().optional(),
    lastCategory: z.object({ id: z.number(), name: z.string(), active: z.boolean() }).nullable().optional(),
  })
  .nullable()

export function createRecurringFormSchema(m: RecurringFormMessages) {
  return z
    .object({
      description: z.string(),
      company: choice,
      category: choice,
      startDate: z.string(),
      endDate: z.string(),
      frequency: z.enum(['monthly', 'weekly']),
      weekDay: z.string(),
      splitFixed: z.boolean(),
      amount: z.string(),
    })
    .superRefine((data, refine) => {
      const issue = (path: string[], message: string) => refine.addIssue({ code: z.ZodIssueCode.custom, message, path })
      const desc = data.description.trim()
      if (!desc) issue(['description'], m.errDescription)
      else if (desc.length > EXPENSE_LIMITS.ruleDescription) {
        issue(['description'], fill(m.errUpTo, { n: EXPENSE_LIMITS.ruleDescription }))
      }
      if (!data.company || !data.company.name.trim()) issue(['company'], m.errChooseCompany)
      if (!data.category || !data.category.name.trim()) issue(['category'], m.errChooseCategory)
      try {
        validateRuleDates(data.startDate, data.endDate || null)
      } catch (err) {
        const field = (err as { field?: string }).field
        if (field === 'endDate') issue(['endDate'], m.endBeforeStart)
        else issue(['startDate'], m.errStartDate)
      }
      if (data.frequency === 'weekly' && !/^[0-6]$/.test(data.weekDay)) issue(['weekDay'], m.errWeekDay)
      if (!data.splitFixed) {
        try {
          validateAmount(data.amount)
        } catch {
          issue(['amount'], m.errAmount)
        }
      }
    })
}

export const emptyRecurringFormValues = (todayNy: string): RecurringFormValues => ({
  description: '',
  company: null,
  category: null,
  startDate: todayNy,
  endDate: '',
  frequency: 'monthly',
  weekDay: '',
  // Legacy desde el 31/10: una regla nueva arranca por monto fijo (F4.1).
  splitFixed: true,
  amount: '',
})

export function recurringFormValuesFromRule(rule: RuleDetail): RecurringFormValues {
  return {
    description: rule.description ?? '',
    company: { id: rule.company.id, name: rule.company.name },
    category: { id: rule.category.id, name: rule.category.name },
    startDate: rule.startDate ?? '',
    endDate: rule.endDate ?? '',
    frequency: rule.frequency,
    weekDay: rule.weekDay == null ? '' : String(rule.weekDay),
    splitFixed: rule.splitType === 'fixed',
    amount: rule.amount ?? '',
  }
}

function catalogFields(values: RecurringFormValues): Pick<CreateRulePayload, 'idCompany' | 'newCompanyName' | 'idCategory' | 'newCategoryName'> {
  const out: ReturnType<typeof catalogFields> = {}
  if (values.company?.id != null) out.idCompany = values.company.id
  else if (values.company) out.newCompanyName = values.company.name.trim()
  if (values.category?.id != null) out.idCategory = values.category.id
  else if (values.category) out.newCategoryName = values.category.name.trim()
  return out
}

export function recurringFormValuesToCreatePayload(values: RecurringFormValues): CreateRulePayload {
  return {
    description: values.description.trim(),
    ...catalogFields(values),
    amount: values.splitFixed ? null : values.amount.trim(),
    splitType: values.splitFixed ? 'fixed' : 'percent',
    frequency: values.frequency,
    weekDay: values.frequency === 'weekly' ? Number(values.weekDay) : null,
    startDate: values.startDate,
    endDate: values.endDate || null,
  }
}

/** Edición: `splitType` no viaja (se cambia con `PUT /split`, con confirmación). */
export function recurringFormValuesToUpdatePayload(values: RecurringFormValues, rule: RuleDetail): UpdateRulePayload {
  return {
    description: values.description.trim(),
    ...catalogFields(values),
    ...(rule.splitType === 'percent' ? { amount: values.amount.trim() } : {}),
    frequency: values.frequency,
    weekDay: values.frequency === 'weekly' ? Number(values.weekDay) : null,
    startDate: values.startDate,
    endDate: values.endDate || null,
  }
}
