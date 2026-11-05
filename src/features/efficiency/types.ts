export type EffectVerdict = 'PENDING_DATA' | 'IMPROVED' | 'DETERIORATED' | 'UNCHANGED' | 'NOT_APPLICABLE'
export interface EnergyEffectVerification {
  id?: number
  work_order_id?: number
  verdict: EffectVerdict
  reason?: string
  before_avg_kw?: number | null
  after_avg_kw?: number | null
  delta_kw?: number | null
  estimated_delta_kwh?: number | null
  change_rate?: number | null
  data_complete_rate?: number | null
  before_start?: string
  before_end?: string
  after_start?: string
  after_end?: string
  evidence_json?: string | Record<string, unknown>
  generated_at?: string
}
