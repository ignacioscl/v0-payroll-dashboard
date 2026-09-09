'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
/**
 * Opción de un multi-select genérico. Vive acá, con el componente, porque el
 * componente no es de billing: lo usan Districts, los filtros de Invoices y el
 * de Payment type de TTK. `lib/invoice-advanced-filters` la re-exporta para no
 * romper los imports que ya la traían de ahí.
 */
export type LookupOption = {
  id: number
  label: string
  sublabel?: string
  thumbnailUuid?: string | null
  logoImg?: string | null
}
import { useTranslation } from '@/lib/i18n/locale-context'
import { userAvatarUrl } from '@/lib/face/face-proxy-url'

function LookupPhoto({
  option,
  name,
  size = 'md',
}: {
  option?: LookupOption
  name: string
  size?: 'sm' | 'md'
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={userAvatarUrl({
        thumbnailUuid: option?.thumbnailUuid,
        logoImg: option?.logoImg,
      })}
      alt={name}
      className={cn(
        'shrink-0 rounded-full border border-border bg-muted object-cover',
        size === 'sm' ? 'size-5' : 'size-6',
      )}
    />
  )
}

function RowCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'mr-2 flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
        checked ? 'border-primary bg-primary text-white' : 'border-muted-foreground/60 bg-background',
      )}
      aria-hidden
    >
      {checked ? <Check className="size-3 stroke-[3] text-white" /> : null}
    </span>
  )
}

interface LookupMultiSelectProps {
  options: LookupOption[]
  value: number[]
  onChange: (value: number[]) => void
  onSearchChange: (term: string) => void
  placeholder?: string
  emptyLabel?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  onOpenChange?: (open: boolean) => void
  /** Employee thumbnails (usuarios.thumbnail_uuid / logo_img). */
  withPhotos?: boolean
}

