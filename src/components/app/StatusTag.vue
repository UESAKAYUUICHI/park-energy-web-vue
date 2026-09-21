<script setup lang="ts">
import { computed } from 'vue'
import { displayValue } from '@/utils/displayValue'
const props = defineProps<{ domain: 'bill' | 'command' | 'alarm' | 'online' | 'parse' | 'enabled'; value: unknown }>()
const state = computed(() => {
  const raw = String(props.value ?? '').trim().toUpperCase()
  if (props.domain === 'alarm' && typeof props.value === 'string') {
    const alarmStates: Record<string, readonly [string, string]> = {
      NEW: ['新告警', 'danger'], ACKNOWLEDGED: ['已确认', 'warn'], IN_PROGRESS: ['处理中', 'blue'],
      RECOVERED: ['已恢复', 'success'], CLOSED: ['已关闭', 'muted'], FALSE_POSITIVE: ['误报', 'muted'], SUPPRESSED: ['已抑制', 'warn'],
    }
    const item = alarmStates[raw] || ['未知', 'muted']
    return { text: item[0], tone: item[1] }
  }
  if (props.domain === 'online' && (raw === 'ONLINE' || raw === 'OFFLINE' || raw === 'UNKNOWN')) return { text: displayValue('online_status', props.value), tone: raw === 'ONLINE' ? 'success' : raw === 'OFFLINE' ? 'danger' : 'muted' }
  if (props.domain === 'enabled' && ['ENABLED', 'DISABLED', 'ACTIVE', 'INACTIVE', 'TRUE', 'FALSE'].includes(raw)) return { text: displayValue('enabled', props.value), tone: ['ENABLED', 'ACTIVE', 'TRUE'].includes(raw) ? 'success' : 'muted' }
  if (props.domain === 'command' && Number.isNaN(Number(props.value))) {
    const commandStates: Record<string, readonly [string, string]> = { PENDING: ['待下发', 'warn'], PUBLISHED: ['已发布', 'blue'], SUCCESS: ['成功', 'success'], FAILED: ['失败', 'danger'], TIMEOUT: ['超时', 'danger'] }
    const item = commandStates[raw] || [displayValue('status', props.value), 'muted']
    return { text: item[0], tone: item[1] }
  }
  const n = Number(props.value)
  const maps = { bill: [['未缴', 'warn'], ['已缴', 'success'], ['逾期', 'danger'], ['已作废', 'muted'], ['部分缴费', 'blue']], command: [['待下发', 'warn'], ['已发布', 'blue'], ['成功', 'success'], ['失败', 'danger'], ['超时', 'danger']], alarm: [['未处理', 'danger'], ['已处理', 'success']], online: [['离线', 'danger'], ['在线', 'success']], parse: [['失败', 'danger'], ['成功', 'success']], enabled: [['停用', 'muted'], ['启用', 'success']] } as const
  const item = maps[props.domain][n] || ['未知', 'muted']
  return { text: item[0], tone: item[1] }
})
</script>
<template><span class="tag" :class="state.tone">{{ state.text }}</span></template>
