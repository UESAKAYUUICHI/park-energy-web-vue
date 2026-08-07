<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, BarChart3, Building2, ChevronDown, ChevronRight, Copy, Cpu, FileText, Pencil, RadioTower, RefreshCw, Search, Trash2 } from '@lucide/vue'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import CatalogTreeNode from '@/components/catalog/CatalogTreeNode.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { bindDevicesToGateway, catalogModel, catalogTree, copyResource, createResource, deviceArchiveProfile, deviceTree, gatewayArchiveProfile, listResource, orgArchiveProfile, provisionDevice, publishedModelOptions, removeResource, rootOrgs, saveDeviceAttributeOverrides, saveDeviceTypePoints, updateDeviceContext, updateResource } from '@/api/platform'
import meterImage from '@/assets/meter-device.png'
import type { RecordRow } from '@/types/domain'
import { fieldLabel } from '@/utils/fieldLabels'

use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

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
function daysAgo(days: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return formatDateInput(date)
}
const archiveLink = (label: string, path: string, query: Record<string, string>): ArchiveAction => ({ label, path, query })

const route = useRoute()
const router = useRouter()
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
const gatewayOptions = ref<RecordRow[]>([])
const typeOptions = ref<RecordRow[]>([])
const modelOptions = ref<RecordRow[]>([])
const publishedCatalogTree = ref<RecordRow[]>([])
const selectedModelTreeKey = ref('')
const selectedOrgTreeKey = ref('')
const selectedNode = ref<TreeNode | null>(null)
const showAllData = ref(false)
const profile = ref<RecordRow>({})
const loading = ref(false)
const error = useAlertRef()
const treeLoading = ref(false)
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
const pointDrafts = ref<PointDraft[]>([])
const pointSaving = ref(false)
const pointEditor = ref<PointDraft | null>(null)
const pointEditingKey = ref('')
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
const activeArchiveTab = ref<'device' | 'inspection' | 'runtime'>('device')
const detailWorkspaceTab = ref<'overview' | 'alarms' | 'billing' | 'attributes' | 'points'>('overview')
const bottomArchiveTab = ref<'history' | 'alarm'>('history')
const dataView = ref<'chart' | 'table'>('chart')
const historyStart = ref(daysAgo(30))
const historyEnd = ref(formatDateInput(new Date()))
const historyInterval = ref('五分钟')
const historyParam = ref('')
const overviewRealtimeChartEl = ref<HTMLElement | null>(null)
const deviceRealtimeChartEl = ref<HTMLElement | null>(null)
const detailRealtimeChartEl = ref<HTMLElement | null>(null)
const historyChartEl = ref<HTMLElement | null>(null)
const alarmChartEl = ref<HTMLElement | null>(null)
let overviewRealtimeChart: ECharts | null = null
let deviceRealtimeChart: ECharts | null = null
let detailRealtimeChart: ECharts | null = null
let historyChart: ECharts | null = null
let alarmChart: ECharts | null = null
let treeTimer: ReturnType<typeof setTimeout> | null = null
let ignoreNextTreeWatch = false
let renderToken = 0

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
const pointMappings = computed(() => ((profile.value.points as RecordRow | undefined)?.mappings || []) as RecordRow[])
const realtimeLookup = computed<Record<string, unknown>>(() => {
  const raw = profile.value.realtime
  if (raw && typeof raw === 'object' && Array.isArray((raw as RecordRow).points)) {
    return ((raw as RecordRow).points as RecordRow[]).reduce<Record<string, unknown>>((acc, item) => {
      const key = String(item.pointCode || item.point_code || '')
      if (key) acc[key] = item.value
      return acc
    }, {})
  }
  if (Array.isArray(raw)) {
    return raw.reduce<Record<string, unknown>>((acc, item) => {
      if (item && typeof item === 'object') {
        const row = item as RecordRow
        const key = String(row.point_code || row.pointCode || row.name || row.id || '')
        if (key) acc[key] = row.value ?? row.usage_value ?? row.alarm_value ?? row.data_value ?? row.current_value ?? row.currentValue ?? row
      }
      return acc
    }, {})
  }
  if (raw && typeof raw === 'object') return flattenRealtimePoints(raw as RecordRow)
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
const deviceRealtimeChartRows = computed(() => groupedHistoryOrdered.value.length ? groupedHistoryOrdered.value : energyTrend.value.map((item) => ({
  time: String(item.stat_period || item.stat_date || ''),
  values: { total_active_energy: item.usage_value ?? 0 },
  sourceRows: [item],
})))
const deviceRealtimeSeriesKeys = computed(() => {
  const keys = new Set<string>()
  deviceRealtimeChartRows.value.forEach((row) => Object.keys(row.values).forEach((key) => keys.add(key)))
  return [...keys]
})
const deviceRealtimePointRows = computed(() => Object.entries(realtimeLookup.value)
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
  .filter((item) => item.value > 0)
  .slice(0, 12))
const latestHistoryValues = computed(() => groupedHistory.value[0]?.values || {})
const runtimeCards = computed(() => {
  const normalized = profile.value.realtime as RecordRow | undefined
  const reportedPoints = normalized && Array.isArray(normalized.points) ? normalized.points as RecordRow[] : []
  const latest = latestHistoryValues.value
  if (pointDefinitions.value.length) {
    return pointDefinitions.value.map((definition) => {
      const code = String(definition.point_code || definition.pointCode || definition.code || '')
      const reported = reportedPoints.find((point) => String(point.pointCode || point.point_code || '') === code)
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
      code: String(point.pointCode || point.point_code || ''),
      name: String(point.pointName || point.point_name || point.pointCode || ''),
      unit: String(point.unit || ''),
      role: String(point.businessRole || point.business_role || ''),
      value: point.value,
    }))
  }
  return Object.keys(latest).map((code) => {
    const definition = pointDefinitions.value.find((point) => String(point.point_code || point.pointCode || point.code || '') === code)
    return {
      code,
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
    ['历史记录', summary.historyCount ?? recentHistory.value.length],
    ['近期告警', summary.alarmCount ?? recentAlarms.value.length],
    ['指令记录', summary.commandCount ?? inspectionRecords.value.length],
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
    archiveLink('历史分析', '/analysis/history', { deviceId: id, pointCodes: defaultPointCodes.value, startTime: historyStart.value, endTime: historyEnd.value }),
    archiveLink('告警中心', '/alarms/events', { deviceId: id }),
    archiveLink('指令追踪', '/access/commands', { targetId: id }),
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
    archiveLink('租户合同', '/billing/contracts', { orgId: id }),
    archiveLink('账单中心', '/billing/bills', { orgId: id, includeChildren: 'true' }),
  ]
})
const bindableDevices = computed(() => bindingDevices.value.filter((device) => String(device.gateway_id || '') !== String(selectedNode.value?.id || '')))
const viewToggleLabel = computed(() => dataView.value === 'chart' ? '图表' : '表格')
const alarmTableColumns = computed(() => {
  const preferred = ['alarm_time', 'org_name', 'device_name', 'device_sn', 'alarm_type', 'alarm_level', 'point_code', 'alarm_value', 'threshold_value', 'deal_status', 'deal_time', 'deal_user', 'deal_remark']
  const keys = new Set<string>()
  preferred.forEach((key) => keys.add(key))
  recentAlarms.value.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))
  return [...keys].filter((key) => recentAlarms.value.some((row) => !isMissingValue(row[key])))
})
const hasDeviceRealtimeChart = computed(() => {
  if (!selectedIsDevice.value) return overviewRealtimeRows.value.length > 0 || energyTrend.value.length > 0
  return deviceRealtimePointRows.value.length > 0 || deviceRealtimeChartRows.value.length > 0 || energyTrend.value.length > 0
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
  if (Object.prototype.hasOwnProperty.call(raw, code)) return raw[code]
  const camel = code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  if (Object.prototype.hasOwnProperty.call(raw, camel)) return raw[camel]
  return '--'
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

async function selectNode(node: TreeNode) {
  selectedNode.value = node
  profileLoading.value = true
  try {
    if (node.nodeType === 'DEVICE') {
      profile.value = await deviceArchiveProfile(node.id)
      syncPointDrafts()
      syncAttributeDrafts()
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'history'
      dataView.value = 'chart'
    } else if (node.nodeType === 'GATEWAY') {
      profile.value = await gatewayArchiveProfile(node.id)
      pointDrafts.value = []
      pointEditor.value = null
      pointEditingKey.value = ''
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'alarm'
      dataView.value = 'chart'
    } else if (node.nodeType === 'ORG') {
      profile.value = await orgArchiveProfile(node.id)
      pointDrafts.value = []
      pointEditor.value = null
      pointEditingKey.value = ''
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'alarm'
      dataView.value = 'chart'
    } else {
      const deviceCount = nodeChildren(node).filter((item) => item.nodeType === 'DEVICE').length
      profile.value = node.nodeType === 'SPACE'
        ? { space: node, summary: { deviceCount } }
        : { group: node, summary: { deviceCount } }
      pointDrafts.value = []
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'alarm'
      dataView.value = 'table'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取节点失败'
    profile.value = {}
  } finally {
    profileLoading.value = false
    await renderCharts()
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
    quality_gate_start_date: String(row?.quality_gate_start_date || formatDateInput(new Date())),
    status: row?.status ?? 1,
  })
  editingGatewayId.value = row?.gateway_id ? String(row.gateway_id) : ''
  const selectedOption = modelOptions.value.find((item) => String(item.model_version_id) === String(form.model_version_id))
  selectedModelTreeKey.value = selectedOption?.model_version_id ? `VERSION:${selectedOption.model_version_id}` : ''
  selectedOrgTreeKey.value = form.org_id ? `ORG:${form.org_id}` : ''
  dialog.value = true
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
    if (formType.value === 'device' && !editingId.value) form.gateway_id = ''
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
    else if (formType.value === 'device') await provisionDevice(payload)
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
    // 空间仅保留历史数据兼容，不再由设备档案页面维护。
    delete payload.space_id
    if (!payload.install_time) delete payload.install_time
  }
  return payload
}

async function loadBindingDevices() {
  bindingLoading.value = true
  try {
    const page = await listResource('archive', 'devices', { pageSize: 500, keyword: bindingKeyword.value })
    bindingDevices.value = page.records.map((item) => ({
      ...item,
      org_name: orgOptions.value.find((org) => String(org.id) === String(item.org_id))?.org_name,
      gateway_name: gatewayOptions.value.find((gateway) => String(gateway.id) === String(item.gateway_id))?.gateway_name,
      gateway_sn: gatewayOptions.value.find((gateway) => String(gateway.id) === String(item.gateway_id))?.gateway_sn,
      type_name: typeOptions.value.find((type) => String(type.id) === String(item.device_type_id))?.type_name,
    }))
  } finally {
    bindingLoading.value = false
  }
}

async function openBindDevices() {
  if (!selectedNode.value || selectedNode.value.nodeType !== 'GATEWAY') return
  bindingDeviceIds.value = []
  bindingKeyword.value = ''
  bindDialog.value = true
  await loadBindingDevices()
}

function toggleBindingDevice(id: unknown, checked: boolean) {
  const value = String(id)
  bindingDeviceIds.value = checked ? [...new Set([...bindingDeviceIds.value, value])] : bindingDeviceIds.value.filter((item) => item !== value)
}

async function submitBindDevices() {
  if (!selectedNode.value || selectedNode.value.nodeType !== 'GATEWAY') return
  if (!bindingDeviceIds.value.length) {
    error.value = '请选择需要绑定的设备'
    return
  }
  try {
    await bindDevicesToGateway(selectedNode.value.id, bindingDeviceIds.value)
    bindDialog.value = false
    await loadAll()
    const node = findNodeByKey(tree.value, nodeKey(selectedNode.value))
    if (node) await selectNode(node)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '绑定设备失败'
  }
}

async function loadLookups() {
  const [roots, orgs, gateways, types, publishedModels, productTree] = await Promise.all([
    rootOrgs(),
    listResource('archive', 'orgs', { pageSize: 200 }),
    listResource('archive', 'gateways', { pageSize: 200 }),
    listResource('archive', 'device-types', { pageSize: 200 }),
    publishedModelOptions(),
    catalogTree(),
  ])
  rootOrgOptions.value = roots
  orgOptions.value = orgs.records
  gatewayOptions.value = gateways.records
  typeOptions.value = types.records
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
  treeLoading.value = true
  try {
    const rows = await deviceTree({
      rootOrgId: selectedRootOrgId.value || undefined,
      keyword: treeKeyword.value || undefined,
    })
    tree.value = attachGatewayNodes(rows as TreeNode[])
    expandedKeys.value = treeKeyword.value ? collectExpanded(tree.value) : collectInitialExpanded(tree.value)
    const currentKey = selectedNode.value ? nodeKey(selectedNode.value) : ''
    const nextSelected = currentKey ? findNodeByKey(tree.value, currentKey) : null
    selectedNode.value = currentKey ? nextSelected : null
    if (!selectedNode.value) profile.value = {}
    await renderCharts()
  } finally {
    treeLoading.value = false
  }
}

async function loadDevices() {
  const params = {
    pageSize: 200,
    keyword: deviceKeyword.value || undefined,
  }
  const pages = deviceRootOrgIds.value.length
    ? await Promise.all(deviceRootOrgIds.value.map((orgId) => listResource('archive', 'devices', { ...params, orgId, includeChildren: 'true' })))
    : [await listResource('archive', 'devices', params)]
  const unique = new Map<string, RecordRow>()
  pages.flatMap((page) => page.records).forEach((item) => unique.set(String(item.id), item))
  const selectedGateways = new Set(deviceGatewayIds.value)
  devices.value = [...unique.values()]
    .filter((item) => !selectedGateways.size || selectedGateways.has(String(item.gateway_id)))
    .map((item) => ({
    ...item,
    org_name: orgOptions.value.find((org) => String(org.id) === String(item.org_id))?.org_name,
    gateway_name: gatewayOptions.value.find((gateway) => String(gateway.id) === String(item.gateway_id))?.gateway_name,
    gateway_sn: gatewayOptions.value.find((gateway) => String(gateway.id) === String(item.gateway_id))?.gateway_sn,
    type_name: typeOptions.value.find((type) => String(type.id) === String(item.device_type_id))?.type_name,
    }))
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

async function loadDetail() {
  const id = route.params.id
  if (!id) return
  profile.value = await deviceArchiveProfile(id)
  syncPointDrafts()
  syncAttributeDrafts()
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
  bottomArchiveTab.value = 'history'
  dataView.value = 'chart'
  await renderCharts()
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const lookupPromise = loadLookups()
    if (mode.value === 'org-tree') await Promise.all([lookupPromise, loadTree()])
    else {
      await lookupPromise
      if (mode.value === 'devices') await loadDevices()
      else await loadDetail()
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
function ensureChartInstance(current: ECharts | null, el: HTMLElement) {
  if (current && current.getDom() === el) return current
  current?.dispose()
  return init(el)
}
function multiLineOption(labels: string[], seriesKeys: string[], rows: Array<{ time: string; values: Record<string, unknown> }>): EChartsCoreOption {
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
  const token = ++renderToken
  await waitForPaint()
  if (token !== renderToken) return
  if (activeArchiveTab.value === 'device') {
    const isDetail = mode.value === 'device-detail'
    const isDeviceTree = selectedIsDevice.value && !isDetail
    const shouldRenderDeviceChart = selectedIsDevice.value || isDetail
    const chartEl = isDetail ? detailRealtimeChartEl.value : isDeviceTree ? deviceRealtimeChartEl.value : overviewRealtimeChartEl.value
    const chartRef = isDetail ? detailRealtimeChart : isDeviceTree ? deviceRealtimeChart : overviewRealtimeChart
    if (chartEl) {
      const chart = ensureChartInstance(chartRef, chartEl)
      if (isDetail) detailRealtimeChart = chart
      else if (isDeviceTree) deviceRealtimeChart = chart
      else overviewRealtimeChart = chart
      if (shouldRenderDeviceChart) {
        if (deviceRealtimePointRows.value.length) {
          chart.setOption(
            barOption(
              deviceRealtimePointRows.value.map((item) => item.key),
              deviceRealtimePointRows.value.map((item) => item.value),
              '当前值',
            ),
            true,
          )
        } else if (deviceRealtimeChartRows.value.length) {
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
  if (selectedIsDevice.value && bottomArchiveTab.value === 'history' && dataView.value === 'chart' && historyChartEl.value) {
    historyChart ||= init(historyChartEl.value)
    const labels = groupedHistory.value.map((item) => item.time)
    const values = groupedHistory.value.map((item) => Number(Object.values(item.values).reduce((sum, value) => Number(sum) + Number(value || 0), 0)))
    historyChart.setOption(lineOption(labels, values, '历史用量'), true)
    historyChart.resize()
  } else {
    historyChart?.dispose()
    historyChart = null
  }
  if (bottomArchiveTab.value === 'alarm' && dataView.value === 'chart' && alarmChartEl.value) {
    alarmChart ||= init(alarmChartEl.value)
    const labels = alarmTrend.value.length ? alarmTrend.value.map((item) => String(item.alarm_date || item.stat_period || '')) : [...new Set(recentAlarms.value.map((item) => String(item.alarm_type || '告警')))]
    const values = alarmTrend.value.length
      ? alarmTrend.value.map((item) => Number(item.alarm_count || item.count || 0))
      : labels.map((label) => recentAlarms.value.filter((item) => String(item.alarm_type || '告警') === label).length)
    alarmChart.setOption(barOption(labels, values, '告警数量'), true)
    alarmChart.resize()
  } else {
    alarmChart?.dispose()
    alarmChart = null
  }
}
function resizeCharts() {
  overviewRealtimeChart?.resize()
  deviceRealtimeChart?.resize()
  detailRealtimeChart?.resize()
  historyChart?.resize()
  alarmChart?.resize()
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
watch([activeArchiveTab, detailWorkspaceTab, bottomArchiveTab, dataView, () => profile.value], () => { void renderCharts() }, { deep: true })
watch(bottomArchiveTab, (tab) => {
  if (tab === 'history') dataView.value = 'chart'
})
onMounted(() => { window.addEventListener('resize', resizeCharts); void loadAll() })
onBeforeUnmount(() => {
  if (treeTimer) clearTimeout(treeTimer)
  window.removeEventListener('resize', resizeCharts)
  overviewRealtimeChart?.dispose()
  deviceRealtimeChart?.dispose()
  detailRealtimeChart?.dispose()
  historyChart?.dispose()
  alarmChart?.dispose()
  overviewRealtimeChart = null
  deviceRealtimeChart = null
  detailRealtimeChart = null
  historyChart = null
  alarmChart = null
})
</script>

<template>
  <section class="view-page device-archive-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">DEVICE ARCHIVE</p>
        <h1>{{ title }}</h1>
        <p>{{ mode === 'org-tree' ? '按组织层级查看设备档案，网关仅作为设备采集配置。' : mode === 'devices' ? '设备卡片档案。' : '设备档案详情。' }}</p>
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
            <select v-model="selectedRootOrgId" :disabled="rootOrgSelectLocked">
              <option v-if="!rootOrgOptions.length" value="">暂无可选站点</option>
              <option v-for="org in rootOrgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option>
            </select>
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
            <div v-if="treeLoading || loading" class="empty-state">正在读取组织档案...</div>
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
          <div v-if="selectedIsDevice" class="archive-tabs">
            <button :class="{ active: activeArchiveTab === 'device' }" @click="activeArchiveTab = 'device'">设备信息</button>
            <button :class="{ active: activeArchiveTab === 'inspection' }" @click="activeArchiveTab = 'inspection'">指令记录</button>
            <button :class="{ active: activeArchiveTab === 'runtime' }" @click="activeArchiveTab = 'runtime'">实时运行数据</button>
          </div>
          <div v-else class="archive-tabs archive-tabs-static">
            <button class="active">{{ selectedIsGateway ? '网关概览' : selectedIsSpace ? '空间概览' : selectedIsGroup ? '状态分组' : '组织概览' }}</button>
          </div>

          <div class="archive-runtime-grid">
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
                <div class="archive-section-title">
                  <i></i>
                  <h3>{{ selectedIsDevice ? '实时数据' : '运行概览' }}</h3>
                  <button class="icon-btn" title="刷新" aria-label="刷新" @click="refreshSelected"><RefreshCw :size="16" /></button>
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
                      <div v-show="hasDeviceRealtimeChart" ref="overviewRealtimeChartEl" class="archive-trend-chart"></div>
                      <div v-if="!hasDeviceRealtimeChart" class="archive-no-data">暂无能耗趋势数据。</div>
                    </div>
                  </template>
                  <template v-else>
                    <div v-if="profileLoading" class="archive-no-data">正在读取实时数据...</div>
                    <div v-else class="archive-chart-shell">
                      <div v-show="hasDeviceRealtimeChart" ref="deviceRealtimeChartEl" class="archive-trend-chart"></div>
                      <div v-if="!hasDeviceRealtimeChart" class="archive-no-data">暂无实时运行曲线。</div>
                    </div>
                  </template>
                </div>
              </template>

              <template v-else-if="activeArchiveTab === 'inspection'">
                <div class="archive-section-title">
                  <i></i>
                  <h3>指令记录</h3>
                  <small>设备操作记录</small>
                </div>
                <div class="archive-card-scroll">
                  <div v-if="!inspectionRecords.length" class="archive-no-data">暂无指令记录。</div>
                  <div v-else class="archive-inspection-list">
                    <div v-for="row in inspectionRecords" :key="String(row.id)">
                      <b>{{ row.command_type || '指令记录' }}</b>
                      <span>{{ row.target_sn || row.request_time || '—' }}</span>
                      <small>{{ row.status ?? '—' }}</small>
                    </div>
                  </div>
                </div>
              </template>

              <template v-else>
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

          <div class="archive-history-panel">
            <div class="archive-history-tabs">
              <button v-if="selectedIsDevice" :class="{ active: bottomArchiveTab === 'history' }" @click="bottomArchiveTab = 'history'">历史数据</button>
              <button :class="{ active: bottomArchiveTab === 'alarm' }" @click="bottomArchiveTab = 'alarm'">报警数据</button>
            </div>
            <div class="archive-query-row">
              <template v-if="selectedIsDevice && bottomArchiveTab === 'history'">
                <label>开始时间 <input v-model="historyStart" type="date"></label>
                <label>结束时间 <input v-model="historyEnd" type="date"></label>
                <label>时间间隔 <select v-model="historyInterval"><option>五分钟</option><option>十五分钟</option><option>一小时</option><option>一天</option></select></label>
                <label>参数 <input v-model="historyParam" placeholder="名称/编码"></label>
              </template>
              <button
                class="quiet archive-view-toggle"
                :class="{ active: dataView === 'table' }"
                :title="viewToggleLabel"
                :aria-label="viewToggleLabel"
                @click="toggleDataView"
              >
                <BarChart3 v-if="dataView === 'table'" :size="16" />
                <FileText v-else :size="16" />
                {{ viewToggleLabel }}
              </button>
              <button class="icon-btn" title="刷新" aria-label="刷新" @click="refreshSelected"><RefreshCw :size="16" /></button>
            </div>

      <div v-if="selectedIsDevice && bottomArchiveTab === 'history'">
              <div class="archive-chart-shell">
                <div v-show="dataView === 'chart'" ref="historyChartEl" class="archive-history-chart"></div>
                <div v-if="dataView === 'table'" class="archive-data-table archive-scroll-table">
                  <div v-if="!groupedHistory.length" class="archive-no-data">暂无历史数据。</div>
                  <div v-for="row in groupedHistory" :key="row.time" class="archive-history-row">
                    <div class="archive-history-time">{{ row.time }}</div>
                    <div class="archive-history-grid">
                      <span v-for="column in groupedHistoryColumns" :key="column">
                        <b>{{ column }}</b>
                        <small>{{ displayValue(row.values[column]) }}</small>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="bottomArchiveTab === 'alarm'">
              <div class="archive-chart-shell">
                <div v-show="dataView === 'chart'" ref="alarmChartEl" class="archive-history-chart"></div>
                <div v-if="dataView === 'table'" class="archive-data-table archive-scroll-table archive-full-table">
                  <div v-if="!recentAlarms.length" class="archive-no-data">暂无报警数据。</div>
                  <div v-else class="archive-full-table-head">
                    <span v-for="column in alarmTableColumns" :key="column">{{ fieldLabel(column) }}</span>
                  </div>
                  <div v-for="row in recentAlarms" :key="String(row.id)" class="archive-full-table-row">
                    <span v-for="column in alarmTableColumns" :key="column">{{ archiveFieldValue(column, row[column]) }}</span>
                  </div>
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
      <div v-if="loading" class="empty-state">正在读取设备档案...</div>
      <div v-else class="device-card-grid">
        <article v-for="item in devices" :key="String(item.id)" class="device-card">
          <div class="device-card-media"><img :src="meterImage" alt="电表设备"></div>
          <div class="device-card-info">
            <h3>{{ item.device_name || item.device_sn }}</h3>
            <p>{{ item.device_sn }} · {{ item.type_name || '设备' }}</p>
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
          <img :src="meterImage" alt="电表设备">
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
                <h3>{{ detailWorkspaceTab === 'overview' ? '设备运行工作区' : detailWorkspaceTab === 'alarms' ? '告警与运维上下文' : detailWorkspaceTab === 'billing' ? '结算与账单上下文' : detailWorkspaceTab === 'attributes' ? '属性查看' : '测点查看' }}</h3>
                <small>{{ detailDevice.type_name || detailDevice.type_code || '设备类型/型号' }}</small>
              </div>
              <div class="device-workspace-tabs">
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'overview' }" @click="detailWorkspaceTab = 'overview'">运行总览</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'alarms' }" @click="detailWorkspaceTab = 'alarms'">告警与运维</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'billing' }" @click="detailWorkspaceTab = 'billing'">结算与账单</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'attributes' }" @click="detailWorkspaceTab = 'attributes'">属性查看</button>
                <button class="quiet" :class="{ active: detailWorkspaceTab === 'points' }" @click="detailWorkspaceTab = 'points'">测点查看</button>
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
                  <div class="archive-section-title"><i></i><h3>最近历史数据</h3><small>日统计</small></div>
                  <div class="compact-list">
                    <div v-for="row in recentHistory" :key="String(row.id || `${row.stat_date}-${row.point_code}`)">
                      <b>{{ row.point_code }} · {{ row.usage_value ?? '—' }}</b>
                      <span>{{ row.stat_date }} / 完整率 {{ row.data_complete_rate ?? '—' }}%</span>
                    </div>
                    <div v-if="!recentHistory.length"><b>暂无历史数据</b><span>日统计写入后将在此展示。</span></div>
                  </div>
                </section>
                <section class="device-workspace-list">
                  <div class="archive-section-title"><i></i><h3>最近告警数据</h3><small>告警事件</small></div>
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
              <div class="device-context-grid">
                <section class="device-context-card alert-context-card"><div class="archive-section-title"><i></i><h3>近期告警</h3><small>{{ recentAlarms.length }} 条</small></div><div class="compact-list"><div v-for="row in recentAlarms" :key="String(row.id)"><b>{{ alarmTypeText(row.alarm_type) }} · {{ alarmLevelText(row.alarm_level) }}</b><span>{{ row.point_code || '—' }} / {{ row.alarm_time || '—' }}</span></div><div v-if="!recentAlarms.length"><b>暂无近期告警</b><span>当前设备暂无待处理异常。</span></div></div></section>
                <section class="device-context-card"><div class="archive-section-title"><i></i><h3>下一步处置</h3><small>按设备上下文跳转</small></div><p>告警发生后，可先查看实时数据，再转为工单跟踪处理过程。</p><div class="device-context-actions"><button class="primary" @click="router.push({ path: '/alarms/workbench', query: { deviceId: String(detailDevice.id || route.params.id) } })">进入告警处置</button><button class="quiet" @click="router.push({ path: '/operations/work-orders', query: { deviceId: String(detailDevice.id || route.params.id) } })">查看关联工单</button><button class="quiet" @click="router.push({ path: '/access/commands', query: { targetId: String(detailDevice.id || route.params.id) } })">查看控制记录</button></div></section>
              </div>
            </template>

            <template v-else-if="detailWorkspaceTab === 'billing'">
              <div class="device-context-grid">
                <section class="device-context-card"><div class="archive-section-title"><i></i><h3>结算准备度</h3><small>以采集质量为准</small></div><dl class="device-context-facts"><dt>可计费测点</dt><dd>{{ pointDefinitions.filter(item => Number(item.billable) === 1).length }} 个</dd><dt>结算完整率阈值</dt><dd>{{ detailDevice.quality_threshold_pct || 95 }}%</dd><dt>最近统计记录</dt><dd>{{ recentHistory.length }} 条</dd></dl></section>
                <section class="device-context-card"><div class="archive-section-title"><i></i><h3>进入结算流程</h3><small>不在设备页直接改账</small></div><p>账单由合同、计费规则和质量通过的日统计共同生成。需要调整表计时，请先走计量变更流程。</p><div class="device-context-actions"><button class="primary" @click="router.push('/billing/settlement')">打开结算工作台</button><button class="quiet" @click="router.push('/billing/metering')">计量变更</button><button class="quiet" @click="router.push('/billing/bills')">查看账单中心</button></div></section>
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
                    <label><span>数据类型</span><select v-model="pointEditor.data_type"><option>DOUBLE</option><option>INTEGER</option><option>STRING</option></select></label>
                    <label><span>单位</span><input v-model.trim="pointEditor.unit" placeholder="kWh"></label>
                    <label><span>业务角色</span><input v-model.trim="pointEditor.business_role" placeholder="INSTANT_VALUE"></label>
                    <label><span>可计费</span><select v-model.number="pointEditor.billable"><option :value="0">否</option><option :value="1">是</option></select></label>
                    <label><span>纳入统计</span><select v-model.number="pointEditor.stat_enabled"><option :value="1">是</option><option :value="0">否</option></select></label>
                    <label><span>启用状态</span><select v-model.number="pointEditor.enabled"><option :value="1">启用</option><option :value="0">未启用</option></select></label>
                  </div>
                  <button class="primary point-confirm-btn" @click="confirmPointDraft">{{ pointEditingKey ? '确认修改' : '确认新增' }}</button>
                </aside>
              </div>
            </template>
          </article>
        </section>
      </div>
    </template>

    <AppDialog v-model:open="dialog" :dialog-class="formType === 'device' && !editingId ? 'device-wizard-dialog' : ''" :title="formType === 'device' ? (editingId ? '编辑设备档案' : `登记设备 · 第 ${deviceWizardStep} 步`) : (editingId ? '编辑档案' : '新增档案')" :description="formType === 'device' ? (editingId ? '设备上下文、部署和计量投运会在一次事务中保存。' : '按设备基础信息、型号模板、所属组织三步完成登记。') : '层级档案。'" :confirm-text="formType === 'device' && !editingId ? (deviceWizardStep < 3 ? '下一步' : '确认登记') : undefined" @submit="submitDialog">
      <div v-if="formType === 'org'" class="dialog-fields">
        <div class="dialog-field full device-model-tree-field"><span>上级组织</span><button class="quiet tree-root-choice" type="button" :class="{ active: !form.parent_id }" @click="clearDialogOrg">无（根节点）</button><div class="device-model-tree archive-tree-list"><CatalogTreeNode v-for="node in dialogOrgTree" :key="String(node.key)" :node="node" :selected-key="selectedOrgTreeKey" @select="selectDialogOrg" /></div></div>
        <label class="dialog-field"><span>组织名称*</span><input v-model="form.org_name" required></label>
        <label class="dialog-field"><span>组织类型</span><select v-model="form.org_type"><option v-for="item in orgTypeOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></select></label>
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
        <label class="dialog-field"><span>启用状态</span><select v-model="form.status"><option v-for="item in statusOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></select></label>
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
        <label class="dialog-field"><span>接入网关</span><select v-model="form.gateway_id"><option value="">暂不部署</option><option v-for="gateway in gatewayOptions.filter(item => String(item.org_id) === String(form.org_id) && Number(item.status) === 1)" :key="String(gateway.id)" :value="String(gateway.id)">{{ gateway.gateway_name || gateway.gateway_sn }}</option></select><small>已部署设备会在组织档案树中按“园区 → 网关 → 设备”层级展示。</small></label>
        <label v-if="editingId && !form.model_version_id" class="dialog-field"><span>历史设备类型</span><select v-model="form.device_type_id" disabled><option v-for="type in typeOptions" :key="String(type.id)" :value="String(type.id)">{{ type.type_name || type.type_code }}</option></select></label>
        <label class="dialog-field"><span>设备编号*</span><input v-model="form.device_sn" required></label>
        <label class="dialog-field"><span>设备名称</span><input v-model="form.device_name" placeholder="留空则由型号名称和 SN 自动生成"></label>
        <label v-if="form.gateway_id" class="dialog-field"><span>协议地址{{ selectedModelIsModbus ? '*' : '' }}</span><input v-model="form.protocol_addr" :required="selectedModelIsModbus" placeholder="MODBUS 为 1-247 从站地址"></label>
        <label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label>
        <label class="dialog-field"><span>启用状态</span><select v-model="form.status"><option v-for="item in statusOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></select></label>
        <template v-if="editingId">
          <label class="dialog-field"><span>计量投运</span><select v-model="form.settlement_enabled"><option :value="0">不参与结算</option><option :value="1">参与结算</option></select></label>
          <label class="dialog-field"><span>电表角色</span><select v-model="form.meter_role"><option value="SETTLEMENT">结算表</option><option value="INTERNAL">内部表</option><option value="SUB_METER">分表</option></select></label>
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
          <label class="dialog-field"><span>启用状态</span><select v-model="form.status"><option v-for="item in statusOptions" :key="String(item.value)" :value="item.value">{{ item.label }}</option></select></label>
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
          <section class="wizard-tree-section"><div class="wizard-section-head"><span>所属组织 / 接入网关</span><button class="quiet tree-root-choice" type="button" :class="{ active: !form.org_id }" @click="clearDialogOrg">无（使用默认最外层组织）</button></div><p class="commissioning-hint">可直接选择组织，也可以展开组织后选择网关；选择网关会同时绑定设备组织。未指定时自动挂载到当前用户权限范围内的默认最外层组织。</p><div class="archive-search-row"><label class="archive-search-box"><Search :size="15" /><input v-model.trim="wizardOrgKeyword" placeholder="搜索组织或网关名称"></label><button v-if="wizardOrgKeyword" class="icon-btn" title="清空" aria-label="清空" @click="wizardOrgKeyword = ''"><X :size="15" /></button></div><div class="device-model-tree archive-tree-list wizard-tree-list"><CatalogTreeNode v-for="node in wizardOrgTree" :key="String(node.key)" :node="node" :selected-key="selectedOrgTreeKey" @select="selectDialogOrg" /><p v-if="!wizardOrgTree.length" class="empty-state">暂无匹配组织或网关。</p></div></section>
        </template>
          </div>
        </Transition>
      </div>
    </AppDialog>

    <AppDialog v-model:open="protocolAddressDialog" title="填写 MODBUS 从站地址" description="已选择网关，请为该设备填写唯一的 1-247 从站地址。" confirm-text="确认并添加" @submit="confirmProtocolAddress">
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
        <div v-if="bindingLoading" class="empty-state">正在读取设备...</div>
        <div v-else-if="!bindableDevices.length" class="empty-state">暂无可绑定设备。</div>
        <div v-else class="archive-bind-list">
          <label v-for="device in bindableDevices" :key="String(device.id)" class="archive-bind-item">
            <input type="checkbox" :checked="bindingDeviceIds.includes(String(device.id))" @change="toggleBindingDevice(device.id, ($event.target as HTMLInputElement).checked)">
            <span>
              <b>{{ device.device_name || device.device_sn }}</b>
              <small>{{ device.device_sn }} · {{ device.type_name || '设备类型/型号' }} · {{ device.gateway_name || device.gateway_sn || '未绑定网关' }}</small>
            </span>
          </label>
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
.device-model-tree-field{display:block}.device-model-tree-field>span{display:block;margin-bottom:7px}.device-model-tree{height:230px;padding:6px;border:1px solid var(--border);background:#fff;overflow:auto}.device-model-selected{min-height:36px;display:flex;align-items:center;padding:0 10px;border:1px solid var(--border);background:#f7f9fc;color:#52667e;font-size:12px}.device-model-inherit{display:block;margin-top:6px;color:var(--muted);font-size:10px;line-height:1.5}.tree-root-choice{height:28px;margin-bottom:5px;font-size:11px}.tree-root-choice.active{border-color:#00b8bd;color:#00a5ab}.archive-perspective-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:8px 0}.archive-perspective-tabs button{height:28px;border:1px solid var(--border);background:#fff;color:#52667e;font-size:11px}.archive-perspective-tabs button.active{border-color:#00b8bd;color:#008f94;background:#f0fbfb}.commissioning-hint{color:var(--muted);font-size:10px;line-height:1.5}.attribute-override-list>div{display:flex;align-items:center;justify-content:space-between;gap:12px}.attribute-override-list>div>span{display:flex;flex-direction:column;min-width:0}.attribute-override-list small{font-size:10px;color:var(--muted)}.attribute-override-list label{display:flex;align-items:center;gap:5px}.attribute-override-list input{width:130px;height:28px;border:1px solid var(--border);padding:0 7px}.attribute-override-list em{font-style:normal;color:var(--muted);font-size:11px}.attribute-override-actions{display:flex;justify-content:flex-end;margin-top:8px}.device-wizard-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:4px}.device-wizard-steps span{padding:7px 4px;border-bottom:2px solid var(--border);color:var(--muted);font-size:11px;text-align:center}.device-wizard-steps span.active{border-color:#00b8bd;color:#008f94}.wizard-two-column{display:grid;grid-template-columns:minmax(230px,0.9fr) minmax(260px,1.1fr);gap:10px}.wizard-selection-panel,.wizard-preview-panel{min-width:0}.wizard-tree-list{height:300px}.wizard-preview-panel{min-height:300px;padding:10px;border:1px solid var(--border);background:#fbfcfe;overflow:auto}.wizard-preview-panel h4{margin:12px 0 6px;color:#52667e;font-size:11px}.wizard-preview-panel h4:first-child{margin-top:0}.wizard-preview-list>div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px}.wizard-preview-list>div span{color:#52667e}.wizard-preview-list>div b{font-weight:500;color:#283f5a}.wizard-preview-panel .device-template-summary{display:flex;flex-direction:column;gap:4px;padding-bottom:8px;border-bottom:1px solid var(--border)}.wizard-preview-panel .device-template-summary small{color:var(--muted);font-size:10px}.wizard-tree-section{display:block}.wizard-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.wizard-section-head>span{font-size:12px}.wizard-section-head .tree-root-choice{margin-bottom:0}.catalog-create-hint{color:var(--muted);font-size:10px;line-height:1.5}@media(max-width:650px){.wizard-two-column{grid-template-columns:1fr}.wizard-tree-list{height:220px}}
.device-wizard-dialog .dialog-actions{flex-direction:column;align-items:center;gap:8px}.device-wizard-dialog .dialog-actions button{width:min(280px,100%);min-height:36px}.device-wizard-fields{display:block}.device-wizard-fields>.device-wizard-steps{width:100%;margin-bottom:14px}.device-wizard-fields>.dialog-field{grid-template-columns:110px minmax(0,1fr);align-items:center;margin-bottom:12px}.device-wizard-fields>.dialog-field>span{white-space:nowrap;text-align:right}.device-wizard-fields>.device-wizard-error{margin:0 0 12px;padding:9px 11px;border:1px solid #f0b7ad;background:#fff5f2;color:#b64c36;font-size:11px;line-height:1.5}.device-wizard-fields>.wizard-tree-section{width:100%}.device-wizard-fields>.wizard-tree-section+.wizard-tree-section{margin-top:12px}
.wizard-selection-panel{height:100%;display:flex;flex-direction:column}.wizard-selection-panel .wizard-tree-list{flex:1;height:auto;min-height:0}.protocol-address-dialog{min-height:72px}
:deep(.device-wizard-dialog){width:min(780px,calc(100vw - 34px));height:min(720px,calc(100vh - 36px));max-height:none;display:flex;flex-direction:column}.device-wizard-dialog :deep(.dialog-fields){flex:1;min-height:0;overflow:auto}.device-wizard-dialog :deep(.dialog-actions){flex:none;flex-direction:column;align-items:center;gap:8px}.device-wizard-dialog :deep(.dialog-actions) button{width:min(280px,100%);min-height:40px}.device-wizard-fields{min-height:0}.wizard-step-panel{height:455px;min-height:455px;display:flex;flex-direction:column}.wizard-step-panel>.wizard-two-column{height:100%;min-height:0}.wizard-step-panel>.wizard-tree-section{flex:1;min-height:0;display:flex;flex-direction:column}.wizard-step-panel .wizard-tree-list{min-height:300px}.wizard-step-enter-active,.wizard-step-leave-active{transition:opacity .22s ease,transform .22s ease}.wizard-step-enter-from{opacity:0;transform:translateX(18px)}.wizard-step-leave-to{opacity:0;transform:translateX(-18px)}
.device-wizard-progress{position:relative;height:4px;margin:0 4px 12px;border-radius:999px;background:#e6edf6;overflow:hidden}.device-wizard-progress span{display:block;height:100%;border-radius:inherit;background:#2d7ff0;transition:width .35s ease}
.detail-view-filters{display:flex;align-items:center;gap:7px}.detail-view-filters input,.detail-view-filters select{height:30px;min-width:150px;padding:0 8px;border:1px solid var(--border);background:#fff;color:#52667e;font-size:11px}.attribute-view-table{margin:14px;overflow:auto;border:1px solid var(--border)}.attribute-view-table table{width:100%;min-width:720px;border-collapse:collapse;font-size:12px}.attribute-view-table th,.attribute-view-table td{height:38px;padding:7px 10px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}.attribute-view-table th{background:#f7f9fc;color:#5b6e84;font-weight:600}@media(max-width:860px){.detail-view-filters{width:100%;flex-wrap:wrap}.detail-view-filters input,.detail-view-filters select{flex:1;min-width:130px}}
.device-filter-field{min-width:190px}.device-search-field{min-width:min(330px,100%)}.device-filter-menu,.detail-filter-menu{position:relative;width:100%;min-width:0}.device-filter-menu summary,.detail-filter-menu summary{height:36px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 11px;border:1px solid #d4e2f2;border-radius:7px;background:#fff;color:#3d5876;cursor:pointer;list-style:none;box-shadow:0 1px 2px #17375c08;transition:border-color .18s,box-shadow .18s}.device-filter-menu summary::-webkit-details-marker,.detail-filter-menu summary::-webkit-details-marker{display:none}.device-filter-menu summary:hover,.detail-filter-menu summary:hover{border-color:var(--accent);box-shadow:0 0 0 3px #4c8dff12}.device-filter-menu[open]>div,.detail-filter-menu[open]>div{position:absolute;top:42px;left:0;z-index:12;display:grid;gap:3px;width:max-content;min-width:100%;max-width:min(360px,calc(100vw - 38px));max-height:260px;padding:8px;border:1px solid #d4e2f2;border-radius:8px;background:#fff;box-shadow:0 14px 30px #17375c20;overflow:auto;scrollbar-width:none}.device-filter-menu[open]>div::-webkit-scrollbar,.detail-filter-menu[open]>div::-webkit-scrollbar{display:none}.device-filter-menu label,.detail-filter-menu label{display:flex;align-items:center;gap:7px;min-height:30px;padding:0 8px;border-radius:5px;color:#38536f;font-size:12px;white-space:nowrap;cursor:pointer}.device-filter-menu label:hover,.detail-filter-menu label:hover{background:#f0f6ff;color:var(--accent)}.device-filter-menu input[type='checkbox'],.detail-filter-menu input[type='checkbox']{box-sizing:border-box;width:12px;height:12px;min-width:12px;max-width:12px;min-height:12px;max-height:12px;margin:0;padding:0;flex:0 0 12px;accent-color:var(--accent)}.device-filter-menu.disabled summary{border-style:dashed;background:#f7f9fc;color:#9aaabd;cursor:not-allowed}.filter-menu-hint{margin:2px 4px;padding:7px 8px;color:#8494a8;font-size:11px;white-space:nowrap}.detail-filter-search{height:36px;display:flex;align-items:center;gap:7px;min-width:220px;padding:0 10px;border:1px solid #d4e2f2;border-radius:7px;background:#fff;color:#7890aa}.detail-filter-search input{min-width:0;width:100%;height:auto!important;padding:0!important;border:0!important;box-shadow:none!important;outline:0}.detail-filter-menu{width:190px}.detail-filter-menu summary{font-size:11px}.detail-filter-menu[open]>div{right:0;left:auto}.detail-view-filters{display:flex;align-items:center;gap:8px}
</style>
