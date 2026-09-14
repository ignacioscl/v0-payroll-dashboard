'use client'

import * as React from 'react'
import type { Column } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  EyeOff,
  PinOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { DataTableColumnFilter } from './data-table-column-filter'
import type { ColumnFilterConfig } from './data-table-helpers'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

/**
 * Sortable + hideable column header. Reads `meta.filter` from the column def
 * and renders the column-level filter icon when present. Uses `text-inherit`
 * so it adapts to both colored (white) and subtle (foreground) headers.
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const meta = column.columnDef.meta as
    | { filter?: ColumnFilterConfig; numeric?: boolean }
    | undefined
  const filterConfig = meta?.filter
  // `meta.numeric` alinea las celdas a la derecha; el título tiene que ir igual o
  // cada número queda debajo del título de la columna de al lado. El `text-right`
  // del `<th>` no alcanza porque este bloque es flex: se invierte el orden para que
  // el título quede pegado al borde derecho y el ícono de orden pase a su izquierda.
  const numeric = meta?.numeric === true

  if (!column.getCanSort() && !column.getCanHide() && !filterConfig) {
    return <div className={cn('font-semibold', className)}>{title}</div>
  }

  const sorted = column.getIsSorted()

  return (
    <div className={cn('flex items-center gap-0.5', numeric && 'flex-row-reverse', className)}>
      {column.getCanSort() || column.getCanHide() ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                numeric ? '-mr-2 flex-row-reverse' : '-ml-2',
                'h-7 gap-1 px-2 text-xs font-semibold uppercase tracking-wide',
                'text-inherit hover:bg-white/10 hover:text-inherit data-[state=open]:bg-white/15',
                'focus-visible:ring-0 focus-visible:ring-offset-0',
              )}
            >
              <span>{title}</span>
              {/*
                El icono depende de `getCanSort()`, no de que la columna abra
                menu. Antes se pintaba a TODA columna ordenable O escondible, asi
                que una columna con `enableSorting: false` seguia mostrando la
                flecha y solo perdia las opciones del menu: ofrecia un orden que
                no existe. La accion de ocultar no se pierde — el menu sigue.
              */}
              {!column.getCanSort() ? null : sorted === 'desc' ? (
                <ArrowDown className={cn(numeric ? 'mr-0.5' : 'ml-0.5', 'size-3')} />
              ) : sorted === 'asc' ? (
                <ArrowUp className={cn(numeric ? 'mr-0.5' : 'ml-0.5', 'size-3')} />
              ) : (
                <ArrowUpDown className={cn(numeric ? 'mr-0.5' : 'ml-0.5', 'size-3 opacity-40')} />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={numeric ? 'end' : 'start'} className="min-w-[160px]">
            {column.getCanSort() && (
              <>
                <DropdownMenuItem
                  onClick={() => column.toggleSorting(false)}
                  disabled={sorted === 'asc'}
                >
                  <ArrowUp className="mr-2 size-3.5 text-muted-foreground" />
                  Sort ascending
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => column.toggleSorting(true)}
                  disabled={sorted === 'desc'}
                >
                  <ArrowDown className="mr-2 size-3.5 text-muted-foreground" />
                  Sort descending
                </DropdownMenuItem>
                {sorted && (
                  <DropdownMenuItem onClick={() => column.clearSorting()}>
                    <PinOff className="mr-2 size-3.5 text-muted-foreground" />
                    Clear sort
                  </DropdownMenuItem>
                )}
              </>
            )}
            {column.getCanSort() && column.getCanHide() && <DropdownMenuSeparator />}
            {column.getCanHide() && (
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="mr-2 size-3.5 text-muted-foreground" />
                Hide column
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      )}

      {filterConfig && <DataTableColumnFilter column={column} config={filterConfig} />}
    </div>
  )
}
