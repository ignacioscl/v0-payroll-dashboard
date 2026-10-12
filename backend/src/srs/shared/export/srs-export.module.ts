import { Module } from '@nestjs/common'

import { PunchExportSemaphore } from './punch-export-semaphore'
import { PunchExportTicketStore } from './punch-export-ticket.store'

/**
 * Ticket store y semáforo de los exports XLSX. Son UNO para todos (Punch Report, ranking de
 * dealers e invoices): el cupo protege el pool de 5 conexiones de la conexión `srs`, así que
 * dos exports pesados nunca corren a la vez aunque sean de pantallas distintas.
 * plans/plan-export-invoices-nest/PLAN.md §2.1.1.
 */
@Module({
  providers: [PunchExportTicketStore, PunchExportSemaphore],
  exports: [PunchExportTicketStore, PunchExportSemaphore],
})
export class SrsExportModule {}
