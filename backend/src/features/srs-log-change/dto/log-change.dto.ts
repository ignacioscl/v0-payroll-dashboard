/** Filtro del feature (lo que pide BaseRepository.fetch). Sin HTTP propio. */
export class LogChangeQueryDto {
  id?: number
  idExpRepetitive?: number
  page?: number
  pageSize?: number
}
