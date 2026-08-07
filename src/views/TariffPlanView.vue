<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { rebuildTouStatistics, rootOrgs, saveTariffPlan, tariffPlan, tariffPlanAction, tariffPlans, validateTariffPlan } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

type Period = { periodCode: string; periodName: string; startTime: string; endTime: string; unitPrice: string; dayType: string; seasonCode: string; sort: number }
type Form = { id?: number; orgId: string; planCode: string; planName: string; effectiveStartDate: string; effectiveEndDate: string; priority: number; timezone: string; remark: string; periods: Period[] }

const session = useSessionStore()
const error = useAlertRef()
const rows = ref<RecordRow[]>([])
const orgs = ref<RecordRow[]>([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const keyword = ref('')
const status = ref('')
const rebuildDate = ref(new Date().toISOString().slice(0, 10))
const rebuildDeviceId = ref('')
const rebuilding = ref(false)
const form = reactive<Form>(emptyForm())
const columns = [
  { key: 'plan_code', label: '方案编码' }, { key: 'plan_name', label: '方案名称' }, { key: 'org_name', label: '绑定园区' },
  { key: 'version', label: '版本' }, { key: 'effective_start_date', label: '生效开始' }, { key: 'effective_end_date', label: '生效结束' },
  { key: 'period_count', label: '时段数' }, { key: 'status', label: '状态' },
]

function defaultPeriods(): Period[] {
  return [
    { periodCode: 'VALLEY', periodName: '谷', startTime: '00:00', endTime: '07:00', unitPrice: '0.32', dayType: 'ALL', seasonCode: 'ALL', sort: 1 },
    { periodCode: 'FLAT', periodName: '平', startTime: '07:00', endTime: '10:00', unitPrice: '0.68', dayType: 'ALL', seasonCode: 'ALL', sort: 2 },
    { periodCode: 'PEAK', periodName: '峰', startTime: '10:00', endTime: '15:00', unitPrice: '1.08', dayType: 'ALL', seasonCode: 'ALL', sort: 3 },
    { periodCode: 'FLAT', periodName: '平', startTime: '15:00', endTime: '18:00', unitPrice: '0.68', dayType: 'ALL', seasonCode: 'ALL', sort: 4 },
    { periodCode: 'PEAK', periodName: '峰', startTime: '18:00', endTime: '22:00', unitPrice: '1.08', dayType: 'ALL', seasonCode: 'ALL', sort: 5 },
    { periodCode: 'VALLEY', periodName: '谷', startTime: '22:00', endTime: '00:00', unitPrice: '0.32', dayType: 'ALL', seasonCode: 'ALL', sort: 6 },
  ]
}

function emptyForm(): Form {
  return { orgId: '', planCode: '', planName: '', effectiveStartDate: new Date().toISOString().slice(0, 10), effectiveEndDate: '', priority: 100, timezone: 'Asia/Shanghai', remark: '', periods: defaultPeriods() }
}
function resetForm() { Object.assign(form, emptyForm()); delete form.id }
function asText(value: unknown) { return value == null ? '' : String(value) }
function time(value: unknown) { return asText(value).slice(0, 5) }
function toPeriod(value: RecordRow, index: number): Period {
  return { periodCode: asText(value.period_code ?? value.periodCode), periodName: asText(value.period_name ?? value.periodName), startTime: time(value.start_time ?? value.startTime), endTime: time(value.end_time ?? value.endTime), unitPrice: asText(value.unit_price ?? value.unitPrice), dayType: asText(value.day_type ?? value.dayType ?? 'ALL'), seasonCode: asText(value.season_code ?? value.seasonCode ?? 'ALL'), sort: Number(value.sort ?? index + 1) }
}
function payload(): RecordRow {
  return { orgId: Number(form.orgId), planCode: form.planCode.trim(), planName: form.planName.trim(), effectiveStartDate: form.effectiveStartDate, effectiveEndDate: form.effectiveEndDate || null, priority: Number(form.priority), timezone: form.timezone, remark: form.remark, periods: form.periods.map((item, index) => ({ ...item, sort: index + 1 })) }
}
async function load() {
  loading.value = true; error.value = ''
  try { rows.value = (await tariffPlans({ pageNum: 1, pageSize: 200, keyword: keyword.value || undefined, status: status.value || undefined })).records }
  catch (e) { error.value = e instanceof Error ? e.message : '读取分时电价方案失败'; rows.value = [] }
  finally { loading.value = false }
}
async function openCreate() { resetForm(); dialog.value = true }
async function openEdit(row: RecordRow) {
  try {
    const data = await tariffPlan(row.id)
    Object.assign(form, { id: Number(data.id), orgId: asText(data.org_id), planCode: asText(data.plan_code), planName: asText(data.plan_name), effectiveStartDate: asText(data.effective_start_date).slice(0, 10), effectiveEndDate: asText(data.effective_end_date).slice(0, 10), priority: Number(data.priority ?? 100), timezone: asText(data.timezone ?? 'Asia/Shanghai'), remark: asText(data.remark), periods: Array.isArray(data.periods) ? (data.periods as RecordRow[]).map(toPeriod) : defaultPeriods() })
    dialog.value = true
  } catch (e) { error.value = e instanceof Error ? e.message : '读取方案详情失败' }
}
function addPeriod() { form.periods.push({ periodCode: 'FLAT', periodName: '平', startTime: '00:00', endTime: '00:00', unitPrice: '0.00', dayType: 'ALL', seasonCode: 'ALL', sort: form.periods.length + 1 }) }
function removePeriod(index: number) { if (form.periods.length > 1) form.periods.splice(index, 1) }
async function validate() {
  try { await validateTariffPlan(payload()); error.value = '校验通过：时段覆盖完整且不存在重叠。' }
  catch (e) { error.value = e instanceof Error ? e.message : '校验失败' }
}
async function save() {
  saving.value = true; error.value = ''
  try { await validateTariffPlan(payload()); await saveTariffPlan(payload(), form.id); dialog.value = false; await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '保存失败' }
  finally { saving.value = false }
}
async function action(row: RecordRow, operation: 'enable' | 'disable' | 'copy-version') {
  try { await tariffPlanAction(row.id, operation); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '操作失败' }
}
async function rebuild() {
  rebuilding.value = true; error.value = ''
  try {
    const result = await rebuildTouStatistics({ statDate: rebuildDate.value, deviceId: rebuildDeviceId.value || undefined })
    error.value = `分时统计重建完成：${String(result.count ?? 0)} 个测点有可用区间。`
  } catch (e) { error.value = e instanceof Error ? e.message : '分时统计重建失败' }
  finally { rebuilding.value = false }
}
onMounted(async () => { try { orgs.value = await rootOrgs() } catch { orgs.value = [] } await load() })
</script>

<template>
  <section class="view-page">
    <header class="view-head"><div><p class="eyebrow">PARK TOU TARIFF</p><h1>园区分时电价</h1><p>方案绑定在园区组织上，向下级组织和设备生效；生效后通过版本复制变更。</p></div><button v-if="session.can('billing:tariff:add')" class="btn-primary" @click="openCreate">新建电价方案</button></header>
    <p v-if="error" class="form-tip">{{ error }}</p>
    <article v-if="session.can('billing:statistics:rebuild')" class="form-card rebuild-card"><div><h3>分时统计补算</h3><p>设备首次启用、历史数据导入或方案切换后，先按账期日期重建分时用量，再进行账单试算。</p></div><label class="field"><span>统计日期</span><input v-model="rebuildDate" type="date"></label><label class="field"><span>设备 ID（可选）</span><input v-model="rebuildDeviceId" placeholder="留空则重建所有结算表计"></label><button class="quiet" :disabled="rebuilding" @click="rebuild">{{ rebuilding ? '正在重建…' : '重建分时统计' }}</button></article>
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="方案编码或名称" @query="load" @reset="() => { keyword = ''; status = ''; load() }"><label class="field inline"><span>状态</span><select v-model="status"><option value="">全部</option><option value="DRAFT">草稿</option><option value="ACTIVE">已启用</option><option value="DISABLED">已停用</option></select></label></FilterBar>
    <AppDataTable title="电价方案列表" :columns="columns" :rows="rows" :loading="loading" :error="error" @refresh="load"><template #cell-status="{ value }"><StatusTag domain="online" :value="value" /></template><template #actions="{ row }"><button class="link-btn" @click="openEdit(row)">查看/编辑</button><button v-if="row.status !== 'ACTIVE' && session.can('billing:tariff:enable')" class="link-btn" @click="action(row, 'enable')">启用</button><button v-if="row.status === 'ACTIVE' && session.can('billing:tariff:enable')" class="link-btn" @click="action(row, 'disable')">停用</button><button v-if="session.can('billing:tariff:copy')" class="link-btn" @click="action(row, 'copy-version')">复制版本</button></template></AppDataTable>
     <AppDialog v-model:open="dialog" :title="form.id ? '编辑电价方案' : '新建电价方案'" description="每一个日类型/季节组合必须完整覆盖 00:00–24:00。生效方案不能直接编辑。" :saving="saving" @submit="save"><div class="dialog-fields tariff-form"><div class="form-grid"><label class="dialog-field"><span>园区组织</span><select v-model="form.orgId"><option value="">请选择园区</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label class="dialog-field"><span>方案编码</span><input v-model="form.planCode" :disabled="Boolean(form.id)" placeholder="PARK-2026-TOU"></label><label class="dialog-field"><span>方案名称</span><input v-model="form.planName"></label><label class="dialog-field"><span>优先级</span><input v-model.number="form.priority" type="number"></label><label class="dialog-field"><span>生效开始</span><input v-model="form.effectiveStartDate" type="date"></label><label class="dialog-field"><span>生效结束</span><input v-model="form.effectiveEndDate" type="date"></label><label class="dialog-field full"><span>说明</span><textarea v-model="form.remark"></textarea></label></div><div class="period-head"><h3>分时段与电价</h3><button class="quiet" type="button" @click="addPeriod">增加时段</button></div><div class="periods"><div v-for="(period, index) in form.periods" :key="index" class="period-row"><input v-model="period.periodCode" placeholder="编码"><input v-model="period.periodName" placeholder="名称"><input v-model="period.startTime" type="time"><span>至</span><input v-model="period.endTime" type="time"><input v-model="period.unitPrice" type="number" step="0.0001" placeholder="元/kWh"><button class="link-btn" type="button" @click="removePeriod(index)">删除</button></div></div><button class="quiet" type="button" @click="validate">先校验时段</button></div></AppDialog>
  </section>
</template>

<style scoped>
.form-tip { margin: 0 0 12px; color: #b54708; }
.tariff-form { min-width: min(900px, 78vw); }
.rebuild-card { display: flex; align-items: end; gap: 16px; margin-bottom: 16px; }
.rebuild-card > div { flex: 1; }
.period-head { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; }
.periods { display: grid; gap: 8px; margin: 10px 0 14px; }
.period-row { display: grid; grid-template-columns: 1.1fr .8fr 1fr auto 1fr 1fr auto; gap: 7px; align-items: center; }
.period-row input { min-width: 0; }
@media (max-width: 760px) { .tariff-form { min-width: 0; } .period-row { grid-template-columns: 1fr 1fr; } }
</style>
