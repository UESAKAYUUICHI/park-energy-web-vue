<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, BellRing, ChevronRight, CircleAlert, Cpu, Gauge, RadioReceiver, RefreshCw, Settings2, Wrench } from '@lucide/vue'
import AppDialog from '@/components/app/AppDialog.vue'
import { createWorkOrder, experienceAssets } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const activeTab = ref<'running' | 'events' | 'setup'>('running')
const payload = ref<RecordRow>({})
const repairDialog = ref(false)
const creatingRepair = ref(false)
const repairForm = reactive({ priority: 'P2', title: '', description: '', slaDueTime: '' })

const summary = computed(() => payload.value.summary as RecordRow || {})
const devices = computed(() => Array.isArray(payload.value.devices) ? payload.value.devices as RecordRow[] : [])
const selected = computed(() => payload.value.selectedDevice as RecordRow || {})
const alarms = computed(() => Array.isArray(payload.value.recentAlarms) ? payload.value.recentAlarms as RecordRow[] : [])
const workOrders = computed(() => Array.isArray(payload.value.workOrders) ? payload.value.workOrders as RecordRow[] : [])
const commands = computed(() => Array.isArray(payload.value.recentCommands) ? payload.value.recentCommands as RecordRow[] : [])
const pointDefinitions = computed(() => Array.isArray(payload.value.pointDefinitions) ? payload.value.pointDefinitions as RecordRow[] : [])
const diagnostics = computed(() => Array.isArray(payload.value.diagnostics) ? payload.value.diagnostics as RecordRow[] : [])
const capabilities = computed(() => payload.value.capabilities as RecordRow || {})
const realtimeEnvelope = computed(() => payload.value.realtime as RecordRow || {})
const realtime = computed(() => {
  const value = realtimeEnvelope.value.data
  return value && typeof value === 'object' ? value as RecordRow : {}
})
const realtimePoints = computed(() => {
  const values = realtime.value.points
  if (!values || typeof values !== 'object') return []
  const definitions = new Map(pointDefinitions.value.map((item, index) => [String(item.pointCode ?? item.point_code), { ...item, index } as RecordRow]))
  return Object.entries(values as Record<string, unknown>).map(([code, value], index) => {
    const definition = definitions.get(code)
    return {
      code,
      value,
      name: String(definition?.pointName ?? definition?.point_name ?? code),
      unit: String(definition?.unit ?? ''),
      sort: Number(definition?.sort ?? (1000 + index)),
    }
  }).sort((left, right) => left.sort - right.sort)
})
const highlightedRealtimePoints = computed(() => realtimePoints.value.slice(0, 8))
const filteredDevices = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return devices.value
  return devices.value.filter((item) => [item.deviceName, item.deviceSn, item.orgName, item.gatewayName].some((part) => String(part || '').toLowerCase().includes(value)))
})
const healthScore = computed(() => {
  if (!selected.value.id) return 0
  let score = 100
  if (Number(selected.value.gatewayOnline) !== 1) score -= 35
  if (!selected.value.qualityStatus) score -= 20
  else if (String(selected.value.qualityStatus) !== 'NORMAL') score -= 25
  score -= Math.min(30, Number(selected.value.openAlarmCount || 0) * 10)
  return Math.max(0, score)
})
const healthLabel = computed(() => healthScore.value >= 90 ? '运行良好' : healthScore.value >= 65 ? '需要关注' : '优先处理')

async function load(deviceId?: unknown) {
  loading.value = true
  error.value = ''
  try {
    payload.value = await experienceAssets({ deviceId: deviceId || undefined })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '资产运营上下文读取失败'
  } finally {
    loading.value = false
  }
}

async function selectDevice(id: unknown) {
  await router.replace({ path: '/center/assets', query: { deviceId: String(id) } })
  await load(id)
}

function go(path: string, query: Record<string, unknown> = {}) {
  void router.push({ path, query: query as any })
}

function qualityText(value: unknown) {
  return ({ NORMAL: '采集正常', INCOMPLETE: '数据不完整', ABNORMAL: '采集异常' } as Record<string, string>)[String(value || '')] || '等待质量统计'
}

function formatPointValue(value: unknown) {
  if (typeof value === 'number') return value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })
  return value == null || value === '' ? '--' : String(value)
}

