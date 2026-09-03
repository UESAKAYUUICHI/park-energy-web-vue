<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Ban, Eye, Pencil, Plus, Save, Trash2 } from "@lucide/vue";
import AppDialog from "@/components/app/AppDialog.vue";
import AppConfirmDialog from "@/components/app/AppConfirmDialog.vue";
import AppSelect from "@/components/app/AppSelect.vue";
import {
  createResource,
  deleteResource,
  billingSpaceScopeOptions,
  billingSpaceScopes,
  billingSpaceScopeDevices,
  tariffPlan,
  deleteTariffPlan,
  deviceTypePoints,
  listResource,
  replaceBillingSpaceScopes,
  rootOrgs,
  saveTariffPlan,
  tariffPlans,
  updateResource,
} from "@/api/platform";
import type { RecordRow } from "@/types/domain";
const props = defineProps<{
  open: boolean;
  mode: "spaces" | "pricing";
  contract?: RecordRow | null;
}>();
const emit = defineEmits<{ "update:open": [boolean]; saved: [] }>();
type Config = {
  deviceTypeId: string;
  pointCodes: string[];
  deviceId?: string;
  deviceName?: string;
  deviceSn?: string;
  typeName?: string;
  collapsed?: boolean;
  saved?: boolean;
};
const rows = ref<RecordRow[]>([]),
  orgs = ref<RecordRow[]>([]),
  scopeOptions = ref<RecordRow[]>([]),
  accounts = ref<RecordRow[]>([]),
  deviceTypes = ref<RecordRow[]>([]),
  tariffs = ref<RecordRow[]>([]),
  points = ref<Record<string, RecordRow[]>>({});
const error = ref(""),
  keyword = ref(""),
  status = ref(""),
  editorOpen = ref(false),
  detailOpen = ref(false),
  detail = ref<RecordRow | null>(null),
  editing = ref<RecordRow | null>(null),
  tariffOpen = ref(false),
  typeSearch = ref("");
const selectedScopes = ref<string[]>([]),
  scopeLoading = ref(false);
const pricingLoading = ref(false),
  tariffPreviewOpen = ref(false),
  tariffPreview = ref<RecordRow | null>(null);
const previewPeriods = computed<RecordRow[]>(() => Array.isArray(tariffPreview.value?.periods) ? tariffPreview.value.periods as RecordRow[] : []);
const configs = ref<Config[]>([]),
  confirmed = ref<Config[]>([]),
  deleteOpen = ref(false),
  deleteTarget = ref<RecordRow | null>(null),
  deleting = ref(false),
  actionConfirmOpen = ref(false),
  actionTarget = ref<RecordRow | null>(null),
  actionKind = ref<"disable" | "deleteTariff">("disable"),
  actionSaving = ref(false);
