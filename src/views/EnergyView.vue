<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useDebouncedTask } from '@/composables/useDebouncedTask'
import { useRoute, useRouter } from 'vue-router'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import { energy, listResource, monitor } from '@/api/platform'
import { unwrapRemote } from '@/api/http'
import type { RecordRow } from '@/types/domain'
import { loadBasicChartRuntime, type BasicChartRuntime } from '@/utils/chartRuntime'

const props = withDefaults(defineProps<{ mode?: 'monitor' | 'analysis' | 'quality'; embedded?: boolean }>(), { embedded: false })

interface SeriesRow {
  time: string
  pointCode: string
  value: number
}

const route = useRoute()
const router = useRouter()
const kind = computed(() => props.mode || String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const keyword = ref('')
const orgId = ref('')
const spaceId = ref('')
const deviceSn = ref('')
const deviceId = ref('')
const pointCodes = ref('')
const pointCode = ref('')
const rankingDimension = ref<'device' | 'org'>('device')
const trendGroup = ref<'day' | 'month'>('day')
const startDate = ref('')
const endDate = ref('')
const payload = ref<RecordRow>({})
const rows = ref<RecordRow[]>([])
const loading = ref(false)
const error = useAlertRef()
const { schedule: scheduleChartRender, cancel: cancelChartRender } = useDebouncedTask(100)
const deviceOptions = ref<RecordRow[]>([])
const pointOptions = ref<RecordRow[]>([])
const spaceOptions = ref<RecordRow[]>([])
const primaryChartEl = ref<HTMLElement | null>(null)
const secondaryChartEl = ref<HTMLElement | null>(null)
let primaryChart: ECharts | null = null
let secondaryChart: ECharts | null = null
let chartRuntime: BasicChartRuntime | null = null

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
  orgId.value = queryText(route.query.orgId)
  spaceId.value = queryText(route.query.spaceId)
  deviceId.value = queryText(route.query.deviceId)
  pointCode.value = queryText(route.query.pointCode)
  pointCodes.value = queryText(route.query.pointCodes)
  trendGroup.value = queryText(route.query.groupBy) === 'month' ? 'month' : 'day'
  startDate.value = queryText(route.query.startTime || route.query.startDate) || daysAgo(30)
  endDate.value = queryText(route.query.endTime || route.query.endDate) || formatDateInput(new Date())
}

const flattenOrganizations = (items: unknown, depth = 0): RecordRow[] => {
  if (!Array.isArray(items)) return []
  return (items as RecordRow[]).flatMap((item) => [
    { ...item, depth, option_label: `${'　'.repeat(depth)}${depth ? '└ ' : ''}${String(item.org_name || '未命名组织')}` },
    ...flattenOrganizations(item.children, depth + 1),
  ])
}
const organizationOptions = computed(() => flattenOrganizations(payload.value.organizations))
const selectedDevice = computed(() => deviceOptions.value.find((item) => String(item.id) === deviceId.value))
const selectedPoint = computed(() => pointOptions.value.find((item) => String(item.point_code) === pointCode.value))
const drilldownOverview = computed<RecordRow>(() => payload.value.overview && typeof payload.value.overview === 'object'
  ? payload.value.overview as RecordRow
  : {})
const efficiencyOverview = computed<RecordRow>(() => payload.value.efficiency && typeof payload.value.efficiency === 'object'
  ? payload.value.efficiency as RecordRow
  : {})
const efficiencyQuality = computed<RecordRow>(() => efficiencyOverview.value.quality && typeof efficiencyOverview.value.quality === 'object'
  ? efficiencyOverview.value.quality as RecordRow
  : {})
const efficiencyTou = computed<RecordRow>(() => efficiencyOverview.value.tou && typeof efficiencyOverview.value.tou === 'object'
  ? efficiencyOverview.value.tou as RecordRow
  : {})
const efficiencyBaseline = computed<RecordRow>(() => efficiencyOverview.value.baseline && typeof efficiencyOverview.value.baseline === 'object'
  ? efficiencyOverview.value.baseline as RecordRow
  : {})
const efficiencyComparison = computed<RecordRow>(() => efficiencyOverview.value.comparison && typeof efficiencyOverview.value.comparison === 'object'
  ? efficiencyOverview.value.comparison as RecordRow
  : {})
