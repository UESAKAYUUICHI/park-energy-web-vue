<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { showAppAlert } from "@/composables/useAppAlert";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleX,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  History,
  Link2,
  LockKeyhole,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "@lucide/vue";
import AppDialog from "@/components/app/AppDialog.vue";
import AppConfirmDialog from "@/components/app/AppConfirmDialog.vue";
import AppSelect from "@/components/app/AppSelect.vue";
import BillingContractEditor from "@/components/billing/BillingContractEditor.vue";
import BillingAuxManagerDialog from "@/components/billing/BillingAuxManagerDialog.vue";
import {
  applyBillingInvoiceRed,
  bill,
  billAction as apiBillAction,
  billingAdjustmentAction,
  billingAutoSchedules,
  billingErp,
  billingErpPeriod,
  billingInvoice,
  billingInvoices,
  billingPeriodAction,
  billingPeriodCheck,
  billingPeriods,
  billingStatementCandidates,
  autoMatchBillingStatement,
  billingStatementImportBatches,
  billingStatementPaymentCandidates,
  billingStatements,
  billingSupplement,
  billingSupplements,
  billingVoucher,
  billingWorkflowPreview,
  confirmBillingWorkflow,
  confirmBillingInvoiceRed,
  contract,
  contracts,
  contractAction as apiContractAction,
  createBillingAdjustment,
  createBillingSupplement,
  createBillingVoucher,
  createResource,
  deleteBillingAutoSchedule,
  deleteContract,
  deliverBillingInvoice,
  exportBillingVoucher,
  importBillingStatementFile,
  importBillingStatements,
  issueBillingInvoice,
  listResource,
  matchBillingStatement,
  matchBillingStatementPayment,
  monthlyArchivePreview,
  simulateBillingSettlement,
  postBillingVoucher,
  requestBillingInvoice,
  reverseBillingBankMatch,
  reversePayment,
  rootOrgs,
  runBillingAutoSchedule,
  saveBillingAutoSchedule,
  saveContract,
  billingSupplementAction,
  settlementArchives,
  finalizeMonthlyArchive,
  updateResource,
  uploadBillingInvoiceFile,
} from "@/api/platform";
import type { RecordRow } from "@/types/domain";
import contractStamp from "@/assets/contract-stamp.png";

type CenterView = "overview" | "rules" | "payments" | "archives";
const props = defineProps<{ view: CenterView }>();
const monthValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const defaultCycle = () => {
  const date = new Date();
  if (props.view === "payments" || props.view === "archives") {
    date.setMonth(date.getMonth() - 1);
  }
  return monthValue(date);
};
const orgs = ref<RecordRow[]>([]),
  orgId = ref(""),
  cycle = ref(defaultCycle()),
  keyword = ref(""),
  payload = ref<RecordRow>({}),
  loading = ref(false),
  error = ref("");
const contractRows = ref<RecordRow[]>([]),
  contractKeyword = ref(""),
  contractStatus = ref(""),
  contractPage = ref(1),
  contractPageSize = ref(10),
  contractTotal = ref(0),
  billPage = ref(1),
  billPageSize = ref(10),
  paymentStage = ref("todo"),
  archiveStage = ref("todo"),
  spaces = ref<RecordRow[]>([]),
  devices = ref<RecordRow[]>([]),
  tenants = ref<RecordRow[]>([]),
  accounts = ref<RecordRow[]>([]),
  deviceTypes = ref<RecordRow[]>([]);
const auxMode = ref<"spaces" | "pricing">("spaces"),
  auxRows = ref<RecordRow[]>([]),
  auxKeyword = ref(""),
  auxStatus = ref(""),
  schedules = ref<RecordRow[]>([]),
  scheduleContracts = ref<RecordRow[]>([]),
  archives = ref<RecordRow[]>([]),
  statements = ref<RecordRow[]>([]),
  candidates = ref<RecordRow[]>([]),
  selectedStatement = ref<RecordRow>({});
const detail = ref<RecordRow>({}),
  dialog = ref<
    | "none"
    | "contract"
    | "bill"
    | "collection"
    | "workflow"
    | "finance"
    | "archive"
    | "scheduleList"
    | "schedule"
    | "aux"
    | "supplement"
  >("none"),
  formalContractOpen = ref(false),
  saving = ref(false);
const contractEditorOpen = ref(false);
const auxManagerOpen = ref(false);
const pricingContract = ref<RecordRow | null>(null);
const archiveTab = ref<
  | "overview"
  | "checks"
  | "bills"
  | "finance"
  | "vouchers"
  | "invoices"
  | "supplements"
  | "records"
>("overview");
const supplementRows = ref<RecordRow[]>([]);
const supplementForm = reactive({ periodId: "", contractId: "", settlementType: "LATE_CONTRACT", startDate: "", endDate: "", paymentTermDays: "15", reason: "", remark: "" });
const supplementArchiveOpen = ref(false),
  supplementArchiveLoading = ref(false),
  supplementArchiveDetail = ref<RecordRow>({});
const archiveActionDialog = ref<
  "none" | "statementImport" | "paymentMatch" | "voucher" | "bill"
>("none");
const archiveActionLoading = ref(false),
  actionStatements = ref<RecordRow[]>([]),
  actionPaymentCandidates = ref<RecordRow[]>([]),
  selectedActionStatement = ref<RecordRow>({}),
  selectedArchivePayment = ref<RecordRow>({}),
  voucherDetail = ref<RecordRow>({});
const statementForm = reactive({
  externalTransactionNo: "",
  statementTime: "",
  payerName: "",
  payerAccount: "",
  amount: "",
  narrative: "",
});
const archiveConfirmOpen = ref(false),
  archiveConfirmKind = ref<"close" | "reopen">("close"),
  archiveConfirmRow = ref<RecordRow | null>(null),
  archiveConfirming = ref(false),
  reopenReason = ref("");
const monthlyArchiveStep = ref<0 | 1 | 2 | 3>(0),
  monthlyArchiveTarget = ref<RecordRow | null>(null),
  monthlyArchiveReview = ref<RecordRow>({}),
  monthlyArchiveLoading = ref(false),
  archiveHistoryOpen = ref(false),
  archiveHistoryLoading = ref(false),
  archiveHistoryRows = ref<RecordRow[]>([]);
const scheduleSupplementConfirmOpen = ref(false),
  skippedSchedule = ref<RecordRow | null>(null),
  skippedRun = ref<RecordRow>({}),
  generatingScheduleSupplement = ref(false);
const matchReverseOpen = ref(false),
  matchReverseRow = ref<RecordRow | null>(null),
  matchReverseReason = ref(""),
  matchReversing = ref(false);
const billRiskOpen = ref(false),
  billRiskKind = ref<"reversePayment" | "voidBill">("reversePayment"),
  billRiskRow = ref<RecordRow | null>(null),
  billRiskReason = ref(""),
  billRiskSaving = ref(false);
const adjustmentOpen = ref(false),
  adjustmentSaving = ref(false),
  adjustmentForm = reactive({
    type: "DISCOUNT",
    amount: "",
    reason: "",
    remark: "",
  });
const invoiceOpen = ref(false),
  invoiceMode = ref<"list" | "request" | "detail">("list"),
  invoiceRows = ref<RecordRow[]>([]),
  invoiceDetail = ref<RecordRow>({}),
  invoiceLoading = ref(false),
  invoiceFile = ref<File | null>(null);
const invoiceForm = reactive({
  billIds: [] as unknown[],
  invoiceType: "NORMAL",
  invoiceTitle: "",
  taxpayerNo: "",
  email: "",
  mobile: "",
  remark: "",
  redReason: "",
});
const bankImportBatches = ref<RecordRow[]>([]),
  bankImportResult = ref<RecordRow>({}),
  bankImporting = ref(false);
let errorTimer: ReturnType<typeof setTimeout> | undefined;
watch(error, (value) => {
  if (errorTimer) clearTimeout(errorTimer);
  if (value)
    errorTimer = setTimeout(() => {
      error.value = "";
    }, 3200);
});
const confirmOpen = ref(false),
  confirmKind = ref<"terminate" | "delete">("terminate"),
  confirmContract = ref<RecordRow | null>(null),
  confirming = ref(false),
  scheduleDeleteOpen = ref(false),
  scheduleDeleteTarget = ref<RecordRow | null>(null),
  scheduleDeleting = ref(false);
const form = reactive({
  id: "",
  tenantId: "",
  orgId: "",
  contractNo: "",
  contractName: "",
  startDate: "",
  endDate: "",
  spaceIds: [] as string[],
  meterIds: [] as string[],
});
const priceForm = reactive({
  id: "",
  accountId: "",
  ruleName: "",
  deviceTypeId: "",
  priceMode: "UNIT_PRICE",
  points: "",
  price: "",
});
const collection = reactive({
    row: {} as RecordRow,
    amount: "",
    way: "银行转账",
    transactionNo: "",
    remark: "",
  }),
  schedule = reactive({
    orgId: "",
    name: "月度能源自动出账",
    day: 1,
    time: "02:00",
    term: 15,
    enabled: 1,
    contractIds: [] as string[],
  });
const workflowRow = ref<RecordRow>({}),
  workflowPreview = ref<RecordRow>({}),
  workflowAction = ref<"review" | "issue" | "collect">("review"),
  workflowSaving = ref(false);
const title = computed(
  () =>
    ({
      overview: "业务总览",
      rules: "结算规则",
      payments: "账单支付",
      archives: "结算档案",
    })[props.view],
);
const rows = computed(() =>
    Array.isArray(payload.value.rows)
      ? (payload.value.rows as RecordRow[])
      : [],
  ),
  bills = computed(() =>
    Array.isArray(payload.value.billRows)
      ? (payload.value.billRows as RecordRow[])
      : [],
  ),
  paymentStages = computed(() => [
    { key: "todo", label: "待我处理" },
    { key: "review", label: "待审核" },
    { key: "issue", label: "待发布" },
    { key: "collect", label: "待收款" },
    { key: "invoice", label: "待开票" },
    { key: "done", label: "已完成" },
    { key: "all", label: "全部" },
  ]),
  paymentBills = computed(() => {
    if (paymentStage.value === "all") return bills.value;
    return bills.value.filter((row) => {
      const stage = billWorkflowStage(row);
      return paymentStage.value === "todo"
        ? !["done"].includes(stage)
        : stage === paymentStage.value;
    });
  }),
  pagedBills = computed(() =>
    paymentBills.value.slice(
      (billPage.value - 1) * billPageSize.value,
      billPage.value * billPageSize.value,
    ),
  ),
  periods = computed(() =>
    Array.isArray(payload.value.periods)
      ? (payload.value.periods as RecordRow[])
      : [],
  ),
  summary = computed(() => (payload.value.summary as RecordRow) || {}),
  jobSummary = computed(() => (payload.value.jobSummary as RecordRow) || {}),
  todos = computed(() =>
    Array.isArray(payload.value.todos)
      ? (payload.value.todos as RecordRow[])
      : [],
  );
const archiveSummary = computed(() => ({
  receivable: periods.value.reduce(
    (n, r) => n + Number(r.issuedAmount || r.issued_amount || 0),
    0,
  ),
  paid: periods.value.reduce((n, r) => n + Number(r.paidAmount || r.paid_amount || 0), 0),
  outstanding: periods.value.reduce(
    (n, r) => n + Number(r.outstandingAmount || r.outstanding_amount || 0),
    0,
  ),
  completed: (Array.isArray(payload.value.archiveItems)
    ? (payload.value.archiveItems as RecordRow[])
    : []).filter((r) => ["COMPLETED", "MONTH_ARCHIVED"].includes(String(r.itemStatus || r.item_status))).length,
}));
const detailChecks = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.checks)
    ? (detail.value.checks as RecordRow[])
    : [],
);
const detailBills = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.bills) ? (detail.value.bills as RecordRow[]) : [],
);
const detailSupplements = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.supplements) ? (detail.value.supplements as RecordRow[]) : [],
);
const detailPayments = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.payments)
    ? (detail.value.payments as RecordRow[])
    : [],
);
const detailStatements = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.statements)
    ? (detail.value.statements as RecordRow[])
    : [],
);
const detailVouchers = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.vouchers)
    ? (detail.value.vouchers as RecordRow[])
    : [],
);
const detailAdjustments = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.adjustments)
    ? (detail.value.adjustments as RecordRow[])
    : [],
);
const detailEvents = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.events)
    ? (detail.value.events as RecordRow[])
    : [],
);
const detailInvoices = computed<RecordRow[]>(() =>
  Array.isArray(detail.value.invoices)
    ? (detail.value.invoices as RecordRow[])
    : [],
);
const detailArchived = computed(
  () =>
    String(
      detail.value.closingStatus ||
        detail.value.closing_status ||
        detail.value.archiveStatus ||
        (detail.value.archive as RecordRow | undefined)?.archive_status,
    ).toUpperCase() === "ARCHIVED",
);
const pageWindow = (page: number, count: number) => {
  const start = Math.max(1, Math.min(page - 2, Math.max(1, count - 4)));
  const end = Math.min(count, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};
const contractDetail = computed<any>(() => {
  const x = detail.value;
  const spaces = Array.isArray(x.spaces)
    ? x.spaces
    : Array.isArray(x.spaceList)
      ? x.spaceList
      : [];
  const meters = Array.isArray(x.meters)
    ? x.meters
    : Array.isArray(x.meterList)
      ? x.meterList
      : [];
  const rules = Array.isArray(x.rules)
    ? x.rules
    : Array.isArray(x.ruleList)
      ? x.ruleList
      : [];
  return {
    ...x,
    contractNo: x.contractNo || x.contract_no,
    contractName: x.contractName || x.contract_name,
    tenantName: x.tenantName || x.tenant_name,
    contactName: x.contactName || x.contact_name,
    orgName: x.orgName || x.org_name,
    startDate: x.startDate || x.start_date,
    endDate: x.endDate || x.end_date,
    createdTime: x.createdTime || x.created_time || x.create_time,
    spaces,
    meters,
    rules,
    spaceCount: spaces.length || Number(x.spaceCount ?? x.space_count ?? 0),
    meterCount: meters.length || Number(x.meterCount ?? x.meter_count ?? 0),
    ruleCount: rules.length || Number(x.ruleCount ?? x.rule_count ?? 0),
  };
});
const detailItems = computed<RecordRow[]>(() => {
  const x = detail.value;
  return (
    Array.isArray(x.items)
      ? x.items
      : Array.isArray(x.itemList)
        ? x.itemList
        : Array.isArray(x.details)
          ? x.details
          : []
  ) as RecordRow[];
});
const billWorkflowStage = (row: RecordRow) => {
  const billStatus = String(row.billStatus || row.bill_status || "").toUpperCase();
  if (billStatus === "DRAFT") return "review";
  if (["REVIEWED", "REVIEWING"].includes(billStatus)) return "issue";
  if (Number(row.outstandingAmount ?? row.outstanding_amount ?? 0) > 0) return "collect";
  if (!row.invoiceId && !row.invoice_id) return "invoice";
  return "done";
};
const paymentStageCount = (stage: string) =>
  stage === "todo"
    ? bills.value.filter((row) => billWorkflowStage(row) !== "done").length
    : stage === "all"
      ? bills.value.length
      : bills.value.filter((row) => billWorkflowStage(row) === stage).length;
const paymentNextActionLabel = (row: RecordRow) =>
  ({ review: "审核账单", issue: "确认出账", collect: "模拟到账", invoice: "申请开票" } as Record<string, string>)[billWorkflowStage(row)] || "";
const runPaymentNextAction = (row: RecordRow) => {
  const stage = billWorkflowStage(row);
  if (["review", "issue", "collect"].includes(stage)) void openWorkflow(row, stage as "review" | "issue" | "collect");
  else if (stage === "invoice") requestInvoiceForBill(row);
};
const archiveItems = computed<RecordRow[]>(() =>
  Array.isArray(payload.value.archiveItems)
    ? (payload.value.archiveItems as RecordRow[])
    : rows.value,
);
const archiveItemStage = (row: RecordRow) => {
  const status = String(row.itemStatus || row.item_status || "").toUpperCase();
  if (["COMPLETED", "MONTH_ARCHIVED", "VOID"].includes(status)) return "archived";
  if (["RECONCILING", "VOUCHER_PENDING", "INVOICE_PENDING"].includes(status)) return "check";
  return "todo";
};
const archiveStages = computed(() => [
  { key: "todo", label: "待我处理" },
  { key: "check", label: "待完结" },
  { key: "archived", label: "已完结" },
  { key: "all", label: "全部" },
]);
const filteredArchiveItems = computed(() =>
  archiveItems.value.filter((row) =>
    archiveStage.value === "all"
      ? true
      : archiveStage.value === "todo"
        ? archiveItemStage(row) !== "archived"
        : archiveItemStage(row) === archiveStage.value,
  ),
);
const archiveStageCount = (stage: string) =>
  stage === "todo"
    ? archiveItems.value.filter((row) => archiveItemStage(row) !== "archived").length
    : stage === "all"
      ? archiveItems.value.length
      : archiveItems.value.filter((row) => archiveItemStage(row) === stage).length;
const monthlyPeriodTarget = computed<RecordRow | null>(() => {
  if (!periods.value.length) return null;
  if (orgId.value) {
    return periods.value.find((row) => String(row.orgId || row.org_id) === orgId.value) || null;
  }
  return periods.value.length === 1 ? periods.value[0] || null : null;
});
const monthFinalArchived = computed(() =>
  String(
    monthlyPeriodTarget.value?.closingStatus ||
      monthlyPeriodTarget.value?.closing_status ||
      monthlyPeriodTarget.value?.archiveStatus ||
      monthlyPeriodTarget.value?.archive_status ||
      "",
  ).toUpperCase() === "ARCHIVED",
);
const monthlyArchiveSummary = computed<RecordRow>(() =>
  (monthlyArchiveReview.value.summary as RecordRow) || {},
);
const monthlyArchiveEvidence = computed<RecordRow>(() =>
  (monthlyArchiveReview.value.evidence as RecordRow) || {},
);
const monthlyArchiveChecks = computed<RecordRow[]>(() =>
  Array.isArray(monthlyArchiveReview.value.checks)
    ? (monthlyArchiveReview.value.checks as RecordRow[])
    : [],
);
const monthlyArchiveBills = computed<RecordRow[]>(() =>
  Array.isArray(monthlyArchiveReview.value.bills)
    ? (monthlyArchiveReview.value.bills as RecordRow[])
    : [],
);
const money = (v: unknown) =>
    Number(v || 0).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  value = (r: RecordRow, ...ks: string[]) =>
    ks
      .map((k) => r[k])
      .find((v) => v !== undefined && v !== null && v !== "") || "—";
const dateText = (v: unknown, withTime = false) => {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }
      : {}),
  };
  return new Intl.DateTimeFormat("zh-CN", options)
    .format(d)
    .replaceAll("/", "-");
};
const periodText = (v: unknown) =>
  ({
    SHARP_PEAK: "尖峰",
    PEAK_1: "高峰",
    PEAK_2: "高峰",
    FLAT_1: "平段",
    FLAT_2: "平段",
    FLAT_3: "平段",
    VALLEY_1: "低谷",
    VALLEY_2: "低谷",
  })[String(v)] || String(v || "");
const detailItemName = (r: RecordRow) =>
  `${periodText(r.tariffPeriodCode || r.tariff_period_code) || "能源"}电费`;
const detailSource = (r: RecordRow) =>
  [r.deviceName || r.device_name, r.deviceSn || r.device_sn]
    .filter(Boolean)
    .join(" · ") || "—";
const detailPoint = (r: RecordRow) =>
  [
    r.pointName || r.point_name || r.pointCode || r.point_code,
    periodText(r.tariffPeriodCode || r.tariff_period_code),
  ]
    .filter(Boolean)
    .join(" · ");
const usageText = (r: RecordRow) => {
  const amount =
    r.usageValue ??
    r.usage_value ??
    r.quantity ??
    r.usageQuantity ??
    r.usage_quantity;
  if (amount === undefined || amount === null || amount === "") return "—";
  return `${Number(amount).toLocaleString("zh-CN", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${String(r.unit || "kWh")}`;
};
const normalizePeriodDetail = (x: RecordRow) => ({
  ...((x.period && typeof x.period === "object" ? x.period : {}) as RecordRow),
  ...x,
});
const statusText = (v: unknown) =>
  ({
    ACTIVE: "已启用",
    TERMINATED: "已终止",
    PENDING_CONFIRM: "待确认",
    PENDING_PAYMENT: "待支付",
    PENDING: "待审批",
    APPROVED: "已审批",
    CANCELLED: "已撤销",
    DRAFT: "草稿",
    REVIEWED: "已审核",
    REVIEWING: "待审核",
    CALCULATING: "计费中",
    ISSUED: "待支付",
    PAID: "已结清",
    REGULAR: "常规账单",
    LATE_CONTRACT: "漏出账合同",
    TEMPORARY: "临时结算",
    DATA_CORRECTION: "计量数据补正",
    PRICE_CORRECTION: "计价纠正",
    SUCCESS: "执行成功",
    FAILED: "执行失败",
    SKIPPED: "已跳过",
    PARTIAL: "部分成功",
    OVERDUE: "逾期欠费",
    SETTLED: "已结清",
    OPEN: "结算中",
    INCOMPLETE: "待补齐",
    CLOSEABLE: "可关账",
    CLOSED: "已关账",
    READY: "待归档",
    ARCHIVED: "已归档",
    MONTH_ARCHIVED: "月度已归档",
    COMPLETED: "已完结",
    PROCESSING: "出账处理中",
    RECEIVING: "待收款",
    RECONCILING: "待对账",
    VOUCHER_PENDING: "待凭证入账",
    INVOICE_PENDING: "待发票处理",
    DIFFERENCE: "存在差异",
    IMPORTED: "待勾兑",
    IGNORED: "已忽略",
    MATCHED: "已勾兑",
    REVERSED: "已冲销",
    VOID: "已作废",
    EXPORTED: "已导出",
    POSTED: "已入账",
    AR_RECEIVABLE: "应收凭证",
    RECEIPT: "收款凭证",
    RECEIPT_REVERSAL: "红字收款冲销凭证",
    DISCOUNT: "减免",
    SURCHARGE: "补收",
    WRITE_OFF: "坏账核销",
    CREATED: "账单生成",
    PAYMENT_POSTED: "登记收款",
    PAYMENT_REVERSED: "收款冲销",
    ADJUSTMENT_APPROVED: "调账审批",
    RECALCULATED: "重新计费",
    VOIDED: "账单作废",
    REQUESTED: "待开票",
    DELIVERED: "已交付",
    RED_APPLIED: "待红冲",
    RED: "已红冲",
    NORMAL: "增值税普通发票",
    SPECIAL: "增值税专用发票",
  })[String(v)] ||
  v ||
  "—";
const invoiceStatusText = (v: unknown) =>
  String(v) === "ISSUED" ? "已开具" : statusText(v);
