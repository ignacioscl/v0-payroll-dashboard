/**
 * Fragmentos de consulta sobre EXP_EXPENSE / EXP_EXPENSE_REPETITIVE que necesita el catálogo de Expenses (GENERIC_DATA
 * 34 compañías, 35 categorías). Viven acá, con las lecturas de gastos, y el catálogo los importa: el catálogo no
 * escribe su propio SQL sobre tablas ajenas. `g` es el alias de la fila de GENERIC_DATA en la consulta que los usa.
 */

export type CatalogColumn = 'id_company' | 'id_category'

/**
 * Gastos activos que usan la fila: un gasto repartido cuenta una vez. `EXP_EXPENSE.id` y `EXP_EXPENSE_GROUP.id` son
 * secuencias distintas, por eso el prefijo (misma expresión `expenseIdentity` de expense-report.repository.ts).
 */
export const expensesCountSql = (column: CatalogColumn): string =>
  `(SELECT COUNT(DISTINCT IF(e.id_exp_group IS NULL, CONCAT('e', e.id), CONCAT('g', e.id_exp_group)))
      FROM EXP_EXPENSE e WHERE e.${column} = g.id AND e.estado = 1)`

/**
 * 1 si algo apunta a la fila y la base no la dejaría borrar (las FK son RESTRICT): un gasto en cualquier estado
 * (también los borrados), una regla recurrente en cualquier estado o una fila de GENERIC_DATA que la tiene de
 * `id_parent` (la última categoría de una compañía). Sin acotar por empresa a propósito: una referencia de otra
 * empresa también frena el borrado. Es solo un sí / no: no expone datos ajenos.
 */
export const catalogInUseSql = (column: CatalogColumn): string =>
  `(CASE WHEN EXISTS (SELECT 1 FROM EXP_EXPENSE e WHERE e.${column} = g.id)
          OR EXISTS (SELECT 1 FROM EXP_EXPENSE_REPETITIVE r WHERE r.${column} = g.id)
          OR EXISTS (SELECT 1 FROM GENERIC_DATA gp WHERE gp.id_parent = g.id)
        THEN 1 ELSE 0 END)`
