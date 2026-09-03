<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'
import { businessWorkspace, cockpit } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import type { RecordRow } from '@/types/domain'
import StatusTag from '@/components/app/StatusTag.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const mode = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const payload = ref<RecordRow>({})
const loading = ref(false)
const error = useAlertRef()

const rows = (key: string) => Array.isArray(payload.value[key]) ? payload.value[key] as RecordRow[] : []
const metrics = computed(() => (payload.value.metrics && typeof payload.value.metrics === 'object') ? payload.value.metrics as RecordRow : {})
const metricItems = computed(() => Object.entries(metrics.value).map(([key, value]) => ({ key, value })))
const configChecks = computed(() => rows('configChecks'))
const workspaceKey = computed(() => mode.value.replace('workspace-', '') as 'archive' | 'alarms' | 'billing')
const sections = computed(() => {
  if (mode.value === 'dashboard') return [
    { title: '设备健康', key: 'deviceHealth', columns: ['device_name', 'gateway_sn', 'online_status', 'org_name'] },
    { title: '最新告警', key: 'latestAlarms', columns: ['alarm_type', 'alarm_value', 'deal_status', 'alarm_time'] },
    { title: '最新账单', key: 'latestBills', columns: ['bill_no', 'account_name', 'total_amount', 'pay_status'] },
  ]
  if (mode.value === 'workspace-archive') return [
    { title: '设备档案', key: 'devices', columns: ['device_name', 'device_sn', 'gateway_sn', 'org_name', 'status'] },
    { title: '接入网关', key: 'gateways', columns: ['gateway_name', 'gateway_sn', 'online_status', 'status'] },
    { title: '配置检查', key: 'configChecks', columns: ['name', 'passed', 'message'] },
  ]
  if (mode.value === 'workspace-alarms') return [
    { title: '告警事件', key: 'events', columns: ['id', 'device_name', 'point_code', 'alarm_value', 'deal_status', 'alarm_time'] },
    { title: '告警规则', key: 'rules', columns: ['rule_name', 'point_code', 'threshold_value', 'enabled'] },
  ]
  return [
    { title: '计费账户', key: 'accounts', columns: ['account_name', 'org_name', 'status'] },
    { title: '账单与收款', key: 'bills', columns: ['bill_no', 'account_name', 'bill_cycle', 'total_amount', 'pay_status'] },
    { title: '收款记录', key: 'payments', columns: ['bill_id', 'amount', 'payment_status', 'payment_time'] },
  ]
})
const label = (key: string) => ({ device_name: '设备', device_sn: '设备编号', gateway_sn: '网关', gateway_name: '网关名称', org_name: '组织', online_status: '在线状态', status: '状态', alarm_type: '告警类型', alarm_value: '告警值', deal_status: '处理状态', alarm_time: '告警时间', bill_no: '账单编号', account_name: '计费账户', total_amount: '金额', pay_status: '收款状态', id: '编号', point_code: '测点', rule_name: '规则名称', threshold_value: '阈值', enabled: '启用', bill_id: '账单', bill_cycle: '账期', amount: '金额', payment_status: '支付状态', payment_time: '支付时间', name: '检查项', passed: '结果', message: '说明' } as Record<string, string>)[key] || key
const display = (key: string, value: unknown) => key === 'online_status' ? (Number(value) === 1 ? '在线' : '离线') : key === 'deal_status' ? (Number(value) === 1 ? '已处理' : '未处理') : key === 'pay_status' ? (Number(value) === 1 ? '已收款' : '未收款') : key === 'passed' ? (value ? '通过' : '待处理') : value == null ? '-' : String(value)
async function load() {
  loading.value = true; error.value = ''
  try { payload.value = mode.value === 'dashboard' ? await cockpit() : await businessWorkspace(workspaceKey.value) }
  catch (e) { error.value = e instanceof Error ? e.message : '工作台数据读取失败'; payload.value = {} }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="view-page business-workspace">
    <div class="view-head"><div><p class="eyebrow">ROLE WORKSPACE</p><h1>{{ title }}</h1></div><button class="quiet" type="button" :disabled="loading" title="刷新" @click="load"><RefreshCw :size="15" />刷新</button></div>
    <p v-if="error" class="notice">{{ error }}</p>
    <div v-if="metricItems.length" class="metric-grid"><article v-for="metric in metricItems" :key="metric.key" class="metric"><span>{{ label(metric.key) }}</span><strong>{{ display(metric.key, metric.value) }}</strong></article></div>
    <AppLoadingState v-if="loading" />
    <div v-else class="workspace-sections"><article v-for="section in sections" :key="section.key" class="panel"><div class="panel-head"><b>{{ section.title }}</b><span>{{ rows(section.key).length }} 条</span></div><div class="table-scroll"><table><thead><tr><th v-for="column in section.columns" :key="column">{{ label(column) }}</th></tr></thead><tbody><tr v-for="(row, index) in rows(section.key).slice(0, 12)" :key="String(row.id || index)"><td v-for="column in section.columns" :key="column"><StatusTag v-if="['online_status','deal_status','pay_status'].includes(column)" :domain="column === 'online_status' ? 'online' : column === 'deal_status' ? 'alarm' : 'bill'" :value="row[column]" /><span v-else>{{ display(column, row[column]) }}</span></td></tr><tr v-if="!rows(section.key).length"><td :colspan="section.columns.length" class="empty-cell">暂无数据</td></tr></tbody></table></div></article></div>
  </section>
</template>
