<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Check, CheckCircle2, Edit3, Plus, RefreshCw, Search, Siren, Trash2, UploadCloud, X } from '@lucide/vue'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import { alarmProtocols, deleteAlarmProtocol, publishAlarmProtocol, resourceOptions, saveAlarmProtocol } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import type { RecordRow } from '@/types/domain'

interface AlarmPoint {
  pointCode: string
  pointName: string
  alarmType: number
  compareOperator: string
  thresholdValue: string | number
  recoveryThresholdValue: string | number
  recoverySamples: number
  alarmLevel: number
  enabled: number
}

const rows = ref<RecordRow[]>([])
const devices = ref<RecordRow[]>([])
const loading = ref(false)
const saving = ref(false)
const publishingId = ref<unknown>(null)
const error = useAlertRef()
const editorOpen = ref(false)
const deleteOpen = ref(false)
const editingId = ref<unknown>(null)
const deleteTarget = ref<RecordRow | null>(null)
const deviceKeyword = ref('')
const selectedId = ref<unknown>(null)

const form = reactive<{
  protocolKey: string
  protocolName: string
  remark: string
  enabled: number
  deviceIds: number[]
  points: AlarmPoint[]
}>({
  protocolKey: '',
  protocolName: '',
  remark: '',
  enabled: 1,
  deviceIds: [],
  points: [],
})

const filteredDevices = computed(() => {
  const keyword = deviceKeyword.value.trim().toLowerCase()
  if (!keyword) return devices.value
  return devices.value.filter((device) => {
    const text = [device.device_name, device.deviceName, device.device_sn, device.deviceSn, device.gateway_sn].filter(Boolean).join(' ').toLowerCase()
    return text.includes(keyword)
  })
})
const selectedCount = computed(() => form.deviceIds.length)
const allVisibleDevicesSelected = computed(() => filteredDevices.value.length > 0 && filteredDevices.value.every((device) => form.deviceIds.includes(Number(device.id))))
const selectedProtocol = computed(() => rows.value.find((row) => String(row.id) === String(selectedId.value)) || null)

