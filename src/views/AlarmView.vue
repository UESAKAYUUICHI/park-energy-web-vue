<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { CheckCircle2, Eye, Pencil, RefreshCw } from '@lucide/vue'
import { alarmEvents, alarmRules, alarmSummary, dealAlarm, listResource, saveAlarmRule } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'
import { fieldLabel } from '@/utils/fieldLabels'

interface AlarmRuleForm extends Record<string, string | number | unknown> {
  rule_name: string
  alarm_type: number
  rule_scope: number
  org_id: string | number
  device_id: string | number
  point_code: string
  compare_operator: string
  threshold_value: string | number
  threshold_min: string | number
  threshold_max: string | number
  duration_seconds: number
  alarm_level: number
  enabled: number
  remark: string
}

const route = useRoute()
const session = useSessionStore()
const mode = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const rows = ref<RecordRow[]>([])
const summary = ref<RecordRow>({})
const keyword = ref('')
const dealStatus = ref(mode.value === 'alarm-workbench' ? '0' : '')
const alarmType = ref('')
const alarmLevel = ref('')
const deviceId = ref('')
const gatewayId = ref('')
const orgId = ref('')
const includeChildren = ref('')
const startTime = ref('')
const endTime = ref('')
const loading = ref(false)
const error = ref('')
const selected = ref<RecordRow | null>(null)
const dialog = ref(false)
const editingId = ref<unknown>(null)
const rule = reactive<AlarmRuleForm>({
  rule_name: '',
  alarm_type: 5,
  rule_scope: 1,
  org_id: '',
  device_id: '',
  point_code: '',
  compare_operator: 'GT',
  threshold_value: '',
  threshold_min: '',
  threshold_max: '',
  duration_seconds: 0,
  alarm_level: 2,
  enabled: 1,
  remark: '',
})
const dealDialog = ref(false)
const dealTarget = ref<RecordRow | null>(null)
const dealRemark = ref('')
const orgOptions = ref<RecordRow[]>([])
const deviceOptions = ref<RecordRow[]>([])
const alarmTypeOptions = [
  { label: '过压', value: 1 },
  { label: '欠压', value: 2 },
  { label: '过流', value: 3 },
  { label: '设备离线', value: 4 },
  { label: '数据异常', value: 5 },
]
const ruleScopeOptions = [
  { label: '全局', value: 1 },
  { label: '组织', value: 2 },
  { label: '设备', value: 3 },
]
const alarmLevelOptions = [
  { label: '一般', value: 1 },
  { label: '重要', value: 2 },
  { label: '紧急', value: 3 },
]
const compareOperatorOptions = [
  { label: '大于', value: 'GT' },
  { label: '大于等于', value: 'GTE' },
  { label: '小于', value: 'LT' },
  { label: '小于等于', value: 'LTE' },
  { label: '等于', value: 'EQ' },
  { label: '区间', value: 'between' },
]

const alarmTypeLabel = (value: unknown): string => alarmTypeOptions.find((item) => item.value === Number(value))?.label || fieldLabel('alarm_type')
const ruleScopeLabel = (value: unknown): string => ruleScopeOptions.find((item) => item.value === Number(value))?.label || fieldLabel('rule_scope')
const alarmLevelLabel = (value: unknown): string => alarmLevelOptions.find((item) => item.value === Number(value))?.label || fieldLabel('alarm_level')
const compareOperatorLabel = (value: unknown): string => compareOperatorOptions.find((item) => item.value === String(value))?.label || String(value || '—')
const deviceName = (value: unknown): string => {
  const device = deviceOptions.value.find((item) => String(item.id) === String(value))
  return device ? String(device.device_name || device.device_sn || value) : String(value ?? '—')
}
const eventColumns: TableColumn[] = [{ key: 'org_name', label: '所属组织' }, { key: 'device_name', label: '告警设备' }, { key: 'point_code', label: '触发测点' }, { key: 'alarm_type', label: '告警类型', format: alarmTypeLabel }, { key: 'alarm_level', label: '等级', format: alarmLevelLabel }, { key: 'alarm_value', label: '触发值' }, { key: 'threshold_value', label: '阈值' }, { key: 'alarm_time', label: '告警时间' }, { key: 'deal_status', label: '处理状态' }]
const ruleColumns: TableColumn[] = [{ key: 'rule_name', label: '规则名称' }, { key: 'alarm_type', label: '告警类型', format: alarmTypeLabel }, { key: 'rule_scope', label: '规则范围', format: ruleScopeLabel }, { key: 'point_code', label: '测点编码' }, { key: 'compare_operator', label: '比较符', format: compareOperatorLabel }, { key: 'threshold_value', label: '阈值' }, { key: 'alarm_level', label: '等级', format: alarmLevelLabel }, { key: 'enabled', label: '启用' }]
const fullRuleColumns = computed<TableColumn[]>(() => {
  const labels = new Map(ruleColumns.map((column) => [column.key, column.label]))
  const formats = new Map<string, TableColumn['format']>()
  ruleColumns.forEach((column) => { if (column.format) formats.set(column.key, column.format) })
  const formKeys = ['id', 'rule_name', 'alarm_type', 'rule_scope', 'org_id', 'device_id', 'point_code', 'compare_operator', 'threshold_value', 'threshold_min', 'threshold_max', 'duration_seconds', 'alarm_level', 'enabled', 'remark']
  const keys = new Set<string>(formKeys)
  rows.value.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))
  return [...keys].map((key) => ({ key, label: key === 'device_id' ? '告警设备' : fieldLabel(key, labels.get(key)), format: key === 'device_id' ? deviceName : formats.get(key) }))
})
const summaryCards = computed(() => [{ label: '待处理告警', value: summary.value.pendingCount || 0, tone: 'warn' }, { label: '已处理告警', value: summary.value.handledCount || 0, tone: 'success' }, { label: '当前列表', value: rows.value.length, tone: 'blue' }])
const detailItems = computed(() => selected.value ? [
  ['所属组织', selected.value.org_name || selected.value.org_id || '—'], ['告警设备', selected.value.device_name || selected.value.device_sn || '—'], ['触发测点', selected.value.point_code || '—'], ['告警类型', alarmTypeLabel(selected.value.alarm_type)], ['告警等级', alarmLevelLabel(selected.value.alarm_level)], ['触发值', selected.value.alarm_value ?? '—'], ['阈值', selected.value.threshold_value ?? '—'], ['告警时间', selected.value.alarm_time || '—'], ['处理状态', Number(selected.value.deal_status) === 1 ? '已处理' : '未处理'], ['处理人', selected.value.deal_user || '—'], ['处理时间', selected.value.deal_time || '—'], ['处置备注', selected.value.deal_remark || '—'],
] : [])
const queryText = (value: unknown) => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
function syncQueryFilters() {
  deviceId.value = queryText(route.query.deviceId)
  gatewayId.value = queryText(route.query.gatewayId)
  orgId.value = queryText(route.query.orgId)
  includeChildren.value = queryText(route.query.includeChildren)
}

