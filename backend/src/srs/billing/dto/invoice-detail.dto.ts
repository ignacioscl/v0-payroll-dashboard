import { ApiProperty } from '@nestjs/swagger'

/**
 * Fila de detalle de un statement de tipo WO (statement_type 1-4).
 * Espeja InvoiceStatementDao::loadStatementRel (una fila por servicio de WO).
 */
export class InvoiceDetailWoRowDto {
  @ApiProperty() id!: number
  @ApiProperty() idStatement!: number
  @ApiProperty({ nullable: true }) woNro?: string
  @ApiProperty({ nullable: true }) fechaAlta?: string
  @ApiProperty({ nullable: true }) vin?: string
  @ApiProperty({ nullable: true }) stockNumber?: string
  @ApiProperty({ nullable: true }) ro?: string
  @ApiProperty({ nullable: true }) po?: string
  @ApiProperty({ nullable: true }) department?: string
  @ApiProperty({ nullable: true }) service?: string
  @ApiProperty({ nullable: true }) observation?: string
  @ApiProperty({ nullable: true }) qty?: number
  @ApiProperty({ nullable: true }) price?: number
  @ApiProperty() isStatementFullBilled!: number
  @ApiProperty({ nullable: true }) checkNumber?: string
  @ApiProperty({ nullable: true }) amount?: number
  @ApiProperty({ nullable: true }) fechaPago?: string
}

/**
 * Fila de detalle de statement TTK (5) o Generic (6).
 * Espeja InvoiceStatementDao::loadStatementRelGenerics (UNION generic + ttk).
 */
export class InvoiceDetailGenericRowDto {
  @ApiProperty({ nullable: true }) id?: number
  @ApiProperty() idStatement!: number
  @ApiProperty({ nullable: true }) description?: string
  @ApiProperty({ nullable: true }) genericQty?: number
  @ApiProperty({ nullable: true }) price?: number
  @ApiProperty() isStatementFullBilled!: number
  @ApiProperty({ nullable: true }) checkNumber?: string
  @ApiProperty({ nullable: true }) amount?: number
  @ApiProperty({ nullable: true }) fechaPago?: string
  /** TTK rollup por autor (null en filas generic puras). */
  @ApiProperty({ nullable: true }) idAuthorTtk?: number
  @ApiProperty({ nullable: true }) rolName?: string
  @ApiProperty({ nullable: true }) departmentName?: string
  @ApiProperty() onlyTimecard!: number
}

export class InvoiceDetailResponseDto {
  @ApiProperty() idStatement!: number
  @ApiProperty({ description: 'statement_type del statement' }) statementType!: number
  @ApiProperty({ type: [InvoiceDetailWoRowDto] }) woRows!: InvoiceDetailWoRowDto[]
  @ApiProperty({ type: [InvoiceDetailGenericRowDto] }) genericRows!: InvoiceDetailGenericRowDto[]
}
