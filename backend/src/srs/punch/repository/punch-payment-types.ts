import { BadRequestException } from '@nestjs/common'

/**
 * Filtro de payment type del Punch Report — CSV de GENERIC_DATA.id.
 *
 * NO existe una mitad «sin payment type» aca: «sin tipo de pago» se pide con
 * `issueType='without_salary'`, que ya tiene su predicado y su 403. Los dos
 * controles son EXCLUYENTES en la UI (D-6, PLAN.md 4.2.2bis).
 */

/** Tope del CSV. Espeja el `@Matches` de los tres DTO. */
export const PAYMENT_TYPE_IDS_MAX = 50

/**
 * Parsea el CSV a la forma canonica: enteros positivos, sin duplicados, ordenados.
 *
 * Es la MISMA reja que despues autoriza a interpolar en el SQL: nada que no haya
 * pasado por aca entra a `buildPaymentTypeFilterSql`.
 */
export function parsePaymentTypeIds(raw: unknown): number[] {
  if (raw === undefined || raw === null) return []

  // `?idPaymentTypes[]=8` llega como array; `(string) []` daria "Array" en vez de fallar.
  if (typeof raw !== 'string') {
    throw new BadRequestException('idPaymentTypes must be a comma-separated string of ids.')
  }

  const trimmed = raw.trim()
  // Presente y vacio es distinto de ausente: la UI nunca lo manda.
  if (trimmed === '') {
    throw new BadRequestException('idPaymentTypes cannot be empty.')
  }

  const seen = new Set<number>()
  for (const token of trimmed.split(',')) {
    if (!/^[1-9]\d{0,9}$/.test(token)) {
      throw new BadRequestException(`Invalid idPaymentTypes value: ${token}`)
    }
    seen.add(Number(token))
  }

  if (seen.size > PAYMENT_TYPE_IDS_MAX) {
    throw new BadRequestException(`idPaymentTypes accepts at most ${PAYMENT_TYPE_IDS_MAX} ids.`)
  }

  return [...seen].sort((a, b) => a - b)
}

/**
 * Predicado unico, usado por los DOS repositorios (list y grouped).
 *
 * Los ids se INTERPOLAN, igual que `errorTypesInList()` y por la misma razon: un
 * `?` de cantidad variable correria todos los binds posteriores, y el orden de
 * los binds es la trampa numero 1 de este modulo. La seguridad la da la reja de
 * `parsePaymentTypeIds` (+ el `@Matches` del DTO), no el bind.
 *
 * Devuelve `''` cuando no hay filtro, para concatenar sin condicionales.
 */
export function buildPaymentTypeFilterSql(ids: readonly number[]): string {
  if (ids.length === 0) return ''
  // Cinturon y tirantes: si alguien llama sin pasar por parsePaymentTypeIds,
  // esto revienta antes de construir SQL en vez de interpolar basura.
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(`Invalid payment type id: ${String(id)}`)
    }
  }
  // Ordenado y sin duplicados ACA TAMBIEN, no solo en el parser: el SQL sale
  // igual venga de donde venga la lista, asi el plan de ejecucion se cachea y
  // los specs no dependen del orden en que el usuario fue tildando.
  const canonical = [...new Set(ids)].sort((a, b) => a - b)
  return ` AND tew.id_payment_type IN (${canonical.join(',')})`
}
