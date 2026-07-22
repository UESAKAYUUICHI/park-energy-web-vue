export interface ApiResponse<T> { code: number; message: string; data: T }
export interface PageResult<T> { records: T[]; total: number; pageNum: number; pageSize: number; pages: number }
export interface RemoteEnvelope<T> { success?: boolean; message?: string; data?: T }
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}
export const isApiSuccess = (response: ApiResponse<unknown>) => response.code === 0
