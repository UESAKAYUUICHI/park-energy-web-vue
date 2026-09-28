<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleX,
  ClipboardList,
  ChevronRight,
  Eye,
  Lightbulb,
  ListChecks,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "@lucide/vue";
import AppDataTable from "@/components/app/AppDataTable.vue";
import AppDialog from "@/components/app/AppDialog.vue";
import AppLoadingState from "@/components/app/AppLoadingState.vue";
import {
  createWorkOrder,
  executeInspection,
  generateInspectionTasks,
  inspectionAssignees,
  inspectionPlans,
  inspectionTasks,
  resourceOptions,
  operationAssignees,
  saveInspectionPlan,
  workOrder,
  workOrderAction,
  workOrders,
  workOrderStatusCounts,
} from "@/api/platform";
import { useAlertRef } from "@/composables/useAppAlert";
import { useSessionStore } from "@/stores/session";
import type { RecordRow } from "@/types/domain";
import { enabledLabel, scopeTypeLabel } from "@/utils/enumLabels";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const error = useAlertRef();
const workspaceView = computed(() =>
  String(route.query.view || "") === "inspections"
    ? "inspections"
    : "work-orders",
);
const isWorkOrder = computed(() => workspaceView.value === "work-orders");
const inspectionView = ref<"tasks" | "plans">("tasks");
const rows = ref<RecordRow[]>([]);
const workPage = ref(1);
const workPageSize = 10;
const workPageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / workPageSize)));
const workPageWindow = computed(() => {
  const start = Math.max(1, Math.min(workPage.value - 2, Math.max(1, workPageCount.value - 4)));
  const end = Math.min(workPageCount.value, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
});
const visibleWorkRows = computed(() => rows.value.slice((workPage.value - 1) * workPageSize, workPage.value * workPageSize));
const statusCounts = ref<Record<string, number>>({});
const plans = ref<RecordRow[]>([]);
const tasks = ref<RecordRow[]>([]);
const orgs = ref<RecordRow[]>([]);
const devices = ref<RecordRow[]>([]);
const assignees = ref<RecordRow[]>([]);
const planAssignees = ref<RecordRow[]>([]);
const keyword = ref("");
const status = ref("");
const deviceId = ref("");
const loading = ref(false);
const lastSyncedAt = ref("");
const dialog = ref(false);
const planDialog = ref(false);
const actionDialog = ref(false);
const inspectionDialog = ref(false);
const detailOpen = ref(false);
const detailMoreOpen = ref(false);
const selectedOrder = ref<RecordRow | null>(null);
const activeAction = ref("");
const activeOrder = ref<RecordRow | null>(null);
const activeInspection = ref<RecordRow | null>(null);
const taskDate = ref(new Date().toISOString().slice(0, 10));
const assigneeKeyword = ref("");
const planAssigneeKeyword = ref("");
const openedRouteWorkOrderId = ref("");
const workForm = reactive({
  orgId: "",
  deviceId: "",
  title: "",
  description: "",
  priority: "P2",
  slaDueTime: "",
});
const actionForm = reactive({
  assigneeUserId: "",
  note: "",
  causeCategory: "",
});
const inspectionForm = reactive<{
  result: "NORMAL" | "ABNORMAL";
  remark: string;
}>({ result: "NORMAL", remark: "" });
type ChecklistItem = {
  uid: string;
  title: string;
  instruction: string;
  required: boolean;
};
const planForm = reactive<{
  id: number;
  planNo: string;
  planName: string;
  orgId: string;
  scopeType: string;
  scopeId: string;
  cycleDays: number;
  deadlineHour: number;
  assigneeUserId: string;
  checklistItems: ChecklistItem[];
  enabled: number;
  remark: string;
}>({
  id: 0,
  planNo: "",
  planName: "",
  orgId: "",
  scopeType: "ORG",
  scopeId: "",
  cycleDays: 1,
  deadlineHour: 18,
  assigneeUserId: "",
  checklistItems: [],
  enabled: 1,
  remark: "",
});

const stages = [
  { key: "PENDING", label: "待分派" },
  { key: "ASSIGNED", label: "待接单" },
  { key: "ACCEPTED", label: "已接单" },
  { key: "PROCESSING", label: "处理中" },
  { key: "VERIFYING", label: "待验收" },
  { key: "CLOSED", label: "已关闭" },
];
const statusTabs = [
  { value: "", label: "全部状态" },
  { value: "PENDING", label: "待分派" },
  { value: "ASSIGNED", label: "待接单" },
  { value: "ACCEPTED", label: "已接单" },
  { value: "PROCESSING", label: "处理中" },
  { value: "VERIFYING", label: "待验收" },
  { value: "CLOSED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
];
const planColumns = [
  { key: "plan_no", label: "计划编号" },
  { key: "plan_name", label: "计划名称" },
  { key: "scope_type", label: "范围", format: scopeTypeLabel },
  { key: "device_name", label: "设备" },
  { key: "assignee_name", label: "负责人" },
  { key: "cycle_days", label: "周期（天）" },
  { key: "deadline_hour", label: "截止时点" },
  { key: "enabled", label: "状态", format: enabledLabel },
];
const filteredDevices = computed(() =>
  devices.value.filter(
    (item) => !planForm.orgId || String(item.org_id) === planForm.orgId,
  ),
);
const selectedDeviceName = computed(
  () =>
    devices.value.find((item) => String(item.id) === deviceId.value)
      ?.device_name || "",
);
const inspectionPendingCount = computed(
  () => tasks.value.filter((item) => String(item.status) === "PENDING").length,
);
const actionTitle = computed(
  () =>
    ({
      assign: "分派处理人",
      complete: "提交处理结果",
      verify: "验收并关闭",
      cancel: "取消工单",
    })[activeAction.value] || "工单操作",
);
const detailLogs = computed<RecordRow[]>(() =>
  Array.isArray(selectedOrder.value?.logs)
    ? (selectedOrder.value?.logs as RecordRow[])
    : [],
);
const workOrderFullDetails = computed(() =>
  selectedOrder.value
    ? (() => {
        const verification = (selectedOrder.value?.energyVerification || {}) as RecordRow;
        return [
        ["工单编号", selectedOrder.value.work_order_no || "—"],
        ["工单标题", workOrderTitle(selectedOrder.value)],
        ["工单来源", selectedOrder.value.source_type || "—"],
        ["工单类型", selectedOrder.value.work_type || "—"],
        ["优先级", selectedOrder.value.priority || "—"],
        ["当前状态", selectedOrder.value.status || "—"],
        [
          "设备",
          selectedOrder.value.device_name ||
            selectedOrder.value.device_sn ||
            "—",
        ],
        [
          "网关",
          selectedOrder.value.gateway_name ||
            selectedOrder.value.gateway_sn ||
            "—",
        ],
        ["处理人", selectedOrder.value.assignee_name || "待分派"],
        ["SLA时限", formatTime(selectedOrder.value.sla_due_time)],
        ["响应时限", formatTime(selectedOrder.value.response_due_time)],
        ["故障原因", selectedOrder.value.cause_category || "—"],
        ["处理方案", selectedOrder.value.solution || "—"],
        ["问题说明", selectedOrder.value.description || "—"],
        ["验收说明", selectedOrder.value.verify_remark || "—"],
        ["关闭方式", selectedOrder.value.close_type || "—"],
        ["核验空间", verification.space_name || (selectedOrder.value as RecordRow).space_name || "—"],
        ["核验测点", verification.metric_point_code || "—"],
        ["节能核验", verification.verdict || "尚未生成"],
        ["节能率", verification.saving_rate == null ? "—" : `${verification.saving_rate}%`],
        ["核验区间", verification.verification_start_date && verification.verification_end_date
          ? `${verification.verification_start_date} 至 ${verification.verification_end_date}` : "—"],
        ];
      })()
    : [],
);

function canAction(code: string) {
  return session.can(code);
}
function setWorkspace(view: "work-orders" | "inspections") {
  status.value = "";
  keyword.value = "";
  if (view === "inspections") inspectionView.value = "tasks";
  void router.replace({
    path: "/operations/work-orders",
    query: view === "inspections" ? { view } : {},
  });
}
function countStatus(value: string) {
  return statusCounts.value[value || "ALL"] || 0;
}
function statusTone(value: string) {
  return value ? `status-${value.toLowerCase()}` : "status-all";
}
function stageIndex(row: RecordRow) {
  if (String(row.status) === "CANCELLED") return -1;
  return Math.max(
    stages.findIndex((stage) => stage.key === String(row.status)),
    0,
  );
}
function stageReached(row: RecordRow, index: number) {
  return stageIndex(row) >= index;
}
function isSlaOverdue(row: RecordRow) {
  return (
    !["CLOSED", "CANCELLED"].includes(String(row.status)) &&
    Boolean(row.sla_due_time) &&
    new Date(String(row.sla_due_time)).getTime() < Date.now()
  );
}
function formatTime(value: unknown) {
  return value ? String(value).replace("T", " ").slice(0, 16) : "—";
}
function workOrderTitle(row: RecordRow) {
  const title = String(row.title || "未命名工单");
  const deviceId = String(row.device_id || "").trim();
  const deviceLabel = String(row.device_name || row.device_sn || "").trim();
  if (!deviceId || !deviceLabel) return title;
  return title.replace(
    new RegExp(`设备\\s*#?\\s*${deviceId}(?!\\d)`, "g"),
    deviceLabel,
  );
}
function clearFilters() {
  keyword.value = "";
  status.value = "";
  deviceId.value = "";
  void load();
}

async function load() {
  loading.value = true;
  workPage.value = 1;
  error.value = "";
  try {
    if (isWorkOrder.value) {
      const query = {
        pageNum: 1,
        pageSize: 200,
        keyword: keyword.value || undefined,
        deviceId: deviceId.value || undefined,
      };
      const [page, counts] = await Promise.all([
        workOrders({ ...query, status: status.value || undefined }),
        workOrderStatusCounts(query),
      ]);
      rows.value = page.records;
      statusCounts.value = counts;
      await openRoutedWorkOrder();
    } else {
      const [planPage, taskPage] = await Promise.all([
        inspectionPlans({ pageNum: 1, pageSize: 200 }),
        inspectionTasks({
          pageNum: 1,
          pageSize: 200,
          taskDate: taskDate.value || undefined,
          status: status.value || undefined,
          deviceId: deviceId.value || undefined,
        }),
      ]);
      plans.value = planPage.records;
      tasks.value = taskPage.records;
    }
    lastSyncedAt.value = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "运维数据读取失败";
  } finally {
    loading.value = false;
  }
}
async function loadLookups() {
  try {
    const [orgOptions, deviceOptions] = await Promise.all([
      resourceOptions("orgs"),
      resourceOptions("devices"),
    ]);
    orgs.value = orgOptions;
    devices.value = deviceOptions;
  } catch {
    /* lookup failure is shown only when a form needs it */
  }
}
function openWorkOrder() {
  Object.assign(workForm, {
    orgId: "",
    deviceId: "",
    title: "",
    description: "",
    priority: "P2",
    slaDueTime: "",
  });
  dialog.value = true;
}
async function saveWorkOrder() {
  try {
    await createWorkOrder({
      orgId: Number(workForm.orgId),
      deviceId: workForm.deviceId ? Number(workForm.deviceId) : undefined,
      title: workForm.title,
      description: workForm.description,
      priority: workForm.priority,
      slaDueTime: workForm.slaDueTime || undefined,
    });
    dialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "创建工单失败";
  }
}
function nextAction(row: RecordRow) {
  const current = String(row.status);
  if (current === "PENDING" && canAction("ops:workorder:assign"))
    return { label: "分派", action: "assign" };
  if (current === "ASSIGNED" && canAction("ops:workorder:accept"))
    return { label: "确认接单", action: "accept" };
  if (current === "ACCEPTED" && canAction("ops:workorder:execute"))
    return { label: "登记到场", action: "arrive" };
  if (current === "PROCESSING" && canAction("ops:workorder:execute"))
    return { label: "提交处理", action: "complete" };
  if (current === "VERIFYING" && canAction("ops:workorder:verify"))
    return { label: "验收关闭", action: "verify" };
  return null;
}
function flowAction(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase()
  return ({
    CREATE: '创建', CREATED: '已创建', ASSIGN: '分派', ACCEPT: '接单', ARRIVE: '到场',
    COMPLETE: '提交处理', VERIFY: '验收关闭', CANCEL: '取消', CLOSE: '关闭',
  } as Record<string, string>)[normalized] || String(value || '—')
}
function flowStatus(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase()
  return ({ PENDING: '待分派', ASSIGNED: '已分派', ACCEPTED: '已接单', PROCESSING: '处理中', VERIFYING: '待验收', CLOSED: '已关闭', CANCELLED: '已取消', CREATE: '创建', CREATED: '已创建' } as Record<string, string>)[normalized] || String(value || '—')
}
async function runDirect(row: RecordRow, action: string) {
  try {
    await workOrderAction(row.id, action, {});
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "工单流转失败";
  }
}
async function loadAssignees() {
  if (!activeOrder.value?.org_id) return;
  try {
    assignees.value = await operationAssignees({
      orgId: activeOrder.value.org_id,
      keyword: assigneeKeyword.value || undefined,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "处理人读取失败";
  }
}
async function openAction(row: RecordRow, action: string) {
  activeOrder.value = row;
  activeAction.value = action;
  Object.assign(actionForm, {
    assigneeUserId: "",
    note: "",
    causeCategory: "",
  });
  assigneeKeyword.value = "";
  assignees.value = [];
  actionDialog.value = true;
  if (action === "assign") await loadAssignees();
}
async function submitAction() {
  if (!activeOrder.value) return;
  try {
    const body: RecordRow = {};
    if (activeAction.value === "assign")
      body.assigneeUserId = Number(actionForm.assigneeUserId);
    if (activeAction.value === "complete") {
      body.solution = actionForm.note;
      body.causeCategory = actionForm.causeCategory || undefined;
    }
    if (activeAction.value === "verify") body.verifyRemark = actionForm.note;
    if (activeAction.value === "cancel") body.remark = actionForm.note;
    await workOrderAction(activeOrder.value.id, activeAction.value, body);
    actionDialog.value = false;
    await load();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "工单流转失败，请刷新后确认最新状态";
  }
}
async function openDetail(row: RecordRow) {
  try {
    selectedOrder.value = await workOrder(row.id);
    detailOpen.value = true;
    detailMoreOpen.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "工单详情读取失败";
  }
}
async function openRoutedWorkOrder() {
  const raw = route.query.workOrderId;
  const id = String(Array.isArray(raw) ? raw[0] || "" : raw || "");
  if (!id || openedRouteWorkOrderId.value === id) return;
  openedRouteWorkOrderId.value = id;
  await openDetail({ id });
}
function checklistUid() {
  return `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function parseChecklist(value: unknown): ChecklistItem[] {
  try {
    const raw = typeof value === "string" ? JSON.parse(value || "[]") : value;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (typeof item === "string")
          return {
            uid: checklistUid(),
            title: item,
            instruction: "",
            required: true,
          };
        return {
          uid: checklistUid(),
          title: String(item?.title || ""),
          instruction: String(item?.instruction || ""),
          required: item?.required !== false,
        };
      })
      .filter((item) => item.title);
  } catch {
    return [];
  }
}
function addChecklistItem() {
  planForm.checklistItems.push({
    uid: checklistUid(),
    title: "",
    instruction: "",
    required: true,
  });
}
function removeChecklistItem(index: number) {
  planForm.checklistItems.splice(index, 1);
}
function moveChecklistItem(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= planForm.checklistItems.length) return;
  const [item] = planForm.checklistItems.splice(index, 1);
  if (item) planForm.checklistItems.splice(target, 0, item);
}
async function loadPlanAssignees() {
  if (!planForm.orgId) {
    planAssignees.value = [];
    return;
  }
  try {
    planAssignees.value = await inspectionAssignees({
      orgId: planForm.orgId,
      keyword: planAssigneeKeyword.value || undefined,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "巡检负责人读取失败";
  }
}
async function onPlanOrgChange() {
  planForm.scopeId = "";
  planForm.assigneeUserId = "";
  planAssigneeKeyword.value = "";
  await loadPlanAssignees();
}
async function openPlan(row?: RecordRow) {
  Object.assign(planForm, {
    id: Number(row?.id || 0),
    planNo: String(row?.plan_no || ""),
    planName: String(row?.plan_name || ""),
    orgId: String(row?.org_id || ""),
    scopeType: String(row?.scope_type || "ORG"),
    scopeId: String(row?.scope_id || ""),
    cycleDays: Number(row?.cycle_days || 1),
    deadlineHour: Number(row?.deadline_hour || 18),
    assigneeUserId: String(row?.assignee_user_id || ""),
    checklistItems: parseChecklist(row?.checklist_json),
    enabled: Number(row?.enabled ?? 1),
    remark: String(row?.remark || ""),
  });
  planAssigneeKeyword.value = "";
  planDialog.value = true;
  await loadPlanAssignees();
}
async function savePlan() {
  if (planForm.checklistItems.some((item) => !item.title.trim())) {
    error.value = "请填写每一个巡检检查项的名称，或删除空白检查项";
    return;
  }
  try {
    await saveInspectionPlan(
      {
        planNo: planForm.planNo || undefined,
        planName: planForm.planName,
        orgId: Number(planForm.orgId),
        scopeType: planForm.scopeType,
        scopeId:
          planForm.scopeType === "DEVICE"
            ? Number(planForm.scopeId)
            : undefined,
        cycleDays: planForm.cycleDays,
        deadlineHour: planForm.deadlineHour,
        assigneeUserId: planForm.assigneeUserId
          ? Number(planForm.assigneeUserId)
          : undefined,
        checklistJson: JSON.stringify(
          planForm.checklistItems.map((item) => ({
            title: item.title.trim(),
            instruction: item.instruction.trim() || undefined,
            required: item.required,
          })),
        ),
        enabled: planForm.enabled,
        remark: planForm.remark,
      },
      planForm.id || undefined,
    );
    planDialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存巡检计划失败";
  }
}
async function generate() {
  try {
    await generateInspectionTasks(taskDate.value);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "生成巡检任务失败";
  }
}
function openInspection(row: RecordRow, result: "NORMAL" | "ABNORMAL") {
  activeInspection.value = row;
  inspectionForm.result = result;
  inspectionForm.remark = "";
  inspectionDialog.value = true;
}
async function submitInspection() {
  if (!activeInspection.value) return;
  try {
    await executeInspection(activeInspection.value.id, {
      result: inspectionForm.result,
      resultRemark: inspectionForm.remark,
    });
    inspectionDialog.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "提交巡检结果失败";
  }
}
function syncRouteFilters() {
  const value = route.query.deviceId;
  deviceId.value = Array.isArray(value)
    ? String(value[0] || "")
    : String(value || "");
  if (!route.query.workOrderId) openedRouteWorkOrderId.value = "";
}

watch(
  () => route.fullPath,
  () => {
    syncRouteFilters();
    void load();
  },
);
onMounted(async () => {
  syncRouteFilters();
  await Promise.all([load(), loadLookups()]);
});
</script>

<template>
  <section class="view-page operations-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">OPERATIONS · SLA · TRACE</p>
        <h1>运维工作台</h1>
      </div>
    </header>
    <p v-if="error" class="form-tip">{{ error }}</p>
    <div class="operations-tabs">
      <button
        :class="{ active: isWorkOrder }"
        @click="setWorkspace('work-orders')"
      >
        工单处置</button
      ><button
        :class="{ active: !isWorkOrder }"
        @click="setWorkspace('inspections')"
      >
        巡检中心</button
      ><span v-if="lastSyncedAt">最近刷新 · {{ lastSyncedAt }}</span>
    </div>

    <template v-if="isWorkOrder">
      <section class="order-list-workbench">
        <nav class="order-status-tabs">
          <button
            v-for="item in statusTabs"
            :key="item.value"
            :class="[{ active: status === item.value }, statusTone(item.value)]"
            @click="
              status = item.value;
              load();
            "
          >
            <i></i><span>{{ item.label }}</span
            ><em>{{ countStatus(item.value) }}</em>
          </button>
        </nav>
        <div class="order-query-bar">
          <label class="archive-search-box"
            ><Search :size="15" /><input
              v-model.trim="keyword"
              placeholder="搜索工单编号、标题或设备"
              @keyup.enter="load" /></label
          ><AppSelect v-model="deviceId" @change="load">
            <option value="">全部设备</option>
            <option
              v-for="device in devices"
              :key="String(device.id)"
              :value="String(device.id)"
            >
              {{ device.device_name || device.device_sn }}
            </option></AppSelect><button
            class="icon-btn bare-icon"
            title="重置"
            aria-label="重置"
            @click="clearFilters"
          >
            <RotateCcw :size="16" /></button
          ><small v-if="selectedDeviceName"
            >当前设备：{{ selectedDeviceName }}</small
          ><button
            v-if="session.can('ops:workorder:create')"
            class="btn-primary order-create-action"
            @click="openWorkOrder"
          >
            + 新建人工工单
          </button>
        </div>
        <div class="order-table-head">
          <span>工单信息</span><span>建议处置</span><span>优先级 / SLA</span
          ><span>处理阶段</span><span>责任人</span><span>操作</span>
        </div>
        <AppLoadingState v-if="loading" />
        <div v-else class="order-table-body">
          <article
            v-for="row in visibleWorkRows"
            :key="String(row.id)"
            class="order-table-row"
            :class="{ overdue: isSlaOverdue(row) }"
          >
            <div class="order-identity">
              <small>{{ row.work_order_no }}</small
              ><strong>{{ workOrderTitle(row) }}</strong
              ><span>{{
                row.device_name || row.device_sn || "未关联设备"
              }}</span>
            </div>
            <div class="order-suggestion">
              <Lightbulb :size="15" /><span
                ><b>{{
                  row.alarm_rule_name ||
                  (row.alarm_id ? "关联设备告警" : "人工报修")
                }}</b
                ><small>{{
                  row.alarm_suggestion ||
                  "根据问题描述完成现场诊断并记录处理结果"
                }}</small></span
              >
            </div>
            <div class="order-sla">
              <b
                class="priority"
                :class="String(row.priority || 'P2').toLowerCase()"
                >{{ row.priority || "P2" }}</b
              ><span :class="{ danger: isSlaOverdue(row) }">{{
                isSlaOverdue(row) ? "SLA已超时" : formatTime(row.sla_due_time)
              }}</span
              ><small v-if="Number(row.escalation_level || 0)"
                >已升级 L{{ row.escalation_level }}</small
              >
            </div>
            <div
              class="order-progress"
              :class="{ cancelled: String(row.status) === 'CANCELLED' }"
            >
              <template v-for="(stage, index) in stages" :key="stage.key"
                ><div
                  class="progress-stage"
                  :class="{
                    reached: stageReached(row, index),
                    current: stageIndex(row) === index,
                  }"
                >
                  <i><Check v-if="stageReached(row, index)" :size="10" /></i
                  ><span>{{ stage.label }}</span>
                </div>
                <b
                  v-if="index < stages.length - 1"
                  :class="{ reached: stageReached(row, index + 1) }"
                ></b
              ></template>
              <em v-if="String(row.status) === 'CANCELLED'">工单已取消</em>
            </div>
            <div class="order-owner">
              <UserRound :size="16" /><span
                ><b>{{ row.assignee_name || "待分派" }}</b
                ><small>{{
                  row.assign_time
                    ? `分派于 ${formatTime(row.assign_time)}`
                    : "尚未确定责任人"
                }}</small></span
              >
            </div>
            <div class="order-row-actions">
              <button class="icon-btn" title="详情" @click="openDetail(row)">
                <Eye :size="16" /></button
              ><button
                v-if="
                  ['accept', 'arrive'].includes(String(nextAction(row)?.action))
                "
                class="link-btn"
                @click="runDirect(row, String(nextAction(row)?.action))"
              >
                {{ nextAction(row)?.label }}</button
              ><button
                v-else-if="String(nextAction(row)?.action) === 'assign'"
                class="icon-btn order-action-icon"
                title="分派处理人"
                aria-label="分派处理人"
                @click="openAction(row, 'assign')"
              >
                <UserPlus :size="16" /></button
              ><button
                v-else-if="String(nextAction(row)?.action) === 'verify'"
                class="icon-btn order-action-icon"
                title="验收关闭"
                aria-label="验收关闭"
                @click="openAction(row, 'verify')"
              >
                <Check :size="16" /></button
              ><button
                v-else-if="nextAction(row)"
                class="link-btn"
                @click="openAction(row, String(nextAction(row)?.action))"
              >
                {{ nextAction(row)?.label }}</button
              ><button
                v-if="
                  ['PENDING', 'ASSIGNED'].includes(String(row.status)) &&
                  canAction('ops:workorder:cancel')
                "
                class="icon-btn order-action-icon danger-text"
                title="取消工单"
                aria-label="取消工单"
                @click="openAction(row, 'cancel')"
              >
                <CircleX :size="16" />
              </button>
            </div>
          </article>
          <p v-if="!rows.length" class="empty-state">
            当前筛选条件下没有工单。
          </p>
        </div>
        <footer v-if="rows.length" class="table-pagination work-order-pagination"><span class="work-order-total">共 {{ rows.length }} 张工单</span><button class="quiet" :disabled="workPage <= 1" @click="workPage--">上一页</button><button v-for="item in workPageWindow" :key="item" class="page-number" :class="{ active: item === workPage }" @click="workPage = item">{{ item }}</button><button class="quiet" :disabled="workPage >= workPageCount" @click="workPage++">下一页</button></footer>
      </section>
    </template>

    <template v-else>
      <section class="inspection-center-shell">
        <nav class="inspection-subtabs">
          <button
            :class="{ active: inspectionView === 'tasks' }"
            @click="inspectionView = 'tasks'"
          >
            <ListChecks :size="15" />当天巡检任务
          </button>
          <button
            :class="{ active: inspectionView === 'plans' }"
            @click="inspectionView = 'plans'"
          >
            <ClipboardList :size="15" />巡检计划
          </button>
        </nav>
        <div
          v-if="inspectionView === 'tasks'"
          class="operations-workbench inspection-task-workbench"
        >
          <aside class="operations-sidebar">
            <div class="inspection-score">
              <span>今日待巡检</span><b>{{ inspectionPendingCount }}</b
              ><small>共 {{ tasks.length }} 项任务</small>
            </div>
            <label class="operations-field"
              ><span>任务日期</span
              ><input v-model="taskDate" type="date" @change="load"
            /></label>
            <label class="operations-field"
              ><span>设备范围</span
              ><AppSelect v-model="deviceId" @change="load">
                <option value="">全部设备</option>
                <option
                  v-for="device in devices"
                  :key="String(device.id)"
                  :value="String(device.id)"
                >
                  {{ device.device_name || device.device_sn }}
                </option>
              </AppSelect></label
            >
            <button
              v-if="session.can('ops:inspection:edit')"
              class="inspection-generate-orb"
              title="生成当天巡检任务"
              @click="generate"
            >
              <ListChecks :size="23" /><span>生成任务</span>
            </button>
          </aside>
          <section class="operations-main inspection-task-main">
            <section class="inspection-task-section">
              <div class="inspection-task-head">
                <div>
                  <p class="eyebrow">TODAY'S CHECKLIST</p>
                  <h2>当天巡检任务</h2>
                </div>
                <span>{{ tasks.length }} 项</span>
              </div>
              <div class="inspection-task-grid">
                <article
                  v-for="task in tasks"
                  :key="String(task.id)"
                  class="inspection-task-card"
                  :class="String(task.status || '').toLowerCase()"
                >
                  <div>
                    <span class="inspection-status">{{
                      task.status || "PENDING"
                    }}</span
                    ><small>{{ task.task_no }}</small>
                  </div>
                  <h3>{{ task.device_name || task.device_sn }}</h3>
                  <p>{{ task.plan_name }}</p>
                  <dl>
                    <div>
                      <dt>执行人</dt>
                      <dd>{{ task.assignee_name || "待领取" }}</dd>
                    </div>
                    <div>
                      <dt>完成时限</dt>
                      <dd>{{ formatTime(task.due_time) }}</dd>
                    </div>
                  </dl>
                  <div
                    v-if="
                      task.status === 'PENDING' &&
                      session.can('ops:inspection:operate')
                    "
                    class="inspection-task-actions"
                  >
                    <button
                      class="primary"
                      @click="openInspection(task, 'NORMAL')"
                    >
                      确认正常</button
                    ><button
                      class="quiet danger-text"
                      @click="openInspection(task, 'ABNORMAL')"
                    >
                      发现异常
                    </button>
                  </div>
                </article>
                <p v-if="!tasks.length" class="empty-state">
                  当前日期没有巡检任务。
                </p>
              </div>
            </section>
          </section>
        </div>
        <section v-else class="inspection-plan-page">
          <header class="inspection-plan-head">
            <div>
              <p class="eyebrow">INSPECTION PLAN</p>
              <h2>巡检计划</h2>
            </div>
            <div>
              <button
                class="icon-btn bare-icon"
                :disabled="loading"
                title="刷新巡检计划"
                aria-label="刷新巡检计划"
                @click="load"
              >
                <RefreshCw :size="16" :class="{ spinning: loading }" /></button
              ><button
                v-if="session.can('ops:inspection:edit')"
                class="quiet"
                @click="openPlan()"
              >
                + 新增巡检计划
              </button>
            </div>
          </header>
          <AppDataTable
            :page-size="10"
            class="inspection-plan-table"
            :columns="planColumns"
            :rows="plans"
            :loading="loading"
            :error="error"
            ><template #actions="{ row }"
              ><button
                v-if="session.can('ops:inspection:edit')"
                class="link-btn"
                @click="openPlan(row)"
              >
                编辑计划
              </button></template
            ></AppDataTable
          >
        </section>
      </section>
    </template>

    <AppDialog
      :open="detailOpen"
      title="工单详情与流转记录"
      dialog-class="center-detail-dialog work-order-detail-dialog"
      :hide-actions="true"
      @update:open="detailOpen = $event"
      ><template v-if="selectedOrder"
        ><div class="order-detail-progress">
          <div
            v-for="(stage, index) in stages"
            :key="stage.key"
            :class="{ reached: stageReached(selectedOrder, index) }"
          >
            <i><Check v-if="stageReached(selectedOrder, index)" :size="12" /></i
            ><span>{{ stage.label }}</span>
          </div>
        </div>
        <dl class="detail-grid">
          <dt>工单编号</dt>
          <dd>{{ selectedOrder.work_order_no }}</dd>
          <dt>工单标题</dt>
          <dd>{{ workOrderTitle(selectedOrder) }}</dd>
          <dt>处理人</dt>
          <dd>{{ selectedOrder.assignee_name || "待分派" }}</dd>
          <dt>SLA时限</dt>
          <dd>{{ formatTime(selectedOrder.sla_due_time) }}</dd>
          <dt>故障原因</dt>
          <dd>{{ selectedOrder.cause_category || "—" }}</dd>
          <dt>处理方案</dt>
          <dd>{{ selectedOrder.solution || "—" }}</dd>
        </dl>
        <section class="work-order-timeline">
          <h3>流转记录</h3>
          <article v-for="item in detailLogs" :key="String(item.id)">
            <i></i>
            <div>
              <b>{{ flowAction(item.action) }}</b
              ><span
                >{{ flowStatus(item.from_status || "CREATE") }} <ChevronRight :size="12" />
                {{ flowStatus(item.to_status) }}</span
              ><small
                >{{ item.operator_name || "system" }} ·
                {{ formatTime(item.action_time) }}</small
              >
              <p v-if="item.content">{{ item.content }}</p>
            </div>
          </article>
        </section>
        <div class="modal-action-row">
          <button class="quiet" @click="detailMoreOpen = true">
            查看完整工单信息
          </button>
        </div>
      </template></AppDialog
    >
    <AppDialog
      :open="detailMoreOpen"
      title="工单完整信息"
      dialog-class="center-detail-dialog secondary-detail-dialog"
      :hide-actions="true"
      @update:open="detailMoreOpen = $event"
    >
      <dl class="detail-grid full-detail-grid">
        <template v-for="item in workOrderFullDetails" :key="item[0]"
          ><dt>{{ item[0] }}</dt>
          <dd>{{ item[1] }}</dd></template
        >
      </dl>
    </AppDialog>
    <AppDialog
      v-model:open="dialog"
      title="新建人工运维工单"
      @submit="saveWorkOrder"
      ><div class="dialog-fields">
        <label class="dialog-field"
          ><span>所属组织*</span
          ><AppSelect v-model="workForm.orgId" required>
            <option value="">请选择</option>
            <option
              v-for="org in orgs"
              :key="String(org.id)"
              :value="String(org.id)"
            >
              {{ org.org_name }}
            </option>
          </AppSelect></label
        ><label class="dialog-field"
          ><span>关联设备</span
          ><AppSelect v-model="workForm.deviceId">
            <option value="">无</option>
            <option
              v-for="device in devices"
              :key="String(device.id)"
              :value="String(device.id)"
            >
              {{ device.device_name || device.device_sn }}
            </option>
          </AppSelect></label
        ><label class="dialog-field"
          ><span>优先级</span
          ><AppSelect v-model="workForm.priority">
            <option>P1</option>
            <option>P2</option>
            <option>P3</option>
          </AppSelect></label
        ><label class="dialog-field"
          ><span>SLA时限</span
          ><input
            v-model="workForm.slaDueTime"
            type="datetime-local"
            placeholder="留空按策略计算" /></label
        ><label class="dialog-field full"
          ><span>工单标题*</span
          ><input v-model="workForm.title" required /></label
        ><label class="dialog-field full"
          ><span>问题说明</span
          ><textarea v-model="workForm.description"></textarea>
        </label></div
    ></AppDialog>
    <AppDialog
      v-model:open="actionDialog"
      :title="actionTitle"
      @submit="submitAction"
      ><div class="dialog-fields operations-action-fields">
        <template v-if="activeAction === 'assign'"
          ><div class="archive-search-row full assignee-search-row">
            <label class="archive-search-box"
              ><Search :size="15" /><input
                v-model.trim="assigneeKeyword"
                placeholder="搜索姓名、账号或手机号"
                @keyup.enter="loadAssignees" /></label
            ><button
              v-if="assigneeKeyword"
              type="button"
              class="icon-btn bare-icon"
              title="清空"
              aria-label="清空"
              @click="
                assigneeKeyword = '';
                loadAssignees();
              "
            >
              <X :size="15" />
            </button>
          </div>
          <div class="assignee-grid full">
            <button
              v-for="person in assignees"
              :key="String(person.id)"
              type="button"
              :class="{
                selected: actionForm.assigneeUserId === String(person.id),
              }"
              @click="actionForm.assigneeUserId = String(person.id)"
            >
              <i>{{
                String(person.nickname || person.username || "?").slice(0, 1)
              }}</i
              ><span
                ><b>{{ person.nickname || person.username }}</b
                ><small
                  >{{ person.orgName || person.username }} ·
                  {{ person.phone || "未留电话" }}</small
                ></span
              ><em v-if="actionForm.assigneeUserId === String(person.id)"
                >已选择</em
              >
            </button>
            <p v-if="!assignees.length" class="empty-state">
              该组织暂无具备接单/执行权限的人员。
            </p>
          </div></template
        ><label v-if="activeAction === 'complete'" class="dialog-field"
          ><span>故障原因分类</span
          ><AppSelect v-model="actionForm.causeCategory">
            <option value="">请选择</option>
            <option>设备故障</option>
            <option>线路异常</option>
            <option>通信异常</option>
            <option>配置问题</option>
            <option>现场环境</option>
            <option>其他</option>
          </AppSelect></label
        ><label
          v-if="['complete', 'verify', 'cancel'].includes(activeAction)"
          class="dialog-field full"
          ><span>{{
            activeAction === "complete"
              ? "处理方案与结果*"
              : activeAction === "verify"
                ? "验收说明*"
                : "取消原因*"
          }}</span
          ><textarea v-model="actionForm.note" required></textarea>
        </label></div
    ></AppDialog>
    <AppDialog
      v-model:open="inspectionDialog"
      :title="
        inspectionForm.result === 'ABNORMAL' ? '登记巡检异常' : '确认巡检正常'
      "
      @submit="submitInspection"
      ><div class="dialog-fields">
        <label class="dialog-field full"
          ><span>巡检说明</span
          ><textarea
            v-model="inspectionForm.remark"
            :required="inspectionForm.result === 'ABNORMAL'"
          ></textarea>
        </label></div
    ></AppDialog>
    <AppDialog
      v-model:open="planDialog"
      dialog-class="inspection-plan-dialog"
      :title="planForm.id ? '编辑巡检计划' : '新建巡检计划'"
      @submit="savePlan"
      ><div class="dialog-fields">
        <label class="dialog-field"
          ><span>计划编号</span
          ><input v-model="planForm.planNo" placeholder="留空自动生成" /></label
        ><label class="dialog-field"
          ><span>计划名称*</span
          ><input v-model="planForm.planName" required /></label
        ><label class="dialog-field"
          ><span>组织*</span
          ><AppSelect v-model="planForm.orgId" @change="onPlanOrgChange">
            <option value="">请选择</option>
            <option
              v-for="org in orgs"
              :key="String(org.id)"
              :value="String(org.id)"
            >
              {{ org.org_name }}
            </option>
          </AppSelect></label
        ><label class="dialog-field"
          ><span>范围</span
          ><AppSelect v-model="planForm.scopeType">
            <option value="ORG">组织内全部设备</option>
            <option value="DEVICE">指定设备</option>
          </AppSelect></label
        ><label v-if="planForm.scopeType === 'DEVICE'" class="dialog-field"
          ><span>设备*</span
          ><AppSelect v-model="planForm.scopeId">
            <option value="">请选择</option>
            <option
              v-for="device in filteredDevices"
              :key="String(device.id)"
              :value="String(device.id)"
            >
              {{ device.device_name || device.device_sn }}
            </option>
          </AppSelect></label
        ><div class="dialog-field full inspection-assignee-field">
          <span>巡检负责人</span>
          <div class="archive-search-row assignee-search-row">
            <label class="archive-search-box"
              ><Search :size="15" /><input
                v-model.trim="planAssigneeKeyword"
                placeholder="搜索姓名、账号或手机号"
                @keyup.enter.prevent="loadPlanAssignees" /></label
            ><button
              v-if="planAssigneeKeyword"
              type="button"
              class="icon-btn bare-icon"
              title="清空搜索"
              aria-label="清空搜索"
              @click="
                planAssigneeKeyword = '';
                loadPlanAssignees();
              "
            >
              <X :size="15" />
            </button>
          </div>
          <div class="assignee-grid plan-assignee-grid">
            <button
              v-for="person in planAssignees"
              :key="String(person.id)"
              type="button"
              :class="{
                selected: planForm.assigneeUserId === String(person.id),
              }"
              @click="planForm.assigneeUserId = String(person.id)"
            >
              <i>{{
                String(person.nickname || person.username || "?").slice(0, 1)
              }}</i
              ><span
                ><b>{{ person.nickname || person.username }}</b
                ><small
                  >{{ person.orgName || person.username }} ·
                  {{ person.phone || "未留电话" }}</small
                ></span
              ><em v-if="planForm.assigneeUserId === String(person.id)"
                >负责人</em
              >
            </button>
            <p v-if="planForm.orgId && !planAssignees.length" class="empty-state">
              当前组织暂无具备巡检执行权限的人员。
            </p>
          </div>
          <button
            v-if="planForm.assigneeUserId"
            type="button"
            class="clear-link"
            @click="planForm.assigneeUserId = ''"
          >
            清除负责人
          </button>
        </div
        ><label class="dialog-field"
          ><span>周期（天）</span
          ><input
            v-model.number="planForm.cycleDays"
            type="number"
            min="1"
            max="365" /></label
        ><label class="dialog-field"
          ><span>截止时点</span
          ><input
            v-model.number="planForm.deadlineHour"
            type="number"
            min="0"
            max="23" /></label
        ><label class="dialog-field"
          ><span>计划状态</span
          ><AppSelect v-model.number="planForm.enabled">
            <option :value="1">启用</option>
            <option :value="0">停用</option>
          </AppSelect></label
        ><div class="dialog-field full inspection-checklist-editor">
          <header>
            <span>巡检检查项</span
            ><button
              type="button"
              class="icon-btn bare-icon"
              title="新增检查项"
              aria-label="新增检查项"
              @click="addChecklistItem"
            >
              <Plus :size="16" />
            </button>
          </header>
          <div class="inspection-checklist-list">
            <article
              v-for="(item, index) in planForm.checklistItems"
              :key="item.uid"
            >
              <strong>{{ index + 1 }}</strong>
              <div>
                <input
                  v-model="item.title"
                  placeholder="检查项名称，例如：检查接线端子温升"
                />
                <input
                  v-model="item.instruction"
                  placeholder="操作说明或合格标准（选填）"
                />
              </div>
              <label
                ><input v-model="item.required" type="checkbox" />必检</label
              >
              <div class="inspection-checklist-actions">
                <button
                  type="button"
                  class="icon-btn bare-icon"
                  :disabled="index === 0"
                  title="上移"
                  aria-label="上移"
                  @click="moveChecklistItem(index, -1)"
                >
                  <ArrowUp :size="14" /></button
                ><button
                  type="button"
                  class="icon-btn bare-icon"
                  :disabled="index === planForm.checklistItems.length - 1"
                  title="下移"
                  aria-label="下移"
                  @click="moveChecklistItem(index, 1)"
                >
                  <ArrowDown :size="14" /></button
                ><button
                  type="button"
                  class="icon-btn bare-icon danger-text"
                  title="删除检查项"
                  aria-label="删除检查项"
                  @click="removeChecklistItem(index)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </article>
            <button
              v-if="!planForm.checklistItems.length"
              type="button"
              class="inspection-checklist-empty"
              @click="addChecklistItem"
            >
              <Plus :size="17" />添加第一个检查项
            </button>
          </div>
        </div
        ><label class="dialog-field full"
          ><span>计划说明</span
          ><textarea v-model="planForm.remark"></textarea>
        </label></div
    ></AppDialog>
  </section>
</template>
