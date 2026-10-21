import { Module } from '@nestjs/common'

import { CarVinRecheckSourceRepository } from './car-vin-recheck-source.repository'
import { CarVinRecheckJob } from './car-vin-recheck.job'
import { VinRecheckPhpClient } from './vin-recheck-php-client'

/** El job `car-vin-recheck` y sus piezas. Lo registra `JobsModule`. Sin base de jobs: no escribe nada. */
@Module({
  providers: [CarVinRecheckJob, CarVinRecheckSourceRepository, VinRecheckPhpClient],
  exports: [CarVinRecheckJob],
})
export class CarVinRecheckModule {}
