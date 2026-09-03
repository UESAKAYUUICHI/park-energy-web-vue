<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Banknote, Building2, Check, CheckCircle2, ChevronRight, CircleAlert, FileClock, FileText, Gauge, ReceiptText, RotateCw, Settings2, ShieldCheck, WalletCards } from '@lucide/vue'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppLoadingState from '@/components/app/AppLoadingState.vue'
import { billingFinanceProfile, experienceRevenue, experienceRevenuePrecheck, generateBill } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

type SupportView = 'follow' | 'finance' | 'changes'

const route = useRoute()
const router = useRouter()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const payload = ref<RecordRow>({})
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const cycle = ref(String(route.query.billCycle || new Date().toISOString().slice(0, 7)))
const checking = ref(false)
const precheck = ref<RecordRow | null>(null)
const precheckOpen = ref(false)
const supportOpen = ref(false)
const supportView = ref<SupportView>('follow')
const generateDialog = ref(false)
const generating = ref(false)
const generatedBill = ref<RecordRow | null>(null)
const finance = ref<RecordRow | null>(null)
const financeLoading = ref(false)
const billSection = ref<HTMLElement | null>(null)

const summary = computed(() => payload.value.summary as RecordRow || {})
const accounts = computed(() => Array.isArray(payload.value.accounts) ? payload.value.accounts as RecordRow[] : [])
const selected = computed(() => payload.value.selectedAccount as RecordRow || {})
const readiness = computed(() => payload.value.readiness as RecordRow || {})
const rules = computed(() => Array.isArray(payload.value.rules) ? payload.value.rules as RecordRow[] : [])
const meters = computed(() => Array.isArray(payload.value.meters) ? payload.value.meters as RecordRow[] : [])
const bills = computed(() => Array.isArray(payload.value.bills) ? payload.value.bills as RecordRow[] : [])
const batches = computed(() => Array.isArray(payload.value.batches) ? payload.value.batches as RecordRow[] : [])
const adjustments = computed(() => Array.isArray(payload.value.adjustments) ? payload.value.adjustments as RecordRow[] : [])
const collections = computed(() => Array.isArray(payload.value.collections) ? payload.value.collections as RecordRow[] : [])
const meteringOrders = computed(() => Array.isArray(payload.value.meteringOrders) ? payload.value.meteringOrders as RecordRow[] : [])
const capabilities = computed(() => payload.value.capabilities as RecordRow || {})
const precheckIssues = computed(() => Array.isArray(precheck.value?.issues) ? precheck.value.issues as RecordRow[] : [])
const precheckPassed = computed(() => Array.isArray(precheck.value?.passed) ? precheck.value.passed as RecordRow[] : [])
const precheckPreview = computed(() => precheck.value?.preview as RecordRow || {})
const receivable = computed(() => finance.value?.receivable as RecordRow || {})
const financeLedger = computed(() => Array.isArray(finance.value?.ledger) ? finance.value.ledger as RecordRow[] : [])
const financeAging = computed(() => Array.isArray(finance.value?.aging) ? finance.value.aging as RecordRow[] : [])
const financeEvents = computed(() => Array.isArray(finance.value?.events) ? finance.value.events as RecordRow[] : [])
const filteredAccounts = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return accounts.value
  return accounts.value.filter((item) => [item.accountName, item.tenantName, item.contractNo, item.orgName].some((part) => String(part || '').toLowerCase().includes(value)))
})
const readinessSteps = computed(() => [
  { label: '账户启用', ok: Boolean(readiness.value.accountReady), hint: '计费主体可用' },
  { label: readiness.value.settlementModel === 'CONTRACT' ? '合同有效' : '范围有效', ok: Boolean(readiness.value.contractReady), hint: selected.value.contractName || '按计费规则范围结算' },
  { label: '表计已绑', ok: Boolean(readiness.value.meterReady), hint: `${readiness.value.meterCount || 0} 台结算表计` },
  { label: '规则生效', ok: Boolean(readiness.value.ruleReady), hint: `${readiness.value.activeRuleCount || 0} 条启用规则` },
  { label: '质量达标', ok: Boolean(readiness.value.qualityReady), hint: `${readiness.value.unhealthyMeterCount || 0} 台需关注` },
])
const canSettle = computed(() => readinessSteps.value.every((item) => item.ok))
const dossierCards = computed(() => [
  { label: '租户档案', value: selected.value.tenantName || selected.value.accountName || '未命名对象', hint: selected.value.contactName ? `${selected.value.contactName} ${selected.value.contactPhone || ''}` : '联系人未完善', icon: Building2, ok: Boolean(selected.value.tenantName || selected.value.accountName) },
  { label: '合同依据', value: selected.value.contractName || '未绑定合同', hint: selected.value.contractNo || '缺少合同编号', icon: FileText, ok: Boolean(readiness.value.contractReady) },
  { label: '结算表计', value: `${readiness.value.meterCount || 0} 台表计`, hint: Number(readiness.value.unhealthyMeterCount || 0) > 0 ? `${readiness.value.unhealthyMeterCount} 台质量需关注` : '用于本期用量计算', icon: Gauge, ok: Boolean(readiness.value.meterReady) },
  { label: '计费规则', value: `${readiness.value.activeRuleCount || 0} 条规则`, hint: readiness.value.ruleReady ? '已生效，可参与出账' : '需要配置价格和范围', icon: Settings2, ok: Boolean(readiness.value.ruleReady) },
])
const collectionTodoCount = computed(() => bills.value.filter((item) => Number(item.overdue) > 0 || Number(item.outstandingAmount ?? item.outstanding_amount) > 0).length)
const receivableTodoCount = computed(() => Number(summary.value.outstandingBillCount || selected.value.outstandingBillCount || collectionTodoCount.value))
const configTodoCount = computed(() => readinessSteps.value.filter((item) => !item.ok).length + meteringOrders.value.filter((item) => ['PENDING', 'APPROVED'].includes(String(item.status))).length)
const precheckLabel = computed(() => !precheck.value ? '未检查' : precheck.value.ready ? '已通过' : Number(precheck.value.blockerCount) > 0 ? '有阻断' : '有风险')
const precheckTone = computed(() => !precheck.value ? 'idle' : precheck.value.ready ? 'success' : Number(precheck.value.blockerCount) > 0 ? 'danger' : 'warning')
const supportTitle = computed(() => ({ follow: '收款与跟进', finance: '应收台账', changes: '规则、表计与变更' })[supportView.value])
const billColumns: TableColumn[] = [
  { key: 'billNo', label: '账单编号', width: '19%' },
  { key: 'billCycle', label: '账期', width: '10%' },
  { key: 'billStatus', label: '出账状态', width: '12%' },
  { key: 'totalAmount', label: '应收金额', width: '13%' },
  { key: 'paidAmount', label: '已收金额', width: '13%' },
  { key: 'outstandingAmount', label: '剩余应收', width: '13%' },
  { key: 'dueDate', label: '到期日', width: '12%' },
]

