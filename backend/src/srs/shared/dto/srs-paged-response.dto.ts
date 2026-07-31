import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * Forma de respuesta de los listados SRS (`results` / `total` / `hasMore`).
 *
 * Es la convención ya usada por `punch/grouped`, `billing/invoice-list` e
 * `billing/invoice-lookup`, y la que el frontend tipa en
 * `components/shared/data-table` (`PaginatedDataTableResponse`).
 *
 * No confundir con `commons/pagination/PaginationDto`, que es la forma de los
 * CRUD de `src/features/*` (la genera `BaseRepository` sobre entities TypeORM).
 */
export class SrsPagedResponseDto<T> {
  @ApiProperty({ isArray: true })
  results!: T[]

  @ApiProperty({ example: 25 })
  pageSize!: number

  /** Total del período. En listados por cursor se calcula SIN la condición del cursor. */
  @ApiProperty({ example: 334 })
  total!: number

  @ApiProperty({ example: true })
  hasMore!: boolean
}

/** Cursor keyset: valor de la columna ordenada + id único que desempata. */
export class SrsCursorDto {
  @ApiProperty({
    example: '2026-07-30 12:01:16',
    description: 'Valor de la columna por la que se ordena, en el formato de la base',
  })
  value!: string

  @ApiProperty({ example: 910577, description: 'Id único de la última fila entregada' })
  id!: number
}

/**
 * Listados paginados por cursor (keyset).
 *
 * No expone `page`: en un listado por cursor no existe el concepto de número de
 * página. El cliente reenvía `nextCursor` tal cual lo recibió.
 */
export class SrsCursorPagedResponseDto<T> extends SrsPagedResponseDto<T> {
  @ApiPropertyOptional({
    type: SrsCursorDto,
    nullable: true,
    description: 'Cursor para la página siguiente; null cuando no hay más',
  })
  nextCursor!: SrsCursorDto | null
}
