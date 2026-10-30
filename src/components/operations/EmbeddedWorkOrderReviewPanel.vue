<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ECharts } from 'echarts/core'
import AppDialog from '@/components/app/AppDialog.vue'
import { loadBasicChartRuntime } from '@/utils/chartRuntime'
import type { RecordRow } from '@/types/domain'

const props = defineProps<{
  workOrder: RecordRow | null
}>()

const chartEl = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
const reviewModalOpen = ref(false)

const TIME_SLOTS = [
  '18:00', '18:15', '18:30', '18:45',
  '19:00', '19:15', '19:30', '19:45',
  '20:00', '20:15', '20:30', '20:45',
  '21:00', '21:15', '21:30', '21:45', '22:00',
]

const reviewParams = reactive({
  disposalState: 'DISPOSED_RECOVERED' as 'DISPOSED_RECOVERED' | 'DISPOSED_REOCCURRED' | 'NONE',
  disposalTime: '20:15',
  tariffPrice: 0.80,
  durationHours: 0.50,
  refKw: 3.2,
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}

const isCommOrder = computed(() => {
  const t = String(props.workOrder?.title || '')
  return t.includes('采集') || t.includes('通信') || t.includes('质量')
})

const computedReview = computed(() => {
  const sr = (props.workOrder?.sceneReview || null) as Record<string, any> | null
  const ev = (props.workOrder?.energyVerification || null) as Record<string, any> | null
  const disposalIdx = Math.max(0, TIME_SLOTS.indexOf(reviewParams.disposalTime) !== -1 ? TIME_SLOTS.indexOf(reviewParams.disposalTime) : 9)
  const commSeries = [9.6, 9.5, 9.4, 9.5, 9.2, 0.0, 0.0, 0.0, 9.1, 9.3, 9.2, 9.1, 4.6, 4.5, 4.6, 4.5, 4.5]
  const loadSeries = [11.8, 12.1, 11.9, 12.2, 12.0, 12.1, 11.8, 12.0, 11.9, 12.1, 11.7, 11.9, 12.0, 12.0, 11.9, 12.1, 12.0]
  const before: number[] = isCommOrder.value
    ? commSeries
    : Array.isArray(sr?.diagnosisCurve) && sr.diagnosisCurve.length === TIME_SLOTS.length
      ? (sr.diagnosisCurve as number[]).map(Number)
      : loadSeries
  const refKw = isCommOrder.value ? 4.5 : Number(sr?.effectiveReferenceKw ?? reviewParams.refKw)

  const curve = before.map((v, i) => {
    if (reviewParams.disposalState === 'DISPOSED_RECOVERED' && i > disposalIdx) {
      return round2(refKw + (i % 2 === 0 ? -0.15 : -0.25))
    }
    if (reviewParams.disposalState === 'DISPOSED_REOCCURRED' && i > disposalIdx) {
      return i <= disposalIdx + 2 ? round2(refKw - 0.2) : round2(refKw + 7.4)
    }
    return v
  })

  const afterSamples = curve.slice(disposalIdx + 1)
  const preMean = isCommOrder.value ? 6.86 : round2(Number(ev?.expected_usage ?? sr?.reviewAndEconomy?.preDisposalMeanKw ?? 11.96))
  const postMean = round2(
    reviewParams.disposalState === 'DISPOSED_RECOVERED' && ev?.actual_usage && !isCommOrder.value
      ? Number(ev.actual_usage)
      : afterSamples.length
        ? afterSamples.reduce((a, b) => a + b, 0) / afterSamples.length
        : preMean,
  )
  const dropKw = round2(Math.max(0, preMean - postMean))
  const pass = reviewParams.disposalState === 'DISPOSED_RECOVERED' && postMean <= refKw + 0.5
  const reoccurred = reviewParams.disposalState === 'DISPOSED_REOCCURRED'
  const badgeTone = pass ? 'ok' : reoccurred ? 'bad' : 'warn'
  const badgeLabel = pass
    ? '运行复核通过'
    : reoccurred
      ? '复发越限驳回'
      : isCommOrder.value
        ? '质量门控拦截 · 待修复重传'
        : '待现场处置后复核'

  const excessKw = isCommOrder.value ? 0.0 : round2(Math.max(0, preMean - refKw + 0.64))
  const wasteKwh = round2(excessKw * reviewParams.durationHours)
  const costYuan = round2(wasteKwh * reviewParams.tariffPrice)
  const nightlyLossYuan = round2(excessKw * 11.5 * reviewParams.tariffPrice)

  return {
    refKw,
    disposalIdx,
    curve,
    preMean,
    postMean,
    dropKw,
    pass,
    reoccurred,
    badgeTone,
    badgeLabel,
    loadStatus: pass
      ? `回落至运行参照范围 (${postMean} kW ≤ ${refKw} kW)`
      : reoccurred
        ? `短暂回落后反弹越限 (${postMean} kW)`
        : isCommOrder.value
          ? '检测到 19:15-19:45 采样缺测，等待 Outbox 补传'
          : `现场处理进行中（当前负荷 ${preMean} kW）`,
    windowText: pass
      ? `连续 ${afterSamples.length} 个采样周期无反弹复发`
      : reoccurred
        ? '观察期内检测到负荷复发，驳回验收'
        : '工单提交现场处理结果后自动开启恢复观察窗',
    formulaText: isCommOrder.value
      ? '采集质量未达80%门控阈值，已自动阻断能耗电费派生'
      : `${excessKw.toFixed(1)} kW × ${reviewParams.durationHours.toFixed(1)} h × ${reviewParams.tariffPrice.toFixed(2)} 元/kWh = ${costYuan.toFixed(2)} 元`,
    costYuan,
    wasteKwh,
    nightlyLossYuan,
  }
})

async function renderChart() {
  if (!chartEl.value) return
  const runtime = await loadBasicChartRuntime()
  if (!chart || chart.getDom() !== chartEl.value) {
    chart?.dispose()
    chart = runtime.init(chartEl.value)
  }
  const r = computedReview.value
  const maxVal = Math.max(16, ...r.curve, reviewParams.refKw + 4)
  chart.setOption({
    animationDuration: 220,
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', textStyle: { color: '#fff', fontSize: 11 } },
    legend: {
      top: 2,
      right: 8,
      itemWidth: 12,
      itemHeight: 7,
      textStyle: { color: '#597086', fontSize: 10 },
      data: ['处置前后功率 (kW)', '运行参照 (kW)'],
    },
    grid: { left: 38, right: 14, top: 26, bottom: 22 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: TIME_SLOTS,
      axisLine: { lineStyle: { color: '#cbd8e5' } },
      axisLabel: {
        color: '#597086',
        fontSize: 10,
        formatter: (val: string, idx: number) => (idx === r.disposalIdx ? `${val}(处置)` : idx % 4 === 0 ? val : ''),
      },
    },
    yAxis: {
      type: 'value',
      name: 'kW',
      min: 0,
      max: Math.ceil(maxVal / 4) * 4,
      nameTextStyle: { color: '#597086', fontSize: 10, align: 'left' },
      splitLine: { lineStyle: { color: '#eef2f6' } },
      axisLabel: { color: '#597086', fontSize: 10 },
    },
    series: [
      {
        name: '处置前后功率 (kW)',
        type: 'line',
        symbol: 'circle',
        symbolSize: (_v: number, p: any) => (p.dataIndex === r.disposalIdx ? 6 : 3),
        lineStyle: { width: 2, color: '#176fc1' },
        itemStyle: { color: (p: any) => (p.dataIndex === r.disposalIdx ? '#a6630b' : '#176fc1') },
        areaStyle: {
          color: new runtime.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(23, 128, 79, 0.14)' },
            { offset: 1, color: 'rgba(23, 128, 79, 0.01)' },
          ]),
        },
        data: r.curve,
      },
      {
        name: '运行参照 (kW)',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#17804f' },
        data: TIME_SLOTS.map(() => r.refKw),
      },
    ],
  })
}

