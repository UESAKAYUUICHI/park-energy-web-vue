<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { collectionQualityDaily, createDataQualityWorkOrder, dataQualityEvent, dataQualityEvents, dataQualityReplayPrecheck, dataQualitySummary, replayDataQualityEvent } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { qualityStatusLabel } from '@/utils/enumLabels'

defineProps<{ embedded?: boolean }>()

const rows = ref<RecordRow[]>([])
const collectionRows = ref<RecordRow[]>([])
const summary = ref<RecordRow>({})
const selected = ref<RecordRow | null>(null)
const keyword = ref('')
const status = ref('')
const loading = ref(false)
const error = useAlertRef()
const session = useSessionStore()
const today = computed(() => (summary.value.today || {}) as RecordRow)
const collectionToday = computed(() => (summary.value.collectionToday || {}) as RecordRow)
const failures = computed(() => Array.isArray(summary.value.topFailures) ? summary.value.topFailures as unknown as RecordRow[] : [])
const columns = [
  { key: 'id', label: '事件ID' }, { key: 'gateway_sn', label: '网关' }, { key: 'message_id', label: '消息ID' },
  { key: 'status', label: '处理状态', format: qualityStatusLabel }, { key: 'meter_count', label: '仪表数' }, { key: 'received_at', label: '接收时间' },
  { key: 'processed_at', label: '处理时间' }, { key: 'error_reason', label: '失败原因' },
]
const failureColumns = [{ key: 'status', label: '状态', format: qualityStatusLabel }, { key: 'error_reason', label: '失败原因' }, { key: 'total', label: '次数' }]
const collectionColumns = [
  { key: 'stat_date', label: '统计日期' }, { key: 'device_sn', label: '设备' }, { key: 'device_name', label: '设备名称' },
  { key: 'received_samples', label: '有效报文' }, { key: 'expected_samples', label: '期望报文' }, { key: 'data_complete_rate', label: '当前完整率(%)' },
  { key: 'longest_gap_seconds', label: '最大断采(秒)' }, { key: 'quality_status', label: '质量状态', format: qualityStatusLabel }, { key: 'last_collect_time', label: '最后采集时间' },
]
async function load() {
  loading.value = true; error.value = ''
  try {
    const [summaryData, page, collection] = await Promise.all([dataQualitySummary(), dataQualityEvents({ pageNum: 1, pageSize: 200, keyword: keyword.value, status: status.value || undefined }), collectionQualityDaily({ pageNum: 1, pageSize: 100, keyword: keyword.value })])
    summary.value = summaryData; rows.value = page.records; collectionRows.value = collection.records
  } catch (e) { error.value = e instanceof Error ? e.message : '采集质量数据读取失败'; rows.value = []; collectionRows.value = [] }
  finally { loading.value = false }
}
async function open(row: RecordRow) {
  try {
    const [detail, replayPrecheck] = await Promise.all([dataQualityEvent(row.id), dataQualityReplayPrecheck(row.id)])
    selected.value = { ...detail, replayPrecheck }
  }
  catch (e) { error.value = e instanceof Error ? e.message : '采集事件详情读取失败' }
}
async function replay() {
  if (!selected.value) return
  try { selected.value = await replayDataQualityEvent(selected.value.id); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '原始报文重放失败' }
}
async function createWorkOrder() {
  if (!selected.value) return
  try { selected.value = await createDataQualityWorkOrder(selected.value.id); await load() }
  catch (e) { error.value = e instanceof Error ? e.message : '数据质量工单创建失败' }
}
onMounted(load)
</script>

<template>
  <section class="view-page quality-center-page" :class="{ 'quality-center-embedded': embedded }">
    <header class="view-head"><div><p class="eyebrow">INGEST · QUALITY · TRACE</p><h1>采集质量中心</h1></div><button class="quiet" @click="load">刷新</button></header>
    <div class="metric-grid"><article class="metric-card"><span>今日采集事件</span><b>{{ today.total_count || 0 }}</b></article><article class="metric-card"><span>成功处理</span><b>{{ today.success_count || 0 }}</b></article><article class="metric-card"><span>无效数据</span><b>{{ today.invalid_count || 0 }}</b></article><article class="metric-card"><span>死信隔离</span><b>{{ today.dead_letter_count || 0 }}</b></article></div>
    <div class="metric-grid"><article class="metric-card"><span>今日已采设备</span><b>{{ collectionToday.device_count || 0 }}</b></article><article class="metric-card"><span>采集正常</span><b>{{ collectionToday.normal_count || 0 }}</b></article><article class="metric-card"><span>采集不完整</span><b>{{ collectionToday.incomplete_count || 0 }}</b></article><article class="metric-card"><span>最大断采（秒）</span><b>{{ collectionToday.max_gap_seconds || 0 }}</b></article></div>
    <AppDataTable title="设备采集完整率（结算门禁依据）" :columns="collectionColumns" :rows="collectionRows" :loading="loading" empty-text="尚无有效仪表采集记录" />
    <AppDataTable title="高频失败原因" :columns="failureColumns" :rows="failures" empty-text="暂无异常事件" />
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="网关、消息ID或失败原因" @query="load" @reset="()=>{keyword='';status='';load()}"><label class="field inline"><span>处理状态</span><AppSelect v-model="status"><option value="">全部</option><option>SUCCESS</option><option>INVALID</option><option>DEAD_LETTER</option><option>PROCESSING</option></AppSelect></label></FilterBar>
    <AppDataTable title="采集事件追踪" :columns="columns" :rows="rows" :loading="loading" :error="error" @refresh="load"><template #actions="{ row }"><button class="link-btn" @click="open(row)">查看原始报文</button></template></AppDataTable>
    <AppDrawer :open="Boolean(selected)" title="采集事件详情" @update:open="(open)=>{if(!open) selected=null}"><button v-if="selected && ['INVALID','DEAD_LETTER','REPLAY_REQUESTED'].includes(String(selected.status)) && session.can('ops:workorder:create') && !selected.workOrder" class="primary" @click="createWorkOrder">创建数据质量工单</button><button v-if="selected && ['INVALID','DEAD_LETTER','REPLAY_REQUESTED'].includes(String(selected.status)) && session.can('energy:quality:replay')" class="primary" @click="replay">修复后重放原始报文</button><pre>{{ JSON.stringify(selected, null, 2) }}</pre></AppDrawer>
  </section>
</template>

<style scoped>
.quality-center-embedded{height:100%;min-height:0;display:flex;flex-direction:column;gap:10px;overflow:hidden}.quality-center-embedded .view-head{display:none}.quality-center-embedded .metric-grid{margin-bottom:0;flex:none}.quality-center-embedded :deep(.app-table){flex:1;min-height:0;margin-top:0;display:flex;flex-direction:column;overflow:hidden}.quality-center-embedded :deep(.table-scroll){flex:1;min-height:0}.quality-center-embedded :deep(.empty-state){min-height:0;flex:1}.quality-center-embedded :deep(.table-pagination){flex:none}
</style>
