<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, Gauge, History, ShieldCheck } from '@lucide/vue'
import PowerEfficiencyWorkbench from '@/views/PowerEfficiencyWorkbench.vue'

type Tab = 'three-phase-monitor' | 'power-efficiency-analysis' | 'energy-consume-statistics' | 'data-model-predict'
const route = useRoute()
const router = useRouter()
const tab = computed<Tab>(() => {
  const value = String(route.query.tab || 'three-phase-monitor')
  const aliases: Record<string, Tab> = {
    realtime: 'three-phase-monitor',
    history: 'power-efficiency-analysis',
    statistics: 'energy-consume-statistics',
    quality: 'data-model-predict',
    'three-phase-monitor': 'three-phase-monitor',
    'power-efficiency-analysis': 'power-efficiency-analysis',
    'energy-consume-statistics': 'energy-consume-statistics',
    'data-model-predict': 'data-model-predict',
  }
  return aliases[value] || 'three-phase-monitor'
})
const tabs: Array<{ key: Tab; label: string; icon: typeof Activity; description: string }> = [
  { key: 'three-phase-monitor', label: '三相监测', icon: Activity, description: '三相平衡、电压电流越限、电网频率质量' },
  { key: 'power-efficiency-analysis', label: '功率分析', icon: Gauge, description: '功率因数、无功损耗、负载率趋势' },
  { key: 'energy-consume-statistics', label: '能耗统计', icon: History, description: '日周月能耗、峰谷波动、累计趋势' },
  { key: 'data-model-predict', label: '模型预测', icon: ShieldCheck, description: '模型仿真预测与风险推演' },
]
function switchTab(next: Tab) { void router.replace({ query: next === 'three-phase-monitor' ? {} : { tab: next } }) }
</script>

<template>
  <section class="power-efficiency-page">
    <header class="power-efficiency-head">
      <div><p class="eyebrow">POWER · EFFICIENCY · QUALITY</p><h1>电力能效</h1></div>
      <nav class="power-efficiency-tabs" aria-label="电力能效功能切换"><button v-for="item in tabs" :key="item.key" :class="{ active: tab === item.key }" :title="item.description" @click="switchTab(item.key)"><component :is="item.icon" :size="15" /><span>{{ item.label }}</span></button></nav>
    </header>
    <div class="power-efficiency-content"><PowerEfficiencyWorkbench :page="tab" @switch-page="switchTab" /></div>
  </section>
</template>

<style scoped>
.power-efficiency-page{height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:hidden}.power-efficiency-head{display:flex;align-items:end;justify-content:space-between;gap:18px;flex:none}.power-efficiency-head h1{margin:4px 0 7px;font:700 27px/1.15 Georgia,"Noto Serif SC",serif;letter-spacing:-.035em}.power-efficiency-head p:not(.eyebrow){margin:0;color:var(--muted);font-size:13px}.power-efficiency-tabs{display:flex;gap:5px;padding:4px;border:1px solid var(--border);border-radius:8px;background:#fff}.power-efficiency-tabs button{height:34px;display:inline-flex;align-items:center;gap:6px;padding:0 11px;border:0;border-radius:5px;background:transparent;color:var(--muted);font-size:12px}.power-efficiency-tabs button.active{background:var(--blue-soft);color:var(--accent);font-weight:700}.power-efficiency-content{flex:1;min-height:0;overflow:hidden}@media(max-width:800px){.power-efficiency-head{align-items:flex-start;flex-direction:column}.power-efficiency-tabs{width:100%;overflow:auto}.power-efficiency-tabs button{white-space:nowrap}}
</style>

<style scoped>
.power-efficiency-page{gap:14px}
.power-efficiency-head{padding:0 2px}
.power-efficiency-tabs{gap:6px;padding:5px;border-radius:10px}
.power-efficiency-tabs button{height:36px;padding:0 12px;border-radius:7px}
</style>
