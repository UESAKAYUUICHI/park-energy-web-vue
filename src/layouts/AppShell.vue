<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { routeRecords } from '@/router/routes'
import { useSessionStore } from '@/stores/session'
import { Activity, Archive, BadgeCheck, BarChart3, Bell, Boxes, Building2, Cable, ChartNoAxesCombined, CircleDollarSign, ClipboardCheck, Compass, Cpu, Crosshair, FileClock, FileText, Gauge, GitFork, HardHat, History, KeyRound, LayoutDashboard, ListOrdered, LogOut, Network, RadioReceiver, ReceiptText, Router, ScrollText, Send, Settings2, ShieldCheck, Siren, SlidersHorizontal, Tags, UserCircle, Users, WalletCards, Wrench, Zap } from '@lucide/vue'

interface NavItem { name: string; path: string; title: string; permission?: string; icon: Component }
interface NavGroup { key: string; label: string; icon: Component; items?: NavItem[]; sections?: Array<{ label: string; items: NavItem[] }> }

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const navStateKey = 'park-energy.open-nav-groups'
const restoreOpenGroups = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(navStateKey) || '[]')
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}
const openGroups = ref<string[]>(restoreOpenGroups())
watch(openGroups, (value) => localStorage.setItem(navStateKey, JSON.stringify(value)), { deep: true })
const isAdmin = computed(() => session.permissions.includes('*') || session.roles.includes('super_admin'))
const record = (name: string) => routeRecords.find((item) => item.name === name)
const navIcons: Record<string, Component> = {
  dashboard: LayoutDashboard,
  'device-archive-org-tree': Network,
  'device-archive-devices': Gauge,
  'product-catalog': Boxes,
  'global-attributes': Tags,
  'global-points': Crosshair,
  'monitor-realtime': Activity,
  'analysis-history': History,
  'analysis-quality': BarChart3,
  'data-quality': ClipboardCheck,
  'alarms-events': Bell,
  'alarms-workbench': ClipboardCheck,
  'billing-settlement': ReceiptText,
  'billing-bills': FileText,
  'billing-batches': FileClock,
  'billing-collections': WalletCards,
  'billing-adjustments': ReceiptText,
  'billing-metering': Gauge,
  'billing-tariffs': Zap,
  'billing-contracts': FileText,
  'billing-tenants': Users,
  'billing-accounts': WalletCards,
  'billing-rules': Settings2,
  'billing-rule-scopes': GitFork,
  'billing-price-items': ListOrdered,
  'access-diagnostic': RadioReceiver,
  'access-control': SlidersHorizontal,
  'access-commands': Send,
  'archive-orgs': Building2,
  'archive-spaces': Building2,
  'archive-gateways': Router,
  'archive-devices': Cpu,
  'archive-device-types': Tags,
  'archive-point-definitions': Crosshair,
  'archive-point-mappings': Cable,
  'alarms-rules': BadgeCheck,
  'operations-work-orders': Wrench,
  'operations-inspections': ClipboardCheck,
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
  assets: Archive,
  efficiency: BarChart3,
  operations: Wrench,
  revenue: CircleDollarSign,
  system: Settings2,
  profile: Boxes,
}
const groupIcon = (key: string): Component => groupIcons[key] || Boxes
const item = (name: string): NavItem => {
  const current = record(name)
  return { name, path: String(current?.path || '/dashboard'), title: String(current?.meta?.title || name), permission: current?.meta?.permission as string | undefined, icon: navIcons[name] || ChartNoAxesCombined }
}
const nav = computed<NavGroup[]>((): NavGroup[] => [
  { key: 'dashboard', label: '数据总览', icon: groupIcon('dashboard'), items: [item('dashboard')] },
  { key: 'assets', label: '组织和资产', icon: groupIcon('assets'), items: [item('device-archive-org-tree'), item('device-archive-devices'), item('product-catalog'), item('global-attributes'), item('global-points')] },
  { key: 'efficiency', label: '负荷与能效', icon: groupIcon('efficiency'), items: [item('monitor-realtime'), item('analysis-history'), item('analysis-quality'), item('data-quality')] },
  { key: 'operations', label: '告警与运维', icon: groupIcon('operations'), items: [item('alarms-events'), item('alarms-workbench'), item('alarms-rules'), item('operations-work-orders'), item('operations-inspections'), item('access-diagnostic'), item('access-control'), item('access-commands')] },
  { key: 'billing', label: '结算与财务', icon: groupIcon('revenue'), items: [item('billing-settlement'), item('billing-bills'), item('billing-batches'), item('billing-collections'), item('billing-adjustments'), item('billing-metering'), item('billing-tariffs'), item('billing-contracts'), item('archive-spaces'), item('billing-tenants'), item('billing-accounts'), item('billing-rules'), item('billing-rule-scopes'), item('billing-price-items')] },
  { key: 'system', label: '系统治理', icon: groupIcon('system'), items: isAdmin.value ? [item('system-users'), item('system-roles'), item('system-permissions'), item('system-rbac-workbench'), item('system-user-org-bindings'), item('system-audit')] : [item('system-rbac-workbench'), item('system-audit')] },
  { key: 'profile', label: '个人中心', icon: groupIcon('profile'), items: [item('profile')] },
])
const visible = (entry: NavItem) => session.can(entry.permission)
const toggle = (key: string) => { openGroups.value = openGroups.value.includes(key) ? openGroups.value.filter((item) => item !== key) : [...openGroups.value, key] }
async function leave() {
  try {
    await session.signOut()
  } finally {
    await router.replace('/login')
  }
}
</script>

