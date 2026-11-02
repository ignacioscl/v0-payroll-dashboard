import { z } from 'zod'

import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import {
  EXPENSE_LIMITS,
  ExpenseRuleError,
  isRealYmd,
  toCents,
  validateAmount,
  validateAmountSplit,
  validatePercentSplit,
  validateReceiptDate,
} from '@/lib/expenses/expense-rules'
import type {
  CreateExpensePayload,
  ExpenseDetail,
  ExpenseMode,
  RuleDetail,
  TextOnlyExpensePayload,
} from '@/lib/srs-expenses-api'

/**
 * Pareja de `CreateExpenseDto` (backend/src/features/srs-expense/dto): mismas reglas de
 * `expense-rules.ts` en el form (zod) y en el DTO (class-validator), con el error en su campo.
 */

export interface CatalogChoiceValue {
  id: number | null
  name: string
  active?: boolean
  lastCategory?: { id: number; name: string; active: boolean } | null
}

export interface BranchInputValue {
  percentage: string
  amount: string
}

export interface ExpenseFormValues {
  ticketDate: string
  company: CatalogChoiceValue | null
  category: CatalogChoiceValue | null
  description: string
  receiptNumber: string
  notes: string
  author: TtkEmployeeOption | null
  mode: ExpenseMode
  /** Single branch: id del dealer (string, como `DealerOption.id`). */
  idDealer: string
  totalAmount: string
  /** Multiple branches: ids de dealer (string). */
  branchIds: string[]
  /** Por id de dealer: su porcentaje o su monto, según el modo. */
  branches: Record<string, BranchInputValue>
  idExpRepetitive: number | null
}

export interface ExpenseFormMessages {
  errDate: string
  errAmount: string
  errPercent: string
  /** `{sum}` */
  errPercentSum: string
  errChooseBranch: string
  errChooseTwoBranches: string
  errChooseCompany: string
  errChooseCategory: string
  /** `{n}` */
  errUpTo: string
}

export interface ExpenseFormContext {
  /** Hoy en NY (`YYYY-MM-DD`), D9. */
  todayNy: string
  /** Edición de un grupo con una fila aprobada: solo cambian notes, description y receipt #. */
  textOnly?: boolean
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
}

const choice = z
  .object({
    id: z.number().nullable(),
    name: z.string(),
    active: z.boolean().optional(),
    lastCategory: z
      .object({ id: z.number(), name: z.string(), active: z.boolean() })
      .nullable()
      .optional(),
  })
  .nullable()

