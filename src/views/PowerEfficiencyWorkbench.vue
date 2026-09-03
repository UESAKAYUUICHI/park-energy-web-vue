<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import AppLoadingState from '@/components/app/AppLoadingState.vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useDebouncedTask } from '@/composables/useDebouncedTask'
import type { RecordRow } from '@/types/domain'
import { loadEfficiencyPage, type DataModelPredictData, type EfficiencyDeviceOption, type EfficiencyPageKind, type EnergyConsumeStatisticsData, type PowerEfficiencyAnalysisData, type ThreePhaseMonitorData } from '@/api/energyEfficiency'
import { loadEfficiencyChartRuntime, type EfficiencyChartRuntime } from '@/utils/chartRuntime'

const props = defineProps<{ page: EfficiencyPageKind }>()
const emit = defineEmits<{ 'update:context': [value: { deviceId: string; startDate: string; endDate: string }], 'switch-page': [value: EfficiencyPageKind] }>()

const deviceId = ref('101')
const startDate = ref(daysAgo(29))
const endDate = ref(today())
const loading = ref(false)
const error = useAlertRef('数据解析错误')
const devices = ref<EfficiencyDeviceOption[]>([])
const charts = new Map<string, ECharts>()
let chartRuntime: EfficiencyChartRuntime | null = null
const chartElements = ref<Record<string, HTMLElement | null>>({})
const pageData = ref<ThreePhaseMonitorData | PowerEfficiencyAnalysisData | EnergyConsumeStatisticsData | DataModelPredictData>(createEmptyPageData(props.page))
const timeGranularity = ref<'10m' | '1h' | '24h'>('1h')
const forecastWindow = ref<'24h' | '7d'>('24h')
const riskMode = ref<'standard' | 'high-risk'>('standard')
const loadPerturbation = ref(1.0)
const latestRequest = ref(0)
const { schedule: scheduleLoad, cancel: cancelScheduledLoad } = useDebouncedTask(300)

function today() { return new Date().toISOString().slice(0, 10) }
function daysAgo(days: number) { const date = new Date(); date.setDate(date.getDate() - days); return date.toISOString().slice(0, 10) }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function display(value: unknown, digits = 2) { return number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits }) }
function rowsOf(value: unknown): RecordRow[] { return Array.isArray(value) ? value as RecordRow[] : [] }
function setChartElement(key: string, element: HTMLElement | null) { chartElements.value[key] = element }

function createEmptyThreePhaseData(): ThreePhaseMonitorData {
  return {
    metrics: [],
    phaseSummary: [],
    voltageSeries: [],
    currentSeries: [],
    frequencySeries: [],
    events: [],
    timeGranularity: '1h',
  }
}

function createEmptyAnalysisData(): PowerEfficiencyAnalysisData {
  return {
    metrics: [],
    gaugeValue: 0,
    powerSeries: [],
    composition: [],
    loadSeries: [],
    events: [],
    advice: [],
  }
}

function createEmptyStatisticsData(): EnergyConsumeStatisticsData {
  return {
    metrics: [],
    cumulativeSeries: [],
    intervalSeries: [],
    heatmapSeries: [],
    events: [],
    insights: [],
  }
}

function createEmptyPredictData(): DataModelPredictData {
  return {
    metrics: [],
    version: '',
    historySeries: [],
    forecastSeries: [],
    riskSeries: [],
    events: [],
    recommendations: [],
    forecastWindow: '24h',
    riskMode: 'standard',
    loadPerturbation: 1,
  }
}

function createEmptyPageData(page: EfficiencyPageKind): ThreePhaseMonitorData | PowerEfficiencyAnalysisData | EnergyConsumeStatisticsData | DataModelPredictData {
  if (page === 'three-phase-monitor') return createEmptyThreePhaseData()
  if (page === 'power-efficiency-analysis') return createEmptyAnalysisData()
  if (page === 'energy-consume-statistics') return createEmptyStatisticsData()
  return createEmptyPredictData()
}

