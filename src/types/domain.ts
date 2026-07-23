export type RecordRow = Record<string, unknown>
export interface SessionPayload {
  tokenName: string; tokenValue: string; tokenPrefix?: string; user: RecordRow; roles: string[]; permissions: string[]; orgScopes: RecordRow[]; menus: RecordRow[]
}
export type StatusDomain = 'bill' | 'command' | 'alarm' | 'online' | 'parse'
export interface PageMeta { title: string; permission?: string; group?: string; kind: string; resource?: string }
