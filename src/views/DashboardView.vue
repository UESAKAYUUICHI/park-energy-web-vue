<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, BellRing, Cpu, DatabaseZap, RadioTower, RefreshCw, Zap } from '@lucide/vue'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { init, use, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LegacyGridContainLabel } from 'echarts/features'
import { dashboard } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

use([LineChart, PieChart, GridComponent, TooltipComponent, LegacyGridContainLabel, CanvasRenderer])

const router = useRouter()
const payload = ref<RecordRow>({})
const loading = ref(false)
const error = ref('')
const updatedAt = ref('--')
const hourlyChartEl = ref<HTMLElement | null>(null)
const dailyChartEl = ref<HTMLElement | null>(null)
const deviceChartEl = ref<HTMLElement | null>(null)
let hourlyChart: ECharts | null = null
let dailyChart: ECharts | null = null
let deviceChart: ECharts | null = null

const objectValue = (value: unknown): RecordRow => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordRow : {}
const rows = (value: unknown): RecordRow[] => Array.isArray(value) ? value as RecordRow[] : []
const field = (row: RecordRow, ...keys: string[]) => keys.map(key => row[key]).find(value => value !== undefined && value !== null)
const numeric = (value: unknown) => Number(value || 0)
const integer = (value: unknown) => Math.round(numeric(value)).toLocaleString('zh-CN')
const decimal = (value: unknown, digits = 2) => numeric(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const metrics = computed(() => objectValue(payload.value.metrics))
const quality = computed(() => objectValue(payload.value.qualitySummary))
const deviceStatus = computed(() => objectValue(payload.value.deviceStatusSummary))
const devices = computed(() => rows(payload.value.deviceHealth))
const alarms = computed(() => rows(payload.value.latestAlarms))
const onlineDevices = computed(() => {
  const value = field(deviceStatus.value, 'online_count', 'onlineCount')
  return value === undefined ? devices.value.filter(row => numeric(field(row, 'status')) === 1 && numeric(field(row, 'online_status', 'onlineStatus')) === 1).length : numeric(value)
})
const offlineDevices = computed(() => {
  const value = field(deviceStatus.value, 'offline_count', 'offlineCount')
  return value === undefined ? Math.max(0, numeric(metrics.value.deviceCount) - onlineDevices.value) : numeric(value)
})
const cards = computed(() => [
  { label: '组织数量', value: integer(metrics.value.orgCount), unit: '个', note: '当前账号可见范围', icon: DatabaseZap, tone: 'blue' },
  { label: '在线网关', value: `${integer(metrics.value.onlineGatewayCount)} / ${integer(metrics.value.gatewayCount)}`, unit: '', note: '按网关实时状态统计', icon: RadioTower, tone: 'cyan' },
  { label: '设备总数', value: integer(metrics.value.deviceCount), unit: '台', note: `启用 ${integer(metrics.value.enabledDeviceCount)} 台`, icon: Cpu, tone: 'purple' },
  { label: '待处理告警', value: integer(metrics.value.pendingAlarmCount), unit: '条', note: '来自真实告警事件', icon: BellRing, tone: 'orange' },
])

function renderCharts() {
  const axis = { axisLine: { lineStyle: { color: '#dbe7ef' } }, axisLabel: { color: '#7f91a4' }, splitLine: { lineStyle: { color: '#eef3f6', type: 'dashed' } } }
  if (hourlyChartEl.value) {
    hourlyChart ||= init(hourlyChartEl.value)
    const source = new Map(rows(payload.value.hourlyTrend).map(row => [numeric(field(row, 'stat_hour', 'statHour')), numeric(field(row, 'usage_value', 'usageValue'))]))
    hourlyChart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} kWh` },
      grid: { left: 8, right: 16, top: 20, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, hour) => `${hour}:00`), ...axis },
      yAxis: { type: 'value', name: 'kWh', ...axis },
      series: [{ type: 'line', smooth: true, connectNulls: false, showSymbol: true, symbolSize: 5,
        data: Array.from({ length: 24 }, (_, hour) => source.has(hour) ? source.get(hour) : null),
        lineStyle: { color: '#12aaa6', width: 3 }, itemStyle: { color: '#12aaa6' }, areaStyle: { color: '#12aaa622' } }],
    }, true)
  }
  if (dailyChartEl.value) {
    dailyChart ||= init(dailyChartEl.value)
    const trend = rows(payload.value.energyTrend)
    dailyChart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} kWh` },
      grid: { left: 8, right: 16, top: 20, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: trend.map(row => String(field(row, 'stat_date', 'statDate') || '')), ...axis },
      yAxis: { type: 'value', name: 'kWh', ...axis },
      series: [{ type: 'line', smooth: true, showSymbol: true, data: trend.map(row => numeric(field(row, 'usage_value', 'usageValue'))),
        lineStyle: { color: '#3478c5', width: 3 }, itemStyle: { color: '#3478c5' }, areaStyle: { color: '#3478c51d' } }],
    }, true)
  }
  if (deviceChartEl.value) {
    deviceChart ||= init(deviceChartEl.value)
    deviceChart.setOption({
      tooltip: { trigger: 'item' }, color: ['#12aaa6', '#aab7c4'],
      series: [{ type: 'pie', radius: ['56%', '78%'], label: { formatter: '{b}\n{c} 台' },
        data: [{ name: '在线', value: onlineDevices.value }, { name: '离线或未接入', value: offlineDevices.value }] }],
    }, true)
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    payload.value = await dashboard()
    updatedAt.value = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date())
    await nextTick()
    renderCharts()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '总览数据加载失败'
  } finally {
    loading.value = false
  }
}