const selectedDevice = computed(() => devices.value.find((item) => String(item.id) === deviceId.value))
const contextHint = computed(() => selectedDevice.value ? `${selectedDevice.value.device_name} · ${selectedDevice.value.device_sn}` : '全部授权设备')
const pageTitle = computed(() => props.page === 'three-phase-monitor' ? '三相工况实时监测' : props.page === 'power-efficiency-analysis' ? '功率与能效分析' : props.page === 'energy-consume-statistics' ? '能耗统计分析' : '数据分析-模型预测分析')
const pageSubTitle = computed(() => props.page === 'three-phase-monitor' ? '三相平衡、电压电流越限、电网频率质量' : props.page === 'power-efficiency-analysis' ? '功率因数、无功损耗、负载率' : props.page === 'energy-consume-statistics' ? '日周月能耗、峰谷波动、累计趋势' : '模型仿真预测与风险推演')
const periodLabel = computed(() => props.page === 'three-phase-monitor' ? '监测时段' : props.page === 'power-efficiency-analysis' ? '分析时段' : props.page === 'energy-consume-statistics' ? '统计区间' : '预测基准区间')
const periodHint = computed(() => '')

const normalizedData = computed(() => pageData.value)
const metrics = computed(() => rowsOf(normalizedData.value.metrics))
const events = computed(() => rowsOf(normalizedData.value.events))
const isThreePhase = computed(() => props.page === 'three-phase-monitor')
const isAnalysis = computed(() => props.page === 'power-efficiency-analysis')
const isStatistics = computed(() => props.page === 'energy-consume-statistics')
const isPredict = computed(() => props.page === 'data-model-predict')

const threePhase = computed(() => normalizedData.value as ThreePhaseMonitorData)
const analysis = computed(() => normalizedData.value as PowerEfficiencyAnalysisData)
const statistics = computed(() => normalizedData.value as EnergyConsumeStatisticsData)
const predict = computed(() => normalizedData.value as DataModelPredictData)

const threePhasePhaseSummary = computed(() => rowsOf(threePhase.value.phaseSummary))
const threePhaseVoltageSeries = computed(() => rowsOf(threePhase.value.voltageSeries))
const threePhaseCurrentSeries = computed(() => rowsOf(threePhase.value.currentSeries))
const threePhaseFrequencySeries = computed(() => rowsOf(threePhase.value.frequencySeries))
const analysisPowerSeries = computed(() => rowsOf(analysis.value.powerSeries))
const analysisComposition = computed(() => rowsOf(analysis.value.composition))
const analysisLoadSeries = computed(() => rowsOf(analysis.value.loadSeries))
const statisticsCumulativeSeries = computed(() => rowsOf(statistics.value.cumulativeSeries))
const statisticsIntervalSeries = computed(() => rowsOf(statistics.value.intervalSeries))
const statisticsHeatmapSeries = computed(() => rowsOf(statistics.value.heatmapSeries))
const predictHistorySeries = computed(() => rowsOf(predict.value.historySeries))
const predictForecastSeries = computed(() => rowsOf(predict.value.forecastSeries))
const predictRiskSeries = computed(() => rowsOf(predict.value.riskSeries))

function metricClass(status?: string) { return `is-${String(status || 'normal').toLowerCase()}` }
function eventClass(level?: string) { return `is-${String(level || 'info').toLowerCase()}` }

function optionLineSeries(series: Array<RecordRow & { time: string }>, keys: string[], area = false, markPoint = false): EChartsCoreOption {
  const times = [...new Set(series.map((item) => item.time))]
  return {
    color: ['#2364c8', '#18a8a8', '#f0a646', '#e06459', '#6d5dfc'],
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 6, textStyle: { color: '#61728a', fontSize: 11 } },
    grid: { left: 44, right: 16, top: 38, bottom: 36 },
    dataZoom: [{ type: 'inside' }],
    xAxis: { type: 'category', data: times, boundaryGap: false, axisLabel: { color: '#718096', fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecf1f7' } }, axisLabel: { color: '#718096' } },
    series: keys.map((key) => ({
      name: key,
      type: 'line',
      smooth: true,
      showSymbol: true,
      symbolSize: 6,
      areaStyle: area ? { opacity: .10 } : undefined,
      markPoint: markPoint ? { data: series.filter((item) => item.anomaly).map((item) => ({ name: '异常', coord: [item.time, Number(item[key] || 0)] })) } : undefined,
      data: times.map((time) => series.find((item) => item.time === time)?.[key] ?? null),
    })),
  }
}

function optionPhaseCompare(): EChartsCoreOption {
  const rows = threePhasePhaseSummary.value
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#61728a', fontSize: 11 } },
    grid: { left: 44, right: 24, top: 38, bottom: 34 },
    xAxis: { type: 'category', data: rows.map((item) => item.phase), axisLabel: { color: '#718096' } },
    yAxis: [{ type: 'value', name: '电压(V)', axisLabel: { color: '#718096' }, splitLine: { lineStyle: { color: '#ecf1f7' } } }, { type: 'value', name: '电流(A)', axisLabel: { color: '#718096' }, splitLine: { show: false } }],
    series: [
      { type: 'bar', name: '电压', barWidth: 18, yAxisIndex: 0, itemStyle: { color: '#2364c8', borderRadius: [6, 6, 0, 0] }, data: rows.map((item) => Number(item.voltage || 0)) },
      { type: 'line', name: '电流', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 8, lineStyle: { color: '#f0a646', width: 2 }, itemStyle: { color: '#f0a646' }, data: rows.map((item) => Number(item.current || 0)) },
    ],
  }
}

