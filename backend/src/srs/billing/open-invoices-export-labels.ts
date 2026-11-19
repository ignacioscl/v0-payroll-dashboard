import type { PunchExportLocale } from '../punch/punch-export-format'
import type { OpenInvoiceDepartmentLabels } from './open-invoice-aging'

/**
 * Texts of Reports › Open Invoices on the backend side (Excel, department column, reasons of the
 * comparison). Approved word by word by Ignacio: the cartel lines 1–7 on 10/27/2026, line 6 replaced,
 * line 8, the comparison cartel, the labels and the 8 reasons on 10/28/2026 (P5 of
 * plans/plan-reporte-javier/PLAN.md §2, §3.6, §4.3, §10). The cartel lines are the same text as
 * `reportRules.openInvoices.*` / `reportRules.openInvoicesCompare.*` of the frontend: a spec compares them.
 */
export type OpenInvoicesExportLabels = OpenInvoiceDepartmentLabels & {
  reportInfo: string
  field: string
  value: string
  report: string
  reportName: string
  compareReportName: string
  generated: string
  generatedBy: string
  screen: string
  screenValue: string
  compareScreenValue: string
  asOf: string
  snapshot: string
  comparedAt: string
  snapshotBy: string
  dealers: string
  includeRemovedDealers: string
  reportRules: string
  all: string
  yes: string
  removedSuffix: string
  /** «What this report counts» + its 8 lines. */
  rulesTitle: string
  rules: readonly string[]
  /** «What this comparison shows» + its 4 lines. */
  compareRulesTitle: string
  compareRules: readonly string[]
  summarySheet: string
  invoicesSheet: string
  changesSheet: string
  colDealer: string
  colInvoice: string
  colDateFrom: string
  colDateTo: string
  colDepartment: string
  colServices: string
  colDaysOld: string
  colCurrent: string
  col15: string
  col30: string
  col60: string
  col90: string
  colTotal: string
  totalRow: string
  colInSnapshot: string
  colToday: string
  colDifference: string
  colWhy: string
  reasons: OpenInvoiceReasonTexts
}

/** The 8 reasons of §3.6 (P5), with their placeholders filled by the comparison. */
export type OpenInvoiceReasonTexts = {
  deleted: string
  paid: (check: string, entered: string) => string
  paymentDeleted: (check: string) => string
  created: (date: string) => string
  termChanged: (from: number, to: number) => string
  daysPassed: (n: number) => string
  departmentChanged: string
  unknown: string
}

const EN_RULES = [
  'Work Order invoices created on or before the «As of» Sunday, and TTK and Generic invoices whose DATE TO is on or before that Sunday. Deleted invoices are not included.',
  'Amounts are what is still owed when you run the report: every payment entered in SRS up to that moment is already taken off.',
  'Days are counted up to the day you run the report: Work Order invoices from the day the invoice was created; TTK and Generic invoices from DATE TO.',
  'Columns: Current 0–14 days, 15+ 15–29, 30+ 30–59, 60+ 60–89, 90+ 90 or more. Each invoice is in one column only, and Total is the sum of the five.',
  "Current is the dealer's payment term («Payment Due On» in the dealer; Net 15 if it has none). From that day the invoice goes to the column of its age.",
  'Department is the department of each service, so an invoice with services of two departments is split between them. TTK and Generic invoices show under «Timesheets», one row per position: the position the employee had the day they punched, with its name in SRS. Generic lines with no punch show as «Timesheets · Generic».',
  'Amounts include discount and tax: a partially paid invoice counts only its unpaid part.',
  'Every Excel export saves a snapshot of what it shows. «Snapshots» compares it with today, invoice by invoice.',
] as const

const ES_RULES = [
  'Las invoices de Work Orders creadas hasta el domingo «As of», y las TTK y Generic con DATE TO hasta ese domingo. Las invoices borradas no entran.',
  'Los importes son lo que falta cobrar en el momento en que se corre el reporte: todo pago cargado en SRS hasta ese momento ya está descontado.',
  'Los días se cuentan hasta el día en que se corre el reporte: las invoices de Work Orders desde el día en que se creó la invoice; las TTK y Generic desde DATE TO.',
  'Columnas: Current 0–14 días, 15+ 15–29, 30+ 30–59, 60+ 60–89, 90+ 90 o más. Cada invoice está en una sola columna, y Total es la suma de las cinco.',
  'Current es el plazo de pago del dealer («Payment Due On» en el dealer; Net 15 si no tiene). Desde ese día la invoice pasa a la columna de su antigüedad.',
  'El departamento es el de cada servicio, así que una invoice con servicios de dos departamentos se reparte entre los dos. Las invoices TTK y Generic van bajo «Timesheets», una fila por puesto: el puesto que tenía el empleado el día que ponchó, con su nombre en SRS. Las líneas de Generic sin ponchada van como «Timesheets · Generic».',
  'Los importes llevan descuento y tax: una invoice pagada en parte cuenta solo lo que falta.',
  'Cada vez que se baja el Excel se guarda una foto de lo que muestra. «Snapshots» la compara con hoy, invoice por invoice.',
] as const

const EN_COMPARE_RULES = [
  'The snapshot is what the Excel showed when it was exported. «Today» is the same report, with the same As of and dealers, run now.',
  'Only invoices that changed are listed: amount, column or department.',
  '«Why» shows what SRS records: payments entered or deleted, invoices deleted or created after the snapshot, Payment Due On changes and days passed.',
  "If an invoice's lines or payment lines were edited, SRS doesn't keep the detail, and «Why» says so.",
] as const

