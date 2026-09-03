<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircle2 } from '@lucide/vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { bill, billAction, billPreview, billWorkflowAction, bills, generateBill, listResource, payBill, reversePayment } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { billStatusLabel } from '@/utils/enumLabels'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const props = withDefaults(defineProps<{ mode?: 'settlement' | 'bills'; embedded?: boolean }>(), { embedded: false })
const mode = computed(() => props.mode || String(route.meta.kind))
const title = computed(() => mode.value === 'settlement' ? '结算工作台' : '账单中心')
const rows = ref<RecordRow[]>([])
const keyword = ref('')
const accountId = ref('')
const orgId = ref('')
const includeChildren = ref('')
const payStatus = ref('')
const billCycle = ref('')
const accountOptions = ref<RecordRow[]>([])
const existingBills = ref<RecordRow[]>([])
const loading = ref(false)
const error = useAlertRef()
const selected = ref<RecordRow | null>(null)
const preview = ref<RecordRow | null>(null)
const settlementStep = ref(1)
const paymentDialog = ref(false)
const reverseDialog = ref(false)
const calculating = ref(false)
const payment = reactive<{ payAmount: string | number; payWay: string; transactionNo: string; remark: string }>({ payAmount: '', payWay: '转账', transactionNo: '', remark: '' })
const reverseForm = reactive<{ paymentId: string | number; reason: string }>({ paymentId: '', reason: '' })
const settlement = reactive<{ accountId: string; startDate: string; endDate: string; billCycle: string }>({ accountId: '', startDate: '', endDate: '', billCycle: '' })

const queryText = (value: unknown) => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
const cycleRange = (cycle: string) => {
  const matched = /^(\d{4})-(\d{2})$/.exec(cycle)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!year || month < 1 || month > 12) return null
  const endDay = new Date(year, month, 0).getDate()
  return { startDate: `${cycle}-01`, endDate: `${cycle}-${String(endDay).padStart(2, '0')}` }
}
const syncQueryFilters = () => {
  accountId.value = queryText(route.query.accountId)
  orgId.value = queryText(route.query.orgId)
  includeChildren.value = queryText(route.query.includeChildren)
  payStatus.value = queryText(route.query.payStatus)
  billCycle.value = queryText(route.query.billCycle)
  if (mode.value === 'settlement') {
    settlement.accountId = accountId.value
    settlement.billCycle = billCycle.value
    const range = cycleRange(billCycle.value)
    if (range) Object.assign(settlement, range)
  }
}
const previewDetails = computed(() => Array.isArray(preview.value?.details) ? preview.value.details as unknown as RecordRow[] : [])
const previewBlockers = computed(() => Array.isArray(preview.value?.blockers) ? preview.value.blockers as unknown as RecordRow[] : [])
const settlementReady = computed(() => Boolean(settlement.accountId && settlement.billCycle && settlement.startDate && settlement.endDate))
const selectedAccount = computed(() => accountOptions.value.find((item) => String(item.id) === String(settlement.accountId)))
const existingBill = computed(() => existingBills.value.find((item) => String(item.account_id ?? item.accountId) === String(settlement.accountId) && String(item.bill_cycle ?? item.billCycle) === String(settlement.billCycle)))
const settlementAlreadyBilled = computed(() => Boolean(existingBill.value))
const paymentRecords = computed(() => Array.isArray(selected.value?.payments) ? selected.value.payments as unknown as RecordRow[] : [])
const billColumns = [{ key: 'bill_no', label: '账单编号' }, { key: 'account_name', label: '计费账户' }, { key: 'bill_cycle', label: '账期' }, { key: 'total_amount', label: '应收金额', format: (value: unknown) => `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` }, { key: 'outstanding_amount', label: '剩余应收', format: (value: unknown) => `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` }, { key: 'pay_status', label: '状态' }]

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'settlement') {
      const data = await listResource('billing', 'accounts', { pageNum: 1, pageSize: 200, keyword: keyword.value })
      rows.value = data.records
      accountOptions.value = data.records
      const onlyAccount = data.records.length === 1 ? data.records[0] : undefined
      if (!settlement.accountId && onlyAccount) chooseAccount(onlyAccount)
      await refreshExistingBills()
      return
    }
    const [data, accounts] = await Promise.all([
      bills({ pageNum: 1, pageSize: 200, keyword: keyword.value, accountId: accountId.value || undefined, orgId: orgId.value || undefined, includeChildren: includeChildren.value || undefined, payStatus: payStatus.value || undefined, billCycle: billCycle.value || undefined }),
      listResource('billing', 'accounts', { pageSize: 200 }),
    ])
    rows.value = data.records
    accountOptions.value = accounts.records
  } catch (e) {
    error.value = e instanceof Error ? e.message : '账单数据读取失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function refreshExistingBills() {
  existingBills.value = []
  if (mode.value !== 'settlement' || !settlement.accountId || !settlement.billCycle) return
  try {
    const data = await bills({ pageNum: 1, pageSize: 20, accountId: settlement.accountId, billCycle: settlement.billCycle })
    existingBills.value = data.records
  } catch {
    existingBills.value = []
  }
}

