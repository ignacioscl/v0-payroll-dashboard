import { z } from 'zod'

import { EXPENSE_LIMITS } from '@/lib/expenses/expense-rules'

/** Pareja del DTO de GENERIC_DATA del Nest (`{ name }`, 1–128): categoría o compañía de Expenses. */
export function createSettingsItemSchema(messages: { errName: string; errUpTo: string }) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, messages.errName)
      .max(EXPENSE_LIMITS.catalogName, messages.errUpTo.replace('{n}', String(EXPENSE_LIMITS.catalogName))),
  })
}

export type SettingsItemFormValues = z.infer<ReturnType<typeof createSettingsItemSchema>>
