'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

/* -------------------------------------------------------------------------- */
/* Pagination contract                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Standard paginated response shape expected from the backend when wiring
 * `SearchableCombobox` with a paginated endpoint. Hooks should normalize their
 * upstream payload to this shape so the combobox stays format-agnostic.
 *
 * Either provide a server-supplied `hasMore` flag, or derive it client-side
 * from `page * pageSize < total`.
 */
export interface PaginatedComboboxResponse<T> {
  /** Items for the current page. */
  results: T[]
  /** Current page number, 1-based. */
  page: number
  /** Items per page (server contract). */
  pageSize: number
  /** Total number of items across all pages, if known. */
  total?: number
  /** True when there is at least one more page to fetch. */
  hasMore: boolean
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Generic single-select combobox with search (shadcn / cmdk powered).
 *
 * Designed for both client-side and server-side filtering (set
 * `serverSideSearch` to `true` when items already come pre-filtered from an
 * external query — that disables cmdk's local fuzzy filter).
 *
 * **Pagination.** When the backend returns paginated results (see
 * `PaginatedComboboxResponse`), pass `hasMore`, `isLoadingMore` and
 * `onLoadMore`. The combobox will:
 *   • Trigger `onLoadMore` automatically when the user scrolls near the bottom
 *     (IntersectionObserver sentinel).
 *   • Show a "Load more" footer button as a manual fallback.
 *   • Show a small spinner while the next page is in flight.
 *
 * Tip: wrap this with a domain-specific component (e.g. `EmployeeCombobox`)
 * that provides custom renderers for the trigger and the row content (avatars,
 * subtitles, badges, etc.).
 */
export interface SearchableComboboxProps<T> {
  /** Currently selected item or `null` when nothing is selected. */
  value: T | null
  /** Called when the user picks an item or clears the selection. */
  onChange: (value: T | null) => void

  /** Controlled search input value. */
  searchTerm: string
  /** Called on every keystroke in the search input. */
  onSearchTermChange: (term: string) => void

  /** Items to display in the dropdown. With pagination, pass the accumulated list (all pages flattened). */
  items: T[] | undefined

  /** Returns a stable unique key for an item (used for React keys + selection comparison). */
  getItemKey: (item: T) => string | number
  /** Returns the canonical text label for an item (used by default trigger / a11y / cmdk value). */
  getItemLabel: (item: T) => string

  /**
   * Optional custom render for the trigger button when an item is selected.
   * Receives the selected item and a `clear` handler you can wire to a close
   * affordance (e.g. an `X` button inside the trigger).
   */
  renderSelectedTrigger?: (args: {
    item: T
    clear: (event: React.MouseEvent | React.KeyboardEvent) => void
    open: boolean
    disabled: boolean
  }) => React.ReactNode

  /**
   * Optional custom render for the trigger button when no item is selected.
   */
  renderEmptyTrigger?: (args: {
    placeholder: string
    open: boolean
    disabled: boolean
  }) => React.ReactNode

  /**
   * Optional custom render for each row in the dropdown. Replaces the default
   * label-only row.
   */
  renderItem?: (args: { item: T; isSelected: boolean }) => React.ReactNode

  /** Show a spinner inside the list. */
  isLoading?: boolean
  /** Fully disables the combobox. */
  disabled?: boolean
  /** When true, disables cmdk's internal filter (default: true). */
  serverSideSearch?: boolean
  /** Minimum characters required before search results are shown. Defaults to 0. */
  minSearchChars?: number

  // ---------- Pagination ----------
  /** True when the backend has more pages to fetch. */
  hasMore?: boolean
  /** True while the next page is being fetched. */
  isLoadingMore?: boolean
  /** Called when the bottom sentinel becomes visible OR the "Load more" button is clicked. */
  onLoadMore?: () => void
  /** Total items reported by the server, displayed in the results heading when known. */
  totalCount?: number

  // ---------- Copy ----------
  /** Placeholder shown in the trigger when nothing is selected. */
  placeholder?: string
  /** Placeholder shown inside the search input. */
  searchPlaceholder?: string
  /** Heading rendered above the result list. */
  resultsHeading?: React.ReactNode
  /** Empty state title (when search returns nothing). */
  emptyTitle?: string
  /** Empty state description. */
  emptyDescription?: string
  /** Title shown when below `minSearchChars`. */
  preSearchTitle?: string
  /** Description shown when below `minSearchChars`. */
  preSearchDescription?: string
  /** Loading copy. */
  loadingMessage?: string
  /** Label for the "Load more" button. */
  loadMoreLabel?: string
  /** Label for the loading more state. */
  loadingMoreLabel?: string

  /**
   * Optional prerequisite gate. When `met` is `false`, the dropdown shows a
   * blocking message instead of the search hint (useful for "pick a dealer
   * first" style flows).
   */
  prerequisite?: {
    met: boolean
    title: string
    description: string
    icon?: React.ReactNode
  }

  // ---------- Style ----------
  /** Extra classes for the trigger. */
  className?: string
  /** Dense trigger for filter bars (h-8, text-xs, overflow clipped). */
  compact?: boolean
  /** Popover content width — defaults to `w-(--radix-popover-trigger-width)`. */
  popoverWidth?: string
  /** Popover alignment. */
  popoverAlign?: 'start' | 'center' | 'end'
  /** Max height of the result list. */
  listMaxHeight?: string
  /** Show keyboard navigation footer hint. Defaults to true. */
  showFooterHint?: boolean
}

export function SearchableCombobox<T>({
  value,
  onChange,
  searchTerm,
  onSearchTermChange,
  items,
  getItemKey,
  getItemLabel,
  renderSelectedTrigger,
  renderEmptyTrigger,
  renderItem,
  isLoading = false,
  disabled = false,
  serverSideSearch = true,
  minSearchChars = 0,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  totalCount,
  placeholder,
  searchPlaceholder,
  resultsHeading,
  emptyTitle,
  emptyDescription,
  preSearchTitle,
  preSearchDescription,
  loadingMessage,
  loadMoreLabel,
  loadingMoreLabel,
  prerequisite,
  className,
  compact = false,
  popoverWidth = 'w-(--radix-popover-trigger-width)',
  popoverAlign = 'start',
  listMaxHeight = 'max-h-[280px]',
  showFooterHint = true,
}: SearchableComboboxProps<T>) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('combobox.select')
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('combobox.search')
  const resolvedEmptyTitle = emptyTitle ?? t('combobox.noResults')
  const resolvedEmptyDescription = emptyDescription ?? t('combobox.tryDifferent')
  const resolvedPreSearchTitle = preSearchTitle ?? t('combobox.startTyping')
  const resolvedLoadingMessage = loadingMessage ?? t('combobox.searching')
  const resolvedLoadMoreLabel = loadMoreLabel ?? t('combobox.loadMore')
  const resolvedLoadingMoreLabel = loadingMoreLabel ?? t('combobox.loadingMore')
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const trimmedTerm = searchTerm.trim()
  const needsMoreChars = trimmedTerm.length < minSearchChars
  const hasResults = !!items && items.length > 0
  const showEmpty =
    !isLoading && !needsMoreChars && !!items && items.length === 0
  const prereqMet = !prerequisite || prerequisite.met
  const paginationEnabled = !!onLoadMore

  // Auto-focus the search input on open so users can start typing right away.
  React.useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  // Infinite-scroll sentinel — fires `onLoadMore` when the bottom marker
  // intersects the scroll viewport.
  React.useEffect(() => {
    if (!open || !paginationEnabled || !hasMore || isLoading || isLoadingMore) return
    const sentinel = sentinelRef.current
    const root = listRef.current
    if (!sentinel || !root) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore?.()
            break
          }
        }
      },
      { root, rootMargin: '40px', threshold: 0.01 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [open, paginationEnabled, hasMore, isLoading, isLoadingMore, onLoadMore, items])