export function createExpenseFormSchema(ctx: ExpenseFormContext, m: ExpenseFormMessages) {
  return z
    .object({
      ticketDate: z.string(),
      company: choice,
      category: choice,
      description: z.string(),
      receiptNumber: z.string(),
      notes: z.string(),
      author: z.custom<TtkEmployeeOption | null>(() => true),
      mode: z.enum(['single', 'equal', 'percent', 'amount']),
      idDealer: z.string(),
      totalAmount: z.string(),
      branchIds: z.array(z.string()),
      branches: z.record(z.string(), z.object({ percentage: z.string(), amount: z.string() })),
      idExpRepetitive: z.number().nullable(),
    })
    .superRefine((data, refine) => {
      const issue = (path: (string | number)[], message: string) =>
        refine.addIssue({ code: z.ZodIssueCode.custom, message, path })

      // Largos (siempre, también en textOnly).
      if (data.description.trim().length > EXPENSE_LIMITS.description) {
        issue(['description'], fill(m.errUpTo, { n: EXPENSE_LIMITS.description }))
      }
      if (data.receiptNumber.trim().length > EXPENSE_LIMITS.receiptNumber) {
        issue(['receiptNumber'], fill(m.errUpTo, { n: EXPENSE_LIMITS.receiptNumber }))
      }
      if (data.notes.trim().length > EXPENSE_LIMITS.notes) {
        issue(['notes'], fill(m.errUpTo, { n: EXPENSE_LIMITS.notes }))
      }
      if (ctx.textOnly) return

      try {
        validateReceiptDate(data.ticketDate, ctx.todayNy)
      } catch {
        issue(['ticketDate'], m.errDate)
      }

      if (!data.company || !data.company.name.trim()) issue(['company'], m.errChooseCompany)
      else if (data.company.name.trim().length > EXPENSE_LIMITS.catalogName) {
        issue(['company'], fill(m.errUpTo, { n: EXPENSE_LIMITS.catalogName }))
      }
      if (!data.category || !data.category.name.trim()) issue(['category'], m.errChooseCategory)
      else if (data.category.name.trim().length > EXPENSE_LIMITS.catalogName) {
        issue(['category'], fill(m.errUpTo, { n: EXPENSE_LIMITS.catalogName }))
      }

      const needsTotal = data.mode === 'single' || data.mode === 'equal' || data.mode === 'percent'
      if (needsTotal) {
        try {
          validateAmount(data.totalAmount)
        } catch {
          issue(['totalAmount'], m.errAmount)
        }
      }

      if (data.mode === 'single') {
        if (!data.idDealer) issue(['idDealer'], m.errChooseBranch)
        return
      }

      if (data.branchIds.length < 2) {
        issue(['branchIds'], m.errChooseTwoBranches)
        return
      }

      if (data.mode === 'percent') {
        try {
          validatePercentSplit(
            data.branchIds.map((id) => ({ id: Number(id), percentage: data.branches[id]?.percentage ?? '' })),
          )
        } catch (err) {
          if (err instanceof ExpenseRuleError && err.field?.startsWith('branches.')) {
            const [, id] = err.field.split('.')
            issue(['branches', id, 'percentage'], m.errPercent)
          } else if (err instanceof ExpenseRuleError && err.message.startsWith('Percents add up to')) {
            const sum = /add up to ([\d.]+)%/.exec(err.message)?.[1] ?? '0.00'
            issue(['branchIds'], fill(m.errPercentSum, { sum }))
          } else {
            issue(['branchIds'], m.errChooseTwoBranches)
          }
        }
      } else if (data.mode === 'amount') {
        try {
          validateAmountSplit(
            data.branchIds.map((id) => ({ id: Number(id), amount: data.branches[id]?.amount ?? '' })),
          )
        } catch (err) {
          if (err instanceof ExpenseRuleError && err.field?.startsWith('branches.')) {
            const [, id] = err.field.split('.')
            issue(['branches', id, 'amount'], m.errAmount)
          } else {
            issue(['branchIds'], m.errChooseTwoBranches)
          }
        }
      }
    })
}

export const emptyExpenseFormValues = (todayNy: string): ExpenseFormValues => ({
  ticketDate: todayNy,
  company: null,
  category: null,
  description: '',
  receiptNumber: '',
  notes: '',
  author: null,
  mode: 'single',
  idDealer: '',
  totalAmount: '',
  branchIds: [],
  branches: {},
  idExpRepetitive: null,
})

/** Porcentaje de una fila de un grupo By percentage cuando el Nest no lo manda: amount / total. */
function derivePercent(amount: string, total: string): string {
  const a = toCents(amount)
  const tot = toCents(total)
  if (tot <= 0) return ''
  return (Math.round((a * 10000) / tot) / 100).toFixed(2)
}

export function expenseFormValuesFromDetail(detail: ExpenseDetail, todayNy: string): ExpenseFormValues {
  const base = emptyExpenseFormValues(todayNy)
  const common = {
    ticketDate: isRealYmd(detail.ticketDate) ? detail.ticketDate : '',
    company: { id: detail.company.id, name: detail.company.name },
    category: { id: detail.category.id, name: detail.category.name },
    description: detail.description ?? '',
    receiptNumber: detail.receiptNumber ?? '',
    notes: detail.notes ?? '',
    author: detail.author ? { id: detail.author.id, nombre: detail.author.name } : null,
    idExpRepetitive: detail.idExpRepetitive ?? null,
  }
  if (detail.kind === 'single') {
    return { ...base, ...common, mode: 'single', idDealer: String(detail.dealer.id), totalAmount: detail.amount }
  }
  const branches: Record<string, BranchInputValue> = {}
  for (const r of detail.rows) {
    branches[String(r.dealer.id)] = {
      percentage: r.percentage ?? (detail.splitType === 'percent' ? derivePercent(r.amount, detail.visibleTotal) : ''),
      amount: r.amount,
    }
  }
  return {
    ...base,
    ...common,
    mode: detail.splitType,
    idDealer: '',
    totalAmount: detail.visibleTotal,
    branchIds: detail.rows.map((r) => String(r.dealer.id)),
    branches,
  }
}

