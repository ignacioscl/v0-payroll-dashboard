import { CreateDateColumn, DeleteDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional } from 'class-validator'

export class EntityBase {
  @ApiProperty({
    description: 'Id',
    type: Number,
  })
  @PrimaryGeneratedColumn()
  @IsInt()
  @IsOptional()
  id?: number

  @DeleteDateColumn({ select: false, nullable: true })
  deletedAt?: Date

  @ApiProperty({
    description: 'Creation Date',
    type: Date,
  })
  @CreateDateColumn()
  createdAt?: Date

  @ApiProperty({
    description: 'Updated Date',
    type: Date,
  })
  @UpdateDateColumn()
  updatedAt?: Date
}
