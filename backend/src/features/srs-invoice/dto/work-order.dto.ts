import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator'

/** Ancho de `INVOICE.ro` / `INVOICE.po` (`DUMP:1323`). */
export const WORK_ORDER_RO_PO_MAX = 16
/** Tope de WO por pedido de «Delete selected». */
export const WORK_ORDER_DELETE_MAX = 200

/** Filtro del feature (lo que pide BaseRepository.fetch). */
export class WorkOrderQueryDto {
  id?: number
  page?: number
  pageSize?: number
}

/** `POST /srs/billing/work-orders/delete`: una o varias WO; `bulk` = el tacho de arriba (D11). */
export class DeleteWorkOrdersDto {
  @ApiProperty({ example: [4423766] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WORK_ORDER_DELETE_MAX)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[]

  @ApiProperty({ example: false })
  @IsBoolean()
  bulk!: boolean
}

export class DeleteWorkOrdersResponseDto {
  deleted!: Array<{ id: number; fullNro: string }>
  /** `fullNro` solo en las que son de la empresa (pasaron el alcance); en las otras, solo el `id` pedido. */
  failed!: Array<{ id: number; fullNro?: string; reason: string }>
}

/** `PUT /srs/billing/work-orders/:idInvoice/ro-po`. */
export class UpdateWorkOrderRoPoDto {
  @ApiProperty({ enum: ['ro', 'po'] })
  @IsIn(['ro', 'po'])
  field!: 'ro' | 'po'

  @ApiProperty({ example: 'R12345' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(WORK_ORDER_RO_PO_MAX)
  value!: string
}

export class WorkOrderRoPoResponseDto {
  ro!: string | null
  po!: string | null
}
