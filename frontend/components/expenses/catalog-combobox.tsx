'use client'

import * as React from 'react'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { useExpenseCatalogSearch } from '@/hooks/use-expenses-catalog'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { CatalogKind } from '@/lib/srs-expenses-api'

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
}: CatalogComboboxProps) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState('')
  const query = useExpenseCatalogSearch(kind, term, !disabled)
  const items = React.useMemo<CatalogChoice[]>(
    () => (query.data ?? []).map((c) => ({ id: c.id, name: c.name, active: c.active, lastCategory: c.lastCategory ?? null })),
    [query.data],
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
          c.active === false ? `${c.name} ${t('expenses.inactiveSuffix')}` : c.name
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