function field(row: RecordRow | AlarmPoint, ...keys: string[]) {
  const source = row as Record<string, unknown>
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key]
  }
  return ''
}
function deviceLabel(device: RecordRow) {
  return String(field(device, 'device_name', 'deviceName', 'device_sn', 'deviceSn') || `设备 ${device.id}`)
}
function pointLabel(point: RecordRow | AlarmPoint) {
  return String(field(point, 'pointName', 'point_name', 'pointCode', 'point_code') || '未命名测点')
}
function protocolDevices(row: RecordRow) {
  const value = field(row, 'deviceIds', 'device_ids', 'devices')
  return Array.isArray(value) ? value : []
}
function protocolPoints(row: RecordRow) {
  const value = field(row, 'points', 'point_configs', 'pointConfigs')
  return Array.isArray(value) ? value as RecordRow[] : []
}
function protocolStatus(row: RecordRow) {
  const status = String(field(row, 'status', 'protocol_status', 'protocolStatus')).toUpperCase()
  if (status === 'PUBLISHED' || status === 'ACTIVE') return '已发布'
  if (status === 'DISABLED' || Number(field(row, 'enabled')) === 0) return '已停用'
  return '草稿'
}
function statusTone(row: RecordRow) {
  const status = protocolStatus(row)
  return status === '已发布' ? 'success' : status === '已停用' ? 'muted' : 'draft'
}
function protocolIcon(row: RecordRow) {
  const status = protocolStatus(row)
  return status === '已发布' ? CheckCircle2 : status === '已停用' ? Siren : Edit3
}
function levelLabel(level: unknown) {
  return ({ 1: '一般', 2: '重要', 3: '紧急' } as Record<string, string>)[String(level)] || '重要'
}
function operatorLabel(operator: unknown) {
  return ({ '>': '大于', '>=': '大于等于', '<': '小于', '<=': '小于等于', '=': '等于', between: '区间' } as Record<string, string>)[String(operator)] || String(operator || '大于')
}
function blankPoint(): AlarmPoint {
  return { pointCode: '', pointName: '', alarmType: 5, compareOperator: '>', thresholdValue: '', recoveryThresholdValue: '', recoverySamples: 3, alarmLevel: 2, enabled: 1 }
}
function resetForm() {
  editingId.value = null
  deviceKeyword.value = ''
  Object.assign(form, { protocolKey: '', protocolName: '', remark: '', enabled: 1, deviceIds: [], points: [blankPoint()] })
}
function openCreate() {
  resetForm()
  editorOpen.value = true
}
function openEdit(row: RecordRow) {
  editingId.value = row.id
  deviceKeyword.value = ''
  const sourcePoints = protocolPoints(row)
  Object.assign(form, {
    protocolKey: String(field(row, 'protocol_key', 'protocolKey')),
    protocolName: String(field(row, 'protocol_name', 'protocolName')),
    remark: String(field(row, 'remark')),
    enabled: Number(field(row, 'enabled')) === 0 ? 0 : 1,
    deviceIds: protocolDevices(row).map((item) => Number(typeof item === 'object' ? field(item as RecordRow, 'id', 'deviceId', 'device_id') : item)).filter(Boolean),
    points: sourcePoints.length ? sourcePoints.map((point) => ({ ...blankPoint(), ...point })) as AlarmPoint[] : [blankPoint()],
  })
  selectedId.value = row.id
  editorOpen.value = true
}
function selectRow(row: RecordRow) {
  selectedId.value = row.id
}
function toggleVisibleDevices() {
  const visibleIds = filteredDevices.value.map((device) => Number(device.id)).filter(Boolean)
  if (allVisibleDevicesSelected.value) form.deviceIds = form.deviceIds.filter((id) => !visibleIds.includes(id))
  else form.deviceIds = [...new Set([...form.deviceIds, ...visibleIds])]
}
function removePoint(index: number) {
  form.points.splice(index, 1)
}
function validateForm() {
  if (!form.protocolKey.trim() || !form.protocolName.trim()) return '请填写协议编码和协议名称'
  if (!form.deviceIds.length) return '请至少绑定一台设备'
  if (!form.points.length) return '请至少配置一个监测测点'
  const codes = new Set<string>()
  for (const point of form.points) {
    point.pointCode = point.pointCode.trim()
    point.pointName = point.pointName.trim()
    if (!point.pointCode || !point.pointName) return '每个测点都需要填写编码和名称'
    if (codes.has(point.pointCode)) return `测点 ${point.pointCode} 重复配置，同一协议中只能保留一条条件`
    codes.add(point.pointCode)
    if (point.thresholdValue === '') return `请填写测点 ${point.pointName} 的触发阈值`
    if (point.compareOperator === 'between' && !String(point.thresholdValue).includes(',')) return `测点 ${point.pointName} 的区间阈值请使用“下限,上限”格式`
    if (point.recoveryThresholdValue === '') return `请填写测点 ${point.pointName} 的恢复阈值`
    if (!Number(point.recoverySamples) || Number(point.recoverySamples) < 1) return `测点 ${point.pointName} 的恢复采样次数必须大于 0`
  }
  return ''
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await alarmProtocols()
    if (selectedId.value && !rows.value.some((row) => String(row.id) === String(selectedId.value))) selectedId.value = rows.value[0]?.id || null
    if (!selectedId.value) selectedId.value = rows.value[0]?.id || null
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警协议读取失败'
  } finally {
    loading.value = false
  }
}
async function save() {
  const message = validateForm()
  if (message) {
    error.value = message
    return
  }
  saving.value = true
  error.value = ''
  try {
    const saved = await saveAlarmProtocol({ ...form, deviceIds: form.deviceIds, points: form.points }, editingId.value)
    selectedId.value = saved?.id || editingId.value
    editorOpen.value = false
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警协议保存失败'
  } finally {
    saving.value = false
  }
}
async function publish(row: RecordRow) {
  publishingId.value = row.id
  error.value = ''
  try {
    await publishAlarmProtocol(row.id)
    selectedId.value = row.id
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警协议发布失败'
  } finally {
    publishingId.value = null
  }
}
function askDelete(row: RecordRow) {
  deleteTarget.value = row
  deleteOpen.value = true
}
async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await deleteAlarmProtocol(deleteTarget.value.id)
    if (String(selectedId.value) === String(deleteTarget.value.id)) selectedId.value = null
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警协议删除失败'
  }
}
onMounted(async () => {
  try {
    const [deviceRows] = await Promise.all([resourceOptions('devices'), load()])
    devices.value = deviceRows
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警协议页面初始化失败'
  }
})
</script>

