'use client'

import * as React from 'react'
import { ChevronsUpDown, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import {
  formatEmployeeRoleLabel,
  getEmployeeAvatarTone,
  getEmployeeInitials,
} from '@/components/filters/employee-search-row'
import type { TtkEmployeeOption } from '@/hooks/use-ttk-employee-search'
import { employeePhotoUrl } from '@/lib/face/face-proxy-url'
import { useTranslation } from '@/lib/i18n/locale-context'

interface EmployeeComboboxProps {
  value: TtkEmployeeOption | null
  onChange: (value: TtkEmployeeOption | null) => void
  searchTerm: string
  onSearchTermChange: (term: string) => void
  employees: TtkEmployeeOption[] | undefined
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  minSearchChars?: number
  className?: string
  /** When false, the dropdown shows a "pick a dealer first" prerequisite gate. */
  dealerSelected?: boolean
  /** Dense trigger aligned with h-8 filter controls. */
  compact?: boolean
}

function EmployeeInitials({
  id,
  name,
  size = 'md',
}: {
  id: number
  name: string
  size?: 'xs' | 'sm' | 'md'
}) {
  const dims =
    size === 'xs'
      ? 'size-6 text-[9px]'
      : size === 'sm'
        ? 'size-7 text-[10px]'
        : 'size-8 text-xs'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-1 ring-black/5',
        getEmployeeAvatarTone(id),
        dims,
      )}
      aria-hidden
    >
      {getEmployeeInitials(name)}
    </span>
  )
}

/**
 * v0 `thumbnail_uuid` first, then legacy `logo_img`. Initials when neither is set
 * (or the image fails to load).
 */
function EmployeePhoto({
  employee,
  size = 'md',
}: {
  employee: Pick<TtkEmployeeOption, 'id' | 'nombre' | 'thumbnailUuid' | 'logoImg'>
  size?: 'xs' | 'sm' | 'md'
}) {
  const src = employeePhotoUrl(employee)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <EmployeeInitials id={employee.id} name={employee.nombre} size={size} />
  }

  const dims = size === 'xs' ? 'size-6' : size === 'sm' ? 'size-7' : 'size-8'
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={employee.nombre}
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 rounded-full border border-border bg-muted object-cover',
        dims,
      )}
    />
  )
}

/**
 * Employee picker — thin domain wrapper around `SearchableCombobox` that adds:
 *   • Photo (v0 thumbnail, else legacy logo) or initials when there is none
 *   • Subtitles in the trigger and rows
 *   • "Pick a dealer first" prerequisite gate
 */
export function EmployeeCombobox({
  value,
  onChange,
  searchTerm,
  onSearchTermChange,
  employees,
  isLoading = false,
  disabled = false,
  placeholder,
  minSearchChars = 2,
  className,
  dealerSelected = true,
  compact = false,
}: EmployeeComboboxProps) {
  const { t } = useTranslation()
  const avatarSize = compact ? ('xs' as const) : ('md' as const)

  return (
    <SearchableCombobox<TtkEmployeeOption>
      value={value}
      onChange={onChange}
      searchTerm={searchTerm}
      onSearchTermChange={onSearchTermChange}
      items={employees}
      getItemKey={(emp) => emp.id}
      getItemLabel={(emp) => emp.nombre}
      isLoading={isLoading}
      disabled={disabled}
      minSearchChars={minSearchChars}
      compact={compact}
      placeholder={placeholder ?? t('employeeSearch.select')}
      searchPlaceholder={t('employeeSearch.typeMinChars')}
      preSearchTitle={t('employeeSearch.startTyping')}
      preSearchDescription={t('employeeSearch.enterMinChars', { count: minSearchChars })}
      loadingMessage={t('employeeSearch.searching')}
      emptyTitle={t('employeeSearch.noneFound')}
      emptyDescription={t('employeeSearch.tryDifferent')}
      resultsHeading={
        <span className="flex items-center justify-between gap-2 px-1">
          <span>{t('employeeSearch.employees')}</span>
          {employees && (
            <span className="text-[10px] font-normal text-muted-foreground/80">
              {t('employeeSearch.results', { count: employees.length })}
            </span>
          )}
        </span>
      }
      prerequisite={{
        met: dealerSelected,
        title: t('employeeSearch.pickDealerFirst'),
        description: t('dealer.selectInHeaderToSearch'),
        icon: (
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="size-5" />
          </div>
        ),
      }}
      className={className}
      renderSelectedTrigger={({ item, clear }) => (
        <>
          <EmployeePhoto employee={item} size={avatarSize} />
          {compact ? (
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {item.nombre}
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{item.nombre}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {t('employeeSearch.clickToChange')}
              </span>
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label={t('employeeSearch.clearSelected')}
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') clear(e)
            }}
            className={cn(
              'flex shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              compact ? 'size-5' : 'size-6',
            )}
          >
            <X className={compact ? 'size-3' : 'size-3.5'} />
          </span>
        </>
      )}
      renderEmptyTrigger={({ placeholder: p }) => (
        <>
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
              compact ? 'size-6' : 'size-8',
            )}
          >
            <User className={compact ? 'size-3.5' : 'size-4'} />
          </span>
          <span className={cn('min-w-0 flex-1', compact ? 'truncate' : 'flex flex-col')}>
            <span
              className={cn(
                'truncate font-medium text-muted-foreground',
                compact && 'text-xs',
              )}
            >
              {p}
            </span>
            {!compact ? (
              <span className="truncate text-[11px] text-muted-foreground/80">
                {t('employeeSearch.searchByName')}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown
            className={cn('shrink-0 text-muted-foreground', compact ? 'size-3.5' : 'size-4')}
          />
        </>
      )}
      renderItem={({ item }) => (
        <>
          <EmployeePhoto employee={item} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {item.nombre}
            </span>
            {formatEmployeeRoleLabel(item) ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {formatEmployeeRoleLabel(item)}
              </span>
            ) : null}
          </span>
        </>
      )}
    />
  )
}
