'use client'

import * as React from 'react'
import { Layers } from 'lucide-react'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { useRoleTemplatesList } from '@/hooks/use-role-templates-list'
import { useTranslation } from '@/lib/i18n/locale-context'
import type { RoleTemplateRow } from '@/lib/srs-role-templates-api'
import { Badge } from '@/components/ui/badge'
import { ROLE_FILTER_WITH, ROLE_FILTER_WITHOUT } from '@/lib/roles/roles-types'

export type RoleTemplateFilterOption = Pick<RoleTemplateRow, 'id' | 'nombre' | 'tipo'>

type RoleTemplateFilterComboboxProps = {
  value: RoleTemplateFilterOption | null
  onChange: (value: RoleTemplateFilterOption | null) => void
  enabled?: boolean
  className?: string
  /** Override trigger placeholder (default: filter “any template”). */
  placeholder?: string
  /** Optional tipo filter: 1=internal, 2=external. */
  tipo?: 1 | 2
  /** Filtro de la tabla: suma arriba «With template» y «Without template». */
  withPresenceOptions?: boolean
}

/**
 * Template picker — SearchableCombobox over Nest role-templates list.
 * Used as Roles Admin “Based on” filter and in Add Role (create from template).
 */
export function RoleTemplateFilterCombobox({
  value,
  onChange,
  enabled = true,
  className,
  placeholder,
  tipo,
  withPresenceOptions = false,
}: RoleTemplateFilterComboboxProps) {
  const { t } = useTranslation()
  const [term, setTerm] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(id)
  }, [term])

  const query = useRoleTemplatesList(
    {
      page: 0,
      pageSize: 50,
      term: debounced || undefined,
      estado: '1',
      ...(tipo != null ? { type: String(tipo) as '1' | '2' } : {}),
    },
    enabled,
  )

  const fetched = query.data?.data ?? []
  const items: RoleTemplateFilterOption[] =
    withPresenceOptions && !debounced
      ? [
          { id: ROLE_FILTER_WITH, nombre: t('roles.filterWithTemplate'), tipo: 1 },
          { id: ROLE_FILTER_WITHOUT, nombre: t('roles.filterWithoutTemplate'), tipo: 1 },
          ...fetched,
        ]
      : fetched

  return (
    <SearchableCombobox<RoleTemplateFilterOption>
      value={value}
      onChange={onChange}
      searchTerm={term}
      onSearchTermChange={setTerm}
      items={items}
      isLoading={query.isFetching}
      getItemKey={(item) => item.id}
      getItemLabel={(item) => item.nombre}
      minSearchChars={0}
      serverSideSearch
      compact
      className={className}
      placeholder={placeholder ?? t('roles.basedOnFilterAll')}
      searchPlaceholder={t('roles.basedOnFilterSearch')}
      emptyTitle={t('roles.basedOnFilterEmpty')}
      loadingMessage={t('roles.basedOnFilterLoading')}
      renderItem={({ item }) =>
        item.id < 0 ? (
          <span className="min-w-0 flex-1 truncate font-medium">{item.nombre}</span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{item.nombre}</span>
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
              {item.tipo === 1 ? t('roles.typeInternal') : t('roles.typeExternal')}
            </Badge>
          </div>
        )
      }
    />
  )
}