function optionGauge(value: number): EChartsCoreOption {
  return {
    series: [{
      type: 'gauge',
      min: 0,
      max: 1,
      startAngle: 210,
      endAngle: -30,
      progress: { show: true, width: 12, itemStyle: { color: value >= .9 ? '#21a179' : value >= .8 ? '#e29b43' : '#d66457' } },
      axisLine: { lineStyle: { width: 12, color: [[.8, '#dce8f6'], [.9, '#ffe7bb'], [1, '#ffd0cb']] } },
      pointer: { show: true, length: '55%', width: 5, itemStyle: { color: '#24466f' } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: '#8a9ab0', fontSize: 9 },
      detail: { valueAnimation: true, formatter: '{value|{value}}', rich: { value: { fontSize: 24, fontWeight: 700, color: '#24466f' } }, offsetCenter: [0, '30%'] },
      data: [{ value }],
    }],
  }
}

function optionStackedArea(series: Array<RecordRow & { time: string }>, keys: string[], colors: string[]): EChartsCoreOption {
  const times = [...new Set(series.map((item) => item.time))]
  return {
    color: colors,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 8, textStyle: { color: '#61728a', fontSize: 11 } },
    grid: { left: 42, right: 16, top: 38, bottom: 36 },
    dataZoom: [{ type: 'inside' }],
    xAxis: { type: 'category', data: times, boundaryGap: false, axisLabel: { color: '#718096', fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecf1f7' } }, axisLabel: { color: '#718096' } },
    series: keys.map((key) => ({ name: key, type: 'line', smooth: true, showSymbol: false, stack: 'total', areaStyle: { opacity: .16 }, lineStyle: { width: 2 }, data: times.map((time) => series.find((item) => item.time === time)?.[key] ?? null) })),
  }
}

function optionPie(data: Array<{ name: string; value: number }>, colors: string[]): EChartsCoreOption {
  return {
    color: colors,
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, type: 'scroll', textStyle: { color: '#61728a', fontSize: 10 } },
    series: [{ type: 'pie', radius: ['42%', '70%'], center: ['50%', '44%'], label: { fontSize: 10 }, data }],
  }
}

