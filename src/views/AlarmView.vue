<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useAlertRef } from "@/composables/useAppAlert";
import { useRoute, useRouter } from "vue-router";
import AppDataTable, {
  type TableColumn,
} from "@/components/app/AppDataTable.vue";
import AppDialog from "@/components/app/AppDialog.vue";
import StatusTag from "@/components/app/StatusTag.vue";
import {
  BellRing,
  Cpu,
  Eye,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  Trash2,
} from "@lucide/vue";
import {
  alarmEvent,
  alarmEventAction,
  alarmEvents,
  alarmRulePreview,
  alarmRuleVersions,
  alarmRules,
  deleteAlarmRule,
  alarmSummary,
  createAlarmWorkOrder,
  resourceOptions,
  publishAlarmRule,
  rollbackAlarmRule,
  saveAlarmRule,
  trialAlarmRule,
} from "@/api/platform";
import type { RecordRow } from "@/types/domain";
import { useSessionStore } from "@/stores/session";
import { fieldLabel } from "@/utils/fieldLabels";

interface AlarmRuleForm extends Record<string, string | number | unknown> {
  rule_name: string;
  alarm_type: number;
  rule_scope: number;
  org_id: string | number;
  space_id: string | number;
  device_id: string | number;
  point_code: string;
  compare_operator: string;
  threshold_value: string | number;
  threshold_min: string | number;
  threshold_max: string | number;
  duration_seconds: number;
  alarm_level: number;
  auto_work_order: number;
  recovery_hold_seconds: number;
  org_include_children: number;
  evaluation_mode: string;
  recovery_threshold_value: string | number;
  recovery_samples: number;
  freshness_seconds: number;
  max_sample_gap_seconds: number;
  evaluation_window_samples: number;
  required_hits: number;
  window_seconds: number;
  enabled: number;
  remark: string;
}

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const mode = computed(() => String(route.meta.kind));
const title = computed(() => String(route.meta.title));
const rows = ref<RecordRow[]>([]);
const summary = ref<RecordRow>({});
const keyword = ref("");
const ruleEvaluationFilter = ref("");
const ruleLifecycleFilter = ref("");
const eventStatus = ref("OPEN");
const alarmType = ref("");
const alarmLevel = ref("");
const deviceId = ref("");
const gatewayId = ref("");
const orgId = ref("");
const includeChildren = ref("");
const startTime = ref("");
const endTime = ref("");
const loading = ref(false);
const error = useAlertRef();
const selected = ref<RecordRow | null>(null);
const eventDetailOpen = ref(false);
const eventMoreOpen = ref(false);
const dialog = ref(false);
const editingId = ref<unknown>(null);
const ruleWizardStep = ref(1);
const ruleWizardError = ref("");
const rule = reactive<AlarmRuleForm>({
  rule_name: "",
  alarm_type: 5,
  rule_scope: 1,
  org_id: "",
  space_id: "",
  device_id: "",
  point_code: "",
  compare_operator: ">",
  threshold_value: "",
  threshold_min: "",
  threshold_max: "",
  duration_seconds: 0,
  alarm_level: 2,
  auto_work_order: 1,
  recovery_hold_seconds: 8,
  org_include_children: 1,
  evaluation_mode: "THRESHOLD",
  recovery_threshold_value: "",
  recovery_samples: 3,
  freshness_seconds: 900,
  max_sample_gap_seconds: 900,
  evaluation_window_samples: 5,
  required_hits: 3,
  window_seconds: 300,
  enabled: 1,
  remark: "",
});
const actionDialog = ref(false);
const actionTarget = ref<RecordRow | null>(null);
const actionName = ref("");
const actionRemark = ref("");
const suppressUntil = ref("");
const ruleToolsOpen = ref(false);
const ruleToolsLoading = ref(false);
const toolRule = ref<RecordRow | null>(null);
const ruleVersions = ref<RecordRow[]>([]);
const rulePreview = ref<RecordRow>({});
const previewDevices = computed<RecordRow[]>(() =>
  Array.isArray(rulePreview.value.devices)
    ? (rulePreview.value.devices as RecordRow[])
    : [],
);
const trialDialog = ref(false);
const trialValue = ref("");
const trialResult = ref<RecordRow | null>(null);
const orgOptions = ref<RecordRow[]>([]);
const spaceOptions = ref<RecordRow[]>([]);
const deviceOptions = ref<RecordRow[]>([]);
const pointOptions = ref<RecordRow[]>([]);
const alarmTypeOptions = [
  { label: "过压", value: 1 },
  { label: "欠压", value: 2 },
  { label: "过流", value: 3 },
  { label: "设备离线", value: 4 },
  { label: "数据异常", value: 5 },
];
const ruleScopeOptions = [
  { label: "全局", value: 1 },
  { label: "组织", value: 2 },
  { label: "设备", value: 3 },
  { label: "空间", value: 4 },
];
const alarmLevelOptions = [
  { label: "一般", value: 1 },
  { label: "重要", value: 2 },
  { label: "紧急", value: 3 },
];
const eventStatusOptions = [
  { label: "待闭环", value: "OPEN" },
  { label: "新告警", value: "NEW" },
  { label: "已确认", value: "ACKNOWLEDGED" },
  { label: "处理中", value: "IN_PROGRESS" },
  { label: "已恢复", value: "RECOVERED" },
  { label: "已关闭", value: "CLOSED" },
  { label: "误报", value: "FALSE_POSITIVE" },
  { label: "已抑制", value: "SUPPRESSED" },
];
const eventStatusLabels: Record<string, string> = Object.fromEntries(
  eventStatusOptions
    .filter((item) => item.value !== "OPEN")
    .map((item) => [item.value, item.label]),
);
const actionTitles: Record<string, string> = {
  TRIGGER: "首次触发",
  RETRIGGER: "恢复期内再次触发",
  AUTO_RECOVER: "自动恢复",
  AUTO_CLOSE: "系统自动闭环",
  MIGRATE: "历史事件迁移",
  ACKNOWLEDGE: "确认告警",
  START_PROCESS: "开始处理",
  CREATE_WORK_ORDER: "创建运维工单",
  WORK_ORDER_VERIFIED: "工单验收闭环",
  WORK_ORDER_CANCELLED: "关联工单取消",
  CLOSE: "关闭告警",
  FALSE_POSITIVE: "标记误报",
  SUPPRESS: "抑制告警",
  REOPEN: "重新打开",
};
const actionLabel = (value: unknown): string => {
  const normalized = String(value || '').trim().toUpperCase()
  return actionTitles[normalized] || (normalized === 'CREATE' ? '创建' : normalized === 'CREATED' ? '已创建' : String(value || '—'))
}
const compareOperatorOptions = [
  { label: "大于", value: ">" },
  { label: "大于等于", value: ">=" },
  { label: "小于", value: "<" },
  { label: "小于等于", value: "<=" },
  { label: "等于", value: "=" },
  { label: "区间", value: "between" },
];

