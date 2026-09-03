<script setup lang="ts">
import '../styles/archive-history-fix.css'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, BarChart3, Building2, ChevronDown, ChevronRight, Copy, Cpu, FileText, Pencil, RadioTower, RefreshCw, Search, Trash2, X } from '@lucide/vue'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppImage from '@/components/app/AppImage.vue'
import CatalogTreeNode from '@/components/catalog/CatalogTreeNode.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { bindDevicesToGateway, bindDiscoveredDevice, catalogModel, catalogTree, copyResource, createResource, deleteMetricTemplate, deviceArchiveProfile, deviceCards, deviceProfile, deviceTree, gatewayArchiveProfile, listResource, metricTemplates as loadMetricTemplatesApi, orgArchiveProfile, parseDevicePayloadPreview, provisionDevice, publishedModelOptions, removeResource, replayAccessRawMessage, resourceOptions, rootOrgs, saveDeviceAttributeOverrides, saveDeviceTypePoints, saveMetricTemplate as saveMetricTemplateApi, statistics, updateDeviceContext, updateResource } from '@/api/platform'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { loadBasicChartRuntime, type BasicChartRuntime } from '@/utils/chartRuntime'
import { withDeviceLookupLabels } from '@/utils/deviceArchive'
import { fieldLabel } from '@/utils/fieldLabels'

type FormType = 'org' | 'gateway' | 'device'
type NodeType = 'ORG' | 'GATEWAY' | 'DEVICE' | 'SPACE' | 'GROUP'

interface TreeNode extends RecordRow {
  nodeType: NodeType
  children?: TreeNode[]
}

interface FlatNode {
  node: TreeNode
  level: number
}

interface ArchiveAction {
  label: string
  path: string
  query: Record<string, string>
}

interface ArchiveForm extends Record<string, unknown> {
  parent_id: string | number
  org_name: string
  org_type: string | number
  leader: string
  phone: string
  address: string
  sort: string | number
  gateway_sn: string
  gateway_name: string
  mqtt_secret: string
  org_id: string | number
  install_location: string
  ip_address: string
  heartbeat_interval: string | number
  status: string | number
  gateway_id: string | number
  device_type_id: string | number
  model_version_id: string | number
  space_id: string | number
  protocol_addr: string
  device_sn: string
  device_name: string
  device_model: string
  install_time: string
  collect_interval_seconds: string | number
  quality_threshold_pct: string | number
  settlement_enabled: string | number
  meter_role: string
  meter_factor: string | number
  quality_gate_start_date: string
}

interface PointDraft {
  _draftKey: string
  point_code: string
  point_name: string
  data_type: string
  unit: string
  business_role: string
  billable: number
  stat_enabled: number
  sort: number
  enabled: number
}

function formatDateInput(date: Date) {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}
function normalizeDateInput(value: unknown, fallback = formatDateInput(new Date())) {
  const matched = String(value || '').match(/^\d{4}-\d{2}-\d{2}/)
  return matched ? matched[0] : fallback
}
function daysAgo(days: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return formatDateInput(date)
}
const archiveLink = (label: string, path: string, query: Record<string, string>): ArchiveAction => ({ label, path, query })

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const mode = computed(() => String(route.meta.resource || 'org-tree'))
const title = computed(() => mode.value === 'devices' ? '设备档案' : mode.value === 'device-detail' ? '设备详情' : '设备档案树')

const rootOrgOptions = ref<RecordRow[]>([])
const orgOptions = ref<RecordRow[]>([])
const selectedRootOrgId = ref('')
const rootOrgSelectLocked = computed(() => rootOrgOptions.value.length <= 1)
const treeKeyword = ref('')
const deviceKeyword = ref('')
const deviceRootOrgIds = ref<string[]>([])
const deviceGatewayIds = ref<string[]>([])
const attributeKeyword = ref('')
const attributeGroupFilters = ref<string[]>([])
const pointKeyword = ref('')
const pointRoleFilters = ref<string[]>([])
const tree = ref<TreeNode[]>([])
const devices = ref<RecordRow[]>([])
const deviceListLoading = ref(false)
const gatewayOptions = ref<RecordRow[]>([])
const typeOptions = ref<RecordRow[]>([])
const spaceOptions = ref<RecordRow[]>([])
const modelOptions = ref<RecordRow[]>([])
const publishedCatalogTree = ref<RecordRow[]>([])
const selectedModelTreeKey = ref('')
const selectedOrgTreeKey = ref('')
const selectedNode = ref<TreeNode | null>(null)
const archiveSelectionStorageKey = 'park-energy.device-archive.selected-node'
const showAllData = ref(false)
const profile = ref<RecordRow>({})
const loading = ref(false)
const error = useAlertRef()
const treeLoading = ref(false)
let treeRequestVersion = 0
const profileLoading = ref(false)
const dialog = ref(false)
const protocolAddressDialog = ref(false)
const protocolAddressDraft = ref('')
const bindDialog = ref(false)
const deleteDialog = ref(false)
const deletingNodeRef = ref<TreeNode | null>(null)
const deleting = ref(false)
const formType = ref<FormType>('org')
const editingId = ref<unknown>(null)
const editingGatewayId = ref('')
const bindingDeviceIds = ref<string[]>([])
const bindingDevices = ref<RecordRow[]>([])
const bindingKeyword = ref('')
const bindingLoading = ref(false)
const bindingTarget = ref<TreeNode | null>(null)
const pointDrafts = ref<PointDraft[]>([])
const pointSaving = ref(false)
const pointEditor = ref<PointDraft | null>(null)
const pointEditingKey = ref('')
const parsePreviewDialog = ref(false)
const parsePreviewBusy = ref(false)
const parsePreviewPayload = ref('')
const parsePreviewResult = ref<RecordRow | null>(null)
const attributeDrafts = ref<Record<string, string>>({})
const attributeSaving = ref(false)
const deviceWizardStep = ref(1)
const wizardError = ref('')
const wizardModelKeyword = ref('')
const wizardOrgKeyword = ref('')
const wizardTemplate = ref<RecordRow>({})
const form = reactive<ArchiveForm>({
  parent_id: 0,
  org_name: '',
  org_type: 1,
  leader: '',
  phone: '',
  address: '',
  sort: 0,
  gateway_sn: '',
  gateway_name: '',
  mqtt_secret: '',
  org_id: '',
  install_location: '',
  ip_address: '',
  heartbeat_interval: 60,
  status: 1,
  gateway_id: '',
  device_type_id: '',
  model_version_id: '',
  space_id: '',
  protocol_addr: '',
  device_sn: '',
  device_name: '',
  device_model: '',
  install_time: '',
  collect_interval_seconds: 300,
  quality_threshold_pct: 95,
  settlement_enabled: 0,
  meter_role: 'INTERNAL',
  meter_factor: 1,
  quality_gate_start_date: formatDateInput(new Date()),
})
const activeArchiveTab = ref<'device' | 'inspection' | 'runtime' | 'history' | 'alarm'>('device')
const detailWorkspaceTab = ref<'overview' | 'alarms' | 'billing' | 'attributes' | 'points'>('overview')
const settlementSwitching = ref(false)
const dataView = ref<'chart' | 'table'>('chart')
const historyStart = ref(daysAgo(30))
const historyEnd = ref(formatDateInput(new Date()))
const historyInterval = ref('五分钟')
const historyParam = ref('')
type HistoryGranularity = 'day' | 'week' | 'month' | 'year' | 'total'
const historyGranularity = ref<HistoryGranularity>('day')
const historyAnchor = ref(formatDateInput(new Date()))
const periodHistoryRows = ref<RecordRow[]>([])
const hourlyMetricRows = ref<RecordRow[]>([])
const realtimeMetricRows = ref<RecordRow[]>([])
const metricTemplates = ref<RecordRow[]>([])
const metricTemplateId = ref('')
const metricTemplateName = ref('')
const metricTemplateDialog = ref(false)
const metricLoading = ref(false)
const metricRequestToken = ref(0)
const selectionRequestToken = ref(0)
const selectedMetricPointCodes = ref<string[]>([])
const alarmSearchKeyword = ref('')
const alarmColumnFilters = ref<string[]>(['alarm_time', 'device_name', 'alarm_type', 'alarm_level', 'point_code', 'deal_status', 'work_order_no', 'work_order_status'])
const alarmPage = ref(1)
const alarmPageSize = 5
const detailAlarmKeyword = ref('')
const detailAlarmStatusFilter = ref('')
const inspectionSearchKeyword = ref('')
const inspectionTypeFilter = ref('')
const metricPointSearchKeyword = ref('')
const metricPointGroupFilters = ref<string[]>([])
const overviewRealtimeChartEl = ref<HTMLElement | null>(null)
const deviceRealtimeChartEl = ref<HTMLElement | null>(null)
const detailRealtimeChartEl = ref<HTMLElement | null>(null)
const historyChartEl = ref<HTMLElement | null>(null)
const alarmChartEl = ref<HTMLElement | null>(null)
const billingUsageChartEl = ref<HTMLElement | null>(null)
const billingQualityChartEl = ref<HTMLElement | null>(null)
let overviewRealtimeChart: ECharts | null = null
let deviceRealtimeChart: ECharts | null = null
let detailRealtimeChart: ECharts | null = null
let historyChart: ECharts | null = null
let alarmChart: ECharts | null = null
let billingUsageChart: ECharts | null = null
let billingQualityChart: ECharts | null = null
let chartRuntime: BasicChartRuntime | null = null
let treeTimer: ReturnType<typeof setTimeout> | null = null
let detailContextTimer: ReturnType<typeof setTimeout> | null = null
let ignoreNextTreeWatch = false
let detailRequestVersion = 0
let renderToken = 0

function disposeArchiveCharts() {
  overviewRealtimeChart?.dispose()
  deviceRealtimeChart?.dispose()
  detailRealtimeChart?.dispose()
  historyChart?.dispose()
  billingUsageChart?.dispose()
  billingQualityChart?.dispose()
  overviewRealtimeChart = null
  deviceRealtimeChart = null
  detailRealtimeChart = null
  historyChart = null
  billingUsageChart = null
  billingQualityChart = null
}

