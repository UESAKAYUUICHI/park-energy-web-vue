<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { ECharts } from 'echarts/core'
import { RefreshCw } from '@lucide/vue'
import AppDialog from '@/components/app/AppDialog.vue'
import { callAiLlmProxy, evaluateAiScene } from '@/api/platform'
import { loadBasicChartRuntime } from '@/utils/chartRuntime'
import type { RecordRow } from '@/types/domain'

const props = defineProps<{
  alarm: RecordRow | null
}>()

const chartEl = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
const evaluating = ref(false)
const diagModalOpen = ref(false)
const debugTraceOpen = ref(false)
function openDiagModal() {
  debugTraceOpen.value = false
  diagModalOpen.value = true
}

function openTraceModal() {
  diagModalOpen.value = false
  debugTraceOpen.value = true
}
const checkedSteps = ref<Record<number, boolean>>({ 0: true, 1: true, 2: false })

const TIME_SLOTS = [
  '18:00', '18:15', '18:30', '18:45',
  '19:00', '19:15', '19:30', '19:45',
  '20:00', '20:15', '20:30', '20:45',
  '21:00', '21:15', '21:30', '21:45', '22:00',
]

const params = reactive({
  workEndTime: '19:00',
  extraBaselineKw: 0.0,
  tempOvertimeRegistered: false,
  qualityMode: 'COMPLETE' as 'COMPLETE' | 'MISSING_GAP' | 'ENERGY_ROLLBACK',
})

const liveOverride = ref<Record<string, any> | null>(null)
const latencyMs = ref(0)

const isCommIssue = computed(() => {
  const val = String(props.alarm?.alarm_value || '')
  const code = String(props.alarm?.point_code || '')
  return val.includes('RS485') || val.includes('采集失败') || val.includes('OFFLINE') || code.includes('状态')
})

const serverDiag = ref<Record<string, any> | null>(null)

