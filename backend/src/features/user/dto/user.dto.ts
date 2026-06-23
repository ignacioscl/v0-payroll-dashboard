import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, IsNumber } from 'class-validator'

import { User } from '../entity/user.entity'
import { RoleEnum } from '../../../commons/enum/role.enum'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'
import { UserExtendedDto } from './user-extended.dto'
import { IsUserExtendedValid } from '../../../commons/class.validator.custom/validate-user-extended.validator'
import { IsPasswordMatch } from '../../../commons/class.validator.custom/password-match.validator'

export class UserDto extends OmitType(User, ['id', 'fullName', 'userExtended'] as const) {
  @ApiProperty({ description: 'Información extendida del usuario', required: false, type: UserExtendedDto })
  @IsOptional()
  @IsUserExtendedValid()
  userExtended?: UserExtendedDto

  @ApiProperty({ description: 'Imagen del empleado en base64', required: false, type: String })
  @IsOptional()
  @IsString()
  employeePhoto?: string
}

export class UserPatientDto extends OmitType(User, ['id', 'fullName', 'userExtended'] as const) {
  @ApiProperty({ description: 'Información extendida del usuario', required: false, type: UserExtendedDto })
  @IsUserExtendedValid()
  userExtended: UserExtendedDto
}

export class UpdateUserDto extends PartialType(OmitType(UserDto, ['role', 'password'] as const)) {
  @ApiProperty({ description: 'Eliminar imagen del empleado (1 para eliminar)', required: false, type: Number })
  @IsOptional()
  @IsNumber()
  imageDelete?: number
}

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Nueva contraseña del usuario',
    example: 'NuevaContraseña123!',
    minLength: 6,
    maxLength: 50,
  })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(50, { message: 'La contraseña no puede exceder 50 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
  })
  password: string

  @ApiProperty({
    description: 'Confirmación de la nueva contraseña',
    example: 'NuevaContraseña123!',
  })
  @IsString()
  @IsPasswordMatch('password')
  confirmPassword: string
}

export class UserQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false, deprecated: true })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'Username filter', required: false })
  @IsString()
  @IsOptional()
  email?: string

  @ApiProperty({ description: 'Role filter', required: false, enum: RoleEnum, default: RoleEnum.USER })
  @IsOptional()
  @IsEnum(RoleEnum)
  role?: RoleEnum

  @ApiProperty({
    description: 'First name filter',
    required: false,
    example: 'John',
  })
  @IsString()
  @IsOptional()
  firstName?: string

  @ApiProperty({
    description: 'Last name filter',
    required: false,
    example: 'Doe',
  })
  @IsString()
  @IsOptional()
  lastName?: string

  @ApiProperty({ description: 'exclude user by id', required: false })
  @IsOptional()
  excludeUserId?: number

  @ApiProperty({ description: 'filter by date salary (YYYY-MM-DD format)', required: false })
  @IsString()
  @IsOptional()
  dateSalary?: string
}

export class UserPaginationDto extends PaginationDto<User> {
  @ApiProperty({ type: User, isArray: true })
  data: User[]
}