watch(
  () => props.workOrder,
  (wo) => {
    const st = String(wo?.status || '').toUpperCase()
    if (['VERIFYING', 'CLOSED'].includes(st)) {
      reviewParams.disposalState = 'DISPOSED_RECOVERED'
    } else if (st) {
      reviewParams.disposalState = 'NONE'
    }
  },
  { immediate: true },
)

watch(
  () => [props.workOrder, reviewParams.disposalState, reviewParams.tariffPrice, reviewParams.durationHours, reviewModalOpen.value],
  async () => {
    if (reviewModalOpen.value) {
      await nextTick()
      await renderChart()
    }
  },
  { immediate: true },
)

onMounted(() => {
  void nextTick(() => renderChart())
})

onBeforeUnmount(() => {
  chart?.dispose()
})
</script>

<template>
  <section class="embedded-review-section">
    <!-- 紧凑内嵌摘要条（点击按钮弹出独立效果复核与费用核算弹窗） -->
    <header class="er-toolbar">
      <div class="er-summary-left">
        <div class="er-title">
          <strong>处置效果运行复核与分时电价费用核算</strong>
          <span class="er-badge" :class="computedReview.badgeTone">
            {{ computedReview.badgeLabel }}
          </span>
        </div>
        <p class="er-summary-desc">
          处置前 {{ computedReview.preMean }} kW → 处置后 {{ computedReview.postMean }} kW（削减 -{{ computedReview.dropKw }} kW） · 整晚潜在止损 ¥{{ computedReview.nightlyLossYuan }}
        </p>
      </div>
      <div class="er-controls">
        <button type="button" class="er-open-btn" @click="reviewModalOpen = true">
          效果复核与费用核算
        </button>
      </div>
    </header>

    <!-- 独立弹窗：处置效果运行复核与分时电价费用核算 -->
    <AppDialog
      v-model:open="reviewModalOpen"
      title="处置效果运行复核与分时电价费用核算"
      :show-footer="false"
      dialog-class="review-submodal"
    >
      <div class="er-modal-body">
        <div class="er-toolbar" style="border:1px solid #d6e2ee;border-radius:6px">
          <div class="er-title">
            <strong>复核工况与电价参数核验</strong>
            <span class="er-badge" :class="computedReview.badgeTone">
              {{ computedReview.badgeLabel }}
            </span>
          </div>
          <div class="er-controls">
            <label>
              <span>复核工况</span>
              <select v-model="reviewParams.disposalState">
                <option value="DISPOSED_RECOVERED">已关断并回落参照线</option>
                <option value="DISPOSED_REOCCURRED">温控策略冲突反弹复发</option>
                <option value="NONE">待现场处置</option>
              </select>
            </label>
            <label>
              <span>分时电价</span>
              <select v-model.number="reviewParams.tariffPrice">
                <option :value="0.42">谷段 0.42元/kWh</option>
                <option :value="0.80">平段 0.80元/kWh</option>
                <option :value="1.15">峰段 1.15元/kWh</option>
              </select>
            </label>
            <label>
              <span>持续时长</span>
              <select v-model.number="reviewParams.durationHours">
                <option :value="0.5">0.5 小时</option>
                <option :value="1.0">1.0 小时</option>
                <option :value="2.0">2.0 小时</option>
              </select>
            </label>
          </div>
        </div>

        <div class="er-split" style="border:1px solid #d6e2ee;border-radius:6px;overflow:hidden">
          <div class="er-chart-box">
            <div class="er-subhead">
              <span>处置前后负荷变化对比</span>
              <small>现场处置 {{ reviewParams.disposalTime }} · 处置前 {{ computedReview.preMean }} kW → 处置后 {{ computedReview.postMean }} kW</small>
            </div>
            <div ref="chartEl" class="er-chart"></div>
          </div>

          <div class="er-table-box">
            <div class="er-subhead">
              <span>运行复核与费用影响明细</span>
              <small>削减负荷 -{{ computedReview.dropKw }} kW</small>
            </div>
            <table class="er-kv-table">
              <tbody>
                <tr>
                  <th>负荷恢复状态</th>
                  <td :class="computedReview.badgeTone">{{ computedReview.loadStatus }}</td>
                </tr>
                <tr>
                  <th>观察窗口检验</th>
                  <td>{{ computedReview.windowText }}</td>
                </tr>
                <tr>
                  <th>验收判定依据</th>
                  <td>曲线、处理记录与空间使用条件</td>
                </tr>
                <tr>
                  <th>异常增量电费核算</th>
                  <td><b>{{ computedReview.formulaText }}</b></td>
                </tr>
                <tr>
                  <th>整晚潜在止损成效</th>
                  <td class="ok">整晚 11.5h 潜在损耗 {{ computedReview.nightlyLossYuan }} 元 (正式结算依实际计量)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.embedded-review-section {
  margin: 10px 0;
  border: 1px solid #d6e2ee;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

.er-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  background: #f5f8fb;
  border-bottom: 1px solid #d6e2ee;
  flex-wrap: wrap;
}