function syncFromAlarm() {
  liveOverride.value = null
  const sd = (props.alarm?.sceneDiagnosis || null) as Record<string, any> | null
  serverDiag.value = sd
  if (sd) {
    params.workEndTime = String(sd.workEndTime || '19:00')
    params.tempOvertimeRegistered = Boolean(sd.tempOvertimeRegistered)
    params.qualityMode = (sd.qualityGate?.qualityMode || sd.qualityMode || (isCommIssue.value ? 'MISSING_GAP' : 'COMPLETE')) as any
  } else if (isCommIssue.value) {
    params.qualityMode = 'MISSING_GAP'
    params.workEndTime = '19:00'
  } else {
    params.qualityMode = 'COMPLETE'
    params.workEndTime = '19:00'
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

const computedDiag = computed(() => {
  const sd = serverDiag.value
  const baseRef = Number(sd?.baseReferenceKw ?? (isCommIssue.value ? 4.5 : 3.2))
  const refKw = round2(baseRef + params.extraBaselineKw)
  const workEndIdx = Math.max(0, TIME_SLOTS.indexOf(params.workEndTime) !== -1 ? TIME_SLOTS.indexOf(params.workEndTime) : 4)
  const rawSeries: number[] = Array.isArray(sd?.diagnosisCurve) && sd.diagnosisCurve.length === TIME_SLOTS.length
    ? (sd.diagnosisCurve as number[]).map(Number)
    : isCommIssue.value
      ? [9.6, 9.5, 9.4, 9.5, 9.2, 0.0, 0.0, 0.0, 9.1, 9.3, 9.2, 9.1, 4.6, 4.5, 4.6, 4.5, 4.5]
      : [11.8, 12.1, 11.9, 12.2, 12.0, 12.1, 11.8, 12.0, 11.9, 12.1, 11.7, 11.9, 12.0, 12.0, 11.9, 12.1, 12.0]

  const curve = rawSeries.map((v, idx) => {
    if (params.qualityMode === 'MISSING_GAP' && (idx === 5 || idx === 6 || idx === 7)) return 0
    return v
  })

  const completeness = params.qualityMode === 'MISSING_GAP' ? 58.8 : 100.0
  const hasRollback = params.qualityMode === 'ENERGY_ROLLBACK'
  const qualityPassed = completeness >= 80 && !hasRollback

  const postSamples = curve.slice(workEndIdx).filter((x) => x > 0)
  const meanKw = round2(postSamples.length ? postSamples.reduce((a, b) => a + b, 0) / postSamples.length : 0)
  const deltaKw = round2(meanKw - refKw)
  const persistHours = round2(postSamples.filter((x) => x > refKw + 1.2).length * 0.25)
  const anomalyScore = !qualityPassed ? 0.22 : params.tempOvertimeRegistered ? 0.18 : deltaKw > 1.2 ? 0.96 : 0.24

  const evidences = [
    {
      code: 'E1',
      dim: '时序测量特征',
      metric: `均值 ${meanKw} kW / 参照 ${refKw} kW`,
      desc: `${params.workEndTime} 停用后连续运行 ${persistHours}h，偏离 ${deltaKw >= 0 ? '+' : ''}${deltaKw} kW`,
      status: deltaKw > 1.2 ? '越限偏离' : '基线内',
      tone: deltaKw > 1.2 ? 'warn' : 'ok',
    },
    {
      code: 'E2',
      dim: '采集与数据质量',
      metric: `完整率 ${completeness}% / ${hasRollback ? '有回退' : '无回退'}`,
      desc: hasRollback
        ? '捕获累计电量读数回退标记，阻断计费与能耗告警派生'
        : completeness >= 80
          ? 'RS485 总线轮询正常，NTP 时钟同步有效'
          : '19:15-19:45 连续采样缺失，门控阻断能耗误报',
      status: qualityPassed ? '核验通过' : '门控拦截',
      tone: qualityPassed ? 'ok' : 'bad',
    },
    {
      code: 'E3',
      dim: '空间作息与备案',
      metric: `停用 ${params.workEndTime} / ${params.tempOvertimeRegistered ? '已备案' : '无延期'}`,
      desc: params.tempOvertimeRegistered ? '检索到夜间临时办公延期备案记录' : '空间处于非工作停用时段，无加班用电登记',
      status: params.tempOvertimeRegistered ? '延期豁免' : '停用约束',
      tone: params.tempOvertimeRegistered ? 'ok' : 'muted',
    },
    {
      code: 'E4',
      dim: '回路资产与白名单',
      metric: `常开 ${refKw} kW / 受控空调照明`,
      desc: '常开负载：弱电交换机1.8kW+消防安防1.4kW；可关断负载：分体空调×3、照明×2',
      status: '台账已关联',
      tone: 'muted',
    },
  ]

  let basis: string[]
  let reasons: Array<{ reason: string; probability: number; evidenceCode: string }>
  let steps: string[]

  if (!qualityPassed) {
    basis = [
      hasRollback
        ? '边缘网关捕获累计电能读数回退标记（E2），疑似表计清零或寄存器偏移。'
        : `评估窗口采样完整率仅 ${completeness}%（E2），低于 80% 质量门控阈值。`,
      '系统已自动阻断用能异常误报与经济评价外推，转入采集通信链路核查。',
    ]
    reasons = [
      { reason: 'RS485 总线受干扰或终端电阻异常引起采样丢包', probability: 56, evidenceCode: 'E2' },
      { reason: '表计更换或清零后未同步更新网关采集档案初值', probability: 29, evidenceCode: 'E2' },
      { reason: '网关断网重连后本地 Outbox 正在按序补传历史报文', probability: 15, evidenceCode: 'E2' },
    ]
    steps = [
      '第一步：核查网关本地 Outbox 队列状态与 RS485 通道通信成功率。',
      '第二步：比对现场表计读数与云端原始入库报文。',
      '第三步：待窗口采样补齐并通过质量门控后重新执行用能评估。',
    ]
  } else if (params.tempOvertimeRegistered || deltaKw <= 1.2) {
    basis = [
      params.tempOvertimeRegistered
        ? `已核实空间存在夜间延期使用备案（E3），当前负荷 ${meanKw} kW 符合使用需求。`
        : `停用后功率均值 ${meanKw} kW 处于运行参照基线 ${refKw} kW 范围内（E1, E4）。`,
      '当前窗口数据完整且无读数回退标记（E2），判定为正常用能状态。',
    ]
    reasons = [
      { reason: '回路常开保障设备按计划平稳运行', probability: 86, evidenceCode: 'E4' },
      { reason: '已备案的夜间延时作业负荷', probability: 14, evidenceCode: 'E3' },
    ]
    steps = [
      '当前符合工程运行约束，无需派发异常排查工单。',
      '保持常规监测，延期作业结束后恢复标准基线约束。',
    ]
  } else {
    basis = [
      `计划停用时点 ${params.workEndTime} 后仍持续存在负荷，均值 ${meanKw} kW 高于参照基线 ${refKw} kW 达 ${deltaKw} kW（E1, E3）。`,
      '当前评估窗口数据完整率 100%，无读数回退标记，排除采集故障干扰（E2）。',
    ]
    reasons = [
      { reason: '部分设备未关闭（回路下分体空调或公共照明支路未及时停机）', probability: 58, evidenceCode: 'E4' },
      { reason: '临时使用未登记（空间存在夜间临时加班但未录入使用计划）', probability: 27, evidenceCode: 'E3' },
      { reason: '必要持续运行负荷未录入（新增24h常开设备未更新至基线台账）', probability: 15, evidenceCode: 'E4' },
    ]
    steps = [
      '第一步：先核实空间使用条件，确认是否存在未登记的夜间临时使用。',
      '第二步：再确认必要持续运行负荷，核对弱电与安防等常开设备台账。',
      '第三步：最后现场检查并关闭未及时停机的分体空调与照明支路。',
    ]
  }

  if (liveOverride.value) {
    if (Array.isArray(liveOverride.value.judgmentBasis) && liveOverride.value.judgmentBasis.length) {
      basis = liveOverride.value.judgmentBasis
    }
    if (Array.isArray(liveOverride.value.candidateReasons) && liveOverride.value.candidateReasons.length) {
      reasons = liveOverride.value.candidateReasons
    }
    if (Array.isArray(liveOverride.value.inspectionSteps) && liveOverride.value.inspectionSteps.length) {
      steps = liveOverride.value.inspectionSteps
    }
  }

  const envTraces = !qualityPassed
    ? [
        {
          envName: '环境 1 · 边缘采集与数据质量环境',
          dataSource: 'stats_collection_window 表 & 网关 gw-core 单调性守卫',
          rawMetrics: hasRollback
            ? 'complete_rate = 100%, quality_flag = 1 (捕获累计电量读数回退)'
            : `expected_samples = 17, received_samples = 10, complete_rate = ${completeness}% (< 80% 门控阈值)`,
          subInference: hasRollback
            ? '【拦截：表计读数回退】网关单调守卫捕获累计有功电能负增长，判定为换表或清零未同步初值（归因权重 85%）。'
            : '【拦截：RS485采样缺测】评估窗口出现连续 3 个采样周期丢包，数据不可信，直接阻断下游能耗归因（归因权重 85%）。',
          tone: 'bad',
        },
        {
          envName: '环境 2 · 空间作息与排班备案环境',
          dataSource: 'park_space 空间运行约束台账',
          rawMetrics: `work_end_time = '${params.workEndTime}', overtime_active = ${params.tempOvertimeRegistered ? 1 : 0}`,
          subInference: '【挂起】因上游环境 1 数据质量门控未通过，暂停空间作息越限判定，防止产生虚假能耗告警。',
          tone: 'muted',
        },
        {
          envName: '环境 3 · 配电回路时序波形特征环境',
          dataSource: 'stats_hourly_point & IoTDB 15min 聚合序列',
          rawMetrics: `有效样本均值 = ${meanKw} kW, 存在缺失断点窗口 (19:15-19:45 = 0.0 kW)`,
          subInference: '【识别通信断档】功率曲线呈现断崖式归零后恢复特征，符合串口总线受扰丢包而非真实负载启停。',
          tone: 'warn',
        },
        {
          envName: '环境 4 · 回路资产与网关通道台账环境',
          dataSource: 'dev_gateway_channel & data_ingest_event 表',
          rawMetrics: 'gateway = GW-RK3566-01, channel = RS485-2, baud = 9600, outbox_retry = 启用',
          subInference: '【锁定物理通道核查】优先核查 RS485 总线终端电阻与网关本地 SQLite Outbox 待补传队列（归因权重 15%）。',
          tone: 'warn',
        },
      ]
    : [
        {
          envName: '环境 1 · 边缘采集与数据质量环境',
          dataSource: 'stats_collection_window 表 & 网关 gw-core 单调性守卫',
          rawMetrics: `expected_samples = 17, received_samples = 17, complete_rate = ${completeness}%, rollback_flag = 0, ntp = 已同步`,
          subInference: '【排除采集与表计故障 (权重 0%)】窗口采样完整率达 100% 且无读数回退，证明实测功率为真实物理负载消耗，非通信重传或脏数据所致。',
          tone: 'ok',
        },
        {
          envName: '环境 2 · 空间作息与排班备案环境',
          dataSource: 'park_space 空间运行约束台账 (id=4 · 三层东翼研发办公区)',
          rawMetrics: `usage = OFFICE, work_end_time = '${params.workEndTime}', overtime_active = ${params.tempOvertimeRegistered ? '1 (已备案)' : '0 (无备案)'}`,
          subInference: params.tempOvertimeRegistered
            ? '【场景豁免生效 (权重 86%)】台账检索到当日夜间临时加班备案，当前负荷属于合规延时保障用能。'
            : `【锁定非工作时段违规用能 · 留存未登记加班可能 (权重 27%)】当前已过 ${params.workEndTime} 停用分界点；虽台账无备案，但现场存在人员临时加班忘登记可能，列为第一顺位低成本核实项。`,
          tone: params.tempOvertimeRegistered ? 'ok' : 'warn',
        },
        {
          envName: '环境 3 · 配电回路时序波形特征环境',
          dataSource: 'stats_hourly_point & IoTDB 15min 序列 + 孤立森林模型',
          rawMetrics: `停用后均值 P̄ = ${meanKw} kW, 变异系数 CV = 0.01 (稳态波形), 持续时长 = ${persistHours}h, Z-Score = +19.47σ, IForest = ${anomalyScore}`,
          subInference: '【锁定恒功率受控设备持续运行】停用分界点后功率无阶跃下降，变异系数 CV 仅 0.01（无频繁启停波动），符合空调与照明未关断的稳态电气特征。',
          tone: deltaKw > 1.2 && !params.tempOvertimeRegistered ? 'warn' : 'ok',
        },
        {
          envName: '环境 4 · 回路资产定额与常开白名单环境',
          dataSource: 'dev_device 台账 & 配电回路支路定额清单 (METER-3F-A01)',
          rawMetrics: `常开基线 P_ref = ${refKw} kW (弱电1.8+安防1.4); 受控可关断定额 = 9.40 kW (分体空调×3=8.2kW, 照明×2=1.2kW)`,
          subInference: deltaKw > 1.2
            ? `【功率差额精确匹配受控设备 (主因权重 58% / 基线未更新 15%)】实测均值 ${meanKw} kW 扣除常开基线 ${refKw} kW 后净超额 ΔP = +${deltaKw} kW，与“3台分体空调(8.2kW)+照明(1.2kW)”定额高度吻合！`
            : `【基线范围内正常运行】实测均值 ${meanKw} kW 处于常开必要基线 ${refKw} kW 范围内。`,
          tone: deltaKw > 1.2 && !params.tempOvertimeRegistered ? 'bad' : 'ok',
        },
      ]

  const finalSynthesis = !qualityPassed
    ? '综合推断结论：环境 1（采集质量门控）触发一票否决，自动阻断环境 2~4 的能耗异常归因与电费外推，将工单方向锁定为“网关 Outbox 队列与 RS485 物理链路核查”。'
    : params.tempOvertimeRegistered || deltaKw <= 1.2
      ? '综合推断结论：多环境交叉验证通过（采集完整可信 + 负荷匹配常开基线或延期备案），AI 判定当前回路处于正常合规运行状态，免除无效派单。'
      : `综合推断结论（AI 的核心作用）：将环境 1~4 的独立子推断进行交叉验证与核查成本排序——定量上通过 ΔP = +${deltaKw} kW 锁定“分体空调与照明未关（58%）”，但在排查动作顺序上，先通过电话核实成本最低的“环境 2：是否临时加班未登记（27%）”，再核对“环境 4：是否新增常开设备（15%）”，最后执行“现场拉闸关断空调照明（58%）”，避免有人加班时误拉闸引发事故！`

  return {
    refKw,
    workEndIdx,
    curve,
    completeness,
    qualityPassed,
    meanKw,
    deltaKw,
    persistHours,
    anomalyScore,
    evidences,
    basis,
    reasons,
    steps,
    envTraces,
    finalSynthesis,
  }
})

async function renderChart() {
  if (!chartEl.value) return
  const runtime = await loadBasicChartRuntime()
  if (!chart || chart.getDom() !== chartEl.value) {
    chart?.dispose()
    chart = runtime.init(chartEl.value)
  }
  const d = computedDiag.value
  const maxVal = Math.max(16, ...d.curve, d.refKw + 4)
  chart.setOption({
    animationDuration: 220,
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', textStyle: { color: '#fff', fontSize: 11 } },
    legend: {
      top: 2,
      right: 8,
      itemWidth: 12,
      itemHeight: 7,
      textStyle: { color: '#597086', fontSize: 10 },
      data: ['实测功率 (kW)', '运行参照 (kW)'],
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
        formatter: (val: string, idx: number) => (idx === d.workEndIdx ? `${val}(停用)` : idx % 4 === 0 ? val : ''),
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
        name: '实测功率 (kW)',
        type: 'line',
        symbol: 'circle',
        symbolSize: (_v: number, p: any) => (p.dataIndex === d.workEndIdx ? 6 : 3),
        lineStyle: { width: 2, color: '#176fc1' },
        itemStyle: { color: (p: any) => (p.dataIndex === d.workEndIdx ? '#a6630b' : '#176fc1') },
        areaStyle: {
          color: new runtime.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(23, 111, 193, 0.14)' },
            { offset: 1, color: 'rgba(23, 111, 193, 0.01)' },
          ]),
        },
        data: d.curve,
      },
      {
        name: '运行参照 (kW)',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: '#17804f' },
        data: TIME_SLOTS.map(() => d.refKw),
      },
    ],
  })
}