const selectedIsDevice = computed(() => selectedNode.value?.nodeType === 'DEVICE')
const selectedIsGateway = computed(() => selectedNode.value?.nodeType === 'GATEWAY')
const selectedIsOrg = computed(() => selectedNode.value?.nodeType === 'ORG')
const selectedIsSpace = computed(() => selectedNode.value?.nodeType === 'SPACE')
const selectedIsGroup = computed(() => selectedNode.value?.nodeType === 'GROUP')
const selectedCanMutate = computed(() => ['ORG', 'GATEWAY', 'DEVICE'].includes(String(selectedNode.value?.nodeType)))
const deviceGatewayFilterOptions = computed(() => {
  if (!deviceRootOrgIds.value.length) return [] as RecordRow[]
  const ids = new Set<string>(deviceRootOrgIds.value)
  let changed = true
  while (changed) {
    changed = false
    orgOptions.value.forEach((org) => {
      if (ids.has(String(org.parent_id)) && !ids.has(String(org.id))) { ids.add(String(org.id)); changed = true }
    })
  }
  return gatewayOptions.value.filter((gateway) => ids.has(String(gateway.org_id)))
})
const deviceRootFilterLabel = computed(() => deviceRootOrgIds.value.length ? `已选 ${deviceRootOrgIds.value.length} 个园区` : '全部园区')
const deviceGatewayFilterLabel = computed(() => deviceGatewayIds.value.length ? `已选 ${deviceGatewayIds.value.length} 个网关` : '全部网关')
const attributeGroupFilterLabel = computed(() => attributeGroupFilters.value.length ? `已选 ${attributeGroupFilters.value.length} 组` : '全部属性组')
const pointRoleFilterLabel = computed(() => pointRoleFilters.value.length ? `已选 ${pointRoleFilters.value.length} 项` : '全部业务角色')
const attributeGroupOptions = computed(() => [...new Set(modelAttributes.value.map((item) => String(item.group_name || '')).filter(Boolean))])
const pointRoleOptions = computed(() => [...new Set(pointDrafts.value.map((item) => String(item.business_role || '')).filter(Boolean))])
const filteredModelAttributes = computed(() => modelAttributes.value.filter((item) => {
  const keyword = attributeKeyword.value.trim().toLowerCase()
  const text = [item.attribute_name, item.attribute_code, item.group_name, item.attribute_value].filter(Boolean).join(' ').toLowerCase()
  return (!keyword || text.includes(keyword)) && (!attributeGroupFilters.value.length || attributeGroupFilters.value.includes(String(item.group_name)))
}))
const filteredPointDrafts = computed(() => pointDrafts.value.filter((point) => {
  const keyword = pointKeyword.value.trim().toLowerCase()
  const text = [point.point_name, point.point_code, point.data_type, point.business_role].filter(Boolean).join(' ').toLowerCase()
  return (!keyword || text.includes(keyword)) && (!pointRoleFilters.value.length || pointRoleFilters.value.includes(String(point.business_role)))
}))
const selectedCanCopy = computed(() => ['ORG', 'GATEWAY'].includes(String(selectedNode.value?.nodeType)))
const selectedNodeTitle = computed(() => selectedNode.value ? nodeLabel(selectedNode.value) : '请选择左侧节点')
const createLabel = computed(() => selectedIsGateway.value ? '+新增网关' : '+新增组织')
const showPrimaryCreate = computed(() => !selectedIsDevice.value && !selectedIsSpace.value && !selectedIsGroup.value)
const orgTypeOptions = [
  { label: '园区', value: 1 },
  { label: '企业', value: 2 },
  { label: '楼宇', value: 3 },
  { label: '楼层', value: 4 },
  { label: '区域', value: 5 },
]
const statusOptions = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
]
const orgSelectionTree = computed<RecordRow[]>(() => {
  const nodes = new Map<string, RecordRow>()
  orgOptions.value.forEach((item) => nodes.set(String(item.id), {
    ...item, key: `ORG:${item.id}`, nodeType: 'ORG', label: item.org_name, code: orgTypeText(item.org_type), children: [],
  }))
  const roots: RecordRow[] = []
  nodes.forEach((node) => {
    const parent = nodes.get(String(node.parent_id || ''))
    if (parent) (parent.children as RecordRow[]).push(node)
    else roots.push(node)
  })
  return roots
})
const organizationGatewayTree = computed<RecordRow[]>(() => {
  const clone = (nodes: RecordRow[]): RecordRow[] => nodes.map((node) => ({
    ...node,
    children: clone(Array.isArray(node.children) ? node.children as RecordRow[] : []),
  }))
  const roots = clone(orgSelectionTree.value)
  const append = (nodes: RecordRow[]): void => nodes.forEach((node) => {
    if (node.nodeType === 'ORG') {
      const gateways = gatewayOptions.value.filter((item) => String(item.org_id) === String(node.id) && Number(item.status) === 1)
      ;(node.children as RecordRow[]).push(...gateways.map((item) => ({
        ...item,
        key: `GATEWAY:${item.id}`,
        nodeType: 'GATEWAY',
        label: item.gateway_name || item.gateway_sn,
        code: item.gateway_sn,
        children: [],
      })))
    }
    append(Array.isArray(node.children) ? node.children as RecordRow[] : [])
  })
  append(roots)
  return roots
})
const dialogOrgTree = computed<RecordRow[]>(() => {
  const excludeId = formType.value === 'org' && editingId.value ? String(editingId.value) : ''
  const filter = (nodes: RecordRow[]): RecordRow[] => nodes
    .filter((node) => String(node.id) !== excludeId)
    .map((node) => ({ ...node, children: filter(Array.isArray(node.children) ? node.children as RecordRow[] : []) }))
  return filter(orgSelectionTree.value)
})
const selectedPublishedModel = computed(() => modelOptions.value.find((item) => String(item.model_version_id) === String(form.model_version_id)))
const wizardTemplateAttributes = computed(() => Array.isArray(wizardTemplate.value.attributes) ? wizardTemplate.value.attributes as RecordRow[] : [])
const wizardTemplatePoints = computed(() => Array.isArray(wizardTemplate.value.points) ? wizardTemplate.value.points as RecordRow[] : [])
const selectedModelIsModbus = computed(() => String(selectedPublishedModel.value?.protocol_type || '').startsWith('MODBUS'))
const recentHistory = computed(() => (profile.value.recentHistory || profile.value.latestStats || []) as RecordRow[])
const recentAlarms = computed(() => (profile.value.recentAlarms || []) as RecordRow[])
const inspectionRecords = computed(() => (profile.value.inspectionRecords || []) as RecordRow[])
const energyTrend = computed(() => (profile.value.energyTrend || []) as RecordRow[])
const alarmTrend = computed(() => (profile.value.alarmTrend || []) as RecordRow[])
const realtimeSnapshots = computed(() => (profile.value.realtimeSnapshots || []) as RecordRow[])
const pointDefinitions = computed(() => ((profile.value.points as RecordRow | undefined)?.definitions || []) as RecordRow[])
const metricPointOptions = computed(() => pointDefinitions.value.filter((item) => Number(item.enabled ?? 1) === 1))
const metricPointGroupOptions = computed(() => [...new Set(metricPointOptions.value.map((item) => String(item.business_role || item.data_type || item.group_name || '未分组')).filter(Boolean))])
const filteredMetricPointOptions = computed(() => {
  const keyword = metricPointSearchKeyword.value.trim().toLowerCase()
  return metricPointOptions.value.filter((item) => {
    const group = String(item.business_role || item.data_type || item.group_name || '未分组')
    if (metricPointGroupFilters.value.length && !metricPointGroupFilters.value.includes(group)) return false
    if (!keyword) return true
    return [item.point_name, item.point_code, item.unit, item.business_role, item.data_type, item.group_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
})
const selectedMetricPoints = computed(() => metricPointOptions.value.filter((item) => selectedMetricPointCodes.value.includes(metricPointCode(item))))
const metricTemplateLabel = computed(() => metricTemplateId.value ? (metricTemplates.value.find((item) => String(item.id) === metricTemplateId.value)?.template_name || '已保存模板') : '全部测点')
const metricTemplateChips = computed(() => metricTemplates.value.map((item) => ({ id: String(item.id || ''), label: String(item.template_name || '未命名模板') })))
const historyRowsFallback = computed(() => {
  const rows = recentHistory.value.length
    ? recentHistory.value
    : (profile.value.latestStats as RecordRow[] || [])
  return rows.length ? rows : energyTrend.value
})
const historyDisplayRows = computed(() => {
  if (periodHistoryChartRows.value.length) return periodHistoryChartRows.value
  return historyRowsFallback.value.map((item) => ({
    time: String(item.stat_period || item.stat_date || item.stat_month || item.stat_time || ''),
    values: {
      [String(item.point_code || item.pointCode || 'total_active_energy')]: item.usage_value ?? item.value ?? item.avg_value ?? 0,
    },
  })).filter((item) => item.time)
})
const historyDisplayKeys = computed(() => [...new Set(historyDisplayRows.value.flatMap((row) => Object.keys(row.values)))])
const historyHasData = computed(() => historyDisplayRows.value.length > 0)
const archiveHistoryChartRows = computed(() => historyDisplayRows.value)
const alarmVisibleColumns = computed(() => alarmTableColumns.value.filter((column) => alarmColumnFilters.value.includes(column)))
const filteredRecentAlarms = computed(() => {
  const keyword = alarmSearchKeyword.value.trim().toLowerCase()
  return recentAlarms.value.filter((row) => {
    if (!alarmVisibleColumns.value.length) return false
    if (!keyword) return true
    return alarmVisibleColumns.value.some((column) => String(archiveFieldValue(column, row[column]) ?? '').toLowerCase().includes(keyword))
  })
})
const detailAlarmStatusOptions = computed(() => [...new Set(recentAlarms.value.map((row) => String(row.deal_status || '').trim()).filter(Boolean))])
const detailAlarmPage = ref(1)
const detailAlarmPageCount = computed(() => Math.max(1, Math.ceil(filteredDetailAlarms.value.length / alarmPageSize)))
const pagedDetailAlarms = computed(() => filteredDetailAlarms.value.slice((detailAlarmPage.value - 1) * alarmPageSize, detailAlarmPage.value * alarmPageSize))
const filteredDetailAlarms = computed(() => {
  const keyword = detailAlarmKeyword.value.trim().toLowerCase()
  const status = detailAlarmStatusFilter.value
  return recentAlarms.value.filter((row) => {
    if (status && String(row.deal_status || '') !== status) return false
    if (!keyword) return true
    return [
      row.alarm_time,
      alarmTypeText(row.alarm_type),
      alarmLevelText(row.alarm_level),
      row.point_code,
      dealStatusText(row.deal_status),
      row.work_order_no,
      workOrderStatusText(row.work_order_status),
    ].filter(Boolean).join(' ').toLowerCase().includes(keyword)
  })
})
const alarmPageCount = computed(() => Math.max(1, Math.ceil(filteredRecentAlarms.value.length / alarmPageSize)))
const pagedRecentAlarms = computed(() => filteredRecentAlarms.value.slice((alarmPage.value - 1) * alarmPageSize, alarmPage.value * alarmPageSize))
const alarmColumnOptions = computed(() => alarmTableColumns.value.map((column) => ({ key: column, label: column === 'work_order_no' ? '关联工单' : column === 'work_order_status' ? '工单状态' : column === 'work_order_priority' ? '工单优先级' : column === 'work_order_assignee' ? '处理人' : fieldLabel(column) })))
const inspectionTypeOptions = computed(() => [...new Set(inspectionRecords.value.map((row) => String(row.command_type || '运维操作')).filter(Boolean))])
const filteredInspectionRecords = computed(() => {
  const keyword = inspectionSearchKeyword.value.trim().toLowerCase()
  return inspectionRecords.value.filter((row) => {
    const type = String(row.command_type || '运维操作')
    const text = [type, row.target_sn, row.request_time, row.status, row.device_name, row.device_sn]
      .filter(Boolean).join(' ').toLowerCase()
    return (!keyword || text.includes(keyword)) && (!inspectionTypeFilter.value || type === inspectionTypeFilter.value)
  })
})
const historyPeriod = computed(() => {
  const anchor = new Date(`${historyAnchor.value}T00:00:00`)
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const d = anchor.getDate()
  if (historyGranularity.value === 'total') return { start: '2000-01-01', end: formatDateInput(new Date()), label: '全部历史' }
  if (historyGranularity.value === 'month') return { start: formatDateInput(new Date(y, m, 1)), end: formatDateInput(new Date(y, m + 1, 0)), label: `${y}年${m + 1}月` }
  if (historyGranularity.value === 'year') return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}年` }
  if (historyGranularity.value === 'week') {
    const day = anchor.getDay() || 7
    const startDate = new Date(y, m, d - day + 1)
    const endDate = new Date(y, m, d - day + 7)
    return { start: formatDateInput(startDate), end: formatDateInput(endDate), label: `${formatDateInput(startDate)} 至 ${formatDateInput(endDate)}` }
  }
  return { start: historyAnchor.value, end: historyAnchor.value, label: historyAnchor.value }
})
const periodHistoryChartRows = computed(() => {
  const rows = periodHistoryRows.value
  const grouped = new Map<string, { time: string; values: Record<string, unknown> }>()
  rows.forEach((row) => {
    const point = String(row.point_code || row.pointCode || '总用量')
    const time = historyGranularity.value === 'day'
      ? String(row.stat_period || `${row.stat_date || ''} ${String(row.stat_hour ?? '').padStart(2, '0')}:00`).trim()
      : String(row.stat_period || row.stat_date || row.stat_month || row.stat_year || '')
    if (!grouped.has(time)) grouped.set(time, { time, values: {} })
    grouped.get(time)!.values[point] = row.usage_value ?? row.value ?? row.avg_value ?? 0
  })
  return [...grouped.values()].sort((a, b) => a.time.localeCompare(b.time))
})
const periodHistorySeriesKeys = computed(() => [...new Set(periodHistoryChartRows.value.flatMap((row) => Object.keys(row.values)))])
const billingStatCards = computed(() => [
  ['可计费测点', `${pointDefinitions.value.filter((item) => Number(item.billable) === 1).length} 个`],
  ['本期计量点数', `${periodHistoryRows.value.length} 条`],
  ['本期累计用量', `${periodHistoryRows.value.reduce((sum, row) => sum + Number(row.usage_value ?? row.value ?? row.avg_value ?? 0), 0).toFixed(2)}`],
  ['数据完整率', `${Number(detailDevice.value.quality_threshold_pct || 95).toFixed(0)}% 门槛`],
])
const pointMappings = computed(() => ((profile.value.points as RecordRow | undefined)?.mappings || []) as RecordRow[])
const realtimeLookup = computed<Record<string, unknown>>(() => {
  const raw = profile.value.realtime
  if (raw && typeof raw === 'object' && Array.isArray((raw as RecordRow).points)) {
    return ((raw as RecordRow).points as RecordRow[]).reduce<Record<string, unknown>>((acc, item) => {
      const key = String(item.pointCode || item.point_code || '')
      addRealtimeLookupValue(acc, key, item.value)
      return acc
    }, {})
  }
  if (Array.isArray(raw)) {
    return raw.reduce<Record<string, unknown>>((acc, item) => {
      if (item && typeof item === 'object') {
        const row = item as RecordRow
        const key = String(row.point_code || row.pointCode || row.name || row.id || '')
        addRealtimeLookupValue(acc, key, row.value ?? row.usage_value ?? row.alarm_value ?? row.data_value ?? row.current_value ?? row.currentValue ?? row)
      }
      return acc
    }, {})
  }
  if (raw && typeof raw === 'object') return withNormalizedRealtimeKeys(flattenRealtimePoints(raw as RecordRow))
  return {}
})

const selectedEntity = computed(() => {
  if (selectedIsDevice.value) return (profile.value.device || selectedNode.value || {}) as RecordRow
  if (selectedIsGateway.value) return (profile.value.gateway || selectedNode.value || {}) as RecordRow
  if (selectedIsOrg.value) return (profile.value.org || selectedNode.value || {}) as RecordRow
  if (selectedIsSpace.value) return (profile.value.space || selectedNode.value || {}) as RecordRow
  if (selectedIsGroup.value) return (profile.value.group || selectedNode.value || {}) as RecordRow
  return {}
})
const selectedBasicInfo = computed(() => {
  const source = selectedEntity.value
  return [
    ['名称', source.device_name || source.gateway_name || source.org_name || source.space_name || source.group_name || '—'],
    ['编号', source.device_sn || source.gateway_sn || source.space_code || source.id || '—'],
    ['类型', source.type_name || source.type_code || source.space_type || orgTypeText(source.org_type) || source.nodeType || '—'],
    ['组织', source.org_name || '—'],
    ['网关', source.gateway_name || source.gateway_sn || '—'],
    ['安装位置', source.install_location || source.address || '—'],
    ['型号', source.device_model || source.firmware_version || '—'],
    ['状态', statusText(source.online_status ?? source.status)],
  ].filter((item) => showAllData.value || !isMissingValue(item[1]))
})
const detailDevice = computed(() => (profile.value.device || {}) as RecordRow)
const modelAttributes = computed(() => Array.isArray(profile.value.modelAttributes) ? profile.value.modelAttributes as RecordRow[] : [])
const catalogManagedDevice = computed(() => Boolean(detailDevice.value.model_version_id))
const billableTotalPointCount = computed(() => pointDefinitions.value.filter((item) => Number(item.billable) === 1
  && Number(item.stat_enabled) === 1 && String(item.business_role || '').toUpperCase() === 'TOTAL_ACCUMULATED').length)

const groupedHistory = computed(() => groupHistoryRows(recentHistory.value))
const groupedHistoryOrdered = computed(() => [...groupedHistory.value].reverse())
const groupedHistoryColumns = computed(() => {
  const columns = new Set<string>()
  groupedHistory.value.forEach((row) => Object.keys(row.values).forEach((key) => columns.add(key)))
  return [...columns]
})
const deviceRealtimeChartRows = computed(() => realtimeMetricRows.value.map((item) => ({
  time: String(item.stat_period || `${item.stat_date || ''} ${String(item.stat_hour ?? '').padStart(2, '0')}:00`),
  values: { [String(item.point_code || item.pointCode || '总用量')]: item.value ?? item.usage_value ?? item.avg_value ?? 0 },
  sourceRows: [item],
})))
const deviceRealtimeSeriesKeys = computed(() => [...new Set(deviceRealtimeChartRows.value.flatMap((row) => Object.keys(row.values)))])
const deviceRealtimePointRows = computed(() => Object.entries(realtimeLookup.value)
  .filter(([key]) => key === normalizePointCode(key))
  .map(([key, value]) => ({ key, value: Number(value) }))
  .filter((item) => Number.isFinite(item.value)))
const overviewRealtimeRows = computed(() => realtimeSnapshots.value
  .map((item) => {
    const points = flattenRealtimePoints((item.realtime || {}) as RecordRow)
    const values = Object.values(points).map(Number).filter(Number.isFinite)
    return {
      name: String(item.device_name || item.device_sn || item.id || '设备'),
      value: values.length ? values.reduce((sum, value) => sum + value, 0) : 0,
    }
  })
  .filter((item) => item.name.length > 0)
  .slice(0, 12))
const latestHistoryValues = computed(() => groupedHistory.value[0]?.values || {})
const runtimeCards = computed(() => {
  const normalized = profile.value.realtime as RecordRow | undefined
  const reportedPoints = normalized && Array.isArray(normalized.points) ? normalized.points as RecordRow[] : []
  const latest = latestHistoryValues.value
  const selectedDefinitions = selectedMetricPoints.value.length ? selectedMetricPoints.value : pointDefinitions.value
  if (selectedDefinitions.length) {
    return selectedDefinitions.map((definition) => {
      const code = metricPointCode(definition)
      const reported = reportedPoints.find((point) => normalizePointCode(point.pointCode || point.point_code || point.code || '') === code)
      return {
        code,
        name: String(definition?.point_name || definition?.pointName || code),
        unit: String(reported?.unit || definition?.unit || ''),
        role: String(reported?.businessRole || reported?.business_role || definition?.business_role || definition?.businessRole || ''),
        value: reported?.value ?? latest[code] ?? realtimeValue(code),
      }
    })
  }
  if (reportedPoints.length) {
    return reportedPoints.map((point) => ({
      code: normalizePointCode(point.pointCode || point.point_code || point.code || ''),
      name: String(point.pointName || point.point_name || point.pointCode || ''),
      unit: String(point.unit || ''),
      role: String(point.businessRole || point.business_role || ''),
      value: point.value,
    }))
  }
  return Object.keys(latest).map((code) => {
    const normalizedCode = normalizePointCode(code)
    const definition = pointDefinitions.value.find((point) => metricPointCode(point) === normalizedCode)
    return {
      code: normalizedCode,
      name: String(definition?.point_name || definition?.pointName || code || '测点'),
      unit: String(definition?.unit || ''),
      role: String(definition?.business_role || definition?.businessRole || ''),
      value: latest[code],
    }
  })
})
const overviewCards = computed(() => {
  if (selectedIsDevice.value) return []
  if (selectedIsOrg.value) return [
    ['空间总数', profile.value.spaceCount ?? 0],
    ['在租租户', profile.value.tenantCount ?? 0],
    ['生效合同', profile.value.activeContractCount ?? 0],
    ['结算设备', profile.value.deviceCount ?? 0],
  ]
  return [
    ['设备总数', profile.value.deviceCount ?? '—'],
    [selectedIsGateway.value ? '启用设备' : '在线网关', selectedIsGateway.value ? profile.value.onlineDeviceCount ?? '—' : profile.value.onlineGatewayCount ?? '—'],
    ['近期告警', recentAlarms.value.length],
    ['能耗记录', energyTrend.value.length],
  ]
})
const archiveSummaryCards = computed(() => {
  const summary = (profile.value.summary || {}) as RecordRow
  if (selectedIsSpace.value || selectedIsGroup.value) return [
    ['设备数量', summary.deviceCount ?? nodeChildren(selectedNode.value as TreeNode).length],
    ['当前视角', selectedIsSpace.value ? '安装空间' : '接入状态'],
  ]
  if (selectedIsDevice.value) return [
    ['测点数量', summary.pointCount ?? pointDefinitions.value.length],
    ['计量记录', summary.historyCount ?? recentHistory.value.length],
    ['待处理告警', summary.alarmCount ?? recentAlarms.value.length],
    ['运维记录', summary.commandCount ?? inspectionRecords.value.length],
  ]
  if (selectedIsGateway.value) return [
    ['设备总数', summary.deviceCount ?? profile.value.deviceCount ?? '—'],
    ['在线设备', summary.onlineDeviceCount ?? profile.value.onlineDeviceCount ?? '—'],
    ['近期告警', summary.alarmCount ?? recentAlarms.value.length],
    ['实时快照', summary.realtimeSnapshotCount ?? realtimeSnapshots.value.length],
  ]
  return [
    ['设备总数', summary.deviceCount ?? profile.value.deviceCount ?? '—'],
    ['网关总数', summary.gatewayCount ?? profile.value.gatewayCount ?? '—'],
    ['在线网关', summary.onlineGatewayCount ?? profile.value.onlineGatewayCount ?? '—'],
    ['近期告警', summary.alarmCount ?? recentAlarms.value.length],
  ]
})
const defaultPointCodes = computed(() => {
  const codes = pointDefinitions.value
    .map((point) => String(point.point_code || point.pointCode || point.code || ''))
    .filter(Boolean)
    .slice(0, 3)
  return codes.length ? codes.join(',') : 'total_active_energy'
})
const archiveActionLinks = computed<ArchiveAction[]>(() => {
  if (!selectedNode.value) return []
  const id = String(selectedNode.value.id)
  if (selectedIsDevice.value) return [
    archiveLink('实时监控', '/monitor/realtime', { deviceId: id }),
    archiveLink('计量分析', '/analysis/history', { deviceId: id, pointCodes: defaultPointCodes.value, startTime: historyStart.value, endTime: historyEnd.value }),
    archiveLink('告警处置', '/alarms/events', { deviceId: id }),
    archiveLink('工单与指令', '/access/commands', { targetId: id }),
    archiveLink('设备控制', '/access/control', { targetId: id }),
  ]
  if (selectedIsGateway.value) return [
    archiveLink('接入诊断', '/access/diagnostic', { gatewayId: id }),
    archiveLink('指令追踪', '/access/commands', { gatewayId: id }),
    archiveLink('告警中心', '/alarms/events', { gatewayId: id }),
  ]
  if (!selectedIsOrg.value) return []
  return [
    archiveLink('告警中心', '/alarms/events', { orgId: id, includeChildren: 'true' }),
    archiveLink('告警处置', '/alarms/workbench', { orgId: id, includeChildren: 'true' }),
    archiveLink('租户合同', '/billing/subjects', { view: 'contracts', orgId: id }),
    archiveLink('账单中心', '/billing/receivables', { view: 'bills', orgId: id, includeChildren: 'true' }),
  ]
})
const bindableDevices = computed(() => bindingDevices.value.filter((device) => String(device.gateway_id || '') !== String(selectedNode.value?.id || '')))
const viewToggleLabel = computed(() => dataView.value === 'chart' ? '图表' : '表格')
const alarmTableColumns = computed(() => {
  const preferred = ['alarm_time', 'device_name', 'alarm_type', 'alarm_level', 'point_code', 'alarm_value', 'threshold_value', 'deal_status', 'deal_time', 'work_order_no', 'work_order_status', 'work_order_priority', 'work_order_assignee']
  const keys = new Set<string>()
  preferred.forEach((key) => keys.add(key))
  recentAlarms.value.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))
  return [...keys].filter((key) => recentAlarms.value.some((row) => !isMissingValue(row[key])))
})
const hasDeviceRealtimeChart = computed(() => {
  if (!selectedIsDevice.value) return overviewRealtimeRows.value.length > 0 || energyTrend.value.length > 0
  return realtimeMetricRows.value.length > 0
})

const visibleTreeRows = computed<FlatNode[]>(() => {
  const rows: FlatNode[] = []
  const walk = (items: TreeNode[], level: number) => {
    items.forEach((node) => {
      rows.push({ node, level })
      if (expandedKeys.value.has(nodeKey(node))) walk(nodeChildren(node), level + 1)
    })
  }
  walk(tree.value, 0)
  return rows
})

const expandedKeys = ref<Set<string>>(new Set())

function nodeChildren(node: TreeNode) {
  return Array.isArray(node.children) ? node.children : []
}
function nodeKey(node: TreeNode) {
  return `${node.nodeType}-${node.id}`
}
function nodeTag(node: TreeNode) {
  return node.nodeType === 'GATEWAY' ? '网关' : node.nodeType === 'DEVICE' ? '设备' : node.nodeType === 'SPACE' ? '空间' : node.nodeType === 'GROUP' ? '分组' : '组织'
}
function filterTreeNodes(nodes: RecordRow[], keyword: string): RecordRow[] {
  const query = keyword.trim().toLowerCase()
  if (!query) return nodes
  return nodes.reduce<RecordRow[]>((result, node) => {
    const children = filterTreeNodes(Array.isArray(node.children) ? node.children as RecordRow[] : [], keyword)
    const text = [node.label, node.name, node.code, node.display_name, node.org_name, node.space_name, node.space_code]
      .filter(Boolean).join(' ').toLowerCase()
    if (text.includes(query) || children.length) result.push({ ...node, children })
    return result
  }, [])
}
const wizardPublishedCatalogTree = computed(() => filterTreeNodes(publishedCatalogTree.value, wizardModelKeyword.value) as RecordRow[])
const wizardOrgTree = computed(() => filterTreeNodes(organizationGatewayTree.value, wizardOrgKeyword.value))
function nodeLabel(node: TreeNode) {
  if (node.nodeType === 'GATEWAY') return `${node.gateway_name || '未命名网关'} · ${node.gateway_sn || node.id} · ${statusText(node.online_status ?? node.status)}`
  if (node.nodeType === 'DEVICE') return `${node.device_name || '未命名设备'} · ${node.device_sn || node.id} · ${statusText(node.online_status ?? node.status)}`
  if (node.nodeType === 'SPACE') return `${node.space_name || '未命名空间'}${node.space_code ? ` · ${node.space_code}` : ''}`
  if (node.nodeType === 'GROUP') return String(node.group_name || '未分组')
  const type = orgTypeText(node.org_type)
  return `${node.org_name || '未命名组织'}${type !== '—' ? ` · ${type}` : ''}`
}
function nodeResource(node: TreeNode) {
  return node.nodeType === 'GATEWAY' ? 'gateways' : node.nodeType === 'DEVICE' ? 'devices' : 'orgs'
}
function hasChildren(node: TreeNode) {
  return nodeChildren(node).length > 0
}
function collectExpanded(nodes: TreeNode[], keys = new Set<string>()) {
  nodes.forEach((node) => {
    if (hasChildren(node)) keys.add(nodeKey(node))
    collectExpanded(nodeChildren(node), keys)
  })
  return keys
}
function collectInitialExpanded(nodes: TreeNode[], maxLevel = 1) {
  const keys = new Set<string>()
  const walk = (items: TreeNode[], level: number) => {
    items.forEach((node) => {
      if (hasChildren(node) && level < maxLevel) {
        keys.add(nodeKey(node))
        walk(nodeChildren(node), level + 1)
      }
    })
  }
  walk(nodes, 0)
  return keys
}
function attachGatewayNodes(nodes: TreeNode[]): TreeNode[] {
  const clone = (items: TreeNode[]): TreeNode[] => items.map((item) => ({
    ...item,
    children: clone(nodeChildren(item)),
  }))
  const roots = clone(nodes)
  const walk = (items: TreeNode[]) => items.forEach((item) => {
    if (item.nodeType === 'ORG') {
      const children = nodeChildren(item)
      gatewayOptions.value
        .filter((gateway) => Number(gateway.status) === 1 && String(gateway.org_id) === String(item.id))
        .filter((gateway) => !children.some((child) => child.nodeType === 'GATEWAY' && String(child.id) === String(gateway.id)))
        .forEach((gateway) => children.push({
          ...gateway,
          key: `GATEWAY:${gateway.id}`,
          nodeType: 'GATEWAY',
          label: gateway.gateway_name || gateway.gateway_sn,
          code: gateway.gateway_sn,
          children: [],
        } as TreeNode))
      item.children = children
    }
    walk(nodeChildren(item))
  })
  walk(roots)
  return roots
}
function findNodeByKey(nodes: TreeNode[], key: string): TreeNode | null {
  for (const node of nodes) {
    if (nodeKey(node) === key) return node
    const child = findNodeByKey(nodeChildren(node), key)
    if (child) return child
  }
  return null
}
function realtimeValue(code: string) {
  const raw = realtimeLookup.value
  const normalized = normalizePointCode(code)
  if (Object.prototype.hasOwnProperty.call(raw, normalized)) return raw[normalized]
  if (Object.prototype.hasOwnProperty.call(raw, code)) return raw[code]
  const camel = code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  const normalizedCamel = normalizePointCode(camel)
  if (Object.prototype.hasOwnProperty.call(raw, normalizedCamel)) return raw[normalizedCamel]
  if (Object.prototype.hasOwnProperty.call(raw, camel)) return raw[camel]
  return '--'
}
function normalizePointCode(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/[-\s]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/__+/g, '_')
    .toUpperCase()
}
function addRealtimeLookupValue(target: Record<string, unknown>, key: unknown, value: unknown) {
  const rawKey = String(key || '')
  if (!rawKey) return
  target[rawKey] = value
  const normalized = normalizePointCode(rawKey)
  if (normalized) target[normalized] = value
}
function withNormalizedRealtimeKeys(values: Record<string, unknown>) {
  return Object.entries(values).reduce<Record<string, unknown>>((acc, [key, value]) => {
    addRealtimeLookupValue(acc, key, value)
    return acc
  }, {})
}
function flattenRealtimePoints(raw: RecordRow) {
  const envelope = unwrapRealtimeEnvelope(raw)
  const source = envelope.points && typeof envelope.points === 'object' && !Array.isArray(envelope.points)
    ? envelope.points as Record<string, unknown>
    : envelope.values && typeof envelope.values === 'object' && !Array.isArray(envelope.values)
      ? envelope.values as Record<string, unknown>
      : envelope
  return Object.entries(source).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (!['success', 'code', 'message', 'data', 'deviceId', 'deviceSn', 'gatewayId', 'orgId', 'collectTime', 'dataQuality', 'quality', 'timestamp'].includes(key)) {
      acc[key] = value
    }
    return acc
  }, {})
}
function unwrapRealtimeEnvelope(raw: RecordRow) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const data = raw.data
    if (data && typeof data === 'object' && !Array.isArray(data)) return unwrapRealtimeEnvelope(data as RecordRow)
  }
  return raw
}
function isMissingValue(value: unknown) {
  return value === null || value === undefined || value === '' || value === '—' || value === '-' || value === '--'
}
function displayValue(value: unknown) {
  return isMissingValue(value) ? '--' : value
}
function historyTime(row: RecordRow) {
  return String(row.stat_time || row.collect_time || row.timestamp || row.time || row.stat_date || row.create_time || '—')
}
function historyPoint(row: RecordRow) {
  return String(row.point_code || row.pointCode || row.metric_code || row.metricCode || row.name || '测点')
}
function historyMetricValue(row: RecordRow) {
  return row.value ?? row.data_value ?? row.current_value ?? row.usage_value ?? row.avg_value ?? row.end_value ?? row.alarm_value ?? '--'
}
function groupHistoryRows(rows: RecordRow[]) {
  const groups = new Map<string, { time: string; values: Record<string, unknown>; sourceRows: RecordRow[] }>()
  rows.forEach((row) => {
    const time = historyTime(row)
    const point = historyPoint(row)
    if (!groups.has(time)) groups.set(time, { time, values: {}, sourceRows: [] })
    const target = groups.get(time)!
    target.values[point] = historyMetricValue(row)
    target.sourceRows.push(row)
  })
  return [...groups.values()]
}
function statusMeta(value: unknown) {
  const normalized = Number(value)
  if (normalized === 1) return { text: '在线', class: 'online' }
  if (normalized === 0) return { text: '离线', class: 'muted' }
  if (normalized === 2) return { text: '故障', class: 'danger' }
  return { text: '—', class: 'muted' }
}
function statusText(value: unknown) {
  return statusMeta(value).text
}
function orgTypeText(value: unknown) {
  const map: Record<string, string> = { 1: '园区', 2: '企业', 3: '楼宇', 4: '楼层', 5: '区域' }
  return map[String(value)] || (isMissingValue(value) ? '—' : String(value))
}
function alarmTypeText(value: unknown) {
  const map: Record<string, string> = { 1: '越上限', 2: '越下限', 3: '离线', 4: '数据异常', 5: '用能异常' }
  return map[String(value)] || (isMissingValue(value) ? '—' : String(value))
}
function alarmLevelText(value: unknown) {
  const map: Record<string, string> = { 1: '低', 2: '中', 3: '高', 4: '严重' }
  return map[String(value)] || (isMissingValue(value) ? '—' : String(value))
}
function dealStatusText(value: unknown) {
  const map: Record<string, string> = { 0: '未处理', 1: '已处理', 2: '已忽略' }
  return map[String(value)] || (isMissingValue(value) ? '—' : String(value))
}
function workOrderStatusText(value: unknown) {
  const map: Record<string, string> = { PENDING: '待派单', ASSIGNED: '已派单', ACCEPTED: '已接单', PROCESSING: '处理中', VERIFYING: '待验收', CLOSED: '已关闭', CANCELLED: '已取消' }
  return map[String(value).toUpperCase()] || (isMissingValue(value) ? '未建单' : String(value))
}
function yesNoText(value: unknown) {
  const map: Record<string, string> = { 0: '否', 1: '是', true: '是', false: '否' }
  return map[String(value)] || (isMissingValue(value) ? '—' : String(value))
}
function archiveFieldValue(key: string, value: unknown) {
  if (isMissingValue(value)) return '—'
  if (key === 'alarm_type') return alarmTypeText(value)
  if (key === 'alarm_level') return alarmLevelText(value)
  if (key === 'deal_status') return dealStatusText(value)
  if (key === 'online_status' || key === 'status') return statusText(value)
  if (key === 'org_type') return orgTypeText(value)
  if (['enabled', 'deleted', 'billable', 'stat_enabled', 'required'].includes(key)) return yesNoText(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function toPointDraft(row: RecordRow = {}, index = 0): PointDraft {
  return {
    _draftKey: String(row.id || row._draftKey || `draft-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`),
    point_code: String(row.point_code || row.pointCode || ''),
    point_name: String(row.point_name || row.pointName || ''),
    data_type: String(row.data_type || row.dataType || 'DOUBLE'),
    unit: String(row.unit || ''),
    business_role: String(row.business_role || row.businessRole || 'INSTANT_VALUE'),
    billable: Number(row.billable ?? 0),
    stat_enabled: Number(row.stat_enabled ?? row.statEnabled ?? 1),
    sort: Number(row.sort ?? index),
    enabled: Number(row.enabled ?? 1),
  }
}

function emptyPointDraft(index = pointDrafts.value.length): PointDraft {
  return toPointDraft({ sort: index, data_type: 'DOUBLE', business_role: 'INSTANT_VALUE', billable: 0, stat_enabled: 1, enabled: 1 }, index)
}

function syncPointDrafts() {
  pointDrafts.value = pointDefinitions.value.map((row, index) => toPointDraft(row, index))
  pointEditor.value = emptyPointDraft(pointDrafts.value.length)
  pointEditingKey.value = ''
}

function addPointDraft() {
  pointEditor.value = emptyPointDraft(pointDrafts.value.length)
  pointEditingKey.value = ''
}

function editPointDraft(point: PointDraft) {
  pointEditor.value = { ...point }
  pointEditingKey.value = point._draftKey
}

async function confirmPointDraft() {
  if (!pointEditor.value) pointEditor.value = emptyPointDraft(pointDrafts.value.length)
  const previousDrafts = pointDrafts.value.map((point) => ({ ...point }))
  const previousEditor = { ...pointEditor.value }
  const previousEditingKey = pointEditingKey.value
  const draft = { ...pointEditor.value }
  if (!draft.point_code.trim() || !draft.point_name.trim()) {
    error.value = '测点编码和测点名称不能为空'
    return
  }
  if (pointEditingKey.value) {
    pointDrafts.value = pointDrafts.value.map((point) => point._draftKey === pointEditingKey.value ? { ...draft, _draftKey: point._draftKey } : point)
  } else {
    pointDrafts.value = [...pointDrafts.value, { ...draft, sort: pointDrafts.value.length }]
  }
  pointEditor.value = emptyPointDraft(pointDrafts.value.length)
  pointEditingKey.value = ''
  const saved = await persistPointDrafts()
  if (!saved) {
    pointDrafts.value = previousDrafts
    pointEditor.value = previousEditor
    pointEditingKey.value = previousEditingKey
  }
}

function syncAttributeDrafts() {
  attributeDrafts.value = modelAttributes.value.reduce<Record<string, string>>((acc, item) => {
    if (item.attribute_id != null) acc[String(item.attribute_id)] = String(item.attribute_value ?? '')
    return acc
  }, {})
}

async function saveAttributeOverrides() {
  const deviceId = detailDevice.value.id || selectedNode.value?.id || route.params.id
  if (!deviceId) return
  attributeSaving.value = true
  try {
    const values = modelAttributes.value
      .filter((item) => Number(item.allow_override) === 1)
      .map((item) => {
        const draft = attributeDrafts.value[String(item.attribute_id)] || ''
        return { attributeId: item.attribute_id, attributeValue: draft === String(item.template_value ?? '') ? '' : draft }
      })
    await saveDeviceAttributeOverrides(deviceId, values)
    profile.value = await deviceArchiveProfile(deviceId)
    syncPointDrafts()
    syncAttributeDrafts()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '实例属性保存失败'
  } finally {
    attributeSaving.value = false
  }
}

async function togglePointEnabled(point: PointDraft) {
  const previousDrafts = pointDrafts.value.map((item) => ({ ...item }))
  const previousEditor = pointEditor.value ? { ...pointEditor.value } : null
  point.enabled = Number(point.enabled) === 1 ? 0 : 1
  if (pointEditingKey.value === point._draftKey && pointEditor.value) {
    pointEditor.value.enabled = point.enabled
  }
  const saved = await persistPointDrafts()
  if (!saved) {
    pointDrafts.value = previousDrafts
    pointEditor.value = previousEditor
  }
}

async function removePointDraft(index: number) {
  const previousDrafts = pointDrafts.value.map((point) => ({ ...point }))
  const previousEditor = pointEditor.value ? { ...pointEditor.value } : null
  const previousEditingKey = pointEditingKey.value
  const removed = pointDrafts.value[index]
  pointDrafts.value = pointDrafts.value.filter((_, itemIndex) => itemIndex !== index)
  if (removed && pointEditingKey.value === removed._draftKey) addPointDraft()
  const saved = await persistPointDrafts()
  if (!saved) {
    pointDrafts.value = previousDrafts
    pointEditor.value = previousEditor
    pointEditingKey.value = previousEditingKey
  }
}

async function persistPointDrafts() {
  const typeId = detailDevice.value.device_type_id
  if (!typeId) {
    error.value = '请先为设备选择设备类型/型号'
    return false
  }
  const invalid = pointDrafts.value.find((point) => !point.point_code.trim() || !point.point_name.trim())
  if (invalid) {
    error.value = '测点编码和测点名称不能为空'
    return false
  }
  pointSaving.value = true
  try {
    const result = await saveDeviceTypePoints(typeId, {
      definitions: pointDrafts.value.map(({ _draftKey, ...point }, index) => ({ ...point, sort: index })),
      mappings: pointMappings.value,
    })
    profile.value = { ...profile.value, points: result }
    syncPointDrafts()
    return true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '测点保存失败'
    return false
  } finally {
    pointSaving.value = false
  }
}

async function savePointDrafts() {
  await persistPointDrafts()
}

function openParsePreview() {
  parsePreviewResult.value = null
  parsePreviewPayload.value = JSON.stringify({
    deviceSn: detailDevice.value.device_sn,
    collectTime: Date.now(),
    points: {},
  }, null, 2)
  parsePreviewDialog.value = true
}

async function runParsePreview() {
  const deviceId = detailDevice.value.id || selectedNode.value?.id || route.params.id
  if (!deviceId) return
  parsePreviewBusy.value = true
  try {
    const source = JSON.parse(parsePreviewPayload.value) as RecordRow
    const meters = Array.isArray(source.meters) ? source.meters as RecordRow[] : []
    const meter = source.meter && typeof source.meter === 'object'
      ? source.meter as RecordRow
      : (meters.find((item) => String(item.deviceSn || item.device_sn || '') === String(detailDevice.value.device_sn || '')) || meters[0] || source)
    if (!meter.deviceSn && !meter.device_sn) meter.deviceSn = String(detailDevice.value.device_sn || '')
    parsePreviewResult.value = await parseDevicePayloadPreview({ deviceId: Number(deviceId), meter })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '样例报文解析失败'
  } finally {
    parsePreviewBusy.value = false
  }
}

async function selectNode(node: TreeNode) {
  const selectionToken = ++selectionRequestToken.value
  selectedNode.value = node
  sessionStorage.setItem(archiveSelectionStorageKey, nodeKey(node))
  profile.value = {}
  hourlyMetricRows.value = []
  realtimeMetricRows.value = []
  periodHistoryRows.value = []
  metricRequestToken.value += 1
  disposeArchiveCharts()
  profileLoading.value = true
  error.value = ''
  try {
    if (node.nodeType === 'DEVICE') {
      const nextProfile = await deviceArchiveProfile(node.id)
      if (selectionToken !== selectionRequestToken.value) return
      profile.value = nextProfile
      syncPointDrafts()
      syncAttributeDrafts()
      await syncMetricSelection()
      activeArchiveTab.value = 'device'
      dataView.value = 'chart'
      await loadMetricView(selectionToken)
    } else if (node.nodeType === 'GATEWAY') {
      const nextProfile = await gatewayArchiveProfile(node.id)
      if (selectionToken !== selectionRequestToken.value) return
      profile.value = nextProfile
      pointDrafts.value = []
      pointEditor.value = null
      pointEditingKey.value = ''
      activeArchiveTab.value = 'device'
      dataView.value = 'chart'
    } else if (node.nodeType === 'ORG') {
      const nextProfile = await orgArchiveProfile(node.id)
      if (selectionToken !== selectionRequestToken.value) return
      profile.value = nextProfile
      pointDrafts.value = []
      pointEditor.value = null
      pointEditingKey.value = ''
      activeArchiveTab.value = 'device'
      dataView.value = 'chart'
      await loadMetricView(selectionToken)
    } else {
      if (selectionToken !== selectionRequestToken.value) return
      const deviceCount = nodeChildren(node).filter((item) => item.nodeType === 'DEVICE').length
      profile.value = node.nodeType === 'SPACE'
        ? { space: node, summary: { deviceCount } }
        : { group: node, summary: { deviceCount } }
      pointDrafts.value = []
      activeArchiveTab.value = 'device'
      dataView.value = 'table'
    }
  } catch (e) {
    if (selectionToken !== selectionRequestToken.value) return
    error.value = e instanceof Error ? e.message : '读取节点失败'
    profile.value = {}
  } finally {
    if (selectionToken === selectionRequestToken.value) {
      profileLoading.value = false
      await renderCharts()
    }
  }
}

function openOrg(parentId?: unknown, row?: RecordRow) {
  formType.value = 'org'
  editingId.value = row?.id || null
  Object.assign(form, {
    parent_id: parentId ?? row?.parent_id ?? 0,
    org_name: row?.org_name || '',
    org_type: row?.org_type || 1,
    leader: row?.leader || '',
    phone: row?.phone || '',
    address: row?.address || '',
    sort: row?.sort || 0,
  })
  selectedOrgTreeKey.value = form.parent_id ? `ORG:${form.parent_id}` : ''
  dialog.value = true
}
function openGateway(orgId?: unknown, row?: RecordRow) {
  formType.value = 'gateway'
  editingId.value = row?.id || null
  Object.assign(form, {
    gateway_sn: row?.gateway_sn || '',
    gateway_name: row?.gateway_name || '',
    mqtt_secret: row?.mqtt_secret || 'secret',
    org_id: orgId ?? row?.org_id ?? '',
    install_location: row?.install_location || '',
    ip_address: row?.ip_address || '',
    heartbeat_interval: row?.heartbeat_interval || 60,
    status: row?.status ?? 1,
  })
  selectedOrgTreeKey.value = form.org_id ? `ORG:${form.org_id}` : ''
  dialog.value = true
}
function openDevice(gateway?: RecordRow, row?: RecordRow) {
  formType.value = 'device'
  editingId.value = row?.id || null
  deviceWizardStep.value = 1
  wizardError.value = ''
  wizardModelKeyword.value = ''
  wizardOrgKeyword.value = ''
  wizardTemplate.value = {}
  Object.assign(form, {
    device_sn: row?.device_sn || '',
    device_name: row?.device_name || '',
    gateway_id: row?.gateway_id || gateway?.id || '',
    org_id: row?.org_id || gateway?.org_id || '',
    device_type_id: row?.device_type_id || '',
    model_version_id: row ? (row.model_version_id || '') : '',
    space_id: row?.space_id || '',
    protocol_addr: row?.protocol_addr || '',
    install_location: row?.install_location || '',
    device_model: row?.device_model || '',
    install_time: row?.install_time || '',
    collect_interval_seconds: Number(row?.collect_interval_seconds || 300),
    quality_threshold_pct: Number(row?.quality_threshold_pct || 95),
    settlement_enabled: Number(row?.settlement_enabled ?? 0),
    meter_role: String(row?.meter_role || 'INTERNAL'),
    meter_factor: Number(row?.meter_factor || 1),
    quality_gate_start_date: normalizeDateInput(row?.quality_gate_start_date),
    status: row?.status ?? 1,
  })
  editingGatewayId.value = row?.gateway_id ? String(row.gateway_id) : ''
  const selectedOption = modelOptions.value.find((item) => String(item.model_version_id) === String(form.model_version_id))
  selectedModelTreeKey.value = selectedOption?.model_version_id ? `VERSION:${selectedOption.model_version_id}` : ''
  selectedOrgTreeKey.value = form.org_id ? `ORG:${form.org_id}` : ''
  dialog.value = true
}

function openDiscoveredDeviceFromRoute() {
  if (mode.value !== 'devices' || dialog.value || editingId.value || !route.query.discoveryId) return
  const deviceSn = String(route.query.deviceSn || '').trim()
  if (!deviceSn) return
  openDevice()
  form.device_sn = deviceSn
  form.protocol_addr = String(route.query.protocolAddr || '').trim()
  form.gateway_id = String(route.query.gatewayId || '').trim()
}

function selectDialogOrg(node: RecordRow) {
  if (node.nodeType === 'GATEWAY' && formType.value === 'device') {
    form.org_id = String(node.org_id)
    form.gateway_id = String(node.id)
    form.protocol_addr = ''
    selectedOrgTreeKey.value = String(node.key)
    return
  }
  if (node.nodeType !== 'ORG') return
  selectedOrgTreeKey.value = String(node.key)
  if (formType.value === 'org') form.parent_id = String(node.id)
  else {
    form.org_id = String(node.id)
    const gateway = gatewayOptions.value.find((item) => String(item.id) === String(form.gateway_id))
    if (gateway && String(gateway.org_id) !== String(form.org_id)) form.gateway_id = ''
  }
}

function clearDialogGateway() {
  form.gateway_id = ''
  form.protocol_addr = ''
}

function clearDialogOrg() {
  selectedOrgTreeKey.value = ''
  if (formType.value === 'org') form.parent_id = 0
  else {
    form.org_id = ''
    if (formType.value === 'device') form.gateway_id = ''
  }
}

function applyModelDefaults() {
  const option = modelOptions.value.find((item) => String(item.model_version_id) === String(form.model_version_id))
  if (!option || editingId.value) return
  form.device_type_id = option.device_type_id == null ? '' : String(option.device_type_id)
  form.device_model = String(option.model_code || '')
  form.collect_interval_seconds = Number(option.collect_interval_seconds || 300)
  form.quality_threshold_pct = Number(option.quality_threshold_pct || 95)
  if (!form.device_name) form.device_name = String(option.model_name || '')
}

async function selectPublishedModel(node: RecordRow) {
  if (node.nodeType !== 'VERSION' || String(node.versionStatus) !== 'PUBLISHED' || !node.versionId) return
  selectedModelTreeKey.value = String(node.key)
  form.model_version_id = String(node.versionId)
  applyModelDefaults()
  try {
    wizardTemplate.value = await catalogModel(node.modelId, node.versionId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '型号模板读取失败'
    wizardError.value = error.value
  }
}

function validateDeviceWizardStep(step: number) {
  if (step === 1) {
    const deviceSn = String(form.device_sn || '').trim()
    const deviceName = String(form.device_name || '').trim()
    if (!deviceSn) {
      wizardError.value = '第一步未完成：设备编号不能为空。'
      error.value = wizardError.value
      return false
    }
    if (deviceSn.length > 128) {
      wizardError.value = '第一步未完成：设备编号不能超过 128 个字符。'
      error.value = wizardError.value
      return false
    }
    if (deviceName.length > 128) {
      wizardError.value = '第一步未完成：设备名称不能超过 128 个字符。'
      error.value = wizardError.value
      return false
    }
    if (![0, 1].includes(Number(form.status))) {
      wizardError.value = '第一步未完成：启用状态值无效，请重新选择。'
      error.value = wizardError.value
      return false
    }
    return true
  }
  if (step === 2) {
    if (!form.model_version_id || !selectedPublishedModel.value) {
      wizardError.value = '第二步未完成：请选择一个已发布且仍可用的型号版本。'
      error.value = wizardError.value
      return false
    }
    return true
  }
  // 留空时由后端按当前用户的默认最外层组织解析，前端不替用户猜组织。
  return true
}

async function submitDeviceWizard() {
  wizardError.value = ''
  error.value = ''
  try {
    const step = Number(deviceWizardStep.value)
    if (![1, 2, 3].includes(step)) {
      throw new Error('设备登记步骤状态无效，请关闭弹窗后重新打开。')
    }
    if (!validateDeviceWizardStep(step)) return
    if (step === 3 && form.gateway_id && selectedModelIsModbus.value && !String(form.protocol_addr || '').trim()) {
      protocolAddressDraft.value = ''
      protocolAddressDialog.value = true
      return
    }
    if (step < 3) {
      deviceWizardStep.value = step + 1
      await nextTick()
      return
    }
    await saveForm()
  } catch (e) {
    wizardError.value = e instanceof Error ? e.message : '下一步执行失败，请检查输入后重试。'
    error.value = wizardError.value
  }
}

async function confirmProtocolAddress() {
  const address = Number(protocolAddressDraft.value)
  if (!Number.isInteger(address) || address < 1 || address > 247) {
    wizardError.value = '从站地址必须是 1-247 的整数。'
    error.value = wizardError.value
    return
  }
  form.protocol_addr = String(address)
  protocolAddressDialog.value = false
  await saveForm()
}

async function submitDialog() {
  if (formType.value === 'device' && !editingId.value) {
    await submitDeviceWizard()
    return
  }
  await saveForm()
}

function onlyPublishedModels(nodes: RecordRow[]): RecordRow[] {
  const result: RecordRow[] = []
  const walk = (items: RecordRow[], path: string[]) => {
    for (const node of items) {
      const children = Array.isArray(node.children) ? node.children as RecordRow[] : []
      if (node.nodeType === 'MODEL') {
        const versions = children
          .filter((child) => child.nodeType === 'VERSION' && String(child.versionStatus) === 'PUBLISHED' && child.versionId)
          .map((child) => ({ ...child, children: [] }))
        if (versions.length) {
          result.push({ ...node, code: path.join(' / '), displayPath: path.join(' / '), children: versions })
        }
      } else {
        walk(children, node.label ? [...path, String(node.label)] : path)
      }
    }
  }
  walk(nodes, [])
  return result
}

function openAddBySelection() {
  if (!selectedNode.value) return openOrg(0)
  if (selectedNode.value.nodeType === 'ORG') return openOrg(selectedNode.value.id)
  if (selectedNode.value.nodeType === 'GATEWAY') return openGateway(selectedNode.value.org_id)
}
function openGatewayForSelectedOrg() {
  if (!selectedNode.value || selectedNode.value.nodeType !== 'ORG') return
  openGateway(selectedNode.value.id)
}
function editSelected() {
  if (!selectedNode.value) return
  if (selectedNode.value.nodeType === 'ORG') openOrg(undefined, selectedNode.value)
  else if (selectedNode.value.nodeType === 'GATEWAY') openGateway(undefined, selectedNode.value)
  else if (selectedNode.value.nodeType === 'DEVICE') openDevice(undefined, Object.keys(detailDevice.value).length ? detailDevice.value : selectedNode.value)
}
async function duplicateSelection() {
  if (!selectedNode.value) return
  try {
    const copied = await copyResource('archive', nodeResource(selectedNode.value), selectedNode.value.id)
    await loadTree()
    const copiedNode = { ...copied, nodeType: selectedNode.value.nodeType } as TreeNode
    await selectNode(copiedNode)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '复制失败'
  }
}
function deleteSelected() {
  if (!selectedNode.value) return
  deletingNodeRef.value = selectedNode.value
  deleteDialog.value = true
}
async function confirmDeleteNode() {
  if (!deletingNodeRef.value) return
  deleting.value = true
  try {
    await removeResource('archive', nodeResource(deletingNodeRef.value), deletingNodeRef.value.id)
    deleteDialog.value = false
    deletingNodeRef.value = null
    if (mode.value === 'device-detail') await router.replace('/device-archive/devices')
    else await loadTree()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    deleting.value = false
  }
}
async function saveForm() {
  try {
    const resource = formType.value === 'org' ? 'orgs' : formType.value === 'gateway' ? 'gateways' : 'devices'
    const payload = formPayload()
    if (editingId.value && formType.value === 'device') {
      delete payload.device_type_id
      delete payload.model_version_id
      delete payload.device_model
      delete payload.collect_interval_seconds
      delete payload.quality_threshold_pct
      await updateDeviceContext(editingId.value, payload)
    }
    else if (editingId.value) await updateResource('archive', resource, editingId.value, payload)
    else if (formType.value === 'device') {
      const created = await provisionDevice(payload)
      const discoveryId = String(route.query.discoveryId || '').trim()
      if (discoveryId && created.id) {
        await bindDiscoveredDevice(discoveryId, { deviceId: created.id, remark: '已通过设备档案登记并绑定' })
        const rawLogId = String(route.query.rawLogId || '').trim()
        const query = { ...route.query }
        delete query.discoveryId
        delete query.deviceSn
        delete query.gatewayId
        delete query.protocolAddr
        delete query.rawLogId
        await router.replace({ query })
        if (rawLogId) {
          try {
            await replayAccessRawMessage(rawLogId)
          } catch (e) {
            error.value = `设备已建档并绑定，但样例报文重放失败：${e instanceof Error ? e.message : '请在接入监测页面手动重放'}`
          }
        }
      }
    }
    else await createResource('archive', resource, payload)
    dialog.value = false
    await loadAll()
  } catch (e) {
    const message = e instanceof Error ? e.message : '保存失败'
    error.value = message
    if (formType.value === 'device' && !editingId.value) wizardError.value = message
  }
}

function formPayload() {
  const payload = { ...form } as RecordRow
  if (formType.value === 'device') {
    if (!payload.gateway_id) {
      if (editingId.value) payload.gateway_id = null
      else delete payload.gateway_id
    }
    // 设备所属空间是合同选表和空间能耗分析的基础关系，必须随设备档案保存。
    if (!payload.space_id) payload.space_id = null
    if (!payload.install_time) delete payload.install_time
  }
  return payload
}

async function loadBindingDevices() {
  bindingLoading.value = true
  try {
    const page = await listResource('archive', 'devices', { pageSize: 500, keyword: bindingKeyword.value })
    bindingDevices.value = withDeviceLookupLabels(page.records, {
      orgs: orgOptions.value,
      gateways: gatewayOptions.value,
      deviceTypes: typeOptions.value,
    })
  } finally {
    bindingLoading.value = false
  }
}

function openBindDevices() {
  if (!selectedNode.value || !['ORG', 'GATEWAY'].includes(selectedNode.value.nodeType)) return
  bindingTarget.value = selectedNode.value
  bindingDeviceIds.value = []
  bindingKeyword.value = ''
  bindDialog.value = true
  void loadBindingDevices()
}

function toggleBindingDevice(id: unknown, checked: boolean) {
  const value = String(id)
  bindingDeviceIds.value = checked ? [...new Set([...bindingDeviceIds.value, value])] : bindingDeviceIds.value.filter((item) => item !== value)
}

async function submitBindDevices() {
  const target = bindingTarget.value
  if (!target || !['ORG', 'GATEWAY'].includes(target.nodeType)) return
  if (!bindingDeviceIds.value.length) {
    error.value = '请选择需要绑定的设备'
    return
  }
  try {
    if (target.nodeType === 'GATEWAY') {
      await bindDevicesToGateway(target.id, bindingDeviceIds.value)
    } else {
      await Promise.all(bindingDeviceIds.value.map(async (id) => {
        await updateDeviceContext(id, { org_id: target.id, gateway_id: null })
      }))
    }
    bindDialog.value = false
    await loadAll()
    const node = findNodeByKey(tree.value, nodeKey(selectedNode.value as TreeNode))
    if (node) await selectNode(node)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '绑定设备失败'
  }
}

async function loadLookups() {
  const [roots, orgs, gateways, types, spaces, publishedModels, productTree] = await Promise.all([
    rootOrgs(),
    resourceOptions('orgs'),
    resourceOptions('gateways'),
    resourceOptions('device-types'),
    resourceOptions('spaces'),
    publishedModelOptions(),
    catalogTree(),
  ])
  rootOrgOptions.value = roots
  orgOptions.value = orgs
  gatewayOptions.value = gateways
  typeOptions.value = types
  spaceOptions.value = spaces
  modelOptions.value = publishedModels
  publishedCatalogTree.value = onlyPublishedModels(productTree)
  const firstRoot = roots[0]
  if (!selectedRootOrgId.value && firstRoot) {
    ignoreNextTreeWatch = true
    selectedRootOrgId.value = String(firstRoot.id)
  }
}

async function loadTree() {
  if (mode.value !== 'org-tree') return
  const requestVersion = ++treeRequestVersion
  treeLoading.value = true
  try {
    const rows = await deviceTree({
      rootOrgId: selectedRootOrgId.value || undefined,
      keyword: treeKeyword.value || undefined,
    })
    if (requestVersion !== treeRequestVersion) return
    tree.value = attachGatewayNodes(rows as TreeNode[])
    expandedKeys.value = treeKeyword.value ? collectExpanded(tree.value) : collectInitialExpanded(tree.value)
    const currentKey = selectedNode.value ? nodeKey(selectedNode.value) : ''
    const rememberedKey = currentKey || sessionStorage.getItem(archiveSelectionStorageKey) || ''
    const nextSelected = rememberedKey ? findNodeByKey(tree.value, rememberedKey) : null
    selectedNode.value = currentKey ? nextSelected : null
    if (!currentKey && nextSelected) {
      await selectNode(nextSelected)
      return
    }
    if (!selectedNode.value) profile.value = {}
    await renderCharts()
  } finally {
    if (requestVersion === treeRequestVersion) treeLoading.value = false
  }
}

async function loadTreeSkeleton() {
  if (mode.value !== 'org-tree' || treeKeyword.value) return
  const requestVersion = ++treeRequestVersion
  treeLoading.value = true
  try {
    const rows = await deviceTree({
      rootOrgId: selectedRootOrgId.value || undefined,
      depth: 'org',
    })
    if (requestVersion !== treeRequestVersion) return
    tree.value = attachGatewayNodes(rows as TreeNode[])
    expandedKeys.value = collectInitialExpanded(tree.value)
  } finally {
    if (requestVersion === treeRequestVersion) treeLoading.value = false
  }
}

async function loadDevices() {
  deviceListLoading.value = true
  const params = {
    pageSize: 500,
    keyword: deviceKeyword.value || undefined,
    orgIds: deviceRootOrgIds.value.length ? deviceRootOrgIds.value.join(',') : undefined,
    includeChildren: deviceRootOrgIds.value.length ? 'true' : undefined,
  }
  try {
    const page = await deviceCards({ ...params, gatewayIds: deviceGatewayIds.value.join(',') || undefined })
    devices.value = page.records
  } finally {
    deviceListLoading.value = false
  }
}

function toggleDeviceRootOrg(id: unknown, checked: boolean) {
  const value = String(id)
  deviceRootOrgIds.value = checked ? [...new Set([...deviceRootOrgIds.value, value])] : deviceRootOrgIds.value.filter((item) => item !== value)
  const availableGatewayIds = new Set(deviceGatewayFilterOptions.value.map((gateway) => String(gateway.id)))
  deviceGatewayIds.value = deviceGatewayIds.value.filter((gatewayId) => availableGatewayIds.has(gatewayId))
  void loadDevices()
}

function toggleDeviceGateway(id: unknown, checked: boolean) {
  const value = String(id)
  deviceGatewayIds.value = checked ? [...new Set([...deviceGatewayIds.value, value])] : deviceGatewayIds.value.filter((item) => item !== value)
  void loadDevices()
}

function toggleDetailFilter(kind: 'attribute' | 'point', value: string, checked: boolean) {
  const target = kind === 'attribute' ? attributeGroupFilters : pointRoleFilters
  target.value = checked ? [...new Set([...target.value, value])] : target.value.filter((item) => item !== value)
}

function metricPointCode(item: RecordRow) {
  return String(item.point_code || item.pointCode || item.code || '')
}
async function readMetricTemplates() {
  try {
    metricTemplates.value = await loadMetricTemplatesApi()
  } catch {
    metricTemplates.value = []
  }
}
async function syncMetricSelection() {
  await readMetricTemplates()
  const available = metricPointOptions.value.map(metricPointCode).filter(Boolean)
  const valid = selectedMetricPointCodes.value.filter((code) => available.includes(code))
  selectedMetricPointCodes.value = valid.length ? valid : available
  metricTemplateId.value = ''
}
function toggleMetricPointGroup(group: string, checked: boolean) {
  metricPointGroupFilters.value = checked ? [...new Set([...metricPointGroupFilters.value, group])] : metricPointGroupFilters.value.filter((item) => item !== group)
}
function setAlarmColumnFilter(column: string, checked: boolean) {
  alarmColumnFilters.value = checked ? [...new Set([...alarmColumnFilters.value, column])] : alarmColumnFilters.value.filter((item) => item !== column)
  if (!alarmColumnFilters.value.length) alarmColumnFilters.value = ['alarm_time', 'device_name', 'alarm_type', 'alarm_level', 'point_code', 'deal_status', 'work_order_no', 'work_order_status']
  alarmPage.value = 1
}
function selectMetricTemplate(id: string) {
  if (!id) return
  applyMetricTemplateById(id)
}
async function removeMetricTemplate(id: string) {
  try { await deleteMetricTemplate(id) } catch (e) { error.value = e instanceof Error ? e.message : '模板删除失败'; return }
  metricTemplates.value = metricTemplates.value.filter((item) => String(item.id) !== String(id))
  if (metricTemplateId.value === String(id)) {
    metricTemplateId.value = ''
    await syncMetricSelection()
  }
}
function applyMetricTemplate(template: RecordRow) {
  const raw = template.point_codes ?? template.pointCodes ?? []
  let codes: string[] = []
  try { codes = Array.isArray(raw) ? raw.map(String) : JSON.parse(String(raw || '[]')) } catch { codes = [] }
  selectedMetricPointCodes.value = codes.filter((code) => metricPointOptions.value.some((point) => metricPointCode(point) === code))
  if (!selectedMetricPointCodes.value.length) selectedMetricPointCodes.value = metricPointOptions.value.map(metricPointCode).filter(Boolean)
  metricTemplateId.value = String(template.id || '')
  void loadMetricView()
}
function applyMetricTemplateById(value: unknown) {
  applyMetricTemplate(metricTemplates.value.find((item) => String(item.id) === String(value)) || {})
}
async function saveMetricTemplate() {
  const name = metricTemplateName.value.trim()
  if (!name || !selectedMetricPointCodes.value.length) return
  const next = await saveMetricTemplateApi({
    template_name: name,
    device_type_id: detailDevice.value.device_type_id,
    point_codes: [...selectedMetricPointCodes.value],
    org_id: detailDevice.value.org_id || selectedNode.value?.org_id,
    all_points: 0,
  }).catch((e) => { error.value = e instanceof Error ? e.message : '模板保存失败'; return null })
  if (!next) return
  metricTemplates.value = [next, ...metricTemplates.value.filter((item) => String(item.id) !== String(next.id))]
  metricTemplateId.value = String(next.id)
  metricTemplateName.value = ''
  metricTemplateDialog.value = false
}
function setHistoryGranularity(value: HistoryGranularity) {
  if (historyGranularity.value === value && !metricLoading.value) {
    void loadMetricView()
    return
  }
  historyGranularity.value = value
  hourlyMetricRows.value = []
  periodHistoryRows.value = []
  void loadMetricView()
}
function shiftHistoryPeriod(delta: number) {
  if (historyGranularity.value === 'total') return
  const anchor = new Date(`${historyAnchor.value}T00:00:00`)
  if (historyGranularity.value === 'day') anchor.setDate(anchor.getDate() + delta)
  else if (historyGranularity.value === 'week') anchor.setDate(anchor.getDate() + delta * 7)
  else if (historyGranularity.value === 'month') anchor.setMonth(anchor.getMonth() + delta)
  else anchor.setFullYear(anchor.getFullYear() + delta)
  historyAnchor.value = formatDateInput(anchor)
  void loadMetricView()
}
function aggregateHistoryRows(rows: RecordRow[], granularity: HistoryGranularity = historyGranularity.value) {
  const grouped = new Map<string, RecordRow>()
  rows.forEach((row) => {
    const point = String(row.point_code || row.pointCode || '总用量')
    const rawValue = String(row.stat_date || row.stat_period || row.stat_month || row.stat_time || row.collect_time || '')
    const rawDate = rawValue.slice(0, 10)
    const parsed = rawDate ? new Date(`${rawDate}T00:00:00`) : null
    let bucket = rawDate
    if (granularity === 'year') bucket = rawValue.slice(0, 7)
    else if (granularity === 'total') bucket = '总量'
    if (!bucket || (parsed && Number.isNaN(parsed.getTime()))) return
    const key = `${bucket}::${point}`
    const current = grouped.get(key) || { stat_period: bucket, stat_date: bucket, point_code: point, usage_value: 0 }
    current.usage_value = Number(current.usage_value || 0) + Number(row.usage_value ?? row.value ?? row.avg_value ?? 0)
    grouped.set(key, current)
  })
  return [...grouped.values()]
}
function normalizeStatisticsRows(result: unknown): RecordRow[] {
  if (Array.isArray(result)) return result as RecordRow[]
  if (result && typeof result === 'object') {
    const payload = result as RecordRow
    if (Array.isArray(payload.records)) return payload.records as RecordRow[]
    if (Array.isArray(payload.rows)) return payload.rows as RecordRow[]
    if (Array.isArray(payload.data)) return payload.data as RecordRow[]
  }
  return []
}
async function loadMetricView(selectionToken?: number) {
  const requestToken = ++metricRequestToken.value
  const nodeKeyAtRequest = selectedNode.value ? nodeKey(selectedNode.value) : ''
  const isCurrentSelection = () =>
    requestToken === metricRequestToken.value &&
    (!selectionToken || selectionToken === selectionRequestToken.value) &&
    (!nodeKeyAtRequest || nodeKeyAtRequest === (selectedNode.value ? nodeKey(selectedNode.value) : ''))
  const deviceId = detailDevice.value.id || selectedNode.value?.id || route.params.id
  const orgId = selectedIsOrg.value ? selectedNode.value?.id : undefined
  if ((!deviceId && !orgId) || (!selectedMetricPointCodes.value.length && !orgId)) {
    if (isCurrentSelection()) {
      hourlyMetricRows.value = []
      realtimeMetricRows.value = []
      periodHistoryRows.value = []
    }
    return
  }
  metricLoading.value = true
  periodHistoryRows.value = []
  const { start, end } = historyPeriod.value
  const granularity = historyGranularity.value
  try {
    const historyPath = granularity === 'day'
      ? 'hourly'
      : granularity === 'year' || granularity === 'total'
        ? 'monthly'
        : 'daily/summary'
    const queryRows = async (path: string, startDate: string, endDate: string) => [await statistics(path, orgId
      ? { orgId, startDate, endDate }
      : { deviceId, pointCodes: selectedMetricPointCodes.value.join(','), startDate, endDate })]
    const realtimeStart = daysAgo(1)
    const [responses, realtimeResponses] = await Promise.all([
      queryRows(historyPath, start, end),
      orgId ? Promise.resolve([]) : queryRows('hourly', realtimeStart, formatDateInput(new Date())).catch(() => []),
    ])
    if (!isCurrentSelection()) return
    const rows = responses.flatMap(normalizeStatisticsRows)
    const realtimeRows = realtimeResponses.flatMap(normalizeStatisticsRows)
    hourlyMetricRows.value = rows
      .map((row): RecordRow => ({ ...row, value: row.usage_value ?? row.avg_value ?? row.value }))
      .sort((a: RecordRow, b: RecordRow) => String(a.stat_period || a.stat_date).localeCompare(String(b.stat_period || b.stat_date)))
    realtimeMetricRows.value = realtimeRows
      .map((row): RecordRow => ({ ...row, value: row.usage_value ?? row.avg_value ?? row.value }))
      .sort((a: RecordRow, b: RecordRow) => String(a.stat_period || a.stat_date).localeCompare(String(b.stat_period || b.stat_date)))
    periodHistoryRows.value = granularity === 'day' ? hourlyMetricRows.value : aggregateHistoryRows(hourlyMetricRows.value, granularity)
  } catch (e) {
    if (!isCurrentSelection()) return
    error.value = e instanceof Error ? e.message : '设备计量趋势读取失败'
    hourlyMetricRows.value = []
    realtimeMetricRows.value = []
    periodHistoryRows.value = []
  } finally {
    if (!isCurrentSelection()) return
    metricLoading.value = false
    await nextTick()
    await renderCharts()
  }
}

async function loadDetail() {
  const id = route.params.id
  if (!id) return
  if (detailContextTimer) clearTimeout(detailContextTimer)
  const requestVersion = ++detailRequestVersion
  profile.value = await deviceProfile(id)
  if (requestVersion !== detailRequestVersion) return
  syncPointDrafts()
  syncAttributeDrafts()
  void syncMetricSelection().then(() => loadMetricView())
  const detail = profile.value as RecordRow & { device?: RecordRow }
  selectedNode.value = {
    id,
    nodeType: 'DEVICE',
    device_name: detail.device_name || detail.device?.device_name || '',
    device_sn: detail.device_sn || detail.device?.device_sn || String(id),
    gateway_id: detail.device?.gateway_id || detail.gateway_id,
    org_id: detail.device?.org_id || detail.org_id,
  } as TreeNode
  activeArchiveTab.value = 'device'
  detailWorkspaceTab.value = 'overview'
  dataView.value = 'chart'
  void renderCharts()
  detailContextTimer = setTimeout(() => { void loadDetailContext(id, requestVersion) }, 700)
}

async function loadDetailContext(id: string | string[], requestVersion: number) {
  try {
    const fullProfile = await deviceArchiveProfile(id)
    if (requestVersion !== detailRequestVersion) return
    profile.value = fullProfile
    syncPointDrafts()
    syncAttributeDrafts()
    await nextTick()
    await renderCharts()
  } catch {
    // The primary detail and health workspace remain usable when deferred context fails.
  }
}

async function toggleDeviceSettlement() {
  const deviceId = detailDevice.value.id || route.params.id
  if (!deviceId || settlementSwitching.value) return
  const enabled = Number(detailDevice.value.settlement_enabled || 0) === 1
  settlementSwitching.value = true
  try {
    await updateDeviceContext(deviceId, {
      settlement_enabled: enabled ? 0 : 1,
      meter_role: enabled ? (detailDevice.value.meter_role || 'INTERNAL') : 'SETTLEMENT',
      meter_factor: Number(detailDevice.value.meter_factor || 1),
      quality_gate_start_date: normalizeDateInput(detailDevice.value.quality_gate_start_date),
    })
    profile.value = await deviceArchiveProfile(deviceId)
    await loadMetricView()
    await nextTick()
    await renderCharts()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '设备计费状态修改失败'
  } finally {
    settlementSwitching.value = false
  }
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const lookupPromise = mode.value === 'org-tree' ? loadLookups() : null
    if (mode.value === 'org-tree') {
      await Promise.all([lookupPromise as Promise<void>, loadTreeSkeleton()])
      await loadTree()
    }
    else {
      if (mode.value === 'devices') {
        await loadDevices()
        void loadLookups()
      } else {
        await loadDetail()
        void loadLookups()
      }
      openDiscoveredDeviceFromRoute()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '设备档案读取失败'
  } finally {
    loading.value = false
  }
}

async function refreshSelected() {
  if (!selectedNode.value) {
    await loadTree()
    return
  }
  await selectNode(selectedNode.value)
}

function expandAll() {
  expandedKeys.value = collectExpanded(tree.value)
}
function collapseAll() {
  expandedKeys.value = new Set()
}
function toggleNode(node: TreeNode) {
  const keys = new Set(expandedKeys.value)
  const key = nodeKey(node)
  if (keys.has(key)) keys.delete(key)
  else keys.add(key)
  expandedKeys.value = keys
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
function lineOption(labels: string[], values: number[], name: string): EChartsCoreOption {
  const { graphic } = chartRuntime as BasicChartRuntime
  const accent = cssVar('--accent', '#2f86ff')
  const muted = cssVar('--muted', '#758195')
  const border = cssVar('--border', '#dfe4ec')
  return {
    color: [accent],
    grid: { left: 10, right: 12, top: 18, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` },
    xAxis: { type: 'category', boundaryGap: false, data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 10 } },
    yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: border, type: 'dashed' } }, axisLabel: { color: muted, fontSize: 10 } },
    series: [{ name, type: 'line', smooth: true, symbolSize: 7, data: values, areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(47, 134, 255, .22)' }, { offset: 1, color: 'rgba(47, 134, 255, 0)' }]) }, lineStyle: { width: 3 } }],
  }
}
function barOption(labels: string[], values: number[], name: string): EChartsCoreOption {
  const accent = cssVar('--accent', '#2f86ff')
  const muted = cssVar('--muted', '#758195')
  const border = cssVar('--border', '#dfe4ec')
  return {
    color: [accent],
    grid: { left: 10, right: 12, top: 18, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: border, type: 'dashed' } }, axisLabel: { color: muted, fontSize: 10 } },
    series: [{ name, type: 'bar', barWidth: 18, data: values }],
  }
}
function chartHasSize(el: HTMLElement | null): el is HTMLElement {
  return Boolean(el && el.isConnected && el.offsetWidth > 0 && el.offsetHeight > 0)
}
function ensureChartInstance(current: ECharts | null, el: HTMLElement) {
  if (current && current.getDom() === el) return current
  current?.dispose()
  return (chartRuntime as BasicChartRuntime).init(el)
}
function multiLineOption(labels: string[], seriesKeys: string[], rows: Array<{ time: string; values: Record<string, unknown> }>): EChartsCoreOption {
  const { graphic } = chartRuntime as BasicChartRuntime
  const muted = cssVar('--muted', '#758195')
  const border = cssVar('--border', '#dfe4ec')
  const palette = ['#2f86ff', '#13b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#22c55e']
  return {
    color: palette,
    grid: { left: 10, right: 12, top: 18, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0, textStyle: { color: muted, fontSize: 11 } },
    xAxis: { type: 'category', boundaryGap: false, data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: border, type: 'dashed' } }, axisLabel: { color: muted, fontSize: 10 } },
    series: seriesKeys.map((key, index) => ({
      name: key,
      type: 'line',
      smooth: true,
      symbolSize: 6,
      showSymbol: false,
      data: rows.map((row) => isMissingValue(row.values[key]) ? null : Number(row.values[key])),
      lineStyle: { width: 2.5 },
      areaStyle: index === 0 ? { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(47, 134, 255, .18)' }, { offset: 1, color: 'rgba(47, 134, 255, 0)' }]) } : undefined,
    })),
  }
}
async function renderCharts() {
  chartRuntime ??= await loadBasicChartRuntime()
  const token = ++renderToken
  await waitForPaint()
  if (token !== renderToken) return
  if (activeArchiveTab.value === 'device') {
    const isDetail = mode.value === 'device-detail'
    const isDeviceTree = selectedIsDevice.value && !isDetail
    const shouldRenderDeviceChart = selectedIsDevice.value || isDetail
    const chartEl = isDetail ? detailRealtimeChartEl.value : isDeviceTree ? deviceRealtimeChartEl.value : overviewRealtimeChartEl.value
    const chartRef = isDetail ? detailRealtimeChart : isDeviceTree ? deviceRealtimeChart : overviewRealtimeChart
    if (chartHasSize(chartEl)) {
      const chart = ensureChartInstance(chartRef, chartEl)
      if (isDetail) detailRealtimeChart = chart
      else if (isDeviceTree) deviceRealtimeChart = chart
      else overviewRealtimeChart = chart
      if (shouldRenderDeviceChart) {
        if (deviceRealtimeChartRows.value.length) {
          const labels = deviceRealtimeChartRows.value.map((item) => item.time)
          const seriesKeys = deviceRealtimeSeriesKeys.value
          chart.setOption(
            seriesKeys.length
              ? multiLineOption(labels, seriesKeys, deviceRealtimeChartRows.value)
              : lineOption(energyTrend.value.map((item) => String(item.stat_period || item.stat_date || '')), energyTrend.value.map((item) => Number(item.usage_value || 0)), '运行趋势'),
            true,
          )
        } else {
          const labels = energyTrend.value.map((item) => String(item.stat_period || item.stat_date || ''))
          const values = energyTrend.value.map((item) => Number(item.usage_value || 0))
          chart.setOption(lineOption(labels, values, '运行趋势'), true)
        }
      } else if (overviewRealtimeRows.value.length) {
        chart.setOption(
          barOption(
            overviewRealtimeRows.value.map((item) => item.name),
            overviewRealtimeRows.value.map((item) => item.value),
            '实时快照',
          ),
          true,
        )
      } else {
        const labels = energyTrend.value.map((item) => String(item.stat_period || item.stat_date || ''))
        const values = energyTrend.value.map((item) => Number(item.usage_value || 0))
        chart.setOption(lineOption(labels, values, '能耗趋势'), true)
      }
      chart.resize()
    }
  } else {
    overviewRealtimeChart?.dispose()
    overviewRealtimeChart = null
    deviceRealtimeChart?.dispose()
    deviceRealtimeChart = null
    detailRealtimeChart?.dispose()
    detailRealtimeChart = null
  }
  if (
    (selectedIsDevice.value || selectedIsOrg.value) &&
    activeArchiveTab.value === 'history' &&
    dataView.value === 'chart' &&
    chartHasSize(historyChartEl.value)
  ) {
    historyChart = ensureChartInstance(historyChart, historyChartEl.value)
    const rows = archiveHistoryChartRows.value as Array<{ time: string; values: Record<string, unknown> }>
    const labels = rows.map((item) => item.time)
    const keys = historyDisplayKeys.value.length ? historyDisplayKeys.value : ['total_active_energy']
    historyChart.clear()
    historyChart.setOption(keys.length > 1 ? multiLineOption(labels, keys, rows) : lineOption(labels, rows.map((item) => Number(item.values[keys[0] || '总用量'] || 0)), '计量用量'), true)
    historyChart.resize()
  } else {
    historyChart?.dispose()
    historyChart = null
  }
  alarmChart?.dispose()
  alarmChart = null
  if (mode.value === 'device-detail' && detailWorkspaceTab.value === 'billing' && chartHasSize(billingUsageChartEl.value)) {
    billingUsageChart = ensureChartInstance(billingUsageChart, billingUsageChartEl.value)
    const rows = periodHistoryChartRows.value
    const labels = rows.map((item) => item.time)
    const keys = historyDisplayKeys.value
    billingUsageChart.setOption(keys.length > 1 ? multiLineOption(labels, keys, rows) : lineOption(labels, rows.map((item) => Number(item.values[keys[0] || '总用量'] || 0)), '计量用量'), true)
    billingUsageChart.resize()
    if (chartHasSize(billingQualityChartEl.value)) {
      billingQualityChart = ensureChartInstance(billingQualityChart, billingQualityChartEl.value)
      const qualityRows = hourlyMetricRows.value.filter((row) => row.data_complete_rate != null)
      billingQualityChart.setOption(lineOption(qualityRows.map((row) => String(row.stat_period || row.stat_date || '')), qualityRows.map((row) => Number(row.data_complete_rate || 0)), '完整率'), true)
      billingQualityChart.resize()
    }
  } else {
    billingUsageChart?.dispose()
    billingUsageChart = null
    billingQualityChart?.dispose()
    billingQualityChart = null
  }
}
function resizeCharts() {
  overviewRealtimeChart?.resize()
  deviceRealtimeChart?.resize()
  detailRealtimeChart?.resize()
  historyChart?.resize()
  alarmChart?.resize()
  billingUsageChart?.resize()
  billingQualityChart?.resize()
}
function toggleDataView() {
  dataView.value = dataView.value === 'chart' ? 'table' : 'chart'
}

