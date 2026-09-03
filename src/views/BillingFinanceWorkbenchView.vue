<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Banknote, CheckCircle2, ChevronRight, CircleAlert, FileCheck2, LockKeyhole, Plus, RefreshCw, Scale } from '@lucide/vue'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FinanceGovernanceView from '@/views/FinanceGovernanceView.vue'
import { billingPeriodAction, billingPeriods, reconciliationBatches } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { channelLabel, financeStatusLabel } from '@/utils/enumLabels'

type FinanceDialog = 'periods' | 'reconciliations'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const operating = ref(false)
const error = ref('')
const keyword = ref('')
const periods = ref<RecordRow[]>([])
const reconciliations = ref<RecordRow[]>([])
const selectedId = ref(String(route.query.periodId || ''))
const dialogOpen = ref(false)
const dialogView = ref<FinanceDialog>('reconciliations')
const closingOpen = ref(false)

const selected = computed(() => periods.value.find((item) => String(item.id) === selectedId.value) || periods.value[0] || null)
const filteredPeriods = computed(() => periods.value.filter((item) => !keyword.value.trim() || [item.period_code, item.org_name].some((value) => String(value || '').toLowerCase().includes(keyword.value.trim().toLowerCase()))))
const periodReconciliations = computed(() => {
  if (!selected.value) return []
  return reconciliations.value.filter((item) => String(item.org_id) === String(selected.value?.org_id) && (!item.statement_date || String(item.statement_date).startsWith(String(selected.value?.period_code))))
})
const reconciliationAmount = computed(() => periodReconciliations.value.reduce((total, item) => total + Number(item.statement_amount || 0), 0))
const differenceCount = computed(() => periodReconciliations.value.reduce((total, item) => total + Number(item.difference_count || 0), 0))
const matchedCount = computed(() => periodReconciliations.value.reduce((total, item) => total + Number(item.matched_count || 0), 0))
const lifecycleSteps = computed(() => {
  const billCount = Number(selected.value?.bill_count || 0)
  const outstanding = Number(selected.value?.outstanding_amount || 0)
  const hasRecon = periodReconciliations.value.length > 0
  const closed = selected.value?.status === 'CLOSED'
  return [
    { label: '账期建立', ok: Boolean(selected.value), hint: selected.value?.period_code || '未选择账期' },
    { label: '账单形成', ok: billCount > 0, hint: `${billCount} 张账单` },
    { label: '收款跟进', ok: billCount > 0 && outstanding <= 0, hint: outstanding > 0 ? `未收 ¥${money(outstanding)}` : '无剩余应收' },
    { label: '收款对账', ok: hasRecon && differenceCount.value === 0, hint: hasRecon ? `${differenceCount.value} 条差异` : '未创建对账单' },
    { label: '关账归档', ok: closed, hint: closed ? '已关账' : '开放中' },
  ]
})
const columns: TableColumn[] = [
  { key: 'statement_no', label: '对账单号', width: '20%' },
  { key: 'statement_date', label: '对账日期', width: '13%' },
  { key: 'channel', label: '收款渠道', width: '12%', format: channelLabel },
  { key: 'statement_amount', label: '对账金额', width: '15%' },
  { key: 'matched_count', label: '已匹配', width: '11%' },
  { key: 'difference_count', label: '差异', width: '10%' },
  { key: 'status', label: '状态', width: '12%', format: financeStatusLabel },
]
const dialogTitle = computed(() => dialogView.value === 'periods' ? '账期管理' : '收款对账')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [periodResult, reconResult] = await Promise.all([billingPeriods({ pageNum: 1, pageSize: 200 }), reconciliationBatches({ pageNum: 1, pageSize: 500 })])
    periods.value = periodResult.records
    reconciliations.value = reconResult.records
    const firstPeriod = periods.value[0]
    if (!selectedId.value && firstPeriod) selectedId.value = String(firstPeriod.id)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '账期与对账数据读取失败' }
  finally { loading.value = false }
}
async function selectPeriod(item: RecordRow) {
  selectedId.value = String(item.id)
  await router.replace({ query: { periodId: selectedId.value } })
}
function openDialog(view: FinanceDialog) { dialogView.value = view; dialogOpen.value = true }
async function closeDialog(open: boolean) {
  dialogOpen.value = open
  if (!open) { await router.replace({ query: { periodId: selectedId.value || undefined } }); await load() }
}
async function closePeriod() {
  if (!selected.value) return
  operating.value = true
  error.value = ''
  try {
    if (selected.value.status === 'OPEN') await billingPeriodAction(selected.value.id, 'close')
    else await billingPeriodAction(selected.value.id, 'reopen', { reason: '财务复核后重新开放账期' })
    closingOpen.value = false
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '账期操作失败' }
  finally { operating.value = false }
}
function handleLegacyEntry() {
  const view = String(route.query.view || '')
  if (view === 'periods') openDialog('periods')
  if (view === 'reconciliations') openDialog('reconciliations')
}
function money(value: unknown) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

onMounted(async () => { await load(); handleLegacyEntry() })
watch(() => route.query.view, handleLegacyEntry)
</script>

