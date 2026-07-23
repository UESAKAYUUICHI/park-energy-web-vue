<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { createResource, deviceArchiveProfile, deviceTree, listResource, removeResource, updateResource } from '@/api/platform'
import meterImage from '@/assets/meter-device.png'
import type { RecordRow } from '@/types/domain'

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

type FormType = 'org' | 'gateway' | 'device'
interface FlatNode { node: RecordRow; level: number }

const route = useRoute()
const router = useRouter()
const mode = computed(() => String(route.meta.resource || 'org-tree'))
const title = computed(() => mode.value === 'devices' ? '设备档案' : mode.value === 'device-detail' ? '设备详情' : '组织档案树')
const tree = ref<RecordRow[]>([])
const devices = ref<RecordRow[]>([])
const orgOptions = ref<RecordRow[]>([])
const gatewayOptions = ref<RecordRow[]>([])
const typeOptions = ref<RecordRow[]>([])
const profile = ref<RecordRow>({})
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const dialog = ref(false)
const formType = ref<FormType>('org')
const editingId = ref<unknown>(null)
const form = reactive<Record<string, string | number>>({})
const chartEl = ref<HTMLElement | null>(null)
const deleteDialog = ref(false)
const deletingNodeRef = ref<RecordRow | null>(null)
const deleting = ref(false)
const deletingNodeTitle = computed(() => deletingNodeRef.value ? `删除${nodeTag(deletingNodeRef.value)}` : '确认删除')
let trendChart: ECharts | null = null

const flatTree = computed<FlatNode[]>(() => {
  const rows: FlatNode[] = []
  const walk = (items: RecordRow[], level: number) => items.forEach((node) => {
    rows.push({ node, level })
    const children = Array.isArray(node.children) ? node.children as RecordRow[] : []
    walk(children, level + 1)
  })
  walk(tree.value, 0)
  return rows
})
const filteredDevices = computed(() => devices.value.filter((device) => {
  const text = `${device.device_sn || ''} ${device.device_name || ''} ${device.org_name || ''} ${device.gateway_name || ''}`.toLowerCase()
  return !keyword.value || text.includes(keyword.value.toLowerCase())
}))
const device = computed(() => (profile.value.device || {}) as RecordRow)
const recentHistory = computed(() => (profile.value.recentHistory || profile.value.latestStats || []) as RecordRow[])
const recentAlarms = computed(() => (profile.value.recentAlarms || []) as RecordRow[])
const energyTrend = computed(() => (profile.value.energyTrend || []) as RecordRow[])
const chartLabels = computed(() => energyTrend.value.map((item) => String(item.stat_period || item.stat_date || '')))
const chartValues = computed(() => energyTrend.value.map((item) => Number(item.usage_value || 0)))

