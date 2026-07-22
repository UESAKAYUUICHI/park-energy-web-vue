<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import StatusTag from '@/components/app/StatusTag.vue'
import { alarmEvents, alarmRules, alarmSummary, dealAlarm, saveAlarmRule } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const mode = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const rows = ref<RecordRow[]>([])
const summary = ref<RecordRow>({})
const keyword = ref('')
const dealStatus = ref(mode.value === 'alarm-workbench' ? '0' : '')
const alarmType = ref('')
const alarmLevel = ref('')
const startTime = ref('')
const endTime = ref('')
const loading = ref(false)
const error = ref('')
const selected = ref<RecordRow | null>(null)
const dialog = ref(false)
const editingId = ref<unknown>(null)
const rule = reactive<RecordRow>({})
const dealDialog = ref(false)
const dealTarget = ref<RecordRow | null>(null)
const dealRemark = ref('')

const eventColumns = [{ key: 'org_name', label: '所属组织' }, { key: 'device_name', label: '告警设备' }, { key: 'point_code', label: '触发测点' }, { key: 'alarm_type', label: '告警类型' }, { key: 'alarm_level', label: '等级' }, { key: 'alarm_value', label: '触发值' }, { key: 'threshold_value', label: '阈值' }, { key: 'alarm_time', label: '告警时间' }, { key: 'deal_status', label: '处理状态' }]
const ruleColumns = [{ key: 'rule_name', label: '规则名称' }, { key: 'alarm_type', label: '告警类型' }, { key: 'point_code', label: '测点编码' }, { key: 'compare_operator', label: '比较符' }, { key: 'threshold_value', label: '阈值' }, { key: 'alarm_level', label: '等级' }, { key: 'enabled', label: '启用' }]
const summaryCards = computed(() => [{ label: '待处理告警', value: summary.value.pendingCount || 0, tone: 'warn' }, { label: '已处理告警', value: summary.value.handledCount || 0, tone: 'success' }, { label: '当前列表', value: rows.value.length, tone: 'blue' }])
const detailItems = computed(() => selected.value ? [
  ['所属组织', selected.value.org_name || selected.value.org_id || '—'], ['告警设备', selected.value.device_name || selected.value.device_sn || '—'], ['触发测点', selected.value.point_code || '—'], ['告警类型', selected.value.alarm_type || '—'], ['告警等级', selected.value.alarm_level || '—'], ['触发值', selected.value.alarm_value ?? '—'], ['阈值', selected.value.threshold_value ?? '—'], ['告警时间', selected.value.alarm_time || '—'], ['处理状态', Number(selected.value.deal_status) === 1 ? '已处理' : '未处理'], ['处理人', selected.value.deal_user || '—'], ['处理时间', selected.value.deal_time || '—'], ['处置备注', selected.value.deal_remark || '—'],
] : [])