export function LookupMultiSelect({
  options,
  value,
  onChange,
  onSearchChange,
  placeholder,
  emptyLabel,
  loading = false,
  disabled = false,
  className,
  onOpenChange,
  withPhotos = false,
}: LookupMultiSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [known, setKnown] = useState<Record<number, LookupOption>>({})
  /**
   * Foco de teclado sobre "Check all".
   *
   * cmdk mantiene SIEMPRE una fila marcada con `data-selected`, aunque el foco
   * del DOM este afuera de la lista. Si ademas marcamos este boton, quedan dos
   * cosas resaltadas y no se sabe cual responde al Enter. Con este flag se
   * resalta este boton y se APAGA el de la lista: uno a la vez.
   *
   * No hace falta `focus-visible`: `preventFocusSteal` impide que el mouse le
   * de foco, asi que esto solo se prende con teclado.
   */
  const [checkAllFocused, setCheckAllFocused] = useState(false)

  useEffect(() => {
    if (options.length === 0) return
    setKnown((prev) => {
      let changed = false
      const next = { ...prev }
      for (const o of options) {
        if (next[o.id] !== o) {
          next[o.id] = o
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [options])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => onSearchChange(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search, open, onSearchChange])

  const label = useMemo(() => {
    if (value.length === 0) return placeholder ?? t('common.searchPlaceholder')
    if (value.length === 1) {
      const hit = options.find((o) => o.id === value[0]) ?? known[value[0]]
      return hit?.label ?? t('invoices.filterOneSelected')
    }
    return t('invoices.filterManySelected', { count: value.length })
  }, [known, options, placeholder, t, value])

  const visibleIds = useMemo(() => options.map((o) => o.id), [options])
  const listOptions = useMemo(() => {
    const visible = new Set(visibleIds)
    const extras = draft
      .filter((id) => !visible.has(id))
      .map((id) => known[id])
      .filter((o): o is LookupOption => Boolean(o))
    return extras.length ? [...extras, ...options] : options
  }, [draft, known, options, visibleIds])
  const isFiltering = search.trim().length > 0
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => draft.includes(id))
  const checkAllLabel = isFiltering ? t('common.checkAllFiltered') : t('common.checkAll')

  const handleOpenChange = (next: boolean) => {
    if (disabled) return
    onOpenChange?.(next)
    if (next) {
      setDraft([...value])
      setSearch('')
      onSearchChange('')
      setOpen(true)
      return
    }
    setOpen(false)
    const same =
      draft.length === value.length && draft.every((id) => value.includes(id))
    if (!same) onChange(draft)
  }

  const toggle = (id: number) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const toggleAllVisible = () => {
    setDraft((prev) => {
      if (visibleIds.length === 0) return prev
      if (visibleIds.every((id) => prev.includes(id))) {
        const drop = new Set(visibleIds)
        return prev.filter((id) => !drop.has(id))
      }
      return [...new Set([...prev, ...visibleIds])]
    })
  }

  /**
   * Para las filas de la lista: evita que el mousedown robe el foco del buscador
   * (y cierre el popover) SIN togglear. El toggle lo hace `onSelect`, que es el
   * unico camino comun a mouse y teclado.
   */
  const preventFocusSteal = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {/*
          Va sobre el `Button` compartido a proposito: `cursor-pointer` esta
          horneada ahi (components/ui/button.tsx) y asi la heredan los cinco
          usos de este componente, que es lo que pide
          frontend/.cursor/rules/cursor-pointer-clickables.mdc en vez de
          parchar la clase en cada llamador.
        */}
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-8 w-full justify-between gap-2 border-border bg-background/50 px-3 text-xs font-normal text-foreground',
            'hover:bg-muted/30 hover:text-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-foreground">
            {withPhotos && value.length === 1 ? (
              <LookupPhoto
                option={options.find((o) => o.id === value[0]) ?? known[value[0]]}
                name={label}
                size="sm"
              />
            ) : null}
            <span className="min-w-0 truncate">{loading && open ? t('common.loading') : label}</span>
          </span>
          {loading && open ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('common.searchPlaceholder')}
            value={search}
            onValueChange={setSearch}
            className="text-xs"
          />
          {/* Sticky outside cmdk filter so it never disappears while searching. */}
          <button
            type="button"
            disabled={visibleIds.length === 0}
            onMouseDown={preventFocusSteal}
            onClick={toggleAllVisible}
            // Enter/Space sobre este boton los maneja el navegador (dispara el
            // click de arriba). Lo que hay que cortar es la BURBUJA hacia el root
            // de cmdk, que ante un Enter hace preventDefault() y despacha
            // `cmdk-item-select` sobre la fila resaltada: sin esto, tener el foco
            // aca y apretar Enter tildaba una FILA en vez de "check all".
            // No lleva preventDefault: el click nativo tiene que seguir saliendo.
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
            }}
            onFocus={() => setCheckAllFocused(true)}
            onBlur={() => setCheckAllFocused(false)}
            className={cn(
              'flex w-full cursor-pointer items-center px-2 py-1.5 text-xs outline-none',
              'hover:bg-accent hover:text-accent-foreground',
              // Sin esto el foco de teclado es INVISIBLE: `outline-none` mata el
              // anillo del navegador y no habia nada en su lugar. Y este boton
              // vive FUERA del CommandList —a proposito, para que no desaparezca
              // al filtrar—, asi que las flechas de cmdk no lo recorren: Tab es
              // el UNICO camino de teclado para llegar.
              //
              // MISMO indicador que la fila activa de cmdk (`bg-accent`), porque
              // representan lo mismo: "el Enter va aca". Lo que evita la
              // confusion no es usar otro estilo, es que no haya dos prendidos
              // a la vez — de eso se encarga `checkAllFocused` en el CommandList.
              checkAllFocused && 'bg-accent text-accent-foreground',
              'disabled:pointer-events-none disabled:opacity-50',
              'border-b border-border',
            )}
          >
            <RowCheckbox checked={allVisibleSelected} />
            <span className="font-medium">{checkAllLabel}</span>
          </button>
          <CommandList
            className={cn(
              'max-h-[240px]',
              // Uno a la vez: mientras el foco esta en "Check all", la fila que
              // cmdk mantiene marcada se apaga. `!` porque el estilo original
              // vive en el propio CommandItem (components/ui/command.tsx).
              checkAllFocused && '[&_[data-selected=true]]:!bg-transparent',
              checkAllFocused && '[&_[data-selected=true]]:!text-foreground',
            )}
          >
            <CommandEmpty>{emptyLabel ?? t('common.noRecords')}</CommandEmpty>
            <CommandGroup>
              {listOptions.map((opt) => {
                const checked = draft.includes(opt.id)
                return (
                  <CommandItem
                    key={opt.id}
                    value={String(opt.id)}
                    // El toggle vive SOLO aca: cmdk dispara `onSelect` tanto con
                    // click como con Enter, asi que la fila se tildea con teclado
                    // sin duplicar el toggle del mouse. Antes estaba colgado de
                    // `onMouseDown` y `onSelect` vacio: Enter no hacia nada.
                    onSelect={() => toggle(opt.id)}
                    onMouseDown={preventFocusSteal}
                    className="cursor-pointer items-center gap-2 text-xs data-[selected=true]:text-foreground"
                  >
                    <RowCheckbox checked={checked} />
                    {withPhotos ? <LookupPhoto option={opt} name={opt.label} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{opt.label}</span>
                      {opt.sublabel ? (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {opt.sublabel}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
