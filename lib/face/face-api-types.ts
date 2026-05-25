export type FaceApiResponse<T> = {
  status?: string
  data?: T
  error?: { code?: string; message?: string }
}

export type EmployeePunchPhotoItem = {
  logId: number
  createDate?: string
}

export type EmployeePunchPhotosData = {
  idEmployee: number
  thumbnailUuid?: string | null
  items: EmployeePunchPhotoItem[]
}

export type SetEmployeeThumbnailResult = {
  idEmployee: number
  thumbnailUuid: string
}
