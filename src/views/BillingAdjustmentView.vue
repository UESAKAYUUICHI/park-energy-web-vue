<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { bills, billingAdjustmentAction, billingAdjustments, createBillingAdjustment } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { adjustmentStatusLabel, adjustmentTypeLabel } from '@/utils/enumLabels'

const session = useSessionStore()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const rows = ref<RecordRow[]>([])
const billOptions = ref<RecordRow[]>([])
const keyword = ref('')
const status = ref('')
const loading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const error = useAlertRef()
const form = reactive({ billId: '', adjustmentType: 'DISCOUNT', adjustmentAmount: '', reason: '', remark: '' })
const selectedBill = computed(() => billOptions.value.find((item) => String(item.id) === form.billId))
const adjustmentLabel = computed(() => ({ DISCOUNT: '应收减免', SURCHARGE: '应收补收', WRITE_OFF: '坏账核销' } as Record<string, string>)[form.adjustmentType] || '账单调整')
const adjustmentImpact = computed(() => form.adjustmentType === 'SURCHARGE' ? '增加应收余额' : '减少应收余额')
const columns = [
  { key: 'adjustment_no', label: '调整单号' }, { key: 'bill_no', label: '账单编号' }, { key: 'account_name', label: '计费账户' },
  { key: 'adjustment_type', label: '类型', format: adjustmentTypeLabel }, { key: 'adjustment_amount', label: '金额', format: (value: unknown) => `¥ ${Number(value || 0).toFixed(2)}` },
  { key: 'status', label: '状态', format: adjustmentStatusLabel },
]
async function load() {
  loading.value = true; error.value = ''
  try {
    const [data, billData] = await Promise.all([
      billingAdjustments({ pageNum: 1, pageSize: 200, keyword: keyword.value, status: status.value || undefined }),
      bills({ pageNum: 1, pageSize: 200 }),
    ])
    rows.value = data.records
    billOptions.value = billData.records.filter((item) => item.bill_status === 'ISSUED' && Number(item.pay_status) !== 3)
  } catch (e) { error.value = e instanceof Error ? e.message : '账单调整单读取失败'; rows.value = [] }
  finally { loading.value = false }
}
function resetForm() { form.billId = ''; form.adjustmentType = 'DISCOUNT'; form.adjustmentAmount = ''; form.reason = ''; form.remark = '' }
function openCreate() { resetForm(); dialog.value = true }
async function save() {
  saving.value = true
  try { await createBillingAdjustment({ ...form, operator: session.user?.username || 'admin' }); dialog.value = false; await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '创建调整单失败' }
  finally { saving.value = false }
}
async function action(row: RecordRow, actionName: 'approve' | 'cancel') {
  try { await billingAdjustmentAction(row.id, actionName, { operator: session.user?.username || 'admin' }); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '调整单操作失败' }
}
onMounted(load)
</script>

