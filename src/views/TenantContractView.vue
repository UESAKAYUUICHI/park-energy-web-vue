<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppSelect from '@/components/app/AppSelect.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { contract, contractAction, contracts, listResource, saveContract } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { contractStatusLabel } from '@/utils/enumLabels'

const route = useRoute()
const session = useSessionStore()
const error = useAlertRef()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const rows = ref<RecordRow[]>([])
const tenants = ref<RecordRow[]>([])
const spaces = ref<RecordRow[]>([])
const meters = ref<RecordRow[]>([])
const orgs = ref<RecordRow[]>([])
const keyword = ref('')
const status = ref('')
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const form = reactive({
  id: 0,
  contractNo: '',
  contractName: '',
  tenantId: '',
  orgId: '',
  startDate: '',
  endDate: '',
  settlementDay: 1,
  depositAmount: '0',
  remark: '',
  spaceIds: [] as string[],
  meterIds: [] as string[],
})
const meterFactors = reactive<Record<string, number>>({})
const columns = [
  { key: 'contract_no', label: '合同编号' },
  { key: 'contract_name', label: '合同名称' },
  { key: 'tenant_name', label: '租户' },
  { key: 'org_name', label: '园区' },
  { key: 'start_date', label: '开始' },
  { key: 'end_date', label: '结束' },
  { key: 'status', label: '状态', format: contractStatusLabel },
]
const filteredSpaces = computed(() => spaces.value.filter((item) => !form.orgId || String(item.org_id) === form.orgId))
const filteredMeters = computed(() => meters.value.filter((item) => !form.orgId || String(item.org_id) === form.orgId))
const queryOrg = computed(() => String(route.query.orgId || ''))
const selectedOrg = computed(() => orgs.value.find((item) => String(item.id) === form.orgId))
const selectedTenant = computed(() => tenants.value.find((item) => String(item.id) === form.tenantId))
const selectedSpaces = computed(() => spaces.value.filter((item) => form.spaceIds.includes(String(item.id))))
const selectedMeters = computed(() => meters.value.filter((item) => form.meterIds.includes(String(item.id))))
const contractReadyItems = computed(() => [
  { label: '合同主体', ok: Boolean(form.contractNo && form.contractName && form.tenantId && form.orgId) },
  { label: '空间占用', ok: form.spaceIds.length > 0 },
  { label: '结算表计', ok: form.meterIds.length > 0 },
  { label: '合同周期', ok: Boolean(form.startDate && form.endDate) },
  { label: '结算条款', ok: Number(form.settlementDay) >= 1 && Number(form.settlementDay) <= 28 },
])
const readyCount = computed(() => contractReadyItems.value.filter((item) => item.ok).length)
const readyPercent = computed(() => Math.round((readyCount.value / contractReadyItems.value.length) * 100))

