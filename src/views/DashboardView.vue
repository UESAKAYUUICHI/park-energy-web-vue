<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import AppDataTable from '@/components/app/AppDataTable.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { cockpit, dashboard } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const workspace = ref<RecordRow>({}); const summary = ref<RecordRow>({}); const loading = ref(false); const error = ref('')
const metrics = computed(() => (workspace.value.metrics || summary.value.metrics || {}) as RecordRow); const metricItems = computed(() => [{ label: '今日用量', value: Number(metrics.value.todayUsage || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }), note: 'kWh · 日统计口径' }, { label: '在线网关 / 总数', value: `${metrics.value.onlineGatewayCount || 0} / ${metrics.value.gatewayCount || 0}`, note: '接入服务状态' }, { label: '未处理告警', value: String(metrics.value.pendingAlarmCount || 0).padStart(2, '0'), note: '优先处理高等级事件', tone: 'warn' }, { label: '待缴账单', value: String(metrics.value.unpaidBillCount || 0).padStart(2, '0'), note: '点击进入账单与缴费' }]); const trend = computed(() => ((workspace.value.energyTrend || summary.value.energyTrend || []) as RecordRow[]).slice(-7)); const bills = computed(() => (workspace.value.latestBills || summary.value.latestBills || []) as RecordRow[]); const tasks = computed(() => (workspace.value.tasks || summary.value.tasks || []) as RecordRow[])
const chartEl = ref<HTMLElement | null>(null)
let usageChart: ECharts | null = null
const trendLabels = computed(() => trend.value.map((point, index) => String(point.stat_date || point.date || index + 1)))
const trendValues = computed(() => trend.value.map((point) => Number(point.usage_value || point.usageValue || 0)))
const columns = [{ key: 'bill_no', label: '账单编号' }, { key: 'account_name', label: '计费账户' }, { key: 'bill_cycle', label: '账期' }, { key: 'total_amount', label: '应收金额', format: (value: unknown) => `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` }, { key: 'pay_status', label: '状态' }]
async function load() { loading.value = true; error.value = ''; try { const [cockpitData, summaryData] = await Promise.all([cockpit(), dashboard()]); workspace.value = cockpitData; summary.value = summaryData } catch (e) { error.value = e instanceof Error ? e.message : '经营总览读取失败' } finally { loading.value = false } }
function cssVar(name: string, fallback: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback }
function usageOption(): EChartsCoreOption {
  const accent = cssVar('--accent', '#4c8dff')
  const muted = cssVar('--muted', '#758195')
  const border = cssVar('--border', '#dfe4ec')
  return {
    color: [accent],
    grid: { left: 10, right: 12, top: 18, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kWh` },
    xAxis: { type: 'category', boundaryGap: false, data: trendLabels.value, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 10 } },
    yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: border, type: 'dashed' } }, axisLabel: { color: muted, fontSize: 10 } },
    series: [{ name: '园区总用量', type: 'line', smooth: true, symbolSize: 7, data: trendValues.value, areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(76, 141, 255, .22)' }, { offset: 1, color: 'rgba(76, 141, 255, 0)' }]) }, lineStyle: { width: 3 } }],
  }
}
async function renderUsageChart() {
  await nextTick()
  if (error.value || !chartEl.value) { usageChart?.dispose(); usageChart = null; return }
  usageChart ||= init(chartEl.value)
  usageChart.setOption(usageOption(), true)
}
function resizeUsageChart() { usageChart?.resize() }
watch([trendLabels, trendValues, error], renderUsageChart)
onMounted(() => { window.addEventListener('resize', resizeUsageChart); void renderUsageChart(); void load() })
onBeforeUnmount(() => { window.removeEventListener('resize', resizeUsageChart); usageChart?.dispose(); usageChart = null })
</script>
<template>
  <section class="view-page dashboard-page"><header class="view-head"><div><p class="eyebrow">OPERATIONS COCKPIT</p><h1>经营总览</h1><p>聚合当前组织范围内的资产、用量、告警、账单与指令待办。</p></div><button class="quiet" @click="load">刷新数据</button></header>
    <div v-if="error" class="service-error"><b>服务不可用</b><p>{{ error }}</p><button class="quiet" @click="load">重试</button></div>
    <template v-else><div class="metric-grid"><article v-for="item in metricItems" :key="item.label" class="metric" :class="item.tone"><span>{{ item.label }}</span><strong>{{ item.value }}</strong><em>{{ item.note }}</em></article></div><div class="dashboard-grid"><article class="panel"><div class="panel-head"><div><h3>近 7 日园区用量</h3><small>日电量趋势 / kWh</small></div><span class="tag blue">组织范围</span></div><div ref="chartEl" class="usage-chart" aria-label="近 7 日园区用量趋势"></div><div class="legend"><span><i></i>园区总用量</span><span><i class="gray"></i>查询周期：近 7 日</span></div></article><article class="panel"><div class="panel-head"><h3>运营待办</h3><small>按当前权限聚合</small></div><ul class="task-list"><li v-for="(task, index) in tasks" :key="String(task.id || index)"><div><b>{{ task.title || task.name || task.type || '待处理事项' }}</b><span>{{ task.description || task.message || '请进入业务模块处理' }}</span></div><span class="tag" :class="Number(task.level) >= 3 ? 'danger' : 'blue'">{{ task.count || task.status || '待办' }}</span></li><li v-if="!tasks.length"><div><b>暂无待办数据</b><span>后端返回后将在此展示告警与账单待办。</span></div></li></ul></article></div><AppDataTable title="最近账单" :columns="columns" :rows="bills" :loading="loading" :error="error" @refresh="load"><template #cell-pay_status="{ value }"><StatusTag domain="bill" :value="value" /></template></AppDataTable></template>
  </section>
</template>