async function waitForPaint() {
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function queryTree() {
  if (treeTimer) clearTimeout(treeTimer)
  treeTimer = null
  await loadTree()
}
function scheduleTreeQuery() {
  if (treeTimer) clearTimeout(treeTimer)
  treeTimer = setTimeout(() => { void loadTree() }, 500)
}

watch(() => route.fullPath, loadAll)
watch([selectedRootOrgId, treeKeyword], () => {
  if (ignoreNextTreeWatch) {
    ignoreNextTreeWatch = false
    return
  }
  if (mode.value === 'org-tree') scheduleTreeQuery()
})
watch([detailAlarmKeyword, detailAlarmStatusFilter], () => { detailAlarmPage.value = 1 })
watch([activeArchiveTab, detailWorkspaceTab, dataView], () => { void renderCharts() })
watch(activeArchiveTab, (tab) => {
  if (tab === 'history') {
    dataView.value = 'chart'
    void loadMetricView()
  }
})
onMounted(() => { window.addEventListener('resize', resizeCharts); void loadAll() })
onBeforeUnmount(() => {
  if (treeTimer) clearTimeout(treeTimer)
  if (detailContextTimer) clearTimeout(detailContextTimer)
  window.removeEventListener('resize', resizeCharts)
  overviewRealtimeChart?.dispose()
  deviceRealtimeChart?.dispose()
  detailRealtimeChart?.dispose()
  historyChart?.dispose()
  alarmChart?.dispose()
  billingUsageChart?.dispose()
  billingQualityChart?.dispose()
  overviewRealtimeChart = null
  deviceRealtimeChart = null
  detailRealtimeChart = null
  historyChart = null
  alarmChart = null
  billingUsageChart = null
  billingQualityChart = null
})
</script>

<template>
  <section class="view-page device-archive-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">DEVICE ARCHIVE</p>
        <h1>{{ title }}</h1>
      </div>
      <div class="head-actions">
        <button v-if="mode === 'device-detail'" class="quiet" @click="router.push('/device-archive/devices')">返回列表</button>
      </div>
    </header>
    <template v-if="mode === 'org-tree'">
      <div class="archive-workbench">
        <aside class="archive-sidebar-panel">
          <label class="archive-site-field">
            <span>站点名称</span>
            <AppSelect v-model="selectedRootOrgId" :disabled="rootOrgSelectLocked">
              <option v-if="!rootOrgOptions.length" value="">暂无可选站点</option>
              <option v-for="org in rootOrgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option>
            </AppSelect>
          </label>
          <div class="archive-search-row">
            <label class="archive-search-box">
              <Search :size="15" />
              <input v-model.trim="treeKeyword" placeholder="名称模糊查询" @keyup.enter="queryTree">
            </label>
            <button class="icon-btn" title="查询" aria-label="查询" @click="queryTree"><Search :size="16" /></button>
          </div>
          <div class="archive-tree-tools">
            <button class="quiet" @click="expandAll"><ChevronDown :size="15" />全展开</button>
            <button class="quiet" @click="collapseAll"><ChevronRight :size="15" />全折叠</button>
          </div>
          <div class="archive-tree-list">
            <AppLoadingState v-if="treeLoading && !visibleTreeRows.length" />
            <div v-else-if="!visibleTreeRows.length" class="empty-state">暂无组织档案。</div>
            <button
              v-for="entry in visibleTreeRows"
              v-else
              :key="nodeKey(entry.node)"
              class="archive-tree-item"
              :class="{ active: selectedNode && nodeKey(selectedNode) === nodeKey(entry.node) }"
              :style="{ paddingLeft: `${10 + entry.level * 18}px` }"
              @click="selectNode(entry.node)"
            >
              <span class="tree-toggle" :class="{ placeholder: !hasChildren(entry.node) }" @click.stop="hasChildren(entry.node) && toggleNode(entry.node)">
                <ChevronDown v-if="expandedKeys.has(nodeKey(entry.node))" :size="15" />
                <ChevronRight v-else :size="15" />
              </span>
              <span class="archive-tree-type" :class="String(entry.node.nodeType).toLowerCase()"><Building2 v-if="entry.node.nodeType === 'ORG'" :size="15" /><RadioTower v-else-if="entry.node.nodeType === 'GATEWAY'" :size="15" /><Cpu v-else :size="15" /></span>
              <span>{{ nodeLabel(entry.node) }}</span>
            </button>
          </div>
        </aside>

        <section class="archive-main-panel">
          <div class="archive-toolbar">
              <div class="archive-toolbar-actions">
              <button v-if="showPrimaryCreate" class="primary add-action" @click="openAddBySelection">{{ createLabel }}</button>
              <button v-if="selectedIsOrg || selectedIsGateway" class="quiet add-action bind-action" @click="openBindDevices">绑定设备</button>
              <button v-if="selectedIsOrg" class="quiet add-action" @click="openGatewayForSelectedOrg">+添加网关</button>
              <button class="icon-btn" :disabled="!selectedCanCopy" title="复制" aria-label="复制" @click="duplicateSelection"><Copy :size="16" /></button>
              <button class="icon-btn" :disabled="!selectedCanMutate" title="编辑" aria-label="编辑" @click="editSelected"><Pencil :size="16" /></button>
              <button class="icon-btn danger-text" :disabled="!selectedCanMutate" title="删除" aria-label="删除" @click="deleteSelected"><Trash2 :size="16" /></button>
              <button class="icon-btn" title="刷新" aria-label="刷新" @click="refreshSelected"><RefreshCw :size="16" /></button>
            </div>
            <div class="archive-toolbar-meta">
              <span>{{ selectedNodeTitle }}</span>
            </div>
          </div>

          <div v-if="!selectedNode" class="archive-main-empty">请选择左侧档案节点。</div>

          <template v-else>
          <div class="archive-brief-strip">
            <article v-for="item in archiveSummaryCards" :key="String(item[0])" class="archive-brief-card">
              <span>{{ item[0] }}</span>
              <b>{{ displayValue(item[1]) }}</b>
            </article>
          </div>
          <div class="archive-link-strip">
            <button v-for="link in archiveActionLinks" :key="link.path + link.label" class="quiet" @click="router.push({ path: link.path, query: link.query })">{{ link.label }}</button>
          </div>
          <div v-if="selectedIsDevice || selectedIsOrg" class="archive-tabs">
            <button :class="{ active: activeArchiveTab === 'device' }" @click="activeArchiveTab = 'device'">基础档案</button>
            <button :class="{ active: activeArchiveTab === 'runtime' }" @click="activeArchiveTab = 'runtime'">实时运行数据</button>
            <button :class="{ active: activeArchiveTab === 'history' }" @click="activeArchiveTab = 'history'">计量历史</button>
            <button :class="{ active: activeArchiveTab === 'alarm' }" @click="activeArchiveTab = 'alarm'">告警与工单</button>
            <button :class="{ active: activeArchiveTab === 'inspection' }" @click="activeArchiveTab = 'inspection'">运维记录</button>
          </div>
          <div v-else class="archive-tabs archive-tabs-static">
            <button class="active">{{ selectedIsGateway ? '网关概览' : selectedIsSpace ? '空间概览' : selectedIsGroup ? '状态分组' : '组织概览' }}</button>
          </div>

          <div v-if="(!selectedIsDevice && !selectedIsOrg) || ['device', 'inspection', 'runtime'].includes(activeArchiveTab)" class="archive-runtime-grid">
            <article class="archive-info-card">
              <div class="archive-section-title">
                <i></i>
                <h3>基础信息</h3>
                <small>{{ selectedIsDevice ? '设备真实详情' : '当前节点详情' }}</small>
                <label class="archive-show-all"><input v-model="showAllData" type="checkbox">显示全部数据</label>
              </div>
              <div class="archive-card-scroll">
                <dl>
                  <template v-for="item in selectedBasicInfo" :key="String(item[0])">
                    <dt>{{ item[0] }}</dt>
                    <dd v-if="String(item[0]) === '状态'">
                      <span class="archive-status-dot" :class="statusMeta(item[1]).class"></span>{{ statusMeta(item[1]).text }}
                    </dd>
                    <dd v-else>{{ displayValue(item[1]) }}</dd>
                  </template>
                </dl>
              </div>
            </article>

            <article class="archive-realtime-card">
              <template v-if="activeArchiveTab === 'device'">
                <div class="archive-section-title archive-realtime-title">
                  <i></i>
                  <h3>{{ selectedIsDevice ? '实时数据' : '运行概览' }}</h3>
                  <div v-if="selectedIsDevice" class="archive-chart-actions">
                    <button class="quiet" type="button" @click="metricTemplateDialog = true">配置测点</button>
                  </div>
                  <button class="icon-btn" title="刷新" aria-label="刷新" @click="refreshSelected"><RefreshCw :size="16" /></button>
                </div>
                <div v-if="selectedIsDevice" class="archive-template-strip archive-template-strip--row">
                  <button
                    v-for="chip in metricTemplateChips"
                    :key="chip.id || chip.label"
                    class="archive-template-chip"
                    :class="{ active: metricTemplateId === chip.id }"
                    type="button"
                    @click="selectMetricTemplate(chip.id)"
                  >
                    <span>{{ chip.label }}</span>
                    <X :size="12" @click.stop.prevent="removeMetricTemplate(chip.id)" />
                  </button>
                  <span v-if="!metricTemplateChips.length" class="archive-template-empty">暂无已配置模板</span>
                </div>
                <div class="archive-card-scroll">
                  <template v-if="!selectedIsDevice">
                    <div class="archive-overview-grid">
                      <article v-for="item in overviewCards" :key="String(item[0])" class="archive-overview-card">
                        <span>{{ item[0] }}</span>
                        <b>{{ displayValue(item[1]) }}</b>
                      </article>
                    </div>
                    <div class="archive-chart-shell">
                      <div v-if="hasDeviceRealtimeChart" ref="overviewRealtimeChartEl" class="archive-trend-chart"></div>
                      <div v-if="!hasDeviceRealtimeChart" class="archive-no-data">暂无能耗趋势数据。</div>
                    </div>
                  </template>
                  <template v-else>
                    <AppLoadingState v-if="profileLoading" class="archive-no-data" />
                    <div v-else class="archive-chart-shell">
                      <div v-if="metricLoading" class="archive-chart-loading">正在读取小时计量数据…</div>
                      <div v-if="hasDeviceRealtimeChart" ref="deviceRealtimeChartEl" class="archive-trend-chart"></div>
                      <div v-if="!hasDeviceRealtimeChart && !metricLoading" class="archive-no-data">最近24小时无数据。</div>
                    </div>
                  </template>
                </div>
              </template>

              <template v-else-if="activeArchiveTab === 'inspection'">
                <div class="archive-section-title">
                  <i></i>
                  <h3>运维记录</h3>
                  <small>工单、指令与操作留痕</small>
                </div>
                <div class="archive-record-toolbar">
                  <label class="archive-search-box archive-record-search">
                    <Search :size="14" />
                    <input v-model.trim="inspectionSearchKeyword" placeholder="检索运维记录">
                  </label>
                  <select v-model="inspectionTypeFilter" class="archive-record-filter" aria-label="运维分类过滤">
                    <option value="">全部分类</option>
                    <option v-for="item in inspectionTypeOptions" :key="item" :value="item">{{ item }}</option>
                  </select>
                </div>
                <div class="archive-card-scroll">
                  <div v-if="!filteredInspectionRecords.length" class="archive-no-data">{{ inspectionRecords.length ? '当前筛选条件没有匹配记录。' : '暂无运维记录。' }}</div>
                  <div v-else class="archive-inspection-list">
                    <div v-for="row in filteredInspectionRecords" :key="String(row.id)">
                      <b>{{ row.command_type || '运维操作' }}</b>
                      <span>{{ row.target_sn || row.request_time || '—' }}</span>
                      <small>{{ row.status ?? '—' }}</small>
                    </div>
                  </div>
                </div>
              </template>

              <template v-else-if="activeArchiveTab === 'runtime'">
                <div class="archive-section-title">
                  <i></i>
                  <h3>实时运行数据</h3>
                  <small>测点卡片</small>
                </div>
                <div class="archive-card-scroll">
                  <div v-if="!runtimeCards.length" class="archive-no-data">暂无测点定义。</div>
                  <div v-else class="archive-point-grid">
                    <article v-for="row in runtimeCards" :key="row.code" class="archive-point-card">
                      <b>{{ row.name }}</b>
                      <strong>{{ isMissingValue(row.value) ? '-' : row.value }}</strong>
                      <small>{{ row.unit || '—' }}</small>
                    </article>
                  </div>
                </div>
              </template>
            </article>
          </div>

          <div v-else-if="(selectedIsDevice || selectedIsOrg) && ['history', 'alarm'].includes(activeArchiveTab)" class="archive-history-panel archive-device-data-panel">
            <div class="archive-section-title"><i></i><h3>{{ activeArchiveTab === 'history' ? '计量历史' : '告警与工单' }}</h3><small>{{ activeArchiveTab === 'history' ? '设备测点历史趋势' : '告警事件与处置上下文' }}</small></div>
            <div class="archive-query-row history-toolbar-row">
              <template v-if="activeArchiveTab === 'history'">
                <div class="history-period-tabs">
                  <button v-for="item in [{ key: 'day', label: '日' }, { key: 'week', label: '周' }, { key: 'month', label: '月' }, { key: 'year', label: '年' }, { key: 'total', label: '总' }]" :key="item.key" type="button" :class="{ active: historyGranularity === item.key }" @click="setHistoryGranularity(item.key as HistoryGranularity)">{{ item.label }}</button>
                </div>
                <button v-if="historyGranularity !== 'total'" class="quiet archive-period-arrow" type="button" title="上一周期" @click="shiftHistoryPeriod(-1)">‹</button>
                <strong class="archive-period-label">{{ historyPeriod.label }}</strong>
                <button v-if="historyGranularity !== 'total'" class="quiet archive-period-arrow" type="button" title="下一周期" @click="shiftHistoryPeriod(1)">›</button>
              </template>
              <button class="icon-btn" title="刷新" aria-label="刷新" @click="activeArchiveTab === 'history' ? loadMetricView() : refreshSelected()"><RefreshCw :size="16" /></button>
            </div>

            <div v-if="activeArchiveTab === 'history'" class="archive-device-data-body archive-device-data-body--full">
              <div class="archive-chart-shell archive-history-shell">
                <AppLoadingState v-if="metricLoading" class="archive-history-loading" />
                <div v-else-if="!historyHasData" class="archive-no-data archive-history-empty">当前周期没有可展示的数据。</div>
                <div v-else class="archive-history-content">
                  <div v-if="dataView === 'chart'" ref="historyChartEl" class="archive-history-chart"></div>
                  <div v-if="dataView === 'table'" class="archive-data-table archive-scroll-table">
                    <div v-if="!historyDisplayRows.length" class="archive-no-data">暂无计量历史。</div>
                    <div v-for="row in historyDisplayRows" :key="row.time" class="archive-history-row">
                      <div class="archive-history-time">{{ row.time }}</div>
                      <div class="archive-history-grid">
                        <span v-for="column in historyDisplayKeys" :key="column">
                          <b>{{ column }}</b>
                          <small>{{ displayValue(row.values[column]) }}</small>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="archive-device-data-body archive-device-data-body--full">
              <div class="archive-data-table archive-scroll-table archive-full-table">
                <div class="archive-table-headbar">
                  <label class="archive-search-box archive-table-search">
                    <Search :size="15" />
                    <input v-model.trim="alarmSearchKeyword" placeholder="搜索表内内容">
                  </label>
                  <details class="detail-filter-menu archive-column-filter-menu">
                    <summary>列过滤 · {{ alarmVisibleColumns.length }} 项<ChevronDown :size="14" /></summary>
                    <div>
                      <label v-for="column in alarmColumnOptions" :key="column.key">
                        <input type="checkbox" :checked="alarmColumnFilters.includes(column.key)" @change="setAlarmColumnFilter(column.key, ($event.target as HTMLInputElement).checked)">
                        <span>{{ column.label }}</span>
                      </label>
                    </div>
                  </details>
                </div>
                <div v-if="!pagedRecentAlarms.length" class="archive-no-data">暂无告警与处置记录。</div>
                <div v-else class="archive-full-table-head">
                  <span v-for="column in alarmVisibleColumns" :key="column">{{ alarmColumnOptions.find((item) => item.key === column)?.label || fieldLabel(column) }}</span>
                </div>
                <div v-for="row in pagedRecentAlarms" :key="String(row.id)" class="archive-full-table-row">
                  <span v-for="column in alarmVisibleColumns" :key="column">{{ column === 'alarm_type' ? alarmTypeText(row[column]) : column === 'alarm_level' ? alarmLevelText(row[column]) : column === 'deal_status' ? dealStatusText(row[column]) : column === 'work_order_status' ? workOrderStatusText(row[column]) : archiveFieldValue(column, row[column]) }}</span>
                </div>
                <div v-if="filteredRecentAlarms.length" class="table-pagination archive-table-pagination">
                  <span>共 {{ filteredRecentAlarms.length }} 条</span>
                  <button class="quiet" :disabled="alarmPage <= 1" @click="alarmPage = Math.max(1, alarmPage - 1)">上一页</button>
                  <button v-for="item in Array.from({ length: Math.min(5, alarmPageCount) }, (_, index) => Math.max(1, Math.min(alarmPageCount, alarmPage - 2 + index)))" :key="item" class="page-number" :class="{ active: item === alarmPage }" @click="alarmPage = item">{{ item }}</button>
                  <button class="quiet" :disabled="alarmPage >= alarmPageCount" @click="alarmPage = Math.min(alarmPageCount, alarmPage + 1)">下一页</button>
                </div>
              </div>
            </div>
          </div>
          </template>
        </section>
      </div>
    </template>

    <template v-else-if="mode === 'devices'">
      <article class="filter-card">
        <div class="filter-row">
          <label class="field device-filter-field device-search-field">
            <span>设备搜索</span>
            <input v-model.trim="deviceKeyword" placeholder="设备编号、名称、组织或网关" @keyup.enter="loadDevices">
          </label>
          <label class="field device-filter-field">
            <span>园区筛选</span>
            <details class="device-filter-menu"><summary><span>{{ deviceRootFilterLabel }}</span><ChevronDown :size="15" /></summary><div><label v-for="org in rootOrgOptions" :key="String(org.id)"><input type="checkbox" :checked="deviceRootOrgIds.includes(String(org.id))" @change="toggleDeviceRootOrg(org.id, ($event.target as HTMLInputElement).checked)"><span>{{ org.org_name }}</span></label></div></details>
          </label>
          <label class="field device-filter-field">
            <span>网关筛选</span>
            <details class="device-filter-menu" :class="{ disabled: !deviceRootOrgIds.length }"><summary><span>{{ deviceGatewayFilterLabel }}</span><ChevronDown :size="15" /></summary><div><p v-if="!deviceRootOrgIds.length" class="filter-menu-hint">请先勾选园区</p><label v-for="gateway in deviceGatewayFilterOptions" :key="String(gateway.id)"><input type="checkbox" :disabled="!deviceRootOrgIds.length" :checked="deviceGatewayIds.includes(String(gateway.id))" @change="toggleDeviceGateway(gateway.id, ($event.target as HTMLInputElement).checked)"><span>{{ gateway.gateway_name || gateway.gateway_sn }}</span></label></div></details>
          </label>
          <div class="filter-actions">
            <button class="btn-primary" @click="loadDevices"><Search :size="15" />查询</button>
          </div>
          <div class="filter-extra-actions">
            <button class="primary add-action" @click="openDevice(undefined)">+新增设备</button>
            <button class="icon-btn" title="刷新" aria-label="刷新" @click="loadDevices"><RefreshCw :size="16" /></button>
          </div>
        </div>
      </article>
      <AppLoadingState v-if="deviceListLoading && !devices.length" />
      <div v-else class="device-card-grid">
        <article v-for="item in devices" :key="String(item.id)" class="device-card">
          <AppImage class="device-card-media" :eager="devices.indexOf(item) < 6" :src="item.model_image_url || item.model_image_object_key || item.catalog_model_image_object_key" :alt="String(item.device_name || item.device_sn || '设备图片')" empty-text="型号暂未配置图片" @retry="loadDevices" />
          <div class="device-card-info">
            <h3>{{ item.device_name || item.device_sn }}</h3>
            <p>{{ item.device_sn }} · {{ item.model_display_name || item.type_name || '设备' }}</p>
            <p>{{ item.org_name || '未分配组织' }} / {{ item.gateway_name || item.gateway_sn || '未绑定网关' }}</p>
          </div>
          <div class="device-card-actions">
            <StatusTag domain="online" :value="item.status" />
            <button class="icon-btn" title="查看设备详情" aria-label="查看设备详情" @click="router.push(`/device-archive/devices/${item.id}`)"><FileText :size="16" /></button>
          </div>
        </article>
        <div v-if="!devices.length" class="empty-state">暂无设备档案。</div>
      </div>
    </template>

    <template v-else>
      <div class="device-detail-layout">
        <aside class="device-detail-left">
          <AppImage class="device-detail-image" eager :src="detailDevice.model_image_url || detailDevice.catalog_model_image_url || detailDevice.model_image_object_key || detailDevice.catalog_model_image_object_key" :alt="String(detailDevice.device_name || detailDevice.device_sn || '设备图片')" empty-text="型号图片暂不可用" @retry="loadDetail" />
          <dl class="detail-grid">
            <dt>设备名称</dt><dd>{{ detailDevice.device_name || '—' }}</dd>
            <dt>设备编号</dt><dd>{{ detailDevice.device_sn || '—' }}</dd>
            <dt>设备类型/型号</dt><dd>{{ detailDevice.type_name || detailDevice.type_code || '—' }}</dd>
            <dt>产品目录</dt><dd>{{ [detailDevice.catalog_brand_name, detailDevice.catalog_series_name, detailDevice.catalog_model_name, detailDevice.model_version_name].filter(Boolean).join(' / ') || '历史设备' }}</dd>
            <dt>所属组织</dt><dd>{{ detailDevice.org_name || '—' }}</dd>
            <dt>接入网关</dt><dd>{{ detailDevice.gateway_name || detailDevice.gateway_sn || '—' }}</dd>
            <dt>安装位置</dt><dd>{{ detailDevice.install_location || '—' }}</dd>
            <dt>设备型号</dt><dd>{{ detailDevice.device_model || '—' }}</dd>
            <dt>采集周期</dt><dd>{{ detailDevice.collect_interval_seconds || 300 }} 秒</dd>
            <dt>结算完整率阈值</dt><dd>{{ detailDevice.quality_threshold_pct || 95 }}%</dd>
          </dl>
        </aside>
        <section class="device-detail-right">
          <article class="panel device-workspace-panel">
            <div class="panel-head device-workspace-head">
              <div>
                <h3>{{ detailWorkspaceTab === 'overview' ? '设备健康工作区' : detailWorkspaceTab === 'alarms' ? '告警与工单上下文' : detailWorkspaceTab === 'billing' ? '计量与结算上下文' : detailWorkspaceTab === 'attributes' ? '属性配置' : '测点配置' }}</h3>
                <small>{{ detailDevice.type_name || detailDevice.type_code || '设备类型/型号' }}</small>
              </div>
              <div class="device-workspace-tabs">
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'overview' }" @click="detailWorkspaceTab = 'overview'">设备健康</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'alarms' }" @click="detailWorkspaceTab = 'alarms'">告警与工单</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'billing' }" @click="detailWorkspaceTab = 'billing'">计量与结算</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'attributes' }" @click="detailWorkspaceTab = 'attributes'">属性配置</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'points' }" @click="detailWorkspaceTab = 'points'">测点配置</button>
                <button class="icon-btn danger-text" title="删除设备" aria-label="删除设备" @click="deleteSelected"><Trash2 :size="16" /></button>
              </div>
            </div>

            <template v-if="detailWorkspaceTab === 'overview'">
              <div class="device-workspace-grid">
                <section class="device-workspace-chart">
                  <div class="archive-section-title"><i></i><h3>实时运行曲线</h3><small>ECharts</small></div>
                  <div ref="detailRealtimeChartEl" class="device-energy-chart"></div>
                </section>
                <section class="device-workspace-list">
                  <div class="archive-section-title"><i></i><h3>最近计量</h3><small>日统计</small></div>
                  <div class="compact-list">
                    <div v-for="row in recentHistory" :key="String(row.id || `${row.stat_date}-${row.point_code}`)">
                      <b>{{ row.point_code }} · {{ row.usage_value ?? '—' }}</b>
                      <span>{{ row.stat_date }} / 完整率 {{ row.data_complete_rate ?? '—' }}%</span>
                    </div>
                    <div v-if="!recentHistory.length"><b>暂无计量记录</b><span>日统计写入后将在此展示。</span></div>
                  </div>
                </section>
                <section class="device-workspace-list">
                  <div class="archive-section-title"><i></i><h3>最近告警</h3><small>告警事件</small></div>
                  <div class="compact-list">
                    <div v-for="row in recentAlarms" :key="String(row.id)">
                      <b>{{ alarmTypeText(row.alarm_type) }} · {{ alarmLevelText(row.alarm_level) }}</b>
                      <span>{{ row.point_code || '—' }} / {{ row.alarm_time || '—' }}</span>
                    </div>
                    <div v-if="!recentAlarms.length"><b>暂无告警数据</b><span>该设备近期没有告警记录。</span></div>
                  </div>
                </section>
              </div>
            </template>

            <template v-else-if="detailWorkspaceTab === 'alarms'">
              <div class="device-context-grid device-context-grid--single">
                <section class="device-context-card device-context-table-card">
                  <div class="archive-section-title"><i></i><h3>告警历史与关联工单</h3><small>{{ filteredDetailAlarms.length }} 条</small></div>
                  <div class="detail-view-filters device-alarm-filters">
                    <label class="detail-filter-search"><Search :size="14" /><input v-model.trim="detailAlarmKeyword" placeholder="搜索告警类型、测点、工单或状态"></label>
                    <select v-model="detailAlarmStatusFilter" class="detail-filter-select" aria-label="告警状态筛选">
                      <option value="">全部告警状态</option>
                      <option v-for="status in detailAlarmStatusOptions" :key="status" :value="status">{{ dealStatusText(status) }}</option>
                    </select>
                  </div>
                  <div class="archive-data-table archive-scroll-table archive-full-table">
                    <div v-if="!filteredDetailAlarms.length" class="archive-no-data">{{ recentAlarms.length ? '当前筛选条件没有匹配记录。' : '暂无告警与处置记录。' }}</div>
                    <template v-else>
                      <div class="archive-full-table-head"><span>发生时间</span><span>告警类型</span><span>级别</span><span>测点</span><span>告警状态</span><span>关联工单</span><span>工单状态</span></div>
                      <div v-for="row in pagedDetailAlarms" :key="String(row.id)" class="archive-full-table-row"><span>{{ row.alarm_time || '—' }}</span><span>{{ alarmTypeText(row.alarm_type) }}</span><span>{{ alarmLevelText(row.alarm_level) }}</span><span>{{ row.point_code || '—' }}</span><span>{{ dealStatusText(row.deal_status) }}</span><span>{{ row.work_order_no || '未建单' }}</span><span>{{ workOrderStatusText(row.work_order_status) }}</span></div>
                      <div class="table-pagination archive-table-pagination">
                        <span>共 {{ filteredDetailAlarms.length }} 条</span>
                        <button class="quiet" :disabled="detailAlarmPage <= 1" @click="detailAlarmPage = Math.max(1, detailAlarmPage - 1)">上一页</button>
                        <button v-for="item in Array.from({ length: Math.min(5, detailAlarmPageCount) }, (_, index) => Math.max(1, Math.min(detailAlarmPageCount, detailAlarmPage - 2 + index)))" :key="item" class="page-number" :class="{ active: item === detailAlarmPage }" @click="detailAlarmPage = item">{{ item }}</button>
                        <button class="quiet" :disabled="detailAlarmPage >= detailAlarmPageCount" @click="detailAlarmPage = Math.min(detailAlarmPageCount, detailAlarmPage + 1)">下一页</button>
                      </div>
                    </template>
                  </div>
                </section>
              </div>
            </template>

            <template v-else-if="detailWorkspaceTab === 'billing'">
              <div class="billing-dashboard-grid billing-dashboard-grid--compact">
                <section class="device-context-card billing-dashboard-chart"><div class="archive-section-title"><i></i><h3>计量趋势</h3><small>{{ historyPeriod.label }}</small></div><div ref="billingUsageChartEl" class="billing-stat-chart"></div></section>
                <section class="device-context-card billing-dashboard-chart"><div class="archive-section-title"><i></i><h3>采集完整率</h3><small>小时统计</small></div><div ref="billingQualityChartEl" class="billing-stat-chart"></div></section>
                <section class="device-context-card billing-dashboard-prepared"><div class="archive-section-title"><i></i><h3>计量结算准备度</h3><small>以采集质量为准</small></div><dl class="device-context-facts"><dt>可计费测点</dt><dd>{{ pointDefinitions.filter(item => Number(item.billable) === 1).length }} 个</dd><dt>结算完整率阈值</dt><dd>{{ detailDevice.quality_threshold_pct || 95 }}%</dd><dt>最近统计记录</dt><dd>{{ recentHistory.length }} 条</dd></dl></section>
                <section class="device-context-card billing-dashboard-entry"><div class="archive-section-title"><i></i><h3>设备计费状态</h3><small>{{ Number(detailDevice.settlement_enabled || 0) === 1 ? '已纳入合同结算范围' : '当前不会参与账单计算' }}</small></div><div class="settlement-switch-card" :class="{ enabled: Number(detailDevice.settlement_enabled || 0) === 1 }"><div><b>{{ Number(detailDevice.settlement_enabled || 0) === 1 ? '允许计费' : '禁止计费' }}</b><span>{{ Number(detailDevice.settlement_enabled || 0) === 1 ? '计费引擎可读取该设备的累计量统计。' : '设备仍可采集数据，但计费引擎会过滤该设备。' }}</span></div><button :class="Number(detailDevice.settlement_enabled || 0) === 1 ? 'quiet' : 'primary'" :disabled="settlementSwitching" @click="toggleDeviceSettlement">{{ settlementSwitching ? '处理中…' : Number(detailDevice.settlement_enabled || 0) === 1 ? '关闭计费' : '允许计费' }}</button></div></section>
              </div>
            </template>

            <template v-else-if="detailWorkspaceTab === 'attributes'">
              <div class="point-workspace-toolbar">
                <div class="point-workspace-note"><AlertTriangle :size="14" /><span>属性继承自产品型号版本；设备实例只展示允许覆盖后的值。</span></div>
                <div class="point-workspace-actions detail-view-filters">
                  <label class="detail-filter-search"><Search :size="14" /><input v-model.trim="attributeKeyword" placeholder="搜索属性名称、编码或值"></label>
                  <details class="detail-filter-menu">
                    <summary>属性组 · {{ attributeGroupFilterLabel }}<ChevronDown :size="14" /></summary>
                    <div><label v-for="group in attributeGroupOptions" :key="group"><input type="checkbox" :checked="attributeGroupFilters.includes(group)" @change="toggleDetailFilter('attribute', group, ($event.target as HTMLInputElement).checked)"><span>{{ group }}</span></label></div>
                  </details>
                </div>
              </div>
              <div class="attribute-view-table"><table><thead><tr><th>属性组</th><th>属性名称</th><th>属性编码</th><th>固定值</th><th>单位</th><th>用途</th></tr></thead><tbody><tr v-for="item in filteredModelAttributes" :key="String(item.attribute_code)"><td>{{ item.group_name || '—' }}</td><td>{{ item.attribute_name || '—' }}</td><td>{{ item.attribute_code || '—' }}</td><td>{{ item.attribute_value ?? '—' }}</td><td>{{ item.unit || '—' }}</td><td>{{ item.usage_type || '—' }}</td></tr><tr v-if="!filteredModelAttributes.length"><td colspan="6" class="empty-cell">暂无符合条件的型号与实例属性。</td></tr></tbody></table></div>
            </template>

            <template v-else>
              <div class="point-workspace-toolbar">
                <div class="point-workspace-note">
                  <AlertTriangle :size="14" />
                  <span>{{ catalogManagedDevice ? '当前测点继承自已发布型号版本，仅可查看；修改请创建新的型号版本。' : '历史测点属于当前设备类型，保存后同类型设备共用。' }}</span>
                </div>
                <div class="point-workspace-actions">
                  <div class="detail-view-filters">
                    <label class="detail-filter-search"><Search :size="14" /><input v-model.trim="pointKeyword" placeholder="搜索测点名称或编码"></label>
                    <details class="detail-filter-menu">
                      <summary>业务角色 · {{ pointRoleFilterLabel }}<ChevronDown :size="14" /></summary>
                      <div><label v-for="role in pointRoleOptions" :key="role"><input type="checkbox" :checked="pointRoleFilters.includes(role)" @change="toggleDetailFilter('point', role, ($event.target as HTMLInputElement).checked)"><span>{{ role }}</span></label></div>
                    </details>
                  </div>
                  <button v-if="catalogManagedDevice" class="quiet" @click="router.push('/archive/catalog')">打开产品目录</button>
                  <button v-else class="primary" :disabled="pointSaving" @click="savePointDrafts">{{ pointSaving ? '保存中...' : '保存测点' }}</button>
                  <button class="quiet" @click="openParsePreview">样例解析校验</button>
                </div>
              </div>
              <div class="point-workspace-body">
                <div class="point-manage-display">
                  <div v-if="!pointDrafts.length" class="archive-no-data">暂无测点配置。</div>
                  <div v-else class="point-manage-grid">
                    <article v-for="(point, index) in filteredPointDrafts" :key="point._draftKey" class="point-manage-card">
                      <div class="point-card-head">
                        <div>
                          <b>{{ point.point_name || '未命名测点' }}</b>
                          <span class="point-status" :class="{ off: Number(point.enabled) !== 1 }"><i></i>{{ Number(point.enabled) === 1 ? '启用' : '未启用' }}</span>
                        </div>
                        <div v-if="!catalogManagedDevice" class="point-card-actions">
                          <button class="icon-btn" title="修改测点" aria-label="修改测点" @click="editPointDraft(point)"><Pencil :size="15" /></button>
                          <button class="icon-btn danger-text" title="删除测点" aria-label="删除测点" @click="removePointDraft(pointDrafts.indexOf(point))"><Trash2 :size="15" /></button>
                        </div>
                      </div>
                      <dl class="point-card-info">
                        <dt>编码</dt><dd>{{ point.point_code || '—' }}</dd>
                        <dt>类型</dt><dd>{{ point.data_type || '—' }}</dd>
                        <dt>单位</dt><dd>{{ point.unit || '—' }}</dd>
                        <dt>角色</dt><dd>{{ point.business_role || '—' }}</dd>
                        <dt>计费</dt><dd>{{ Number(point.billable) === 1 ? '是' : '否' }}</dd>
                        <dt>统计</dt><dd>{{ Number(point.stat_enabled) === 1 ? '是' : '否' }}</dd>
                      </dl>
                      <button v-if="!catalogManagedDevice" class="point-enable-switch" :class="{ off: Number(point.enabled) !== 1 }" :title="Number(point.enabled) === 1 ? '停用测点' : '启用测点'" :aria-label="Number(point.enabled) === 1 ? '停用测点' : '启用测点'" @click="togglePointEnabled(point)"><i></i></button>
                    </article>
                  </div>
                </div>
                <aside v-if="pointEditor && !catalogManagedDevice" class="point-editor-panel">
                  <div class="point-editor-head">
                    <h4>{{ pointEditingKey ? '修改测点' : '新增测点' }}</h4>
                    <span>{{ pointEditor.point_name || pointEditor.point_code || '待配置' }}</span>
                  </div>
                  <div class="point-editor-fields">
                    <label><span>测点编码</span><input v-model.trim="pointEditor.point_code" placeholder="total_active_energy"></label>
                    <label><span>测点名称</span><input v-model.trim="pointEditor.point_name" placeholder="总有功电能"></label>
                    <label><span>数据类型</span><AppSelect v-model="pointEditor.data_type"><option>DOUBLE</option><option>INTEGER</option><option>STRING</option></AppSelect></label>
                    <label><span>单位</span><input v-model.trim="pointEditor.unit" placeholder="kWh"></label>
                    <label><span>业务角色</span><input v-model.trim="pointEditor.business_role" placeholder="INSTANT_VALUE"></label>
                    <label><span>可计费</span><AppSelect v-model.number="pointEditor.billable"><option :value="0">否</option><option :value="1">是</option></AppSelect></label>
                    <label><span>纳入统计</span><AppSelect v-model.number="pointEditor.stat_enabled"><option :value="1">是</option><option :value="0">否</option></AppSelect></label>
                    <label><span>启用状态</span><AppSelect v-model.number="pointEditor.enabled"><option :value="1">启用</option><option :value="0">未启用</option></AppSelect></label>
                  </div>
                  <button class="primary point-confirm-btn" @click="confirmPointDraft">{{ pointEditingKey ? '确认修改' : '确认新增' }}</button>
                </aside>
              </div>
            </template>
          </article>
        </section>
      </div>
    </template>

    <AppDialog v-model:open="dialog" :dialog-class="formType === 'device' && !editingId ? 'device-wizard-dialog' : ''" :title="formType === 'device' ? (editingId ? '编辑设备档案' : `登记设备 · 第 ${deviceWizardStep} 步`) : (editingId ? '编辑档案' : '新增档案')" :confirm-text="formType === 'device' && !editingId ? (deviceWizardStep < 3 ? '下一步' : '确认登记') : undefined" @submit="submitDialog">
      <div v-if="formType === 'org'" class="dialog-fields">
        <div class="dialog-field full device-model-tree-field"><span>上级组织</span><button class="quiet tree-root-choice" type="button" :class="{ active: !form.parent_id }" @click="clearDialogOrg">无（根节点）</button><div class="device-model-tree archive-tree-list"><CatalogTreeNode v-for="node in dialogOrgTree" :key="String(node.key)" :node="node" :selected-key="selectedOrgTreeKey" @select="selectDialogOrg" /></div></div>
        <label class="dialog-field"><span>组织名称*</span><input v-model="form.org_name" required></label>
        <label class="dialog-field"><span>组织类型</span><AppSelect v-model="form.org_type"><option v-for="item in orgTypeOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></AppSelect></label>
        <label class="dialog-field"><span>负责人</span><input v-model="form.leader"></label>
        <label class="dialog-field"><span>联系电话</span><input v-model="form.phone"></label>
        <label class="dialog-field full"><span>地址</span><textarea v-model="form.address"></textarea></label>
      </div>
      <div v-else-if="formType === 'gateway'" class="dialog-fields">
        <div class="dialog-field full device-model-tree-field"><span>所属组织*</span><div class="device-model-tree archive-tree-list"><CatalogTreeNode v-for="node in dialogOrgTree" :key="String(node.key)" :node="node" :selected-key="selectedOrgTreeKey" @select="selectDialogOrg" /></div></div>
        <label class="dialog-field"><span>网关编号*</span><input v-model="form.gateway_sn" required></label>
        <label class="dialog-field"><span>网关名称*</span><input v-model="form.gateway_name" required></label>
        <label class="dialog-field"><span>MQTT 密钥*</span><input v-model="form.mqtt_secret" required></label>
        <label class="dialog-field"><span>IP 地址</span><input v-model="form.ip_address"></label>
        <label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label>
        <label class="dialog-field"><span>启用状态</span><AppSelect v-model="form.status"><option v-for="item in statusOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></AppSelect></label>
      </div>
      <div v-else-if="formType === 'device' && editingId" class="dialog-fields">
        <div class="dialog-field full device-model-tree-field">
          <span>所属组织*</span>
          <div class="device-model-tree archive-tree-list">
            <CatalogTreeNode v-for="node in dialogOrgTree" :key="String(node.key)" :node="node" :selected-key="selectedOrgTreeKey" @select="selectDialogOrg" />
            <p v-if="!orgSelectionTree.length" class="empty-state">暂无可选组织，请先维护组织树。</p>
          </div>
        </div>
        <div class="dialog-field full device-model-tree-field">
          <span>已发布型号版本*</span>
          <div v-if="editingId" class="device-model-selected">{{ modelOptions.find(item => String(item.model_version_id) === String(form.model_version_id))?.display_name || '历史设备，未关联产品目录版本' }}</div>
          <div v-else class="device-model-tree archive-tree-list">
            <CatalogTreeNode v-for="node in publishedCatalogTree" :key="String(node.key)" :node="node" :selected-key="selectedModelTreeKey" @select="selectPublishedModel" />
            <p v-if="!publishedCatalogTree.length" class="empty-state">暂无已发布型号，请先在产品目录中完成发布。</p>
          </div>
          <small v-if="!editingId && selectedPublishedModel" class="device-model-inherit">将继承 {{ selectedPublishedModel.attribute_count || 0 }} 项属性、{{ selectedPublishedModel.point_count || 0 }} 个测点；底层类型和采集默认值自动带入。</small>
        </div>
        <label class="dialog-field"><span>接入网关</span><AppSelect v-model="form.gateway_id"><option value="">暂不部署</option><option v-for="gateway in gatewayOptions.filter(item => String(item.org_id) === String(form.org_id) && Number(item.status) === 1)" :key="String(gateway.id)" :value="String(gateway.id)">{{ gateway.gateway_name || gateway.gateway_sn }}</option></AppSelect><small>已部署设备会在组织档案树中按“园区 → 网关 → 设备”层级展示。</small></label>
        <label class="dialog-field"><span>所属空间</span><AppSelect v-model="form.space_id"><option value="">暂不绑定空间</option><option v-for="space in spaceOptions.filter(item => String(item.org_id) === String(form.org_id) && !['DISABLED','INACTIVE'].includes(String(item.status || '').toUpperCase()))" :key="String(space.id)" :value="String(space.id)">{{ space.space_name || space.space_code }} · {{ space.space_code || '无编码' }}</option></AppSelect><small>绑定后，该设备才能在合同结算范围选择空间时显示。</small></label>
        <label v-if="editingId && !form.model_version_id" class="dialog-field"><span>历史设备类型</span><AppSelect v-model="form.device_type_id" disabled><option v-for="type in typeOptions" :key="String(type.id)" :value="String(type.id)">{{ type.type_name || type.type_code }}</option></AppSelect></label>
        <label class="dialog-field"><span>设备编号*</span><input v-model="form.device_sn" required></label>
        <label class="dialog-field"><span>设备名称</span><input v-model="form.device_name" placeholder="留空则由型号名称和 SN 自动生成"></label>
        <label v-if="form.gateway_id" class="dialog-field"><span>协议地址{{ selectedModelIsModbus ? '*' : '' }}</span><input v-model="form.protocol_addr" :required="selectedModelIsModbus" placeholder="MODBUS 为 1-247 从站地址"></label>
        <label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label>
        <label class="dialog-field"><span>启用状态</span><AppSelect v-model="form.status"><option v-for="item in statusOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></AppSelect></label>
        <template v-if="editingId">
          <label class="dialog-field"><span>计量投运</span><AppSelect v-model="form.settlement_enabled"><option :value="0">不参与结算</option><option :value="1">参与结算</option></AppSelect></label>
          <label class="dialog-field"><span>电表角色</span><AppSelect v-model="form.meter_role"><option value="SETTLEMENT">结算表</option><option value="INTERNAL">内部表</option><option value="SUB_METER">分表</option></AppSelect></label>
          <label class="dialog-field"><span>表计倍率</span><input v-model.number="form.meter_factor" type="number" min="0.000001" step="0.000001"></label>
          <label class="dialog-field"><span>质量门禁日期</span><input v-model="form.quality_gate_start_date" type="date"></label>
          <small class="dialog-field full commissioning-hint">当前模板有 {{ billableTotalPointCount }} 个累计计费测点。启用结算前必须完成网关部署；后台会再次校验。</small>
        </template>
        <div v-if="selectedPublishedModel" class="dialog-field full device-template-summary"><span>模板锁定参数</span><small>型号 {{ selectedPublishedModel.display_name }}；采集周期 {{ selectedPublishedModel.collect_interval_seconds }} 秒；完整率阈值 {{ selectedPublishedModel.quality_threshold_pct }}%。</small></div>
      </div>
      <div v-else class="dialog-fields device-wizard-fields">
        <div class="device-wizard-steps"><span :class="{ active: deviceWizardStep === 1 }">1 基础信息</span><span :class="{ active: deviceWizardStep === 2 }">2 型号模板</span><span :class="{ active: deviceWizardStep === 3 }">3 所属组织</span></div>
        <p v-if="wizardError" class="device-wizard-error" role="alert">{{ wizardError }}</p>
        <Transition name="wizard-step" mode="out-in">
          <div :key="deviceWizardStep" class="wizard-step-panel">
        <template v-if="deviceWizardStep === 1">
          <label class="dialog-field"><span>设备编号*</span><input v-model="form.device_sn" required autofocus></label>
          <label class="dialog-field"><span>设备名称</span><input v-model="form.device_name" placeholder="可留空，后续按型号和 SN 生成"></label>
          <label class="dialog-field"><span>启用状态</span><AppSelect v-model="form.status"><option v-for="item in statusOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></AppSelect></label>
        </template>
        <template v-else-if="deviceWizardStep === 2">
          <div class="wizard-two-column">
            <section class="wizard-selection-panel">
              <div class="archive-search-row"><label class="archive-search-box"><Search :size="15" /><input v-model.trim="wizardModelKeyword" placeholder="搜索分类、品牌、系列、型号"></label><button v-if="wizardModelKeyword" class="icon-btn" title="清空" aria-label="清空" @click="wizardModelKeyword = ''"><X :size="15" /></button></div>
              <div class="device-model-tree archive-tree-list wizard-tree-list"><CatalogTreeNode v-for="node in wizardPublishedCatalogTree" :key="String(node.key)" :node="node" :selected-key="selectedModelTreeKey" @select="selectPublishedModel" /><p v-if="!wizardPublishedCatalogTree.length" class="empty-state">暂无匹配的已发布型号。</p></div>
            </section>
            <section class="wizard-preview-panel">
              <div v-if="selectedPublishedModel" class="device-template-summary"><b>{{ selectedPublishedModel.display_name }}</b><small>采集周期 {{ selectedPublishedModel.collect_interval_seconds }} 秒 · 完整率阈值 {{ selectedPublishedModel.quality_threshold_pct }}%</small></div>
              <div v-if="selectedPublishedModel" class="wizard-preview-list"><h4>模板属性</h4><div v-for="item in wizardTemplateAttributes" :key="String(item.attribute_id)"><span>{{ item.attribute_name }}</span><b>{{ item.attribute_value || item.default_value || '—' }}{{ item.unit || '' }}</b></div><p v-if="!wizardTemplateAttributes.length" class="empty-state">该模板暂无属性。</p><h4>测点能力（{{ wizardTemplatePoints.length }} 个）</h4><div v-for="item in wizardTemplatePoints.slice(0, 8)" :key="String(item.point_code)"><span>{{ item.point_name || item.point_code }}</span><b>{{ item.business_role || '—' }}</b></div></div>
              <p v-else class="empty-state">点击左侧已发布型号，查看模板属性和测点能力。</p>
            </section>
          </div>
        </template>
        <template v-else>
          <section class="wizard-tree-section"><div class="wizard-section-head"><span>所属组织 / 接入网关</span><button class="quiet tree-root-choice" type="button" :class="{ active: !form.org_id }" @click="clearDialogOrg">无（使用默认最外层组织）</button></div><p class="commissioning-hint">可直接选择组织，也可以展开组织后选择网关；选择网关会同时绑定设备组织。未指定时自动挂载到当前用户权限范围内的默认最外层组织。</p><div class="archive-search-row"><label class="archive-search-box"><Search :size="15" /><input v-model.trim="wizardOrgKeyword" placeholder="搜索组织或网关名称"></label><button v-if="wizardOrgKeyword" class="icon-btn" title="清空" aria-label="清空" @click="wizardOrgKeyword = ''"><X :size="15" /></button></div><div class="device-model-tree archive-tree-list wizard-tree-list"><CatalogTreeNode v-for="node in wizardOrgTree" :key="String(node.key)" :node="node" :selected-key="selectedOrgTreeKey" @select="selectDialogOrg" /><p v-if="!wizardOrgTree.length" class="empty-state">暂无匹配组织或网关。</p></div><label class="dialog-field"><span>所属空间</span><AppSelect v-model="form.space_id"><option value="">暂不绑定空间</option><option v-for="space in spaceOptions.filter(item => String(item.org_id) === String(form.org_id) && !['DISABLED','INACTIVE'].includes(String(item.status || '').toUpperCase()))" :key="String(space.id)" :value="String(space.id)">{{ space.space_name || space.space_code }} · {{ space.space_code || '无编码' }}</option></AppSelect><small>绑定后，该设备才能在合同结算范围选择空间时显示。</small></label></section>
        </template>
          </div>
        </Transition>
      </div>
    </AppDialog>

    <AppDialog v-model:open="protocolAddressDialog" title="填写 MODBUS 从站地址" confirm-text="确认并添加" @submit="confirmProtocolAddress">
      <div class="dialog-fields protocol-address-dialog">
        <label class="dialog-field"><span>从站地址*</span><input v-model="protocolAddressDraft" type="number" min="1" max="247" step="1" autofocus placeholder="请输入 1-247"></label>
      </div>
    </AppDialog>

    <AppDialog v-model:open="bindDialog" title="绑定设备" confirm-text="确认绑定" @submit="submitBindDevices">
      <div class="archive-bind-dialog">
        <div class="archive-search-row">
          <label class="archive-search-box">
            <Search :size="15" />
            <input v-model.trim="bindingKeyword" placeholder="搜索设备编号、名称" @keyup.enter="loadBindingDevices">
          </label>
          <button class="icon-btn" title="查询" aria-label="查询" @click="loadBindingDevices"><Search :size="16" /></button>
        </div>
        <AppLoadingState v-if="bindingLoading" />
        <div v-else-if="!bindingDevices.length" class="empty-state">暂无可绑定设备。</div>
        <div v-else class="archive-bind-list">
          <label v-for="device in bindingDevices" :key="String(device.id)" class="archive-bind-item">
            <input type="checkbox" :checked="bindingDeviceIds.includes(String(device.id))" @change="toggleBindingDevice(device.id, ($event.target as HTMLInputElement).checked)">
            <span>
              <b>{{ device.device_name || device.device_sn }}</b>
              <small>{{ device.device_sn }} · {{ device.type_name || '设备类型/型号' }} · {{ device.gateway_name || device.gateway_sn || '未绑定网关' }}</small>
            </span>
          </label>
        </div>
      </div>
    </AppDialog>

    <AppDialog v-model:open="parsePreviewDialog" title="样例报文解析校验" :saving="parsePreviewBusy" @submit="runParsePreview">
      <div class="dialog-fields">
        <label class="dialog-field full"><span>客户样例 JSON</span><textarea v-model="parsePreviewPayload" spellcheck="false"></textarea></label>
        <div v-if="parsePreviewResult" class="dialog-field full"><span>逐测点校验结果</span><pre>{{ JSON.stringify(parsePreviewResult, null, 2) }}</pre></div>
      </div>
    </AppDialog>

    <AppDialog v-model:open="metricTemplateDialog" title="配置设备测点模板" confirm-text="保存模板" @submit="saveMetricTemplate">
      <div class="metric-template-dialog">
        <div class="metric-template-summary">
          <span class="metric-template-user-label">当前用户</span>
          <b class="metric-template-user-name">{{ session.user?.nickname || session.user?.username || '当前用户' }}</b>
          <span class="metric-template-visibility-tip"><span aria-hidden="true">i</span>模板仅对当前用户可见</span>
        </div>
        <label class="dialog-field full"><span>模板名称*</span><input v-model.trim="metricTemplateName" placeholder="例如：能源总览测点"></label>
        <div class="metric-template-toolbar">
          <label class="archive-search-box metric-template-search">
            <Search :size="15" />
            <input v-model.trim="metricPointSearchKeyword" placeholder="搜索测点名称、编码或单位">
          </label>
          <details class="detail-filter-menu metric-template-group-menu">
            <summary>分组 · {{ metricPointGroupFilters.length ? `${metricPointGroupFilters.length} 组` : '全部' }}<ChevronDown :size="14" /></summary>
            <div>
              <label v-for="group in metricPointGroupOptions" :key="group"><input type="checkbox" :checked="metricPointGroupFilters.includes(group)" @change="toggleMetricPointGroup(group, ($event.target as HTMLInputElement).checked)"><span>{{ group }}</span></label>
            </div>
          </details>
        </div>
        <div class="metric-template-points">
          <div class="metric-template-head"><b>选择测点</b><span>{{ selectedMetricPointCodes.length }} / {{ filteredMetricPointOptions.length }}</span></div>
          <label v-for="point in filteredMetricPointOptions" :key="metricPointCode(point)" class="metric-template-point">
            <input v-model="selectedMetricPointCodes" type="checkbox" :value="metricPointCode(point)">
            <span>
              <b>{{ point.point_name || metricPointCode(point) }}</b>
              <small>{{ String(point.business_role || point.data_type || point.group_name || '未分组') }} · {{ metricPointCode(point) }} · {{ point.unit || '无单位' }}</small>
            </span>
          </label>
          <p v-if="!filteredMetricPointOptions.length" class="archive-no-data">当前设备没有可用测点。</p>
        </div>
      </div>
    </AppDialog>

    <AppConfirmDialog
      v-model:open="deleteDialog"
      :title="deletingNodeRef ? `删除${nodeTag(deletingNodeRef)}` : '确认删除'"
      message="删除前会检查层级和业务引用；已有告警、指令、工单、账单或计量变更记录的设备不可删除。"
      :loading="deleting"
      confirm-text="确认删除"
      @confirm="confirmDeleteNode"
    />
  </section>
