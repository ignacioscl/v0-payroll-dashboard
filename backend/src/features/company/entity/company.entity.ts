import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, BeforeInsert, BeforeUpdate, getRepository } from 'typeorm'
import { DataSource } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
//armame class validator y swagger para typeorm
@Entity({ name: 'company' })
export class Company extends EntityBase {
  @ApiProperty({
    description: 'Nombre de la compañía',
    type: String,
    required: true,
    maxLength: 100,
    example: 'SRS Suite',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Column({ length: 100, nullable: false })
  companyName!: string

  @ApiProperty({
    description: 'Id de la compañía padre',
    type: Number,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'int', unsigned: true, nullable: true, name: 'id_parent' })
  idParent?: number

  @ApiProperty({
    description: 'Compañía padre',
    type: () => Company,
    required: false,
  })
  @IsOptional()
  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: 'id_parent' })
  parent?: Company
}
