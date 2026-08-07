<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BellRing, CheckCircle2, ChevronRight, ClipboardCheck, Filter, Search, Siren, UserRound, Wrench } from '@lucide/vue'
import AppDialog from '@/components/app/AppDialog.vue'
import { createAlarmWorkOrder, dealAlarm, executeInspection, experienceOperations, operationAssignees, workOrderAction } from '@/api/platform'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

type QueueItem = RecordRow & { queueKey: string; kind: 'alarm' | 'work' | 'inspection'; sortWeight: number }
type QueueKindFilter = 'all' | 'alarm' | 'work' | 'inspection'
type QueueScope = 'smart' | 'mine' | 'dispatch' | 'all'
type CenterAction = 'deal-alarm' | 'assign' | 'complete' | 'verify' | 'cancel' | 'inspection-normal' | 'inspection-abnormal'
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const payload = ref<RecordRow>({})
const loading = ref(false)
const error = ref('')
const activeKind = ref<QueueKindFilter>('all')
const activeScope = ref<QueueScope>('smart')
const kindOptions = [{ key: 'all', label: '全部' }, { key: 'alarm', label: '告警' }, { key: 'work', label: '工单' }, { key: 'inspection', label: '巡检' }] as const
const scopeOptions = [{ key: 'smart', label: '智能', hint: '我的 + 待分派' }, { key: 'mine', label: '我的', hint: '由我负责' }, { key: 'dispatch', label: '待派', hint: '需要认领' }, { key: 'all', label: '全部', hint: '团队全量' }] as const
const selectedKey = ref('')
const keyword = ref('')
const actionDialog = ref(false)
const actionKind = ref<CenterAction>('deal-alarm')
const actionTarget = ref<QueueItem | null>(null)
const saving = ref(false)
const assigneeKeyword = ref('')
const assignees = ref<RecordRow[]>([])
const actionForm = reactive({ assigneeUserId: '', slaDueTime: '', note: '', causeCategory: '', evidenceUrls: '' })

const summary = computed(() => payload.value.summary as RecordRow || {})
const workOrders = computed(() => Array.isArray(payload.value.workOrders) ? payload.value.workOrders as RecordRow[] : [])
const alarms = computed(() => Array.isArray(payload.value.alarms) ? payload.value.alarms as RecordRow[] : [])
const inspections = computed(() => Array.isArray(payload.value.inspections) ? payload.value.inspections as RecordRow[] : [])
const capabilities = computed(() => payload.value.capabilities as RecordRow || {})
const selectedDevice = computed(() => payload.value.selectedDevice as RecordRow || {})
const queue = computed<QueueItem[]>(() => {
  const rows: QueueItem[] = []
  alarms.value.filter((item) => Number(item.dealStatus) === 0).forEach((item) => rows.push({ ...item, queueKey: `alarm-${item.id}`, kind: 'alarm', sortWeight: 100 + Number(item.alarmLevel || 0) * 10 }))
  workOrders.value.filter((item) => !['CLOSED', 'CANCELLED'].includes(String(item.status))).forEach((item) => rows.push({ ...item, queueKey: `work-${item.id}`, kind: 'work', sortWeight: ({ P1: 95, P2: 75, P3: 55 } as Record<string, number>)[String(item.priority)] || 50 }))
  inspections.value.filter((item) => ['PENDING', 'PROCESSING'].includes(String(item.status))).forEach((item) => rows.push({ ...item, queueKey: `inspection-${item.id}`, kind: 'inspection', sortWeight: 45 }))
  return rows.sort((a, b) => b.sortWeight - a.sortWeight)
})
const currentUserId = computed(() => Number(session.user?.id || 0))
function isMine(item: QueueItem) { return currentUserId.value > 0 && Number(item.assigneeUserId || 0) === currentUserId.value }
function canExecute(item: QueueItem) { return !item.assigneeUserId || isMine(item) || session.roles.includes('super_admin') }
function needsDispatch(item: QueueItem) {
  if (item.kind === 'alarm') return true
  return !item.assigneeUserId && (item.kind !== 'work' || String(item.status) === 'PENDING')
}
function matchesScope(item: QueueItem, scope: QueueScope) {
  if (scope === 'all') return true
  if (scope === 'mine') return isMine(item)
  if (scope === 'dispatch') return needsDispatch(item)
  return isMine(item) || needsDispatch(item)
}
const filteredQueue = computed(() => queue.value.filter((item) => {
  const scopeMatched = matchesScope(item, activeScope.value)
  const kindMatched = activeKind.value === 'all' || item.kind === activeKind.value
  const text = [item.title, item.deviceName, item.orgName, item.pointCode, item.workOrderNo, item.taskNo].join(' ').toLowerCase()
  return scopeMatched && kindMatched && (!keyword.value.trim() || text.includes(keyword.value.trim().toLowerCase()))
}))
const activeItem = computed(() => filteredQueue.value.find((item) => item.queueKey === selectedKey.value) || filteredQueue.value[0] || null)
const actionTitle = computed(() => ({
  'deal-alarm': '登记告警处置', assign: '选择人员并派单', complete: '提交现场处理结果', verify: '验收并关闭工单', cancel: '取消工单',
  'inspection-normal': '确认巡检正常', 'inspection-abnormal': '登记巡检异常',
} as Record<CenterAction, string>)[actionKind.value])
const actionDescription = computed(() => ({
  'deal-alarm': '填写本次研判和处理结论，提交后告警将标记为已处理。', assign: '只显示能够访问当前组织且具备工单流转权限的人员。', complete: '原因、处理方案和证据会进入工单全过程记录。', verify: '复核现场结果后关闭工单；告警来源工单会同步关闭原告警。', cancel: '取消仅适用于待派单或待接单工单，并保留原因。',
  'inspection-normal': '确认设备状态正常并完成本次巡检。', 'inspection-abnormal': '填写异常现象后，系统会自动创建关联运维工单。',
} as Record<CenterAction, string>)[actionKind.value])

