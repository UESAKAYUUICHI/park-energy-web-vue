import { request } from '@/api/http'
import type { EnergyEffectVerification } from './types'

export const refreshEnergyEffect = (orderId: number | string) =>
  request<EnergyEffectVerification>(`/energy/effects/work-orders/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' })
