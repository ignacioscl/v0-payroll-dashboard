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

interface ExportButtonProps {
  onExportExcel: () => void
  onExportPDF?: () => void
  disabled?: boolean
}

export function ExportButton({ onExportExcel, onExportPDF, disabled }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExportExcel = async () => {
    setIsExporting(true)
    try {
      await onExportExcel()
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPDF = async () => {
    if (!onExportPDF) return
    setIsExporting(true)
    try {
      await onExportPDF()
    } finally {
      setIsExporting(false)
    }
  }

  if (!onExportPDF) {
    return (
      <Button 
        variant="outline" 
        className="gap-2" 
        onClick={handleExportExcel}
        disabled={disabled || isExporting}
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Exportar Excel
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={disabled || isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Exportar a Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