function resetRule(data: RecordRow = {}) {
  Object.keys(rule).forEach((key) => delete rule[key])
  Object.assign(rule, { rule_name: '', alarm_type: 5, rule_scope: 1, org_id: '', device_id: '', point_code: '', compare_operator: 'GT', threshold_value: '', threshold_min: '', threshold_max: '', duration_seconds: 0, alarm_level: 2, enabled: 1, remark: '', ...data })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'alarm-rules') {
      const page = await alarmRules({ pageNum: 1, pageSize: 200, keyword: keyword.value })
      rows.value = page.records
      summary.value = {}
      return
    }
    const [page, data] = await Promise.all([
      alarmEvents({ pageNum: 1, pageSize: 200, keyword: keyword.value, deviceId: deviceId.value || undefined, gatewayId: gatewayId.value || undefined, orgId: orgId.value || undefined, includeChildren: includeChildren.value || undefined, dealStatus: dealStatus.value || undefined, startTime: startTime.value || undefined, endTime: endTime.value || undefined }),
      alarmSummary({ orgId: orgId.value || undefined, includeChildren: includeChildren.value || undefined, dealStatus: dealStatus.value || undefined }),
    ])
    rows.value = page.records.filter((row) => (!alarmType.value || String(row.alarm_type) === alarmType.value) && (!alarmLevel.value || String(row.alarm_level) === alarmLevel.value))
    summary.value = data
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警数据读取失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}
async function loadLookups() {
  try {
    const [orgs, devices] = await Promise.all([
      listResource('archive', 'orgs', { pageSize: 500 }),
      listResource('archive', 'devices', { pageSize: 500 }),
    ])
    orgOptions.value = orgs.records
    deviceOptions.value = devices.records
  } catch {
    orgOptions.value = []
    deviceOptions.value = []
  }
}

function openCreate() { editingId.value = null; resetRule(); dialog.value = true }
function openEdit(row: RecordRow) { editingId.value = row.id; resetRule(row); dialog.value = true }
async function saveRule() { try { await saveAlarmRule(rule, editingId.value || undefined); dialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '规则保存失败' } }
function openDeal(row: RecordRow) { dealTarget.value = row; dealRemark.value = ''; dealDialog.value = true }
async function deal() { if (!dealTarget.value) return; try { await dealAlarm(dealTarget.value.id, { dealUser: session.user?.username || 'admin', dealRemark: dealRemark.value }); dealDialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '告警处置失败' } }
function resetEvents() { keyword.value = ''; dealStatus.value = mode.value === 'alarm-workbench' ? '0' : ''; alarmType.value = ''; alarmLevel.value = ''; deviceId.value = ''; gatewayId.value = ''; orgId.value = ''; includeChildren.value = ''; startTime.value = ''; endTime.value = ''; load() }

watch(() => route.fullPath, () => { dealStatus.value = mode.value === 'alarm-workbench' ? '0' : ''; syncQueryFilters(); load(); loadLookups() })
onMounted(() => { syncQueryFilters(); load(); loadLookups() })
</script>

