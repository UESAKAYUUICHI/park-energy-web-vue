<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppDataTable from '@/components/app/AppDataTable.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { energy, monitor, statistics } from '@/api/platform'
import { unwrapRemote } from '@/api/http'
import type { RecordRow } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const kind = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const keyword = ref('')
const deviceId = ref(String(route.query.deviceId || ''))
const pointCodes = ref(String(route.query.pointCodes || ''))
const pointCode = ref(String(route.query.pointCode || ''))
const payload = ref<RecordRow>({})
const rows = ref<RecordRow[]>([])
const loading = ref(false)
const error = ref('')
const deviceOptions = ref<RecordRow[]>([])
const pointOptions = ref<RecordRow[]>([])

const monitorColumns = [
  { key: 'stat_date', label: '统计日期' }, { key: 'device_name', label: '设备' }, { key: 'point_code', label: '测点' },
  { key: 'start_value', label: '起始值' }, { key: 'end_value', label: '结束值' }, { key: 'usage_value', label: '用量' }, { key: 'data_complete_rate', label: '完整率' },
]
const qualityColumns = [
  { key: 'device_name', label: '设备' }, { key: 'org_name', label: '所属组织' }, { key: 'point_code', label: '测点' },
  { key: 'avg_complete_rate', label: '平均完整率', format: (value: unknown) => `${Number(value || 0).toFixed(2)}%` }, { key: 'start_date', label: '开始日期' }, { key: 'end_date', label: '结束日期' },
]
const historyColumns = [{ key: 'time', label: '采集时间' }, { key: 'pointCode', label: '测点' }, { key: 'value', label: '数值' }]
const columns = computed(() => kind.value === 'monitor' ? monitorColumns : kind.value === 'quality' ? qualityColumns : historyColumns)
const monitorDevices = computed(() => Array.isArray(payload.value.devices) ? payload.value.devices as RecordRow[] : deviceOptions.value)
const rankingRows = computed(() => Array.isArray(payload.value.ranking) ? payload.value.ranking as RecordRow[] : [])
const trendRows = computed(() => Array.isArray(payload.value.trend) ? payload.value.trend as RecordRow[] : [])
const averageCompleteRate = computed(() => rows.value.length ? rows.value.reduce((sum, row) => sum + Number(row.avg_complete_rate || 0), 0) / rows.value.length : 0)
const qualityRiskCount = computed(() => rows.value.filter((row) => Number(row.avg_complete_rate || 0) < 100).length)

