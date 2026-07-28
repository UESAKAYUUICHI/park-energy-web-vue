<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useRoute, useRouter } from 'vue-router'
import { BarChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { energy, monitor, statistics } from '@/api/platform'
import { unwrapRemote } from '@/api/http'
import type { RecordRow } from '@/types/domain'

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

interface SeriesRow {
  time: string
  pointCode: string
  value: number
}

const route = useRoute()
const router = useRouter()
const kind = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const keyword = ref('')
const deviceId = ref('')
const pointCodes = ref('')
const pointCode = ref('')
const startDate = ref('')
const endDate = ref('')
const payload = ref<RecordRow>({})
const rows = ref<RecordRow[]>([])
const loading = ref(false)
const error = useAlertRef()
const deviceOptions = ref<RecordRow[]>([])
const pointOptions = ref<RecordRow[]>([])
const primaryChartEl = ref<HTMLElement | null>(null)
const secondaryChartEl = ref<HTMLElement | null>(null)
let primaryChart: ECharts | null = null
let secondaryChart: ECharts | null = null

const formatDateInput = (date: Date) => {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}
const daysAgo = (days: number) => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return formatDateInput(date)
}
const queryText = (value: unknown) => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
const toRows = (value: unknown): RecordRow[] => {
  if (Array.isArray(value)) return value as RecordRow[]
  if (!value || typeof value !== 'object') return []
  const row = value as RecordRow
  if (Array.isArray(row.data)) return row.data as RecordRow[]
  if (Array.isArray(row.records)) return row.records as RecordRow[]
  if (Array.isArray(row.rows)) return row.rows as RecordRow[]
  if (row.data && typeof row.data === 'object') return toRows(row.data)
  return []
}
const numberValue = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}
const displayNumber = (value: unknown, digits = 2) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: digits })
const syncQueryFilters = () => {
  deviceId.value = queryText(route.query.deviceId)
  pointCode.value = queryText(route.query.pointCode)
  pointCodes.value = queryText(route.query.pointCodes)
  startDate.value = queryText(route.query.startTime || route.query.startDate) || daysAgo(30)
  endDate.value = queryText(route.query.endTime || route.query.endDate) || formatDateInput(new Date())
}

const selectedDevice = computed(() => deviceOptions.value.find((item) => String(item.id) === deviceId.value))
const monitorDevices = computed(() => Array.isArray(payload.value.devices) ? payload.value.devices as unknown as RecordRow[] : deviceOptions.value)
const rankingRows = computed(() => Array.isArray(payload.value.ranking) ? payload.value.ranking as unknown as RecordRow[] : [])
const trendRows = computed(() => Array.isArray(payload.value.trend) ? payload.value.trend as unknown as RecordRow[] : [])
const realtimeLookup = computed<Record<string, unknown>>(() => flattenValues(payload.value.realtime))
const realtimeCards = computed(() => {
  const names = new Map(pointOptions.value.map((point) => [String(point.point_code || point.pointCode || point.code || ''), String(point.point_name || point.pointName || point.point_code || '')]))
  return Object.entries(realtimeLookup.value)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .slice(0, 8)
    .map(([key, value]) => ({ key, name: names.get(key) || key, value }))
})
const monitorChartRows = computed<SeriesRow[]>(() => rows.value
  .map((row) => ({
    time: String(row.stat_date || row.time || ''),
    pointCode: String(row.point_code || row.pointCode || 'usage'),
    value: numberValue(row.usage_value ?? row.value),
  }))
  .filter((row) => row.time))
