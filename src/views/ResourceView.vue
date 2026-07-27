<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { Pencil, RefreshCw, Settings, Trash2 } from '@lucide/vue'
import { resourceSchemas } from '@/config/resourceSchemas'
import { createResource, deviceTypePoints, listResource, parsePoints, removeResource, saveDeviceTypePoints, updateResource } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'
import { fieldLabel } from '@/utils/fieldLabels'

const route = useRoute(); const session = useSessionStore(); const schema = computed(() => resourceSchemas[String(route.meta.resource || '').replace('billing:', '')]!)
const rows = ref<RecordRow[]>([]); const selected = ref<RecordRow | null>(null); const keyword = ref(''); const orgId = ref(''); const gatewayId = ref(''); const deviceTypeId = ref(''); const accountId = ref(''); const pageNum = ref(1); const total = ref(0); const loading = ref(false); const error = ref(''); const dialog = ref(false); const saving = ref(false); const editingId = ref<unknown>(null); const form = reactive<Record<string, string | number>>({}); const parseDialog = ref(false); const parseForm = reactive<Record<string, string>>({ deviceTypeId: '', samplePayload: '{}' }); const batchDialog = ref(false); const batchTypeId = ref<unknown>(null); const batchText = ref('{\n  "definitions": [],\n  "mappings": []\n}'); const orgOptions = ref<RecordRow[]>([]); const gatewayOptions = ref<RecordRow[]>([]); const typeOptions = ref<RecordRow[]>([]); const deviceOptions = ref<RecordRow[]>([]); const accountOptions = ref<RecordRow[]>([]); const ruleOptions = ref<RecordRow[]>([]); const deleteDialog = ref(false); const deletingRow = ref<RecordRow | null>(null); const deleting = ref(false)
const pageSize = 20; const canAdd = computed(() => session.can(schema.value.area === 'archive' ? 'archive:add' : 'billing:add')); const canEdit = computed(() => session.can(schema.value.area === 'archive' ? 'archive:edit' : 'billing:edit')); const canDelete = computed(() => session.can(schema.value.area === 'archive' ? 'archive:delete' : 'billing:delete'))
const createLabel = computed(() => `+ 新增${schema.value.title.replace(/管理$/, '')}`)
function orgTypeLabel(value: unknown): string {
  switch (Number(value)) {
    case 1: return '园区'
    case 2: return '楼栋'
    case 3: return '配电房'
    case 4: return '计量点'
    default: return String(value ?? '—')
  }
}
const orgName = (value: unknown): string => {
  const org = orgOptions.value.find((item) => String(item.id) === String(value))
  return org ? String(org.org_name || value) : String(value ?? '—')
}
const gatewayName = (value: unknown): string => {
  const gateway = gatewayOptions.value.find((item) => String(item.id) === String(value))
  return gateway ? String(gateway.gateway_name || gateway.gateway_sn || value) : String(value ?? '—')
}
const deviceTypeName = (value: unknown): string => {
  const type = typeOptions.value.find((item) => String(item.id) === String(value))
  return type ? String(type.type_name || type.type_code || value) : String(value ?? '—')
}
const deviceName = (value: unknown): string => {
  const device = deviceOptions.value.find((item) => String(item.id) === String(value))
  return device ? String(device.device_name || device.device_sn || value) : String(value ?? '—')
}
const accountName = (value: unknown): string => {
  const account = accountOptions.value.find((item) => String(item.id) === String(value))
  return account ? String(account.account_name || value) : String(value ?? '—')
}
function scopeTypeLabel(value: unknown): string {
  switch (String(value)) {
    case 'ORG': return '组织'
    case 'DEVICE': return '设备'
    case 'DEVICE_GROUP': return '设备组'
    default: return String(value ?? '—')
  }
}
function billingCycleLabel(value: unknown): string {
  switch (String(value)) {
    case 'MONTHLY': return '月度'
    case 'DAILY': return '日度'
    default: return String(value ?? '—')
  }
}
function priceModeLabel(value: unknown): string {
  switch (String(value)) {
    case 'UNIT_PRICE': return '单价计费'
    case 'FIXED': return '固定金额'
    case 'TIERED': return '阶梯计价'
    case 'TIME_PERIOD': return '分时计价'
    default: return String(value ?? '—')
  }
}
const scopeObjectName = (value: unknown, row: RecordRow): string => {
  if (String(row.scope_type) === 'ORG') return orgName(value)
  if (String(row.scope_type) === 'DEVICE') return deviceName(value)
  return String(value ?? '—')
}
const orgTypeOptions = [
  { label: '园区', value: 1 },
  { label: '企业', value: 2 },
  { label: '楼宇', value: 3 },
  { label: '楼层', value: 4 },
  { label: '区域', value: 5 },
]
function fieldOptions(key: string) {
  if (key === 'parent_id') return [{ label: '无', value: 0 }, ...orgOptions.value.map((item) => ({ label: String(item.org_name || item.id), value: item.id }))]
  if (key === 'org_type') return orgTypeOptions
  if (key === 'org_id') return [{ label: '无', value: '' }, ...orgOptions.value.map((item) => ({ label: String(item.org_name || item.id), value: item.id }))]
  if (key === 'gateway_id') return [{ label: '无', value: '' }, ...gatewayOptions.value.map((item) => ({ label: String(item.gateway_name || item.gateway_sn || item.id), value: item.id }))]
  if (key === 'device_type_id') return [{ label: '无', value: '' }, ...typeOptions.value.map((item) => ({ label: String(item.type_name || item.type_code || item.id), value: item.id }))]
  if (key === 'account_id') return [{ label: '无', value: '' }, ...accountOptions.value.map((item) => ({ label: String(item.account_name || item.id), value: item.id }))]
  if (key === 'rule_id') return [{ label: '无', value: '' }, ...ruleOptions.value.map((item) => ({ label: String(item.rule_name || item.ruleCode || item.id), value: item.id }))]
  if (key === 'scope_id') {
    const scopeType = String(form.scope_type || '')
    if (scopeType === 'DEVICE') return [{ label: '无', value: '' }, ...deviceOptions.value.map((item) => ({ label: String(item.device_name || item.device_sn || item.id), value: item.id }))]
    return [{ label: '无', value: '' }, ...orgOptions.value.map((item) => ({ label: String(item.org_name || item.id), value: item.id }))]
  }
  return []
}
const resourceFormat = (key: string): TableColumn['format'] | undefined => {
  if (key === 'org_type') return orgTypeLabel
  if (key === 'org_id') return orgName
  if (key === 'gateway_id') return gatewayName
  if (key === 'device_type_id') return deviceTypeName
  if (key === 'device_id') return deviceName
  if (key === 'account_id') return accountName
  if (key === 'scope_type') return scopeTypeLabel
  if (key === 'scope_id') return scopeObjectName
  if (key === 'billing_cycle') return billingCycleLabel
  if (key === 'price_mode') return priceModeLabel
  return undefined
}
const resourceLabel = (key: string, fallback?: string) => {
  if (key === 'org_type') return '组织类型'
  if (key === 'org_id') return '所属组织'
  if (key === 'gateway_id') return '接入网关'
  if (key === 'device_type_id') return '设备类型'
  if (key === 'device_id') return '设备'
  if (key === 'account_id') return '计费账户'
  if (key === 'scope_id') return '范围对象'
  if (key === 'billing_cycle') return '计费周期'
  if (key === 'price_mode') return '计价方式'
  return fieldLabel(key, fallback)
}
const fullColumns = computed<TableColumn[]>(() => {
  const labels = new Map<string, string>()
  schema.value.columns.forEach((column) => labels.set(column.key, column.label))
  schema.value.fields.forEach((field) => labels.set(field.key, field.label))
  const keys = new Set<string>(['id', ...schema.value.fields.map((field) => field.key), ...schema.value.columns.map((column) => column.key)])
  rows.value.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))
  return [...keys].map((key) => ({ key, label: resourceLabel(key, labels.get(key)), format: resourceFormat(key) }))
})
function copy(target: Record<string, string | number>, source: RecordRow) { Object.keys(target).forEach((key) => delete target[key]); Object.assign(target, Object.fromEntries(Object.entries(source).map(([key, value]) => [key, typeof value === 'number' ? value : String(value ?? '')]))) }
const showOrgFilter = computed(() => ['gateways', 'devices', 'accounts'].includes(schema.value.resource)); const showGatewayFilter = computed(() => schema.value.resource === 'devices'); const showTypeFilter = computed(() => ['devices', 'point-definitions', 'point-mappings'].includes(schema.value.resource)); const showAccountFilter = computed(() => ['rules'].includes(schema.value.resource))
async function load() { loading.value = true; error.value = ''; try { const page = await listResource(schema.value.area, schema.value.resource, { pageNum: pageNum.value, pageSize, keyword: keyword.value, orgId: orgId.value || undefined, gatewayId: gatewayId.value || undefined, deviceTypeId: deviceTypeId.value || undefined, accountId: accountId.value || undefined }); rows.value = page.records; total.value = page.total } catch (e) { error.value = e instanceof Error ? e.message : '读取失败'; rows.value = []; total.value = 0 } finally { loading.value = false } }
async function loadLookups() { try { const [orgs, gateways, types, devices, accounts, rules] = await Promise.all([listResource('archive', 'orgs', { pageSize: 500 }), listResource('archive', 'gateways', { pageSize: 500 }), listResource('archive', 'device-types', { pageSize: 500 }), listResource('archive', 'devices', { pageSize: 500 }), listResource('billing', 'accounts', { pageSize: 500 }), listResource('billing', 'rules', { pageSize: 500 })]); orgOptions.value = orgs.records; gatewayOptions.value = gateways.records; typeOptions.value = types.records; deviceOptions.value = devices.records; accountOptions.value = accounts.records; ruleOptions.value = rules.records } catch { /* lookups are optional; primary table still reports its own request failure */ } }
function openCreate() { editingId.value = null; copy(form, structuredClone(schema.value.defaults)); dialog.value = true }
function openEdit(row: RecordRow) { editingId.value = row.id; copy(form, Object.fromEntries(schema.value.fields.map((field) => [field.key, row[field.key] ?? '']))); dialog.value = true }
async function save() { saving.value = true; try { const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '')) as RecordRow; if (editingId.value) await updateResource(schema.value.area, schema.value.resource, editingId.value, body); else await createResource(schema.value.area, schema.value.resource, body); dialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' } finally { saving.value = false } }
function openDelete(row: RecordRow) { deletingRow.value = row; deleteDialog.value = true }
async function confirmDelete() { if (!deletingRow.value) return; deleting.value = true; try { await removeResource(schema.value.area, schema.value.resource, deletingRow.value.id); deleteDialog.value = false; deletingRow.value = null; await load() } catch (e) { error.value = e instanceof Error ? e.message : '删除失败' } finally { deleting.value = false } }
async function runParseTest() { try { selected.value = await parsePoints({ deviceTypeId: Number(parseForm.deviceTypeId), samplePayload: JSON.parse(String(parseForm.samplePayload)) }); parseDialog.value = false } catch (e) { error.value = e instanceof Error ? e.message : '解析测试失败' } }
async function openBatch(row: RecordRow) { try { batchTypeId.value = row.id; batchText.value = JSON.stringify(await deviceTypePoints(row.id), null, 2); batchDialog.value = true } catch (e) { error.value = e instanceof Error ? e.message : '测点配置读取失败' } }
async function saveBatch() { if (!batchTypeId.value) return; try { await saveDeviceTypePoints(batchTypeId.value, JSON.parse(batchText.value) as RecordRow); batchDialog.value = false } catch (e) { error.value = e instanceof Error ? e.message : '批量测点保存失败' } }
function reset() { keyword.value = ''; orgId.value = ''; gatewayId.value = ''; deviceTypeId.value = ''; accountId.value = ''; pageNum.value = 1; load() }
watch(() => route.fullPath, () => { reset(); loadLookups() }); onMounted(() => { load(); loadLookups() })
</script>
<template>
  <section v-if="schema" class="view-page resource-page"><header class="view-head"><div><p class="eyebrow">{{ schema.area.toUpperCase() }} CONFIGURATION</p><h1>{{ schema.title }}</h1><p>{{ schema.description }}</p></div></header>
    <FilterBar v-model:keyword="keyword" :busy="loading" :show-reset="false" @query="load" @reset="reset"><label v-if="showOrgFilter" class="field inline"><span>所属组织</span><select v-model="orgId"><option value="">全部组织</option><option v-for="org in orgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label v-if="showGatewayFilter" class="field inline"><span>接入网关</span><select v-model="gatewayId"><option value="">全部网关</option><option v-for="gateway in gatewayOptions" :key="String(gateway.id)" :value="String(gateway.id)">{{ gateway.gateway_name || gateway.gateway_sn }}</option></select></label><label v-if="showTypeFilter" class="field inline"><span>设备类型</span><select v-model="deviceTypeId"><option value="">全部类型</option><option v-for="type in typeOptions" :key="String(type.id)" :value="String(type.id)">{{ type.type_name || type.type_code }}</option></select></label><label v-if="showAccountFilter" class="field inline"><span>计费账户</span><select v-model="accountId"><option value="">全部账户</option><option v-for="account in accountOptions" :key="String(account.id)" :value="String(account.id)">{{ account.account_name }}</option></select></label><template #actions><button v-if="schema.resource === 'point-mappings' && canEdit" class="quiet" @click="parseDialog = true">解析测试</button><button v-if="canAdd" class="primary add-action" @click="openCreate">{{ createLabel }}</button><button class="icon-btn" title="刷新" aria-label="刷新" @click="load"><RefreshCw :size="16" /></button></template></FilterBar>
    <AppDataTable :columns="fullColumns" :rows="rows" :loading="loading" :error="error" @refresh="load"><template #cell-online_status="{ value }"><StatusTag domain="online" :value="value" /></template><template #cell-status="{ value }"><StatusTag domain="online" :value="value" /></template><template #cell-enabled="{ value }"><StatusTag domain="online" :value="value" /></template><template #actions="{ row }"><button v-if="schema.resource === 'device-types' && canEdit" class="icon-btn" title="配置测点" aria-label="配置测点" @click="openBatch(row)"><Settings :size="16" /></button><button v-if="canEdit" class="icon-btn" title="编辑" aria-label="编辑" @click="openEdit(row)"><Pencil :size="16" /></button><button v-if="canDelete" class="icon-btn danger-text" title="删除" aria-label="删除" @click="openDelete(row)"><Trash2 :size="16" /></button></template></AppDataTable>
    <div v-if="total > pageSize" class="pagination"><button class="quiet" :disabled="pageNum <= 1" @click="pageNum--; load()">上一页</button><span>第 {{ pageNum }} 页，共 {{ total }} 条</span><button class="quiet" :disabled="rows.length < pageSize" @click="pageNum++; load()">下一页</button></div>
    <AppDrawer :open="Boolean(selected)" title="解析测试结果" @update:open="(open) => { if (!open) selected = null }"><pre>{{ JSON.stringify(selected, null, 2) }}</pre></AppDrawer>
    <AppDialog v-model:open="dialog" :title="editingId ? `编辑${schema.title}` : `新增${schema.title}`" :saving="saving" @submit="save"><div class="dialog-fields"><label v-for="field in schema.fields" :key="field.key" class="dialog-field" :class="{ full: field.type === 'textarea' }"><span>{{ field.label }}<i v-if="field.required">*</i></span><textarea v-if="field.type === 'textarea'" v-model="form[field.key]"></textarea><select v-else-if="field.type === 'select' || fieldOptions(field.key).length" v-model="form[field.key]"><option v-for="option in (field.type === 'select' ? field.options || [] : fieldOptions(field.key))" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select><input v-else v-model="form[field.key]" :type="field.type || 'text'" :required="field.required"></label></div></AppDialog>
    <AppDialog v-model:open="parseDialog" title="协议映射解析测试" @submit="runParseTest"><div class="dialog-fields"><label class="dialog-field"><span>设备类型</span><select v-model="parseForm.deviceTypeId"><option value="">无</option><option v-for="type in typeOptions" :key="String(type.id)" :value="String(type.id)">{{ type.type_name || type.type_code }}</option></select></label><label class="dialog-field full"><span>JSON 示例报文</span><textarea v-model="parseForm.samplePayload" spellcheck="false"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="batchDialog" title="批量配置设备类型测点" @submit="saveBatch"><div class="dialog-fields"><label class="dialog-field full"><span>批量配置 JSON</span><textarea v-model="batchText" spellcheck="false"></textarea></label></div></AppDialog>
    <AppConfirmDialog v-model:open="deleteDialog" :title="`删除${schema.title}`" message="确认删除后将立即调用后端删除接口，且无法恢复。" :loading="deleting" confirm-text="确认删除" @confirm="confirmDelete" />
  </section>
</template>