async function load() {
  loading.value = true
  error.value = ''
  try {
    payload.value = await experienceOperations({ deviceId: route.query.deviceId || undefined })
    const focusedKey = route.query.workOrderId ? `work-${route.query.workOrderId}` : ''
    if (!selectedKey.value && focusedKey && filteredQueue.value.some((item) => item.queueKey === focusedKey)) selectedKey.value = focusedKey
    if (!filteredQueue.value.some((item) => item.queueKey === selectedKey.value)) selectedKey.value = filteredQueue.value[0]?.queueKey || ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '处置队列读取失败'
  } finally { loading.value = false }
}

async function convertAlarm(item: QueueItem) {
  error.value = ''
  try {
    const order = await createAlarmWorkOrder(item.id)
    if (order.id) selectedKey.value = `work-${order.id}`
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '告警转工单失败' }
}

async function loadAssignees() {
  if (!actionTarget.value?.orgId) return
  try { assignees.value = await operationAssignees({ orgId: actionTarget.value.orgId, keyword: assigneeKeyword.value || undefined }) }
  catch (e) { error.value = e instanceof Error ? e.message : '可派人员读取失败' }
}

async function openAction(action: CenterAction, item: QueueItem) {
  actionKind.value = action
  actionTarget.value = item
  Object.assign(actionForm, { assigneeUserId: '', slaDueTime: '', note: '', causeCategory: '', evidenceUrls: '' })
  assigneeKeyword.value = ''
  assignees.value = []
  actionDialog.value = true
  if (action === 'assign') await loadAssignees()
}

async function runWorkAction(item: QueueItem, action: 'accept' | 'arrive') {
  saving.value = true
  error.value = ''
  try { await workOrderAction(item.id, action); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '工单流转失败' }
  finally { saving.value = false }
}

