<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { bills, billingAdjustmentAction, billingAdjustments, createBillingAdjustment } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

const session = useSessionStore()
const rows = ref<RecordRow[]>([])
const billOptions = ref<RecordRow[]>([])
const keyword = ref('')
const status = ref('')
const loading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const error = useAlertRef()
const form = reactive({ billId: '', adjustmentType: 'DISCOUNT', adjustmentAmount: '', reason: '', remark: '' })
const columns = [
  { key: 'adjustment_no', label: '调整单号' }, { key: 'bill_no', label: '账单编号' }, { key: 'account_name', label: '计费账户' },
  { key: 'adjustment_type', label: '类型' }, { key: 'adjustment_amount', label: '金额', format: (value: unknown) => `¥ ${Number(value || 0).toFixed(2)}` },
  { key: 'status', label: '状态' }, { key: 'created_by', label: '创建人' }, { key: 'created_time', label: '创建时间' },
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
  <section class="view-page">
    <header class="view-head"><div><p class="eyebrow">BILL ADJUSTMENT · APPROVAL</p><h1>账单调整单</h1><p>减免、补收和坏账核销必须先建单、后审批，原账单与收款流水始终可追溯。</p></div><button v-if="session.can('billing:adjustment:create')" class="btn-primary" @click="openCreate">新建调整单</button></header>
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="调整单号、账单号或租户" @query="load" @reset="()=>{keyword='';status='';load()}"><label class="field inline"><span>状态</span><select v-model="status"><option value="">全部</option><option>PENDING</option><option>APPROVED</option><option>CANCELLED</option></select></label></FilterBar>
    <AppDataTable title="调整单列表" :columns="columns" :rows="rows" :loading="loading" :error="error" @refresh="load"><template #actions="{ row }"><button v-if="row.status==='PENDING' && session.can('billing:adjustment:approve')" class="link-btn" @click="action(row,'approve')">审批并生效</button><button v-if="row.status==='PENDING' && session.can('billing:adjustment:create')" class="link-btn danger-text" @click="action(row,'cancel')">撤销</button></template></AppDataTable>
    <AppDialog v-model:open="dialog" title="新建账单调整单" description="减免和坏账核销将减少应收；补收将增加应收。提交后需具备审批权限的人员确认生效。" :saving="saving" @submit="save"><div class="dialog-fields"><label class="dialog-field"><span>目标账单</span><select v-model="form.billId" required><option value="">请选择已发布账单</option><option v-for="item in billOptions" :key="String(item.id)" :value="String(item.id)">{{ item.bill_no }} · {{ item.account_name }} · 剩余 ¥{{ item.outstanding_amount }}</option></select></label><label class="dialog-field"><span>调整类型</span><select v-model="form.adjustmentType"><option value="DISCOUNT">减免</option><option value="SURCHARGE">补收</option><option value="WRITE_OFF">坏账核销</option></select></label><label class="dialog-field"><span>调整金额</span><input v-model="form.adjustmentAmount" type="number" min="0.01" step="0.01" required></label><label class="dialog-field full"><span>调整原因</span><textarea v-model="form.reason" required></textarea></label><label class="dialog-field full"><span>备注</span><textarea v-model="form.remark"></textarea></label></div></AppDialog>
  </section>
</template>
