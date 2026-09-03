<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ domain: 'bill' | 'command' | 'alarm' | 'online' | 'parse'; value: unknown }>()
const state = computed(() => {
  if (props.domain === 'alarm' && typeof props.value === 'string') {
    const alarmStates: Record<string, readonly [string, string]> = {
      NEW: ['新告警', 'danger'], ACKNOWLEDGED: ['已确认', 'warn'], IN_PROGRESS: ['处理中', 'blue'],
      RECOVERED: ['已恢复', 'success'], CLOSED: ['已关闭', 'muted'], FALSE_POSITIVE: ['误报', 'muted'], SUPPRESSED: ['已抑制', 'warn'],
    }
    const item = alarmStates[props.value] || ['未知', 'muted']
    return { text: item[0], tone: item[1] }
  }
  const n = Number(props.value)
  const maps = { bill: [['未缴', 'warn'], ['已缴', 'success'], ['逾期', 'danger'], ['已作废', 'muted'], ['部分缴费', 'blue']], command: [['待下发', 'warn'], ['已发布', 'blue'], ['成功', 'success'], ['失败', 'danger'], ['超时', 'danger']], alarm: [['未处理', 'danger'], ['已处理', 'success']], online: [['离线', 'danger'], ['在线', 'success']], parse: [['失败', 'danger'], ['成功', 'success']] } as const
  const item = maps[props.domain][n] || ['未知', 'muted']
  return { text: item[0], tone: item[1] }
})
</script>
<template><span class="tag" :class="state.tone">{{ state.text }}</span></template>
