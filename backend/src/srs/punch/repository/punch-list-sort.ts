import { BadRequestException } from '@nestjs/common'

import type { PunchListSort } from '../dto/punch-list.dto'

/**
 * BUG-07 — cada columna ordena por SU valor, y los vacios van SIEMPRE al final.
 *
 * Forma del orden:
 *
 *   ORDER BY (<order> IS NULL) ASC,   -- solo si `nullable`
 *            <order> <DIR>,
 *            tew.id  <DIR>
 *
 * El termino lider va SIEMPRE ASC: eso es lo que manda los vacios al final en
 * asc Y en desc (D-4). No se usa `NULLS LAST` porque MariaDB 10.3 no lo soporta
 * (ERROR 1064). Tampoco centinelas numericos: `TTK_CALCULATE_TIME_DAY` produce
 * `999.00` y negativos que son valores REALES en esta base, asi que cualquier
 * centinela puede chocar con un dato. Un flag booleano no puede chocar con nada.
 *
 * Cuando `nullable` es false el termino lider NO se emite, y el camino por
 * defecto (`punchIn`) queda byte-identico al de produccion: index-ordered por
 * `idx_ttk_provider_punchin_id`, sin filesort.
 */
export type PunchSortSpec = {
  /** Expresion del ORDER BY y de la comparacion del cursor. */
  order: string
  /** Proyeccion del valor del cursor, comparable con `order`. */
  cursor: string
  /** false => no se emite el termino lider de vacios. */
  nullable: boolean
  /** Los binds del cursor viajan como numero, no como string. */
  numeric?: boolean
  /** El cursor es una fecha `YYYY-MM-DD HH:mm:ss`. */
  date?: boolean
}

/**
 * Time work: LA MISMA expresion que produce la celda.
 *
 * La celda es `SEC_TO_TIME(<esto> * 3600)`, o sea sale del mismo decimal, asi
 * que ordenar por aca coincide exactamente con lo que se ve.
 */
export const TIME_WORK_EXPR =
  'TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1)'

/**
 * Time break: segundos EXACTOS, no el decimal.
 *
 * D-10 — la celda es `TIME_FORMAT(TIMEDIFF(break_end, break_start))`, exacta al
 * segundo, mientras `TTK_CALCULATE_TIME_DAY` devuelve decimal(6,2), o sea 36
 * segundos de granularidad. Ordenar por el decimal empata todo lo que cae en la
 * misma ventana de 36 s y lo desempata por `tew.id`: eso es EXACTAMENTE lo que
 * BUG-07 reporta como "no queda ordenado".
 */
export const TIME_BREAK_SECONDS_EXPR = 'TIME_TO_SEC(TIMEDIFF(tew.break_end, tew.break_start))'

function dateCursor(column: string): string {
  return `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`
}

export const PUNCH_SORT_SPECS: Record<PunchListSort, PunchSortSpec> = {
  // `punch_in` y `u.nombre` son NOT NULL en el DDL y no tienen vacios en los
  // datos (0 sobre 848 659 y 0 sobre 10 503): sin termino lider, index-ordered.
  punchIn: {
    order: 'tew.punch_in',
    cursor: dateCursor('tew.punch_in'),
    nullable: false,
    date: true,
  },
  employee: { order: 'u.nombre', cursor: 'u.nombre', nullable: false },

  punchOut: {
    order: 'tew.punch_out',
    cursor: dateCursor('tew.punch_out'),
    nullable: true,
    date: true,
  },
  breakStart: {
    order: 'tew.break_start',
    cursor: dateCursor('tew.break_start'),
    nullable: true,
    date: true,
  },
  breakEnd: {
    order: 'tew.break_end',
    cursor: dateCursor('tew.break_end'),
    nullable: true,
    date: true,
  },
  timeWork: { order: TIME_WORK_EXPR, cursor: TIME_WORK_EXPR, nullable: true, numeric: true },
  timeBreak: {
    order: TIME_BREAK_SECONDS_EXPR,
    cursor: TIME_BREAK_SECONDS_EXPR,
    nullable: true,
    numeric: true,
  },
  // `gd.name` sale del LEFT JOIN que ya esta SIEMPRE en el FROM, sin depender de
  // includePaymentTypeName: ordenar por payment type no agrega ningun join.
  // Quien no tiene el permiso no ve la columna, pero eso es cosmetica: el 403 lo
  // pone la policy (4.2.3bis).
  paymentType: { order: 'gd.name', cursor: 'gd.name', nullable: true },
}