function clearMeterFactors() { Object.keys(meterFactors).forEach((key) => delete meterFactors[key]) }
function defaultMeterFactor(deviceId: string) { return Number(meters.value.find((item) => String(item.id) === deviceId)?.meter_factor || 1) }
function ensureMeterFactor(deviceId: string) {
  if (form.meterIds.includes(deviceId) && meterFactors[deviceId] == null) meterFactors[deviceId] = defaultMeterFactor(deviceId)
}
function reset() {
  clearMeterFactors()
  const today = new Date().toISOString().slice(0, 10)
  Object.assign(form, {
    id: 0,
    contractNo: `CT-${Date.now()}`,
    contractName: '',
    tenantId: '',
    orgId: queryOrg.value,
    startDate: today,
    endDate: '',
    settlementDay: 1,
    depositAmount: '0',
    remark: '',
    spaceIds: [],
    meterIds: [],
  })
}
function payload(): RecordRow {
  return {
    contractNo: form.contractNo,
    contractName: form.contractName,
    tenantId: Number(form.tenantId),
    orgId: Number(form.orgId),
    startDate: form.startDate,
    endDate: form.endDate,
    settlementDay: form.settlementDay,
    depositAmount: form.depositAmount,
    remark: form.remark,
    spaces: form.spaceIds.map((spaceId) => ({ spaceId: Number(spaceId), startDate: form.startDate })),
    meters: form.meterIds.map((deviceId) => ({ deviceId: Number(deviceId), startDate: form.startDate, meterFactor: Number(meterFactors[deviceId] ?? defaultMeterFactor(deviceId)) })),
  }
}
async function load() {
  loading.value = true
  try {
    rows.value = (await contracts({ pageNum: 1, pageSize: 200, keyword: keyword.value || undefined, status: status.value || undefined, orgId: queryOrg.value || undefined })).records
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取合同失败'
  } finally {
    loading.value = false
  }
}
async function openCreate() { reset(); dialog.value = true }
async function openDetail(row: RecordRow) {
  try {
    const data = await contract(row.id)
    clearMeterFactors()
    const contractMeters = Array.isArray(data.meters) ? data.meters as RecordRow[] : []
    contractMeters.forEach((item) => { meterFactors[String(item.device_id)] = Number(item.meter_factor || 1) })
    Object.assign(form, {
      id: Number(data.id),
      contractNo: String(data.contract_no),
      contractName: String(data.contract_name),
      tenantId: String(data.tenant_id),
      orgId: String(data.org_id),
      startDate: String(data.start_date).slice(0, 10),
      endDate: String(data.end_date).slice(0, 10),
      settlementDay: Number(data.settlement_day),
      depositAmount: String(data.deposit_amount || 0),
      remark: String(data.remark || ''),
      spaceIds: Array.isArray(data.spaces) ? (data.spaces as RecordRow[]).map((x) => String(x.space_id)) : [],
      meterIds: contractMeters.map((x) => String(x.device_id)),
    })
    dialog.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取合同详情失败'
  }
}
async function save() {
  saving.value = true
  try {
    await saveContract(payload(), form.id || undefined)
    dialog.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存合同失败'
  } finally {
    saving.value = false
  }
}
async function action(row: RecordRow, type: 'activate' | 'terminate') {
  try {
    await contractAction(row.id, type, type === 'terminate' ? { endDate: new Date().toISOString().slice(0, 10), remark: '平台终止' } : {})
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '合同操作失败'
  }
}
onMounted(async () => {
  try {
    const [tenantPage, spacePage, devicePage, orgPage] = await Promise.all([
      listResource('billing', 'tenants', { pageSize: 500 }),
      listResource('archive', 'spaces', { pageSize: 500 }),
      listResource('archive', 'devices', { pageSize: 500 }),
      listResource('archive', 'orgs', { pageSize: 500 }),
    ])
    tenants.value = tenantPage.records
    spaces.value = spacePage.records
    meters.value = devicePage.records.filter((x) => Number(x.settlement_enabled || 0) === 1)
    orgs.value = orgPage.records
  } catch (e) {
    error.value = e instanceof Error ? e.message : '合同基础档案读取失败'
  }
  await load()
})
</script>