const historySeriesRows = computed<SeriesRow[]>(() => {
  const series = payload.value.series
  if (!series || typeof series !== 'object') return []
  const result: SeriesRow[] = []
  Object.entries(series as Record<string, unknown>).forEach(([code, value]) => {
    toRows(value).forEach((row) => {
      const time = String(row.time || row.timestamp || row.collectTime || row.collect_time || row.createTime || row.stat_date || '')
      const raw = row.value ?? row.pointValue ?? row.point_value ?? row.data_value ?? row.usage_value ?? row.v
      if (time) result.push({ time, pointCode: String(row.pointCode || row.point_code || code), value: numberValue(raw) })
    })
  })
  return result.sort((a, b) => a.time.localeCompare(b.time))
})
const qualityRiskRows = computed(() => rows.value.filter((row) => Number(row.avg_complete_rate || 0) < 100))
const averageCompleteRate = computed(() => rows.value.length ? rows.value.reduce((sum, row) => sum + Number(row.avg_complete_rate || 0), 0) / rows.value.length : 0)
const totalUsage = computed(() => rows.value.reduce((sum, row) => sum + Number(row.usage_value || 0), 0))
const activePointCount = computed(() => new Set(rows.value.map((row) => String(row.point_code || row.pointCode || '')).filter(Boolean)).size)
const energyMetrics = computed(() => {
  if (kind.value === 'monitor') return [
    { label: '可见设备', value: monitorDevices.value.length, hint: selectedDevice.value?.device_name || '当前授权范围' },
    { label: '实时测点', value: realtimeCards.value.length, hint: 'Redis 快照' },
    { label: '日统计量', value: rows.value.length, hint: `${startDate.value} 至 ${endDate.value}` },
    { label: '累计用量', value: displayNumber(totalUsage.value), hint: `${activePointCount.value || 0} 个测点` },
  ]
  if (kind.value === 'analysis') return [
    { label: '曲线测点', value: new Set(historySeriesRows.value.map((row) => row.pointCode)).size, hint: selectedDevice.value?.device_name || '历史分析' },
    { label: '历史点数', value: historySeriesRows.value.length, hint: `${startDate.value} 至 ${endDate.value}` },
    { label: '最大值', value: displayNumber(Math.max(0, ...historySeriesRows.value.map((row) => row.value))), hint: '当前查询' },
    { label: '平均值', value: displayNumber(historySeriesRows.value.reduce((sum, row) => sum + row.value, 0) / Math.max(1, historySeriesRows.value.length)), hint: '当前查询' },
  ]
  return [
    { label: '质量记录', value: rows.value.length, hint: '参与统计' },
    { label: '平均完整率', value: `${averageCompleteRate.value.toFixed(2)}%`, hint: '越高越稳定' },
    { label: '需关注', value: qualityRiskRows.value.length, hint: '低于 100%' },
    { label: '排行设备', value: rankingRows.value.length, hint: '用量排名' },
  ]
})

const monitorColumns: TableColumn[] = [
  { key: 'stat_date', label: '统计日期' },
  { key: 'device_name', label: '设备' },
  { key: 'point_code', label: '测点' },
  { key: 'start_value', label: '起始值' },
  { key: 'end_value', label: '结束值' },
  { key: 'usage_value', label: '用量' },
  { key: 'data_complete_rate', label: '完整率', format: (value) => `${Number(value || 0).toFixed(2)}%` },
]
const qualityColumns: TableColumn[] = [
  { key: 'device_name', label: '设备' },
  { key: 'org_name', label: '所属组织' },
  { key: 'point_code', label: '测点' },
  { key: 'avg_complete_rate', label: '平均完整率', format: (value) => `${Number(value || 0).toFixed(2)}%` },
  { key: 'start_date', label: '开始日期' },
  { key: 'end_date', label: '结束日期' },
]
const historyColumns: TableColumn[] = [
  { key: 'time', label: '采集时间' },
  { key: 'pointCode', label: '测点' },
  { key: 'value', label: '数值', format: (value) => displayNumber(value) },
]
const tableRows = computed(() => kind.value === 'analysis' ? historySeriesRows.value as unknown as RecordRow[] : rows.value)
const columns = computed(() => kind.value === 'monitor' ? monitorColumns : kind.value === 'quality' ? qualityColumns : historyColumns)

function flattenValues(value: unknown, prefix = ''): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, unknown> = {}
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (['success', 'message', 'code'].includes(key)) return
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as RecordRow
      const direct = row.value ?? row.data_value ?? row.current_value ?? row.currentValue
      if (direct !== undefined) result[nextKey] = direct
      else Object.assign(result, flattenValues(row, nextKey))
    } else if (!Array.isArray(item)) {
      result[nextKey] = item
    }
  })
  return result
}

function chartRowsForCurrentPage() {
  if (kind.value === 'analysis') return historySeriesRows.value
  if (kind.value === 'quality') return trendRows.value.map((row) => ({ time: String(row.stat_period || row.stat_date || ''), pointCode: '用量趋势', value: numberValue(row.usage_value) }))
  return [...monitorChartRows.value].reverse()
}

function chartOption(data: SeriesRow[], type: 'line' | 'bar' = 'line'): EChartsCoreOption {
  const times = [...new Set(data.map((row) => row.time))]
  const codes = [...new Set(data.map((row) => row.pointCode))]
  return {
    color: ['#2364c8', '#22a6b3', '#f59e0b', '#ef4444', '#6d5dfc'],
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 4, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { left: 42, right: 18, top: 40, bottom: 42 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }],
    xAxis: { type: 'category', data: times, axisLabel: { color: '#64748b' } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#edf2f7' } } },
    series: codes.map((code) => ({
      name: code,
      type,
      smooth: type === 'line',
      showSymbol: false,
      data: times.map((time) => data.find((row) => row.time === time && row.pointCode === code)?.value ?? null),
    })),
  }
}

