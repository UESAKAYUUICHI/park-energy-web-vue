import { request, toQuery } from './http'
import type { RecordRow } from '@/types/domain'

export type EfficiencyPageKind = 'three-phase-monitor' | 'power-efficiency-analysis' | 'energy-consume-statistics' | 'data-model-predict'

export interface EfficiencyRequest {
  deviceId: string
  orgId: string
  startDate: string
  endDate: string
}

export interface EfficiencyDeviceOption extends RecordRow {
  id: string
  device_name: string
  device_sn: string
  org_name?: string
  org_id?: string | number
  gateway_name?: string
}

export interface ThreePhaseMonitorData extends RecordRow {
  metrics: RecordRow[]
  phaseSummary: RecordRow[]
  voltageSeries: RecordRow[]
  currentSeries: RecordRow[]
  frequencySeries: RecordRow[]
  events: RecordRow[]
  timeGranularity: '10m' | '1h' | '24h'
}

export interface PowerEfficiencyAnalysisData extends RecordRow {
  metrics: RecordRow[]
  gaugeValue: number | null
  powerSeries: RecordRow[]
  composition: RecordRow[]
  loadSeries: RecordRow[]
  events: RecordRow[]
  advice: string[]
}

export interface EnergyConsumeStatisticsData extends RecordRow {
  metrics: RecordRow[]
  cumulativeSeries: RecordRow[]
  intervalSeries: RecordRow[]
  heatmapSeries: RecordRow[]
  events: RecordRow[]
  insights: string[]
}

export interface DataModelPredictData extends RecordRow {
  metrics: RecordRow[]
  version: string
  historySeries: RecordRow[]
  forecastSeries: RecordRow[]
  riskSeries: RecordRow[]
  events: RecordRow[]
  recommendations: string[]
  forecastWindow: '24h' | '7d'
  riskMode: 'standard' | 'high-risk'
  loadPerturbation: number
}

const rows = (value: unknown): RecordRow[] => Array.isArray(value) ? value as RecordRow[] : []
const valueOf = (row: RecordRow, key: string): number | null => {
  const raw = row[key]
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}
const labelOf = (row: RecordRow) => String(row.time || row.stat_period || '')

async function realContext(filters: EfficiencyRequest) {
  const query = toQuery(filters as unknown as Record<string, unknown>)
  const [overview, drilldown] = await Promise.all([
    request<RecordRow>(`/energy/efficiency/overview${query}`),
    request<RecordRow>(`/energy/drilldown${query}`),
  ])
  return { overview, drilldown, hourly: rows(overview.hourlySeries), trend: rows(drilldown.trend) }
}

async function loadThreePhase(filters: EfficiencyRequest, timeGranularity: '10m' | '1h' | '24h'): Promise<ThreePhaseMonitorData> {
  const { overview, hourly } = await realContext(filters)
  const quality = (overview.quality || {}) as RecordRow
  const latest = hourly.at(-1) || {}
  const phaseSummary = ['A', 'B', 'C'].map((phase) => ({ phase: `${phase}相`, voltage: valueOf(latest, `voltage_${phase.toLowerCase()}`), current: valueOf(latest, `current_${phase.toLowerCase()}`), status: '实时统计' }))
  return {
    metrics: [
      { label: '电压合格率', value: quality.voltageQualifiedRate, unit: '%', hint: '统计周期' },
      { label: '三相不平衡度', value: quality.threePhaseImbalance, unit: '%', hint: '小时均值' },
      { label: '数据完整率', value: overview.dataCompleteRate, unit: '%', hint: '真实采集' },
      { label: '最大需量', value: quality.maxDemand, unit: 'kW', hint: '统计周期' },
    ],
    phaseSummary,
    voltageSeries: hourly.map((row) => ({ time: labelOf(row), A: valueOf(row, 'voltage_a'), B: valueOf(row, 'voltage_b'), C: valueOf(row, 'voltage_c') })),
    currentSeries: hourly.map((row) => ({ time: labelOf(row), A: valueOf(row, 'current_a'), B: valueOf(row, 'current_b'), C: valueOf(row, 'current_c') })),
    frequencySeries: hourly.map((row) => ({ time: labelOf(row), frequency: valueOf(row, 'frequency') })),
    events: rows(overview.judgements).map((row) => ({ level: String(row.level || '').toLowerCase(), title: String(row.code || '能效判断'), detail: `当前值 ${row.value ?? '—'}`, time: '统计周期' })),
    timeGranularity,
  }
}

