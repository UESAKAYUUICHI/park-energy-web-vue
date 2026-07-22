import type { RouteRecordRaw } from 'vue-router'

const componentFor = (kind: string) => {
  if (kind === 'dashboard') return () => import('@/views/DashboardView.vue')
  if (kind === 'resource') return () => import('@/views/ResourceView.vue')
  if (['monitor', 'analysis', 'quality'].includes(kind)) return () => import('@/views/EnergyView.vue')
  if (['alarms', 'alarm-workbench', 'alarm-rules'].includes(kind)) return () => import('@/views/AlarmView.vue')
  if (['settlement', 'bills'].includes(kind)) return () => import('@/views/BillingView.vue')
  if (['access', 'control', 'commands'].includes(kind)) return () => import('@/views/AccessView.vue')
  return () => import('@/views/SystemView.vue')
}
const page = (path: string, name: string, title: string, permission: string | undefined, kind: string, resource?: string): RouteRecordRaw => ({ path, name, component: componentFor(kind), meta: { title, permission, kind, resource } })
export const routeRecords: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  page('/dashboard', 'dashboard', '经营总览', 'dashboard:view', 'dashboard'),
  page('/archive/orgs', 'archive-orgs', '组织管理', 'archive:list', 'resource', 'orgs'), page('/archive/gateways', 'archive-gateways', '网关管理', 'archive:list', 'resource', 'gateways'), page('/archive/devices', 'archive-devices', '设备管理', 'archive:list', 'resource', 'devices'), page('/archive/device-types', 'archive-device-types', '设备类型', 'archive:list', 'resource', 'device-types'), page('/archive/point-definitions', 'archive-point-definitions', '测点定义', 'archive:list', 'resource', 'point-definitions'), page('/archive/point-mappings', 'archive-point-mappings', '协议映射', 'archive:list', 'resource', 'point-mappings'),
  page('/monitor/realtime', 'monitor-realtime', '实时监控工作台', 'energy:view', 'monitor'), page('/analysis/history', 'analysis-history', '历史数据分析', 'energy:view', 'analysis'), page('/analysis/quality', 'analysis-quality', '能耗统计与数据质量', 'energy:view', 'quality'),
  page('/alarms/events', 'alarms-events', '告警事件中心', 'alarm:rule:list', 'alarms'), page('/alarms/workbench', 'alarms-workbench', '告警处置台', 'alarm:rule:list', 'alarm-workbench'),
  page('/alarms/rules', 'alarms-rules', '告警规则配置', 'alarm:rule:list', 'alarm-rules'),
  page('/billing/settlement', 'billing-settlement', '结算工作台', 'billing:list', 'settlement'), page('/billing/bills', 'billing-bills', '账单中心', 'billing:bill:list', 'bills'), page('/billing/accounts', 'billing-accounts', '计费账户', 'billing:list', 'resource', 'billing:accounts'), page('/billing/rules', 'billing-rules', '计费规则', 'billing:list', 'resource', 'billing:rules'), page('/billing/rule-scopes', 'billing-rule-scopes', '规则适用范围', 'billing:list', 'resource', 'billing:rule-scopes'), page('/billing/price-items', 'billing-price-items', '阶梯价格明细', 'billing:list', 'resource', 'billing:price-items'),
  page('/access/diagnostic', 'access-diagnostic', '接入诊断', 'access:view', 'access'), page('/access/control', 'access-control', '设备控制台', 'access:command', 'control'), page('/access/commands', 'access-commands', '指令追踪', 'access:view', 'commands'),
  page('/system/users', 'system-users', '用户管理', 'system:user:list', 'users'), page('/system/roles', 'system-roles', '角色管理', 'system:role:list', 'roles'), page('/system/permissions', 'system-permissions', '权限字典', 'system:permission:list', 'permissions'), page('/system/audit', 'system-audit', '操作审计', 'system:operation:list', 'audit'), page('/profile', 'profile', '个人中心', undefined, 'profile'),
  { path: '/403', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue'), meta: { title: '无访问权限' } }, { path: '/', redirect: '/dashboard' }, { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]