let errorTimer: ReturnType<typeof setTimeout> | undefined;
watch(error, (value) => {
  if (errorTimer) clearTimeout(errorTimer);
  if (value)
    errorTimer = setTimeout(() => {
      error.value = "";
    }, 3200);
});
const space = reactive({
  orgId: "",
  spaceCode: "",
  spaceName: "",
  parentId: "",
});
const price = reactive({
  accountId: "",
  ruleName: "",
  priceMode: "UNIT_PRICE",
  amount: "",
  tariffPlanId: "",
});
const tou = reactive({
  code: "",
  name: "",
  date: new Date().toISOString().slice(0, 10),
  periods: [
    {
      periodCode: "PEAK",
      periodName: "峰",
      startTime: "08:00",
      endTime: "12:00",
      unitPrice: "1.2",
      sort: 1,
    },
    {
      periodCode: "FLAT",
      periodName: "平",
      startTime: "12:00",
      endTime: "18:00",
      unitPrice: "0.8",
      sort: 2,
    },
    {
      periodCode: "VALLEY",
      periodName: "谷",
      startTime: "18:00",
      endTime: "08:00",
      unitPrice: "0.4",
      sort: 3,
    },
  ],
});
const models = [
  { value: "UNIT_PRICE", label: "按量单价", hint: "实际用量 × 单价" },
  { value: "FIXED", label: "固定金额", hint: "按账期固定收取" },
  { value: "TIME_PERIOD", label: "分时电价", hint: "按峰平谷时段核算" },
];
const scopeKey = (row: RecordRow) => `${String(row.node_type || row.nodeType).toUpperCase()}:${String(row.node_id || row.nodeId)}`;
const scopeNodeType = (row: RecordRow) => String(row.node_type || row.nodeType || "ORG").toUpperCase();
const scopeNodeId = (row: RecordRow) => String(row.node_id || row.nodeId || "");
const scopeParentId = (row: RecordRow) => String(row.parent_id || row.parentId || "");
// 映射范围是当前账号可见的组织/网关节点，不限制为计费空间的归属组织。
// space.orgId 仅用于空间的业务归属，scopeNodeId 才决定实际设备范围。
const selectableScopes = computed(() => scopeOptions.value);
const scopeTreeRows = computed(() => {
  const rows = selectableScopes.value;
  const orgs = rows.filter((row) => scopeNodeType(row) === "ORG");
  const gateways = rows.filter((row) => scopeNodeType(row) === "GATEWAY");
  const children = new Map<string, RecordRow[]>();
  orgs.forEach((row) => {
    const parent = scopeParentId(row);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(row);
  });
  gateways.forEach((row) => {
    const parent = scopeNodeId({ node_id: row.org_id || row.orgId });
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(row);
  });
  const result: Array<{ row: RecordRow; depth: number }> = [];
  const walk = (parent: string, depth: number) => {
    for (const row of children.get(parent) || []) {
      result.push({ row, depth });
      if (scopeNodeType(row) === "ORG") walk(scopeNodeId(row), depth + 1);
    }
  };
  walk("", 0);
  const added = new Set(result.map((item) => scopeKey(item.row)));
  rows.forEach((row) => {
    if (!added.has(scopeKey(row))) result.push({ row, depth: 0 });
  });
  return result;
});
const scopeDescendants = (row: RecordRow) => {
  const selected = new Set<string>();
  const all = selectableScopes.value;
  const visit = (current: RecordRow) => {
    const key = scopeKey(current);
    if (selected.has(key)) return;
    selected.add(key);
    const id = scopeNodeId(current);
    all.filter((candidate) =>
      (scopeNodeType(current) === "ORG" && scopeNodeType(candidate) === "ORG" && scopeParentId(candidate) === id) ||
      (scopeNodeType(current) === "ORG" && scopeNodeType(candidate) === "GATEWAY" && scopeNodeId({ node_id: candidate.org_id || candidate.orgId }) === id),
    ).forEach(visit);
  };
  visit(row);
  return selected;
};
const scopeSelectionCount = (row: RecordRow) => {
  const descendants = scopeDescendants(row);
  return {
    total: descendants.size,
    selected: [...descendants].filter((key) => selectedScopes.value.includes(key)).length,
  };
};
// 父节点状态由整棵子树计算，避免出现“子节点全选但父节点未选”的不一致。
const isScopeSelected = (row: RecordRow) => {
  const state = scopeSelectionCount(row);
  return state.total > 0 && state.selected === state.total;
};
const isScopePartial = (row: RecordRow) => {
  const state = scopeSelectionCount(row);
  return state.selected > 0 && state.selected < state.total;
};
function toggleScope(row: RecordRow) {
  const descendants = scopeDescendants(row);
  const shouldClear = isScopeSelected(row) || isScopePartial(row);
  const next = new Set(selectedScopes.value);
  descendants.forEach((key) => shouldClear ? next.delete(key) : next.add(key));
  selectedScopes.value = [...next];
}
const title = computed(() =>
  props.mode === "spaces"
    ? "空间管理"
    : props.contract
      ? "配置合同计价"
      : "计量与计价规则",
);
const types = computed(() => {
  const q = typeSearch.value.toLowerCase().trim();
  return q
    ? deviceTypes.value.filter((x) =>
        `${x.type_name || x.typeName} ${x.type_code || x.typeCode}`
          .toLowerCase()
          .includes(q),
      )
    : deviceTypes.value;
});
const text = (r: RecordRow, ...ks: string[]) =>
  ks.map((k) => r[k]).find((v) => v !== undefined && v !== null && v !== "") ||
  "—";
const priceNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(3) : "—";
};
const typeName = (id: string) =>
  text(
    deviceTypes.value.find((x) => String(x.id) === id) || {},
    "type_name",
    "typeName",
    "type_code",
  );
