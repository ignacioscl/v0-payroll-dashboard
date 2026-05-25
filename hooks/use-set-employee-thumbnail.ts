'use client'

import { useMutation } from '@tanstack/react-query'
import type {
  FaceApiResponse,
  SetEmployeeThumbnailResult,
} from '@/lib/face/face-api-types'
import { faceProxyUrl } from '@/lib/face/face-proxy-url'

type SetThumbnailInput = {
  idEmployee: number
  logFaceId: number
}

async function setEmployeeThumbnail(input: SetThumbnailInput): Promise<SetEmployeeThumbnailResult> {
  const res = await fetch(faceProxyUrl('api/employeeThumbnail'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      idEmployee: input.idEmployee,
      logFaceId: input.logFaceId,
    }),
  })

  const json = (await res.json()) as FaceApiResponse<SetEmployeeThumbnailResult>
  if (!res.ok || json.status === 'fail' || !json.data?.thumbnailUuid) {
    throw new Error(json.error?.message ?? 'Failed to set employee thumbnail')
  }

  return json.data
}

export function useSetEmployeeThumbnail() {
  return useMutation({
    mutationFn: setEmployeeThumbnail,
  })
}
