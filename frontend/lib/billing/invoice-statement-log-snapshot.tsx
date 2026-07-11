'use client'

import { Badge } from '@/components/ui/badge'

export type InvoiceStatementLogSnapshotItem = {
  type?: string
  description?: string
  unitAmount?: number | string
  qty?: number | string
  lineTotal?: number | string
  employeeName?: string
  department?: string
  role?: string
  onlyTimecard?: boolean
  unitRate?: number | string
  hours?: number | string
}

export type InvoiceStatementLogSnapshot = {
  fullNro?: string
  dealerName?: string
  dateFrom?: string
  dateTo?: string
  invoiceNote?: string | null
  headerNote?: string | null
  tax?: string | number | null
  subtotal?: number | null
  discountAmount?: number | null
  discountDetail?: string | null
  taxPercent?: number | null
  taxAmount?: number | null
  total?: number | null
  items?: InvoiceStatementLogSnapshotItem[]
}

function displayText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/** Snapshot dates from PHP are YYYY-MM-DD; display MM/DD/YYYY like legacy billing. */
function formatSnapshotDateMdY(value?: string | null): string {
  if (!value) return ''
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    return `${match[2]}/${match[3]}/${match[1]}`
  }
  return String(value)
}

function formatMoneySnapshot(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const amount =
    typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''))
  if (Number.isNaN(amount)) return String(value)
  return amount.toFixed(2)
}

export function parseInvoiceStatementLogSnapshot(
  descJson?: string | Record<string, unknown>,
): InvoiceStatementLogSnapshot | null {
  if (!descJson) return null
  try {
    const parsed =
      typeof descJson === 'string'
        ? (JSON.parse(descJson) as InvoiceStatementLogSnapshot)
        : (descJson as InvoiceStatementLogSnapshot)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Mirrors legacy `buildSnapshotHtml` in app.binvoice_main.js */
export function InvoiceStatementLogSnapshotView({
  descJson,
}: {
  descJson?: string | Record<string, unknown>
}) {
  const snapshot = parseInvoiceStatementLogSnapshot(descJson)
  if (!snapshot) {
    if (!descJson) return null
    return (
      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 text-[10px] leading-snug text-muted-foreground">
        {typeof descJson === 'string' ? descJson : JSON.stringify(descJson, null, 2)}
      </pre>
    )
  }

  const hasNewTotals = snapshot.total !== undefined && snapshot.total !== null
  const items = snapshot.items ?? []

  return (
    <div className="mt-2 rounded-md border border-border/70 bg-muted/30 p-2.5 text-left text-xs text-foreground">
      <div>
        <strong>Dealer:</strong> {displayText(snapshot.dealerName)}
      </div>
      <div>
        <strong>Date from / to:</strong>{' '}
        {formatSnapshotDateMdY(snapshot.dateFrom)} → {formatSnapshotDateMdY(snapshot.dateTo)}
      </div>
      {!hasNewTotals &&
      snapshot.tax !== null &&
      snapshot.tax !== undefined &&
      snapshot.tax !== '' ? (
        <div>
          <strong>Tax:</strong> {displayText(snapshot.tax)}
        </div>
      ) : null}
      <div>
        <strong>Invoice note:</strong> {displayText(snapshot.invoiceNote)}
      </div>
      <div>
        <strong>Header note:</strong> {displayText(snapshot.headerNote)}
      </div>

      <div className="mt-2 overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-left text-[11px]">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Description / Employee</th>
              <th className="px-2 py-1.5 font-medium">Unit</th>
              <th className="px-2 py-1.5 font-medium">Qty/Hrs</th>
              <th className="px-2 py-1.5 font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                  No line items
                </td>
              </tr>
            ) : (
              items.map((item, index) => {
                if (item.type === 'ttk') {
                  const roleParts = [item.department, item.role].filter(Boolean).join(' / ')
                  let label = displayText(item.employeeName)
                  if (roleParts) {
                    label += label ? ` — ${roleParts}` : roleParts
                  }
                  return (
                    <tr key={index} className="border-t border-border/60">
                      <td className="px-2 py-1.5">TTK</td>
                      <td className="px-2 py-1.5">
                        {label}
                        {item.onlyTimecard ? (
                          <Badge variant="secondary" className="ml-1.5 text-[10px] font-normal">
                            only timecard
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{displayText(item.unitRate)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{displayText(item.hours)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{displayText(item.lineTotal)}</td>
                    </tr>
                  )
                }

                return (
                  <tr key={index} className="border-t border-border/60">
                    <td className="px-2 py-1.5">Line</td>
                    <td className="px-2 py-1.5">{displayText(item.description)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{displayText(item.unitAmount)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{displayText(item.qty)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{displayText(item.lineTotal)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {hasNewTotals ? (
        <div className="mt-3 border-t border-border pt-2 text-right">
          <div>
            <strong>Subtotal:</strong> {formatMoneySnapshot(snapshot.subtotal)}
          </div>
          {snapshot.discountAmount != null &&
          parseFloat(String(snapshot.discountAmount)) > 0 ? (
            <div>
              <strong>Discount:</strong> -{formatMoneySnapshot(snapshot.discountAmount)}
              {snapshot.discountDetail ? (
                <span className="text-muted-foreground"> ({snapshot.discountDetail})</span>
              ) : null}
            </div>
          ) : null}
          {snapshot.taxPercent != null && parseFloat(String(snapshot.taxPercent)) > 0 ? (
            <div>
              <strong>Tax ({formatMoneySnapshot(snapshot.taxPercent)}%):</strong>{' '}
              {formatMoneySnapshot(snapshot.taxAmount)}
            </div>
          ) : null}
          <div className="mt-1">
            <strong>Total:</strong> {formatMoneySnapshot(snapshot.total)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
