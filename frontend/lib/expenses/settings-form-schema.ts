import { z } from 'zod'

import type { CatalogChoiceValue } from '@/lib/expenses/expense-form-schema'
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

/**
 * Merge de Settings: la compañía o categoría que queda, ya existente (con id). Pareja de `MergeCatalogItemDto`
 * (`targetId`) del Nest, que responde «Choose a company.» / «Choose a category.» si falta.
 */
export function createSettingsMergeSchema(messages: { errChoose: string }) {
  return z.object({
    target: z.custom<CatalogChoiceValue | null>(
      (v) => v != null && typeof (v as CatalogChoiceValue).id === 'number',
      { message: messages.errChoose },
    ),
  })
}

export type SettingsMergeFormValues = { target: CatalogChoiceValue | null }
