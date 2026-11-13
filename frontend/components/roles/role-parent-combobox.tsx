'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Network } from 'lucide-react'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { useRolesListFetcher } from '@/hooks/use-roles-list'
import { useTranslation } from '@/lib/i18n/locale-context'
import { ROLE_FILTER_WITH, ROLE_FILTER_WITHOUT } from '@/lib/roles/roles-types'

/** `dealerText` = «ALL» o el dealer del rol: hay roles con el mismo nombre en distintos dealers. */
export type RoleParentOption = { id: number; nombre: string; dealerText?: string | null }

function parentLabel(item: RoleParentOption) {
  return item.dealerText ? `${item.nombre} · ${item.dealerText}` : item.nombre
}

type RoleParentComboboxProps = {
  id?: string
  value: RoleParentOption | null
  onChange: (value: RoleParentOption | null) => void
  /** Rol que se edita: no aparece como opción. */
  excludeRoleId?: number | null
  /** «Set parent role» en masa: los roles tildados no aparecen como opción (no pueden ser su propio padre). */
  excludeRoleIds?: number[]
  enabled?: boolean
  disabled?: boolean
  /** Texto con nada elegido (default «No parent»; el filtro usa «Any parent role»). */
  placeholder?: string
  /** Trigger chico para la barra de filtros. */
  compact?: boolean
  /** Filtro de la tabla: suma arriba «With parent role» y «Without parent role». */
  withPresenceOptions?: boolean
}

/**
 * «Parent role» del form de Roles: roles activos de la empresa sin padre (un solo nivel),
 * sin el propio rol. Misma búsqueda por servidor que «Based on template».
 */
export function RoleParentCombobox({
  id,
  value,
  onChange,
  excludeRoleId,
  excludeRoleIds,
  enabled = true,
  disabled = false,
  placeholder,
  compact = false,
  withPresenceOptions = false,
}: RoleParentComboboxProps) {
  const { t } = useTranslation()
  const fetchRoles = useRolesListFetcher()
  const [term, setTerm] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  const query = useQuery({
    queryKey: ['roles-list', 'parentable', excludeRoleId ?? 0, debounced],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: 1,
        page_size: 50,
        parentable: 1,
        sort: 'nombre',
        dir: 'asc',
      }
      if (excludeRoleId && excludeRoleId > 0) params.exclude_id = excludeRoleId
      if (debounced) params.term = debounced
      const env = await fetchRoles(params)
      return (env.data?.results ?? []).map((r) => ({ id: r.id, nombre: r.nombre, dealerText: r.dealerText }))
    },
    enabled: enabled && !disabled,
  })

  const options = React.useMemo(() => {
    const rows = query.data ?? []
    if (!excludeRoleIds?.length) return rows
    const excluded = new Set(excludeRoleIds)
    return rows.filter((r) => !excluded.has(r.id))
  }, [query.data, excludeRoleIds])

  return (
    <div id={id}>
      <SearchableCombobox<RoleParentOption>
        value={value}
        onChange={onChange}
        searchTerm={term}
        onSearchTermChange={setTerm}
        items={
          withPresenceOptions && !debounced
            ? [
                { id: ROLE_FILTER_WITH, nombre: t('roles.filterWithParent') },
                { id: ROLE_FILTER_WITHOUT, nombre: t('roles.filterWithoutParent') },
                ...options,
              ]
            : options
        }
        isLoading={query.isFetching}
        getItemKey={(item) => item.id}
        getItemLabel={parentLabel}
        minSearchChars={0}
        serverSideSearch
        disabled={disabled}
        compact={compact}
        placeholder={placeholder ?? t('roles.parentRoleNone')}
        searchPlaceholder={t('roles.parentRoleSearch')}
        emptyTitle={t('roles.parentRoleEmpty')}
        loadingMessage={t('roles.parentRoleLoading')}
        renderItem={({ item }) =>
          item.id < 0 ? (
            <span className="min-w-0 flex-1 truncate font-medium">{item.nombre}</span>
          ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Network className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {/* El dealer va debajo: al lado, un dealer largo cortaba el nombre del rol. */}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{item.nombre}</span>
              {item.dealerText ? (
                <span className="truncate text-xs text-muted-foreground">{item.dealerText}</span>
              ) : null}
            </span>
          </div>
          )
        }
      />
    </div>
  )
}