function optionHeatmap(data: Array<{ day: string; slot: string; value: number }>) {
  const days = [...new Set(data.map((item) => item.day))]
  const slots = [...new Set(data.map((item) => item.slot))]
  const values = data.map((item) => [slots.indexOf(item.slot), days.indexOf(item.day), item.value]) as Array<[number, number, number]>
  return {
    tooltip: { position: 'top', formatter: (params: any) => { const value = params.value as number[]; return `${days[value[1] ?? -1] || '—'}<br/>${slots[value[0] ?? -1] || '—'}<br/>完整率 ${display(value[2])}%` } },
    grid: { left: 80, right: 18, top: 20, bottom: 42 },
    xAxis: { type: 'category', data: slots, axisLabel: { fontSize: 9, color: '#718096' } },
    yAxis: { type: 'category', data: days, axisLabel: { fontSize: 10, color: '#718096' } },
    visualMap: { min: 0, max: 100, orient: 'horizontal', left: 'center', bottom: 0, text: ['完整', '缺失'], inRange: { color: ['#f4a38c', '#fee9a9', '#76c7a8'] }, textStyle: { color: '#718096', fontSize: 10 } },
    series: [{ type: 'heatmap', data: values, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.2)' } } }],
  }
}

function optionScatter(data: Array<{ name: string; complete: number; gap: number }>) {
  return {
    tooltip: { formatter: (params: any) => { const value = params.value as Array<number | string>; return `${value[2] || '—'}<br/>完整率 ${display(value[0])}%<br/>断采 ${display(value[1])} 秒` } },
    grid: { left: 44, right: 18, top: 24, bottom: 38 },
    xAxis: { name: '完整率(%)', type: 'value', max: 100, axisLabel: { color: '#718096' }, splitLine: { lineStyle: { color: '#edf2f7' } } },
    yAxis: { name: '断采(秒)', type: 'value', axisLabel: { color: '#718096' }, splitLine: { lineStyle: { color: '#edf2f7' } } },
    series: [{ type: 'scatter', symbolSize: (value: number[]) => Math.min(24, 8 + (value[1] || 0) / 60), itemStyle: { color: '#d88a43', opacity: .72 }, data: data.map((item) => [item.complete, item.gap, item.name]) }],
  }
}

function optionRiskHeatmap(data: Array<{ risk: string; time: string; value: number }>) {
  const risks = [...new Set(data.map((item) => item.risk))]
  const times = [...new Set(data.map((item) => item.time))]
  const values = data.map((item) => [times.indexOf(item.time), risks.indexOf(item.risk), item.value]) as Array<[number, number, number]>
  return {
    tooltip: { position: 'top', formatter: (params: any) => { const value = params.value as number[]; return `${risks[value[1] ?? -1] || '—'}<br/>${times[value[0] ?? -1] || '—'}<br/>风险概率 ${display(value[2])}%` } },
    grid: { left: 130, right: 18, top: 16, bottom: 38 },
    xAxis: { type: 'category', data: times, axisLabel: { color: '#718096', fontSize: 10 } },
    yAxis: { type: 'category', data: risks, axisLabel: { color: '#718096', fontSize: 10 } },
    visualMap: { min: 0, max: 100, orient: 'horizontal', left: 'center', bottom: 0, text: ['高', '低'], inRange: { color: ['#f6f7fb', '#f3c26b', '#e86d5b'] }, textStyle: { color: '#718096', fontSize: 10 } },
    series: [{ type: 'heatmap', data: values, label: { show: false } }],
  }
}

function optionTrendBars(data: Array<{ time: string; value: number; peak?: boolean }>) {
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 18, top: 26, bottom: 36 },
    xAxis: { type: 'category', data: data.map((item) => item.time), axisLabel: { color: '#718096', fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { color: '#718096' }, splitLine: { lineStyle: { color: '#edf2f7' } } },
    series: [{ type: 'bar', barWidth: 18, data: data.map((item) => ({ value: item.value, itemStyle: { color: item.peak ? '#f0a646' : '#2364c8', borderRadius: [6, 6, 0, 0] } })) }],
  }
}

function optionForecast(data: Array<{ time: string; actual: number; predict: number | null; low: number | null; high: number | null }>) {
  const times = data.map((item) => item.time)
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 6, textStyle: { color: '#61728a', fontSize: 11 } },
    grid: { left: 44, right: 18, top: 38, bottom: 36 },
    dataZoom: [{ type: 'inside' }],
    xAxis: { type: 'category', data: times, axisLabel: { color: '#718096', fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#ecf1f7' } }, axisLabel: { color: '#718096' } },
    series: [
      { name: '历史负荷', type: 'line', smooth: true, showSymbol: false, lineStyle: { color: '#2364c8', width: 2 }, areaStyle: { color: 'rgba(35,100,200,.12)' }, data: data.map((item) => item.actual) },
      { name: '预测负荷', type: 'line', smooth: true, showSymbol: true, symbolSize: 7, lineStyle: { color: '#f0a646', width: 2, type: 'dashed' }, itemStyle: { color: '#f0a646' }, data: data.map((item) => item.predict) },
      { name: '置信下界', type: 'line', smooth: true, showSymbol: false, lineStyle: { color: '#7fc4d4', width: 1, opacity: 0 }, areaStyle: { color: 'rgba(127,196,212,.12)' }, data: data.map((item) => item.low) },
      { name: '置信上界', type: 'line', smooth: true, showSymbol: false, lineStyle: { color: '#7fc4d4', width: 1, opacity: 0 }, areaStyle: { color: 'rgba(127,196,212,.12)' }, data: data.map((item) => item.high) },
    ],
  }
}