<template>
  <section class="view-page alarm-protocol-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">ALARM · PROTOCOL</p>
        <h1>告警协议</h1>
        <p>按设备绑定协议，按测点维护触发与恢复条件；同一设备的同一测点只保留一条生效告警。</p>
      </div>
      <div class="head-actions">
        <button class="quiet" :disabled="loading" title="刷新协议列表" @click="load"><RefreshCw :size="15" />刷新</button>
        <button class="primary" @click="openCreate"><Plus :size="15" />新建协议</button>
      </div>
    </header>

    <p v-if="error" class="form-error protocol-page-error">{{ error }}</p>

    <div class="protocol-layout">
      <section class="protocol-list-panel">
        <div class="panel-heading"><div><strong>协议列表</strong><small>{{ loading ? '正在读取…' : `${rows.length} 个配置` }}</small></div><span class="panel-hint">发布后由网关同步</span></div>
        <AppLoadingState v-if="loading" />
        <div v-else-if="!rows.length" class="protocol-empty"><Siren :size="26" /><strong>还没有告警协议</strong><span>先创建协议，再绑定设备和监测测点。</span><button class="primary" @click="openCreate"><Plus :size="15" />创建第一条协议</button></div>
        <div v-else class="protocol-list">
          <button v-for="row in rows" :key="String(row.id)" type="button" class="protocol-list-item" :class="{ active: String(selectedId) === String(row.id) }" @click="selectRow(row)">
            <span class="protocol-list-mark" :class="statusTone(row)"><component :is="protocolIcon(row)" :size="16" /></span>
            <span class="protocol-list-copy"><strong>{{ field(row, 'protocol_name', 'protocolName') || '未命名协议' }}</strong><small>{{ field(row, 'protocol_key', 'protocolKey') || '未设置编码' }}</small><em>{{ protocolDevices(row).length }} 台设备 · {{ protocolPoints(row).length }} 个测点</em></span>
            <span class="status-pill" :class="statusTone(row)">{{ protocolStatus(row) }}</span>
          </button>
        </div>
      </section>

      <section class="protocol-detail-panel">
        <template v-if="selectedProtocol">
          <header class="protocol-detail-head">
            <div><p class="eyebrow">PROTOCOL DETAIL</p><h2>{{ field(selectedProtocol, 'protocol_name', 'protocolName') }}</h2><span class="protocol-code">{{ field(selectedProtocol, 'protocol_key', 'protocolKey') }}</span></div>
            <span class="status-pill large" :class="statusTone(selectedProtocol)">{{ protocolStatus(selectedProtocol) }}</span>
          </header>
          <div class="detail-actions">
            <button class="quiet" @click="openEdit(selectedProtocol)"><Edit3 :size="14" />编辑配置</button>
            <button v-if="protocolStatus(selectedProtocol) !== '已发布'" class="primary" :disabled="publishingId === selectedProtocol.id" @click="publish(selectedProtocol)"><UploadCloud :size="14" />{{ publishingId === selectedProtocol.id ? '发布中…' : '发布协议' }}</button>
            <button class="icon-btn danger-text" title="删除协议" aria-label="删除协议" @click="askDelete(selectedProtocol)"><Trash2 :size="16" /></button>
          </div>
          <dl class="protocol-meta">
            <div><dt>绑定设备</dt><dd>{{ protocolDevices(selectedProtocol).length }} 台</dd></div>
            <div><dt>监测测点</dt><dd>{{ protocolPoints(selectedProtocol).length }} 个</dd></div>
            <div><dt>生效条件</dt><dd>{{ protocolPoints(selectedProtocol).filter((point) => Number(field(point, 'enabled')) !== 0).length }} 条</dd></div>
            <div><dt>备注</dt><dd>{{ field(selectedProtocol, 'remark') || '暂无备注' }}</dd></div>
          </dl>
          <section class="detail-section">
            <div class="section-heading"><strong>监测测点与条件</strong><small>恢复后才能再次触发同一条告警</small></div>
            <div class="condition-table">
              <div class="condition-row condition-head"><span>测点</span><span>触发条件</span><span>恢复阈值</span><span>等级</span><span>状态</span></div>
              <div v-for="point in protocolPoints(selectedProtocol)" :key="String(field(point, 'pointCode', 'point_code'))" class="condition-row">
                <span><strong>{{ pointLabel(point) }}</strong><small>{{ field(point, 'pointCode', 'point_code') }}</small></span>
                <span>{{ operatorLabel(field(point, 'compareOperator', 'compare_operator')) }} {{ field(point, 'thresholdValue', 'threshold_value') }}</span>
                <span>{{ field(point, 'recoveryThresholdValue', 'recovery_threshold_value') }} <small>{{ field(point, 'recoverySamples', 'recovery_samples') || 1 }} 次恢复采样</small></span>
                <span><b class="level-tag" :class="`level-${field(point, 'alarmLevel', 'alarm_level') || 2}`">{{ levelLabel(field(point, 'alarmLevel', 'alarm_level')) }}</b></span>
                <span><b class="mini-status" :class="{ off: Number(field(point, 'enabled')) === 0 }">{{ Number(field(point, 'enabled')) === 0 ? '停用' : '生效' }}</b></span>
              </div>
              <div v-if="!protocolPoints(selectedProtocol).length" class="condition-empty">当前协议还没有测点条件。</div>
            </div>
          </section>
        </template>
        <div v-else class="protocol-detail-empty"><Siren :size="34" /><h2>选择一条协议</h2><p>从左侧选择协议查看绑定设备、测点条件和发布状态。</p></div>
      </section>
    </div>

    <AppDialog v-model:open="editorOpen" :title="editingId ? '编辑告警协议' : '新建告警协议'" eyebrow="ALARM PROTOCOL CONFIG" :saving="saving" confirm-text="保存协议" dialog-class="alarm-protocol-dialog" @submit="save">
      <div class="protocol-editor">
        <div class="editor-section">
          <div class="section-heading"><strong>基本信息</strong><small>协议发布后由网关按设备同步</small></div>
          <div class="dialog-fields">
            <label class="dialog-field"><span>协议编码 *</span><input v-model.trim="form.protocolKey" placeholder="例如 DORM_METER_DEFAULT"></label>
            <label class="dialog-field"><span>协议名称 *</span><input v-model.trim="form.protocolName" placeholder="例如 宿舍楼电表告警协议"></label>
            <label class="dialog-field full"><span>备注</span><textarea v-model.trim="form.remark" rows="2" placeholder="说明适用设备、现场范围或配置目的"></textarea></label>
          </div>
        </div>
        <div class="editor-section">
          <div class="section-heading"><strong>绑定设备</strong><small>{{ selectedCount }} 台已选择</small></div>
          <div class="device-picker-toolbar"><label class="picker-search"><Search :size="14" /><input v-model.trim="deviceKeyword" placeholder="搜索设备名称或编号"></label><button class="link-btn" type="button" @click="toggleVisibleDevices">{{ allVisibleDevicesSelected ? '取消全选' : '选择当前列表' }}</button></div>
          <div v-if="filteredDevices.length" class="device-picker-grid">
            <label v-for="device in filteredDevices" :key="String(device.id)" class="device-option"><input v-model="form.deviceIds" type="checkbox" :value="Number(device.id)"><span><strong>{{ deviceLabel(device) }}</strong><small>{{ field(device, 'device_sn', 'deviceSn') || '未设置设备编号' }}</small></span><Check v-if="form.deviceIds.includes(Number(device.id))" :size="14" /></label>
          </div>
          <p v-else class="editor-empty">没有匹配的设备。</p>
        </div>
        <div class="editor-section">
          <div class="section-heading"><strong>监测测点与告警条件</strong><button class="link-btn" type="button" @click="form.points.push(blankPoint())"><Plus :size="13" />添加测点</button></div>
          <p class="editor-tip">每个测点只能配置一条条件。触发后保持一条生效告警，达到恢复阈值后才允许再次触发。</p>
          <div v-for="(point, index) in form.points" :key="index" class="point-editor">
            <div class="point-editor-head"><b>测点 {{ index + 1 }}</b><button class="icon-btn danger-text" type="button" title="删除测点" aria-label="删除测点" @click="removePoint(index)"><X :size="15" /></button></div>
            <div class="point-editor-grid">
              <label class="dialog-field"><span>测点编码 *</span><input v-model.trim="point.pointCode" placeholder="例如 voltage_a"></label>
              <label class="dialog-field"><span>测点名称 *</span><input v-model.trim="point.pointName" placeholder="例如 A相电压"></label>
              <label class="dialog-field"><span>触发关系</span><select v-model="point.compareOperator"><option value=">">大于</option><option value=">=">大于等于</option><option value="<">小于</option><option value="<=">小于等于</option><option value="=">等于</option><option value="between">区间</option></select></label>
              <label class="dialog-field"><span>触发阈值 *</span><input v-model="point.thresholdValue" placeholder="区间格式：下限,上限"></label>
              <label class="dialog-field"><span>恢复阈值 *</span><input v-model="point.recoveryThresholdValue" placeholder="恢复后再次允许触发"></label>
              <label class="dialog-field"><span>恢复采样次数</span><input v-model.number="point.recoverySamples" type="number" min="1" max="99"></label>
              <label class="dialog-field"><span>告警等级</span><select v-model.number="point.alarmLevel"><option :value="1">一般</option><option :value="2">重要</option><option :value="3">紧急</option></select></label>
              <label class="point-switch"><input v-model="point.enabled" type="checkbox" :true-value="1" :false-value="0"><span><strong>启用该条件</strong><small>停用后网关不会生成告警</small></span></label>
            </div>
          </div>
          <div v-if="!form.points.length" class="editor-empty">还没有测点条件，请添加至少一个测点。</div>
        </div>
      </div>
    </AppDialog>

    <AppConfirmDialog v-model:open="deleteOpen" title="删除告警协议" :message="`确认删除“${field(deleteTarget || {}, 'protocol_name', 'protocolName') || '当前协议'}”吗？已上传的历史告警不会被删除，但设备后续将不再按该协议判断。`" confirm-text="确认删除" @confirm="confirmDelete" />
  </section>
