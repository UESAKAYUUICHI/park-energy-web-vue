<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { routeRecords } from '@/router/routes'
import { useSessionStore } from '@/stores/session'
import { Activity, Archive, BadgeCheck, BarChart3, Bell, Boxes, Building2, Cable, ChartNoAxesCombined, CircleDollarSign, ClipboardCheck, Compass, Cpu, Crosshair, FileCheck2, FileClock, FileText, Gauge, GitFork, HardHat, History, KeyRound, LayoutDashboard, ListOrdered, LogOut, Menu, Network, RadioReceiver, ReceiptText, Router, ScrollText, Send, Settings2, ShieldCheck, Siren, SlidersHorizontal, Tags, UserCircle, Users, WalletCards, Wrench, Zap } from '@lucide/vue'

interface NavItem { name: string; path: string; title: string; permission?: string; icon: Component }
interface NavGroup { key: string; label: string; icon: Component; items?: NavItem[]; sections?: Array<{ label: string; items: NavItem[] }>; forceCollapsible?: boolean }

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
const sideNav = ref<HTMLElement | null>(null)
const activeNavStyle = ref<Record<string, string>>({ opacity: '0' })
const mobileNavOpen = ref(false)
watch(openGroups, (value) => localStorage.setItem(navStateKey, JSON.stringify(value)), { deep: true })
const isAdmin = computed(() => session.permissions.includes('*') || session.roles.includes('super_admin'))
const record = (name: string) => routeRecords.find((item) => item.name === name)
const navIcons: Record<string, Component> = {
  dashboard: LayoutDashboard,
  'energy-screen': Gauge,
  'device-archive-org-tree': Network,
  'device-archive-devices': Gauge,
  'product-catalog': Boxes,
  'global-attributes': Tags,
  'global-points': Crosshair,
  'power-efficiency': BarChart3,
  'alarms-events': Bell,
  'billing-settlement': ReceiptText,
  'billing-subjects': Users,
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
  'billing-pricing': SlidersHorizontal,
  'billing-receivables': ReceiptText,
  'billing-finance': WalletCards,
  'billing-overview': LayoutDashboard,
  'billing-rules-workspace': ClipboardCheck,
  'billing-payment-workspace': ReceiptText,
  'billing-archive-workspace': FileCheck2,
  'access-diagnostic': RadioReceiver,
  'edge-config': Cable,
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
  'system-users': Users,
  'system-tenants': Users,
  'system-roles': ShieldCheck,
  'system-permissions': KeyRound,
  'system-rbac-workbench': Wrench,
  'system-user-org-bindings': Building2,
  'system-audit': FileClock,
}
const groupIcons: Record<string, Component> = {
  dashboard: Compass,
  assets: Archive,
  efficiency: BarChart3,
  operations: Wrench,
  access: RadioReceiver,
  revenue: CircleDollarSign,
  system: Settings2,
}
const groupIcon = (key: string): Component => groupIcons[key] || Boxes
const item = (name: string): NavItem => {
  const current = record(name)
  return { name, path: String(current?.path || '/dashboard'), title: String(current?.meta?.title || name), permission: current?.meta?.permission as string | undefined, icon: navIcons[name] || ChartNoAxesCombined }
}
const nav = computed<NavGroup[]>((): NavGroup[] => [
  { key: 'dashboard', label: '数据总览', icon: groupIcon('dashboard'), items: [item('dashboard'), item('energy-screen')] },
  { key: 'assets', label: '组织和资产', icon: groupIcon('assets'), items: [item('device-archive-org-tree'), item('device-archive-devices'), item('product-catalog'), item('global-attributes'), item('global-points')] },
  { key: 'efficiency', label: '能效与分析', icon: groupIcon('efficiency'), items: [item('power-efficiency')], forceCollapsible: true },
  { key: 'operations', label: '告警与运维', icon: groupIcon('operations'), items: [item('alarms-events'), item('operations-work-orders'), item('alarms-rules')] },
  { key: 'access', label: '设备接入', icon: groupIcon('access'), items: [item('access-diagnostic'), item('edge-config'), item('access-control'), item('access-commands')] },
  { key: 'billing', label: '结算与财务', icon: groupIcon('revenue'), items: [item('billing-overview'), item('billing-rules-workspace'), item('billing-payment-workspace'), item('billing-archive-workspace')] },
  { key: 'system', label: '系统治理', icon: groupIcon('system'), sections: [
    { label: '基础档案', items: [item('archive-orgs'), item('archive-spaces'), item('archive-gateways'), item('archive-devices'), item('archive-device-types'), item('archive-point-definitions'), item('archive-point-mappings')] },
    { label: '权限与审计', items: isAdmin.value ? [item('system-users'), item('system-tenants'), item('system-roles'), item('system-permissions'), item('system-rbac-workbench'), item('system-user-org-bindings'), item('system-audit')] : [item('system-rbac-workbench'), item('system-audit')] },
  ] },
])
const visible = (entry: NavItem) => session.can(entry.permission)
const isSimpleGroup = (group: NavGroup) => Boolean(group.items && group.items.length === 1 && !group.forceCollapsible)
const fixedWorkspace = computed(() => route.name === 'power-efficiency' || route.name === 'energy-screen' || (String(route.path).startsWith('/billing/') && route.path !== '/billing/overview'))
const mobileTabs = computed(() => [
  item('dashboard'),
  item('device-archive-org-tree'),
  item('operations-work-orders'),
  item('billing-overview'),
])
const toggle = (key: string) => { openGroups.value = openGroups.value.includes(key) ? openGroups.value.filter((item) => item !== key) : [...openGroups.value, key] }
const closeMobileNav = () => { mobileNavOpen.value = false }
const navigateMobile = async (entry: NavItem) => {
  closeMobileNav()
  await router.push(entry.path)
}
async function syncActiveNavIndicator() {
  await nextTick()
  const root = sideNav.value
  const active = root?.querySelector<HTMLElement>('.nav-item.router-link-active')
  if (!root || !active) {
    activeNavStyle.value = { opacity: '0' }
    return
  }
  const rootRect = root.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  activeNavStyle.value = {
    opacity: '1',
    width: `${activeRect.width}px`,
    height: `${activeRect.height}px`,
    transform: `translate(${activeRect.left - rootRect.left}px, ${activeRect.top - rootRect.top + root.scrollTop}px)`,
  }
}
watch(() => route.fullPath, () => { closeMobileNav(); void syncActiveNavIndicator() }, { flush: 'post' })
watch(openGroups, () => { void syncActiveNavIndicator() }, { deep: true, flush: 'post' })
onMounted(() => { window.addEventListener('resize', syncActiveNavIndicator); void syncActiveNavIndicator() })
onBeforeUnmount(() => window.removeEventListener('resize', syncActiveNavIndicator))
async function leave() {
  try {
    await session.signOut()
  } finally {
    await router.replace('/login')
  }
}
</script>

