<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { contracts, createMeterChangeOrder, listResource, meterChangeAction, meterChangeOrder, meterChangeOrders, settlementMeterAction, settlementMeters } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { meterChangeStatusLabel, meterChangeTypeLabel } from '@/utils/enumLabels'

const session = useSessionStore()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const rows = ref<RecordRow[]>([])
const settlementRows = ref<RecordRow[]>([])
const orgs = ref<RecordRow[]>([])
const devices = ref<RecordRow[]>([])
const contractOptions = ref<RecordRow[]>([])
const keyword = ref('')
const status = ref('')
const changeType = ref('')
const loading = ref(false)
const settlementLoading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const detailDialog = ref(false)
const changeOrdersOpen = ref(false)
const selected = ref<RecordRow | null>(null)
const error = useAlertRef()
const form = reactive({ changeNo: '', orgId: '', contractId: '', changeType: 'MANUAL_READING', sourceDeviceId: '', targetDeviceId: '', pointCode: 'total_energy', effectiveTime: '', newFactor: '', oldReading: '', newReading: '', reason: '', evidenceUrls: '' })
const columns = [
  { key: 'change_no', label: '变更单号' }, { key: 'change_type', label: '类型', format: meterChangeTypeLabel }, { key: 'status', label: '状态', format: meterChangeStatusLabel },
  { key: 'org_name', label: '所属园区' }, { key: 'source_device_name', label: '原表计' }, { key: 'effective_time', label: '生效时间' },
]
const settlementColumns = [
  { key: 'device_sn', label: '设备 SN' }, { key: 'device_name', label: '设备名称' }, { key: 'org_name', label: '所属园区' },
  { key: 'metric_point_code', label: '结算累计测点' }, { key: 'settlement_enabled', label: '结算状态', format: (value: unknown) => Number(value) === 1 ? '已启用' : '待准入' },
  { key: 'latest_stat_date', label: '最近日统计' },
]
const isReplace = computed(() => form.changeType === 'REPLACE')
const isFactorChange = computed(() => form.changeType === 'FACTOR_CHANGE')
const requiresReading = computed(() => ['REPLACE', 'RESET', 'MANUAL_READING'].includes(form.changeType))
const scopedDevices = computed(() => devices.value.filter((item) => !form.orgId || String(item.org_id) === form.orgId))
const settlementDevices = computed(() => scopedDevices.value.filter((item) => Number(item.settlement_enabled || 0) === 1))
const selectedLogs = computed<RecordRow[]>(() => Array.isArray(selected.value?.logs) ? selected.value.logs as RecordRow[] : [])

function resetForm() {
  Object.assign(form, { changeNo: '', orgId: '', contractId: '', changeType: 'MANUAL_READING', sourceDeviceId: '', targetDeviceId: '', pointCode: 'total_energy', effectiveTime: new Date().toISOString().slice(0, 16), newFactor: '', oldReading: '', newReading: '', reason: '', evidenceUrls: '' })
}
async function load() {
  loading.value = true; error.value = ''
  try { rows.value = (await meterChangeOrders({ pageNum: 1, pageSize: 200, keyword: keyword.value || undefined, status: status.value || undefined, changeType: changeType.value || undefined })).records }
  catch (e) { error.value = e instanceof Error ? e.message : '读取计量变更单失败'; rows.value = [] }
  finally { loading.value = false }
}
async function loadSettlementMeters() {
  settlementLoading.value = true
  try { settlementRows.value = await settlementMeters() }
  catch (e) { error.value = e instanceof Error ? e.message : '结算表计准入状态读取失败'; settlementRows.value = [] }
  finally { settlementLoading.value = false }
}
function meterIssues(row: RecordRow, key: 'blockers' | 'warnings') {
  const value = row[key]
  return Array.isArray(value) ? value.join('；') : ''
}
async function toggleSettlementMeter(row: RecordRow) {
  const enable = Number(row.settlement_enabled || 0) !== 1
  if (enable && !Boolean(row.ready)) { error.value = `暂不能启用：${meterIssues(row, 'blockers')}`; return }
  if (!window.confirm(enable ? `确认启用 ${row.device_sn} 为结算表计？` : `确认停用 ${row.device_sn} 的结算资格？`)) return
  try { await settlementMeterAction(row.id, enable ? 'enable' : 'disable', enable ? { meterRole: 'MAIN' } : {}); await Promise.all([loadSettlementMeters(), loadLookups()]) }
  catch (e) { error.value = e instanceof Error ? e.message : '结算表计状态更新失败' }
}
async function loadLookups() {
  try {
    const [orgPage, devicePage, contractPage] = await Promise.all([listResource('archive', 'orgs', { pageSize: 500 }), listResource('archive', 'devices', { pageSize: 500 }), contracts({ pageSize: 500 })])
    orgs.value = orgPage.records; devices.value = devicePage.records; contractOptions.value = contractPage.records
  } catch { error.value = '计量变更基础档案读取失败' }
}
function openCreate() { resetForm(); dialog.value = true }
async function save() {
  saving.value = true
  try {
    await createMeterChangeOrder({ changeNo: form.changeNo || undefined, orgId: Number(form.orgId), contractId: form.contractId ? Number(form.contractId) : undefined, changeType: form.changeType, sourceDeviceId: Number(form.sourceDeviceId), targetDeviceId: isReplace.value ? Number(form.targetDeviceId) : undefined, pointCode: form.pointCode || 'total_energy', effectiveTime: form.effectiveTime, newFactor: isFactorChange.value || isReplace.value ? form.newFactor || undefined : undefined, oldReading: form.oldReading || undefined, newReading: requiresReading.value ? form.newReading : undefined, reason: form.reason, evidenceUrls: form.evidenceUrls || undefined })
    dialog.value = false; await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '创建计量变更单失败' }
  finally { saving.value = false }
}
async function showDetail(row: RecordRow) {
  try { selected.value = await meterChangeOrder(row.id); detailDialog.value = true }
  catch (e) { error.value = e instanceof Error ? e.message : '读取变更单详情失败' }
}
async function action(row: RecordRow, actionName: 'approve' | 'reject' | 'cancel' | 'execute') {
  const needRemark = actionName === 'reject' || actionName === 'cancel'
  const remark = window.prompt(needRemark ? '请填写操作原因' : '可填写操作备注')
  if (needRemark && !remark) return
  try { await meterChangeAction(row.id, actionName, { remark: remark || undefined }); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '计量变更单操作失败' }
}
onMounted(async () => { await Promise.all([load(), loadLookups(), loadSettlementMeters()]) })
</script>