async function openBill(row: RecordRow) {
  try { selected.value = await bill(row.id) }
  catch (e) { error.value = e instanceof Error ? e.message : '账单详情读取失败' }
}

async function previewBill() {
  if (!settlementReady.value) { error.value = '请先选择计费账户并填写完整账期'; return }
  await refreshExistingBills()
  if (settlementAlreadyBilled.value) {
    error.value = '该账号本账期已生成账单，请进入审核发布、收款跟进或关账归档，不需要重复出账'
    return
  }
  calculating.value = true
  error.value = ''
  try {
    preview.value = await billPreview(settlement)
    settlementStep.value = 2
  } catch (e) {
    error.value = e instanceof Error ? e.message : '账单试算失败'
  } finally {
    calculating.value = false
  }
}

async function createBill() {
  if (!preview.value) { error.value = '请先完成账单试算'; return }
  await refreshExistingBills()
  if (settlementAlreadyBilled.value) {
    error.value = '该账号本账期已生成账单，请进入审核发布、收款跟进或关账归档'
    return
  }
  if (preview.value.touReady === false) { error.value = '分时统计尚未就绪，请先处理采集质量或重建统计'; return }
  if (!previewDetails.value.length) { error.value = '当前范围没有可计费明细，无法生成账单'; return }
  calculating.value = true
  try {
    selected.value = await generateBill(settlement)
    settlementStep.value = 3
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '账单生成失败'
  } finally {
    calculating.value = false
  }
}

function openPayment() {
  if (!selected.value) return
  payment.payAmount = String(selected.value.outstanding_amount ?? selected.value.total_amount ?? '')
  payment.payWay = '转账'
  payment.transactionNo = ''
  payment.remark = ''
  paymentDialog.value = true
}

async function pay() {
  if (!selected.value) return
  try {
    selected.value = await payBill(selected.value.id, { ...payment, operator: session.user?.username || 'admin' })
    paymentDialog.value = false
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '缴费失败' }
}

function openReverse(paymentRecord: RecordRow) {
  reverseForm.paymentId = typeof paymentRecord.id === 'string' || typeof paymentRecord.id === 'number' ? paymentRecord.id : ''
  reverseForm.reason = ''
  reverseDialog.value = true
}

async function reverse() {
  if (!selected.value || !reverseForm.paymentId) return
  try {
    selected.value = await reversePayment(reverseForm.paymentId, { reason: reverseForm.reason, operator: session.user?.username || 'admin' })
    reverseDialog.value = false
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '收款冲销失败' }
}

async function operate(action: 'recalculate' | 'void') {
  if (!selected.value) return
  try {
    selected.value = await billAction(selected.value.id, action, action === 'void' ? { remark: '前端发起作废' } : {})
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '账单操作失败' }
}

function reset() {
  keyword.value = ''
  accountId.value = ''
  orgId.value = ''
  includeChildren.value = ''
  payStatus.value = ''
  billCycle.value = ''
  load()
}

async function workflow(action: 'review' | 'issue') {
  if (!selected.value) return
  try {
    selected.value = await billWorkflowAction(selected.value.id, action)
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '账单流程操作失败' }
}

function chooseAccount(account: RecordRow) {
  settlement.accountId = String(account.id)
  void refreshExistingBills()
}

function restartSettlement() {
  settlementStep.value = 1
  preview.value = null
  Object.assign(settlement, { accountId: '', startDate: '', endDate: '', billCycle: '' })
}

watch(() => route.fullPath, () => { syncQueryFilters(); void load() })
watch(() => [settlement.accountId, settlement.billCycle], () => { void refreshExistingBills() })
onMounted(() => { syncQueryFilters(); void load() })
</script>

