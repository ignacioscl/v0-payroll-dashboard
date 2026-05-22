'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react'

type ExportButtonProps =
  | {
      onExportExcel: () => void | Promise<void>
      onExportPDF?: () => void | Promise<void>
      disabled?: boolean
      data?: never
      filename?: never
      title?: never
    }
  | {
      data: Record<string, unknown>[]
      filename?: string
      title?: string
      disabled?: boolean
      onExportExcel?: never
      onExportPDF?: never
    }

export function ExportButton(props: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      if (props.onExportExcel) {
        await props.onExportExcel()
      } else if (props.data) {
        const { data, filename = 'export', title } = props
        const headers = Object.keys(data[0] ?? {})
        const rows = data.map(row => headers.map(h => `"${String(row[h] ?? '')}"`).join(','))
        const csv = [
          ...(title ? [`"${title}"`] : []),
          headers.map(h => `"${h}"`).join(','),
          ...rows,
        ].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${filename}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPDF = async () => {
    if (!props.onExportPDF) return
    setIsExporting(true)
    try {
      await props.onExportPDF()
    } finally {
      setIsExporting(false)
    }
  }

  if (props.onExportPDF) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" disabled={props.disabled || isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleExport} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Export to Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={handleExport}
      disabled={props.disabled || isExporting}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 text-green-600" />
      )}
      Export Excel
    </Button>
  )
}
