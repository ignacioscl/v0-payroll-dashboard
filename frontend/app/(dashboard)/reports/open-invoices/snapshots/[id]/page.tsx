'use client'

import { use } from 'react'
import { OpenInvoiceCompareReport } from '@/components/reports/open-invoice-compare-report'

/** Reports › Open Invoices › una foto comparada con hoy (plans/plan-reporte-javier §1.5). */
export default function OpenInvoiceSnapshotComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <OpenInvoiceCompareReport id={Number(id)} />
}
