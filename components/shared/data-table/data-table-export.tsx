'use client'

import * as React from 'react'
import * as XLSX from 'xlsx'
import type { Table } from '@tanstack/react-table'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableExportProps<TData> {
  table: Table<TData>
  /** Base filename (no extension). Will be suffixed with the current date. */
  fileName?: string
  /**
   * When true (default), export every data column regardless of column visibility
   * in the grid. When false, only currently visible columns are exported.
   */
  exportAllColumns?: boolean
  /**
   * Optional async fetcher to export *all* rows from the server (recommended
   * for server-paginated tables). Receives the current sorting/filter state
   * via the table; the caller is responsible for fetching every page.
   */
  fetchAllRows?: () => Promise<TData[]>
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function getExportColumns<TData>(table: Table<TData>, exportAllColumns: boolean) {
  const columns = exportAllColumns
    ? table.getAllLeafColumns()
    : table.getVisibleLeafColumns()
  return columns.filter((column) => {
    if (column.id === 'actions') return false
    const meta = column.columnDef.meta as { exportable?: boolean } | undefined
    if (meta?.exportable === false) return false
    return true
  })
}

/** Build a flat dictionary of cell values for a given row. */
function rowToRecord<TData>(
  table: Table<TData>,
  row: TData,
  exportAllColumns: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const column of getExportColumns(table, exportAllColumns)) {
    const meta = (column.columnDef.meta ?? {}) as {
      label?: string
      exportValue?: (row: TData) => unknown
    }
    const label =
      meta.label ??
      (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)

    if (meta.exportValue) {
      out[label] = meta.exportValue(row)
    } else if (column.accessorFn) {
      out[label] = column.accessorFn(row, 0)
    } else {
      const key = (column.columnDef as { accessorKey?: string }).accessorKey
      if (key && row && typeof row === 'object' && key in (row as object)) {
        out[label] = (row as Record<string, unknown>)[key]
      }
    }
  }
  return out
}

export function DataTableExport<TData>({
  table,
  fileName = 'export',
  exportAllColumns = true,
  fetchAllRows,
}: DataTableExportProps<TData>) {
  const [busy, setBusy] = React.useState<'csv' | 'xlsx' | null>(null)

  const getRows = async (): Promise<TData[]> => {
    if (fetchAllRows) return fetchAllRows()
    // Client-side: prefer filtered rows (sorted as currently visible).
    return table.getSortedRowModel().rows.map((r) => r.original)
  }

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setBusy(format)
    try {
      const rows = await getRows()
      const records = rows.map((row) => rowToRecord(table, row, exportAllColumns))

      const ws = XLSX.utils.json_to_sheet(records)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data')

      // Auto-fit column widths (bounded to a sane max)
      if (records.length > 0) {
        const headers = Object.keys(records[0]!)
        ws['!cols'] = headers.map((h) => ({
          wch: Math.min(
            40,
            Math.max(
              h.length + 2,
              ...records.map((r) => String(r[h] ?? '').length + 1),
            ),
          ),
        }))
      }

      const stamp = todayStamp()
      if (format === 'csv') {
        XLSX.writeFile(wb, `${fileName}-${stamp}.csv`, { bookType: 'csv' })
      } else {
        XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`)
      }
      toast.success(`Exported ${records.length} row${records.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error('Export failed')
      // eslint-disable-next-line no-console
      console.error('[DataTableExport]', e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={busy !== null}
          aria-label="Export"
        >
          {busy ? (
            <Download className="size-3 animate-pulse text-emerald-600" />
          ) : (
            <FileSpreadsheet className="size-3 text-emerald-600" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel className="text-xs">Download</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleExport('xlsx')}>
          <FileSpreadsheet className="mr-2 size-3.5 text-emerald-600" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleExport('csv')}>
          <FileText className="mr-2 size-3.5 text-blue-600" />
          CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
