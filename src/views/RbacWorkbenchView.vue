<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { assignRolePermissions, assignUserRoles, rbacPage, rbacRelations, rbac } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

interface TreeNode { item: RecordRow; level: number }

const users = ref<RecordRow[]>([])
const roles = ref<RecordRow[]>([])
const permissions = ref<RecordRow[]>([])
const relations = ref<RecordRow>({})
const selectedUserId = ref<unknown>(null)
const selectedRoleId = ref<unknown>(null)
const roleChecks = ref<Set<string>>(new Set())
const permissionChecks = ref<Set<string>>(new Set())
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')

const userRoles = computed(() => Array.isArray(relations.value.userRoles) ? relations.value.userRoles as RecordRow[] : [])
const rolePermissions = computed(() => Array.isArray(relations.value.rolePermissions) ? relations.value.rolePermissions as RecordRow[] : [])
const permissionTree = computed<TreeNode[]>(() => {
  const byParent = new Map<string, RecordRow[]>()
  permissions.value.forEach((item) => {
    const parentId = String(item.parentId ?? item.parent_id ?? 0)
    byParent.set(parentId, [...(byParent.get(parentId) || []), item])
  })
  const rows: TreeNode[] = []
  const walk = (parentId: string, level: number) => (byParent.get(parentId) || []).forEach((item) => {
    rows.push({ item, level })
    walk(String(item.id), level + 1)
  })
  walk('0', 0)
  permissions.value.filter((item) => !rows.some((row) => String(row.item.id) === String(item.id))).forEach((item) => rows.push({ item, level: 0 }))
  return rows
})
const selectedUser = computed(() => users.value.find((item) => String(item.id) === String(selectedUserId.value)))
const selectedRole = computed(() => roles.value.find((item) => String(item.id) === String(selectedRoleId.value)))

function roleLabel(role: RecordRow) { return `${role.roleName || role.role_name || '未命名角色'} · ${role.roleCode || role.role_code || role.id}` }
function userLabel(user: RecordRow) { return `${user.nickname || user.username || '未命名用户'} · ${user.username || user.id}` }
function permissionLabel(permission: RecordRow) { return `${permission.permName || permission.perm_name || '未命名权限'} · ${permission.permCode || permission.perm_code || permission.id}` }
function resetChecks() { roleChecks.value = new Set(); permissionChecks.value = new Set() }
function selectUser(user: RecordRow) {
  selectedUserId.value = user.id
  roleChecks.value = new Set(userRoles.value.filter((item) => String(item.userId ?? item.user_id) === String(user.id)).map((item) => String(item.roleId ?? item.role_id)))
}
function selectRole(role: RecordRow) {
  selectedRoleId.value = role.id
  permissionChecks.value = new Set(rolePermissions.value.filter((item) => String(item.roleId ?? item.role_id) === String(role.id)).map((item) => String(item.permissionId ?? item.permission_id)))
}
function toggleRole(id: unknown) {
  const next = new Set(roleChecks.value)
  const key = String(id)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  roleChecks.value = next
}
function togglePermission(id: unknown) {
  const next = new Set(permissionChecks.value)
  const key = String(id)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  permissionChecks.value = next
}
async function saveUserRoles() {
  if (!selectedUserId.value) return
  saving.value = true; error.value = ''; notice.value = ''
  try { await assignUserRoles(selectedUserId.value, [...roleChecks.value].map(Number)); await loadRelations(); if (selectedUser.value) selectUser(selectedUser.value); notice.value = '用户角色已保存' }
  catch (e) { error.value = e instanceof Error ? e.message : '用户角色保存失败' }
  finally { saving.value = false }
}
async function saveRolePermissions() {
  if (!selectedRoleId.value) return
  saving.value = true; error.value = ''; notice.value = ''
  try { await assignRolePermissions(selectedRoleId.value, [...permissionChecks.value].map(Number)); await loadRelations(); if (selectedRole.value) selectRole(selectedRole.value); notice.value = '角色权限已保存' }
  catch (e) { error.value = e instanceof Error ? e.message : '角色权限保存失败' }
  finally { saving.value = false }
}
async function loadRelations() { relations.value = await rbacRelations() }
async function load() {
  loading.value = true; error.value = ''
  try {
    const [userPage, rolePage, permissionRows] = await Promise.all([
      rbacPage('users', { pageSize: 200 }),
      rbacPage('roles', { pageSize: 200 }),
      rbac('permissions'),
      loadRelations(),
    ])
    users.value = userPage.records
    roles.value = rolePage.records
    permissions.value = Array.isArray(permissionRows) ? permissionRows : []
    if (users.value[0]) selectUser(users.value[0])
    if (roles.value[0]) selectRole(roles.value[0])
  } catch (e) { error.value = e instanceof Error ? e.message : '权限分配数据读取失败'; resetChecks() }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="view-page rbac-workbench-page">
    <header class="view-head"><div><p class="eyebrow">RBAC WORKBENCH</p><h1>模块权限分配</h1><p>用户角色权限分配。</p></div><button class="quiet" @click="load">刷新</button></header>
    <div v-if="error" class="notice">{{ error }}</div>
    <div v-else-if="notice" class="notice success-notice">{{ notice }}</div>
    <div class="rbac-board">
      <article class="panel rbac-column"><div class="panel-head"><div><h3>用户列表</h3><small>{{ selectedUser ? userLabel(selectedUser) : '请选择用户' }}</small></div><button class="primary" :disabled="!selectedUserId || saving" @click="saveUserRoles">保存角色</button></div><div v-if="loading" class="empty-state">正在读取用户...</div><div v-else class="rbac-list"><button v-for="user in users" :key="String(user.id)" class="rbac-item" :class="{ active: String(user.id) === String(selectedUserId) }" @click="selectUser(user)"><b>{{ user.nickname || user.username }}</b><span>{{ user.username }} / {{ user.status === 1 ? '启用' : '停用' }}</span></button></div></article>
      <article class="panel rbac-column"><div class="panel-head"><div><h3>角色列表</h3><small>角色权限配置</small></div><button class="primary" :disabled="!selectedRoleId || saving" @click="saveRolePermissions">保存权限</button></div><div class="rbac-list"><label v-for="role in roles" :key="String(role.id)" class="rbac-check" :class="{ active: String(role.id) === String(selectedRoleId) }"><input type="checkbox" :checked="roleChecks.has(String(role.id))" @change="toggleRole(role.id)"><button type="button" @click="selectRole(role)"><b>{{ role.roleName || role.role_name }}</b><span>{{ role.roleCode || role.role_code }} / 数据范围 {{ role.dataScope ?? role.data_scope ?? '—' }}</span></button></label></div></article>
      <article class="panel rbac-column"><div class="panel-head"><div><h3>权限列表</h3><small>权限字典父子树</small></div><span class="tag blue">{{ permissionChecks.size }} 项已选</span></div><div class="permission-tree"><label v-for="entry in permissionTree" :key="String(entry.item.id)" class="permission-node" :style="{ paddingLeft: `${10 + entry.level * 22}px` }"><input type="checkbox" :checked="permissionChecks.has(String(entry.item.id))" @change="togglePermission(entry.item.id)"><span class="tree-rail"></span><b>{{ entry.item.permName || entry.item.perm_name }}</b><small>{{ entry.item.permCode || entry.item.perm_code || '—' }}</small></label></div></article>
    </div>
  </section>
</template>
