<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts } from 'echarts/core'
import { loadBasicChartRuntime } from '@/utils/chartRuntime'
import { refreshEnergyEffect } from '@/features/efficiency/api'
import type { EnergyEffectVerification } from '@/features/efficiency/types'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

const props = defineProps<{ workOrder: RecordRow | null }>()
const session = useSessionStore()
const chartEl = ref<HTMLElement | null>(null)
const refreshed = ref<EnergyEffectVerification | null>(null)
const busy = ref(false)
const error = ref('')
let chart: ECharts | null = null
let disposed = false

const result = computed(() => refreshed.value ||
  props.workOrder?.energyVerification as EnergyEffectVerification | undefined)
const labels: Record<string, string> = {
  PENDING_DATA: '待核验', IMPROVED: '负荷下降', DETERIORATED: '负荷上升',
  UNCHANGED: '无变化', NOT_APPLICABLE: '不适用',
}
const verdict = computed(() => result.value?.verdict || 'PENDING_DATA')
const points = computed(() => {
  const raw = result.value?.evidence_json
  try {
    const evidence = typeof raw === 'string' ? JSON.parse(raw) : raw
    const values = evidence?.observations
    return Array.isArray(values) ? values.filter((v: Record<string, unknown>) =>
      typeof v.time === 'string' && v.averageKw != null && Number.isFinite(Number(v.averageKw))) : []
  } catch { return [] }
})
const number = (value: unknown, digits = 2) =>
  value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits)
const time = (value: unknown) => value ? String(value).replace('T', ' ').slice(0, 16) : '—'

async function refresh() {
  const id = props.workOrder?.id
  if (id == null || busy.value) return
  busy.value = true
  error.value = ''
  try { refreshed.value = await refreshEnergyEffect(String(id)) }
  catch (e) { error.value = e instanceof Error ? e.message : '核验失败' }
  finally { busy.value = false }
}
async function render() {
  await nextTick()
  if (disposed || !chartEl.value) return
  if (!points.value.length) { chart?.dispose(); chart = null; return }
  const runtime = await loadBasicChartRuntime()
  if (disposed || !chartEl.value) return
  if (!chart || chart.getDom() !== chartEl.value) { chart?.dispose(); chart = runtime.init(chartEl.value) }
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 18, top: 28, bottom: 42 },
    xAxis: { type: 'category', data: points.value.map(v => time(v.time)), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: 'kW' },
    series: [{ name: '小时平均功率', type: 'bar', data: points.value.map(v => Number(v.averageKw)),
      itemStyle: { color: '#176fc1' }, barMaxWidth: 32 }],
  }, true)
}
function resize() { chart?.resize() }
watch(() => props.workOrder?.id, () => { refreshed.value = null; error.value = '' })
watch(points, () => void render(), { deep: true })
onMounted(() => { void render(); window.addEventListener('resize', resize) })
onBeforeUnmount(() => { disposed = true; chart?.dispose(); window.removeEventListener('resize', resize) })
</script>

<template>
  <section class="effect-panel">
    <header>
      <h3>效果核验</h3>
      <span class="verdict" :class="verdict.toLowerCase()">{{ labels[verdict] || '待核验' }}</span>
      <button v-if="session.can('ops:workorder:verify')" :disabled="busy || !workOrder?.id" @click="refresh">{{ busy ? '核验中' : '重新核验' }}</button>
    </header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div class="effect-metrics">
      <div><span>处置前均值</span><strong>{{ number(result?.before_avg_kw) }} <small>kW</small></strong></div>
      <div><span>处置后均值</span><strong>{{ number(result?.after_avg_kw) }} <small>kW</small></strong></div>
      <div><span>负荷下降值</span><strong>{{ number(result?.delta_kw) }} <small>kW</small></strong></div>
      <div><span>有效数据完整率</span><strong>{{ number(result?.data_complete_rate) }} <small>%</small></strong></div>
    </div>
    <div v-show="points.length" ref="chartEl" class="effect-chart"></div>
    <div v-if="!points.length" class="empty">{{ result?.reason || '暂无核验数据' }}</div>
    <dl v-if="result?.before_start">
      <dt>处置前窗口</dt><dd>{{ time(result.before_start) }} — {{ time(result.before_end) }}</dd>
      <dt>处置后窗口</dt><dd>{{ time(result.after_start) }} — {{ time(result.after_end) }}</dd>
      <dt>观察窗用电差估算</dt><dd>{{ number(result.estimated_delta_kwh) }} kWh</dd>
      <dt>核验时间</dt><dd>{{ time(result.generated_at) }}</dd>
    </dl>
  </section>
</template>

<style scoped>
.effect-panel{padding:16px;border:1px solid var(--border,#dce4ec);border-radius:8px;background:#fff}
header{display:flex;align-items:center;gap:12px}h3{margin:0;font-size:15px}
header button{margin-left:auto;padding:6px 12px;border:1px solid #ccd8e4;border-radius:4px;background:#fff;cursor:pointer}
header button:disabled{opacity:.5;cursor:default}.verdict{padding:3px 8px;border-radius:4px;background:#edf2f7;color:#53657a;font-size:12px}
.improved{background:#e8f5ee;color:#167747}.deteriorated{background:#fff0ef;color:#af3935}
.effect-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}
.effect-metrics div{display:flex;flex-direction:column;gap:8px}.effect-metrics span{font-size:12px;color:#66788a}
strong{font-size:20px;font-variant-numeric:tabular-nums}small{font-size:11px;font-weight:400}
.effect-chart{height:240px;margin-top:14px}.empty{padding:30px;text-align:center;color:#66788a;font-size:13px}
dl{display:grid;grid-template-columns:110px 1fr;gap:8px;margin:12px 0 0;font-size:12px}dt{color:#66788a}dd{margin:0}.error{color:#af3935;font-size:12px}
@media(max-width:700px){.effect-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}dl{grid-template-columns:1fr}}
</style>