async function loadAnalysis(filters: EfficiencyRequest): Promise<PowerEfficiencyAnalysisData> {
  const { overview, hourly } = await realContext(filters)
  const quality = (overview.quality || {}) as RecordRow
  const latest = hourly.at(-1) || {}
  const active = valueOf(latest, 'active_power')
  const reactive = valueOf(latest, 'reactive_power')
  const apparent = valueOf(latest, 'apparent_power')
  const maxDemand = valueOf(quality, 'maxDemand')
  return {
    metrics: [
      { label: '总有功功率', value: active, unit: 'kW', hint: '最新小时' },
      { label: '总无功功率', value: reactive, unit: 'kvar', hint: '最新小时' },
      { label: '总视在功率', value: apparent, unit: 'kVA', hint: '最新小时' },
      { label: '功率因数', value: quality.powerFactor, unit: '', hint: '统计均值' },
      { label: '最大需量', value: maxDemand, unit: 'kW', hint: '统计周期' },
    ],
    gaugeValue: valueOf(quality, 'powerFactor') ?? valueOf(latest, 'power_factor'),
    powerSeries: hourly.map((row) => ({ time: labelOf(row), active: valueOf(row, 'active_power'), reactive: valueOf(row, 'reactive_power'), apparent: valueOf(row, 'apparent_power') })),
    composition: [{ name: '有功功率 (kW)', value: active }, { name: '无功功率 (kvar)', value: reactive }, { name: '视在功率 (kVA)', value: apparent }].filter(row => row.value !== null),
    loadSeries: hourly.map((row) => ({ time: labelOf(row), rate: maxDemand !== null && maxDemand > 0 && valueOf(row, 'active_power') !== null ? valueOf(row, 'active_power')! * 100 / maxDemand : null })),
    events: rows(overview.judgements),
    advice: [],
  }
}

async function loadStatistics(filters: EfficiencyRequest): Promise<EnergyConsumeStatisticsData> {
  const { overview, drilldown, trend } = await realContext(filters)
  const comparison = (overview.comparison || {}) as RecordRow
  const quality = rows(drilldown.quality)
  return {
    metrics: [
      { label: '周期能耗', value: overview.consumption, unit: 'kWh', hint: '真实日统计' },
      { label: '数据完整率', value: overview.dataCompleteRate, unit: '%', hint: '统计均值' },
      { label: '环比变化率', value: comparison.periodOverPeriodRate, unit: '%', hint: '相邻周期' },
      { label: '设备数量', value: ((drilldown.overview || {}) as RecordRow).deviceCount, unit: '台', hint: '筛选范围' },
    ],
    cumulativeSeries: trend.map((row) => ({ time: labelOf(row), value: valueOf(row, 'usage_value') })),
    intervalSeries: trend.map((row) => ({ time: labelOf(row), value: valueOf(row, 'usage_value') })),
    heatmapSeries: quality.map((row, index) => ({ day: String(row.stat_date || row.device_name || index + 1), slot: String(row.device_name || row.device_id || '设备'), value: valueOf(row, 'avg_complete_rate') })),
    events: rows(overview.judgements),
    insights: [],
  }
}

async function loadPredict(filters: EfficiencyRequest): Promise<DataModelPredictData> {
  if (!filters.deviceId) throw new Error('请选择设备');
  return request<DataModelPredictData>('/energy/forecast' + toQuery({deviceId: filters.deviceId}));
}

export async function loadEfficiencyPage(page: EfficiencyPageKind, filters: EfficiencyRequest, options: RecordRow = {}) {
  if (page === 'three-phase-monitor') return loadThreePhase(filters, String(options.timeGranularity || '1h') as '10m' | '1h' | '24h')
  if (page === 'power-efficiency-analysis') return loadAnalysis(filters)
  if (page === 'energy-consume-statistics') return loadStatistics(filters)
  return loadPredict(filters)
}

export async function loadEfficiencyDevices() {
  const page = await request<{ records: EfficiencyDeviceOption[] }>(`/archive/devices/cards${toQuery({ pageNum: 1, pageSize: 500 })}`)
  return Array.isArray(page.records) ? page.records : []
}
