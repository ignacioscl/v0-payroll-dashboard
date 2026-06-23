import { ApiProperty, ApiHideProperty } from '@nestjs/swagger'
import { IsString, IsOptional, IsNumber } from 'class-validator'
import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { ParametricDataCategory } from '../../parametric-data-category/entity/parametric-data-category.entity'
import { PermissionAction } from 'src/features/permission-action/entity/permission-action.entity'
// import { PermissionAction } from 'src/features/permission-action/entity/permission-action.entity'

@Entity({ name: 'parametric_data' })
export class ParametricData extends EntityBase {
  @ApiProperty({
    description: 'Parametric data category ID',
    type: Number,
  })
  @IsNumber()
  @Column({ name: 'id_parametric_category' })
  idParametricCategory: number

  @ApiProperty({
    description: 'Parent parametric data ID',
    type: Number,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Column({ name: 'id_parent', nullable: true })
  idParent?: number

  @ApiProperty({
    description: 'Internal code',
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  @Column({ name: 'internal_code', length: 8, nullable: true })
  internalCode?: string

  @ApiProperty({
    description: 'Name',
    type: String,
    example: 'Medical Equipment Type',
  })
  @IsString()
  @Column({ name: 'name', length: 45 })
  name: string

  @ApiProperty({
    description: 'Description',
    type: String,
    required: false,
    example: 'Description of the parametric data',
  })
  @IsString()
  @IsOptional()
  @Column({ name: 'description', length: 45, nullable: true })
  description?: string

  @ApiProperty({
    description: 'JSON information',
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  @Column({ name: 'json_info', length: 5000, nullable: true })
  jsonInfo?: string

  @ApiProperty({
    description: 'Additional data',
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  @Column({ name: 'additional_data', length: 512, nullable: true })
  additionalData?: string

  @ApiProperty({
    description: 'Order by',
    type: Number,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Column({ name: 'order_by', nullable: true })
  orderBy?: number
  // Relations
  @ManyToOne(() => ParametricDataCategory)
  @JoinColumn({ name: 'id_parametric_category' })
  parametricDataCategory?: ParametricDataCategory

  @ManyToOne(() => ParametricData, { nullable: true })
  @JoinColumn({ name: 'id_parent' })
  parent?: ParametricData

  @ApiProperty({ description: 'Acciones de permiso relacionadas', required: false, type: () => PermissionAction })
  @OneToMany(() => PermissionAction, permissionAction => permissionAction.parametricData)
  permissionActions?: PermissionAction[]
}
