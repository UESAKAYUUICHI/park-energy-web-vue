<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { Activity, Archive, BadgeCheck, BarChart3, Bell, Building2, Cable, ChartNoAxesCombined, CircleDollarSign, ClipboardCheck, Compass, Cpu, Crosshair, FileClock, FileText, Gauge, GitFork, HardHat, History, KeyRound, ListOrdered, Network, RadioReceiver, ReceiptText, Router, ScrollText, Send, Settings2, ShieldCheck, Siren, SlidersHorizontal, Tags, UserCircle, Users, WalletCards, Wrench, Zap } from '@lucide/vue'
import { cockpit, dashboard } from '@/api/platform'
import { routeRecords } from '@/router/routes'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import dieselImage from '@/assets/microgrid/diesel.png'
import chargerImage from '@/assets/microgrid/charger.png'
import storageImage from '@/assets/microgrid/storage.png'
import windImage from '@/assets/microgrid/wind.png'
import loadImage from '@/assets/microgrid/load.png'
import solarImage from '@/assets/microgrid/solar.png'
import gridImage from '@/assets/microgrid/grid.png'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

interface QuickEntry {
  name: string
  title: string
  path: string
  permission?: string
  icon: Component
}

interface QuickGroup {
  key: string
  label: string
  icon: Component
  entries: QuickEntry[]
}

const session = useSessionStore()
const workspace = ref<RecordRow>({})
const summary = ref<RecordRow>({})
const loading = ref(false)
const error = ref('')
const chartEl = ref<HTMLElement | null>(null)
let powerChart: ECharts | null = null

const metrics = computed(() => (workspace.value.metrics || summary.value.metrics || {}) as RecordRow)
const trend = computed(() => ((workspace.value.energyTrend || summary.value.energyTrend || []) as RecordRow[]).slice(-16))
const currentEnterprise = computed(() => String(session.orgScopes?.[0]?.org_name || session.user?.org_name || '智园园区'))

const topCards = computed(() => [
  { title: '上网电量', dayLabel: '日上网电量', day: '-- kW·h', total: formatEnergy(metrics.value.exportEnergy ?? 0), tone: 'pink', note: '累计上网电量' },
  { title: '下网电量', dayLabel: '日下网电量', day: '-- kW·h', total: formatEnergy(metrics.value.todayUsage ?? 0), tone: 'cyan', note: '累计下网电量' },
  { title: '光伏发电', dayLabel: '日发电量', day: '-- kW·h', total: formatEnergy(metrics.value.pvEnergy ?? 0), tone: 'violet', note: '累计发电量' },
  { title: '储能放电', dayLabel: '日放电量', day: '-- kW·h', total: formatEnergy(metrics.value.storageDischarge ?? 0), tone: 'teal', note: '累计放电量' },
  { title: '储能充电', dayLabel: '日充电量', day: '-- kW·h', total: formatEnergy(metrics.value.storageCharge ?? 0), tone: 'blue', note: '累计充电量' },
  { title: '风力发电', dayLabel: '日发电量', day: '-- kW·h', total: formatEnergy(metrics.value.windEnergy ?? 0), tone: 'purple', note: '累计发电量' },
])

const topologyNodes = [
  { key: 'grid', label: '市电', power: '0.00kW', image: gridImage, className: 'grid' },
  { key: 'solar', label: '光伏', power: '0.00kW', image: solarImage, className: 'solar' },
  { key: 'wind', label: '风电', power: '--kW', image: windImage, className: 'wind' },
  { key: 'diesel', label: '柴发', power: '--kW', image: dieselImage, className: 'diesel' },
  { key: 'storage', label: '储能', power: '--kW', image: storageImage, className: 'storage' },
  { key: 'charger', label: '充电桩', power: '0.00kW', image: chargerImage, className: 'charger' },
  { key: 'load', label: '负载', power: '0.00kW', image: loadImage, className: 'load' },
]

