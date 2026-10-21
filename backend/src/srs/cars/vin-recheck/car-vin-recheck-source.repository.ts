import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'

export interface VinRecheckCandidate {
  idCar: number
  vin: string
  idDealer: number
  fechaIngreso: string
}

/**
 * Candidatos del job `car-vin-recheck`: autos `vinpattern` activos con VIN de 17 cuya alta cae en
 * [desde, hasta] (los dos días incluidos). SQL crudo sobre `SRS_CONNECTION`, solo lectura: en el Nest
 * no hay entity de `CAR` (precedente `payroll-source.repository.ts`). Sin `LIMIT` (D11).
 *
 * Tenant: no filtra por empresa a propósito (plan §3.9): el VIN es catálogo de vehículos y el job
 * recorre todos los dealers.
 */
@Injectable()
export class CarVinRecheckSourceRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async listCandidates(desde: string, hasta: string): Promise<VinRecheckCandidate[]> {
    const rows = await this.srs.query(
      `SELECT c.id AS idCar, c.vin, c.id_dealer AS idDealer,
              DATE_FORMAT(c.fecha_ingreso, '%Y-%m-%d') AS fechaIngreso
       FROM CAR c
       WHERE c.type_api = 'vinpattern'
         AND c.estado = 1
         AND LENGTH(c.vin) = 17
         AND DATE(c.fecha_ingreso) BETWEEN ? AND ?
       ORDER BY c.fecha_ingreso, c.id`,
      [desde, hasta],
    )
    return rows.map((r: any) => ({
      idCar: Number(r.idCar),
      vin: String(r.vin),
      idDealer: Number(r.idDealer),
      fechaIngreso: String(r.fechaIngreso),
    }))
  }
}
