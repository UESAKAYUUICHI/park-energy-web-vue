<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, Gauge, History } from '@lucide/vue'
import PowerEfficiencyWorkbench from '@/views/energy/PowerEfficiencyWorkbench.vue'

type Tab = 'three-phase-monitor' | 'power-efficiency-analysis' | 'energy-consume-statistics'
const route = useRoute()
const router = useRouter()
const tab = computed<Tab>(() => {
  const value = String(route.query.tab || 'three-phase-monitor')
  const aliases: Record<string, Tab> = {
    realtime: 'three-phase-monitor',
    history: 'power-efficiency-analysis',
    statistics: 'energy-consume-statistics',
    quality: 'energy-consume-statistics',
    'three-phase-monitor': 'three-phase-monitor',
    'power-efficiency-analysis': 'power-efficiency-analysis',
    'energy-consume-statistics': 'energy-consume-statistics',
  }
  return aliases[value] || 'three-phase-monitor'
})
const tabs: Array<{ key: Tab; label: string; icon: typeof Activity; description: string }> = [
  { key: 'three-phase-monitor', label: '三相监测', icon: Activity, description: '三相平衡、电压电流越限、电网频率质量' },
  { key: 'power-efficiency-analysis', label: '功率分析', icon: Gauge, description: '功率因数、无功损耗、负载率趋势' },
  { key: 'energy-consume-statistics', label: '能耗统计', icon: History, description: '日周月能耗、峰谷波动、累计趋势' },
]
const activeTab = computed(() => tabs.find((item) => item.key === tab.value) ?? tabs[0]!)
function switchTab(next: string) {
  const normalized = ['three-phase-monitor', 'power-efficiency-analysis', 'energy-consume-statistics'].includes(next) ? next as Tab : 'three-phase-monitor'
  void router.replace({ query: normalized === 'three-phase-monitor' ? {} : { tab: normalized } })
}
</script>

<template>
  <section class="power-efficiency-page">
    <header class="power-efficiency-head">
      <div class="power-efficiency-title"><h1>电力能效</h1><p>{{ activeTab.description }}</p></div>
      <nav class="power-efficiency-tabs" aria-label="电力能效功能切换"><button v-for="item in tabs" :key="item.key" :class="{ active: tab === item.key }" :title="item.description" @click="switchTab(item.key)"><component :is="item.icon" :size="15" /><span>{{ item.label }}</span></button></nav>
    </header>
    <div class="power-efficiency-content"><PowerEfficiencyWorkbench dense :page="tab" :show-headline="false" :show-page-switcher="false" @switch-page="switchTab" /></div>
  </section>
</template>

<style scoped>
.power-efficiency-page{height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.power-efficiency-head{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex:none;padding:0 0 8px;border-bottom:1px solid var(--border)}
.power-efficiency-title{min-width:0;display:flex;align-items:baseline;gap:12px}
.power-efficiency-title h1{flex:none;margin:0;color:#203b5a;font:700 21px/1.2 Georgia,"Noto Serif SC",serif;letter-spacing:0}
.power-efficiency-title p{overflow:hidden;margin:0;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.power-efficiency-tabs{display:flex;gap:2px;padding:3px;border-radius:6px;background:#edf3f9}
.power-efficiency-tabs button{height:30px;display:inline-flex;align-items:center;gap:5px;padding:0 10px;border:0;border-radius:4px;background:transparent;color:var(--muted);font-size:11px}
.power-efficiency-tabs button.active{background:#fff;color:var(--accent);font-weight:700;box-shadow:0 1px 3px rgb(33 72 112 / 12%)}
.power-efficiency-content{flex:1;min-height:0;overflow:hidden}
@media(max-width:800px){.power-efficiency-head{align-items:stretch;flex-direction:column;gap:8px}.power-efficiency-title{align-items:flex-start;flex-direction:column;gap:3px}.power-efficiency-tabs{width:100%;overflow:auto}.power-efficiency-tabs button{flex:1;justify-content:center;white-space:nowrap}}
</style>
