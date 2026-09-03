import { ApiError, type ApiResponse, type RemoteEnvelope } from '@/types/api'
import { showAppAlert } from '@/composables/useAppAlert'

const baseUrl = import.meta.env.VITE_PLATFORM_BASE_URL || '/api/platform'
const tokenKey = 'park-energy-token'
const tokenNameKey = 'park-energy-token-name'
const tokenPrefixKey = 'park-energy-token-prefix'
const responseCache = new Map<string, { expires: number; value: unknown }>()
const inFlightGetRequests = new Map<string, Promise<unknown>>()
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

export interface RequestOptions extends RequestInit { silentSuccess?: boolean }

export function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase()
  const cacheKey = method === 'GET' ? path : ''
  const cached = cacheKey ? responseCache.get(cacheKey) : undefined
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value as T)

  // Views often mount together with a route watcher. Share the same read instead
  // of issuing duplicate requests, but preserve explicit caller cancellation.
  if (cacheKey && !init.signal) {
    const pending = inFlightGetRequests.get(cacheKey)
    if (pending) return pending as Promise<T>
    const requestPromise = requestInternal<T>(path, init)
    inFlightGetRequests.set(cacheKey, requestPromise)
    void requestPromise.finally(() => {
      if (inFlightGetRequests.get(cacheKey) === requestPromise) inFlightGetRequests.delete(cacheKey)
    }).catch(() => undefined)
    return requestPromise
  }
  return requestInternal<T>(path, init)
}

async function requestInternal<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { silentSuccess = false, ...fetchInit } = init
  const startedAt = performance.now()
  const method = (fetchInit.method || 'GET').toUpperCase()
  const cacheKey = method === 'GET' ? path : ''
  const cached = cacheKey ? responseCache.get(cacheKey) : undefined
  if (cached && cached.expires > Date.now()) return cached.value as T
  const headers = new Headers(fetchInit.headers)
  headers.set('Accept', 'application/json')
  const token = getToken()
  if (token) headers.set(getTokenName(), [getTokenPrefix(), token].filter(Boolean).join(' '))
  if (fetchInit.body && !headers.has('Content-Type') && !(fetchInit.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(`${baseUrl}${path}`, { ...fetchInit, headers }) }
  catch { reportSlowApi(path, fetchInit, startedAt); if (method !== 'GET') showAppAlert({ type: 'error', title: '操作失败', message: '无法连接 Platform 服务，请稍后重试。' }); throw new ApiError(503, '无法连接 Platform 服务') }
  let body: ApiResponse<T>
  try { body = await response.json() as ApiResponse<T> }
  catch { reportSlowApi(path, fetchInit, startedAt); if (method !== 'GET') showAppAlert({ type: 'error', title: '操作失败', message: '服务返回异常，请稍后重试。' }); throw new ApiError(response.status || 503, response.ok ? 'Platform 服务不可用或接口路径配置错误' : 'Platform 服务暂不可用') }
  reportSlowApi(path, fetchInit, startedAt)
  if (!response.ok || body.code !== 0) { if (method !== 'GET') showAppAlert({ type: 'error', title: '操作失败', message: body.message || '请求失败，请检查输入后重试。' }); throw new ApiError(body.code || response.status || 503, body.message || '请求失败') }
  if (method !== 'GET') clearRequestCache()
  if (method !== 'GET' && path !== '/auth/login' && !silentSuccess) showAppAlert({ type: 'success', title: '操作成功', message: body.message && body.message !== 'success' ? body.message : '本次操作已完成。' })
  if (cacheKey) responseCache.set(cacheKey, { expires: Date.now() + cacheTtl(path), value: body.data })
  return body.data
}

export function clearRequestCache(prefix = '') {
  Array.from(responseCache.keys()).forEach((key) => { if (!prefix || key.startsWith(prefix)) responseCache.delete(key) })
}

function cacheTtl(path: string) {
  if (path.includes('pageNum=') || path.includes('keyword=') || path.includes('status=')) return 0
  if (path.includes('/options')) return 60_000
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
