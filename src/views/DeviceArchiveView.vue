<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BarChart3, ChevronDown, ChevronRight, Copy, FileText, Pencil, RefreshCw, Search, Trash2 } from '@lucide/vue'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { copyResource, createResource, deviceArchiveProfile, deviceTree, gatewayArchiveProfile, listResource, orgArchiveProfile, removeResource, rootOrgs, updateResource } from '@/api/platform'
import meterImage from '@/assets/meter-device.png'
import type { RecordRow } from '@/types/domain'
import { fieldLabel } from '@/utils/fieldLabels'

use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

type FormType = 'org' | 'gateway' | 'device'
type NodeType = 'ORG' | 'GATEWAY' | 'DEVICE'

interface TreeNode extends RecordRow {
  nodeType: NodeType
  children?: TreeNode[]
}

interface FlatNode {
  node: TreeNode
  level: number
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
  protocol_addr: string
  device_sn: string
  device_name: string
  device_model: string
  install_time: string
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

const route = useRoute()
const router = useRouter()
const mode = computed(() => String(route.meta.resource || 'org-tree'))
const title = computed(() => mode.value === 'devices' ? '设备档案' : mode.value === 'device-detail' ? '设备详情' : '组织档案树')

const rootOrgOptions = ref<RecordRow[]>([])
const orgOptions = ref<RecordRow[]>([])
const selectedRootOrgId = ref('')
const treeKeyword = ref('')
const deviceKeyword = ref('')
const tree = ref<TreeNode[]>([])
const devices = ref<RecordRow[]>([])
const gatewayOptions = ref<RecordRow[]>([])
const typeOptions = ref<RecordRow[]>([])
const selectedNode = ref<TreeNode | null>(null)
const showAllData = ref(false)
const profile = ref<RecordRow>({})
const loading = ref(false)
const treeLoading = ref(false)
const profileLoading = ref(false)
const error = ref('')
const dialog = ref(false)
const deleteDialog = ref(false)
const deletingNodeRef = ref<TreeNode | null>(null)
const deleting = ref(false)
const formType = ref<FormType>('org')
const editingId = ref<unknown>(null)
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
  protocol_addr: '',
  device_sn: '',
  device_name: '',
  device_model: '',
  install_time: '',
})
const activeArchiveTab = ref<'device' | 'inspection' | 'runtime'>('device')
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
const selectedNodeTitle = computed(() => selectedNode.value ? nodeLabel(selectedNode.value) : '请选择左侧节点')
const createLabel = computed(() => `+新增${selectedNode.value ? nodeTag(selectedNode.value) : '组织'}`)
const recentHistory = computed(() => (profile.value.recentHistory || profile.value.latestStats || []) as RecordRow[])
const recentAlarms = computed(() => (profile.value.recentAlarms || []) as RecordRow[])
const inspectionRecords = computed(() => (profile.value.inspectionRecords || []) as RecordRow[])
const energyTrend = computed(() => (profile.value.energyTrend || []) as RecordRow[])
const alarmTrend = computed(() => (profile.value.alarmTrend || []) as RecordRow[])
const realtimeSnapshots = computed(() => (profile.value.realtimeSnapshots || []) as RecordRow[])
const pointDefinitions = computed(() => ((profile.value.points as RecordRow | undefined)?.definitions || []) as RecordRow[])
const realtimeLookup = computed<Record<string, unknown>>(() => {
  const raw = profile.value.realtime
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
  return {}
})
const selectedBasicInfo = computed(() => {
  const source = selectedEntity.value
  return [
    ['名称', source.device_name || source.gateway_name || source.org_name || '—'],
    ['编号', source.device_sn || source.gateway_sn || source.id || '—'],
    ['类型', source.type_name || source.type_code || orgTypeText(source.org_type) || source.nodeType || '—'],
    ['组织', source.org_name || '—'],
    ['网关', source.gateway_name || source.gateway_sn || '—'],
    ['安装位置', source.install_location || source.address || '—'],
    ['型号', source.device_model || source.firmware_version || '—'],
    ['状态', statusText(source.online_status ?? source.status)],
  ].filter((item) => showAllData.value || !isMissingValue(item[1]))
})
const detailDevice = computed(() => (profile.value.device || {}) as RecordRow)

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
  const latest = latestHistoryValues.value
  const latestKeys = Object.keys(latest)
  if (latestKeys.length) {
    return latestKeys.map((code) => {
      const definition = pointDefinitions.value.find((point) => String(point.point_code || point.pointCode) === code)
      return {
        code,
        name: String(definition?.point_name || definition?.pointName || code),
        unit: String(definition?.unit || ''),
        role: String(definition?.business_role || definition?.businessRole || ''),
        value: latest[code],
      }
    }).filter((item) => showAllData.value || !isMissingValue(item.value))
  }
  return pointDefinitions.value.map((point) => {
    const code = String(point.point_code || point.pointCode || point.code || '')
    return {
      code,
      name: String(point.point_name || point.pointName || code || '测点'),
      unit: String(point.unit || ''),
      role: String(point.business_role || point.businessRole || ''),
      value: code ? realtimeValue(code) : undefined,
    }
  }).filter((item) => showAllData.value || !isMissingValue(item.value))
})
const overviewCards = computed(() => {
  if (selectedIsDevice.value) return []
  return [
    ['设备总数', profile.value.deviceCount ?? '—'],
    [selectedIsGateway.value ? '启用设备' : '在线网关', selectedIsGateway.value ? profile.value.onlineDeviceCount ?? '—' : profile.value.onlineGatewayCount ?? '—'],
    ['近期告警', recentAlarms.value.length],
    ['能耗记录', energyTrend.value.length],
  ]
})
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
  return node.nodeType === 'GATEWAY' ? '网关' : node.nodeType === 'DEVICE' ? '设备' : '组织'
}
function nodeLabel(node: TreeNode) {
  if (node.nodeType === 'GATEWAY') return `${node.gateway_name || '未命名网关'} · ${node.gateway_sn || node.id} · ${statusText(node.online_status ?? node.status)}`
  if (node.nodeType === 'DEVICE') return `${node.device_name || '未命名设备'} · ${node.device_sn || node.id} · ${statusText(node.online_status ?? node.status)}`
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

async function selectNode(node: TreeNode) {
  selectedNode.value = node
  profileLoading.value = true
  try {
    if (node.nodeType === 'DEVICE') {
      profile.value = await deviceArchiveProfile(node.id)
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'history'
      dataView.value = 'chart'
    } else if (node.nodeType === 'GATEWAY') {
      profile.value = await gatewayArchiveProfile(node.id)
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'alarm'
      dataView.value = 'chart'
    } else {
      profile.value = await orgArchiveProfile(node.id)
      activeArchiveTab.value = 'device'
      bottomArchiveTab.value = 'alarm'
      dataView.value = 'chart'
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
  dialog.value = true
}
function openDevice(gateway?: RecordRow, row?: RecordRow) {
  formType.value = 'device'
  editingId.value = row?.id || null
  Object.assign(form, {
    device_sn: row?.device_sn || '',
    device_name: row?.device_name || '',
    gateway_id: row?.gateway_id || gateway?.id || '',
    org_id: row?.org_id || gateway?.org_id || '',
    device_type_id: row?.device_type_id || typeOptions.value[0]?.id || '',
    protocol_addr: row?.protocol_addr || '',
    install_location: row?.install_location || '',
    device_model: row?.device_model || '',
    install_time: row?.install_time || '',
    status: row?.status ?? 1,
  })
  dialog.value = true
}

function openAddBySelection() {
  if (!selectedNode.value) return openOrg(0)
  if (selectedNode.value.nodeType === 'ORG') return openOrg(selectedNode.value.id)
  if (selectedNode.value.nodeType === 'GATEWAY') return openGateway(selectedNode.value.org_id ?? selectedNode.value.id)
  const gateway = gatewayOptions.value.find((item) => String(item.id) === String(selectedNode.value?.gateway_id)) || {
    id: selectedNode.value.gateway_id,
    org_id: selectedNode.value.org_id,
  }
  return openDevice(gateway, undefined)
}
function editSelected() {
  if (!selectedNode.value) return
  if (selectedNode.value.nodeType === 'ORG') openOrg(undefined, selectedNode.value)
  else if (selectedNode.value.nodeType === 'GATEWAY') openGateway(undefined, selectedNode.value)
  else openDevice(undefined, selectedNode.value)
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
    await loadTree()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    deleting.value = false
  }
}
async function saveForm() {
  try {
    const resource = formType.value === 'org' ? 'orgs' : formType.value === 'gateway' ? 'gateways' : 'devices'
    if (editingId.value) await updateResource('archive', resource, editingId.value, { ...form })
    else await createResource('archive', resource, { ...form })
    dialog.value = false
    await loadAll()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function loadLookups() {
  const [roots, orgs, gateways, types] = await Promise.all([
    rootOrgs(),
    listResource('archive', 'orgs', { pageSize: 200 }),
    listResource('archive', 'gateways', { pageSize: 200 }),
    listResource('archive', 'device-types', { pageSize: 200 }),
  ])
  rootOrgOptions.value = roots
  orgOptions.value = orgs.records
  gatewayOptions.value = gateways.records
  typeOptions.value = types.records
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
    tree.value = rows as TreeNode[]
    expandedKeys.value = collectExpanded(tree.value)
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
  const page = await listResource('archive', 'devices', { pageSize: 200, keyword: deviceKeyword.value })
  devices.value = page.records.map((item) => ({
    ...item,
    org_name: orgOptions.value.find((org) => String(org.id) === String(item.org_id))?.org_name,
    gateway_name: gatewayOptions.value.find((gateway) => String(gateway.id) === String(item.gateway_id))?.gateway_name,
    gateway_sn: gatewayOptions.value.find((gateway) => String(gateway.id) === String(item.gateway_id))?.gateway_sn,
    type_name: typeOptions.value.find((type) => String(type.id) === String(item.device_type_id))?.type_name,
  }))
}

async function loadDetail() {
  const id = route.params.id
  if (!id) return
  profile.value = await deviceArchiveProfile(id)
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
  bottomArchiveTab.value = 'history'
  dataView.value = 'chart'
  await renderCharts()
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    await loadLookups()
    if (mode.value === 'org-tree') await loadTree()
    else if (mode.value === 'devices') await loadDevices()
    else await loadDetail()
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
    const chartEl = isDetail ? detailRealtimeChartEl.value : isDeviceTree ? deviceRealtimeChartEl.value : overviewRealtimeChartEl.value
    const chartRef = isDetail ? detailRealtimeChart : isDeviceTree ? deviceRealtimeChart : overviewRealtimeChart
    if (chartEl) {
      const chart = ensureChartInstance(chartRef, chartEl)
      if (isDetail) detailRealtimeChart = chart
      else if (isDeviceTree) deviceRealtimeChart = chart
      else overviewRealtimeChart = chart
      if (selectedIsDevice.value) {
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
watch([activeArchiveTab, bottomArchiveTab, dataView, () => profile.value], () => { void renderCharts() }, { deep: true })
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
        <p>{{ mode === 'org-tree' ? '组织、网关、设备一体化档案工作台。' : mode === 'devices' ? '设备卡片档案。' : '设备档案详情。' }}</p>
      </div>
      <div class="head-actions">
        <button v-if="mode === 'device-detail'" class="quiet" @click="router.push('/device-archive/devices')">返回列表</button>
      </div>
    </header>
    <div v-if="error" class="notice">{{ error }}</div>

    <template v-if="mode === 'org-tree'">
      <div class="archive-workbench">
        <aside class="archive-sidebar-panel">
          <label class="archive-site-field">
            <span>站点名称</span>
            <select v-model="selectedRootOrgId">
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
              <span class="archive-tree-type" :class="String(entry.node.nodeType).toLowerCase()">{{ nodeTag(entry.node).slice(0, 1) }}</span>
              <span>{{ nodeLabel(entry.node) }}</span>
            </button>
          </div>
        </aside>

        <section class="archive-main-panel">
          <div class="archive-toolbar">
            <div class="archive-toolbar-actions">
              <button class="primary add-action" @click="openAddBySelection">{{ createLabel }}</button>
              <button class="icon-btn" :disabled="!selectedNode" title="复制" aria-label="复制" @click="duplicateSelection"><Copy :size="16" /></button>
              <button class="icon-btn" :disabled="!selectedNode" title="编辑" aria-label="编辑" @click="editSelected"><Pencil :size="16" /></button>
              <button class="icon-btn danger-text" :disabled="!selectedNode" title="删除" aria-label="删除" @click="deleteSelected"><Trash2 :size="16" /></button>
              <button class="icon-btn" title="刷新" aria-label="刷新" @click="refreshSelected"><RefreshCw :size="16" /></button>
            </div>
            <div class="archive-toolbar-meta">
              <span>{{ selectedNodeTitle }}</span>
            </div>
          </div>

          <div v-if="!selectedNode" class="archive-main-empty">请选择左侧档案节点。</div>

          <template v-else>
          <div v-if="selectedIsDevice" class="archive-tabs">
            <button :class="{ active: activeArchiveTab === 'device' }" @click="activeArchiveTab = 'device'">设备信息</button>
            <button :class="{ active: activeArchiveTab === 'inspection' }" @click="activeArchiveTab = 'inspection'">指令记录</button>
            <button :class="{ active: activeArchiveTab === 'runtime' }" @click="activeArchiveTab = 'runtime'">实时运行数据</button>
          </div>
          <div v-else class="archive-tabs archive-tabs-static">
            <button class="active">{{ selectedIsGateway ? '网关概览' : '组织概览' }}</button>
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
                      <span v-if="row.name !== row.code">{{ row.code }}</span>
                      <strong>{{ displayValue(row.value) }}</strong>
                      <small>{{ row.unit || row.role || '—' }}</small>
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
          <label class="field">
            <span>设备搜索</span>
            <input v-model.trim="deviceKeyword" placeholder="设备编号、名称、组织或网关" @keyup.enter="loadDevices">
          </label>
          <div class="filter-actions">
            <button class="btn-primary" @click="loadDevices"><Search :size="15" />查询</button>
          </div>
          <div class="filter-extra-actions">
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
            <p>{{ item.org_name || `组织 ${item.org_id}` }} / {{ item.gateway_name || item.gateway_sn || `网关 ${item.gateway_id}` }}</p>
          </div>
          <div class="device-card-actions">
            <StatusTag domain="online" :value="item.status" />
            <button class="primary" @click="router.push(`/device-archive/devices/${item.id}`)">查看详情</button>
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
            <dt>设备类型</dt><dd>{{ detailDevice.type_name || detailDevice.type_code || '—' }}</dd>
            <dt>所属组织</dt><dd>{{ detailDevice.org_name || '—' }}</dd>
            <dt>接入网关</dt><dd>{{ detailDevice.gateway_name || detailDevice.gateway_sn || '—' }}</dd>
            <dt>安装位置</dt><dd>{{ detailDevice.install_location || '—' }}</dd>
            <dt>设备型号</dt><dd>{{ detailDevice.device_model || '—' }}</dd>
          </dl>
        </aside>
        <section class="device-detail-right">
          <article class="panel">
            <div class="panel-head"><h3>实时运行曲线</h3><small>ECharts</small></div>
            <div ref="detailRealtimeChartEl" class="device-energy-chart"></div>
          </article>
          <div class="panel-split">
            <article class="panel">
              <div class="panel-head"><h3>最近历史数据</h3><small>日统计</small></div>
              <div class="panel-scroll">
                <div class="compact-list">
                  <div v-for="row in recentHistory" :key="String(row.id || `${row.stat_date}-${row.point_code}`)">
                    <b>{{ row.point_code }} · {{ row.usage_value ?? '—' }}</b>
                    <span>{{ row.stat_date }} / 完整率 {{ row.data_complete_rate ?? '—' }}%</span>
                  </div>
                  <div v-if="!recentHistory.length"><b>暂无历史数据</b><span>日统计写入后将在此展示。</span></div>
                </div>
              </div>
            </article>
            <article class="panel">
              <div class="panel-head"><h3>最近告警数据</h3><small>告警事件</small></div>
              <div class="panel-scroll">
                <div class="compact-list">
                  <div v-for="row in recentAlarms" :key="String(row.id)">
                    <b>{{ row.alarm_type || '告警' }} · 等级 {{ row.alarm_level || '—' }}</b>
                    <span>{{ row.point_code || '—' }} / {{ row.alarm_time || '—' }}</span>
                  </div>
                  <div v-if="!recentAlarms.length"><b>暂无告警数据</b><span>该设备近期没有告警记录。</span></div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </template>

    <AppDialog v-model:open="dialog" :title="editingId ? '编辑档案' : '新增档案'" :description="formType === 'device' ? '按当前节点维护设备档案。' : '按当前节点维护层级档案。'" @submit="saveForm">
      <div v-if="formType === 'org'" class="dialog-fields">
        <label class="dialog-field"><span>上级组织 ID</span><input v-model="form.parent_id" type="number"></label>
        <label class="dialog-field"><span>组织名称*</span><input v-model="form.org_name" required></label>
        <label class="dialog-field"><span>组织类型</span><input v-model="form.org_type" type="number"></label>
        <label class="dialog-field"><span>负责人</span><input v-model="form.leader"></label>
        <label class="dialog-field"><span>联系电话</span><input v-model="form.phone"></label>
        <label class="dialog-field full"><span>地址</span><textarea v-model="form.address"></textarea></label>
      </div>
      <div v-else-if="formType === 'gateway'" class="dialog-fields">
        <label class="dialog-field"><span>所属组织*</span><select v-model="form.org_id"><option v-for="org in orgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label>
        <label class="dialog-field"><span>网关编号*</span><input v-model="form.gateway_sn" required></label>
        <label class="dialog-field"><span>网关名称*</span><input v-model="form.gateway_name" required></label>
        <label class="dialog-field"><span>MQTT 密钥*</span><input v-model="form.mqtt_secret" required></label>
        <label class="dialog-field"><span>IP 地址</span><input v-model="form.ip_address"></label>
        <label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label>
      </div>
      <div v-else class="dialog-fields">
        <label class="dialog-field"><span>接入网关*</span><select v-model="form.gateway_id"><option v-for="gateway in gatewayOptions" :key="String(gateway.id)" :value="String(gateway.id)">{{ gateway.gateway_name || gateway.gateway_sn }}</option></select></label>
        <label class="dialog-field"><span>所属组织*</span><select v-model="form.org_id"><option v-for="org in orgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label>
        <label class="dialog-field"><span>设备类型*</span><select v-model="form.device_type_id"><option v-for="type in typeOptions" :key="String(type.id)" :value="String(type.id)">{{ type.type_name || type.type_code }}</option></select></label>
        <label class="dialog-field"><span>设备编号*</span><input v-model="form.device_sn" required></label>
        <label class="dialog-field"><span>设备名称*</span><input v-model="form.device_name" required></label>
        <label class="dialog-field"><span>协议地址</span><input v-model="form.protocol_addr"></label>
        <label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label>
        <label class="dialog-field"><span>设备型号</span><input v-model="form.device_model"></label>
      </div>
    </AppDialog>

    <AppConfirmDialog
      v-model:open="deleteDialog"
      :title="deletingNodeRef ? `删除${nodeTag(deletingNodeRef)}` : '确认删除'"
      message="删除前会先检查层级链路；有子节点时会被拦截。"
      :loading="deleting"
      confirm-text="确认删除"
      @confirm="confirmDeleteNode"
    />
  </section>
</template>
