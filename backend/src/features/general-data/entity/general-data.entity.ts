import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator'
import { Column, Entity, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { ParametricDataCategory } from '../../parametric-data-category/entity/parametric-data-category.entity'
import { User } from '../../user/entity/user.entity'

@Entity({ name: 'general_data' })
export class GeneralData extends EntityBase {
  @ApiProperty({
    description: 'Category ID',
    type: Number,
  })
  @IsNumber()
  @Column({ name: 'id_category' })
  idCategory: number

  @ApiProperty({
    description: 'User ID',
    type: Number,
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'int', unsigned: true, nullable: true, name: 'id_user' })
  idUser?: number

  @ApiProperty({
    description: 'Description',
    type: String,
    example: 'General data description',
  })
  @IsString()
  @Column({ name: 'description', length: 45, nullable: false })
  description: string

  @ApiProperty({
    description: 'Additional data',
    type: String,
    required: false,
  })
  @IsString()
  @IsOptional()
  @Column({ name: 'additional_data', length: 1000, nullable: true })
  additionalData?: string

  @ApiProperty({
    description: 'Date from',
    type: Date,
    required: false,
  })
  @IsDateString()
  @IsOptional()
  @Column({
    name: 'date_from',
    type: 'datetime',
    nullable: true,
  })
  dateFrom?: Date

  @ApiProperty({
    description: 'Date to',
    type: Date,
    required: false,
  })
  @IsDateString()
  @IsOptional()
  @Column({
    name: 'date_to',
    type: 'datetime',
    nullable: true,
  })
  dateTo?: Date

  @ApiProperty({
    description: 'Order by',
    type: Number,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Column({ name: 'order_by', type: 'mediumint', nullable: true })
  orderBy?: number

  // Relations
  @ManyToOne(() => ParametricDataCategory)
  @JoinColumn({ name: 'id_category' })
  category?: ParametricDataCategory

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'id_user' })
  user?: User
}