const tone = (v: unknown) =>
  ["OVERDUE", "DIFFERENCE", "TERMINATED", "FAILED"].includes(String(v))
    ? "danger"
    : ["COMPLETED", "MONTH_ARCHIVED", "ARCHIVED"].includes(String(v))
      ? "success"
    : [
          "DRAFT",
          "REVIEWING",
          "PENDING_CONFIRM",
          "PENDING_PAYMENT",
          "CLOSEABLE",
          "INCOMPLETE",
          "READY",
          "REQUESTED",
          "RED_APPLIED",
          "PROCESSING",
          "RECEIVING",
          "RECONCILING",
          "VOUCHER_PENDING",
          "INVOICE_PENDING",
        ].includes(String(v))
      ? "warning"
      : "quiet";
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const stage =
      props.view === "payments"
        ? "jobs"
        : props.view === "archives"
          ? "closing"
          : props.view === "overview"
            ? "overview"
            : "admission";
    payload.value = await billingErp(stage as never, {
      orgId: orgId.value || undefined,
      billCycle: cycle.value,
      keyword: keyword.value || undefined,
    });
    if (props.view === "rules") await loadContracts();
    if (props.view === "archives") await loadArchives();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "数据加载失败";
  } finally {
    loading.value = false;
  }
}
async function lookup() {
  try {
    const a = await Promise.all([
      listResource("billing", "accounts", { pageSize: 500 }),
      listResource("billing", "tenants", { pageSize: 500 }),
      listResource("archive", "spaces", { pageSize: 500 }),
      listResource("archive", "devices", { pageSize: 500 }),
      listResource("archive", "device-types", { pageSize: 500 }),
    ]);
    accounts.value = a[0].records;
    tenants.value = a[1].records;
    spaces.value = a[2].records;
    devices.value = a[3].records;
    deviceTypes.value = a[4].records;
  } catch {
    /* 字典失败不阻断只读页 */
  }
}
async function loadContracts() {
  const page = await contracts({
    pageNum: contractPage.value,
    pageSize: contractPageSize.value,
    keyword: contractKeyword.value || undefined,
    status: contractStatus.value || undefined,
    orgId: orgId.value || undefined,
  });
  contractRows.value = page.records || [];
  contractTotal.value = Number(page.total || contractRows.value.length);
}
function changeContractPage(delta: number) {
  const max = Math.max(
    1,
    Math.ceil(contractTotal.value / contractPageSize.value),
  );
  contractPage.value = Math.min(max, Math.max(1, contractPage.value + delta));
  void loadContracts();
}
function resetContractPage() {
  contractPage.value = 1;
  void loadContracts();
}
function changeBillPage(delta: number) {
  const max = Math.max(1, Math.ceil(bills.value.length / billPageSize.value));
  billPage.value = Math.min(max, Math.max(1, billPage.value + delta));
}
async function openAux(m: "spaces" | "pricing") {
  pricingContract.value = null;
  auxMode.value = m;
  auxKeyword.value = "";
  auxStatus.value = "";
  auxManagerOpen.value = true;
}
async function openContractPricing(r: RecordRow) {
  try {
    pricingContract.value = await contract(r.id);
    auxMode.value = "pricing";
    auxManagerOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "合同计价配置加载失败";
  }
}
function contractAction(
  id: unknown,
  action: "activate" | "terminate",
  body: RecordRow = {},
) {
  if (action === "terminate") {
    confirmContract.value = { id };
    confirmKind.value = "terminate";
    confirmOpen.value = true;
    return Promise.resolve({}) as Promise<RecordRow>;
  }
  return apiContractAction(id, action, body);
}
function removeTerminatedContract(r: RecordRow) {
  confirmContract.value = r;
  confirmKind.value = "delete";
  confirmOpen.value = true;
}
async function confirmContractAction() {
  if (!confirmContract.value) return;
  confirming.value = true;
  try {
    if (confirmKind.value === "delete")
      await deleteContract(confirmContract.value.id);
    else
      await apiContractAction(confirmContract.value.id, "terminate", {
        operator: "test",
      });
    confirmOpen.value = false;
    await loadContracts();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "合同操作失败";
  } finally {
    confirming.value = false;
  }
}
async function loadAux() {
  try {
    const p =
      auxMode.value === "spaces"
        ? await listResource("archive", "spaces", {
            pageSize: 500,
            keyword: auxKeyword.value || undefined,
            status: auxStatus.value || undefined,
          })
        : await listResource("billing", "rules", {
            pageSize: 500,
            keyword: auxKeyword.value || undefined,
            enabled: auxStatus.value || undefined,
          });
    auxRows.value = p.records || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "基础资料加载失败";
  }
}
function openContract(r: RecordRow = {}) {
  if (!r.id) {
    contractEditorOpen.value = true;
    return;
  }
  Object.assign(form, {
    id: String(r.id || ""),
    tenantId: String(r.tenant_id || r.tenantId || ""),
    orgId: String(r.org_id || r.orgId || orgId.value || ""),
    contractNo: r.contract_no || r.contractNo || `CT-${Date.now()}`,
    contractName: r.contract_name || r.contractName || "能源计量结算合同",
    startDate:
      r.start_date || r.startDate || new Date().toISOString().slice(0, 10),
    endDate: r.end_date || r.endDate || `${new Date().getFullYear()}-12-31`,
    spaceIds: [],
    meterIds: [],
  });
  dialog.value = "contract";
}
async function saveContractForm() {
  if (!form.tenantId || !form.orgId || !form.contractNo) {
    error.value = "请完整填写合同主体、园区和合同编号";
    return;
  }
  saving.value = true;
  try {
    const x = await saveContract({
      ...(form.id ? { id: Number(form.id) } : {}),
      contractNo: form.contractNo,
      contractName: form.contractName,
      tenantId: Number(form.tenantId),
      orgId: Number(form.orgId),
      startDate: form.startDate,
      endDate: form.endDate,
      settlementDay: 1,
      spaces: form.spaceIds.map((id) => ({
        spaceId: Number(id),
        startDate: form.startDate,
      })),
      meters: form.meterIds.map((id) => ({
        deviceId: Number(id),
        startDate: form.startDate,
        meterFactor: 1,
      })),
    });
    if (x?.id) await apiContractAction(x.id, "activate");
    dialog.value = "none";
    await loadContracts();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "合同保存失败";
  } finally {
    saving.value = false;
  }
}
async function savePrice() {
  if (
    !priceForm.accountId ||
    !priceForm.ruleName ||
    !priceForm.deviceTypeId ||
    !priceForm.points ||
    !priceForm.price
  ) {
    error.value = "请填写计费对象、规则、设备类型、测点和价格";
    return;
  }
  try {
    const x = await createResource("billing", "rules", {
      account_id: Number(priceForm.accountId),
      rule_name: priceForm.ruleName,
      device_type_id: Number(priceForm.deviceTypeId),
      metric_point_code: priceForm.points
        .split(/[,，\s]+/)
        .filter(Boolean)
        .join(","),
      billing_cycle: "MONTHLY",
      price_mode: priceForm.priceMode,
      enabled: 1,
    });
    await createResource("billing", "price-items", {
      rule_id: Number(x.id),
      price_label: priceForm.priceMode === "FIXED" ? "固定金额" : "标准单价",
      tier_min: 0,
      unit_price: Number(priceForm.price),
      sort: 1,
    });
    dialog.value = "none";
    await loadAux();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "计价规则保存失败";
  }
}
async function deactivateAux(r: RecordRow) {
  try {
    await updateResource(
      auxMode.value === "spaces" ? "archive" : "billing",
      auxMode.value === "spaces" ? "spaces" : "rules",
      r.id,
      auxMode.value === "spaces" ? { status: "INACTIVE" } : { enabled: 0 },
    );
    await loadAux();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "停用失败";
  }
}
async function show(r: RecordRow) {
  try {
    if (props.view === "payments") {
      detail.value = await bill(r.billId || r.id);
      dialog.value = "bill";
      return;
    }
    if (props.view === "archives") {
      await openPeriodDetail(r, "overview");
      return;
    }
    detail.value = await contract(r.id);
    formalContractOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "详情加载失败";
  }
}
async function openWorkflow(r: RecordRow, action: "review" | "issue" | "collect") {
  try {
    workflowRow.value = r;
    workflowAction.value = action;
    workflowPreview.value = await billingWorkflowPreview(r.billId || r.id);
    dialog.value = "workflow";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "处理单加载失败";
  }
}
const workflowTitle = computed(() => ({ review: "账单审核确认单", issue: "出账确认单", collect: "模拟到账与自动对账" })[workflowAction.value]);
const workflowConfirmText = computed(() => ({ review: "确认审核", issue: "确认出账", collect: "确认到账并自动对账" })[workflowAction.value]);
const workflowChecks = computed<RecordRow[]>(() => Array.isArray(workflowPreview.value.checks) ? workflowPreview.value.checks as RecordRow[] : []);
const workflowBill = computed<RecordRow>(() => (workflowPreview.value.bill || {}) as RecordRow);
const workflowDocuments = computed<RecordRow>(() => (workflowPreview.value.documents || {}) as RecordRow);
const workflowTimeline = computed<RecordRow[]>(() => Array.isArray(workflowPreview.value.timeline) ? workflowPreview.value.timeline as RecordRow[] : []);
async function confirmWorkflow() {
  const billId = workflowRow.value.billId || workflowRow.value.id;
  if (!billId) return;
  workflowSaving.value = true;
  try {
    if (workflowAction.value === "collect") await simulateBillingSettlement(billId);
    else await confirmBillingWorkflow(billId, workflowAction.value);
    const completedAction = workflowAction.value;
    dialog.value = "none";
    showAppAlert({
      type: "success",
      title: completedAction === "review" ? "审核已确认" : completedAction === "issue" ? "账单已出账" : "到账与自动对账完成",
      message: completedAction === "collect" ? "银行流水、收款、勾兑和收款凭证草稿已一并生成。" : "处理记录已写入账单审计时间线。",
    });
    await load();
    if (detail.value.id || detail.value.bill_id) await reloadBillDetail();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "账单处理失败";
  } finally {
    workflowSaving.value = false;
  }
}
async function reloadBillDetail() {
  const id = detail.value.id || detail.value.billId || detail.value.bill_id;
  if (id) detail.value = await bill(id);
}
function openAdjustment() {
  Object.assign(adjustmentForm, {
    type: "DISCOUNT",
    amount: "",
    reason: "",
    remark: "",
  });
  adjustmentOpen.value = true;
}
async function saveAdjustment() {
  const billId = detail.value.id || detail.value.billId || detail.value.bill_id;
  if (
    !billId ||
    Number(adjustmentForm.amount) <= 0 ||
    !adjustmentForm.reason.trim()
  ) {
    error.value = "请填写有效调整金额和业务原因";
    return;
  }
  adjustmentSaving.value = true;
  try {
    await createBillingAdjustment({
      billId,
      adjustmentType: adjustmentForm.type,
      adjustmentAmount: Number(adjustmentForm.amount),
      reason: adjustmentForm.reason.trim(),
      remark: adjustmentForm.remark,
      operator: "test",
    });
    adjustmentOpen.value = false;
    showAppAlert({
      type: "success",
      title: "调整单已创建",
      message: "调整单已进入待审批状态。",
    });
    await reloadBillDetail();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "调整单创建失败";
  } finally {
    adjustmentSaving.value = false;
  }
}
async function adjustmentAction(row: RecordRow, action: "approve" | "cancel") {
  try {
    await billingAdjustmentAction(row.id, action, { operator: "test" });
    showAppAlert({
      type: "success",
      title: action === "approve" ? "调账已审批" : "调整单已撤销",
      message: "账单金额及审计记录已同步更新。",
    });
    await reloadBillDetail();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "调整单处理失败";
  }
}
function requestBillRisk(kind: "reversePayment" | "voidBill", row: RecordRow) {
  billRiskKind.value = kind;
  billRiskRow.value = row;
  billRiskReason.value = "";
  billRiskOpen.value = true;
}
async function confirmBillRisk() {
  if (!billRiskRow.value || !billRiskReason.value.trim()) return;
  billRiskSaving.value = true;
  try {
    if (billRiskKind.value === "reversePayment")
      await reversePayment(billRiskRow.value.id, {
        operator: "test",
        reason: billRiskReason.value.trim(),
      });
    else
      await apiBillAction(
        detail.value.id || detail.value.billId || detail.value.bill_id,
        "void",
        { operator: "test", remark: billRiskReason.value.trim() },
      );
    billRiskOpen.value = false;
    showAppAlert({
      type: "success",
      title:
        billRiskKind.value === "reversePayment" ? "收款已冲销" : "账单已作废",
      message: "状态与财务留痕已同步更新。",
    });
    await reloadBillDetail();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "异常处理失败";
  } finally {
    billRiskSaving.value = false;
  }
}
function openCollection(r: RecordRow) {
  Object.assign(collection, {
    row: r,
    amount: String(r.outstandingAmount || ""),
    way: "银行转账",
    transactionNo: "",
    remark: "",
  });
  dialog.value = "collection";
}
async function saveCollection() {
  try {
    await simulateBillingSettlement(collection.row.billId || collection.row.id, {
      payAmount: Number(collection.amount),
      amount: Number(collection.amount),
    });
    dialog.value = "none";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "支付登记失败";
  }
}
async function loadStatements() {
  try {
    statements.value =
      (
        await billingStatements({
          orgId: orgId.value || undefined,
          pageSize: 100,
        })
      ).records || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "流水加载失败";
  }
}
async function selectStatement(r: RecordRow) {
  selectedStatement.value = r;
  candidates.value = await billingStatementCandidates(r.id);
}
async function match(r: RecordRow) {
  try {
    await matchBillingStatement(selectedStatement.value.id, {
      billId: r.bill_id,
      matchAmount: r.outstanding_amount,
    });
    await loadStatements();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "流水勾兑失败";
  }
}
async function autoMatchSelectedStatement() {
  try {
    await autoMatchBillingStatement(selectedStatement.value.id);
    selectedStatement.value = {};
    candidates.value = [];
    await loadStatements();
    await load();
    showAppAlert({ type: "success", title: "自动对账完成", message: "系统已生成对应的收款、勾兑与凭证草稿。" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "自动对账失败";
  }
}
async function loadInvoiceRows() {
  invoiceRows.value =
    (await billingInvoices({ orgId: orgId.value || undefined, pageSize: 100 }))
      .records || [];
}
async function openInvoiceCenter() {
  invoiceLoading.value = true;
  try {
    await loadInvoiceRows();
    invoiceMode.value = "list";
    invoiceOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "发票台账加载失败";
  } finally {
    invoiceLoading.value = false;
  }
}
function requestInvoiceForBill(r: RecordRow) {
  Object.assign(invoiceForm, {
    billIds: [r.billId || r.id],
    invoiceType: "NORMAL",
    invoiceTitle: r.tenantName || r.accountName || "",
    taxpayerNo: "",
    email: "",
    mobile: "",
    remark: "",
    redReason: "",
  });
  invoiceDetail.value = {};
  invoiceMode.value = "request";
  invoiceOpen.value = true;
}
async function saveInvoiceRequest() {
  if (!invoiceForm.invoiceTitle.trim()) {
    error.value = "请填写发票抬头";
    return;
  }
  invoiceLoading.value = true;
  try {
    invoiceDetail.value = await requestBillingInvoice({ ...invoiceForm });
    invoiceMode.value = "detail";
    await load();
    await loadInvoiceRows();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "发票申请失败";
  } finally {
    invoiceLoading.value = false;
  }
}
async function viewInvoice(r: RecordRow) {
  invoiceLoading.value = true;
  invoiceForm.redReason = "";
  invoiceFile.value = null;
  try {
    invoiceDetail.value = await billingInvoice(r.invoiceId || r.id);
    invoiceMode.value = "detail";
    invoiceOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "发票详情加载失败";
  } finally {
    invoiceLoading.value = false;
  }
}
async function issueInvoice() {
  invoiceLoading.value = true;
  try {
    invoiceDetail.value = await issueBillingInvoice(invoiceDetail.value.id, {});
    await loadInvoiceRows();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "确认开票失败";
  } finally {
    invoiceLoading.value = false;
  }
}
async function uploadInvoice() {
  if (!invoiceFile.value) {
    error.value = "请选择 PDF 或 OFD 电子发票";
    return;
  }
  invoiceLoading.value = true;
  try {
    invoiceDetail.value = await uploadBillingInvoiceFile(
      invoiceDetail.value.id,
      invoiceFile.value,
    );
    invoiceFile.value = null;
    await loadInvoiceRows();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "电子发票上传失败";
  } finally {
    invoiceLoading.value = false;
  }
}
function selectInvoiceFile(event: Event) {
  invoiceFile.value = (event.target as HTMLInputElement).files?.[0] || null;
}
async function deliverInvoice() {
  invoiceLoading.value = true;
  try {
    invoiceDetail.value = await deliverBillingInvoice(invoiceDetail.value.id);
    await loadInvoiceRows();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "发票交付失败";
  } finally {
    invoiceLoading.value = false;
  }
}
async function redInvoice() {
  if (!invoiceForm.redReason.trim()) {
    error.value = "请填写红冲原因";
    return;
  }
  invoiceLoading.value = true;
  try {
    invoiceDetail.value = await applyBillingInvoiceRed(
      invoiceDetail.value.id,
      invoiceForm.redReason,
    );
    await loadInvoiceRows();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "红冲申请失败";
  } finally {
    invoiceLoading.value = false;
  }
}
async function confirmRedInvoice() {
  invoiceLoading.value = true;
  try {
    invoiceDetail.value = await confirmBillingInvoiceRed(
      invoiceDetail.value.id,
      {},
    );
    await loadInvoiceRows();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "红冲确认失败";
  } finally {
    invoiceLoading.value = false;
  }
}
async function importBankFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  bankImporting.value = true;
  try {
    const page = await billingPeriods({
      pageNum: 1,
      pageSize: 100,
      orgId: orgId.value || undefined,
      periodCode: cycle.value,
    });
    const period = (page.records || []).find(
      (r) => String(r.periodCode || r.period_code) === cycle.value,
    );
    if (!period) throw new Error(`账期 ${cycle.value} 尚未建立，不能导入流水`);
    bankImportResult.value = await importBillingStatementFile(
      orgId.value || period.orgId || period.org_id,
      period.periodId || period.id,
      file,
    );
    await Promise.all([loadStatements(), loadBankImportBatches()]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "银行流水文件导入失败";
  } finally {
    bankImporting.value = false;
    input.value = "";
  }
}
async function loadBankImportBatches() {
  bankImportBatches.value =
    (
      await billingStatementImportBatches({
        orgId: orgId.value || undefined,
        pageSize: 10,
      })
    ).records || [];
}
async function openFinance() {
  dialog.value = "finance";
  bankImportResult.value = {};
  await Promise.all([loadStatements(), loadBankImportBatches()]);
}
async function loadSchedules() {
  try {
    const rows = (await billingAutoSchedules({ orgId: orgId.value || undefined })) || [];
    schedules.value = rows.map((row) => {
      const ids = Array.isArray(row.contractIds) ? row.contractIds
        : Array.isArray(row.contract_ids) ? row.contract_ids : [];
      const names = Array.isArray(row.contractNames) ? row.contractNames
        : Array.isArray(row.contract_names) ? row.contract_names : [];
      return { ...row, contractIds: ids, contractNames: names, contractCount: ids.length };
    });
  } catch {
    schedules.value = [];
  }
}
async function loadScheduleContracts() {
  try {
    scheduleContracts.value =
      (
        await contracts({
          pageNum: 1,
          pageSize: 500,
          orgId: schedule.orgId || orgId.value || undefined,
          status: "ACTIVE",
        })
      ).records || [];
  } catch {
    scheduleContracts.value = [];
  }
}
async function openScheduleList() {
  try {
    await loadSchedules();
    dialog.value = "scheduleList";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "自动出账计划加载失败";
  }
}
async function openSchedule() {
  Object.assign(schedule, {
    orgId: orgId.value || String(orgs.value[0]?.id || ""),
    name: "月度能源自动出账",
    day: 1,
    time: "02:00",
    term: 15,
    enabled: 1,
    contractIds: [],
  });
  await loadScheduleContracts();
  dialog.value = "schedule";
}
async function saveSchedule() {
  if (!schedule.name || !schedule.orgId || !schedule.contractIds.length) {
    error.value = "请填写计划名称、园区并至少选择一份合同";
    return;
  }
  try {
    await saveBillingAutoSchedule({
      orgId: Number(schedule.orgId),
      scheduleName: schedule.name,
      contractIds: schedule.contractIds.map(Number),
      executeDay: Number(schedule.day),
      executeTime: `${schedule.time}:00`,
      paymentTermDays: Number(schedule.term),
      enabled: schedule.enabled,
    });
    await loadSchedules();
    dialog.value = "scheduleList";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "计划保存失败";
  }
}
function removeSchedule(r: RecordRow) {
  scheduleDeleteTarget.value = r;
  scheduleDeleteOpen.value = true;
}
async function confirmRemoveSchedule() {
  if (!scheduleDeleteTarget.value) return;
  scheduleDeleting.value = true;
  try {
    await deleteBillingAutoSchedule(scheduleDeleteTarget.value.id);
    scheduleDeleteOpen.value = false;
    scheduleDeleteTarget.value = null;
    await loadSchedules();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "计划删除失败";
  } finally {
    scheduleDeleting.value = false;
  }
}
async function runSchedule(r: RecordRow) {
  try {
    const result = await runBillingAutoSchedule(r.id);
    const status = String(result.status || "").toUpperCase();
    const targetCycle = String(result.billCycle || "");
    if (targetCycle) cycle.value = targetCycle;
    if (status === "SUCCESS") {
      showAppAlert({
        type: "success",
        title: "账单生成成功",
        message: String(
          result.message || `已生成 ${result.generatedCount || 0} 张账单`,
        ),
      });
    } else if (status === "PARTIAL") {
      showAppAlert({
        type: "warning",
        title: "部分账单生成失败",
        message: String(result.message || "请查看出账结果"),
      });
    } else if (status === "SKIPPED") {
      skippedSchedule.value = r;
      skippedRun.value = result;
      scheduleSupplementConfirmOpen.value = true;
      return;
    }
    dialog.value = "scheduleList";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "计划执行失败";
    await loadSchedules();
  }
}
async function confirmScheduleSupplement() {
  const schedule = skippedSchedule.value;
  const targetCycle = String(skippedRun.value.billCycle || "");
  if (!schedule || !targetCycle) return;
  generatingScheduleSupplement.value = true;
  try {
    const periodPage = await billingPeriods({ pageNum: 1, pageSize: 200, orgId: schedule.orgId || schedule.org_id });
    const period = (periodPage.records || []).find((row) => String(row.period_code || row.periodCode) === targetCycle);
    if (!period) throw new Error(`未找到 ${targetCycle} 对应的结算账期，无法生成补充账单`);
    const ids: unknown[] = Array.isArray(skippedRun.value.contractIds)
      ? skippedRun.value.contractIds as unknown[]
      : Array.isArray(schedule.contractIds)
        ? schedule.contractIds as unknown[]
        : Array.isArray(schedule.contract_ids)
          ? schedule.contract_ids as unknown[]
          : [];
    if (!ids.length) throw new Error("该自动出账计划未绑定合同");
    const [year, month] = targetCycle.split("-").map(Number);
    const startDate = `${targetCycle}-01`;
    const endDate = `${targetCycle}-${String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, "0")}`;
    const existingSupplements = await billingSupplements({ orgId: schedule.orgId || schedule.org_id, periodId: Number(period.id) });
    const failures: string[] = [];
    let generated = 0;
    for (const contractId of ids) {
      try {
        const sameDraft = existingSupplements.find((item) =>
          String(item.contract_id || item.contractId) === String(contractId)
          && String(item.settlement_start_date || item.settlementStartDate).slice(0, 10) === startDate
          && String(item.settlement_end_date || item.settlementEndDate).slice(0, 10) === endDate
          && ["DRAFT", "FAILED"].includes(String(item.status || "").toUpperCase())
          && !item.generated_bill_id,
        );
        const supplement = sameDraft || await createBillingSupplement({ periodId: Number(period.id), contractId: Number(contractId), settlementType: "LATE_CONTRACT", startDate, endDate, paymentTermDays: Number(schedule.paymentTermDays || schedule.payment_term_days || 15), reason: "自动出账计划立即执行时，原账期已存在有效出账批次，转为补充结算。", remark: `AUTO_SCHEDULE_SUPPLEMENT:${schedule.id}` });
        await billingSupplementAction(supplement.id, "generate");
        generated++;
      } catch (e) { failures.push(e instanceof Error ? e.message : `合同 ${contractId} 生成失败`); }
    }
    if (!generated) throw new Error(failures[0] || "没有可生成的补充账单");
    showAppAlert({ type: failures.length ? "warning" : "success", title: failures.length ? "部分补充账单生成失败" : "已生成补充账单", message: failures.length ? `成功 ${generated} 份；${failures[0]}` : `已为 ${generated} 份计划合同创建补充账单，现可在账单支付中审核和发布。` });
    scheduleSupplementConfirmOpen.value = false;
    skippedSchedule.value = null;
    await load();
  } catch (e) { error.value = e instanceof Error ? e.message : "补充账单生成失败"; }
  finally { generatingScheduleSupplement.value = false; }
}
async function loadArchives() {
  try {
    archives.value = await settlementArchives({
      orgId: orgId.value || undefined,
      periodCode: cycle.value,
    });
  } catch {
    archives.value = [];
  }
}
async function openPeriodDetail(
  r: RecordRow,
  tab: typeof archiveTab.value = "overview",
) {
  try {
    detail.value = normalizePeriodDetail(
      await billingErpPeriod(r.periodId || r.id),
    );
    archiveTab.value =
      detailArchived.value && tab === "checks" ? "records" : tab;
    dialog.value = "archive";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "账期详情加载失败";
  }
}
async function openSupplement(r: RecordRow) {
  supplementForm.periodId = String(r.periodId || r.id || detail.value.periodId || "");
  supplementForm.contractId = "";
  supplementForm.settlementType = "LATE_CONTRACT";
  supplementForm.startDate = String(r.startDate || detail.value.startDate || "").slice(0, 10);
  supplementForm.endDate = String(r.endDate || detail.value.endDate || "").slice(0, 10);
  supplementForm.paymentTermDays = "15";
  supplementForm.reason = "";
  supplementForm.remark = "";
  await loadScheduleContracts();
  dialog.value = "supplement";
}
async function createSupplementSettlement() {
  if (!supplementForm.periodId || !supplementForm.contractId || !supplementForm.reason.trim()) {
    error.value = "请选择合同并填写补充结算原因";
    return;
  }
  saving.value = true;
  try {
    const row = await createBillingSupplement({ ...supplementForm, periodId: Number(supplementForm.periodId), contractId: Number(supplementForm.contractId), paymentTermDays: Number(supplementForm.paymentTermDays) });
    await billingSupplementAction(row.id, "generate");
    showAppAlert({ type: "success", title: "补充账单已生成", message: "已进入账单支付列表，按常规账单完成审核、发布与收款。" });
    dialog.value = "none";
    await load();
    if (detail.value.periodId) await refreshPeriodDetail("supplements");
  } catch (e) { error.value = e instanceof Error ? e.message : "补充结算生成失败"; }
  finally { saving.value = false; }
}
async function archiveSupplement(row: RecordRow) {
  try {
    await billingSupplementAction(row.id, "archive");
    showAppAlert({ type: "success", title: "补充结算已归档", message: "补充账单及其收款、凭证记录已独立封存。" });
    supplementArchiveOpen.value = false;
    await refreshPeriodDetail("supplements");
  } catch (e) { error.value = e instanceof Error ? e.message : "补充结算归档失败"; }
}
async function openSupplementArchiveCheck(row: RecordRow) {
  supplementArchiveLoading.value = true;
  try {
    supplementArchiveDetail.value = await billingSupplement(row.id);
    supplementArchiveOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "补充结算归档检查加载失败";
  } finally {
    supplementArchiveLoading.value = false;
  }
}
async function openSupplementArchiveTarget(target: string) {
  const row = supplementArchiveDetail.value;
  const periodId = row.source_period_id || row.sourcePeriodId;
  if (!periodId) return;
  supplementArchiveOpen.value = false;
  await openPeriodDetail({ id: periodId }, target === "财务凭证" ? "vouchers" : target === "查看账单" ? "bills" : "finance");
}
async function inspectPeriod(r: RecordRow) {
  try {
    const [period, check] = await Promise.all([
      billingErpPeriod(r.periodId || r.id),
      billingPeriodCheck(r.periodId || r.id),
    ]);
    detail.value = {
      ...normalizePeriodDetail(period),
      ...check,
      checks: check.checks || period.checks,
    };
    archiveTab.value = "checks";
    dialog.value = "archive";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "关账检查失败";
  }
}
async function closePeriod(r: RecordRow) {
  try {
    const check = await billingPeriodCheck(r.periodId || r.id);
    if (!check.closeable) {
      await inspectPeriod(r);
      throw new Error("关账检查尚未全部通过");
    }
    await billingPeriodAction(r.periodId || r.id, "close", {
      operator: "test",
    });
    showAppAlert({
      type: "success",
      title: "阶段关账已完成",
      message: "本次核对结果已记录；最终月度归档前，仍可继续出账、收款和补充结算。",
    });
    dialog.value = "none";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "关账失败";
    throw e;
  }
}
function beginMonthlyArchive(row: RecordRow | null = monthlyPeriodTarget.value) {
  if (!row) {
    error.value = periods.value.length > 1
      ? "请先选择一个园区，再执行当月最终归档"
      : "当前月份尚未建立可归档账期";
    return;
  }
  if (String(row.closingStatus || row.closing_status || row.archiveStatus || row.archive_status).toUpperCase() === "ARCHIVED") {
    void openArchiveHistory();
    return;
  }
  monthlyArchiveTarget.value = row;
  monthlyArchiveReview.value = {};
  monthlyArchiveStep.value = 1;
}
async function confirmMonthlyArchiveStart() {
  const target = monthlyArchiveTarget.value;
  if (!target) return;
  monthlyArchiveLoading.value = true;
  try {
    monthlyArchiveReview.value = await monthlyArchivePreview(target.periodId || target.id);
    monthlyArchiveStep.value = 2;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "月度归档检查加载失败";
  } finally {
    monthlyArchiveLoading.value = false;
  }
}
function confirmMonthlyArchiveReview() {
  if (!monthlyArchiveReview.value.closeable) {
    error.value = "仍有归档检查未通过，请先处理阻断项";
    return;
  }
  monthlyArchiveStep.value = 3;
}
async function confirmMonthlyArchiveLock() {
  const target = monthlyArchiveTarget.value;
  if (!target) return;
  monthlyArchiveLoading.value = true;
  try {
    await finalizeMonthlyArchive(target.periodId || target.id);
    monthlyArchiveStep.value = 0;
    dialog.value = "none";
    showAppAlert({
      type: "success",
      title: `${target.periodCode || target.period_code || cycle.value} 已完成最终归档`,
      message: "该月账单、收款、流水、凭证、发票与补充结算已永久锁定，可在历史归档中查阅。",
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "月度最终归档失败";
  } finally {
    monthlyArchiveLoading.value = false;
  }
}
async function openArchiveHistory() {
  archiveHistoryOpen.value = true;
  archiveHistoryLoading.value = true;
  try {
    const history = await settlementArchives({
      orgId: orgId.value || undefined,
    });
    archiveHistoryRows.value = history.filter(
      (row) => String(row.archive_status || row.archiveStatus).toUpperCase() === "ARCHIVED",
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "历史归档加载失败";
  } finally {
    archiveHistoryLoading.value = false;
  }
}
async function refreshPeriodDetail(
  tab: typeof archiveTab.value = archiveTab.value,
) {
  const id = detail.value.periodId || detail.value.id;
  if (!id) return;
  const [period, check] = await Promise.all([
    billingErpPeriod(id),
    billingPeriodCheck(id),
  ]);
  detail.value = {
    ...normalizePeriodDetail(period),
    ...check,
    checks: check.checks || period.checks,
  };
  archiveTab.value = tab;
  dialog.value = "archive";
  await loadArchives();
}
function checkPassed(item: RecordRow) {
  return Boolean(item.passed ?? item.ok);
}
function checkTarget(item: RecordRow) {
  const title = String(item.title || item.label || "");
  const target = String(item.target || item.tool || "");
  if (title.includes("凭证")) return "财务凭证";
  if (title.includes("对账") || target === "finance") return "银行流水";
  return "账单支付";
}
function checkActionLabel(item: RecordRow) {
  const target = checkTarget(item);
  return target === "财务凭证"
    ? "生成凭证"
    : target === "银行流水"
      ? "处理对账"
      : "查看账单";
}
function handleCheckAction(item: RecordRow) {
  const target = checkTarget(item);
  archiveTab.value =
    target === "财务凭证"
      ? "vouchers"
      : target === "银行流水"
        ? "finance"
        : "bills";
}
function requestArchiveAction(
  kind: "close" | "reopen",
  row: RecordRow,
) {
  archiveConfirmKind.value = kind;
  archiveConfirmRow.value = row;
  reopenReason.value = "";
  archiveConfirmOpen.value = true;
}
async function confirmArchiveAction() {
  if (!archiveConfirmRow.value) return;
  if (archiveConfirmKind.value === "reopen" && !reopenReason.value.trim()) {
    error.value = "请填写反关账原因";
    return;
  }
  archiveConfirming.value = true;
  try {
    if (archiveConfirmKind.value === "close")
      await closePeriod(archiveConfirmRow.value);
    else {
      await billingPeriodAction(
        archiveConfirmRow.value.periodId || archiveConfirmRow.value.id,
        "reopen",
        { reason: reopenReason.value.trim() },
      );
      showAppAlert({
        type: "success",
        title: "账期已反关账",
        message: "账期已恢复为开放状态，可以继续修正业务资料。",
      });
      dialog.value = "none";
      await load();
    }
    archiveConfirmOpen.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "账期操作失败";
  } finally {
    archiveConfirming.value = false;
  }
}
function defaultStatementTime() {
  const now = new Date();
  const part = (v: number) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}T${part(now.getHours())}:${part(now.getMinutes())}`;
}
function openStatementImport() {
  Object.assign(statementForm, {
    externalTransactionNo: "",
    statementTime: defaultStatementTime(),
    payerName: "",
    payerAccount: "",
    amount: "",
    narrative: "",
  });
  archiveActionDialog.value = "statementImport";
}
async function saveStatementImport() {
  if (
    !statementForm.externalTransactionNo ||
    !statementForm.statementTime ||
    Number(statementForm.amount) <= 0
  ) {
    error.value = "请填写流水号、入账时间和有效金额";
    return;
  }
  archiveActionLoading.value = true;
  try {
    const targetPeriodId =
      detail.value.periodId || detail.value.period_id || detail.value.id;
    await importBillingStatements({
      orgId: Number(detail.value.orgId || detail.value.org_id || orgId.value),
      targetPeriodId: Number(targetPeriodId),
      sourceChannel: "BANK",
      records: [
        {
          ...statementForm,
          targetPeriodId: Number(targetPeriodId),
          amount: Number(statementForm.amount),
        },
      ],
    });
    showAppAlert({
      type: "success",
      title: "银行流水已录入",
      message: "流水已进入当前账期的待勾兑队列。",
    });
    archiveActionDialog.value = "none";
    await refreshPeriodDetail("finance");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "银行流水录入失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
async function openPaymentMatch(payment: RecordRow) {
  selectedArchivePayment.value = payment;
  selectedActionStatement.value = {};
  actionPaymentCandidates.value = [];
  archiveActionLoading.value = true;
  try {
    actionStatements.value =
      (
        await billingStatements({
          orgId: detail.value.orgId || detail.value.org_id || orgId.value,
          pageSize: 200,
        })
      ).records || [];
    archiveActionDialog.value = "paymentMatch";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "银行流水加载失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
async function selectActionStatement(statement: RecordRow) {
  selectedActionStatement.value = statement;
  archiveActionLoading.value = true;
  try {
    actionPaymentCandidates.value = await billingStatementPaymentCandidates(
      statement.id,
      String(
        detail.value.periodCode || detail.value.period_code || cycle.value,
      ),
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "可勾兑收款加载失败";
    actionPaymentCandidates.value = [];
  } finally {
    archiveActionLoading.value = false;
  }
}
async function linkExistingPayment(payment: RecordRow) {
  if (!selectedActionStatement.value.id) return;
  archiveActionLoading.value = true;
  try {
    await matchBillingStatementPayment(
      selectedActionStatement.value.id,
      payment.payment_id || payment.id,
    );
    showAppAlert({
      type: "success",
      title: "收款勾兑完成",
      message: "银行流水已关联收款记录。",
    });
    archiveActionDialog.value = "none";
    await refreshPeriodDetail("finance");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "收款勾兑失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
function requestMatchReverse(row: RecordRow) {
  matchReverseRow.value = row;
  matchReverseReason.value = "";
  matchReverseOpen.value = true;
}
async function confirmMatchReverse() {
  const id =
    matchReverseRow.value?.active_match_id ||
    matchReverseRow.value?.activeMatchId;
  if (!id || !matchReverseReason.value.trim()) return;
  matchReversing.value = true;
  try {
    await reverseBillingBankMatch(id, matchReverseReason.value.trim());
    matchReverseOpen.value = false;
    showAppAlert({
      type: "success",
      title: "勾兑已解除",
      message: "流水和收款已恢复为待核对状态。",
    });
    await refreshPeriodDetail("finance");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "解除勾兑失败";
  } finally {
    matchReversing.value = false;
  }
}
function hasVoucher(type: string, id: unknown) {
  return detailVouchers.value.some(
    (v) =>
      String(v.voucher_type || v.voucherType) === type &&
      String(
        type === "AR_RECEIVABLE"
          ? v.bill_id || v.billId
          : v.payment_id || v.paymentId,
      ) === String(id),
  );
}
async function generateMissingVouchers() {
  archiveActionLoading.value = true;
  try {
    let created = 0,
      posted = 0;
    for (const row of detailBills.value) {
      const id = row.id || row.billId || row.bill_id;
      if (
        id &&
        !hasVoucher("AR_RECEIVABLE", id) &&
        String(row.billStatus || row.bill_status) === "ISSUED"
      ) {
        const voucher = await createBillingVoucher({
          billId: id,
          voucherType: "AR_RECEIVABLE",
        });
        created++;
        if (voucher.id) {
          await postBillingVoucher(voucher.id);
          posted++;
        }
      }
    }
    for (const row of detailPayments.value) {
      const id = row.id || row.paymentId || row.payment_id;
      if (
        id &&
        !hasVoucher("RECEIPT", id) &&
        String(row.payment_status || row.paymentStatus) === "SUCCESS"
      ) {
        const voucher = await createBillingVoucher({
          paymentId: id,
          voucherType: "RECEIPT",
        });
        created++;
        if (voucher.id) {
          await postBillingVoucher(voucher.id);
          posted++;
        }
      }
    }
    for (const voucher of detailVouchers.value) {
      if (String(voucher.voucher_status || voucher.voucherStatus) === "DRAFT") {
        await postBillingVoucher(voucher.id);
        posted++;
      }
    }
    showAppAlert({
      type: "success",
      title: created || posted ? "财务凭证已完成" : "无需重复处理",
      message:
        created || posted
          ? `本次生成 ${created} 张、确认入账 ${posted} 张凭证。`
          : "当前账期凭证已经齐全。",
    });
    await refreshPeriodDetail("vouchers");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "财务凭证处理失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
async function viewVoucher(row: RecordRow) {
  archiveActionLoading.value = true;
  try {
    voucherDetail.value = await billingVoucher(row.id);
    archiveActionDialog.value = "voucher";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "凭证详情加载失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
async function postVoucher(row: RecordRow) {
  archiveActionLoading.value = true;
  try {
    await postBillingVoucher(row.id);
    showAppAlert({
      type: "success",
      title: "凭证已入账",
      message: `${row.voucher_no || row.voucherNo || "财务凭证"} 已确认入账。`,
    });
    await refreshPeriodDetail("vouchers");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "凭证入账失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
async function viewArchiveBill(row: RecordRow) {
  archiveActionLoading.value = true;
  try {
    voucherDetail.value = await bill(row.id || row.billId || row.bill_id);
    archiveActionDialog.value = "bill";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "账单详情加载失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
async function downloadVoucher(row: RecordRow) {
  archiveActionLoading.value = true;
  try {
    const result = await exportBillingVoucher(row.id, {
      externalSystem: "OTHER",
    });
    const data = (result.exportData || {}) as RecordRow;
    const csv = String(data.csv || "");
    if (!csv) throw new Error("凭证导出内容为空");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.voucher_no || row.voucherNo || "财务凭证"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showAppAlert({
      type: "success",
      title: "凭证已导出",
      message: "凭证文件已生成，业务凭证状态保持不变。",
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "凭证导出失败";
  } finally {
    archiveActionLoading.value = false;
  }
}
onMounted(async () => {
  orgs.value = await rootOrgs().catch(() => []);
  await lookup();
  await load();
});
watch(
  () => [props.view, orgId.value, cycle.value],
  () => {
    billPage.value = 1;
    paymentStage.value = "todo";
    archiveStage.value = "todo";
    void load();
  },
);
watch(
  () => schedule.orgId,
  () => {
    schedule.contractIds = [];
    void loadScheduleContracts();
  },
);
watch(
  () => bills.value.length,
  (total) => {
    const max = Math.max(1, Math.ceil(total / billPageSize.value));
    if (billPage.value > max) billPage.value = max;
  },
);
</script>

<template>
  <div class="settlement-center-root">
    <section class="settlement-center">
      <header class="center-header">
        <div>
          <p class="eyebrow">SETTLEMENT & FINANCE</p>
          <h1>{{ title }}</h1>
          <span>{{
            props.view === "overview"
              ? "查看结算业务的核心待办、金额与风险。"
              : props.view === "rules"
                ? "合同是出账准备主线，空间和计量计价规则作为可复用基础资料。"
                : props.view === "payments"
                  ? "核对账单、确认应收并完成支付和流水勾兑。"
                  : "账单结清后完成对账、凭证和结算档案归档。"
          }}</span>
        </div>
        <div class="center-actions">
          <label v-if="props.view !== 'rules'"
            ><span>园区</span
            ><AppSelect v-model="orgId"
              ><option value="">全部园区</option>
              <option
                v-for="x in orgs"
                :key="String(x.id)"
                :value="String(x.id)"
              >
                {{ x.org_name }}
              </option></AppSelect
            ></label
          ><label
            v-if="props.view === 'payments' || props.view === 'archives'"
            class="cycle-filter"
            ><span>账期</span><input v-model="cycle" type="month" /></label
          ><button
            v-if="props.view === 'payments'"
            class="quiet plan-top-button"
            @click="openScheduleList"
          >
            查看计划</button
          ><button class="quiet" @click="load">
            <RefreshCw :size="14" />刷新
          </button>
        </div>
      </header>
      <p v-if="error" class="center-error">
        <AlertTriangle :size="15" />{{ error }}
      </p>
      <template v-if="props.view === 'overview'"
        ><section class="metric-grid">
          <article>
            <span>待完善规则</span><b>{{ summary.blockedSubjects || 0 }}</b
            ><small>合同、表计或计价规则</small>
          </article>
          <article>
            <span>待审核账单</span><b>{{ summary.reviewSubjects || 0 }}</b
            ><small>等待财务确认</small>
          </article>
          <article>
            <span>待收款金额</span><b>¥{{ money(summary.outstandingAmount) }}</b
            ><small>已形成应收</small>
          </article>
          <article>
            <span>待归档账期</span><b>{{ summary.openPeriods || 0 }}</b
            ><small>完成对账后归档</small>
          </article>
        </section>
        <section class="overview-charts">
          <article class="panel chart-panel">
            <header>
              <div>
                <b>本期结算金额走势</b><small>规则准备、出账、收款、归档</small>
              </div>
              <strong>¥{{ money(summary.outstandingAmount) }}</strong>
            </header>
            <svg viewBox="0 0 600 180">
              <polyline
                points="20,140 130,112 240,126 350,78 460,92 580,42"
                fill="none"
                stroke="#397b9e"
                stroke-width="3"
              />
              <polyline
                points="20,140 130,112 240,126 350,78 460,92 580,42 580,160 20,160"
                fill="#397b9e12"
                stroke="none"
              />
              <g fill="#397b9e">
                <circle cx="20" cy="140" r="4" />
                <circle cx="130" cy="112" r="4" />
                <circle cx="240" cy="126" r="4" />
                <circle cx="350" cy="78" r="4" />
                <circle cx="460" cy="92" r="4" />
                <circle cx="580" cy="42" r="4" />
              </g>
            </svg>
            <div class="chart-axis">
              <span>规则</span><span>审核</span><span>出账</span
              ><span>收款</span><span>对账</span><span>归档</span>
            </div>
          </article>
          <article class="panel chart-panel">
            <header>
              <div><b>账单状态结构</b><small>当前账期业务分布</small></div>
              <strong>{{ summary.reviewSubjects || 0 }} 待审核</strong>
            </header>
            <div class="status-bars">
              <div>
                <span>待审核</span
                ><i
                  ><b
                    :style="{
                      width: `${Math.min(100, Number(summary.reviewSubjects || 0) * 12 + 8)}%`,
                    }"
                  ></b></i
                ><strong>{{ summary.reviewSubjects || 0 }}</strong>
              </div>
              <div>
                <span>待收款</span
                ><i
                  ><b
                    :style="{
                      width: `${jobSummary.outstanding || summary.outstandingAmount ? 68 : 12}%`,
                    }"
                  ></b></i
                ><strong
                  >¥{{
                    money(jobSummary.outstanding || summary.outstandingAmount)
                  }}</strong
                >
              </div>
              <div>
                <span>已收款</span
                ><i
                  ><b
                    class="paid"
                    :style="{ width: `${summary.paidAmount ? 76 : 16}%` }"
                  ></b></i
                ><strong>¥{{ money(summary.paidAmount) }}</strong>
              </div>
              <div>
                <span>待归档</span
                ><i
                  ><b
                    class="archive"
                    :style="{
                      width: `${Math.min(100, Number(summary.openPeriods || 0) * 18 + 10)}%`,
                    }"
                  ></b></i
                ><strong>{{ summary.openPeriods || 0 }}</strong>
              </div>
            </div>
          </article>
        </section>
        <section class="overview-columns">
          <article class="panel">
            <header><b>待办事项</b><small>只显示需要处理的业务</small></header>
            <button
              v-for="item in todos"
              :key="`${item.stage}-${item.title}`"
              class="todo-row"
            >
              <span
                ><b>{{ item.title }}</b
                ><small>{{ item.detail }}</small></span
              ><strong>{{ item.stage }}</strong>
            </button>
            <p v-if="!todos.length" class="empty">暂无待办。</p>
          </article>
          <article class="panel">
            <header>
              <b>本期结算概况</b><small>{{ summary.cycle || cycle }}</small>
            </header>
            <dl class="summary-list">
              <div>
                <dt>已收金额</dt>
                <dd>¥{{ money(summary.paidAmount) }}</dd>
              </div>
              <div>
                <dt>存在对账差异</dt>
                <dd>{{ summary.differenceCount || 0 }}</dd>
              </div>
              <div>
                <dt>可关账账期</dt>
                <dd>{{ summary.closeablePeriods || 0 }}</dd>
              </div>
            </dl>
          </article>
        </section></template
      >
      <template v-else-if="props.view === 'rules'"
        ><section class="section-toolbar">
          <div>
            <b>出账准备</b
            ><small>先建合同绑定空间和设备，再为合同配置计价规则。</small>
          </div>
          <div class="toolbar-actions">
            <button class="quiet" @click="openAux('spaces')">
              空间管理</button
            ><button class="primary" @click="openContract()">新增合同</button>
          </div>
        </section>
        <section class="panel table-panel">
          <header>
            <div>
              <b>合同主表</b
              ><small
                >共 {{ contractTotal }} 份合同 · 合同是出账规则的业务载体</small
              >
            </div>
            <div class="table-filters">
              <label class="search-box"
                ><Search :size="15" /><input
                  v-model="contractKeyword"
                  placeholder="合同编号、租户或名称"
                  @keydown.enter="resetContractPage" /></label
              ><AppSelect v-model="contractStatus" @change="resetContractPage"
                ><option value="">全部状态</option>
                <option value="ACTIVE">已启用</option>
                <option value="TERMINATED">已终止</option></AppSelect
              >
            </div>
          </header>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>合同编号</th>
                <th>合同名称 / 租户</th>
                <th>绑定空间</th>
                <th>绑定设备</th>
                <th>绑定规则</th>
                <th>发起时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in contractRows" :key="String(r.id)">
                <td>
                  <button class="link-button" @click="show(r)">
                    {{ value(r, "contract_no", "contractNo", "id") }}
                  </button>
                </td>
                <td>
                  <b>{{ value(r, "contract_name", "contractName") }}</b
                  ><small
                    >{{ value(r, "tenant_name", "tenantName") }} ·
                    {{ value(r, "org_name", "orgName") }}</small
                  >
                </td>
                <td>
                  <span class="cell-list">{{
                    value(r, "space_names", "spaceNames")
                  }}</span>
                </td>
                <td>
                  <span class="cell-list">{{
                    value(r, "device_names", "deviceNames")
                  }}</span>
                </td>
                <td>
                  <span class="cell-list">{{
                    value(r, "rule_names", "ruleNames")
                  }}</span>
                </td>
                <td>
                  {{ value(r, "created_time", "create_time", "createdTime") }}
                </td>
                <td>
                  <em
                    :class="['status', tone(r.status || r.contract_status)]"
                    >{{
                      Number(r.rule_count || 0) === 0 &&
                      !["TERMINATED", "CLOSED"].includes(
                        String(r.status || r.contract_status),
                      )
                        ? "待配置计价"
                        : statusText(r.status || r.contract_status || "ACTIVE")
                    }}</em
                  >
                </td>
                <td class="row-actions">
                  <button class="text-button" @click="show(r)">查看合同</button
                  ><button
                    v-if="
                      Number(r.rule_count || 0) === 0 &&
                      !['TERMINATED', 'CLOSED'].includes(
                        String(r.status || r.contract_status),
                      )
                    "
                    class="text-button config-link"
                    @click="openContractPricing(r)"
                  >
                    配置计价</button
                  ><button
                    v-if="
                      !['TERMINATED', 'CLOSED'].includes(
                        String(r.status || r.contract_status),
                      )
                    "
                    class="text-button danger-link"
                    @click="
                      contractAction(r.id, 'terminate', {
                        operator: 'test',
                      }).then(loadContracts)
                    "
                  >
                    终止</button
                  ><button
                    v-else-if="
                      String(r.status || r.contract_status) === 'TERMINATED'
                    "
                    class="text-button danger-link delete-link"
                    @click="removeTerminatedContract(r)"
                  >
                    删除
                  </button>
                </td>
              </tr>
              <tr v-if="!contractRows.length">
                <td colspan="8" class="empty">
                  暂无合同，请先新增合同并绑定结算范围。
                </td>
              </tr>
            </tbody>
          </table>
          <footer class="table-pagination">
            <span>共 {{ contractTotal }} 条</span
            ><button
              class="quiet"
              :disabled="contractPage <= 1"
              @click="changeContractPage(-1)"
            >
              上一页</button
            ><button
              v-for="item in pageWindow(
                contractPage,
                Math.max(1, Math.ceil(contractTotal / contractPageSize)),
              )"
              :key="item"
              class="page-number"
              :class="{ active: item === contractPage }"
              @click="
                contractPage = item;
                loadContracts();
              "
            >
              {{ item }}</button
            ><button
              class="quiet"
              :disabled="
                contractPage >=
                Math.max(1, Math.ceil(contractTotal / contractPageSize))
              "
              @click="changeContractPage(1)"
            >
              下一页
            </button>
          </footer>
        </section></template
      >
      <template v-else-if="props.view === 'payments'"
        ><section class="metric-grid">
          <article>
            <span>待审核账单</span><b>{{ jobSummary.draft || 0 }}</b
            ><small>草稿和待审核账单</small>
          </article>
          <article>
            <span>待收款金额</span><b>¥{{ money(jobSummary.outstanding) }}</b
            ><small>已发布未结清</small>
          </article>
          <article>
            <span>逾期欠费</span
            ><b
              >¥{{
                money(
                  bills
                    .filter((x) => x.settlementStatus === "OVERDUE")
                    .reduce((n, x) => n + Number(x.outstandingAmount || 0), 0),
                )
              }}</b
            ><small>需要重点处理</small>
          </article>
          <article>
            <span>本期账单</span><b>{{ bills.length }}</b
            ><small>{{ cycle }} 结算周期</small>
          </article>
        </section>
        <nav class="billing-stage-tabs" aria-label="账单处理阶段">
          <button
            v-for="stage in paymentStages"
            :key="stage.key"
            :class="{ active: paymentStage === stage.key }"
            @click="paymentStage = stage.key; billPage = 1"
          >
            <span>{{ stage.label }}</span><em>{{ paymentStageCount(stage.key) }}</em>
          </button>
        </nav>
        <section class="panel table-panel payment-bill-panel">
          <header>
            <div>
              <b>账单列表</b
              ><small
                >根据自动出账计划或手动出账生成，确认后进入支付、勾兑与开票。</small
              >
            </div>
            <div class="toolbar-actions">
              <label class="search-box"
                ><Search :size="15" /><input
                  v-model="keyword"
                  placeholder="账单编号或租户"
                  @keydown.enter="
                    billPage = 1;
                    load();
                  " /></label
              ><button class="quiet action-with-icon" @click="openFinance">
                <FileText :size="15" />银行流水</button
              ><button
                class="quiet action-with-icon"
                @click="openInvoiceCenter"
              >
                <ReceiptText :size="15" />发票台账
              </button>
            </div>
          </header>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>账单编号</th>
                <th>租户</th>
                <th>结算周期</th>
                <th class="money">总金额</th>
                <th class="money">欠费金额</th>
                <th>处理阶段</th>
                <th>发票</th>
                <th>生成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pagedBills" :key="String(r.billId || r.id)">
                <td>
                  <button class="link-button" @click="show(r)">
                    {{ r.billNo || r.billId || r.id }}
                  </button><small v-if="r.billType === 'SUPPLEMENT'">补充账单</small>
                </td>
                <td>
                  <b>{{ r.tenantName || r.accountName || "—" }}</b
                  ><small>{{ r.orgName || "—" }}</small>
                </td>
                <td>{{ r.billCycle || cycle }}</td>
                <td class="money">¥{{ money(r.totalAmount) }}</td>
                <td class="money">
                  <strong :class="{ arrears: Number(r.outstandingAmount) > 0 }"
                    >¥{{ money(r.outstandingAmount) }}</strong
                  >
                </td>
                <td>
                  <em
                    :class="[
                      'status',
                      tone(r.settlementStatus || r.billStatus),
                    ]"
                    >{{ statusText(r.settlementStatus || r.billStatus) }}</em
                  >
                  <div class="billing-row-progress">
                    <i :class="{ done: ['collect', 'invoice', 'done'].includes(billWorkflowStage(r)) }"></i>
                    <i :class="{ done: ['invoice', 'done'].includes(billWorkflowStage(r)) }"></i>
                    <i :class="{ done: billWorkflowStage(r) === 'done' }"></i>
                    <small>{{ ({ review: '等待审核', issue: '等待发布', collect: '等待收款', invoice: '可申请开票', done: '流程完成' } as Record<string, string>)[billWorkflowStage(r)] }}</small>
                  </div>
                </td>
                <td>
                  <button
                    v-if="r.invoiceId"
                    class="link-button"
                    @click="viewInvoice(r)"
                  >
                    {{ invoiceStatusText(r.invoiceStatus) }}</button
                  ><span v-else>—</span>
                </td>
                <td>{{ dateText(r.createTime || r.create_time, true) }}</td>
                <td class="row-actions">
                  <button
                    v-if="paymentNextActionLabel(r)"
                    class="link-btn billing-next-action"
                    @click="runPaymentNextAction(r)"
                  >
                    {{ paymentNextActionLabel(r) }}
                  </button>
                  <button
                    class="table-action-icon"
                    title="查看详情"
                    aria-label="查看详情"
                    @click="show(r)"
                  >
                    <Eye :size="17" />
                  </button>
                </td>
              </tr>
              <tr v-if="!paymentBills.length">
                <td colspan="9" class="empty">当前账期暂无账单。</td>
              </tr>
            </tbody>
          </table>
          <footer class="table-pagination">
            <span>当前阶段 {{ paymentBills.length }} 条</span
            ><button
              class="quiet"
              :disabled="billPage <= 1"
              @click="changeBillPage(-1)"
            >
              上一页</button
            ><button
              v-for="item in pageWindow(
                billPage,
                Math.max(1, Math.ceil(paymentBills.length / billPageSize)),
              )"
              :key="item"
              class="page-number"
              :class="{ active: item === billPage }"
              @click="billPage = item"
            >
              {{ item }}</button
            ><button
              class="quiet"
              :disabled="
                billPage >= Math.max(1, Math.ceil(paymentBills.length / billPageSize))
              "
              @click="changeBillPage(1)"
            >
              下一页
            </button>
          </footer>
        </section></template
      >
      <template v-else>
        <section class="metric-grid archive-metrics">
          <article>
            <span>本期应收金额</span
            ><b>¥{{ money(archiveSummary.receivable) }}</b
            ><small>{{ cycle }} 正式账单</small>
          </article>
          <article>
            <span>本期实收金额</span><b>¥{{ money(archiveSummary.paid) }}</b
            ><small>已登记有效收款</small>
          </article>
          <article>
            <span>本期未收金额</span
            ><b :class="{ arrears: archiveSummary.outstanding > 0 }"
              >¥{{ money(archiveSummary.outstanding) }}</b
            ><small>未结清账单余额</small>
          </article>
          <article>
            <span>已完结档案</span><b>{{ archiveSummary.completed }}</b
            ><small>账单资料已满足完结条件</small>
          </article>
        </section>
        <section class="section-toolbar archive-toolbar">
          <div>
            <b>{{ cycle }} 结算档案</b
            ><small>每张账单独立完结；当月最终归档前仍可继续出账和收款。</small>
          </div>
          <button class="quiet action-with-icon" @click="openArchiveHistory">
            <History :size="16" />历史归档
          </button>
        </section>
        <nav class="billing-stage-tabs" aria-label="档案完结阶段">
          <button
            v-for="stage in archiveStages"
            :key="stage.key"
            :class="{ active: archiveStage === stage.key }"
            @click="archiveStage = stage.key"
          >
            <span>{{ stage.label }}</span><em>{{ archiveStageCount(stage.key) }}</em>
          </button>
        </nav>
        <section class="panel table-panel archive-period-panel archive-item-panel">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>档案编号</th>
                <th>账单类型</th>
                <th>结算对象</th>
                <th>合同</th>
                <th class="money">应收金额</th>
                <th class="money">实收金额</th>
                <th>对账与凭证</th>
                <th>档案状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filteredArchiveItems" :key="String(r.billId || r.id)">
                <td>
                  <button
                    class="link-button"
                    @click="viewArchiveBill({ id: r.billId || r.id })"
                  >
                    {{ r.archiveNo || r.archive_no }}</button
                  ><small
                    >{{ r.billNo || r.bill_no }} · {{ dateText(r.createTime || r.create_time, true) }}</small
                  >
                </td>
                <td>
                  <b>{{ statusText(r.billType || r.bill_type) }}</b>
                  <small v-if="r.supplementNo || r.supplement_no">{{ r.supplementNo || r.supplement_no }}</small>
                </td>
                <td>
                  <b>{{ r.tenantName || r.tenant_name || r.accountName || r.account_name || "—" }}</b>
                  <small>{{ r.orgName || r.org_name || "—" }}</small>
                </td>
                <td><b>{{ r.contractName || r.contract_name || "未绑定合同" }}</b><small>{{ r.contractNo || r.contract_no || "—" }}</small></td>
                <td class="money">¥{{ money(r.totalAmount || r.total_amount) }}</td>
                <td class="money"><b>¥{{ money(r.paidAmount || r.paid_amount) }}</b><small v-if="Number(r.outstandingAmount || r.outstanding_amount) > 0" class="arrears">未收 ¥{{ money(r.outstandingAmount || r.outstanding_amount) }}</small></td>
                <td>
                  <b>{{ r.matchedStatementCount || r.matched_statement_count || 0 }} 笔对账</b>
                  <small>{{ r.receivableVoucherCount || r.receivable_voucher_count || 0 }} 张应收凭证 · {{ r.receiptVoucherCount || r.receipt_voucher_count || 0 }} 张收款凭证</small>
                </td>
                <td>
                  <em :class="['status', tone(r.itemStatus || r.item_status)]">{{ statusText(r.itemStatus || r.item_status) }}</em>
                  <small>{{ Number(r.invoiceCount || r.invoice_count || 0) }} 张发票</small>
                </td>
                <td class="row-actions archive-row-actions">
                  <button
                    class="table-action-icon"
                    title="查看账单档案"
                    aria-label="查看账单档案"
                    @click="viewArchiveBill({ id: r.billId || r.id })"
                  >
                    <Eye :size="17" />
                  </button>
                </td>
              </tr>
              <tr v-if="!filteredArchiveItems.length">
                <td colspan="9" class="empty">当前月份暂无符合条件的结算档案。</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section class="monthly-final-bar" :class="{ archived: monthFinalArchived }">
          <div class="monthly-final-icon"><Archive v-if="monthFinalArchived" :size="20" /><LockKeyhole v-else :size="20" /></div>
          <div>
            <b>{{ cycle }} 当月档案归档</b>
            <small v-if="monthFinalArchived">该月已永久锁定，后续只能查阅历史资料。</small>
            <small v-else-if="monthlyPeriodTarget">共 {{ archiveItems.length }} 份档案，{{ archiveSummary.completed }} 份已完结。最终归档后该月不可再出账或补录。</small>
            <small v-else>{{ periods.length > 1 ? '请选择一个园区后执行最终归档。' : '当前月份尚未建立账期。' }}</small>
          </div>
          <em v-if="monthFinalArchived" class="status success">已最终归档</em>
          <button v-if="monthFinalArchived" class="quiet" @click="openArchiveHistory">查看历史归档</button>
          <button v-else class="primary action-with-icon" :disabled="!monthlyPeriodTarget" @click="beginMonthlyArchive()"><LockKeyhole :size="16" />开始最终归档</button>
        </section>
      </template>
      <AppDialog
        :open="dialog !== 'none'"
        @update:open="
          (v) => {
            if (!v) dialog = 'none';
          }
        "
        :title="
          dialog === 'collection'
            ? '确认并支付'
            : dialog === 'workflow'
              ? workflowTitle
            : dialog === 'finance'
              ? '自动对账中心'
              : dialog === 'archive'
                ? '结算档案详情'
                : dialog === 'scheduleList'
                  ? '自动出账计划'
                  : dialog === 'schedule'
                    ? '新增自动出账计划'
                    : dialog === 'supplement'
                      ? '发起补充结算'
                    : dialog === 'bill'
                      ? '账单详情'
                      : '合同详情'
        "
        eyebrow="SETTLEMENT RECORD"
        hide-actions
        :dialog-class="
          dialog === 'scheduleList'
            ? 'settlement-dialog schedule-list-dialog'
            : dialog === 'archive'
              ? 'settlement-dialog archive-settlement-dialog'
              : 'settlement-dialog'
        "
      >
        <section v-if="dialog === 'supplement'" class="supplement-form-panel">
          <div class="action-notice"><b>独立补充结算</b><span>不会修改原账期已归档的账单、收款或凭证；生成后进入账单支付完成审核与收款。</span></div>
          <div class="form-grid supplement-form-grid">
            <label><span>结算类型</span><AppSelect v-model="supplementForm.settlementType"><option value="LATE_CONTRACT">漏出账合同</option><option value="TEMPORARY">临时结算</option><option value="DATA_CORRECTION">计量数据补正</option><option value="PRICE_CORRECTION">计价纠正</option></AppSelect></label>
            <label><span>结算合同</span><AppSelect v-model="supplementForm.contractId"><option value="">请选择启用合同</option><option v-for="r in scheduleContracts" :key="String(r.id)" :value="String(r.id)">{{ r.contract_name || r.contract_no }}</option></AppSelect></label>
            <label><span>开始日期</span><input v-model="supplementForm.startDate" type="date" /></label>
            <label><span>结束日期</span><input v-model="supplementForm.endDate" type="date" /></label>
            <label><span>付款期限</span><div class="input-suffix"><input v-model="supplementForm.paymentTermDays" type="number" min="0" max="90" /><small>天</small></div></label>
            <label class="form-span-2"><span>补充原因</span><textarea v-model="supplementForm.reason" maxlength="500" placeholder="说明漏出账、换表、退租交接或数据纠正原因" /></label>
            <label class="form-span-2"><span>备注</span><input v-model="supplementForm.remark" placeholder="可选" /></label>
          </div>
          <footer class="dialog-actions"><button class="quiet" @click="dialog='none'">取消</button><button class="primary" :disabled="saving" @click="createSupplementSettlement">生成补充账单</button></footer>
        </section>
        <section v-if="dialog === 'scheduleList'" class="schedule-list-panel">
          <header class="aux-toolbar">
            <div>
              <b>自动出账计划</b
              ><small>按合同定时生成账单，账单进入下方账单列表处理。</small>
            </div>
            <button class="primary" @click="openSchedule">新增计划</button>
          </header>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>计划名称</th>
                <th>执行规则</th>
                <th>付款期限</th>
                <th>合同范围</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in schedules" :key="String(r.id)">
                <td>
                  <b>{{ r.scheduleName || r.schedule_name }}</b
                  ><small>{{ r.orgName || r.org_name || "全部园区" }}</small>
                </td>
                <td>
                  每月 {{ r.executeDay || r.execute_day }} 日
                  {{
                    String(r.executeTime || r.execute_time || "").slice(0, 5)
                  }}
                </td>
                <td>
                  {{ r.paymentTermDays || r.payment_term_days || 15 }} 天内支付
                </td>
                <td>{{ r.contractCount || r.contract_count || 0 }} 份合同</td>
                <td>
                  <em
                    :class="[
                      'status',
                      String(r.lastRunStatus || r.last_run_status) === 'FAILED'
                        ? 'danger'
                        : String(r.lastRunStatus || r.last_run_status) ===
                            'PARTIAL'
                          ? 'warning'
                          : Number(r.enabled ?? 1)
                            ? 'quiet'
                            : 'danger',
                    ]"
                    >{{ Number(r.enabled ?? 1) ? "启用" : "停用" }}</em
                  ><small v-if="r.lastRunStatus || r.last_run_status"
                    >最近：{{
                      statusText(r.lastRunStatus || r.last_run_status)
                    }}</small
                  ><small
                    v-if="r.lastRunMessage || r.last_run_message"
                    :title="String(r.lastRunMessage || r.last_run_message)"
                    >{{ r.lastRunMessage || r.last_run_message }}</small
                  >
                </td>
                <td class="row-actions">
                  <button
                    class="table-action-icon"
                    title="立即执行"
                    aria-label="立即执行"
                    @click="runSchedule(r)"
                  >
                    <RefreshCw :size="17" />
                  </button>
                  <button
                    class="table-action-icon danger"
                    title="删除计划"
                    aria-label="删除计划"
                    @click="removeSchedule(r)"
                  >
                    <Trash2 :size="17" />
                  </button>
                </td>
              </tr>
              <tr v-if="!schedules.length">
                <td colspan="6" class="empty">暂无自动出账计划。</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          v-else-if="dialog === 'schedule'"
          class="form-section schedule-form-panel"
        >
          <div class="schedule-form-grid">
            <label class="schedule-field schedule-field-wide"
              ><span>计划名称</span
              ><input
                v-model="schedule.name"
                placeholder="例如：月度能源自动出账"
              /><small>用于识别计划和追踪出账结果</small></label
            >
            <label class="schedule-field"
              ><span>所属园区</span
              ><AppSelect v-model="schedule.orgId"
                ><option value="">请选择园区</option>
                <option
                  v-for="x in orgs"
                  :key="String(x.id)"
                  :value="String(x.id)"
                >
                  {{ x.org_name }}
                </option></AppSelect
              ></label
            >
            <label class="schedule-field"
              ><span>每月执行日</span>
              <div class="schedule-input-suffix">
                <input
                  v-model.number="schedule.day"
                  type="number"
                  min="1"
                  max="28"
                /><i>日</i>
              </div>
              <small>建议设置为 1—28 日</small></label
            >
            <label class="schedule-field"
              ><span>执行时间</span>
              <div class="schedule-input-suffix">
                <input v-model="schedule.time" type="time" /><i>时</i>
              </div>
              <small>到点后启动账单生成任务</small></label
            >
            <label class="schedule-field"
              ><span>付款期限</span>
              <div class="schedule-input-suffix">
                <input v-model.number="schedule.term" type="number" min="1" /><i
                  >天</i
                >
              </div>
              <small>账单生成后多少天内支付</small></label
            >
          </div>
          <div class="schedule-contract-picker">
            <header>
              <div><b>选择合同</b><small>按选中的合同生成本期账单</small></div>
              <em>{{ schedule.contractIds.length }} 份已选</em>
            </header>
            <label
              v-for="r in scheduleContracts"
              :key="String(r.id)"
              :class="{ selected: schedule.contractIds.includes(String(r.id)) }"
            >
              <input
                v-model="schedule.contractIds"
                type="checkbox"
                :value="String(r.id)"
              />
              <span
                ><b>{{ r.contractName || r.contract_name }}</b
                ><small
                  >{{ r.tenantName || r.tenant_name || "—" }} ·
                  {{ r.contractNo || r.contract_no || r.id }}</small
                ></span
              >
            </label>
            <p v-if="!scheduleContracts.length" class="empty">
              当前园区暂无可选择的已启用合同。
            </p>
          </div>
          <footer class="dialog-actions schedule-form-actions">
            <span>保存后可在自动出账计划中查看、执行或删除</span>
            <div>
              <button class="quiet" @click="dialog = 'scheduleList'">
                取消</button
              ><button class="primary" @click="saveSchedule">保存计划</button>
            </div>
          </footer>
        </section>

        <section v-else-if="dialog === 'workflow'" class="form-section workflow-confirm-panel">
          <div class="detail-hero">
            <div>
              <span>{{ workflowAction === 'review' ? '审核对象' : workflowAction === 'issue' ? '出账对象' : '到账账单' }}</span>
              <b>{{ workflowBill.bill_no || workflowRow.billNo || workflowRow.id }}</b>
              <small>{{ workflowBill.tenant_name_snapshot || workflowBill.account_name || workflowRow.tenantName || '—' }}</small>
            </div>
            <strong>¥{{ money(workflowBill.outstanding_amount ?? workflowRow.outstandingAmount) }}</strong>
          </div>
          <div class="workflow-document">
            <span>{{ workflowAction === 'review' ? '审核确认单' : workflowAction === 'issue' ? '出账确认单' : '到账对账凭据' }}</span>
            <b>{{ workflowAction === 'review' ? workflowDocuments.reviewNo : workflowAction === 'issue' ? workflowDocuments.issueNo : workflowDocuments.receiptHint }}</b>
            <small v-if="workflowAction === 'issue'">确认后生成收款通知：{{ workflowDocuments.noticeNo }}</small>
            <small v-else-if="workflowAction === 'collect'">确认后将一次性生成银行流水、收款记录、自动勾兑和收款凭证草稿。</small>
          </div>
          <section class="workflow-checks">
            <article v-for="check in workflowChecks" :key="String(check.code)" :class="{ failed: check.passed === false }">
              <CheckCircle2 v-if="check.passed !== false" :size="17" />
              <AlertTriangle v-else :size="17" />
              <span><b>{{ check.label }}</b><small>{{ check.detail }}</small></span>
              <em>{{ check.passed === false ? '需核对' : '已核对' }}</em>
            </article>
          </section>
          <section v-if="workflowTimeline.length" class="workflow-timeline">
            <header><b>处理留痕</b><small>确认后将追加本次操作记录</small></header>
            <p v-for="event in workflowTimeline.slice(0, 3)" :key="`${event.event_time}-${event.event_type}`">
              <b>{{ event.event_type }}</b><span>{{ event.remark || '—' }}</span><small>{{ dateText(event.event_time, true) }}</small>
            </p>
          </section>
          <footer class="dialog-actions">
            <button class="quiet" :disabled="workflowSaving" @click="dialog = 'none'">返回</button>
            <button class="primary" :disabled="workflowSaving || workflowChecks.some((check) => check.code !== 'OUTSTANDING' && check.passed === false)" @click="confirmWorkflow">{{ workflowSaving ? '正在处理…' : workflowConfirmText }}</button>
          </footer>
        </section>

        <section v-else-if="dialog === 'bill'" class="form-section">
          <div class="detail-hero">
            <div>
              <span>账单编号</span
              ><b>{{ detail.billNo || detail.bill_no || detail.id }}</b
              ><small>{{
                detail.tenantName ||
                detail.tenant_name ||
                detail.accountName ||
                "—"
              }}</small>
            </div>
            <strong
              >¥{{ money(detail.totalAmount || detail.total_amount) }}</strong
            >
          </div>
          <dl class="detail-grid">
            <div>
              <dt>结算周期</dt>
              <dd>{{ detail.billCycle || detail.bill_cycle || cycle }}</dd>
            </div>
            <div>
              <dt>结算状态</dt>
              <dd>
                {{
                  statusText(
                    detail.settlementStatus ||
                      detail.settlement_status ||
                      detail.billStatus ||
                      detail.bill_status,
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>欠费金额</dt>
              <dd>
                ¥{{
                  money(detail.outstandingAmount || detail.outstanding_amount)
                }}
              </dd>
            </div>
            <div>
              <dt>生成时间</dt>
              <dd>
                {{ dateText(detail.createTime || detail.create_time, true) }}
              </dd>
            </div>
            <div>
              <dt>付款截止</dt>
              <dd>{{ dateText(detail.dueDate || detail.due_date) }}</dd>
            </div>
            <div>
              <dt>关联合同</dt>
              <dd>
                <b>{{ detail.contractName || detail.contract_name || "—" }}</b
                ><small v-if="detail.contractNo || detail.contract_no">{{
                  detail.contractNo || detail.contract_no
                }}</small>
              </dd>
            </div>
          </dl>
          <section v-if="['review', 'issue', 'collect'].includes(billWorkflowStage(detail))" class="bill-workflow-entry">
            <span><b>{{ ({ review: '待审核', issue: '待确认出账', collect: '待模拟到账' } as Record<string, string>)[billWorkflowStage(detail)] }}</b><small>先查看处理单与核对项，再确认本次业务动作。</small></span>
            <button class="primary" @click="openWorkflow(detail, billWorkflowStage(detail) as 'review' | 'issue' | 'collect')">{{ paymentNextActionLabel(detail) }}</button>
          </section>
          <div v-if="detail.contract_snapshot_hash" class="snapshot-proof">
            <CheckCircle2 :size="17" /><span
              ><b>出账合同版本已冻结</b
              ><small
                >{{ dateText(detail.contract_snapshot_time, true) }} · 版本
                {{ detail.contract_snapshot_version || 1 }} ·
                {{ String(detail.contract_snapshot_hash).slice(0, 16) }}…</small
              ></span
            >
          </div>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>费用项目</th>
                <th>计量来源</th>
                <th class="money">用量</th>
                <th class="money">金额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in detailItems" :key="index">
                <td>
                  {{
                    item.itemName ||
                    item.item_name ||
                    item.priceLabel ||
                    item.price_label ||
                    detailItemName(item)
                  }}
                </td>
                <td>
                  <span class="meter-source"
                    ><b>{{ detailSource(item) }}</b
                    ><small>{{ detailPoint(item) }}</small></span
                  >
                </td>
                <td class="money">{{ usageText(item) }}</td>
                <td class="money">
                  ¥{{ money(item.amount || item.fee_amount) }}
                </td>
              </tr>
              <tr v-if="!detailItems.length">
                <td colspan="4" class="empty">暂无费用明细。</td>
              </tr>
            </tbody>
          </table>
          <section class="bill-exception-workbench">
            <header>
              <div>
                <b>账务调整与冲销</b
                ><small
                  >仅用于账单发布后的差错修正，所有操作保留审计记录。</small
                >
              </div>
              <button
                v-if="
                  String(detail.bill_status || detail.billStatus) === 'ISSUED'
                "
                class="quiet"
                @click="openAdjustment"
              >
                创建调整单
              </button>
            </header>
            <div
              v-if="Array.isArray(detail.payments) && detail.payments.length"
              class="bill-operation-list"
            >
              <article
                v-for="payment in detail.payments as RecordRow[]"
                :key="String(payment.id)"
              >
                <span
                  ><b>{{ payment.payment_no }}</b
                  ><small
                    >{{ dateText(payment.pay_time, true) }} ·
                    {{ payment.pay_way }}</small
                  ></span
                ><strong>¥{{ money(payment.pay_amount) }}</strong
                ><em>{{ statusText(payment.payment_status) }}</em
                ><button
                  v-if="payment.payment_status === 'SUCCESS'"
                  class="icon-action"
                  title="冲销收款"
                  @click="requestBillRisk('reversePayment', payment)"
                >
                  <RotateCcw :size="15" />
                </button>
              </article>
            </div>
            <div
              v-if="
                Array.isArray(detail.adjustments) && detail.adjustments.length
              "
              class="bill-operation-list"
            >
              <article
                v-for="adjustment in detail.adjustments as RecordRow[]"
                :key="String(adjustment.id)"
              >
                <span
                  ><b>{{ adjustment.adjustment_no }}</b
                  ><small
                    >{{ statusText(adjustment.adjustment_type) }} ·
                    {{ adjustment.reason }}</small
                  ></span
                ><strong>¥{{ money(adjustment.adjustment_amount) }}</strong
                ><em>{{ statusText(adjustment.status) }}</em
                ><span
                  v-if="adjustment.status === 'PENDING'"
                  class="voucher-actions"
                  ><button
                    class="icon-action"
                    title="审批通过"
                    @click="adjustmentAction(adjustment, 'approve')"
                  >
                    <CheckCircle2 :size="15" /></button
                  ><button
                    class="icon-action"
                    title="撤销调整单"
                    @click="adjustmentAction(adjustment, 'cancel')"
                  >
                    <CircleX :size="15" /></button
                ></span>
              </article>
            </div>
            <footer
              v-if="
                String(detail.bill_status || detail.billStatus) === 'ISSUED' &&
                Number(detail.paid_amount || detail.paidAmount || 0) === 0
              "
            >
              <button
                class="quiet danger-link action-with-icon"
                @click="requestBillRisk('voidBill', detail)"
              >
                <Trash2 :size="14" />作废账单
              </button>
            </footer>
          </section>
        </section>

        <section v-else-if="dialog === 'collection'" class="form-section">
          <div class="detail-hero">
            <div>
              <span>收款账单</span
              ><b>{{
                collection.row.billNo ||
                collection.row.bill_id ||
                collection.row.id
              }}</b
              ><small>{{
                collection.row.tenantName || collection.row.accountName || "—"
              }}</small>
            </div>
            <strong>¥{{ money(collection.row.outstandingAmount) }}</strong>
          </div>
          <div class="form-grid">
            <label
              >支付金额<input v-model="collection.amount" type="number" min="0"
            /></label>
            <label>支付方式<input v-model="collection.way" /></label>
            <label
              >流水号<input
                v-model="collection.transactionNo"
                placeholder="银行流水号/转账凭证号"
            /></label>
            <label>备注<input v-model="collection.remark" /></label>
          </div>
          <footer class="dialog-actions">
            <button class="quiet" @click="dialog = 'none'">取消</button
            ><button class="primary" @click="saveCollection">确认收款</button>
          </footer>
        </section>

        <section v-else-if="dialog === 'finance'" class="finance-layout">
          <aside>
            <header>
              <div><b>待自动对账流水</b><small>系统优先给出可直接确认的账单匹配。</small></div>
              <div class="finance-tools">
                ><button
                  class="icon-action"
                  title="刷新"
                  @click="loadStatements"
                >
                  <RefreshCw :size="15" />
                </button>
              </div>
            </header>
            <div v-if="bankImportResult.id" class="import-result">
              <b>本次导入完成</b
              ><span
                >成功
                {{
                  bankImportResult.success_rows ||
                  bankImportResult.successRows ||
                  0
                }}
                条 · 失败
                {{
                  bankImportResult.error_rows || bankImportResult.errorRows || 0
                }}
                条</span
              >
            </div>
            <button
              v-for="r in statements"
              :key="String(r.id)"
              class="statement-row"
              :class="{ selected: selectedStatement.id === r.id }"
              @click="selectStatement(r)"
            >
              <span
                ><b>{{ r.payerName || r.payer_name || "未知付款方" }}</b
                ><small>{{
                  r.statementTime || r.statement_time || "—"
                }}</small></span
              >
              <strong>¥{{ money(r.amount) }}</strong>
            </button>
            <p v-if="!statements.length" class="empty">暂无银行流水。</p>
            <details class="import-history">
              <summary>导入真实银行流水</summary>
              <label class="inline-action file-action"
                ><Upload :size="14" />{{ bankImporting ? "导入中" : "选择 CSV / XLSX 文件" }}<input type="file" accept=".csv,.xlsx" :disabled="bankImporting" @change="importBankFile" /></label>
              <p v-if="!bankImportBatches.length" class="empty">暂无导入记录。</p>
              <p v-for="r in bankImportBatches" :key="String(r.id)">
                <span>{{ r.original_file_name || r.originalFileName }}</span
                ><b
                  >{{ r.success_count || r.successCount || 0 }}/{{
                    r.total_rows || r.totalRows || 0
                  }}</b
                >
              </p>
            </details>
          </aside>
          <section>
            <header>
              <div><b>系统推荐匹配</b><small>金额一致且属于同一园区的账单会优先显示。</small></div>
              <button v-if="selectedStatement.id && candidates.length === 1" class="primary" @click="autoMatchSelectedStatement">自动匹配</button>
            </header>
            <button
              v-for="r in candidates"
              :key="String(r.bill_id || r.id)"
              class="candidate-row"
            >
              <span
                ><b>{{ r.bill_no || r.billNo || r.bill_id }}</b
                ><small>{{ r.tenant_name || r.tenantName || "—" }}</small></span
              >
              <strong
                >¥{{
                  money(r.outstanding_amount || r.outstandingAmount)
                }}</strong
              >
              <em @click.stop="match(r)">确认匹配</em>
            </button>
            <p v-if="selectedStatement.id && !candidates.length" class="empty">
              当前流水暂无匹配候选。
            </p>
            <p v-if="!selectedStatement.id" class="empty">
              请先选择一条银行流水。
            </p>
          </section>
        </section>

        <section
          v-else-if="dialog === 'archive'"
          class="form-section archive-detail-panel"
        >
          <div class="detail-hero">
            <div>
              <span>账期/档案</span
              ><b>{{
                detail.periodCode ||
                detail.period_code ||
                detail.archive_no ||
                detail.id
              }}</b
              ><small>{{ detail.orgName || detail.org_name || "—" }}</small>
            </div>
            <strong>{{
              statusText(
                detail.closingStatus ||
                  detail.closing_status ||
                  detail.archive_status,
              )
            }}</strong>
          </div>
          <nav class="archive-tabs">
            <button
              :class="{ active: archiveTab === 'overview' }"
              @click="archiveTab = 'overview'"
            >
              结算概览
            </button>
            <button
              v-if="!detailArchived"
              :class="{ active: archiveTab === 'checks' }"
              @click="archiveTab = 'checks'"
            >
              关账检查
            </button>
            <button
              :class="{ active: archiveTab === 'bills' }"
              @click="archiveTab = 'bills'"
            >
              账单明细
            </button>
            <button
              :class="{ active: archiveTab === 'finance' }"
              @click="archiveTab = 'finance'"
            >
              收款与对账
            </button>
            <button
              :class="{ active: archiveTab === 'vouchers' }"
              @click="archiveTab = 'vouchers'"
            >
              财务凭证
            </button>
            <button
              :class="{ active: archiveTab === 'invoices' }"
              @click="archiveTab = 'invoices'"
            >
              发票档案
            </button>
            <button
              :class="{ active: archiveTab === 'supplements' }"
              @click="archiveTab = 'supplements'"
            >
              后续补充结算
            </button>
            <button
              :class="{ active: archiveTab === 'records' }"
              @click="archiveTab = 'records'"
            >
              归档记录
            </button>
          </nav>
          <div class="archive-tab-body">
            <template v-if="archiveTab === 'overview'">
              <dl class="detail-grid archive-overview-grid">
                <div>
                  <dt>账单数量</dt>
                  <dd>{{ detail.billCount || detail.bill_count || 0 }} 张</dd>
                </div>
                <div>
                  <dt>应收金额</dt>
                  <dd>
                    ¥{{
                      money(
                        detail.issuedAmount ||
                          detail.issued_amount ||
                          detail.receivableAmount,
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>实收金额</dt>
                  <dd>¥{{ money(detail.paidAmount || detail.paid_amount) }}</dd>
                </div>
                <div>
                  <dt>未收金额</dt>
                  <dd
                    :class="{
                      arrears:
                        Number(
                          detail.outstandingAmount || detail.outstanding_amount,
                        ) > 0,
                    }"
                  >
                    ¥{{
                      money(
                        detail.outstandingAmount || detail.outstanding_amount,
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>关账状态</dt>
                  <dd>
                    {{ statusText(detail.closingStatus || detail.status) }}
                  </dd>
                </div>
                <div>
                  <dt>关账时间</dt>
                  <dd>
                    {{
                      dateText(detail.closedTime || detail.closed_time, true)
                    }}
                  </dd>
                </div>
                <div>
                  <dt>归档编号</dt>
                  <dd>
                    {{
                      detail.archiveNo ||
                      (detail.archive as RecordRow)?.archive_no ||
                      "尚未生成"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>归档时间</dt>
                  <dd>
                    {{
                      dateText(
                        detail.archivedTime ||
                          (detail.archive as RecordRow)?.archived_time,
                        true,
                      )
                    }}
                  </dd>
                </div>
              </dl>
              <div class="archive-overview-actions">
                <button
                  v-if="
                    !['CLOSED', 'ARCHIVED'].includes(
                      String(detail.closingStatus),
                    )
                  "
                  class="quiet action-with-icon"
                  @click="inspectPeriod(detail)"
                >
                  <RefreshCw :size="14" />重新检查
                </button>
                <button
                  v-if="detail.closingStatus === 'CLOSEABLE'"
                  class="primary"
                  @click="requestArchiveAction('close', detail)"
                >
                  记录阶段关账
                </button>
                <button
                  v-if="detail.closingStatus === 'CLOSED'"
                  class="primary"
                  @click="beginMonthlyArchive(detail)"
                >
                  发起当月最终归档
                </button>
              </div>
            </template>
            <div
              v-else-if="archiveTab === 'checks' && !detailArchived"
              class="closing-check-list"
            >
              <article
                v-for="item in detailChecks"
                :key="String(item.title || item.label)"
                :class="{ failed: !checkPassed(item) }"
              >
                <CheckCircle2 v-if="checkPassed(item)" :size="19" /><CircleX
                  v-else
                  :size="19"
                />
                <div>
                  <b>{{ item.title || item.label }}</b
                  ><small>{{ item.detail }}</small>
                </div>
                <em v-if="checkPassed(item)">通过</em
                ><button
                  v-else
                  class="check-action"
                  @click="handleCheckAction(item)"
                >
                  {{ checkActionLabel(item) }}
                </button>
              </article>
              <p v-if="!detailChecks.length" class="empty">
                暂无关账检查结果。
              </p>
              <footer>
                <button
                  class="quiet action-with-icon"
                  @click="inspectPeriod(detail)"
                >
                  <RefreshCw :size="14" />重新检查</button
                ><button
                  v-if="
                    detail.closeable || detail.closingStatus === 'CLOSEABLE'
                  "
                  class="primary"
                  @click="requestArchiveAction('close', detail)"
                >
                  全部通过，记录阶段关账
                </button>
              </footer>
            </div>
            <table
              v-else-if="archiveTab === 'bills'"
              class="enterprise-table archive-detail-table"
            >
              <thead>
                <tr>
                  <th>账单编号</th>
                  <th>结算对象</th>
                  <th>状态</th>
                  <th class="money">应收</th>
                  <th class="money">实收</th>
                  <th class="money">未收</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in detailBills" :key="String(r.id)">
                  <td>
                    <button class="link-button" @click="viewArchiveBill(r)">
                      {{ r.billNo || r.bill_no }}
                    </button>
                  </td>
                  <td>
                    {{
                      r.accountName ||
                      r.account_name ||
                      r.tenant_name_snapshot ||
                      "—"
                    }}
                  </td>
                  <td>
                    {{
                      String(r.billStatus || r.bill_status) === "ISSUED"
                        ? "已发布"
                        : statusText(r.billStatus || r.bill_status)
                    }}
                    /
                    {{
                      Number(r.payStatus ?? r.pay_status) === 1
                        ? "已结清"
                        : "未结清"
                    }}
                  </td>
                  <td class="money">
                    ¥{{ money(r.totalAmount || r.total_amount) }}
                  </td>
                  <td class="money">
                    ¥{{ money(r.paidAmount || r.paid_amount) }}
                  </td>
                  <td class="money">
                    ¥{{ money(r.outstandingAmount || r.outstanding_amount) }}
                  </td>
                  <td class="row-actions">
                    <button
                      class="table-action-icon"
                      title="查看账单"
                      aria-label="查看账单"
                      @click="viewArchiveBill(r)"
                    >
                      <Eye :size="16" />
                    </button>
                  </td>
                </tr>
                <tr v-if="!detailBills.length">
                  <td colspan="7" class="empty">暂无账单。</td>
                </tr>
              </tbody>
            </table>
            <div
              v-else-if="archiveTab === 'finance'"
              class="archive-finance-grid"
            >
              <section>
                <header>
                  <b>收款记录</b><span>{{ detailPayments.length }} 笔</span>
                </header>
                <article v-for="r in detailPayments" :key="String(r.id)">
                  <div>
                    <b>{{ r.payment_no || r.paymentNo }}</b
                    ><small
                      >{{ r.billNo || r.bill_no }} ·
                      {{ dateText(r.pay_time || r.payTime, true) }}</small
                    >
                  </div>
                  <strong>¥{{ money(r.pay_amount || r.payAmount) }}</strong
                  ><em v-if="Number(r.reconciled)" class="status quiet"
                    >已勾兑</em
                  ><button
                    v-else-if="!detailArchived"
                    class="inline-action"
                    @click="openPaymentMatch(r)"
                  >
                    <Link2 :size="14" />关联流水</button
                  ><em v-else class="status quiet">归档锁定</em>
                </article>
                <p v-if="!detailPayments.length" class="empty">
                  暂无收款记录。
                </p>
              </section>
              <section>
                <header>
                  <b>银行流水</b
                  ><button
                    v-if="!detailArchived"
                    class="inline-action"
                    @click="openStatementImport"
                  >
                    <Plus :size="14" />录入流水</button
                  ><span v-else>只读档案</span>
                </header>
                <article v-for="r in detailStatements" :key="String(r.id)">
                  <div>
                    <b>{{ r.payer_name || r.payerName || "付款方未识别" }}</b
                    ><small>{{
                      r.external_transaction_no || r.externalTransactionNo
                    }}</small>
                  </div>
                  <strong>¥{{ money(r.amount) }}</strong
                  ><em
                    :class="[
                      'status',
                      tone(r.statement_status || r.statementStatus),
                    ]"
                    >{{
                      statusText(r.statement_status || r.statementStatus)
                    }}</em
                  ><button
                    v-if="
                      !detailArchived && (r.active_match_id || r.activeMatchId)
                    "
                    class="icon-action"
                    title="解除勾兑"
                    @click="requestMatchReverse(r)"
                  >
                    <RotateCcw :size="15" />
                  </button>
                </article>
                <p v-if="!detailStatements.length" class="empty">
                  暂无关联银行流水，请先录入实际到账流水。
                </p>
              </section>
            </div>
            <div
              v-else-if="archiveTab === 'vouchers'"
              class="archive-voucher-view"
            >
              <header>
                <div>
                  <b>账期财务凭证</b
                  ><small>应收凭证对应正式账单，收款凭证对应成功收款。</small>
                </div>
                <button
                  v-if="
                    !['CLOSED', 'ARCHIVED'].includes(
                      String(detail.closingStatus),
                    )
                  "
                  class="primary"
                  :disabled="archiveActionLoading"
                  @click="generateMissingVouchers"
                >
                  生成缺失凭证
                </button>
              </header>
              <table class="enterprise-table archive-detail-table">
                <thead>
                  <tr>
                    <th>凭证编号</th>
                    <th>凭证类型</th>
                    <th>关联单据</th>
                    <th>凭证日期</th>
                    <th class="money">借方</th>
                    <th class="money">贷方</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in detailVouchers" :key="String(r.id)">
                    <td>
                      <button class="link-button" @click="viewVoucher(r)">
                        {{ r.voucher_no || r.voucherNo }}
                      </button>
                    </td>
                    <td>{{ statusText(r.voucher_type || r.voucherType) }}</td>
                    <td>
                      {{
                        r.billNo ||
                        r.bill_no ||
                        r.paymentNo ||
                        r.payment_no ||
                        "—"
                      }}
                    </td>
                    <td>{{ dateText(r.voucher_date || r.voucherDate) }}</td>
                    <td class="money">
                      ¥{{ money(r.total_debit || r.totalDebit) }}
                    </td>
                    <td class="money">
                      ¥{{ money(r.total_credit || r.totalCredit) }}
                    </td>
                    <td>
                      {{ statusText(r.voucher_status || r.voucherStatus) }}
                    </td>
                    <td class="voucher-actions">
                      <button
                        class="table-action-icon"
                        title="查看凭证"
                        aria-label="查看凭证"
                        @click="viewVoucher(r)"
                      >
                        <Eye :size="16" /></button
                      ><button
                        class="table-action-icon"
                        title="导出凭证"
                        aria-label="导出凭证"
                        @click="downloadVoucher(r)"
                      >
                        <Download :size="16" />
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!detailVouchers.length">
                    <td colspan="8" class="empty">
                      暂无财务凭证，请生成本账期缺失凭证。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <table
              v-else-if="archiveTab === 'invoices'"
              class="enterprise-table archive-detail-table"
            >
              <thead>
                <tr>
                  <th>申请编号</th>
                  <th>发票号码</th>
                  <th>抬头</th>
                  <th>类型</th>
                  <th class="money">含税金额</th>
                  <th>状态</th>
                  <th>开具时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in detailInvoices" :key="String(r.id)">
                  <td>{{ r.invoice_request_no || r.invoiceRequestNo }}</td>
                  <td>{{ r.invoice_no || r.invoiceNo || "—" }}</td>
                  <td>{{ r.invoice_title || r.invoiceTitle }}</td>
                  <td>{{ statusText(r.invoice_type || r.invoiceType) }}</td>
                  <td class="money">
                    ¥{{ money(r.invoice_amount || r.invoiceAmount) }}
                  </td>
                  <td>
                    {{ invoiceStatusText(r.invoice_status || r.invoiceStatus) }}
                  </td>
                  <td>{{ dateText(r.issued_time || r.issuedTime, true) }}</td>
                </tr>
                <tr v-if="!detailInvoices.length">
                  <td colspan="7" class="empty">本账期暂无发票记录。</td>
                </tr>
              </tbody>
            </table>
            <section v-else-if="archiveTab === 'supplements'" class="archive-records-view">
              <header class="archive-record-section-head"><div><b>后续补充结算</b><small>原账期保持不变；补充账单独立审核、收款与归档。</small></div><button class="primary" @click="openSupplement(detail)">发起补充结算</button></header>
              <table class="enterprise-table archive-detail-table">
                <thead><tr><th>补充结算单</th><th>合同</th><th>结算范围</th><th>原因</th><th>补充账单</th><th class="money">金额</th><th>状态</th><th>操作</th></tr></thead>
                <tbody><tr v-for="r in detailSupplements" :key="String(r.id)"><td>{{ r.supplement_no }}</td><td>{{ r.contract_name || r.contract_no || '—' }}</td><td>{{ dateText(r.settlement_start_date) }} 至 {{ dateText(r.settlement_end_date) }}</td><td>{{ r.reason }}</td><td>{{ r.bill_no || '待生成' }}</td><td class="money">¥{{ money(r.total_amount) }}</td><td><em :class="['status', tone(r.status)]">{{ statusText(r.status) }}</em></td><td class="row-actions"><button v-if="r.generated_bill_id" class="table-action-icon" title="查看账单" aria-label="查看账单" @click="viewArchiveBill({ id: r.generated_bill_id })"><Eye :size="16" /></button><button v-if="['PAID','ARCHIVED'].includes(String(r.status).toUpperCase())" class="table-action-icon" :title="String(r.status).toUpperCase()==='ARCHIVED' ? '查看归档记录' : '归档检查'" :aria-label="String(r.status).toUpperCase()==='ARCHIVED' ? '查看归档记录' : '归档检查'" @click="openSupplementArchiveCheck(r)"><ClipboardCheck :size="16" /></button></td></tr><tr v-if="!detailSupplements.length"><td colspan="8" class="empty">暂无后续补充结算。原账期账单与归档记录未被修改。</td></tr></tbody>
              </table>
            </section>
            <div v-else class="archive-records-view">
              <dl class="detail-grid">
                <div>
                  <dt>档案编号</dt>
                  <dd>
                    {{
                      detail.archiveNo ||
                      (detail.archive as RecordRow)?.archive_no ||
                      "尚未生成"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>档案状态</dt>
                  <dd>
                    {{
                      statusText(
                        detail.archiveStatus ||
                          (detail.archive as RecordRow)?.archive_status ||
                          "—",
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>关账人员</dt>
                  <dd>{{ detail.closedBy || detail.closed_by || "—" }}</dd>
                </div>
                <div>
                  <dt>归档人员</dt>
                  <dd>
                    {{
                      detail.archivedBy ||
                      (detail.archive as RecordRow)?.archived_by ||
                      "—"
                    }}
                  </dd>
                </div>
                <div v-if="detail.snapshotVerified">
                  <dt>完整性校验</dt>
                  <dd>已通过 · 版本 {{ detail.snapshotVersion || 1 }}</dd>
                </div>
                <div v-if="detail.snapshotHash">
                  <dt>档案摘要</dt>
                  <dd :title="String(detail.snapshotHash)">
                    {{ String(detail.snapshotHash).slice(0, 20) }}…
                  </dd>
                </div>
              </dl>
              <section class="archive-material-list">
                <b>档案材料</b><span>合同与计价规则关联</span
                ><span>账单及分时计费明细（{{ detailBills.length }} 张）</span
                ><span
                  >收款及银行流水（{{ detailPayments.length }} /
                  {{ detailStatements.length }} 笔）</span
                ><span>财务凭证（{{ detailVouchers.length }} 张）</span
                ><span>发票记录（{{ detailInvoices.length }} 张）</span
                ><span>调账记录（{{ detailAdjustments.length }} 条）</span
                ><span>业务操作日志（{{ detailEvents.length }} 条）</span>
              </section>
              <section
                v-if="detailAdjustments.length"
                class="archive-record-section"
              >
                <header>
                  <b>调账记录</b><span>{{ detailAdjustments.length }} 条</span>
                </header>
                <table class="enterprise-table archive-detail-table">
                  <thead>
                    <tr>
                      <th>调整单号</th>
                      <th>账单</th>
                      <th>类型</th>
                      <th class="money">金额</th>
                      <th>状态</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in detailAdjustments" :key="String(r.id)">
                      <td>{{ r.adjustment_no || r.adjustmentNo }}</td>
                      <td>{{ r.billNo || r.bill_no }}</td>
                      <td>
                        {{ statusText(r.adjustment_type || r.adjustmentType) }}
                      </td>
                      <td class="money">
                        ¥{{ money(r.adjustment_amount || r.adjustmentAmount) }}
                      </td>
                      <td>{{ statusText(r.status) }}</td>
                      <td>{{ r.reason || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
              <section
                v-if="detailEvents.length"
                class="archive-record-section"
              >
                <header>
                  <b>业务操作日志</b
                  ><span>最近 {{ detailEvents.length }} 条</span>
                </header>
                <table class="enterprise-table archive-detail-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>账单</th>
                      <th>业务动作</th>
                      <th>操作人</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in detailEvents" :key="String(r.id)">
                      <td>{{ dateText(r.event_time || r.eventTime, true) }}</td>
                      <td>{{ r.billNo || r.bill_no }}</td>
                      <td>{{ statusText(r.event_type || r.eventType) }}</td>
                      <td>{{ r.operator || r.created_by || "—" }}</td>
                      <td>{{ r.remark || r.description || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
              <footer v-if="!detailArchived">
                <button
                  class="primary"
                  @click="beginMonthlyArchive(detail)"
                >
                  发起当月最终归档
                </button>
              </footer>
            </div>
          </div>
        </section>

        <section v-else class="contract-document">
          <header>
            <span>ENERGY SETTLEMENT CONTRACT</span>
            <h2>能源计量结算合同</h2>
            <p>{{ form.contractNo }}</p>
          </header>
          <section class="contract-meta">
            <p>合同名称：<input v-model="form.contractName" /></p>
            <p>合同编号：<input v-model="form.contractNo" /></p>
            <p>
              甲方园区：<AppSelect v-model="form.orgId"
                ><option value="">请选择</option>
                <option
                  v-for="x in orgs"
                  :key="String(x.id)"
                  :value="String(x.id)"
                >
                  {{ x.org_name }}
                </option></AppSelect
              >
            </p>
            <p>
              乙方租户：<AppSelect v-model="form.tenantId"
                ><option value="">请选择</option>
                <option
                  v-for="x in tenants"
                  :key="String(x.id)"
                  :value="String(x.id)"
                >
                  {{ x.tenant_name }}
                </option></AppSelect
              >
            </p>
            <p>开始日期：<input v-model="form.startDate" type="date" /></p>
            <p>结束日期：<input v-model="form.endDate" type="date" /></p>
          </section>
          <footer class="dialog-actions">
            <button class="quiet" @click="dialog = 'none'">取消</button
            ><button
              class="primary"
              :disabled="saving"
              @click="saveContractForm"
            >
              保存合同
            </button>
          </footer>
        </section>
      </AppDialog>
      <AppDialog
        :open="archiveActionDialog !== 'none'"
        @update:open="
          (v) => {
            if (!v) archiveActionDialog = 'none';
          }
        "
        :title="
          archiveActionDialog === 'statementImport'
            ? '录入银行流水'
            : archiveActionDialog === 'paymentMatch'
              ? '关联银行流水'
              : archiveActionDialog === 'voucher'
                ? '财务凭证详情'
                : '账单详情'
        "
        eyebrow="FINANCE OPERATION"
        hide-actions
        dialog-class="settlement-dialog archive-action-dialog"
      >
        <section
          v-if="archiveActionDialog === 'statementImport'"
          class="archive-action-panel"
        >
          <div class="action-notice">
            <b>实际到账流水</b
            ><span
              >请填写银行真实入账时间；流水会在勾兑后自动归属到对应账单的结算周期。</span
            >
          </div>
          <div class="form-grid">
            <label
              >银行流水号<input
                v-model="statementForm.externalTransactionNo"
                placeholder="请输入银行回单流水号"
            /></label>
            <label
              >入账时间<input
                v-model="statementForm.statementTime"
                type="datetime-local"
            /></label>
            <label
              >付款方名称<input
                v-model="statementForm.payerName"
                placeholder="企业或租户名称"
            /></label>
            <label
              >付款方账号<input
                v-model="statementForm.payerAccount"
                placeholder="付款账户"
            /></label>
            <label
              >到账金额<input
                v-model="statementForm.amount"
                type="number"
                min="0.01"
                step="0.01"
            /></label>
            <label
              >摘要<input
                v-model="statementForm.narrative"
                placeholder="转账用途或附言"
            /></label>
          </div>
          <footer class="dialog-actions">
            <button class="quiet" @click="archiveActionDialog = 'none'">
              取消</button
            ><button
              class="primary"
              :disabled="archiveActionLoading"
              @click="saveStatementImport"
            >
              保存流水
            </button>
          </footer>
        </section>
        <section
          v-else-if="archiveActionDialog === 'paymentMatch'"
          class="payment-match-panel"
        >
          <div class="match-payment-summary">
            <div>
              <span>待勾兑收款</span
              ><b>{{
                selectedArchivePayment.payment_no ||
                selectedArchivePayment.paymentNo
              }}</b
              ><small>{{
                selectedArchivePayment.billNo || selectedArchivePayment.bill_no
              }}</small>
            </div>
            <strong
              >¥{{
                money(
                  selectedArchivePayment.pay_amount ||
                    selectedArchivePayment.payAmount,
                )
              }}</strong
            >
          </div>
          <div class="payment-match-grid">
            <aside>
              <header>
                <b>选择银行流水</b
                ><button class="inline-action" @click="openStatementImport">
                  <Plus :size="14" />录入
                </button>
              </header>
              <button
                v-for="r in actionStatements"
                :key="String(r.id)"
                :class="[
                  'statement-row',
                  { selected: selectedActionStatement.id === r.id },
                ]"
                @click="selectActionStatement(r)"
              >
                <span
                  ><b>{{ r.payer_name || r.payerName || "付款方未识别" }}</b
                  ><small
                    >{{
                      r.external_transaction_no || r.externalTransactionNo
                    }}
                    ·
                    {{
                      dateText(r.statement_time || r.statementTime, true)
                    }}</small
                  ></span
                ><strong
                  >¥{{
                    money(Number(r.amount) - Number(r.matched_amount || 0))
                  }}</strong
                >
              </button>
              <p v-if="!actionStatements.length" class="empty">
                暂无可用银行流水。
              </p>
            </aside>
            <section>
              <header>
                <b>可关联收款</b><small>按金额和到账时间排序</small>
              </header>
              <article
                v-for="r in actionPaymentCandidates"
                :key="String(r.payment_id || r.id)"
                :class="{
                  recommended:
                    String(r.payment_id || r.id) ===
                    String(selectedArchivePayment.id),
                }"
              >
                <div>
                  <b>{{ r.payment_no || r.paymentNo }}</b
                  ><small
                    >{{ r.bill_no || r.billNo }} ·
                    {{ r.account_name || r.tenant_name_snapshot || "—" }}</small
                  >
                </div>
                <strong>¥{{ money(r.pay_amount || r.payAmount) }}</strong
                ><button class="inline-action" @click="linkExistingPayment(r)">
                  <Link2 :size="14" />确认关联
                </button>
              </article>
              <p
                v-if="
                  selectedActionStatement.id && !actionPaymentCandidates.length
                "
                class="empty"
              >
                该流水没有金额匹配的待勾兑收款。
              </p>
              <p v-if="!selectedActionStatement.id" class="empty">
                请先选择左侧银行流水。
              </p>
            </section>
          </div>
        </section>
        <section
          v-else-if="archiveActionDialog === 'voucher'"
          class="archive-action-panel voucher-document"
        >
          <header>
            <div>
              <span>记账凭证</span>
              <h3>{{ voucherDetail.voucher_no || voucherDetail.voucherNo }}</h3>
            </div>
            <em>{{
              dateText(voucherDetail.voucher_date || voucherDetail.voucherDate)
            }}</em>
          </header>
          <dl class="detail-grid">
            <div>
              <dt>凭证类型</dt>
              <dd>
                {{
                  statusText(
                    voucherDetail.voucher_type || voucherDetail.voucherType,
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>摘要</dt>
              <dd>{{ voucherDetail.summary || "园区能源结算" }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {{
                  statusText(
                    voucherDetail.voucher_status || voucherDetail.voucherStatus,
                  )
                }}
              </dd>
            </div>
          </dl>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>科目编码</th>
                <th>科目名称</th>
                <th>摘要</th>
                <th class="money">借方</th>
                <th class="money">贷方</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in (voucherDetail.lines as RecordRow[]) || []"
                :key="String(r.id)"
              >
                <td>{{ r.account_code }}</td>
                <td>{{ r.account_name }}</td>
                <td>{{ r.summary }}</td>
                <td class="money">¥{{ money(r.debit_amount) }}</td>
                <td class="money">¥{{ money(r.credit_amount) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section v-else class="archive-action-panel">
          <div class="detail-hero">
            <div>
              <span>账单编号</span
              ><b>{{ voucherDetail.billNo || voucherDetail.bill_no }}</b
              ><small>{{
                voucherDetail.tenantName ||
                voucherDetail.tenant_name ||
                voucherDetail.accountName ||
                "—"
              }}</small>
            </div>
            <strong
              >¥{{
                money(voucherDetail.totalAmount || voucherDetail.total_amount)
              }}</strong
            >
          </div>
          <dl class="detail-grid">
            <div>
              <dt>结算周期</dt>
              <dd>{{ voucherDetail.billCycle || voucherDetail.bill_cycle }}</dd>
            </div>
            <div>
              <dt>账单状态</dt>
              <dd>
                {{
                  statusText(
                    voucherDetail.billStatus || voucherDetail.bill_status,
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>付款截止</dt>
              <dd>
                {{ dateText(voucherDetail.dueDate || voucherDetail.due_date) }}
              </dd>
            </div>
            <div>
              <dt>实收金额</dt>
              <dd>
                ¥{{
                  money(voucherDetail.paidAmount || voucherDetail.paid_amount)
                }}
              </dd>
            </div>
            <div>
              <dt>未收金额</dt>
              <dd>
                ¥{{
                  money(
                    voucherDetail.outstandingAmount ||
                      voucherDetail.outstanding_amount,
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>关联合同</dt>
              <dd>
                {{
                  voucherDetail.contractName ||
                  voucherDetail.contract_name ||
                  "—"
                }}
              </dd>
            </div>
          </dl>
        </section>
      </AppDialog>
      <AppDialog
        :open="adjustmentOpen"
        @update:open="(v) => (adjustmentOpen = v)"
        title="创建账单调整单"
        eyebrow="BILL ADJUSTMENT"
        hide-actions
        dialog-class="settlement-dialog adjustment-dialog"
      >
        <section class="archive-action-panel">
          <div class="action-notice">
            <b>差错调整</b
            ><span>调整单创建后需要审批，通过后才会更新账单应收金额。</span>
          </div>
          <div class="form-grid">
            <label
              >调整类型<AppSelect v-model="adjustmentForm.type"
                ><option value="DISCOUNT">费用减免</option>
                <option value="SUPPLEMENT">费用补收</option></AppSelect
              ></label
            >
            <label
              >调整金额<input
                v-model="adjustmentForm.amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
            /></label>
            <label
              >业务原因<input
                v-model="adjustmentForm.reason"
                placeholder="请填写可审计的调整原因"
            /></label>
            <label
              >备注<input
                v-model="adjustmentForm.remark"
                placeholder="补充说明（可选）"
            /></label>
          </div>
          <footer class="dialog-actions">
            <button class="quiet" @click="adjustmentOpen = false">取消</button
            ><button
              class="primary"
              :disabled="adjustmentSaving"
              @click="saveAdjustment"
            >
              提交调整单
            </button>
          </footer>
        </section>
      </AppDialog>
      <AppDialog
        :open="invoiceOpen"
        @update:open="(v) => (invoiceOpen = v)"
        title="发票管理"
        eyebrow="INVOICE REGISTER"
        hide-actions
        dialog-class="settlement-dialog invoice-dialog"
      >
        <section class="invoice-workbench">
          <header class="invoice-head">
            <div>
              <b>{{
                invoiceMode === "list"
                  ? "发票台账"
                  : invoiceMode === "request"
                    ? "申请开票"
                    : "发票详情"
              }}</b
              ><small
                >发票与已结清账单一一追溯，红冲保留原票和红字票记录。</small
              >
            </div>
            <button
              v-if="invoiceMode !== 'list'"
              class="quiet"
              @click="
                invoiceMode = 'list';
                loadInvoiceRows();
              "
            >
              返回台账
            </button>
          </header>
          <table v-if="invoiceMode === 'list'" class="enterprise-table">
            <thead>
              <tr>
                <th>申请编号</th>
                <th>关联账单</th>
                <th>发票抬头</th>
                <th class="money">金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in invoiceRows" :key="String(r.id)">
                <td>{{ r.invoice_request_no || r.invoiceRequestNo }}</td>
                <td>{{ r.bill_nos || r.billNos || "—" }}</td>
                <td>
                  <b>{{ r.invoice_title || r.invoiceTitle }}</b
                  ><small>{{
                    statusText(r.invoice_type || r.invoiceType)
                  }}</small>
                </td>
                <td class="money">
                  ¥{{ money(r.invoice_amount || r.invoiceAmount) }}
                </td>
                <td>
                  <em
                    :class="[
                      'status',
                      tone(r.invoice_status || r.invoiceStatus),
                    ]"
                    >{{
                      invoiceStatusText(r.invoice_status || r.invoiceStatus)
                    }}</em
                  >
                </td>
                <td>
                  <button
                    class="table-action-icon"
                    title="查看发票"
                    aria-label="查看发票"
                    @click="viewInvoice(r)"
                  >
                    <Eye :size="16" />
                  </button>
                </td>
              </tr>
              <tr v-if="!invoiceRows.length">
                <td colspan="6" class="empty">
                  暂无发票记录；请从已结清账单发起开票。
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="invoiceMode === 'request'" class="invoice-form">
            <div class="invoice-bill-chip">
              <ReceiptText :size="18" /><span
                ><b>关联账单</b
                ><small
                  >{{ invoiceForm.billIds.length }} 张已结清账单</small
                ></span
              >
            </div>
            <div class="invoice-type-cards">
              <button
                :class="{ active: invoiceForm.invoiceType === 'NORMAL' }"
                @click="invoiceForm.invoiceType = 'NORMAL'"
              >
                <b>增值税普通发票</b
                ><small>适用于常规能源费用结算</small></button
              ><button
                :class="{ active: invoiceForm.invoiceType === 'SPECIAL' }"
                @click="invoiceForm.invoiceType = 'SPECIAL'"
              >
                <b>增值税专用发票</b><small>需填写完整纳税人识别号</small>
              </button>
            </div>
            <div class="form-grid">
              <label
                >发票抬头<input
                  v-model="invoiceForm.invoiceTitle"
                  placeholder="企业完整名称" /></label
              ><label
                >纳税人识别号<input
                  v-model="invoiceForm.taxpayerNo"
                  placeholder="统一社会信用代码" /></label
              ><label
                >接收邮箱<input
                  v-model="invoiceForm.email"
                  type="email" /></label
              ><label>接收手机<input v-model="invoiceForm.mobile" /></label
              ><label class="wide-field"
                >申请备注<input v-model="invoiceForm.remark"
              /></label>
            </div>
            <footer class="dialog-actions">
              <button class="quiet" @click="invoiceOpen = false">取消</button
              ><button
                class="primary"
                :disabled="invoiceLoading"
                @click="saveInvoiceRequest"
              >
                提交开票申请
              </button>
            </footer>
          </div>
          <div v-else class="invoice-detail">
            <div class="detail-hero">
              <div>
                <span>发票申请编号</span
                ><b>{{
                  invoiceDetail.invoice_request_no ||
                  invoiceDetail.invoiceRequestNo
                }}</b
                ><small>{{
                  invoiceDetail.invoice_title || invoiceDetail.invoiceTitle
                }}</small>
              </div>
              <strong
                >¥{{
                  money(
                    invoiceDetail.invoice_amount || invoiceDetail.invoiceAmount,
                  )
                }}</strong
              >
            </div>
            <dl class="detail-grid">
              <div>
                <dt>发票类型</dt>
                <dd>
                  {{
                    statusText(
                      invoiceDetail.invoice_type || invoiceDetail.invoiceType,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>发票号码</dt>
                <dd>
                  {{
                    invoiceDetail.invoice_no ||
                    invoiceDetail.invoiceNo ||
                    "尚未开具"
                  }}
                </dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  {{
                    invoiceStatusText(
                      invoiceDetail.invoice_status ||
                        invoiceDetail.invoiceStatus,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>申请时间</dt>
                <dd>
                  {{
                    dateText(
                      invoiceDetail.requested_time ||
                        invoiceDetail.requestedTime,
                      true,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>开具时间</dt>
                <dd>
                  {{
                    dateText(
                      invoiceDetail.issued_time || invoiceDetail.issuedTime,
                      true,
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>交付时间</dt>
                <dd>
                  {{
                    dateText(
                      invoiceDetail.delivered_time ||
                        invoiceDetail.deliveredTime,
                      true,
                    )
                  }}
                </dd>
              </div>
            </dl>
            <section class="invoice-linked-bills">
              <b>关联账单</b
              ><span
                v-for="r in (invoiceDetail.bills as RecordRow[]) || []"
                :key="String(r.id)"
                >{{ r.bill_no || r.billNo
                }}<strong
                  >¥{{ money(r.invoiced_amount || r.invoicedAmount) }}</strong
                ></span
              >
            </section>
            <div
              v-if="String(invoiceDetail.invoice_status) === 'REQUESTED'"
              class="invoice-operation"
            >
              <span class="invoice-auto-number"><b>发票代码与号码由系统生成</b><small>确认开具后自动编号，避免重复或手工录入错误。</small></span><button
                class="primary"
                :disabled="invoiceLoading"
                @click="issueInvoice"
              >
                确认开具
              </button>
            </div>
            <div
              v-else-if="
                ['ISSUED', 'DELIVERED'].includes(
                  String(invoiceDetail.invoice_status),
                )
              "
              class="invoice-operation"
            >
              <label class="file-action inline-action"
                ><Upload :size="14" />选择 PDF / OFD<input
                  type="file"
                  accept=".pdf,.ofd"
                  @change="selectInvoiceFile" /></label
              ><button
                class="quiet"
                :disabled="!invoiceFile || invoiceLoading"
                @click="uploadInvoice"
              >
                上传电子票</button
              ><a
                v-if="invoiceDetail.downloadUrl"
                class="inline-action"
                :href="String(invoiceDetail.downloadUrl)"
                target="_blank"
                >查看电子票</a
              ><button
                v-if="
                  String(invoiceDetail.invoice_status) === 'ISSUED' &&
                  invoiceDetail.file_url
                "
                class="primary"
                @click="deliverInvoice"
              >
                确认交付
              </button>
            </div>
            <div
              v-if="
                ['ISSUED', 'DELIVERED'].includes(
                  String(invoiceDetail.invoice_status),
                )
              "
              class="invoice-red"
            >
              <input
                v-model="invoiceForm.redReason"
                placeholder="填写红冲原因"
              /><button class="danger-link quiet" @click="redInvoice">
                申请红冲
              </button>
            </div>
            <div
              v-if="String(invoiceDetail.invoice_status) === 'RED_APPLIED'"
              class="invoice-operation"
            >
              <span class="invoice-auto-number"><b>红字发票标识由系统生成</b><small>确认红冲后自动关联原发票并完成编号。</small></span><button class="primary" @click="confirmRedInvoice">
                确认红冲
              </button>
            </div>
          </div>
        </section>
      </AppDialog>
      <BillingContractEditor
        v-model:open="contractEditorOpen"
        @saved="loadContracts"
      /><BillingAuxManagerDialog
        v-model:open="auxManagerOpen"
        :mode="auxMode"
        :contract="pricingContract"
        @saved="loadContracts"
      />
    </section>
    <AppDialog
      :open="formalContractOpen"
      @update:open="(v) => (formalContractOpen = v)"
      title="能源计量结算合同"
      eyebrow="FORMAL CONTRACT"
      hide-actions
      dialog-class="settlement-dialog formal-contract-dialog"
      ><article class="formal-contract-view">
        <header class="formal-view-heading">
          <div class="formal-code">ENERGY SETTLEMENT AGREEMENT</div>
          <h2>能源计量结算合同</h2>
          <p>（园区能源计量、费用结算及用能服务协议）</p>
          <div class="formal-meta">
            <span>合同编号：{{ contractDetail.contractNo || "—" }}</span
            ><span>发起时间：{{ contractDetail.createdTime || "—" }}</span>
          </div>
        </header>
        <section>
          <h3>第一条　合同主体</h3>
          <p>
            甲方：{{
              contractDetail.orgName || "园区能源运营管理方"
            }}（以下简称“甲方”）
          </p>
          <p>
            乙方：{{
              contractDetail.tenantName || "用能单位"
            }}（以下简称“乙方”）
          </p>
          <p>
            合同名称：{{
              contractDetail.contractName || "能源计量结算合同"
            }}；合同期限：{{ contractDetail.startDate || "—" }} 至
            {{ contractDetail.endDate || "—" }}。
          </p>
        </section>
        <section>
          <h3>第二条　结算范围</h3>
          <p>
            本合同结算范围由双方确认的计费空间、计量设备及计价规则构成。甲方依据平台中经校验的计量数据和正式计价规则生成账单，乙方按账单约定期限完成确认、支付及对账。
          </p>
          <div class="formal-binding">
            <div>
              <b>绑定空间</b
              ><span
                v-for="space in contractDetail.spaces"
                :key="String(space.id || space.space_id)"
                >{{
                  space.space_name || space.spaceName || space.space_code
                }}</span
              ><em v-if="!contractDetail.spaces.length"
                >{{ contractDetail.spaceCount }} 个</em
              >
            </div>
            <div>
              <b>绑定设备</b
              ><span
                v-for="meter in contractDetail.meters"
                :key="String(meter.id || meter.device_id)"
                >{{
                  meter.device_name || meter.deviceName || meter.device_sn
                }}</span
              ><em v-if="!contractDetail.meters.length"
                >{{ contractDetail.meterCount }} 台</em
              >
            </div>
          </div>
        </section>
        <section>
          <h3>第三条　计量、计费与付款</h3>
          <p>
            甲方根据设备原始读数、数据质量校验、计量倍率、换表记录及有效计价规则核算本期用量和应付金额。账单生成后进入账单支付流程，乙方应在付款截止日前完成付款；付款流水与账单完成勾兑后，相关记录进入结算档案。
          </p>
          <p>
            如发生数据缺失、异常跳变、设备更换或其他影响计量准确性的情形，甲方应依据平台规则进行补录、修正或重算，并保留处理依据及审计记录。
          </p>
        </section>
        <section>
          <h3>第四条　计价规则与变更</h3>
          <div class="formal-rules">
            <div v-for="rule in contractDetail.rules" :key="String(rule.id)">
              <b>{{ rule.rule_name || rule.ruleName }}</b
              ><span
                >{{ rule.price_mode || rule.priceMode || "按量计价" }} ·
                {{ rule.billing_cycle || rule.billingCycle || "月结" }}</span
              >
            </div>
            <p v-if="!contractDetail.rules.length">
              {{ contractDetail.ruleCount }} 条已配置计价规则
            </p>
          </div>
          <p>
            合同绑定空间、设备或计价规则发生变化时，应通过平台变更流程办理。合同终止不影响终止日前已发生的能源费用、账单及应收款项。
          </p>
        </section>
        <section>
          <h3>第五条　争议、归档与法律效力</h3>
          <p>
            乙方如对账单有异议，应在付款截止日前提出并提交相应依据；双方应先依据合同、计量明细、账单、收款流水及操作日志核验。合同正文及其绑定明细、计价规则、账单和结算档案共同构成完整业务记录。
          </p>
        </section>
        <footer class="formal-signature">
          <div>
            <b>甲方（盖章）：</b>
            <img
              class="formal-stamp"
              :src="contractStamp"
              alt="合同专用章"
            /><small
              >经办人：{{
                contractDetail.orgName || "园区能源管理运营方"
              }}</small
            ><small
              >签署时间：{{
                contractDetail.signedTime ||
                contractDetail.signed_time ||
                contractDetail.createdTime ||
                "—"
              }}</small
            >
          </div>
          <div>
            <b>乙方（盖章）：</b
            ><small
              >联系人：{{
                contractDetail.contactName ||
                contractDetail.contact_name ||
                contractDetail.tenantName ||
                "—"
              }}</small
            ><small
              >签署时间：{{
                contractDetail.signedTime || contractDetail.signed_time || "—"
              }}</small
            >
          </div>
        </footer>
      </article></AppDialog
    >
    <AppDialog
      :open="supplementArchiveOpen"
      @update:open="(v) => (supplementArchiveOpen = v)"
      title="补充结算归档检查"
      eyebrow="SUPPLEMENT ARCHIVE CONTROL"
      hide-actions
      dialog-class="settlement-dialog supplement-archive-dialog"
    >
      <section class="supplement-archive-panel">
        <header>
          <div>
            <span>补充结算单</span>
            <b>{{ supplementArchiveDetail.supplement_no || '—' }}</b>
            <small>{{ supplementArchiveDetail.contract_name || supplementArchiveDetail.contract_no || '—' }} · {{ supplementArchiveDetail.bill_no || '待生成账单' }}</small>
          </div>
          <strong :class="{ ready: supplementArchiveDetail.archiveReady }">{{ supplementArchiveDetail.archiveReady ? '可归档' : '待补齐资料' }}</strong>
        </header>
        <div class="supplement-archive-checks">
          <article v-for="item in (supplementArchiveDetail.archiveChecks as RecordRow[]) || []" :key="String(item.name)">
            <CheckCircle2 v-if="item.passed" :size="18" /><CircleX v-else :size="18" />
            <div><b>{{ item.name }}</b><small>{{ item.detail }}</small></div>
            <button v-if="!item.passed" class="text-button" @click="openSupplementArchiveTarget(String(item.target))">{{ item.target }}</button>
          </article>
        </div>
        <footer class="dialog-actions">
          <button class="quiet" @click="supplementArchiveOpen = false">暂不处理</button>
          <button class="primary" :disabled="!supplementArchiveDetail.archiveReady || supplementArchiveLoading" @click="archiveSupplement(supplementArchiveDetail)">确认归档</button>
        </footer>
      </section>
    </AppDialog>
    <AppDialog
      :open="monthlyArchiveStep === 2"
      @update:open="(v) => { if (!v) monthlyArchiveStep = 0; }"
      title="月度归档数据核对"
      eyebrow="MONTH-END ARCHIVE REVIEW"
      hide-actions
      dialog-class="monthly-review-dialog"
    >
      <section class="monthly-review-panel">
        <header>
          <div><span>归档月份</span><b>{{ monthlyArchiveTarget?.periodCode || monthlyArchiveTarget?.period_code || cycle }}</b><small>{{ monthlyArchiveTarget?.orgName || monthlyArchiveTarget?.org_name || '当前园区' }}</small></div>
          <em :class="['status', monthlyArchiveReview.closeable ? 'success' : 'danger']">{{ monthlyArchiveReview.closeable ? '检查通过' : '存在阻断项' }}</em>
        </header>
        <div class="monthly-review-metrics">
          <article><span>账单档案</span><b>{{ monthlyArchiveSummary.billCount || monthlyArchiveSummary.bill_count || 0 }}</b><small>其中补充账单 {{ monthlyArchiveSummary.supplementCount || monthlyArchiveSummary.supplement_count || 0 }} 份</small></article>
          <article><span>应收金额</span><b>¥{{ money(monthlyArchiveSummary.receivableAmount || monthlyArchiveSummary.receivable_amount) }}</b><small>实收 ¥{{ money(monthlyArchiveSummary.paidAmount || monthlyArchiveSummary.paid_amount) }}</small></article>
          <article><span>未收余额</span><b :class="{ arrears: Number(monthlyArchiveSummary.outstandingAmount || monthlyArchiveSummary.outstanding_amount) > 0 }">¥{{ money(monthlyArchiveSummary.outstandingAmount || monthlyArchiveSummary.outstanding_amount) }}</b><small>必须处理后才能最终归档</small></article>
          <article><span>业务凭据</span><b>{{ monthlyArchiveEvidence.statementCount || monthlyArchiveEvidence.statement_count || 0 }} / {{ monthlyArchiveEvidence.voucherCount || monthlyArchiveEvidence.voucher_count || 0 }}</b><small>银行流水 / 财务凭证</small></article>
        </div>
        <section class="monthly-review-checks">
          <article v-for="item in monthlyArchiveChecks" :key="String(item.key || item.title || item.label)">
            <CheckCircle2 v-if="checkPassed(item)" :size="18" /><CircleX v-else :size="18" />
            <div><b>{{ item.title || item.label || item.name }}</b><small>{{ item.detail || item.message || item.description }}</small></div>
            <em>{{ checkPassed(item) ? '已通过' : '待处理' }}</em>
          </article>
        </section>
        <section class="panel monthly-review-table">
          <header><b>本月关账数据</b><small>共 {{ monthlyArchiveBills.length }} 份账单档案</small></header>
          <table class="enterprise-table">
            <thead><tr><th>账单编号</th><th>结算对象</th><th class="money">应收</th><th class="money">实收</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="row in monthlyArchiveBills" :key="String(row.id)"><td><b>{{ row.billNo || row.bill_no }}</b><small>{{ statusText(row.billType || row.bill_type) }}</small></td><td>{{ row.tenantName || row.tenant_name || row.accountName || row.account_name || '—' }}</td><td class="money">¥{{ money(row.totalAmount || row.total_amount) }}</td><td class="money">¥{{ money(row.paidAmount || row.paid_amount) }}</td><td><em :class="['status', tone(row.billStatus || row.bill_status)]">{{ Number(row.payStatus ?? row.pay_status) === 1 ? '已结清' : statusText(row.billStatus || row.bill_status) }}</em></td></tr>
              <tr v-if="!monthlyArchiveBills.length"><td colspan="5" class="empty">本月暂无账单，不能执行最终归档。</td></tr>
            </tbody>
          </table>
        </section>
        <p class="monthly-review-warning"><AlertTriangle :size="17" />{{ monthlyArchiveReview.warning }}</p>
        <footer class="dialog-actions"><button class="quiet" @click="monthlyArchiveStep = 0">返回处理</button><button class="primary" :disabled="!monthlyArchiveReview.closeable" @click="confirmMonthlyArchiveReview">我已核对完毕，确认无误</button></footer>
      </section>
    </AppDialog>
    <AppDialog
      :open="archiveHistoryOpen"
      @update:open="(v) => (archiveHistoryOpen = v)"
      title="历史归档"
      eyebrow="MONTHLY ARCHIVE HISTORY"
      hide-actions
      dialog-class="archive-history-dialog"
    >
      <section class="archive-history-panel">
        <header><div><b>月度最终归档记录</b><small>按年月倒序展示，已归档月份均为只读状态。</small></div><button class="quiet action-with-icon" :disabled="archiveHistoryLoading" @click="openArchiveHistory"><RefreshCw :size="15" />刷新</button></header>
        <section class="panel table-panel">
          <table class="enterprise-table">
            <thead><tr><th>归档年月</th><th>园区</th><th>归档编号</th><th>档案数</th><th class="money">应收金额</th><th class="money">实收金额</th><th>归档时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="row in archiveHistoryRows" :key="String(row.id)"><td><b>{{ row.period_code || row.periodCode }}</b></td><td>{{ row.org_name || row.orgName || '—' }}</td><td>{{ row.archive_no || row.archiveNo }}</td><td>{{ row.bill_count || row.billCount || 0 }}</td><td class="money">¥{{ money(row.issued_amount || row.issuedAmount) }}</td><td class="money">¥{{ money(row.paid_amount || row.paidAmount) }}</td><td>{{ dateText(row.archived_time || row.archivedTime, true) }}</td><td><button class="table-action-icon" title="查看归档详情" aria-label="查看归档详情" @click="archiveHistoryOpen = false; openPeriodDetail({ id: row.period_id || row.periodId }, 'overview')"><Eye :size="16" /></button></td></tr>
              <tr v-if="!archiveHistoryLoading && !archiveHistoryRows.length"><td colspan="8" class="empty">暂无历史月度归档。</td></tr>
              <tr v-if="archiveHistoryLoading"><td colspan="8" class="empty">正在加载历史归档...</td></tr>
            </tbody>
          </table>
        </section>
      </section>
    </AppDialog>
    <AppConfirmDialog
      :open="monthlyArchiveStep === 1"
      title="确认发起当月最终归档？"
      :message="`${monthlyArchiveTarget?.periodCode || monthlyArchiveTarget?.period_code || cycle} 内可以有多份结算档案；继续后将进入全量数据核对，但此时尚不会锁定账单。`"
      :loading="monthlyArchiveLoading"
      confirm-text="继续核对数据"
      @update:open="(v) => { if (!v) monthlyArchiveStep = 0; }"
      @confirm="confirmMonthlyArchiveStart"
    />
    <AppConfirmDialog
      :open="monthlyArchiveStep === 3"
      title="最终确认：该月账单将彻底锁定"
      :message="`${monthlyArchiveTarget?.periodCode || monthlyArchiveTarget?.period_code || cycle} 归档后，账单、支付、对账、凭证、发票及补充结算均不可新增或修改。此操作不可撤销。`"
      :loading="monthlyArchiveLoading"
      confirm-text="永久锁定并归档"
      @update:open="(v) => { if (!v) monthlyArchiveStep = 0; }"
      @confirm="confirmMonthlyArchiveLock"
    />
    <AppConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmKind === 'delete' ? '删除已终止合同' : '确认终止合同'"
      :message="
        confirmKind === 'delete'
          ? '删除后合同主体将无法恢复，已产生账单的合同不允许删除。'
          : '终止后合同将停止后续出账，仅保留历史记录。'
      "
      :loading="confirming"
      :confirm-text="confirmKind === 'delete' ? '确认删除' : '确认终止'"
      @confirm="confirmContractAction"
    />
    <AppConfirmDialog
      v-model:open="scheduleDeleteOpen"
      title="删除自动出账计划"
      :message="`计划“${scheduleDeleteTarget?.scheduleName || scheduleDeleteTarget?.schedule_name || ''}”删除后将不再自动生成后续账单，历史账单不受影响。确认继续吗？`"
      :loading="scheduleDeleting"
      confirm-text="确认删除"
      @confirm="confirmRemoveSchedule"
    />
    <AppConfirmDialog
      v-model:open="archiveConfirmOpen"
      v-model:reason="reopenReason"
      :require-reason="archiveConfirmKind === 'reopen'"
      :title="
        archiveConfirmKind === 'close'
          ? '确认记录阶段关账'
          : '确认反关账'
      "
      :message="
        archiveConfirmKind === 'close'
          ? '本次操作仅记录当前核对结果。月度最终归档前，本月仍可继续出账、收款和补充结算。'
          : '反关账会撤销阶段关账标记，请填写真实原因并在修正后重新执行检查。'
      "
      :loading="archiveConfirming"
      :confirm-text="
        archiveConfirmKind === 'close'
          ? '确认记录'
          : '确认反关账'
      "
      reason-placeholder="请输入反关账原因"
      @confirm="confirmArchiveAction"
    />
    <AppConfirmDialog
      v-model:open="matchReverseOpen"
      v-model:reason="matchReverseReason"
      require-reason
      title="确认解除流水勾兑"
      message="解除后流水与收款将恢复为待核对状态；自动勾兑生成的收款会同步冲销。"
      :loading="matchReversing"
      confirm-text="确认解除"
      reason-placeholder="请输入解除原因"
      @confirm="confirmMatchReverse"
    />
    <AppConfirmDialog
      v-model:open="scheduleSupplementConfirmOpen"
      title="原账期已有有效出账批次"
      :message="`继续后不会修改原批次，而是按 ${skippedRun.billCycle || '当前'} 账期为该计划绑定合同生成独立补充账单；补充账单需重新审核、发布和收款。`"
      :loading="generatingScheduleSupplement"
      confirm-text="继续生成补充账单"
      cancel-text="暂不生成"
      @confirm="confirmScheduleSupplement"
    />
    <AppConfirmDialog
      v-model:open="billRiskOpen"
      v-model:reason="billRiskReason"
      require-reason
      :title="
        billRiskKind === 'reversePayment' ? '确认冲销收款' : '确认作废账单'
      "
      :message="
        billRiskKind === 'reversePayment'
          ? '冲销后账单将重新计入应收，对应收款凭证将作废。'
          : '仅未收款账单可作废，操作将留存审计记录。'
      "
      :loading="billRiskSaving"
      :confirm-text="
        billRiskKind === 'reversePayment' ? '确认冲销' : '确认作废'
      "
      reason-placeholder="请输入业务原因"
      @confirm="confirmBillRisk"
    />
    <Transition name="error-toast"
      ><div v-if="error" class="error-toast">
        <AlertTriangle :size="18" /><span>{{ error }}</span>
      </div></Transition
    >
  </div>
</template>

<style scoped>
.workflow-confirm-panel { display: grid; gap: 14px; min-width: min(680px, calc(100vw - 56px)); }
.workflow-document { display: grid; gap: 4px; padding: 14px 16px; border: 1px solid #dfe8ec; border-radius: 8px; background: #f8fbfc; }
.workflow-document span,.workflow-document small { color: #71808c; font-size: 12px; }.workflow-document b { color: #263d4c; }
.workflow-checks { display: grid; gap: 8px; }.workflow-checks article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 12px 14px; border: 1px solid #e2e9ed; border-radius: 7px; }.workflow-checks svg { color: #26835a; }.workflow-checks article.failed svg,.workflow-checks article.failed em { color: #b65a36; }.workflow-checks b,.workflow-checks small { display: block; }.workflow-checks small { margin-top: 3px; color: #74838e; font-size: 12px; }.workflow-checks em { color: #2b7d59; font-size: 12px; font-style: normal; }
.workflow-timeline { padding: 12px 14px; border-left: 3px solid #95afb9; background: #fbfcfc; }.workflow-timeline header { display:flex; justify-content:space-between; gap:12px; margin-bottom:6px; }.workflow-timeline header small,.workflow-timeline p small { color:#7a8994; font-size:12px; }.workflow-timeline p { display:grid; grid-template-columns:116px minmax(0,1fr) 135px; gap:8px; margin:8px 0 0; color:#536775; font-size:12px; }.workflow-timeline p b { color:#334b5a; }.workflow-timeline p small { text-align:right; }
.bill-workflow-entry { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:16px 0; padding:13px 14px; border:1px solid #dce7ea; border-radius:8px; background:#f8fbfc; }.bill-workflow-entry b,.bill-workflow-entry small { display:block; }.bill-workflow-entry small { margin-top:3px; color:#71808c; font-size:12px; }
.supplement-archive-dialog { width: min(720px, calc(100vw - 48px)); }
.supplement-archive-panel { display: grid; gap: 18px; min-height: 360px; }
.supplement-archive-panel > header { display:flex; justify-content:space-between; gap:18px; padding:16px 18px; border:1px solid #e2e8ed; border-radius:12px; background:#f8fafb; }
.supplement-archive-panel > header span,.supplement-archive-panel > header small { display:block; color:#7b8a95; font-size:12px; }
.supplement-archive-panel > header b { display:block; margin:4px 0; color:#233846; font-size:16px; }
.supplement-archive-panel > header strong { align-self:center; color:#9a6700; font-size:13px; }
.supplement-archive-panel > header strong.ready { color:#22734d; }
.supplement-archive-checks { display:grid; gap:9px; }
.supplement-archive-checks article { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:13px 14px; border:1px solid #e4eaee; border-radius:10px; }
.supplement-archive-checks article svg { color:#bd7d16; }.supplement-archive-checks article svg:first-child { color:#238055; }
.supplement-archive-checks b,.supplement-archive-checks small { display:block; }.supplement-archive-checks small { margin-top:3px; color:#71808c; font-size:12px; }
.section-toolbar .toolbar-actions .quiet:nth-child(2) {
  display: none;
}
.cell-list {
  display: block;
  max-width: 220px;
  white-space: normal;
  line-height: 1.55;
  color: #415b6b;
}
.center-error {
  display: none;
}
.error-toast {
  position: fixed;
  z-index: 3000;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 9px;
  width: fit-content;
  max-width: min(680px, calc(100vw - 32px));
  padding: 12px 18px;
  border: 1px solid #efc9bd;
  border-radius: 10px;
  background: #fff8f5;
  color: #a34730;
  box-shadow: 0 12px 30px rgba(53, 37, 30, 0.16);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.error-toast-enter-active,
.error-toast-leave-active {
  transition:
    opacity 0.28s,
    transform 0.28s;
}
.error-toast-enter-from,
.error-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -18px);
}
.settlement-center {
  min-height: 100%;
  color: #1d2a35;
}
.center-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  margin-bottom: 24px;
}
.center-header h1 {
  margin: 4px 0 7px;
  font-size: 28px;
}
.center-header span {
  color: #708092;
}
.center-actions,
.toolbar-actions,
.table-filters,
.aux-filters {
  display: flex;
  gap: 10px;
  align-items: center;
}
.center-actions label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #7d8b96;
  font-size: 11px;
}
.center-actions select,
.center-actions input {
  height: 34px;
}
.center-error {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 11px 14px;
  border: 1px solid #edc9bd;
  background: #fff8f5;
  color: #a34730;
  border-radius: 6px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.metric-grid article,
.panel {
  background: #fff;
  border: 1px solid #e0e7ec;
  border-radius: 8px;
}
.metric-grid article {
  padding: 18px;
}
.metric-grid span,
.metric-grid small {
  display: block;
  color: #75838e;
}
.metric-grid b {
  display: block;
  margin: 8px 0 5px;
  font-size: 25px;
}
.overview-charts {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
  margin-bottom: 16px;
}
.chart-panel {
  padding-bottom: 14px;
}
.chart-panel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px 4px;
}
.chart-panel header small {
  display: block;
  margin-top: 4px;
  color: #8794a0;
}
.chart-panel svg {
  width: 100%;
  height: 180px;
  padding: 8px 18px 0;
}
.chart-axis {
  display: flex;
  justify-content: space-between;
  padding: 0 25px;
  color: #8794a0;
  font-size: 11px;
}
.status-bars {
  padding: 13px 18px;
}
.status-bars > div {
  display: grid;
  grid-template-columns: 58px 1fr 85px;
  gap: 8px;
  align-items: center;
  margin: 17px 0;
  font-size: 12px;
}
.status-bars i {
  height: 8px;
  background: #edf1f4;
  border-radius: 8px;
  overflow: hidden;
}
.status-bars i b {
  display: block;
  height: 100%;
  background: #b47e43;
  border-radius: 8px;
}
.status-bars i b.paid {
  background: #6e9b8a;
}
.status-bars i b.archive {
  background: #7e94a8;
}
.status-bars strong {
  text-align: right;
  color: #526471;
}
.overview-columns {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr;
  gap: 16px;
}
.panel {
  overflow: hidden;
}
.panel > header,
.table-panel > header,
.plan-panel > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid #edf1f4;
}
.panel header small,
.table-panel header small {
  display: block;
  margin-top: 4px;
  color: #8794a0;
  font-size: 12px;
}
.todo-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 14px 18px;
  border: 0;
  border-bottom: 1px solid #edf1f4;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.todo-row b,
.todo-row small {
  display: block;
}
.todo-row small {
  margin-top: 4px;
  color: #8794a0;
}
.todo-row strong {
  color: #71808b;
}
.summary-list {
  margin: 0;
  padding: 0 18px 10px;
}
.summary-list div {
  display: flex;
  justify-content: space-between;
  padding: 15px 0;
  border-bottom: 1px solid #edf1f4;
}
.summary-list dd {
  margin: 0;
  font-weight: 700;
}
.section-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.section-toolbar small {
  display: block;
  color: #8794a0;
}
.table-panel {
  margin-bottom: 16px;
}
.search-box {
  display: flex;
  gap: 6px;
  align-items: center;
  border: 1px solid #dbe3e8;
  border-radius: 5px;
  padding: 0 8px;
  height: 34px;
  color: #82919c;
}
.search-box input {
  border: 0;
  outline: 0;
  min-width: 190px;
}
.enterprise-table {
  width: 100%;
  border-collapse: collapse;
}
.enterprise-table th,
.enterprise-table td {
  padding: 13px 16px;
  border-bottom: 1px solid #edf1f4;
  text-align: left;
  font-size: 13px;
}
.enterprise-table th {
  background: #fafbfc;
  color: #7b8994;
  font-size: 12px;
}
.enterprise-table th.money,
.enterprise-table td.money {
  text-align: right;
}
.enterprise-table td > b,
.enterprise-table td > small {
  display: block;
}
.enterprise-table td small {
  margin-top: 4px;
  color: #8996a1;
}
.row-actions {
  white-space: nowrap;
}
.table-action-icon {
  display: inline-grid;
  width: 30px;
  height: 30px;
  margin: 0 2px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #39728e;
  cursor: pointer;
}
.table-action-icon:hover {
  color: #174f6b;
}
.table-action-icon:focus-visible {
  outline: 2px solid #83b7cc;
  outline-offset: 2px;
}
.table-action-icon.danger {
  color: #a85c4d;
}
.table-action-icon.danger:hover {
  color: #843d31;
}
.text-button,
.link-button {
  border: 0;
  background: transparent;
  color: #2d718f;
  cursor: pointer;
  margin-right: 10px;
}
.danger-link {
  color: #ac5a45;
}
.link-button {
  font-weight: 700;
}
.status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f0f3f5;
  color: #54636d;
  font-style: normal;
  font-size: 12px;
}
.status.warning {
  background: #fff7df;
  color: #916d28;
}
.status.danger {
  background: #fff0eb;
  color: #a34730;
}
.status.success {
  background: #edf8f2;
  color: #277252;
}
.arrears {
  color: #b44d32;
}
.empty {
  padding: 28px;
  text-align: center;
  color: #8b98a3;
}
.plan-panel {
  margin-bottom: 16px;
}
.plan-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 13px 18px;
  border-bottom: 1px solid #edf1f4;
}
.plan-row span {
  flex: 1;
}
.plan-row b,
.plan-row small {
  display: block;
}
.plan-row small {
  margin-top: 4px;
  color: #8794a0;
}
.plan-row em {
  font-style: normal;
  color: #74828d;
  font-size: 12px;
}
.settlement-dialog {
  min-width: 680px;
}
.form-section,
.aux-content {
  padding: 18px 25px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #687884;
  font-size: 12px;
}
.form-grid input,
.form-grid select {
  min-height: 38px;
  border: 1px solid #d9e1e6;
  border-radius: 5px;
  padding: 7px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid #edf1f4;
}
.aux-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.aux-toolbar small {
  display: block;
  color: #8794a0;
  margin-top: 4px;
}
.aux-filters {
  margin-bottom: 14px;
}
.detail-hero {
  display: flex;
  justify-content: space-between;
  padding: 16px;
  background: #f7fafb;
  border: 1px solid #e1e8ec;
  border-radius: 7px;
}
.detail-hero span,
.detail-hero small {
  display: block;
  color: #7d8b96;
}
.detail-hero b {
  display: block;
  margin: 6px 0;
}
.detail-hero strong {
  font-size: 22px;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: #e1e8ec;
  margin: 16px 0;
}
.detail-grid div {
  padding: 12px;
  background: #fff;
}
.detail-grid dt {
  color: #7d8b96;
  font-size: 12px;
}
.detail-grid dd {
  margin: 6px 0 0;
  font-weight: 600;
}
.contract-document {
  padding: 20px 28px;
  color: #4d3d2b;
  font-family: Georgia, "Songti SC", serif;
  line-height: 1.75;
}
.contract-document header {
  text-align: center;
  border-bottom: 1px solid #b99a6b;
  padding-bottom: 14px;
}
.contract-document header span {
  color: #9a6c2b;
  font-size: 12px;
  letter-spacing: 0.12em;
}
.contract-document h2 {
  margin: 7px 0;
  font-size: 24px;
}
.contract-document header p {
  margin: 0;
  font-size: 12px;
}
.contract-document section {
  margin-top: 18px;
}
.contract-document h3 {
  margin: 0 0 7px;
  color: #835b25;
  font-size: 15px;
}
.contract-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 24px;
}
.contract-meta p {
  margin: 0;
}
.binding-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.binding-grid div {
  padding: 12px;
  border: 1px solid #dfcfb9;
  background: #fffaf1;
}
.binding-grid span,
.binding-grid b,
.binding-grid small {
  display: block;
}
.binding-grid span,
.binding-grid small {
  color: #8d7b66;
  font-size: 12px;
}
.binding-grid b {
  margin: 5px 0;
}
.finance-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 350px;
}
.finance-layout aside {
  border-right: 1px solid #e1e8ec;
}
.finance-layout aside,
.finance-layout > section {
  padding: 14px;
}
.finance-layout header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.statement-row,
.candidate-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 11px 8px;
  border: 0;
  border-bottom: 1px solid #edf1f4;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.statement-row.selected {
  background: #edf5f8;
}
.statement-row span,
.candidate-row span {
  display: block;
}
.statement-row small,
.candidate-row small {
  display: block;
  margin-top: 4px;
  color: #82909b;
}
.receipt-head {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  background: #f7fafb;
  margin-bottom: 15px;
}
.receipt-head b,
.receipt-head small {
  display: block;
}
.receipt-head small {
  margin-top: 4px;
  color: #7d8b96;
}
@media (max-width: 900px) {
  .metric-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .overview-charts,
  .overview-columns {
    grid-template-columns: 1fr;
  }
  .center-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .enterprise-table {
    min-width: 980px;
  }
  .table-panel {
    overflow: auto;
  }
  .settlement-dialog {
    min-width: 0;
    width: calc(100vw - 34px);
  }
  .form-grid,
  .contract-meta,
  .binding-grid {
    grid-template-columns: 1fr;
  }
}
.archive-record-section {
  margin-top: 16px;
}
.archive-record-section > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #405463;
}
.archive-record-section > header span {
  color: #81909b;
  font-size: 11px;
}
.supplement-form-panel{padding:20px 24px}.supplement-form-grid{margin-top:16px}.supplement-form-grid textarea{min-height:74px;resize:vertical}.form-span-2{grid-column:span 2}.input-suffix{display:flex;align-items:center;border-bottom:1px solid #d9e1e7}.input-suffix input{border:0!important;min-width:0}.input-suffix small{padding-right:8px;color:#778897}.archive-record-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.archive-record-section-head b,.archive-record-section-head small{display:block}.archive-record-section-head small{margin-top:4px;color:#81909b;font-size:11px}@media(max-width:680px){.form-span-2{grid-column:span 1}.archive-record-section-head{align-items:flex-start;gap:10px;flex-direction:column}}
.bill-exception-workbench {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #e1e8ec;
  border-radius: 8px;
  background: #fafcfd;
}
.bill-exception-workbench > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
}
.bill-exception-workbench > header small {
  display: block;
  margin-top: 4px;
  color: #82909b;
}
.bill-exception-workbench > footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.bill-operation-list article {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 110px 80px auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid #e8edf0;
}
.bill-operation-list b,
.bill-operation-list small {
  display: block;
}
.bill-operation-list small {
  margin-top: 3px;
  color: #84919a;
}
.bill-operation-list strong {
  text-align: right;
}
.bill-operation-list em {
  font-style: normal;
  color: #657682;
  font-size: 12px;
}
</style>

<style scoped>
/* 自动出账计划使用更大的工作区，表头和行高保持稳定，剩余空间给表格内容。 */
:deep(.schedule-list-dialog) {
  height: min(1000px, calc(100vh - 32px)) !important;
  max-height: calc(100vh - 32px) !important;
}
:deep(.schedule-list-dialog .dialog-content) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.schedule-list-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 22px 28px;
  box-sizing: border-box;
}
.schedule-list-panel > .aux-toolbar {
  flex: none;
  margin-bottom: 18px;
}
.schedule-list-panel > .enterprise-table {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 820px;
  flex-direction: column;
  table-layout: fixed;
  overflow: hidden;
}
.schedule-list-panel > .enterprise-table > thead,
.schedule-list-panel > .enterprise-table > tbody {
  display: table;
  width: 100%;
  table-layout: fixed;
}
.schedule-list-panel > .enterprise-table > tbody {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
}
.schedule-list-panel > .enterprise-table > tbody::-webkit-scrollbar {
  display: none;
}
.schedule-list-panel > .enterprise-table > tbody > tr {
  display: table;
  width: 100%;
  table-layout: fixed;
  height: 56px;
  min-height: 56px;
}
.schedule-list-panel > .enterprise-table > tbody > tr > td {
  height: 56px;
  box-sizing: border-box;
  padding-top: 10px;
  padding-bottom: 10px;
  vertical-align: middle;
}
.schedule-list-panel > .enterprise-table > tbody > tr > td small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.schedule-form-panel {
  min-width: 760px;
  padding: 24px 30px 0;
}
.schedule-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.schedule-field {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: #506579;
  font-size: 12px;
}
.schedule-field-wide {
  grid-column: span 2;
}
.schedule-field > span {
  font-weight: 700;
  color: #405a70;
}
.schedule-field > small {
  color: #91a0ad;
  font-size: 11px;
  line-height: 1.35;
}
.schedule-field input,
.schedule-field :deep(select) {
  width: 100%;
  box-sizing: border-box;
  min-height: 40px;
}
.schedule-input-suffix {
  position: relative;
}
.schedule-input-suffix input {
  padding-right: 32px !important;
}
.schedule-input-suffix i {
  position: absolute;
  right: 11px;
  top: 11px;
  color: #8a9aa7;
  font-style: normal;
  font-size: 12px;
}
.schedule-form-actions {
  align-items: center;
  margin: 20px 0 0;
  padding: 16px 0 22px;
}
.schedule-form-actions > span {
  margin-right: auto;
  color: #8a9aa8;
  font-size: 11px;
}
.schedule-form-actions > div {
  display: flex;
  gap: 8px;
}
@media (max-width: 820px) {
  .schedule-list-panel {
    padding: 18px;
  }
  .schedule-form-panel {
    min-width: 0;
    padding: 18px 20px 0;
  }
  .schedule-form-grid {
    grid-template-columns: 1fr 1fr;
  }
  .schedule-field-wide {
    grid-column: 1/-1;
  }
  .schedule-form-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .schedule-form-actions > div {
    width: 100%;
    justify-content: flex-end;
  }
}
@media (max-width: 560px) {
  .schedule-form-grid {
    grid-template-columns: 1fr;
  }
  .schedule-field-wide {
    grid-column: auto;
  }
}
</style>
<style scoped>
.section-toolbar + .table-panel .row-actions .danger-link:before {
  content: "\1F5D1";
  font-family: "Segoe UI Symbol";
  font-size: 16px;
  color: #a75a4c;
}
</style>
<style scoped>
.section-toolbar + .table-panel .row-actions .config-link:before {
  content: "⚙";
  font-size: 16px;
  color: #3d8195;
}
.center-actions > .quiet {
  font-size: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  display: grid;
  place-items: center;
}
.center-actions > label:first-child > span {
  display: none;
}
.center-actions > .cycle-filter > span {
  display: none;
}
.center-actions > .cycle-filter input {
  height: 36px;
  min-width: 142px;
  padding: 0 13px;
  border: 1px solid #c9d8e8;
  border-radius: 999px;
  background: linear-gradient(180deg, #fff, #f6f9fc);
  color: #24465f;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(40, 83, 118, 0.08);
  outline: 0;
}
.center-actions > .cycle-filter input:focus {
  border-color: #3f86d6;
  box-shadow: 0 0 0 3px rgba(63, 134, 214, 0.13);
}
.center-actions > .plan-top-button {
  font-size: 13px;
  width: auto;
  min-width: 88px;
  height: 36px;
  padding: 0 15px;
  border: 1px solid #2f7ed8;
  border-radius: 999px;
  background: #2f7ed8;
  box-shadow: 0 8px 18px rgba(47, 126, 216, 0.24);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.enterprise-table .status {
  border-radius: 999px;
  padding: 5px 11px;
  line-height: 1;
}
.enterprise-table .status.quiet {
  background: #e9f5f3;
  color: #317361;
  border: 1px solid #cce6df;
}
.enterprise-table .status.warning {
  border: 1px solid #f0dfaa;
}
.enterprise-table .status.danger {
  border: 1px solid #f1cfc4;
}
.formal-signature > div:first-child {
  position: relative;
}
.formal-stamp {
  position: absolute;
  width: 185px;
  height: 185px;
  object-fit: contain;
  left: 145px;
  top: -22px;
  z-index: 1;
  pointer-events: none;
}
.section-toolbar + .table-panel .row-actions .delete-link:before {
  content: "\1F5D1";
  font-family: "Segoe UI Symbol";
  font-size: 16px;
  color: #a75a4c;
}
.formal-contract-view {
  max-width: 980px;
  margin: 0 auto;
  padding: 34px 48px;
  background: #fff;
  color: #171717;
  font-family: Georgia, "Songti SC", "SimSun", serif;
  line-height: 1.9;
  border: 1px solid #c9c9c9;
}
.formal-view-heading {
  text-align: center;
  border-bottom: 2px solid #222;
  padding-bottom: 16px;
}
.formal-code {
  color: #666;
  font:
    600 10px/1.2 ui-monospace,
    Consolas,
    monospace;
  letter-spacing: 0.25em;
}
.formal-view-heading h2 {
  margin: 9px 0 2px;
  font-size: 27px;
  letter-spacing: 0.16em;
}
.formal-view-heading p {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
}
.formal-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 15px;
  padding-top: 9px;
  border-top: 1px solid #777;
  text-align: left;
  font-size: 12px;
}
.formal-contract-view section {
  margin-top: 22px;
}
.formal-contract-view h3 {
  margin: 0 0 8px;
  font-size: 15px;
  letter-spacing: 0.04em;
}
.formal-contract-view p {
  margin: 6px 0;
  text-indent: 2em;
  font-size: 13px;
  text-align: justify;
}
.formal-binding {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 12px 0;
}
.formal-binding > div,
.formal-rules > div {
  padding: 10px 13px;
  border: 1px solid #cfcfcf;
  background: #fcfcfc;
}
.formal-binding b,
.formal-binding span,
.formal-binding em,
.formal-rules b,
.formal-rules span {
  display: block;
}
.formal-binding span,
.formal-binding em,
.formal-rules span,
.formal-rules p {
  font-size: 12px;
  color: #555;
  font-style: normal;
}
.formal-rules {
  display: grid;
  gap: 7px;
}
.formal-rules p {
  margin: 0;
  padding: 10px 13px;
  border: 1px dashed #bbb;
  text-indent: 0;
}
.formal-signature {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 70px;
  margin-top: 38px;
  padding-top: 20px;
  border-top: 2px solid #222;
  font-size: 13px;
}
.formal-signature > div {
  display: grid;
  gap: 5px;
  min-height: 135px;
}
.formal-signature span,
.formal-signature small {
  display: block;
}
.formal-signature small {
  font-size: 12px;
}
@media (max-width: 760px) {
  .formal-contract-view {
    padding: 24px 20px;
  }
  .formal-meta,
  .formal-binding,
  .formal-signature {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .formal-meta {
    flex-direction: column;
  }
  .formal-view-heading h2 {
    font-size: 22px;
  }
}
.section-toolbar + .table-panel {
  height: calc(100vh - 245px);
  min-height: 560px;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.section-toolbar + .table-panel .enterprise-table {
  flex: none;
  table-layout: fixed;
}
.section-toolbar + .table-panel .enterprise-table tbody tr {
  height: 56px !important;
  max-height: 56px !important;
}
.section-toolbar + .table-panel .enterprise-table tbody td {
  height: 56px !important;
  max-height: 56px !important;
  box-sizing: border-box;
  padding-top: 10px;
  padding-bottom: 10px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.section-toolbar + .table-panel .row-actions .text-button {
  font-size: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
  display: inline-grid;
  place-items: center;
}
.section-toolbar + .table-panel .row-actions .text-button:first-child:before {
  content: "◉";
  font-size: 15px;
  color: #557487;
}
.section-toolbar + .table-panel .row-actions .text-button.danger-link:before {
  content: "⏹";
  font-size: 15px;
  color: #a75a4c;
}
.settlement-center:has(.payment-bill-panel) {
  height: calc(100vh - 118px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.payment-bill-panel {
  flex: 1 1 auto;
  min-height: 0;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.billing-stage-tabs {
  display: flex;
  gap: 22px;
  overflow-x: auto;
  margin: 14px 0 0;
  padding: 0 18px;
  border: 1px solid #dbe5ef;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: #fff;
}
.billing-stage-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 46px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #697d92;
  white-space: nowrap;
  cursor: pointer;
}
.billing-stage-tabs button.active { border-bottom-color: #1768c5; color: #1768c5; font-weight: 700; }
.billing-stage-tabs em { min-width: 20px; padding: 2px 5px; border-radius: 10px; background: #eef3f8; font-size: 10px; font-style: normal; text-align: center; }
.billing-stage-tabs + .table-panel { border-top-left-radius: 0; border-top-right-radius: 0; }
.billing-row-progress { display: flex; align-items: center; gap: 4px; margin-top: 7px; }
.billing-row-progress i { width: 8px; height: 8px; border: 1px solid #b9c8d7; border-radius: 50%; background: #fff; }
.billing-row-progress i.done { border-color: #2f7bd0; background: #2f7bd0; }
.billing-row-progress small { margin-left: 3px; color: #71849a; font-size: 10px; white-space: nowrap; }
.payment-bill-panel .enterprise-table {
  flex: none;
}
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid #edf1f4;
  background: #fff;
  color: #75838e;
  font-size: 12px;
}
.table-pagination > div {
  display: flex;
  gap: 8px;
}
.table-pagination button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid #dbe3e8;
  border-radius: 6px;
  background: #fff;
  color: #39586a;
  cursor: pointer;
}
.table-pagination button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.schedule-list-dialog {
  height: min(1000px, calc(100vh - 32px)) !important;
  max-height: calc(100vh - 32px) !important;
}
.schedule-list-dialog :deep(.dialog-content) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.schedule-list-panel {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 860px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 22px 28px;
}
.schedule-list-panel .aux-toolbar {
  flex: none;
}
.schedule-list-panel .enterprise-table {
  display: flex;
  flex: 1 1 auto;
  min-width: 820px;
  min-height: 0;
  flex-direction: column;
  table-layout: fixed;
  overflow: hidden;
}
.schedule-list-panel .enterprise-table > thead {
  display: table;
  width: 100%;
  table-layout: fixed;
  flex: none;
}
.schedule-list-panel .enterprise-table > tbody {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
}
.schedule-list-panel .enterprise-table > tbody::-webkit-scrollbar {
  display: none;
}
.schedule-list-panel .enterprise-table > tbody > tr {
  display: table;
  width: 100%;
  table-layout: fixed;
  height: 56px;
  min-height: 56px;
}
.schedule-list-panel .enterprise-table > tbody > tr > td {
  height: 56px;
  box-sizing: border-box;
  padding-top: 10px;
  padding-bottom: 10px;
  vertical-align: middle;
}
.schedule-list-panel tbody {
  height: 100%;
}
.schedule-form-panel {
  min-width: 760px;
  padding: 24px 30px 0;
}
.meter-source {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.meter-source b,
.meter-source small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meter-source b {
  color: #314b5f;
  font-size: 12px;
}
.meter-source small,
.detail-grid dd small {
  display: block;
  color: #83919c;
  font-size: 11px;
  font-weight: 400;
}
.detail-grid dd b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-period-panel {
  height: calc(100vh - 405px) !important;
  min-height: 320px !important;
  margin-bottom: 0;
}
.archive-metrics {
  margin-bottom: 14px;
}
.archive-toolbar {
  margin-bottom: 10px;
}
.archive-period-panel .enterprise-table tbody tr {
  height: 58px;
}
.archive-period-panel td > small,
.archive-period-panel td .status + small {
  display: block;
  margin-top: 5px;
  color: #8996a1;
  font-size: 10px;
}
.archive-period-panel td .status + small {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.archive-row-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 58px !important;
}
.archive-row-actions .table-action-icon {
  flex: 0 0 30px;
  margin: 0 !important;
}
.archive-item-panel td:nth-child(1) { min-width: 190px; }
.archive-item-panel td:nth-child(3),
.archive-item-panel td:nth-child(4) { min-width: 160px; max-width: 240px; }
.monthly-final-bar {
  position: sticky;
  z-index: 5;
  bottom: 10px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #cfdde4;
  border-left: 4px solid #345f73;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(29, 55, 68, 0.12);
}
.monthly-final-bar.archived { border-left-color: #2c7858; background: #f7fbf9; }
.monthly-final-bar > div:nth-child(2) { min-width: 0; }
.monthly-final-bar b,
.monthly-final-bar small { display: block; }
.monthly-final-bar small { margin-top: 4px; color: #70818d; font-size: 12px; }
.monthly-final-bar .status { justify-self: end; }
.monthly-final-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 7px;
  background: #edf4f7;
  color: #345f73;
}
.monthly-review-dialog,
.archive-history-dialog { width: min(1080px, calc(100vw - 40px)) !important; }
.monthly-review-panel,
.archive-history-panel { display: grid; gap: 16px; min-width: min(920px, calc(100vw - 88px)); }
.monthly-review-panel > header,
.archive-history-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.monthly-review-panel > header span,
.monthly-review-panel > header small,
.archive-history-panel > header small { display: block; color: #758590; font-size: 12px; }
.monthly-review-panel > header b { display: block; margin: 4px 0; font-size: 19px; color: #293f4c; }
.monthly-review-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #dde6ea; border-radius: 8px; overflow: hidden; }
.monthly-review-metrics article { min-width: 0; padding: 14px 16px; border-right: 1px solid #e4eaee; }
.monthly-review-metrics article:last-child { border-right: 0; }
.monthly-review-metrics span,
.monthly-review-metrics small { display: block; color: #7b8a95; font-size: 11px; }
.monthly-review-metrics b { display: block; margin: 5px 0; color: #2d4656; font-size: 18px; }
.monthly-review-checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.monthly-review-checks article { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 11px 13px; border: 1px solid #e1e8ec; border-radius: 7px; }
.monthly-review-checks article svg { color: #267a58; }
.monthly-review-checks article svg + div + em { color: #267a58; }
.monthly-review-checks article:has(.lucide-circle-x) svg,
.monthly-review-checks article:has(.lucide-circle-x) em { color: #ac513d; }
.monthly-review-checks b,
.monthly-review-checks small { display: block; }
.monthly-review-checks small { margin-top: 3px; color: #7a8994; font-size: 11px; }
.monthly-review-checks em { font-size: 11px; font-style: normal; white-space: nowrap; }
.monthly-review-table { max-height: 280px; overflow: auto; }
.monthly-review-table > header { position: sticky; z-index: 2; top: 0; display: flex; justify-content: space-between; padding: 11px 14px; border-bottom: 1px solid #e5ebef; background: #fff; }
.monthly-review-table > header small { color: #7c8b96; }
.monthly-review-warning { display: flex; align-items: center; gap: 8px; margin: 0; padding: 11px 13px; border: 1px solid #efd5ca; border-radius: 7px; background: #fff8f5; color: #9a4d38; font-size: 12px; }
.archive-history-panel > .table-panel { max-height: min(610px, calc(100vh - 210px)); overflow: auto; margin: 0; }
.invoice-auto-number { display: grid; gap: 3px; min-width: 0; margin-right: auto; }
.invoice-auto-number small { color: #758590; font-size: 11px; }
@media (max-width: 820px) {
  .monthly-final-bar { grid-template-columns: auto minmax(0, 1fr); }
  .monthly-final-bar > button,
  .monthly-final-bar > .status { grid-column: 1 / -1; width: 100%; justify-self: stretch; }
  .monthly-review-metrics,
  .monthly-review-checks { grid-template-columns: 1fr; }
  .monthly-review-metrics article { border-right: 0; border-bottom: 1px solid #e4eaee; }
  .monthly-review-metrics article:last-child { border-bottom: 0; }
}
.archive-settlement-dialog {
  width: min(1120px, calc(100vw - 36px)) !important;
  height: min(820px, calc(100vh - 36px)) !important;
  max-height: calc(100vh - 36px) !important;
}
.archive-settlement-dialog :deep(.dialog-content) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.archive-detail-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 24px;
}
.archive-detail-panel .detail-hero {
  flex: none;
}
.archive-tabs {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: none;
  margin-top: 14px;
  padding: 4px;
  border: 1px solid #dce5ec;
  border-radius: 8px;
  background: #f5f8fa;
}
.archive-tabs button {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #667987;
  font-size: 12px;
  cursor: pointer;
}
.archive-tabs button:hover {
  color: #286c8c;
}
.archive-tabs button.active {
  background: #fff;
  color: #1f6485;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(39, 76, 98, 0.12);
}
.archive-tab-body {
  flex: 1;
  min-height: 0;
  margin-top: 12px;
  overflow: auto;
  scrollbar-width: none;
}
.archive-tab-body::-webkit-scrollbar {
  display: none;
}
.archive-overview-grid {
  grid-template-columns: repeat(4, 1fr);
  margin-top: 0;
}
.archive-overview-actions,
.closing-check-list footer,
.archive-records-view > footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.closing-check-list {
  display: grid;
  gap: 8px;
}
.closing-check-list article {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #d9e6e2;
  border-radius: 8px;
  background: #f7fbfa;
  color: #39725f;
}
.closing-check-list article.failed {
  border-color: #efd7c5;
  background: #fffaf4;
  color: #a36936;
}
.closing-check-list article b,
.closing-check-list article small {
  display: block;
}
.closing-check-list article small {
  margin-top: 4px;
  color: #768794;
  font-size: 11px;
}
.closing-check-list article em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
}
.archive-detail-table {
  table-layout: fixed;
}
.archive-finance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  height: 100%;
}
.archive-finance-grid > section {
  min-height: 0;
  border: 1px solid #e0e7ec;
  border-radius: 8px;
  overflow: auto;
}
.archive-finance-grid > section > header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e8edf1;
  background: #fafcfd;
}
.archive-finance-grid article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #edf1f4;
}
.archive-finance-grid article b,
.archive-finance-grid article small {
  display: block;
}
.archive-finance-grid article small {
  margin-top: 4px;
  color: #84929d;
  font-size: 10px;
}
.archive-material-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.archive-material-list > b {
  grid-column: 1/-1;
}
.archive-material-list span {
  padding: 11px 13px;
  border: 1px solid #e0e7ec;
  border-radius: 7px;
  background: #fafcfd;
  color: #516676;
  font-size: 12px;
}
@media (max-width: 780px) {
  .archive-overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .archive-tabs {
    overflow: auto;
  }
  .archive-tabs button {
    white-space: nowrap;
  }
  .archive-finance-grid {
    grid-template-columns: 1fr;
  }
  .archive-material-list {
    grid-template-columns: 1fr;
  }
}
.action-with-icon,
.inline-action,
.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.icon-action {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #39728e;
  cursor: pointer;
}
.icon-action:hover {
  color: #174f6b;
  background: #eef5f8;
  border-radius: 6px;
}
.inline-action,
.check-action {
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #cadee7;
  border-radius: 6px;
  background: #f7fbfd;
  color: #2b708e;
  font-size: 11px;
  cursor: pointer;
}
.inline-action:hover,
.check-action:hover {
  border-color: #8fb9ca;
  background: #edf6f9;
}
.closing-check-list footer {
  gap: 9px;
}
.archive-voucher-view > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #e0e7ec;
  border-radius: 8px;
  background: #fafcfd;
}
.archive-voucher-view > header small {
  display: block;
  margin-top: 4px;
  color: #83919c;
  font-size: 11px;
}
.voucher-actions {
  white-space: nowrap;
}
.archive-action-dialog {
  width: min(920px, calc(100vw - 40px)) !important;
}
.archive-action-panel {
  padding: 22px 26px;
}
.action-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding: 13px 15px;
  border: 1px solid #d9e6ec;
  border-radius: 8px;
  background: #f7fafc;
}
.action-notice span {
  color: #728390;
  font-size: 12px;
}
.payment-match-panel {
  padding: 18px 22px;
}
.match-payment-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid #dbe5ea;
  border-radius: 8px;
  background: #f8fafb;
}
.match-payment-summary span,
.match-payment-summary small {
  display: block;
  color: #7c8b96;
  font-size: 11px;
}
.match-payment-summary b {
  display: block;
  margin: 4px 0;
  color: #2d485a;
}
.match-payment-summary strong {
  font-size: 22px;
  color: #294d62;
}
.payment-match-grid {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  min-height: 390px;
  border: 1px solid #dfe7ec;
  border-radius: 8px;
  overflow: hidden;
}
.payment-match-grid > aside {
  border-right: 1px solid #e3eaee;
}
.payment-match-grid > aside > header,
.payment-match-grid > section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e6ecef;
  background: #fafcfd;
}
.payment-match-grid > section > header small {
  color: #82919c;
}
.payment-match-grid .statement-row {
  padding: 12px 14px;
}
.payment-match-grid > section > article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border-bottom: 1px solid #edf1f4;
}
.payment-match-grid > section > article.recommended {
  box-shadow: inset 3px 0 #4d91ad;
  background: #f8fbfc;
}
.payment-match-grid article b,
.payment-match-grid article small {
  display: block;
}
.payment-match-grid article small {
  margin-top: 4px;
  color: #83919c;
  font-size: 10px;
}
.voucher-document > header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 14px;
  border-bottom: 2px solid #344e5d;
}
.voucher-document > header span {
  color: #7d8b95;
  font-size: 11px;
  letter-spacing: 0.15em;
}
.voucher-document > header h3 {
  margin: 5px 0 0;
  font-size: 22px;
}
.voucher-document > header em {
  font-style: normal;
  color: #657985;
}
.voucher-document .detail-grid {
  grid-template-columns: repeat(3, 1fr);
}
.finance-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}
.file-action {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.file-action input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.import-result {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid #cfe3d8;
  border-radius: 7px;
  background: #f4faf7;
  color: #436a56;
  font-size: 12px;
}
.import-history {
  margin-top: 12px;
  padding: 10px;
  border-top: 1px solid #e4eaee;
  color: #687a86;
}
.import-history summary {
  cursor: pointer;
  font-weight: 700;
}
.import-history p {
  display: flex;
  justify-content: space-between;
  margin: 8px 0 0;
  font-size: 11px;
}
.snapshot-proof {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: -4px 0 15px;
  padding: 10px 12px;
  border: 1px solid #dce7ec;
  border-radius: 7px;
  background: #f7fafb;
  color: #476474;
}
.snapshot-proof span,
.snapshot-proof b,
.snapshot-proof small {
  display: block;
}
.snapshot-proof small {
  margin-top: 3px;
  color: #7f909b;
  font-size: 11px;
}
.invoice-dialog {
  width: min(980px, calc(100vw - 40px)) !important;
}
.invoice-workbench {
  min-height: 520px;
  padding: 22px 26px;
}
.invoice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.invoice-head b,
.invoice-head small {
  display: block;
}
.invoice-head small {
  margin-top: 4px;
  color: #83919c;
  font-size: 11px;
}
.invoice-form,
.invoice-detail {
  max-width: 840px;
  margin: auto;
}
.invoice-bill-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid #dce5ea;
  border-radius: 8px;
  background: #f8fafb;
}
.invoice-bill-chip span,
.invoice-bill-chip b,
.invoice-bill-chip small {
  display: block;
}
.invoice-bill-chip small {
  margin-top: 3px;
  color: #84939e;
}
.invoice-type-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 16px 0;
}
.invoice-type-cards button {
  padding: 15px;
  border: 1px solid #dce4e9;
  border-radius: 9px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.invoice-type-cards button.active {
  border-color: #4e88a4;
  background: #f1f7fa;
  box-shadow: 0 0 0 2px #dcebf1;
}
.invoice-type-cards b,
.invoice-type-cards small {
  display: block;
}
.invoice-type-cards small {
  margin-top: 5px;
  color: #81909b;
}
.wide-field {
  grid-column: 1/-1;
}
.invoice-linked-bills {
  display: grid;
  gap: 7px;
  margin: 14px 0;
  padding: 14px;
  border: 1px solid #e0e7eb;
  border-radius: 8px;
}
.invoice-linked-bills > span {
  display: flex;
  justify-content: space-between;
  padding-top: 7px;
  border-top: 1px solid #edf1f3;
}
.invoice-operation {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #dfe7eb;
  border-radius: 8px;
  background: #fafcfd;
}
.invoice-operation label {
  display: grid;
  gap: 5px;
  flex: 1;
  color: #697c88;
  font-size: 11px;
}
.invoice-operation input,
.invoice-red input {
  min-height: 36px;
  padding: 6px 9px;
  border: 1px solid #d7e0e5;
  border-radius: 6px;
}
.invoice-red {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.invoice-red input {
  flex: 1;
}
@media(max-width:640px){
  .settlement-center{height:auto!important;min-height:0!important;display:block!important;overflow:visible!important}
  .center-header,.section-toolbar,.payment-bill-panel>header,.archive-history-panel>header,.monthly-review-panel>header{align-items:flex-start;flex-direction:column;gap:10px}
  .section-toolbar .toolbar-actions,.payment-bill-panel .toolbar-actions{width:100%;display:flex;flex-wrap:wrap}
  .section-toolbar .toolbar-actions>*{flex:1}
  .payment-bill-panel .toolbar-actions .search-box{width:100%;min-width:0}
  .payment-bill-panel .toolbar-actions button{flex:1;min-height:38px}
  .payment-bill-panel,.archive-period-panel,.archive-item-panel{height:auto!important;min-height:0!important;overflow:visible!important}
  .payment-bill-panel .enterprise-table,.archive-item-panel .enterprise-table{display:block;min-width:0!important;width:100%}
  .payment-bill-panel .enterprise-table thead,.archive-item-panel .enterprise-table thead{display:none}
  .payment-bill-panel .enterprise-table tbody,.payment-bill-panel .enterprise-table tr,.payment-bill-panel .enterprise-table td,.archive-item-panel .enterprise-table tbody,.archive-item-panel .enterprise-table tr,.archive-item-panel .enterprise-table td{display:block;box-sizing:border-box;width:100%}
  .payment-bill-panel .enterprise-table tbody,.archive-item-panel .enterprise-table tbody{padding:8px;background:#f6f9fb}
  .payment-bill-panel .enterprise-table tr,.archive-item-panel .enterprise-table tr{height:auto!important;margin-bottom:8px;padding:3px 11px;border:1px solid #dce6ec;border-radius:8px;background:#fff;box-shadow:0 2px 8px #17375c0b}
  .payment-bill-panel .enterprise-table tr:last-child,.archive-item-panel .enterprise-table tr:last-child{margin-bottom:0}
  .payment-bill-panel .enterprise-table td,.archive-item-panel .enterprise-table td{display:grid;grid-template-columns:82px minmax(0,1fr);align-items:start;gap:10px;min-height:38px;height:auto;padding:9px 0;text-align:right!important;white-space:normal;border-top:1px solid #edf1f4}
  .payment-bill-panel .enterprise-table td:first-child,.archive-item-panel .enterprise-table td:first-child{border-top:0}
  .payment-bill-panel .enterprise-table td:before,.archive-item-panel .enterprise-table td:before{color:#788b98;text-align:left;font-size:11px;line-height:1.6}
  .payment-bill-panel .enterprise-table td:nth-child(1):before{content:'账单编号'}.payment-bill-panel .enterprise-table td:nth-child(2):before{content:'租户'}.payment-bill-panel .enterprise-table td:nth-child(3):before{content:'结算周期'}.payment-bill-panel .enterprise-table td:nth-child(4):before{content:'总金额'}.payment-bill-panel .enterprise-table td:nth-child(5):before{content:'欠费金额'}.payment-bill-panel .enterprise-table td:nth-child(6):before{content:'处理阶段'}.payment-bill-panel .enterprise-table td:nth-child(7):before{content:'发票'}.payment-bill-panel .enterprise-table td:nth-child(8):before{content:'生成时间'}.payment-bill-panel .enterprise-table td:nth-child(9):before{content:'操作'}
  .archive-item-panel .enterprise-table td:nth-child(1):before{content:'档案编号'}.archive-item-panel .enterprise-table td:nth-child(2):before{content:'账单类型'}.archive-item-panel .enterprise-table td:nth-child(3):before{content:'结算对象'}.archive-item-panel .enterprise-table td:nth-child(4):before{content:'合同'}.archive-item-panel .enterprise-table td:nth-child(5):before{content:'应收金额'}.archive-item-panel .enterprise-table td:nth-child(6):before{content:'实收金额'}.archive-item-panel .enterprise-table td:nth-child(7):before{content:'对账凭证'}.archive-item-panel .enterprise-table td:nth-child(8):before{content:'档案状态'}.archive-item-panel .enterprise-table td:nth-child(9):before{content:'操作'}
  .payment-bill-panel .enterprise-table td.row-actions,.archive-item-panel .enterprise-table td.row-actions{display:flex;justify-content:flex-end;align-items:center;gap:7px;text-align:left!important}
  .payment-bill-panel .enterprise-table td.row-actions:before,.archive-item-panel .enterprise-table td.row-actions:before{margin-right:auto}
  .payment-bill-panel .enterprise-table tr:has(.empty),.archive-item-panel .enterprise-table tr:has(.empty){padding:0;border:0;background:transparent;box-shadow:none}.payment-bill-panel .enterprise-table tr:has(.empty) td,.archive-item-panel .enterprise-table tr:has(.empty) td{display:block;padding:18px;border:0;text-align:center!important}.payment-bill-panel .enterprise-table tr:has(.empty) td:before,.archive-item-panel .enterprise-table tr:has(.empty) td:before{content:none}
  .billing-row-progress{justify-content:flex-end;flex-wrap:wrap}.billing-row-progress small{width:100%;text-align:right}
  .monthly-final-bar{position:static;grid-template-columns:auto minmax(0,1fr);margin:12px 0 0;padding:13px}.monthly-final-bar>button,.monthly-final-bar>.status{grid-column:1/-1;width:100%;justify-self:stretch}.monthly-final-bar button{min-height:42px}
  .workflow-confirm-panel,.monthly-review-panel,.archive-history-panel{min-width:0;width:100%}
  .monthly-review-table,.archive-history-panel>.table-panel{max-width:100%;overflow:auto}
  .archive-settlement-dialog,.invoice-dialog,.monthly-review-dialog,.archive-history-dialog{width:100%!important;height:auto!important;max-height:90dvh!important}
  .archive-detail-panel,.invoice-workbench,.schedule-list-panel{min-width:0!important;height:auto!important;padding:14px!important}
  .archive-detail-panel{overflow:visible}.archive-detail-content{overflow:visible!important}
  .invoice-type-cards{grid-template-columns:1fr}.invoice-operation,.invoice-red{align-items:stretch;flex-direction:column}.invoice-operation button,.invoice-red button{width:100%;min-height:40px}
  .table-pagination{position:static!important}.table-pagination .page-number:nth-of-type(n+4){display:none}
}
</style>