function openDiagnostic(item: RecordRow) {
  if (String(item.severity) === 'PASSED') return
  const path = String(item.actionPath || '')
  if (!path) return
  if (path === '/archive/devices') {
    go(`/device-archive/devices/${selected.value.id}`)
    return
  }
  go(path, { deviceId: selected.value.id })
}

function openRepair() {
  const findings = diagnostics.value.filter((item) => item.severity !== 'PASSED').map((item) => item.title).join('；')
  Object.assign(repairForm, {
    priority: healthScore.value < 65 ? 'P1' : 'P2',
    title: `${selected.value.deviceName || '设备'}检修`,
    description: findings ? `资产运营中心诊断：${findings}` : '',
    slaDueTime: '',
  })
  repairDialog.value = true
}

async function submitRepair() {
  if (!repairForm.title.trim()) { error.value = '请填写检修工单标题'; return }
  creatingRepair.value = true
  error.value = ''
  try {
    const order = await createWorkOrder({
      orgId: Number(selected.value.orgId), deviceId: Number(selected.value.id), workType: 'FAULT',
      priority: repairForm.priority, title: repairForm.title, description: repairForm.description,
      slaDueTime: repairForm.slaDueTime || undefined,
    })
    repairDialog.value = false
    await router.push({ path: '/center/operations', query: { deviceId: String(selected.value.id), workOrderId: String(order.id) } })
  } catch (e) { error.value = e instanceof Error ? e.message : '检修工单创建失败' }
  finally { creatingRepair.value = false }
}

onMounted(() => load(route.query.deviceId))
</script>

