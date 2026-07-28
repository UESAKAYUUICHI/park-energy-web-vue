import { ApiError, type ApiResponse, type RemoteEnvelope } from '@/types/api'

const baseUrl = import.meta.env.VITE_PLATFORM_BASE_URL || '/api/platform'
const tokenKey = 'park-energy-token'
const tokenNameKey = 'park-energy-token-name'
const tokenPrefixKey = 'park-energy-token-prefix'
const readStored = (key: string) => sessionStorage.getItem(key) || localStorage.getItem(key)
const writeStored = (key: string, value: string) => { sessionStorage.setItem(key, value); localStorage.setItem(key, value) }
const removeStored = (key: string) => { sessionStorage.removeItem(key); localStorage.removeItem(key) }
export const getToken = () => readStored(tokenKey)
export const getTokenName = () => readStored(tokenNameKey) || 'Authorization'
export const getTokenPrefix = () => readStored(tokenPrefixKey) || 'Bearer'
export const setToken = (value: string, name = 'Authorization', prefix = 'Bearer') => { writeStored(tokenKey, value); writeStored(tokenNameKey, name); writeStored(tokenPrefixKey, prefix) }
export const clearToken = () => { removeStored(tokenKey); removeStored(tokenNameKey); removeStored(tokenPrefixKey) }

export function toQuery(params: Record<string, unknown> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  const token = getToken()
  if (token) headers.set(getTokenName(), [getTokenPrefix(), token].filter(Boolean).join(' '))
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers }) }
  catch { throw new ApiError(503, '无法连接 Platform 服务') }
  let body: ApiResponse<T>
  try { body = await response.json() as ApiResponse<T> }
  catch { throw new ApiError(response.status || 503, response.ok ? 'Platform 服务不可用或接口路径配置错误' : 'Platform 服务暂不可用') }
  if (!response.ok || body.code !== 0) throw new ApiError(body.code || response.status || 503, body.message || '请求失败')
  return body.data
}

export function unwrapRemote<T>(payload: T | RemoteEnvelope<T>): T {
  if (payload && typeof payload === 'object' && ('success' in payload || ('data' in payload && 'message' in payload))) {
    const remote = payload as RemoteEnvelope<T>
    if (remote.success === false) throw new ApiError(503, remote.message || '远程数据服务暂不可用')
    return remote.data as T
  }
  return payload as T
}

export const json = (body: unknown) => ({ body: JSON.stringify(body) })