const drilldownBreadcrumb = computed(() => {
  const selection = payload.value.selection
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return []
  const breadcrumb = (selection as RecordRow).orgBreadcrumb
  return Array.isArray(breadcrumb) ? breadcrumb as RecordRow[] : []
})
const monitorDevices = computed(() => Array.isArray(payload.value.devices) ? payload.value.devices as unknown as RecordRow[] : deviceOptions.value)
const rankingRows = computed(() => {
  const key = rankingDimension.value === 'org' ? 'orgRanking' : 'deviceRanking'
  return Array.isArray(payload.value[key]) ? payload.value[key] as unknown as RecordRow[] : []
})
const trendRows = computed(() => Array.isArray(payload.value.trend) ? payload.value.trend as unknown as RecordRow[] : [])
const realtimeSnapshot = computed<RecordRow>(() => {
  const value = payload.value.realtime
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const row = value as RecordRow
  return row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data as RecordRow : row
})
const realtimeLookup = computed<Record<string, unknown>>(() => {
  const points = realtimeSnapshot.value.points
  return points && typeof points === 'object' && !Array.isArray(points)
    ? points as Record<string, unknown>
    : {}
})
const realtimeCards = computed(() => {
  const names = new Map(pointOptions.value.map((point) => [String(point.point_code || point.pointCode || point.code || ''), String(point.point_name || point.pointName || point.point_code || '')]))
  const units = new Map(pointOptions.value.map((point) => [String(point.point_code || point.pointCode || point.code || ''), String(point.unit || '')]))
  const details = realtimeSnapshot.value.pointDetails
  if (Array.isArray(details)) return (details as RecordRow[]).map((item) => ({
    key: String(item.pointCode || item.point_code || ''),
    name: String(item.pointName || item.point_name || item.pointCode || ''),
    value: item.value,
    unit: String(item.unit || ''),
    quality: String(item.quality || 'GOOD'),
  }))
  return Object.entries(realtimeLookup.value)
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([key, value]) => ({ key, name: names.get(key) || key, value, unit: units.get(key) || '', quality: 'GOOD' }))
})
const monitorChartRows = computed<SeriesRow[]>(() => toRows(payload.value.history)
  .map((row) => ({
    time: String(row.time || row.collectTime || row.collect_time || ''),
    pointCode: String(row.pointCode || row.point_code || pointCode.value || 'value'),
    value: numberValue(row.value),
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
  if (kind.value === 'quality') return [
    { label: '范围设备', value: numberValue(drilldownOverview.value.deviceCount), hint: drilldownBreadcrumb.value.map((item) => item.org_name).join(' / ') || '全部授权组织' },
    { label: '累计用量', value: displayNumber(efficiencyOverview.value.consumption ?? drilldownOverview.value.totalUsage), hint: `${startDate.value} 至 ${endDate.value}` },
    { label: '最大需量', value: displayNumber(efficiencyQuality.value.maxDemand), hint: 'kW · 小时最大值' },
    { label: '功率因数', value: displayNumber(efficiencyQuality.value.powerFactor, 3), hint: '低于 0.900 需关注' },
    { label: '电压合格率', value: `${displayNumber(efficiencyQuality.value.voltageQualifiedRate, 2)}%`, hint: `三相不平衡 ${displayNumber(efficiencyQuality.value.threePhaseImbalance, 2)}%` },
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
  { key: 'collection_complete_rate', label: '采集完整率', format: (value) => `${Number(value || 0).toFixed(2)}%` },
]
const qualityColumns: TableColumn[] = [
  { key: 'device_name', label: '设备' },
  { key: 'org_name', label: '所属组织' },
  { key: 'avg_complete_rate', label: '平均完整率', format: (value) => `${Number(value || 0).toFixed(2)}%` },
  { key: 'abnormal_days', label: '异常天数' },
  { key: 'incomplete_days', label: '不完整天数' },
  { key: 'received_samples', label: '有效报文' },
  { key: 'expected_samples', label: '期望报文' },
  { key: 'longest_gap_seconds', label: '最大断采(秒)' },
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

function chartRowsForCurrentPage() {
  if (kind.value === 'analysis') return historySeriesRows.value
  if (kind.value === 'quality') return trendRows.value.map((row) => ({
    time: String(row.stat_period || row.stat_date || ''),
    pointCode: selectedPoint.value ? String(selectedPoint.value.point_name || selectedPoint.value.point_code) : '用量趋势',
    value: numberValue(row.value ?? row.usage_value),
  }))
  return monitorChartRows.value
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
  chartRuntime ??= await loadBasicChartRuntime()
  const data = chartRowsForCurrentPage()
  if (primaryChartEl.value) {
    primaryChart ||= chartRuntime.init(primaryChartEl.value)
    primaryChart.setOption(chartOption(data), true)
    primaryChart.resize()
  }
  if (secondaryChartEl.value) {
    secondaryChart ||= chartRuntime.init(secondaryChartEl.value)
    secondaryChart.setOption(chartOption(rankingRows.value.map((row) => ({
      time: String(row.device_name || row.device_sn || row.org_name || row.device_id || row.org_id),
      pointCode: rankingDimension.value === 'org' ? '组织用量' : '设备用量',
      value: numberValue(row.usage_value),
    })), 'bar'), true)
    secondaryChart.resize()
  }
}

async function loadSelectors() {
  if (kind.value === 'quality') return
  try {
    const data = await monitor({ deviceId: deviceId.value || undefined })
    deviceOptions.value = Array.isArray(data.devices) ? data.devices as unknown as RecordRow[] : []
    pointOptions.value = Array.isArray(data.pointDefinitions) ? data.pointDefinitions as unknown as RecordRow[] : []
    const firstPoint = pointOptions.value[0]
    if (!pointCodes.value && firstPoint) {
      pointCodes.value = pointOptions.value
        .map((point) => String(point.point_code || point.pointCode || ''))
        .filter(Boolean)
        .join(',')
    }
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
      const data = await energy('drilldown', {
        orgId: orgId.value || undefined,
        spaceId: spaceId.value || undefined,
        deviceId: deviceId.value || undefined,
        pointCode: pointCode.value || undefined,
        groupBy: trendGroup.value,
        startDate: startDate.value,
        endDate: endDate.value,
      }) as RecordRow
      payload.value = data
      if (!spaceId.value) {
        try {
          payload.value.efficiency = await energy('efficiency/overview', {
            orgId: orgId.value || undefined,
            deviceId: deviceId.value || undefined,
            startDate: startDate.value,
            endDate: endDate.value,
            energyCarrier: 'ELECTRICITY',
          }) as RecordRow
        } catch {
          // The existing quality drill-down remains available before the optional efficiency migration is executed.
        }
      }
      deviceOptions.value = Array.isArray(data.devices) ? data.devices as unknown as RecordRow[] : []
      pointOptions.value = Array.isArray(data.points) ? data.points as unknown as RecordRow[] : []
      rows.value = Array.isArray(data.quality) ? data.quality as unknown as RecordRow[] : []
      return
    }
    if (!deviceId.value || !pointCodes.value) {
      payload.value = { hint: '请选择设备和测点。' }
      rows.value = []
      return
    }
    const data = unwrapRemote(await energy('history/series', {
      deviceId: deviceId.value,
      pointCodes: pointCodes.value,
      startTime: `${startDate.value}T00:00:00+08:00`,
      endTime: `${endDate.value}T23:59:59+08:00`,
    }))
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
  const selected = deviceOptions.value.find((item) => String(item.id) === String(deviceId.value))
  if (selected) deviceSn.value = String(selected.device_sn || '')
  pointCode.value = ''
  pointCodes.value = ''
  void loadSelectors()
  if (kind.value === 'monitor') void load()
}

async function loadSpaceOptions() {
  try {
    spaceOptions.value = (await listResource('archive', 'spaces', { pageSize: 500 })).records
  } catch {
    spaceOptions.value = []
  }
}
function selectDrilldownOrg() {
  deviceId.value = ''
  pointCode.value = ''
  pointOptions.value = []
  void load()
}
function selectDrilldownSpace() {
  deviceId.value = ''
  pointCode.value = ''
  pointOptions.value = []
  void load()
}
function selectDrilldownDevice() {
  pointCode.value = ''
  void load()
}
function selectDrilldownPoint() {
  void load()
}
function goPointHistory() {
  if (!deviceId.value || !pointCode.value) return
  void router.push({ path: '/analysis/history', query: {
    deviceId: deviceId.value,
    pointCodes: pointCode.value,
    startTime: startDate.value,
    endTime: endDate.value,
  } })
}
async function resolveDeviceSn() {
  const sn = deviceSn.value.trim()
  if (!sn) {
    error.value = '请输入设备 SN'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = unwrapRemote(await energy('devices/resolve', { deviceSn: sn })) as RecordRow
    deviceId.value = String(result.id || '')
    if (!deviceId.value) throw new Error('设备 SN 未返回有效设备 ID')
    pointCode.value = ''
    pointCodes.value = ''
    await loadSelectors()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '设备 SN 查询失败'
  } finally {
    loading.value = false
  }
}
function reset() {
  keyword.value = ''
  orgId.value = ''
  spaceId.value = ''
  deviceSn.value = ''
  pointCode.value = ''
  deviceId.value = ''
  pointCodes.value = ''
  trendGroup.value = 'day'
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
  void router.push({ path: '/billing/receivables', query: { view: 'settlement', ...(orgId ? { orgId: String(orgId), includeChildren: 'true' } : {}) } })
}

watch(() => route.fullPath, () => {
  syncQueryFilters()
  void load()
  if (kind.value !== 'monitor') void loadSelectors()
})
watch([() => payload.value, rows], () => { scheduleChartRender(renderCharts) })
watch(rankingDimension, () => { scheduleChartRender(renderCharts) })
onMounted(() => {
  syncQueryFilters()
  void load()
  if (kind.value !== 'monitor') void loadSelectors()
  void loadSpaceOptions()
  window.addEventListener('resize', renderCharts)
})
onBeforeUnmount(() => {
  cancelChartRender()
  window.removeEventListener('resize', renderCharts)
  primaryChart?.dispose()
  secondaryChart?.dispose()
})
</script>

<template>
  <section class="view-page energy-workbench-page" :class="{ 'energy-workbench-embedded': embedded }">
    <header v-if="!embedded" class="view-head">
      <div>
        <p class="eyebrow">ENERGY OPERATIONS</p>
        <h1>{{ title }}</h1>
      </div>
      <div class="head-actions">
        <button class="quiet" title="手动刷新" @click="load"><RefreshCw :size="14" />刷新</button>
      </div>
    </header>

    <article class="filter-card energy-filter-card">
      <div class="filter-row">
        <label v-if="kind === 'quality'" class="field"><span>1. 组织范围</span><AppSelect v-model="orgId" @change="selectDrilldownOrg"><option value="">全部授权组织</option><option v-for="org in organizationOptions" :key="String(org.id)" :value="String(org.id)">{{ org.option_label }}</option></AppSelect></label>
        <label v-if="kind === 'quality'" class="field"><span>2. 空间节点</span><AppSelect v-model="spaceId" @change="selectDrilldownSpace"><option value="">全部空间节点</option><option v-for="space in spaceOptions" :key="String(space.id)" :value="String(space.id)">{{ space.space_name || space.space_code }}</option></AppSelect></label>
        <label v-if="kind === 'quality'" class="field"><span>3. 设备</span><AppSelect v-model="deviceId" @change="selectDrilldownDevice"><option value="">范围内全部设备</option><option v-for="device in deviceOptions" :key="String(device.id)" :value="String(device.id)">{{ device.device_name }} · {{ device.device_sn }}</option></AppSelect></label>
        <label v-if="kind === 'quality'" class="field"><span>4. 测点</span><AppSelect v-model="pointCode" :disabled="!deviceId" @change="selectDrilldownPoint"><option value="">累计用量趋势</option><option v-for="point in pointOptions" :key="String(point.id)" :value="String(point.point_code)">{{ point.point_name || point.point_code }} · {{ point.unit || '无单位' }}</option></AppSelect></label>
        <label v-if="kind === 'quality'" class="field"><span>汇总粒度</span><AppSelect v-model="trendGroup" :disabled="!!pointCode" @change="load"><option value="day">按日</option><option value="month">按月</option></AppSelect></label>
        <label v-if="kind !== 'quality'" class="field"><span>设备 SN</span><input v-model="deviceSn" placeholder="输入设备 SN" @keyup.enter="resolveDeviceSn"></label><button v-if="kind !== 'quality'" class="quiet" :disabled="loading" @click="resolveDeviceSn">按 SN 定位</button><label v-if="kind !== 'quality'" class="field"><span>设备</span><AppSelect v-model="deviceId" @change="selectDevice"><option value="">请选择设备</option><option v-for="device in deviceOptions" :key="String(device.id)" :value="String(device.id)">{{ device.device_name }} · {{ device.device_sn }}</option></AppSelect></label>
        <label v-if="kind !== 'quality'" class="field"><span>{{ kind === 'analysis' ? '测点组' : '测点' }}</span><AppSelect v-if="kind !== 'analysis'" v-model="pointCode"><option value="">默认负荷测点</option><option v-for="point in pointOptions" :key="String(point.id)" :value="String(point.point_code)">{{ point.point_name || point.point_code }} · {{ point.point_code }}</option></AppSelect><input v-else v-model="pointCodes" placeholder="多个测点用英文逗号分隔"></label>
        <label class="field"><span>开始日期</span><input v-model="startDate" type="date"></label>
        <label class="field"><span>结束日期</span><input v-model="endDate" type="date"></label>
        <div class="filter-actions">
          <button class="btn-primary" @click="kind === 'analysis' ? queryHistory() : load()">查询</button>
          <button class="quiet" @click="reset">重置</button>
        </div>
      </div>
    </article>

    <div v-if="kind === 'quality'" class="energy-drill-path">
      <span :class="{ active: !!orgId }"><b>组织</b>{{ drilldownBreadcrumb.map((item) => item.org_name).join(' / ') || '全部授权范围' }}</span>
      <i>→</i>
      <span :class="{ active: !!deviceId }"><b>设备</b>{{ selectedDevice?.device_name || '待选择' }}</span>
      <i>→</i>
      <span :class="{ active: !!pointCode }"><b>测点</b>{{ selectedPoint?.point_name || '累计用量' }}</span>
      <em>{{ payload.trendGranularity === 'HOUR' ? '小时级统计证据' : '日级累计用量' }}</em>
    </div>

    <div class="energy-metric-grid">
      <article v-for="item in energyMetrics" :key="item.label" class="energy-metric">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <em>{{ item.hint }}</em>
      </article>
    </div>

    <div v-if="kind === 'quality' && Object.keys(efficiencyOverview).length" class="energy-efficiency-strip">
      <span><b>峰平谷</b> 峰 {{ displayNumber(efficiencyTou.peak) }} / 平 {{ displayNumber(efficiencyTou.flat) }} / 谷 {{ displayNumber(efficiencyTou.valley) }}</span>
      <span><b>环比</b> {{ efficiencyComparison.periodOverPeriodRate != null ? `${displayNumber(efficiencyComparison.periodOverPeriodRate)}%` : '暂无对比基期' }}</span>
      <span><b>基线节能</b> {{ efficiencyBaseline.available ? `${displayNumber(efficiencyBaseline.savingRate)}%` : '未配置基线' }}</span>
      <span><b>数据完整率</b> {{ displayNumber(efficiencyOverview.dataCompleteRate) }}%</span>
    </div>

    <div class="energy-operation-grid" :class="{ 'quality-mode': kind === 'quality' }">
      <article class="panel energy-chart-panel">
        <div class="panel-head">
          <h3>{{ kind === 'analysis' ? '历史曲线' : kind === 'quality' ? (selectedPoint ? `${selectedPoint.point_name}小时趋势` : '累计能耗日趋势') : '运行趋势' }}</h3>
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
            <b>{{ displayNumber(item.value) }} <small>{{ item.unit }}</small></b>
            <small>{{ item.key }} · {{ item.quality }}</small>
          </article>
        </div>
      </article>

      <article v-else-if="kind === 'quality'" class="panel energy-side-panel">
        <div class="panel-head">
          <h3>用量排行</h3>
          <div class="head-actions">
            <button v-if="selectedPoint" class="link-btn" @click="goPointHistory">原始历史</button>
            <button class="link-btn" :class="{ active: rankingDimension === 'device' }" @click="rankingDimension = 'device'">设备</button>
            <button class="link-btn" :class="{ active: rankingDimension === 'org' }" @click="rankingDimension = 'org'">组织</button>
            <small>TOP {{ rankingRows.length }}</small>
          </div>
        </div>
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

<style scoped>
.energy-efficiency-strip{display:flex;gap:8px;min-height:34px;overflow:auto}.energy-efficiency-strip span{white-space:nowrap;border:1px solid #dbe7f6;background:#f8fbff;color:#47627f;padding:7px 10px;border-radius:8px;font-size:12px}.energy-efficiency-strip b{color:#1d4f91;margin-right:4px}
.energy-workbench-embedded{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:hidden}.energy-workbench-embedded .filter-card,.energy-workbench-embedded .energy-drill-path,.energy-workbench-embedded .energy-metric-grid,.energy-workbench-embedded .energy-operation-grid{flex:none;margin-top:0;margin-bottom:0}.energy-workbench-embedded :deep(.app-table){flex:1;min-height:0;margin-top:0;display:flex;flex-direction:column;overflow:hidden}.energy-workbench-embedded :deep(.table-scroll){flex:1;min-height:0}.energy-workbench-embedded :deep(.empty-state){min-height:0;flex:1}.energy-workbench-embedded :deep(.table-pagination){flex:none}
</style>