const DATE_CURSOR_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/**
 * `afterValue` se valida CONTRA EL SORT, no solo por presencia.
 *
 * Sin esto, `sort=timeBreak&afterValue=abc` produce un bind `NaN` y termina en
 * 500 o, peor, en una paginacion silenciosamente mal.
 */
export function coerceAfterValue(spec: PunchSortSpec, raw: string): string | number {
  if (spec.numeric) {
    // `Number('')` y `Number('  ')` son 0, que es FINITO: sin este corte un
    // afterValue vacio se colaba como cero y paginaba desde el medio en vez de
    // dar 400.
    if (raw.trim() === '') {
      throw new BadRequestException('afterValue is required for this sort.')
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      throw new BadRequestException('afterValue must be a finite number for this sort.')
    }
    return n
  }
  if (spec.date && !DATE_CURSOR_RE.test(raw)) {
    throw new BadRequestException('afterValue must be formatted as YYYY-MM-DD HH:mm:ss.')
  }
  return raw
}

/**
 * Combinaciones validas del cursor de 3 partes.
 *
 * | afterEmpty | afterValue | afterId | Significado                    |
 * |------------|------------|---------|--------------------------------|
 * | ausente    | ausente    | ausente | primera pagina                 |
 * | '0'        | presente   | present | cursor en el tramo con valor   |
 * | '1'        | AUSENTE    | present | cursor dentro del tramo vacio  |
 * | '1'        | presente   | -       | 400                            |
 * | '0'        | ausente    | -       | 400                            |
 *
 * `afterEmpty` ausente con cursor presente se lee como '0': es la
 * compatibilidad que mantiene vivo al otro consumidor del cursor
 * (`fetchAllPunchesForEmployee`, el paginador del export de Grouped), que
 * fuerza `sort: 'punchIn'` —no nulable— y por lo tanto nunca cae en el tramo
 * vacio.
 */
export function assertCursorShape(query: {
  sort?: PunchListSort
  afterEmpty?: '0' | '1'
  afterValue?: string
  afterId?: number
}): void {
  const hasId = Number(query.afterId) > 0
  const hasValue = query.afterValue !== undefined && query.afterValue !== ''

  if (query.afterEmpty === '1') {
    if (hasValue) {
      throw new BadRequestException('afterValue must be absent when afterEmpty is 1.')
    }
    if (!hasId) {
      throw new BadRequestException('afterId is required when afterEmpty is 1.')
    }
    // El sort tambien manda: una columna NOT NULL no tiene tramo de vacios, asi
    // que `afterEmpty=1` ahi es un cursor imposible. Sin este corte,
    // `buildPunchListPageSql` cae a la rama no-nulable, coerce `afterValue` a la
    // cadena vacia y arma `u.nombre > ''`, que matchea todas las filas: la lista
    // se REINICIA en vez de devolver 400.
    const spec = PUNCH_SORT_SPECS[query.sort ?? 'punchIn']
    if (spec && !spec.nullable) {
      throw new BadRequestException(
        `afterEmpty=1 is not valid for sort=${query.sort ?? 'punchIn'}: that column has no empty rows.`,
      )
    }
    return
  }

  // afterEmpty '0' o ausente: si hay cursor, tiene que estar completo.
  if (hasId && !hasValue) {
    throw new BadRequestException('afterValue is required when afterId is present.')
  }
  if (hasValue && !hasId) {
    throw new BadRequestException('afterId is required when afterValue is present.')
  }
}
