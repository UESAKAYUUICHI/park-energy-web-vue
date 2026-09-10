import type { LocationQuery, RouteRecordRaw } from 'vue-router'

const componentFor = (kind: string) => {
  if (kind === 'dashboard') return () => import('@/views/DashboardView.vue')
  if (kind === 'energy-screen') return () => import('@/views/EnergyScreenView.vue')
  if (kind === 'device-archive') return () => import('@/views/DeviceArchiveView.vue')
  if (kind === 'product-catalog') return () => import('@/views/ProductCatalogView.vue')
  if (kind === 'global-dictionary') return () => import('@/views/GlobalDictionaryView.vue')
  if (kind === 'resource') return () => import('@/views/ResourceView.vue')
  if (['monitor', 'analysis', 'quality'].includes(kind)) return () => import('@/views/EnergyView.vue')
  if (kind === 'power-efficiency') return () => import('@/views/PowerEfficiencyView.vue')
  if (kind === 'edge-config') return () => import('@/views/EdgeConfigView.vue')
  if (['alarms', 'alarm-workbench', 'alarm-rules'].includes(kind)) return () => import('@/views/AlarmView.vue')
  if (kind === 'tariff') return () => import('@/views/TariffPlanView.vue')
  if (kind === 'data-quality') return () => import('@/views/DataQualityView.vue')
  if (kind === 'operations') return () => import('@/views/OperationsView.vue')
  if (['access', 'control', 'commands'].includes(kind)) return () => import('@/views/AccessView.vue')
  if (kind === 'rbac-workbench') return () => import('@/views/RbacWorkbenchView.vue')
  if (kind === 'user-org-binding') return () => import('@/views/UserOrgBindingView.vue')
  if (kind === 'tenant-management') return () => import('@/views/TenantManagementView.vue')
  if (kind === 'personal-center') return () => import('@/views/PersonalCenterView.vue')
  if (kind === 'billing-erp-overview') return () => import('@/views/BillingOverviewWorkspaceView.vue')
  if (kind === 'billing-rules-workspace') return () => import('@/views/BillingRulesWorkspaceView.vue')
  if (kind === 'billing-payment-workspace') return () => import('@/views/BillingPaymentWorkspaceView.vue')
  if (kind === 'billing-archive-workspace') return () => import('@/views/BillingArchiveWorkspaceView.vue')
  return () => import('@/views/SystemView.vue')
}
const page = (path: string, name: string, title: string, permission: string | undefined, kind: string, resource?: string): RouteRecordRaw => ({ path, name, component: componentFor(kind), meta: { title, permission, kind, resource } })
const workbenchRedirect = (path: string, view: string) => (to: { query: LocationQuery }) => ({ path, query: { ...to.query, view } })
export const routeRecords: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  page('/dashboard', 'dashboard', '数据总览', undefined, 'dashboard'),
  page('/energy-screen', 'energy-screen', '园区能源大屏', undefined, 'energy-screen'),
  page('/device-archive/org-tree', 'device-archive-org-tree', '组织档案树', 'archive:list', 'device-archive', 'org-tree'), page('/device-archive/devices', 'device-archive-devices', '设备档案', 'archive:list', 'device-archive', 'devices'), page('/device-archive/devices/:id', 'device-archive-device-detail', '设备详情', 'archive:list', 'device-archive', 'device-detail'),
  page('/archive/catalog', 'product-catalog', '产品目录', 'archive:list', 'product-catalog'),
  page('/archive/global-attributes', 'global-attributes', '全域属性', 'archive:list', 'global-dictionary', 'global-attributes'), page('/archive/global-points', 'global-points', '终端点位', 'archive:list', 'global-dictionary', 'global-points'),
  page('/archive/orgs', 'archive-orgs', '组织管理', 'archive:list', 'resource', 'orgs'), page('/archive/spaces', 'archive-spaces', '空间台账', 'archive:list', 'resource', 'spaces'), page('/archive/gateways', 'archive-gateways', '网关管理', 'archive:list', 'resource', 'gateways'), page('/archive/devices', 'archive-devices', '设备管理', 'archive:list', 'resource', 'devices'), page('/archive/device-types', 'archive-device-types', '设备类型', 'archive:list', 'resource', 'device-types'), page('/archive/point-definitions', 'archive-point-definitions', '测点定义', 'archive:list', 'resource', 'point-definitions'), page('/archive/point-mappings', 'archive-point-mappings', '协议映射', 'archive:list', 'resource', 'point-mappings'),
  page('/power-efficiency', 'power-efficiency', '电力能效', 'energy:view', 'power-efficiency'),
  { path: '/monitor/realtime', redirect: '/power-efficiency' }, { path: '/analysis/history', redirect: '/power-efficiency?tab=history' }, { path: '/analysis/quality', redirect: '/power-efficiency?tab=statistics' }, { path: '/analysis/data-quality', redirect: '/power-efficiency?tab=quality' },
  page('/alarms/events', 'alarms-events', '告警工作台', 'alarm:rule:list', 'alarms'),
  { path: '/alarms/workbench', redirect: '/alarms/events' },
  page('/alarms/rules', 'alarms-rules', '告警自动化策略', 'alarm:rule:list', 'alarm-rules'),
  page('/billing/overview', 'billing-overview', '业务总览', 'billing:list', 'billing-erp-overview'),
  page('/billing/rules', 'billing-rules-workspace', '结算规则', 'billing:list', 'billing-rules-workspace'),
  page('/billing/payments', 'billing-payment-workspace', '账单支付', 'billing:list', 'billing-payment-workspace'),
  page('/billing/archives', 'billing-archive-workspace', '结算档案', 'billing:list', 'billing-archive-workspace'),
  { path: '/billing/admission', redirect: '/billing/rules' },
  { path: '/billing/schemes', redirect: '/billing/rules?tab=pricing' },
  { path: '/billing/jobs', redirect: '/billing/payments' },
  { path: '/billing/closing', redirect: '/billing/archives' },
  { path: '/billing/subjects', redirect: '/billing/admission' },
  { path: '/billing/pricing', redirect: '/billing/schemes' },
  { path: '/billing/receivables', redirect: '/billing/jobs' },
  { path: '/billing/finance', redirect: '/billing/closing' },
  { path: '/billing/settlement', redirect: workbenchRedirect('/billing/jobs', 'settlement') },
  { path: '/billing/bills', redirect: workbenchRedirect('/billing/jobs', 'bills') },
  { path: '/billing/batches', redirect: workbenchRedirect('/billing/jobs', 'batches') },
  { path: '/billing/collections', redirect: workbenchRedirect('/billing/jobs', 'collections') },
  { path: '/billing/adjustments', redirect: workbenchRedirect('/billing/jobs', 'adjustments') },
  { path: '/billing/metering', redirect: workbenchRedirect('/billing/schemes', 'metering') },
  { path: '/billing/tariffs', redirect: workbenchRedirect('/billing/schemes', 'tariffs') },
  { path: '/billing/contracts', redirect: workbenchRedirect('/billing/admission', 'contracts') },
  { path: '/billing/tenants', redirect: workbenchRedirect('/billing/admission', 'tenants') },
  { path: '/billing/accounts', redirect: workbenchRedirect('/billing/admission', 'accounts') },
  { path: '/billing/rule-config', redirect: workbenchRedirect('/billing/rules', 'rules') },
  { path: '/billing/rule-scopes', redirect: workbenchRedirect('/billing/schemes', 'rule-scopes') },
  { path: '/billing/price-items', redirect: workbenchRedirect('/billing/schemes', 'price-items') },
  { path: '/billing/periods', redirect: workbenchRedirect('/billing/closing', 'periods') },
  page('/access/diagnostic', 'access-diagnostic', '接入诊断', 'access:view', 'access'), page('/access/edge-config', 'edge-config', '采集配置', 'archive:list', 'edge-config'), page('/access/control', 'access-control', '设备控制台', 'access:command', 'control'), page('/access/commands', 'access-commands', '指令追踪', 'access:view', 'commands'),
  page('/operations/work-orders', 'operations-work-orders', '运维工作台', 'ops:workorder:list', 'operations', 'work-orders'),
  { path: '/operations/inspections', redirect: { path: '/operations/work-orders', query: { view: 'inspections' } } },
  page('/system/users', 'system-users', '用户管理', 'system:user:list', 'users'), page('/system/tenants', 'system-tenants', '租户管理', 'system:user:list', 'tenant-management'), page('/system/roles', 'system-roles', '角色管理', 'system:role:list', 'roles'), page('/system/permissions', 'system-permissions', '权限字典', 'system:permission:list', 'permissions'), page('/system/rbac-workbench', 'system-rbac-workbench', '模块权限分配', 'system:role:list', 'rbac-workbench'), page('/system/user-org-bindings', 'system-user-org-bindings', '用户组织绑定', 'system:user:scope:list', 'user-org-binding'), page('/system/audit', 'system-audit', '操作审计', 'system:operation:list', 'audit'), page('/account/profile', 'personal-center', '个人中心', undefined, 'personal-center'), { path: '/profile', redirect: '/account/profile' },
  { path: '/403', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue'), meta: { title: '无访问权限' } }, { path: '/', redirect: '/dashboard' }, { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]
