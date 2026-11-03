/** Filtro del feature (lo que pide BaseRepository.fetch). Sin HTTP propio. */
export class LogGenericQueryDto {
  id?: number
  idExpense?: number
  idExpGroup?: number
  tipo?: number
  page?: number
  pageSize?: number
}
