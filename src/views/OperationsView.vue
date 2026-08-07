<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CheckCircle2, CircleDashed, Clock3, MapPin, Send, Wrench } from '@lucide/vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { createWorkOrder, executeInspection, generateInspectionTasks, inspectionPlans, inspectionTasks, listResource, saveInspectionPlan, workOrderAction, workOrders } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

const route = useRoute()
const session = useSessionStore()
const error = useAlertRef()
const isWorkOrder = computed(() => String(route.meta.resource) === 'work-orders')
const rows = ref<RecordRow[]>([])
const plans = ref<RecordRow[]>([])
const tasks = ref<RecordRow[]>([])
const orgs = ref<RecordRow[]>([])
const devices = ref<RecordRow[]>([])
const keyword = ref('')
const status = ref('')
const loading = ref(false)
const dialog = ref(false)
const planDialog = ref(false)
const actionDialog = ref(false)
const inspectionDialog = ref(false)
const activeAction = ref('')
const activeOrder = ref<RecordRow | null>(null)
const activeInspection = ref<RecordRow | null>(null)
const taskDate = ref(new Date().toISOString().slice(0, 10))
const deviceId = ref('')
const workForm = reactive({ orgId: '', deviceId: '', title: '', description: '', priority: 'P2', slaDueTime: '' })
const actionForm = reactive({ assigneeUserId: '', note: '' })
const inspectionForm = reactive<{ result: 'NORMAL' | 'ABNORMAL'; remark: string }>({ result: 'NORMAL', remark: '' })
const planForm = reactive({ id: 0, planNo: '', planName: '', orgId: '', scopeType: 'ORG', scopeId: '', cycleDays: 1, deadlineHour: 18, assigneeUserId: '', checklistJson: '[]', enabled: 1, remark: '' })

const planColumns = [{ key: 'plan_no', label: '计划编号' }, { key: 'plan_name', label: '计划名称' }, { key: 'scope_type', label: '范围' }, { key: 'device_name', label: '设备' }, { key: 'cycle_days', label: '周期(天)' }, { key: 'deadline_hour', label: '时限(时)' }, { key: 'enabled', label: '启用' }]
const lanes = [
  { key: 'PENDING', title: '待派单', hint: '需要明确责任人', icon: Send },
  { key: 'ASSIGNED', title: '待接单', hint: '等待处理人确认', icon: Clock3 },
  { key: 'ACCEPTED', title: '处理中', hint: '接单、到场与处理', icon: Wrench },
  { key: 'VERIFYING', title: '待验收', hint: '等待复核关闭', icon: CheckCircle2 },
  { key: 'CLOSED', title: '已归档', hint: '已关闭或已取消', icon: CircleDashed },
]
const filteredDevices = computed(() => devices.value.filter(item => !planForm.orgId || String(item.org_id) === planForm.orgId))
const boardRows = computed(() => {
  const groups: Record<string, RecordRow[]> = Object.fromEntries(lanes.map((lane) => [lane.key, []]))
  rows.value.forEach((row) => {
    const current = String(row.status || '')
    const lane = current === 'PROCESSING' ? 'ACCEPTED' : ['CLOSED', 'CANCELLED'].includes(current) ? 'CLOSED' : current
    ;(groups[lane] ||= []).push(row)
  })
  return groups
})
const actionTitle = computed(() => ({ assign: '派发工单', complete: '提交处理结果', verify: '验收并关闭', cancel: '取消工单' }[activeAction.value] || '工单操作'))
const actionDescription = computed(() => ({ assign: '指定处理人后，工单将进入待接单状态。', complete: '填写处理方案，提交后进入待验收状态。', verify: '填写验收说明，确认后工单关闭。', cancel: '取消操作会保留全过程留痕。' }[activeAction.value] || ''))
const selectedDeviceName = computed(() => devices.value.find((item) => String(item.id) === deviceId.value)?.device_name || devices.value.find((item) => String(item.id) === deviceId.value)?.device_sn || '')

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (isWorkOrder.value) rows.value = (await workOrders({ pageNum: 1, pageSize: 200, keyword: keyword.value || undefined, status: status.value || undefined, deviceId: deviceId.value || undefined })).records
    else {
      const [planPage, taskPage] = await Promise.all([inspectionPlans({ pageNum: 1, pageSize: 200 }), inspectionTasks({ pageNum: 1, pageSize: 200, taskDate: taskDate.value || undefined, status: status.value || undefined, deviceId: deviceId.value || undefined })])
      plans.value = planPage.records
      tasks.value = taskPage.records
    }
  } catch (e) { error.value = e instanceof Error ? e.message : '运维数据读取失败' }
  finally { loading.value = false }
}

