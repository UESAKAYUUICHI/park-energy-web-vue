import type { RouteRecordRaw } from 'vue-router'

const componentFor = (kind: string) => {
  if (kind === 'dashboard') return () => import('@/views/DashboardView.vue')
  if (kind === 'device-archive') return () => import('@/views/DeviceArchiveView.vue')
  if (kind === 'product-catalog') return () => import('@/views/ProductCatalogView.vue')
  if (kind === 'global-dictionary') return () => import('@/views/GlobalDictionaryView.vue')
  if (kind === 'resource') return () => import('@/views/ResourceView.vue')
  if (['monitor', 'analysis', 'quality'].includes(kind)) return () => import('@/views/EnergyView.vue')
  if (['alarms', 'alarm-workbench', 'alarm-rules'].includes(kind)) return () => import('@/views/AlarmView.vue')
  if (['settlement', 'bills'].includes(kind)) return () => import('@/views/BillingView.vue')
  if (kind === 'tariff') return () => import('@/views/TariffPlanView.vue')
  if (kind === 'contracts') return () => import('@/views/TenantContractView.vue')
  if (kind === 'batches') return () => import('@/views/BillingBatchView.vue')
  if (kind === 'collections') return () => import('@/views/BillingCollectionView.vue')
  if (kind === 'adjustments') return () => import('@/views/BillingAdjustmentView.vue')
  if (kind === 'metering') return () => import('@/views/MeteringView.vue')
  if (kind === 'data-quality') return () => import('@/views/DataQualityView.vue')
  if (kind === 'operations') return () => import('@/views/OperationsView.vue')
  if (['access', 'control', 'commands'].includes(kind)) return () => import('@/views/AccessView.vue')
  if (kind === 'rbac-workbench') return () => import('@/views/RbacWorkbenchView.vue')
  if (kind === 'user-org-binding') return () => import('@/views/UserOrgBindingView.vue')
  return () => import('@/views/SystemView.vue')
}
const page = (path: string, name: string, title: string, permission: string | undefined, kind: string, resource?: string): RouteRecordRaw => ({ path, name, component: componentFor(kind), meta: { title, permission, kind, resource } })
export const routeRecords: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录' } },
  page('/dashboard', 'dashboard', '数据总览', undefined, 'dashboard'),
  page('/device-archive/org-tree', 'device-archive-org-tree', '组织档案树', 'archive:list', 'device-archive', 'org-tree'), page('/device-archive/devices', 'device-archive-devices', '设备档案', 'archive:list', 'device-archive', 'devices'), page('/device-archive/devices/:id', 'device-archive-device-detail', '设备详情', 'archive:list', 'device-archive', 'device-detail'),
  page('/archive/catalog', 'product-catalog', '产品目录', 'archive:list', 'product-catalog'),
  page('/archive/global-attributes', 'global-attributes', '全域属性', 'archive:list', 'global-dictionary', 'global-attributes'), page('/archive/global-points', 'global-points', '终端点位', 'archive:list', 'global-dictionary', 'global-points'),
  page('/archive/orgs', 'archive-orgs', '组织管理', 'archive:list', 'resource', 'orgs'), page('/archive/spaces', 'archive-spaces', '空间台账', 'archive:list', 'resource', 'spaces'), page('/archive/gateways', 'archive-gateways', '网关管理', 'archive:list', 'resource', 'gateways'), page('/archive/devices', 'archive-devices', '设备管理', 'archive:list', 'resource', 'devices'), page('/archive/device-types', 'archive-device-types', '设备类型', 'archive:list', 'resource', 'device-types'), page('/archive/point-definitions', 'archive-point-definitions', '测点定义', 'archive:list', 'resource', 'point-definitions'), page('/archive/point-mappings', 'archive-point-mappings', '协议映射', 'archive:list', 'resource', 'point-mappings'),
  page('/monitor/realtime', 'monitor-realtime', '实时监控工作台', 'energy:view', 'monitor'), page('/analysis/history', 'analysis-history', '历史数据分析', 'energy:view', 'analysis'), page('/analysis/quality', 'analysis-quality', '能耗统计与数据质量', 'energy:view', 'quality'), page('/analysis/data-quality', 'data-quality', '采集质量中心', 'energy:quality:list', 'data-quality'),
  page('/alarms/events', 'alarms-events', '告警事件中心', 'alarm:rule:list', 'alarms'), page('/alarms/workbench', 'alarms-workbench', '告警处置台', 'alarm:rule:list', 'alarm-workbench'),
  page('/alarms/rules', 'alarms-rules', '告警规则配置', 'alarm:rule:list', 'alarm-rules'),
  page('/billing/settlement', 'billing-settlement', '结算工作台', 'billing:list', 'settlement'), page('/billing/bills', 'billing-bills', '账单中心', 'billing:bill:list', 'bills'), page('/billing/batches', 'billing-batches', '出账批次', 'billing:batch:list', 'batches'), page('/billing/collections', 'billing-collections', '催缴中心', 'billing:collection:list', 'collections'), page('/billing/adjustments', 'billing-adjustments', '账单调整单', 'billing:adjustment:list', 'adjustments'), page('/billing/metering', 'billing-metering', '计量变更与人工抄表', 'billing:metering:list', 'metering'), page('/billing/tariffs', 'billing-tariffs', '园区分时电价', 'billing:tariff:list', 'tariff'), page('/billing/contracts', 'billing-contracts', '租户合同', 'billing:contract:list', 'contracts'), page('/billing/tenants', 'billing-tenants', '租户档案', 'billing:list', 'resource', 'billing:tenants'), page('/billing/accounts', 'billing-accounts', '计费账户', 'billing:list', 'resource', 'billing:accounts'), page('/billing/rules', 'billing-rules', '计费规则', 'billing:list', 'resource', 'billing:rules'), page('/billing/rule-scopes', 'billing-rule-scopes', '规则适用范围', 'billing:list', 'resource', 'billing:rule-scopes'), page('/billing/price-items', 'billing-price-items', '阶梯价格明细', 'billing:list', 'resource', 'billing:price-items'),
  page('/access/diagnostic', 'access-diagnostic', '接入诊断', 'access:view', 'access'), page('/access/control', 'access-control', '设备控制台', 'access:command', 'control'), page('/access/commands', 'access-commands', '指令追踪', 'access:view', 'commands'),
  page('/operations/work-orders', 'operations-work-orders', '运维工单', 'ops:workorder:list', 'operations', 'work-orders'), page('/operations/inspections', 'operations-inspections', '巡检计划与任务', 'ops:inspection:list', 'operations', 'inspections'),
  page('/system/users', 'system-users', '用户管理', 'system:user:list', 'users'), page('/system/roles', 'system-roles', '角色管理', 'system:role:list', 'roles'), page('/system/permissions', 'system-permissions', '权限字典', 'system:permission:list', 'permissions'), page('/system/rbac-workbench', 'system-rbac-workbench', '模块权限分配', 'system:role:list', 'rbac-workbench'), page('/system/user-org-bindings', 'system-user-org-bindings', '用户组织绑定', 'system:user:scope:list', 'user-org-binding'), page('/system/audit', 'system-audit', '操作审计', 'system:operation:list', 'audit'), page('/profile', 'profile', '个人中心', undefined, 'profile'),
  { path: '/403', name: 'forbidden', component: () => import('@/views/ForbiddenView.vue'), meta: { title: '无访问权限' } }, { path: '/', redirect: '/dashboard' }, { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]
