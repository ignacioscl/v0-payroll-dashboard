import type { SqlRunner } from '../shared/mysql-result'

export type NextInvoiceNumber = {
  prefix: string
  invoiceNro: number
  fullNro: string
}

/**
 * El número siguiente de invoice de un dealer, para todos los tipos (WO, Generic): un solo lugar
 * (plans/plan-wo-to-be-billed-v0, D5). SQL literal del que usaba Generic, que es el de legacy
 * (`InvoiceService.php:333-361`, `GET_MAX_NRO_INVOICE`; `DealerRelDao.php:19-89`).
 *
 * Recibe el `EntityManager` de la transacción en curso: el `FOR UPDATE` deja tomado el número hasta el commit.
 * La numeración cuenta también las invoices eliminadas, como hoy.
 */
export async function nextInvoiceNumber(
  mgr: SqlRunner,
  idDealer: number,
  idDealerProvider: number,
): Promise<NextInvoiceNumber> {
  const maxRows = await mgr.query(
    `SELECT COALESCE(MAX(invoice_nro), 0) AS nro
     FROM INVOICE_STATEMENT
     WHERE id_dealer = ?
       AND id_dealer_provider = ?
     FOR UPDATE`,
    [idDealer, idDealerProvider],
  )
  const maxNro = Number(maxRows[0]?.nro ?? 0)

  const relRows = await mgr.query(
    `SELECT ini_nro_inv, prefix_invoice
     FROM DEALER_REL
     WHERE id_dealer_customer = ?
       AND id_dealer_provider = ?
       AND estado = 1
     ORDER BY fecha_ini ASC, id ASC
     LIMIT 1`,
    [idDealer, idDealerProvider],
  )
  const prefix = String(relRows[0]?.prefix_invoice ?? '').toUpperCase()
  const iniNro = relRows[0]?.ini_nro_inv
  const invoiceNro =
    maxNro > 0 ? maxNro + 1 : iniNro == null || iniNro === '' ? 1 : Number(iniNro) || 1
  return { prefix, invoiceNro, fullNro: `${prefix}${invoiceNro}` }
}