async function load(accountId?: unknown) {
  loading.value = true
  error.value = ''
  try { payload.value = await experienceRevenue({ accountId: accountId || route.query.accountId || undefined, billCycle: cycle.value || undefined }) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '经营结算上下文读取失败' }
  finally { loading.value = false }
}
async function selectAccount(id: unknown) {
  precheck.value = null
  generatedBill.value = null
  finance.value = null
  await router.replace({ path: '/billing/subjects', query: { view: 'overview', accountId: String(id), billCycle: cycle.value } })
  await load(id)
}
async function changeCycle() {
  precheck.value = null
  generatedBill.value = null
  finance.value = null
  await router.replace({ path: '/billing/subjects', query: { view: 'overview', accountId: selected.value.id ? String(selected.value.id) : undefined, billCycle: cycle.value } })
  await load(selected.value.id)
}
async function openFinance() {
  if (!selected.value.id || finance.value || financeLoading.value) return
  financeLoading.value = true
  try { finance.value = await billingFinanceProfile(selected.value.id) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '应收台账读取失败' }
  finally { financeLoading.value = false }
}
function openSupport(view: SupportView) {
  supportView.value = view
  supportOpen.value = true
  if (view === 'finance') void openFinance()
}
function focusBills() { void nextTick(() => billSection.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })) }
function ledgerLabel(type: unknown) { return ({ BILL_ISSUED: '账单确认应收', ADJUSTMENT_SURCHARGE: '补收审批', ADJUSTMENT_DISCOUNT: '减免/坏账', PAYMENT: '登记收款', PAYMENT_REVERSE: '收款冲销' } as Record<string, string>)[String(type)] || String(type || '—') }
function agingLabel(bucket: unknown) { return ({ NOT_DUE: '未到期', OVERDUE_1_30: '逾期 1-30 天', OVERDUE_31_60: '逾期 31-60 天', OVERDUE_61_PLUS: '逾期 61 天以上' } as Record<string, string>)[String(bucket)] || String(bucket || '—') }
async function runPrecheck() {
  if (!selected.value.id || !cycle.value) return
  checking.value = true
  error.value = ''
  try { generatedBill.value = null; precheck.value = await experienceRevenuePrecheck({ accountId: selected.value.id, billCycle: cycle.value }) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '账期预检查失败' }
  finally { checking.value = false }
}
async function createDraftBill() {
  if (!precheck.value?.ready) return
  generating.value = true
  error.value = ''
  try {
    generatedBill.value = await generateBill({ accountId: Number(selected.value.id), billCycle: cycle.value, startDate: String(precheck.value.startDate), endDate: String(precheck.value.endDate) })
    generateDialog.value = false
    precheckOpen.value = false
    precheck.value = null
    await load(selected.value.id)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '草稿账单生成失败' }
  finally { generating.value = false }
}
function go(path: string, query: Record<string, unknown> = {}) { void router.push({ path, query: query as never }) }
function money(value: unknown) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function billStatus(item: RecordRow) { if (Number(item.overdue)) return '已逾期'; return ({ 0: '未缴', 1: '已缴', 2: '逾期', 3: '作废', 4: '部分缴费' } as Record<number, string>)[Number(item.payStatus)] || String(item.billStatus || '未知') }

