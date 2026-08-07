<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Banknote, Check, CheckCircle2, ChevronRight, CircleAlert, FileClock, ReceiptText, RotateCw, Settings2, ShieldCheck, WalletCards } from '@lucide/vue'
import AppDialog from '@/components/app/AppDialog.vue'
import { experienceRevenue, experienceRevenuePrecheck, generateBill } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const payload = ref<RecordRow>({})
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const cycle = ref(String(route.query.billCycle || new Date().toISOString().slice(0, 7)))
const activeTab = ref<'bills' | 'follow' | 'changes'>('bills')
const checking = ref(false)
const precheck = ref<RecordRow | null>(null)
const generateDialog = ref(false)
const generating = ref(false)
const generatedBill = ref<RecordRow | null>(null)

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

async function load(accountId?: unknown) {
  loading.value = true
  error.value = ''
  try {
    payload.value = await experienceRevenue({ accountId: accountId || route.query.accountId || undefined, billCycle: cycle.value || undefined })
  } catch (e) { error.value = e instanceof Error ? e.message : '经营结算上下文读取失败' }
  finally { loading.value = false }
}
async function selectAccount(id: unknown) {
  precheck.value = null
  generatedBill.value = null
  await router.replace({ path: '/center/revenue', query: { accountId: String(id), billCycle: cycle.value } })
  await load(id)
}
async function changeCycle() {
  precheck.value = null
  generatedBill.value = null
  await router.replace({ path: '/center/revenue', query: { accountId: selected.value.id ? String(selected.value.id) : undefined, billCycle: cycle.value } })
  await load(selected.value.id)
}
async function runPrecheck() {
  if (!selected.value.id || !cycle.value) return
  checking.value = true
  error.value = ''
  try { generatedBill.value = null; precheck.value = await experienceRevenuePrecheck({ accountId: selected.value.id, billCycle: cycle.value }) }
  catch (e) { error.value = e instanceof Error ? e.message : '账期预检查失败' }
  finally { checking.value = false }
}
async function createDraftBill() {
  if (!precheck.value?.ready) return
  generating.value = true
  error.value = ''
  try {
    generatedBill.value = await generateBill({
      accountId: Number(selected.value.id), billCycle: cycle.value,
      startDate: String(precheck.value.startDate), endDate: String(precheck.value.endDate),
    })
    generateDialog.value = false
    precheck.value = null
    activeTab.value = 'bills'
    await load(selected.value.id)
  } catch (e) { error.value = e instanceof Error ? e.message : '草稿账单生成失败' }
  finally { generating.value = false }
}
function go(path: string, query: Record<string, unknown> = {}) { void router.push({ path, query: query as any }) }
function money(value: unknown) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function billStatus(item: RecordRow) { if (Number(item.overdue)) return '已逾期'; return ({ 0: '未缴', 1: '已缴', 2: '逾期', 3: '作废', 4: '部分缴费' } as Record<number, string>)[Number(item.payStatus)] || String(item.billStatus || '未知') }

onMounted(() => load(route.query.accountId))
</script>