async function loadLookups() {
  try {
    const [orgPage, devicePage] = await Promise.all([listResource('archive', 'orgs', { pageSize: 500 }), listResource('archive', 'devices', { pageSize: 500 })])
    orgs.value = orgPage.records
    devices.value = devicePage.records
  } catch { /* 表单下拉数据读取失败不影响看板 */ }
}

function openWorkOrder() { Object.assign(workForm, { orgId: '', deviceId: '', title: '', description: '', priority: 'P2', slaDueTime: '' }); dialog.value = true }
async function saveWorkOrder() {
  try {
    await createWorkOrder({ orgId: Number(workForm.orgId), deviceId: workForm.deviceId ? Number(workForm.deviceId) : undefined, title: workForm.title, description: workForm.description, priority: workForm.priority, slaDueTime: workForm.slaDueTime || undefined })
    dialog.value = false
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '创建工单失败' }
}

function nextAction(row: RecordRow) {
  const current = String(row.status)
  if (current === 'PENDING') return { label: '派单', action: 'assign' }
  if (current === 'ASSIGNED') return { label: '确认接单', action: 'accept' }
  if (current === 'ACCEPTED') return { label: '登记到场', action: 'arrive' }
  if (current === 'PROCESSING') return { label: '提交处理', action: 'complete' }
  if (current === 'VERIFYING') return { label: '验收关闭', action: 'verify' }
  return null
}

async function runDirect(row: RecordRow, action: string) {
  try { await workOrderAction(row.id, action, {}); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '工单流转失败' }
}
function openAction(row: RecordRow, action: string) {
  activeOrder.value = row
  activeAction.value = action
  actionForm.assigneeUserId = ''
  actionForm.note = ''
  actionDialog.value = true
}
async function submitAction() {
  if (!activeOrder.value) return
  try {
    const body: RecordRow = {}
    if (activeAction.value === 'assign') body.assigneeUserId = Number(actionForm.assigneeUserId)
    if (activeAction.value === 'complete') body.solution = actionForm.note
    if (activeAction.value === 'verify') body.verifyRemark = actionForm.note
    if (activeAction.value === 'cancel') body.remark = actionForm.note
    await workOrderAction(activeOrder.value.id, activeAction.value, body)
    actionDialog.value = false
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '工单流转失败' }
}