const ES_COMPARE_RULES = [
  'La foto es lo que mostró el Excel cuando se bajó. «Hoy» es el mismo reporte, con el mismo As of y los mismos dealers, corrido ahora.',
  'Solo aparecen las invoices que cambiaron: importe, columna o departamento.',
  '«Motivo» muestra lo que SRS registra: pagos cargados o borrados, invoices borradas o creadas después de la foto, cambios del Payment Due On y los días que pasaron.',
  'Si se editaron las líneas de una invoice o de un pago, SRS no guarda el detalle, y «Motivo» lo dice.',
] as const

const EN: OpenInvoicesExportLabels = {
  reportInfo: 'Report Info',
  field: 'Field',
  value: 'Value',
  report: 'Report',
  reportName: 'Open Invoices',
  compareReportName: 'Open Invoices — Compare with today',
  generated: 'Generated',
  generatedBy: 'Generated by',
  screen: 'Screen',
  screenValue: 'Reports › Open Invoices',
  compareScreenValue: 'Reports › Open Invoices › Snapshots',
  asOf: 'As of',
  snapshot: 'Snapshot',
  comparedAt: 'Today',
  snapshotBy: 'By',
  dealers: 'Dealers',
  includeRemovedDealers: 'Include removed dealers',
  reportRules: 'Report rules',
  all: 'All',
  yes: 'Yes',
  removedSuffix: '(removed)',
  rulesTitle: 'What this report counts',
  rules: EN_RULES,
  compareRulesTitle: 'What this comparison shows',
  compareRules: EN_COMPARE_RULES,
  summarySheet: 'Summary',
  invoicesSheet: 'Invoices',
  changesSheet: 'Changes',
  colDealer: 'DEALER',
  colInvoice: 'INVOICE#',
  colDateFrom: 'DATE FROM',
  colDateTo: 'DATE TO',
  colDepartment: 'DEPARTMENT',
  colServices: 'SERVICES',
  colDaysOld: 'DAYS OLD',
  colCurrent: 'CURRENT',
  col15: '15+',
  col30: '30+',
  col60: '60+',
  col90: '90+',
  colTotal: 'TOTAL',
  totalRow: 'TOTAL',
  colInSnapshot: 'IN SNAPSHOT',
  colToday: 'TODAY',
  colDifference: 'DIFFERENCE',
  colWhy: 'WHY',
  ttkDepartment: 'Timesheets',
  noDepartment: 'No department',
  genericPosition: 'Generic',
  noPosition: 'No position',
  reasons: {
    deleted: 'Invoice deleted',
    paid: (check, entered) => `Paid: check ${check}, entered ${entered}`,
    paymentDeleted: (check) => `Payment deleted: check ${check}`,
    created: (date) => `Invoice created after the snapshot (${date})`,
    termChanged: (from, to) => `Payment Due On changed from ${from} to ${to} days`,
    daysPassed: (n) => `${n} more days since the snapshot`,
    departmentChanged: 'Department changed',
    unknown: "The invoice or its payments changed; SRS doesn't keep the detail",
  },
}

const ES: OpenInvoicesExportLabels = {
  reportInfo: 'Report Info',
  field: 'Campo',
  value: 'Valor',
  report: 'Reporte',
  reportName: 'Invoices abiertas',
  compareReportName: 'Invoices abiertas — Comparar con hoy',
  generated: 'Generado',
  generatedBy: 'Generado por',
  screen: 'Pantalla',
  screenValue: 'Reports › Invoices abiertas',
  compareScreenValue: 'Reports › Invoices abiertas › Fotos',
  asOf: 'Al',
  snapshot: 'Foto',
  comparedAt: 'Hoy',
  snapshotBy: 'Por',
  dealers: 'Dealers',
  includeRemovedDealers: 'Incluir dealers eliminados',
  reportRules: 'Reglas del reporte',
  all: 'All',
  yes: 'Sí',
  removedSuffix: '(eliminado)',
  rulesTitle: 'Qué cuenta este reporte',
  rules: ES_RULES,
  compareRulesTitle: 'Qué muestra esta comparación',
  compareRules: ES_COMPARE_RULES,
  summarySheet: 'Summary',
  invoicesSheet: 'Invoices',
  changesSheet: 'Changes',
  colDealer: 'DEALER',
  colInvoice: 'INVOICE#',
  colDateFrom: 'DATE FROM',
  colDateTo: 'DATE TO',
  colDepartment: 'DEPARTAMENTO',
  colServices: 'SERVICES',
  colDaysOld: 'DAYS OLD',
  colCurrent: 'CURRENT',
  col15: '15+',
  col30: '30+',
  col60: '60+',
  col90: '90+',
  colTotal: 'TOTAL',
  totalRow: 'TOTAL',
  colInSnapshot: 'EN LA FOTO',
  colToday: 'HOY',
  colDifference: 'DIFERENCIA',
  colWhy: 'MOTIVO',
  // The name the customer chose: not translated (like the «Invoice» Excel).
  ttkDepartment: 'Timesheets',
  noDepartment: 'Sin departamento',
  genericPosition: 'Generic',
  noPosition: 'Sin puesto',
  reasons: {
    deleted: 'Invoice borrada',
    paid: (check, entered) => `Pagada: cheque ${check}, cargado el ${entered}`,
    paymentDeleted: (check) => `Pago borrado: cheque ${check}`,
    created: (date) => `Invoice creada después de la foto (${date})`,
    termChanged: (from, to) => `El Payment Due On pasó de ${from} a ${to} días`,
    daysPassed: (n) => `${n} días más desde la foto`,
    departmentChanged: 'Cambió el departamento',
    unknown: 'Cambió la invoice o sus pagos; SRS no guarda el detalle',
  },
}

export function openInvoicesExportLabels(locale: PunchExportLocale): OpenInvoicesExportLabels {
  return locale === 'es' ? ES : EN
}
