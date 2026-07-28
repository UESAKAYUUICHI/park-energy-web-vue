<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { bill, billAction, billPreview, bills, generateBill, listResource, payBill } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const mode = computed(() => String(route.meta.kind))
const title = computed(() => mode.value === 'settlement' ? '结算工作台' : '账单中心')
const rows = ref<RecordRow[]>([])
const keyword = ref('')
const accountId = ref('')
const orgId = ref('')
const includeChildren = ref('')
const payStatus = ref('')
const billCycle = ref('')
const accountOptions = ref<RecordRow[]>([])
const loading = ref(false)
const error = ref('')
const selected = ref<RecordRow | null>(null)
const preview = ref<RecordRow | null>(null)
const previewDialog = ref(false)
const paymentDialog = ref(false)
const calculating = ref(false)
const payment = reactive<{ payAmount: string | number; payWay: string; remark: string }>({ payAmount: '', payWay: '转账', remark: '' })
const settlement = reactive<{ accountId: string; startDate: string; endDate: string; billCycle: string }>({ accountId: '', startDate: '', endDate: '', billCycle: '' })

const queryText = (value: unknown) => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
const syncQueryFilters = () => {
  accountId.value = queryText(route.query.accountId)
  orgId.value = queryText(route.query.orgId)
  includeChildren.value = queryText(route.query.includeChildren)
  payStatus.value = queryText(route.query.payStatus)
  billCycle.value = queryText(route.query.billCycle)
}
const previewDetails = computed(() => Array.isArray(preview.value?.details) ? preview.value.details as unknown as RecordRow[] : [])
const detailColumns = [{ key: 'device_name', label: '计费设备' }, { key: 'device_type_name', label: '设备类型' }, { key: 'point_code', label: '计费测点' }, { key: 'start_value', label: '起始值' }, { key: 'end_value', label: '结束值' }, { key: 'usage_value', label: '用量' }, { key: 'unit_price', label: '单价' }, { key: 'amount', label: '金额' }]
const billColumns = [{ key: 'bill_no', label: '账单编号' }, { key: 'account_name', label: '计费账户' }, { key: 'bill_cycle', label: '账期' }, { key: 'start_date', label: '开始日期' }, { key: 'end_date', label: '结束日期' }, { key: 'total_amount', label: '应收金额', format: (value: unknown) => `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` }, { key: 'pay_status', label: '状态' }]
const accountColumns = [{ key: 'account_name', label: '可见计费账户' }, { key: 'org_id', label: '组织 ID' }, { key: 'contact_name', label: '联系人' }, { key: 'status', label: '状态' }]

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'settlement') {
      const data = await listResource('billing', 'accounts', { pageNum: 1, pageSize: 200, keyword: keyword.value })
      rows.value = data.records
      accountOptions.value = data.records
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

async function openBill(row: RecordRow) {
  try { selected.value = await bill(row.id) }
  catch (e) { error.value = e instanceof Error ? e.message : '账单详情读取失败' }
}

async function previewBill() {
  calculating.value = true
  error.value = ''
  try {
    preview.value = await billPreview(settlement)
    previewDialog.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '账单试算失败'
  } finally {
    calculating.value = false
  }
}

async function createBill() {
  if (!preview.value) return
  calculating.value = true
  try {
    selected.value = await generateBill(settlement)
    previewDialog.value = false
    preview.value = null
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '账单生成失败'
  } finally {
    calculating.value = false
  }
}

function openPayment() {
  if (!selected.value) return
  payment.payAmount = String(selected.value.total_amount ?? '')
  payment.payWay = '转账'
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

watch(() => route.fullPath, () => { syncQueryFilters(); void load() })
onMounted(() => { syncQueryFilters(); void load() })
</script>

<template>
  <section class="view-page">
    <header class="view-head"><div><p class="eyebrow">BILLING & SETTLEMENT</p><h1>{{ title }}</h1><p>{{ mode === 'settlement' ? '账单试算。' : '账单管理。' }}</p></div><button class="quiet" @click="load">刷新</button></header>

    <template v-if="mode === 'settlement'">
      <article class="form-card"><h3>账单试算条件</h3><p>试算参数。</p><div class="form-grid"><label class="field"><span>计费账户</span><select v-model="settlement.accountId"><option value="">请选择计费账户</option><option v-for="account in accountOptions" :key="String(account.id)" :value="String(account.id)">{{ account.account_name }}</option></select></label><label class="field"><span>账期</span><input v-model="settlement.billCycle" placeholder="2026-07" required></label><label class="field"><span>开始日期</span><input v-model="settlement.startDate" type="date" required></label><label class="field"><span>结束日期</span><input v-model="settlement.endDate" type="date" required></label></div><div class="form-actions"><button class="btn-primary" :disabled="calculating" @click="previewBill">{{ calculating ? '正在试算…' : '试算金额' }}</button></div></article>
      <AppDataTable title="可见计费账户" :columns="accountColumns" :rows="rows" :loading="loading" :error="error" @refresh="load" />
    </template>

    <template v-else>
      <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="账单编号、账期或备注" @query="load" @reset="reset"><label class="field inline"><span>计费账户</span><select v-model="accountId"><option value="">全部账户</option><option v-for="account in accountOptions" :key="String(account.id)" :value="String(account.id)">{{ account.account_name }}</option></select></label><label class="field inline"><span>缴费状态</span><select v-model="payStatus"><option value="">全部</option><option value="0">未缴</option><option value="1">已缴</option><option value="2">逾期</option><option value="3">已作废</option></select></label><label class="field inline"><span>账期</span><input v-model="billCycle" placeholder="2026-07"></label></FilterBar>
      <AppDataTable title="账单列表" :columns="billColumns" :rows="rows" :loading="loading" :error="error" @refresh="load" @detail="openBill"><template #cell-pay_status="{ value }"><StatusTag domain="bill" :value="value" /></template><template #actions="{ row }"><button class="link-btn" @click="openBill(row)">查看明细</button></template></AppDataTable>
    </template>

    <AppDialog v-model:open="previewDialog" title="账单试算结果" description="确认后生成账单。" confirm-text="确认生成账单" :saving="calculating" @submit="createBill"><div class="preview-dialog"><div class="amount">¥ {{ Number(preview?.totalAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}</div><p>共 {{ previewDetails.length }} 条明细。</p></div><AppDataTable title="试算明细" :columns="detailColumns" :rows="previewDetails" empty-text="本次试算没有可计费明细。" /></AppDialog>
    <AppDrawer :open="Boolean(selected)" title="账单详情" @update:open="(open) => { if (!open) selected = null }"><pre>{{ JSON.stringify(selected, null, 2) }}</pre><div v-if="selected && Number(selected.pay_status) === 0" class="drawer-actions"><button v-if="session.can('billing:bill:pay')" class="primary" @click="openPayment">全额缴费</button><button v-if="session.can('billing:bill:generate')" class="quiet" @click="operate('recalculate')">重新计算</button><button v-if="session.can('billing:bill:generate')" class="danger" @click="operate('void')">作废账单</button></div></AppDrawer>
    <AppDialog v-model:open="paymentDialog" title="账单缴费" description="全额缴费。" @submit="pay"><div class="dialog-fields"><label class="dialog-field"><span>缴费金额</span><input v-model="payment.payAmount" type="number"></label><label class="dialog-field"><span>支付方式</span><select v-model="payment.payWay"><option>转账</option><option>现金</option><option>线上支付</option></select></label><label class="dialog-field full"><span>备注</span><textarea v-model="payment.remark"></textarea></label></div></AppDialog>
  </section>
</template>
