<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, CheckCircle2, GitCommitHorizontal, Plus, RefreshCw, Router, Save, Send, ShieldCheck, Trash2 } from '@lucide/vue'
import { edgeConfigGateway, edgeConfigOverview, probeEdgeDevice, publishEdgeConfig, replaceEdgeModelPoints, updateEdgeDeviceBinding } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

const loading = ref(false)
const saving = ref(false)
const probing = ref<unknown>(null)
const publishing = ref(false)
const overview = ref<RecordRow>({})
const detail = ref<RecordRow>({})
const selectedGatewayId = ref<unknown>(null)
const deviceDrafts = ref<Record<string, { channelId: string; modbusAddr: number; collectIntervalSeconds: number }>>({})
const selectedModelId = ref<unknown>(null)
const pointDrafts = ref<RecordRow[]>([])

const gateways = computed(() => overview.value.gateways as RecordRow[] || [])
const summary = computed(() => overview.value.summary as RecordRow || {})
const gateway = computed(() => detail.value.gateway as RecordRow || {})
const devices = computed(() => detail.value.devices as RecordRow[] || [])
const channels = computed(() => detail.value.channels as RecordRow[] || [])
const models = computed(() => detail.value.models as RecordRow[] || [])
const resources = computed(() => detail.value.resources as RecordRow[] || [])
const audit = computed(() => detail.value.audit as RecordRow[] || [])
const precheck = computed(() => detail.value.precheck as RecordRow || {})
const issues = computed(() => precheck.value.issues as RecordRow[] || [])
const selectedGateway = computed(() => gateways.value.find((item) => String(item.gatewayId) === String(selectedGatewayId.value)) || gateways.value[0])
const selectedModel = computed(() => models.value.find((item) => String(item.modelVersionId) === String(selectedModelId.value)) || models.value[0])
const syncState = computed(() => String(gateway.value.applyStatus || selectedGateway.value?.applyStatus || 'NEVER'))
const checksumMatched = computed(() => {
  const desired = String(gateway.value.desiredChecksum || '')
  const applied = String(gateway.value.appliedChecksum || '')
  return Boolean(desired && applied && desired === applied)
})
const deviceRows = computed(() => devices.value.map((device) => {
  const key = String(device.deviceId)
  const draft = deviceDrafts.value[key] || {
    channelId: String(device.channelId || 'rs485-1'),
    modbusAddr: Number(device.modbusAddr || 1),
    collectIntervalSeconds: Number(device.collectIntervalSeconds || 300)
  }
  return { device, draft }
}))

function stateLabel(value: unknown) {
  const state = String(value || 'NEVER')
  if (state === 'APPLIED') return '已应用'
  if (state === 'PENDING') return '待同步'
  if (state === 'FAILED') return '应用失败'
  if (state === 'RESTART_REQUIRED') return '需重启'
  return '未同步'
}

function stateTone(value: unknown) {
  const state = String(value || 'NEVER')
  if (state === 'APPLIED') return 'ok'
  if (state === 'PENDING' || state === 'RESTART_REQUIRED') return 'warn'
  if (state === 'FAILED') return 'bad'
  return 'muted'
}

function shortHash(value: unknown) {
  const text = String(value || '')
  return text ? text.slice(0, 12) : '-'
}

function fmt(value: unknown) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

function syncDrafts() {
  const drafts: Record<string, { channelId: string; modbusAddr: number; collectIntervalSeconds: number }> = {}
  for (const device of devices.value) {
    drafts[String(device.deviceId)] = {
      channelId: String(device.channelId || 'rs485-1'),
      modbusAddr: Number(device.modbusAddr || 1),
      collectIntervalSeconds: Number(device.collectIntervalSeconds || 300)
    }
  }
  deviceDrafts.value = drafts
  selectedModelId.value = selectedModel.value?.modelVersionId
  loadPointDrafts()
}

function loadPointDrafts() {
  const points = (selectedModel.value?.points as RecordRow[] | undefined) || []
  pointDrafts.value = points.map((point) => ({ ...point }))
}

async function load() {
  loading.value = true
  try {
    overview.value = await edgeConfigOverview()
    const firstGateway = gateways.value[0]
    if (!selectedGatewayId.value && firstGateway) selectedGatewayId.value = firstGateway.gatewayId
    if (selectedGatewayId.value) {
      detail.value = await edgeConfigGateway(selectedGatewayId.value)
      syncDrafts()
    }
  } finally {
    loading.value = false
  }
}

async function selectGateway(id: unknown) {
  selectedGatewayId.value = id
  detail.value = await edgeConfigGateway(id)
  syncDrafts()
}

