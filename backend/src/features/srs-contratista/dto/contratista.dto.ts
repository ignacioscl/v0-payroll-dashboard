import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsOptional, Matches, ValidateIf } from 'class-validator'

import { RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export class ContratistaQueryDto extends RequestPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idEmpresa?: number
}

/** Branding the provider configures for v0 (Settings > Visual). */
export class UpdateBrandingDto {
  @ApiPropertyOptional({
    example: '#26407F',
    nullable: true,
    description: 'Accent as #rrggbb. null clears it back to the product default.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accentColor must be #rrggbb' })
  accentColor?: string | null
}

export class BrandingDto {
  @ApiProperty({ nullable: true })
  accentColor!: string | null

  /** File name to render: the v0 logo when there is one, the legacy one otherwise. */
  @ApiProperty({ nullable: true })
  logoFile!: string | null

  /** true → logoFile is served by this backend; false → it is a legacy upload. */
  @ApiProperty()
  logoIsV0!: boolean
}
