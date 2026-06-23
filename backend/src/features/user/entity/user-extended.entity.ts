import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength, IsNumber } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { User } from './user.entity'
import { ParametricData } from '../../parametric-data/entity/parametric-data.entity'

@Entity('user_extended')
export class UserExtended extends EntityBase {
  @ApiProperty({
    description: 'ID del usuario (relación OneToOne)',
    type: Number,
    required: true,
    example: 1,
  })
  @Column({ type: 'int', unsigned: true, nullable: false })
  @IsNotEmpty()
  id!: number

  @ApiProperty({
    description: 'Dirección de la calle',
    type: String,
    required: false,
    maxLength: 128,
    example: 'Av. Corrientes 1234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Column({ length: 128, nullable: true, name: 'street_address' })
  streetAddress?: string

  @ApiProperty({
    description: 'Número de calle',
    type: String,
    required: false,
    maxLength: 45,
    example: '1234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: true, name: 'street_number' })
  streetNumber?: string

  @ApiProperty({
    description: 'Departamento',
    type: String,
    required: false,
    maxLength: 8,
    example: 'A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Column({ length: 8, nullable: true, name: 'departament' })
  departament?: string

  @ApiProperty({
    description: 'Piso',
    type: Number,
    required: false,
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'tinyint', nullable: true, name: 'floor' })
  floor?: number

  @ApiProperty({
    description: 'Ciudad',
    type: String,
    required: false,
    maxLength: 45,
    example: 'Buenos Aires',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: true })
  city?: string

  @ApiProperty({
    description: 'Estado/Provincia',
    type: String,
    required: false,
    maxLength: 45,
    example: 'Buenos Aires',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: true })
  state?: string

  @ApiProperty({
    description: 'Código postal',
    type: String,
    required: false,
    maxLength: 16,
    example: '1043',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Column({ length: 16, nullable: true })
  cp?: string

  @ApiProperty({
    description: 'País',
    type: String,
    required: false,
    maxLength: 45,
    example: 'Argentina',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: true })
  country?: string

  @ApiProperty({
    description: 'Tipo de documento',
    type: String,
    required: true,
    maxLength: 45,
    example: 'DNI',
  })
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: false, name: 'doc_type' })
  docType!: string

  @ApiProperty({
    description: 'Número de documento',
    type: String,
    required: true,
    maxLength: 45,
    example: '12345678',
  })
  @IsString()
  @IsOptional()
  @MaxLength(45)
  @Column({ length: 45, nullable: false, name: 'document_number' })
  documentNumber!: string

  @ApiProperty({
    description: 'Teléfono',
    type: String,
    required: true,
    maxLength: 45,
    example: '+54 11 1234-5678',
  })
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: false })
  phone!: string

  @ApiProperty({
    description: 'Fecha de nacimiento',
    type: String,
    required: true,
    example: '1990-01-01',
  })
  @IsDateString()
  @IsNotEmpty()
  @Column({ type: 'date', nullable: false, name: 'birth_day' })
  birthDay!: string

  @ApiProperty({
    description: 'Fecha de registro',
    type: String,
    required: true,
    example: '2024-01-01',
  })
  @IsDateString()
  @IsNotEmpty()
  @Column({ type: 'date', nullable: false, name: 'register_date' })
  registerDate!: string

  @ApiProperty({
    description: 'ID de datos paramétricos base',
    type: Number,
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'int', unsigned: true, nullable: true, name: 'id_base' })
  idBase?: number

  @ApiProperty({
    description: 'Número de asociado',
    type: String,
    required: false,
    maxLength: 45,
    example: 'ASOC001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: true, name: 'asoc_number' })
  asocNumber?: string

  @ApiProperty({
    description: 'Número de cuenta',
    type: String,
    required: false,
    maxLength: 45,
    example: 'ACC001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Column({ length: 45, nullable: true, name: 'account_number' })
  accountNumber?: string

  // Relations
  @ManyToOne(() => ParametricData, { nullable: true })
  @JoinColumn({ name: 'id_base' })
  parametricDataBase?: ParametricData

  @OneToOne(() => User, user => user.userExtended)
  @JoinColumn({ name: 'id' })
  user?: User
}
