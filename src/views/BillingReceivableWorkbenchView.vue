<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Banknote, Boxes, ChevronRight, CircleAlert, ClipboardCheck, FileCheck2, FileClock, Plus, ReceiptText, RefreshCw, Settings2 } from '@lucide/vue'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppSelect from '@/components/app/AppSelect.vue'
import BillingAdjustmentView from '@/views/BillingAdjustmentView.vue'
import BillingBatchView from '@/views/BillingBatchView.vue'
import BillingCollectionView from '@/views/BillingCollectionView.vue'
import BillingView from '@/views/BillingView.vue'
import { billingAdjustments, billingBatches, bills, overdueBills, rootOrgs } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { billStatusLabel } from '@/utils/enumLabels'

type WorkDialog = 'settlement' | 'batches' | 'collections' | 'adjustments'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const orgs = ref<RecordRow[]>([])
const orgId = ref(String(route.query.orgId || ''))
const cycle = ref(String(route.query.billCycle || new Date().toISOString().slice(0, 7)))
const billRows = ref<RecordRow[]>([])
const batchRows = ref<RecordRow[]>([])
const overdueRows = ref<RecordRow[]>([])
const adjustmentRows = ref<RecordRow[]>([])
const dialogOpen = ref(false)
const dialogView = ref<WorkDialog>('settlement')

const draftCount = computed(() => billRows.value.filter((item) => item.bill_status === 'DRAFT').length)
const reviewCount = computed(() => billRows.value.filter((item) => ['REVIEWING', 'REVIEWED'].includes(String(item.bill_status))).length)
const issuedCount = computed(() => billRows.value.filter((item) => item.bill_status === 'ISSUED').length)
const pendingCollectionCount = computed(() => overdueRows.value.length)
const pendingAdjustmentCount = computed(() => adjustmentRows.value.filter((item) => item.status === 'PENDING').length)
const totalAmount = computed(() => billRows.value.reduce((total, item) => total + Number(item.total_amount || 0), 0))
const outstandingAmount = computed(() => billRows.value.reduce((total, item) => total + Number(item.outstanding_amount || 0), 0))
const dialogTitle = computed(() => ({ settlement: '发起结算', batches: '出账批次', collections: '收款与催缴', adjustments: '账单调整审批' })[dialogView.value])
const billColumns: TableColumn[] = [
  { key: 'bill_no', label: '账单编号', width: '17%' },
  { key: 'account_name', label: '结算对象', width: '22%' },
  { key: 'bill_cycle', label: '账期', width: '9%' },
  { key: 'bill_status', label: '出账状态', width: '10%' },
  { key: 'total_amount', label: '应收金额', width: '12%' },
  { key: 'outstanding_amount', label: '待收金额', width: '12%' },
  { key: 'due_date', label: '到期日', width: '10%' },
]
const workQueues = computed(() => [
  { key: 'draft', label: '待生成/草稿', count: draftCount.value, tone: draftCount.value > 0 ? 'attention' : '', action: 'batches' as WorkDialog },
  { key: 'review', label: '待审核发布', count: reviewCount.value, tone: reviewCount.value > 0 ? 'attention' : '', action: 'batches' as WorkDialog },
  { key: 'collection', label: '待收款催缴', count: pendingCollectionCount.value, tone: pendingCollectionCount.value > 0 ? 'warning' : '', action: 'collections' as WorkDialog },
  { key: 'adjust', label: '调整待审批', count: pendingAdjustmentCount.value, tone: pendingAdjustmentCount.value > 0 ? 'warning' : '', action: 'adjustments' as WorkDialog },
])