<template>
  <div class="admin-shell" :class="{ 'is-energy-screen': route.name === 'energy-screen' }">
    <button class="mobile-nav-backdrop" :class="{ open: mobileNavOpen }" aria-label="关闭菜单" @click="closeMobileNav"></button>
    <aside class="side" :class="{ 'is-mobile-open': mobileNavOpen }">
      <div class="brand"><i></i><span>智园能管<small>ENERGY PLATFORM</small></span></div>
      <nav ref="sideNav" class="side-nav" @scroll="syncActiveNavIndicator">
        <i class="nav-active-indicator" :style="activeNavStyle" aria-hidden="true"></i>
        <section v-for="group in nav" :key="group.key" class="nav-group" :class="{ 'is-simple': isSimpleGroup(group) }">
          <button v-if="!isSimpleGroup(group)" class="nav-group-toggle" type="button" :aria-expanded="openGroups.includes(group.key)" @click="toggle(group.key)"><span class="nav-group-label"><component :is="group.icon" class="nav-icon" :size="15" />{{ group.label }}</span><i>{{ openGroups.includes(group.key) ? '⌃' : '⌄' }}</i></button>
          <p v-else class="nav-group-label"><component :is="group.icon" class="nav-icon" :size="14" />{{ group.label }}</p>
          <transition name="nav-collapse">
            <div v-if="openGroups.includes(group.key) || isSimpleGroup(group)" class="nav-group-body">
              <template v-if="group.items"><RouterLink v-for="entry in group.items.filter(visible)" :key="entry.name" :to="entry.path" class="nav-item" @click="closeMobileNav"><component :is="entry.icon" class="nav-icon" :size="15" /><span>{{ entry.title }}</span></RouterLink></template>
              <template v-else><section v-for="section in (group.sections || []).filter((section) => section.items.some(visible))" :key="section.label" class="nav-subgroup"><p>{{ section.label }}</p><RouterLink v-for="entry in section.items.filter(visible)" :key="entry.name" :to="entry.path" class="nav-item" @click="closeMobileNav"><component :is="entry.icon" class="nav-icon" :size="15" /><span>{{ entry.title }}</span></RouterLink></section></template>
            </div>
          </transition>
        </section>
      </nav>
      <div class="side-foot"><b>● 会话有效</b><span>ORG_SCOPE / 当前授权范围</span></div>
    </aside>
    <div class="main-frame"><header class="topbar"><button class="mobile-menu-trigger" type="button" aria-label="打开菜单" @click="mobileNavOpen = true"><Menu :size="20" /></button><div class="crumb">智园能管 <b>/ {{ route.meta.title }}</b></div><div class="top-actions"><button class="user-pill" type="button" title="进入个人中心" @click="router.push('/account/profile')"><UserCircle :size="15" />{{ session.user?.nickname || session.user?.username || '当前用户' }}</button><button class="logout-icon" title="退出登录" aria-label="退出登录" @click="leave"><LogOut :size="16" /></button></div></header><main class="workspace" :class="{ 'workspace-fixed': fixedWorkspace }"><RouterView v-slot="{ Component, route: viewRoute }"><Transition name="page-motion" mode="out-in" appear><component :is="Component" :key="viewRoute.fullPath" /></Transition></RouterView></main><nav class="mobile-tabbar" aria-label="主要导航"><button v-for="entry in mobileTabs" :key="entry.name" type="button" :class="{ active: route.path === entry.path }" @click="navigateMobile(entry)"><component :is="entry.icon" :size="19" /><span>{{ entry.title }}</span></button><button type="button" :class="{ active: mobileNavOpen }" @click="mobileNavOpen = true"><Menu :size="19" /><span>更多</span></button></nav></div>
  </div>
</template>
