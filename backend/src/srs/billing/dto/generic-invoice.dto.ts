import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
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

export class GenericInvoiceItemDto {
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

  @ApiProperty({ type: [GenericInvoiceItemDto] })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenericInvoiceItemDto)
  items!: GenericInvoiceItemDto[]
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
