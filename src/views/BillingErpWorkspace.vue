<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { AlertTriangle, Check, ChevronRight, CircleAlert, ClipboardCheck, Eye, FileCheck2, Layers3, QrCode, ReceiptText, RefreshCw, Search, ShieldCheck } from '@lucide/vue'
import { FunnelChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppSelect from '@/components/app/AppSelect.vue'
import contractStampUrl from '@/assets/contract-stamp.png'
import { billingAutoSchedules, billingBatchAction, billPreview, contractAction, contracts, createResource, deleteBillingAutoSchedule, generateBill, listResource, billingErp, billingErpPeriod, billingErpSubject, billingPeriodAction, payBill, rootOrgs, runBillingAutoSchedule, saveBillingAutoSchedule, saveContract, tariffPlans, saveTariffPlan, updateBillRemark, billingStatements, importBillingStatements, billingStatement, billingStatementCandidates, matchBillingStatement, markBillingStatementDifference, createBillingVoucher, exportBillingVoucher } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { showAppAlert } from '@/composables/useAppAlert'

use([LineChart, PieChart, FunnelChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

type Stage = 'overview' | 'admission' | 'schemes' | 'jobs' | 'closing'
type ReportType = 'receivable' | 'collection' | 'aging' | 'bill' | 'subject'
type JobFocus = 'issue' | 'collection' | 'audit'

const props = defineProps<{ stage: Stage }>()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const loading = ref(false)
const error = ref('')
const orgs = ref<RecordRow[]>([])
const orgId = ref('')
const keyword = ref('')
const billStatusFilter = ref('')
const columnConfigOpen = ref(false)
const notificationOpen = ref(false)
const scheduleOpen = ref(false)
const scheduleFormOpen = ref(false)
const scheduleLoading = ref(false)
const schedules = ref<RecordRow[]>([])
const scheduleContracts = ref<RecordRow[]>([])
const scheduleForm = reactive({ id: '', scheduleName: '', orgId: '', contractIds: [] as string[], executeDay: 1, executeTime: '02:00', paymentTermDays: 15, enabled: true, remark: '' })
const editingRemarkKey = ref('')
const remarkDraft = ref('')
const notifications = ref<Array<{ id: string; type: 'success' | 'warning' | 'error'; title: string; detail: string; time: string; read: boolean }>>([])
const financeDrawerOpen = ref(false)
const financeDrawerTab = ref<'statements' | 'vouchers'>('statements')
const financeStatements = ref<RecordRow[]>([])
const financeStatementLoading = ref(false)
const financeStatement = ref<RecordRow>({})
const financeCandidates = ref<RecordRow[]>([])
const financeMatchAmount = ref('')
const financeImportText = ref('')
const financeImportError = ref('')
const financeDifferenceReason = ref('')
const financeImporting = ref(false)
const voucherResult = ref<RecordRow>({})
const voucherLines = computed<RecordRow[]>(() => Array.isArray(voucherResult.value.lines) ? voucherResult.value.lines as RecordRow[] : [])
const billCycle = ref(new Date().toISOString().slice(0, 7))
const payload = ref<RecordRow>({})
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<RecordRow>({})
const reportOpen = ref(false)
const reportType = ref<ReportType>('receivable')
const operationOpen = ref(false)
const operationRow = ref<RecordRow>({})
const processingRow = ref('')
const accounts = ref<RecordRow[]>([])
const devices = ref<RecordRow[]>([])
const deviceTypes = ref<RecordRow[]>([])
const tariffs = ref<RecordRow[]>([])
const tenants = ref<RecordRow[]>([])
const spaces = ref<RecordRow[]>([])
const preview = ref<RecordRow | null>(null)
const schemeStep = ref(1)
const admissionForm = reactive({
  tenantMode: 'existing',
  tenantId: '',
  tenantCode: '',
  tenantName: '',
  tenantType: 'ENTERPRISE',
  creditCode: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  billingAddress: '',
  contractNo: '',
  contractName: '',
  orgId: '',
  startDate: '',
  endDate: '',
  settlementDay: 1,
  depositAmount: '0',
  spaceIds: [] as string[],
  meterIds: [] as string[],
})
const schemeForm = reactive({ accountId: '', ruleName: '', scopeType: 'DEVICE', scopeId: '', deviceTypeId: '', metricPointCodes: [] as string[], priceMode: 'UNIT_PRICE', unitPrice: '', tariffPlanId: '', templateId: '' })
const schemePoints = ref<RecordRow[]>([])
const meterTemplates = ref<RecordRow[]>([])
const templateFormOpen = ref(false)
const templateForm = reactive({ templateName: '', description: '', allPoints: true })
const tariffFormOpen = ref(false)
const tariffForm = reactive({ planName: '', planCode: '', version: 1, remark: '' })
const collectionForm = reactive({ payAmount: '', payWay: '转账', transactionNo: '', remark: '' })
const selectedJobKey = ref('')
const selectedJobDetailLoading = ref(false)
const selectedJobDetail = ref<RecordRow>({})
const paymentSucceeded = ref(false)
const receiptOpen = ref(false)
const jobFocus = ref<JobFocus>('issue')
const expandedBillKey = ref('')
const billDetailTab = ref<'overview' | 'energy' | 'collection' | 'audit'>('overview')
const billColumnOptions = [
  { key: 'tenant', label: '租户名称', core: true },
  { key: 'cycle', label: '结算周期', core: true },
  { key: 'total', label: '总金额', core: true },
  { key: 'outstanding', label: '应收金额', core: true },
  { key: 'status', label: '结算状态', core: true },
  { key: 'created', label: '生成时间', core: true },
  { key: 'org', label: '园区', core: false },
  { key: 'paid', label: '已收金额', core: false },
  { key: 'due', label: '付款截止日', core: false },
  { key: 'remark', label: '备注', core: false },
]
const visibleBillColumnKeys = ref<string[]>(billColumnOptions.filter((item) => item.core).map((item) => item.key))
const unreadNotifications = computed(() => notifications.value.filter((item) => !item.read).length)
const overviewTrendEl = ref<HTMLElement | null>(null)
const overviewStatusEl = ref<HTMLElement | null>(null)
const overviewFunnelEl = ref<HTMLElement | null>(null)
const periodTrendEl = ref<HTMLElement | null>(null)
const charts = new Map<string, ECharts>()
watch(() => schemeForm.deviceTypeId, () => { schemeForm.metricPointCodes = []; void loadSchemePoints() })

const stageOrder: Array<{ key: Stage; label: string; path: string }> = [
  { key: 'overview', label: '业务总览', path: '/billing/overview' },
  { key: 'admission', label: '对象准入', path: '/billing/admission' },
  { key: 'schemes', label: '方案配置', path: '/billing/schemes' },
  { key: 'jobs', label: '出账收款', path: '/billing/jobs' },
  { key: 'closing', label: '关账归档', path: '/billing/closing' },
]
const stageMeta = computed(() => ({
  overview: { eyebrow: 'FINANCE REPORT CENTER', title: '业务总览', subtitle: '只读查询、报表汇总和业务穿透，不在总览页办理业务。' },
  admission: { eyebrow: 'SUBJECT ADMISSION', title: '对象准入', subtitle: '完成租户、合同、空间、表计、账户五项准入，形成可结算对象。' },
  schemes: { eyebrow: 'PRICING SCHEME', title: '方案配置', subtitle: '围绕对象配置计量来源、计价模型、生效范围和价格参数。' },
  jobs: { eyebrow: 'BILLING & COLLECTION', title: '出账收款', subtitle: '按账期完成预检、草稿账单、审核发布、应收形成和收款登记。' },
  closing: { eyebrow: 'PERIOD CLOSING', title: '关账归档', subtitle: '核对账单、收款、调整与差异，完成正式月结归档。' },
})[props.stage])
const currentIndex = computed(() => stageOrder.findIndex((item) => item.key === props.stage))
const nextStage = computed(() => stageOrder[currentIndex.value + 1])
const rows = computed<RecordRow[]>(() => Array.isArray(payload.value.rows) ? payload.value.rows as RecordRow[] : [])
const queues = computed<RecordRow[]>(() => Array.isArray(payload.value.queues) ? payload.value.queues as RecordRow[] : [])
const stages = computed<RecordRow[]>(() => Array.isArray(payload.value.stages) ? payload.value.stages as RecordRow[] : [])
const todos = computed<RecordRow[]>(() => Array.isArray(payload.value.todos) ? payload.value.todos as RecordRow[] : [])
const periods = computed<RecordRow[]>(() => Array.isArray(payload.value.periods) ? payload.value.periods as RecordRow[] : [])
const riskSubjects = computed<RecordRow[]>(() => Array.isArray(payload.value.riskSubjects) ? payload.value.riskSubjects as RecordRow[] : [])
const subjects = computed<RecordRow[]>(() => Array.isArray(payload.value.subjects) ? payload.value.subjects as RecordRow[] : [])
const summary = computed<RecordRow>(() => payload.value.summary as RecordRow || {})
const jobSummary = computed<RecordRow>(() => payload.value.jobSummary as RecordRow || {})
const detailSubject = computed<RecordRow>(() => detail.value.subject as RecordRow || {})
const detailPeriod = computed<RecordRow>(() => detail.value.period as RecordRow || {})
const detailChecks = computed<RecordRow[]>(() => Array.isArray(detail.value.checks) ? detail.value.checks as RecordRow[] : [])
const detailRules = computed<RecordRow[]>(() => Array.isArray(detail.value.rules) ? detail.value.rules as RecordRow[] : [])
const detailMeters = computed<RecordRow[]>(() => Array.isArray(detail.value.meters) ? detail.value.meters as RecordRow[] : [])
const detailBills = computed<RecordRow[]>(() => Array.isArray(detail.value.bills) ? detail.value.bills as RecordRow[] : [])
const detailEvents = computed<RecordRow[]>(() => Array.isArray(detail.value.events) ? detail.value.events as RecordRow[] : [])
const detailReconciliations = computed<RecordRow[]>(() => Array.isArray(detail.value.reconciliations) ? detail.value.reconciliations as RecordRow[] : [])
const detailCollections = computed<RecordRow[]>(() => Array.isArray(detail.value.collections) ? detail.value.collections as RecordRow[] : [])
const detailAdjustments = computed<RecordRow[]>(() => Array.isArray(detail.value.adjustments) ? detail.value.adjustments as RecordRow[] : [])
const suggestedAction = computed<RecordRow>(() => detail.value.suggestedAction as RecordRow || {})
const recentEvents = computed<RecordRow[]>(() => Array.isArray(payload.value.recentEvents) ? payload.value.recentEvents as RecordRow[] : [])
const collectionRows = computed(() => rows.value.filter((row) => row.jobStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0))
const selectedJobRow = computed<RecordRow>(() => {
  const key = String(selectedJobKey.value || '')
  const matched = rows.value.find((row) => String(row.billId || row.id || row.accountId || row.periodId || '') === key)
  return matched || collectionRows.value[0] || rows.value.find((row) => row.billId) || {}
})
const selectedCollectionRow = computed(() => selectedJobRow.value)
const collectionBillStatus = computed(() => {
  const row = selectedCollectionRow.value
  if (!row.billId) return '未选择账单'
  if (Number(row.outstandingAmount || 0) <= 0) return '已支付'
  if (Number(row.paidAmount || 0) > 0) return '部分支付'
  return statusText(row.jobStatus)
})
const overviewMetrics = computed(() => [
  { label: '已准入对象数', value: summary.value.admissionReady || 0, hint: `${summary.value.subjectCount || 0} 个对象` },
  { label: '已配置方案数', value: summary.value.schemeReady || 0, hint: '可参与出账试算' },
  { label: '本期应出账金额', value: `¥${money(summary.value.outstandingAmount)}`, hint: summary.value.cycle || billCycle.value },
  { label: '本期已收金额', value: `¥${money(summary.value.paidAmount)}`, hint: '收款记录回写' },
  { label: '未关账账期数', value: summary.value.openPeriods || 0, hint: `${summary.value.closeablePeriods || 0} 个可关账` },
  { label: '异常对象数', value: Number(summary.value.blockedSubjects || 0) + Number(summary.value.differenceCount || 0), hint: '阻断对象与差异' },
])

const objectColumns: TableColumn[] = [
  { key: 'subjectName', label: '结算对象', width: '22%' },
  { key: 'orgName', label: '园区', width: '14%' },
  { key: 'admissionStatus', label: '准入', width: '10%' },
  { key: 'schemeStatus', label: '方案', width: '10%' },
  { key: 'jobStatus', label: '账务状态', width: '12%' },
  { key: 'readinessScore', label: '完整度', width: '9%' },
  { key: 'outstandingAmount', label: '未收金额', width: '12%' },
]
const closingColumns: TableColumn[] = [
  { key: 'periodCode', label: '账期', width: '12%' },
  { key: 'orgName', label: '园区', width: '20%' },
  { key: 'closingStatus', label: '关账状态', width: '12%' },
  { key: 'billCount', label: '账单数', width: '9%' },
  { key: 'issuedAmount', label: '已发布金额', width: '13%' },
  { key: 'outstandingAmount', label: '未收金额', width: '13%' },
  { key: 'differenceCount', label: '差异数', width: '8%' },
]
const selectedJobSubject = computed<RecordRow>(() => selectedJobDetail.value.subject as RecordRow || {})
const selectedJobBills = computed<RecordRow[]>(() => Array.isArray(selectedJobDetail.value.bills) ? selectedJobDetail.value.bills as RecordRow[] : [])
const selectedJobCollections = computed<RecordRow[]>(() => Array.isArray(selectedJobDetail.value.collections) ? selectedJobDetail.value.collections as RecordRow[] : [])
const selectedJobAdjustments = computed<RecordRow[]>(() => Array.isArray(selectedJobDetail.value.adjustments) ? selectedJobDetail.value.adjustments as RecordRow[] : [])
const selectedJobEvents = computed<RecordRow[]>(() => Array.isArray(selectedJobDetail.value.events) ? selectedJobDetail.value.events as RecordRow[] : [])
const tableColumns = computed(() => props.stage === 'closing' ? closingColumns : objectColumns)
const jobsRows = computed(() => rows.value.filter((row) => row.jobStatus || row.billId || row.batchId))
const billRows = computed<RecordRow[]>(() => Array.isArray(payload.value.billRows) ? payload.value.billRows as RecordRow[] : [])
const focusedBillRows = computed(() => {
  let source = jobFocus.value === 'collection'
    ? billRows.value.filter((row) => row.billStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0)
    : jobFocus.value === 'audit' ? billRows.value : billRows.value.filter((row) => ['DRAFT', 'REVIEWED'].includes(String(row.billStatus)))
  if (billStatusFilter.value) source = source.filter((row) => String(row.settlementStatus) === billStatusFilter.value)
  return source
})
const billSummary = computed(() => ({
  pendingReview: billRows.value.filter((row) => ['DRAFT', 'REVIEWED'].includes(String(row.billStatus))).length,
  pendingCollection: billRows.value.filter((row) => row.billStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0).reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0),
  arrears: billRows.value.filter((row) => String(row.settlementStatus) === 'OVERDUE').reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0),
}))
const focusedJobsRows = computed(() => {
  if (jobFocus.value === 'collection') return jobsRows.value.filter((row) => row.jobStatus === 'ISSUED')
  if (jobFocus.value === 'audit') return jobsRows.value.filter((row) => row.billId || row.jobStatus === 'ISSUED')
  return jobsRows.value.filter((row) => ['READY', 'DRAFT', 'REVIEWING'].includes(String(row.jobStatus)))
})
const jobFocusTabs = computed(() => [
  { key: 'issue' as JobFocus, label: '待审核账单', count: billSummary.value.pendingReview },
  { key: 'collection' as JobFocus, label: '待收款账单', count: billRows.value.filter((row) => row.billStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0).length },
  { key: 'audit' as JobFocus, label: '全部账单与留痕', count: billRows.value.length },
])
const jobSummaryRows = computed(() => [
  { label: '可生成', value: jobSummary.value.ready || 0, hint: '满足试算和预检' },
  { label: '待审核', value: Number(jobSummary.value.draft || 0) + Number(jobSummary.value.reviewing || 0), hint: '需要发布确认' },
  { label: '已发布', value: jobSummary.value.issued || 0, hint: '已形成应收' },
  { label: '待收金额', value: `¥${money(jobSummary.value.outstanding)}`, hint: '需要登记收款' },
])
const stageActionIcon = computed(() => ({
  admission: ClipboardCheck,
  schemes: Layers3,
  jobs: ReceiptText,
  closing: FileCheck2,
} as Record<string, typeof Check>)[props.stage] || ChevronRight)
const flowSteps = computed(() => {
  if (props.stage === 'admission') return [
    { label: '租户档案', field: 'tenantName' }, { label: '合同生效', field: 'contractStatus', expect: 'ACTIVE' },
    { label: '空间绑定', field: 'spaceCount' }, { label: '表计绑定', field: 'meterCount' }, { label: '账户启用', field: 'accountStatus', expect: 1 },
  ]
  if (props.stage === 'schemes') return [
    { label: '计费对象', field: 'accountId' }, { label: '计量来源', field: 'meterCount' },
    { label: '计费规则', field: 'activeRuleCount' }, { label: '价格参数', field: 'pricedRuleCount' }, { label: '方案启用', field: 'schemeStatus', expect: 'ACTIVE' },
  ]
  if (props.stage === 'jobs') return [
    { label: '选择账期', fixed: true }, { label: '出账预检', field: 'schemeStatus', expect: 'ACTIVE' },
    { label: '生成草稿', field: 'billCount' }, { label: '审核发布', field: 'jobStatus', expect: 'ISSUED' }, { label: '收款登记', field: 'outstandingAmount', zero: true },
  ]
  return [
    { label: '账期建立', field: 'periodId' }, { label: '账单发布', field: 'closingStatus', values: ['CLOSEABLE', 'CLOSED'] },
    { label: '应收核对', field: 'outstandingAmount', zero: true }, { label: '差异处理', field: 'differenceCount', zero: true }, { label: '关账归档', field: 'closingStatus', expect: 'CLOSED' },
  ]
})
const reportRows = computed(() => props.stage === 'overview' ? (subjects.value.length ? subjects.value : riskSubjects.value).slice(0, 12) : rows.value.slice(0, 12))
const reportAmountTotal = computed(() => reportRows.value.reduce((sum, row) => sum + Number(row.outstandingAmount || row.issuedAmount || row.totalAmount || 0), 0))
const reportObjectTotal = computed(() => props.stage === 'overview' ? Number(summary.value.subjectCount || reportRows.value.length) : reportRows.value.length)
const reportTitle = computed(() => ({
  receivable: '应收汇总表',
  collection: '收款汇总表',
  aging: '账龄分析表',
  bill: '账单状态明细',
  subject: '结算对象穿透',
})[reportType.value])
const detailTitle = computed(() => props.stage === 'closing'
  ? `${detailPeriod.value.periodCode || '账期'} · 月结档案`
  : `${detailSubject.value.subjectName || '结算对象'} · 财务档案`)
const operationTitle = computed(() => nextAction(operationRow.value))
const operationChecks = computed(() => detailOpen.value && detailChecks.value.length ? detailChecks.value : flowSteps.value.map((step) => ({ label: step.label, ok: stepOk(operationRow.value, step), detail: stepOk(operationRow.value, step) ? '已满足' : '待处理' })))
const previewDetails = computed<RecordRow[]>(() => Array.isArray(preview.value?.details) ? preview.value?.details as RecordRow[] : [])
const previewBlockers = computed<RecordRow[]>(() => Array.isArray(preview.value?.blockers) ? preview.value?.blockers as RecordRow[] : [])
const previewAmount = computed(() => preview.value?.totalAmount ?? preview.value?.total_amount ?? operationRow.value.totalAmount ?? 0)
const filteredSpaces = computed(() => spaces.value.filter((item) => !admissionForm.orgId || String(item.org_id) === admissionForm.orgId))
const filteredMeters = computed(() => devices.value.filter((item) => {
  if (admissionForm.orgId && String(item.org_id) !== admissionForm.orgId) return false
  if (admissionForm.spaceIds.length && item.space_id && !admissionForm.spaceIds.includes(String(item.space_id))) return false
  return true
}))
const receiptBillNo = computed(() => String(operationRow.value.billNo || operationRow.value.bill_no || operationRow.value.billId || '—'))
const receiptSubject = computed(() => String(operationRow.value.subjectName || operationRow.value.accountName || selectedCollectionRow.value.subjectName || '用能主体'))
const receiptAmount = computed(() => Number(collectionForm.payAmount || operationRow.value.paidAmount || operationRow.value.totalAmount || 0))
const receiptTime = computed(() => String(operationRow.value.paymentTime || operationRow.value.payment_time || new Date().toLocaleString('zh-CN')))
const receiptTransactionNo = computed(() => String(collectionForm.transactionNo || operationRow.value.transactionNo || operationRow.value.transaction_no || '—'))
const schemeSteps = computed(() => ['对象范围', '计量来源', '计价模型', '确认启用'])
const admissionReady = computed(() => {
  const tenantReady = admissionForm.tenantMode === 'existing' ? Boolean(admissionForm.tenantId) : Boolean(admissionForm.tenantCode && admissionForm.tenantName && admissionForm.contactName && admissionForm.contactPhone)
  return tenantReady && admissionForm.contractNo && admissionForm.contractName && admissionForm.orgId && admissionForm.startDate && admissionForm.endDate && admissionForm.spaceIds.length > 0 && admissionForm.meterIds.length > 0
})
const admissionReadyItems = computed(() => [
  { label: '合同主体', ok: admissionForm.tenantMode === 'existing' ? Boolean(admissionForm.tenantId) : Boolean(admissionForm.tenantName && admissionForm.contactName && admissionForm.contactPhone), detail: admissionForm.tenantMode === 'existing' ? '已选择租户档案' : '新主体资料可建档' },
  { label: '合同要素', ok: Boolean(admissionForm.contractNo && admissionForm.contractName && admissionForm.orgId), detail: '编号、名称、园区归属' },
  { label: '空间范围', ok: admissionForm.spaceIds.length > 0, detail: `${admissionForm.spaceIds.length} 个空间纳入合同` },
  { label: '结算表计', ok: admissionForm.meterIds.length > 0, detail: `${admissionForm.meterIds.length} 块表计纳入合同` },
  { label: '合同周期', ok: Boolean(admissionForm.startDate && admissionForm.endDate), detail: `${admissionForm.startDate || '起始日'} 至 ${admissionForm.endDate || '终止日'}` },
])
const admissionReadyPercent = computed(() => Math.round((admissionReadyItems.value.filter((item) => item.ok).length / admissionReadyItems.value.length) * 100))
const schemeReady = computed(() => Boolean((schemeForm.accountId || operationRow.value.accountId || operationRow.value.id) && schemeForm.ruleName && schemeForm.scopeId && schemeForm.deviceTypeId && schemeForm.metricPointCodes.length
  && (schemeForm.priceMode === 'TIME_PERIOD' ? schemeForm.tariffPlanId : schemeForm.unitPrice)))
const closingReport = computed(() => [
  { label: '账期建立', ok: Boolean(operationRow.value.periodId || operationRow.value.id), value: operationRow.value.periodCode || '—' },
  { label: '账单发布', ok: ['CLOSEABLE', 'CLOSED'].includes(String(operationRow.value.closingStatus)), value: `${operationRow.value.issuedBillCount || 0} / ${operationRow.value.billCount || 0}` },
  { label: '应收余额', ok: Number(operationRow.value.outstandingAmount || 0) <= 0, value: `¥${money(operationRow.value.outstandingAmount)}` },
  { label: '对账差异', ok: Number(operationRow.value.differenceCount || 0) <= 0, value: `${operationRow.value.differenceCount || 0} 条` },
  { label: '关账状态', ok: ['CLOSEABLE', 'CLOSED'].includes(String(operationRow.value.closingStatus)), value: statusText(operationRow.value.closingStatus) },
])

function createContractNo() {
  return `CT-${Date.now()}`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    payload.value = await billingErp(props.stage, {
      orgId: orgId.value || undefined,
      keyword: keyword.value || undefined,
      billCycle: billCycle.value || undefined,
    })
    await nextTick()
    renderCharts()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '结算与财务数据读取失败'
  } finally {
    loading.value = false
  }
}
async function loadLookups() {
  try {
    const [accountResult, deviceResult, typeResult, tariffResult, tenantResult, spaceResult, contractResult] = await Promise.all([
      listResource('billing', 'accounts', { pageSize: 500 }),
      listResource('archive', 'devices', { pageSize: 500 }),
      listResource('archive', 'device-types', { pageSize: 500 }),
      tariffPlans({ pageSize: 500 }),
      listResource('billing', 'tenants', { pageSize: 500 }),
      listResource('archive', 'spaces', { pageSize: 500 }),
      contracts({ pageSize: 500, orgId: orgId.value || undefined }),
    ])
    accounts.value = accountResult.records
    devices.value = deviceResult.records
    deviceTypes.value = typeResult.records
    tariffs.value = tariffResult.records
    tenants.value = tenantResult.records
    spaces.value = spaceResult.records
    scheduleContracts.value = contractResult.records || []
  } catch {
    accounts.value = []
    devices.value = []
    deviceTypes.value = []
    tariffs.value = []
    tenants.value = []
    spaces.value = []
    scheduleContracts.value = []
  }
}
function resetScheduleForm() {
  Object.assign(scheduleForm, { id: '', scheduleName: '', orgId: orgId.value || String(orgs.value[0]?.id || ''), contractIds: [], executeDay: 1, executeTime: '02:00', paymentTermDays: 15, enabled: true, remark: '' })
}
function contractLabel(contract: RecordRow) {
  return String(contract.contract_name || contract.contractName || contract.contract_no || contract.contractNo || `合同 ${contract.id}`)
}
function scheduleContractNames(row: RecordRow) {
  if (Array.isArray(row.contract_names)) return row.contract_names.join('、')
  if (Array.isArray(row.contracts)) return row.contracts.map((item: RecordRow) => contractLabel(item)).join('、')
  return '—'
}
async function loadSchedules() {
  scheduleLoading.value = true
  try { schedules.value = await billingAutoSchedules({ orgId: orgId.value || undefined }) } catch (cause) { error.value = cause instanceof Error ? cause.message : '自动出账计划读取失败' } finally { scheduleLoading.value = false }
}
async function openSchedules() {
  scheduleOpen.value = true
  await loadSchedules()
}
function editSchedule(row: RecordRow) {
  Object.assign(scheduleForm, { id: String(row.id), scheduleName: String(row.schedule_name || row.scheduleName || ''), orgId: String(row.org_id || row.orgId || orgId.value || ''), contractIds: (Array.isArray(row.contract_ids) ? row.contract_ids : []).map(String), executeDay: Number(row.execute_day || row.executeDay || 1), executeTime: String(row.execute_time || row.executeTime || '02:00').slice(0, 5), paymentTermDays: Number(row.payment_term_days || row.paymentTermDays || 15), enabled: Number(row.enabled) !== 0, remark: String(row.remark || '') })
  scheduleFormOpen.value = true
}
async function saveSchedule() {
  if (!scheduleForm.scheduleName.trim() || !scheduleForm.orgId || !scheduleForm.contractIds.length) { error.value = '请填写计划名称、园区并至少选择一份合同'; return }
  scheduleLoading.value = true
  try {
    await saveBillingAutoSchedule({ scheduleName: scheduleForm.scheduleName.trim(), orgId: Number(scheduleForm.orgId), contractIds: scheduleForm.contractIds.map(Number), executeDay: Number(scheduleForm.executeDay), executeTime: scheduleForm.executeTime, paymentTermDays: Number(scheduleForm.paymentTermDays), enabled: scheduleForm.enabled ? 1 : 0, remark: scheduleForm.remark }, scheduleForm.id || undefined)
    scheduleFormOpen.value = false
    showAppAlert({ type: 'success', title: '自动出账计划已保存', message: '计划已进入自动出账计划列表。' })
    await loadSchedules()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '自动出账计划保存失败' } finally { scheduleLoading.value = false }
}
async function removeSchedule(row: RecordRow) {
  if (!window.confirm(`确定删除计划“${row.schedule_name || row.scheduleName || ''}”吗？`)) return
  try { await deleteBillingAutoSchedule(row.id); await loadSchedules() } catch (cause) { error.value = cause instanceof Error ? cause.message : '自动出账计划删除失败' }
}
async function runSchedule(row: RecordRow) {
  try { await runBillingAutoSchedule(row.id); showAppAlert({ type: 'success', title: '计划已执行', message: '系统正在按绑定合同生成本期账单。' }); await loadSchedules(); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '自动出账计划执行失败' }
}
async function loadSchemePoints() {
  if (!schemeForm.deviceTypeId) { schemePoints.value = []; meterTemplates.value = []; return }
  try {
    const [points, templates] = await Promise.all([
      listResource('archive', 'point-definitions', { pageSize: 500, deviceTypeId: schemeForm.deviceTypeId }),
      listResource('billing', 'meter-templates', { pageSize: 500, deviceTypeId: schemeForm.deviceTypeId, owner_user_id: session.roles.includes('super_admin') ? undefined : session.user?.id }),
    ])
    schemePoints.value = points.records || []
    meterTemplates.value = templates.records || []
    if (!schemeForm.metricPointCodes.length) schemeForm.metricPointCodes = schemePoints.value.map((item) => String(item.point_code || item.pointCode)).filter(Boolean)
  } catch { schemePoints.value = []; meterTemplates.value = [] }
}
function applyMeterTemplate(template: RecordRow) {
  schemeForm.templateId = String(template.id || '')
  let codes: string[] = []
  try { codes = Array.isArray(template.point_codes) ? template.point_codes.map(String) : JSON.parse(String(template.point_codes || '[]')) } catch { codes = [] }
  schemeForm.metricPointCodes = Number(template.all_points) === 1 ? schemePoints.value.map((item) => String(item.point_code || item.pointCode)).filter(Boolean) : codes
}
async function saveMeterTemplate() {
  if (!templateForm.templateName.trim() || !schemeForm.deviceTypeId) { error.value = '请填写模板名称并选择设备型号'; return }
  await createResource('billing', 'meter-templates', { template_name: templateForm.templateName.trim(), owner_user_id: session.user?.id, owner_username: session.user?.username, org_id: session.user?.orgId, device_type_id: Number(schemeForm.deviceTypeId), point_codes: JSON.stringify(schemeForm.metricPointCodes), all_points: templateForm.allPoints ? 1 : 0, description: templateForm.description })
  templateFormOpen.value = false
  await loadSchemePoints()
}
async function saveInlineTariff() {
  if (!tariffForm.planName.trim()) { error.value = '请填写电价方案名称'; return }
  const saved = await saveTariffPlan({ plan_name: tariffForm.planName.trim(), plan_code: tariffForm.planCode.trim() || `TARIFF-${Date.now()}`, version: Number(tariffForm.version || 1), status: 'DRAFT', remark: tariffForm.remark })
  tariffs.value = [saved, ...tariffs.value]
  schemeForm.tariffPlanId = String(saved.id || '')
  tariffFormOpen.value = false
}
async function showDetail(row: RecordRow) {
  const id = props.stage === 'closing' || row.periodId ? row.periodId || row.id : row.accountId || row.id
  if (!id) return
  detailOpen.value = true
  detailLoading.value = true
  detail.value = {}
  try {
    detail.value = props.stage === 'closing' || row.periodId ? await billingErpPeriod(id) : await billingErpSubject(id, { billCycle: billCycle.value })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '详情读取失败'
  } finally {
    detailLoading.value = false
  }
}
function openReport(type: ReportType) {
  reportType.value = type
  reportOpen.value = true
}
function openOperation(row: RecordRow) {
  operationRow.value = row
  paymentSucceeded.value = false
  preview.value = null
  schemeStep.value = 1
  const today = new Date().toISOString().slice(0, 10)
  const yearEnd = `${today.slice(0, 4)}-12-31`
  Object.assign(admissionForm, {
    tenantMode: row.tenantName ? 'existing' : 'existing',
    tenantId: row.tenantId ? String(row.tenantId) : '',
    tenantCode: `T-${Date.now()}`,
    tenantName: row.tenantName || row.accountName || '',
    tenantType: 'ENTERPRISE',
    creditCode: '',
    contactName: row.contactName || '',
    contactPhone: row.contactPhone || '',
    contactEmail: '',
    billingAddress: '',
    contractNo: row.contractNo || createContractNo(),
    contractName: row.contractName || `${row.subjectName || row.accountName || '结算对象'}能源结算合同`,
    orgId: row.orgId ? String(row.orgId) : (orgId.value || ''),
    startDate: today,
    endDate: yearEnd,
    settlementDay: 1,
    depositAmount: '0',
    spaceIds: [],
    meterIds: [],
  })
  Object.assign(schemeForm, {
    accountId: row.accountId || row.id ? String(row.accountId || row.id) : '',
    ruleName: `${row.subjectName || row.accountName || '结算对象'}计费方案`,
    scopeType: 'DEVICE',
    scopeId: '',
    deviceTypeId: '',
    metricPointCodes: [],
    priceMode: 'UNIT_PRICE',
    unitPrice: '',
    tariffPlanId: '',
  })
  Object.assign(collectionForm, {
    payAmount: String(row.outstandingAmount || ''),
    payWay: '转账',
    transactionNo: `PAY-${Date.now()}`,
    remark: `${billCycle.value} 账期收款登记`,
  })
  operationOpen.value = true
}
function primaryAction() {
  if (props.stage === 'overview') return
  if (props.stage === 'admission') {
    openOperation({ orgId: orgId.value })
    return
  }
  if (props.stage === 'schemes') {
    openOperation({ orgId: orgId.value })
    return
  }
  if (props.stage === 'jobs') {
    const target = rows.value.find((row) => row.jobStatus === 'READY') || rows.value.find((row) => ['DRAFT', 'REVIEWING', 'ISSUED'].includes(String(row.jobStatus))) || rows.value[0]
    if (target) openOperation(target)
    else error.value = '当前没有可办理的出账对象，请先完成对象准入和方案配置'
    return
  }
  const target = rows.value.find((row) => row.closingStatus === 'CLOSEABLE') || rows.value.find((row) => row.closingStatus === 'DIFFERENCE') || rows.value[0]
  if (target) openOperation(target)
  else error.value = '当前没有可办理的账期，请先完成出账收款'
}
function primaryActionText() {
  if (props.stage === 'admission') return '新增准入'
  if (props.stage === 'schemes') return '新增方案'
  if (props.stage === 'jobs') return '发起出账'
  if (props.stage === 'closing') return '月结处理'
  return ''
}
function nextAction(row: RecordRow) {
  if (props.stage === 'admission') return row.admissionStatus === 'PASSED' ? '进入方案配置' : '处理准入'
  if (props.stage === 'schemes') return row.schemeStatus === 'ACTIVE' ? '进入出账收款' : '配置方案'
  if (props.stage === 'jobs') {
    const status = String(row.jobStatus || '')
    if (status === 'DRAFT' || status === 'REVIEWING') return '审核发布'
    if (status === 'ISSUED' && Number(row.outstandingAmount || 0) > 0) return '登记收款'
    if (status === 'ISSUED') return '查看应收'
    if (status === 'READY') return '生成账单'
    return '查看阻断'
  }
  if (props.stage === 'closing') return row.closingStatus === 'CLOSEABLE' ? '执行关账' : row.closingStatus === 'DIFFERENCE' ? '处理差异' : '查看月结'
  return '查看'
}
function routeForward(row: RecordRow) {
  if (props.stage === 'admission' && row.admissionStatus === 'PASSED') return router.push('/billing/schemes')
  if (props.stage === 'schemes' && row.schemeStatus === 'ACTIVE') return router.push('/billing/jobs')
  if (props.stage === 'jobs' && row.jobStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0) return openCollection(row)
  openOperation(row)
}
function syncJobSelection() {
  if (props.stage !== 'jobs') return
  const viewKey = String(route.query.view || '')
  const matched = jobsRows.value.find((row) => String(row.billId || row.id || row.accountId || row.periodId || '') === viewKey)
  const fallback = rows.value.find((row) => row.jobStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0) || jobsRows.value[0] || {}
  selectedJobKey.value = String((matched || fallback).billId || (matched || fallback).id || (matched || fallback).accountId || (matched || fallback).periodId || '')
  if (selectedJobKey.value) {
    void loadSelectedJobDetail()
  }
}
async function loadSelectedJobDetail() {
  const row = selectedJobRow.value
  const id = row.accountId || row.id
  if (!id) {
    selectedJobDetail.value = {}
    return
  }
  selectedJobDetailLoading.value = true
  try {
    selectedJobDetail.value = await billingErpSubject(id, { billCycle: billCycle.value })
  } catch {
    selectedJobDetail.value = {}
  } finally {
    selectedJobDetailLoading.value = false
  }
}
function selectJobRow(row: RecordRow) {
  selectedJobKey.value = String(row.billId || row.id || row.accountId || row.periodId || '')
  if (row.jobStatus === 'ISSUED') jobFocus.value = 'collection'
  void router.replace({ query: { ...route.query, view: selectedJobKey.value || undefined } })
  void loadSelectedJobDetail()
}
function openCollection(row: RecordRow) {
  jobFocus.value = 'collection'
  selectJobRow(row)
  paymentSucceeded.value = false
  operationRow.value = row
  collectionForm.payAmount = String(row.outstandingAmount || '')
  collectionForm.payWay = 'DEMO_QR'
  collectionForm.transactionNo = `QR-${Date.now()}`
  collectionForm.remark = `${billCycle.value} 账期收款登记`
}
function billKey(row: RecordRow) { return String(row.billId || row.id || '') }
function billStatusText(row: RecordRow) {
  const status = String(row.settlementStatus || '')
  if (status === 'OVERDUE') return '逾期欠费'
  if (status === 'PENDING_REVIEW') return '待审核'
  if (status === 'PARTIAL') return '部分收款'
  if (status === 'PENDING_PAYMENT') return '待收款'
  if (status === 'SETTLED') return '已结清'
  if (status === 'VOID') return '已作废'
  return statusText(row.billStatus)
}
function billStatusTone(row: RecordRow) {
  const status = String(row.settlementStatus || '')
  if (status === 'OVERDUE') return 'danger'
  if (status === 'PENDING_REVIEW') return 'warning'
  if (status === 'VOID') return 'muted'
  return 'neutral'
}
function openBillDetail(row: RecordRow, tab: 'overview' | 'energy' | 'collection' | 'audit' = 'overview') {
  billDetailTab.value = tab
  expandedBillKey.value = ''
  operationRow.value = row
  void showDetail(row)
}
function toggleBillExpand(row: RecordRow) {
  const key = billKey(row)
  expandedBillKey.value = expandedBillKey.value === key ? '' : key
  if (expandedBillKey.value) void loadSelectedJobDetailFor(row)
}
function openBillOperation(row: RecordRow) {
  operationRow.value = row
  paymentSucceeded.value = false
  if (row.billStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0) {
    openCollection(row)
    operationOpen.value = true
    return
  }
  operationOpen.value = true
}
async function loadSelectedJobDetailFor(row: RecordRow) {
  const accountId = row.accountId || row.id
  if (!accountId) return
  selectedJobKey.value = billKey(row)
  selectedJobDetailLoading.value = true
  try { selectedJobDetail.value = await billingErpSubject(Number(accountId), { billCycle: billCycle.value }) } catch { selectedJobDetail.value = {} } finally { selectedJobDetailLoading.value = false }
}
function openReceipt(row: RecordRow = operationRow.value) {
  operationRow.value = row
  receiptOpen.value = true
}
async function openFinanceDrawer(tab: 'statements' | 'vouchers' = 'statements') {
  financeDrawerTab.value = tab
  financeDrawerOpen.value = true
  financeImportError.value = ''
  await loadFinanceStatements()
}
async function loadFinanceStatements() {
  financeStatementLoading.value = true
  try {
    const result = await billingStatements({ orgId: orgId.value || undefined, pageSize: 100 })
    financeStatements.value = result.records || []
  } catch (cause) {
    financeImportError.value = cause instanceof Error ? cause.message : '银行流水读取失败'
  } finally { financeStatementLoading.value = false }
}
async function selectFinanceStatement(row: RecordRow) {
  financeStatementLoading.value = true
  financeImportError.value = ''
  try {
    financeStatement.value = await billingStatement(row.id)
    financeCandidates.value = await billingStatementCandidates(row.id)
    financeMatchAmount.value = String(Math.max(0, Number(financeStatement.value.amount || 0) - Number(financeStatement.value.matched_amount || 0)))
  } catch (cause) {
    financeImportError.value = cause instanceof Error ? cause.message : '流水详情读取失败'
  } finally { financeStatementLoading.value = false }
}
async function importFinanceStatements() {
  financeImportError.value = ''
  try {
    const sourceText = financeImportText.value.trim()
    let records: RecordRow[]
    if (sourceText.startsWith('[') || sourceText.startsWith('{')) {
      const parsed = JSON.parse(sourceText)
      records = (Array.isArray(parsed) ? parsed : parsed.records) as RecordRow[]
    } else {
      const lines = sourceText.split(/\r?\n/).map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
      const header = lines.shift() || []
      records = lines.filter((line) => line.length >= header.length).map((line) => Object.fromEntries(header.map((key, index) => [key, line[index]]))) as RecordRow[]
    }
    if (!Array.isArray(records) || !records.length) throw new Error('请输入 JSON 数组，或包含 records 数组的 JSON 对象')
    financeImporting.value = true
    const result = await importBillingStatements({ orgId: Number(orgId.value || orgs.value[0]?.id), sourceChannel: 'BANK', importBatchNo: `BANK-${Date.now()}`, records })
    financeImportText.value = ''
    pushNotification('success', '银行流水导入完成', `新增 ${result.inserted || 0} 条，重复 ${result.duplicated || 0} 条。`)
    await loadFinanceStatements()
  } catch (cause) {
    financeImportError.value = cause instanceof Error ? cause.message : '银行流水导入失败'
    pushNotification('error', '银行流水导入失败', financeImportError.value)
  } finally { financeImporting.value = false }
}
async function autoMatchFinanceStatement(row: RecordRow = financeStatement.value) {
  const candidate = financeCandidates.value[0]
  if (!row.id || !candidate?.bill_id) { financeImportError.value = '没有找到金额完全一致的待收账单'; return }
  try {
    financeStatementLoading.value = true
    await matchBillingStatement(row.id, { billId: candidate.bill_id, matchAmount: Number(financeMatchAmount.value) })
    pushNotification('success', '银行流水已自动勾兑', `${candidate.bill_no} 已完成收款登记和销账。`)
    await selectFinanceStatement(row)
    await loadFinanceStatements()
    await load()
  } catch (cause) { financeImportError.value = cause instanceof Error ? cause.message : '自动勾兑失败' } finally { financeStatementLoading.value = false }
}
async function markFinanceDifference(row: RecordRow = financeStatement.value) {
  const reason = financeDifferenceReason.value.trim()
  if (!reason || !row.id) { financeImportError.value = '请先填写差异原因'; return }
  try { await markBillingStatementDifference(row.id, reason); financeDifferenceReason.value = ''; pushNotification('warning', '流水已标记差异', reason); await selectFinanceStatement(row); await loadFinanceStatements() } catch (cause) { financeImportError.value = cause instanceof Error ? cause.message : '差异标记失败' }
}
async function createVoucherForBill(row: RecordRow = operationRow.value) {
  if (!row.billId) { financeImportError.value = '当前账单没有可用的账单编号'; financeDrawerTab.value = 'vouchers'; financeDrawerOpen.value = true; return }
  financeImportError.value = ''
  financeDrawerTab.value = 'vouchers'
  financeDrawerOpen.value = true
  try {
    voucherResult.value = await createBillingVoucher({ billId: row.billId, voucherType: 'AR_RECEIVABLE' })
    pushNotification('success', '财务凭证已生成', `${row.billNo || '账单'} 已生成正式应收凭证。`)
  } catch (cause) { financeImportError.value = cause instanceof Error ? cause.message : '凭证生成失败' }
}
async function exportCurrentVoucher() {
  if (!voucherResult.value.id) return
  try {
    voucherResult.value = await exportBillingVoucher(voucherResult.value.id, { externalSystem: 'OTHER' })
    const csv = String((voucherResult.value.exportData as RecordRow | undefined)?.csv || '')
    if (csv) {
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `${voucherResult.value.voucher_no || '财务凭证'}.csv`; link.click(); URL.revokeObjectURL(url)
    }
    pushNotification('success', '凭证导出状态已更新', String(voucherResult.value.external_voucher_no || voucherResult.value.voucher_no || ''))
  } catch (cause) { financeImportError.value = cause instanceof Error ? cause.message : '凭证导出失败' }
}
function printReceipt() {
  window.print()
}
async function confirmOperation() {
  const row = operationRow.value
  const key = String(row.accountId || row.id || row.periodId || '')
  processingRow.value = key
  error.value = ''
  try {
    if (props.stage === 'jobs' && row.batchId && (['DRAFT', 'REVIEWING'].includes(String(row.jobStatus)) || ['DRAFT', 'REVIEWED'].includes(String(row.billStatus)))) {
      if (String(row.batchStatus || '') !== 'REVIEWED') await billingBatchAction(row.batchId, 'review')
      await billingBatchAction(row.batchId, 'issue')
      pushNotification('success', '账单审核发布完成', `${row.billNo || '本批次账单'} 已形成正式应收。`)
    } else if (props.stage === 'jobs' && row.billId && Number(row.outstandingAmount || 0) > 0) {
      await payBill(row.billId, { payAmount: Number(row.outstandingAmount || 0), payWay: 'DEMO_TRANSFER', transactionNo: `ERP-${Date.now()}`, operator: 'test', remark: '出账收款工作台登记' })
      pushNotification('success', '收款登记完成', `${row.billNo || '账单'} 的收款记录已写入。`)
    } else if (props.stage === 'closing' && (row.periodId || row.id) && row.closingStatus === 'CLOSEABLE') {
      await billingPeriodAction(row.periodId || row.id, 'close', { operator: 'test', remark: '关账归档工作台执行' })
      pushNotification('success', '账期已关账归档', `${row.periodCode || row.periodName || '当前账期'} 已完成关账。`)
    } else {
      await showDetail(row)
    }
    operationOpen.value = false
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '业务动作执行失败'
    pushNotification('error', '业务处理失败', error.value)
  } finally {
    processingRow.value = ''
  }
}
function cycleRange(cycle: string) {
  const matched = /^(\d{4})-(\d{2})$/.exec(cycle)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!year || month < 1 || month > 12) return null
  const endDay = new Date(year, month, 0).getDate()
  return { startDate: `${cycle}-01`, endDate: `${cycle}-${String(endDay).padStart(2, '0')}` }
}
async function previewCurrentBill() {
  const accountId = operationRow.value.accountId || operationRow.value.id
  const range = cycleRange(billCycle.value)
  if (!accountId || !range) { error.value = '缺少计费账户或账期，无法试算'; return }
  processingRow.value = String(accountId)
  error.value = ''
  try {
    preview.value = await billPreview({ accountId: Number(accountId), billCycle: billCycle.value, ...range })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '账单试算失败'
  } finally {
    processingRow.value = ''
  }
}
async function createCurrentBill() {
  const accountId = operationRow.value.accountId || operationRow.value.id
  const range = cycleRange(billCycle.value)
  if (!accountId || !range) { error.value = '缺少计费账户或账期，无法生成账单'; return }
  processingRow.value = String(accountId)
  error.value = ''
  try {
    await generateBill({ accountId: Number(accountId), billCycle: billCycle.value, ...range })
    pushNotification('success', '草稿账单已生成', `${billCycle.value} 账期已生成草稿，可进入待审核账单。`)
    operationOpen.value = false
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '账单生成失败'
  } finally {
    processingRow.value = ''
  }
}
async function saveScheme() {
  const accountId = schemeForm.accountId || operationRow.value.accountId || operationRow.value.id
  if (!accountId || !schemeForm.ruleName || !schemeForm.scopeId || !schemeForm.deviceTypeId) {
    error.value = '请补齐方案名称、适用范围和设备类型'
    return
  }
  if (schemeForm.priceMode === 'TIME_PERIOD' && !schemeForm.tariffPlanId) { error.value = '请选择分时电价方案'; return }
  if (schemeForm.priceMode !== 'TIME_PERIOD' && !schemeForm.unitPrice) { error.value = '请填写价格参数'; return }
  processingRow.value = String(accountId)
  error.value = ''
  try {
    const rule = await createResource('billing', 'rules', {
      account_id: Number(accountId),
      rule_name: schemeForm.ruleName,
      device_type_id: Number(schemeForm.deviceTypeId),
      metric_point_code: schemeForm.metricPointCodes.join(','),
      billing_cycle: 'MONTHLY',
      price_mode: schemeForm.priceMode,
      tariff_plan_id: schemeForm.priceMode === 'TIME_PERIOD' ? Number(schemeForm.tariffPlanId) : null,
      enabled: 1,
      remark: '方案配置工作台创建',
    })
    await createResource('billing', 'rule-scopes', { rule_id: Number(rule.id), scope_type: schemeForm.scopeType, scope_id: Number(schemeForm.scopeId) })
    if (schemeForm.priceMode !== 'TIME_PERIOD') {
      await createResource('billing', 'price-items', { rule_id: Number(rule.id), price_label: schemeForm.priceMode === 'FIXED' ? '固定金额' : '标准单价', tier_min: 0, tier_max: null, unit_price: Number(schemeForm.unitPrice), sort: 1 })
    }
    pushNotification('success', '计费方案已创建并启用', `${schemeForm.ruleName || '本次计费方案'} 已保存，可用于合同出账。`)
    error.value = ''
    operationOpen.value = false
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '计费方案保存失败'
  } finally {
    processingRow.value = ''
  }
}
async function submitCollection() {
  const billId = operationRow.value.billId
  if (!billId) { error.value = '当前对象没有可登记收款的账单'; return }
  processingRow.value = String(operationRow.value.accountId || billId)
  error.value = ''
  try {
    await payBill(billId, { payAmount: Number(collectionForm.payAmount), payWay: collectionForm.payWay, transactionNo: collectionForm.transactionNo, operator: 'test', remark: collectionForm.remark || '二维码支付确认' })
    paymentSucceeded.value = true
    error.value = ''
    pushNotification('success', '收款登记完成', `${operationRow.value.billNo || '账单'} 的收款记录已写入。`)
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '收款登记失败'
    pushNotification('error', '收款登记失败', error.value)
  } finally {
    processingRow.value = ''
  }
}
function legacyAction() {
  const view = String(route.query.view || '')
  if (!view || props.stage === 'overview') return
  if (props.stage === 'admission' && ['tenants', 'contracts', 'accounts'].includes(view)) {
    openOperation({ orgId: orgId.value })
    return
  }
  if (props.stage === 'schemes' && ['metering', 'tariffs', 'rules', 'rule-scopes', 'price-items'].includes(view)) {
    openOperation(rows.value[0] || { orgId: orgId.value })
    return
  }
  if (props.stage === 'jobs' && ['settlement', 'bills', 'batches', 'collections', 'adjustments'].includes(view)) {
    const target = rows.value.find((row) => view === 'collections' ? row.jobStatus === 'ISSUED' : true) || rows.value[0]
    if (target) view === 'collections' ? openCollection(target) : openOperation(target)
    return
  }
  if (props.stage === 'closing' && ['periods', 'reconciliations'].includes(view) && rows.value[0]) openOperation(rows.value[0])
}
function nextSchemeStep() {
  error.value = ''
  if (schemeStep.value === 1 && (!schemeForm.accountId || !schemeForm.ruleName || !schemeForm.scopeId)) { error.value = '请先选择计费对象、填写方案名称并确定适用范围'; return }
  if (schemeStep.value === 2 && (!schemeForm.deviceTypeId || !schemeForm.metricPointCodes.length)) { error.value = '请补齐设备类型和至少一个计费测点'; return }
  if (schemeStep.value === 3 && schemeForm.priceMode === 'TIME_PERIOD' && !schemeForm.tariffPlanId) { error.value = '请选择分时电价方案'; return }
  if (schemeStep.value === 3 && schemeForm.priceMode !== 'TIME_PERIOD' && !schemeForm.unitPrice) { error.value = '请填写价格参数'; return }
  if (schemeStep.value < schemeSteps.value.length) schemeStep.value += 1
}
function previousSchemeStep() {
  if (schemeStep.value > 1) schemeStep.value -= 1
}
async function submitAdmission() {
  if (!admissionForm.contractNo) admissionForm.contractNo = createContractNo()
  if (!admissionReady.value) { error.value = '请补齐租户、合同、空间和结算表计后再提交准入'; return }
  processingRow.value = String(operationRow.value.accountId || operationRow.value.id || Date.now())
  error.value = ''
  try {
    let tenantId = admissionForm.tenantId
    if (admissionForm.tenantMode === 'new') {
      const tenant = await createResource('billing', 'tenants', {
        tenant_code: admissionForm.tenantCode,
        tenant_name: admissionForm.tenantName,
        tenant_type: admissionForm.tenantType,
        unified_social_credit_code: admissionForm.creditCode,
        contact_name: admissionForm.contactName,
        contact_phone: admissionForm.contactPhone,
        contact_email: admissionForm.contactEmail,
        billing_address: admissionForm.billingAddress,
        status: 'ACTIVE',
      })
      tenantId = String(tenant.id)
    }
    const contract = await saveContract({
      contractNo: admissionForm.contractNo,
      contractName: admissionForm.contractName,
      tenantId: Number(tenantId),
      orgId: Number(admissionForm.orgId),
      startDate: admissionForm.startDate,
      endDate: admissionForm.endDate,
      settlementDay: Number(admissionForm.settlementDay),
      depositAmount: admissionForm.depositAmount,
      remark: '对象准入工作台创建',
      spaces: admissionForm.spaceIds.map((spaceId) => ({ spaceId: Number(spaceId), startDate: admissionForm.startDate })),
      meters: admissionForm.meterIds.map((deviceId) => ({ deviceId: Number(deviceId), startDate: admissionForm.startDate, meterFactor: 1 })),
    })
    await contractAction(contract.id, 'activate')
    pushNotification('success', '对象准入已提交', '合同已生效，系统将自动生成或绑定计费账户。')
    operationOpen.value = false
    await loadLookups()
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '对象准入提交失败'
  } finally {
    processingRow.value = ''
  }
}
function billColumnEnabled(key: string) { return visibleBillColumnKeys.value.includes(key) }
function saveColumnPreferences() {
  localStorage.setItem('park-energy.billing.bill-columns', JSON.stringify(visibleBillColumnKeys.value.filter((key) => !billColumnOptions.find((item) => item.key === key)?.core)))
  columnConfigOpen.value = false
}
function toggleBillColumn(key: string) {
  const option = billColumnOptions.find((item) => item.key === key)
  if (option?.core) return
  visibleBillColumnKeys.value = visibleBillColumnKeys.value.includes(key)
    ? visibleBillColumnKeys.value.filter((item) => item !== key)
    : [...visibleBillColumnKeys.value, key]
}
function pushNotification(type: 'success' | 'warning' | 'error', title: string, detail: string) {
  notifications.value = [{ id: `${Date.now()}-${Math.random()}`, type, title, detail, time: new Date().toLocaleString('zh-CN'), read: false }, ...notifications.value].slice(0, 30)
  localStorage.setItem('park-energy.billing.notifications', JSON.stringify(notifications.value))
  showAppAlert({ type, title, message: detail })
}
function markNotificationsRead() {
  notifications.value = notifications.value.map((item) => ({ ...item, read: true }))
  localStorage.setItem('park-energy.billing.notifications', JSON.stringify(notifications.value))
}
function clearNotifications() {
  notifications.value = []
  localStorage.setItem('park-energy.billing.notifications', '[]')
}
function startRemarkEdit(row: RecordRow) {
  editingRemarkKey.value = billKey(row)
  remarkDraft.value = String(row.remark || '')
}
async function saveRemark(row: RecordRow) {
  if (!row.billId || processingRow.value) return
  processingRow.value = `remark-${billKey(row)}`
  try {
    const result = await updateBillRemark(row.billId, remarkDraft.value)
    row.remark = result.remark || remarkDraft.value
    editingRemarkKey.value = ''
  } catch (cause) {
    pushNotification('error', '备注保存失败', cause instanceof Error ? cause.message : '请稍后重试')
  } finally { processingRow.value = '' }
}
function money(value: unknown) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function statusText(value: unknown) {
  return ({
    PASSED: '通过', BLOCKED: '阻断', ACTIVE: '已生效', INCOMPLETE: '待配置', READY: '可生成',
    DRAFT: '草稿', REVIEWING: '审核中', ISSUED: '已发布', CLOSEABLE: '可关账', CLOSED: '已归档',
    DIFFERENCE: '有差异', OPEN: '开放中', NO_PERIOD: '未建账期',
    CREATED: '已创建', PENDING_REVIEW: '待审核', PENDING_PAYMENT: '待收款', PARTIAL: '部分收款', OVERDUE: '逾期欠费', SETTLED: '已结清', VOID: '已作废',
    IMPORTED: '已导入', MATCHED: '已勾兑', IGNORED: '已忽略', AR_RECEIVABLE: '应收凭证', RECEIPT: '收款凭证', EXPORTED: '已导出',
  } as Record<string, string>)[String(value)] || String(value || '—')
}
function financeStatusText(value: unknown) { return statusText(value) }
function statusTone(value: unknown) {
  const text = String(value || '')
  if (['PASSED', 'ACTIVE', 'ISSUED', 'CLOSEABLE', 'CLOSED'].includes(text)) return 'active'
  if (['READY', 'DRAFT', 'REVIEWING', 'OPEN'].includes(text)) return 'ready'
  return 'warning'
}
function stepOk(row: RecordRow, step: RecordRow) {
  if (step.fixed) return true
  const value = row[String(step.field)]
  if (step.zero) return Number(value || 0) <= 0
  if (Array.isArray(step.values)) return step.values.includes(String(value))
  if (step.expect !== undefined) return String(value) === String(step.expect)
  return Number(value || 0) > 0 || Boolean(value)
}
function eventLabel(value: unknown) {
  return ({
    CREATED: '账单创建', REVIEWED: '审核通过', ISSUED: '账单发布', PAYMENT_POSTED: '收款登记', PAYMENT_REVERSED: '收款冲销',
    BILL_ISSUED: '确认应收', ADJUSTMENT_SURCHARGE: '补收审批', ADJUSTMENT_DISCOUNT: '减免审批',
  } as Record<string, string>)[String(value)] || String(value || '状态事件')
}
function reportStatus(row: RecordRow) {
  return statusText(row.jobStatus || row.closingStatus || row.schemeStatus || row.admissionStatus)
}
function detailDeviceName(id: unknown) {
  const device = devices.value.find((item) => String(item.id) === String(id))
  return String(device?.device_name || device?.deviceName || id || '—')
}
function detailTypeName(id: unknown) {
  const type = deviceTypes.value.find((item) => String(item.id) === String(id))
  return String(type?.type_name || type?.typeName || id || '—')
}
function chart(name: string, el: HTMLElement | null) {
  if (!el) return null
  let item = charts.get(name)
  if (!item) {
    item = init(el)
    charts.set(name, item)
  }
  return item
}
function renderCharts() {
  const axis = { axisLine: { lineStyle: { color: '#dce6ef' } }, axisLabel: { color: '#7d8ea2' }, splitLine: { lineStyle: { color: '#edf2f7', type: 'dashed' } } }
  if (props.stage === 'overview') {
    const labels = stages.value.map((item) => String(item.title || ''))
    const done = stages.value.map((item) => Number(item.done || 0))
    const total = stages.value.map((item) => Number(item.total || 0))
    chart('overviewTrend', overviewTrendEl.value)?.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 14, right: 22, top: 34, bottom: 38, containLabel: true },
      xAxis: { type: 'category', data: labels, ...axis },
      yAxis: { type: 'value', ...axis },
      series: [
        { name: '完成量', type: 'line', smooth: true, symbolSize: 7, data: done, lineStyle: { width: 3, color: '#1f7a8c' }, itemStyle: { color: '#1f7a8c' }, areaStyle: { color: '#1f7a8c1f' } },
        { name: '总量', type: 'line', smooth: true, symbolSize: 7, data: total, lineStyle: { width: 2, color: '#6b7f94' }, itemStyle: { color: '#6b7f94' } },
      ],
    } as EChartsCoreOption, true)
    chart('overviewStatus', overviewStatusEl.value)?.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 4, left: 'center', itemWidth: 10, itemHeight: 7, textStyle: { color: '#6c7d91', fontSize: 10 } },
      series: [{ type: 'pie', radius: ['44%', '62%'], center: ['50%', '42%'], avoidLabelOverlap: true, label: { position: 'inside', formatter: '{c}', color: '#fff', fontSize: 10 }, data: [
        { name: '准入完成', value: summary.value.admissionReady || 0 },
        { name: '方案完成', value: summary.value.schemeReady || 0 },
        { name: '已出账', value: summary.value.issuedSubjects || 0 },
        { name: '异常', value: Number(summary.value.blockedSubjects || 0) + Number(summary.value.differenceCount || 0) },
      ] }],
    } as EChartsCoreOption, true)
    chart('overviewFunnel', overviewFunnelEl.value)?.setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'funnel', left: '12%', top: 26, bottom: 26, width: '76%', minSize: '24%', maxSize: '100%', sort: 'none', gap: 8, label: { position: 'inside', color: '#fff', fontSize: 11, formatter: '{b}' }, labelLine: { show: false }, data: stages.value.map((item) => ({ name: item.title, value: item.done || 0 })) }],
    } as EChartsCoreOption, true)
  }
  if (props.stage === 'jobs') {
    chart('periodTrend', periodTrendEl.value)?.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 14, right: 22, top: 34, bottom: 38, containLabel: true },
      xAxis: { type: 'category', data: ['可生成', '待审核', '已发布', '待收'], ...axis },
      yAxis: { type: 'value', ...axis },
      series: [{ type: 'line', smooth: true, symbolSize: 7, data: [jobSummary.value.ready || 0, Number(jobSummary.value.draft || 0) + Number(jobSummary.value.reviewing || 0), jobSummary.value.issued || 0, Number(jobSummary.value.outstanding || 0)], lineStyle: { width: 3, color: '#2f80a6' }, itemStyle: { color: '#2f80a6' }, areaStyle: { color: '#2f80a624' } }],
    } as EChartsCoreOption, true)
  }
  charts.forEach((item) => item.resize())
}

