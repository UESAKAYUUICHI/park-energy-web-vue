import { request, toQuery } from './http'
import type { RecordRow } from '@/types/domain'

export type EfficiencyPageKind = 'three-phase-monitor' | 'power-efficiency-analysis' | 'energy-consume-statistics' | 'data-model-predict'

export interface EfficiencyRequest {
  deviceId: string
  startDate: string
  endDate: string
}

export interface EfficiencyDeviceOption extends RecordRow {
  id: string
  device_name: string
  device_sn: string
  org_name?: string
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
  gaugeValue: number
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

const useMock = import.meta.env.VITE_EFFICIENCY_USE_MOCK !== '0'
const mockDelay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T

const deviceOptions: EfficiencyDeviceOption[] = [
  { id: '101', device_name: '一号配电房总表', device_sn: 'EE-101', org_name: 'A区园区', gateway_name: 'GW-A01' },
  { id: '102', device_name: '制冷机组总表', device_sn: 'EE-102', org_name: 'A区园区', gateway_name: 'GW-A02' },
  { id: '103', device_name: '办公楼配电柜', device_sn: 'EE-103', org_name: 'B区园区', gateway_name: 'GW-B01' },
]

const phaseTimes = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
const powerTimes = ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
const consumeTimes = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const forecastTimes = ['+1h', '+2h', '+3h', '+4h', '+5h', '+6h', '+7h', '+8h', '+9h', '+10h', '+11h', '+12h']
const consumeValues = [2180, 2340, 2285, 2460, 2610, 2238, 2084]
const heatmapBaseValues = [32, 40, 58, 71, 89, 64]


const mockThreePhase = (filters: EfficiencyRequest, timeGranularity: '10m' | '1h' | '24h'): ThreePhaseMonitorData => ({
  title: '三相工况实时监测',
  deviceName: filters.deviceId ? `设备 ${filters.deviceId}` : '全部授权设备',
  metrics: [
    { label: 'A相电压', value: 229.8, unit: 'V', status: 'normal', hint: '稳定' },
    { label: 'B相电压', value: 224.1, unit: 'V', status: 'warn', hint: '轻微偏低' },
    { label: 'C相电压', value: 231.2, unit: 'V', status: 'normal', hint: '稳定' },
    { label: 'A相电流', value: 1.32, unit: 'A', status: 'normal', hint: '负载平稳' },
    { label: 'B相电流', value: 1.44, unit: 'A', status: 'warn', hint: '不平衡上升' },
    { label: 'C相电流', value: 1.25, unit: 'A', status: 'normal', hint: '稳定' },
    { label: '电网频率', value: 50.04, unit: 'Hz', status: 'normal', hint: '允许区间' },
    { label: '电压不平衡度', value: 1.8, unit: '%', status: 'normal', hint: '合格' },
    { label: '电流不平衡度', value: 7.4, unit: '%', status: 'warn', hint: '关注 B 相' },
  ],
  phaseSummary: [
    { phase: 'A相', voltage: 229.8, current: 1.32, status: '正常' },
    { phase: 'B相', voltage: 224.1, current: 1.44, status: '预警' },
    { phase: 'C相', voltage: 231.2, current: 1.25, status: '正常' },
  ],
  voltageSeries: phaseTimes.map((time, index) => ({
    time,
    A: [228.8, 228.7, 229.1, 229.6, 230.2, 230.1, 229.8, 229.2, 228.9, 228.8, 229.0, 229.3][index],
    B: [225.5, 225.1, 224.8, 224.2, 223.8, 224.0, 224.1, 224.3, 224.4, 224.2, 224.0, 223.9][index],
    C: [230.8, 231.0, 231.2, 231.4, 231.5, 231.4, 231.2, 231.1, 231.0, 230.9, 231.1, 231.2][index],
    anomaly: ['06:00', '14:00'].includes(time),
  })),
  currentSeries: phaseTimes.map((time, index) => ({
    time,
    A: [1.05, 1.08, 1.12, 1.15, 1.18, 1.21, 1.24, 1.28, 1.30, 1.26, 1.20, 1.16][index],
    B: [1.12, 1.15, 1.19, 1.24, 1.31, 1.36, 1.44, 1.48, 1.45, 1.40, 1.33, 1.29][index],
    C: [1.01, 1.03, 1.05, 1.08, 1.11, 1.14, 1.18, 1.22, 1.21, 1.19, 1.16, 1.14][index],
    anomaly: ['10:00', '18:00'].includes(time),
  })),
  frequencySeries: phaseTimes.map((time, index) => ({
    time,
    frequency: [50.02, 50.01, 50.03, 50.04, 50.02, 50.05, 50.04, 50.03, 50.01, 50.02, 50.04, 50.03][index],
  })),
  events: [
    { level: 'warn', title: 'B相电流负载偏高', detail: '当前 1.44A，电流不平衡度超出阈值', time: '16:02' },
    { level: 'normal', title: '电网频率稳定', detail: '50.04Hz，处于允许区间', time: '16:01' },
    { level: 'info', title: '电压三相偏差合格', detail: 'A/B/C 三相电压差值可控', time: '15:58' },
    { level: 'warn', title: '14:00 出现短时波动', detail: '建议联动查看预测页风险推演', time: '14:00' },
    { level: 'normal', title: '采集链路正常', detail: `粒度 ${timeGranularity} · 最近刷新成功`, time: '16:00' },
  ],
  timeGranularity,
})

const mockAnalysis = (filters: EfficiencyRequest): PowerEfficiencyAnalysisData => ({
  title: '功率与能效分析',
  deviceName: filters.deviceId ? `设备 ${filters.deviceId}` : '全部授权设备',
  metrics: [
    { label: '总有功功率', value: 28.6, unit: 'kW', status: 'normal', hint: '当前实时值' },
    { label: '总无功功率', value: 6.8, unit: 'kvar', status: 'warn', hint: '补偿压力上升' },
    { label: '总视在功率', value: 29.4, unit: 'kVA', status: 'normal', hint: '综合负载' },
    { label: '总功率因数', value: 0.946, unit: '', status: 'success', hint: '满足企业考核' },
    { label: '瞬时负载率', value: 72.5, unit: '%', status: 'normal', hint: '中等负载' },
  ],
  gaugeValue: 0.946,
  powerSeries: powerTimes.map((time, index) => ({
    time,
    active: [22.1, 21.6, 21.2, 20.8, 20.4, 21.0, 24.8, 27.1, 28.3, 29.6, 31.1, 28.6][index],
    reactive: [4.2, 4.1, 4.0, 3.9, 3.8, 4.1, 5.2, 5.9, 6.5, 6.7, 6.9, 6.8][index],
    apparent: [22.5, 22.0, 21.6, 21.2, 20.9, 21.4, 25.4, 27.7, 29.0, 30.3, 31.8, 29.4][index],
  })),
  composition: [
    { name: '有功功率', value: 76.5 },
    { name: '无功功率', value: 17.8 },
    { name: '损耗占比', value: 5.7 },
  ],
  loadSeries: powerTimes.map((time, index) => ({
    time,
    rate: [48, 46, 45, 44, 43, 49, 61, 68, 72, 75, 79, 73][index],
  })),
  events: [
    { level: 'normal', title: '功率因数 0.946', detail: '满足企业供电考核标准', time: '16:01' },
    { level: 'warn', title: '无功占比升高', detail: '建议检查无功补偿装置投入状态', time: '15:58' },
    { level: 'info', title: '负载处于中高位', detail: '上午与午后负载叠加明显', time: '15:40' },
    { level: 'normal', title: '线路损耗可控', detail: '当前功率结构稳定', time: '15:12' },
  ],
  advice: [
    '当前功率因数满足常规考核，但午后无功比例抬升，建议联动补偿装置投切策略。',
    '若连续两个统计周期无功功率高于 6 kvar，线路损耗会出现可见抬升。',
    '负载率 72% 处于可控区间，适合观察峰值时段波动而不是立即调度。',
  ],
})

const mockStatistics = (filters: EfficiencyRequest): EnergyConsumeStatisticsData => ({
  title: '能耗统计分析',
  deviceName: filters.deviceId ? `设备 ${filters.deviceId}` : '全部授权设备',
  metrics: [
    { label: '累计正向总有功电能', value: 18326.4, unit: 'kWh', status: 'normal', hint: '当前累计值' },
    { label: '当日能耗', value: 624.8, unit: 'kWh', status: 'normal', hint: '截至当前时刻' },
    { label: '本周能耗', value: 3896.2, unit: 'kWh', status: 'normal', hint: '周累计' },
    { label: '本月能耗', value: 15982.6, unit: 'kWh', status: 'normal', hint: '月累计' },
    { label: '环比变化率', value: 8.2, unit: '%', status: 'warn', hint: '较昨日上升' },
  ],
  cumulativeSeries: consumeTimes.map((label, index) => ({
    time: label,
    value: (consumeValues[index] ?? 0),
  })),
  intervalSeries: [
    { slot: '08:00', value: 48, peak: false },
    { slot: '10:00', value: 66, peak: false },
    { slot: '12:00', value: 72, peak: true },
    { slot: '14:00', value: 84, peak: true },
    { slot: '16:00', value: 89, peak: true },
    { slot: '18:00', value: 64, peak: false },
    { slot: '20:00', value: 52, peak: false },
  ],
  heatmapSeries: Array.from({ length: 7 }, (_, day) => Array.from({ length: 6 }, (_, slot) => ({
    day: consumeTimes[day],
    slot: `${(8 + slot * 2).toString().padStart(2, '0')}:00`,
    value: (heatmapBaseValues[slot] ?? 0) + day * 3,
  }))).flat(),
  events: [
    { level: 'info', title: '今日能耗环比昨日上升 8.2%', detail: '波动集中在 14-17 时', time: '16:00' },
    { level: 'info', title: '识别每日 14-17 时为高峰时段', detail: '适合做节能策略联动', time: '15:55' },
    { level: 'normal', title: '周能耗结构平稳', detail: '周内峰值分布均匀', time: '15:22' },
    { level: 'warn', title: '午后斜率上升', detail: '累计面积图斜率抬升明显', time: '14:32' },
  ],
  insights: [
    '日能耗曲线在 10 点后斜率上升，建议结合班次与设备启停做排查。',
    '14-17 时为系统用电高峰段，若要做峰值压制，优先在此窗口联动。',
    '月累计增长主要来自工作日下午负载叠加，而不是夜间基载抬升。',
  ],
})

const mockPredict = (filters: EfficiencyRequest, forecastWindow: '24h' | '7d', riskMode: 'standard' | 'high-risk', loadPerturbation: number): DataModelPredictData => ({
  title: '数据分析-模型预测分析',
  deviceName: filters.deviceId ? `设备 ${filters.deviceId}` : '仿真演示域',
  metrics: [
    { label: '模型版本', value: 'LSTM 负荷预测模型 V1.0', unit: '', status: 'normal', hint: '仿真演示' },
    { label: '预测周期', value: forecastWindow === '24h' ? '未来 24h' : '未来 7 天', unit: '', status: 'normal', hint: '模拟切换' },
    { label: '扰动系数', value: loadPerturbation.toFixed(1), unit: '', status: loadPerturbation > 1.2 ? 'warn' : 'normal', hint: '仅模拟参数' },
    { label: '风险模式', value: riskMode === 'high-risk' ? '高风险模拟' : '标准模式', unit: '', status: riskMode === 'high-risk' ? 'warn' : 'success', hint: '仅演示' },
  ],
  version: 'LSTM 负荷预测模型 V1.0',
  historySeries: forecastTimes.map((time, index) => ({
    time,
    actual: [52, 50, 49, 48, 47, 48, 52, 56, 60, 58, 55, 54][index] ?? 0,
    predict: [null, null, null, null, null, null, 53, 57, 61, 63, 64, 65][index] ?? null,
    low: [null, null, null, null, null, null, 49, 53, 56, 57, 58, 59][index] ?? null,
    high: [null, null, null, null, null, null, 57, 61, 66, 69, 70, 72][index] ?? null,
  })),
  forecastSeries: forecastTimes.map((time, index) => ({
    time,
    value: ([24, 26, 28, 30, 32, 35, 40, 45, 50, 52, 54, 56][index] ?? 0) + (forecastWindow === '7d' ? index : 0),
    peak: [7, 8, 9].includes(index) || [4, 5].includes(index),
  })),
  riskSeries: [
    { risk: '三相不平衡风险', time: '+4h', value: riskMode === 'high-risk' ? 72 : 38 },
    { risk: '功率因数劣化风险', time: '+8h', value: riskMode === 'high-risk' ? 68 : 29 },
    { risk: '设备过载风险', time: '+12h', value: riskMode === 'high-risk' ? 75 : 34 },
    { risk: '三相不平衡风险', time: '+16h', value: riskMode === 'high-risk' ? 58 : 24 },
    { risk: '功率因数劣化风险', time: '+20h', value: riskMode === 'high-risk' ? 62 : 31 },
    { risk: '设备过载风险', time: '+24h', value: riskMode === 'high-risk' ? 70 : 40 },
  ],
  events: [
    { level: riskMode === 'high-risk' ? 'warn' : 'info', title: `未来 ${forecastWindow === '24h' ? '16:00-17:00' : '第 2 天午后'} 负载抬升`, detail: '功率因数存在劣化趋势', time: '仿真预判' },
    { level: riskMode === 'high-risk' ? 'warn' : 'info', title: '推演 B 相负载上升', detail: '三相不平衡风险显著上升', time: '仿真预判' },
    { level: 'normal', title: '夜间时段负荷平稳', detail: '无明显异常风险', time: '仿真预判' },
    { level: 'info', title: '置信区间已展开', detail: `扰动系数 ${loadPerturbation.toFixed(1)} · ${riskMode === 'high-risk' ? '高风险模拟' : '标准模式'}`, time: '仿真预判' },
  ],
  recommendations: [
    '建议在高峰前 30 分钟提前观察三相电流分布，避免峰值叠加。',
    '若进入高风险模拟模式，建议联动查看三相监测页和功率分析页对照。',
    '预测页只展示仿真结果，不接入现场实时测点。',
  ],
  forecastWindow,
  riskMode,
  loadPerturbation,
})

async function loadThreePhase(filters: EfficiencyRequest, timeGranularity: '10m' | '1h' | '24h') {
  if (!useMock) return request<ThreePhaseMonitorData>(`/energy-efficiency/three-phase-monitor${toQuery({ ...filters, timeGranularity } as Record<string, unknown>)}`)
  await mockDelay()
  return mockThreePhase(filters, timeGranularity)
}

async function loadAnalysis(filters: EfficiencyRequest) {
  if (!useMock) return request<PowerEfficiencyAnalysisData>(`/energy-efficiency/power-efficiency-analysis${toQuery(filters as unknown as Record<string, unknown>)}`)
  await mockDelay()
  return mockAnalysis(filters)
}

async function loadStatistics(filters: EfficiencyRequest) {
  if (!useMock) return request<EnergyConsumeStatisticsData>(`/energy-efficiency/energy-consume-statistics${toQuery(filters as unknown as Record<string, unknown>)}`)
  await mockDelay()
  return mockStatistics(filters)
}

async function loadPredict(filters: EfficiencyRequest, forecastWindow: '24h' | '7d', riskMode: 'standard' | 'high-risk', loadPerturbation: number) {
  if (!useMock) return request<DataModelPredictData>(`/energy-efficiency/data-model-predict${toQuery({ ...filters, forecastWindow, riskMode, loadPerturbation } as Record<string, unknown>)}`)
  await mockDelay()
  return mockPredict(filters, forecastWindow, riskMode, loadPerturbation)
}

export async function loadEfficiencyPage(page: EfficiencyPageKind, filters: EfficiencyRequest, options: RecordRow = {}) {
  if (page === 'three-phase-monitor') return loadThreePhase(filters, String(options.timeGranularity || '1h') as '10m' | '1h' | '24h')
  if (page === 'power-efficiency-analysis') return loadAnalysis(filters)
  if (page === 'energy-consume-statistics') return loadStatistics(filters)
  return loadPredict(filters, String(options.forecastWindow || '24h') as '24h' | '7d', String(options.riskMode || 'standard') as 'standard' | 'high-risk', Number(options.loadPerturbation || 1.0))
}