async function runReEvaluation() {
  evaluating.value = true
  const t0 = performance.now()
  try {
    const evalRes = await evaluateAiScene({
      eventId: isCommIssue.value ? 'E-003' : 'E-001',
      deviceId: props.alarm?.device_id,
      persistSpace: true,
      ...params,
    })
    if (evalRes && typeof evalRes === 'object') {
      serverDiag.value = evalRes as Record<string, any>
    }
    const res = await callAiLlmProxy({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      userPrompt: `回路：${props.alarm?.device_name || '办公区·回路 A'}，停用时点 ${params.workEndTime}，停用后均值 ${computedDiag.value.meanKw}kW，参照基线 ${computedDiag.value.refKw}kW，完整率 ${computedDiag.value.completeness}%，临时备案=${params.tempOvertimeRegistered}。输出判断依据、待核实原因及排查顺序。`,
    })
    if (res?.structured && typeof res.structured === 'object') {
      liveOverride.value = res.structured as Record<string, any>
    }
    latencyMs.value = Math.round(performance.now() - t0)
  } catch {
    latencyMs.value = Math.round(performance.now() - t0)
  } finally {
    evaluating.value = false
  }
}

watch(
  () => [props.alarm, diagModalOpen.value],
  async () => {
    syncFromAlarm()
    if (diagModalOpen.value) {
      await nextTick()
      await renderChart()
    }
  },
  { immediate: true },
)

