<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useRoute, useRouter } from 'vue-router'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { access, replayAccessRawMessage, sendCommand } from '@/api/platform'
import { unwrapRemote } from '@/api/http'
import type { RecordRow } from '@/types/domain'
import { accessLabel, onlineLabel } from '@/utils/enumLabels'

const route = useRoute()
const router = useRouter()
const mode = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const rows = ref<RecordRow[]>([])
const payload = ref<RecordRow>({})
const keyword = ref('')
const gatewayId = ref('')
const targetId = ref('')
const commandStatus = ref('')
const onlineStatus = ref('')
const loading = ref(false)
const error = useAlertRef()
const selected = ref<RecordRow | null>(null)
const dialog = ref(false)
const command = reactive<{ targetId: string; commandType: string; commandPayloadText: string }>({ targetId: '', commandType: '', commandPayloadText: '{}' })

const columns = computed(() => mode.value === 'access' ? [{ key: 'gatewaySn', label: '网关编号' }, { key: 'topicGatewayId', label: '接入标识' }, { key: 'status', label: '在线状态', format: onlineLabel }, { key: 'lastSeenTime', label: '最后在线' }] : [{ key: 'target_sn', label: '目标编号' }, { key: 'command_type', label: '指令类型' }, { key: 'request_username', label: '发起人' }, { key: 'request_time', label: '发起时间' }, { key: 'response_time', label: '响应时间' }, { key: 'status', label: '执行状态' }, { key: 'fail_reason', label: '失败原因' }])
const formatAccessStatus = (value: unknown) => accessLabel(value)
const queryText = (value: unknown) => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
const syncQueryFilters = () => { gatewayId.value = queryText(route.query.gatewayId); targetId.value = queryText(route.query.targetId || route.query.deviceId) }
const commandTypes = computed(() => Array.isArray(payload.value.types) ? payload.value.types as unknown as RecordRow[] : [])
const commandTargets = computed(() => payload.value.targets as RecordRow || {})
const gateways = computed(() => Array.isArray(commandTargets.value.gateways) ? commandTargets.value.gateways as unknown as RecordRow[] : [])
const devices = computed(() => Array.isArray(commandTargets.value.devices) ? commandTargets.value.devices as unknown as RecordRow[] : [])
const rawMessages = computed(() => Array.isArray(payload.value.raw) ? payload.value.raw as unknown as RecordRow[] : [])
const discoveredDevices = computed(() => Array.isArray(payload.value.discovered) ? payload.value.discovered as unknown as RecordRow[] : [])
const rawMessageColumns = [{ key: 'gatewaySn', label: '网关编号' }, { key: 'receiveTime', label: '接收时间' }, { key: 'messageType', label: '报文类型' }, { key: 'status', label: '解析状态' }, { key: 'failReason', label: '失败原因' }]
const discoveryColumns = [{ key: 'deviceSn', label: '发现设备 SN' }, { key: 'gatewayId', label: '网关 ID' }, { key: 'protocolAddr', label: '协议地址' }, { key: 'seenCount', label: '上报次数' }, { key: 'lastSeenTime', label: '最近发现' }, { key: 'discoveryStatus', label: '接入状态' }, { key: 'failReason', label: '待处理原因' }]
async function load() { loading.value = true; error.value = ''; try { if (mode.value === 'access') { const [gatewaysResponse, raw, discovered] = await Promise.all([access('gateways/status'), access('raw-messages'), access('discovered-devices')]); const gatewayData = unwrapRemote(gatewaysResponse) as unknown as RecordRow[]; payload.value = { gateways: gatewayData, raw: unwrapRemote(raw), discovered: unwrapRemote(discovered) }; rows.value = (Array.isArray(gatewayData) ? gatewayData : []).filter((row) => !onlineStatus.value || String(row.status) === onlineStatus.value); return } if (mode.value === 'control') { const [targets, types, commands] = await Promise.all([access('command-targets'), access('command-types'), access('commands/page', { pageNum: 1, pageSize: 20, gatewayId: gatewayId.value || undefined, targetId: targetId.value || undefined, status: commandStatus.value || undefined })]); payload.value = { targets: unwrapRemote(targets), types: unwrapRemote(types) }; const page = commands as unknown as { records?: RecordRow[] }; rows.value = page.records || []; return } const [page, targets] = await Promise.all([access('commands/page', { pageNum: 1, pageSize: 50, keyword: keyword.value, gatewayId: gatewayId.value || undefined, targetId: targetId.value || undefined, status: commandStatus.value || undefined }), access('command-targets')]); payload.value = { targets: unwrapRemote(targets) }; rows.value = (page as unknown as { records?: RecordRow[] }).records || [] } catch (e) { error.value = e instanceof Error ? e.message : '接入服务读取失败'; rows.value = [] } finally { loading.value = false } }
function onboard(row: RecordRow) { router.push({ path: '/device-archive/devices', query: { discoveryId: String(row.id || ''), deviceSn: String(row.deviceSn || ''), gatewayId: String(row.gatewayId || ''), protocolAddr: String(row.protocolAddr || ''), rawLogId: String(row.latestRawLogId || '') } }) }
async function openRawMessage(row: RecordRow) { try { selected.value = unwrapRemote(await access(`raw-messages/${row.id}`)) as RecordRow } catch (e) { error.value = e instanceof Error ? e.message : '原始报文详情读取失败' } }
async function replayRawMessage() { if (!selected.value?.id) return; try { await replayAccessRawMessage(selected.value.id); await load() } catch (e) { error.value = e instanceof Error ? e.message : '原始报文重放失败' } }
function openCommand() { command.targetId = ''; command.commandType = ''; command.commandPayloadText = '{}'; dialog.value = true }
async function submitCommand() { try { const result = await sendCommand({ targetId: Number(command.targetId), commandType: command.commandType, commandPayload: JSON.parse(String(command.commandPayloadText)) }); selected.value = result; dialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '指令下发失败' } }
async function refreshSelectedCommand() { const id = selected.value?.commandId || selected.value?.command_id || selected.value?.id; if (!id) return; try { selected.value = unwrapRemote(await access(`commands/${id}`)) as RecordRow } catch (e) { error.value = e instanceof Error ? e.message : '指令状态读取失败' } }
watch(() => route.fullPath, () => { syncQueryFilters(); void load() }); onMounted(() => { syncQueryFilters(); void load() })
</script>
<template>
  <section class="view-page"><header class="view-head"><div><p class="eyebrow">DEVICE OPERATIONS</p><h1>{{ title }}</h1></div><div class="head-actions"><button v-if="mode === 'control'" class="primary" @click="openCommand">下发指令</button><button class="quiet" title="手动刷新" aria-label="手动刷新" @click="load"><RefreshCw :size="15" />刷新</button></div></header>
    <template v-if="mode === 'access'"><article class="filter-card"><div class="filter-row"><label class="field"><span>网关状态</span><AppSelect v-model="onlineStatus"><option value="">全部</option><option value="ONLINE">在线</option><option value="OFFLINE">离线</option></AppSelect></label><div class="filter-actions"><button class="btn-primary" @click="load">查询</button></div></div></article><article class="panel"><div class="panel-head"><h3>接入诊断说明</h3><small>Access 服务</small></div><p class="muted-copy">已建档设备会进入正式数据链路；新发现设备会保留样例报文，完成型号与网关配置后再绑定接入。</p></article><AppDataTable title="待接入设备" :columns="discoveryColumns" :rows="discoveredDevices" :loading="loading" :error="error" empty-text="暂无待接入设备。"><template #cell-discoveryStatus="{ value }"><span class="tag" :class="String(value) === 'BOUND' ? 'success' : 'warn'">{{ formatAccessStatus(value) }}</span></template><template #actions="{ row }"><button v-if="String(row.discoveryStatus) !== 'BOUND'" class="link-btn" @click="onboard(row)">进入设备登记</button><button v-else class="link-btn" @click="selected = row">查看绑定</button></template></AppDataTable><AppDataTable title="原始报文记录" :columns="rawMessageColumns" :rows="rawMessages" :loading="loading" :error="error" empty-text="当前授权范围暂无原始报文。"><template #cell-status="{ value }"><span class="tag" :class="String(value) === 'FORWARDED' ? 'success' : String(value) === 'INVALID' || String(value) === 'MQ_FAILED' ? 'danger' : 'warn'">{{ formatAccessStatus(value || 'RECEIVED') }}</span></template><template #actions="{ row }"><button class="link-btn" @click="openRawMessage(row)">查看详情</button></template></AppDataTable></template>
    <template v-else-if="mode === 'control'"><div class="two-panel"><article class="panel"><div class="panel-head"><h3>已授权目标</h3><small>当前组织范围</small></div><pre>{{ JSON.stringify(payload.targets || [], null, 2) }}</pre></article><article class="panel"><div class="panel-head"><h3>允许的指令类型</h3><small>Access 白名单</small></div><pre>{{ JSON.stringify(payload.types || [], null, 2) }}</pre></article></div></template>
    <FilterBar v-if="mode === 'commands' || mode === 'control'" v-model:keyword="keyword" :busy="loading" placeholder="目标编号或指令类型" @query="load" @reset="() => { keyword = ''; gatewayId = ''; targetId = ''; commandStatus = ''; load() }"><label class="field inline"><span>网关</span><AppSelect v-model="gatewayId"><option value="">全部网关</option><option v-for="gateway in gateways" :key="String(gateway.id)" :value="String(gateway.id)">{{ gateway.gateway_name || gateway.gateway_sn }}</option></AppSelect></label><label class="field inline"><span>设备</span><AppSelect v-model="targetId"><option value="">全部设备</option><option v-for="device in devices" :key="String(device.id)" :value="String(device.id)">{{ device.device_name || device.device_sn }}</option></AppSelect></label><label class="field inline"><span>执行状态</span><AppSelect v-model="commandStatus"><option value="">全部</option><option value="0">待下发</option><option value="1">已发布</option><option value="2">成功</option><option value="3">失败</option><option value="4">超时</option></AppSelect></label></FilterBar>
    <AppDataTable :columns="columns" :rows="rows" :loading="loading" :error="error" @refresh="load" @detail="(row) => selected = row"><template #cell-status="{ value }"><StatusTag v-if="mode !== 'access'" domain="command" :value="value" /><span v-else class="tag" :class="String(value) === 'ONLINE' ? 'success' : 'muted'">{{ onlineLabel(value) }}</span></template></AppDataTable>
    <AppDrawer :open="Boolean(selected)" title="指令 / 接入详情" @update:open="(open) => { if (!open) selected = null }"><div class="head-actions"><button v-if="mode !== 'access'" class="quiet" @click="refreshSelectedCommand"><RefreshCw :size="14" />刷新指令状态</button><button v-if="mode === 'access' && selected?.payload" class="primary" @click="replayRawMessage">重放此报文</button></div><pre>{{ JSON.stringify(selected, null, 2) }}</pre></AppDrawer>
    <AppDialog v-model:open="dialog" title="下发设备指令" @submit="submitCommand"><div class="dialog-fields"><label class="dialog-field"><span>目标设备*</span><AppSelect v-model="command.targetId"><option value="">请选择设备</option><option v-for="device in devices" :key="String(device.id)" :value="String(device.id)">{{ device.device_name }} · {{ device.device_sn }}</option></AppSelect></label><label class="dialog-field"><span>指令类型*</span><AppSelect v-model="command.commandType"><option value="">请选择指令</option><option v-for="item in commandTypes" :key="String(item.commandType)" :value="String(item.commandType)">{{ item.label }}</option></AppSelect></label><label class="dialog-field full"><span>指令参数 JSON*</span><textarea v-model="command.commandPayloadText" spellcheck="false"></textarea></label></div></AppDialog>
  </section>
</template>