<template>
  <section class="view-page">
    <header v-if="!props.embedded" class="view-head">
      <div><p class="eyebrow">TENANT · CONTRACT · METER</p><h1>租户合同</h1></div>
      <button v-if="session.can('billing:contract:edit')" class="btn-primary" @click="openCreate">新建合同</button>
    </header>
    <div v-else class="embedded-action-row"><button v-if="session.can('billing:contract:edit')" class="btn-primary" @click="openCreate">新建合同</button></div>
    <p v-if="error" class="form-tip">{{ error }}</p>
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="合同编号、合同名称或租户" @query="load" @reset="() => { keyword=''; status=''; load() }">
      <label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option>DRAFT</option><option>ACTIVE</option><option>TERMINATED</option></AppSelect></label>
    </FilterBar>
    <AppDataTable title="租户合同列表" :columns="columns" :rows="rows" :loading="loading" :error="error" :compact="props.embedded" @detail="openDetail" @refresh="load">
      <template #actions="{ row }"><button class="link-btn" @click="openDetail(row)">详情</button><button v-if="row.status==='DRAFT'" class="link-btn" @click="action(row,'activate')">生效</button><button v-if="row.status==='ACTIVE'" class="link-btn" @click="action(row,'terminate')">终止</button></template>
    </AppDataTable>
    <AppDialog v-model:open="dialog" :title="form.id ? '合同详情/编辑' : '新建能源计量结算合同'" eyebrow="CONTRACT DOCUMENT" :saving="saving" confirm-text="保存合同草稿" dialog-class="contract-document-dialog" @submit="save">
      <div class="contract-document-layout">
        <article class="contract-paper">
          <header>
            <p>ENERGY SETTLEMENT CONTRACT</p>
            <h2>能源计量结算合同</h2>
            <div class="contract-code"><span>合同编号</span><input v-model="form.contractNo" :disabled="Boolean(form.id)" /></div>
          </header>
          <section class="contract-preamble">
            <p>根据《中华人民共和国民法典》及能源计量、园区收费管理相关制度，甲乙双方本着平等、自愿、诚实信用原则，就乙方在甲方管理区域内使用能源及相应计量结算事宜，经协商一致，订立本合同，以资共同遵守。</p>
          </section>
          <section class="contract-clause">
            <h3>第一条 合同主体</h3>
            <p>1.1 甲方，即园区或管理方，为 <AppSelect v-model="form.orgId"><option value="">请选择甲方园区</option><option v-for="x in orgs" :key="String(x.id)" :value="String(x.id)">{{ x.org_name }}</option></AppSelect> 。甲方负责能源接入、表计维护、数据采集、费用核算及账单发布等管理工作。</p>
            <p>1.2 乙方，即实际用能或承租方，为 <AppSelect v-model="form.tenantId"><option value="">请选择租户</option><option v-for="x in tenants" :key="String(x.id)" :value="String(x.id)">{{ x.tenant_name }}</option></AppSelect> 。乙方应按照本合同约定使用能源并履行付款义务。</p>
            <p>1.3 本合同名称确定为 <input v-model="form.contractName" placeholder="例如：325 宿舍电力结算合同" /> ，作为后续准入、出账、收款和对账的业务依据。</p>
          </section>
          <section class="contract-clause">
            <h3>第二条 结算空间</h3>
            <p>2.1 乙方使用甲方管理范围内的下列空间。该等空间为本合同项下能源费用核算、账单归集及应收确认的基本对象：</p>
            <div class="contract-choice-list">
              <label v-for="x in filteredSpaces" :key="String(x.id)"><input v-model="form.spaceIds" type="checkbox" :value="String(x.id)" /><span>{{ x.space_code }} · {{ x.space_name }}</span></label>
              <p v-if="!filteredSpaces.length">请选择甲方园区后加载空间台账。</p>
            </div>
            <p>2.2 如空间范围发生调整，双方应在系统中完成变更登记；未经登记的空间变更，不作为自动计费及账单调整的直接依据。</p>
          </section>
          <section class="contract-clause inline-clause">
            <h3>第三条 合同期限与结算日</h3>
            <p>3.1 本合同自 <input v-model="form.startDate" type="date" /> 起至 <input v-model="form.endDate" type="date" /> 止。合同期限届满后，如双方继续履行且系统未登记终止状态，本合同项下计量关系仍作为费用核算参考。</p>
            <p>3.2 双方约定每月 <input v-model.number="form.settlementDay" type="number" min="1" max="28" /> 日作为能源费用结算日；遇节假日或系统维护，可顺延至下一业务处理日。</p>
          </section>
          <section class="contract-clause">
            <h3>第四条 结算表计与倍率</h3>
            <p>4.1 本合同以下列结算表计作为计量依据。系统根据表计采集数据、有效倍率、计价规则及账期边界生成乙方应付费用：</p>
            <div class="contract-meter-list">
              <label v-for="x in filteredMeters" :key="String(x.id)">
                <input v-model="form.meterIds" type="checkbox" :value="String(x.id)" @change="ensureMeterFactor(String(x.id))" />
                <span><b>{{ x.device_sn }}</b><small>{{ x.device_name }} · {{ x.install_location || '未填写安装位置' }}</small></span>
                <input v-if="form.meterIds.includes(String(x.id))" v-model.number="meterFactors[String(x.id)]" type="number" min="0.000001" step="0.000001" title="该合同结算倍率" />
              </label>
              <p v-if="!filteredMeters.length">当前园区暂无可绑定结算表计。</p>
            </div>
            <p>4.2 表计故障、缺失、通讯异常或人工修正等情形，应通过计量变更单或账单调整单留痕处理，不得直接覆盖原始账单依据。</p>
          </section>
          <section class="contract-clause inline-clause">
            <h3>第五条 费用支付与补充约定</h3>
            <p>5.1 乙方应缴纳保证金人民币 <input v-model="form.depositAmount" type="number" min="0" step="0.01" /> 元。保证金不当然抵扣当期能源费用，除非双方另有书面或系统审批记录。</p>
            <p>5.2 甲方根据系统生成的账单向乙方收取能源费用；乙方应在账单载明期限内完成支付。逾期、减免、补收、核销等事项，应通过审批流程形成可追溯记录。</p>
            <p>5.3 其他补充约定如下：</p>
            <textarea v-model="form.remark" placeholder="可填写付款方式、逾期规则、特殊计量说明等。"></textarea>
          </section>
          <section class="contract-clause">
            <h3>第六条 生效与留痕</h3>
            <p>6.1 本合同经系统保存并由有权限人员确认生效后，自动参与结算对象准入、计费账户生成、账期出账及收款对账。</p>
            <p>6.2 本合同项下所有关键配置、状态变更及后续调整均以系统记录为准，系统操作日志作为业务追溯和毕业设计演示闭环的重要依据。</p>
          </section>
          <footer class="contract-signatures">
            <div><b>甲方（盖章）：</b><span></span><small>授权代表 / 日期</small></div>
            <div><b>乙方（盖章）：</b><span></span><small>授权代表 / 日期</small></div>
          </footer>
        </article>
        <aside class="contract-sidecard">
          <b>合同完整度</b>
          <strong>{{ readyPercent }}%</strong>
          <div class="contract-progress"><i :style="{ width: `${readyPercent}%` }"></i></div>
          <ul>
            <li v-for="item in contractReadyItems" :key="item.label" :class="{ ok: item.ok }"><i>{{ item.ok ? '✓' : '!' }}</i><span>{{ item.label }}</span></li>
          </ul>
          <section>
            <h3>准入影响</h3>
            <p>合同生效后，将自动创建或绑定计费账户，并把空间、表计关系作为对象准入的核心凭证。</p>
            <dl>
              <div><dt>甲方</dt><dd>{{ selectedOrg?.org_name || '未选择' }}</dd></div>
              <div><dt>乙方</dt><dd>{{ selectedTenant?.tenant_name || '未选择' }}</dd></div>
              <div><dt>空间</dt><dd>{{ selectedSpaces.length }} 个</dd></div>
              <div><dt>表计</dt><dd>{{ selectedMeters.length }} 台</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.contract-document-layout{width:min(1080px,82vw);display:grid;grid-template-columns:minmax(0,1fr) 255px;gap:16px;max-height:72vh;overflow:auto;scrollbar-width:none}.contract-document-layout::-webkit-scrollbar,.contract-paper::-webkit-scrollbar{display:none}.contract-paper{min-width:0;padding:28px;border:1px solid #d7e1ec;border-radius:12px;background:#fff;color:#243b56;box-shadow:0 12px 28px rgb(32 59 91 / 8%)}.contract-paper header{text-align:center;border-bottom:1px solid #e8eef5;padding-bottom:18px;margin-bottom:18px}.contract-paper header p{margin:0 0 5px;color:#2870bd;font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.18em}.contract-paper h2{margin:0 0 12px;font:700 28px/1.2 Georgia,"Noto Serif SC",serif}.contract-code{display:inline-flex;align-items:center;gap:8px;color:#667991;font-size:12px}.contract-code input{width:210px}.contract-clause{margin-top:18px}.contract-clause h3{margin:0 0 10px;font-size:15px}.contract-clause p{margin:8px 0;color:#415a76;font-size:14px;line-height:2.35}.contract-clause input,.contract-clause select,.contract-clause textarea{min-height:34px;border:0;border-bottom:1px solid #9fb9d7;border-radius:0;background:#f8fbff;padding:0 8px;color:#1f3957}.contract-clause select{min-width:210px}.contract-clause textarea{width:100%;min-height:74px;padding:10px;border:1px solid #dbe5f0;border-radius:8px;resize:vertical}.inline-clause input[type='date']{width:148px}.inline-clause input[type='number']{width:92px}.contract-choice-list,.contract-meter-list{display:grid;gap:8px}.contract-choice-list label,.contract-meter-list label{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px 10px;border:1px solid #dde7f2;border-radius:8px;background:#fbfdff;font-size:12px}.contract-choice-list label{grid-template-columns:auto minmax(0,1fr)}.contract-meter-list b,.contract-meter-list small{display:block}.contract-meter-list small{margin-top:3px;color:#71839a}.contract-meter-list input[type='number']{width:96px;border:1px solid #d6e1ed;border-radius:7px}.contract-choice-list>p,.contract-meter-list>p{margin:8px 0;color:#8a98a8;font-size:12px}.contract-sidecard{position:sticky;top:0;align-self:start;padding:16px;border:1px solid #d8e4f1;border-radius:12px;background:linear-gradient(180deg,#f8fbff,#fff)}.contract-sidecard>b{color:#607897;font-size:12px}.contract-sidecard>strong{display:block;margin:8px 0;color:#245d9f;font:700 30px ui-monospace,Consolas,monospace}.contract-progress{height:7px;border-radius:999px;background:#e8f0f9;overflow:hidden}.contract-progress i{display:block;height:100%;background:#2f7bd0}.contract-sidecard ul{display:grid;gap:7px;margin:14px 0;padding:0;list-style:none}.contract-sidecard li{display:flex;align-items:center;gap:7px;color:#8a5b18;font-size:12px}.contract-sidecard li.ok{color:#207a55}.contract-sidecard li i{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#fff3dd;font-style:normal;font-size:10px}.contract-sidecard li.ok i{background:#e8f8f0}.contract-sidecard h3{margin:16px 0 7px;font-size:13px}.contract-sidecard p{margin:0;color:#637891;font-size:12px;line-height:1.6}.contract-sidecard dl{display:grid;gap:7px;margin:12px 0 0}.contract-sidecard dl div{display:flex;justify-content:space-between;gap:8px}.contract-sidecard dt,.contract-sidecard dd{margin:0;font-size:12px}.contract-sidecard dt{color:#8a99aa}.contract-sidecard dd{color:#314b69;text-align:right}@media(max-width:920px){.contract-document-layout{grid-template-columns:1fr;width:min(94vw,760px)}.contract-sidecard{position:relative}.contract-clause p{line-height:2}.contract-clause select{width:100%}}
</style>
