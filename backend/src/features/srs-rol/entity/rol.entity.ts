import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'
import { Contratista } from 'src/features/srs-contratista/entity/contratista.entity'

/** Legacy SRS: ROL. PK is `id_rol`. */
@Entity({ name: 'ROL', synchronize: false })
export class Rol extends SrsEntityBase {
  @ApiProperty()
  @PrimaryGeneratedColumn({ name: 'id_rol' })
  @IsInt()
  idRol!: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_department', type: 'int', nullable: true })
  idDepartment?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_dealer', type: 'int', nullable: true })
  idDealer?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_compania', type: 'int', nullable: true })
  idCompania?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_compania_origen', type: 'int', nullable: true })
  idCompaniaOrigen?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_compania_owner', type: 'int', nullable: true })
  idCompaniaOwner?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_template', type: 'int', nullable: true })
  idTemplate?: number | null

  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'tipo', type: 'tinyint' })
  tipo!: number

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Column({ name: 'nombre', type: 'varchar', length: 64 })
  nombre!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'ponderacion', type: 'tinyint', nullable: true })
  ponderacion?: number | null

  @ApiProperty()
  @IsInt()
  @Column({ name: 'estado', type: 'tinyint', default: 1 })
  estado!: number

  @ManyToOne(() => Contratista, { nullable: true })
  @JoinColumn({ name: 'id_dealer' })
  dealer?: Contratista | null
}