async function submitAction() {
  const item = actionTarget.value
  if (!item) return
  saving.value = true
  error.value = ''
  try {
    if (['deal-alarm', 'complete', 'verify', 'cancel', 'inspection-abnormal'].includes(actionKind.value) && !actionForm.note.trim()) {
      throw new Error(actionKind.value === 'inspection-abnormal' ? '请描述巡检发现的异常现象' : '请填写本次操作说明')
    }
    if (actionKind.value === 'deal-alarm') {
      await dealAlarm(item.id, { dealUser: session.user?.username || session.user?.nickname || '当前用户', dealRemark: actionForm.note })
    } else if (actionKind.value === 'inspection-normal' || actionKind.value === 'inspection-abnormal') {
      const abnormal = actionKind.value === 'inspection-abnormal'
      const result = await executeInspection(item.id, { result: abnormal ? 'ABNORMAL' : 'NORMAL', resultRemark: actionForm.note, evidenceUrls: actionForm.evidenceUrls || undefined })
      const workOrderId = result.workOrderId || result.work_order_id
      if (abnormal && workOrderId) selectedKey.value = `work-${workOrderId}`
    } else {
      const body: RecordRow = {}
      if (actionKind.value === 'assign') {
        if (!actionForm.assigneeUserId) throw new Error('请选择处理人')
        body.assigneeUserId = Number(actionForm.assigneeUserId)
        body.slaDueTime = actionForm.slaDueTime || undefined
        body.remark = actionForm.note || undefined
      }
      if (actionKind.value === 'complete') Object.assign(body, { causeCategory: actionForm.causeCategory || undefined, solution: actionForm.note, evidenceUrls: actionForm.evidenceUrls || undefined })
      if (actionKind.value === 'verify') body.verifyRemark = actionForm.note
      if (actionKind.value === 'cancel') body.remark = actionForm.note
      await workOrderAction(item.id, actionKind.value, body)
    }
    actionDialog.value = false
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '业务操作失败' }
  finally { saving.value = false }
}

function go(path: string, query: Record<string, unknown> = {}) { void router.push({ path, query: query as any }) }
async function clearScope() { await router.push('/center/operations'); await load() }
function setKind(kind: QueueKindFilter) { activeKind.value = kind }
function setScope(scope: QueueScope) {
  activeScope.value = scope
  if (!filteredQueue.value.some((item) => item.queueKey === selectedKey.value)) selectedKey.value = filteredQueue.value[0]?.queueKey || ''
}
function scopeCount(scope: QueueScope) { return queue.value.filter((item) => matchesScope(item, scope)).length }
function kindLabel(kind: QueueItem['kind']) { return ({ alarm: '告警', work: '工单', inspection: '巡检' })[kind] }
function title(item: QueueItem) { return String(item.title || (item.kind === 'alarm' ? `${item.pointCode || '设备'}异常` : `${item.deviceName || '设备'}巡检`)) }
function status(item: QueueItem) { return item.kind === 'alarm' ? '等待研判' : String(item.status || 'PENDING') }
function personName(item: RecordRow) { return String(item.nickname || item.username || `用户 ${item.id}`) }

onMounted(load)
</script>

