'use client'

import * as React from 'react'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { useExpenseCatalogSearch } from '@/hooks/use-expenses-catalog'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import type { CatalogItem, CatalogKind } from '@/lib/srs-expenses-api'

import type { CatalogChoiceValue } from '@/lib/expenses/expense-form-schema'

/** Compañía o categoría elegida en un form: existente (`id`) o nueva («Create "{name}"», sin id). */
export type CatalogChoice = CatalogChoiceValue

interface CatalogComboboxProps {
  kind: CatalogKind
  value: CatalogChoice | null
  onChange: (value: CatalogChoice | null) => void
  disabled?: boolean
  /** Sin alta al vuelo (filtros de la lista). */
  allowCreate?: boolean
  compact?: boolean
  placeholder?: string
  className?: string
  /** `data-field` for the first-invalid-field focus. */
  dataField?: string
  /** Deja solo las opciones que cumplen (Merge de Settings: sin la propia y, en categorías, misma clase). */
  filterItem?: (item: CatalogItem) => boolean
  /**
   * Merge de Settings: cada opción dice cuántos gastos tiene, como la columna Expenses, para distinguir dos con el
   * mismo nombre («las dos se llaman igual!!», Ignacio, 11/11/2026).
   */
  showExpensesCount?: boolean
}

/** «Office Depot (28 expense(s))» / «Office Depot (11 expense(s), inactive)»: el nombre con lo que lo distingue. */
export function catalogNameWithCount(
  t: TranslateFn,
  name: string,
  n: number,
  active: boolean,
): string {
  return t(active ? 'expensesCatalog.nameWithCount' : 'expensesCatalog.nameWithCountInactive', { name, n })
}

/**
 * Wrapper fino del `SearchableCombobox` para compañías y categorías (GENERIC_DATA 34/35) con
 * «Create "{name}"» (rule searchable-combobox). Busca en el servidor por término (activas).
 */
export function CatalogCombobox({
  kind,
  value,
  onChange,
  disabled,
  allowCreate = true,
  compact,
  placeholder,
  className,
  dataField,
  filterItem,
  showExpensesCount,
}: CatalogComboboxProps) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState('')
  const query = useExpenseCatalogSearch(kind, term, !disabled)
  const items = React.useMemo<CatalogChoice[]>(
    () =>
      (query.data ?? [])
        .filter((c) => (filterItem ? filterItem(c) : true))
        .map((c) => ({
          id: c.id,
          name: c.name,
          active: c.active,
          lastCategory: c.lastCategory ?? null,
          expensesCount: c.expensesCount,
        })),
    [query.data, filterItem],
  )

  return (
    <div data-field={dataField} className="min-w-0">
      <SearchableCombobox<CatalogChoice>
        value={value}
        onChange={onChange}
        searchTerm={term}
        onSearchTermChange={setTerm}
        items={items}
        isLoading={query.isLoading}
        disabled={disabled}
        compact={compact}
        getItemKey={(c) => (c.id != null ? c.id : `new:${c.name}`)}
        getItemLabel={(c) =>
          showExpensesCount && c.expensesCount != null
            ? catalogNameWithCount(t, c.name, c.expensesCount, c.active !== false)
            : c.active === false
              ? `${c.name} ${t('expenses.inactiveSuffix')}`
              : c.name
        }
        placeholder={placeholder ?? (kind === 'companies' ? t('expenses.selectCompany') : t('expenses.selectCategory'))}
        createCustomItem={allowCreate ? (name) => ({ id: null, name: name.trim() }) : undefined}
        createItemLabel={(name) => t('expenses.createNamed', { name: name.trim() })}
        className={className}
        showFooterHint={false}
      />
    </div>
  )
}