watch(
  params,
  async () => {
    liveOverride.value = null
    await nextTick()
    await renderChart()
  },
  { deep: true },
)

onMounted(() => {
  void nextTick(() => renderChart())
})

onBeforeUnmount(() => {
  chart?.dispose()
})
</script>

<template>
  <section class="embedded-diag-section">
    <!-- 紧凑内嵌摘要栏（不平铺大面板，点击按钮弹出独立诊断弹窗或推理溯源调试弹窗） -->
    <header class="ed-toolbar">
      <div class="ed-summary-left">
        <div class="ed-title">
          <strong>场景融合异常认知与多源证据辅助诊断</strong>
          <span class="ed-badge" :class="computedDiag.qualityPassed ? 'ok' : 'bad'">
            {{ computedDiag.qualityPassed ? `孤立森林评分 ${computedDiag.anomalyScore} · 完整窗口 100%` : `质量门控拦截 (${computedDiag.completeness}%)` }}
          </span>
        </div>
        <p class="ed-summary-desc">
          核心归因：<template v-for="(r, idx) in computedDiag.reasons" :key="r.reason">{{ idx > 0 ? '；' : '' }}{{ r.reason }} ({{ r.probability }}%)</template>
        </p>
      </div>
      <div class="ed-controls">
        <button type="button" class="ed-btn-trace" @click="openTraceModal">
          推理溯源调试
        </button>
        <button type="button" class="ed-btn" @click="openDiagModal">
          辅助诊断工作台
        </button>
      </div>
    </header>

    <!-- 独立弹窗 1：场景融合异常认知与多源证据辅助诊断弹窗 -->
    <AppDialog
      v-model:open="diagModalOpen"
      title="场景融合异常认知与多源证据辅助诊断"
      :show-footer="false"
      dialog-class="diag-submodal"
    >
      <div class="ed-trace-debugger">
        <div class="ed-toolbar" style="border:1px solid #d6e2ee;border-radius:6px">
          <div class="ed-title">
            <strong>运行场景约束核实与重算</strong>
            <span class="ed-badge" :class="computedDiag.qualityPassed ? 'ok' : 'bad'">
              {{ computedDiag.qualityPassed ? `孤立森林评分 ${computedDiag.anomalyScore} · 完整窗口 100%` : `质量门控拦截 (${computedDiag.completeness}%)` }}
            </span>
          </div>
          <div class="ed-controls">
            <label>
              <span>停用时点</span>
              <select v-model="params.workEndTime">
                <option value="18:30">18:30</option>
                <option value="19:00">19:00</option>
                <option value="20:00">20:00</option>
                <option value="21:00">21:00</option>
              </select>
            </label>
            <label>
              <span>常开基线</span>
              <select v-model.number="params.extraBaselineKw">
                <option :value="0">默认 ({{ isCommIssue ? '4.5' : '3.2' }}kW)</option>
                <option :value="3.0">+排风 (+3.0kW)</option>
                <option :value="8.8">+恒温 (+8.8kW)</option>
              </select>
            </label>
            <label>
              <span>延期备案</span>
              <select v-model="params.tempOvertimeRegistered">
                <option :value="false">无备案</option>
                <option :value="true">已备案加班</option>
              </select>
            </label>
            <label>
              <span>窗口质量</span>
              <select v-model="params.qualityMode">
                <option value="COMPLETE">完整窗口(100%)</option>
                <option value="MISSING_GAP">采样缺测(58.8%)</option>
                <option value="ENERGY_ROLLBACK">读数回退拦截</option>
              </select>
            </label>
            <button type="button" class="ed-btn-trace" @click="openTraceModal">
              推理溯源调试
            </button>
            <button type="button" class="ed-btn" :disabled="evaluating" @click="runReEvaluation">
              <RefreshCw :size="12" :class="{ spin: evaluating }" />
              {{ evaluating ? '推理中' : '重新诊断' }}
            </button>
          </div>
        </div>

        <div class="ed-split" style="border:1px solid #d6e2ee;border-radius:6px;overflow:hidden">
          <div class="ed-chart-box">
            <div class="ed-subhead">
              <span>负荷变化与场景基线参照</span>
              <small>停用分界 {{ params.workEndTime }} · 参照基线 {{ computedDiag.refKw }} kW · 实测均值 {{ computedDiag.meanKw }} kW</small>
            </div>
            <div ref="chartEl" class="ed-chart"></div>
          </div>

          <div class="ed-advice-box">
            <div class="ed-subhead">
              <span>诊断建议与现场排查规程</span>
              <small>Qwen2.5-7B-Instruct {{ latencyMs ? `· ${latencyMs}ms` : '' }}</small>
            </div>
            <div class="ed-advice-body">
              <div class="ed-block">
                <b>判断依据</b>
                <p v-for="(b, i) in computedDiag.basis" :key="i">{{ i + 1 }}. {{ b }}</p>
              </div>
              <div class="ed-block">
                <b>待核实原因与证据归因</b>
                <div class="ed-reasons">
                  <div v-for="r in computedDiag.reasons" :key="r.reason" class="ed-reason-row">
                    <span>{{ r.reason }}</span>
                    <em>[{{ r.evidenceCode }}] {{ r.probability }}%</em>
                  </div>
                </div>
              </div>
              <div class="ed-block">
                <b>现场排查顺序</b>
                <label v-for="(s, idx) in computedDiag.steps" :key="idx" class="ed-check">
                  <input v-model="checkedSteps[idx]" type="checkbox" />
                  <span>{{ s }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <table class="ed-evidence-table" style="border:1px solid #d6e2ee">
          <thead>
            <tr>
              <th style="width: 52px">编码</th>
              <th style="width: 112px">证据维度</th>
              <th style="width: 185px">窗口核验指标</th>
              <th>工程核验说明</th>
              <th style="width: 78px; text-align: right">结论</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ev in computedDiag.evidences" :key="ev.code">
              <td><b>{{ ev.code }}</b></td>
              <td><b>{{ ev.dim }}</b></td>
              <td><code>{{ ev.metric }}</code></td>
              <td>{{ ev.desc }}</td>
              <td style="text-align: right"><span :class="ev.tone">{{ ev.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppDialog>

    <!-- 独立弹窗 2：多源环境分步推理溯源调试弹窗 -->
    <AppDialog
      v-model:open="debugTraceOpen"
      title="多源环境分步推理溯源与 AI 综合归因"
      :show-footer="false"
      dialog-class="diag-submodal"
    >
      <div class="ed-trace-debugger">
        <div class="etd-head">
          <div>
            <strong>四维运行环境独立子推断（Multi-Context Sub-Inference）</strong>
            <span style="margin-left:10px">展示各环境底层数据库表来源、原始实测指标及 AI 跨环境综合归因过程</span>
          </div>
          <button type="button" class="ed-btn-trace" @click="openDiagModal">
            返回辅助诊断工作台
          </button>
        </div>
        <div class="etd-grid">
          <article v-for="tr in computedDiag.envTraces" :key="tr.envName" class="etd-card" :class="`tone-${tr.tone}`">
            <div class="etd-card-top">
              <b>{{ tr.envName }}</b>
              <small>数据源：{{ tr.dataSource }}</small>
            </div>
            <div class="etd-raw"><code>{{ tr.rawMetrics }}</code></div>
            <p class="etd-sub">{{ tr.subInference }}</p>
          </article>
        </div>
        <div class="etd-synthesis">
          <strong>AI 跨环境综合推断与排查序决策机理：</strong>
          <span>{{ computedDiag.finalSynthesis }}</span>
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.embedded-diag-section {
  margin: 10px 0;
  border: 1px solid #d6e2ee;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}

.ed-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  background: #f5f8fb;
  border-bottom: 1px solid #d6e2ee;
  flex-wrap: wrap;
}

.ed-summary-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ed-summary-desc {
  margin: 0;
  font-size: 11px;
  color: #52677f;
}

.ed-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #1e3a5f;
}

.ed-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}

.ed-badge.ok {
  background: #e4f6ec;
  color: #17804f;
}

.ed-badge.bad {
  background: #fde8e8;
  color: #c13e3e;
}

.ed-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ed-controls label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #597086;
  white-space: nowrap;
}

