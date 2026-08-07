import { ApiError, type ApiResponse, type RemoteEnvelope } from '@/types/api'

const baseUrl = import.meta.env.VITE_PLATFORM_BASE_URL || '/api/platform'
const tokenKey = 'park-energy-token'
const tokenNameKey = 'park-energy-token-name'
const tokenPrefixKey = 'park-energy-token-prefix'
const responseCache = new Map<string, { expires: number; value: unknown }>()
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
  const startedAt = performance.now()
  const method = init.method || 'GET'
  const cacheKey = method === 'GET' ? path : ''
  const cached = cacheKey ? responseCache.get(cacheKey) : undefined
  if (cached && cached.expires > Date.now()) return cached.value as T
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  const token = getToken()
  if (token) headers.set(getTokenName(), [getTokenPrefix(), token].filter(Boolean).join(' '))
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers }) }
  catch { reportSlowApi(path, init, startedAt); throw new ApiError(503, '无法连接 Platform 服务') }
  let body: ApiResponse<T>
  try { body = await response.json() as ApiResponse<T> }
  catch { reportSlowApi(path, init, startedAt); throw new ApiError(response.status || 503, response.ok ? 'Platform 服务不可用或接口路径配置错误' : 'Platform 服务暂不可用') }
  reportSlowApi(path, init, startedAt)
  if (!response.ok || body.code !== 0) throw new ApiError(body.code || response.status || 503, body.message || '请求失败')
  if (method !== 'GET') clearRequestCache()
  if (cacheKey) responseCache.set(cacheKey, { expires: Date.now() + cacheTtl(path), value: body.data })
  return body.data
}

export function clearRequestCache(prefix = '') {
  Array.from(responseCache.keys()).forEach((key) => { if (!prefix || key.startsWith(prefix)) responseCache.delete(key) })
}

function cacheTtl(path: string) {
  if (path.includes('pageNum=') || path.includes('keyword=') || path.includes('status=')) return 0
  if (path.includes('/archive/device-tree') || path.includes('/archive/org-tree')) return 60_000
  if (path === '/catalog/tree' || path.startsWith('/catalog/tree?')) return 60_000
  if (path.includes('/archive/orgs') || path.includes('/archive/gateways') || path.includes('/archive/device-types') || path.includes('/archive/devices') || path.includes('/billing/accounts') || path.includes('/billing/rules')) return 60_000
  if (path.includes('/catalog/lookups') || path.includes('/catalog/attribute-tree') || path.includes('/catalog/point-tree') || path.includes('/catalog/published-options')) return 60_000
  if (path.includes('/rbac/permissions') || path.includes('/rbac/org-tree') || path.includes('/archive/root-orgs')) return 60_000
  return 0
}

function reportSlowApi(path: string, init: RequestInit, startedAt: number) {
  const cost = Math.round(performance.now() - startedAt)
  if (import.meta.env.DEV && cost > 800) console.warn(`[slow-api] ${init.method || 'GET'} ${path} ${cost}ms`)
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
