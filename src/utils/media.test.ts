import { describe, expect, it } from 'vitest'
import { mediaFileName, normalizeMediaUrl } from './media'

describe('normalizeMediaUrl', () => {
  it('keeps supported remote and application URLs', () => {
    expect(normalizeMediaUrl('https://example.com/device.jpg?sign=1')).toBe('https://example.com/device.jpg?sign=1')
    expect(normalizeMediaUrl('/api/platform/catalog/models/3/image')).toBe('/api/platform/catalog/models/3/image')
  })

  it('rejects unsafe and unresolved object keys', () => {
    expect(normalizeMediaUrl('javascript:alert(1)')).toBe('')
    expect(normalizeMediaUrl('device-models/3/device.jpg')).toBe('')
  })

  it('extracts a readable filename from signed URLs', () => {
    expect(mediaFileName('https://example.com/device%20photo.jpg?sign=1')).toBe('device photo.jpg')
  })
})