const alarmTypeLabel = (value: unknown): string =>
  alarmTypeOptions.find((item) => item.value === Number(value))?.label ||
  fieldLabel("alarm_type");
const ruleScopeLabel = (value: unknown): string =>
  ruleScopeOptions.find((item) => item.value === Number(value))?.label ||
  fieldLabel("rule_scope");
const alarmLevelLabel = (value: unknown): string =>
  alarmLevelOptions.find((item) => item.value === Number(value))?.label ||
  fieldLabel("alarm_level");
const compareOperatorLabel = (value: unknown): string =>
  compareOperatorOptions.find((item) => item.value === String(value))?.label ||
  String(value || "—");
const deviceName = (value: unknown): string => {
  const device = deviceOptions.value.find(
    (item) => String(item.id) === String(value),
  );
  return device
    ? String(device.device_name || device.device_sn || value)
    : String(value ?? "—");
};
const eventColumns: TableColumn[] = [
  { key: "org_name", label: "所属组织" },
  { key: "device_name", label: "告警设备" },
  { key: "alarm_type", label: "告警类型", format: alarmTypeLabel },
  { key: "point_code", label: "触发测点" },
  { key: "alarm_level", label: "等级", format: alarmLevelLabel },
  { key: "event_status", label: "事件状态" },
  { key: "occurrence_count", label: "触发次数" },
  { key: "last_occurrence_time", label: "最近触发" },
];
const ruleColumns: TableColumn[] = [
  { key: "rule_name", label: "策略名称" },
  {
    key: "device_id",
    label: "适用对象",
    format: (value) => (value ? deviceName(value) : "组织内设备"),
  },
  { key: "point_code", label: "监测项" },
  { key: "evaluation_mode", label: "判断模式" },
  { key: "compare_operator", label: "触发条件", format: compareOperatorLabel },
  { key: "threshold_value", label: "阈值" },
  { key: "duration_seconds", label: "持续确认(秒)" },
  {
    key: "auto_work_order",
    label: "自动建单",
    format: (value) => (Number(value) === 1 ? "开启" : "关闭"),
  },
  { key: "recovery_hold_seconds", label: "恢复观察(秒)" },
  { key: "version_no", label: "发布版本" },
  { key: "lifecycle_status", label: "发布状态" },
  { key: "enabled", label: "状态" },
];
const evaluationModeOptions = [
  { label: "即时阈值", value: "THRESHOLD" },
  { label: "N次命中", value: "N_OF_M" },
  { label: "窗口平均", value: "WINDOW_AVG" },
  { label: "变化率（每分钟）", value: "RATE_OF_CHANGE" },
  { label: "测点数据缺失", value: "MISSING_DATA" },
  { label: "设备离线", value: "OFFLINE" },
];
const urgentCount = computed(
  () =>
    rows.value.filter(
      (row) =>
        Number(row.alarm_level) === 3 &&
        !["CLOSED", "FALSE_POSITIVE"].includes(String(row.event_status)),
    ).length,
);
const summaryCards = computed(() => [
  {
    label: "待闭环事件",
    value: summary.value.pendingCount || 0,
    tone: "tone-warn",
    hint: "确认 / 处理 / 抑制",
  },
  {
    label: "紧急未处理",
    value: urgentCount.value,
    tone: "tone-danger",
    hint: "优先处理",
  },
  {
    label: "待验证恢复",
    value: summary.value.recoveredCount || 0,
    tone: "tone-success",
    hint: "确认后关闭",
  },
  {
    label: "已闭环事件",
    value: summary.value.closedCount || 0,
    tone: "tone-blue",
    hint: "关闭 / 误报",
  },
]);
const detailItems = computed(() =>
  selected.value
    ? [
        ["所属组织", selected.value.org_name || selected.value.org_id || "—"],
        [
          "告警设备",
          selected.value.device_name || selected.value.device_sn || "—",
        ],
        ["触发测点", selected.value.point_code || "—"],
        ["告警类型", alarmTypeLabel(selected.value.alarm_type)],
        ["告警等级", alarmLevelLabel(selected.value.alarm_level)],
        [
          "事件状态",
          eventStatusLabels[String(selected.value.event_status)] ||
            selected.value.event_status ||
            "—",
        ],
        [
          "设备条件",
          selected.value.condition_status === "CLEARED" ? "已恢复" : "仍在异常",
        ],
        [
          "恢复观察",
          selected.value.event_status === "RECOVERED"
            ? `连续正常 ${selected.value.recovery_hold_seconds || 8} 秒后系统闭环`
            : "—",
        ],
        ["触发值", selected.value.alarm_value ?? "—"],
        ["阈值", selected.value.threshold_value ?? "—"],
        [
          "首次触发",
          selected.value.first_occurrence_time ||
            selected.value.alarm_time ||
            "—",
        ],
        [
          "最近触发",
          selected.value.last_occurrence_time ||
            selected.value.alarm_time ||
            "—",
        ],
        ["聚合次数", selected.value.occurrence_count || 1],
        ["恢复期复发", selected.value.retrigger_count || 0],
        ["确认人", selected.value.ack_user || "—"],
        ["恢复时间", selected.value.recovery_time || "—"],
        ["关联工单", selected.value.work_order_no || "—"],
        ["处置备注", selected.value.deal_remark || "—"],
      ]
    : [],
);
const essentialDetailItems = computed(() =>
  selected.value
    ? [
        [
          "告警设备",
          selected.value.device_name || selected.value.device_sn || "—",
        ],
        ["告警类型", alarmTypeLabel(selected.value.alarm_type)],
        ["告警等级", alarmLevelLabel(selected.value.alarm_level)],
        [
          "事件状态",
          eventStatusLabels[String(selected.value.event_status)] ||
            selected.value.event_status ||
            "—",
        ],
        [
          "设备条件",
          selected.value.condition_status === "CLEARED" ? "已恢复" : "仍在异常",
        ],
        ["触发测点", selected.value.point_code || "—"],
        [
          "触发值 / 阈值",
          `${selected.value.alarm_value ?? "—"} / ${selected.value.threshold_value ?? "—"}`,
        ],
        [
          "最近触发",
          selected.value.last_occurrence_time ||
            selected.value.alarm_time ||
            "—",
        ],
      ]
    : [],
);
const timeline = computed<RecordRow[]>(() =>
  Array.isArray(selected.value?.timeline)
    ? (selected.value.timeline as RecordRow[])
    : [],
);
const selectedStatus = computed(() =>
  String(selected.value?.event_status || ""),
);
const selectedHasActiveWorkOrder = computed(
  () =>
    Boolean(selected.value?.work_order_id) &&
    !["CLOSED", "CANCELLED"].includes(
      String(selected.value?.work_order_status || ""),
    ),
);
const pendingCount = computed(() => Number(summary.value.pendingCount || 0));
const ruleEnabledCount = computed(
  () => rows.value.filter((item) => Number(item.enabled) === 1).length,
);
const ruleAutoCount = computed(
  () =>
    rows.value.filter(
      (item) =>
        Number(item.auto_work_order) === 1 && Number(item.enabled) === 1,
    ).length,
);
const selectedDeviceTypeId = computed(
  () =>
    deviceOptions.value.find(
      (item) => String(item.id) === String(rule.device_id),
    )?.device_type_id,
);
const availablePointOptions = computed(() => {
  const typeId = selectedDeviceTypeId.value;
  const filtered = typeId
    ? pointOptions.value.filter(
        (item) => String(item.device_type_id) === String(typeId),
      )
    : pointOptions.value;
  const seen = new Set<string>();
  return filtered.filter((item) => {
    const code = String(item.point_code || "");
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
});
const activeQueueLabel = computed(
  () =>
    eventStatusOptions.find((item) => item.value === eventStatus.value)
      ?.label || "全部事件",
);
function statusCount(status: string) {
  if (status === "OPEN") return pendingCount.value;
  const groups = Array.isArray(summary.value.byStatus)
    ? (summary.value.byStatus as RecordRow[])
    : [];
  return Number(
    groups.find((item) => String(item.event_status) === status)?.count || 0,
  );
}
const queryText = (value: unknown) =>
  Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
function syncQueryFilters() {
  deviceId.value = queryText(route.query.deviceId);
  gatewayId.value = queryText(route.query.gatewayId);
  orgId.value = queryText(route.query.orgId);
  includeChildren.value = queryText(route.query.includeChildren);
}

function resetRule(data: RecordRow = {}) {
  Object.keys(rule).forEach((key) => delete rule[key]);
  Object.assign(rule, {
    rule_name: "",
    alarm_type: 5,
    rule_scope: 1,
    org_id: "",
    space_id: "",
    org_include_children: 1,
    device_id: "",
    point_code: "",
    evaluation_mode: "THRESHOLD",
    compare_operator: ">",
    threshold_value: "",
    threshold_min: "",
    threshold_max: "",
    recovery_threshold_value: "",
    recovery_samples: 3,
    freshness_seconds: 900,
    max_sample_gap_seconds: 900,
    evaluation_window_samples: 5,
    required_hits: 3,
    window_seconds: 300,
    duration_seconds: 0,
    alarm_level: 2,
    auto_work_order: 1,
    recovery_hold_seconds: 8,
    enabled: 1,
    remark: "",
    ...data,
  });
}

async function load(options: { silent?: boolean } | Event = {}) {
  const silent = !(options instanceof Event) && Boolean(options.silent);
  if (!silent) loading.value = true;
  if (!silent) error.value = "";
  try {
    if (mode.value === "alarm-rules") {
      const page = await alarmRules({
        pageNum: 1,
        pageSize: 200,
        keyword: keyword.value,
        evaluationMode: ruleEvaluationFilter.value || undefined,
        lifecycleStatus: ruleLifecycleFilter.value || undefined,
      });
      rows.value = page.records;
      summary.value = {};
      return;
    }
    const [page, data] = await Promise.all([
      alarmEvents({
        pageNum: 1,
        pageSize: 200,
        keyword: keyword.value,
        deviceId: deviceId.value || undefined,
        gatewayId: gatewayId.value || undefined,
        orgId: orgId.value || undefined,
        includeChildren: includeChildren.value || undefined,
        eventStatus: eventStatus.value || undefined,
        alarmType: alarmType.value || undefined,
        alarmLevel: alarmLevel.value || undefined,
        startTime: startTime.value || undefined,
        endTime: endTime.value || undefined,
      }),
      alarmSummary({
        orgId: orgId.value || undefined,
        includeChildren: includeChildren.value || undefined,
      }),
    ]);
    rows.value = page.records;
    summary.value = data;
  } catch (e) {
    if (!silent) {
      error.value = e instanceof Error ? e.message : "告警数据读取失败";
      rows.value = [];
    }
  } finally {
    if (!silent) loading.value = false;
  }
}
async function loadLookups() {
  try {
    const [orgs, devices, points, spaces] = await Promise.all([
      resourceOptions("orgs"),
      resourceOptions("devices"),
      resourceOptions("point-definitions"),
      resourceOptions("spaces"),
    ]);
    orgOptions.value = orgs;
    deviceOptions.value = devices;
    pointOptions.value = points;
    spaceOptions.value = spaces;
  } catch {
    orgOptions.value = [];
    deviceOptions.value = [];
    pointOptions.value = [];
    spaceOptions.value = [];
  }
}

function openCreate() {
  editingId.value = null;
  ruleWizardStep.value = 1;
  ruleWizardError.value = "";
  resetRule();
  dialog.value = true;
}
function openEdit(row: RecordRow) {
  editingId.value = row.id;
  ruleWizardStep.value = 1;
  ruleWizardError.value = "";
  resetRule(row);
  dialog.value = true;
}
function validateRuleWizardStep(step: number) {
  ruleWizardError.value = "";
  if (step === 1) {
    if (!String(rule.rule_name || "").trim())
      ruleWizardError.value = "请填写策略名称。";
    else if (Number(rule.rule_scope) === 2 && !rule.org_id)
      ruleWizardError.value = "请选择策略所属组织。";
    else if (Number(rule.rule_scope) === 4 && !rule.space_id)
      ruleWizardError.value = "请选择策略所属空间。";
    else if (Number(rule.rule_scope) === 3 && !rule.device_id)
      ruleWizardError.value = "请选择目标设备。";
    else if (
      rule.evaluation_mode !== "OFFLINE" &&
      !String(rule.point_code || "").trim()
    )
      ruleWizardError.value = "请选择设备真实测点。";
  } else if (step === 2) {
    const noValueMode = ["OFFLINE", "MISSING_DATA"].includes(
      String(rule.evaluation_mode),
    );
    if (
      !noValueMode &&
      rule.compare_operator === "between" &&
      (rule.threshold_min === "" || rule.threshold_max === "")
    )
      ruleWizardError.value = "请完整填写触发区间。";
    else if (
      !noValueMode &&
      rule.compare_operator !== "between" &&
      rule.threshold_value === ""
    )
      ruleWizardError.value = "请填写触发阈值。";
    else if (Number(rule.recovery_samples) < 1)
      ruleWizardError.value = "连续正常次数至少为 1。";
  }
  return !ruleWizardError.value;
}
async function submitRuleDialog() {
  if (editingId.value) {
    await saveRule();
    return;
  }
  if (!validateRuleWizardStep(ruleWizardStep.value)) return;
  if (ruleWizardStep.value < 3) {
    ruleWizardStep.value += 1;
    return;
  }
  await saveRule();
}
async function saveRule() {
  try {
    const saved = await saveAlarmRule(rule, editingId.value || undefined);
    await publishAlarmRule(saved.id || editingId.value);
    dialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "规则保存或发布失败";
  }
}
async function removeRule(row: RecordRow) {
  if (!row.id || !window.confirm(`确认删除策略“${row.rule_name || '未命名策略'}”？`)) return;
  try { await deleteAlarmRule(row.id); await load(); } catch (e) { error.value = e instanceof Error ? e.message : '策略删除失败'; }
}
async function openRuleTools(row: RecordRow) {
  toolRule.value = row;
  ruleToolsOpen.value = true;
  ruleToolsLoading.value = true;
  try {
    const [versions, preview] = await Promise.all([
      alarmRuleVersions(row.id),
      alarmRulePreview(row.id),
    ]);
    ruleVersions.value = versions;
    rulePreview.value = preview;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "规则版本与命中范围读取失败";
  } finally {
    ruleToolsLoading.value = false;
  }
}
function openTrial(row: RecordRow) {
  toolRule.value = row;
  trialValue.value = "";
  trialResult.value = null;
  trialDialog.value = true;
}
async function runTrial() {
  if (!toolRule.value) return;
  try {
    trialResult.value = await trialAlarmRule(toolRule.value.id, {
      sampleValue:
        trialValue.value === "" ? undefined : Number(trialValue.value),
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "规则试运行失败";
  }
}
async function rollbackVersion(version: RecordRow) {
  if (!toolRule.value) return;
  if (
    !window.confirm(
      `确认以 V${version.version_no} 为基础发布一个新的回滚版本？`,
    )
  )
    return;
  try {
    await rollbackAlarmRule(toolRule.value.id, version.id);
    await load();
    await openRuleTools(
      rows.value.find(
        (item) => String(item.id) === String(toolRule.value?.id),
      ) || toolRule.value,
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "规则回滚失败";
  }
}
async function openDetail(row: RecordRow) {
  try {
    selected.value = await alarmEvent(row.id);
    eventDetailOpen.value = true;
    eventMoreOpen.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "告警详情读取失败";
  }
}
function openAction(row: RecordRow, action: string) {
  actionTarget.value = row;
  actionName.value = action;
  actionRemark.value = "";
  suppressUntil.value = "";
  actionDialog.value = true;
}
async function submitAction() {
  if (!actionTarget.value) return;
  try {
    const body: RecordRow = { remark: actionRemark.value };
    if (actionName.value === "SUPPRESS") {
      body.suppressReason = actionRemark.value;
      body.suppressUntil = suppressUntil.value;
    }
    selected.value = await alarmEventAction(
      actionTarget.value.id,
      actionName.value,
      body,
    );
    actionDialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "告警状态流转失败";
  }
}
async function createWorkOrder(row: RecordRow) {
  try {
    const order = await createAlarmWorkOrder(row.id);
    selected.value = null;
    await router.push(`/operations/work-orders?workOrderId=${order.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "创建告警工单失败";
  }
}
async function goWorkOrder() {
  const workOrderId = selected.value?.work_order_id;
  if (!workOrderId) return;
  selected.value = null;
  eventDetailOpen.value = false;
  eventMoreOpen.value = false;
  await router.push(`/operations/work-orders?workOrderId=${workOrderId}`);
}
function resetEvents() {
  keyword.value = "";
  eventStatus.value = "OPEN";
  alarmType.value = "";
  alarmLevel.value = "";
  deviceId.value = "";
  gatewayId.value = "";
  orgId.value = "";
  includeChildren.value = "";
  startTime.value = "";
  endTime.value = "";
  load();
}
function goDevice(row: RecordRow | null = selected.value) {
  const id = row?.device_id || deviceId.value;
  if (id) router.push(`/device-archive/devices/${id}`);
}
function goCommands(row: RecordRow | null = selected.value) {
  const id = row?.device_id || deviceId.value;
  if (id)
    router.push({ path: "/access/commands", query: { targetId: String(id) } });
}
function goEnergy(row: RecordRow | null = selected.value) {
  const id = row?.device_id || deviceId.value;
  const point = row?.point_code;
  if (id)
    router.push({
      path: "/monitor/realtime",
      query: { deviceId: String(id), pointCode: point ? String(point) : "" },
    });
}

watch(
  () => route.fullPath,
  () => {
    eventStatus.value = "OPEN";
    syncQueryFilters();
    load();
    loadLookups();
  },
);
watch(
  () => rule.evaluation_mode,
  (value, previous) => {
    if (value === "OFFLINE") {
      rule.alarm_type = 4;
      rule.point_code = "";
    } else if (previous === "OFFLINE" && Number(rule.alarm_type) === 4) {
      rule.alarm_type = 5;
    }
  },
);
onMounted(() => {
  syncQueryFilters();
  load();
  loadLookups();
});
</script>

<template>
  <section
    class="view-page alarm-enterprise-page"
    :class="mode === 'alarm-rules' ? 'alarm-strategy-page' : 'alarm-event-page'"
  >
    <header class="view-head">
      <div>
        <p class="eyebrow">ALARM · OPERATIONS</p>
        <h1>{{ title }}</h1>
      </div>
    </header>

    <template v-if="mode !== 'alarm-rules'">
      <article class="filter-card alarm-top-filter">
        <div class="filter-row">
          <label class="field alarm-filter-field">
            <span>管理范围</span>
            <AppSelect v-model="orgId" @change="() => load()">
              <option value="">全部授权组织</option>
              <option
                v-for="org in orgOptions"
                :key="String(org.id)"
                :value="String(org.id)"
              >
                {{ org.org_name }}
              </option>
            </AppSelect>
          </label>
          <label class="field alarm-filter-field">
            <span>告警等级</span>
            <AppSelect v-model="alarmLevel" @change="() => load()">
              <option value="">全部等级</option>
              <option value="3">紧急</option>
              <option value="2">重要</option>
              <option value="1">一般</option>
            </AppSelect>
          </label>
          <label class="field alarm-filter-field">
            <span>告警类型</span>
            <AppSelect v-model="alarmType" @change="() => load()">
              <option value="">全部类型</option>
              <option
                v-for="item in alarmTypeOptions"
                :key="item.value"
                :value="String(item.value)"
              >
                {{ item.label }}
              </option>
            </AppSelect>
          </label>
          <label class="field alarm-search-field">
            <span>搜索</span>
            <span class="archive-search-box"
              ><Search :size="15" /><input
                v-model.trim="keyword"
                placeholder="搜索设备、测点或策略"
                @keyup.enter="() => load()"
            /></span>
          </label>
          <button
            class="icon-btn bare-icon filter-reset-icon"
            title="清除筛选"
            aria-label="清除筛选"
            @click="resetEvents"
          >
            <RotateCcw :size="16" />
          </button>
        </div>
      </article>
      <div class="enterprise-workbench alarm-event-workbench">
        <aside class="enterprise-sidebar alarm-event-sidebar">
          <div class="sidebar-section alarm-queue-section">
            <strong>我的事件队列</strong>
            <button
              v-for="item in eventStatusOptions"
              :key="item.value"
              :class="{ active: eventStatus === item.value }"
              @click="
                eventStatus = item.value;
                load();
              "
            >
              <span>{{ item.label }}</span
              ><em>{{ statusCount(item.value) }}</em>
            </button>
            <button
              :class="{ active: eventStatus === '' }"
              @click="
                eventStatus = '';
                load();
              "
            >
              <span>全部事件</span><em>{{ rows.length }}</em>
            </button>
          </div>
        </aside>
        <section class="enterprise-main alarm-event-main">
          <div class="enterprise-toolbar">
            <div>
              <strong>{{ activeQueueLabel }}</strong
              ><small>按最近触发时间排序</small>
            </div>
            <span class="sync-state">筛选条件变更后更新</span>
          </div>
          <div class="enterprise-brief-strip">
            <article
              v-for="card in summaryCards"
              :key="card.label"
              :class="card.tone"
            >
              <span>{{ card.label }}</span
              ><b>{{ card.value }}</b
              ><small>{{ card.hint }}</small>
            </article>
          </div>
          <AppDataTable
            :page-size="10"
            class="alarm-compact-table"
            compact
            title="设备异常事件"
            :columns="eventColumns"
            :rows="rows"
            :loading="loading"
            :error="error"
            @refresh="load"
            @detail="openDetail"
            ><template #cell-alarm_level="{ value }"
              ><span
                class="tag"
                :class="
                  Number(value) === 3
                    ? 'danger'
                    : Number(value) === 2
                      ? 'warn'
                      : 'blue'
                "
                >{{ alarmLevelLabel(value) }}</span
              ></template
            ><template #cell-event_status="{ value }"
              ><StatusTag domain="alarm" :value="value" /></template
            ><template #actions="{ row }"
              ><button
                class="icon-btn"
                title="详情"
                aria-label="详情"
                @click="openDetail(row)"
              >
                <Eye :size="16" /></button
              ><button
                class="icon-btn"
                title="设备档案"
                aria-label="设备档案"
                @click="goDevice(row)"
              >
                <Cpu :size="16" /></button
              ><button
                v-if="
                  String(row.event_status) === 'NEW' &&
                  session.can('alarm:event:deal')
                "
                class="link-btn"
                @click="openAction(row, 'ACKNOWLEDGE')"
              >
                确认</button
              ><button
                v-if="
                  ['NEW', 'ACKNOWLEDGED'].includes(String(row.event_status)) &&
                  !row.work_order_id &&
                  session.can('ops:workorder:create')
                "
                class="link-btn"
                @click="createWorkOrder(row)"
              >
                建工单
              </button></template
            ></AppDataTable
          >
        </section>
      </div>
    </template>

    <template v-else>
      <div class="enterprise-workbench">
        <aside class="enterprise-sidebar strategy-sidebar">
          <div class="strategy-score">
            <span>已启用策略</span><b>{{ ruleEnabledCount }}</b
            ><small>其中 {{ ruleAutoCount }} 条自动生成工单</small>
          </div>
          <div class="sidebar-section">
            <strong>策略设计顺序</strong>
            <ol>
              <li>选择设备或组织范围</li>
              <li>选择真实监测项</li>
              <li>设置持续触发条件</li>
              <li>定义自动建单与恢复观察</li>
            </ol>
          </div>
          <div class="strategy-note">
            保存后，数据服务会从下一批设备数据开始自动判断，无需重启。
          </div>
        </aside>
        <section class="enterprise-main">
          <div class="enterprise-toolbar">
            <label class="archive-search-box strategy-table-search">
              <Search :size="15" />
              <input
                v-model.trim="keyword"
                placeholder="搜索策略名称或监测项，回车筛选"
                @keyup.enter="load"
              />
            </label>
            <div class="strategy-toolbar-actions">
              <label class="field compact-select"><span>判断模式</span><AppSelect v-model="ruleEvaluationFilter" @change="load"><option value="">全部模式</option><option v-for="item in evaluationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</option></AppSelect></label>
              <label class="field compact-select"><span>发布状态</span><AppSelect v-model="ruleLifecycleFilter" @change="load"><option value="">全部状态</option><option value="DRAFT">草稿</option><option value="PUBLISHED">已发布</option><option value="DISABLED">已停用</option></AppSelect></label>
              <button
                class="icon-btn bare-icon strategy-toolbar-refresh"
                :disabled="loading"
                title="刷新"
                aria-label="刷新"
                @click="load"
              >
                <RefreshCw :size="15" :class="{ spinning: loading }" />
              </button>
              <button
                v-if="session.can('alarm:rule:edit')"
                class="quiet add-action strategy-add-action"
                @click="openCreate"
              >
                <Plus :size="15" />新建自动化策略
              </button>
            </div>
          </div>
          <AppDataTable
            :page-size="10"
            class="strategy-compact-table"
            title="告警自动化策略"
            :columns="ruleColumns"
            :rows="rows"
            :loading="loading"
            :error="error"
            @refresh="load"
            ><template #cell-enabled="{ value }"
              ><StatusTag domain="online" :value="value" /></template
            ><template #actions="{ row }"
              ><button
                v-if="session.can('alarm:rule:edit')"
                class="icon-btn bare-icon strategy-row-action"
                title="编辑策略"
                aria-label="编辑策略"
                @click="openEdit(row)"
              >
                <Pencil :size="15" /></button
              ><button
                class="icon-btn bare-icon strategy-row-action"
                title="命中预览与版本"
                aria-label="命中预览与版本"
                @click="openRuleTools(row)"
              >
                <Eye :size="15" /></button
              ><button
                class="icon-btn bare-icon strategy-row-action"
                title="安全试运行"
                aria-label="安全试运行"
                @click="openTrial(row)"
              >
                <Play :size="15" /></button><button
                v-if="session.can('alarm:rule:edit')"
                class="icon-btn bare-icon strategy-row-action danger-text"
                title="删除策略"
                aria-label="删除策略"
                @click="removeRule(row)"
              >
                <Trash2 :size="15" /></button></template
          ></AppDataTable>
        </section>
      </div>
    </template>

    <AppDialog
      :open="eventDetailOpen"
      title="告警事件详情"
      dialog-class="center-detail-dialog alarm-event-dialog"
      :hide-actions="true"
      @update:open="
        (open) => {
          eventDetailOpen = open;
          if (!open && !eventMoreOpen) selected = null;
        }
      "
      ><dl class="detail-grid compact-detail-grid">
        <template v-for="item in essentialDetailItems" :key="item[0]"
          ><dt>{{ item[0] }}</dt>
          <dd>{{ item[1] }}</dd></template
        >
      </dl>
      <section v-if="timeline.length" class="alarm-timeline">
        <h3>事件时间线</h3>
        <article v-for="item in timeline" :key="String(item.id)">
          <span></span>
          <div>
            <strong>{{
              actionLabel(item.action) || item.action
            }}</strong
            ><small>{{ item.operator_name }} · {{ item.create_time }}</small>
            <p v-if="item.content">{{ item.content }}</p>
          </div>
        </article>
      </section>
      <section v-if="selected?.work_order_id" class="alarm-linked-work-order">
        <div>
          <h3>关联运维工单</h3>
          <p>
            {{ selected.work_order_no || `工单 #${selected.work_order_id}` }} ·
            {{ selected.work_order_status || "待处理" }}
          </p>
        </div>
        <button class="quiet" @click="goWorkOrder">查看工单</button>
      </section>
      <div class="modal-action-row alarm-drawer-actions">
        <button class="quiet" @click="eventMoreOpen = true">
          查看完整信息
        </button>
        <button class="quiet" @click="goDevice()">设备档案</button
        ><button class="quiet" @click="goEnergy()">实时监控</button
        ><button class="quiet" @click="goCommands()">指令追踪</button
        ><button
          v-if="
            selected &&
            ['NEW', 'ACKNOWLEDGED'].includes(selectedStatus) &&
            !selected.work_order_id &&
            session.can('ops:workorder:create')
          "
          class="quiet"
          @click="createWorkOrder(selected)"
        >
          转运维工单</button
        ><button
          v-if="
            selected &&
            selectedStatus === 'NEW' &&
            session.can('alarm:event:deal')
          "
          class="primary"
          @click="openAction(selected, 'ACKNOWLEDGE')"
        >
          <BellRing :size="15" />确认</button
        ><button
          v-if="
            selected &&
            ['NEW', 'ACKNOWLEDGED'].includes(selectedStatus) &&
            !selectedHasActiveWorkOrder &&
            session.can('alarm:event:deal')
          "
          class="primary"
          @click="openAction(selected, 'START_PROCESS')"
        >
          <Play :size="15" />开始处理</button
        ><button
          v-if="
            selected &&
            ['NEW', 'ACKNOWLEDGED'].includes(selectedStatus) &&
            !selectedHasActiveWorkOrder &&
            session.can('alarm:event:deal')
          "
          class="quiet"
          @click="openAction(selected, 'SUPPRESS')"
        >
          <ShieldOff :size="15" />抑制</button
        ><button
          v-if="
            selected &&
            ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(selectedStatus) &&
            !selectedHasActiveWorkOrder &&
            session.can('alarm:event:deal')
          "
          class="quiet"
          @click="openAction(selected, 'FALSE_POSITIVE')"
        >
          标记误报</button
        ><button
          v-if="
            selected &&
            ['CLOSED', 'FALSE_POSITIVE', 'SUPPRESSED'].includes(
              selectedStatus,
            ) &&
            session.can('alarm:event:deal')
          "
          class="quiet"
          @click="openAction(selected, 'REOPEN')"
        >
          <RotateCcw :size="15" />重新打开
        </button>
      </div></AppDialog
    >
    <AppDialog
      :open="eventMoreOpen"
      title="告警完整信息"
      dialog-class="center-detail-dialog secondary-detail-dialog"
      :hide-actions="true"
      @update:open="eventMoreOpen = $event"
    >
      <dl class="detail-grid full-detail-grid">
        <template v-for="item in detailItems" :key="item[0]">
          <dt>{{ item[0] }}</dt>
          <dd>{{ item[1] }}</dd>
        </template>
      </dl>
    </AppDialog>
    <AppDialog
      :open="ruleToolsOpen"
      title="规则发布与影响范围"
      dialog-class="center-detail-dialog rule-tools-dialog"
      :hide-actions="true"
      @update:open="ruleToolsOpen = $event"
    >
      <div v-if="ruleToolsLoading" class="empty-state">
        正在计算命中设备并读取版本…
      </div>
      <template v-else-if="toolRule">
        <section class="rule-impact-summary">
          <div>
            <span>策略</span><b>{{ toolRule.rule_name }}</b>
          </div>
          <div>
            <span>命中设备</span><b>{{ rulePreview.targetCount || 0 }}</b>
          </div>
          <div>
            <span>测点支持</span><b>{{ rulePreview.supportedCount || 0 }}</b>
          </div>
          <div>
            <span>不支持</span
            ><b
              :class="{
                'danger-text': Number(rulePreview.unsupportedCount || 0) > 0,
              }"
              >{{ rulePreview.unsupportedCount || 0 }}</b
            >
          </div>
        </section>
        <section class="rule-preview-section">
          <h3>命中设备预览</h3>
          <div class="rule-device-list">
            <article v-for="device in previewDevices" :key="String(device.id)">
              <span
                ><b>{{ device.device_name || device.device_sn }}</b
                ><small>{{ device.device_sn }}</small></span
              >
              <em
                :class="
                  Number(device.supported) === 1 ? 'supported' : 'unsupported'
                "
                >{{
                  Number(device.supported) === 1 ? "可执行" : "缺少测点"
                }}</em
              >
            </article>
            <p v-if="!previewDevices.length" class="empty-state">
              当前授权范围内没有命中设备。
            </p>
          </div>
        </section>
        <section class="rule-version-section">
          <h3>不可变发布记录</h3>
          <article
            v-for="version in ruleVersions"
            :key="String(version.id)"
            class="rule-version-row"
          >
            <i>V{{ version.version_no }}</i>
            <span
              ><b>{{ version.publisher_name || "system" }}</b
              ><small>{{ version.publish_time }}</small></span
            >
            <em
              v-if="
                String(version.id) === String(toolRule.published_version_id)
              "
              >当前版本</em
            >
            <button
              v-else-if="session.can('alarm:rule:edit')"
              class="link-btn"
              @click="rollbackVersion(version)"
            >
              <RotateCcw :size="13" />回滚并发布
            </button>
          </article>
        </section>
      </template>
    </AppDialog>
    <AppDialog
      v-model:open="trialDialog"
      title="规则安全试运行"
      confirm-text="执行试运行"
      @submit="runTrial"
    >
      <div class="form-section">
        <p class="rule-trial-note">
          只计算判断结果，不写入告警或工单。当前使用已保存的草稿参数。
        </p>
        <div class="dialog-fields">
          <label
            v-if="
              !['OFFLINE', 'MISSING_DATA'].includes(
                String(toolRule?.evaluation_mode),
              )
            "
            class="dialog-field full"
            ><span>模拟样本值*</span
            ><input v-model="trialValue" type="number" required
          /></label>
        </div>
        <div v-if="trialResult" class="rule-trial-result">
          <span
            >判断模式 <b>{{ trialResult.evaluationMode }}</b></span
          >
          <span
            >触发告警
            <b :class="trialResult.triggered ? 'danger-text' : ''">{{
              trialResult.triggered ? "是" : "否"
            }}</b></span
          >
          <span
            >满足恢复 <b>{{ trialResult.recovered ? "是" : "否" }}</b></span
          >
          <small>本次试运行不会写入生产事件。</small>
        </div>
      </div>
    </AppDialog>
    <AppDialog
      v-model:open="dialog"
      :dialog-class="
        editingId ? 'alarm-rule-editor-dialog' : 'alarm-rule-wizard-dialog'
      "
      :title="
        editingId
          ? '编辑自动化策略'
          : `新建自动化策略 · 第 ${ruleWizardStep} 步`
      "
      :confirm-text="
        !editingId && ruleWizardStep < 3
          ? '下一步'
          : editingId
            ? '保存并发布'
            : '确认发布'
      "
      @submit="submitRuleDialog"
    >
      <div v-if="!editingId" class="rule-wizard-shell">
        <div class="device-wizard-steps rule-wizard-steps">
          <span :class="{ active: ruleWizardStep === 1 }">1 适用对象</span>
          <span :class="{ active: ruleWizardStep === 2 }">2 判断与恢复</span>
          <span :class="{ active: ruleWizardStep === 3 }">3 自动处置</span>
        </div>
        <p v-if="ruleWizardError" class="device-wizard-error" role="alert">
          {{ ruleWizardError }}
        </p>
      </div>
      <div
        v-show="editingId || ruleWizardStep === 1"
        class="form-section rule-wizard-panel"
      >
        <h3>适用对象</h3>
        <div class="dialog-fields">
          <label class="dialog-field full"
            ><span>策略名称*</span
            ><input
              v-model="rule.rule_name"
              required
              placeholder="例如：325电表A相过压保护" /></label
          ><label class="dialog-field"
            ><span>适用范围*</span
            ><AppSelect v-model.number="rule.rule_scope">
              <option
                v-for="item in ruleScopeOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </AppSelect></label
          ><label v-if="Number(rule.rule_scope) === 2" class="dialog-field"
            ><span>所属组织*</span
            ><AppSelect v-model="rule.org_id">
              <option value="">请选择组织</option>
              <option
                v-for="org in orgOptions"
                :key="String(org.id)"
                :value="String(org.id)"
              >
                {{ org.org_name }}
              </option>
            </AppSelect></label
          ><label v-if="Number(rule.rule_scope) === 2" class="dialog-field"
            ><span>组织范围</span
            ><AppSelect v-model.number="rule.org_include_children">
              <option :value="1">当前组织及全部下级</option>
              <option :value="0">仅当前组织</option>
            </AppSelect></label
          ><label v-if="Number(rule.rule_scope) === 4" class="dialog-field"
            ><span>目标空间*</span
            ><AppSelect v-model="rule.space_id">
              <option value="">请选择空间</option>
              <option
                v-for="space in spaceOptions"
                :key="String(space.id)"
                :value="String(space.id)"
              >
                {{ space.space_name || space.name || space.space_code }}
              </option>
            </AppSelect></label
          ><label v-if="Number(rule.rule_scope) === 3" class="dialog-field"
            ><span>目标设备*</span
            ><AppSelect v-model="rule.device_id">
              <option value="">请选择设备</option>
              <option
                v-for="device in deviceOptions"
                :key="String(device.id)"
                :value="String(device.id)"
              >
                {{ device.device_name || device.device_sn }}
              </option>
            </AppSelect></label
          ><label class="dialog-field"
            ><span>工业判断模式*</span
            ><AppSelect v-model="rule.evaluation_mode">
              <option
                v-for="item in evaluationModeOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </AppSelect></label
          ><label v-if="rule.evaluation_mode !== 'OFFLINE'" class="dialog-field"
            ><span>监测项*</span
            ><AppSelect v-model="rule.point_code">
              <option value="">请选择真实测点</option>
              <option
                v-for="point in availablePointOptions"
                :key="String(point.id || point.point_code)"
                :value="String(point.point_code)"
              >
                {{ point.point_name || point.point_code }}（{{
                  point.point_code
                }}）
              </option>
            </AppSelect></label
          >
        </div>
      </div>
      <div
        v-show="editingId || ruleWizardStep === 2"
        class="form-section rule-wizard-panel"
      >
        <h3>触发条件</h3>
        <div class="dialog-fields">
          <label class="dialog-field"
            ><span>业务类型*</span
            ><AppSelect v-model.number="rule.alarm_type">
              <option
                v-for="item in alarmTypeOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </AppSelect></label
          ><label class="dialog-field"
            ><span>告警等级*</span
            ><AppSelect v-model.number="rule.alarm_level">
              <option
                v-for="item in alarmLevelOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </AppSelect></label
          ><label
            v-if="
              !['OFFLINE', 'MISSING_DATA'].includes(
                String(rule.evaluation_mode),
              )
            "
            class="dialog-field"
            ><span>判断方式*</span
            ><AppSelect v-model="rule.compare_operator">
              <option
                v-for="item in compareOperatorOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </AppSelect></label
          ><label
            v-if="
              rule.compare_operator !== 'between' &&
              !['OFFLINE', 'MISSING_DATA'].includes(
                String(rule.evaluation_mode),
              )
            "
            class="dialog-field"
            ><span>触发阈值*</span
            ><input v-model="rule.threshold_value" type="number" /></label
          ><label
            v-if="
              rule.compare_operator === 'between' &&
              !['OFFLINE', 'MISSING_DATA'].includes(
                String(rule.evaluation_mode),
              )
            "
            class="dialog-field"
            ><span>区间下限*</span
            ><input v-model="rule.threshold_min" type="number" /></label
          ><label
            v-if="
              rule.compare_operator === 'between' &&
              !['OFFLINE', 'MISSING_DATA'].includes(
                String(rule.evaluation_mode),
              )
            "
            class="dialog-field"
            ><span>区间上限*</span
            ><input v-model="rule.threshold_max" type="number" /></label
          ><label class="dialog-field"
            ><span>持续确认（秒）</span
            ><input
              v-model.number="rule.duration_seconds"
              type="number"
              min="0"
              max="86400" /></label
          ><label
            v-if="
              !['OFFLINE', 'MISSING_DATA'].includes(
                String(rule.evaluation_mode),
              )
            "
            class="dialog-field"
            ><span>恢复阈值（回差）</span
            ><input
              v-model="rule.recovery_threshold_value"
              type="number" /></label
          ><label class="dialog-field"
            ><span>连续正常次数</span
            ><input
              v-model.number="rule.recovery_samples"
              type="number"
              min="1"
              max="100" /></label
          ><label class="dialog-field"
            ><span>数据新鲜度（秒）</span
            ><input
              v-model.number="rule.freshness_seconds"
              type="number"
              min="10"
              max="86400" /></label
          ><label class="dialog-field"
            ><span>最大采样间隔（秒）</span
            ><input
              v-model.number="rule.max_sample_gap_seconds"
              type="number"
              min="10"
              max="86400" /></label
          ><label
            v-if="
              ['N_OF_M', 'WINDOW_AVG'].includes(String(rule.evaluation_mode))
            "
            class="dialog-field"
            ><span>窗口样本数</span
            ><input
              v-model.number="rule.evaluation_window_samples"
              type="number"
              min="2"
              max="1000" /></label
          ><label v-if="rule.evaluation_mode === 'N_OF_M'" class="dialog-field"
            ><span>窗口命中次数</span
            ><input
              v-model.number="rule.required_hits"
              type="number"
              min="1"
              :max="Number(rule.evaluation_window_samples)" /></label
          ><label
            v-if="rule.evaluation_mode === 'WINDOW_AVG'"
            class="dialog-field"
            ><span>统计窗口（秒）</span
            ><input
              v-model.number="rule.window_seconds"
              type="number"
              min="10"
              max="86400"
          /></label>
        </div>
      </div>
      <div
        v-show="editingId || ruleWizardStep === 3"
        class="form-section rule-wizard-panel"
      >
        <h3>自动处置</h3>
        <div class="dialog-fields">
          <label class="dialog-field"
            ><span>自动生成工单</span
            ><AppSelect v-model.number="rule.auto_work_order">
              <option :value="1">开启</option>
              <option :value="0">关闭</option>
            </AppSelect></label
          ><label class="dialog-field"
            ><span>恢复观察（秒）</span
            ><input
              v-model.number="rule.recovery_hold_seconds"
              type="number"
              min="1"
              max="3600" /></label
          ><label class="dialog-field"
            ><span>策略状态</span
            ><AppSelect v-model.number="rule.enabled">
              <option :value="1">启用</option>
              <option :value="0">停用</option>
            </AppSelect></label
          ><label class="dialog-field full"
            ><span>策略说明</span
            ><textarea
              v-model="rule.remark"
              placeholder="说明适用场景和处置要求"
            ></textarea>
          </label>
        </div>
        <section v-if="!editingId" class="rule-wizard-review">
          <h4>发布前确认</h4>
          <dl>
            <div>
              <dt>策略</dt>
              <dd>{{ rule.rule_name || "未命名" }}</dd>
            </div>
            <div>
              <dt>作用范围</dt>
              <dd>{{ ruleScopeLabel(rule.rule_scope) }}</dd>
            </div>
            <div>
              <dt>监测项</dt>
              <dd>{{ rule.point_code || "设备在线状态" }}</dd>
            </div>
            <div>
              <dt>判断模式</dt>
              <dd>
                {{
                  evaluationModeOptions.find(
                    (item) => item.value === rule.evaluation_mode,
                  )?.label
                }}
              </dd>
            </div>
            <div>
              <dt>恢复条件</dt>
              <dd>
                连续正常 {{ rule.recovery_samples }} 次，观察
                {{ rule.recovery_hold_seconds }} 秒
              </dd>
            </div>
            <div>
              <dt>自动建单</dt>
              <dd>
                {{ Number(rule.auto_work_order) === 1 ? "开启" : "关闭" }}
              </dd>
            </div>
          </dl>
          <p>
            确认发布后，数据服务会从下一批新鲜且有序的数据开始执行，新版本不会改变已触发告警所使用的历史规则。
          </p>
        </section>
      </div></AppDialog
    >
    <AppDialog
      v-model:open="actionDialog"
      :title="actionTitles[actionName] || '流转告警'"
      confirm-text="确认执行"
      @submit="submitAction"
      ><div class="dialog-fields">
        <label v-if="actionName === 'SUPPRESS'" class="dialog-field full"
          ><span>抑制截止时间*</span
          ><input
            v-model="suppressUntil"
            type="datetime-local"
            required /></label
        ><label class="dialog-field full"
          ><span
            >{{ actionName === "SUPPRESS" ? "抑制原因" : "操作说明"
            }}{{
              ["CLOSE", "FALSE_POSITIVE", "REOPEN", "SUPPRESS"].includes(
                actionName,
              )
                ? "*"
                : ""
            }}</span
          ><textarea
            v-model="actionRemark"
            :required="
              ['CLOSE', 'FALSE_POSITIVE', 'REOPEN', 'SUPPRESS'].includes(
                actionName,
              )
            "
          ></textarea>
        </label></div
    ></AppDialog>
  </section>
</template>

<style scoped>
.strategy-toolbar-actions{display:flex;align-items:end;gap:8px;margin-left:auto;flex-wrap:nowrap;white-space:nowrap}
.enterprise-main:has(.strategy-compact-table){min-height:0;height:100%;display:flex;flex-direction:column}
.strategy-compact-table{flex:1;min-height:0}
.strategy-compact-table :deep(.app-table){height:100%;display:flex;flex-direction:column}
.strategy-compact-table :deep(.data-content){min-height:0;flex:1;display:flex;flex-direction:column}
.strategy-compact-table :deep(.table-scroll){min-height:0;flex:1}
.strategy-toolbar-actions .compact-select{width:138px;min-width:138px;display:grid;gap:4px}
.strategy-toolbar-actions .compact-select :deep(select){height:36px;min-height:36px}
.strategy-toolbar-refresh,.strategy-add-action{height:36px;min-height:36px;box-sizing:border-box}
.strategy-add-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:0 12px;white-space:nowrap}
.strategy-row-action{width:32px;height:32px;min-width:32px;min-height:32px;display:inline-grid;place-items:center}
</style>