<template>
  <section class="view-page finance-closing-page">
    <header class="view-head business-module-head"><div><p class="eyebrow">PERIOD CLOSING CONTROL</p><h1>账期结算控制台</h1></div><button class="primary" @click="openDialog('reconciliations')"><Plus :size="15" />新建对账单</button></header>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <div class="finance-closing-layout">
      <aside class="period-directory">
        <header><div><b>结算账期</b><small>{{ filteredPeriods.length }} 个账期</small></div><button class="icon-btn" title="刷新" @click="load"><RefreshCw :size="14" /></button></header>
        <input v-model="keyword" placeholder="搜索账期或园区" />
        <div class="period-directory-list"><button v-for="item in filteredPeriods" :key="String(item.id)" :class="{ active: String(item.id) === String(selected?.id) }" @click="selectPeriod(item)"><i :class="String(item.status).toLowerCase()"></i><span><b>{{ item.period_code }}</b><small>{{ item.org_name }} · {{ item.bill_count || 0 }} 张账单</small></span><em>{{ item.status === 'CLOSED' ? '已关账' : '开放' }}</em><ChevronRight :size="13" /></button><p v-if="!filteredPeriods.length" class="center-empty">尚未建立结算账期</p></div>
        <button class="quiet period-create-button" @click="openDialog('periods')"><Plus :size="13" />管理结算账期</button>
      </aside>

      <main v-if="selected" class="finance-closing-main">
        <header class="period-identity"><div><span>{{ selected.org_name }}</span><h2>{{ selected.period_code }} 账期</h2><p>{{ selected.start_date }} 至 {{ selected.end_date }}</p></div><span :class="['period-status', String(selected.status).toLowerCase()]">{{ selected.status === 'CLOSED' ? '已关账' : '开放中' }}</span><button class="quiet" @click="closingOpen = true"><LockKeyhole :size="14" />{{ selected.status === 'OPEN' ? '关账检查' : '申请反关账' }}</button></header>

        <section class="period-lifecycle" aria-label="账期生命周期">
          <span v-for="(step, index) in lifecycleSteps" :key="step.label" :class="{ ok: step.ok, active: !step.ok && lifecycleSteps.slice(0, index).every(item => item.ok) }">
            <i>{{ step.ok ? '✓' : index + 1 }}</i>
            <b>{{ step.label }}</b>
            <small>{{ step.hint }}</small>
          </span>
        </section>

        <section class="period-summary-strip">
          <article><FileCheck2 :size="17" /><span>账单数量<small>本账期全部账单</small></span><b>{{ selected.bill_count || 0 }}</b></article>
          <article :class="{ warning: Number(selected.outstanding_amount) > 0 }"><Banknote :size="17" /><span>剩余应收<small>不阻断账期关闭</small></span><b>¥{{ money(selected.outstanding_amount) }}</b></article>
          <article><Scale :size="17" /><span>已匹配流水</span><b>{{ matchedCount }}</b></article>
          <article :class="{ warning: differenceCount > 0 }"><CircleAlert :size="17" /><span>对账差异<small>需人工复核</small></span><b>{{ differenceCount }}</b></article>
        </section>

        <section class="reconciliation-progress"><div><span>对账金额</span><b>¥{{ money(reconciliationAmount) }}</b></div><div class="reconciliation-track"><i :style="{ width: periodReconciliations.length ? `${Math.min(100, Math.round(periodReconciliations.filter(item => item.status === 'RECONCILED').length / periodReconciliations.length * 100))}%` : '0%' }"></i></div><span>{{ periodReconciliations.filter(item => item.status === 'RECONCILED').length }} / {{ periodReconciliations.length }} 个对账单已完成</span><button class="quiet" @click="openDialog('reconciliations')">处理收款对账 <ChevronRight :size="13" /></button></section>

        <AppDataTable title="本账期对账单与差异" :columns="columns" :rows="periodReconciliations" :loading="loading" empty-text="当前账期还没有对账单，可通过右上角新建。" compact>
          <template #cell-statement_amount="{ value }">¥{{ money(value) }}</template>
          <template #cell-difference_count="{ value }"><b :class="{ 'danger-text': Number(value) > 0 }">{{ value || 0 }}</b></template>
          <template #cell-status="{ value }"><span :class="['scheme-status', value === 'RECONCILED' ? 'active' : 'warning']">{{ value === 'RECONCILED' ? '已完成' : '待对账' }}</span></template>
          <template #actions><button class="link-btn" @click="openDialog('reconciliations')">处理详情</button></template>
        </AppDataTable>
      </main>

      <main v-else class="finance-closing-main center-empty-stage"><FileCheck2 :size="40" /><h2>尚未建立账期</h2><button class="primary" @click="openDialog('periods')">新建账期</button></main>
    </div>

    <AppDialog :open="dialogOpen" :title="dialogTitle" eyebrow="FINANCE GOVERNANCE" hide-actions dialog-class="subject-records-dialog" @update:open="closeDialog"><div class="embedded-dialog-view receivable-dialog-view"><FinanceGovernanceView :mode="dialogView" embedded /></div></AppDialog>

    <AppDialog v-model:open="closingOpen" :title="selected?.status === 'OPEN' ? '账期关账检查' : '确认反关账'" :saving="operating" :confirm-text="selected?.status === 'OPEN' ? '执行关账' : '确认反关账'" @submit="closePeriod"><div v-if="selected" class="closing-check-body"><div :class="['closing-check-status', selected.status === 'OPEN' ? '' : 'warning']"><CheckCircle2 v-if="selected.status === 'OPEN'" :size="22" /><CircleAlert v-else :size="22" /><div><b>{{ selected.period_code }} · {{ selected.org_name }}</b><span>{{ selected.status === 'OPEN' ? '关账时只阻断未完成的出账流程。' : '反关账后可以重新处理本账期账单。' }}</span></div></div><dl class="scheme-review"><div><dt>账单数量</dt><dd>{{ selected.bill_count || 0 }} 张</dd></div><div><dt>剩余应收</dt><dd>¥{{ money(selected.outstanding_amount) }}</dd></div><div><dt>对账差异</dt><dd>{{ differenceCount }} 条</dd></div><div><dt>当前状态</dt><dd>{{ selected.status }}</dd></div></dl></div></AppDialog>
  </section>
</template>