  const selectItem = (item: T) => {
    onChange(item)
    onSearchTermChange('')
    setOpen(false)
  }

  const clearSelection = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onChange(null)
    onSearchTermChange('')
  }

  const computedPreSearchDescription =
    preSearchDescription ??
    t('combobox.enterMinChars', {
      count: minSearchChars,
      plural: minSearchChars === 1 ? '' : 's',
    })

  const renderedHeading =
    resultsHeading ?? (
      <span className="flex items-center justify-between gap-2 px-1">
        <span>{t('combobox.results')}</span>
        <span className="text-[10px] font-normal text-muted-foreground/80">
          {items!.length}
          {typeof totalCount === 'number' && totalCount > items!.length
            ? t('combobox.ofTotal', { total: totalCount })
            : ''}{' '}
          {items!.length === 1 ? t('combobox.resultSingular') : t('combobox.resultPlural')}
        </span>
      </span>
    )

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled || undefined}
          className={cn(
            'group relative flex w-full items-center text-left shadow-xs transition-all',
            compact
              ? 'h-8 gap-2 overflow-hidden rounded-md border bg-background px-2.5 text-xs'
              : 'gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm',
            'border-input hover:border-primary/40 hover:bg-accent/5',
            'focus-visible:border-primary focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/30',
            open && 'border-primary ring-[3px] ring-ring/30',
            disabled && 'cursor-not-allowed opacity-60 hover:border-input hover:bg-background',
            className,
          )}
        >
          {value
            ? renderSelectedTrigger
              ? renderSelectedTrigger({ item: value, clear: clearSelection, open, disabled })
              : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {getItemLabel(value)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={t('combobox.clearSelection')}
                    onClick={clearSelection}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') clearSelection(e)
                    }}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </span>
                </>
              )
            : renderEmptyTrigger
              ? renderEmptyTrigger({ placeholder: resolvedPlaceholder, open, disabled })
              : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
                    {resolvedPlaceholder}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </>
              )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={popoverAlign}
        sideOffset={6}
        className={cn('min-w-[280px] overflow-hidden p-0 shadow-lg', popoverWidth)}
      >
        <Command shouldFilter={!serverSideSearch} className="bg-popover">
          <div className="flex items-center gap-2 border-b border-border/70 px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="flex h-10 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchTermChange('')}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('combobox.clearSearch')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <CommandList ref={listRef} className={listMaxHeight}>
            {/* Prerequisite gate takes precedence over the pre-search hint */}
            {prerequisite && !prerequisite.met && (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                {prerequisite.icon ?? (
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground" />
                )}
                <p className="text-sm font-medium text-foreground">
                  {prerequisite.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {prerequisite.description}
                </p>
              </div>
            )}

            {prereqMet && needsMoreChars && (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Search className="size-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {resolvedPreSearchTitle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {computedPreSearchDescription}
                </p>
              </div>
            )}

            {prereqMet && !needsMoreChars && isLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {resolvedLoadingMessage}
              </div>
            )}

            {prereqMet && showEmpty && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1.5 px-4 py-2 text-center">
                  <p className="text-sm font-medium text-foreground">{resolvedEmptyTitle}</p>
                  <p className="text-xs text-muted-foreground">{resolvedEmptyDescription}</p>
                </div>
              </CommandEmpty>
            )}

            {prereqMet && !needsMoreChars && !isLoading && hasResults && (
              <CommandGroup heading={renderedHeading}>
                {items!.map((item) => {
                  const key = getItemKey(item)
                  const isSelected =
                    value !== null && getItemKey(value) === key
                  return (
                    <CommandItem
                      key={key}
                      value={`${key}-${getItemLabel(item)}`}
                      onSelect={() => selectItem(item)}
                      className={cn(
                        'group/item my-0.5 cursor-pointer gap-3 rounded-md px-2 py-2 transition-colors',
                        'data-[selected=true]:bg-accent/10 data-[selected=true]:text-foreground',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      {renderItem ? (
                        renderItem({ item, isSelected })
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {getItemLabel(item)}
                        </span>
                      )}
                      {isSelected && (
                        <span
                          className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                          aria-hidden
                        >
                          <Check className="size-3 stroke-[3]" />
                        </span>
                      )}
                    </CommandItem>
                  )
                })}

                {/* Pagination affordances */}
                {paginationEnabled && hasMore && (
                  <div className="px-1 py-1">
                    {/* Sentinel for IntersectionObserver-based auto-load */}
                    <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!isLoadingMore) onLoadMore?.()
                      }}
                      disabled={isLoadingMore}
                      className="w-full justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          {resolvedLoadingMoreLabel}
                        </>
                      ) : (
                        resolvedLoadMoreLabel
                      )}
                    </Button>
                  </div>
                )}
              </CommandGroup>
            )}
          </CommandList>

          {showFooterHint && prereqMet && !needsMoreChars && hasResults && (
            <div className="border-t border-border/70 bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
              {t('combobox.navigateHint')}
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
