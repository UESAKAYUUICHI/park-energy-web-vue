<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { request } from '@/api/http'
import type { RecordRow } from '@/types/domain'

interface Observation { time: string; value: number | null; completeness: number | null }
interface Diagnosis {
  status: string; reason: string; pointCode: string | null; unit: string | null
  windowStart: string; windowEnd: string; qualityUsable: boolean
  observations: Observation[]; inspectionSteps: string[]
}
const props = defineProps<{ alarm: RecordRow | null }>()
const result = ref<Diagnosis | null>(null)
const busy = ref(false)
const error = ref('')
const advice = ref('')
let requestId = 0
const label = computed(() => result.value?.status === 'REVIEW_REQUIRED' ? '待现场确认' : '采样待补齐')
const number = (value: number | null) => value == null ? '—' : Number(value).toFixed(2)
const time = (value: string) => value.replace('T', ' ').slice(0, 16)

async function load() {
  const current = ++requestId
  const alarmId = props.alarm?.id
  result.value = null
  advice.value = ''
  error.value = ''
  if (!alarmId) return
  busy.value = true
  try {
    const value = await request<Diagnosis>('/ai-diagnosis/evaluate', {
      method: 'POST', body: JSON.stringify({ alarmId }),
    })
    if (current === requestId) result.value = value
  } catch (e) { if (current === requestId) error.value = e instanceof Error ? e.message : '诊断失败' }
  finally { if (current === requestId) busy.value = false }
}
async function explain() {
  if (busy.value || !props.alarm?.id) return
  const current = requestId
  busy.value = true
  error.value = ''
  try {
    const value = await request<{ mode: string; message?: string; structured?: { summaryText?: string } }>('/ai-diagnosis/llm-proxy', {
      method: 'POST', body: JSON.stringify({ alarmId: props.alarm.id }),
    })
    if (current === requestId) advice.value = value.structured?.summaryText || value.message || '采样待补齐'
  } catch (e) { if (current === requestId) error.value = e instanceof Error ? e.message : '建议生成失败' }
  finally { if (current === requestId) busy.value = false }
}
watch(() => props.alarm?.id, load, { immediate: true })
</script>

<template>
  <section class="diagnosis-panel">
    <div class="panel-actions">
      <strong>诊断证据</strong>
      <span v-if="result">{{ label }}</span>
      <button type="button" :disabled="busy" @click="load">刷新</button>
      <button type="button" :disabled="busy || !result?.qualityUsable" @click="explain">辅助建议</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy">加载中</p>
    <template v-if="result">
      <p>{{ result.reason }}</p>
      <p>{{ time(result.windowStart) }} — {{ time(result.windowEnd) }}</p>
      <table v-if="result.observations.length">
        <thead><tr><th>采样时段</th><th>平均功率 ({{ result.unit }})</th><th>完整率</th></tr></thead>
        <tbody><tr v-for="row in result.observations" :key="row.time">
          <td>{{ time(row.time) }}</td><td>{{ number(row.value) }}</td><td>{{ number(row.completeness) }}%</td>
        </tr></tbody>
      </table>
      <ol><li v-for="step in result.inspectionSteps" :key="step">{{ step }}</li></ol>
      <p v-if="advice">{{ advice }}</p>
    </template>
  </section>
</template>

<style scoped>
.diagnosis-panel { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; }
.panel-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.panel-actions strong { margin-right: auto; }
p { margin: 0; }
table { width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
li { margin: 6px 0; }
[role=alert] { color: #b42318; }
</style>
