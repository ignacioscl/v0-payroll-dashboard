import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { Column, Entity } from 'typeorm'

import { EntityBase } from 'src/commons/entity/entity-base'

/** ROL_TEMPLATE — EntityBase (created/updated/deleted_at). */
@Entity({ name: 'ROL_TEMPLATE', synchronize: false })
export class RolTemplate extends EntityBase {
  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  @Column({ name: 'id_compania_owner', type: 'int' })
  idCompaniaOwner!: number

  /** 1=interno, 2=externo */
  @ApiProperty({ enum: [1, 2] })
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
}
