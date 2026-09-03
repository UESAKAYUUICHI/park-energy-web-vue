<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { rebuildTouStatistics, rootOrgs, saveTariffPlan, tariffPlan, tariffPlanAction, tariffPlans, validateTariffPlan } from '@/api/platform'
import { showAppAlert, useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { financeStatusLabel } from '@/utils/enumLabels'

type Period = { periodCode: string; periodName: string; startTime: string; endTime: string; unitPrice: string; dayType: string; seasonCode: string; sort: number }
type Form = { id?: number; orgId: string; planCode: string; planName: string; effectiveStartDate: string; effectiveEndDate: string; priority: number; timezone: string; remark: string; periods: Period[] }

const session = useSessionStore()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
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
  { key: 'version', label: '版本' }, { key: 'effective_start_date', label: '生效日期' },
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
    showAppAlert({ type: 'success', title: '分时统计重建完成', message: `${String(result.count ?? 0)} 个测点有可用区间。` })
  } catch (e) { error.value = e instanceof Error ? e.message : '分时统计重建失败' }
  finally { rebuilding.value = false }
}
onMounted(async () => { try { orgs.value = await rootOrgs() } catch { orgs.value = [] } await load() })
</script>

<template>
  <section class="view-page">
    <header v-if="!props.embedded" class="view-head"><div><p class="eyebrow">PARK TOU TARIFF</p><h1>园区分时电价</h1></div><button v-if="session.can('billing:tariff:add')" class="btn-primary" @click="openCreate">新建电价方案</button></header>
    <div v-else class="embedded-action-row"><button v-if="session.can('billing:tariff:add')" class="btn-primary" @click="openCreate">新建电价方案</button></div>
    <p v-if="error" class="form-tip">{{ error }}</p>
    <article v-if="session.can('billing:statistics:rebuild')" class="form-card rebuild-card"><div><h3>分时统计补算</h3></div><label class="field"><span>统计日期</span><input v-model="rebuildDate" type="date"></label><label class="field"><span>设备 ID（可选）</span><input v-model="rebuildDeviceId" placeholder="留空则重建所有结算表计"></label><button class="quiet" :disabled="rebuilding" @click="rebuild">{{ rebuilding ? '正在重建…' : '重建分时统计' }}</button></article>
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="方案编码或名称" @query="load" @reset="() => { keyword = ''; status = ''; load() }"><label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option value="DRAFT">草稿</option><option value="ACTIVE">已启用</option><option value="DISABLED">已停用</option></AppSelect></label></FilterBar>
    <AppDataTable title="电价方案列表" :columns="columns" :rows="rows" :loading="loading" :error="error" :compact="props.embedded" @refresh="load"><template #cell-status="{ value }"><StatusTag domain="online" :value="value" /></template><template #actions="{ row }"><button class="link-btn" @click="openEdit(row)">查看/编辑</button><button v-if="row.status !== 'ACTIVE' && session.can('billing:tariff:enable')" class="link-btn" @click="action(row, 'enable')">启用</button><button v-if="row.status === 'ACTIVE' && session.can('billing:tariff:enable')" class="link-btn" @click="action(row, 'disable')">停用</button><button v-if="session.can('billing:tariff:copy')" class="link-btn" @click="action(row, 'copy-version')">复制版本</button></template></AppDataTable>
     <AppDialog v-model:open="dialog" :title="form.id ? '编辑电价方案' : '新建电价方案'" :saving="saving" dialog-class="tariff-config-dialog" @submit="save">
      <div class="tariff-config-form">
        <section class="tariff-config-section">
          <header class="section-title"><h3>基础信息</h3><span>{{ form.id ? '版本编辑' : '新建草稿' }}</span></header>
          <div class="tariff-base-grid">
            <label class="dialog-field"><span>园区组织</span><AppSelect v-model="form.orgId"><option value="">请选择园区</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect></label>
            <label class="dialog-field"><span>方案编码</span><input v-model="form.planCode" :disabled="Boolean(form.id)" placeholder="PARK-2026-TOU"></label>
            <label class="dialog-field wide"><span>方案名称</span><input v-model="form.planName"></label>
            <label class="dialog-field"><span>优先级</span><input v-model.number="form.priority" type="number"></label>
            <label class="dialog-field"><span>生效开始</span><input v-model="form.effectiveStartDate" type="date"></label>
            <label class="dialog-field"><span>生效结束</span><input v-model="form.effectiveEndDate" type="date"></label>
            <label class="dialog-field"><span>时区</span><input v-model="form.timezone"></label>
            <label class="dialog-field full"><span>备注</span><textarea v-model="form.remark"></textarea></label>
          </div>
        </section>

        <section class="tariff-config-section">
          <header class="section-title">
            <h3>分时价格</h3>
            <div>
              <button class="quiet" type="button" @click="validate">校验时段</button>
              <button class="quiet" type="button" @click="addPeriod">增加时段</button>
            </div>
          </header>
          <div class="tariff-period-table">
            <div class="period-table-head">
              <span>序号</span><span>时段编码</span><span>时段名称</span><span>开始时间</span><span>结束时间</span><span>电价</span><span>日类型</span><span>季节</span><span>操作</span>
            </div>
            <div v-for="(period, index) in form.periods" :key="index" class="period-table-row">
              <b data-label="序号">{{ index + 1 }}</b>
              <label class="period-input-cell" data-label="时段编码"><input v-model="period.periodCode" placeholder="PEAK"></label>
              <label class="period-input-cell" data-label="时段名称"><input v-model="period.periodName" placeholder="峰"></label>
              <label class="period-input-cell" data-label="开始时间"><input v-model="period.startTime" type="time"></label>
              <label class="period-input-cell" data-label="结束时间"><input v-model="period.endTime" type="time"></label>
              <label class="price-cell" data-label="电价"><input v-model="period.unitPrice" type="number" step="0.0001" placeholder="0.0000"><em>元/kWh</em></label>
              <div class="period-select-cell" data-label="日类型"><AppSelect v-model="period.dayType"><option value="ALL">全部</option><option value="WORKDAY">工作日</option><option value="WEEKEND">周末</option><option value="HOLIDAY">节假日</option></AppSelect></div>
              <div class="period-select-cell" data-label="季节"><AppSelect v-model="period.seasonCode"><option value="ALL">全年</option><option value="SUMMER">夏季</option><option value="WINTER">冬季</option></AppSelect></div>
              <button class="link-btn danger-text" type="button" :disabled="form.periods.length <= 1" @click="removePeriod(index)">删除</button>
            </div>
          </div>
        </section>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.rebuild-card { display: flex; align-items: end; gap: 16px; margin-bottom: 16px; }
