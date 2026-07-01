import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Template } from '../entity/template'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { TemplatePaginationDto, TemplateQueryDto } from '../dto/template'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class TemplateRepository extends BaseRepository<Template, TemplateQueryDto> {
  constructor(@InjectRepository(Template) private readonly _: Repository<Template>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: TemplateQueryDto): Promise<PaginationDto<Template>> {
    return {} as any //dummy
  }
}