function resetRule(data: RecordRow = {}) {
  Object.keys(rule).forEach((key) => delete rule[key])
  Object.assign(rule, { rule_name: '', alarm_type: '数据异常', rule_scope: 1, org_id: '', device_id: '', point_code: '', compare_operator: 'GT', threshold_value: '', duration_seconds: 0, alarm_level: 2, enabled: 1, remark: '', ...data })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (mode.value === 'alarm-rules') {
      const page = await alarmRules({ pageNum: 1, pageSize: 200, keyword: keyword.value })
      rows.value = page.records
      summary.value = {}
      return
    }
    const [page, data] = await Promise.all([
      alarmEvents({ pageNum: 1, pageSize: 200, keyword: keyword.value, dealStatus: dealStatus.value || undefined, startTime: startTime.value || undefined, endTime: endTime.value || undefined }),
      alarmSummary({ dealStatus: dealStatus.value || undefined }),
    ])
    rows.value = page.records.filter((row) => (!alarmType.value || String(row.alarm_type) === alarmType.value) && (!alarmLevel.value || String(row.alarm_level) === alarmLevel.value))
    summary.value = data
  } catch (e) {
    error.value = e instanceof Error ? e.message : '告警数据读取失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() { editingId.value = null; resetRule(); dialog.value = true }
function openEdit(row: RecordRow) { editingId.value = row.id; resetRule(row); dialog.value = true }
async function saveRule() { try { await saveAlarmRule(rule, editingId.value || undefined); dialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '规则保存失败' } }
function openDeal(row: RecordRow) { dealTarget.value = row; dealRemark.value = ''; dealDialog.value = true }
async function deal() { if (!dealTarget.value) return; try { await dealAlarm(dealTarget.value.id, { dealUser: session.user?.username || 'admin', dealRemark: dealRemark.value }); dealDialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '告警处置失败' } }
function resetEvents() { keyword.value = ''; dealStatus.value = mode.value === 'alarm-workbench' ? '0' : ''; alarmType.value = ''; alarmLevel.value = ''; startTime.value = ''; endTime.value = ''; load() }

watch(() => route.fullPath, () => { dealStatus.value = mode.value === 'alarm-workbench' ? '0' : ''; load() })
onMounted(load)
</script>

<template>
  <section class="view-page">
    <header class="view-head"><div><p class="eyebrow">ALARM MANAGEMENT</p><h1>{{ title }}</h1><p>{{ mode === 'alarm-rules' ? '配置未来数据采集时的告警判定规则。' : mode === 'alarm-workbench' ? '聚焦待处理告警，在表格中完成处置并形成闭环。' : '按组织范围查询告警事件、状态和人工处置记录。' }}</p></div><div class="head-actions"><button v-if="mode === 'alarm-rules' && session.can('alarm:rule:add')" class="primary" @click="openCreate">新增告警规则</button><button class="quiet" @click="load">刷新</button></div></header>

    <template v-if="mode !== 'alarm-rules'">
      <div class="metric-grid compact-metrics"><article v-for="card in summaryCards" :key="card.label" class="metric" :class="card.tone"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article></div>
      <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="设备、测点或告警类型" @query="load" @reset="resetEvents"><label class="field inline"><span>处理状态</span><select v-model="dealStatus"><option value="">全部</option><option value="0">未处理</option><option value="1">已处理</option></select></label><label class="field inline"><span>告警类型</span><select v-model="alarmType"><option value="">全部</option><option>过压</option><option>欠压</option><option>过流</option><option>设备离线</option><option>数据异常</option></select></label><label class="field inline"><span>告警等级</span><select v-model="alarmLevel"><option value="">全部</option><option value="1">一般</option><option value="2">重要</option><option value="3">紧急</option></select></label><label class="field inline"><span>开始日期</span><input v-model="startTime" type="date"></label><label class="field inline"><span>结束日期</span><input v-model="endTime" type="date"></label></FilterBar>
      <AppDataTable :title="mode === 'alarm-workbench' ? '待处理告警队列' : '告警事件列表'" :columns="eventColumns" :rows="rows" :loading="loading" :error="error" @refresh="load" @detail="(row) => selected = row"><template #cell-deal_status="{ value }"><StatusTag domain="alarm" :value="value" /></template><template #actions="{ row }"><button class="link-btn" @click="selected = row">详情</button><button v-if="Number(row.deal_status) === 0 && session.can('alarm:event:deal')" class="link-btn" @click="openDeal(row)">处置</button></template></AppDataTable>
    </template>

    <template v-else>
      <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="规则名称或测点编码" @query="load" @reset="() => { keyword = ''; load() }" />
      <AppDataTable title="告警规则列表" :columns="ruleColumns" :rows="rows" :loading="loading" :error="error" @refresh="load" @detail="(row) => selected = row"><template #cell-enabled="{ value }"><StatusTag domain="online" :value="value" /></template><template #actions="{ row }"><button class="link-btn" @click="selected = row">详情</button><button v-if="session.can('alarm:rule:edit')" class="link-btn" @click="openEdit(row)">编辑</button></template></AppDataTable>
    </template>

    <AppDrawer :open="Boolean(selected)" title="告警详情" @update:open="(open) => { if (!open) selected = null }"><dl class="detail-grid"><template v-for="item in detailItems" :key="item[0]"><dt>{{ item[0] }}</dt><dd>{{ item[1] }}</dd></template></dl></AppDrawer>
    <AppDialog v-model:open="dialog" :title="editingId ? '编辑告警规则' : '新增告警规则'" description="字段与 alarm_rule 表及 Platform 告警规则接口对应。" @submit="saveRule"><div class="dialog-fields"><label class="dialog-field"><span>规则名称*</span><input v-model="rule.rule_name" required></label><label class="dialog-field"><span>告警类型*</span><input v-model="rule.alarm_type" required></label><label class="dialog-field"><span>组织 ID</span><input v-model="rule.org_id" type="number"></label><label class="dialog-field"><span>设备 ID</span><input v-model="rule.device_id" type="number"></label><label class="dialog-field"><span>测点编码</span><input v-model="rule.point_code"></label><label class="dialog-field"><span>比较符</span><select v-model="rule.compare_operator"><option>GT</option><option>GTE</option><option>LT</option><option>LTE</option><option>EQ</option></select></label><label class="dialog-field"><span>阈值</span><input v-model="rule.threshold_value" type="number"></label><label class="dialog-field"><span>告警等级</span><select v-model="rule.alarm_level"><option :value="1">一般</option><option :value="2">重要</option><option :value="3">紧急</option></select></label><label class="dialog-field full"><span>备注</span><textarea v-model="rule.remark"></textarea></label></div></AppDialog>
    <AppDialog v-model:open="dealDialog" title="处置告警" description="提交后由 Platform 写入处理人、处理时间和处置备注。" confirm-text="确认处置" @submit="deal"><div class="dialog-fields"><label class="dialog-field full"><span>处置备注</span><textarea v-model="dealRemark" required></textarea></label></div></AppDialog>
  </section>
</template>
