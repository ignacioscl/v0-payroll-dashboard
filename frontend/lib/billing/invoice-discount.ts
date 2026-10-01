/**
 * The discount of a row as it goes to a spreadsheet: with the sign it has on screen.
 *
 * A row carries discountAmount = Subtotal − Total, positive when the discount lowers the total, and
 * the grid shows it as −$40.00. The file gets −40, so Subtotal + Discount = Total in Excel. A credit
 * whose discount raises the total (+$10.00 on screen) exports +10. No discount exports 0, never −0.
 */
export function discountExportValue(discountAmount: number): number {
  return discountAmount === 0 ? 0 : -discountAmount
}