.rebuild-card > div { flex: 1; }
:deep(.tariff-config-dialog){width:min(1160px,calc(100vw - 40px));height:auto;max-height:min(860px,calc(100vh - 32px))}
:deep(.tariff-config-dialog .dialog-content){min-height:0;overflow:hidden}
:deep(.tariff-config-dialog .dialog-actions){padding:13px clamp(14px,2.4vw,24px) 16px}
.tariff-config-form{width:100%;max-height:calc(100vh - 190px);overflow:auto;padding:clamp(12px,2vw,18px) clamp(14px,2.4vw,24px) clamp(16px,2.4vw,24px);scrollbar-width:none;box-sizing:border-box}
.tariff-config-form::-webkit-scrollbar{display:none}
.tariff-config-section{border:1px solid #dce5ef;border-radius:10px;background:#fff;margin-bottom:14px;overflow:hidden}
.section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:0 16px;border-bottom:1px solid #e5edf5;background:#f8fafc}
.section-title h3{margin:0;color:#1f344d;font-size:15px}
.section-title span{color:#7c8da1;font-size:12px}
.section-title>div{display:flex;gap:8px}
.tariff-base-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:14px;padding:16px}
.tariff-base-grid .wide{grid-column:span 2}
.tariff-base-grid .full{grid-column:1/-1}
.tariff-base-grid textarea{min-height:70px;resize:vertical}
.tariff-period-table{padding:0 16px 16px;overflow:auto;scrollbar-width:none;max-width:100%}
.tariff-period-table::-webkit-scrollbar{display:none}
.period-table-head,.period-table-row{display:grid;grid-template-columns:44px minmax(86px,1fr) minmax(70px,.8fr) minmax(96px,.9fr) minmax(96px,.9fr) minmax(132px,1.1fr) minmax(110px,.95fr) minmax(100px,.9fr) 62px;gap:8px;align-items:center;width:100%}
.period-table-head{height:40px;color:#718195;font-size:12px;border-bottom:1px solid #e2eaf3}
.period-table-row{min-height:48px;border-bottom:1px solid #eef3f8}
.period-table-row b{color:#60748b;font:600 12px ui-monospace,Consolas,monospace}
.period-input-cell{min-width:0}
.period-table-row input{width:100%;min-width:0;height:32px;border:1px solid #cbd8e6;border-radius:7px;background:#fff;padding:0 9px;color:#253a54}
.period-table-row :deep(.app-select-trigger){min-height:32px}
.period-select-cell{min-width:0}
.price-cell{display:flex;align-items:center;border:1px solid #cbd8e6;border-radius:7px;background:#fff;overflow:hidden}
.price-cell input{border:0;border-radius:0}
.price-cell em{flex:none;padding:0 8px;color:#7f8fa3;font-style:normal;font-size:12px;border-left:1px solid #e2e8f0}
@media (max-width: 1080px) {
  :deep(.tariff-config-dialog){width:min(980px,calc(100vw - 28px))}
  .period-table-head,.period-table-row{grid-template-columns:38px minmax(74px,1fr) minmax(62px,.75fr) 92px 92px minmax(120px,1fr) 102px 92px 56px;gap:6px}
  .period-table-row input{padding:0 7px}
  .price-cell em{padding:0 6px}
}
@media (max-width: 860px) {
  :deep(.tariff-config-dialog){width:calc(100vw - 22px);max-height:calc(100vh - 22px)}
  .tariff-config-form{max-height:calc(100vh - 166px)}
  .section-title{align-items:stretch;flex-direction:column;padding:11px 14px}
  .section-title>div{justify-content:flex-end}
  .period-table-head{display:none}
  .period-table-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;min-height:0;margin:12px 0;padding:12px;border:1px solid #e0e8f1;border-radius:10px;background:#fbfdff}
  .period-table-row>*{min-width:0}
  .period-table-row>b,
  .period-table-row>.period-input-cell,
  .period-table-row>.price-cell,
  .period-table-row>.period-select-cell{display:grid;grid-template-columns:82px minmax(0,1fr);align-items:center;gap:8px}
  .period-table-row>b::before,
  .period-table-row>.period-input-cell::before,
  .period-table-row>.price-cell::before,
  .period-table-row>.period-select-cell::before{content:attr(data-label);color:#78899d;font:12px "Microsoft YaHei",sans-serif}
  .period-table-row>b{grid-column:1/-1}
  .price-cell{grid-template-columns:82px minmax(0,1fr) auto}
  .price-cell::before{grid-column:1}
  .price-cell input{grid-column:2}
  .price-cell em{grid-column:3}
  .period-select-cell :deep(.app-select){width:100%}
  .period-table-row>.link-btn{grid-column:1/-1;justify-self:end}
}
@media (max-width: 760px) {
  .rebuild-card{align-items:stretch;flex-direction:column}
  .tariff-config-form{padding:12px}
  .tariff-base-grid{grid-template-columns:1fr}
  .tariff-base-grid .wide,.tariff-base-grid .full{grid-column:auto}
}
@media (max-width: 560px) {
  .period-table-row{grid-template-columns:1fr}
}
</style>