async function saveDevice(device: RecordRow) {
  const draft = deviceDrafts.value[String(device.deviceId)]
  if (!draft) return
  saving.value = true
  try {
    detail.value = await updateEdgeDeviceBinding(device.deviceId, draft)
    overview.value = await edgeConfigOverview()
    syncDrafts()
  } finally {
    saving.value = false
  }
}

async function probeDevice(device: RecordRow) {
  probing.value = device.deviceId
  try {
    await probeEdgeDevice(device.deviceId)
    if (selectedGatewayId.value) detail.value = await edgeConfigGateway(selectedGatewayId.value)
  } finally {
    probing.value = null
  }
}

function addPoint() {
  pointDrafts.value.push({
    pointCode: 'new_point',
    standardPointCode: 'NEW_POINT',
    pointName: '新测点',
    unit: '',
    functionCode: 3,
    registerAddress: 0,
    registerLength: 1,
    valueType: 'u16',
    byteOrder: 'AB',
    scaleFactor: 1,
    offsetValue: 0,
    required: 1,
    enabled: 1,
    sort: (pointDrafts.value.length + 1) * 10
  })
}

function removePoint(index: number) {
  pointDrafts.value.splice(index, 1)
}

async function savePoints() {
  if (!selectedModel.value?.modelVersionId) return
  saving.value = true
  try {
    await replaceEdgeModelPoints(selectedModel.value.modelVersionId, pointDrafts.value)
    if (selectedGatewayId.value) detail.value = await edgeConfigGateway(selectedGatewayId.value)
    overview.value = await edgeConfigOverview()
    syncDrafts()
  } finally {
    saving.value = false
  }
}

