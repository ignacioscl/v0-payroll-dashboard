import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** Legacy SRS: ROL_ACCION. */
@Entity({ name: 'ROL_ACCION', synchronize: false })
export class RolAccion extends SrsEntityBase {
  @ApiProperty()
  @PrimaryGeneratedColumn({ name: 'id' })
  @IsInt()
  id!: number

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Column({ name: 'nombre_accion', type: 'varchar', length: 64 })
  nombreAccion!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Column({ name: 'description', type: 'varchar', length: 2048, nullable: true })
  description?: string | null

  /** Comma-separated ROL_ACCION ids that cannot coexist with this permission. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Column({ name: 'ids_action_constraints', type: 'varchar', length: 255, nullable: true })
  idsActionConstraints?: string | null

  /** 1=interno, 2=externo, null/0=ambos */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'tipo', type: 'tinyint', nullable: true })
  tipo?: number | null

  @ApiProperty()
  @IsInt()
  @Column({ name: 'posicion', type: 'smallint' })
  posicion!: number

  /** 1=visible when the company has the SRS main system enabled. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'is_app_main', type: 'tinyint', nullable: true })
  isAppMain?: number | null

  /** 1=visible when the company has the Valet app enabled. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'is_app_valet', type: 'tinyint', nullable: true })
  isAppValet?: number | null

  /** 1=visible when the company has the TV module enabled. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'is_app_tv', type: 'tinyint', nullable: true })
  isAppTv?: number | null

  /** 0=restricted per ROL_ACCION_COMPANY, 1=visible to all companies unless explicitly excluded. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'is_all_companies', type: 'tinyint', nullable: true })
  isAllCompanies?: number | null
}
