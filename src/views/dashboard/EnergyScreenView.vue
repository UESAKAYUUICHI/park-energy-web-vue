<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Building2, ChevronDown, Gauge, MapPin, RefreshCw, Zap } from '@lucide/vue'
import { BarChart, LineChart, MapChart, PieChart, ScatterChart } from 'echarts/charts'
import { GeoComponent, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { init, registerMap, use, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { archiveTree, dashboard, energy, rootOrgs } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

use([BarChart, LineChart, MapChart, PieChart, ScatterChart, GeoComponent, GraphicComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

const router = useRouter()
const payload = ref<RecordRow>({})
const parkOptions = ref<RecordRow[]>([])
const selectedParkId = ref('')
const mapParkHighlighted = ref(false)
const loading = ref(false)
const error = ref('')
const updatedAt = ref('--')
const hourlyChartEl = ref<HTMLElement | null>(null)
const dailyChartEl = ref<HTMLElement | null>(null)
const statusChartEl = ref<HTMLElement | null>(null)
const breakdownChartEl = ref<HTMLElement | null>(null)
const qualityChartEl = ref<HTMLElement | null>(null)
const rankingChartEl = ref<HTMLElement | null>(null)
const chinaMapEl = ref<HTMLElement | null>(null)
let hourlyChart: ECharts | null = null
let dailyChart: ECharts | null = null
let statusChart: ECharts | null = null
let breakdownChart: ECharts | null = null
let qualityChart: ECharts | null = null
let rankingChart: ECharts | null = null
let chinaMapChart: ECharts | null = null
let wenzhouGraphics: RecordRow[] = []
let refreshTimer: ReturnType<typeof setInterval> | null = null

const campus = { address: '温州市瓯海区茶山高教园区', lat: 27.918407, lng: 120.691124 }
const objectValue = (value: unknown): RecordRow => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordRow : {}
const rows = (value: unknown): RecordRow[] => Array.isArray(value) ? value as RecordRow[] : []
const field = (row: RecordRow, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null)
const num = (value: unknown) => Number(value || 0)
const fmt = (value: unknown, digits = 0) => num(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const metrics = computed(() => objectValue(payload.value.metrics))
const devices = computed(() => rows(payload.value.deviceHealth))
const alarms = computed(() => rows(payload.value.latestAlarms).slice(0, 6))
const hourlyTrend = computed(() => rows(payload.value.hourlyTrend))
const dailyTrend = computed(() => rows(payload.value.energyTrend))
const energyRanking = computed(() => rows(payload.value.energyRanking))
const onlineCount = computed(() => num(field(objectValue(payload.value.deviceStatusSummary), 'online_count', 'onlineCount')) || devices.value.filter((row) => num(field(row, 'online_status', 'onlineStatus', 'status')) === 1).length)
const totalDevices = computed(() => num(metrics.value.deviceCount) || devices.value.length)
const onlineRate = computed(() => totalDevices.value ? Math.round((onlineCount.value / totalDevices.value) * 100) : 0)
const activeParkName = computed(() => String(parkOptions.value.find((row) => String(row.id) === selectedParkId.value)?.org_name || parkOptions.value.find((row) => String(row.id) === selectedParkId.value)?.name || '温州商学院'))
const mapPark = computed(() => parkOptions.value.find((row) => String(row.org_name || row.name || '').includes('温州商学院')) || parkOptions.value[0])

const disposeCharts = () => { hourlyChart?.dispose(); dailyChart?.dispose(); statusChart?.dispose(); breakdownChart?.dispose(); qualityChart?.dispose(); rankingChart?.dispose(); hourlyChart = null; dailyChart = null; statusChart = null; breakdownChart = null; qualityChart = null; rankingChart = null }
const updateParkCallout = () => {
  if (!chinaMapChart) return
  const point = chinaMapChart.convertToPixel({ geoIndex: 0 }, [campus.lng, campus.lat]) as number[]
  if (!Array.isArray(point) || point.length < 2) return
  const px = point[0] ?? 0
  const py = point[1] ?? 0
  if (!Number.isFinite(px) || !Number.isFinite(py) || px <= 0 || py <= 0) return
  const width = chinaMapChart.getWidth()
  const side = px > width * .62 ? -1 : 1
  const elbow = [px + side * 26, py - 52]
  const ex = elbow[0] ?? px
  const ey = elbow[1] ?? py
  const end = [ex + side * 188, ey]
  const endX = end[0] ?? ex
  const labelX = side > 0 ? ex + 9 : endX - 179
  const labelY = ey - 27
  const selected = mapParkHighlighted.value
  chinaMapChart.setOption({ graphic: [...wenzhouGraphics,
    { id: 'park-callout-short', type: 'line', shape: { x1: px, y1: py, x2: ex, y2: ey }, style: { stroke: selected ? '#fff2bd' : '#ffb34c', lineWidth: 2, shadowBlur: 8, shadowColor: '#ffad32' }, silent: true, z: 20 },
    { id: 'park-callout-long', type: 'line', shape: { x1: ex, y1: ey, x2: endX, y2: ey }, style: { stroke: selected ? '#fff2bd' : '#ffb34c', lineWidth: 2, shadowBlur: 8, shadowColor: '#ffad32' }, silent: true, z: 20 },
    { id: 'park-callout-box', type: 'rect', shape: { x: labelX, y: labelY, width: 178, height: 52, r: 3 }, style: { fill: selected ? '#16607d' : '#082d4b', stroke: selected ? '#fff2bd' : '#bfc8d2', lineWidth: selected ? 2 : 1, shadowBlur: selected ? 18 : 8, shadowColor: '#20c9ed' }, cursor: 'pointer', onclick: onMapParkClick, z: 21 },
    { id: 'park-callout-title', type: 'text', style: { x: labelX + 12, y: labelY + 20, text: activeParkName.value, fill: '#fff', font: 'bold 15px Microsoft YaHei', textVerticalAlign: 'middle' }, cursor: 'pointer', onclick: onMapParkClick, z: 22 },
    { id: 'park-callout-subtitle', type: 'text', style: { x: labelX + 12, y: labelY + 38, text: '温州商学院 · 点击查看园区数据', fill: '#9ed9ec', font: '10px Microsoft YaHei', textVerticalAlign: 'middle' }, cursor: 'pointer', onclick: onMapParkClick, z: 22 }
  ] })
}
const scheduleParkCallout = () => {
  window.requestAnimationFrame(() => window.setTimeout(() => updateParkCallout(), 120))
}
const onMapParkClick = async () => {
  mapParkHighlighted.value = true
  if (mapPark.value?.id !== undefined && mapPark.value?.id !== null) selectedParkId.value = String(mapPark.value.id)
  scheduleParkCallout()
  await loadPark()
}
const renderChinaMap = async () => {
  if (!chinaMapEl.value) return
  try {
    const [response, wenzhouResponse] = await Promise.all([
      fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'),
      fetch('https://geo.datav.aliyun.com/areas_v3/bound/330300_full.json')
    ])
    if (!response.ok) throw new Error('中国地图边界加载失败')
    const geoJson = await response.json()
    const wenzhouJson = wenzhouResponse.ok ? await wenzhouResponse.json() : null
    registerMap('china-energy', geoJson)
    chinaMapChart?.dispose(); chinaMapChart = init(chinaMapEl.value)
    chinaMapChart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: (params: RecordRow) => params.name || '中国' },
      geo: { map: 'china-energy', roam: false, silent: false, layoutCenter: ['50%', '50%'], layoutSize: '96%', itemStyle: { areaColor: '#0a3155', borderColor: '#2cc9f4', borderWidth: 1 }, emphasis: { itemStyle: { areaColor: '#2383a5' }, label: { color: '#fff' } }, regions: [{ name: '浙江省', itemStyle: { areaColor: '#176e91', borderColor: '#8feaff', borderWidth: 2 } }] },
      series: [{ type: 'scatter', coordinateSystem: 'geo', data: [{ name: '温州商学院', value: [campus.lng, campus.lat, 1] }], symbol: 'pin', symbolSize: 25, itemStyle: { color: '#ffd36b', borderColor: '#fff', borderWidth: 2, shadowBlur: 12, shadowColor: '#ffad32' }, label: { show: false } }]
    })
    wenzhouGraphics = []
    if (wenzhouJson?.features?.length) {
      const addRing = (ring: number[][], index: number) => {
        const points = ring.map((point) => chinaMapChart?.convertToPixel({ geoIndex: 0 }, point) as number[]).filter((point) => Array.isArray(point))
        if (points.length > 2) wenzhouGraphics.push({ type: 'polygon', id: `wenzhou-${index}`, shape: { points }, style: { fill: 'rgba(255, 183, 74, .42)', stroke: '#ffe1a0', lineWidth: 2, shadowBlur: 16, shadowColor: '#ff9b2f' }, silent: true, z: 10 } as RecordRow)
      }
      wenzhouJson.features.forEach((feature: RecordRow, featureIndex: number) => {
        const geometry = objectValue(feature.geometry)
        const coordinates = geometry.coordinates
        if (geometry.type === 'Polygon') (coordinates as number[][][]).forEach((ring, index) => addRing(ring, featureIndex * 10 + index))
        if (geometry.type === 'MultiPolygon') (coordinates as number[][][][]).forEach((polygon, polygonIndex) => polygon.forEach((ring, ringIndex) => addRing(ring, featureIndex * 100 + polygonIndex * 10 + ringIndex)))
      })
    }
    scheduleParkCallout()
  } catch (e) { error.value = e instanceof Error ? e.message : '中国地图边界加载失败' }
}
const renderCharts = async () => {
  await nextTick(); disposeCharts()
  if (hourlyChartEl.value) {
    hourlyChart = init(hourlyChartEl.value)
    const source = hourlyTrend.value
    hourlyChart.setOption({ grid: { left: 34, right: 14, top: 14, bottom: 24 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: source.map((r) => field(r, 'label', 'time', 'hour') ?? ''), axisLabel: { color: '#7291b4', fontSize: 10 } }, yAxis: { type: 'value', axisLabel: { color: '#7291b4', fontSize: 10 }, splitLine: { lineStyle: { color: '#173553' } } }, series: [{ type: 'line', smooth: true, symbol: 'none', data: source.map((r) => num(field(r, 'value', 'energy', 'total'))), lineStyle: { color: '#18d6ff', width: 2 }, areaStyle: { color: 'rgba(24,214,255,.16)' } }] })
  }
  if (dailyChartEl.value) {
    dailyChart = init(dailyChartEl.value)
    const source = dailyTrend.value
    dailyChart.setOption({ grid: { left: 34, right: 14, top: 14, bottom: 24 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: source.map((r) => field(r, 'label', 'time', 'date') ?? ''), axisLabel: { color: '#7291b4', fontSize: 10 } }, yAxis: { type: 'value', axisLabel: { color: '#7291b4', fontSize: 10 }, splitLine: { lineStyle: { color: '#173553' } } }, series: [{ type: 'line', smooth: true, symbol: 'circle', symbolSize: 4, data: source.map((r) => num(field(r, 'value', 'energy', 'total'))), lineStyle: { color: '#ffac43', width: 2 }, itemStyle: { color: '#ffcf77' } }] })
  }
  if (statusChartEl.value) {
    statusChart = init(statusChartEl.value)
    statusChart.setOption({ tooltip: { trigger: 'item' }, legend: { bottom: 0, textStyle: { color: '#86a6c8', fontSize: 11 } }, series: [{ type: 'pie', radius: ['58%', '78%'], center: ['50%', '43%'], label: { show: false }, data: [{ value: onlineCount.value, name: '在线', itemStyle: { color: '#18d6ff' } }, { value: Math.max(totalDevices.value - onlineCount.value, 0), name: '离线', itemStyle: { color: '#4c5c73' } }] }] })
  }
  if (rankingChartEl.value) {
    rankingChart = init(rankingChartEl.value)
    const source = energyRanking.value.slice(0, 8)
    rankingChart.setOption({ grid: { left: 70, right: 18, top: 12, bottom: 24 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'value', axisLabel: { color: '#7291b4', fontSize: 9 }, splitLine: { lineStyle: { color: '#173553' } } }, yAxis: { type: 'category', inverse: true, data: source.map((r) => field(r, 'device_name', 'deviceName', 'org_name') ?? ''), axisLabel: { color: '#a8c7df', fontSize: 10 } }, series: [{ type: 'bar', barWidth: 9, data: source.map((r) => num(field(r, 'usage_value', 'usageValue'))), itemStyle: { color: '#20c9ed', borderRadius: [0, 4, 4, 0] } }] })
  }
  if (breakdownChartEl.value) {
    breakdownChart = init(breakdownChartEl.value)
    const source = energyRanking.value.slice(0, 6)
    breakdownChart.setOption({ tooltip: { trigger: 'item' }, legend: { bottom: 0, type: 'scroll', textStyle: { color: '#86a6c8', fontSize: 10 } }, series: [{ type: 'pie', radius: ['48%', '72%'], center: ['50%', '42%'], label: { show: false }, data: source.map((r, index) => ({ value: num(field(r, 'usage_value', 'usageValue')), name: String(field(r, 'device_name', 'deviceName', 'org_name') || `设备${index + 1}`) })) }] })
  }
  if (qualityChartEl.value) {
    qualityChart = init(qualityChartEl.value)
    const source = hourlyTrend.value
    qualityChart.setOption({ grid: { left: 34, right: 14, top: 14, bottom: 24 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: source.map((r) => field(r, 'stat_hour', 'statHour', 'hour') ?? ''), axisLabel: { color: '#7291b4', fontSize: 10 } }, yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#7291b4', fontSize: 9, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#173553' } } }, series: [{ type: 'line', smooth: true, symbol: 'none', data: source.map((r) => num(field(r, 'complete_rate', 'completeRate'))), lineStyle: { color: '#9e83ff', width: 2 }, areaStyle: { color: 'rgba(158,131,255,.15)' } }] })
  }
}
const loadPark = async (parkId = selectedParkId.value) => {
  loading.value = true; error.value = ''
  try {
    const rootOrgId = parkId && /^\d+$/.test(parkId) ? Number(parkId) : undefined
    const [dashboardPayload, rankingPayload] = await Promise.all([
      dashboard(rootOrgId ? { rootOrgId } : {}),
      energy('ranking', rootOrgId ? { orgId: rootOrgId, includeChildren: true, limit: 8 } : { limit: 8 })
    ])
    payload.value = objectValue(dashboardPayload)
    payload.value.energyRanking = Array.isArray(rankingPayload) ? rankingPayload : rows(objectValue(rankingPayload).rows || objectValue(rankingPayload).data)
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    await renderCharts(); scheduleParkCallout()
  } catch (e) { error.value = e instanceof Error ? e.message : '能源数据暂时无法加载' } finally { loading.value = false }
}
const load = async () => {
  try {
    const tree = await archiveTree()
    parkOptions.value = rows(tree)
    if (!parkOptions.value.length) parkOptions.value = rows(await rootOrgs())
    const matched = parkOptions.value[0]
    if (matched) selectedParkId.value = String(matched.id)
  } catch { try { parkOptions.value = rows(await rootOrgs()) } catch { parkOptions.value = [] } }
  await loadPark()
}
const selectPark = async (event: Event) => { mapParkHighlighted.value = false; selectedParkId.value = (event.target as HTMLSelectElement).value; await loadPark() }
onMounted(() => { load(); renderChinaMap(); refreshTimer = setInterval(() => loadPark(), 60000); window.addEventListener('resize', renderCharts); window.addEventListener('resize', scheduleParkCallout) })
onBeforeUnmount(() => { if (refreshTimer) clearInterval(refreshTimer); window.removeEventListener('resize', renderCharts); window.removeEventListener('resize', scheduleParkCallout); disposeCharts(); chinaMapChart?.dispose() })
</script>

<template>
  <main class="energy-screen">
    <header class="screen-header">
      <div class="header-side"><span class="live-dot" /> LIVE&nbsp; ENERGY MONITOR</div>
      <div class="screen-title"><span>园区智慧能源管理系统</span><small>SMART PARK ENERGY COMMAND CENTER</small></div>
      <div class="header-side right"><span>{{ updatedAt }}</span><button class="header-button" @click="router.back()">退出大屏</button></div>
    </header>
    <section class="top-metrics">
      <article class="metric-card"><Building2 /><div><small>当前园区</small><strong>{{ activeParkName }}</strong><em>CHOSEN PARK</em></div></article>
      <article class="metric-card"><Zap /><div><small>今日累计能耗</small><strong>{{ fmt(field(metrics, 'todayUsage', 'today_usage'), 1) }} <b>kWh</b></strong><em>REAL-TIME LOAD</em></div></article>
      <article class="metric-card"><Gauge /><div><small>设备在线率</small><strong>{{ onlineRate }}<b>%</b></strong><em>{{ onlineCount }} / {{ totalDevices }} DEVICES</em></div></article>
      <article class="park-select"><label>园区数据视角</label><div><MapPin /><select :value="selectedParkId" @change="selectPark"><option v-if="!parkOptions.length" value="">温州商学院</option><option v-for="park in parkOptions" :key="String(park.id)" :value="park.id">{{ park.org_name || park.name || '未命名园区' }}</option></select><ChevronDown /></div></article>
    </section>
    <div v-if="error" class="screen-error">{{ error }} <button @click="loadPark()">重试</button></div>
    <section class="screen-grid">
      <aside class="screen-column">
        <section class="hud-panel overview-panel"><div class="panel-title"><span>园区运行总览</span><i>OVERVIEW / 01</i></div><div class="overview-number"><strong>{{ fmt(field(metrics, 'todayUsage', 'today_usage'), 1) }}</strong><span>kWh<br><small>今日用能</small></span></div><div class="overview-lines"><p><span>应收金额</span><b>¥ {{ fmt(field(metrics, 'totalReceivable', 'total_receivable'), 2) }}</b></p><p><span>设备总数</span><b>{{ fmt(field(metrics, 'deviceCount', 'device_count')) }} 台</b></p><p><span>异常告警</span><b class="warn">{{ fmt(field(metrics, 'pendingAlarmCount', 'pending_alarm_count')) }} 条</b></p></div></section>
        <section class="hud-panel chart-panel"><div class="panel-title"><span>24小时负荷曲线</span><i>HOURLY LOAD</i></div><div ref="hourlyChartEl" class="chart" /></section>
        <section class="hud-panel chart-panel compact"><div class="panel-title"><span>设备状态</span><i>DEVICE HEALTH</i></div><div ref="statusChartEl" class="chart" /></section>
        <section class="hud-panel chart-panel compact"><div class="panel-title"><span>设备能耗排行</span><i>DEVICE RANKING</i></div><div ref="rankingChartEl" class="chart" /></section>
      </aside>
      <section class="hud-panel china-panel">
        <div class="map-heading"><div><span>园区空间态势</span><small>REGIONAL ENERGY MAP / CHINA</small></div><span class="map-coord">{{ campus.lat }}°N&nbsp;&nbsp;{{ campus.lng }}°E</span></div>
        <div class="map-stage"><div class="map-grid" /><div ref="chinaMapEl" class="china-map" /><div class="map-caption"><span class="live-dot" /> 当前选中：{{ activeParkName }}<small>{{ campus.address }} · 浙江省域高亮 · 温州园区定位</small></div></div>
      </section>
      <aside class="screen-column">
        <section class="hud-panel chart-panel"><div class="panel-title"><span>近12期能耗趋势</span><i>ENERGY TREND</i></div><div ref="dailyChartEl" class="chart" /></section>
        <section class="hud-panel alarm-panel"><div class="panel-title"><span>实时告警</span><i>ALARM FEED / {{ alarms.length }}</i></div><div v-if="!alarms.length" class="empty-state">当前没有未处理告警</div><div v-for="(alarm, index) in alarms" :key="String(alarm.id || index)" class="alarm-row"><AlertTriangle /><div><b>{{ field(alarm, 'title', 'alarm_name', 'name') || '能源设备告警' }}</b><small>{{ field(alarm, 'device_name', 'deviceName', 'point_name') || '关联测点' }} · {{ field(alarm, 'occur_time', 'occurTime', 'created_at') || '--' }}</small></div><em>{{ field(alarm, 'level', 'alarm_level') || '关注' }}</em></div></section>
        <section class="hud-panel chart-panel compact"><div class="panel-title"><span>采集完整率</span><i>DATA QUALITY</i></div><div ref="qualityChartEl" class="chart" /></section>
        <section class="hud-panel chart-panel compact"><div class="panel-title"><span>分项能耗占比</span><i>ENERGY MIX</i></div><div ref="breakdownChartEl" class="chart" /></section>
      </aside>
    </section>
    <footer class="screen-footer"><span>DATA SOURCE · IoT DEVICE / METERING / BILLING</span><span>系统每 60 秒自动刷新 · {{ loading ? '数据同步中...' : '数据已同步' }}</span></footer>
  </main>
</template>

<style scoped>
:global(body){margin:0;background:#020b17;color:#d7edff;font-family:"Microsoft YaHei",Arial,sans-serif}.energy-screen{min-height:100vh;box-sizing:border-box;padding:20px 30px 18px;background:radial-gradient(circle at 50% 34%,#0a2946 0,#041426 38%,#020914 78%);overflow:hidden;position:relative}.energy-screen:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.24;background:linear-gradient(transparent 49%,rgba(41,129,186,.18) 50%,transparent 51%),linear-gradient(90deg,transparent 49%,rgba(41,129,186,.1) 50%,transparent 51%);background-size:100% 5px,5px 100%}.screen-header{height:74px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid #17476b;position:relative}.header-side{color:#5b9bc8;font:11px/1.4 "Arial";letter-spacing:2px}.header-side.right{text-align:right}.screen-title{text-align:center;padding:10px 80px;background:linear-gradient(90deg,transparent,#0a4b7e 22%,#128ad0 50%,#0a4b7e 78%,transparent);clip-path:polygon(9% 0,91% 0,100% 50%,91% 100%,9% 100%,0 50%)}.screen-title span{display:block;font-size:25px;font-weight:700;letter-spacing:8px;color:#e4f8ff;text-shadow:0 0 18px #21c9ff}.screen-title small{display:block;color:#7ec7ec;letter-spacing:4px;font-size:9px;margin-top:5px}.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#28ecff;box-shadow:0 0 11px #28ecff;vertical-align:middle}.header-button{margin-left:18px;padding:5px 11px;color:#79b9df;border:1px solid #245778;background:transparent}.top-metrics{display:grid;grid-template-columns:repeat(3,1fr) 1.25fr;gap:14px;margin:18px 0}.metric-card,.park-select{background:linear-gradient(135deg,rgba(8,44,74,.9),rgba(5,24,45,.76));border:1px solid #1b5478;min-height:76px;display:flex;align-items:center;padding:0 18px;position:relative;clip-path:polygon(0 0,97% 0,100% 25%,100% 100%,3% 100%,0 75%)}.metric-card svg{color:#24c8ef;width:25px;margin-right:13px}.metric-card small,.park-select label{display:block;color:#82a9c8;font-size:11px}.metric-card strong{display:block;color:#f1fbff;font-size:24px;line-height:1.45}.metric-card strong b{font-size:11px;color:#7eb5d7;margin-left:4px}.metric-card em{font-size:9px;color:#39739b;font-style:normal;letter-spacing:1px}.park-select{display:block;padding:12px 16px}.park-select label{margin-bottom:7px;color:#79abc9}.park-select div{display:flex;align-items:center;gap:8px}.park-select svg{width:15px;color:#ffb54d}.park-select select{background:transparent;border:0;color:#f0fbff;outline:none;flex:1;font-size:16px}.park-select option{background:#08243d;color:#fff}.screen-error{border:1px solid #a84e40;color:#ffb0a2;padding:9px 14px;margin-bottom:12px;background:#311d26}.screen-error button{float:right;color:#ffd0c5;background:none;border:0}.screen-grid{display:grid;grid-template-columns:275px minmax(480px,1fr) 300px;gap:14px;position:relative}.screen-column{display:flex;flex-direction:column;gap:14px}.hud-panel{border:1px solid #1a4e73;background:linear-gradient(145deg,rgba(6,34,59,.94),rgba(3,17,32,.9));box-shadow:inset 0 0 28px rgba(8,102,161,.1);position:relative}.hud-panel:after{content:"";position:absolute;top:-1px;left:16px;width:38px;height:2px;background:#2bd8ff;box-shadow:0 0 10px #2bd8ff}.panel-title{display:flex;justify-content:space-between;align-items:center;padding:13px 14px 10px;border-bottom:1px solid #163d5c;color:#e0f4ff;font-size:14px}.panel-title i{color:#4d82a8;font-size:9px;font-style:normal;letter-spacing:1px}.overview-panel{padding-bottom:12px}.overview-number{display:flex;align-items:end;padding:16px 15px 10px}.overview-number strong{font-size:32px;color:#d8f9ff;text-shadow:0 0 14px #13adcf}.overview-number span{color:#6d9bbb;font-size:12px;padding:0 0 5px 8px}.overview-number small{font-size:10px}.overview-lines{padding:0 15px}.overview-lines p{display:flex;justify-content:space-between;border-top:1px solid #143750;padding:9px 0;margin:0;color:#6f96b6;font-size:12px}.overview-lines b{color:#d8efff;font-weight:500}.overview-lines b.warn{color:#ffb04c}.chart-panel{min-height:164px}.chart-panel.compact{min-height:170px}.chart{height:135px;padding:2px 6px}.alarm-panel{min-height:250px}.alarm-row{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #12334e}.alarm-row>svg{color:#ffad46;width:15px}.alarm-row div{flex:1;min-width:0}.alarm-row b{display:block;color:#d9efff;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.alarm-row small{display:block;color:#6689a6;font-size:10px;margin-top:4px}.alarm-row em{font-size:10px;color:#ffad46;font-style:normal}.empty-state{padding:28px 14px;text-align:center;color:#6e99b7;font-size:12px}.china-panel{min-height:630px;overflow:hidden}.map-heading{display:flex;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #174464}.map-heading span{display:block;font-size:17px;color:#e2f7ff}.map-heading small{display:block;color:#5686a7;font:9px Arial;letter-spacing:2px;margin-top:5px}.map-coord{font:10px Arial!important;color:#3e87b1!important;align-self:center}.map-stage{height:548px;position:relative}.map-grid{position:absolute;inset:0;opacity:.32;background:linear-gradient(rgba(46,150,204,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(46,150,204,.16) 1px,transparent 1px);background-size:36px 36px;mask-image:radial-gradient(circle at center,black,transparent 72%)}.china-map{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.china-shape{fill:url(#land);stroke:#2bcfff;stroke-width:2;filter:url(#glow);opacity:.91}.map-route{fill:none;stroke:#ffb34c;stroke-width:2;stroke-dasharray:4 5;filter:url(#glow)}.map-point{fill:#fff1bc;stroke:#ff9f37;stroke-width:4;filter:url(#glow)}.map-pulse{fill:none;stroke:#ffae44;stroke-width:2;opacity:.8;animation:pulse 1.8s infinite}.map-label rect{fill:#082d4b;stroke:#ffb14a;stroke-width:1}.map-label text:first-child{fill:#fff1ce;font-size:17px;font-weight:700}.map-label text{fill:#69a2c4;font-size:9px}.map-city{fill:#4d88ae;font-size:11px}.map-caption{position:absolute;bottom:20px;left:22px;color:#b8e6f8;font-size:12px}.map-caption small{display:block;color:#4c83a5;font-size:10px;margin:7px 0 0 14px}.rank-panel{min-height:190px}.rank-row{display:flex;align-items:center;gap:9px;padding:9px 12px;color:#6f99b7}.rank-row>span{font:11px Arial;color:#3d759b}.rank-row div{flex:1}.rank-row b{display:block;font-size:11px;color:#cfe8f7;font-weight:400}.rank-row i{display:block;height:3px;background:#143852;margin-top:6px}.rank-row i span{display:block;height:100%;background:linear-gradient(90deg,#16c8f2,#f8a840)}.rank-row strong{font-size:11px;color:#e8f7ff}.screen-footer{display:flex;justify-content:space-between;color:#3e6e8f;font:10px Arial;letter-spacing:1px;padding-top:12px}.header-button:hover{border-color:#28cfff;color:#fff}@keyframes pulse{0%{transform:scale(.8);opacity:1}70%{transform:scale(2.2);opacity:0}100%{opacity:0}}@media (max-width:1100px){.screen-grid{grid-template-columns:230px minmax(380px,1fr) 250px}.energy-screen{padding:14px}.screen-title{padding:8px 25px}.screen-title span{font-size:20px}}@media (max-width:820px){.energy-screen{overflow:auto}.screen-header{grid-template-columns:1fr}.header-side{display:none}.screen-title{margin:auto}.top-metrics{grid-template-columns:1fr 1fr}.screen-grid{grid-template-columns:1fr}.china-panel{order:-1}.map-stage{height:480px}}
.data-panel{min-height:155px}.data-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid #12334e}.data-row b,.data-row small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}.data-row b{font-size:11px;color:#d9efff}.data-row small{font-size:10px;color:#6689a6;margin-top:3px}.data-row strong{font-size:11px;color:#ffd27a;white-space:nowrap}.quality-panel{min-height:105px}.quality-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;padding:14px 8px}.quality-grid div{text-align:center;border-right:1px solid #173b58}.quality-grid div:last-child{border-right:0}.quality-grid strong{display:block;color:#d9f8ff;font:700 18px Arial}.quality-grid small{display:block;color:#6d99b8;font-size:9px;margin-top:5px}.energy-screen{height:100vh;min-height:0;display:flex;flex-direction:column}.screen-grid{flex:1;min-height:0;align-items:stretch}.screen-column{min-height:0;overflow:hidden}.china-panel{min-height:0;display:flex;flex-direction:column}.map-stage{height:auto;flex:1;min-height:0}:global(body){background:var(--bg);color:var(--fg)}
</style>
<style scoped>
:global(body){background:var(--bg);color:var(--fg)}
.energy-screen{padding:clamp(8px,1.4vw,20px) clamp(10px,2vw,30px) 8px}
.screen-header{height:clamp(48px,7vh,74px)}
.top-metrics{margin:clamp(8px,1.2vh,18px) 0;gap:clamp(8px,1vw,14px)}
.metric-card,.park-select{min-height:clamp(56px,8vh,76px);padding-left:clamp(10px,1.2vw,18px);padding-right:clamp(10px,1.2vw,18px)}
.metric-card strong{font-size:clamp(17px,1.65vw,24px)}
.screen-grid{grid-template-columns:300px minmax(360px,1fr) 300px;gap:clamp(8px,1vw,14px)}
.china-panel{min-width:0}.chart{height:clamp(76px,11vh,135px)}.chart-panel{min-height:clamp(105px,15vh,164px)}.chart-panel.compact{min-height:clamp(100px,14vh,170px)}.alarm-panel{min-height:clamp(180px,22vh,250px)}
.panel-title{padding:clamp(8px,1vh,13px) 12px 8px}.china-panel .map-heading{padding:clamp(9px,1.3vh,16px) 14px}.map-stage{min-width:0}.screen-footer{padding-top:5px}
@media (max-width:1200px){.screen-grid{grid-template-columns:235px minmax(340px,1fr) 235px}.screen-title span{font-size:clamp(16px,2.2vw,25px);letter-spacing:clamp(3px,0.5vw,8px)}}
@media (max-height:820px){.top-metrics{margin:7px 0}.metric-card,.park-select{min-height:52px}.metric-card em{display:none}.overview-number{padding:8px 12px 5px}.overview-number strong{font-size:24px}.overview-lines p{padding:5px 0}.screen-footer{display:none}}
</style>
