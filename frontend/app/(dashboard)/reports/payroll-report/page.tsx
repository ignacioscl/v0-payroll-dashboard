'use client'

import { FileSpreadsheet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

// Réplica del reporte legacy ttk_payroll_report (tabla empleado por empleado,
// combo de semana/quincena). Pendiente: el cálculo por semana (REG/OT) en el backend.
export default function PayrollReportPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
        <FileSpreadsheet className="h-7 w-7 text-primary" />
        Payroll Report
      </h1>
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">En construcción</p>
          <p>
            Va a ser la réplica del reporte legacy <code>ttk_payroll_report</code>: tabla por empleado
            (sueldo, horas, overtime, total) con selector de semana/quincena.
          </p>
          <p>
            Falta el cálculo de costos por semana en el backend (split REG/OT con{' '}
            <code>TTK_EMPLOYEE_HOURS_REG/OT</code>), que es lo único pendiente de los KPIs.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
