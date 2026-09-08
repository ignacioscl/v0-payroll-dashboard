import { BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'

/**
 * Catalogo efectivo de payment types de un provider.
 *
 * Es la MISMA definicion que usa la pantalla, `payment-types-catalog.php`. Se
 * duplica aca porque Nest no puede llamar al PHP, y duplicarla MAL crea dos
 * verdades: un id que el combo nunca ofrece pero el filtro acepta, cuyo nombre
 * despues aparece en el Report Info del XLSX.
 *
 * Las cinco partes de esa definicion, leidas el 2026-09-08:
 *
 *  1. `id_categoria = 30`  — CategoriaParametrica::$ID_GENERIC_DATA_PAYMENT_TYPE
 *  2. `estado = 1`         — Filter::getEstado() devuelve 1 cuando nadie lo setea
 *  3. `(id_dealer_provider = <provider> OR id_dealer_provider IS NULL)`
 *  4. `id NOT IN (6, 7)`   — PAYMENT_TYPE_CATALOG_EXCLUDED_IDS, aplicado en PHP
 *  5. (Mooi) `JSON_EXTRACT(json_string,'$.filterMooi') = 1`
 *
 * La 5 NO se replica, a proposito: el `if` que la activa mira
 * `TemplateManager::isMooi()`, que no mira el provider sino el HOST del request
 * (`strpos($_SERVER['HTTP_HOST'], "mooi.")`). Es un switch de deployment, no de
 * cliente, y Nest no ve ese host. Como el dashboard v0 no se sirve desde un host
 * `mooi.*`, la llamada al catalogo que llena el combo TAMPOCO lo aplica: validar
 * sin la parte 5 acepta exactamente el conjunto que el combo mostro, que es la
 * invariante que importa. Si algun dia v0 se sirve desde un host Mooi, esto se
 * rompe en los dos lados a la vez y hay que volver aca.
 */

/** GENERIC_DATA.id_categoria de Payment type. */
export const PAYMENT_TYPE_CATEGORY_ID = 30

/**
 * Ids que el catalogo esconde a mano (`PAYMENT_TYPE_CATALOG_EXCLUDED_IDS`).
 *
 * Son 6 (`Holiday`) y 7 (`Sickday`): categoria 30, activos y GLOBALES, o sea que
 * pasan las partes 1-3 pero el combo no los muestra nunca. Sin esta parte, un
 * `idPaymentTypes=6` seria aceptado y el Report Info escribiria un nombre que la
 * pantalla no ofrece.
 */
export const PAYMENT_TYPE_CATALOG_EXCLUDED_IDS: readonly number[] = [6, 7]

const EXCLUDED_LIST = PAYMENT_TYPE_CATALOG_EXCLUDED_IDS.join(',')

export type PaymentTypeCatalogRow = { id: number; name: string }

/**
 * Trae del catalogo del provider SOLO los ids pedidos.
 *
 * `ids` tiene que venir de `parsePaymentTypeIds` (enteros positivos), que es lo
 * que autoriza a interpolarlos. `idDealerProvider` va bindeado.
 */
export async function loadPaymentTypesFromCatalog(
  ds: DataSource,
  idDealerProvider: number,
  ids: readonly number[],
): Promise<PaymentTypeCatalogRow[]> {
  if (ids.length === 0) return []
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`Invalid payment type id: ${String(id)}`)
    }
  }

  const rows: Array<{ id: number | string; name: string | null }> = await ds.query(
    `SELECT g.id, g.name
       FROM GENERIC_DATA g
      WHERE g.id_categoria = ${PAYMENT_TYPE_CATEGORY_ID}
        AND g.estado = 1
        AND (g.id_dealer_provider = ? OR g.id_dealer_provider IS NULL)
        AND g.id NOT IN (${EXCLUDED_LIST})
        AND g.id IN (${ids.join(',')})`,
    [idDealerProvider],
  )

  return rows.map((r) => ({ id: Number(r.id), name: String(r.name ?? '') }))
}

/**
 * Valida que TODOS los ids pedidos esten en el catalogo del provider.
 *
 * Un id que no pase es un 400, no un filtro que devuelve vacio: vacio esconde el
 * error, 400 lo dice. Devuelve los nombres ya resueltos para que el Report Info
 * no tenga que volver a consultar (y no pueda hacerlo con otro criterio).
 */
export async function assertPaymentTypesInCatalog(
  ds: DataSource,
  idDealerProvider: number,
  ids: readonly number[],
): Promise<PaymentTypeCatalogRow[]> {
  if (ids.length === 0) return []

  const found = await loadPaymentTypesFromCatalog(ds, idDealerProvider, ids)
  const foundIds = new Set(found.map((r) => r.id))
  const missing = ids.filter((id) => !foundIds.has(id))

  if (missing.length > 0) {
    throw new BadRequestException(`Unknown payment type id(s): ${missing.join(',')}`)
  }

  return found
}
