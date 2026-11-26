import {
  INVOICE_TYPE_BY_SERVICES,
  INVOICE_TYPE_MULTI_SERVICES,
  INVOICE_TYPE_SELECTED_SERVICES,
  WoInvoiceType,
} from './dto/wo-to-be-billed.dto'
import type { PendingLine } from './repository/wo-to-be-billed.repository'

/**
 * El plan de invoices de una generación por tanda (plans/plan-wo-to-be-billed-v0, T3). Función suelta: la usan la
 * cuenta previa (`/preview`, módulo de billing) y el orquestador (feature `srs-invoice-statement`), así ningún módulo
 * importa al otro de vuelta. No lee la base: recibe las líneas pendientes ya leídas (dentro de la transacción, al
 * generar).
 *
 * | Invoice Type                     | Invoices                                   | id_department          | id_invoice_service |
 * |----------------------------------|--------------------------------------------|------------------------|--------------------|
 * | 2 by Services, con servicio      | Una                                        | El elegido             | El servicio        |
 * | 2 by Services, sin servicio      | Una por servicio con líneas, en el orden   | El del servicio        | Ese servicio       |
 * |                                  | de `pendingLines` (`use_qty DESC, nombre`) |                        |                    |
 * | 3 Multi-Services, sin servicio   | Una                                        | El elegido, o nulo     | Nulo               |
 * | 3 Multi-Services, con servicio   | Una                                        | El elegido             | El servicio        |
 * | 4 Selected Services              | Una                                        | Nulo                   | Nulo               |
 *
 * Sin líneas, el plan es vacío: no se crea ninguna invoice (D10).
 */

export type PlannedLine = { idInvoice: number; idServiceInvoice: number }

export type PlannedInvoice = {
  statementType: WoInvoiceType
  idDepartment: number | null
  idInvoiceService: number | null
  lines: PlannedLine[]
}

export type WoInvoicePlan = {
  invoices: PlannedInvoice[]
  workOrders: number
}

export type WoInvoicePlanInput = {
  invoiceType: WoInvoiceType
  departments: number[]
  services: number[]
}

function toLine(l: PendingLine): PlannedLine {
  return { idInvoice: l.idInvoice, idServiceInvoice: l.idServiceInvoice }
}

export function buildWoInvoicePlan(input: WoInvoicePlanInput, lines: PendingLine[]): WoInvoicePlan {
  if (!lines.length) return { invoices: [], workOrders: 0 }
  const workOrders = new Set(lines.map((l) => l.idInvoice)).size
  const oneDepartment = input.departments.length === 1 ? input.departments[0] : null
  const oneService = input.services.length === 1 ? input.services[0] : null

  if (input.invoiceType === INVOICE_TYPE_BY_SERVICES && oneService == null) {
    const byService = new Map<number, PlannedInvoice>()
    for (const line of lines) {
      let inv = byService.get(line.idServiceInvoice)
      if (!inv) {
        inv = {
          statementType: INVOICE_TYPE_BY_SERVICES,
          idDepartment: line.serviceDepartment,
          idInvoiceService: line.idServiceInvoice,
          lines: [],
        }
        byService.set(line.idServiceInvoice, inv)
      }
      inv.lines.push(toLine(line))
    }
    return { invoices: [...byService.values()], workOrders }
  }

  if (input.invoiceType === INVOICE_TYPE_SELECTED_SERVICES) {
    return {
      invoices: [
        { statementType: INVOICE_TYPE_SELECTED_SERVICES, idDepartment: null, idInvoiceService: null, lines: lines.map(toLine) },
      ],
      workOrders,
    }
  }

  // 2 con servicio, 3 con o sin servicio: una sola invoice.
  return {
    invoices: [
      {
        statementType: input.invoiceType === INVOICE_TYPE_MULTI_SERVICES ? INVOICE_TYPE_MULTI_SERVICES : INVOICE_TYPE_BY_SERVICES,
        idDepartment: oneDepartment,
        idInvoiceService: oneService,
        lines: lines.map(toLine),
      },
    ],
    workOrders,
  }
}