async function renderCharts() {
  await nextTick()
  const data = chartRowsForCurrentPage()
  if (primaryChartEl.value) {
    primaryChart ||= init(primaryChartEl.value)
    primaryChart.setOption(chartOption(data), true)
    primaryChart.resize()
  }
  if (secondaryChartEl.value) {
    secondaryChart ||= init(secondaryChartEl.value)
    secondaryChart.setOption(chartOption(rankingRows.value.map((row) => ({ time: String(row.device_name || row.device_sn || row.device_id), pointCode: '设备用量', value: numberValue(row.usage_value) })), 'bar'), true)
    secondaryChart.resize()
  }
}

async function loadSelectors() {
  try {
    const data = await monitor({ deviceId: deviceId.value || undefined })
    deviceOptions.value = Array.isArray(data.devices) ? data.devices as unknown as RecordRow[] : []
    pointOptions.value = Array.isArray(data.pointDefinitions) ? data.pointDefinitions as unknown as RecordRow[] : []
    const firstPoint = pointOptions.value[0]
    if (!pointCodes.value && firstPoint) pointCodes.value = String(firstPoint.point_code || firstPoint.pointCode || '')
  } catch {
    deviceOptions.value = []
    pointOptions.value = []
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (kind.value === 'monitor') {
      const data = await monitor({ deviceId: deviceId.value || undefined, pointCode: pointCode.value || undefined })
      payload.value = data
      deviceOptions.value = Array.isArray(data.devices) ? data.devices as unknown as RecordRow[] : []
      pointOptions.value = Array.isArray(data.pointDefinitions) ? data.pointDefinitions as unknown as RecordRow[] : []
      rows.value = Array.isArray(data.dailyStats) ? data.dailyStats as unknown as RecordRow[] : []
      return
    }
    if (kind.value === 'quality') {
      const params = { pointCode: pointCode.value || undefined, startDate: startDate.value, endDate: endDate.value }
      const [ranking, trend, quality] = await Promise.all([energy('ranking', params), energy('trend', params), statistics('quality', params)])
      payload.value = { ranking, trend }
      rows.value = Array.isArray(quality) ? quality as unknown as RecordRow[] : []
      return
    }
    if (!deviceId.value || !pointCodes.value) {
      payload.value = { hint: '请选择设备和测点。' }
      rows.value = []
      return
    }
    const data = unwrapRemote(await energy('history/series', { deviceId: deviceId.value, pointCodes: pointCodes.value, startTime: startDate.value, endTime: endDate.value }))
    payload.value = { series: data as RecordRow | RecordRow[] }
    rows.value = historySeriesRows.value as unknown as RecordRow[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : '能源数据读取失败'
    rows.value = []
  } finally {
    loading.value = false
    await renderCharts()
  }
}

function queryHistory() {
  router.replace({ query: { ...route.query, deviceId: deviceId.value, pointCodes: pointCodes.value, startTime: startDate.value, endTime: endDate.value } })
}
function selectDevice() {
  pointCode.value = ''
  pointCodes.value = ''
  void loadSelectors()
  if (kind.value === 'monitor') void load()
}
function reset() {
  keyword.value = ''
  pointCode.value = ''
  deviceId.value = ''
  pointCodes.value = ''
  startDate.value = daysAgo(30)
  endDate.value = formatDateInput(new Date())
  void load()
}
function goDevice(row: RecordRow = {}) {
  const id = row.device_id || row.id || deviceId.value
  if (id) void router.push(`/device-archive/devices/${id}`)
}
function goAlarm(row: RecordRow = {}) {
  const id = row.device_id || deviceId.value
  void router.push({ path: '/alarms/events', query: id ? { deviceId: String(id) } : {} })
}
function goSettlement(row: RecordRow = {}) {
  const orgId = row.org_id
  void router.push({ path: '/billing/settlement', query: orgId ? { orgId: String(orgId), includeChildren: 'true' } : {} })
}

watch(() => route.fullPath, () => {
  syncQueryFilters()
  void load()
  void loadSelectors()
})
watch([() => payload.value, rows], () => { void renderCharts() }, { deep: true })
onMounted(() => {
  syncQueryFilters()
  void load()
  void loadSelectors()
  window.addEventListener('resize', renderCharts)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', renderCharts)
  primaryChart?.dispose()
  secondaryChart?.dispose()
})
</script>

<template>
  <section class="view-page energy-workbench-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">ENERGY OPERATIONS</p>
        <h1>{{ title }}</h1>
        <p>{{ kind === 'monitor' ? '运行监控' : kind === 'analysis' ? '历史追溯' : '统计与质量' }}</p>
      </div>
      <div class="head-actions">
        <button class="quiet" @click="load">刷新</button>
      </div>
    </header>

    <article class="filter-card energy-filter-card">
      <div class="filter-row">
        <label v-if="kind !== 'quality'" class="field"><span>设备</span><select v-model="deviceId" @change="selectDevice"><option value="">请选择设备</option><option v-for="device in deviceOptions" :key="String(device.id)" :value="String(device.id)">{{ device.device_name }} · {{ device.device_sn }}</option></select></label>
        <label class="field"><span>{{ kind === 'analysis' ? '测点组' : '测点' }}</span><select v-if="kind !== 'analysis'" v-model="pointCode"><option value="">全部测点</option><option v-for="point in pointOptions" :key="String(point.id)" :value="String(point.point_code)">{{ point.point_name || point.point_code }} · {{ point.point_code }}</option></select><input v-else v-model="pointCodes" placeholder="多个测点用英文逗号分隔"></label>
        <label class="field"><span>开始日期</span><input v-model="startDate" type="date"></label>
        <label class="field"><span>结束日期</span><input v-model="endDate" type="date"></label>
        <div class="filter-actions">
          <button class="btn-primary" @click="kind === 'analysis' ? queryHistory() : load()">查询</button>
          <button class="quiet" @click="reset">重置</button>
        </div>
      </div>
    </article>

    <div class="energy-metric-grid">
      <article v-for="item in energyMetrics" :key="item.label" class="energy-metric">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <em>{{ item.hint }}</em>
      </article>
    </div>

    <div class="energy-operation-grid" :class="{ 'quality-mode': kind === 'quality' }">
      <article class="panel energy-chart-panel">
        <div class="panel-head">
          <h3>{{ kind === 'analysis' ? '历史曲线' : kind === 'quality' ? '能耗趋势' : '运行趋势' }}</h3>
          <small>{{ startDate }} / {{ endDate }}</small>
        </div>
        <div v-if="!chartRowsForCurrentPage().length" class="empty-state">当前条件暂无可绘制数据。</div>
        <div v-show="chartRowsForCurrentPage().length" ref="primaryChartEl" class="energy-main-chart"></div>
      </article>

      <article v-if="kind === 'monitor'" class="panel energy-side-panel">
        <div class="panel-head"><h3>实时快照</h3><small>{{ selectedDevice?.device_sn || '设备' }}</small></div>
        <div v-if="!realtimeCards.length" class="empty-state">暂无实时测点。</div>
        <div v-else class="energy-realtime-grid">
          <article v-for="item in realtimeCards" :key="item.key">
            <span>{{ item.name }}</span>
            <b>{{ displayNumber(item.value) }}</b>
            <small>{{ item.key }}</small>
          </article>
        </div>
      </article>

      <article v-else-if="kind === 'quality'" class="panel energy-side-panel">
        <div class="panel-head"><h3>用量排行</h3><small>TOP {{ rankingRows.length }}</small></div>
        <div v-if="!rankingRows.length" class="empty-state">暂无排行数据。</div>
        <div v-show="rankingRows.length" ref="secondaryChartEl" class="energy-side-chart"></div>
      </article>

      <article v-else class="panel energy-side-panel">
        <div class="panel-head"><h3>追溯动作</h3><small>闭环入口</small></div>
        <div class="energy-action-list">
          <button class="quiet" :disabled="!deviceId" @click="goDevice()">设备详情</button>
          <button class="quiet" :disabled="!deviceId" @click="goAlarm()">关联告警</button>
          <button class="quiet" :disabled="!deviceId" @click="router.push({ path: '/access/commands', query: { targetId: deviceId } })">指令追踪</button>
        </div>
      </article>
    </div>

    <AppDataTable
      :title="kind === 'monitor' ? '日统计证据' : kind === 'quality' ? '数据质量问题' : '历史数据明细'"
      :columns="columns"
      :rows="tableRows"
      :loading="loading"
      :error="error"
      :empty-text="kind === 'quality' ? '当前范围暂无数据质量记录。' : undefined"
      @refresh="load"
    >
      <template #actions="{ row }">
        <button class="link-btn" @click="goDevice(row)">设备</button>
        <button class="link-btn" @click="goAlarm(row)">告警</button>
        <button v-if="kind === 'quality'" class="link-btn" @click="goSettlement(row)">结算</button>
      </template>
    </AppDataTable>
  </section>
</template>