import { json, request } from './http'
import type { SessionPayload } from '@/types/domain'
export const login = (username: string, password: string) => request<SessionPayload>('/auth/login', { method: 'POST', ...json({ username, password }) })
export const currentUser = () => request<SessionPayload>('/auth/me')
export const logout = () => request<void>('/auth/logout', { method: 'POST' })