onMounted(async () => {
  try {
    const savedColumns = JSON.parse(localStorage.getItem('park-energy.billing.bill-columns') || 'null')
    if (Array.isArray(savedColumns)) visibleBillColumnKeys.value = billColumnOptions.filter((item) => item.core || savedColumns.includes(item.key)).map((item) => item.key)
    const savedNotifications = JSON.parse(localStorage.getItem('park-energy.billing.notifications') || '[]')
    if (Array.isArray(savedNotifications)) notifications.value = savedNotifications
  } catch { /* ignore invalid local preferences */ }
  try { orgs.value = await rootOrgs() } catch { orgs.value = [] }
  await loadLookups()
  await load()
  syncJobSelection()
  legacyAction()
  window.addEventListener('resize', renderCharts)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', renderCharts)
  charts.forEach((item) => item.dispose())
  charts.clear()
})
watch(() => props.stage, async () => { await load(); syncJobSelection() })
watch(() => route.query.view, () => { syncJobSelection(); legacyAction(); void nextTick().then(renderCharts) })
watch(() => rows.value, () => { if (props.stage === 'jobs') syncJobSelection() })
watch(() => billCycle.value, () => { if (props.stage === 'jobs') void loadSelectedJobDetail() })
</script>

<template>
  <section class="view-page billing-erp-page billing-redesign-page" :class="{ 'finance-overview-page': props.stage === 'overview' }">
    <header class="view-head business-module-head">
      <div><p class="eyebrow">{{ stageMeta.eyebrow }}</p><h1>{{ stageMeta.title }}</h1><span>{{ stageMeta.subtitle }}</span></div>
      <div class="finance-head-actions">
        <button v-if="props.stage !== 'overview'" class="primary" type="button" @click="primaryAction">{{ primaryActionText() }}</button>
        <button v-if="props.stage === 'jobs'" class="quiet schedule-entry-button" type="button" @click="openSchedules">查看计划</button>
        <button v-if="props.stage === 'jobs'" class="quiet notification-trigger" type="button" @click="notificationOpen = !notificationOpen; markNotificationsRead()"><span class="notification-dot" :class="{ active: unreadNotifications > 0 }"></span>通知中心<sup v-if="unreadNotifications">{{ unreadNotifications }}</sup></button>
        <button v-if="props.stage === 'jobs' || props.stage === 'closing'" class="quiet" type="button" @click="openFinanceDrawer('statements')">财务流水</button>
        <button class="quiet" :disabled="loading" @click="load"><RefreshCw :size="14" />刷新</button>
      </div>
    </header>

    <aside v-if="notificationOpen && props.stage === 'jobs'" class="billing-notification-center"><header><div><b>通知中心</b><small>批量任务、审核和收款结果</small></div><button class="quiet" type="button" @click="clearNotifications">清空</button></header><div v-if="!notifications.length" class="center-empty">暂无需要回看的业务结果。</div><button v-for="item in notifications" :key="item.id" class="billing-notification-item" type="button" :class="item.type"><span>{{ item.title }}</span><small>{{ item.detail }}</small><em>{{ item.time }}</em></button></aside>

    <nav class="erp-flow-strip finance-flow-strip" aria-label="结算业务流程">
      <button v-for="(item, index) in stageOrder" :key="item.key" :class="{ active: item.key === props.stage, done: index < currentIndex }" @click="router.push(item.path)">
        <i>{{ index < currentIndex ? '✓' : index + 1 }}</i><span>{{ item.label }}</span>
      </button>
    </nav>

    <section class="erp-filter-bar finance-filter-bar">
      <label><span>园区范围</span><AppSelect v-model="orgId" @change="load"><option value="">全部园区</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect></label>
      <label><span>账期</span><input v-model="billCycle" type="month" @change="load" /></label>
      <label v-if="props.stage !== 'overview' && props.stage !== 'closing'" class="wide"><span>{{ props.stage === 'jobs' ? '租户 / 账单' : '对象' }}</span><input v-model="keyword" :placeholder="props.stage === 'jobs' ? '账单编号或租户名称' : '租户、账户、合同或园区'" @keydown.enter="load" /></label>
      <label v-if="props.stage === 'jobs'" class="bill-status-filter"><span>账单状态</span><AppSelect v-model="billStatusFilter"><option value="">全部状态</option><option value="PENDING_REVIEW">待审核</option><option value="PENDING_PAYMENT">待收款</option><option value="PARTIAL">部分收款</option><option value="OVERDUE">逾期欠费</option><option value="SETTLED">已结清</option><option value="VOID">已作废</option></AppSelect></label>
      <button v-if="props.stage !== 'overview'" class="primary" @click="load"><Search :size="14" />查询</button>
      <button v-if="nextStage && props.stage !== 'overview'" class="quiet next-action" @click="router.push(nextStage.path)">下一阶段：{{ nextStage.label }} <ChevronRight :size="13" /></button>
    </section>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <template v-if="props.stage === 'overview'">
      <section class="finance-overview-metrics">
        <button v-for="item in overviewMetrics" :key="item.label" @click="openReport(item.label.includes('账期') ? 'collection' : item.label.includes('异常') ? 'aging' : 'subject')"><span>{{ item.label }}</span><b>{{ item.value }}</b><small>{{ item.hint }}</small></button>
      </section>

      <section class="finance-overview-bottom">
        <article class="finance-event-stream"><header><b>最近业务变化</b></header><div><button v-for="item in recentEvents" :key="String(item.id)" @click="openReport('bill')"><i></i><span><b>{{ eventLabel(item.eventType) }} · {{ item.billNo }}</b><small>{{ item.accountName }} · {{ item.eventTime || '—' }}</small></span><em>{{ item.afterBillStatus || item.operator || '—' }}</em></button><p v-if="!recentEvents.length" class="center-empty">暂无业务变化。</p></div></article>
        <article class="finance-event-stream"><header><b>重点待办</b></header><div><button v-for="item in todos" :key="`${item.stage}-${item.title}`" @click="router.push(String(item.path))"><i></i><span><b>{{ item.stage }} · {{ item.title }}</b><small>{{ item.detail }}</small></span><ChevronRight :size="13" /></button><p v-if="!todos.length" class="center-empty">当前无重点待办。</p></div></article>
      </section>
    </template>

    <template v-else>
      <section v-if="props.stage === 'jobs'" class="erp-job-cockpit finance-job-cockpit">
        <button type="button" @click="jobFocus = 'issue'"><span>待审核账单</span><b>{{ billSummary.pendingReview }}</b><small>需要财务核验并发布</small></button>
        <button type="button" @click="jobFocus = 'collection'"><span>待收款总金额</span><b>¥{{ money(billSummary.pendingCollection) }}</b><small>已发布但尚未结清</small></button>
        <button type="button" class="warning" @click="jobFocus = 'collection'"><span>欠费总金额</span><b>¥{{ money(billSummary.arrears) }}</b><small>超过付款截止日</small></button>
      </section>

      <section v-if="props.stage === 'jobs'" class="billing-workflow-bar" aria-label="出账收款流程">
        <div class="billing-workflow-title"><b>本期结算作业</b><span>{{ billCycle }} · 后付费</span></div>
        <div class="billing-workflow-steps">
          <span class="done"><i>1</i><b>生成草稿</b></span><ChevronRight :size="15" />
          <span :class="{ active: billSummary.pendingReview > 0, done: billSummary.pendingReview === 0 }"><i>2</i><b>审核发布</b></span><ChevronRight :size="15" />
          <span :class="{ active: billSummary.pendingReview === 0 && billRows.length > 0 }"><i>3</i><b>形成应收</b></span><ChevronRight :size="15" />
          <span :class="{ active: billSummary.pendingCollection > 0 }"><i>4</i><b>收款销账</b></span>
        </div>
        <button class="quiet" type="button" @click="openFinanceDrawer('statements')">银行流水</button>
      </section>

      <section class="finance-queue-tabs finance-queue-tabs-secondary">
        <button v-for="item in queues" :key="String(item.key)" :class="{ warning: Number(item.count) > 0 && ['BLOCKED','INCOMPLETE','DIFFERENCE','OPEN'].includes(String(item.key)) }"><span>{{ item.label }}</span><b>{{ item.count }}</b></button>
      </section>


      <section class="finance-workbench-layout">
        <main class="finance-workbench-main">
          <section v-if="props.stage === 'jobs'" class="finance-jobs-depth-page">
            <section class="finance-period-view finance-jobs-overview">
              <article class="finance-period-ledger"><header><b>{{ billCycle }} 账期推进</b><button class="quiet" @click="primaryAction">发起出账</button></header><div ref="periodTrendEl" class="finance-echart"></div></article>
              <div class="finance-period-strip"><span><b>应出账</b><em>¥{{ money(jobSummary.amount) }}</em></span><span><b>已收</b><em>¥{{ money(Number(jobSummary.amount || 0) - Number(jobSummary.outstanding || 0)) }}</em></span><span :class="{ warning: Number(jobSummary.outstanding || 0) > 0 }"><b>未收</b><em>¥{{ money(jobSummary.outstanding) }}</em></span><span><b>关账条件</b><em>{{ Number(jobSummary.outstanding || 0) > 0 ? '待收款' : '可检查' }}</em></span></div>
            </section>

            <section class="finance-jobs-summary-strip">
              <article v-for="item in jobSummaryRows" :key="item.label"><span>{{ item.label }}</span><b>{{ item.value }}</b><small>{{ item.hint }}</small></article>
            </section>

            <nav class="billing-job-focus-tabs" aria-label="出账收款任务">
              <button v-for="item in jobFocusTabs" :key="item.key" type="button" :class="{ active: jobFocus === item.key }" @click="jobFocus = item.key"><span>{{ item.label }}</span><b>{{ item.count }}</b></button>
            </nav>

            <section class="finance-bill-list" :class="{ 'is-loading': loading }">
              <header class="finance-bill-list-head"><div><h3>{{ jobFocus === 'issue' ? '待审核账单' : jobFocus === 'collection' ? '待收款账单' : '全部账单' }}</h3><span>{{ focusedBillRows.length }} 张账单 · {{ billCycle }} 结算周期</span></div><div class="finance-bill-list-actions"><button v-if="jobFocus === 'issue' && focusedBillRows.length" class="quiet" type="button" @click="openBillOperation(focusedBillRows[0] || {})">批量审核</button><button class="quiet" type="button" @click="columnConfigOpen = !columnConfigOpen">列设置</button><button class="quiet" type="button" @click="load"><RefreshCw :size="14" />刷新</button></div></header>
              <div v-if="columnConfigOpen" class="bill-column-config"><b>显示列</b><label v-for="item in billColumnOptions" :key="item.key"><input type="checkbox" :checked="billColumnEnabled(item.key)" :disabled="item.core" @change="toggleBillColumn(item.key)" />{{ item.label }}<small v-if="item.core">核心</small></label><button class="primary" type="button" @click="saveColumnPreferences">完成</button></div>
              <div v-if="loading" class="center-empty">账单列表加载中…</div>
              <div v-else-if="!focusedBillRows.length" class="center-empty">当前条件下暂无账单。</div>
              <div v-else class="finance-bill-table-wrap">
                <table class="finance-bill-table">
                  <thead><tr><th class="expand-col"></th><th>账单编号</th><th v-if="billColumnEnabled('tenant')">租户名称</th><th v-if="billColumnEnabled('cycle')">结算周期</th><th v-if="billColumnEnabled('total')" class="money-cell">总金额</th><th v-if="billColumnEnabled('outstanding')" class="money-cell">应收金额</th><th v-if="billColumnEnabled('status')">结算状态</th><th v-if="billColumnEnabled('created')">生成时间</th><th v-if="billColumnEnabled('org')">园区</th><th v-if="billColumnEnabled('paid')" class="money-cell">已收金额</th><th v-if="billColumnEnabled('due')">付款截止日</th><th v-if="billColumnEnabled('remark')">备注</th><th>操作</th></tr></thead>
                  <tbody>
                    <template v-for="row in focusedBillRows" :key="billKey(row)">
                      <tr :class="{ expanded: expandedBillKey === billKey(row) }">
                        <td class="expand-col"><button class="bill-expand-btn" type="button" :aria-label="expandedBillKey === billKey(row) ? '收起明细' : '展开明细'" @click="toggleBillExpand(row)"><ChevronRight :size="15" :class="{ rotated: expandedBillKey === billKey(row) }" /></button></td>
                        <td><button class="bill-link" type="button" @click="openBillDetail(row)">{{ row.billNo || row.billId }}</button></td>
                        <td v-if="billColumnEnabled('tenant')">{{ row.tenantName || row.accountName || '—' }}</td>
                        <td v-if="billColumnEnabled('cycle')">{{ row.billCycle || billCycle }}</td>
                        <td v-if="billColumnEnabled('total')" class="money-cell">¥{{ money(row.totalAmount) }}</td>
                        <td v-if="billColumnEnabled('outstanding')" class="money-cell"><strong :class="{ 'arrears-amount': Number(row.outstandingAmount || 0) > 0 }">{{ Number(row.outstandingAmount || 0) > 0 ? `¥${money(row.outstandingAmount)}` : '¥0.00' }}</strong></td>
                        <td v-if="billColumnEnabled('status')"><span :class="['bill-status-text', billStatusTone(row)]"><AlertTriangle v-if="['OVERDUE','PENDING_REVIEW'].includes(String(row.settlementStatus))" :size="13" />{{ billStatusText(row) }}</span></td>
                        <td v-if="billColumnEnabled('created')">{{ row.createTime || '—' }}</td>
                        <td v-if="billColumnEnabled('org')">{{ row.orgName || '—' }}</td>
                        <td v-if="billColumnEnabled('paid')" class="money-cell">¥{{ money(row.paidAmount) }}</td>
                        <td v-if="billColumnEnabled('due')">{{ row.dueDate || '—' }}</td>
                        <td v-if="billColumnEnabled('remark')" class="remark-cell"><input v-if="editingRemarkKey === billKey(row)" v-model="remarkDraft" maxlength="500" @keyup.enter="saveRemark(row)" @keyup.esc="editingRemarkKey = ''" @blur="saveRemark(row)" /><button v-else class="inline-remark" type="button" @dblclick="startRemarkEdit(row)">{{ row.remark || '双击添加备注' }}</button></td>
                        <td class="bill-actions"><button v-if="['DRAFT','REVIEWED'].includes(String(row.billStatus))" class="text-action primary-text" type="button" @click="openBillOperation(row)">审核</button><button v-else-if="row.billStatus === 'ISSUED' && Number(row.outstandingAmount || 0) > 0" class="text-action primary-text" type="button" @click="openCollection(row); operationOpen = true">勾兑</button><button class="text-action" type="button" @click="openBillDetail(row)">详情</button></td>
                      </tr>
                      <tr v-if="expandedBillKey === billKey(row)" class="bill-expanded-row"><td></td><td :colspan="visibleBillColumnKeys.length + 2"><div class="bill-inline-summary"><span><small>账单金额</small><b>¥{{ money(row.totalAmount) }}</b></span><span><small>已收金额</small><b>¥{{ money(row.paidAmount) }}</b></span><span><small>本期应收</small><b class="arrears-amount">¥{{ money(row.outstandingAmount) }}</b></span><span><small>付款截止日</small><b>{{ row.dueDate || '—' }}</b></span><span><small>关联账户</small><b>{{ row.accountName || '—' }}</b></span><button class="quiet" type="button" @click="openBillDetail(row, 'energy')">查看计量明细 <ChevronRight :size="13" /></button></div></td></tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </section>

            <section v-if="false && jobFocus !== 'issue'" class="finance-jobs-layers">
              <section class="finance-payment-workbench finance-jobs-collection-layer">
                <aside class="finance-payment-bill"><header><b>当前收款对象</b><button class="quiet" :disabled="!selectedCollectionRow.billId" @click="showDetail(selectedCollectionRow)">查看详情</button></header><dl><div><dt>账单编号</dt><dd>{{ selectedCollectionRow.billNo || selectedCollectionRow.bill_no || selectedCollectionRow.billId || '—' }}</dd></div><div><dt>结算对象</dt><dd>{{ selectedCollectionRow.subjectName || selectedCollectionRow.accountName || '—' }}</dd></div><div><dt>应收金额</dt><dd>¥{{ money(selectedCollectionRow.totalAmount) }}</dd></div><div><dt>已收金额</dt><dd>¥{{ money(selectedCollectionRow.paidAmount) }}</dd></div><div><dt>未收金额</dt><dd>¥{{ money(selectedCollectionRow.outstandingAmount) }}</dd></div><div><dt>当前状态</dt><dd><span :class="['scheme-status', Number(selectedCollectionRow.outstandingAmount || 0) <= 0 ? 'active' : 'ready']">{{ collectionBillStatus }}</span></dd></div></dl></aside>
                <section v-if="jobFocus === 'collection'" class="finance-payment-panel"><header><b>支付确认</b><small>登记实际收款后生成凭证</small></header><button v-if="selectedCollectionRow.billId" class="finance-qr-button" :class="{ paid: paymentSucceeded || Number(selectedCollectionRow.outstandingAmount || 0) <= 0 }" :disabled="Boolean(processingRow) || Number(selectedCollectionRow.outstandingAmount || 0) <= 0" @click="operationRow = selectedCollectionRow; collectionForm.payAmount = String(selectedCollectionRow.outstandingAmount || ''); collectionForm.payWay = 'DEMO_QR'; collectionForm.transactionNo = `QR-${Date.now()}`; submitCollection()"><Check v-if="paymentSucceeded || Number(selectedCollectionRow.outstandingAmount || 0) <= 0" :size="54" /><QrCode v-else :size="92" /><span>{{ paymentSucceeded || Number(selectedCollectionRow.outstandingAmount || 0) <= 0 ? '已收款' : processingRow ? '确认中…' : '登记二维码收款' }}</span></button><div v-else class="finance-stage-note"><ReceiptText :size="28" /><b>先从上方选择一张已发布账单</b><span>收款登记、电子付款凭证和收款记录只针对具体账单操作。</span></div><button v-if="selectedCollectionRow.billId && (paymentSucceeded || Number(selectedCollectionRow.outstandingAmount || 0) <= 0)" class="quiet receipt-entry-button" type="button" @click="openReceipt(selectedCollectionRow)"><ReceiptText :size="14" />查看电子付款凭证</button><p>收款登记成功后，账单剩余应收和账期状态会同步更新。</p></section>
                <section v-else class="finance-payment-panel finance-audit-focus-panel"><header><b>留痕摘要</b><small>调整和收款记录</small></header><div class="finance-stage-note"><FileCheck2 :size="28" /><b>{{ selectedCollectionRow.billId ? selectedCollectionRow.billNo || selectedCollectionRow.billId : '请选择账单' }}</b><span>在下方查看账单明细、收款记录、调整记录和出账事件。</span></div></section>
              </section>

              <section class="finance-jobs-adjustment-layer">
                <article class="finance-detail-hero"><div><span>调整与留痕</span><b>{{ selectedJobSubject.subjectName || selectedJobSubject.accountName || selectedCollectionRow.subjectName || '当前业务对象' }}</b><small>{{ billCycle }} 账期 · {{ selectedJobCollections.length }} 条收款记录</small></div><strong>¥{{ money(selectedCollectionRow.outstandingAmount) }}</strong></article>
                <section class="finance-detail-columns">
                  <article><header><b>账单明细</b><small>{{ selectedJobBills.length }}</small></header><div class="finance-mini-list"><p v-if="selectedJobDetailLoading" class="center-empty">账单明细加载中…</p><p v-else-if="!selectedJobBills.length" class="center-empty">暂无账单</p><div v-for="bill in selectedJobBills" :key="String(bill.id)"><span><b>{{ bill.billNo }}</b><small>{{ statusText(bill.billStatus) }} · 已收 ¥{{ money(bill.paidAmount) }}</small></span><em>待收 ¥{{ money(bill.outstandingAmount) }}</em></div></div></article>
                  <article><header><b>收款记录</b><small>{{ selectedJobCollections.length }}</small></header><div class="finance-mini-list"><p v-if="selectedJobDetailLoading" class="center-empty">收款记录加载中…</p><p v-else-if="!selectedJobCollections.length" class="center-empty">暂无收款记录</p><div v-for="item in selectedJobCollections" :key="String(item.id)"><span><b>{{ item.collection_no || item.collectionNo || item.transaction_no || item.transactionNo || '收款记录' }}</b><small>{{ item.collection_time || item.collectionTime || '—' }} · {{ item.pay_way || item.payWay || '—' }}</small></span><em>¥{{ money(item.amount || item.pay_amount || item.payAmount) }}</em></div></div></article>
                  <article><header><b>费用调整</b><small>{{ selectedJobAdjustments.length }}</small></header><div class="finance-mini-list"><p v-if="selectedJobDetailLoading" class="center-empty">调整记录加载中…</p><p v-else-if="!selectedJobAdjustments.length" class="center-empty">暂无调整记录</p><div v-for="item in selectedJobAdjustments" :key="String(item.id)"><span><b>{{ item.billNo || item.adjustment_no || '调整记录' }}</b><small>{{ item.adjust_type || item.adjustType || item.status || '—' }}</small></span><em>¥{{ money(item.amount) }}</em></div></div></article>
                </section>
                <article class="finance-audit-panel"><header><b>出账留痕</b><small>{{ selectedJobEvents.length }}</small></header><div class="finance-mini-list horizontal"><p v-if="selectedJobDetailLoading" class="center-empty">业务留痕加载中…</p><p v-else-if="!selectedJobEvents.length" class="center-empty">暂无留痕</p><div v-for="item in selectedJobEvents" :key="String(item.id)"><span><b>{{ eventLabel(item.event_type) }} · {{ item.billNo }}</b><small>{{ item.event_time || item.effective_time }} · {{ item.operator || 'system' }}</small></span><em>{{ item.after_bill_status || item.entry_type || '—' }}</em></div></div></article>
              </section>
            </section>
          </section>

          <AppDataTable v-else class="finance-erp-table" :title="`${stageMeta.title}办理清单`" :columns="tableColumns" :rows="rows" :loading="loading" compact>
            <template #cell-admissionStatus="{ value }"><span :class="['scheme-status', statusTone(value)]">{{ statusText(value) }}</span></template>
            <template #cell-schemeStatus="{ value }"><span :class="['scheme-status', statusTone(value)]">{{ statusText(value) }}</span></template>
            <template #cell-jobStatus="{ value }"><span :class="['scheme-status', statusTone(value)]">{{ statusText(value) }}</span></template>
            <template #cell-closingStatus="{ value }"><span :class="['scheme-status', statusTone(value)]">{{ statusText(value) }}</span></template>
            <template #cell-readinessScore="{ value }"><b>{{ value || 0 }}%</b></template>
            <template #cell-outstandingAmount="{ value }"><b :class="{ 'danger-text': Number(value) > 0 }">¥{{ money(value) }}</b></template>
            <template #cell-issuedAmount="{ value }">¥{{ money(value) }}</template>
            <template #actions="{ row }">
              <button class="icon-action-btn" :disabled="processingRow === String(row.accountId || row.id || row.periodId || '')" :title="processingRow === String(row.accountId || row.id || row.periodId || '') ? '处理中' : nextAction(row)" @click="routeForward(row)">
                <RefreshCw v-if="processingRow === String(row.accountId || row.id || row.periodId || '')" :size="15" class="spinning" />
                <component :is="stageActionIcon" v-else :size="15" />
              </button>
              <button class="icon-action-btn muted" title="详情" @click="showDetail(row)"><Eye :size="15" /></button>
            </template>
          </AppDataTable>
        </main>
      </section>
    </template>

    <AppDialog v-model:open="detailOpen" :title="detailTitle" eyebrow="FINANCE DETAIL" hide-actions dialog-class="erp-detail-dialog finance-detail-dialog">
      <div class="finance-detail-body">
        <div v-if="detailLoading" class="center-empty">详情加载中…</div>
        <template v-else>
          <template v-if="props.stage === 'admission'">
            <article class="finance-contract-preview">
              <header class="admission-contract-title"><span>ENERGY SETTLEMENT CONTRACT</span><h2>能源计量结算合同</h2><p>合同编号：{{ detailSubject.contractNo || '未生成合同编号' }}</p></header>
              <section class="contract-recitals"><p>鉴于甲方负责园区能源服务、计量设施和费用结算管理，乙方因实际经营或使用空间产生能源费用，双方依据平台准入资料、合同空间、结算表计和账期账单确认能源计量结算关系。</p></section>
              <section class="contract-clause"><h3>第一条 合同主体</h3><p>甲方：<b>{{ detailSubject.orgName || '园区运营管理方' }}</b></p><p>乙方：<b>{{ detailSubject.tenantName || detailSubject.subjectName || detailSubject.accountName || '用能主体' }}</b></p><p>合同名称：{{ detailSubject.contractName || '能源计量结算合同' }}</p></section>
              <section class="contract-clause"><h3>第二条 结算对象</h3><dl class="finance-detail-dl"><div><dt>计费账户</dt><dd>{{ detailSubject.accountName || detailSubject.subjectName || '—' }}</dd></div><div><dt>所属园区</dt><dd>{{ detailSubject.orgName || '—' }}</dd></div><div><dt>结算空间</dt><dd>{{ detailSubject.spaceCount || 0 }} 个</dd></div><div><dt>结算表计</dt><dd>{{ detailSubject.meterCount || 0 }} 台</dd></div></dl></section>
              <section class="contract-clause"><h3>第三条 合同期限与准入检查</h3><p>合同期限自 <b>{{ detailSubject.contractStartDate || '未填写' }}</b> 起至 <b>{{ detailSubject.contractEndDate || '未填写' }}</b> 止。</p><div class="finance-check-grid compact"><article v-for="item in detailChecks" :key="String(item.label)" :class="{ ok: item.ok }"><i><Check v-if="item.ok" :size="13" /><AlertTriangle v-else :size="13" /></i><b>{{ item.label }}</b><small>{{ item.detail }}</small></article></div></section>
              <section class="contract-clause contract-signature"><h3>第四条 确认</h3><p>本合同信息以平台准入记录为依据，甲乙双方确认后进入方案配置和后续出账流程。</p><div><span class="stamped">甲方确认：{{ detailSubject.orgName || '园区运营管理方' }}<img :src="contractStampUrl" alt="合同专用章" /></span><span>乙方确认：{{ detailSubject.tenantName || detailSubject.subjectName || detailSubject.accountName || '用能主体' }}</span><span>生效日期：{{ detailSubject.contractStartDate || new Date().toISOString().slice(0, 10) }}</span></div></section>
            </article>
          </template>
          <template v-else-if="props.stage === 'schemes'">
            <section class="finance-detail-hero"><div><span>方案状态</span><b>{{ statusText(detailSubject.schemeStatus) }}</b><small>{{ detailSubject.subjectName || detailSubject.accountName }} · {{ detailSubject.orgName }}</small></div><strong>{{ detailRules.length }} 条规则</strong></section>
            <section class="finance-object-ledger"><article><header><b>适用对象</b></header><dl class="finance-detail-dl"><div><dt>合同</dt><dd>{{ detailSubject.contractNo || '未绑定合同' }}</dd></div><div><dt>计量表计</dt><dd>{{ detailSubject.meterCount || 0 }} 台</dd></div><div><dt>价格完整度</dt><dd>{{ detailSubject.pricedRuleCount || 0 }} / {{ detailSubject.activeRuleCount || 0 }}</dd></div><div><dt>可出账状态</dt><dd>{{ statusText(detailSubject.jobStatus) }}</dd></div></dl></article><article><header><b>方案检查</b></header><div class="finance-check-grid compact"><article v-for="item in detailChecks" :key="String(item.label)" :class="{ ok: item.ok }"><i><Check v-if="item.ok" :size="13" /><AlertTriangle v-else :size="13" /></i><b>{{ item.label }}</b><small>{{ item.detail }}</small></article></div></article></section>
            <section class="finance-detail-columns"><article><header><b>计费规则</b><small>{{ detailRules.length }}</small></header><div class="finance-mini-list"><p v-if="!detailRules.length" class="center-empty">暂无计费规则</p><div v-for="rule in detailRules" :key="String(rule.id)"><span><b>{{ rule.rule_name || rule.ruleName }}</b><small>{{ rule.deviceTypeName || '全部设备类型' }} · {{ rule.metric_point_code || rule.metricPointCode }} · {{ rule.price_mode || rule.priceMode }}</small></span><em>{{ rule.enabled ? '启用' : '停用' }}</em></div></div></article><article><header><b>计量来源</b><small>{{ detailMeters.length }}</small></header><div class="finance-mini-list"><p v-if="!detailMeters.length" class="center-empty">暂无结算表计</p><div v-for="meter in detailMeters" :key="String(meter.id || meter.deviceId)"><span><b>{{ meter.deviceName }}</b><small>{{ meter.deviceSn }} · {{ meter.meterRole || '结算表计' }}</small></span><em>{{ meter.status || meter.deviceStatus }}</em></div></div></article></section>
          </template>
          <template v-else-if="props.stage === 'jobs'">
            <nav class="bill-detail-tabs"><button v-for="item in [{ key: 'overview', label: '账单概览' }, { key: 'energy', label: '能耗计费明细' }, { key: 'collection', label: '收款与销账' }, { key: 'audit', label: '调账与变更日志' }]" :key="item.key" type="button" :class="{ active: billDetailTab === item.key }" @click="billDetailTab = item.key as 'overview' | 'energy' | 'collection' | 'audit'">{{ item.label }}</button></nav>
            <section v-if="billDetailTab === 'overview'" class="finance-detail-hero"><div><span>账单状态</span><b>{{ billStatusText(operationRow) }}</b><small>{{ operationRow.tenantName || detailSubject.subjectName || detailSubject.accountName }} · {{ operationRow.billCycle || billCycle }}</small></div><strong>¥{{ money(operationRow.outstandingAmount) }}</strong></section>
            <section v-if="billDetailTab === 'overview'" class="finance-bill-detail-summary"><dl><div><dt>账单编号</dt><dd>{{ operationRow.billNo || '—' }}</dd></div><div><dt>总金额</dt><dd>¥{{ money(operationRow.totalAmount) }}</dd></div><div><dt>已收金额</dt><dd>¥{{ money(operationRow.paidAmount) }}</dd></div><div><dt>应收金额</dt><dd class="arrears-amount">¥{{ money(operationRow.outstandingAmount) }}</dd></div><div><dt>付款截止日</dt><dd>{{ operationRow.dueDate || '—' }}</dd></div><div><dt>生成时间</dt><dd>{{ operationRow.createTime || '—' }}</dd></div></dl><div class="bill-detail-footer-actions"><button class="quiet" type="button" @click="createVoucherForBill(operationRow)">生成正式应收凭证</button><button v-if="operationRow.billId && Number(operationRow.outstandingAmount || 0) > 0" class="primary" type="button" @click="openCollection(operationRow); detailOpen = false; operationOpen = true">收款勾兑</button></div></section>
            <section v-if="billDetailTab === 'energy'" class="finance-detail-columns"><article><header><b>本期计量依据</b><small>来源于账单快照</small></header><div class="finance-mini-list"><div><span><b>关联计费账户</b><small>{{ operationRow.accountName || '—' }}</small></span><em>{{ operationRow.accountId || '—' }}</em></div><div><span><b>结算期间</b><small>{{ operationRow.startDate || billCycle }} 至 {{ operationRow.endDate || '—' }}</small></span><em>{{ operationRow.billCycle || billCycle }}</em></div><div><span><b>关联表计</b><small>打开对象明细查看表计、测点和分时费用</small></span><em>{{ detailMeters.length }} 台</em></div></div></article><article><header><b>计费明细</b><small>{{ previewDetails.length || detailBills.length }} 项</small></header><div class="finance-mini-list"><p v-if="!previewDetails.length" class="center-empty">当前账单已保存计费快照，详细测点明细可从对象账单记录查看。</p><div v-for="item in previewDetails" :key="`${item.ruleId}-${item.deviceId}-${item.tariffPeriodCode || 'std'}`"><span><b>{{ detailDeviceName(item.deviceId) }}</b><small>{{ item.pointCode || '计量测点' }} · {{ item.tariffPeriodCode || '标准时段' }}</small></span><em>¥{{ money(item.amount) }}</em></div></div></article></section>
            <section v-if="billDetailTab === 'collection'" class="finance-detail-columns"><article><header><b>收款记录</b><small>{{ detailCollections.length }}</small></header><div class="finance-mini-list"><p v-if="!detailCollections.length" class="center-empty">暂无收款记录</p><div v-for="item in detailCollections" :key="String(item.id)"><span><b>{{ item.collection_no || item.collectionNo || item.transaction_no || item.transactionNo || '收款记录' }}</b><small>{{ item.collection_time || item.collectionTime || '—' }} · {{ item.pay_way || item.payWay || '—' }}</small></span><em>¥{{ money(item.amount || item.pay_amount || item.payAmount) }}</em></div></div></article><article><header><b>销账状态</b></header><div class="finance-stage-note"><Check v-if="Number(operationRow.outstandingAmount || 0) <= 0" :size="24" /><AlertTriangle v-else :size="24" /><b>{{ Number(operationRow.outstandingAmount || 0) <= 0 ? '已完成销账' : '尚有未销账金额' }}</b><span>已收 ¥{{ money(operationRow.paidAmount) }}，剩余应收 ¥{{ money(operationRow.outstandingAmount) }}</span></div></article></section>
            <section v-if="billDetailTab === 'audit'" class="finance-detail-columns"><article><header><b>调整记录</b><small>{{ detailAdjustments.length }}</small></header><div class="finance-mini-list"><p v-if="!detailAdjustments.length" class="center-empty">暂无调整记录</p><div v-for="item in detailAdjustments" :key="String(item.id)"><span><b>{{ item.billNo || item.adjustment_no || '调整记录' }}</b><small>{{ item.adjust_type || item.adjustType || item.status || '—' }}</small></span><em>¥{{ money(item.amount) }}</em></div></div></article><article><header><b>出账留痕</b><small>{{ detailEvents.length }}</small></header><div class="finance-mini-list"><p v-if="!detailEvents.length" class="center-empty">暂无留痕</p><div v-for="item in detailEvents" :key="String(item.id)"><span><b>{{ eventLabel(item.event_type) }} · {{ item.billNo }}</b><small>{{ item.event_time || item.effective_time }} · {{ item.operator || 'system' }}</small></span><em>{{ item.after_bill_status || item.entry_type || '—' }}</em></div></div></article></section>
          </template>
          <template v-else>
            <section class="finance-detail-hero"><div><span>月结账期</span><b>{{ statusText(detailPeriod.closingStatus) }}</b><small>{{ detailPeriod.orgName || '' }} · {{ detailPeriod.periodCode || '' }}</small></div><strong>¥{{ money(detailPeriod.outstandingAmount) }}</strong></section>
            <section class="finance-object-ledger"><article><header><b>关账口径</b></header><dl class="finance-detail-dl"><div><dt>账单数</dt><dd>{{ detailPeriod.issuedBillCount || 0 }} / {{ detailPeriod.billCount || 0 }}</dd></div><div><dt>已发布金额</dt><dd>¥{{ money(detailPeriod.issuedAmount) }}</dd></div><div><dt>剩余应收</dt><dd>¥{{ money(detailPeriod.outstandingAmount) }}</dd></div><div><dt>差异数</dt><dd>{{ detailPeriod.differenceCount || 0 }}</dd></div></dl></article><article><header><b>关账检查</b></header><div class="finance-check-grid compact"><article v-for="item in detailChecks" :key="String(item.label)" :class="{ ok: item.ok }"><i><Check v-if="item.ok" :size="13" /><AlertTriangle v-else :size="13" /></i><b>{{ item.label }}</b><small>{{ item.detail }}</small></article></div></article></section>
            <section class="finance-detail-columns"><article><header><b>归档账单</b><small>{{ detailBills.length }}</small></header><div class="finance-mini-list"><p v-if="!detailBills.length" class="center-empty">暂无账单</p><div v-for="bill in detailBills" :key="String(bill.id)"><span><b>{{ bill.billNo }}</b><small>{{ bill.accountName }} · {{ statusText(bill.billStatus) }}</small></span><em>待收 ¥{{ money(bill.outstandingAmount) }}</em></div></div></article><article><header><b>对账结果</b><small>{{ detailReconciliations.length }}</small></header><div class="finance-mini-list"><p v-if="!detailReconciliations.length" class="center-empty">暂无对账记录</p><div v-for="item in detailReconciliations" :key="String(item.id)"><span><b>{{ item.statement_no || item.statementNo || '对账单' }}</b><small>{{ item.channel }} · {{ item.status }}</small></span><em>{{ item.difference_count || item.differenceCount || 0 }} 差异</em></div></div></article></section>
          </template>
          <footer class="support-dialog-actions"><button class="quiet" @click="detailOpen = false">关闭</button><button v-if="suggestedAction.title" class="primary" @click="operationRow = detailSubject.accountId ? detailSubject : detailPeriod; operationOpen = true">处理下一步</button></footer>
        </template>
      </div>
    </AppDialog>

    <AppDialog v-model:open="operationOpen" :title="operationTitle" eyebrow="FINANCE OPERATION" hide-actions dialog-class="finance-operation-dialog">
      <div class="finance-operation-body">
        <section class="finance-voucher-head compact" :class="{ admission: props.stage === 'admission' }">
          <div><span>{{ stageMeta.title }}</span><b>{{ operationRow.subjectName || operationRow.periodCode || '当前业务对象' }}</b><small>{{ operationRow.orgName || '当前园区范围' }}</small></div>
          <div v-if="props.stage === 'admission'" class="admission-head-completeness">
            <strong>{{ admissionReadyPercent }}%</strong>
            <span>合同完整度</span>
            <div class="admission-head-checks">
              <em v-for="item in admissionReadyItems" :key="item.label" :class="{ ok: item.ok }">{{ item.label }}</em>
            </div>
            <dl><div><dt>空间</dt><dd>{{ admissionForm.spaceIds.length }}</dd></div><div><dt>表计</dt><dd>{{ admissionForm.meterIds.length }}</dd></div><div><dt>结算日</dt><dd>{{ admissionForm.settlementDay || '—' }}</dd></div></dl>
          </div>
          <ShieldCheck v-else :size="26" />
        </section>
        <template v-if="props.stage === 'admission'">
          <div class="admission-contract-layout">
            <article class="admission-contract-paper">
              <header class="admission-contract-title">
                <span>ENERGY SETTLEMENT CONTRACT</span>
                <h2>能源计量结算合同</h2>
                <label><em>合同编号</em><input v-model="admissionForm.contractNo" placeholder="系统自动生成，可手动调整" /></label>
              </header>
              <section class="contract-recitals">
                <p>鉴于甲方依法或依约负责相关园区、楼宇、空间及配套能源计量设施的运营管理，乙方因经营、办公、住宿、生产或其他合法用途需要使用相应空间及能源服务，双方本着平等自愿、诚实信用、权责一致、数据可追溯的原则，就能源计量、费用结算、账单确认、收款对账及相关事项订立本合同。</p>
                <p>本合同所称能源费用，包括但不限于电力、水、燃气、冷热量、综合能耗服务费及经双方确认应纳入结算范围的其他能源相关费用。除双方另有书面约定外，平台记录、设备档案、合同附件、账期账单及经授权人员确认的业务留痕共同构成本合同履行依据。</p>
              </section>
              <section class="contract-clause">
                <h3>第一条 合同主体</h3>
                <p>甲方为能源服务及结算管理方：<label><AppSelect v-model="admissionForm.orgId" placeholder=""><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect></label>。</p>
                <p>乙方为用能及费用承担方：<label><AppSelect v-model="admissionForm.tenantMode"><option value="existing">选择已有租户</option><option value="new">新建租户主体</option></AppSelect></label>。</p>
                <div v-if="admissionForm.tenantMode === 'existing'" class="contract-inline-grid single">
                  <label><span>乙方名称</span><AppSelect v-model="admissionForm.tenantId" placeholder=""><option v-for="item in tenants" :key="String(item.id)" :value="String(item.id)">{{ item.tenant_name }} · {{ item.contact_name || '未填联系人' }}</option></AppSelect></label>
                </div>
                <div v-else class="contract-inline-grid">
                  <label><span>租户编码</span><input v-model="admissionForm.tenantCode" /></label>
                  <label><span>乙方名称</span><input v-model="admissionForm.tenantName" /></label>
                  <label><span>主体类型</span><AppSelect v-model="admissionForm.tenantType"><option value="ENTERPRISE">企业</option><option value="INDIVIDUAL">个人</option></AppSelect></label>
                  <label><span>信用代码</span><input v-model="admissionForm.creditCode" /></label>
                  <label><span>联系人</span><input v-model="admissionForm.contactName" /></label>
                  <label><span>联系电话</span><input v-model="admissionForm.contactPhone" /></label>
                </div>
                <div class="contract-inline-grid single">
                  <label><span>合同名称</span><input v-model="admissionForm.contractName" /></label>
                </div>
                <p>双方确认，甲方在本合同项下负责结算对象建档、空间范围维护、计量表计关联、账期生成、账单出具及收款对账等管理工作；乙方应保证主体信息、联系人信息、账单接收信息及费用承担关系真实、准确、完整。任何一方信息发生变更的，应及时通过书面文件或平台授权流程完成变更确认。</p>
              </section>
              <section class="contract-clause">
                <h3>第二条 结算空间</h3>
                <p>本合同项下能源结算空间以甲乙双方确认的空间台账为准，具体范围如下：</p>
                <div class="contract-choice-list">
                  <button v-for="space in filteredSpaces" :key="String(space.id)" :class="{ active: admissionForm.spaceIds.includes(String(space.id)) }" @click="admissionForm.spaceIds.includes(String(space.id)) ? admissionForm.spaceIds = admissionForm.spaceIds.filter(id => id !== String(space.id)) : admissionForm.spaceIds.push(String(space.id))"><b>{{ space.space_name }}</b><small>{{ space.space_code }} · {{ space.space_type || '空间' }}</small></button>
                  <p v-if="!filteredSpaces.length" class="center-empty">当前园区暂无空间台账。</p>
                </div>
                <p>乙方实际使用范围与本合同所列空间不一致的，以双方在平台中完成确认的空间台账为准。未经甲方书面或平台授权确认，乙方不得擅自扩大用能范围、转供能源、改变计量设施接线关系或将本合同项下能源服务转由第三方实际使用。</p>
              </section>
              <section class="contract-clause">
                <h3>第三条 合同期限与账期规则</h3>
                <p>本合同期限自<label class="date-field"><input v-model="admissionForm.startDate" type="date" /></label>起至<label class="date-field"><input v-model="admissionForm.endDate" type="date" /></label>止。合同期内，甲方按月或双方确认的账期周期进行能源费用核算，每月<label class="day-field"><input v-model.number="admissionForm.settlementDay" type="number" min="1" max="28" /></label>日为约定结算日；乙方应向甲方交纳保证金人民币<label class="money-field"><input v-model="admissionForm.depositAmount" type="number" min="0" step="0.01" /></label>元。</p>
                <p>账期起止、出账时间、应收形成时间及收款截止时间，以本合同约定、平台账期记录及甲方正式出具的账单为准。保证金如有约定，应优先用于抵扣乙方逾期未付费用、违约金、损害赔偿或合同终止后的未结清费用。</p>
              </section>
              <section class="contract-clause">
                <h3>第四条 结算表计</h3>
                <p>本合同能源用量以接入平台并经双方确认的表计数据为依据，表计倍率默认按平台档案执行。</p>
                <div class="contract-choice-list meter">
                  <button v-for="meter in filteredMeters" :key="String(meter.id)" :class="{ active: admissionForm.meterIds.includes(String(meter.id)) }" @click="admissionForm.meterIds.includes(String(meter.id)) ? admissionForm.meterIds = admissionForm.meterIds.filter(id => id !== String(meter.id)) : admissionForm.meterIds.push(String(meter.id))"><b>{{ meter.device_name || meter.deviceName }}</b><small>{{ meter.device_sn || meter.deviceSn }} · {{ meter.install_location || '未填位置' }} · 倍率 1.000000</small></button>
                  <p v-if="!filteredMeters.length" class="center-empty">当前园区暂无可选设备。</p>
                </div>
                <p>计量表计发生更换、校验、故障、通信中断、倍率调整、补抄、换表或人工修正等情形的，甲方应依据设备档案、采集记录、运维记录、审批记录及合理测算方法进行处理。乙方对计量数据有异议的，应在账单送达后合理期限内提出，并配合甲方进行核验；逾期未提出异议且未能提供相反证据的，视为认可对应账期计量结果。</p>
              </section>
              <section class="contract-clause">
                <h3>第五条 开票与送达</h3>
                <p>账单、收款及对账信息按照下列地址或双方另行确认的地址送达：</p>
                <input class="contract-line-input" v-model="admissionForm.billingAddress" />
                <p>甲方通过平台、电子邮件、短信、纸质文件、系统消息或双方确认的其他方式向乙方发送账单、催缴通知、对账结果、调整单及合同履行相关文件的，均视为有效送达。乙方应及时核对账单金额、用量、单价、税费、减免、调整及已收款项；如需开具发票，应按照甲方要求提供完整、准确的开票资料。</p>
              </section>
              <section class="contract-clause">
                <h3>第六条 费用支付、异议处理与违约责任</h3>
                <p>乙方应按照账单载明的金额、付款期限及收款账户及时足额支付能源费用。乙方逾期付款的，甲方有权依据园区管理制度、合同约定及法律法规采取催缴、暂停非必要服务、限制新增用能、从保证金中抵扣或追究违约责任等措施。乙方对部分费用提出异议的，不影响其对无争议部分费用的按期支付。</p>
                <p>因不可抗力、政府政策调整、供能单位价格调整、公共计量设施异常、第三方通信故障或其他非甲方单方原因导致费用核算发生变化的，双方应依据实际情况、原始记录及公平原则协商处理。协商期间，双方均应采取合理措施减少损失扩大。</p>
              </section>
              <section class="contract-clause contract-signature">
                <h3>第七条 合同生效与附件</h3>
                <p>本合同自双方授权人员确认、平台生效或双方另行约定的生效条件成就之日起生效。合同项下的空间清单、表计清单、计费方案、价格参数、账期账单、收款凭证、调整单、对账记录及操作日志，均为本合同的组成部分，与合同正文具有同等业务效力。</p>
                <div><span class="stamped">甲方确认：<img :src="contractStampUrl" alt="合同专用章" /></span><span>乙方确认：</span><span>生效日期：</span></div>
              </section>
            </article>
          </div>
          <footer><button class="quiet" @click="operationOpen = false">取消</button><button class="primary" :disabled="Boolean(processingRow)" @click="submitAdmission">{{ processingRow ? '保存中…' : '保存合同并生效' }}</button></footer>
        </template>
        <template v-else-if="props.stage === 'schemes'">
          <nav class="admission-wizard-steps scheme-wizard-steps"><span v-for="(label, index) in schemeSteps" :key="label" :class="{ active: schemeStep === index + 1, done: schemeStep > index + 1 }"><i>{{ schemeStep > index + 1 ? '✓' : index + 1 }}</i><b>{{ label }}</b></span></nav>
          <section v-if="schemeStep === 1" class="scheme-operation-form">
            <label class="full"><span>计费对象</span><AppSelect v-model="schemeForm.accountId" placeholder=""><option v-for="item in accounts" :key="String(item.id)" :value="String(item.id)">{{ item.account_name || item.accountName }} · {{ item.org_name || item.orgName || '所属园区' }}</option></AppSelect></label>
            <label><span>方案名称</span><input v-model="schemeForm.ruleName" /></label>
            <label><span>适用范围</span><AppSelect v-model="schemeForm.scopeType"><option value="DEVICE">指定设备</option><option value="ORG">整个组织</option></AppSelect></label>
            <label class="full"><span>{{ schemeForm.scopeType === 'DEVICE' ? '选择设备' : '选择组织' }}</span><AppSelect v-model="schemeForm.scopeId" placeholder=""><option v-for="item in schemeForm.scopeType === 'DEVICE' ? devices : orgs" :key="String(item.id)" :value="String(item.id)">{{ schemeForm.scopeType === 'DEVICE' ? `${item.device_sn || item.deviceSn} · ${item.device_name || item.deviceName}` : item.org_name }}</option></AppSelect></label>
          </section>
          <section v-else-if="schemeStep === 2" class="scheme-operation-form">
            <label class="full"><span>设备型号</span><AppSelect v-model="schemeForm.deviceTypeId" placeholder=""><option v-for="item in deviceTypes" :key="String(item.id)" :value="String(item.id)">{{ item.type_name || item.typeName }}</option></AppSelect></label>
            <label class="full"><span>测点模板</span><div class="scheme-template-row"><AppSelect v-model="schemeForm.templateId" @change="applyMeterTemplate(meterTemplates.find(item => String(item.id) === schemeForm.templateId) || {})"><option value="">自定义测点</option><option v-for="item in meterTemplates" :key="String(item.id)" :value="String(item.id)">{{ item.template_name }}{{ item.owner_username ? ` · ${item.owner_username}` : '' }}</option></AppSelect><button class="quiet" type="button" @click="templateFormOpen = true">配置模板</button></div></label>
            <div class="scheme-point-picker full"><div v-for="point in schemePoints" :key="String(point.id)" class="scheme-point-option"><label><input v-model="schemeForm.metricPointCodes" type="checkbox" :value="String(point.point_code || point.pointCode)" /><span><b>{{ point.point_name || point.pointName || point.point_code }}</b><small>{{ point.point_code }} · {{ point.unit || '—' }}</small></span></label></div><p v-if="!schemePoints.length" class="center-empty">请选择设备型号后加载测点。</p></div>
            <div class="scheme-step-note full"><Layers3 :size="18" /><span>默认选中该设备型号的全部测点，也可以取消后自定义选择。</span></div>
          </section>
          <section v-else-if="schemeStep === 3" class="scheme-operation-form">
            <div class="scheme-price-choice full"><span>计价模型</span><div><button type="button" :class="{ active: schemeForm.priceMode === 'UNIT_PRICE' }" @click="schemeForm.priceMode = 'UNIT_PRICE'">按量单价</button><button type="button" :class="{ active: schemeForm.priceMode === 'FIXED' }" @click="schemeForm.priceMode = 'FIXED'">固定金额</button><button type="button" :class="{ active: schemeForm.priceMode === 'TIME_PERIOD' }" @click="schemeForm.priceMode = 'TIME_PERIOD'">分时电价</button></div></div>
            <label v-if="schemeForm.priceMode === 'TIME_PERIOD'"><span>电价方案</span><div class="scheme-template-row"><AppSelect v-model="schemeForm.tariffPlanId" placeholder=""><option v-for="item in tariffs" :key="String(item.id)" :value="String(item.id)">{{ item.plan_name || item.planName }} · V{{ item.version || 1 }}</option></AppSelect><button class="quiet" type="button" @click="tariffFormOpen = true">新增电价方案</button></div></label>
            <label v-else><span>{{ schemeForm.priceMode === 'FIXED' ? '每账期固定金额' : '结算单价' }}</span><div class="unit-input"><input v-model="schemeForm.unitPrice" type="number" min="0" step="0.0001" /><b>RMB</b></div></label>
            <div class="scheme-mode-cards full">
              <span :class="{ active: schemeForm.priceMode === 'UNIT_PRICE' }"><b>按量单价</b><small>用量 × 单价，适合电/水/气常规结算。</small></span>
              <span :class="{ active: schemeForm.priceMode === 'FIXED' }"><b>固定金额</b><small>每账期固定收费，适合服务费或包月费。</small></span>
              <span :class="{ active: schemeForm.priceMode === 'TIME_PERIOD' }"><b>分时电价</b><small>按尖峰平谷拆分费用，适合电力能耗场景。</small></span>
            </div>
          </section>
          <section v-else class="closing-confirm-sheet admission-summary-sheet">
            <div class="scheme-confirm-card"><header><span>方案确认</span><b>{{ schemeForm.ruleName || '未命名方案' }}</b></header><div class="scheme-confirm-grid"><span>计费对象<strong>{{ accounts.find(item => String(item.id) === schemeForm.accountId)?.account_name || operationRow.subjectName || operationRow.accountName }}</strong></span><span>设备型号<strong>{{ detailTypeName(schemeForm.deviceTypeId) }}</strong></span><span>计费测点<strong>{{ schemeForm.metricPointCodes.length }} 个测点</strong></span><span>计价模型<strong>{{ schemeForm.priceMode === 'UNIT_PRICE' ? '按量单价' : schemeForm.priceMode === 'FIXED' ? '固定金额' : '分时电价' }}</strong></span></div><div class="scheme-confirm-mark">✓ 配置完成，可启用</div></div>
            <p class="finance-operation-copy">确认后将生成启用状态的计费规则、适用范围和价格参数。方案生效后，该对象即可进入出账收款阶段。</p>
          </section>
          <footer><button class="quiet" @click="operationOpen = false">取消</button><button v-if="schemeStep > 1" class="quiet" @click="previousSchemeStep">上一步</button><button v-if="schemeStep < schemeSteps.length" class="primary" @click="nextSchemeStep">下一步</button><button v-else class="primary" :disabled="Boolean(processingRow) || !schemeReady" @click="saveScheme">{{ processingRow ? '保存中…' : '保存并启用' }}</button></footer>
        </template>
        <template v-else-if="props.stage === 'jobs'">
          <div v-if="operationRow.jobStatus === 'READY'" class="bill-operation-panel">
            <div class="finance-check-template"><span v-for="item in operationChecks" :key="String(item.label)" :class="{ ok: item.ok }"><i><Check v-if="item.ok" :size="12" /><CircleAlert v-else :size="12" /></i><b>{{ item.label }}</b><small>{{ item.detail }}</small></span></div>
            <section v-if="preview" class="bill-preview-box">
              <b>试算结果</b><strong>¥{{ money(previewAmount) }}</strong><small>{{ previewDetails.length }} 条费用明细 · {{ previewBlockers.length }} 个阻断项</small>
              <table v-if="previewDetails.length" class="finance-statement-table bill-preview-table">
                <thead><tr><th>设备</th><th>测点</th><th>用量</th><th>单价</th><th>金额</th><th>时段</th></tr></thead>
                <tbody>
                  <tr v-for="item in previewDetails" :key="`${item.ruleId}-${item.deviceId}-${item.tariffPeriodCode || 'std'}`">
                    <td>{{ detailDeviceName(item.deviceId) }}</td>
                    <td>{{ item.pointCode }}</td>
                    <td>{{ Number(item.usage || 0).toFixed(4) }}</td>
                    <td>¥{{ Number(item.unitPrice || 0).toFixed(4) }}</td>
                    <td>¥{{ money(item.amount) }}</td>
                    <td>{{ item.tariffPeriodCode || '标准' }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="previewBlockers.length" class="preview-blocker-list"><span v-for="item in previewBlockers" :key="String(item.code || item.title)"><CircleAlert :size="13" /><b>{{ item.title || item.code }}</b><small>{{ item.detail || item.message }}</small></span></div>
            </section>
            <p v-else class="finance-operation-copy">先试算，确认计量明细和费用金额后再生成草稿账单。</p>
            <footer><button class="quiet" @click="operationOpen = false">取消</button><button class="quiet" :disabled="Boolean(processingRow)" @click="previewCurrentBill">{{ processingRow ? '试算中…' : '账单试算' }}</button><button class="primary" :disabled="Boolean(processingRow) || (preview ? previewBlockers.length > 0 : false)" @click="createCurrentBill">{{ processingRow ? '生成中…' : '生成草稿' }}</button></footer>
          </div>
          <div v-else-if="(operationRow.jobStatus === 'ISSUED' || operationRow.billStatus === 'ISSUED') && Number(operationRow.outstandingAmount || 0) > 0" class="scheme-operation-form">
            <label><span>收款金额</span><input v-model="collectionForm.payAmount" type="number" min="0" step="0.01" /></label>
            <label><span>收款方式</span><AppSelect v-model="collectionForm.payWay"><option>转账</option><option>现金</option><option>银行回单</option><option>DEMO_TRANSFER</option></AppSelect></label>
            <label><span>交易流水号</span><input v-model="collectionForm.transactionNo" /></label>
            <label class="full"><span>备注</span><textarea v-model="collectionForm.remark"></textarea></label>
            <footer class="full"><button class="quiet" @click="operationOpen = false">取消</button><button class="primary" :disabled="Boolean(processingRow)" @click="submitCollection">{{ processingRow ? '登记中…' : '登记收款' }}</button></footer>
          </div>
          <div v-else>
            <p class="finance-operation-copy">当前账单处于 {{ billStatusText(operationRow) }} 状态，确认后将完成审核发布并形成正式应收。</p>
            <footer><button class="quiet" @click="operationOpen = false">取消</button><button class="primary" :disabled="Boolean(processingRow)" @click="confirmOperation">{{ processingRow ? '处理中…' : '确认处理' }}</button></footer>
          </div>
        </template>
        <template v-else>
          <div class="closing-confirm-sheet">
            <section class="closing-report-card">
              <header><p class="eyebrow">MONTH-END CHECK REPORT</p><h3>月结检查报告</h3></header>
              <div class="finance-check-template">
                <span v-for="item in closingReport" :key="item.label" :class="{ ok: item.ok }"><i><Check v-if="item.ok" :size="12" /><CircleAlert v-else :size="12" /></i><b>{{ item.label }}</b><small>{{ item.value }}</small></span>
              </div>
            </section>
            <dl><div><dt>账期</dt><dd>{{ operationRow.periodCode }}</dd></div><div><dt>园区</dt><dd>{{ operationRow.orgName }}</dd></div><div><dt>账单数</dt><dd>{{ operationRow.billCount || 0 }}</dd></div><div><dt>已发布金额</dt><dd>¥{{ money(operationRow.issuedAmount) }}</dd></div><div><dt>未收金额</dt><dd>¥{{ money(operationRow.outstandingAmount) }}</dd></div><div><dt>差异数</dt><dd>{{ operationRow.differenceCount || 0 }}</dd></div></dl>
            <p class="finance-operation-copy">只有账单已发布、差异已处理且满足月结条件时，系统才允许关账。关账后将形成归档状态和操作留痕。</p>
            <footer><button class="quiet" @click="operationOpen = false">取消</button><button class="primary" :disabled="Boolean(processingRow) || operationRow.closingStatus !== 'CLOSEABLE'" @click="confirmOperation">{{ processingRow ? '关账中…' : '确认关账' }}</button></footer>
          </div>
        </template>
      </div>
    </AppDialog>

    <AppDialog v-model:open="scheduleOpen" title="自动出账计划" eyebrow="AUTOMATED BILLING SCHEDULE" hide-actions dialog-class="schedule-dialog">
      <div class="schedule-dialog-body">
        <header class="schedule-dialog-toolbar"><div><b>自动出账计划</b><small>计划按绑定合同生成账单，账单生成后进入下方账单列表。</small></div><button class="primary" type="button" @click="resetScheduleForm(); scheduleFormOpen = true">新增计划</button></header>
        <div v-if="scheduleLoading" class="center-empty">计划加载中…</div>
        <div v-else-if="!schedules.length" class="center-empty">暂无自动出账计划，请先新增。</div>
        <div v-else class="schedule-table-wrap"><table class="schedule-table"><thead><tr><th>计划名称</th><th>绑定合同</th><th>执行规则</th><th>付款期限</th><th>上次执行</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="row in schedules" :key="String(row.id)"><td><b>{{ row.schedule_name || row.scheduleName }}</b><small>{{ row.org_name || row.orgName || '当前园区' }}</small></td><td class="schedule-contract-cell">{{ scheduleContractNames(row) }}</td><td>每月 {{ row.execute_day || row.executeDay }} 日 {{ String(row.execute_time || row.executeTime || '').slice(0, 5) }}</td><td>{{ row.payment_term_days || row.paymentTermDays || 15 }} 天</td><td>{{ row.last_run_at || row.lastRunAt || '尚未执行' }}</td><td><span :class="['schedule-status', Number(row.enabled) === 1 ? 'enabled' : 'disabled']">{{ Number(row.enabled) === 1 ? '已启用' : '已停用' }}</span></td><td class="schedule-actions"><button class="icon-action" title="立即执行" type="button" @click="runSchedule(row)"><ReceiptText :size="15" /></button><button class="icon-action" title="编辑" type="button" @click="editSchedule(row)"><Eye :size="15" /></button><button class="icon-action danger" title="删除" type="button" @click="removeSchedule(row)"><span>×</span></button></td></tr></tbody></table></div>
      </div>
    </AppDialog>
    <AppDialog v-model:open="scheduleFormOpen" :title="scheduleForm.id ? '编辑自动出账计划' : '新增自动出账计划'" eyebrow="SCHEDULE CONFIGURATION" hide-actions dialog-class="schedule-form-dialog">
      <div class="schedule-form-body"><p v-if="error" class="finance-inline-error">{{ error }}</p><div class="schedule-form-grid"><label><span>计划名称</span><input v-model="scheduleForm.scheduleName" placeholder="例如：月度能源账单出账计划" /></label><label><span>园区</span><AppSelect v-model="scheduleForm.orgId"><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect></label><label><span>每月执行日</span><input v-model.number="scheduleForm.executeDay" type="number" min="1" max="28" /></label><label><span>执行时间</span><input v-model="scheduleForm.executeTime" type="time" /></label><label><span>付款期限</span><div class="schedule-unit-input"><input v-model.number="scheduleForm.paymentTermDays" type="number" min="0" max="90" /><b>天</b></div></label><label class="schedule-switch-field"><span>计划状态</span><button type="button" :class="['schedule-switch', { active: scheduleForm.enabled }]" @click="scheduleForm.enabled = !scheduleForm.enabled"><i></i>{{ scheduleForm.enabled ? '启用' : '停用' }}</button></label><label class="full"><span>计划备注</span><textarea v-model="scheduleForm.remark" placeholder="可填写账期范围或财务说明" /></label></div><section class="schedule-contract-picker"><header><div><b>选择合同</b><small>仅显示当前园区已启用合同，可多选</small></div><strong>{{ scheduleForm.contractIds.length }} 份已选</strong></header><div class="schedule-contract-options"><label v-for="contract in scheduleContracts.filter(item => !scheduleForm.orgId || String(item.org_id || item.orgId) === String(scheduleForm.orgId))" :key="String(contract.id)" :class="{ selected: scheduleForm.contractIds.includes(String(contract.id)) }"><input v-model="scheduleForm.contractIds" type="checkbox" :value="String(contract.id)" :disabled="String(contract.status || '') !== 'ACTIVE'" /><span><b>{{ contractLabel(contract) }}</b><small>{{ contract.contract_no || contract.contractNo || '—' }} · {{ contract.tenant_name || contract.tenantName || '未命名租户' }}</small></span><em>{{ statusText(contract.status) }}</em></label><p v-if="!scheduleContracts.some(item => !scheduleForm.orgId || String(item.org_id || item.orgId) === String(scheduleForm.orgId))" class="center-empty">当前园区暂无可绑定合同。</p></div></section><footer class="schedule-form-actions"><button class="quiet" type="button" @click="scheduleFormOpen = false">取消</button><button class="primary" type="button" :disabled="scheduleLoading" @click="saveSchedule">{{ scheduleLoading ? '保存中…' : '保存计划' }}</button></footer></div>
    </AppDialog>

    <AppDialog v-model:open="templateFormOpen" title="配置计量模板" eyebrow="METER TEMPLATE" hide-actions dialog-class="center-detail-dialog template-dialog">
      <div class="scheme-template-form"><label><span>模板名称</span><input v-model="templateForm.templateName" placeholder="例如：电表结算全量测点" /></label><label><span>模板说明</span><textarea v-model="templateForm.description" placeholder="说明模板适用场景" /></label><label class="template-all-points"><input v-model="templateForm.allPoints" type="checkbox" />保存为该设备型号的全部测点模板</label><footer class="support-dialog-actions"><button class="quiet" type="button" @click="templateFormOpen = false">取消</button><button class="primary" type="button" @click="saveMeterTemplate">保存模板</button></footer></div>
    </AppDialog>
    <AppDialog v-model:open="tariffFormOpen" title="新增电价方案" eyebrow="TARIFF PLAN" hide-actions dialog-class="center-detail-dialog template-dialog"><div class="scheme-template-form"><label><span>方案名称</span><input v-model="tariffForm.planName" placeholder="例如：园区工商业分时电价" /></label><label><span>方案编码</span><input v-model="tariffForm.planCode" placeholder="可留空自动生成" /></label><label><span>版本号</span><input v-model.number="tariffForm.version" type="number" min="1" /></label><label><span>说明</span><textarea v-model="tariffForm.remark" /></label><footer class="support-dialog-actions"><button class="quiet" type="button" @click="tariffFormOpen = false">取消</button><button class="primary" type="button" @click="saveInlineTariff">保存并选择</button></footer></div></AppDialog>

    <AppDialog v-model:open="financeDrawerOpen" title="财务流水与凭证" eyebrow="FINANCE CONTROL" hide-actions dialog-class="finance-operation-dialog finance-control-dialog">
      <div class="finance-control-body">
        <nav class="bill-detail-tabs"><button type="button" :class="{ active: financeDrawerTab === 'statements' }" @click="financeDrawerTab = 'statements'">银行流水与勾兑</button><button type="button" :class="{ active: financeDrawerTab === 'vouchers' }" @click="financeDrawerTab = 'vouchers'">正式财务凭证</button></nav>
        <p v-if="financeImportError" class="finance-inline-error">{{ financeImportError }}</p>
        <template v-if="financeDrawerTab === 'statements'">
          <section class="finance-import-panel"><header><div><b>导入银行流水</b><small>支持 JSON 数组或 CSV 文本，重复流水号自动跳过。</small></div><button class="quiet" type="button" @click="financeImportText = JSON.stringify([{ externalTransactionNo: 'BANK-DEMO-001', statementTime: new Date().toISOString().slice(0, 19), payerName: '示例租户', amount: 0, narrative: '请替换金额后导入' }], null, 2)">填充格式</button></header><textarea v-model="financeImportText" placeholder='[{"externalTransactionNo":"流水号","statementTime":"2026-08-21T10:00:00","payerName":"付款方","amount":100.00}]'></textarea><button class="primary" type="button" :disabled="financeImporting" @click="importFinanceStatements">{{ financeImporting ? '导入中…' : '导入流水' }}</button></section>
          <section class="finance-statement-list"><header><b>待处理流水</b><button class="quiet" type="button" @click="loadFinanceStatements">刷新</button></header><p v-if="financeStatementLoading" class="center-empty">流水加载中…</p><p v-else-if="!financeStatements.length" class="center-empty">暂无银行流水。</p><button v-for="row in financeStatements" :key="String(row.id)" type="button" class="finance-statement-row" :class="{ selected: financeStatement.id === row.id }" @click="selectFinanceStatement(row)"><span><b>{{ row.external_transaction_no }}</b><small>{{ row.payer_name || '未知付款方' }} · {{ row.statement_time }}</small></span><strong>¥{{ money(row.amount) }}</strong><em>{{ row.statement_status }}</em></button></section>
          <section v-if="financeStatement.id" class="finance-match-panel"><header><div><b>流水勾兑</b><small>{{ financeStatement.external_transaction_no }} · 已匹配 ¥{{ money(financeStatement.matched_amount) }} / ¥{{ money(financeStatement.amount) }}</small></div><span>{{ financeStatement.statement_status }}</span></header><div class="finance-match-candidates"><label class="finance-match-amount"><span>本次匹配金额</span><input v-model="financeMatchAmount" type="number" min="0.01" step="0.01" /></label><p v-if="!financeCandidates.length" class="center-empty">没有找到可匹配的待收账单。</p><button v-for="candidate in financeCandidates" :key="String(candidate.bill_id)" class="finance-candidate-row" type="button" @click="autoMatchFinanceStatement(financeStatement)"><span><b>{{ candidate.bill_no }}</b><small>{{ candidate.tenant_name_snapshot || candidate.account_name }} · {{ candidate.bill_cycle }}</small></span><strong>¥{{ money(candidate.outstanding_amount) }}</strong><em>匹配本次金额</em></button></div><div v-if="financeStatement.statement_status !== 'MATCHED'" class="finance-difference-form"><input v-model="financeDifferenceReason" placeholder="差异原因，例如付款方名称不一致" /><button class="quiet difference-action" type="button" @click="markFinanceDifference(financeStatement)">标记为差异</button></div></section>
        </template>
        <template v-else>
          <section class="finance-voucher-result" v-if="voucherResult.id"><header><b>{{ voucherResult.voucher_no }}</b><span>{{ voucherResult.voucher_status }}</span></header><dl><div><dt>凭证类型</dt><dd>{{ voucherResult.voucher_type }}</dd></div><div><dt>借方合计</dt><dd>¥{{ money(voucherResult.total_debit) }}</dd></div><div><dt>贷方合计</dt><dd>¥{{ money(voucherResult.total_credit) }}</dd></div></dl><table class="finance-voucher-lines"><thead><tr><th>科目</th><th>摘要</th><th>借方</th><th>贷方</th></tr></thead><tbody><tr v-for="line in voucherLines" :key="String(line.id)"><td>{{ line.account_code }} {{ line.account_name }}</td><td>{{ line.summary }}</td><td>¥{{ money(line.debit_amount) }}</td><td>¥{{ money(line.credit_amount) }}</td></tr></tbody></table><div class="bill-detail-footer-actions"><button class="primary" type="button" @click="exportCurrentVoucher">导出凭证数据</button></div></section><div v-else class="finance-stage-note"><ReceiptText :size="28" /><b>正式凭证从账单详情生成</b><span>打开账单详情，确认金额后点击“生成正式应收凭证”。凭证会保存借贷分录并建立归档关联。</span></div>
        </template>
      </div>
    </AppDialog>

    <AppDialog v-model:open="receiptOpen" title="电子付款凭证" eyebrow="PAYMENT RECEIPT" hide-actions dialog-class="payment-receipt-dialog">
      <div class="payment-receipt-paper">
        <header class="payment-receipt-title"><span>园区能源结算服务</span><h2>电子付款凭证</h2><small>付款后凭证 · 非税务发票</small></header>
        <section class="payment-receipt-meta"><div><span>凭证编号</span><b>{{ receiptBillNo }}</b></div><div><span>生成时间</span><b>{{ receiptTime }}</b></div><div class="receipt-code"><QrCode :size="62" /><small>凭证核验码<br />{{ receiptTransactionNo }}</small></div></section>
        <section class="payment-receipt-parties"><div><span>付款方</span><b>{{ receiptSubject }}</b></div><div><span>收款方</span><b>{{ operationRow.orgName || '园区能源管理方' }}</b></div><div><span>付款方式</span><b>{{ collectionForm.payWay || '—' }}</b></div><div><span>对应账期</span><b>{{ billCycle }}</b></div></section>
        <table class="payment-receipt-table"><thead><tr><th>项目编码</th><th>收款项目名称</th><th>单位</th><th>数量</th><th>收款标准</th><th>金额</th></tr></thead><tbody><tr><td>{{ receiptBillNo }}</td><td>园区能源计量结算款</td><td>元</td><td>1</td><td>{{ receiptAmount.toFixed(2) }}</td><td>{{ receiptAmount.toFixed(2) }}</td></tr><tr class="receipt-total"><td colspan="5">合计</td><td>¥{{ money(receiptAmount) }}</td></tr></tbody></table>
        <footer class="payment-receipt-footer"><span>收款确认（平台）：已收款</span><span>交易流水号：{{ receiptTransactionNo }}</span><span class="receipt-stamp">收款专用章</span></footer>
        <p class="payment-receipt-note">本凭证用于证明平台收款记录，不替代依法开具的税务发票。可下载或打印留存。</p>
        <div class="support-dialog-actions"><button class="quiet" type="button" @click="receiptOpen = false">关闭</button><button class="primary" type="button" @click="printReceipt">打印凭证</button></div>
      </div>
    </AppDialog>

    <AppDialog v-model:open="reportOpen" :title="reportTitle" eyebrow="FINANCE STATEMENT" hide-actions dialog-class="finance-report-dialog">
      <div class="finance-report-dialog-body">
        <section class="formal-report-head">
          <div><b>智园能管结算财务报表</b><span>报表口径：{{ billCycle }} 账期 / {{ orgId ? (orgs.find(item => String(item.id) === orgId)?.org_name || '指定园区') : '全部授权园区' }}</span></div>
          <dl><div><dt>对象数</dt><dd>{{ reportObjectTotal }}</dd></div><div><dt>合计金额</dt><dd>¥{{ money(reportAmountTotal) }}</dd></div><div><dt>制表时间</dt><dd>{{ new Date().toLocaleString('zh-CN') }}</dd></div></dl>
        </section>
        <table class="finance-statement-table formal-report-table">
          <thead><tr><th>序号</th><th>对象/账期</th><th>园区</th><th>准入</th><th>方案</th><th>账务状态</th><th>金额</th></tr></thead>
          <tbody>
            <tr v-for="(row, index) in reportRows" :key="String(row.accountId || row.periodId || row.id)">
              <td>{{ index + 1 }}</td><td>{{ row.subjectName || row.periodCode }}</td><td>{{ row.orgName }}</td><td>{{ statusText(row.admissionStatus) }}</td><td>{{ statusText(row.schemeStatus) }}</td><td>{{ reportStatus(row) }}</td><td class="money-cell">¥{{ money(row.outstandingAmount || row.issuedAmount || row.totalAmount) }}</td>
            </tr>
            <tr v-if="!reportRows.length"><td colspan="7">当前条件下暂无报表数据。</td></tr>
            <tr v-else class="report-total-row"><td colspan="6">合计</td><td class="money-cell">¥{{ money(reportAmountTotal) }}</td></tr>
          </tbody>
        </table>
        <p class="formal-report-note">本报表用于结算与财务模块查询穿透，不在总览页直接办理出账、收款或关账动作。</p>
        <footer class="support-dialog-actions"><button class="quiet" @click="reportOpen = false">关闭</button></footer>
      </div>
    </AppDialog>
  </section>
</template>
