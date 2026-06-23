import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNumber, Min } from 'class-validator'

export class IdParams {
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @ApiProperty({ description: 'Id', type: Number, example: 1, required: true, minimum: 1 })
  id: number
}
