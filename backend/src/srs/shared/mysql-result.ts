/**
 * Lo que devuelve `query()` de TypeORM con el driver de MySQL para un INSERT o un UPDATE (`OkPacket`).
 * Lo usan Generic Invoices y WO to be Billed (plans/plan-wo-to-be-billed-v0, T2).
 */

/** Cualquier cosa que corre SQL con parámetros: un `DataSource` o el `EntityManager` de una transacción. */
export type SqlRunner = {
  query(sql: string, params?: unknown[]): Promise<any>
}

export function mysqlInsertId(result: unknown): number {
  if (result && typeof result === 'object' && 'insertId' in result) {
    const id = Number((result as { insertId: number }).insertId)
    if (Number.isFinite(id) && id > 0) return id
  }
  throw new Error('INSERT did not return insertId')
}

export function mysqlAffectedRows(result: unknown): number {
  if (result && typeof result === 'object' && 'affectedRows' in result) {
    return Number((result as { affectedRows: number }).affectedRows) || 0
  }
  return 0
}

/** Una lista de ids como `?,?,?` para un `IN (…)`: cada valor va por parámetro. */
export function sqlMarks(values: readonly unknown[]): string {
  return values.map(() => '?').join(',')
}