<template>
  <section class="view-page billing-table-page billing-adjustment-page">
    <header v-if="!props.embedded" class="view-head"><div><p class="eyebrow">BILL ADJUSTMENT · APPROVAL</p><h1>账单调整单</h1></div><button v-if="session.can('billing:adjustment:create')" class="btn-primary" @click="openCreate">新建调整单</button></header>
    <div v-else class="embedded-action-row"><button v-if="session.can('billing:adjustment:create')" class="btn-primary" @click="openCreate">新建调整单</button></div>
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="调整单号、账单号或租户" @query="load" @reset="()=>{keyword='';status='';load()}"><label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option>PENDING</option><option>APPROVED</option><option>CANCELLED</option></AppSelect></label></FilterBar>
    <AppDataTable title="调整单列表" :columns="columns" :rows="rows" :loading="loading" :error="error" :compact="props.embedded" @refresh="load"><template #actions="{ row }"><button v-if="row.status==='PENDING' && session.can('billing:adjustment:approve')" class="link-btn" @click="action(row,'approve')">审批并生效</button><button v-if="row.status==='PENDING' && session.can('billing:adjustment:create')" class="link-btn danger-text" @click="action(row,'cancel')">撤销</button></template></AppDataTable>
    <AppDialog v-model:open="dialog" title="新建账单调整申请" eyebrow="ADJUSTMENT APPLICATION" :saving="saving" confirm-text="提交调整申请" dialog-class="finance-document-dialog" @submit="save">
      <div class="finance-document adjustment-document">
        <article class="finance-paper">
          <header><p>BILL ADJUSTMENT FORM</p><h2>账单调整申请单</h2></header>
          <section class="finance-clause">
            <h3>一、调整对象</h3>
            <p>申请对账单 <AppSelect v-model="form.billId" required><option value="">请选择已发布账单</option><option v-for="item in billOptions" :key="String(item.id)" :value="String(item.id)">{{ item.bill_no }} · {{ item.account_name }} · 剩余 ¥{{ item.outstanding_amount }}</option></AppSelect> 发起应收调整。</p>
            <div class="finance-object-card">
              <span><small>计费账户</small><b>{{ selectedBill?.account_name || '未选择' }}</b></span>
              <span><small>账单编号</small><b>{{ selectedBill?.bill_no || '—' }}</b></span>
              <span><small>剩余应收</small><b>¥{{ Number(selectedBill?.outstanding_amount || 0).toFixed(2) }}</b></span>
            </div>
          </section>
          <section class="finance-clause inline">
            <h3>二、调整事项</h3>
            <p>调整类型为 <AppSelect v-model="form.adjustmentType"><option value="DISCOUNT">应收减免</option><option value="SURCHARGE">应收补收</option><option value="WRITE_OFF">坏账核销</option></AppSelect> ，调整金额人民币 <input v-model="form.adjustmentAmount" type="number" min="0.01" step="0.01" required /> 元。</p>
          </section>
          <section class="finance-clause">
            <h3>三、调整依据</h3>
            <textarea v-model="form.reason" required placeholder="请填写调整原因，例如：线下确认减免、历史抄表修正、违约补收、坏账核销依据等。"></textarea>
          </section>
          <section class="finance-clause">
            <h3>四、备注</h3>
            <textarea v-model="form.remark" placeholder="可补充审批说明、附件编号或财务确认意见。"></textarea>
          </section>
        </article>
        <aside class="finance-sidecard">
          <b>调整影响</b>
          <strong>{{ adjustmentLabel }}</strong>
          <p>{{ adjustmentImpact }}；审批通过后系统自动写入应收流水，原账单与收款记录保留。</p>
          <dl>
            <div><dt>目标账单</dt><dd>{{ selectedBill?.bill_no || '未选择' }}</dd></div>
            <div><dt>调整金额</dt><dd>¥{{ Number(form.adjustmentAmount || 0).toFixed(2) }}</dd></div>
            <div><dt>审批状态</dt><dd>提交后待审批</dd></div>
          </dl>
        </aside>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.finance-document{width:min(980px,80vw);display:grid;grid-template-columns:minmax(0,1fr) 238px;gap:16px;max-height:72vh;overflow:auto;scrollbar-width:none}.finance-document::-webkit-scrollbar,.finance-paper::-webkit-scrollbar{display:none}.finance-paper{padding:26px;border:1px solid #d7e2ee;border-radius:12px;background:#fff}.finance-paper header{text-align:center;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #e8eef5}.finance-paper header p{margin:0 0 5px;color:#2d73bd;font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.16em}.finance-paper h2{margin:0;font:700 25px Georgia,"Noto Serif SC",serif}.finance-clause{margin-top:17px}.finance-clause h3{margin:0 0 9px;font-size:14px}.finance-clause p{margin:0;color:#405a75;font-size:14px;line-height:2.3}.finance-clause select,.finance-clause input,.finance-clause textarea{min-height:34px;border:0;border-bottom:1px solid #9fb9d7;border-radius:0;background:#f8fbff;padding:0 8px}.finance-clause select{min-width:250px}.finance-clause.inline input{width:130px}.finance-clause textarea{width:100%;min-height:84px;padding:10px;border:1px solid #dbe5f0;border-radius:8px;resize:vertical}.finance-object-card{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.finance-object-card span{padding:10px;border:1px solid #dde7f2;border-radius:8px;background:#fbfdff}.finance-object-card small,.finance-object-card b{display:block}.finance-object-card small{color:#7d8da0;font-size:11px}.finance-object-card b{margin-top:5px;color:#274461;font-size:12px}.finance-sidecard{position:sticky;top:0;align-self:start;padding:15px;border:1px solid #d8e4f1;border-radius:12px;background:linear-gradient(180deg,#f8fbff,#fff)}.finance-sidecard>b{color:#607897;font-size:12px}.finance-sidecard>strong{display:block;margin:8px 0;color:#245d9f;font-size:18px}.finance-sidecard p{margin:0;color:#637891;font-size:12px;line-height:1.65}.finance-sidecard dl{display:grid;gap:8px;margin:14px 0 0}.finance-sidecard dl div{display:flex;justify-content:space-between;gap:8px}.finance-sidecard dt,.finance-sidecard dd{margin:0;font-size:12px}.finance-sidecard dt{color:#8a99aa}.finance-sidecard dd{text-align:right;color:#314b69}@media(max-width:880px){.finance-document{grid-template-columns:1fr;width:min(94vw,720px)}.finance-sidecard{position:relative}.finance-object-card{grid-template-columns:1fr}}
</style>