</template>

<style scoped>
.device-model-tree-field{display:block}.device-model-tree-field>span{display:block;margin-bottom:7px}.device-model-tree{height:230px;padding:6px;border:1px solid var(--border);background:#fff;overflow:auto}.device-model-selected{min-height:36px;display:flex;align-items:center;padding:0 10px;border:1px solid var(--border);background:#f7f9fc;color:#52667e;font-size:12px}.device-model-inherit{display:block;margin-top:6px;color:var(--muted);font-size:10px;line-height:1.5}.tree-root-choice{height:28px;margin-bottom:5px;font-size:11px}.tree-root-choice.active{border-color:#00b8bd;color:#00a5ab}.archive-perspective-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:8px 0}.archive-perspective-tabs button{height:28px;border:1px solid var(--border);background:#fff;color:#52667e;font-size:11px}.archive-perspective-tabs button.active{border-color:#00b8bd;color:#008f94;background:#f0fbfb}.commissioning-hint{color:var(--muted);font-size:10px;line-height:1.5}.attribute-override-list>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.attribute-override-list>div>span{display:flex;flex-direction:column;min-width:0}.attribute-override-list small{font-size:10px;color:var(--muted)}.attribute-override-list label{display:flex;align-items:center;gap:5px}.attribute-override-list input{width:130px;height:28px;border:1px solid var(--border);padding:0 7px}.attribute-override-list em{font-style:normal;color:var(--muted);font-size:11px}.attribute-override-actions{display:flex;justify-content:flex-end;margin-top:8px}.device-wizard-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:4px}.device-wizard-steps span{padding:7px 4px;border-bottom:2px solid var(--border);color:var(--muted);font-size:11px;text-align:center}.device-wizard-steps span.active{border-color:#00b8bd;color:#008f94}.wizard-two-column{display:grid;grid-template-columns:minmax(230px,0.9fr) minmax(260px,1.1fr);gap:10px}.wizard-selection-panel,.wizard-preview-panel{min-width:0}.wizard-tree-list{height:300px}.wizard-preview-panel{min-height:300px;padding:10px;border:1px solid var(--border);background:#fbfcfe;overflow:auto}.wizard-preview-panel h4{margin:12px 0 6px;color:#52667e;font-size:11px}.wizard-preview-panel h4:first-child{margin-top:0}.wizard-preview-list>div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px}.wizard-preview-list>div span{color:#52667e}.wizard-preview-list>div b{font-weight:500;color:#283f5a}.wizard-preview-panel .device-template-summary{display:flex;flex-direction:column;gap:4px;padding-bottom:8px;border-bottom:1px solid var(--border)}.wizard-preview-panel .device-template-summary small{color:var(--muted);font-size:10px}.wizard-tree-section{display:block}.wizard-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.wizard-section-head>span{font-size:12px}.wizard-section-head .tree-root-choice{margin-bottom:0}.catalog-create-hint{color:var(--muted);font-size:10px;line-height:1.5}.archive-toolbar-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.archive-toolbar-actions .add-action{height:28px;padding:0 10px;font-size:11px}.archive-toolbar-actions .bind-action{min-width:72px}.archive-toolbar-actions .icon-btn{width:28px;height:28px;padding:0}.history-toolbar-row{justify-content:flex-end;gap:5px}.history-toolbar-row .history-period-tabs{margin-left:auto}.history-toolbar-row .history-period-tabs button{height:26px;min-width:30px;padding:0 7px;font-size:11px}.history-toolbar-row .archive-period-arrow{min-width:24px;height:26px;font-size:16px}.history-toolbar-row .archive-period-label{min-width:150px;font-size:11px}.history-toolbar-row .icon-btn{width:28px;height:28px;padding:0}.archive-device-data-body--full,.archive-full-table{height:100%;min-height:0}.archive-full-table{display:flex;flex-direction:column}.archive-full-table-head{flex:none;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}.archive-full-table-row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}.archive-bind-dialog{display:grid;gap:12px}.archive-bind-list{display:grid;gap:8px;max-height:340px;overflow:auto}.archive-bind-item{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;border:1px solid var(--border);border-radius:7px;background:#fff;cursor:pointer}.archive-bind-item input{margin-top:2px}.archive-bind-item b{display:block;font-size:12px}.archive-bind-item small{display:block;color:var(--muted);font-size:10px;line-height:1.4}.archive-main-panel>.archive-runtime-grid,.archive-main-panel>.archive-history-panel,.archive-main-panel>.archive-device-data-panel{min-height:0}.archive-runtime-grid{flex:1;display:grid;grid-template-columns:minmax(280px,0.92fr) minmax(0,1.08fr);gap:12px;min-height:0}.archive-info-card,.archive-realtime-card{min-height:0;display:flex;flex-direction:column}.archive-card-scroll{flex:1;min-height:0;overflow:auto}.archive-device-data-panel{flex:1;display:flex;flex-direction:column;min-height:0}.archive-device-data-body--full{flex:1;min-height:0;display:flex;flex-direction:column}.archive-device-data-body--full .archive-chart-shell,.archive-device-data-body--full .archive-data-table{flex:1;min-height:0}.archive-device-data-body--full .archive-chart-shell{display:flex;flex-direction:column}.archive-device-data-body--full .archive-chart-shell>*{min-height:0}.archive-history-shell{display:flex;flex-direction:column}.archive-history-shell .archive-history-chart{flex:1;min-height:0;height:100%;width:100%}.archive-section-title{min-height:34px}.archive-main-panel>.archive-runtime-grid .archive-section-title{flex:none}.device-detail-layout>.device-detail-left,.device-detail-layout>.device-detail-right,.device-detail-layout>.device-detail-main{min-height:0}
.device-wizard-dialog .dialog-actions{flex-direction:column;align-items:center;gap:8px}.device-wizard-dialog .dialog-actions button{width:min(280px,100%);min-height:36px}.device-wizard-fields{display:block}.device-wizard-fields>.device-wizard-steps{width:100%;margin-bottom:14px}.device-wizard-fields>.dialog-field{grid-template-columns:110px minmax(0,1fr);align-items:center;margin-bottom:12px}.device-wizard-fields>.dialog-field>span{white-space:nowrap;text-align:right}.device-wizard-fields>.device-wizard-error{margin:0 0 12px;padding:9px 11px;border:1px solid #f0b7ad;background:#fff5f2;color:#b64c36;font-size:11px;line-height:1.5}.device-wizard-fields>.wizard-tree-section{width:100%}.device-wizard-fields>.wizard-tree-section+.wizard-tree-section{margin-top:12px}
.archive-realtime-title{flex-wrap:nowrap}.archive-realtime-title h3{flex:none}.archive-realtime-title .archive-chart-actions{margin-left:auto}.archive-template-strip--row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-height:38px;margin:0 0 8px;padding:5px 2px 7px;border-bottom:1px solid var(--border)}.archive-template-strip--row .archive-template-chip{display:inline-flex;align-items:center;gap:7px;height:26px;margin:0;padding:0 8px 0 11px;border:1px solid #c8d9ed;border-radius:6px;background:linear-gradient(180deg,#fff 0%,#f4f8fd 100%);box-shadow:0 1px 2px #17375c12;color:#365675;font-size:11px;font-weight:600;line-height:1;cursor:pointer;transition:border-color .18s,background .18s,box-shadow .18s,color .18s}.archive-template-strip--row .archive-template-chip:hover{border-color:#8eb9e8;background:#f2f8ff;box-shadow:0 3px 8px #17375c16;color:var(--accent)}.archive-template-strip--row .archive-template-chip.active{border-color:var(--accent);background:#eaf4ff;color:#1769c2;box-shadow:inset 0 0 0 1px #2f86ff26}.archive-template-strip--row .archive-template-chip :deep(svg){flex:none;color:#7892ad;stroke-width:2}.archive-template-strip--row .archive-template-chip:hover :deep(svg),.archive-template-strip--row .archive-template-chip.active :deep(svg){color:var(--accent)}.archive-template-empty{color:var(--muted);font-size:10px}.metric-template-summary{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;padding:9px 10px;border:1px solid #d7e5f4;border-radius:7px;background:#f7fbff}.metric-template-user-label{color:#6a7f96;font-size:11px;white-space:nowrap}.metric-template-user-name{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 9px;border:1px solid #c9dcef;border-radius:999px;background:#fff;color:#294f76;font-size:11px;font-weight:700}.metric-template-visibility-tip{display:inline-flex;align-items:center;gap:5px;min-width:0;margin-left:auto;padding:4px 8px;border:1px solid #cfe1f3;border-radius:5px;background:#edf6ff;color:#54718e;font-size:10px;line-height:1.35}.metric-template-visibility-tip>span{display:grid;place-items:center;width:14px;height:14px;flex:none;border-radius:50%;background:#6aa5de;color:#fff;font-size:10px;font-weight:700}.archive-record-toolbar{display:flex;align-items:center;gap:7px;flex:none;margin:0 0 8px}.archive-record-search{flex:1;min-width:0;height:32px}.archive-record-search input{height:auto!important;border:0!important;padding:0!important;box-shadow:none!important}.archive-record-filter{box-sizing:border-box;flex:0 0 118px;width:118px;height:32px;padding:0 8px;border:1px solid #d4e2f2;border-radius:6px;background:#fff;color:#52667e;font-size:11px;outline:0}.archive-record-filter:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgb(47 134 255 / 10%)}.history-period-tabs{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid #cbdced;border-radius:7px;background:#f4f8fc;box-shadow:inset 0 1px 2px #17375c0a}.history-period-tabs button{height:24px;min-width:28px;padding:0 8px;border:0;border-radius:4px;background:transparent;color:#6a7f96;font-size:11px;font-weight:600;line-height:1;cursor:pointer;transition:background .18s,color .18s,box-shadow .18s}.history-period-tabs button:hover{color:var(--accent);background:#e8f3ff}.history-period-tabs button.active{background:#fff;color:#1769c2;box-shadow:0 1px 4px #17375c20}.history-toolbar-row{justify-content:flex-end;gap:4px}.history-toolbar-row .history-period-tabs{margin-left:auto}.history-toolbar-row .archive-period-arrow{width:24px;min-width:24px;height:26px;padding:0;border:1px solid #cbdced;border-radius:5px;background:#fff;color:#55718e;font-size:16px;line-height:1}.history-toolbar-row .archive-period-arrow:hover{border-color:var(--accent);color:var(--accent);background:#f2f8ff}.history-toolbar-row .archive-period-label{min-width:142px;color:#385675;font-size:11px;text-align:center}.archive-table-headbar{display:flex;align-items:center;gap:7px;flex:none;min-height:40px;padding:0 10px;border-bottom:1px solid var(--border);background:#fbfcfe;z-index:3}.archive-table-headbar .archive-table-search{flex:1;min-width:0;height:30px}.archive-table-headbar .archive-column-filter-menu{flex:0 0 118px;width:118px}.archive-table-headbar .archive-column-filter-menu summary{height:30px;padding:0 8px;font-size:10px}.archive-full-table{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;scrollbar-width:none}.archive-full-table::-webkit-scrollbar{display:none}.archive-full-table .archive-full-table-head,.archive-full-table .archive-full-table-row{flex:none}.archive-full-table-head{position:sticky;top:40px;z-index:2;background:#f4f8fc}.archive-full-table-row{min-height:38px;border-bottom:1px solid #edf2f7}.archive-full-table-row:nth-child(even){background:#fbfcfe}.archive-full-table-row>span,.archive-full-table-head>span{min-width:0;padding:8px 9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.archive-full-table-head>span{padding-top:10px;padding-bottom:10px;color:#55718e;font-weight:700}.archive-full-table .archive-table-pagination{flex:none;margin-top:auto}.archive-device-data-body--full>.archive-full-table{flex:1}.metric-template-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;width:100%;min-width:0}.metric-template-search{flex:1 1 auto;min-width:0;height:34px}.metric-template-search input{height:auto!important;border:0!important;padding:0!important;box-shadow:none!important}.metric-template-group-menu{position:relative;flex:0 0 120px;width:120px;min-width:120px}.metric-template-group-menu summary{height:34px;box-sizing:border-box;padding:0 9px;font-size:11px}.metric-template-group-menu[open]>div{z-index:90;right:0;left:auto;width:220px;max-width:calc(100vw - 42px)}.metric-template-points{position:relative;isolation:isolate;display:grid;gap:6px;max-height:320px;min-height:0;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:#fbfcfe;scrollbar-width:none}.metric-template-points::-webkit-scrollbar{display:none}.metric-template-head{position:sticky;top:0;z-index:20;isolation:isolate;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:32px;margin:-8px -8px 0;padding:7px 10px 8px;border-bottom:1px solid #c8d9ed;background:#fbfcfe;box-shadow:0 2px 5px #17375c12}.metric-template-head:after{content:'';position:absolute;inset:100% 0 auto;height:4px;background:#fbfcfe;pointer-events:none}.metric-template-head b{color:#29425e;font-size:11px;font-weight:700}.metric-template-head span{color:#6d8298;font-size:10px}.metric-template-point{position:relative;z-index:0;display:flex;align-items:flex-start;gap:8px;min-height:34px;padding:7px 8px;border:1px solid #d8e4f0;border-radius:6px;background:#fff;box-shadow:0 1px 1px #17375c0a;cursor:pointer;transition:border-color .18s,background .18s,box-shadow .18s,transform .18s}.metric-template-point:hover{z-index:1;border-color:#9fc2ec;background:#f7fbff;box-shadow:0 2px 8px #17375c12;transform:translateY(-1px)}.metric-template-point input[type='checkbox']{box-sizing:border-box;width:12px;height:12px;min-width:12px;margin:2px 0 0;accent-color:var(--accent)}.metric-template-point span{display:grid;gap:2px;min-width:0;flex:1}.metric-template-point b,.metric-template-point small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.metric-template-point b{color:#29425e;font-size:11px;font-weight:600}.metric-template-point small{color:var(--muted);font-size:10px;line-height:1.3}.metric-template-dialog .metric-template-summary,.metric-template-dialog .dialog-field.full,.metric-template-dialog .metric-template-toolbar,.metric-template-dialog .metric-template-points{margin-top:8px}.metric-template-dialog .metric-template-summary{margin-top:0}.metric-template-dialog .archive-no-data{min-height:70px;display:grid;place-items:center;margin:0;padding:10px;color:var(--muted);font-size:11px}.metric-template-dialog :deep(.dialog-actions){border-top:1px solid var(--border)}@media(max-width:640px){.metric-template-visibility-tip{width:100%;margin-left:0}.archive-table-headbar{padding:0 6px}.archive-table-headbar .archive-column-filter-menu{flex-basis:106px;width:106px}.history-toolbar-row .archive-period-label{min-width:112px}.archive-record-filter{flex-basis:106px;width:106px}.metric-template-toolbar{gap:6px}.metric-template-group-menu{flex-basis:104px;width:104px;min-width:104px}.metric-template-points{max-height:280px}}
.wizard-selection-panel{height:100%;display:flex;flex-direction:column}.wizard-selection-panel .wizard-tree-list{flex:1;height:auto;min-height:0}.protocol-address-dialog{min-height:72px}
:deep(.device-wizard-dialog){width:min(780px,calc(100vw - 34px));height:min(720px,calc(100vh - 36px));max-height:none;display:flex;flex-direction:column}.device-wizard-dialog :deep(.dialog-fields){flex:1;min-height:0;overflow:auto}.device-wizard-dialog :deep(.dialog-actions){flex:none;flex-direction:column;align-items:center;gap:8px}.device-wizard-dialog :deep(.dialog-actions) button{width:min(280px,100%);min-height:40px}.device-wizard-fields{min-height:0}.wizard-step-panel{height:455px;min-height:455px;display:flex;flex-direction:column}.wizard-step-panel>.wizard-two-column{height:100%;min-height:0}.wizard-step-panel>.wizard-tree-section{flex:1;min-height:0;display:flex;flex-direction:column}.wizard-step-panel .wizard-tree-list{min-height:300px}.wizard-step-enter-active,.wizard-step-leave-active{transition:opacity .22s ease,transform .22s ease}.wizard-step-enter-from{opacity:0;transform:translateX(18px)}.wizard-step-leave-to{opacity:0;transform:translateX(-18px)}
.device-wizard-progress{position:relative;height:4px;margin:0 4px 12px;border-radius:999px;background:#e6edf6;overflow:hidden}.device-wizard-progress span{display:block;height:100%;border-radius:inherit;background:#2d7ff0;transition:width .35s ease}
.detail-view-filters{display:flex;align-items:center;gap:7px}.detail-view-filters input,.detail-view-filters select{height:30px;min-width:150px;padding:0 8px;border:1px solid var(--border);background:#fff;color:#52667e;font-size:11px}.attribute-view-table{margin:14px;overflow:auto;border:1px solid var(--border)}.attribute-view-table table{width:100%;min-width:720px;border-collapse:collapse;font-size:12px}.attribute-view-table th,.attribute-view-table td{height:38px;padding:7px 10px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}.attribute-view-table th{background:#f7f9fc;color:#5b6e84;font-weight:600}@media(max-width:860px){.detail-view-filters{width:100%;flex-wrap:wrap}.detail-view-filters input,.detail-view-filters select{flex:1;min-width:130px}}
.device-filter-field{min-width:190px}.device-search-field{min-width:min(330px,100%)}.device-filter-menu,.detail-filter-menu{position:relative;width:100%;min-width:0}.device-filter-menu summary,.detail-filter-menu summary{height:36px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 11px;border:1px solid #d4e2f2;border-radius:7px;background:#fff;color:#3d5876;cursor:pointer;list-style:none;box-shadow:0 1px 2px #17375c08;transition:border-color .18s,box-shadow .18s}.device-filter-menu summary::-webkit-details-marker,.detail-filter-menu summary::-webkit-details-marker{display:none}.device-filter-menu summary:hover,.detail-filter-menu summary:hover{border-color:var(--accent);box-shadow:0 0 0 3px #4c8dff12}.device-filter-menu[open]>div,.detail-filter-menu[open]>div{position:absolute;top:42px;left:0;z-index:12;display:grid;gap:3px;width:max-content;min-width:100%;max-width:min(360px,calc(100vw - 38px));max-height:260px;padding:8px;border:1px solid #d4e2f2;border-radius:8px;background:#fff;box-shadow:0 14px 30px #17375c20;overflow:auto;scrollbar-width:none}.device-filter-menu[open]>div::-webkit-scrollbar,.detail-filter-menu[open]>div::-webkit-scrollbar{display:none}.device-filter-menu label,.detail-filter-menu label{display:flex;align-items:center;gap:7px;min-height:30px;padding:0 8px;border-radius:5px;color:#38536f;font-size:12px;white-space:nowrap;cursor:pointer}.device-filter-menu label:hover,.detail-filter-menu label:hover{background:#f0f6ff;color:var(--accent)}.device-filter-menu input[type='checkbox'],.detail-filter-menu input[type='checkbox']{box-sizing:border-box;width:12px;height:12px;min-width:12px;max-width:12px;min-height:12px;max-height:12px;margin:0;padding:0;flex:0 0 12px;accent-color:var(--accent)}.device-filter-menu.disabled summary{border-style:dashed;background:#f7f9fc;color:#9aaabd;cursor:not-allowed}.filter-menu-hint{margin:2px 4px;padding:7px 8px;color:#8494a8;font-size:11px;white-space:nowrap}.detail-filter-search{height:36px;display:flex;align-items:center;gap:7px;min-width:220px;padding:0 10px;border:1px solid #d4e2f2;border-radius:7px;background:#fff;color:#7890aa}.detail-filter-search input{min-width:0;width:100%;height:auto!important;padding:0!important;border:0!important;box-shadow:none!important;outline:0}.detail-filter-menu{width:190px}.detail-filter-menu summary{font-size:11px}.detail-filter-menu[open]>div{right:0;left:auto}.detail-view-filters{display:flex;align-items:center;gap:8px}
.device-card-media,.device-detail-image{display:grid;place-items:center;overflow:hidden;background:#f7f9fc;color:#8da1b7}.device-card-media img,.device-detail-image img{width:100%;height:100%;object-fit:cover;display:block}.device-detail-image{width:100%;aspect-ratio:4/3;border:1px solid var(--border);border-radius:8px}
.device-context-grid--single{grid-template-columns:minmax(0,1fr)}.device-alarm-filters{margin:0 0 10px;flex-wrap:wrap}.device-alarm-filters .detail-filter-search{flex:1;min-width:240px}.detail-filter-select{height:30px;min-width:150px;padding:0 8px;border:1px solid var(--border);border-radius:6px;background:#fff;color:#52667e;font-size:11px}.device-context-table-card{overflow:hidden}.device-context-table-card .archive-full-table{border:1px solid #d9e5f2;border-radius:10px;background:#fbfdff;overflow:auto}.device-context-table-card .archive-full-table-head{background:#edf4fb;color:#49637f;font-weight:700;min-height:40px}.device-context-table-card .archive-full-table-row{min-height:44px;border-bottom:1px solid #e8eff6;transition:background .18s ease}.device-context-table-card .archive-full-table-row:hover{background:#f1f7ff}.device-context-table-card .archive-full-table-row span{color:#49627c}.device-context-table-card .archive-table-pagination{padding:10px 4px 0}.billing-dashboard-grid--compact{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.billing-dashboard-grid--compact .billing-dashboard-chart{min-height:280px}.billing-dashboard-grid--compact .billing-dashboard-prepared,.billing-dashboard-grid--compact .billing-dashboard-entry{grid-column:span 1}.billing-dashboard-grid--compact .billing-dashboard-prepared{grid-row:2}.billing-dashboard-grid--compact .billing-dashboard-entry{grid-row:2}.billing-stat-chart{width:100%;height:240px;min-height:240px}.settlement-switch-card{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:104px;padding:18px;border:1px solid #dce5ec;border-radius:12px;background:#f7f9fb}.settlement-switch-card.enabled{border-color:#c8ded8;background:#f4faf8}.settlement-switch-card>div{min-width:0}.settlement-switch-card b,.settlement-switch-card span{display:block}.settlement-switch-card b{color:#334b5e;font-size:17px}.settlement-switch-card span{margin-top:7px;color:#788b9b;font-size:12px;line-height:1.6}.settlement-switch-card button{flex:none;min-width:92px}@media(max-width:760px){.billing-dashboard-grid--compact{grid-template-columns:1fr}.billing-dashboard-grid--compact .billing-dashboard-prepared,.billing-dashboard-grid--compact .billing-dashboard-entry{grid-column:auto;grid-row:auto}.settlement-switch-card{align-items:flex-start;flex-direction:column}.settlement-switch-card button{width:100%}}</style>
