import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, MaxLength, IsNumber, IsOptional } from 'class-validator'
import { ParametricData } from 'src/features/parametric-data/entity/parametric-data.entity'
import { EntityBase } from 'src/commons/entity/entity-base'

@Entity({ name: 'permission_action' })
@Index(['codePage'])
export class PermissionAction extends EntityBase {
  @ApiProperty({ description: 'ID único de la acción de permiso', example: 1 })
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number

  @ApiProperty({ description: 'Código de la página', example: 'USR001', maxLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  @Column({ name: 'code_page', length: 8 })
  codePage: string

  @ApiProperty({ description: 'Descripción en español', example: 'Crear usuario', maxLength: 45 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(45)
  @Column({ name: 'description_sp', length: 45 })
  descriptionSp: string

  @ApiProperty({ description: 'Descripción en inglés', example: 'Create user', maxLength: 45 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(45)
  @Column({ name: 'description_en', length: 45 })
  descriptionEn: string

  @ApiProperty({ description: 'Orden de visualización', example: 1 })
  @IsNumber()
  @Column({ name: 'order_by', type: 'smallint' })
  orderBy: number

  // Relación con ParametricData
  @ApiProperty({ description: 'Datos paramétricos relacionados', required: false, type: () => ParametricData })
  @IsOptional()
  @ManyToOne(() => ParametricData, { nullable: true })
  @JoinColumn({ name: 'code_page', referencedColumnName: 'internalCode' })
  parametricData?: ParametricData
}