const navIcons: Record<string, Component> = {
  dashboard: Compass,
  'device-archive-org-tree': Network,
  'device-archive-devices': Gauge,
  'monitor-realtime': Activity,
  'analysis-history': History,
  'analysis-quality': BarChart3,
  'alarms-events': Bell,
  'alarms-workbench': ClipboardCheck,
  'billing-settlement': ReceiptText,
  'billing-bills': FileText,
  'access-diagnostic': RadioReceiver,
  'access-control': SlidersHorizontal,
  'access-commands': Send,
  'archive-orgs': Building2,
  'archive-gateways': Router,
  'archive-devices': Cpu,
  'archive-device-types': Tags,
  'archive-point-definitions': Crosshair,
  'archive-point-mappings': Cable,
  'alarms-rules': BadgeCheck,
  'billing-accounts': WalletCards,
  'billing-rules': ScrollText,
  'billing-rule-scopes': GitFork,
  'billing-price-items': ListOrdered,
  'system-users': Users,
  'system-roles': ShieldCheck,
  'system-permissions': KeyRound,
  'system-rbac-workbench': Wrench,
  'system-user-org-bindings': Building2,
  'system-audit': FileClock,
  profile: UserCircle,
}

const menuGroups = [
  { key: 'deviceArchive', label: '设备档案', icon: Archive, names: ['device-archive-org-tree', 'device-archive-devices'] },
  { key: 'energy', label: '能源运营', icon: Zap, names: ['monitor-realtime', 'analysis-history', 'analysis-quality'] },
  { key: 'alarm', label: '告警处置', icon: Siren, names: ['alarms-events', 'alarms-workbench'] },
  { key: 'billing', label: '结算收款', icon: CircleDollarSign, names: ['billing-settlement', 'billing-bills'] },
  { key: 'ops', label: '设备运维', icon: HardHat, names: ['access-diagnostic', 'access-control', 'access-commands'] },
  { key: 'archiveBase', label: '基础档案', icon: Archive, names: ['archive-orgs', 'archive-gateways', 'archive-devices', 'archive-device-types', 'archive-point-definitions', 'archive-point-mappings'] },
  { key: 'businessConfig', label: '业务参数', icon: Settings2, names: ['alarms-rules', 'billing-accounts', 'billing-rules', 'billing-rule-scopes', 'billing-price-items'] },
  { key: 'rbac', label: '权限与审计', icon: ShieldCheck, names: ['system-users', 'system-roles', 'system-permissions', 'system-rbac-workbench', 'system-user-org-bindings', 'system-audit'] },
  { key: 'profile', label: '个人中心', icon: UserCircle, names: ['profile'] },
]

const quickGroups = computed<QuickGroup[]>(() => menuGroups
  .map((group) => ({
    key: group.key,
    label: group.label,
    icon: group.icon,
    entries: group.names.map(routeEntry).filter((entry): entry is QuickEntry => Boolean(entry && session.can(entry.permission))),
  }))
  .filter((group) => group.entries.length))

const powerSeries = computed(() => {
  const labels = trend.value.length
    ? trend.value.map((point, index) => String(point.stat_date || point.stat_period || point.date || `${index}:00`))
    : Array.from({ length: 16 }, (_, index) => `${String(index).padStart(2, '0')}:00`)
  const base = trend.value.length
    ? trend.value.map((point) => Number(point.usage_value || point.usageValue || 0))
    : labels.map((_, index) => 420 + Math.sin(index / 1.7) * 40 + (index > 7 ? 680 : 0))
  return { labels, base }
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [cockpitData, summaryData] = await Promise.all([cockpit(), dashboard()])
    workspace.value = cockpitData
    summary.value = summaryData
  } catch (e) {
    error.value = e instanceof Error ? e.message : '经营总览读取失败'
  } finally {
    loading.value = false
  }
}

function routeEntry(name: string): QuickEntry | null {
  const route = routeRecords.find((item) => item.name === name)
  if (!route || String(route.path).includes(':')) return null
  return {
    name,
    title: String(route.meta?.title || name),
    path: String(route.path),
    permission: route.meta?.permission as string | undefined,
    icon: navIcons[name] || ChartNoAxesCombined,
  }
}