function resizeCharts() { hourlyChart?.resize(); dailyChart?.resize(); deviceChart?.resize() }
onMounted(() => { void load(); window.addEventListener('resize', resizeCharts) })
onBeforeUnmount(() => { window.removeEventListener('resize', resizeCharts); hourlyChart?.dispose(); dailyChart?.dispose(); deviceChart?.dispose() })
</script>

<template>
  <section class="dashboard-page">
    <header class="page-head">
      <div><p>DATA OVERVIEW</p><h1>数据总览</h1><span>组织范围内的设备、采集质量、能耗与告警真实数据</span></div>
      <div class="head-actions"><small>更新时间：{{ updatedAt }}</small><button :disabled="loading" @click="load"><RefreshCw :size="15" :class="{ spinning: loading }" />{{ loading ? '刷新中' : '刷新数据' }}</button></div>
    </header>

    <div v-if="error" class="error-banner"><AlertTriangle :size="18" />{{ error }}</div>

    <div class="metric-grid">
      <article v-for="item in cards" :key="item.label" class="metric-card" :class="item.tone">
        <component :is="item.icon" :size="22" /><div><span>{{ item.label }}</span><strong>{{ item.value }} <small>{{ item.unit }}</small></strong><em>{{ item.note }}</em></div>
      </article>
    </div>

    <div class="content-grid">
      <article class="panel hero-panel">
        <div class="panel-head"><div><h2>今日小时用电趋势</h2><p>仅汇总累计电能测点（TOTAL_ACCUMULATED）</p></div><strong>{{ decimal(metrics.todayUsage) }} <small>kWh</small></strong></div>
        <div ref="hourlyChartEl" class="chart"></div>
        <div v-if="!rows(payload.hourlyTrend).length" class="empty">今日尚无小时聚合数据，新上报会自动生成。</div>
      </article>

      <article class="panel quality-panel">
        <div class="panel-head"><div><h2>采集质量</h2><p>今日实收样本与期望样本</p></div></div>
        <div class="quality-value">{{ decimal(field(quality, 'complete_rate', 'completeRate')) }}<small>%</small></div>
        <div class="progress"><i :style="{ width: `${Math.min(100, numeric(field(quality, 'complete_rate', 'completeRate')))}%` }"></i></div>
        <dl><div><dt>实收样本</dt><dd>{{ integer(field(quality, 'received_samples', 'receivedSamples')) }}</dd></div><div><dt>期望样本</dt><dd>{{ integer(field(quality, 'expected_samples', 'expectedSamples')) }}</dd></div><div><dt>异常设备</dt><dd>{{ integer(field(quality, 'abnormal_device_count', 'abnormalDeviceCount')) }}</dd></div></dl>
        <button class="link-button" @click="router.push('/analysis/quality')">查看数据质量明细</button>
      </article>

      <article class="panel"><div class="panel-head"><div><h2>近 14 日用电趋势</h2><p>累计电能日用量</p></div></div><div ref="dailyChartEl" class="chart small-chart"></div><div v-if="!rows(payload.energyTrend).length" class="empty">暂无日统计数据。</div></article>
      <article class="panel"><div class="panel-head"><div><h2>设备运行状态</h2><p>以设备启用状态与所连网关在线状态判断</p></div></div><div ref="deviceChartEl" class="chart small-chart"></div></article>

      <article class="panel alarm-panel">
        <div class="panel-head"><div><h2>最新告警</h2><p>组织权限范围内最近事件</p></div><button class="link-button" @click="router.push('/alarms/events')">全部告警</button></div>
        <div class="table-wrap"><table><thead><tr><th>设备</th><th>告警内容</th><th>级别</th><th>发生时间</th></tr></thead><tbody><tr v-for="row in alarms" :key="String(field(row, 'id'))"><td>{{ field(row, 'device_name', 'deviceName') || '-' }}</td><td>{{ field(row, 'alarm_content', 'alarmContent', 'rule_name', 'ruleName') || '-' }}</td><td>{{ field(row, 'alarm_level', 'alarmLevel') || '-' }}</td><td>{{ field(row, 'alarm_time', 'alarmTime') || '-' }}</td></tr><tr v-if="!alarms.length"><td colspan="4" class="empty-cell">暂无告警数据</td></tr></tbody></table></div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.dashboard-page{display:grid;gap:18px;color:#173a58}.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.page-head p{margin:0 0 5px;color:#159f9b;font-size:11px;font-weight:800;letter-spacing:.16em}.page-head h1{margin:0;font-size:28px}.page-head span,.page-head small,.panel-head p{color:#7b8fa3}.head-actions{display:flex;align-items:center;gap:14px}.head-actions button,.link-button{display:inline-flex;align-items:center;gap:6px;border:1px solid #d7e3ea;border-radius:8px;background:#fff;color:#28709e;padding:8px 12px;cursor:pointer}.head-actions button:disabled{opacity:.6}.error-banner{display:flex;align-items:center;gap:8px;padding:12px 14px;border:1px solid #ffd1c7;border-radius:10px;background:#fff5f2;color:#b64a31}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.metric-card{display:flex;gap:13px;padding:18px;border:1px solid #e1e9ee;border-radius:14px;background:#fff;box-shadow:0 8px 24px #1d4d6e0b}.metric-card>svg{box-sizing:content-box;padding:10px;border-radius:10px;background:#edf7fb;color:#2580b3}.metric-card.cyan>svg{background:#e8faf8;color:#119b96}.metric-card.purple>svg{background:#f3effd;color:#7959bd}.metric-card.orange>svg{background:#fff4e9;color:#df7e2c}.metric-card span,.metric-card em{display:block;color:#7b8fa3;font-size:12px;font-style:normal}.metric-card strong{display:block;margin:5px 0;font-size:23px}.metric-card small,.panel-head strong small,.quality-value small{font-size:12px;font-weight:500}.content-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:14px}.panel{position:relative;min-width:0;padding:18px;border:1px solid #e1e9ee;border-radius:14px;background:#fff}.hero-panel{min-height:380px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.panel-head h2{margin:0;font-size:16px}.panel-head p{margin:5px 0 0;font-size:12px}.panel-head strong{font-size:22px;color:#159f9b}.chart{height:300px}.small-chart{height:260px}.empty{position:absolute;inset:90px 20px 20px;display:grid;place-items:center;color:#9aabba;pointer-events:none}.quality-value{margin:30px 0 10px;font-size:44px;font-weight:800;color:#12aaa6}.progress{height:9px;overflow:hidden;border-radius:9px;background:#eaf0f4}.progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2d83c1,#12aaa6)}dl{display:grid;gap:10px;margin:24px 0}dl div{display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #edf2f5}dt{color:#7b8fa3}dd{margin:0;font-weight:700}.alarm-panel{grid-column:1/-1}.table-wrap{overflow:auto;margin-top:12px}table{width:100%;border-collapse:collapse}th,td{padding:11px 10px;border-bottom:1px solid #edf2f5;text-align:left;font-size:13px}th{color:#71869a;font-weight:600}.empty-cell{text-align:center;color:#9aabba}.spinning{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,1fr)}.content-grid{grid-template-columns:1fr}}@media(max-width:650px){.page-head{align-items:flex-start;flex-direction:column}.head-actions{align-items:flex-start;flex-direction:column}.metric-grid{grid-template-columns:1fr}}
</style>