async function loadSummary() {
  loading.value = true
  error.value = ''
  const params = { pageNum: 1, pageSize: 500, orgId: orgId.value || undefined, billCycle: cycle.value || undefined }
  try {
    const [billResult, batchResult, overdueResult, adjustmentResult] = await Promise.all([bills(params), billingBatches(params), overdueBills(params), billingAdjustments(params)])
    billRows.value = billResult.records
    batchRows.value = batchResult.records
    overdueRows.value = overdueResult.records
    adjustmentRows.value = adjustmentResult.records
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '出账业务摘要读取失败' }
  finally { loading.value = false }
}
async function applyContext() {
  await router.replace({ query: { orgId: orgId.value || undefined, billCycle: cycle.value || undefined } })
  await loadSummary()
}
function openDialog(view: WorkDialog) { dialogView.value = view; dialogOpen.value = true }
async function closeDialog(open: boolean) {
  dialogOpen.value = open
  if (!open) {
    await router.replace({ query: { orgId: orgId.value || undefined, billCycle: cycle.value || undefined } })
    await loadSummary()
  }
}
function handleLegacyEntry() {
  const view = String(route.query.view || '')
  const action = String(route.query.action || '')
  if (view === 'settlement') openDialog('settlement')
  else if (view === 'batches') openDialog('batches')
  else if (view === 'collections' || action === 'collections') openDialog('collections')
  else if (view === 'adjustments' || action === 'adjustments') openDialog('adjustments')
}
function money(value: number) { return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

onMounted(async () => { try { orgs.value = await rootOrgs() } catch { orgs.value = [] } await loadSummary(); handleLegacyEntry() })
watch(() => [route.query.view, route.query.action], handleLegacyEntry)
</script>

<template>
  <section class="view-page receivable-workbench-page">
    <header class="view-head business-module-head"><div><p class="eyebrow">MONTHLY BILLING CENTER</p><h1>月度出账中心</h1></div><button class="primary" @click="openDialog('settlement')"><Plus :size="15" />发起本月结算</button></header>

    <section class="billing-context-bar"><label><span>园区范围</span><AppSelect v-model="orgId" @change="applyContext"><option value="">全部园区</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect></label><label><span>当前账期</span><input v-model="cycle" type="month" @change="applyContext" /></label><button class="quiet" :disabled="loading" @click="loadSummary"><RefreshCw :size="14" />刷新</button><div class="billing-context-summary"><span>本期应收 <b>¥{{ money(totalAmount) }}</b></span><span>剩余应收 <b :class="{ 'danger-text': outstandingAmount > 0 }">¥{{ money(outstandingAmount) }}</b></span></div></section>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <section class="billing-process-bar" aria-label="出账业务阶段">
      <button @click="openDialog('settlement')"><i>1</i><span><b>结算预检</b><small>确认对象、合同、表计、规则</small></span><ChevronRight :size="14" /></button>
      <button :class="{ attention: draftCount > 0 }" @click="openDialog('batches')"><i>2</i><span><b>生成账单</b><small>{{ draftCount }} 张草稿待处理</small></span><ChevronRight :size="14" /></button>
      <button :class="{ attention: reviewCount > 0 }" @click="openDialog('batches')"><i>3</i><span><b>审核发布</b><small>{{ reviewCount }} 张待发布</small></span><ChevronRight :size="14" /></button>
      <button :class="{ complete: issuedCount > 0 }"><i>4</i><span><b>形成应收</b><small>{{ issuedCount }} 张已发布</small></span><ChevronRight :size="14" /></button>
      <button :class="{ warning: pendingCollectionCount > 0 }" @click="openDialog('collections')"><i>5</i><span><b>收款跟进</b><small>{{ pendingCollectionCount }} 张逾期待办</small></span></button>
    </section>

    <section class="receivable-main-layout">
      <main class="receivable-bill-main">
        <section class="billing-work-queue" aria-label="本期工作队列">
          <button v-for="item in workQueues" :key="item.key" type="button" :class="item.tone" @click="openDialog(item.action)">
            <span>{{ item.label }}</span>
            <b>{{ item.count }}</b>
          </button>
        </section>
        <AppDataTable title="本期账单清单" :columns="billColumns" :rows="billRows" :loading="loading" empty-text="当前园区和账期还没有账单，可先发起本月结算。" compact>
          <template #cell-bill_status="{ value }"><span :class="['scheme-status', value === 'ISSUED' ? 'active' : value === 'DRAFT' ? 'ready' : 'warning']">{{ billStatusLabel(value) }}</span></template>
          <template #cell-total_amount="{ value }">¥{{ money(Number(value || 0)) }}</template>
          <template #cell-outstanding_amount="{ value }"><b :class="{ 'danger-text': Number(value) > 0 }">¥{{ money(Number(value || 0)) }}</b></template>
          <template #toolbar><button class="quiet" :disabled="loading" @click="loadSummary"><RefreshCw :size="14" />刷新账单</button></template>
          <template #actions="{ row }"><button class="link-btn" @click="openDialog(String(row.bill_status) === 'ISSUED' ? 'collections' : 'batches')">处理</button></template>
        </AppDataTable>
      </main>
      <aside class="receivable-action-rail">
        <article><header><ClipboardCheck :size="17" /><b>业务主线</b></header><p>本页只处理本月账单闭环，底层批次、催缴和调整都放进弹窗。</p><button class="quiet" @click="openDialog('settlement')">运行预检查 <ChevronRight :size="13" /></button></article>
        <article><header><Boxes :size="17" /><b>出账批次</b><i :class="{ active: batchRows.length > 0 }">{{ batchRows.length }}</i></header><p>批量生成、审核和发布本账期账单。</p><button class="quiet" @click="openDialog('batches')">管理批次 <ChevronRight :size="13" /></button></article>
        <article :class="{ warning: pendingCollectionCount > 0 }"><header><Banknote :size="17" /><b>收款与催缴</b><i>{{ pendingCollectionCount }}</i></header><p>优先处理逾期且仍有剩余应收的账单。</p><button class="quiet" @click="openDialog('collections')">进入处理 <ChevronRight :size="13" /></button></article>
        <article :class="{ warning: pendingAdjustmentCount > 0 }"><header><Settings2 :size="17" /><b>调整审批</b><i>{{ pendingAdjustmentCount }}</i></header><p>减免、补收和坏账核销全部保留审批留痕。</p><button class="quiet" @click="openDialog('adjustments')">查看调整单 <ChevronRight :size="13" /></button></article>
        <article v-if="error" class="warning"><header><CircleAlert :size="17" /><b>业务提示</b></header><p>{{ error }}</p></article>
      </aside>
    </section>

    <AppDialog :open="dialogOpen" :title="dialogTitle" eyebrow="BILLING WORKFLOW" hide-actions dialog-class="subject-records-dialog" @update:open="closeDialog">
      <div class="embedded-dialog-view receivable-dialog-view">
        <BillingView v-if="dialogView === 'settlement'" mode="settlement" embedded />
        <BillingBatchView v-else-if="dialogView === 'batches'" embedded />
        <BillingCollectionView v-else-if="dialogView === 'collections'" embedded />
        <BillingAdjustmentView v-else embedded />
      </div>
    </AppDialog>
  </section>
</template>
