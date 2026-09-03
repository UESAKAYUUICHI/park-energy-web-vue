const SAFE_ABSOLUTE_MEDIA = /^(https?:|blob:|data:image\/)/i

/** Normalizes API media values without allowing executable URL schemes. */
export function normalizeMediaUrl(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!raw || /^javascript:/i.test(raw)) return ''
  if (SAFE_ABSOLUTE_MEDIA.test(raw)) return raw
  if (raw.startsWith('//')) return `${window.location.protocol}${raw}`
  if (raw.startsWith('/')) return raw

  const mediaBase = String(import.meta.env.VITE_MEDIA_BASE_URL || '').trim().replace(/\/$/, '')
  if (mediaBase) return `${mediaBase}/${raw.replace(/^\//, '')}`
  return raw.startsWith('api/') ? `/${raw}` : ''
}

export function mediaFileName(value: unknown): string {
  const raw = String(value ?? '')
  const path = raw.slice(0, raw.indexOf('?') === -1 ? raw.length : raw.indexOf('?'))
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || '图片'
}