function nodeLabel(node: RecordRow) {
  if (node.nodeType === 'GATEWAY') return `${node.gateway_name || '未命名网关'} · ${node.gateway_sn || node.id}`
  if (node.nodeType === 'DEVICE') return `${node.device_name || '未命名设备'} · ${node.device_sn || node.id}`
  return `${node.org_name || '未命名组织'}`
}
function nodeTag(node: RecordRow) {
  return node.nodeType === 'GATEWAY' ? '网关' : node.nodeType === 'DEVICE' ? '设备' : '组织'
}
function nodeResource(node: RecordRow) {
  return node.nodeType === 'GATEWAY' ? 'gateways' : node.nodeType === 'DEVICE' ? 'devices' : 'orgs'
}
function setForm(values: RecordRow) {
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, values)
}
function openOrg(parentId?: unknown, row?: RecordRow) {
  formType.value = 'org'; editingId.value = row?.id || null
  setForm({ parent_id: parentId || row?.parent_id || 0, org_name: row?.org_name || '', org_type: row?.org_type || 1, leader: row?.leader || '', phone: row?.phone || '', address: row?.address || '', sort: row?.sort || 0 })
  dialog.value = true
}
function openGateway(orgId?: unknown, row?: RecordRow) {
  formType.value = 'gateway'; editingId.value = row?.id || null
  setForm({ gateway_sn: row?.gateway_sn || '', gateway_name: row?.gateway_name || '', mqtt_secret: row?.mqtt_secret || 'secret', org_id: orgId || row?.org_id || '', install_location: row?.install_location || '', ip_address: row?.ip_address || '', heartbeat_interval: row?.heartbeat_interval || 60, status: row?.status ?? 1 })
  dialog.value = true
}
function openDevice(gateway?: RecordRow, row?: RecordRow) {
  formType.value = 'device'; editingId.value = row?.id || null
  setForm({ device_sn: row?.device_sn || '', device_name: row?.device_name || '', gateway_id: row?.gateway_id || gateway?.id || '', org_id: row?.org_id || gateway?.org_id || '', device_type_id: row?.device_type_id || typeOptions.value[0]?.id || '', protocol_addr: row?.protocol_addr || '', install_location: row?.install_location || '', device_model: row?.device_model || '', install_time: row?.install_time || '', status: row?.status ?? 1 })
  dialog.value = true
}
function editNode(node: RecordRow) {
  if (node.nodeType === 'GATEWAY') openGateway(undefined, node)
  else if (node.nodeType === 'DEVICE') openDevice(undefined, node)
  else openOrg(undefined, node)
}
async function saveForm() {
  try {
    const resource = formType.value === 'org' ? 'orgs' : formType.value === 'gateway' ? 'gateways' : 'devices'
    if (editingId.value) await updateResource('archive', resource, editingId.value, { ...form })
    else await createResource('archive', resource, { ...form })
    dialog.value = false
    await loadAll()
  } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' }
}
function deleteNode(node: RecordRow) {
  deletingNodeRef.value = node
  deleteDialog.value = true
}
async function confirmDeleteNode() {
  if (!deletingNodeRef.value) return
  deleting.value = true
  try { await removeResource('archive', nodeResource(deletingNodeRef.value), deletingNodeRef.value.id); deleteDialog.value = false; deletingNodeRef.value = null; await loadAll() }
  catch (e) { error.value = e instanceof Error ? e.message : '删除失败' }
  finally { deleting.value = false }
}
async function loadLookups() {
  const [orgs, gateways, types] = await Promise.all([
    listResource('archive', 'orgs', { pageSize: 200 }),
    listResource('archive', 'gateways', { pageSize: 200 }),
    listResource('archive', 'device-types', { pageSize: 200 }),
  ])
  orgOptions.value = orgs.records
  gatewayOptions.value = gateways.records
  typeOptions.value = types.records
}
async function loadTree() { tree.value = await deviceTree() }
async function loadDevices() {
  const page = await listResource('archive', 'devices', { pageSize: 200, keyword: keyword.value })
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
  await renderChart()
}
async function loadAll() {
  loading.value = true; error.value = ''
  try {
    await loadLookups()
    if (mode.value === 'org-tree') await loadTree()
    else if (mode.value === 'devices') await loadDevices()
    else await loadDetail()
  } catch (e) { error.value = e instanceof Error ? e.message : '设备档案读取失败' }
  finally { loading.value = false }
}
function cssVar(name: string, fallback: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback }
function chartOption(): EChartsCoreOption {
  const accent = cssVar('--accent', '#4c8dff')
  const muted = cssVar('--muted', '#758195')
  const border = cssVar('--border', '#dfe4ec')
  return {
    color: [accent],
    grid: { left: 10, right: 12, top: 18, bottom: 28, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kWh` },
    xAxis: { type: 'category', boundaryGap: false, data: chartLabels.value, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 10 } },
    yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: border, type: 'dashed' } }, axisLabel: { color: muted, fontSize: 10 } },
    series: [{ name: '用量', type: 'line', smooth: true, symbolSize: 7, data: chartValues.value, areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(76, 141, 255, .22)' }, { offset: 1, color: 'rgba(76, 141, 255, 0)' }]) }, lineStyle: { width: 3 } }],
  }
}
async function renderChart() {
  await nextTick()
  if (mode.value !== 'device-detail' || !chartEl.value) { trendChart?.dispose(); trendChart = null; return }
  trendChart ||= init(chartEl.value)
  trendChart.setOption(chartOption(), true)
}
function resizeChart() { trendChart?.resize() }
watch(() => route.fullPath, loadAll)
watch([chartLabels, chartValues], renderChart)
onMounted(() => { window.addEventListener('resize', resizeChart); void loadAll() })
onBeforeUnmount(() => { window.removeEventListener('resize', resizeChart); trendChart?.dispose(); trendChart = null })
</script>

<template>
  <section class="view-page device-archive-page">
    <header class="view-head"><div><p class="eyebrow">DEVICE ARCHIVE</p><h1>{{ title }}</h1><p>{{ mode === 'org-tree' ? '档案层级管理。' : mode === 'devices' ? '设备卡片管理。' : '设备详情总览。' }}</p></div><div class="head-actions"><button v-if="mode === 'org-tree'" class="primary" @click="openOrg()">新增根组织</button><button v-if="mode === 'device-detail'" class="quiet" @click="router.push('/device-archive/devices')">返回列表</button><button class="quiet" @click="loadAll">刷新</button></div></header>
    <div v-if="error" class="notice">{{ error }}</div>

    <template v-if="mode === 'org-tree'">
      <article class="archive-tree-panel">
        <div v-if="loading" class="empty-state">正在读取组织档案...</div>
        <div v-else-if="!flatTree.length" class="empty-state">暂无组织档案。</div>
        <div v-for="entry in flatTree" v-else :key="`${entry.node.nodeType}-${entry.node.id}`" class="archive-tree-row" :style="{ paddingLeft: `${14 + entry.level * 24}px` }">
          <span class="tree-rail"></span><span class="tag" :class="entry.node.nodeType === 'DEVICE' ? 'blue' : entry.node.nodeType === 'GATEWAY' ? 'warn' : 'success'">{{ nodeTag(entry.node) }}</span>
          <div class="tree-main"><b>{{ nodeLabel(entry.node) }}</b><small>{{ entry.node.install_location || entry.node.address || entry.node.type_name || '暂无补充信息' }}</small></div>
          <div class="row-actions">
            <button v-if="entry.node.nodeType === 'ORG'" class="link-btn" @click="openOrg(entry.node.id)">子组织</button>
            <button v-if="entry.node.nodeType === 'ORG'" class="link-btn" @click="openGateway(entry.node.id)">网关</button>
            <button v-if="entry.node.nodeType === 'GATEWAY'" class="link-btn" @click="openDevice(entry.node)">设备</button>
            <button v-if="entry.node.nodeType === 'DEVICE'" class="link-btn" @click="router.push(`/device-archive/devices/${entry.node.id}`)">详情</button>
            <button class="link-btn" @click="editNode(entry.node)">编辑</button>
            <button class="link-btn danger-text" @click="deleteNode(entry.node)">删除</button>
          </div>
        </div>
      </article>
    </template>

    <template v-else-if="mode === 'devices'">
      <article class="filter-card"><div class="filter-row"><label class="field"><span>设备搜索</span><input v-model.trim="keyword" placeholder="设备编号、名称、组织或网关"></label><div class="filter-actions"><button class="btn-primary" @click="loadDevices">查询</button><button class="quiet" @click="keyword = ''; loadDevices()">重置</button></div></div></article>
      <div v-if="loading" class="empty-state">正在读取设备档案...</div>
      <div v-else class="device-card-grid">
        <article v-for="item in filteredDevices" :key="String(item.id)" class="device-card">
          <div class="device-card-media"><img :src="meterImage" alt="电表设备"></div>
          <div class="device-card-info"><h3>{{ item.device_name || item.device_sn }}</h3><p>{{ item.device_sn }} · {{ item.type_name || '设备' }}</p><p>{{ item.org_name || `组织 ${item.org_id}` }} / {{ item.gateway_name || item.gateway_sn || `网关 ${item.gateway_id}` }}</p></div>
          <div class="device-card-actions"><StatusTag domain="online" :value="item.status" /><button class="primary" @click="router.push(`/device-archive/devices/${item.id}`)">查看详情</button></div>
        </article>
        <div v-if="!filteredDevices.length" class="empty-state">暂无设备档案。</div>
      </div>
    </template>

    <template v-else>
      <div class="device-detail-layout">
        <aside class="device-detail-left"><img :src="meterImage" alt="电表设备"><dl class="detail-grid"><dt>设备名称</dt><dd>{{ device.device_name || '—' }}</dd><dt>设备编号</dt><dd>{{ device.device_sn || '—' }}</dd><dt>设备类型</dt><dd>{{ device.type_name || device.type_code || '—' }}</dd><dt>所属组织</dt><dd>{{ device.org_name || '—' }}</dd><dt>接入网关</dt><dd>{{ device.gateway_name || device.gateway_sn || '—' }}</dd><dt>安装位置</dt><dd>{{ device.install_location || '—' }}</dd><dt>设备型号</dt><dd>{{ device.device_model || '—' }}</dd></dl></aside>
        <section class="device-detail-right">
          <article class="panel"><div class="panel-head"><h3>能源情况</h3><small>ECharts 趋势</small></div><div ref="chartEl" class="device-energy-chart"></div></article>
          <div class="panel-split">
            <article class="panel"><div class="panel-head"><h3>最近历史数据</h3><small>日统计</small></div><div class="compact-list"><div v-for="row in recentHistory" :key="String(row.id || `${row.stat_date}-${row.point_code}`)"><b>{{ row.point_code }} · {{ row.usage_value ?? '—' }}</b><span>{{ row.stat_date }} / 完整率 {{ row.data_complete_rate ?? '—' }}%</span></div><div v-if="!recentHistory.length"><b>暂无历史数据</b><span>Data 日统计写入后将在此展示。</span></div></div></article>
            <article class="panel"><div class="panel-head"><h3>最近告警数据</h3><small>告警事件</small></div><div class="compact-list"><div v-for="row in recentAlarms" :key="String(row.id)"><b>{{ row.alarm_type || '告警' }} · 等级 {{ row.alarm_level || '—' }}</b><span>{{ row.point_code || '—' }} / {{ row.alarm_time || '—' }}</span></div><div v-if="!recentAlarms.length"><b>暂无告警数据</b><span>该设备近期没有告警记录。</span></div></div></article>
          </div>
        </section>
      </div>
    </template>

    <AppDialog v-model:open="dialog" :title="editingId ? '编辑档案' : '新增档案'" description="组织、网关、设备按链路维护；删除保护由后端接口统一约束。" @submit="saveForm">
      <div v-if="formType === 'org'" class="dialog-fields"><label class="dialog-field"><span>上级组织 ID</span><input v-model="form.parent_id" type="number"></label><label class="dialog-field"><span>组织名称*</span><input v-model="form.org_name" required></label><label class="dialog-field"><span>组织类型</span><input v-model="form.org_type" type="number"></label><label class="dialog-field"><span>负责人</span><input v-model="form.leader"></label><label class="dialog-field"><span>联系电话</span><input v-model="form.phone"></label><label class="dialog-field full"><span>地址</span><textarea v-model="form.address"></textarea></label></div>
      <div v-else-if="formType === 'gateway'" class="dialog-fields"><label class="dialog-field"><span>所属组织*</span><select v-model="form.org_id"><option v-for="org in orgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label class="dialog-field"><span>网关编号*</span><input v-model="form.gateway_sn" required></label><label class="dialog-field"><span>网关名称*</span><input v-model="form.gateway_name" required></label><label class="dialog-field"><span>MQTT 密钥*</span><input v-model="form.mqtt_secret" required></label><label class="dialog-field"><span>IP 地址</span><input v-model="form.ip_address"></label><label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label></div>
      <div v-else class="dialog-fields"><label class="dialog-field"><span>接入网关*</span><select v-model="form.gateway_id"><option v-for="gateway in gatewayOptions" :key="String(gateway.id)" :value="String(gateway.id)">{{ gateway.gateway_name || gateway.gateway_sn }}</option></select></label><label class="dialog-field"><span>所属组织*</span><select v-model="form.org_id"><option v-for="org in orgOptions" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></select></label><label class="dialog-field"><span>设备类型*</span><select v-model="form.device_type_id"><option v-for="type in typeOptions" :key="String(type.id)" :value="String(type.id)">{{ type.type_name || type.type_code }}</option></select></label><label class="dialog-field"><span>设备编号*</span><input v-model="form.device_sn" required></label><label class="dialog-field"><span>设备名称*</span><input v-model="form.device_name" required></label><label class="dialog-field"><span>协议地址</span><input v-model="form.protocol_addr"></label><label class="dialog-field"><span>安装位置</span><input v-model="form.install_location"></label><label class="dialog-field"><span>设备型号</span><input v-model="form.device_model"></label></div>
    </AppDialog>
    <AppConfirmDialog v-model:open="deleteDialog" :title="deletingNodeTitle" message="删除前会先检查组织、网关、设备的链路依赖；不满足条件时后端会拒绝。" :loading="deleting" confirm-text="确认删除" @confirm="confirmDeleteNode" />
  </section>
</template>