<template>
  <section class="view-page" :class="{ 'alarm-rules-page': mode === 'alarm-rules' }">
    <header class="view-head"><div><p class="eyebrow">ALARM MANAGEMENT</p><h1>{{ title }}</h1><p>{{ mode === 'alarm-rules' ? '告警规则配置。' : mode === 'alarm-workbench' ? '告警处置。' : '告警事件查询。' }}</p></div></header>

    <template v-if="mode !== 'alarm-rules'">
      <div class="metric-grid compact-metrics"><article v-for="card in summaryCards" :key="card.label" class="metric" :class="card.tone"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article></div>
      <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="设备、测点或告警类型" @query="load" @reset="resetEvents"><label class="field inline"><span>处理状态</span><select v-model="dealStatus"><option value="">全部</option><option value="0">未处理</option><option value="1">已处理</option></select></label><label class="field inline"><span>告警类型</span><select v-model="alarmType"><option value="">全部</option><option v-for="item in alarmTypeOptions" :key="item.value" :value="String(item.value)">{{ item.label }}</option></select></label><label class="field inline"><span>告警等级</span><select v-model="alarmLevel"><option value="">全部</option><option value="1">一般</option><option value="2">重要</option><option value="3">紧急</option></select></label><label class="field inline"><span>开始日期</span><input v-model="startTime" type="date"></label><label class="field inline"><span>结束日期</span><input v-model="endTime" type="date"></label></FilterBar>
      <AppDataTable :title="mode === 'alarm-workbench' ? '待处理告警队列' : '告警事件列表'" :columns="eventColumns" :rows="rows" :loading="loading" :error="error" @refresh="load" @detail="(row) => selected = row"><template #cell-deal_status="{ value }"><StatusTag domain="alarm" :value="value" /></template><template #actions="{ row }"><button class="icon-btn" title="详情" aria-label="详情" @click="selected = row"><Eye :size="16" /></button><button v-if="Number(row.deal_status) === 0 && session.can('alarm:event:deal')" class="icon-btn" title="处置" aria-label="处置" @click="openDeal(row)"><CheckCircle2 :size="16" /></button></template></AppDataTable>
    </template>

    <template v-else>
      <FilterBar v-model:keyword="keyword" :busy="loading" :show-reset="false" placeholder="规则名称或测点编码" @query="load" @reset="() => { keyword = ''; load() }"><template #actions><button v-if="session.can('alarm:rule:add')" class="primary add-action" @click="openCreate">+ 新增告警规则</button><button class="icon-btn" title="刷新" aria-label="刷新" @click="load"><RefreshCw :size="16" /></button></template></FilterBar>
      <AppDataTable :pageable="false" :columns="fullRuleColumns" :rows="rows" :loading="loading" :error="error" @refresh="load"><template #cell-enabled="{ value }"><StatusTag domain="online" :value="value" /></template><template #actions="{ row }"><button v-if="session.can('alarm:rule:edit')" class="icon-btn" title="编辑" aria-label="编辑" @click="openEdit(row)"><Pencil :size="16" /></button></template></AppDataTable>
    </template>

    <AppDrawer :open="Boolean(selected)" title="告警详情" @update:open="(open) => { if (!open) selected = null }"><dl class="detail-grid"><template v-for="item in detailItems" :key="item[0]"><dt>{{ item[0] }}</dt><dd>{{ item[1] }}</dd></template></dl></AppDrawer>
    <AppDialog v-model:open="dialog" :title="editingId ? '编辑告警规则' : '新增告警规则'" @submit="saveRule"><div class="dialog-fields"><label class="dialog-field"><span>规则名称*</span><input v-model="rule.rule_name" required></label><label class="dialog-field"><span>告警类型*</span><select v-model="rule.alarm_type"><option v-for="item in alarmTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label class="dialog-field"><span>规则范围*</span><select v-model="rule.rule_scope"><option v-for="item in ruleScopeOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label class="dialog-field"><span>组织</span><select v-model="rule.org_id"><option value="">无</option><option v-for="org in orgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label class="dialog-field"><span>设备</span><select v-model="rule.device_id"><option value="">无</option><option v-for="device in deviceOptions" :key="String(device.id)" :value="String(device.id)">{{ device.device_name || device.device_sn }}</option></select></label><label class="dialog-field"><span>测点编码</span><input v-model="rule.point_code"></label><label class="dialog-field"><span>比较符</span><select v-model="rule.compare_operator"><option v-for="item in compareOperatorOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label class="dialog-field"><span>阈值</span><input v-model="rule.threshold_value" type="number"></label><label class="dialog-field"><span>区间下限</span><input v-model="rule.threshold_min" type="number"></label><label class="dialog-field"><span>区间上限</span><input v-model="rule.threshold_max" type="number"></label><label class="dialog-field"><span>告警等级</span><select v-model="rule.alarm_level"><option v-for="item in alarmLevelOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label class="dialog-field full"><span>备注</span><textarea v-model="rule.remark"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="dealDialog" title="处置告警" confirm-text="确认处置" @submit="deal"><div class="dialog-fields"><label class="dialog-field full"><span>处置备注</span><textarea v-model="dealRemark" required></textarea></label></div></AppDialog>
  </section>
</template>