<template>
  <section class="view-page business-center-page" :class="{ loading }">
    <header class="center-titlebar">
      <div><p class="eyebrow">REVENUE & SETTLEMENT CENTER</p><h1>经营结算中心</h1><p>以计费账户为主线，把租户、合同、表计、规则、质量、账单和催缴组合成一条经营闭环。</p></div>
      <div class="center-summary-strip"><span><b>{{ summary.accountCount || 0 }}</b>计费账户</span><span><b>{{ summary.billCount || 0 }}</b>本期账单</span><span class="warn"><b>{{ summary.outstandingCount || 0 }}</b>待收</span><span class="danger"><b>¥{{ money(summary.outstandingAmount) }}</b>剩余应收</span></div>
    </header>
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

      <main v-if="selected.id" class="object-stage">
        <header class="object-identity revenue-identity">
          <div class="object-icon"><WalletCards :size="25" /></div><div><div class="identity-line"><h2>{{ selected.tenantName || selected.accountName }}</h2><span :class="['health-pill', canSettle ? '' : 'warn']">{{ canSettle ? '可以结算' : '结算前需补齐' }}</span></div><p>{{ selected.contractName || '尚未绑定合同' }} · {{ selected.contactName || '未填联系人' }} {{ selected.contactPhone || '' }}</p></div>
          <label class="cycle-switch"><span>当前账期</span><input v-model="cycle" type="month" @change="changeCycle" /></label>
        </header>

        <div v-if="generatedBill" class="generated-bill-banner"><CheckCircle2 :size="22" /><div><b>本期草稿账单已生成</b><span>{{ generatedBill.bill_no || generatedBill.billNo }} · ¥{{ money(generatedBill.total_amount ?? generatedBill.totalAmount) }} · 等待后续审核发布</span></div><button class="quiet" @click="go('/billing/bills', { accountId: selected.id, billCycle: cycle })">查看账单</button></div>

        <section class="settlement-readiness">
          <div v-for="(step, index) in readinessSteps" :key="step.label" :class="['readiness-step', { ok: step.ok }]">
            <i><Check v-if="step.ok" :size="14" /><span v-else>{{ index + 1 }}</span></i><div><b>{{ step.label }}</b><small>{{ step.hint }}</small></div><ChevronRight v-if="index < readinessSteps.length - 1" class="step-arrow" :size="15" />
          </div>
        </section>

        <div v-if="!canSettle" class="readiness-message"><CircleAlert :size="18" /><div><b>本账户暂不建议直接出账</b><span>缺失的合同、结算表计、计费规则或采集质量已在上方标出；补齐后再试算，可减少出账失败和人工调整。</span></div><button class="quiet" @click="activeTab = 'changes'">检查配置</button></div>

        <section v-if="capabilities.generateBill && !generatedBill" class="settlement-precheck">
          <header><div><p class="eyebrow">BILLING PRECHECK</p><h3>本期结算预检查</h3><span>使用正式账单服务验证整个账期，不只检查当前页面摘要。</span></div><button class="quiet" :disabled="checking" @click="runPrecheck"><RotateCw :size="14" />{{ checking ? '正在检查…' : precheck ? '重新检查' : '运行预检查' }}</button></header>
          <div v-if="!precheck" class="precheck-empty"><ShieldCheck :size="25" /><div><b>生成账单前先运行一次预检查</b><span>系统会检查重复出账、规则、价格、结算表计、合同区间、采集质量和实际可计费用量。</span></div></div>
          <template v-else>
            <div :class="['precheck-result-head', { ready: precheck.ready }]">
              <ShieldCheck v-if="precheck.ready" :size="22" /><CircleAlert v-else :size="22" />
              <div><b>{{ precheck.ready ? '预检查通过，可以进入出账' : `发现 ${precheck.blockerCount || 0} 个阻断项` }}</b><span>{{ precheck.warningCount || 0 }} 个风险提示 · {{ precheckPassed.length }} 项检查通过</span></div>
              <strong v-if="precheck.ready">¥ {{ money(precheckPreview.totalAmount) }}<small>{{ precheckPreview.detailCount || 0 }} 条明细</small></strong>
            </div>
            <div v-if="precheckIssues.length" class="precheck-issue-list"><article v-for="issue in precheckIssues" :key="String(issue.code)" :class="String(issue.severity).toLowerCase()"><i>{{ issue.severity === 'BLOCKER' ? '阻断' : '提示' }}</i><div><b>{{ issue.title }}</b><span>{{ issue.detail }}</span></div><button v-if="issue.actionPath" @click="go(String(issue.actionPath), { accountId: selected.id, billCycle: cycle })">去处理 <ChevronRight :size="13" /></button></article></div>
            <div v-if="precheckPassed.length" class="precheck-passed"><span v-for="item in precheckPassed" :key="String(item.title)"><Check :size="12" /><b>{{ item.title }}</b>{{ item.detail }}</span></div>
          </template>
        </section>

        <section class="revenue-actionbar"><div><span>账期 {{ cycle }}</span><strong>¥ {{ money(generatedBill ? (generatedBill.total_amount ?? generatedBill.totalAmount) : precheck?.ready ? precheckPreview.totalAmount : summary.outstandingAmount) }}</strong><small>{{ generatedBill ? '本期草稿账单' : precheck?.ready ? '本期试算应收' : '当前账户剩余应收' }}</small></div><button v-if="capabilities.generateBill && !generatedBill && !precheck?.ready" class="primary" :disabled="checking" @click="runPrecheck"><ShieldCheck :size="16" />{{ checking ? '正在预检查…' : '先检查本期' }}</button><button v-else-if="capabilities.generateBill && !generatedBill" class="primary" @click="generateDialog = true"><ReceiptText :size="16" />确认生成草稿</button><button v-if="capabilities.generateBill && precheck?.ready && !generatedBill" class="quiet" @click="go('/billing/settlement', { accountId: selected.id, billCycle: cycle })">查看完整试算</button><button v-if="capabilities.viewBills" class="quiet" @click="go('/billing/bills', { accountId: selected.id, billCycle: cycle })">查看账单明细</button></section>

        <nav class="center-tabs"><button :class="{ active: activeTab === 'bills' }" @click="activeTab = 'bills'">本期账单 <i>{{ bills.length }}</i></button><button :class="{ active: activeTab === 'follow' }" @click="activeTab = 'follow'">收款与跟进 <i>{{ collections.length }}</i></button><button :class="{ active: activeTab === 'changes' }" @click="activeTab = 'changes'">规则、表计与变更</button></nav>

        <div v-if="activeTab === 'bills'" class="center-panel-grid revenue-panels">
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">BILLS</p><h3>{{ cycle }} 账单</h3></div><ReceiptText :size="19" /></div><div v-if="bills.length" class="bill-card-list"><button v-for="item in bills" :key="String(item.id)" @click="go('/billing/bills', { billCycle: item.billCycle })"><span><b>{{ item.billNo }}</b><small>{{ item.billStatus }} · 截止 {{ item.dueDate || '未设' }}</small></span><span class="bill-money"><strong>¥{{ money(item.outstandingAmount) }}</strong><em :class="{ overdue: Number(item.overdue) }">{{ billStatus(item) }}</em></span></button></div><p v-else class="center-empty">本账期还没有账单，可在试算确认后生成。</p></article>
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">BATCH</p><h3>出账批次进度</h3></div><FileClock :size="19" /></div><div v-if="batches.length" class="compact-feed"><div v-for="item in batches" :key="String(item.id)"><i></i><span><b>{{ item.batchName }}</b><small>{{ item.generatedCount || 0 }}/{{ item.accountTotal || 0 }} 个账户 · 失败 {{ item.failedCount || 0 }}</small></span><em>{{ item.status }}</em></div></div><p v-else class="center-empty">当前园区在该账期没有出账批次。</p><button v-if="capabilities.viewBatches" class="inline-action" @click="go('/billing/batches', { billCycle: cycle })">管理出账批次 <ChevronRight :size="14" /></button></article>
        </div>

        <div v-else-if="activeTab === 'follow'" class="center-panel-grid revenue-panels">
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">COLLECTION</p><h3>最近跟进记录</h3></div><Banknote :size="19" /></div><div v-if="collections.length" class="business-feed"><button v-for="item in collections" :key="String(item.id)" @click="go('/billing/collections')"><span class="feed-level">{{ item.collectionType }}</span><div><b>{{ item.billNo }} · {{ item.result || '已记录跟进' }}</b><small>{{ item.collectionTime }} · {{ item.operator }}</small></div><ChevronRight :size="14" /></button></div><p v-else class="center-empty">当前账户暂无催缴跟进记录。</p><button v-if="capabilities.viewCollections" class="inline-action" @click="go('/billing/collections')">进入收款跟进 <ChevronRight :size="14" /></button></article>
          <article v-if="capabilities.viewAdjustments" class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">ADJUSTMENTS</p><h3>账单调整</h3></div><Settings2 :size="19" /></div><div v-if="adjustments.length" class="compact-feed"><div v-for="item in adjustments" :key="String(item.id)"><i></i><span><b>{{ item.adjustmentNo }} · {{ item.reason }}</b><small>{{ item.billNo }} · {{ item.createdBy }}</small></span><em>¥{{ money(item.adjustmentAmount) }} / {{ item.status }}</em></div></div><p v-else class="center-empty">当前账户暂无账单调整单。</p><button class="inline-action" @click="go('/billing/adjustments')">查看调整审批 <ChevronRight :size="14" /></button></article>
        </div>

        <div v-else class="center-panel-grid revenue-panels">
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">RULES</p><h3>计费规则</h3></div><Settings2 :size="19" /></div><div v-if="rules.length" class="compact-feed"><div v-for="item in rules" :key="String(item.id)"><i :class="{ off: !Number(item.enabled) }"></i><span><b>{{ item.ruleName }}</b><small>{{ item.deviceTypeName }} · {{ item.metricPointCode }}</small></span><em>{{ item.priceMode }}</em></div></div><p v-else class="center-empty">尚未为当前账户配置计费规则。</p><button class="inline-action" @click="go('/billing/rules')">维护计费规则 <ChevronRight :size="14" /></button></article>
          <article class="context-panel"><div class="context-panel-head"><div><p class="eyebrow">SETTLEMENT METERS</p><h3>结算表计与质量</h3></div><WalletCards :size="19" /></div><div v-if="meters.length" class="compact-feed"><div v-for="item in meters" :key="String(item.id)"><i :class="{ off: item.qualityStatus !== 'NORMAL' }"></i><span><b>{{ item.deviceName }}</b><small>{{ item.deviceSn }} · 完整率 {{ item.completeRate == null ? '--' : `${item.completeRate}%` }}</small></span><em>{{ item.qualityStatus || '待统计' }}</em></div></div><p v-else class="center-empty">当前结算模型还没有匹配到可计费表计。</p><button v-if="capabilities.viewContracts && readiness.settlementModel === 'CONTRACT'" class="inline-action" @click="go('/billing/contracts')">维护合同与表计 <ChevronRight :size="14" /></button><button v-else class="inline-action" @click="go('/billing/rule-scopes')">维护计费范围 <ChevronRight :size="14" /></button></article>
          <article v-if="capabilities.viewMetering" class="context-panel full-panel"><div class="context-panel-head"><div><p class="eyebrow">METER CHANGES</p><h3>计量变更与人工抄表</h3></div><FileClock :size="19" /></div><div v-if="meteringOrders.length" class="compact-feed horizontal"><div v-for="item in meteringOrders" :key="String(item.id)"><i></i><span><b>{{ item.changeNo }} · {{ item.changeType }}</b><small>{{ item.reason }} · {{ item.effectiveTime }}</small></span><em>{{ item.status }}</em></div></div><p v-else class="center-empty">没有待处理的计量变更。</p><button class="inline-action" @click="go('/billing/metering')">处理计量变更 <ChevronRight :size="14" /></button></article>
        </div>
      </main>
      <main v-else class="object-stage center-empty-stage"><WalletCards :size="40" /><h2>尚无计费账户</h2><p>先建立租户与合同，再绑定结算表计和计费规则。</p><button class="quiet" @click="go('/billing/accounts')">配置计费账户</button></main>
    </div>
    <AppDialog v-model:open="generateDialog" title="确认生成草稿账单" description="生成后会进入审核与发布流程；本操作不会直接发布账单或登记收款。" :saving="generating" confirm-text="确认生成草稿" @submit="createDraftBill"><div class="bill-confirm-card"><span>{{ selected.tenantName || selected.accountName }}</span><b>{{ cycle }} 账期</b><strong>¥ {{ money(precheckPreview.totalAmount) }}</strong><small>{{ precheckPreview.detailCount || 0 }} 条计费明细 · 已通过正式试算</small></div><p class="tip">系统会在提交时再次执行后端计费规则与重复出账校验，避免预检查后数据变化造成重复账单。</p></AppDialog>
  </section>
</template>