<template>
  <section class="view-page billing-table-page billing-bill-page">
    <header v-if="!props.embedded" class="view-head"><div><p class="eyebrow">BILLING & SETTLEMENT</p><h1>{{ title }}</h1></div><button class="quiet" @click="load">刷新</button></header>

    <template v-if="mode === 'settlement'">
      <section class="billing-wizard">
        <div v-if="preview?.ready === false" class="wizard-warning">
          <strong>本次账单暂不能生成</strong>
          <p v-for="(blocker, index) in previewBlockers" :key="`${blocker.code || 'BLOCKER'}-${index}`">
            {{ blocker.deviceName || blocker.deviceSn || (blocker.deviceId ? `设备 ${blocker.deviceId}` : '计费预检') }}
            {{ blocker.statDate ? `· ${blocker.statDate}` : '' }}：{{ blocker.message || '统计或计费数据尚未就绪' }}
            <span v-if="blocker.completeRate !== undefined">（完整率 {{ blocker.completeRate }}%，要求 {{ blocker.threshold }}%）</span>
          </p>
        </div>
        <ol class="billing-steps"><li :class="{ active: settlementStep === 1, done: settlementStep > 1 }"><i>1</i><span>选择结算范围<small>账户与账期</small></span></li><li :class="{ active: settlementStep === 2, done: settlementStep > 2 }"><i>2</i><span>核对试算结果<small>质量与金额</small></span></li><li :class="{ active: settlementStep === 3 }"><i>3</i><span>生成账单<small>进入出账流程</small></span></li></ol>
        <article v-if="settlementStep === 1" class="wizard-stage"><div class="wizard-stage-head"><div><h2>本期要向谁结算？</h2></div><span>步骤 1 / 3</span></div><AppLoadingState v-if="loading" /><div v-else class="account-choice-grid"><button v-for="account in accountOptions" :key="String(account.id)" class="account-choice" :class="{ selected: settlement.accountId === String(account.id), billed: settlementAlreadyBilled && settlement.accountId === String(account.id) }" @click="chooseAccount(account)"><b>{{ account.account_name }}</b><span>{{ account.org_name || `组织 ${account.org_id || '—'}` }}</span><small>{{ account.contact_name || '未填写联系人' }} {{ account.contact_phone ? `· ${account.contact_phone}` : '' }}</small></button><p v-if="!accountOptions.length" class="empty-state">当前授权范围内没有可结算账户。</p></div><div class="wizard-form"><label class="field"><span>账期*</span><input v-model="settlement.billCycle" placeholder="例如 2026-08"></label><label class="field"><span>开始日期*</span><input v-model="settlement.startDate" type="date"></label><label class="field"><span>结束日期*</span><input v-model="settlement.endDate" type="date"></label></div><div v-if="settlementAlreadyBilled" class="wizard-existing-bill"><strong>本账期已经生成账单，不需要重复出账</strong><p>{{ selectedAccount?.account_name || '当前计费账户' }} · {{ settlement.billCycle }} · {{ existingBill?.bill_no || existingBill?.billNo }} · {{ existingBill?.bill_status || existingBill?.billStatus || '已生成' }} · 剩余应收 ¥{{ Number(existingBill?.outstanding_amount ?? existingBill?.outstandingAmount ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</p><div><button class="quiet" type="button" @click="existingBill && openBill(existingBill)">查看账单明细</button><button class="btn-primary" type="button" @click="router.push({ path: '/billing/jobs', query: { billCycle: settlement.billCycle } })">回到出账作业</button></div></div><div class="wizard-actions"><button class="btn-primary" :disabled="calculating || settlementAlreadyBilled" @click="previewBill">{{ calculating ? '正在试算…' : settlementAlreadyBilled ? '已生成账单' : '开始试算' }}</button></div></article>
        <article v-else-if="settlementStep === 2" class="wizard-stage"><div class="wizard-stage-head"><div><h2>请确认本期应收</h2></div><span>步骤 2 / 3</span></div><div class="wizard-total"><span>本期应收</span><strong>¥ {{ Number(preview?.totalAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</strong><small>{{ previewDetails.length }} 条计费明细</small></div><p v-if="preview?.touReady === false" class="wizard-warning">存在分时统计未就绪的设备，暂不能生成账单。请先处理采集质量或重建统计。</p><div class="billing-preview-list"><article v-for="detail in previewDetails" :key="`${detail.deviceId}-${detail.pointCode}-${detail.tariffPeriodCode || ''}`"><b>{{ detail.pointCode || '计费测点' }}</b><span>设备 {{ detail.deviceId }} · {{ detail.tariffPeriodCode || '常规时段' }}</span><small>{{ Number(detail.usage || 0).toFixed(4) }} × ¥{{ Number(detail.unitPrice || 0).toFixed(4) }}</small><strong>¥ {{ Number(detail.amount || 0).toFixed(2) }}</strong></article><p v-if="!previewDetails.length" class="empty-state">本次范围没有可计费明细。</p></div><div class="wizard-actions"><button class="quiet" :disabled="calculating" @click="settlementStep = 1">返回修改</button><button class="btn-primary" :disabled="calculating" @click="createBill">{{ calculating ? '正在生成…' : '确认生成账单' }}</button></div></article>
        <article v-else class="wizard-stage wizard-complete"><CheckCircle2 :size="38" /><h2>账单已生成</h2><div class="wizard-actions"><button class="quiet" @click="restartSettlement">继续生成下一笔</button><button class="btn-primary" @click="router.push({ path: '/billing/receivables', query: { view: 'bills' } })">查看账单中心</button></div></article>
      </section>
    </template>

    <template v-else>
      <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="账单编号、账期或备注" @query="load" @reset="reset"><label class="field inline"><span>计费账户</span><AppSelect v-model="accountId"><option value="">全部账户</option><option v-for="account in accountOptions" :key="String(account.id)" :value="String(account.id)">{{ account.account_name }}</option></AppSelect></label><label class="field inline"><span>缴费状态</span><AppSelect v-model="payStatus"><option value="">全部</option><option value="0">未缴</option><option value="4">部分缴费</option><option value="1">已缴</option><option value="2">逾期</option><option value="3">已作废</option></AppSelect></label><label class="field inline"><span>账期</span><input v-model="billCycle" placeholder="2026-07"></label></FilterBar>
      <AppDataTable title="账单列表" :columns="billColumns" :rows="rows" :loading="loading" :error="error" :compact="props.embedded" @refresh="load" @detail="openBill"><template #cell-pay_status="{ value }"><StatusTag domain="bill" :value="value" /></template><template #actions="{ row }"><button class="link-btn" @click="openBill(row)">查看明细</button></template></AppDataTable>
    </template>

    <AppDrawer :open="Boolean(selected)" title="账单详情" @update:open="(open) => { if (!open) selected = null }"><pre>{{ JSON.stringify(selected, null, 2) }}</pre><section v-if="paymentRecords.length" class="payment-history"><h3>收款流水</h3><div v-for="record in paymentRecords" :key="String(record.id)" class="payment-row"><span>{{ record.payment_no || `PAY-${record.id}` }} · ¥ {{ Number(record.pay_amount || 0).toFixed(2) }} · {{ record.payment_status || 'SUCCESS' }}</span><button v-if="record.payment_status === 'SUCCESS' && session.can('billing:payment:reverse')" class="link-btn" @click="openReverse(record)">冲销/退款</button></div></section><div v-if="selected" class="drawer-actions"><button v-if="selected.bill_status === 'DRAFT' && session.can('billing:batch:review')" class="primary" @click="workflow('review')">提交审核</button><button v-if="selected.bill_status === 'REVIEWED' && session.can('billing:batch:review')" class="primary" @click="workflow('issue')">发布账单</button><button v-if="[0, 4].includes(Number(selected.pay_status)) && selected.bill_status === 'ISSUED' && session.can('billing:bill:pay')" class="primary" @click="openPayment">登记收款</button><button v-if="Number(selected.pay_status) === 0 && selected.bill_status === 'DRAFT' && session.can('billing:bill:generate')" class="quiet" @click="operate('recalculate')">重新计算</button><button v-if="[0, 4].includes(Number(selected.pay_status)) && session.can('billing:bill:generate')" class="danger" @click="operate('void')">作废账单</button></div></AppDrawer>
    <AppDialog v-model:open="paymentDialog" title="账单收款核销" @submit="pay"><div class="dialog-fields"><label class="dialog-field"><span>本次收款金额</span><input v-model="payment.payAmount" type="number" min="0.01" step="0.01"></label><label class="dialog-field"><span>支付方式</span><AppSelect v-model="payment.payWay"><option>转账</option><option>现金</option><option>线上支付</option></AppSelect></label><label class="dialog-field"><span>外部交易流水号</span><input v-model="payment.transactionNo" placeholder="银行/支付平台流水号"></label><label class="dialog-field full"><span>备注</span><textarea v-model="payment.remark"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="reverseDialog" title="收款冲销/退款" @submit="reverse"><div class="dialog-fields"><label class="dialog-field full"><span>冲销或退款原因</span><textarea v-model="reverseForm.reason" required placeholder="例如：重复收款、银行退票、线下退款"></textarea></label></div></AppDialog>
  </section>
</template>
