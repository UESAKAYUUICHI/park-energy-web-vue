<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { useRoute } from 'vue-router'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { ChevronDown, ChevronRight, Eye, GitBranch, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserRoundCog } from '@lucide/vue'
import { audit, listResource, rbac, rbacPage } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'
import { fieldLabel } from '@/utils/fieldLabels'

const route = useRoute()
const session = useSessionStore()
const mode = computed(() => String(route.meta.kind))
const title = computed(() => String(route.meta.title))
const rows = ref<RecordRow[]>([])
const relations = ref<RecordRow>({})
const selected = ref<RecordRow | null>(null)
const keyword = ref('')
const pageNum = ref(1)
const total = ref(0)
const loading = ref(false)
const error = useAlertRef()
const dialog = ref(false)
const editingId = ref<unknown>(null)
const form = reactive<Record<string, string | number>>({})
const relationDialog = ref(false)
const relationTitle = ref('')
const relationTargetId = ref<unknown>(null)
const relationMode = ref<'password' | 'roles' | 'permissions' | 'scopes'>('roles')
const relationText = ref('')
const expandedPermissionIds = ref<Set<string>>(new Set())
const deleteDialog = ref(false)
const deletingRow = ref<RecordRow | null>(null)
const deleting = ref(false)
const orgOptions = ref<RecordRow[]>([])
const relationUsers = ref<RecordRow[]>([])
const relationRoles = ref<RecordRow[]>([])
const relationPermissions = ref<RecordRow[]>([])

