/**
 * Tipo de imagen por su contenido, no por lo que declara el navegador (plans/plan-buenas-practicas-v0, 3.6). En Nest 10
 * `FileTypeValidator` solo mira el mimetype declarado. Devuelve la extensión, o null si no es PNG, JPEG ni WEBP.
 */
export type ImageKind = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: '.png' | '.jpg' | '.webp' }

export function detectImage(buf: Buffer | Uint8Array): ImageKind | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: '.png' }
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: '.webp' }
  }
  return null
}
