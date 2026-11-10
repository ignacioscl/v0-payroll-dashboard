/**
 * What each column of the Window Tint Closing counts, as the note on its header in the Excel (D5 of
 * plans/plan-reporte-tint/PLAN.md, approved word by word on 11/04/2026). PAIR of
 * frontend/lib/i18n/messages/en.ts `reportRules.tintClosing.item1..item7`: the same text on the screen
 * and in the file; the spec compares them.
 */
export const TINT_CLOSING_COLUMN_NOTES = {
  dealer: 'Dealer: each dealer on its own, as it is in SRS.',
  vehicles: 'Vehicles: how many window tint services the dealer had in the month (each service on a WO counts its Qty; one service = one vehicle).',
  income:
    'Income: the Closing Report lines of the month whose service has «tint» in its name: Work Orders by creation date, invoiced or not, and lines of Generic invoices. With the invoice discount, without tax. TTK invoices do not count.',
  payroll:
    'Payroll: what SRS pays at the dealer to employees with a role that has «tint» in its name (for example, Tinter), in the pay periods that end in the month. What is paid outside SRS does not count.',
  expenses:
    "Expenses: the dealer's expenses in the «Window Tint Film» category, dated in the month, approved or not. Deleted expenses do not count.",
  profit: 'Profit/Loss: Income − Payroll − Expenses.',
  pct: '%: Profit/Loss divided by Income. Shows «—» when Income is $0.',
} as const

/** In the order of the cartel (item1..item7). */
export const TINT_CLOSING_COLUMN_NOTES_IN_ORDER = [
  TINT_CLOSING_COLUMN_NOTES.dealer,
  TINT_CLOSING_COLUMN_NOTES.vehicles,
  TINT_CLOSING_COLUMN_NOTES.income,
  TINT_CLOSING_COLUMN_NOTES.payroll,
  TINT_CLOSING_COLUMN_NOTES.expenses,
  TINT_CLOSING_COLUMN_NOTES.profit,
  TINT_CLOSING_COLUMN_NOTES.pct,
] as const