function openPlan(row?: RecordRow) { Object.assign(planForm, { id: Number(row?.id || 0), planNo: String(row?.plan_no || ''), planName: String(row?.plan_name || ''), orgId: String(row?.org_id || ''), scopeType: String(row?.scope_type || 'ORG'), scopeId: String(row?.scope_id || ''), cycleDays: Number(row?.cycle_days || 1), deadlineHour: Number(row?.deadline_hour || 18), assigneeUserId: String(row?.assignee_user_id || ''), checklistJson: String(row?.checklist_json || '[]'), enabled: Number(row?.enabled ?? 1), remark: String(row?.remark || '') }); planDialog.value = true }
async function savePlan() { try { await saveInspectionPlan({ planNo: planForm.planNo || undefined, planName: planForm.planName, orgId: Number(planForm.orgId), scopeType: planForm.scopeType, scopeId: planForm.scopeType === 'DEVICE' ? Number(planForm.scopeId) : undefined, cycleDays: planForm.cycleDays, deadlineHour: planForm.deadlineHour, assigneeUserId: planForm.assigneeUserId ? Number(planForm.assigneeUserId) : undefined, checklistJson: planForm.checklistJson, enabled: planForm.enabled, remark: planForm.remark }, planForm.id || undefined); planDialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '保存巡检计划失败' } }
async function generate() { try { await generateInspectionTasks(taskDate.value); await load() } catch (e) { error.value = e instanceof Error ? e.message : '生成巡检任务失败' } }
function openInspection(row: RecordRow, result: 'NORMAL' | 'ABNORMAL') { activeInspection.value = row; inspectionForm.result = result; inspectionForm.remark = ''; inspectionDialog.value = true }
async function submitInspection() { if (!activeInspection.value) return; try { await executeInspection(activeInspection.value.id, { result: inspectionForm.result, resultRemark: inspectionForm.remark }); inspectionDialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '提交巡检结果失败' } }
function syncRouteFilters() { const value = route.query.deviceId; deviceId.value = Array.isArray(value) ? String(value[0] || '') : String(value || '') }

watch(() => route.fullPath, () => { syncRouteFilters(); void load() })
onMounted(async () => { syncRouteFilters(); await Promise.all([load(), loadLookups()]) })
</script>