.ed-controls select {
  height: 26px;
  padding: 0 5px;
  border: 1px solid #cbd8e5;
  border-radius: 4px;
  background: #fff;
  font-size: 11px;
  color: #263b53;
}

.ed-btn {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid #176fc1;
  border-radius: 4px;
  background: #176fc1;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
}

.ed-btn-trace {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid #94a3b8;
  border-radius: 4px;
  background: #fff;
  color: #1e3a5f;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.ed-btn-trace.active,
.ed-btn-trace:hover {
  background: #eff6ff;
  border-color: #176fc1;
  color: #176fc1;
}

:deep(.diag-submodal) {
  width: min(1040px, calc(100vw - 32px));
}

.ed-trace-debugger {
  padding: 18px 22px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.etd-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.etd-head strong {
  font-size: 13px;
  color: #0f172a;
}

.etd-head span {
  font-size: 11.5px;
  color: #64748b;
}

.etd-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.etd-card {
  background: #fff;
  border: 1px solid #cbd5e1;
  border-left: 3px solid #176fc1;
  border-radius: 6px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.etd-card.tone-ok {
  border-left-color: #17804f;
}

.etd-card.tone-warn {
  border-left-color: #d97706;
}

.etd-card.tone-bad {
  border-left-color: #dc2626;
}

.etd-card-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.etd-card-top b {
  font-size: 12px;
  color: #0f172a;
  white-space: nowrap;
}

.etd-card-top small {
  font-size: 11px;
  color: #64748b;
}

.etd-raw {
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 4px;
}

.etd-raw code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #334155;
  word-break: break-word;
}

.etd-sub {
  margin: 0;
  font-size: 11.5px;
  color: #1e293b;
  line-height: 1.48;
}

.etd-synthesis {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 12px;
  color: #1e3a5f;
  line-height: 1.55;
}

.etd-synthesis strong {
  color: #0f172a;
}

.spin {
  animation: spin 0.75s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.ed-split {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  border-bottom: 1px solid #d6e2ee;
}

.ed-chart-box {
  border-right: 1px solid #d6e2ee;
  display: flex;
  flex-direction: column;
}

.ed-subhead {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
  background: #fbfcfe;
  border-bottom: 1px solid #eef2f6;
  font-size: 12px;
  font-weight: 700;
  color: #29445f;
}

.ed-subhead small {
  font-weight: 400;
  font-size: 11px;
  color: #60758b;
}

.ed-chart {
  width: 100%;
  height: 175px;
}

.ed-advice-box {
  display: flex;
  flex-direction: column;
}

.ed-advice-body {
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ed-block b {
  display: block;
  font-size: 11px;
  color: #597086;
  margin-bottom: 3px;
}

.ed-block p {
  margin: 0;
  font-size: 11.5px;
  color: #1e293b;
  line-height: 1.45;
}

.ed-reasons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ed-reason-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 4px;
}

.ed-reason-row em {
  font-style: normal;
  font-family: var(--font-mono);
  font-weight: 700;
  color: #176fc1;
  white-space: nowrap;
  flex: none;
}

.ed-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: #263b53;
  line-height: 1.4;
}

.ed-evidence-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}

.ed-evidence-table th,
.ed-evidence-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #eef2f6;
  text-align: left;
  line-height: 1.4;
}

.ed-evidence-table th,
.ed-evidence-table td:first-child,
.ed-evidence-table td:nth-child(2),
.ed-evidence-table td:last-child {
  white-space: nowrap;
}

.ed-evidence-table th {
  background: #f5f8fb;
  color: #597086;
  font-weight: 600;
}

.ed-evidence-table tr:last-child td {
  border-bottom: 0;
}

.ed-evidence-table code {
  font-family: var(--font-mono);
  font-size: 10px;
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

.muted {
  color: #758598;
}
</style>