<template>
  <section class="view-page business-center-page" :class="{ loading }">
    <header class="center-titlebar">
      <div><p class="eyebrow">OPERATIONS COMMAND CENTER</p><h1>运行处置中心</h1><p>告警、工单和巡检汇入一个处理队列；先研判事件，再沿同一设备上下文完成闭环。</p></div>
      <div class="center-summary-strip"><span class="danger"><b>{{ summary.urgent || 0 }}</b>紧急工单</span><span><b>{{ summary.openWorkOrders || 0 }}</b>进行中</span><span class="warn"><b>{{ summary.openAlarms || 0 }}</b>待处置告警</span><span><b>{{ summary.pendingInspections || 0 }}</b>待巡检</span></div>
    </header>
    <div v-if="selectedDevice.id" class="context-banner"><Filter :size="15" /><span>当前只看：<b>{{ selectedDevice.deviceName }}</b></span><button @click="clearScope">清除设备范围</button></div>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <div class="command-workspace">
      <aside class="queue-panel">
        <div class="object-rail-head"><b>统一处理队列</b><small>{{ filteredQueue.length }} 项</small></div>
        <div class="queue-scope-filter"><button v-for="option in scopeOptions" :key="option.key" :class="{ active: activeScope === option.key }" @click="setScope(option.key)"><span><b>{{ option.label }}</b><small>{{ option.hint }}</small></span><em>{{ scopeCount(option.key) }}</em></button></div>
        <div class="queue-filter"><button v-for="option in kindOptions" :key="option.key" :class="{ active: activeKind === option.key }" @click="setKind(option.key)">{{ option.label }}</button></div>
        <input v-model="keyword" class="rail-search" placeholder="搜索设备、组织或任务" />
        <div class="queue-list">
          <button v-for="item in filteredQueue" :key="item.queueKey" :class="[{ active: activeItem?.queueKey === item.queueKey }, item.kind]" @click="selectedKey = item.queueKey">
            <span class="queue-kind"><Siren v-if="item.kind === 'alarm'" :size="15" /><Wrench v-else-if="item.kind === 'work'" :size="15" /><ClipboardCheck v-else :size="15" />{{ kindLabel(item.kind) }}</span>
            <b>{{ title(item) }}</b><small>{{ item.deviceName || '未关联设备' }} · {{ item.orgName }}</small><em>{{ status(item) }} <ChevronRight :size="13" /></em>
          </button>
          <div v-if="!filteredQueue.length" class="center-empty"><CheckCircle2 :size="25" /><b>当前队列已清空</b><span>没有符合条件的待办。</span></div>
        </div>
      </aside>

      <main v-if="activeItem" class="case-stage">
        <header class="case-head"><div><span :class="['case-type', activeItem.kind]">{{ kindLabel(activeItem.kind) }}</span><h2>{{ title(activeItem) }}</h2><p>{{ activeItem.deviceName || '未关联设备' }} · {{ activeItem.orgName }} · {{ activeItem.alarmTime || activeItem.reportTime || activeItem.dueTime || activeItem.taskDate }}</p></div><span :class="['case-priority', activeItem.kind]">{{ activeItem.priority || (activeItem.kind === 'alarm' ? `L${activeItem.alarmLevel}` : status(activeItem)) }}</span></header>

        <section class="case-story">
          <div class="story-step done"><i>1</i><span><b>事件进入</b><small>{{ activeItem.sourceType || kindLabel(activeItem.kind) }}形成待办</small></span></div>
          <div :class="['story-step', { done: activeItem.kind !== 'alarm' || activeItem.workOrderId }]"><i>2</i><span><b>研判与派发</b><small>{{ activeItem.kind === 'alarm' && !activeItem.workOrderId ? '决定直接处理或转工单' : '已进入责任人处理链' }}</small></span></div>
          <div :class="['story-step', { done: activeItem.kind === 'work' && ['VERIFYING','CLOSED'].includes(String(activeItem.status)) }]"><i>3</i><span><b>现场执行</b><small>接单、到场、填写处理结果</small></span></div>
          <div :class="['story-step', { done: activeItem.kind === 'work' && String(activeItem.status) === 'CLOSED' }]"><i>4</i><span><b>复核归档</b><small>验收结果并保留全过程留痕</small></span></div>
        </section>

        <div class="case-grid">
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">WHAT HAPPENED</p><h3>事件信息</h3></div><BellRing :size="18" /></div><dl class="context-facts"><div><dt>业务状态</dt><dd>{{ status(activeItem) }}</dd></div><div><dt>设备</dt><dd>{{ activeItem.deviceName || '--' }}</dd></div><div v-if="activeItem.kind === 'alarm'"><dt>触发值 / 阈值</dt><dd>{{ activeItem.alarmValue || '--' }} / {{ activeItem.thresholdValue || '--' }}</dd></div><div v-if="activeItem.assigneeName"><dt>当前处理人</dt><dd>{{ activeItem.assigneeName }}</dd></div><div v-if="activeItem.slaDueTime || activeItem.dueTime"><dt>要求完成</dt><dd>{{ activeItem.slaDueTime || activeItem.dueTime }}</dd></div></dl><p class="case-description">{{ activeItem.description || activeItem.resultRemark || '该事项暂无补充说明。' }}</p></article>
          <article class="context-panel next-action-panel">
            <div class="context-panel-head"><div><p class="eyebrow">NEXT BEST ACTION</p><h3>建议下一步</h3></div><ChevronRight :size="18" /></div>
            <template v-if="activeItem.kind === 'alarm'">
              <h4>{{ activeItem.workOrderId ? '告警已关联工单' : '研判后选择处置方式' }}</h4>
              <p>需要现场处理时转工单；能够立即排除的问题可直接登记处置。</p>
              <button v-if="!activeItem.workOrderId && capabilities.createWorkOrders" class="primary wide" :disabled="saving" @click="convertAlarm(activeItem)">转为运维工单</button>
              <button v-if="!activeItem.workOrderId && capabilities.dealAlarms" class="quiet wide" @click="openAction('deal-alarm', activeItem)">直接登记处置</button>
              <p v-if="activeItem.workOrderId" class="case-description">关联工单已进入下方统一队列，可继续完成派单和现场处理。</p>
            </template>
            <template v-else-if="activeItem.kind === 'work'">
              <h4>{{ activeItem.status === 'PENDING' ? '明确责任人并派单' : activeItem.status === 'ASSIGNED' ? '处理人确认接单' : activeItem.status === 'ACCEPTED' ? '登记到场开始处理' : activeItem.status === 'PROCESSING' ? '提交现场处理结果' : '复核结果并关闭工单' }}</h4>
              <p>所有动作都在当前事项完成，系统自动记录操作人、时间和状态变化。</p>
              <button v-if="activeItem.status === 'PENDING' && capabilities.operateWorkOrders" class="primary wide" @click="openAction('assign', activeItem)">选择人员并派单</button>
              <button v-else-if="activeItem.status === 'ASSIGNED' && capabilities.operateWorkOrders" class="primary wide" :disabled="saving || !canExecute(activeItem)" @click="runWorkAction(activeItem, 'accept')">{{ canExecute(activeItem) ? '确认接单' : `等待 ${activeItem.assigneeName || '处理人'} 接单` }}</button>
              <button v-else-if="activeItem.status === 'ACCEPTED' && capabilities.operateWorkOrders" class="primary wide" :disabled="saving || !canExecute(activeItem)" @click="runWorkAction(activeItem, 'arrive')">{{ canExecute(activeItem) ? '登记到场' : `由 ${activeItem.assigneeName || '处理人'} 继续` }}</button>
              <button v-else-if="activeItem.status === 'PROCESSING' && capabilities.operateWorkOrders" class="primary wide" :disabled="!canExecute(activeItem)" @click="openAction('complete', activeItem)">{{ canExecute(activeItem) ? '提交处理结果' : `由 ${activeItem.assigneeName || '处理人'} 处理中` }}</button>
              <button v-else-if="activeItem.status === 'VERIFYING' && capabilities.operateWorkOrders" class="primary wide" @click="openAction('verify', activeItem)">验收并关闭</button>
              <button v-if="['PENDING','ASSIGNED'].includes(String(activeItem.status)) && capabilities.operateWorkOrders" class="quiet wide danger-text" @click="openAction('cancel', activeItem)">取消工单</button>
              <button v-if="capabilities.viewArchive" class="inline-action" @click="go('/center/assets', { deviceId: activeItem.deviceId })">查看设备运行全貌 <ChevronRight :size="14" /></button>
              <button v-else-if="capabilities.viewEnergy" class="inline-action" @click="go('/monitor/realtime', { deviceId: activeItem.deviceId })">查看设备实时数据 <ChevronRight :size="14" /></button>
            </template>
            <template v-else>
              <h4>提交本次现场检查结果</h4>
              <p>异常结果会自动创建工单，并携带巡检来源、设备和异常说明。</p>
              <button v-if="capabilities.operateInspections" class="primary wide" :disabled="!canExecute(activeItem)" @click="openAction('inspection-normal', activeItem)">{{ canExecute(activeItem) ? '确认设备正常' : `等待 ${activeItem.assigneeName || '巡检人'} 执行` }}</button>
              <button v-if="capabilities.operateInspections && canExecute(activeItem)" class="quiet wide danger-text" @click="openAction('inspection-abnormal', activeItem)">发现异常并转工单</button>
            </template>
          </article>
        </div>
      </main>
      <main v-else class="case-stage center-empty-stage"><CheckCircle2 :size="42" /><h2>很好，当前没有待处理事项</h2><p>可以切换筛选条件，或前往资产运营中心做主动巡检。</p><button class="quiet" @click="go('/center/assets')">去资产巡检</button></main>
    </div>

    <AppDialog v-model:open="actionDialog" :title="actionTitle" :description="actionDescription" :saving="saving" :confirm-text="actionKind === 'assign' ? '确认派单' : actionKind === 'verify' ? '确认验收' : '提交'" @submit="submitAction">
      <div class="dialog-fields operations-action-fields">
        <template v-if="actionKind === 'assign'">
          <label class="dialog-field full"><span>查找处理人</span><div class="assignee-search"><Search :size="15" /><input v-model="assigneeKeyword" placeholder="姓名、账号或手机号" @keyup.enter="loadAssignees"><button class="quiet" type="button" @click="loadAssignees">搜索</button></div></label>
          <div class="assignee-grid full">
            <button v-for="person in assignees" :key="String(person.id)" type="button" :class="{ selected: actionForm.assigneeUserId === String(person.id) }" @click="actionForm.assigneeUserId = String(person.id)"><i><UserRound :size="16" /></i><span><b>{{ personName(person) }}</b><small>{{ person.orgName || '授权组织' }} · {{ person.phone || person.username }}</small></span><em>{{ actionForm.assigneeUserId === String(person.id) ? '已选择' : '选择' }}</em></button>
            <p v-if="!assignees.length" class="center-empty">当前组织范围内没有可派人员。</p>
          </div>
          <label class="dialog-field"><span>SLA 要求完成时间</span><input v-model="actionForm.slaDueTime" type="datetime-local"></label>
          <label class="dialog-field"><span>派单说明</span><input v-model="actionForm.note" placeholder="可选"></label>
        </template>
        <template v-else-if="actionKind === 'complete'">
          <label class="dialog-field"><span>故障原因分类</span><select v-model="actionForm.causeCategory"><option value="">请选择</option><option value="接入通信">接入通信</option><option value="设备故障">设备故障</option><option value="供电异常">供电异常</option><option value="参数配置">参数配置</option><option value="其他">其他</option></select></label>
          <label class="dialog-field"><span>证据地址</span><input v-model="actionForm.evidenceUrls" placeholder="照片或附件地址，可选"></label>
          <label class="dialog-field full"><span>处理方案与结果*</span><textarea v-model="actionForm.note" required placeholder="说明现场采取的措施以及恢复情况"></textarea></label>
        </template>
        <template v-else-if="actionKind === 'inspection-normal' || actionKind === 'inspection-abnormal'">
          <label class="dialog-field full"><span>{{ actionKind === 'inspection-abnormal' ? '异常现象*' : '巡检说明' }}</span><textarea v-model="actionForm.note" :required="actionKind === 'inspection-abnormal'" :placeholder="actionKind === 'inspection-abnormal' ? '描述异常现象，系统将据此创建工单' : '可填写读数、现场状态等信息'"></textarea></label>
          <label class="dialog-field full"><span>现场证据地址</span><input v-model="actionForm.evidenceUrls" placeholder="照片或附件地址，可选"></label>
        </template>
        <label v-else class="dialog-field full"><span>{{ actionKind === 'deal-alarm' ? '处置结论*' : actionKind === 'verify' ? '验收说明*' : '取消原因*' }}</span><textarea v-model="actionForm.note" required></textarea></label>
      </div>
    </AppDialog>
  </section>
</template>