async function load() {
  try {
    const p =
      props.mode === "spaces"
        ? await listResource("archive", "spaces", {
            pageSize: 500,
            keyword: keyword.value || undefined,
            status: status.value || undefined,
          })
        : await listResource("billing", "rules", {
            pageSize: 500,
            keyword: keyword.value || undefined,
            enabled: status.value || undefined,
          });
    rows.value = p.records || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "资料加载失败";
  }
}
async function dict() {
  try {
    if (props.mode === "spaces") {
      const [rootRows, nodes] = await Promise.all([rootOrgs(), billingSpaceScopeOptions()]);
      orgs.value = rootRows;
      scopeOptions.value = nodes;
    }
    else {
      const r = await Promise.all([
        rootOrgs(),
        listResource("billing", "accounts", { pageSize: 500 }),
        listResource("archive", "device-types", { pageSize: 500 }),
        tariffPlans({ pageSize: 200, status: "ACTIVE" }),
      ]);
      orgs.value = r[0];
      accounts.value = r[1].records || [];
      deviceTypes.value = r[2].records || [];
      tariffs.value = r[3].records || [];
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "字典加载失败";
  }
}
async function loadPoints(c: Config) {
  if (!c.deviceTypeId) return;
  const r = await deviceTypePoints(c.deviceTypeId).catch(() => ({
    definitions: [],
  }));
  const d = r as RecordRow;
  const list = ((d.definitions || d.points || d.records || []) as RecordRow[]).filter((point) =>
    String(point.business_role || point.businessRole || point.point_code || point.pointCode || point.code || "").toUpperCase() === "TOTAL_ACCUMULATED",
  );
  points.value[c.deviceTypeId] = list;
  if (props.contract && !c.pointCodes.length)
    c.pointCodes = list
      .map((x) => String(x.point_code || x.code || ""))
      .filter(Boolean);
}
async function openEditor(row: RecordRow | null = null) {
  editing.value = row;
  error.value = "";
  tariffOpen.value = false;
  if (props.mode === "spaces") {
    Object.assign(space, {
      orgId: String(row?.org_id || ""),
      spaceCode: row?.space_code || "",
      spaceName: row?.space_name || "",
      parentId: String(row?.parent_id || ""),
    });
    selectedScopes.value = [];
    editorOpen.value = true;
    if (row?.id) {
      scopeLoading.value = true;
      try {
        selectedScopes.value = (await billingSpaceScopes(row.id)).map(scopeKey);
      } catch (e) {
        error.value = e instanceof Error ? e.message : "映射范围加载失败";
      } finally {
        scopeLoading.value = false;
      }
    }
    return;
  } else {
    pricingLoading.value = true;
    const c = props.contract;
    const account = (c as RecordRow | undefined)?.account as
      RecordRow | undefined;
    Object.assign(price, {
      accountId: String(row?.account_id || account?.id || c?.account_id || ""),
      ruleName:
        row?.rule_name ||
        (c ? `${c.contract_name || c.contractName}计费规则` : ""),
      priceMode: row?.price_mode || "UNIT_PRICE",
      amount: String(row?.unit_price || ""),
      tariffPlanId: String(row?.tariff_plan_id || ""),
    });
    if (c && !row) {
      const contractMeters = (c.meters || c.meterList || c.contractMeters || []) as RecordRow[];
      let meterRows = contractMeters;
      if (!meterRows.length) {
        const contractSpaces = (c.spaces || c.spaceList || c.contractSpaces || []) as RecordRow[];
        const spaceIds = contractSpaces.map((item) => Number(item.space_id || item.spaceId || item.id)).filter(Boolean);
        if (spaceIds.length) {
          try {
            meterRows = await billingSpaceScopeDevices(spaceIds);
          } catch (e) {
            error.value = e instanceof Error ? e.message : "合同设备范围加载失败";
          }
        }
      }
      configs.value = meterRows.map((m: RecordRow) => ({
        deviceId: String(m.device_id || m.deviceId || m.id || ""),
        deviceTypeId: String(m.device_type_id || m.deviceTypeId || ""),
        deviceName: String(m.device_name || m.deviceName || ""),
        deviceSn: String(m.device_sn || m.deviceSn || ""),
        typeName: String(m.type_name || m.typeName || m.type_code || m.typeCode || ""),
        pointCodes: [],
      }));
    } else configs.value = [];
    pricingLoading.value = false;
    confirmed.value = [];
  }
  editorOpen.value = true;
  configs.value.forEach((c) => void loadPoints(c));
}
async function previewTariffPlan(row: RecordRow) {
  try {
    tariffPreview.value = await tariffPlan(row.id);
    tariffPreviewOpen.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "方案详情加载失败";
  }
}
function requestTariffDelete(row: RecordRow) {
  actionKind.value = "deleteTariff";
  actionTarget.value = row;
  actionConfirmOpen.value = true;
}
async function removeTariffPlan(row: RecordRow) {
  try {
    await deleteTariffPlan(row.id);
    tariffs.value = tariffs.value.filter((item) => String(item.id) !== String(row.id));
    if (price.tariffPlanId === String(row.id)) price.tariffPlanId = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : "电价方案删除失败";
  }
}
function saveDevice(c: Config) {
  if (!c.deviceTypeId || !c.pointCodes.length) {
    error.value = "请先选择至少一个测点";
    return;
  }
  c.saved = true;
  c.collapsed = true;
  confirmed.value = [
    ...confirmed.value.filter((x) => x.deviceId !== c.deviceId),
    c,
  ];
  error.value = "";
}
async function save() {
  try {
    if (props.mode === "spaces") {
      if (!space.orgId || !space.spaceName) {
        error.value = "请选择园区并填写空间名称";
        return;
      }
      if (!selectedScopes.value.length) {
        error.value = "请至少映射一个组织或网关节点";
        return;
      }
      const b = {
        org_id: Number(space.orgId),
        space_code: space.spaceCode || `SP-${Date.now()}`,
        space_name: space.spaceName,
        parent_id: space.parentId ? Number(space.parentId) : null,
        // park_space.status 的正式取值为 VACANT/OCCUPIED/DISABLED。
        status: "VACANT",
      };
      const saved = editing.value?.id
        ? await updateResource("archive", "spaces", editing.value.id, b)
        : await createResource("archive", "spaces", b);
      const spaceId = saved.id || editing.value?.id;
      await replaceBillingSpaceScopes(spaceId, selectedScopes.value.map((key) => {
        const [scopeType, scopeNodeId] = key.split(":");
        return { scopeType, scopeNodeId: Number(scopeNodeId) };
      }));
    } else {
      const account = Number(
        price.accountId ||
          (
            (props.contract as RecordRow | undefined)?.account as
              RecordRow | undefined
          )?.id ||
          props.contract?.account_id ||
          0,
      );
      if (
        !account ||
        !price.ruleName ||
        !configs.value.length ||
        configs.value.some((c) => !c.deviceTypeId || !c.pointCodes.length)
      ) {
        error.value = "请为每台合同设备选择至少一个测点";
        return;
      }
      const grouped = configs.value.reduce(
        (a, c) => {
          const x = a.find((i) => i.deviceTypeId === Number(c.deviceTypeId));
          if (x)
            x.pointCodes = [...new Set([...x.pointCodes, ...c.pointCodes])];
          else
            a.push({
              deviceTypeId: Number(c.deviceTypeId),
              pointCodes: [...new Set(c.pointCodes)],
            });
          return a;
        },
        [] as { deviceTypeId: number; pointCodes: string[] }[],
      );
      const first = grouped[0];
      if (!first) return;
      const b = {
        account_id: account,
        rule_name: price.ruleName,
        device_type_id: first.deviceTypeId,
        metric_point_code: first.pointCodes.join(","),
        device_configs: grouped,
        billing_cycle: "MONTHLY",
        price_mode: price.priceMode,
        tariff_plan_id: price.tariffPlanId ? Number(price.tariffPlanId) : null,
        enabled: 1,
      };
      if (editing.value?.id)
        await updateResource("billing", "rules", editing.value.id, b);
      else await createResource("billing", "rules", b);
    }
    editorOpen.value = false;
    emit("update:open", false);
    emit("saved");
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  }
}
function requestDisable(row: RecordRow) {
  actionKind.value = "disable";
  actionTarget.value = row;
  actionConfirmOpen.value = true;
}
async function disable(row: RecordRow) {
  try {
    await updateResource(
      props.mode === "spaces" ? "archive" : "billing",
      props.mode === "spaces" ? "spaces" : "rules",
      row.id,
      props.mode === "spaces" ? { status: "DISABLED" } : { enabled: 0 },
    );
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "停用失败";
  }
}
async function confirmDestructiveAction() {
  if (!actionTarget.value) return;
  actionSaving.value = true;
  try {
    if (actionKind.value === "deleteTariff") await removeTariffPlan(actionTarget.value);
    else await disable(actionTarget.value);
    actionConfirmOpen.value = false;
    actionTarget.value = null;
  } finally {
    actionSaving.value = false;
  }
}
function addPeriod() {
  tou.periods.push({
    periodCode: `P${Date.now()}`,
    periodName: "新时段",
    startTime: "00:00",
    endTime: "01:00",
    unitPrice: "0",
    sort: tou.periods.length + 1,
  });
}
function removePeriod(index: number) {
  if (tou.periods.length <= 1) {
    error.value = "至少保留一个电价时段";
    return;
  }
  tou.periods.splice(index, 1);
}
function periodCovers(period: (typeof tou.periods)[number], minute: number) {
  const start = Number(period.startTime.slice(0, 2)) * 60 + Number(period.startTime.slice(3, 5));
  const end = Number(period.endTime.slice(0, 2)) * 60 + Number(period.endTime.slice(3, 5));
  return start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
async function createTou() {
  if (!tou.name) {
    error.value = "请填写方案名称";
    return;
  }
  tou.code = `TOU-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${Math.floor(Math.random() * 900 + 100)}`;
  if (tou.periods.some((period) => !period.periodName || !period.startTime || !period.endTime || Number(period.unitPrice) < 0)) {
    error.value = "请完整填写每个时段的名称、时间和单价";
    return;
  }
  if (Array.from({ length: 96 }, (_, index) => index * 15).some((minute) => !tou.periods.some((period) => periodCovers(period, minute)))) {
    error.value = "分时电价必须覆盖完整 24 小时，请检查时段是否存在空档";
    return;
  }
  try {
    const p = await saveTariffPlan({
      orgId: Number(orgs.value[0]?.id || 0),
      planCode: tou.code,
      planName: tou.name,
      effectiveStartDate: tou.date,
      periods: tou.periods,
    });
    tariffs.value.unshift(p);
    price.tariffPlanId = String(p.id);
    tariffOpen.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "分时电价方案保存失败";
  }
}
function statusLabel(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  return ["VACANT", "OCCUPIED", "ACTIVE"].includes(status)
    ? "启用"
    : ["DISABLED", "INACTIVE"].includes(status)
      ? "已停用"
      : String(value ?? "—");
}
function askDelete(row: RecordRow) {
  deleteTarget.value = row;
  deleteOpen.value = true;
}
async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await deleteResource("archive", "spaces", deleteTarget.value.id);
    deleteOpen.value = false;
    deleteTarget.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "空间删除失败";
  } finally {
    deleting.value = false;
  }
}
watch(
  () => [props.open, props.mode, props.contract?.id],
  () => {
    if (props.open) {
      // 空间状态和计价规则状态不是同一套编码，切换模块时不能沿用上一个筛选值。
      status.value = "";
      void load();
      void dict();
      if (props.contract) void openEditor();
    }
  },
  { immediate: true },
);
</script>
<template>
  <AppDialog
    :open="open"
    @update:open="(v) => emit('update:open', v)"
    :title="title"
    eyebrow="BILLING RESOURCES"
    hide-actions
    dialog-class="settlement-dialog resource-dialog"
    ><article class="manager">
      <header>
        <div>
          <b>{{
            contract
              ? "当前合同计价配置"
              : mode === "spaces"
                ? "空间列表"
                : "计量与计价规则列表"
          }}</b
          ><small>{{
            contract
              ? "设备和测点来自合同绑定范围"
              : "基础资料会被合同和账单规则引用。"
          }}</small>
        </div>
        <button v-if="!contract" class="primary" @click="openEditor()">
          <Plus :size="15" />新增
        </button>
      </header>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="!contract" class="filters">
        <input
          v-model="keyword"
          placeholder="名称、编号或规则"
          @keydown.enter="load"
        /><AppSelect v-model="status" @change="load"
          ><option value="">全部状态</option>
          <template v-if="mode === 'spaces'">
            <option value="VACANT">可用（空置）</option>
            <option value="OCCUPIED">可用（使用中）</option>
            <option value="ACTIVE">可用（历史数据）</option>
            <option value="DISABLED">已停用</option>
          </template>
          <template v-else>
            <option value="1">启用</option>
            <option value="0">停用</option>
          </template>
        </AppSelect
        ><button class="icon" @click="load"><Save :size="15" /></button>
      </div>
      <div v-if="!contract" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>模型/编码</th>
              <th>对象</th>
              <th>测点</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="String(r.id)">
              <td>
                <b>{{
                  text(
                    r,
                    mode === "spaces" ? "space_name" : "rule_name",
                    "name",
                  )
                }}</b>
              </td>
              <td>
                {{ text(r, mode === "spaces" ? "space_code" : "price_mode") }}
              </td>
              <td>
                {{
                  text(
                    r,
                    mode === "spaces" ? "parent_name" : "account_name",
                    "accountName",
                  )
                }}
              </td>
              <td>
                {{
                  text(r, mode === "spaces" ? "org_name" : "metric_point_code")
                }}
              </td>
              <td>
                {{
                  mode === "spaces"
                    ? statusLabel(r.status)
                    : r.enabled
                      ? "已启用"
                      : "已停用"
                }}
              </td>
              <td class="actions">
                <button
                  class="icon"
                  @click="
                    detail = r;
                    detailOpen = true;
                  "
                >
                  <Eye :size="15" /></button
                ><button class="icon" title="编辑" @click="openEditor(r)">
                  <Pencil :size="15" /></button
                ><button v-if="mode !== 'spaces' || !['DISABLED', 'INACTIVE'].includes(String(r.status).toUpperCase())" class="icon danger" title="停用" @click="requestDisable(r)">
                  <Ban :size="15" />
                </button><button v-else class="icon danger" title="删除已停用空间" @click="askDelete(r)">
                  <Trash2 :size="15" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="contract" class="pricing">
        <label class="field"
          ><span>规则名称</span
          ><input
            v-model="price.ruleName"
            :placeholder="`${contract.contract_name || contract.contractName}计费规则`"
        /></label>
        <div class="context">
          <b>{{ contract.contract_name || contract.contractName }}</b
          ><span>{{ pricingLoading ? "正在读取合同映射设备…" : `计价对象已锁定 · ${configs.length} 台设备` }}</span>
        </div>
        <div class="models">
          <span>计价模型</span>
          <div>
            <button
              v-for="m in models"
              :key="m.value"
              :class="{ active: price.priceMode === m.value }"
              @click="price.priceMode = m.value"
            >
              <b>{{ m.label }}</b
              ><small>{{ m.hint }}</small>
            </button>
          </div>
        </div>
        <div class="device-head"><b>合同设备与计费测点</b></div>
        <section
          v-for="(c, i) in configs"
          :key="c.deviceId || i"
          class="device"
          :class="{ collapsed: c.collapsed }"
        >
          <header>
            <div>
              <b>{{ c.deviceName || "未命名设备" }}</b
              ><small
                >{{ c.deviceSn || "无 SN" }} ·
                {{ c.typeName || typeName(c.deviceTypeId) }}</small
              >
            </div>
            <button class="icon" @click="c.collapsed = !c.collapsed">
              {{ c.collapsed ? "＋" : "−" }}
            </button>
          </header>
          <div v-if="!c.collapsed" class="points">
            <label
              v-for="p in points[c.deviceTypeId] || []"
              :key="String(p.point_code)"
              ><input
                v-model="c.pointCodes"
                type="checkbox"
                :value="p.point_code"
              /><span>{{ p.point_name || p.point_code }}</span
              ><small>{{ p.point_code }} · {{ p.unit || "—" }}</small></label
            >
            <p v-if="!points[c.deviceTypeId]?.length">
              该设备类型暂无可配置测点。
            </p>
          </div>
          <footer>
            <span>{{ c.pointCodes.join("、") || "尚未选择测点" }}</span
            ><button class="quiet" @click="saveDevice(c)">
              <Save :size="14" />保存设备配置
            </button>
          </footer>
        </section>
        <label v-if="price.priceMode !== 'TIME_PERIOD'" class="field"
          ><span
            >{{
              price.priceMode === "FIXED" ? "固定金额" : "标准单价"
            }}（RMB）</span
          ><input v-model="price.amount" type="number" min="0" step="0.0001"
        /></label>
        <div v-else class="tou">
          <span
            >分时电价方案：{{ price.tariffPlanId ? "已选择" : "未选择" }}</span
          ><button class="primary" @click="tariffOpen = !tariffOpen">
            选择 / 新建方案
          </button>
        </div>
        <div v-if="tariffOpen && price.priceMode === 'TIME_PERIOD'" class="tou-panel">
          <div class="tariff-list">
            <b>已有方案</b
            ><div
              v-for="t in tariffs"
              :key="String(t.id)"
              class="tariff-option"
              :class="{ active: price.tariffPlanId === String(t.id) }"
            >
              <button class="tariff-select" @click="price.tariffPlanId = String(t.id)">{{ t.plan_name || t.planName }}<small>{{ t.plan_code || t.planCode || "自动编码" }}</small></button>
              <span class="tariff-actions"><button class="icon" title="查看方案详情" @click.stop="previewTariffPlan(t)"><Eye :size="14" /></button><button class="icon danger" :disabled="Boolean(props.contract && String(props.contract.status || '').toUpperCase() !== 'TERMINATED')" :title="props.contract && String(props.contract.status || '').toUpperCase() !== 'TERMINATED' ? '合同终止后才可删除方案' : '删除方案'" @click.stop="requestTariffDelete(t)"><Trash2 :size="14" /></button></span>
            </div>
            <p v-if="!tariffs.length" class="picker-empty">暂无可用分时方案</p>
          </div>
          <div>
            <b>新建方案</b
            ><input v-model="tou.name"
              placeholder="方案名称"
            />
            <div v-for="(p, i) in tou.periods" :key="p.periodCode" class="period">
              <input v-model="p.periodName" /><input
                v-model="p.startTime"
                type="time"
              /><span>至</span><input v-model="p.endTime" type="time" /><input
                v-model="p.unitPrice"
                type="number"
              />
              <span>RMB</span><button class="icon danger period-remove" title="删除时段" @click="removePeriod(i)"><Trash2 :size="14" /></button>
            </div>
            <button class="quiet" @click="addPeriod">+ 添加时段</button
            ><button class="primary" @click="createTou">保存并选用</button>
          </div>
        </div>
        <footer class="dialog-actions">
          <button class="quiet" @click="emit('update:open', false)">取消</button
          ><button class="primary" @click="save">
            <Save :size="15" />保存计价规则
          </button>
        </footer>
      </div>
    </article></AppDialog
  >
  <AppDialog
    :open="tariffPreviewOpen"
    @update:open="(v) => (tariffPreviewOpen = v)"
    title="分时电价方案详情"
    hide-actions
  ><article class="tariff-preview" v-if="tariffPreview">
      <header><div><b>{{ tariffPreview.plan_name || tariffPreview.planName }}</b><small>{{ tariffPreview.plan_code || tariffPreview.planCode }} · {{ tariffPreview.org_name || "当前园区" }}</small></div><span>{{ tariffPreview.status === 'ACTIVE' ? '已启用' : '草稿/停用' }}</span></header>
      <div class="tariff-preview-meta"><span>生效日期：{{ tariffPreview.effective_start_date || tariffPreview.effectiveStartDate || '—' }}</span><span>版本：{{ tariffPreview.version || 1 }}</span></div>
      <div class="tariff-preview-periods"><div v-for="period in previewPeriods" :key="String(period.id || period.period_code || period.periodCode)"><b>{{ period.period_name || period.periodName }}</b><span>{{ String(period.start_time || period.startTime).slice(0, 5) }} - {{ String(period.end_time || period.endTime).slice(0, 5) }}</span><strong>{{ priceNumber(period.unit_price ?? period.unitPrice) }} RMB</strong></div></div>
    </article></AppDialog>
  <AppDialog
    v-if="mode === 'spaces'"
    :open="editorOpen"
    @update:open="(v) => (editorOpen = v)"
    title="新增空间"
    hide-actions
    ><article class="space-editor">
      <p v-if="error" class="error">{{ error }}</p>
      <label
        >所属园区<AppSelect v-model="space.orgId"
          ><option value="">请选择</option>
          <option v-for="o in orgs" :key="String(o.id)" :value="String(o.id)">
            {{ o.org_name }}
          </option></AppSelect
        ></label
      ><label>空间名称<input v-model="space.spaceName" /></label
      ><label
        >空间编码（可不填）<input
          v-model="space.spaceCode"
          placeholder="保存时自动生成" /></label
      ><label
        >父级空间<AppSelect v-model="space.parentId"
          ><option value="">无父级空间</option>
          <option v-for="r in rows" :key="String(r.id)" :value="String(r.id)">
            {{ r.space_name }}（{{ r.space_code }}）
          </option></AppSelect
        ></label
      >
      <section class="scope-picker">
        <header>
          <div><b>设备范围映射</b><small>选择组织或网关后，系统自动包含其下级设备</small></div>
          <span v-if="scopeLoading">读取中…</span>
          <span v-else>已选 {{ selectedScopes.length }} 项</span>
        </header>
        <div class="scope-options">
          <label v-for="item in scopeTreeRows" :key="scopeKey(item.row)" class="scope-option" :style="{ paddingLeft: `${10 + item.depth * 22}px` }">
            <input :checked="isScopeSelected(item.row)" :indeterminate="isScopePartial(item.row)" type="checkbox" @change="toggleScope(item.row)" @click.stop />
            <span><b>{{ scopeNodeType(item.row) === 'GATEWAY' ? '⌁ ' : item.depth ? '└ ' : '▾ ' }}{{ item.row.display_name || item.row.node_name || item.row.nodeName || item.row.name }}</b><small>{{ scopeNodeType(item.row) === 'GATEWAY' ? '网关节点' : '组织节点' }}</small></span>
          </label>
          <p v-if="!selectableScopes.length">当前账号没有可用的组织或网关节点。</p>
        </div>
      </section>
      <footer class="dialog-actions">
        <button class="quiet" @click="editorOpen = false">取消</button
        ><button class="primary" @click="save">保存空间</button>
      </footer>
    </article></AppDialog
  >
  <AppDialog
    :open="detailOpen"
    @update:open="(v) => (detailOpen = v)"
    title="资料详情"
    hide-actions
    ><article class="detail">
      <div v-for="(v, k) in detail" :key="k">
        <b>{{ k }}</b
        ><span>{{ String(v ?? "—") }}</span>
      </div>
    </article></AppDialog
  >
  <AppConfirmDialog
    v-model:open="deleteOpen"
    title="删除已停用空间"
    message="删除后空间档案将无法恢复。只有未被设备、合同、子空间或告警规则引用的空间才允许删除。"
    :loading="deleting"
    confirm-text="确认删除"
    @confirm="confirmDelete"
  />
  <AppConfirmDialog
    v-model:open="actionConfirmOpen"
    :title="actionKind === 'disable' ? '确认停用' : '删除电价方案'"
    :message="actionKind === 'disable' ? '停用后该资料不再用于后续结算，历史业务记录不受影响。确认继续吗？' : '删除后分时电价方案及其时段配置将无法恢复。确认继续吗？'"
    :loading="actionSaving"
    :confirm-text="actionKind === 'disable' ? '确认停用' : '确认删除'"
    @confirm="confirmDestructiveAction"
  />
