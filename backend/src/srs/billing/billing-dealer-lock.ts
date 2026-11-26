import type { SqlRunner } from '../shared/mysql-result'

/**
 * El candado de facturación de un dealer (plans/plan-wo-to-be-billed-v0, D4 y §8.3): la fila de `DEALER_REL` del par
 * dealer + empresa, `FOR UPDATE`. **Es la primera sentencia de la transacción**: con REPEATABLE READ la foto de lo que
 * la transacción ve se fija en su primera lectura común, y si esa lectura fuera anterior al candado, la segunda
 * generación no vería lo que la primera acaba de facturar.
 *
 * La fila existe siempre para un dealer en alcance (el `MAX(invoice_nro) … FOR UPDATE` de `nextInvoiceNumber` no
 * alcanza solo: un dealer sin invoices no tiene filas que bloquear). Quien cambia el Lock Date desde Dealers escribe
 * esta misma fila (`DealerRelDao.php:281-287`): espera a que la generación termine.
 *
 * Devuelve `false` si el dealer no tiene relación activa con la empresa.
 */
export async function lockDealerForBilling(db: SqlRunner, idDealer: number, idDealerProvider: number): Promise<boolean> {
  const rows = await db.query(
    `SELECT id FROM DEALER_REL
      WHERE id_dealer_customer = ? AND id_dealer_provider = ? AND estado = 1
      ORDER BY fecha_ini ASC, id ASC
      FOR UPDATE`,
    [idDealer, idDealerProvider],
  )
  return rows.length > 0
}
