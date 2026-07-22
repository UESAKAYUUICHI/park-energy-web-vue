import { describe, expect, it } from 'vitest'
import { isApiSuccess } from './api'

describe('isApiSuccess', () => {
  it('only accepts Platform code 0 as success', () => {
    expect(isApiSuccess({ code: 0, message: 'success', data: null })).toBe(true)
    expect(isApiSuccess({ code: 503, message: 'unavailable', data: null })).toBe(false)
  })
})
