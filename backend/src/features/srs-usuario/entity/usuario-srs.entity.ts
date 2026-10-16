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

  /** Activo = estado 1 e is_inactive 0 (mismo criterio que UsuarioDao.php del PHP). */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'estado', type: 'tinyint', nullable: true })
  estado?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Column({ name: 'is_inactive', type: 'tinyint', unsigned: true, nullable: true })
  isInactive?: number | null
}
