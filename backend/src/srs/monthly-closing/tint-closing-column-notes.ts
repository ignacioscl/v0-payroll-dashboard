/**
 * What each column of the Window Tint Closing counts, as the note on its header in the Excel (D5 of
 * plans/plan-reporte-tint/PLAN.md, approved word by word on 11/04/2026). PAIR of
 * frontend/lib/i18n/messages/en.ts `reportRules.tintClosing.item1..item7`: the same text on the screen
 * and in the file; the spec compares them.
 */
export const TINT_CLOSING_COLUMN_NOTES = {
  dealer: 'Dealer: each dealer on its own, as it is in SRS.',
  vehicles:
    'Vehicles: how many window tint services («tint» in the name) the dealer had in the month on work orders assigned to tinters (each service counts its Qty; one service = one vehicle).',
  income:
    "Income: only the services with «tint» in their name, of the month's work orders assigned to a tinter (an employee with a role that has «tint» in its name), by creation date, invoiced or not. With the invoice discount, without tax. Lines of Generic invoices with «tint» in their description also count. TTK invoices do not count.",
  payroll:
    'Payroll: what SRS pays at the dealer to tinters (employees with a role that has «tint» in its name), with every payment type, in the pay periods that end in the month, without the piecework of services that do not have «tint» in their name. What is paid outside SRS does not count. Employees marked as Vendor do not count. Salaries of tinters without dealer go in the «Without dealer» row and are included in the Total.',
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
