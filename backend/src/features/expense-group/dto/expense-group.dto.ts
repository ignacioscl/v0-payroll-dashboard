/** Filtro del feature (lo que pide BaseRepository.fetch). Sin HTTP propio: lo usa ExpenseFacadeService. */
export class ExpenseGroupQueryDto {
  id?: number
  idDetailer?: number
  page?: number
  pageSize?: number
}
