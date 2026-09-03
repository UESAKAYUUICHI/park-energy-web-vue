<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAlertRef } from '@/composables/useAppAlert'
import { ChevronDown, ChevronRight, RefreshCw, Search } from '@lucide/vue'
import { assignRolePermissions, assignUserRoles, rbac, rbacPage, rbacRelations } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

interface TreeNode { item: RecordRow; level: number }
type SearchField = 'user' | 'role' | 'permission'

const users = ref<RecordRow[]>([])
const roles = ref<RecordRow[]>([])
const permissions = ref<RecordRow[]>([])
const relations = ref<RecordRow>({})
const userKeyword = ref('')
const roleKeyword = ref('')
const permissionKeyword = ref('')
const appliedUserKeyword = ref('')
const appliedRoleKeyword = ref('')
const appliedPermissionKeyword = ref('')
const selectedUserId = ref<unknown>(null)
const selectedRoleId = ref<unknown>(null)
const roleChecks = ref<Set<string>>(new Set())
const permissionChecks = ref<Set<string>>(new Set())
const expandedPermissionIds = ref<Set<string>>(new Set())
const loading = ref(false)
const error = useAlertRef()
const saving = ref(false)

const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const searchTimers = new Map<string, ReturnType<typeof setTimeout>>()

const userRoles = computed(() => Array.isArray(relations.value.userRoles) ? relations.value.userRoles as RecordRow[] : [])
const rolePermissions = computed(() => Array.isArray(relations.value.rolePermissions) ? relations.value.rolePermissions as RecordRow[] : [])
const selectedUser = computed(() => users.value.find((item) => sameId(item.id, selectedUserId.value)))
const selectedRole = computed(() => roles.value.find((item) => sameId(item.id, selectedRoleId.value)))
const permissionById = computed(() => new Map(permissions.value.map((item) => [String(item.id), item])))
const permissionChildren = computed(() => {
  const byParent = new Map<string, RecordRow[]>()
  permissions.value.forEach((item) => {
    const parentId = String(item.parentId ?? item.parent_id ?? 0)
    byParent.set(parentId, [...(byParent.get(parentId) || []), item])
  })
  return byParent
})
const permissionTree = computed<TreeNode[]>(() => {
  const rows: TreeNode[] = []
  const visited = new Set<string>()
  const walk = (parentId: string, level: number) => (permissionChildren.value.get(parentId) || []).forEach((item) => {
    const id = String(item.id)
    if (visited.has(id)) return
    visited.add(id)
    rows.push({ item, level })
    walk(id, level + 1)
  })
  walk('0', 0)
  permissions.value.filter((item) => !visited.has(String(item.id))).forEach((item) => rows.push({ item, level: 0 }))
  return rows
})
const filteredUsers = computed(() => filterRows(users.value, appliedUserKeyword.value, (item) => [item.username, item.nickname, item.phone, item.email, item.status === 1 ? '启用' : '停用']))
const filteredRoles = computed(() => filterRows(roles.value, appliedRoleKeyword.value, (item) => [item.roleName, item.role_name, item.roleCode, item.role_code, item.dataScope, item.data_scope, item.remark]))
const filteredPermissions = computed(() => {
  const keyword = clean(appliedPermissionKeyword.value)
  if (!keyword) return permissionTree.value.filter((entry) => entry.level === 0 || isPermissionParentOpen(entry.item))
  return permissionTree.value.filter((entry) => permissionText(entry.item).includes(keyword))
})