:deep(.review-submodal) {
  width: min(1020px, calc(100vw - 32px));
}

.er-modal-body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.er-summary-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.er-summary-desc {
  margin: 0;
  font-size: 11px;
  color: #52677f;
}

.er-open-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid #176fc1;
  border-radius: 4px;
  background: #176fc1;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.er-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #1e3a5f;
}

.er-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}

.er-badge.ok {
  background: #e4f6ec;
  color: #17804f;
}

.er-badge.warn {
  background: #fff4e0;
  color: #a6630b;
}

.er-badge.bad {
  background: #fde8e8;
  color: #c13e3e;
}

.er-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.er-controls label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #597086;
  white-space: nowrap;
}

.er-controls select {
  height: 26px;
  padding: 0 5px;
  border: 1px solid #cbd8e5;
  border-radius: 4px;
  background: #fff;
  font-size: 11px;
  color: #263b53;
}

.er-split {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
}

.er-chart-box {
  border-right: 1px solid #d6e2ee;
  display: flex;
  flex-direction: column;
}

.er-subhead {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  background: #fbfcfe;
  border-bottom: 1px solid #eef2f6;
  font-size: 11px;
  font-weight: 700;
  color: #29445f;
}

.er-subhead small {
  font-weight: 400;
  font-size: 10px;
  color: #60758b;
}

.er-chart {
  width: 100%;
  height: 185px;
}

.er-table-box {
  display: flex;
  flex-direction: column;
}

.er-kv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.er-kv-table th,
.er-kv-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #eef2f6;
  text-align: left;
  line-height: 1.45;
}

.er-kv-table tr:last-child th,
.er-kv-table tr:last-child td {
  border-bottom: 0;
}

.er-kv-table th {
  width: 132px;
  white-space: nowrap;
  color: #597086;
  font-weight: 600;
  background: #fbfcfe;
}

.ok {
  color: #17804f;
  font-weight: 700;
}

.warn {
  color: #a6630b;
  font-weight: 700;
}

.bad {
  color: #c13e3e;
  font-weight: 700;
}
</style>