function optionForecastBars(data: Array<{ time: string; value: number; peak?: boolean }>) { return optionTrendBars(data) }

function disposeCharts() { charts.forEach((chart) => chart.dispose()); charts.clear(); chartElements.value = {} }

async function renderCharts() {
  await nextTick()
  const runtime = chartRuntime ??= await loadEfficiencyChartRuntime()
  const definitions: Array<[string, EChartsCoreOption]> = props.page === 'three-phase-monitor'
    ? [['three-phase-compare', optionPhaseCompare()], ['three-phase-voltage', optionLineSeries(threePhaseVoltageSeries.value as Array<RecordRow & { time: string }>, ['A', 'B', 'C'], true, true)], ['three-phase-current', optionLineSeries(threePhaseCurrentSeries.value as Array<RecordRow & { time: string }>, ['A', 'B', 'C'], true, true)], ['three-phase-frequency', optionLineSeries(threePhaseFrequencySeries.value as Array<RecordRow & { time: string }>, ['frequency'], false, false)]]
    : props.page === 'power-efficiency-analysis'
      ? [['analysis-gauge', optionGauge(analysis.value.gaugeValue || 0)], ['analysis-power', optionStackedArea(analysisPowerSeries.value as Array<RecordRow & { time: string }>, ['active', 'reactive', 'apparent'], ['#2364c8', '#f0a646', '#6d5dfc'])], ['analysis-composition', optionPie((analysisComposition.value || []).map((item) => ({ name: String(item.name), value: number(item.value) })), ['#2364c8', '#f0a646', '#d66457'])], ['analysis-load', optionLineSeries(analysisLoadSeries.value as Array<RecordRow & { time: string }>, ['rate'], false, false)]]
      : props.page === 'energy-consume-statistics'
        ? [['statistics-cumulative', optionLineSeries(statisticsCumulativeSeries.value as Array<RecordRow & { time: string }>, ['value'], true, false)], ['statistics-interval', optionTrendBars(statisticsIntervalSeries.value as Array<RecordRow & { time: string; value: number; peak?: boolean }>)], ['statistics-heatmap', optionHeatmap(statisticsHeatmapSeries.value as Array<RecordRow & { day: string; slot: string; value: number }>)] ]
        : [['predict-forecast', optionForecast(predictHistorySeries.value as Array<RecordRow & { time: string; actual: number; predict: number | null; low: number | null; high: number | null }>)] , ['predict-bars', optionForecastBars(predictForecastSeries.value as Array<RecordRow & { time: string; value: number; peak?: boolean }>)] , ['predict-risk', optionRiskHeatmap(predictRiskSeries.value as Array<RecordRow & { risk: string; time: string; value: number }> )]]

  definitions.forEach(([key, option]) => {
    const element = chartElements.value[key]
    if (!element) return
    const chart = charts.get(key) || runtime.init(element)
    charts.set(key, chart)
    chart.setOption(option, true)
    chart.resize()
  })
}

async function loadDevices() {
  devices.value = [
    { id: '101', device_name: '一号配电房总表', device_sn: 'EE-101', org_name: 'A区园区', gateway_name: 'GW-A01' },
    { id: '102', device_name: '制冷机组总表', device_sn: 'EE-102', org_name: 'A区园区', gateway_name: 'GW-A02' },
    { id: '103', device_name: '办公楼配电柜', device_sn: 'EE-103', org_name: 'B区园区', gateway_name: 'GW-B01' },
  ]
}

async function load() {
  const requestToken = ++latestRequest.value
  loading.value = true
  error.value = ''
  emit('update:context', { deviceId: deviceId.value, startDate: startDate.value, endDate: endDate.value })
  try {
    const data = await loadEfficiencyPage(props.page, { deviceId: deviceId.value, startDate: startDate.value, endDate: endDate.value }, {
      timeGranularity: timeGranularity.value,
      forecastWindow: forecastWindow.value,
      riskMode: riskMode.value,
      loadPerturbation: loadPerturbation.value,
    })
    if (requestToken !== latestRequest.value) return
    pageData.value = data as ThreePhaseMonitorData | PowerEfficiencyAnalysisData | EnergyConsumeStatisticsData | DataModelPredictData
  } catch (cause) {
    if (requestToken !== latestRequest.value) return
    error.value = cause instanceof Error ? cause.message : '电力能效数据读取失败'
  } finally {
    if (requestToken !== latestRequest.value) return
    loading.value = false
    await renderCharts()
  }
}