<template>
  <section class="view-page operations-page">
    <header class="view-head"><div><p class="eyebrow">OPERATIONS · SLA · TRACE</p><h1>{{ isWorkOrder ? '运维工单看板' : '巡检计划与任务' }}</h1><p>{{ isWorkOrder ? '按工单实际状态推进，不需要在列表里寻找下一步操作。' : '按计划生成任务；发现异常时自动转入运维工单。' }}</p></div><button v-if="isWorkOrder && session.can('ops:workorder:create')" class="btn-primary" @click="openWorkOrder">新建工单</button><button v-else-if="!isWorkOrder && session.can('ops:inspection:edit')" class="btn-primary" @click="openPlan()">新建巡检计划</button></header>
    <p v-if="error" class="form-tip">{{ error }}</p>
    <FilterBar v-model:keyword="keyword" :busy="loading" :placeholder="isWorkOrder ? '工单编号、标题或设备' : '巡检计划或设备'" @query="load" @reset="()=>{keyword='';status='';deviceId='';load()}"><label class="field inline"><span>状态</span><select v-model="status"><option value="">全部</option><option v-for="item in isWorkOrder ? ['PENDING','ASSIGNED','ACCEPTED','PROCESSING','VERIFYING','CLOSED','CANCELLED'] : ['PENDING','PROCESSING','COMPLETED','ABNORMAL']" :key="item">{{ item }}</option></select></label><label v-if="!isWorkOrder" class="field inline"><span>任务日期</span><input v-model="taskDate" type="date"></label><span v-if="deviceId" class="context-filter">当前设备：{{ selectedDeviceName || `#${deviceId}` }}</span><button v-if="!isWorkOrder && session.can('ops:inspection:edit')" class="quiet" type="button" @click="generate">生成当日任务</button></FilterBar>

    <template v-if="isWorkOrder"><section class="operation-summary"><span><b>{{ rows.length }}</b> 张工单</span><span><b>{{ boardRows.PENDING?.length || 0 }}</b> 待派单</span><span><b>{{ (boardRows.ACCEPTED?.length || 0) + (boardRows.ASSIGNED?.length || 0) }}</b> 执行中</span><span><b>{{ boardRows.VERIFYING?.length || 0 }}</b> 待验收</span></section><section v-if="loading" class="empty-state">正在读取工单看板…</section><section v-else class="work-order-board"><article v-for="lane in lanes" :key="lane.key" class="work-order-lane" :class="lane.key.toLowerCase()"><header><component :is="lane.icon" :size="17" /><div><b>{{ lane.title }}</b><small>{{ lane.hint }}</small></div><em>{{ boardRows[lane.key]?.length || 0 }}</em></header><div class="work-order-cards"><article v-for="row in boardRows[lane.key] || []" :key="String(row.id)" class="work-order-card"><div class="work-order-card-head"><span class="priority" :class="String(row.priority || 'P2').toLowerCase()">{{ row.priority || 'P2' }}</span><small>{{ row.work_order_no }}</small></div><h3>{{ row.title }}</h3><p><MapPin :size="13" /> {{ row.device_name || row.org_name || '未关联设备' }}</p><dl><div><dt>处理人</dt><dd>{{ row.assignee_name || '待分配' }}</dd></div><div><dt>SLA</dt><dd>{{ row.sla_due_time || '未设置' }}</dd></div></dl><div v-if="session.can('ops:workorder:operate')" class="work-order-actions"><button v-if="nextAction(row)?.action === 'accept' || nextAction(row)?.action === 'arrive'" class="primary" @click="runDirect(row, String(nextAction(row)?.action))">{{ nextAction(row)?.label }}</button><button v-else-if="nextAction(row)" class="primary" @click="openAction(row, String(nextAction(row)?.action))">{{ nextAction(row)?.label }}</button><button v-if="['PENDING','ASSIGNED'].includes(String(row.status))" class="quiet danger-text" @click="openAction(row, 'cancel')">取消</button></div></article><p v-if="!(boardRows[lane.key]?.length)" class="lane-empty">暂无工单</p></div></article></section></template>

    <template v-else><AppDataTable title="巡检计划" :columns="planColumns" :rows="plans" :loading="loading" :error="error" @refresh="load"><template #actions="{ row }"><button v-if="session.can('ops:inspection:edit')" class="link-btn" @click="openPlan(row)">编辑</button></template></AppDataTable><section class="inspection-task-section"><div class="inspection-task-head"><div><p class="eyebrow">TODAY'S CHECKLIST</p><h2>今日巡检任务</h2></div><span>{{ tasks.length }} 项</span></div><div v-if="loading" class="empty-state">正在读取巡检任务…</div><div v-else class="inspection-task-grid"><article v-for="task in tasks" :key="String(task.id)" class="inspection-task-card" :class="String(task.status || '').toLowerCase()"><div><span class="inspection-status">{{ task.status || 'PENDING' }}</span><small>{{ task.task_no }}</small></div><h3>{{ task.device_name || task.device_sn || '巡检设备' }}</h3><p>{{ task.plan_name || '巡检计划' }}</p><dl><div><dt>执行人</dt><dd>{{ task.assignee_name || '待领取' }}</dd></div><div><dt>完成时限</dt><dd>{{ task.due_time || '当日完成' }}</dd></div></dl><div v-if="task.status==='PENDING' && session.can('ops:inspection:operate')" class="inspection-task-actions"><button class="primary" @click="openInspection(task,'NORMAL')">确认正常</button><button class="quiet danger-text" @click="openInspection(task,'ABNORMAL')">发现异常</button></div><p v-else-if="task.status==='ABNORMAL'" class="inspection-result">已转异常工单 #{{ task.work_order_id || '—' }}</p><p v-else class="inspection-result">已完成巡检</p></article><p v-if="!tasks.length" class="empty-state">当前日期没有待执行巡检任务。</p></div></section></template>

    <AppDialog v-model:open="dialog" title="新建人工运维工单" :saving="loading" @submit="saveWorkOrder"><div class="dialog-fields"><label class="dialog-field"><span>所属组织*</span><select v-model="workForm.orgId"><option value="">请选择</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label class="dialog-field"><span>关联设备</span><select v-model="workForm.deviceId"><option value="">无</option><option v-for="device in devices" :key="String(device.id)" :value="String(device.id)">{{ device.device_name || device.device_sn }}</option></select></label><label class="dialog-field"><span>优先级</span><select v-model="workForm.priority"><option>P1</option><option>P2</option><option>P3</option></select></label><label class="dialog-field"><span>SLA时限</span><input v-model="workForm.slaDueTime" type="datetime-local"></label><label class="dialog-field full"><span>工单标题*</span><input v-model="workForm.title" required></label><label class="dialog-field full"><span>问题说明</span><textarea v-model="workForm.description"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="actionDialog" :title="actionTitle" :description="actionDescription" @submit="submitAction"><div class="dialog-fields"><label v-if="activeAction==='assign'" class="dialog-field full"><span>处理人用户 ID*</span><input v-model="actionForm.assigneeUserId" type="number" min="1" required placeholder="输入已授权处理人的用户 ID"></label><label v-if="['complete','verify','cancel'].includes(activeAction)" class="dialog-field full"><span>{{ activeAction==='complete' ? '处理方案*' : activeAction==='verify' ? '验收说明*' : '取消原因*' }}</span><textarea v-model="actionForm.note" required></textarea></label></div></AppDialog>
    <AppDialog v-model:open="inspectionDialog" :title="inspectionForm.result === 'ABNORMAL' ? '登记巡检异常' : '确认巡检正常'" :description="inspectionForm.result === 'ABNORMAL' ? '提交后将自动创建或关联一张运维工单。' : '填写现场巡检说明后完成任务。'" @submit="submitInspection"><div class="dialog-fields"><label class="dialog-field full"><span>{{ inspectionForm.result === 'ABNORMAL' ? '异常说明*' : '巡检说明' }}</span><textarea v-model="inspectionForm.remark" :required="inspectionForm.result === 'ABNORMAL'" :placeholder="inspectionForm.result === 'ABNORMAL' ? '请描述故障现象、影响范围和现场情况' : '可填写检查结果、读数或现场备注'"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="planDialog" :title="planForm.id ? '编辑巡检计划' : '新建巡检计划'" :saving="loading" @submit="savePlan"><div class="dialog-fields"><label class="dialog-field"><span>计划编号</span><input v-model="planForm.planNo" placeholder="留空自动生成"></label><label class="dialog-field"><span>计划名称*</span><input v-model="planForm.planName" required></label><label class="dialog-field"><span>组织*</span><select v-model="planForm.orgId"><option value="">请选择</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label class="dialog-field"><span>范围</span><select v-model="planForm.scopeType"><option value="ORG">组织内全部设备</option><option value="DEVICE">指定设备</option></select></label><label v-if="planForm.scopeType==='DEVICE'" class="dialog-field"><span>设备*</span><select v-model="planForm.scopeId"><option value="">请选择</option><option v-for="device in filteredDevices" :key="String(device.id)" :value="String(device.id)">{{ device.device_name || device.device_sn }}</option></select></label><label class="dialog-field"><span>周期（天）</span><input v-model.number="planForm.cycleDays" type="number" min="1" max="365"></label><label class="dialog-field"><span>完成时点</span><input v-model.number="planForm.deadlineHour" type="number" min="0" max="23"></label><label class="dialog-field"><span>执行人用户ID</span><input v-model="planForm.assigneeUserId" type="number"></label><label class="dialog-field"><span>启用</span><select v-model.number="planForm.enabled"><option :value="1">启用</option><option :value="0">停用</option></select></label><label class="dialog-field full"><span>检查项 JSON</span><textarea v-model="planForm.checklistJson"></textarea></label><label class="dialog-field full"><span>备注</span><textarea v-model="planForm.remark"></textarea></label></div></AppDialog>
  </section>
</template>

<style scoped>.form-tip{color:#b54708}.danger-text{color:#b42318}.operation-summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 15px}.operation-summary span,.context-filter{padding:9px 12px;border-radius:8px;background:#eef5ff;color:#56708e;font-size:12px}.operation-summary b{margin-right:4px;color:#174a91;font:700 18px/1 ui-monospace,Consolas,monospace}</style>
