<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { routeRecords } from '@/router/routes'
import { useSessionStore } from '@/stores/session'
import { Activity, Archive, BadgeCheck, BarChart3, Bell, Boxes, Building2, Cable, ChartNoAxesCombined, CircleDollarSign, ClipboardCheck, Compass, Cpu, Crosshair, FileClock, FileText, Gauge, GitFork, HardHat, History, KeyRound, LayoutDashboard, ListOrdered, Network, RadioReceiver, ReceiptText, Router, ScrollText, Send, Settings2, ShieldCheck, Siren, SlidersHorizontal, Tags, UserCircle, Users, WalletCards, Wrench, Zap } from '@lucide/vue'

interface NavItem { name: string; path: string; title: string; permission?: string; icon: Component }
interface NavGroup { key: string; label: string; icon: Component; items?: NavItem[]; sections?: Array<{ label: string; items: NavItem[] }> }

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const openGroups = ref<string[]>(['deviceArchive', 'energy', 'alarm', 'billing', 'ops', 'system'])
const record = (name: string) => routeRecords.find((item) => item.name === name)
const navIcons: Record<string, Component> = {
  dashboard: LayoutDashboard,
  'device-archive-org-tree': Network,
  'device-archive-devices': Gauge,
  'monitor-realtime': Activity,
  'analysis-history': History,
  'analysis-quality': BarChart3,
  'alarms-events': Bell,
  'alarms-workbench': ClipboardCheck,
  'billing-settlement': ReceiptText,
  'billing-bills': FileText,
  'access-diagnostic': RadioReceiver,
  'access-control': SlidersHorizontal,
  'access-commands': Send,
  'archive-orgs': Building2,
  'archive-gateways': Router,
  'archive-devices': Cpu,
  'archive-device-types': Tags,
  'archive-point-definitions': Crosshair,
  'archive-point-mappings': Cable,
  'alarms-rules': BadgeCheck,
  'billing-accounts': WalletCards,
  'billing-rules': ScrollText,
  'billing-rule-scopes': GitFork,
  'billing-price-items': ListOrdered,
  'system-users': Users,
  'system-roles': ShieldCheck,
  'system-permissions': KeyRound,
  'system-rbac-workbench': Wrench,
  'system-user-org-bindings': Building2,
  'system-audit': FileClock,
  profile: UserCircle,
}
const groupIcons: Record<string, Component> = {
  dashboard: Compass,
  deviceArchive: Archive,
  energy: Zap,
  alarm: Siren,
  billing: CircleDollarSign,
  ops: HardHat,
  system: Settings2,
  profile: Boxes,
}
const item = (name: string): NavItem => {
  const current = record(name)
  return { name, path: String(current?.path || '/dashboard'), title: String(current?.meta?.title || name), permission: current?.meta?.permission as string | undefined, icon: navIcons[name] || ChartNoAxesCombined }
}
const nav = computed<NavGroup[]>(() => [
  { key: 'dashboard', label: '经营总览', icon: groupIcons.dashboard, items: [item('dashboard')] },
  { key: 'deviceArchive', label: '设备档案', icon: groupIcons.deviceArchive, items: [item('device-archive-org-tree'), item('device-archive-devices')] },
  { key: 'energy', label: '能源运营', icon: groupIcons.energy, items: [item('monitor-realtime'), item('analysis-history'), item('analysis-quality')] },
  { key: 'alarm', label: '告警处置', icon: groupIcons.alarm, items: [item('alarms-events'), item('alarms-workbench')] },
  { key: 'billing', label: '结算收款', icon: groupIcons.billing, items: [item('billing-settlement'), item('billing-bills')] },
  { key: 'ops', label: '设备运维', icon: groupIcons.ops, items: [item('access-diagnostic'), item('access-control'), item('access-commands')] },
  { key: 'system', label: '系统管理', icon: groupIcons.system, sections: [
    { label: '基础档案', items: [item('archive-orgs'), item('archive-gateways'), item('archive-devices'), item('archive-device-types'), item('archive-point-definitions'), item('archive-point-mappings')] },
    { label: '业务参数配置', items: [item('alarms-rules'), item('billing-accounts'), item('billing-rules'), item('billing-rule-scopes'), item('billing-price-items')] },
    { label: '权限与审计', items: [item('system-users'), item('system-roles'), item('system-permissions'), item('system-rbac-workbench'), item('system-user-org-bindings'), item('system-audit')] },
  ] },
  { key: 'profile', label: '个人中心', icon: groupIcons.profile, items: [item('profile')] },
])
const visible = (entry: NavItem) => session.can(entry.permission)
const toggle = (key: string) => { openGroups.value = openGroups.value.includes(key) ? openGroups.value.filter((item) => item !== key) : [...openGroups.value, key] }
async function leave() { await session.signOut(); await router.push('/login') }
</script>

<template>
  <div class="admin-shell">
    <aside class="side">
      <div class="brand"><i></i><span>智园能管<small>ENERGY PLATFORM</small></span></div>
      <nav class="side-nav">
        <section v-for="group in nav" :key="group.key" class="nav-group" :class="{ 'is-simple': group.items && group.items.length === 1 }">
          <button v-if="!group.items || group.items.length !== 1" class="nav-group-toggle" type="button" :aria-expanded="openGroups.includes(group.key)" @click="toggle(group.key)"><span class="nav-group-label"><component :is="group.icon" class="nav-icon" :size="15" />{{ group.label }}</span><i>{{ openGroups.includes(group.key) ? '⌃' : '⌄' }}</i></button>
          <p v-else class="nav-group-label"><component :is="group.icon" class="nav-icon" :size="14" />{{ group.label }}</p>
          <div v-if="openGroups.includes(group.key) || (group.items && group.items.length === 1)" class="nav-group-body">
            <template v-if="group.items"><RouterLink v-for="entry in group.items.filter(visible)" :key="entry.name" :to="entry.path" class="nav-item"><component :is="entry.icon" class="nav-icon" :size="15" /><span>{{ entry.title }}</span></RouterLink></template>
            <template v-else><section v-for="section in group.sections" :key="section.label" class="nav-subgroup"><p>{{ section.label }}</p><RouterLink v-for="entry in section.items.filter(visible)" :key="entry.name" :to="entry.path" class="nav-item"><component :is="entry.icon" class="nav-icon" :size="15" /><span>{{ entry.title }}</span></RouterLink></section></template>
          </div>
        </section>
      </nav>
      <div class="side-foot"><b>● 会话有效</b><span>ORG_SCOPE / 当前授权范围</span></div>
    </aside>
    <div class="main-frame"><header class="topbar"><div class="crumb">运营工作台 <b>/ {{ route.meta.title }}</b></div><div class="top-actions"><span>{{ session.user?.nickname || session.user?.username || '当前用户' }}</span><button class="quiet" @click="leave">退出</button></div></header><nav class="tabs"><RouterLink to="/dashboard">经营总览</RouterLink><RouterLink v-if="session.can('archive:list')" to="/archive/devices">设备管理</RouterLink><RouterLink v-if="session.can('billing:bill:list')" to="/billing/bills">账单中心</RouterLink></nav><main class="workspace"><RouterView /></main></div>
  </div>
</template>