async function publish() {
  if (!selectedGatewayId.value) return
  publishing.value = true
  try {
    await publishEdgeConfig(selectedGatewayId.value)
    await selectGateway(selectedGatewayId.value)
    overview.value = await edgeConfigOverview()
  } finally {
    publishing.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="view-page edge-config-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">EDGE COLLECTION</p>
        <h1>采集配置</h1>
        <p>统一维护网关、RS485 通道、从站地址、采集点表与应用状态。</p>
      </div>
      <div class="head-actions">
        <button class="icon-btn" title="刷新" aria-label="刷新" :disabled="loading" @click="load"><RefreshCw :size="16" /></button>
        <button class="primary" :disabled="publishing || !selectedGatewayId || precheck.passed === false" @click="publish"><Send :size="15" />发布配置</button>
      </div>
    </header>

    <div class="edge-summary">
      <article><Router :size="18" /><span><b>{{ summary.gatewayCount || 0 }}</b><small>网关</small></span></article>
      <article><GitCommitHorizontal :size="18" /><span><b>{{ summary.pendingCount || 0 }}</b><small>待同步</small></span></article>
      <article><CheckCircle2 :size="18" /><span><b>{{ summary.appliedCount || 0 }}</b><small>已应用</small></span></article>
      <article><AlertTriangle :size="18" /><span><b>{{ summary.issueGatewayCount || 0 }}</b><small>需处理</small></span></article>
    </div>

    <div class="edge-layout">
      <aside class="gateway-list">
        <button v-for="item in gateways" :key="String(item.gatewayId)" :class="{ active: String(item.gatewayId) === String(selectedGatewayId) }" @click="selectGateway(item.gatewayId)">
          <span><b>{{ item.gatewayName || item.gatewaySn }}</b><small>{{ item.gatewaySn }}</small></span>
          <i :class="stateTone(item.applyStatus)">{{ stateLabel(item.applyStatus) }}</i>
        </button>
        <p v-if="!gateways.length" class="center-empty">暂无网关。</p>
      </aside>

      <main class="edge-panel">
        <section class="gateway-strip">
          <div><small>当前网关</small><b>{{ gateway.gatewayName || gateway.gatewaySn || '-' }}</b></div>
          <div><small>配置状态</small><b :class="stateTone(syncState)">{{ stateLabel(syncState) }}</b></div>
          <div><small>期望版本</small><b>{{ gateway.desiredRevision || '-' }}</b></div>
          <div><small>已应用版本</small><b>{{ gateway.appliedRevision || '-' }}</b></div>
          <div><small>指纹</small><b>{{ checksumMatched ? '一致' : shortHash(gateway.desiredChecksum) }}</b></div>
          <div><small>同步时间</small><b>{{ fmt(gateway.lastSyncTime) }}</b></div>
        </section>

        <section class="precheck-band" :class="{ passed: precheck.passed, failed: precheck.passed === false }">
          <ShieldCheck :size="18" />
          <span><b>{{ precheck.passed ? '发布前检查通过' : '发布前检查未通过' }}</b><small>{{ precheck.deviceCount || 0 }} 台设备，{{ precheck.pointCount || 0 }} 个采集点</small></span>
        </section>

        <section v-if="issues.length" class="issue-list">
          <article v-for="issue in issues" :key="`${issue.target}-${issue.message}`">
            <AlertTriangle :size="15" />
            <span><b>{{ issue.target }}</b><small>{{ issue.message }}</small></span>
          </article>
        </section>

        <section class="edge-section">
          <h2>RS485 通道</h2>
          <div class="channel-grid">
            <article v-for="channel in channels" :key="String(channel.channelId)">
              <b>{{ channel.channelId }}</b>
              <small>{{ channel.deviceCount }} 台设备</small>
              <p>从站地址：{{ (channel.addresses as unknown[] || []).join(', ') || '未配置' }}</p>
            </article>
          </div>
        </section>

        <section class="edge-section">
          <h2>从站绑定</h2>
          <div class="table-wrap edge-table">
            <table>
              <thead><tr><th>设备</th><th>通道</th><th>从站地址</th><th>周期</th><th>模型</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="row in deviceRows" :key="String(row.device.deviceId)">
                  <td><b>{{ row.device.deviceName || row.device.deviceSn }}</b><small>{{ row.device.deviceSn }}</small></td>
                  <td><input v-model="row.draft.channelId" /></td>
                  <td><input v-model.number="row.draft.modbusAddr" type="number" min="1" max="247" /></td>
                  <td><input v-model.number="row.draft.collectIntervalSeconds" type="number" min="5" max="86400" /></td>
                  <td>{{ row.device.profileKey || '-' }} · {{ row.device.modelVersion || '-' }}</td>
                  <td class="row-actions">
                    <button class="row-action" :disabled="saving" @click="saveDevice(row.device)"><Save :size="14" />保存</button>
                    <button class="row-action primary-lite" :disabled="probing === row.device.deviceId" @click="probeDevice(row.device)">试采</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="edge-section model-editor">
          <header>
            <h2>模型点表</h2>
            <div>
              <select v-model="selectedModelId" @change="loadPointDrafts">
                <option v-for="model in models" :key="String(model.modelVersionId)" :value="model.modelVersionId">
                  {{ model.modelName || model.profileKey }} · {{ model.modelVersion }}
                </option>
              </select>
              <button class="row-action" @click="addPoint"><Plus :size="14" />新增点</button>
              <button class="row-action primary-lite" :disabled="saving || !selectedModel" @click="savePoints"><Save :size="14" />保存点表</button>
            </div>
          </header>
          <div class="table-wrap edge-table point-table">
            <table>
              <thead><tr><th>点位</th><th>名称</th><th>平台点位</th><th>功能码</th><th>地址</th><th>长度</th><th>类型</th><th>字节序</th><th>比例</th><th></th></tr></thead>
              <tbody>
                <tr v-for="(point, index) in pointDrafts" :key="`${point.pointCode}-${index}`">
                  <td><input v-model="point.pointCode" /></td>
                  <td><input v-model="point.pointName" /></td>
                  <td><input v-model="point.standardPointCode" /></td>
                  <td><select v-model.number="point.functionCode"><option :value="3">03</option><option :value="4">04</option></select></td>
                  <td><input v-model.number="point.registerAddress" type="number" min="0" /></td>
                  <td><input v-model.number="point.registerLength" type="number" min="1" max="2" /></td>
                  <td><select v-model="point.valueType"><option>u16</option><option>i16</option><option>u32</option><option>i32</option><option>f32</option></select></td>
                  <td><select v-model="point.byteOrder"><option>AB</option><option>BA</option><option>ABCD</option><option>BADC</option><option>CDAB</option><option>DCBA</option></select></td>
                  <td><input v-model.number="point.scaleFactor" type="number" step="0.000001" /></td>
                  <td><button class="icon-btn danger" title="删除点位" @click="removePoint(index)"><Trash2 :size="14" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="edge-section two-col">
          <div>
            <h2>应用明细</h2>
            <article v-for="item in resources" :key="`${item.resourceType}-${item.resourceKey}`" class="timeline-row">
              <b>{{ item.resourceType }} · {{ item.resourceKey }}</b>
              <small>{{ stateLabel(item.applyStatus) }} · {{ shortHash(item.configChecksum) }} · {{ fmt(item.appliedTime || item.updateTime) }}</small>
            </article>
            <p v-if="!resources.length" class="center-empty">暂无应用明细。</p>
          </div>
          <div>
            <h2>配置记录</h2>
            <article v-for="item in audit" :key="`${item.actionType}-${item.createTime}`" class="timeline-row">
              <b>{{ item.actionType }}</b>
              <small>{{ item.operatorName || 'system' }} · {{ fmt(item.createTime) }}</small>
            </article>
            <p v-if="!audit.length" class="center-empty">暂无配置记录。</p>
          </div>
        </section>
      </main>
    </div>
  </section>
</template>

<style scoped>
.edge-config-page { min-height: 100%; }
.edge-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
.edge-summary article { min-width: 0; min-height: 74px; display: flex; align-items: center; gap: 12px; padding: 13px 14px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
.edge-summary svg { color: var(--accent); }
.edge-summary span { display: grid; gap: 2px; }
.edge-summary b { font-size: 22px; color: var(--fg); }
.edge-summary small, .gateway-strip small, .precheck-band small, .issue-list small, td small, .channel-grid small, .timeline-row small { color: var(--muted); font-size: 12px; }
.edge-layout { min-height: 620px; display: grid; grid-template-columns: 278px minmax(0, 1fr); gap: 12px; }
.gateway-list { min-height: 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; overflow: auto; }
.gateway-list button { width: 100%; min-height: 66px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; }
.gateway-list button:hover, .gateway-list button.active { background: #eef6ff; }
.gateway-list span, td { min-width: 0; }
.gateway-list b, td b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gateway-list i { flex: none; padding: 4px 7px; border-radius: 999px; font-size: 11px; font-style: normal; background: #edf2f7; color: #64748b; }
.gateway-list i.ok, .gateway-strip .ok { color: #15803d; }
.gateway-list i.warn, .gateway-strip .warn { color: #b45309; }
.gateway-list i.bad, .gateway-strip .bad { color: #dc2626; }
.edge-panel { min-width: 0; display: grid; gap: 12px; align-content: start; }
.gateway-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; overflow: hidden; }
.gateway-strip div { min-width: 0; padding: 12px; border-right: 1px solid var(--border); }
.gateway-strip div:last-child { border-right: 0; }
.gateway-strip b { display: block; margin-top: 5px; overflow: hidden; color: #203248; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.precheck-band { min-height: 56px; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; }
.precheck-band.passed { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
.precheck-band.failed { border-color: #fecaca; background: #fff5f5; color: #b91c1c; }
.precheck-band span { display: grid; gap: 2px; }
.issue-list { display: grid; gap: 8px; }
.issue-list article { display: flex; gap: 9px; padding: 10px 12px; border: 1px solid #fed7aa; border-radius: 7px; background: #fff7ed; color: #9a3412; }
.issue-list span { min-width: 0; display: grid; gap: 2px; }
.edge-section { min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
.edge-section h2 { margin: 0 0 12px; font-size: 15px; }
.channel-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.channel-grid article { min-width: 0; padding: 12px; border: 1px solid #e5edf5; border-radius: 7px; background: #f8fbff; }
.channel-grid b { display: block; color: #203248; }
.channel-grid p { margin: 8px 0 0; color: #516173; font-size: 12px; }
.edge-table { max-height: 420px; overflow: auto; }
.edge-table table { width: 100%; border-collapse: collapse; min-width: 760px; }
.edge-table th, .edge-table td { padding: 8px; border-bottom: 1px solid var(--border); text-align: left; font-size: 12px; }
.edge-table th { position: sticky; top: 0; background: #f8fbff; color: #526173; font-weight: 700; }
input, select { width: 100%; min-height: 32px; border: 1px solid #d6e0eb; border-radius: 6px; padding: 5px 8px; background: #fff; color: #203248; }
.row-action { min-height: 32px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 9px; background: #fff; color: #203248; white-space: nowrap; }
.row-action.primary-lite { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
.row-actions { display: flex; gap: 6px; }
.model-editor header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.model-editor header h2 { margin: 0; }
.model-editor header div { display: flex; align-items: center; gap: 8px; }
.point-table table { min-width: 1120px; }
.two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.timeline-row { padding: 9px 0; border-bottom: 1px solid var(--border); }
.timeline-row b, .timeline-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 980px) {
  .edge-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .edge-layout, .two-col { grid-template-columns: 1fr; }
  .gateway-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .model-editor header, .model-editor header div { align-items: stretch; flex-direction: column; }
}
</style>