</template>
<style scoped>
.space-editor {
  display: grid;
  gap: 14px;
  padding: 22px 28px;
}
.space-editor label {
  display: grid;
  gap: 6px;
  color: #687884;
  font-size: 12px;
}
.space-editor input,
.space-editor select {
  min-height: 38px;
  border: 1px solid #d9e1e6;
  border-radius: 5px;
  padding: 7px;
}
.scope-picker {
  border: 1px solid #dbe6ec;
  border-radius: 10px;
  padding: 14px;
  background: #f8fbfc;
}
.scope-picker > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #345466;
}
.scope-picker header small,
.scope-option small {
  display: block;
  margin-top: 3px;
  color: #8797a0;
  font-size: 11px;
}
.scope-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  max-height: 190px;
  overflow: auto;
  scrollbar-width: none;
}
.scope-options::-webkit-scrollbar { display: none; }
.scope-option {
  display: flex !important;
  grid-template-columns: none !important;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #e0e9ed;
  border-radius: 8px;
  background: #fff;
  color: #2b4756 !important;
}
.scope-option input { min-height: auto !important; width: 15px; height: 15px; }
.scope-option input:indeterminate { accent-color: #4b879b; }
.scope-option span { min-width: 0; overflow: hidden; }
.scope-option b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.manager {
  padding: 22px 28px;
}
.manager > header,
.filters,
.device-head,
.device > header,
.device > footer,
.tou,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.manager > header {
  margin-bottom: 18px;
}
.manager small,
.context span,
.device small {
  display: block;
  color: #8794a0;
  margin-top: 5px;
}
.error {
  padding: 10px;
  background: #fff1ec;
  color: #a34730;
}
.filters {
  margin-bottom: 15px;
}
.filters input,
.field input,
.tou-panel input {
  min-height: 38px;
  border: 1px solid #d9e1e6;
  border-radius: 5px;
  padding: 7px;
}
.filters input {
  min-width: 280px;
}
.icon {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  display: inline-grid;
  place-items: center;
  color: #577080;
}
.status-text { color: #2d6f4d; }
.status-text.inactive { color: #8a5a36; }
.danger {
  color: #ad5a4c;
}
.table-wrap {
  overflow: auto;
}
table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
}
th,
td {
  padding: 13px;
  border-bottom: 1px solid #edf1f4;
  text-align: left;
  font-size: 13px;
}
th {
  color: #7b8994;
  font-size: 12px;
}
.actions {
  white-space: nowrap;
}
.pricing {
  display: grid;
  gap: 17px;
}
.field {
  display: grid;
  gap: 6px;
  color: #687884;
  font-size: 12px;
}
.context {
  padding: 12px 14px;
  border: 1px solid #dbe8ed;
  background: #f4fafb;
  border-radius: 8px;
}
.context b {
  color: #2c687d;
}
.models {
  display: grid;
  gap: 8px;
  color: #687884;
  font-size: 12px;
}
.models > div {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.models button {
  min-height: 70px;
  text-align: left;
  padding: 12px;
  border: 1px solid #dfe7ed;
  border-radius: 8px;
  background: #fff;
  color: #425d70;
}
.models button.active {
  border-color: #3a8ca5;
  background: #eff9fb;
}
.models small,
.models b {
  display: block;
}
.device {
  padding: 14px;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  background: #fbfcfd;
}
.device.collapsed {
  background: #f5f8fa;
}
.device header > div {
  flex: 1;
}
.points {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.points label {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 7px;
  padding: 9px;
  border: 1px solid #e1e8ed;
  background: #fff;
  font-size: 12px;
}
.points label small {
  grid-column: 2;
  font-size: 10px;
}
.points p {
  grid-column: 1/-1;
  color: #8794a0;
}
.device > footer {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e8eef2;
  color: #647783;
  font-size: 11px;
}
.tou {
  padding: 12px;
  border: 1px solid #dfe8ed;
}
.tou-panel {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 14px;
  padding: 14px;
  background: #f8fbfc;
  border: 1px solid #dfe8ed;
}
.tou-panel > div {
  display: grid;
  gap: 8px;
  align-content: start;
}
.tou-panel button {
  padding: 9px;
  text-align: left;
  border: 1px solid #e1e8ed;
  background: #fff;
}
.tou-panel button.active {
  border-color: #3a8ca5;
  background: #eff9fb;
}
.tou-panel button.primary {
  background: #2f758a;
  border-color: #2f758a;
  color: #fff;
  text-align: center;
  font-weight: 600;
}
.tou-panel button.primary:hover { background: #245f72; border-color: #245f72; }
.tariff-option{display:flex;align-items:center;gap:6px;border:1px solid #e1e8ed;border-radius:8px;background:#fff;padding:4px}.tariff-option.active{border-color:#3a8ca5;background:#eff9fb}.tariff-select{flex:1!important;border:0!important;background:transparent!important;color:#365868!important;padding:7px 8px!important}.tariff-select small{display:block;margin-top:3px;color:#8998a0;font-size:10px}.tariff-actions{display:flex;gap:2px}.tariff-actions .icon{width:28px;height:28px}.tariff-preview{padding:24px;min-width:460px}.tariff-preview>header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e3ebee}.tariff-preview>header b,.tariff-preview>header small{display:block}.tariff-preview>header small{margin-top:5px;color:#82919a}.tariff-preview>header>span{padding:4px 8px;border-radius:5px;background:#eef5f6;color:#3d7582;font-size:12px}.tariff-preview-meta{display:flex;gap:24px;padding:14px 0;color:#71818b;font-size:12px}.tariff-preview-periods{display:grid;gap:7px}.tariff-preview-periods>div{display:grid;grid-template-columns:1fr 1.2fr 100px;gap:10px;align-items:center;padding:10px 12px;border:1px solid #e1e8ed;border-radius:7px;background:#fbfdfe}.tariff-preview-periods span{color:#627782}.tariff-preview-periods strong{text-align:right;color:#2c7083}
.period {
  display: grid;
  grid-template-columns: minmax(90px, 1.2fr) minmax(105px, 1fr) auto minmax(105px, 1fr) minmax(80px, 1fr) auto 30px;
  gap: 6px;
  align-items: center;
  min-width: 610px;
}
.period input {
  min-width: 0;
}
.period-remove { justify-self: end; }
.dialog-actions {
  justify-content: flex-end;
  padding-top: 15px;
  border-top: 1px solid #edf1f4;
}
.detail {
  padding: 20px;
}
.detail div {
  display: grid;
  grid-template-columns: 160px 1fr;
  padding: 10px;
  border-bottom: 1px solid #edf1f4;
}
.detail b {
  color: #7b8994;
}
@media (max-width: 760px) {
  .models > div,
  .points,
  .tou-panel {
    grid-template-columns: 1fr;
  }
  .period {
    grid-template-columns: minmax(90px, 1.2fr) minmax(105px, 1fr) auto minmax(105px, 1fr) minmax(80px, 1fr) auto 30px;
  }
}
</style>
<style scoped>
.pricing .icon,.pricing .icon:hover,.pricing .icon:focus,.pricing .icon:active{border:0!important;background:transparent!important;box-shadow:none!important;outline:0!important;padding:0!important}.pricing .icon:hover{color:#2f8194}
.error {
  position: fixed;
  z-index: 3000;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 12px 18px !important;
  border: 1px solid #efc9bd !important;
  border-radius: 10px;
  background: #fff8f5 !important;
  color: #a34730;
  box-shadow: 0 12px 30px rgba(53, 37, 30, 0.16);
  max-width: calc(100vw - 32px);
}
:deep(.resource-dialog) {
  min-height: 70vh;
}
:deep(.resource-dialog .dialog-content) {
  min-height: 62vh;
  scrollbar-width: none;
}
:deep(.resource-dialog .dialog-content::-webkit-scrollbar) {
  display: none;
}
.table-wrap {
  scrollbar-width: none;
}
.table-wrap::-webkit-scrollbar {
  display: none;
}
</style>