<template>
  <div class="admin-shell">
    <aside class="side">
      <div class="brand"><i></i><span>智园能管<small>ENERGY PLATFORM</small></span></div>
      <nav class="side-nav">
        <section v-for="group in nav" :key="group.key" class="nav-group" :class="{ 'is-simple': group.items && group.items.length === 1 }">
          <button v-if="!group.items || group.items.length !== 1" class="nav-group-toggle" type="button" :aria-expanded="openGroups.includes(group.key)" @click="toggle(group.key)"><span class="nav-group-label"><component :is="group.icon" class="nav-icon" :size="15" />{{ group.label }}</span><i>{{ openGroups.includes(group.key) ? '⌃' : '⌄' }}</i></button>
          <p v-else class="nav-group-label"><component :is="group.icon" class="nav-icon" :size="14" />{{ group.label }}</p>
          <transition name="nav-collapse">
            <div v-if="openGroups.includes(group.key) || (group.items && group.items.length === 1)" class="nav-group-body">
              <template v-if="group.items"><RouterLink v-for="entry in group.items.filter(visible)" :key="entry.name" :to="entry.path" class="nav-item"><component :is="entry.icon" class="nav-icon" :size="15" /><span>{{ entry.title }}</span></RouterLink></template>
              <template v-else><section v-for="section in group.sections" :key="section.label" class="nav-subgroup"><p>{{ section.label }}</p><RouterLink v-for="entry in section.items.filter(visible)" :key="entry.name" :to="entry.path" class="nav-item"><component :is="entry.icon" class="nav-icon" :size="15" /><span>{{ entry.title }}</span></RouterLink></section></template>
            </div>
          </transition>
        </section>
      </nav>
      <div class="side-foot"><b>● 会话有效</b><span>ORG_SCOPE / 当前授权范围</span></div>
    </aside>
    <div class="main-frame"><header class="topbar"><div class="crumb">智园能管 <b>/ {{ route.meta.title }}</b></div><div class="top-actions"><span class="user-pill"><UserCircle :size="15" />{{ session.user?.nickname || session.user?.username || '当前用户' }}</span><button class="logout-icon" title="退出登录" aria-label="退出登录" @click="leave"><LogOut :size="16" /></button></div></header><main class="workspace"><RouterView v-slot="{ Component, route: viewRoute }"><Transition name="page-motion" mode="out-in" appear><component :is="Component" :key="viewRoute.fullPath" /></Transition></RouterView></main></div>
  </div>
</template>