<template>
  <section class="view-page business-center-page" :class="{ loading }">
    <header class="center-titlebar">
      <div><p class="eyebrow">ASSET OPERATIONS CENTER</p><h1>资产运营中心</h1><p>选中设备后，档案、接入、质量、异常和运维记录会自动组合到同一上下文。</p></div>
      <div class="center-summary-strip"><span><b>{{ summary.deviceCount || 0 }}</b>台设备</span><span><b>{{ summary.onlineCount || 0 }}</b>网关在线</span><span class="warn"><b>{{ summary.abnormalCount || 0 }}</b>质量关注</span><span class="danger"><b>{{ summary.openAlarmCount || 0 }}</b>未结告警</span></div>
    </header>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <div class="object-workspace">
      <aside class="object-rail">
        <div class="object-rail-head"><b>设备资产</b><small>{{ filteredDevices.length }} / {{ devices.length }}</small></div>
        <input v-model="keyword" class="rail-search" placeholder="搜索设备、组织或网关" />
        <div class="object-list">
          <button v-for="item in filteredDevices" :key="String(item.id)" :class="{ active: String(item.id) === String(selected.id) }" @click="selectDevice(item.id)">
            <i :class="{ online: Number(item.gatewayOnline) === 1, alert: Number(item.openAlarmCount) > 0 }"></i>
            <span><b>{{ item.deviceName }}</b><small>{{ item.orgName }} · {{ item.deviceSn }}</small></span>
            <em v-if="Number(item.openAlarmCount)">{{ item.openAlarmCount }}</em><ChevronRight v-else :size="14" />
          </button>
          <p v-if="!filteredDevices.length" class="center-empty">没有匹配的设备</p>
        </div>
      </aside>

      <main v-if="selected.id" class="object-stage">
        <header class="object-identity">
          <div class="object-icon"><Cpu :size="25" /></div>
          <div><div class="identity-line"><h2>{{ selected.deviceName }}</h2><span :class="['health-pill', healthScore < 65 ? 'danger' : healthScore < 90 ? 'warn' : '']">{{ healthLabel }} · {{ healthScore }}</span></div><p>{{ selected.orgName }} / {{ selected.installLocation || '未填写安装位置' }} · {{ selected.deviceTypeName || '通用设备' }}</p></div>
          <div class="identity-actions"><button v-if="capabilities.viewEnergy" class="quiet" :disabled="loading" @click="load(selected.id)"><RefreshCw :size="15" />刷新快照</button><button v-if="capabilities.viewEnergy" class="primary" @click="go('/monitor/realtime', { deviceId: selected.id })"><Activity :size="15" />完整监控</button><button class="quiet" @click="go(`/device-archive/devices/${selected.id}`)">完整档案</button></div>
        </header>

        <section class="center-kpis">
          <article><RadioReceiver :size="17" /><span>接入状态</span><strong :class="{ bad: Number(selected.gatewayOnline) !== 1 }">{{ Number(selected.gatewayOnline) === 1 ? '在线' : '离线' }}</strong><small>{{ selected.gatewayName || '尚未绑定网关' }}</small></article>
          <article><Gauge :size="17" /><span>最近完整率</span><strong>{{ selected.completeRate == null ? '--' : `${selected.completeRate}%` }}</strong><small>{{ qualityText(selected.qualityStatus) }}</small></article>
          <article><BellRing :size="17" /><span>未处理告警</span><strong :class="{ bad: Number(selected.openAlarmCount) > 0 }">{{ selected.openAlarmCount || 0 }}</strong><small>与当前设备直接关联</small></article>
          <article><Wrench :size="17" /><span>进行中工单</span><strong>{{ selected.openWorkOrderCount || 0 }}</strong><small>从异常到关闭的处理链</small></article>
        </section>

        <nav class="center-tabs"><button :class="{ active: activeTab === 'running' }" @click="activeTab = 'running'">运行画像</button><button :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">事件与处置 <i>{{ alarms.length + workOrders.length }}</i></button><button :class="{ active: activeTab === 'setup' }" @click="activeTab = 'setup'">接入与结算配置</button></nav>

        <div v-if="activeTab === 'running'" class="center-panel-grid">
          <article class="context-panel full-panel realtime-snapshot-panel"><div class="context-panel-head"><div><p class="eyebrow">REALTIME SNAPSHOT</p><h3>实时测点快照</h3></div><span class="snapshot-meta">{{ realtime.collectTime || selected.lastCollectTime || '等待设备上报' }}<small v-if="realtime.dataQuality != null">质量标记 {{ realtime.dataQuality }}</small></span></div><div v-if="realtimePoints.length" class="realtime-point-grid"><article v-for="point in highlightedRealtimePoints" :key="point.code"><span>{{ point.name }}</span><strong>{{ formatPointValue(point.value) }} <small>{{ point.unit }}</small></strong><em>{{ point.code }}</em></article></div><div v-else class="realtime-unavailable"><RadioReceiver :size="22" /><div><b>暂时没有实时快照</b><p>{{ realtimeEnvelope.message || '设备可能尚未上报，或实时数据服务暂不可用。页面其他业务上下文仍可正常使用。' }}</p></div></div><button v-if="capabilities.viewEnergy && realtimePoints.length" class="inline-action" @click="go('/monitor/realtime', { deviceId: selected.id })">查看全部 {{ realtimePoints.length }} 个实时测点 <ChevronRight :size="14" /></button></article>
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">DIAGNOSTICS</p><h3>系统诊断与下一步</h3></div><CircleAlert :size="19" /></div><div class="judgement-card" :class="{ danger: healthScore < 65, warn: healthScore >= 65 && healthScore < 90 }"><CircleAlert :size="20" /><div><b>{{ healthLabel }} · 健康分 {{ healthScore }}</b><p>诊断已联合网关、实时快照、采集质量、告警与工单状态，不需要逐页核对。</p></div></div><div class="diagnostic-list"><button v-for="item in diagnostics" :key="String(item.code)" :class="String(item.severity).toLowerCase()" :disabled="item.severity === 'PASSED' || !item.actionPath" @click="openDiagnostic(item)"><i></i><span><b>{{ item.title }}</b><small>{{ item.detail }}</small></span><ChevronRight v-if="item.severity !== 'PASSED' && item.actionPath" :size="14" /></button></div><dl class="context-facts"><div><dt>今日统计用量</dt><dd>{{ Number(selected.todayUsage || 0).toFixed(2) }} kWh</dd></div><div><dt>设备倍率</dt><dd>{{ selected.meterFactor || 1 }}</dd></div></dl><div class="context-actions"><button v-if="capabilities.createWorkOrders && capabilities.viewWorkOrders" class="primary" @click="openRepair"><Wrench :size="14" />发起检修工单</button><button v-if="capabilities.viewEnergy" class="quiet" @click="go('/analysis/history', { deviceId: selected.id })">趋势与明细</button></div></article>
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">RECENT COMMANDS</p><h3>最近控制指令</h3></div><RadioReceiver :size="19" /></div><div v-if="commands.length" class="compact-feed"><div v-for="item in commands" :key="String(item.commandId)"><i :class="`s${item.commandStatus}`"></i><span><b>{{ item.commandType }}</b><small>{{ item.createTime }}</small></span><em>{{ ['待下发','已发布','成功','失败','超时'][Number(item.commandStatus)] || '未知' }}</em></div></div><p v-else class="center-empty">当前设备暂无指令记录，或当前角色无权查看。</p><button v-if="capabilities.sendCommand" class="inline-action" @click="go('/access/control', { deviceId: selected.id })">进入设备控制 <ChevronRight :size="14" /></button></article>
        </div>

        <div v-else-if="activeTab === 'events'" class="center-panel-grid">
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">ALARMS</p><h3>告警事件</h3></div><BellRing :size="19" /></div><div v-if="alarms.length" class="business-feed"><button v-for="item in alarms" :key="String(item.id)" @click="go('/center/operations', { deviceId: selected.id })"><span :class="['feed-level', `l${item.alarmLevel}`]">L{{ item.alarmLevel }}</span><div><b>{{ item.pointCode || '设备异常' }}：{{ item.alarmValue || '--' }}</b><small>{{ item.alarmTime }} · {{ Number(item.dealStatus) ? '已处理' : '等待处置' }}</small></div><ChevronRight :size="14" /></button></div><p v-else class="center-empty">没有告警，或当前角色无权查看告警。</p></article>
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">WORK ORDERS</p><h3>关联工单</h3></div><Wrench :size="19" /></div><div v-if="workOrders.length" class="business-feed"><button v-for="item in workOrders" :key="String(item.id)" @click="go('/center/operations', { deviceId: selected.id })"><span :class="['priority', String(item.priority).toLowerCase()]">{{ item.priority }}</span><div><b>{{ item.title }}</b><small>{{ item.status }} · {{ item.assigneeName || '待分派' }}</small></div><ChevronRight :size="14" /></button></div><p v-else class="center-empty">没有关联工单，或当前角色无权查看工单。</p></article>
        </div>

        <div v-else class="center-panel-grid">
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">ACCESS</p><h3>接入配置摘要</h3></div><RadioReceiver :size="19" /></div><dl class="context-facts"><div><dt>所属网关</dt><dd>{{ selected.gatewayName || '未绑定' }}</dd></div><div><dt>设备编号</dt><dd>{{ selected.deviceSn }}</dd></div><div><dt>最近在线</dt><dd>{{ selected.gatewayLastOnline || '暂无' }}</dd></div></dl><div class="context-actions"><button v-if="capabilities.viewAccess" class="quiet" @click="go('/access/diagnostic', { deviceId: selected.id })">接入诊断</button><button v-if="capabilities.editArchive" class="quiet" @click="go('/archive/devices')">修改档案</button></div></article>
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">SETTLEMENT</p><h3>结算角色摘要</h3></div><Settings2 :size="19" /></div><dl class="context-facts"><div><dt>是否结算表计</dt><dd>{{ Number(selected.settlementEnabled) ? '是' : '否' }}</dd></div><div><dt>计量角色</dt><dd>{{ selected.meterRole || '--' }}</dd></div><div><dt>质量门槛</dt><dd>{{ selected.qualityThresholdPct || 95 }}%</dd></div></dl><button v-if="capabilities.viewBilling" class="inline-action" @click="go('/center/revenue')">前往经营结算中心 <ChevronRight :size="14" /></button><p v-else class="center-empty">当前角色仅可查看设备侧结算配置。</p></article>
        </div>
      </main>
      <div v-else class="object-stage center-empty-stage"><Cpu :size="38" /><h2>尚无可用设备</h2><p>请检查当前账号的数据范围，或先在资产配置中建设备档案。</p></div>
    </div>
    <AppDialog v-model:open="repairDialog" title="发起设备检修" description="设备、组织和当前诊断会自动带入；创建后直接进入该工单的处置现场。" :saving="creatingRepair" confirm-text="创建并进入处置" @submit="submitRepair"><div class="dialog-fields"><label class="dialog-field"><span>优先级</span><select v-model="repairForm.priority"><option value="P1">P1 · 紧急</option><option value="P2">P2 · 一般</option><option value="P3">P3 · 计划处理</option></select></label><label class="dialog-field"><span>SLA 要求完成时间</span><input v-model="repairForm.slaDueTime" type="datetime-local"></label><label class="dialog-field full"><span>工单标题*</span><input v-model="repairForm.title" required></label><label class="dialog-field full"><span>问题描述</span><textarea v-model="repairForm.description" placeholder="补充现场现象、影响范围或检查建议"></textarea></label></div></AppDialog>
  </section>
</template>