/** Precarga desde una regla recurrente (F3, «Use a recurring expense's split»). */
export function applyRuleToExpenseForm(values: ExpenseFormValues, rule: RuleDetail): ExpenseFormValues {
  const branches: Record<string, BranchInputValue> = {}
  for (const a of rule.assigns) {
    branches[String(a.dealer.id)] = { percentage: a.percentage ?? '', amount: a.fixedAmount ?? '' }
  }
  return {
    ...values,
    mode: rule.splitType === 'fixed' ? 'amount' : 'percent',
    company: { id: rule.company.id, name: rule.company.name },
    category: { id: rule.category.id, name: rule.category.name },
    description: values.description.trim() ? values.description : rule.description,
    totalAmount: rule.amount ?? values.totalAmount,
    branchIds: rule.assigns.map((a) => String(a.dealer.id)),
    branches,
    idExpRepetitive: rule.id,
  }
}

export interface ExpensePayloadOptions {
  /** Permiso 117: sin él nunca se manda `idAuthor` (el gasto queda a nombre del que carga). */
  canAssign: boolean
  /**
   * Edición: id del autor que vino en `detail`. `idAuthor` se manda solo si cambió respecto de
   * este valor. En el alta va `undefined`.
   */
  savedAuthorId?: number | null
}

/** Edición de un grupo con alguna fila aprobada: solo los tres textos. */
export function expenseFormValuesToTextOnlyPayload(values: ExpenseFormValues): TextOnlyExpensePayload {
  return {
    description: values.description.trim() || undefined,
    receiptNumber: values.receiptNumber.trim() || undefined,
    notes: values.notes.trim(),
  }
}

/** `idAuthor` del cuerpo: `undefined` cuando no se puede asignar o cuando no cambió. */
function authorForPayload(values: ExpenseFormValues, opts: ExpensePayloadOptions): number | undefined {
  if (!opts.canAssign) return undefined
  const id = values.author?.id
  if (id == null) return undefined
  if (opts.savedAuthorId !== undefined && opts.savedAuthorId === id) return undefined
  return id
}

export function expenseFormValuesToPayload(
  values: ExpenseFormValues,
  opts: ExpensePayloadOptions = { canAssign: true },
): CreateExpensePayload {
  const payload: CreateExpensePayload = {
    ticketDate: values.ticketDate,
    ...expenseFormValuesToTextOnlyPayload(values),
    idAuthor: authorForPayload(values, opts),
    mode: values.mode,
    idExpRepetitive: values.idExpRepetitive ?? undefined,
  }
  if (values.company?.id != null) payload.idCompany = values.company.id
  else if (values.company) payload.newCompanyName = values.company.name.trim()
  if (values.category?.id != null) payload.idCategory = values.category.id
  else if (values.category) payload.newCategoryName = values.category.name.trim()

  if (values.mode === 'single') {
    payload.idDealer = Number(values.idDealer)
    payload.totalAmount = values.totalAmount.trim()
    return payload
  }
  if (values.mode !== 'amount') payload.totalAmount = values.totalAmount.trim()
  payload.branches = values.branchIds.map((id) => {
    const b = values.branches[id]
    if (values.mode === 'percent') return { idDealer: Number(id), percentage: (b?.percentage ?? '').trim() }
    if (values.mode === 'amount') return { idDealer: Number(id), amount: (b?.amount ?? '').trim() }
    return { idDealer: Number(id) }
  })
  return payload
}