function formatEnergy(value: unknown) {
  return `${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW·h`
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function chartOption(): EChartsCoreOption {
  const accent = cssVar('--accent', '#2f86ff')
  const border = cssVar('--border', '#dfe4ec')
  const muted = cssVar('--muted', '#758195')
  const { labels, base } = powerSeries.value
  const series = [
    { name: '电网交互功率', color: '#13b8a6', data: base.map((item) => item * 0.88) },
    { name: '光伏发电功率', color: '#ef9270', data: base.map((item, index) => Math.max(0, item * (index > 6 ? 0.18 : 0.02))) },
    { name: '风电发电功率', color: accent, data: base.map((item) => item * 0.04) },
    { name: '储能功率', color: '#8b5cf6', data: base.map((item, index) => (index % 4) * item * 0.01) },
    { name: '充电桩功率', color: '#ec4899', data: base.map((item, index) => (index > 8 ? item * 0.08 : 0)) },
    { name: '负荷功率', color: '#f6bd49', data: base },
  ]
  return {
    color: series.map((item) => item.color),
    grid: { left: 12, right: 14, top: 36, bottom: 26, containLabel: true },
    legend: { top: 0, right: 4, itemWidth: 9, itemHeight: 9, textStyle: { color: muted, fontSize: 10 } },
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kW` },
    xAxis: { type: 'category', boundaryGap: false, data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel: { color: '#3296df', fontSize: 10 } },
    yAxis: { type: 'value', min: 0, name: 'kW', nameTextStyle: { color: '#3296df', fontSize: 10 }, splitLine: { lineStyle: { color: border } }, axisLabel: { color: '#3296df', fontSize: 10 } },
    series: series.map((item, index) => ({
      name: item.name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: item.data,
      lineStyle: { width: index === 5 ? 2.6 : 1.8 },
      areaStyle: index === 5 ? { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(246,189,73,.45)' }, { offset: 1, color: 'rgba(246,189,73,.08)' }]) } : undefined,
    })),
  }
}

async function renderChart() {
  await nextTick()
  if (!chartEl.value) {
    powerChart?.dispose()
    powerChart = null
    return
  }
  powerChart ||= init(chartEl.value)
  powerChart.setOption(chartOption(), true)
  powerChart.resize()
}

function resizeChart() {
  powerChart?.resize()
}

watch(powerSeries, renderChart)
onMounted(() => {
  window.addEventListener('resize', resizeChart)
  void renderChart()
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  powerChart?.dispose()
  powerChart = null
})
</script>

<template>
  <section class="view-page dashboard-page microgrid-page">
    <header class="microgrid-filter">
      <label>
        <span>企业</span>
        <input :value="currentEnterprise" readonly>
      </label>
      <button class="quiet" :disabled="loading" @click="load">刷新</button>
    </header>

    <div v-if="error" class="service-error">
      <b>服务不可用</b>
      <p>{{ error }}</p>
      <button class="quiet" @click="load">重试</button>
    </div>

    <template v-else>
      <section class="microgrid-energy-strip">
        <article v-for="card in topCards" :key="card.title" class="microgrid-energy-card" :class="card.tone">
          <h3>{{ card.title }}</h3>
          <p><span>{{ card.dayLabel }}</span><b>{{ card.day }}</b></p>
          <p><span>{{ card.note }}</span><b>{{ card.total }}</b></p>
        </article>
      </section>

      <section class="microgrid-layout">
        <article class="microgrid-topology-panel">
          <svg class="microgrid-lines" viewBox="0 0 1000 610" preserveAspectRatio="none" aria-hidden="true">
            <path d="M150 145 V318 H820 V145" />
            <path d="M500 145 V318" />
            <path d="M150 318 V514" />
            <path d="M400 318 V514" />
            <path d="M620 318 V514" />
            <path d="M820 318 V514" />
            <path d="M395 352 H435 V322" />
          </svg>
          <span class="microgrid-switch sw-grid"></span>
          <span class="microgrid-switch sw-solar"></span>
          <span class="microgrid-switch sw-wind"></span>
          <span class="microgrid-switch sw-storage"></span>

          <figure v-for="node in topologyNodes" :key="node.key" class="microgrid-node" :class="node.className">
            <figcaption>{{ node.label }}</figcaption>
            <img :src="node.image" :alt="node.label">
            <strong>{{ node.power }}</strong>
          </figure>
        </article>

        <aside class="microgrid-side">
          <article class="microgrid-menu-panel">
            <div class="microgrid-panel-title">
              <i></i>
              <h2>快捷菜单</h2>
            </div>
            <div class="microgrid-menu-scroll">
              <section v-for="group in quickGroups" :key="group.key" class="microgrid-menu-group">
                <header><component :is="group.icon" :size="15" />{{ group.label }}</header>
                <div>
                  <RouterLink v-for="entry in group.entries" :key="entry.name" :to="entry.path" class="microgrid-menu-tile">
                    <component :is="entry.icon" :size="22" />
                    <span>{{ entry.title }}</span>
                  </RouterLink>
                </div>
              </section>
            </div>
          </article>

          <article class="microgrid-power-panel">
            <div class="microgrid-panel-title">
              <i></i>
              <h2>系统运行功率</h2>
            </div>
            <div ref="chartEl" class="microgrid-power-chart"></div>
          </article>
        </aside>
      </section>
    </template>
  </section>
</template>