async function loadSelectors() {
  try {
    const data = await monitor({ deviceId: deviceId.value || undefined })
    deviceOptions.value = Array.isArray(data.devices) ? data.devices as RecordRow[] : []
    pointOptions.value = Array.isArray(data.pointDefinitions) ? data.pointDefinitions as RecordRow[] : []
  } catch {
    // Main request keeps the real transport failure visible in the page.
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (kind.value === 'monitor') {
      const data = await monitor({ deviceId: deviceId.value || undefined, pointCode: pointCode.value || undefined })
      payload.value = data
      deviceOptions.value = Array.isArray(data.devices) ? data.devices as RecordRow[] : []
      pointOptions.value = Array.isArray(data.pointDefinitions) ? data.pointDefinitions as RecordRow[] : []
      rows.value = Array.isArray(data.dailyStats) ? data.dailyStats as RecordRow[] : []
      return
    }
    if (kind.value === 'quality') {
      const [ranking, trend, quality] = await Promise.all([energy('ranking'), energy('trend'), statistics('quality')])
      payload.value = { ranking, trend }
      rows.value = Array.isArray(quality) ? quality as RecordRow[] : []
      return
    }
    if (!deviceId.value || !pointCodes.value) {
      payload.value = { hint: '请选择设备和至少一个测点编码。' }
      rows.value = []
      return
    }
    const data = unwrapRemote(await energy('history/series', { deviceId: deviceId.value, pointCodes: pointCodes.value, startTime: route.query.startTime, endTime: route.query.endTime }))
    payload.value = { series: data as RecordRow | RecordRow[] }
    rows.value = Array.isArray(data) ? data as RecordRow[] : ((data as RecordRow).records || []) as RecordRow[]
  } catch (e) {
    error.value = e instanceof Error ? e.message : '能源数据读取失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function queryHistory() {
  router.replace({ query: { ...route.query, deviceId: deviceId.value, pointCodes: pointCodes.value } })
}

function selectDevice() {
  pointCode.value = ''
  pointCodes.value = ''
  loadSelectors()
  if (kind.value === 'monitor') load()
}

function reset() {
  keyword.value = ''
  pointCode.value = ''
  deviceId.value = ''
  pointCodes.value = ''
  if (kind.value !== 'analysis') load()
}

watch(() => route.fullPath, () => {
  deviceId.value = String(route.query.deviceId || '')
  pointCodes.value = String(route.query.pointCodes || '')
  load()
  loadSelectors()
})
onMounted(() => { load(); loadSelectors() })
</script>

<template>
  <section class="view-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">ENERGY OPERATIONS</p><h1>{{ title }}</h1>
        <p v-if="kind === 'monitor'">读取当前授权范围内的设备、测点、实时缓存与日统计。</p>
        <p v-else-if="kind === 'analysis'">按设备、测点与时间范围查询 IoTDB 历史曲线。</p>
        <p v-else>识别用量排行、趋势以及低完整率的数据质量风险。</p>
      </div>
      <button class="quiet" @click="load">刷新</button>
    </header>

    <template v-if="kind === 'analysis'">
      <article class="filter-card"><div class="filter-row">
        <label class="field"><span>设备</span><select v-model="deviceId" @change="selectDevice"><option value="">请选择设备</option><option v-for="device in deviceOptions" :key="String(device.id)" :value="String(device.id)">{{ device.device_name }} · {{ device.device_sn }}</option></select></label>
        <label class="field"><span>测点</span><select v-model="pointCodes"><option value="">请选择测点</option><option v-for="point in pointOptions" :key="String(point.id)" :value="String(point.point_code)">{{ point.point_name }} · {{ point.point_code }}</option></select></label>
        <label class="field"><span>开始时间</span><input :value="String(route.query.startTime || '')" placeholder="可由 URL 传入" disabled></label>
        <label class="field"><span>结束时间</span><input :value="String(route.query.endTime || '')" placeholder="可由 URL 传入" disabled></label>
        <div class="filter-actions"><button class="btn-primary" @click="queryHistory">查询曲线</button></div>
      </div></article>
      <div class="panel-split"><article class="panel"><div class="panel-head"><h3>历史用量趋势</h3><small>IoTDB 历史序列</small></div><pre>{{ JSON.stringify(payload.series || payload.hint || [], null, 2) }}</pre></article><article class="panel"><div class="panel-head"><h3>查询说明</h3><small>组织范围受控</small></div><p class="muted-copy">选择设备和测点后调用 <code>/energy/history/series</code>；时间范围通过 <code>startTime</code>、<code>endTime</code> 指定。</p></article></div>
    </template>

    <template v-else-if="kind === 'monitor'">
      <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="按设备或测点筛选日统计" @query="load" @reset="reset"><label class="field inline"><span>设备</span><select v-model="deviceId" @change="selectDevice"><option value="">自动选择首个可见设备</option><option v-for="device in deviceOptions" :key="String(device.id)" :value="String(device.id)">{{ device.device_name }} · {{ device.device_sn }}</option></select></label><label class="field inline"><span>测点</span><select v-model="pointCode"><option value="">全部测点</option><option v-for="point in pointOptions" :key="String(point.id)" :value="String(point.point_code)">{{ point.point_name }} · {{ point.point_code }}</option></select></label></FilterBar>
      <div class="panel-split"><article class="panel"><div class="panel-head"><h3>设备与测点</h3><small>当前授权范围</small></div><div class="compact-list"><div v-for="device in monitorDevices" :key="String(device.id)"><b>{{ device.device_name }}</b><span>{{ device.device_sn }} · {{ device.org_name }}</span></div></div></article><article class="panel"><div class="panel-head"><h3>实时数据</h3><small>Redis 缓存</small></div><pre>{{ JSON.stringify(payload.realtime || {}, null, 2) }}</pre></article></div>
    </template>

    <template v-else>
      <div class="metric-grid compact-metrics"><article class="metric"><span>质量记录</span><strong>{{ rows.length }}</strong></article><article class="metric"><span>平均完整率</span><strong>{{ averageCompleteRate.toFixed(2) }}%</strong></article><article class="metric"><span>需关注记录</span><strong>{{ qualityRiskCount }}</strong></article><article class="metric"><span>排行设备</span><strong>{{ rankingRows.length }}</strong></article></div>
      <div class="panel-split"><AppDataTable :columns="[{ key: 'device_name', label: '设备' }, { key: 'org_name', label: '组织' }, { key: 'usage_value', label: '用量' }]" :rows="rankingRows" empty-text="当前范围暂无能耗排行。"><template #action-title>排名</template><template #actions="{ row }"><span class="tag blue">{{ row.device_sn || '设备' }}</span></template></AppDataTable><AppDataTable :columns="[{ key: 'stat_period', label: '统计周期' }, { key: 'usage_value', label: '用量' }]" :rows="trendRows" empty-text="当前范围暂无用量趋势。"><template #action-title>趋势</template><template #actions="{ row }"><span class="tag">{{ row.stat_period }}</span></template></AppDataTable></div>
    </template>

    <AppDataTable :columns="columns" :rows="rows" :loading="loading" :error="error" :empty-text="kind === 'quality' ? '当前范围暂无数据质量记录。' : undefined" @refresh="load" />
  </section>
</template>
