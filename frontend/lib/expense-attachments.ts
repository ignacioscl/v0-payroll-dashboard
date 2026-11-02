/**
 * Adjuntos de un gasto: el navegador habla con el BFF /api/expense-attachments/{idDealer}/{idExpense}
 * (T4 del plan), que reenvía al Node (`POST/GET /expenses/tickets/...`). Una imagen va como `img`
 * (data URL JPEG reducida a 800×600, como legacy); un PDF como `file` multipart. Máximo 10 MB.
 */

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_IMAGE_MAX_WIDTH = 800
export const ATTACHMENT_IMAGE_MAX_HEIGHT = 600

export type AttachmentKind = 'image' | 'pdf'

export function attachmentKind(file: File): AttachmentKind | null {
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  return null
}

export function attachmentsBaseUrl(idDealer: number, idExpense: number): string {
  return `/api/expense-attachments/${idDealer}/${idExpense}`
}

export function attachmentFileUrl(idDealer: number, idExpense: number, filename: string): string {
  return `${attachmentsBaseUrl(idDealer, idExpense)}/${encodeURIComponent(filename)}`
}

export async function listAttachments(idDealer: number, idExpense: number): Promise<string[]> {
  const res = await fetch(attachmentsBaseUrl(idDealer, idExpense), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load attachments (${res.status})`)
  const body = (await res.json()) as { files?: string[] }
  return body.files ?? []
}

/**
 * La lista con el archivo recién subido. El Node memoiza el listado 10 s (`memoizedlistGSBucketFolder`),
 * así que volver a pedirlo justo después de subir puede devolver la lista sin el archivo.
 */
export function withUploadedFile(files: string[] | undefined, filename: string): string[] {
  const list = files ?? []
  return list.includes(filename) ? list : [...list, filename]
}

/** Reduce la imagen a 800×600 como el `encodeImagetoBase64` legacy y la devuelve como data URL JPEG. */
export function imageToJpegDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read the image'))
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > height) {
          if (width > ATTACHMENT_IMAGE_MAX_WIDTH) {
            height *= ATTACHMENT_IMAGE_MAX_WIDTH / width
            width = ATTACHMENT_IMAGE_MAX_WIDTH
          }
        } else if (height > ATTACHMENT_IMAGE_MAX_HEIGHT) {
          width *= ATTACHMENT_IMAGE_MAX_HEIGHT / height
          height = ATTACHMENT_IMAGE_MAX_HEIGHT
        }
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width))
        canvas.height = Math.max(1, Math.round(height))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not process the image'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.6))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export interface UploadAttachmentResult {
  /** Nombre con el que quedó en el bucket (lo devuelve el Node), si vino. */
  filename: string | null
  /** `false` si el Node subió el archivo pero el registro en el log del gasto (Nest) falló. */
  logged: boolean
}

/**
 * Sube el archivo. Rechaza (throw) solo si la subida falló; si subió pero el BFF no pudo dejar el
 * registro en el log, resuelve con `logged: false` y el que llama avisa sin bloquear.
 */
export async function uploadAttachment(idDealer: number, idExpense: number, file: File): Promise<UploadAttachmentResult> {
  const kind = attachmentKind(file)
  if (!kind) throw new Error('Only images or PDF are allowed.')
  if (file.size > ATTACHMENT_MAX_BYTES) throw new Error('The file is over 10 MB.')
  const url = attachmentsBaseUrl(idDealer, idExpense)
  let res: Response
  if (kind === 'image') {
    const img = await imageToJpegDataUrl(file)
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ img }),
    })
  } else {
    const formData = new FormData()
    formData.append('file', file, file.name)
    res = await fetch(url, { method: 'POST', body: formData })
  }
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  let body: { filename?: unknown; logged?: unknown } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    body = {}
  }
  return {
    filename: typeof body.filename === 'string' ? body.filename : null,
    logged: body.logged !== false,
  }
}
