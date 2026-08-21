import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Calendar date YYYY-MM-DD (rejects 2026-99-99 that a regex alone would accept). */
function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false
          const m = ISO_DATE.exec(value)
          if (!m) return false
          const year = Number(m[1])
          const month = Number(m[2])
          const day = Number(m[3])
          const dt = new Date(Date.UTC(year, month - 1, day))
          return (
            dt.getUTCFullYear() === year &&
            dt.getUTCMonth() === month - 1 &&
            dt.getUTCDate() === day
          )
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid YYYY-MM-DD date`
        },
      },
    })
  }
}

function trimString({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value
  return value.trim()
}

function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) return undefined
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' ? undefined : t
  }
  return value
}

/** Legacy create payload (no `kind`) and v0 free lines. */
export class GenericFreeItemDto {
  @ApiPropertyOptional({ enum: ['free'] })
  @IsOptional()
  @IsIn(['free'])
  kind?: 'free'

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  idRel?: number

  @ApiProperty({ maxLength: 128 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  description!: string

  @ApiPropertyOptional({ minimum: 0.01, maximum: 9999999.99 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999.99)
  qty?: number

  @ApiProperty({ minimum: -999999.99, maximum: 999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-999999.99)
  @Max(999999.99)
  unitAmount!: number
}

export class GenericTtkItemDto {
  @ApiProperty({ enum: ['ttk'] })
  @IsIn(['ttk'])
  kind!: 'ttk'

  @ApiProperty()
  @IsInt()
  @Min(1)
  idEmployee!: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 1 || value === '1')
  @IsBoolean()
  onlyTimecard?: boolean
}

/** @deprecated alias kept so existing imports compile during the cutover */
export class GenericInvoiceItemDto extends GenericFreeItemDto {}

export class CreateGenericInvoiceDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  idDealer!: number

  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  @IsCalendarDate()
  dateFrom!: string

  @ApiProperty({ example: '2026-08-31' })
  @IsString()
  @IsCalendarDate()
  dateTo!: string

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(255)
  invoiceNote?: string

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2048)
  headerNote?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 99.999 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(99.999)
  tax?: number

  @ApiProperty({ type: [GenericFreeItemDto] })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenericFreeItemDto, {
    discriminator: {
      property: 'kind',
      subTypes: [
        { value: GenericFreeItemDto, name: 'free' },
        { value: GenericTtkItemDto, name: 'ttk' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  items!: Array<GenericFreeItemDto | GenericTtkItemDto>
}

export class UpdateGenericInvoiceDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  @IsCalendarDate()
  dateFrom!: string

  @ApiProperty({ example: '2026-08-31' })
  @IsString()
  @IsCalendarDate()
  dateTo!: string

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(255)
  invoiceNote?: string

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2048)
  headerNote?: string

  @ApiPropertyOptional({ minimum: 0, maximum: 99.999 })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(99.999)
  tax?: number

  @ApiProperty({ type: [GenericFreeItemDto] })
  @ValidateNested({ each: true })
  @Type(() => GenericFreeItemDto, {
    discriminator: {
      property: 'kind',
      subTypes: [
        { value: GenericFreeItemDto, name: 'free' },
        { value: GenericTtkItemDto, name: 'ttk' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  items!: Array<GenericFreeItemDto | GenericTtkItemDto>
}

export class GenericTtkEmployeesQueryDto {
  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  idDealer!: number

  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  @IsCalendarDate()
  dateFrom!: string

  @ApiProperty({ example: '2026-08-31' })
  @IsString()
  @IsCalendarDate()
  dateTo!: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  includeStatementId?: number
}

export class GenericCatalogQueryDto {
  @ApiProperty({ enum: [36, 44] })
  @Transform(({ value }) => Number(value))
  @IsIn([36, 44])
  cat!: 36 | 44

  @ApiProperty()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  idDealer!: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  q?: string
}

export class GenericCatalogItemDto {
  @ApiProperty()
  id!: number

  @ApiProperty()
  name!: string

  @ApiPropertyOptional({ nullable: true })
  price!: number | null

  @ApiProperty()
  canDelete!: boolean
}

export class GenericInvoiceConfigDto {
  @ApiProperty()
  hasGenericInvoice!: boolean

  @ApiProperty()
  canCreate!: boolean

  @ApiProperty()
  canDeleteCatalogItem!: boolean
}

export class CreateGenericInvoiceResponseDto {
  @ApiProperty()
  id!: number

  @ApiProperty()
  invoiceNro!: number

  @ApiProperty()
  fullNro!: string
}

export class UpdateGenericInvoiceResponseDto {
  @ApiProperty()
  id!: number

  @ApiProperty()
  fullNro!: string
}

export class GenericTtkEmployeeRowDto {
  @ApiProperty()
  idEmployee!: number

  @ApiProperty()
  nombreEmployee!: string

  @ApiPropertyOptional({ nullable: true })
  rolName!: string | null

  @ApiPropertyOptional({ nullable: true })
  dptoName!: string | null

  @ApiProperty()
  hoursReg!: number

  @ApiProperty()
  amountDealer!: number

  @ApiProperty()
  alreadyOnInvoice!: boolean

  @ApiProperty()
  hoursUnbilledInRange!: number
}

export class GenericTtkEmployeesResponseDto {
  @ApiProperty({ type: [GenericTtkEmployeeRowDto] })
  rows!: GenericTtkEmployeeRowDto[]

  @ApiProperty()
  totals!: { employees: number; hours: number; amountDealer: number }
}

export class GenericFreeLineDto {
  @ApiProperty({ enum: ['free'] })
  kind!: 'free'

  @ApiProperty()
  idRel!: number

  @ApiProperty()
  description!: string

  @ApiPropertyOptional({ nullable: true })
  qty!: number | null

  @ApiProperty()
  unitAmount!: number

  @ApiProperty()
  isPaid!: boolean
}

export class GenericTtkLineDto {
  @ApiProperty({ enum: ['ttk'] })
  kind!: 'ttk'

  @ApiProperty({ type: [Number] })
  idRels!: number[]

  @ApiProperty()
  idEmployee!: number

  @ApiProperty()
  nombreEmployee!: string

  @ApiPropertyOptional({ nullable: true })
  rolName!: string | null

  @ApiPropertyOptional({ nullable: true })
  dptoName!: string | null

  @ApiProperty()
  hoursReg!: number

  @ApiProperty()
  amountDealer!: number

  @ApiProperty()
  onlyTimecard!: boolean

  @ApiProperty()
  isPaid!: boolean
}

export class GenericInvoiceDetailDto {
  @ApiProperty()
  id!: number

  @ApiProperty()
  fullNro!: string

  @ApiProperty()
  idDealer!: number

  @ApiProperty()
  dealerName!: string

  @ApiProperty()
  dateFrom!: string

  @ApiProperty()
  dateTo!: string

  @ApiPropertyOptional({ nullable: true })
  invoiceNote!: string | null

  @ApiPropertyOptional({ nullable: true })
  headerNote!: string | null

  @ApiPropertyOptional({ nullable: true })
  tax!: number | null

  @ApiPropertyOptional({ nullable: true })
  discount!: number | null

  @ApiPropertyOptional({ nullable: true })
  discountType!: number | null

  @ApiPropertyOptional({ nullable: true })
  discountDetail!: string | null

  @ApiProperty()
  statementPaid!: boolean

  @ApiProperty({ type: [GenericFreeLineDto] })
  items!: Array<GenericFreeLineDto | GenericTtkLineDto>
}
