import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional } from 'class-validator'
import { Column, Entity, PrimaryColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** Minimal `usuarios` for SRS permission checks. PK is id_usuario. */
@Entity({ name: 'usuarios', synchronize: false })
export class UsuarioSrs extends SrsEntityBase {
  @ApiProperty()
  @PrimaryColumn({ name: 'id_usuario', type: 'int' })
  @IsInt()
  idUsuario!: number

  @ApiProperty()
  @IsInt()
  @Column({ name: 'id_rol', type: 'int' })
  idRol!: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'id_rol_system_v2', type: 'int', nullable: true })
  idRolSystemV2?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @Column({ name: 'nombre', type: 'varchar', length: 128, nullable: true })
  nombre?: string | null
}
