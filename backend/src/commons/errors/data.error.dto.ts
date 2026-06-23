import { ApiProperty } from "@nestjs/swagger";

export class DataErrorDto<T> {
    @ApiProperty({ example: 500, description: 'Código de estado HTTP' })
    statusCode: number;
  
    @ApiProperty({ example: '/api/api-domicilio/tipodomi', description: 'Ruta de la solicitud' })
    path: string;
  
    @ApiProperty({ example: 'Error: Validation failed for parameter \'1\'. Invalid string.', description: 'Mensaje de error' })
    message: string;
  
    @ApiProperty({ example: 'POST', description: 'Método de la solicitud' })
    method: string;
  
    @ApiProperty({ description: 'Cuerpo de la solicitud que causó el error' })
    body: T;
  }