</template>

<style scoped>
.alarm-protocol-page { display: flex; flex-direction: column; gap: 14px; }
.alarm-protocol-page .view-head { margin-bottom: 0; }
.protocol-page-error { margin: 0; padding: 9px 12px; border: 1px solid #f2c3b9; border-radius: 7px; background: #fff5f2; color: #b54732 !important; }
.protocol-layout { display: grid; grid-template-columns: minmax(290px, 360px) minmax(0, 1fr); gap: 12px; min-height: 480px; flex: 1; }
.protocol-list-panel, .protocol-detail-panel { min-width: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; overflow: hidden; }
.panel-heading, .protocol-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 16px; border-bottom: 1px solid var(--line-soft); }
.panel-heading strong { display: block; color: #263f5a; font-size: 14px; }.panel-heading small, .panel-hint { color: var(--muted); font-size: 11px; }.panel-heading small { display: block; margin-top: 4px; }
.protocol-list { padding: 7px; }.protocol-list-item { width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 12px 10px; border: 1px solid transparent; border-radius: 7px; background: #fff; color: var(--fg); text-align: left; }.protocol-list-item:hover { border-color: #c9ddf6; background: #f8fbff; }.protocol-list-item.active { border-color: #9dc3ec; background: #f1f7ff; box-shadow: inset 3px 0 #327cc8; }
.protocol-list-mark { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 7px; }.protocol-list-mark.success { color: #188569; background: #e9f8f1; }.protocol-list-mark.draft { color: #ad721d; background: #fff5df; }.protocol-list-mark.muted { color: #8492a3; background: #f0f3f6; }
.protocol-list-copy { min-width: 0; flex: 1; }.protocol-list-copy strong, .protocol-list-copy small, .protocol-list-copy em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.protocol-list-copy strong { color: #24415f; font-size: 13px; }.protocol-list-copy small { margin-top: 3px; color: #708199; font: 11px var(--font-mono); }.protocol-list-copy em { margin-top: 7px; color: var(--muted); font-size: 11px; font-style: normal; }
.status-pill { flex: none; display: inline-flex; align-items: center; min-height: 22px; padding: 0 7px; border-radius: 999px; font-size: 10px; white-space: nowrap; }.status-pill.success { color: #16765e; background: #e9f8f1; }.status-pill.draft { color: #9c6417; background: #fff3d8; }.status-pill.muted { color: #6f7d8d; background: #eef1f4; }.status-pill.large { min-height: 26px; padding: 0 10px; }
.protocol-detail-panel { padding-bottom: 18px; }.protocol-detail-head { align-items: flex-start; }.protocol-detail-head h2 { margin: 5px 0 6px; color: #203b58; font-size: 20px; }.protocol-code { color: #71849a; font: 11px var(--font-mono); }.detail-actions { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line-soft); }.detail-actions .danger-text { margin-left: auto; }
.protocol-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 15px 16px; }.protocol-meta div { min-width: 0; padding-right: 10px; border-right: 1px solid var(--line-soft); }.protocol-meta div:last-child { border-right: 0; }.protocol-meta dt { color: var(--muted); font-size: 11px; }.protocol-meta dd { margin: 5px 0 0; overflow: hidden; color: #294661; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.detail-section { padding: 0 16px; }.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 35px; }.section-heading strong { color: #294661; font-size: 13px; }.section-heading small { color: var(--muted); font-size: 11px; }.section-heading .link-btn { display: inline-flex; align-items: center; gap: 4px; }
.condition-table { overflow: hidden; border: 1px solid var(--line-soft); border-radius: 7px; }.condition-row { display: grid; grid-template-columns: minmax(150px, 1.25fr) minmax(110px, 1fr) minmax(120px, 1fr) 70px 60px; gap: 10px; align-items: center; min-height: 55px; padding: 8px 11px; border-top: 1px solid var(--line-soft); color: #334f6a; font-size: 12px; }.condition-row:first-child { border-top: 0; }.condition-head { min-height: 34px; background: #f7f9fc; color: #718198; font-size: 10px; }.condition-row span { min-width: 0; }.condition-row span:first-child strong, .condition-row span:first-child small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.condition-row span:first-child small { margin-top: 3px; color: #8190a1; font: 10px var(--font-mono); }.condition-row span:nth-child(3) small { display: block; margin-top: 3px; color: #8291a3; font-size: 10px; }.level-tag { display: inline-flex; padding: 3px 6px; border-radius: 4px; font-size: 10px; }.level-1 { color: #3173a7; background: #edf6ff; }.level-2 { color: #a26719; background: #fff4dc; }.level-3 { color: #b54732; background: #fff0ec; }.mini-status { color: #168267; font-size: 10px; }.mini-status.off { color: #8793a2; }.condition-empty, .protocol-empty, .protocol-detail-empty, .editor-empty { display: grid; justify-items: center; gap: 8px; padding: 38px 20px; color: var(--muted); text-align: center; }.condition-empty { padding: 24px; font-size: 12px; }.protocol-empty svg, .protocol-detail-empty svg { color: #8db1d9; }.protocol-empty strong, .protocol-detail-empty h2 { margin: 0; color: #385774; font-size: 15px; }.protocol-empty span, .protocol-detail-empty p { margin: 0 0 6px; font-size: 12px; }.protocol-detail-empty { min-height: 360px; place-content: center; }.protocol-detail-empty h2 { margin-top: 2px; }
:deep(.alarm-protocol-dialog) { width: min(1040px, calc(100vw - 42px)); max-height: 92vh; }
:deep(.alarm-protocol-dialog .dialog-content) { background: #f7f9fc; }
:deep(.alarm-protocol-dialog .dialog-actions) { background: #fff; }
.protocol-editor { display: grid; gap: 14px; padding: 18px 22px 22px; }
.protocol-editor .dialog-fields { padding: 0; gap: 12px; }
.editor-section { padding: 16px; border: 1px solid #dbe5f0; border-radius: 8px; background: #fff; }
.editor-section:last-child { padding-bottom: 16px; border-bottom: 1px solid #dbe5f0; }
.editor-tip { margin: 8px 0 12px; padding: 9px 11px; border-left: 3px solid #8db8e5; border-radius: 0 6px 6px 0; background: #f4f8fd; color: #5d7189; font-size: 11px; line-height: 1.55; }
.device-picker-toolbar { display: flex; align-items: center; gap: 8px; margin: 10px 0 12px; }
.picker-search { min-width: 0; flex: 1; display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 10px; border: 1px solid #c7d6e8; border-radius: 7px; color: #8294a8; background: #fff; }
.picker-search input { min-width: 0; flex: 1; border: 0; outline: 0; color: #294661; }
.device-picker-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; max-height: 210px; overflow: auto; padding: 1px 2px 2px; }
.device-option { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 48px; padding: 8px 9px; border: 1px solid var(--line-soft); border-radius: 6px; background: #fbfcfe; cursor: pointer; }
.device-option:hover { border-color: #b4d0ee; background: #f4f9ff; }
.device-option input { accent-color: var(--accent); }
.device-option span { min-width: 0; flex: 1; }
.device-option strong, .device-option small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device-option strong { color: #35536e; font-size: 11px; }
.device-option small { margin-top: 3px; color: #8998a8; font-size: 10px; }
.device-option svg { flex: none; color: #218b70; }
.point-editor { margin-top: 10px; padding: 13px; border: 1px solid #dbe5f0; border-radius: 8px; background: #fbfdff; }
.point-editor-head { display: flex; align-items: center; justify-content: space-between; min-height: 30px; color: #35536e; font-size: 12px; }
.point-editor-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 10px; }
.point-switch { display: flex; align-items: center; gap: 8px; align-self: end; min-height: 40px; padding: 0 9px; border: 1px solid #e0e7ef; border-radius: 6px; background: #fff; }
.point-switch input { accent-color: var(--accent); }
.point-switch span { min-width: 0; }
.point-switch strong, .point-switch small { display: block; }
.point-switch strong { color: #456079; font-size: 11px; }
.point-switch small { margin-top: 2px; color: #8a99aa; font-size: 10px; }
@media (max-width: 980px) { .protocol-layout { grid-template-columns: 1fr; }.protocol-list-panel { max-height: 300px; }.protocol-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: auto; }.protocol-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }.protocol-meta div:nth-child(2) { border-right: 0; } }
@media (max-width: 860px) { .device-picker-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.point-editor-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 720px) { .alarm-protocol-page .view-head { align-items: flex-start; }.protocol-layout { min-height: 0; }.protocol-list { display: block; }.condition-head { display: none; }.condition-row { grid-template-columns: 1fr 1fr; gap: 8px; padding: 11px; }.condition-row span:nth-child(1) { grid-column: 1 / -1; }.protocol-meta { grid-template-columns: 1fr 1fr; }.protocol-meta div:nth-child(odd) { border-right: 1px solid var(--line-soft); }.protocol-meta div:nth-child(even) { border-right: 0; }.protocol-editor { padding: 14px; }.device-picker-toolbar { align-items: stretch; flex-direction: column; }.device-picker-grid { grid-template-columns: 1fr; }.point-editor-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .protocol-detail-head { flex-direction: column; }.detail-actions { flex-wrap: wrap; }.point-editor-grid { grid-template-columns: 1fr; } }
</style>
