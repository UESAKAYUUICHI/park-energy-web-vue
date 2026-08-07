<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Activity, BellRing, ChevronRight, CircleAlert, Cpu, Factory, Gauge, Leaf, RadioTower, RefreshCw, Zap } from '@lucide/vue'
import { BarChart, GraphChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([BarChart, GraphChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const router = useRouter()
const refreshing = ref(false)
const updatedAt = ref('2026-08-07 10:30')
const deviceStatusChartEl = ref<HTMLElement | null>(null)
const alarmDistributionChartEl = ref<HTMLElement | null>(null)
const campusChartEl = ref<HTMLElement | null>(null)
const energyTrendChartEl = ref<HTMLElement | null>(null)
const distributionChartEl = ref<HTMLElement | null>(null)
let deviceStatusChart: ECharts | null = null
let alarmDistributionChart: ECharts | null = null
let campusChart: ECharts | null = null
let energyTrendChart: ECharts | null = null
let distributionChart: ECharts | null = null

const stats = [
  { label: '接入园区', value: '3', unit: '个', note: '组织范围内园区', icon: Factory, tone: 'blue' },
  { label: '在线网关', value: '14 / 16', unit: '', note: '87.5% 在线率', icon: RadioTower, tone: 'cyan' },
  { label: '设备总数', value: '139', unit: '台', note: '较昨日 +2 台', icon: Cpu, tone: 'purple' },
  { label: '待处理告警', value: '5', unit: '条', note: '2 条需优先处理', icon: BellRing, tone: 'orange' },
]
const energyStats = [
  { label: '今日用电量', value: '2,830.6', unit: 'kWh', trend: '较昨日 -4.9%', icon: Zap },
  { label: '综合能耗', value: '348.2', unit: 'kgce', trend: '同比 -6.2%', icon: Gauge },
  { label: '碳减排量', value: '2,046.7', unit: 'kg', trend: '较昨日 +3.8%', icon: Leaf },
]
const alarmRows = [
  { level: '一般', device: 'A 区综合配电箱', event: 'A 相电压偏高', time: '10:26:18' },
  { level: '严重', device: '冷站 2# 循环泵', event: '连续 15 分钟无采集数据', time: '10:12:06' },
  { level: '一般', device: '研发楼分表 3F', event: '瞬时功率突变', time: '09:48:32' },
  { level: '提示', device: 'B 区充电桩群', event: '通信质量低于阈值', time: '09:31:50' },
]

const axisStyle = { axisLine: { lineStyle: { color: '#dbe7ef' } }, axisLabel: { color: '#7f91a4', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef3f6', type: 'dashed' } } }

function renderCharts() {
  if (deviceStatusChartEl.value) {
    deviceStatusChart ||= init(deviceStatusChartEl.value)
    deviceStatusChart.setOption({
      tooltip: { trigger: 'item' },
      color: ['#12bdb9', '#9aa8b8', '#f29a4a'],
      title: { text: '139', subtext: '设备总数', left: '31%', top: '38%', textAlign: 'center', textStyle: { color: '#173a58', fontSize: 25, fontWeight: 700 }, subtextStyle: { color: '#8193a5', fontSize: 11 } },
      series: [{ type: 'pie', radius: ['55%', '77%'], center: ['31%', '52%'], avoidLabelOverlap: false, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 }, label: { show: false }, data: [{ value: 126, name: '正常运行' }, { value: 8, name: '离线待查' }, { value: 5, name: '告警设备' }] }],
      graphic: [
        ...[['正常运行', '126 台', '#12bdb9'], ['离线待查', '8 台', '#9aa8b8'], ['告警设备', '5 台', '#f29a4a']].flatMap((item, index) => [
          { type: 'circle', left: '64%', top: `${24 + index * 24}%`, shape: { r: 4 }, style: { fill: item[2] } },
          { type: 'text', left: '68%', top: `${20 + index * 24}%`, style: { text: item[0], fill: '#61758a', font: '12px sans-serif' } },
          { type: 'text', right: '7%', top: `${20 + index * 24}%`, style: { text: item[1], fill: '#173a58', font: '600 12px sans-serif', textAlign: 'right' } },
        ]),
      ],
    }, true)
  }
  if (alarmDistributionChartEl.value) {
    alarmDistributionChart ||= init(alarmDistributionChartEl.value)
    alarmDistributionChart.setOption({
      tooltip: { trigger: 'axis' }, legend: { data: ['已处理', '待处理'], right: 4, top: 0, textStyle: { color: '#7f91a4', fontSize: 10 } }, grid: { left: 8, right: 8, top: 32, bottom: 22, containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: ['07.29', '07.30', '07.31', '08.01', '08.02', '08.03', '08.04', '08.05', '08.06', '08.07'], ...axisStyle }, yAxis: { type: 'value', minInterval: 1, ...axisStyle },
      series: [{ name: '已处理', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: [3, 2, 4, 5, 3, 6, 4, 7, 5, 6], lineStyle: { color: '#12bdb9', width: 2 }, itemStyle: { color: '#12bdb9' }, areaStyle: { color: '#12bdb921' } }, { name: '待处理', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, data: [1, 2, 1, 3, 2, 2, 3, 1, 2, 1], lineStyle: { color: '#f29a4a', width: 2 }, itemStyle: { color: '#f29a4a' } }],
    }, true)
  }
  if (campusChartEl.value) {
    campusChart ||= init(campusChartEl.value)
    campusChart.setOption({
      tooltip: { formatter: (params: { data: { name: string; detail?: string } }) => `<b>${params.data.name}</b><br/>${params.data.detail || '统一能源数据中心'}` },
      series: [{ type: 'graph', layout: 'none', roam: true, symbol: 'roundRect', edgeSymbol: ['none', 'arrow'], edgeSymbolSize: [0, 9], label: { show: true, position: 'inside', color: '#fff', fontSize: 12, fontWeight: 600 }, lineStyle: { color: '#5bbbc9', width: 2, curveness: 0.12 }, emphasis: { focus: 'adjacency', lineStyle: { width: 4 } }, data: [
        { name: '智园能管', x: 260, y: 190, symbolSize: [130, 64], itemStyle: { color: '#1676b7', shadowBlur: 14, shadowColor: '#1676b744' }, detail: '统一能源数据中心' },
        { name: '研发园区', x: 260, y: 45, symbolSize: [112, 48], itemStyle: { color: '#11aaa7' }, detail: '52 台设备 · 全部在线' },
        { name: '制造园区', x: 74, y: 260, symbolSize: [112, 48], itemStyle: { color: '#238bbf' }, detail: '61 台设备 · 2 条告警' },
        { name: '物流园区', x: 446, y: 260, symbolSize: [112, 48], itemStyle: { color: '#4a91d1' }, detail: '26 台设备 · 1 台离线' },
        { name: '数据质量 98.6%', x: 260, y: 332, symbolSize: [164, 34], itemStyle: { color: '#effaf9', borderColor: '#7ad9d5', borderWidth: 1 }, label: { color: '#16837f', fontSize: 11 }, detail: '最近上报 10:30:18' },
      ], links: [{ source: '智园能管', target: '研发园区' }, { source: '智园能管', target: '制造园区' }, { source: '智园能管', target: '物流园区' }, { source: '智园能管', target: '数据质量 98.6%' }] }],
    }, true)
  }
  if (energyTrendChartEl.value) {
    energyTrendChart ||= init(energyTrendChartEl.value)
    energyTrendChart.setOption({
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} kWh` }, grid: { left: 4, right: 8, top: 18, bottom: 22, containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: Array.from({ length: 24 }, (_, index) => `${index}:00`), axisLabel: { color: '#8193a5', fontSize: 9, interval: 2 }, axisLine: { lineStyle: { color: '#dbe7ef' } } }, yAxis: { type: 'value', ...axisStyle },
      series: [{ name: '用电量', type: 'line', smooth: true, showSymbol: false, data: [220,214,216,211,205,198,184,188,244,286,298,268,256,249,238,231,226,217,212,205,198,193,188,182], lineStyle: { color: '#12bdb9', width: 2.5 }, areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#12bdb955' }, { offset: 1, color: '#12bdb905' }]) }, markPoint: { data: [{ type: 'max', name: '峰值' }], symbolSize: 34, itemStyle: { color: '#f29a4a' }, label: { color: '#fff', fontSize: 9 } } }],
    }, true)
  }
  if (distributionChartEl.value) {
    distributionChart ||= init(distributionChartEl.value)
    distributionChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: 4, right: 8, top: 12, bottom: 20, containLabel: true },
      xAxis: { type: 'category', data: ['0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22'], axisLabel: { color: '#8193a5', fontSize: 9 }, axisLine: { lineStyle: { color: '#dbe7ef' } } }, yAxis: { type: 'value', ...axisStyle },
      series: [{ type: 'bar', barWidth: 12, data: [46,43,41,39,35,32,29,33,48,55,58,52], itemStyle: { borderRadius: [5, 5, 0, 0], color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#48d7d1' }, { offset: 1, color: '#1596c5' }]) } }],
    }, true)
  }
}

function resizeCharts() { [deviceStatusChart, alarmDistributionChart, campusChart, energyTrendChart, distributionChart].forEach((chart) => chart?.resize()) }
function go(path: string) { void router.push(path) }
function refresh() {
  refreshing.value = true
  window.setTimeout(() => {
    updatedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
    refreshing.value = false
    renderCharts()
  }, 500)
}

onMounted(async () => { await nextTick(); renderCharts(); window.addEventListener('resize', resizeCharts) })
onBeforeUnmount(() => { window.removeEventListener('resize', resizeCharts); [deviceStatusChart, alarmDistributionChart, campusChart, energyTrendChart, distributionChart].forEach((chart) => chart?.dispose()) })
</script>

<template>
  <section class="view-page data-overview-page">
    <header class="overview-head"><div><p class="eyebrow">DATA OVERVIEW</p><h1>数据总览</h1><span>园区能源运行、采集状态与告警事件的统一视图</span></div><div class="overview-head-actions"><small>数据更新时间：{{ updatedAt }}</small><button class="quiet" :disabled="refreshing" @click="refresh"><RefreshCw :size="15" :class="{ spinning: refreshing }" />{{ refreshing ? '刷新中' : '刷新数据' }}</button></div></header>
    <main class="overview-layout">
      <section class="overview-column left-column">
        <article class="overview-panel device-status-panel"><div class="overview-panel-head"><span>设备状态</span><button @click="go('/device-archive/devices')">设备档案 <ChevronRight :size="14" /></button></div><div ref="deviceStatusChartEl" class="overview-chart device-status-chart"></div></article>
        <article class="overview-panel alarm-progress-panel"><div class="overview-panel-head"><span>当月告警情况</span><button @click="go('/alarms/events')">查看事件 <ChevronRight :size="14" /></button></div><div class="alarm-progress"><div><span class="alarm-icon cyan"><BellRing :size="19" /></span><p>当月告警总数<b>27</b></p><em>较上月 -12.9%</em></div><div><span class="alarm-icon orange"><CircleAlert :size="19" /></span><p>已完成处置<b>22</b></p><em>处置率 81.5%</em></div></div></article>
        <article class="overview-panel alarm-distribution-panel"><div class="overview-panel-head"><span>近 10 日告警情况分布</span></div><div ref="alarmDistributionChartEl" class="overview-chart compact-chart"></div></article>
      </section>
      <section class="overview-column center-column">
        <div class="overview-stat-grid"><article v-for="item in stats" :key="item.label" class="overview-stat" :class="item.tone"><component :is="item.icon" :size="19" /><div><span>{{ item.label }}</span><strong>{{ item.value }}<small>{{ item.unit }}</small></strong><em>{{ item.note }}</em></div></article></div>
        <article class="overview-panel campus-panel"><div class="overview-panel-head"><span>园区能源态势</span><small>当前接入 3 个园区 · 16 个网关</small></div><div ref="campusChartEl" class="overview-chart campus-chart"></div></article>
        <article class="overview-panel alarm-table-panel"><div class="overview-panel-head"><span>告警详情</span><button @click="go('/alarms/events')">更多 <ChevronRight :size="14" /></button></div><div class="overview-table"><table><thead><tr><th>告警等级</th><th>设备名称</th><th>事件描述</th><th>发生时间</th></tr></thead><tbody><tr v-for="row in alarmRows" :key="row.device + row.time"><td><span class="level-tag" :class="row.level">{{ row.level }}</span></td><td>{{ row.device }}</td><td>{{ row.event }}</td><td>{{ row.time }}</td></tr></tbody></table></div></article>
      </section>
      <section class="overview-column right-column">
        <article class="overview-panel energy-summary-panel"><div class="overview-panel-head"><span>今日用能统计</span><button @click="go('/analysis/history')">能耗分析 <ChevronRight :size="14" /></button></div><div class="energy-summary-list"><div v-for="item in energyStats" :key="item.label"><span><component :is="item.icon" :size="20" /></span><p>{{ item.label }}<b>{{ item.value }} <small>{{ item.unit }}</small></b></p><em>{{ item.trend }}</em></div></div></article>
        <article class="overview-panel energy-trend-panel"><div class="overview-panel-head"><span>今日能耗趋势</span><div class="chart-tabs"><b>电</b><span>水</span><span>气</span></div></div><div ref="energyTrendChartEl" class="overview-chart trend-chart"></div></article>
        <article class="overview-panel distribution-panel"><div class="overview-panel-head"><span>今日能耗分布</span><small>单位：kWh</small></div><div ref="distributionChartEl" class="overview-chart distribution-chart"></div></article>
      </section>
    </main>
  </section>
</template>
