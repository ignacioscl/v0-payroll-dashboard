import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional } from 'class-validator'
import { Column, Entity } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'

@Entity('parametric_data_category')
export class ParametricDataCategory extends EntityBase {
  @ApiProperty({
    description: 'Category name',
    type: String,
    example: 'Medical Equipment',
  })
  @IsString()
  @IsOptional()
  @Column({ name: 'category_name', length: 45, nullable: true })
  categoryName?: string
}