<template>
  <section class="view-page">
    <header v-if="!props.embedded" class="view-head"><div><p class="eyebrow">METERING · HANDOVER · AUDIT</p><h1>计量变更与人工抄表</h1></div><button v-if="session.can('billing:metering:create')" class="btn-primary" @click="openCreate">新建变更单</button></header>
    <div v-else class="embedded-action-row"><button class="quiet" @click="changeOrdersOpen = true">计量变更单</button><button v-if="session.can('billing:metering:create')" class="btn-primary" @click="openCreate">新建变更单</button></div>
    <p v-if="error" class="form-tip">{{ error }}</p>
    <AppDataTable title="结算表计准入" :columns="settlementColumns" :rows="settlementRows" :loading="settlementLoading" :error="error" :compact="props.embedded" @refresh="loadSettlementMeters">
      <template #actions="{ row }">
        <button v-if="session.can('billing:metering:execute')" class="link-btn" :title="Number(row.settlement_enabled || 0)!==1 && !row.ready ? `点击查看不可启用原因：${meterIssues(row, 'blockers') || '准入条件未满足'}` : ''" @click="toggleSettlementMeter(row)">{{ Number(row.settlement_enabled || 0)===1 ? '停用' : '启用' }}</button>
        <span v-if="meterIssues(row, 'blockers')" class="form-tip">{{ meterIssues(row, 'blockers') }}</span>
        <span v-else-if="meterIssues(row, 'warnings')" class="muted">{{ meterIssues(row, 'warnings') }}</span>
      </template>
    </AppDataTable>
    <template v-if="!props.embedded"><FilterBar v-model:keyword="keyword" :busy="loading" placeholder="变更单号、原因或表计" @query="load" @reset="()=>{keyword='';status='';changeType='';load()}"><label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>EXECUTED</option><option>CANCELLED</option></AppSelect></label><label class="field inline"><span>类型</span><AppSelect v-model="changeType"><option value="">全部</option><option>MANUAL_READING</option><option>REPLACE</option><option>RESET</option><option>FACTOR_CHANGE</option></AppSelect></label></FilterBar><AppDataTable title="计量变更单" :columns="columns" :rows="rows" :loading="loading" :error="error" @detail="showDetail" @refresh="load"><template #actions="{ row }"><button class="link-btn" @click="showDetail(row)">详情</button><button v-if="row.status==='PENDING' && session.can('billing:metering:approve')" class="link-btn" @click="action(row,'approve')">审批</button><button v-if="row.status==='PENDING' && session.can('billing:metering:approve')" class="link-btn danger-text" @click="action(row,'reject')">驳回</button><button v-if="row.status==='APPROVED' && session.can('billing:metering:execute')" class="link-btn" @click="action(row,'execute')">执行</button><button v-if="['PENDING','APPROVED'].includes(String(row.status)) && session.can('billing:metering:create')" class="link-btn danger-text" @click="action(row,'cancel')">撤销</button></template></AppDataTable></template>
    <AppDialog v-else v-model:open="changeOrdersOpen" title="计量变更单" eyebrow="METER CHANGE ORDERS" hide-actions dialog-class="subject-records-dialog"><div class="meter-change-dialog-body"><FilterBar v-model:keyword="keyword" :busy="loading" placeholder="变更单号、原因或表计" @query="load" @reset="()=>{keyword='';status='';changeType='';load()}"><label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>EXECUTED</option><option>CANCELLED</option></AppSelect></label><label class="field inline"><span>类型</span><AppSelect v-model="changeType"><option value="">全部</option><option>MANUAL_READING</option><option>REPLACE</option><option>RESET</option><option>FACTOR_CHANGE</option></AppSelect></label></FilterBar><AppDataTable title="计量变更单" :columns="columns" :rows="rows" :loading="loading" :error="error" compact @detail="showDetail" @refresh="load"><template #actions="{ row }"><button class="link-btn" @click="showDetail(row)">详情</button><button v-if="row.status==='PENDING' && session.can('billing:metering:approve')" class="link-btn" @click="action(row,'approve')">审批</button><button v-if="row.status==='APPROVED' && session.can('billing:metering:execute')" class="link-btn" @click="action(row,'execute')">执行</button></template></AppDataTable></div></AppDialog>
    <AppDialog v-model:open="dialog" title="新建计量变更单" :saving="saving" @submit="save"><div class="dialog-fields"><label class="dialog-field"><span>所属园区*</span><AppSelect v-model="form.orgId" required><option value="">请选择</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect></label><label class="dialog-field"><span>变更类型*</span><AppSelect v-model="form.changeType"><option value="MANUAL_READING">人工抄表</option><option value="REPLACE">换表</option><option value="RESET">表计清零</option><option value="FACTOR_CHANGE">倍率变更</option></AppSelect></label><label class="dialog-field"><span>关联合同</span><AppSelect v-model="form.contractId"><option value="">未关联</option><option v-for="contract in contractOptions.filter(x => !form.orgId || String(x.org_id)===form.orgId)" :key="String(contract.id)" :value="String(contract.id)">{{ contract.contract_no }} · {{ contract.contract_name }}</option></AppSelect></label><label class="dialog-field"><span>原结算表计*</span><AppSelect v-model="form.sourceDeviceId" required><option value="">请选择</option><option v-for="device in settlementDevices" :key="String(device.id)" :value="String(device.id)">{{ device.device_sn }} · {{ device.device_name }}</option></AppSelect></label><label v-if="isReplace" class="dialog-field"><span>新结算表计*</span><AppSelect v-model="form.targetDeviceId" required><option value="">请选择</option><option v-for="device in settlementDevices.filter(x => String(x.id)!==form.sourceDeviceId)" :key="String(device.id)" :value="String(device.id)">{{ device.device_sn }} · {{ device.device_name }}</option></AppSelect></label><label class="dialog-field"><span>累计测点</span><input v-model="form.pointCode" placeholder="total_energy"></label><label class="dialog-field"><span>实际生效时间*</span><input v-model="form.effectiveTime" type="datetime-local" required></label><label v-if="isFactorChange || isReplace" class="dialog-field"><span>新倍率{{ isFactorChange ? '*' : '' }}</span><input v-model="form.newFactor" type="number" min="0.000001" step="0.000001" :required="isFactorChange"></label><label v-if="requiresReading" class="dialog-field"><span>变更后/抄录读数*</span><input v-model="form.newReading" type="number" min="0" step="0.000001" required></label><label v-if="isReplace || form.changeType==='RESET'" class="dialog-field"><span>变更前读数</span><input v-model="form.oldReading" type="number" min="0" step="0.000001"></label><label class="dialog-field full"><span>变更原因*</span><textarea v-model="form.reason" required></textarea></label><label class="dialog-field full"><span>现场附件地址</span><textarea v-model="form.evidenceUrls" placeholder="图片或附件 URL，多个地址可使用 JSON 保存"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="detailDialog" title="计量变更单详情" :hide-actions="true"><div v-if="selected" class="form-detail-grid"><p><b>单号：</b>{{ selected.change_no }}</p><p><b>状态：</b>{{ selected.status }}</p><p><b>原因：</b>{{ selected.reason }}</p><p><b>审批意见：</b>{{ selected.approve_remark || '—' }}</p><p><b>执行备注：</b>{{ selected.execute_remark || '—' }}</p><p class="full"><b>流转记录：</b><span v-for="item in selectedLogs" :key="String(item.id)" class="log-line">{{ item.action_time }} · {{ item.action }} · {{ item.operator_name || 'system' }} · {{ item.content || '—' }}</span></p></div></AppDialog>
  </section>
</template>