function sameId(left: unknown, right: unknown) { return String(left) === String(right) }
function userLabel(user: RecordRow) { return `${user.nickname || user.username || '未命名用户'} · ${user.username || user.id}` }
function clean(value: string) { return value.trim().toLowerCase() }
function permissionText(item: RecordRow) {
  return clean([item.permName, item.perm_name, item.permCode, item.perm_code, item.routePath, item.route_path, item.componentPath, item.component_path].filter(Boolean).join(' '))
}
function filterRows(items: RecordRow[], keyword: string, mapper: (row: RecordRow) => unknown[]) {
  const text = clean(keyword)
  if (!text) return items
  return items.filter((item) => mapper(item).some((value) => String(value ?? '').toLowerCase().includes(text)))
}
function resetChecks() {
  roleChecks.value = new Set()
  permissionChecks.value = new Set()
}
function selectUser(user: RecordRow) {
  selectedUserId.value = user.id
  const roleId = userRoles.value.find((item) => sameId(item.userId ?? item.user_id, user.id))?.roleId ?? userRoles.value.find((item) => sameId(item.userId ?? item.user_id, user.id))?.role_id
  selectedRoleId.value = roleId ?? null
  roleChecks.value = roleId == null ? new Set() : new Set([String(roleId)])
  const role = roles.value.find((item) => sameId(item.id, roleId))
  permissionChecks.value = role ? new Set(rolePermissions.value.filter((item) => sameId(item.roleId ?? item.role_id, role.id)).map((item) => String(item.permissionId ?? item.permission_id))) : new Set()
}
function selectRole(role: RecordRow) {
  selectedRoleId.value = role.id
  roleChecks.value = new Set([String(role.id)])
  permissionChecks.value = new Set(rolePermissions.value.filter((item) => sameId(item.roleId ?? item.role_id, role.id)).map((item) => String(item.permissionId ?? item.permission_id)))
}
function hasPermissionChildren(item: RecordRow) {
  return Boolean(permissionChildren.value.get(String(item.id))?.length)
}
function isPermissionParentOpen(item: RecordRow) {
  let parentId = String(item.parentId ?? item.parent_id ?? 0)
  while (parentId && parentId !== '0') {
    if (!expandedPermissionIds.value.has(parentId)) return false
    parentId = String(permissionById.value.get(parentId)?.parentId ?? permissionById.value.get(parentId)?.parent_id ?? 0)
  }
  return true
}
function togglePermissionFold(item: RecordRow) {
  const next = new Set(expandedPermissionIds.value)
  const id = String(item.id)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedPermissionIds.value = next
}
function collectDescendantIds(id: unknown, out = new Set<string>()) {
  for (const child of permissionChildren.value.get(String(id)) || []) {
    const childId = String(child.id)
    if (out.has(childId)) continue
    out.add(childId)
    collectDescendantIds(childId, out)
  }
  return out
}
function toggleRole(id: unknown, checked: boolean) {
  const key = String(id)
  if (checked) {
    selectedRoleId.value = id
    roleChecks.value = new Set([key])
    const role = roles.value.find((item) => sameId(item.id, id))
    permissionChecks.value = role ? new Set(rolePermissions.value.filter((item) => sameId(item.roleId ?? item.role_id, role.id)).map((item) => String(item.permissionId ?? item.permission_id))) : new Set()
  } else if (sameId(selectedRoleId.value, id)) {
    selectedRoleId.value = null
    roleChecks.value = new Set()
    permissionChecks.value = new Set()
  }
  scheduleAutoSave('userRoles', saveUserRoles)
}
function togglePermission(id: unknown, checked: boolean) {
  const next = new Set(permissionChecks.value)
  const key = String(id)
  const descendants = collectDescendantIds(id)
  if (checked) {
    next.add(key)
    descendants.forEach((childId) => next.add(childId))
  } else {
    next.delete(key)
    descendants.forEach((childId) => next.delete(childId))
  }
  permissionChecks.value = next
  scheduleAutoSave('rolePermissions', saveRolePermissions)
}
function scheduleAutoSave(key: string, handler: () => Promise<void>) {
  const timer = autoSaveTimers.get(key)
  if (timer) clearTimeout(timer)
  autoSaveTimers.set(key, setTimeout(async () => {
    autoSaveTimers.delete(key)
    await handler()
  }, 500))
}
function onSearchInput(field: SearchField, value: string) {
  if (field === 'user') userKeyword.value = value
  if (field === 'role') roleKeyword.value = value
  if (field === 'permission') permissionKeyword.value = value
  const timer = searchTimers.get(field)
  if (timer) clearTimeout(timer)
  searchTimers.set(field, setTimeout(() => runSearch(field), 500))
}
function runSearch(field: SearchField) {
  const timer = searchTimers.get(field)
  if (timer) clearTimeout(timer)
  searchTimers.delete(field)
  if (field === 'user') appliedUserKeyword.value = userKeyword.value
  if (field === 'role') appliedRoleKeyword.value = roleKeyword.value
  if (field === 'permission') appliedPermissionKeyword.value = permissionKeyword.value
  if (field === 'user' || field === 'role') {
    load()
  }
}
async function saveUserRoles() {
  if (!selectedUserId.value) return
  saving.value = true
  error.value = ''
  try {
    await assignUserRoles(selectedUserId.value, selectedRoleId.value == null ? [] : [Number(selectedRoleId.value)])
    await loadRelations()
    if (selectedUser.value) selectUser(selectedUser.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '用户角色保存失败'
  } finally {
    saving.value = false
  }
}
async function saveRolePermissions() {
  if (!selectedRoleId.value) return
  saving.value = true
  error.value = ''
  try {
    await assignRolePermissions(selectedRoleId.value, [...permissionChecks.value].map(Number))
    await loadRelations()
    if (selectedRole.value) selectRole(selectedRole.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '角色权限保存失败'
  } finally {
    saving.value = false
  }
}
async function loadRelations() {
  relations.value = await rbacRelations()
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    const [userPage, rolePage, permissionRows] = await Promise.all([
      rbacPage('users', { pageSize: 500, keyword: appliedUserKeyword.value || undefined }),
      rbacPage('roles', { pageSize: 500, keyword: appliedRoleKeyword.value || undefined }),
      rbac('permissions'),
    ])
    users.value = userPage.records
    roles.value = rolePage.records
    permissions.value = Array.isArray(permissionRows) ? permissionRows : []
    await loadRelations()
    if (selectedUser.value) selectUser(selectedUser.value)
    else if (users.value[0]) selectUser(users.value[0])
    if (selectedRole.value) selectRole(selectedRole.value)
    else if (roles.value[0]) selectRole(roles.value[0])
  } catch (e) {
    error.value = e instanceof Error ? e.message : '权限分配数据读取失败'
    resetChecks()
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  autoSaveTimers.forEach((timer) => clearTimeout(timer))
  searchTimers.forEach((timer) => clearTimeout(timer))
})
</script>

<template>
  <section class="view-page rbac-workbench-page">
    <header class="view-head">
      <div>
        <p class="eyebrow">RBAC WORKBENCH</p>
        <h1>模块权限分配</h1>
      </div>
      <button class="icon-btn" :disabled="loading || saving" title="刷新" aria-label="刷新" @click="load"><RefreshCw :size="17" /></button>
    </header>
    <div class="rbac-board">
      <article class="panel rbac-column">
        <div class="panel-head">
          <div><h3>用户列表</h3><small>{{ selectedUser ? userLabel(selectedUser) : '请选择用户' }}</small></div>
          <span class="tag blue">{{ filteredUsers.length }} 项</span>
        </div>
        <label class="rbac-search">
          <Search :size="14" />
          <input :value="userKeyword" placeholder="搜索用户" @input="onSearchInput('user', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="runSearch('user')">
        </label>
        <AppLoadingState v-if="loading" />
        <div v-else class="rbac-list">
          <button v-for="user in filteredUsers" :key="String(user.id)" class="rbac-item" :class="{ active: sameId(user.id, selectedUserId) }" @click="selectUser(user)">
            <b>{{ user.nickname || user.username }}</b>
            <span>{{ user.username }} / {{ user.status === 1 ? '启用' : '停用' }}</span>
          </button>
        </div>
      </article>
      <article class="panel rbac-column">
        <div class="panel-head">
          <div><h3>角色列表</h3><small>用户角色绑定</small></div>
          <span class="tag blue">{{ roleChecks.size }} 项已选</span>
        </div>
        <label class="rbac-search">
          <Search :size="14" />
          <input :value="roleKeyword" placeholder="搜索角色" @input="onSearchInput('role', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="runSearch('role')">
        </label>
        <div class="rbac-list">
          <label v-for="role in filteredRoles" :key="String(role.id)" class="rbac-check" :class="{ active: sameId(role.id, selectedRoleId) }">
            <input type="radio" name="rbac-role" :checked="sameId(role.id, selectedRoleId)" @change="toggleRole(role.id, ($event.target as HTMLInputElement).checked)">
            <button type="button" @click="selectRole(role)">
              <b>{{ role.roleName || role.role_name }}</b>
              <span>{{ role.roleCode || role.role_code }} / 数据范围 {{ role.dataScope ?? role.data_scope ?? '—' }}</span>
            </button>
          </label>
        </div>
      </article>
      <article class="panel rbac-column">
        <div class="panel-head">
          <div><h3>权限列表</h3><small>角色权限绑定</small></div>
          <span class="tag blue">{{ permissionChecks.size }} 项已选</span>
        </div>
        <label class="rbac-search">
          <Search :size="14" />
          <input :value="permissionKeyword" placeholder="搜索权限" @input="onSearchInput('permission', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="runSearch('permission')">
        </label>
        <div class="permission-tree">
          <div v-for="entry in filteredPermissions" :key="String(entry.item.id)" class="permission-node" :class="{ child: entry.level > 0 }" :style="{ paddingLeft: `${10 + entry.level * 22}px` }">
            <button class="tree-toggle" :class="{ placeholder: !hasPermissionChildren(entry.item) }" :disabled="!hasPermissionChildren(entry.item)" :title="expandedPermissionIds.has(String(entry.item.id)) ? '收起' : '展开'" @click="togglePermissionFold(entry.item)">
              <ChevronDown v-if="expandedPermissionIds.has(String(entry.item.id))" :size="15" />
              <ChevronRight v-else :size="15" />
            </button>
            <input type="checkbox" :checked="permissionChecks.has(String(entry.item.id))" @change="togglePermission(entry.item.id, ($event.target as HTMLInputElement).checked)">
            <b>{{ entry.item.permName || entry.item.perm_name }}</b>
            <small>{{ entry.item.permCode || entry.item.perm_code || '—' }}</small>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
