import { ApiProperty } from '@nestjs/swagger'

export class I18nErrorDto {
  @ApiProperty({ example: '/api/api-domicilio/tipodomi', description: 'Ruta de la solicitud' })
  path: string

  @ApiProperty({
    example: "Error: Validation failed for parameter '1'. Invalid string.",
    description: 'message',
  })
  message: string

  @ApiProperty({ example: 'POST', description: 'Método de la solicitud' })
  method: string

  @ApiProperty({ description: 'Cuerpo de la solicitud que causó el error' })
  body: any

  @ApiProperty({ description: 'error.name_not_found' })
  i18nKey: string

  @ApiProperty({ description: 'replacements' })
  replacements: string[]
}
