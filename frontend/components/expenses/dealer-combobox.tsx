'use client'

import * as React from 'react'

import type { DealerOption } from '@/components/filters/types'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { useSrsDealers } from '@/hooks/use-srs-dealers'
import { useTranslation } from '@/lib/i18n/locale-context'

interface DealerComboboxProps {
  /** id del dealer (string, como `DealerOption.id`) o ''. */
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  className?: string
  dataField?: string
}

/** Un solo dealer de la empresa (Single branch), con búsqueda local sobre `/api/dealers`. */
export function DealerCombobox({ value, onChange, disabled, className, dataField }: DealerComboboxProps) {
  const { t } = useTranslation()
  const { dealers, loading } = useSrsDealers()
  const [term, setTerm] = React.useState('')
  const items = React.useMemo(() => {
    const q = term.trim().toLowerCase()
    return q ? dealers.filter((d) => d.label.toLowerCase().includes(q)) : dealers
  }, [dealers, term])
  const selected = React.useMemo(() => dealers.find((d) => d.id === value) ?? null, [dealers, value])

  return (
    <div data-field={dataField} className="min-w-0">
      <SearchableCombobox<DealerOption>
        value={selected}
        onChange={(d) => onChange(d?.id ?? '')}
        searchTerm={term}
        onSearchTermChange={setTerm}
        items={items}
        isLoading={loading}
        disabled={disabled}
        getItemKey={(d) => d.id}
        getItemLabel={(d) => d.label}
        placeholder={t('expenses.selectBranch')}
        className={className}
        showFooterHint={false}
      />
    </div>
  )
}