onMounted(() => load(route.query.accountId))
</script>

<template>
  <section class="view-page business-center-page subject-business-center" :class="{ loading }">
    <header v-if="!props.embedded" class="center-titlebar"><div><p class="eyebrow">SETTLEMENT DOSSIER</p><h1>结算对象档案</h1></div></header>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <div class="object-workspace revenue-workspace">
      <aside class="object-rail">
        <div class="object-rail-head"><b>租户与账户</b><small>{{ filteredAccounts.length }} / {{ accounts.length }}</small></div>
        <input v-model="keyword" class="rail-search" placeholder="搜索租户、合同或账户" />
        <div class="object-list account-list">
          <button v-for="item in filteredAccounts" :key="String(item.id)" :class="{ active: String(item.id) === String(selected.id) }" @click="selectAccount(item.id)"><i :class="{ online: Number(item.status) === 1, alert: Number(item.outstandingBillCount) > 0 }"></i><span><b>{{ item.tenantName || item.accountName }}</b><small>{{ item.contractNo || '未绑定合同' }} · {{ item.orgName }}</small></span><em v-if="Number(item.outstandingBillCount)">{{ item.outstandingBillCount }}</em><ChevronRight v-else :size="14" /></button>
          <p v-if="!filteredAccounts.length" class="center-empty">没有匹配的账户</p>
        </div>
      </aside>

      <main v-if="selected.id" class="object-stage subject-main-stage">
        <header class="object-identity revenue-identity">
          <div class="object-icon"><WalletCards :size="23" /></div>
          <div><div class="identity-line"><h2>{{ selected.tenantName || selected.accountName }}</h2><span :class="['health-pill', canSettle ? '' : 'warn']">{{ canSettle ? '可以结算' : '结算前需补齐' }}</span></div><p>{{ selected.contractName || '尚未绑定合同' }} · {{ selected.contactName || '未填联系人' }} {{ selected.contactPhone || '' }}</p></div>
          <label class="cycle-switch"><span>当前账期</span><input v-model="cycle" type="month" @change="changeCycle" /></label>
        </header>

        <section class="subject-dossier-grid" aria-label="对象结算档案">
          <article v-for="card in dossierCards" :key="card.label" :class="{ ok: card.ok, warning: !card.ok }">
            <component :is="card.icon" :size="17" />
            <span><b>{{ card.label }}</b><strong>{{ card.value }}</strong><small>{{ card.hint }}</small></span>
          </article>
        </section>

        <section class="subject-todo-bar" aria-label="当前对象业务待办">
          <button type="button" :class="{ active: bills.length > 0 }" @click="focusBills"><span>本期账单</span><i>{{ bills.length }}</i><small>常驻清单</small></button>
          <button type="button" :class="{ warning: collectionTodoCount > 0 }" @click="openSupport('follow')"><span>收款与跟进</span><i>{{ collectionTodoCount }}</i><small>待收与催缴</small></button>
          <button type="button" :class="{ warning: receivableTodoCount > 0 }" @click="openSupport('finance')"><span>应收台账</span><i>{{ receivableTodoCount }}</i><small>余额与账龄</small></button>
          <button type="button" :class="{ danger: configTodoCount > 0 }" @click="openSupport('changes')"><span>规则、表计与变更</span><i>{{ configTodoCount }}</i></button>
        </section>

        <section class="settlement-readiness compact-readiness">
          <div v-for="(step, index) in readinessSteps" :key="step.label" :class="['readiness-step', { ok: step.ok }]">
            <i><Check v-if="step.ok" :size="13" /><span v-else>{{ index + 1 }}</span></i><div><b>{{ step.label }}</b><small>{{ step.hint }}</small></div><ChevronRight v-if="index < readinessSteps.length - 1" class="step-arrow" :size="14" />
          </div>
        </section>

        <div v-if="generatedBill" class="generated-bill-banner compact-banner"><CheckCircle2 :size="18" /><div><b>本期草稿账单已生成</b><span>{{ generatedBill.bill_no || generatedBill.billNo }} · ¥{{ money(generatedBill.total_amount ?? generatedBill.totalAmount) }}</span></div><button class="quiet" @click="focusBills">查看本期账单</button></div>

        <section class="subject-command-bar">
          <div><span>{{ cycle }} 当前应收</span><strong>¥ {{ money(summary.outstandingAmount) }}</strong><small>{{ canSettle ? '结算配置已就绪' : `${configTodoCount} 项配置需要处理` }}</small></div>
          <button :class="['precheck-entry', precheckTone]" type="button" @click="precheckOpen = true"><ShieldCheck :size="16" /><span>本期结算预检查</span><i>{{ precheckLabel }}</i></button>
          <button v-if="capabilities.generateBill && precheck?.ready && !generatedBill" class="primary" @click="generateDialog = true"><ReceiptText :size="15" />生成草稿账单</button>
        </section>

        <section ref="billSection" class="subject-bill-section">
          <AppDataTable title="本期账单" :columns="billColumns" :rows="bills" :loading="loading" empty-text="本账期还没有账单，可先运行结算预检查。" compact>
            <template #cell-totalAmount="{ row }">¥{{ money(row.totalAmount ?? row.total_amount) }}</template>
            <template #cell-paidAmount="{ row }">¥{{ money(row.paidAmount ?? row.paid_amount) }}</template>
            <template #cell-outstandingAmount="{ row }"><b :class="{ 'danger-text': Number(row.overdue) }">¥{{ money(row.outstandingAmount ?? row.outstanding_amount) }}</b></template>
            <template #cell-billStatus="{ row }">{{ billStatus(row) }}</template>
            <template #actions="{ row }"><button class="link-btn" @click="go('/billing/receivables', { accountId: selected.id, billCycle: cycle, billId: row.id })">查看详情</button></template>
            <template #toolbar><button v-if="capabilities.viewBills" class="quiet" @click="go('/billing/receivables', { accountId: selected.id, billCycle: cycle })">进入出账工作台</button></template>
          </AppDataTable>
        </section>
      </main>

      <main v-else class="object-stage center-empty-stage"><WalletCards :size="40" /><h2>尚无计费账户</h2><button class="quiet" @click="go('/billing/subjects', { view: 'accounts' })">配置计费账户</button></main>
    </div>

    <AppDialog v-model:open="precheckOpen" title="本期结算预检查" eyebrow="BILLING PRECHECK" hide-actions dialog-class="subject-support-dialog">
      <div class="support-dialog-body">
        <div :class="['precheck-dialog-summary', precheckTone]"><ShieldCheck :size="24" /><div><b>{{ precheck ? (precheck.ready ? '预检查通过，可以进入出账' : `发现 ${precheck.blockerCount || 0} 个阻断项`) : '尚未执行本期预检查' }}</b><span>{{ precheck ? `${precheck.warningCount || 0} 个风险提示 · ${precheckPassed.length} 项通过` : '点击运行后，系统只展示需要处理的重点问题。' }}</span></div><strong v-if="precheck?.ready">¥{{ money(precheckPreview.totalAmount) }}<small>{{ precheckPreview.detailCount || 0 }} 条明细</small></strong></div>
        <div v-if="precheckIssues.length" class="precheck-issue-list dialog-issue-list"><article v-for="issue in precheckIssues" :key="String(issue.code)" :class="String(issue.severity).toLowerCase()"><i>{{ issue.severity === 'BLOCKER' ? '阻断' : '提示' }}</i><div><b>{{ issue.title }}</b><span>{{ issue.detail }}</span></div><button v-if="issue.actionPath" @click="go(String(issue.actionPath), { accountId: selected.id, billCycle: cycle })">去处理 <ChevronRight :size="13" /></button></article></div>
        <details v-if="precheckPassed.length" class="precheck-passed-details"><summary>{{ precheckPassed.length }} 项检查已通过</summary><div class="precheck-passed"><span v-for="item in precheckPassed" :key="String(item.title)"><Check :size="12" /><b>{{ item.title }}</b>{{ item.detail }}</span></div></details>
        <div class="support-dialog-actions"><button class="quiet" type="button" @click="precheckOpen = false">关闭</button><button class="primary" type="button" :disabled="checking" @click="runPrecheck"><RotateCw :size="14" />{{ checking ? '正在检查…' : precheck ? '重新检查' : '运行预检查' }}</button><button v-if="precheck?.ready && !generatedBill" class="primary" type="button" @click="generateDialog = true"><ReceiptText :size="14" />生成草稿账单</button></div>
      </div>
    </AppDialog>

    <AppDialog v-model:open="supportOpen" :title="supportTitle" eyebrow="SUBJECT ASSISTANT" hide-actions dialog-class="subject-support-dialog">
      <div class="support-dialog-body">
        <template v-if="supportView === 'follow'">
          <div class="support-summary-grid"><span><small>待处理账单</small><b>{{ collectionTodoCount }}</b></span><span><small>跟进记录</small><b>{{ collections.length }}</b></span><span><small>调整单</small><b>{{ adjustments.length }}</b></span></div>
          <section class="support-section"><header><div><h3>最近收款与催缴记录</h3></div><button v-if="capabilities.viewCollections" class="quiet" @click="go('/billing/receivables', { accountId: selected.id, billCycle: cycle, action: 'collections' })">进入处理</button></header><div v-if="collections.length" class="compact-feed"><div v-for="item in collections" :key="String(item.id)"><i></i><span><b>{{ item.billNo }} · {{ item.result || '已记录跟进' }}</b><small>{{ item.collectionTime }} · {{ item.operator }}</small></span><em>{{ item.collectionType }}</em></div></div><p v-else class="center-empty">当前账户暂无催缴跟进记录。</p></section>
          <section class="support-section"><header><div><h3>账单调整</h3></div><button class="quiet" @click="go('/billing/receivables', { action: 'adjustments' })">查看调整审批</button></header><div v-if="adjustments.length" class="compact-feed"><div v-for="item in adjustments" :key="String(item.id)"><i></i><span><b>{{ item.adjustmentNo }} · {{ item.reason }}</b><small>{{ item.billNo }} · {{ item.createdBy }}</small></span><em>¥{{ money(item.adjustmentAmount) }} / {{ item.status }}</em></div></div><p v-else class="center-empty">当前账户暂无账单调整单。</p></section>
        </template>

        <template v-else-if="supportView === 'finance'">
          <AppLoadingState v-if="financeLoading" />
          <template v-else><div class="support-summary-grid finance"><span><small>当前应收</small><b>¥{{ money(receivable.open_amount) }}</b></span><span><small>逾期应收</small><b class="danger-text">¥{{ money(receivable.overdue_amount) }}</b></span><span><small>累计已收</small><b>¥{{ money(receivable.received_amount) }}</b></span><span><small>待收账单</small><b>{{ receivable.open_bill_count || 0 }}</b></span></div><section class="support-section"><header><div><h3>应收账龄</h3></div></header><div class="finance-aging"><span v-for="item in financeAging" :key="String(item.bucket)"><b>{{ agingLabel(item.bucket) }}</b><em>¥{{ money(item.amount) }}</em><small>{{ item.bill_count }} 张</small></span><p v-if="!financeAging.length" class="center-empty">当前没有已发布的待收账单。</p></div></section><section class="support-section"><header><div><h3>最近应收流水</h3></div></header><div v-if="financeLedger.length" class="compact-feed"><div v-for="item in financeLedger" :key="String(item.id)"><i :class="{ off: item.direction === 'CREDIT' }"></i><span><b>{{ ledgerLabel(item.entry_type) }}</b><small>{{ item.reference_no || item.bill_no || '—' }} · {{ item.effective_time }}</small></span><em>{{ item.direction === 'DEBIT' ? '+' : '-' }}¥{{ money(item.amount) }}</em></div></div><p v-else class="center-empty">尚无应收流水。</p></section><details class="precheck-passed-details"><summary>查看账单状态留痕（{{ financeEvents.length }}）</summary><div class="compact-feed"><div v-for="item in financeEvents" :key="String(item.id)"><i></i><span><b>{{ ledgerLabel(item.event_type) }}</b><small>{{ item.event_time }} · {{ item.operator }} · {{ item.remark || '状态变更' }}</small></span><em>{{ item.after_bill_status || '—' }}</em></div></div></details></template>
        </template>

        <template v-else>
          <section class="support-section"><header><div><h3>结算准备状态</h3></div></header><div class="config-check-list"><span v-for="step in readinessSteps" :key="step.label" :class="{ ok: step.ok }"><i><Check v-if="step.ok" :size="12" /><CircleAlert v-else :size="12" /></i><b>{{ step.label }}</b><small>{{ step.hint }}</small></span></div></section>
          <div class="support-two-columns"><section class="support-section"><header><div><h3>计费规则</h3></div><button class="quiet" @click="go('/billing/pricing', { accountId: selected.id })">维护方案</button></header><div v-if="rules.length" class="compact-feed"><div v-for="item in rules" :key="String(item.id)"><i :class="{ off: !Number(item.enabled) }"></i><span><b>{{ item.ruleName }}</b><small>{{ item.deviceTypeName }} · {{ item.metricPointCode }}</small></span><em>{{ item.priceMode }}</em></div></div><p v-else class="center-empty">尚未配置计费规则。</p></section><section class="support-section"><header><div><h3>结算表计与质量</h3></div><button class="quiet" @click="go('/billing/pricing', { accountId: selected.id, action: 'meters' })">管理表计</button></header><div v-if="meters.length" class="compact-feed"><div v-for="item in meters" :key="String(item.id)"><i :class="{ off: item.qualityStatus !== 'NORMAL' }"></i><span><b>{{ item.deviceName }}</b><small>{{ item.deviceSn }} · 完整率 {{ item.completeRate == null ? '—' : `${item.completeRate}%` }}</small></span><em>{{ item.qualityStatus || '待统计' }}</em></div></div><p v-else class="center-empty">尚未匹配结算表计。</p></section></div>
          <section class="support-section"><header><div><h3>待处理计量变更</h3></div><button class="quiet" @click="go('/billing/pricing', { action: 'changes' })">处理变更</button></header><div v-if="meteringOrders.length" class="compact-feed horizontal"><div v-for="item in meteringOrders" :key="String(item.id)"><i></i><span><b>{{ item.changeNo }} · {{ item.changeType }}</b><small>{{ item.reason }} · {{ item.effectiveTime }}</small></span><em>{{ item.status }}</em></div></div><p v-else class="center-empty">没有待处理的计量变更。</p></section>
        </template>
      </div>
    </AppDialog>

    <AppDialog v-model:open="generateDialog" title="确认生成草稿账单" :saving="generating" confirm-text="确认生成草稿" @submit="createDraftBill"><div class="bill-confirm-card"><span>{{ selected.tenantName || selected.accountName }}</span><b>{{ cycle }} 账期</b><strong>¥ {{ money(precheckPreview.totalAmount) }}</strong><small>{{ precheckPreview.detailCount || 0 }} 条计费明细 · 已通过正式试算</small></div></AppDialog>
  </section>
</template>

<style scoped>
.finance-aging{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.finance-aging span{display:grid;gap:3px;padding:9px;border:1px solid var(--border);border-radius:6px;background:var(--bg)}.finance-aging b{font-size:11px}.finance-aging em{font:700 14px ui-monospace,Consolas,monospace;font-style:normal}.finance-aging small{color:var(--muted);font-size:10px}@media(max-width:760px){.finance-aging{grid-template-columns:1fr 1fr}}
</style>