const configuration = computed(() => ({ users: { endpoint: 'users', permission: 'system:user', columns: [{ key: 'username', label: '登录名' }, { key: 'nickname', label: '姓名' }, { key: 'orgId', label: '默认组织' }, { key: 'status', label: '状态' }], fields: ['username', 'nickname', 'password', 'orgId', 'phone', 'email', 'status'], defaults: { username: '', nickname: '', password: '', orgId: '', phone: '', email: '', status: 1 } }, roles: { endpoint: 'roles', permission: 'system:role', columns: [{ key: 'roleCode', label: '角色编码' }, { key: 'roleName', label: '角色名称' }, { key: 'dataScope', label: '数据范围' }, { key: 'status', label: '状态' }], fields: ['roleCode', 'roleName', 'dataScope', 'remark', 'status'], defaults: { roleCode: '', roleName: '', dataScope: 1, remark: '', status: 1 } }, permissions: { endpoint: 'permissions', permission: 'system:permission', columns: [{ key: 'permCode', label: '权限码' }, { key: 'permName', label: '权限名称' }, { key: 'permType', label: '类型' }, { key: 'parentId', label: '上级 ID' }, { key: 'sort', label: '排序' }], fields: ['permCode', 'permName', 'permType', 'parentId', 'routePath', 'componentPath', 'icon', 'sort', 'status'], defaults: { permCode: '', permName: '', permType: 3, parentId: 0, routePath: '', componentPath: '', icon: '', sort: 0, status: 1 } } } as Record<string, { endpoint: string; permission: string; columns: Array<{ key: string; label: string }>; fields: string[]; defaults: RecordRow }>)[mode.value])
const canAdd = computed(() => configuration.value && session.can(`${configuration.value.permission}:add`)); const canEdit = computed(() => configuration.value && session.can(`${configuration.value.permission}:edit`)); const canDelete = computed(() => configuration.value && session.can(`${configuration.value.permission}:delete`))
const createLabel = computed(() => `+ 新增${title.value.replace(/管理$/, '')}`)
const pageSize = 20
let keywordTimer: ReturnType<typeof setTimeout> | undefined
let ignoreNextKeywordWatch = false
const normalStatusLabel = (value: unknown): string => Number(value) === 1 ? '正常' : Number(value) === 0 ? '禁用' : String(value ?? '—')
const enableStatusLabel = (value: unknown): string => Number(value) === 1 ? '启用' : Number(value) === 0 ? '停用' : String(value ?? '—')
const auditStatusLabel = (value: unknown): string => Number(value) === 1 ? '成功' : Number(value) === 0 ? '失败' : String(value ?? '—')
function dataScopeLabel(value: unknown): string {
  switch (Number(value)) {
    case 1: return '全部数据'
    case 2: return '本组织及下级'
    case 3: return '本组织'
    case 4: return '仅本人'
    default: return String(value ?? '—')
  }
}
const orgName = (value: unknown): string => {
  const org = orgOptions.value.find((item) => String(item.id) === String(value))
  return org ? String(org.org_name || value) : String(value ?? '—')
}
const userName = (value: unknown): string => {
  const user = relationUsers.value.find((item) => String(item.id) === String(value))
  if (!user && String(value) === currentUserId.value) return String(profileUser.value.nickname || profileUser.value.username || value)
  return user ? String(user.nickname || user.username || value) : String(value ?? '—')
}
const roleName = (value: unknown): string => {
  const role = relationRoles.value.find((item) => String(item.id) === String(value))
  return role ? String(role.roleName || role.role_name || role.roleCode || role.role_code || value) : String(value ?? '—')
}
const permissionName = (value: unknown): string => {
  const permission = relationPermissions.value.find((item) => String(item.id) === String(value))
  return permission ? String(permission.permName || permission.perm_name || permission.permCode || permission.perm_code || value) : String(value ?? '—')
}
function permissionGroupLabel(name: string) {
  const text = name.replace(/^\d+/, '').trim()
  if (text.includes('档案')) return '档案管理'
  if (text.includes('权限') || text.includes('用户') || text.includes('角色')) return '权限管理'
  if (text.includes('告警')) return '告警处置'
  if (text.includes('计费') || text.includes('账单')) return '结算收款'
  if (text.includes('能源') || text.includes('能耗')) return '能源运营'
  if (text.includes('设备') || text.includes('网关') || text.includes('测点') || text.includes('协议')) return '设备档案'
  if (text.includes('总览') || text.includes('首页')) return '经营总览'
  return text.slice(0, 4) || '其他权限'
}
function permissionActionLabel(name: string, group: string) {
  const text = name.replace(/^\d+/, '').replace(group, '').trim()
  return text || group
}
function groupPermissions(names: string[]) {
  const grouped = new Map<string, string[]>()
  names.forEach((name) => {
    const group = permissionGroupLabel(name)
    grouped.set(group, [...(grouped.get(group) || []), permissionActionLabel(name, group)])
  })
  return [...grouped.entries()].slice(0, 4).map(([group, actions]) => ({ group, actions: [...new Set(actions)].slice(0, 3), overflow: Math.max(0, new Set(actions).size - 3) }))
}
const systemFormat = (key: string): TableColumn['format'] | undefined => {
  if (key === 'status') return mode.value === 'users' ? normalStatusLabel : enableStatusLabel
  if (key === 'dataScope' || key === 'data_scope') return dataScopeLabel
  if (key === 'orgId' || key === 'org_id') return orgName
  return undefined
}
const auditFormat = (key: string): TableColumn['format'] | undefined => {
  if (key === 'status') return auditStatusLabel
  if (key === 'dataScope' || key === 'data_scope' || key.endsWith('.dataScope') || key.endsWith('.data_scope')) return dataScopeLabel
  return undefined
}
const auditBaseColumns: TableColumn[] = [
  { key: 'username', label: '操作人' },
  { key: 'module', label: '模块' },
  { key: 'operation', label: '操作' },
  { key: 'method', label: '方法' },
  { key: 'request_url', label: '请求地址' },
  { key: 'status', label: '结果', format: auditStatusLabel },
  { key: 'cost_time', label: '耗时(ms)' },
  { key: 'ip_address', label: 'IP' },
  { key: 'error_msg', label: '错误信息' },
  { key: 'create_time', label: '时间' },
]
const profileColumns: TableColumn[] = [{ key: 'username', label: '操作人' }, { key: 'module', label: '模块' }, { key: 'operation', label: '操作' }, { key: 'status', label: '结果', format: auditStatusLabel }, { key: 'cost_time', label: '耗时(ms)' }, { key: 'create_time', label: '时间' }]
const userRoleRelations = computed(() => Array.isArray(relations.value.userRoles) ? relations.value.userRoles as RecordRow[] : [])
const rolePermissionRelations = computed(() => Array.isArray(relations.value.rolePermissions) ? relations.value.rolePermissions as RecordRow[] : [])
const profileUser = computed(() => session.user || {})
const currentUserId = computed(() => String(profileUser.value.id ?? ''))
const currentRoleBadges = computed(() => session.roles?.length ? session.roles : ['暂无角色'])
const currentPermissionBadges = computed(() => session.permissions?.length ? session.permissions : ['暂无权限'])
const currentOrgScopeBadges = computed(() => session.orgScopes?.length ? session.orgScopes.map((scope) => `${orgName(scope.org_id ?? scope.orgId)} · ${String(scope.scope_mode ?? scope.scopeMode ?? 'SELF').toUpperCase() === 'SUBTREE' ? '含下级' : '仅本组织'}`) : ['暂无组织范围'])
const currentUserRoleRelations = computed(() => userRoleRelations.value.filter((item) => String(item.userId ?? item.user_id) === currentUserId.value))
const currentRoleIds = computed(() => new Set(currentUserRoleRelations.value.map((item) => String(item.roleId ?? item.role_id))))
const currentPermissionIds = computed(() => new Set(rolePermissionRelations.value.filter((item) => currentRoleIds.value.has(String(item.roleId ?? item.role_id))).map((item) => String(item.permissionId ?? item.permission_id))))
const relationStats = computed(() => [
  { label: '用户', value: currentUserId.value ? 1 : '—' },
  { label: '角色', value: currentRoleIds.value.size || currentRoleBadges.value.length || '—' },
  { label: '权限', value: currentPermissionIds.value.size || currentPermissionBadges.value.length || '—' },
  { label: '组织范围', value: Array.isArray(relations.value.userOrgScopes) ? (relations.value.userOrgScopes as RecordRow[]).length : session.orgScopes.length },
])
const roleGraphRows = computed(() => relationRoles.value.filter((role) => currentRoleIds.value.has(String(role.id))).map((role) => {
  const roleId = String(role.id)
  const users = [userName(currentUserId.value)]
  const permissions = rolePermissionRelations.value.filter((item) => String(item.roleId ?? item.role_id) === roleId).map((item) => permissionName(item.permissionId ?? item.permission_id))
  const groups = groupPermissions(permissions)
  return { id: roleId, role: roleName(roleId), users: users.length ? users : ['暂无绑定用户'], permissionGroups: groups.length ? groups : [{ group: '暂无权限', actions: [], overflow: 0 }], overflow: Math.max(0, permissions.length - groups.reduce((sum, group) => sum + group.actions.length, 0)) }
}))
const baseAuditKeys = new Set([...auditBaseColumns.map((column) => column.key), 'request_param', 'requestParam'].map(normalizeKey))
const auditRows = computed(() => rows.value.map((row) => ({ ...row, ...auditJsonFields(row) })))
const auditColumns = computed<TableColumn[]>(() => {
  const keys = new Set<string>()
  auditRows.value.forEach((row) => Object.keys(row).filter((key) => key.startsWith('json:')).forEach((key) => keys.add(key)))
  return [...auditBaseColumns, ...[...keys].map((key) => ({ key, label: fieldLabel(key.slice(5)), format: auditFormat(key.slice(5)) }))]
})
const systemColumns = computed<TableColumn[]>(() => {
  if (!configuration.value) return []
  const labels = new Map<string, string>()
  configuration.value.columns.forEach((column) => labels.set(column.key, column.label))
  configuration.value.fields.forEach((field) => labels.set(field, field))
  const keys = new Set<string>(['id', ...configuration.value.fields, ...configuration.value.columns.map((column) => column.key)])
  rows.value.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)))
  return [...keys].map((key) => ({ key, label: fieldLabel(key, labels.get(key)), format: systemFormat(key) }))
})
const selectedDetailItems = computed(() => selected.value ? Object.entries(selected.value).map(([key, value]) => [fieldLabel(key), displayJsonValue(value) || '—']) : [])
const permissionRows = computed(() => {
  const byParent = new Map<string, RecordRow[]>()
  rows.value.forEach((item) => {
    const parentId = String(item.parentId ?? item.parent_id ?? 0)
    byParent.set(parentId, [...(byParent.get(parentId) || []), item])
  })
  const out: Array<{ item: RecordRow; level: number }> = []
  const walk = (parentId: string, level: number) => (byParent.get(parentId) || []).forEach((item) => {
    out.push({ item, level })
    walk(String(item.id), level + 1)
  })
  walk('0', 0)
  rows.value.filter((item) => !out.some((row) => String(row.item.id) === String(item.id))).forEach((item) => out.push({ item, level: 0 }))
  return out
})
const permissionParentOptions = computed(() => [
  { label: '无', value: 0 },
  ...rows.value
    .filter((item) => String(item.id) !== String(editingId.value ?? ''))
    .map((item) => ({ label: `${String(item.permName || item.perm_name || '未命名权限')} · ${String(item.permCode || item.perm_code || item.id)}`, value: Number(item.id) })),
])
const permissionChildIds = computed(() => new Set(rows.value.map((item) => String(item.parentId ?? item.parent_id ?? 0)).filter((id) => id !== '0' && id !== 'null' && id !== 'undefined')))
const visiblePermissionRows = computed(() => permissionRows.value.filter((entry) => entry.level === 0 || permissionAncestorsOpen(entry.item)))
const pagedPermissionRows = computed(() => visiblePermissionRows.value.slice((pageNum.value - 1) * pageSize, pageNum.value * pageSize))
const displayTotal = computed(() => mode.value === 'permissions' ? visiblePermissionRows.value.length : total.value)
const pageCount = computed(() => Math.max(1, Math.ceil(displayTotal.value / pageSize)))
function normalizeKey(value: string) { return value.replace(/[_\-.]/g, '').toLowerCase() }
function displayJsonValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
function appendJsonField(out: RecordRow, key: string, value: unknown) {
  if (baseAuditKeys.has(normalizeKey(key))) return
  const text = displayJsonValue(value)
  if (!text) return
  const columnKey = `json:${key}`
  const current = out[columnKey]
  if (!current) out[columnKey] = text
  else if (!String(current).split('；').includes(text)) out[columnKey] = `${String(current)}；${text}`
}
function flattenJson(value: unknown, prefix: string, out: RecordRow) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => flattenJson(child, prefix ? `${prefix}.${key}` : key, out))
    return
  }
  appendJsonField(out, prefix, value)
}
function auditJsonFields(row: RecordRow) {
  const out: RecordRow = {}
  const raw = row.request_param ?? row.requestParam
  if (typeof raw !== 'string' || !raw.trim()) return out
  try {
    const parsed = JSON.parse(raw) as unknown
    const args = Array.isArray(parsed) ? parsed : [parsed]
    args.forEach((arg, index) => {
      if (arg && typeof arg === 'object' && !Array.isArray(arg)) flattenJson(arg, '', out)
      else appendJsonField(out, `arg${index + 1}`, arg)
    })
  } catch {
    appendJsonField(out, 'request_param', raw)
  }
  return out
}
function permissionAncestorsOpen(item: RecordRow) {
  const byId = new Map(rows.value.map((row) => [String(row.id), row]))
  let parentId = String(item.parentId ?? item.parent_id ?? 0)
  while (parentId && parentId !== '0') {
    if (!expandedPermissionIds.value.has(parentId)) return false
    parentId = String(byId.get(parentId)?.parentId ?? byId.get(parentId)?.parent_id ?? 0)
  }
  return true
}
function hasPermissionChildren(item: RecordRow) { return permissionChildIds.value.has(String(item.id)) }
function canCreatePermissionChild(item: RecordRow) { return Number(item.permType ?? item.perm_type) !== 3 }
function systemFieldOptions(field: string) {
  if (mode.value === 'users' && field === 'orgId') return [{ label: '无', value: '' }, ...orgOptions.value.map((item) => ({ label: String(item.org_name || item.id), value: item.id }))]
  if (mode.value === 'users' && field === 'status') return [{ label: '正常', value: 1 }, { label: '禁用', value: 0 }]
  if (mode.value === 'roles' && field === 'dataScope') return [
    { label: '全部数据', value: 1 },
    { label: '本组织及下级', value: 2 },
    { label: '本组织', value: 3 },
    { label: '仅本人', value: 4 },
  ]
  if (mode.value === 'roles' && field === 'status') return [{ label: '启用', value: 1 }, { label: '停用', value: 0 }]
  if (mode.value === 'permissions' && field === 'permType') return [{ label: '目录', value: 1 }, { label: '菜单', value: 2 }, { label: '按钮', value: 3 }]
  if (mode.value === 'permissions' && field === 'parentId') return permissionParentOptions.value
  if (mode.value === 'permissions' && field === 'status') return [{ label: '启用', value: 1 }, { label: '停用', value: 0 }]
  return []
}
function togglePermissionNode(item: RecordRow) {
  const next = new Set(expandedPermissionIds.value)
  const id = String(item.id)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedPermissionIds.value = next
  pageNum.value = 1
}
async function load() { loading.value = true; error.value = ''; try { if (mode.value === 'audit') { const page = await audit('operation-logs', { pageNum: pageNum.value, pageSize, keyword: keyword.value }); rows.value = page.records; total.value = page.total; return } if (mode.value === 'profile') { const requests = [audit('my-operations', { pageNum: pageNum.value, pageSize, keyword: keyword.value }), session.can('system:role:list') ? rbac('relations') : Promise.resolve({}), session.can('system:user:list') ? rbacPage('users', { pageNum: 1, pageSize: 500 }) : Promise.resolve({ records: [] }), session.can('system:role:list') ? rbacPage('roles', { pageNum: 1, pageSize: 500 }) : Promise.resolve({ records: [] }), session.can('system:permission:list') ? rbac('permissions') : Promise.resolve([]), listResource('archive', 'orgs', { pageSize: 500 })] as const; const [logs, snapshot, usersPage, rolesPage, permissionsList, orgsPage] = await Promise.all(requests); rows.value = logs.records; total.value = logs.total; relations.value = snapshot as RecordRow; relationUsers.value = (usersPage as { records?: RecordRow[] }).records || []; relationRoles.value = (rolesPage as { records?: RecordRow[] }).records || []; relationPermissions.value = Array.isArray(permissionsList) ? permissionsList as RecordRow[] : []; orgOptions.value = (orgsPage as { records?: RecordRow[] }).records || []; return } if (!configuration.value) return; if (mode.value === 'permissions') { const value = await rbac(`${configuration.value.endpoint}?keyword=${encodeURIComponent(keyword.value)}`); const list = Array.isArray(value) ? value : []; rows.value = keyword.value ? list.filter((row) => JSON.stringify(row).toLowerCase().includes(keyword.value.toLowerCase())) : list; total.value = rows.value.length; return } const page = await rbacPage(configuration.value.endpoint, { pageNum: pageNum.value, pageSize, keyword: keyword.value }); rows.value = page.records; total.value = page.total } catch (e) { error.value = e instanceof Error ? e.message : '系统数据读取失败'; rows.value = []; total.value = 0 } finally { loading.value = false } }
async function loadLookups() { try { orgOptions.value = (await listResource('archive', 'orgs', { pageSize: 500 })).records } catch { orgOptions.value = [] } }
function query() { if (keywordTimer) clearTimeout(keywordTimer); pageNum.value = 1; load() }
function resetSearch() { if (keywordTimer) clearTimeout(keywordTimer); ignoreNextKeywordWatch = keyword.value !== ''; keyword.value = ''; pageNum.value = 1; load() }
function changePage(next: number) { pageNum.value = next; load() }
function previousPage() { changePage(Math.max(1, pageNum.value - 1)) }
function nextPage() { changePage(Math.min(pageCount.value, pageNum.value + 1)) }
function openCreate(parent?: RecordRow) { if (!configuration.value) return; editingId.value = null; Object.keys(form).forEach((key) => delete form[key]); Object.assign(form, configuration.value.defaults); if (mode.value === 'permissions' && parent) form.parentId = Number(parent.id); dialog.value = true }
function openEdit(row: RecordRow) { if (!configuration.value) return; editingId.value = row.id; Object.keys(form).forEach((key) => delete form[key]); configuration.value.fields.forEach((key) => form[key] = typeof row[key] === 'number' ? row[key] : String(row[key] ?? '')); dialog.value = true }
async function save() { if (!configuration.value) return; try { const init: RequestInit = { method: editingId.value ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }; await rbac(editingId.value ? `${configuration.value.endpoint}/${editingId.value}` : configuration.value.endpoint, init); dialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' } }
function openDelete(row: RecordRow) { deletingRow.value = row; deleteDialog.value = true }
async function confirmDelete() { if (!configuration.value || !deletingRow.value) return; deleting.value = true; try { await rbac(`${configuration.value.endpoint}/${deletingRow.value.id}`, { method: 'DELETE' }); deleteDialog.value = false; deletingRow.value = null; await load() } catch (e) { error.value = e instanceof Error ? e.message : '删除失败' } finally { deleting.value = false } }
function openRelation(target: RecordRow, modeValue: 'password' | 'roles' | 'permissions' | 'scopes') { relationTargetId.value = target.id; relationMode.value = modeValue; relationTitle.value = ({ password: '重置登录密码', roles: '分配用户角色', permissions: '分配角色权限', scopes: '配置组织数据范围' } as const)[modeValue]; relationText.value = modeValue === 'scopes' ? '1,SELF' : ''; relationDialog.value = true }
async function saveRelation() { if (!relationTargetId.value) return; try { let path = ''; let body: RecordRow = {}; if (relationMode.value === 'password') { path = `users/${relationTargetId.value}/password`; body = { password: relationText.value } } else if (relationMode.value === 'roles') { path = `users/${relationTargetId.value}/roles`; body = { ids: relationText.value.split(',').map((value) => Number(value.trim())).filter(Boolean) } } else if (relationMode.value === 'permissions') { path = `roles/${relationTargetId.value}/permissions`; body = { ids: relationText.value.split(',').map((value) => Number(value.trim())).filter(Boolean) } } else { path = `users/${relationTargetId.value}/org-scopes`; body = { scopes: relationText.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [orgId, scopeMode] = line.split(','); return { orgId: Number(orgId), scopeMode: (scopeMode || 'SELF').trim() } }) } } await rbac(path, { method: relationMode.value === 'scopes' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); relationDialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '关联配置保存失败' } }
function inputType(field: string) { return ['orgId', 'parentId', 'permType', 'dataScope', 'sort', 'status'].includes(field) ? 'number' : field === 'password' ? 'password' : 'text' }
watch(keyword, () => { if (ignoreNextKeywordWatch) { ignoreNextKeywordWatch = false; return } if (keywordTimer) clearTimeout(keywordTimer); keywordTimer = setTimeout(() => { pageNum.value = 1; load() }, 500) })
watch(() => route.fullPath, () => { if (keywordTimer) clearTimeout(keywordTimer); ignoreNextKeywordWatch = keyword.value !== ''; keyword.value = ''; pageNum.value = 1; expandedPermissionIds.value = new Set(); load(); loadLookups() })
onMounted(() => { load(); loadLookups() })
onBeforeUnmount(() => { if (keywordTimer) clearTimeout(keywordTimer) })
</script>
<template>
  <section class="view-page system-page"><header class="view-head"><div><p class="eyebrow">SYSTEM & ACCESS CONTROL</p><h1>{{ title }}</h1><p>{{ mode === 'profile' ? '会话与审计。' : mode === 'audit' ? '操作审计。' : 'RBAC 管理。' }}</p></div></header>
    <template v-if="mode === 'profile'">
      <div class="profile-grid">
        <article class="panel profile-session-card">
          <div class="panel-head"><div><h3>当前会话</h3><small>认证与组织范围</small></div></div>
          <div class="profile-user-card">
            <div class="profile-avatar">{{ String(profileUser.nickname || profileUser.username || '用').slice(0, 1) }}</div>
            <div><b>{{ profileUser.nickname || profileUser.username || '当前用户' }}</b><span>{{ profileUser.username || '—' }} / {{ profileUser.phone || profileUser.email || '未配置联系方式' }}</span></div>
          </div>
          <div class="profile-flow">
            <section><strong>角色</strong><div class="profile-tags"><span v-for="item in currentRoleBadges" :key="String(item)" class="tag blue">{{ item }}</span></div></section>
            <i>→</i>
            <section><strong>权限</strong><div class="profile-tags"><span v-for="item in currentPermissionBadges.slice(0, 12)" :key="String(item)" class="tag success">{{ item }}</span><span v-if="currentPermissionBadges.length > 12" class="tag muted">+{{ currentPermissionBadges.length - 12 }}</span></div></section>
            <i>→</i>
            <section><strong>组织范围</strong><div class="profile-tags"><span v-for="item in currentOrgScopeBadges" :key="String(item)" class="tag warn">{{ item }}</span></div></section>
          </div>
        </article>
        <article class="panel profile-rbac-card">
          <div class="panel-head"><div><h3>RBAC 关系图谱</h3><small v-if="!session.can('system:role:list')">当前账号无查看权限</small><small v-else>当前用户 → 角色 → 权限</small></div></div>
          <div class="profile-stat-row"><div v-for="item in relationStats" :key="item.label"><span>{{ item.label }}</span><b>{{ item.value }}</b></div></div>
          <div v-if="session.can('system:role:list')" class="rbac-map">
            <div v-for="row in roleGraphRows" :key="row.id" class="rbac-map-row">
              <div class="rbac-map-cell"><small>用户</small><span v-for="user in row.users" :key="user">{{ user }}</span></div>
              <i>→</i>
              <div class="rbac-map-role"><small>角色</small><b>{{ row.role }}</b></div>
              <i>→</i>
              <div class="rbac-map-cell permissions"><small>权限</small><div class="permission-groups"><div v-for="group in row.permissionGroups" :key="group.group" class="permission-group"><b>{{ group.group }}</b><span v-for="action in group.actions" :key="action">{{ action }}</span><em v-if="group.overflow">+{{ group.overflow }}</em></div><span v-if="row.overflow" class="more">+{{ row.overflow }}</span></div></div>
            </div>
            <div v-if="!roleGraphRows.length" class="empty-state">暂无 RBAC 关系。</div>
          </div>
        </article>
      </div>
    </template>
    <FilterBar v-model:keyword="keyword" :busy="loading" :show-reset="false" @query="query" @reset="resetSearch"><template #actions><button v-if="canAdd" class="primary add-action" @click="openCreate()">{{ createLabel }}</button><button class="icon-btn" title="刷新" aria-label="刷新" @click="query"><RefreshCw :size="16" /></button></template></FilterBar>
    <template v-if="mode === 'permissions'"><article class="archive-tree-panel permission-dict-tree"><div v-if="loading" class="empty-state">正在读取权限字典...</div><div v-else-if="!permissionRows.length" class="empty-state">暂无权限字典。</div><div v-for="entry in pagedPermissionRows" v-else :key="String(entry.item.id)" class="archive-tree-row permission-tree-row" :style="{ paddingLeft: `${10 + entry.level * 24}px` }"><button class="tree-toggle" :class="{ placeholder: !hasPermissionChildren(entry.item) }" :disabled="!hasPermissionChildren(entry.item)" :title="expandedPermissionIds.has(String(entry.item.id)) ? '收起' : '展开'" @click="togglePermissionNode(entry.item)"><ChevronDown v-if="expandedPermissionIds.has(String(entry.item.id))" :size="15" /><ChevronRight v-else :size="15" /></button><span class="tag" :class="Number(entry.item.permType ?? entry.item.perm_type) === 3 ? 'blue' : Number(entry.item.permType ?? entry.item.perm_type) === 2 ? 'warn' : 'success'">{{ Number(entry.item.permType ?? entry.item.perm_type) === 3 ? '按钮' : Number(entry.item.permType ?? entry.item.perm_type) === 2 ? '菜单' : '目录' }}</span><div class="tree-main"><b>{{ entry.item.permName || entry.item.perm_name }}</b><small>{{ entry.item.permCode || entry.item.perm_code }} / parent: {{ entry.item.parentId ?? entry.item.parent_id ?? 0 }}</small></div><div class="row-actions"><button class="icon-btn" title="详情" aria-label="详情" @click="selected = entry.item"><Eye :size="16" /></button><button v-if="canAdd && canCreatePermissionChild(entry.item)" class="icon-btn" title="新增子项目" aria-label="新增子项目" @click="openCreate(entry.item)"><Plus :size="16" /></button><button v-if="canEdit" class="icon-btn" title="编辑" aria-label="编辑" @click="openEdit(entry.item)"><Pencil :size="16" /></button><button v-if="canDelete" class="icon-btn danger-text" title="删除" aria-label="删除" @click="openDelete(entry.item)"><Trash2 :size="16" /></button></div></div></article><div v-if="displayTotal > 0" class="table-pagination system-tree-pagination"><span>共 {{ displayTotal }} 条</span><button class="quiet" :disabled="pageNum <= 1" @click="previousPage">上一页</button><b>{{ pageNum }} / {{ pageCount }}</b><button class="quiet" :disabled="pageNum >= pageCount" @click="nextPage">下一页</button></div></template>
    <AppDataTable v-else :pageable="true" :page-size="pageSize" :current-page="pageNum" :total="total" :hide-actions="mode === 'audit'" :columns="mode === 'audit' ? auditColumns : mode === 'profile' ? profileColumns : systemColumns" :rows="mode === 'audit' ? auditRows : rows" :loading="loading" :error="error" @refresh="load" @page-change="changePage"><template #actions="{ row }"><button v-if="canEdit" class="icon-btn" title="编辑" aria-label="编辑" @click="openEdit(row)"><Pencil :size="16" /></button><button v-if="mode === 'users' && session.can('system:user:edit')" class="icon-btn" title="分配角色" aria-label="分配角色" @click="openRelation(row, 'roles')"><UserRoundCog :size="16" /></button><button v-if="mode === 'users' && session.can('system:user:edit')" class="icon-btn" title="重置密码" aria-label="重置密码" @click="openRelation(row, 'password')"><KeyRound :size="16" /></button><button v-if="mode === 'users' && session.can('system:user:scope:edit')" class="icon-btn" title="组织范围" aria-label="组织范围" @click="openRelation(row, 'scopes')"><GitBranch :size="16" /></button><button v-if="mode === 'roles' && session.can('system:role:edit')" class="icon-btn" title="分配权限" aria-label="分配权限" @click="openRelation(row, 'permissions')"><ShieldCheck :size="16" /></button><button v-if="canDelete" class="icon-btn danger-text" title="删除" aria-label="删除" @click="openDelete(row)"><Trash2 :size="16" /></button></template></AppDataTable>
    <AppDialog :open="Boolean(selected)" title="系统记录详情" eyebrow="DETAIL" hide-actions @update:open="(open) => { if (!open) selected = null }"><dl class="detail-grid dialog-detail-grid"><template v-for="item in selectedDetailItems" :key="item[0]"><dt>{{ item[0] }}</dt><dd>{{ item[1] }}</dd></template></dl></AppDialog>
    <AppDialog v-model:open="dialog" :title="editingId ? `编辑${title}` : `新增${title}`" @submit="save"><div class="dialog-fields"><label v-for="field in configuration?.fields || []" :key="field" class="dialog-field" :class="{ full: ['remark'].includes(field) }"><span>{{ fieldLabel(field) }}</span><textarea v-if="field === 'remark'" v-model="form[field]"></textarea><select v-else-if="systemFieldOptions(field).length" v-model="form[field]"><option v-for="option in systemFieldOptions(field)" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select><input v-else v-model="form[field]" :type="inputType(field)"></label></div></AppDialog>
    <AppDialog v-model:open="relationDialog" :title="relationTitle" @submit="saveRelation"><div class="dialog-fields"><label class="dialog-field full"><span>{{ relationMode === 'password' ? '新密码' : relationMode === 'scopes' ? '组织范围' : 'ID 集合' }}</span><textarea v-if="relationMode === 'scopes'" v-model="relationText" spellcheck="false"></textarea><input v-else v-model="relationText" :type="relationMode === 'password' ? 'password' : 'text'" :placeholder="relationMode === 'password' ? '请输入新密码' : '例如 1,2,3'"></label></div></AppDialog>
    <AppConfirmDialog v-model:open="deleteDialog" :title="`删除${title}`" message="确认删除后将立即调用后端删除接口，且无法恢复。" :loading="deleting" confirm-text="确认删除" @confirm="confirmDelete" />
  </section>
</template>