function refresh() { void load() }
function reset() { deviceId.value = '101'; startDate.value = daysAgo(29); endDate.value = today(); if (props.page === 'three-phase-monitor') timeGranularity.value = '1h'; if (props.page === 'data-model-predict') { forecastWindow.value = '24h'; riskMode.value = 'standard'; loadPerturbation.value = 1.0 } void load() }
function jumpTo(page: EfficiencyPageKind) { if (page === props.page) return; emit('switch-page', page) }

watch(() => props.page, (page) => { disposeCharts(); pageData.value = createEmptyPageData(page); void load() })
watch([deviceId, startDate, endDate, timeGranularity, forecastWindow, riskMode, loadPerturbation], () => { scheduleLoad(load) })
watch([pageData], () => { void renderCharts() }, { deep: true })
onMounted(() => { void loadDevices(); void load(); window.addEventListener('resize', renderCharts) })
onBeforeUnmount(() => { cancelScheduledLoad(); window.removeEventListener('resize', renderCharts); disposeCharts() })
</script>

<template>
  <section class="efficiency-workbench">
    <article class="efficiency-filter-card">
      <div class="efficiency-filter-fields">
        <label class="field wide"><span>设备范围</span><select v-model="deviceId"><option v-for="device in devices" :key="device.id" :value="device.id">{{ device.device_name }} · {{ device.device_sn }}</option></select></label>
        <label class="field"><span>{{ periodLabel }}</span><input v-model="startDate" type="date"><small v-if="periodHint" class="field-hint">{{ periodHint }}</small></label>
        <label class="field"><span>结束日期</span><input v-model="endDate" type="date"></label>
        <div class="efficiency-filter-actions">
          <button class="btn-primary" :disabled="loading" @click="refresh">查询</button>
          <button class="quiet" :disabled="loading" title="手动刷新数据" @click="refresh"><RefreshCw :size="14" :class="{ spinning: loading }" />刷新</button>
          <button class="quiet" @click="reset">重置</button>
        </div>
      </div>
    </article>

    <AppLoadingState v-if="loading && !metrics.length" />
    <p v-else-if="error" class="efficiency-error">{{ error }}</p>

    <template v-else>
      <div class="efficiency-workbench-body">
        <div class="efficiency-page-headline">
          <div>
            <p>POWER · EFFICIENCY · QUALITY</p>
            <h2>{{ pageTitle }}</h2>
            <small>{{ pageSubTitle }} · {{ contextHint }}</small>
          </div>
          <div class="efficiency-state-pills">
            <button :class="{ active: isThreePhase }" @click="jumpTo('three-phase-monitor')">三相监测</button>
            <button :class="{ active: isAnalysis }" @click="jumpTo('power-efficiency-analysis')">功率分析</button>
            <button :class="{ active: isStatistics }" @click="jumpTo('energy-consume-statistics')">能耗统计</button>
            <button :class="{ active: isPredict }" @click="jumpTo('data-model-predict')">模型预测</button>
          </div>
        </div>

        <div class="efficiency-scroll-shell">
          <div v-if="isThreePhase" class="page-layout three-phase-layout">
            <div class="page-main-frame page-main-frame--full">
              <div class="page-main-grid">
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>三相电压 / 电流对比</h3><small>双轴联动，异常相高亮</small></div>
                  <div v-if="threePhasePhaseSummary.length" :ref="(el) => setChartElement('three-phase-compare', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>三相电压时序</h3><small>{{ threePhase.timeGranularity || '1h' }} 粒度</small></div>
                  <div v-if="threePhaseVoltageSeries.length" :ref="(el) => setChartElement('three-phase-voltage', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>三相电流时序</h3><small>异常标记点</small></div>
                  <div v-if="threePhaseCurrentSeries.length" :ref="(el) => setChartElement('three-phase-current', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>电网频率质量</h3><small>观察频率稳定性</small></div>
                  <div v-if="threePhaseFrequencySeries.length" :ref="(el) => setChartElement('three-phase-frequency', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
              </div>
            </div>
          </div>

          <div v-else-if="isAnalysis" class="page-layout analysis-layout">
            <div class="page-main-frame page-main-frame--full">
              <div class="page-main-grid analysis-grid">
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>有功 / 无功 / 视在功率趋势</h3><small>时序联动</small></div>
                  <div v-if="analysisPowerSeries.length" :ref="(el) => setChartElement('analysis-power', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>功率构成</h3><small>视在功率占比</small></div>
                  <div v-if="analysisComposition.length" :ref="(el) => setChartElement('analysis-composition', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>负载率趋势</h3><small>观察高负载窗口</small></div>
                  <div v-if="analysisLoadSeries.length" :ref="(el) => setChartElement('analysis-load', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>功率因数仪表盘</h3><small>企业级分段配色</small></div>
                  <div v-if="analysis.gaugeValue !== null && analysis.gaugeValue !== undefined" :ref="(el) => setChartElement('analysis-gauge', el as HTMLElement)" class="chart-fill gauge-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
              </div>
            </div>
          </div>

          <div v-else-if="isStatistics" class="page-layout statistics-layout">
            <div class="page-main-frame page-main-frame--full">
              <div class="page-main-grid statistics-grid-layout">
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>电能累计面积图</h3><small>真实累计值斜率反映用电速率</small></div>
                  <div v-if="statisticsCumulativeSeries.length" :ref="(el) => setChartElement('statistics-cumulative', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>时段能耗柱状图</h3><small>高峰柱自动高亮</small></div>
                  <div v-if="statisticsIntervalSeries.length" :ref="(el) => setChartElement('statistics-interval', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel span-2">
                  <div class="panel-head"><h3>采集完整率热力图</h3><small>时段与星期维度</small></div>
                  <div v-if="statisticsHeatmapSeries.length" :ref="(el) => setChartElement('statistics-heatmap', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
              </div>
            </div>
          </div>

          <div v-else class="page-layout predict-layout">
            <div class="page-main-frame page-main-frame--full">
              <div class="page-main-grid predict-grid">
                <article class="panel chart-panel span-2">
                  <div class="panel-head"><h3>历史 - 预测组合时序</h3><small>实线历史，虚线预测，阴影为置信区间</small></div>
                  <div v-if="predictHistorySeries.length" :ref="(el) => setChartElement('predict-forecast', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>预测时段能耗</h3><small>仿真输出</small></div>
                  <div v-if="predictForecastSeries.length" :ref="(el) => setChartElement('predict-bars', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
                <article class="panel chart-panel">
                  <div class="panel-head"><h3>风险概率热力图</h3><small>仿真风险分布</small></div>
                  <div v-if="predictRiskSeries.length" :ref="(el) => setChartElement('predict-risk', el as HTMLElement)" class="chart-fill"></div>
                  <div v-else class="chart-empty">暂无数据</div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.efficiency-workbench{height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.efficiency-filter-card{flex:none;border:1px solid #dce7f3;border-radius:10px;background:#fff;padding:11px 14px;box-shadow:0 2px 8px rgb(35 75 120 / 4%)}
.efficiency-filter-fields{display:flex;align-items:end;gap:10px;flex-wrap:wrap}
.field{min-width:150px;display:flex;flex-direction:column;gap:5px}
.field.wide{min-width:220px}
.field span{color:#61728a;font-size:11px}.field-hint{color:#8b9aad;font-size:10px;line-height:1.2}
.field input,.field select,.predict-toolbar select,.predict-toolbar input[type='range']{height:36px;border:1px solid #d7e4f2;border-radius:7px;background:#fff;color:#2d4768;padding:0 10px;font-size:12px;min-width:0}
.efficiency-filter-actions{display:flex;gap:7px;margin-left:auto}
.efficiency-filter-actions button{display:inline-flex;align-items:center;gap:5px;height:36px}
.spinning{animation:refresh-spin .75s linear infinite}
@keyframes refresh-spin{to{transform:rotate(360deg)}}
.efficiency-workbench-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.efficiency-page-headline{display:flex;align-items:end;justify-content:space-between;gap:18px;flex:none;padding:0 2px}
.efficiency-page-headline p{margin:0;color:#7b8ea4;font-size:11px;letter-spacing:.18em}
.efficiency-page-headline h2{margin:4px 0 5px;color:#203b5a;font:700 24px/1.2 Georgia,"Noto Serif SC",serif}
.efficiency-page-headline small{color:#667b92;font-size:12px}
.efficiency-state-pills{display:flex;gap:6px;flex-wrap:wrap;flex:none}
.efficiency-state-pills button{height:32px;padding:0 11px;border:1px solid #d6e4f2;border-radius:999px;background:#fff;color:#5f7186;font-size:12px}
.efficiency-state-pills button.active{border-color:#2f86ff;background:#edf5ff;color:#1769c2;font-weight:700}
.efficiency-scroll-shell{flex:1;min-height:0;overflow:visible;padding-right:0}
.page-layout{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 302px;gap:12px;align-items:start}
.page-main-frame{min-width:0;min-height:0}
.page-main-frame--full{grid-column:1 / -1}
.page-main-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0;min-height:0;align-content:start}
.panel{min-width:0;border:1px solid #dfe8f3;border-radius:10px;background:#fff;overflow:hidden;display:flex;flex-direction:column}
.chart-panel{height:clamp(220px,28vh,320px);min-height:220px}
.span-2{grid-column:1 / -1}
.chart-fill{flex:1;min-height:0;width:100%}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 0}
.panel-head h3{margin:0;color:#304f74;font-size:13px}
.panel-head small{overflow:hidden;color:#8b9aad;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
.gauge-fill{min-height:250px}
.event-rail{min-height:0;max-height:100%}
.event-list{display:grid;gap:8px;padding:8px 12px 12px;overflow:auto;min-height:0;scrollbar-width:none}
.event-list::-webkit-scrollbar{display:none}
.event-list article{display:grid;gap:3px;padding:9px 10px;border-radius:8px;background:#f7fbff;border:1px solid #dce8f4;font-size:11px}
.event-list article b{color:#274869;font-size:12px}
.event-list article span{color:#64788f;line-height:1.45}
.event-list article time{color:#94a2b4;font-size:10px}
.event-list article.is-warn{background:#fff8ec;border-color:#efd3a1}
.event-list article.is-normal{background:#eef9f1;border-color:#c8ead4}
.event-list article.is-info{background:#f7fbff}
.advice-panel{display:grid;gap:8px;padding:0 12px 12px;border-top:1px solid #edf2f7}
.advice-panel b{padding-top:10px;color:#274869;font-size:12px}
.advice-panel p{margin:0;color:#687b92;font-size:11px;line-height:1.55}
.predict-toolbar{padding:10px 12px}
.predict-toolbar-row{display:flex;align-items:end;gap:10px;flex-wrap:wrap}
.predict-toolbar label{display:grid;gap:5px;min-width:0}
.predict-toolbar span{color:#61728a;font-size:11px}
.predict-toolbar input[type='range']{padding:0;min-width:180px}
.predict-version{margin-left:auto;padding:6px 10px;border:1px solid #d7e5f4;border-radius:999px;background:#f7fbff;color:#29486d;font-size:11px;font-weight:700}
.chart-empty{flex:1;min-height:0;margin:0;display:grid;place-content:center;justify-items:center;gap:9px;color:#899caf;font-size:12px;line-height:1.3;text-align:center}
.chart-empty::before{content:"";box-sizing:border-box;width:28px;height:21px;border:1.5px solid #9eb2c8;border-radius:4px;background:linear-gradient(145deg,transparent 47%,#c4d1df 48% 52%,transparent 53%);box-shadow:inset 0 -5px 0 #f4f7fa}
@media (max-width:1180px){.page-layout{grid-template-columns:1fr}.event-rail{order:2;min-height:240px}.page-main-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.span-2{grid-column:1 / -1}.predict-version{margin-left:0}}
@media (max-width:760px){.efficiency-workbench{overflow:hidden}.efficiency-workbench-body{overflow:hidden}.efficiency-page-headline{align-items:flex-start;flex-direction:column}.page-layout,.page-main-grid{grid-template-columns:1fr}.span-2{grid-column:auto}.chart-panel{height:240px;min-height:220px}.gauge-fill{min-height:220px}.field,.field.wide{min-width:0;width:100%}.efficiency-filter-actions{margin-left:0}.predict-toolbar input[type='range']{min-width:0;width:100%}}
</style>
