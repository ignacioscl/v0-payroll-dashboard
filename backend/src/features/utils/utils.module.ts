import { Module, forwardRef } from '@nestjs/common'

import { UtilsService } from './service/utils.service'

@Module({
  imports: [],
  providers: [UtilsService],
  exports: [UtilsService],
})
export class UtilsModule {}
