<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { showAppAlert, useAlertRef } from '@/composables/useAppAlert'
import FilterBar from '@/components/app/FilterBar.vue'
import OrgScopeTreeNode from '@/components/org/OrgScopeTreeNode.vue'
import { assignUserOrgScopes, rbacOrgTree, rbacPage, userOrgScopes } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'

type ScopeMode = 'SELF' | 'SUBTREE'

const session = useSessionStore()
const users = ref<RecordRow[]>([])
const orgTree = ref<RecordRow[]>([])
const selectedUserId = ref<unknown>(null)
const selectedOrgModes = ref<Record<string, ScopeMode>>({})
const keyword = ref('')
const loading = ref(false)
const error = useAlertRef()
const saving = ref(false)
const notice = ref('')

const canEdit = computed(() => session.can('system:user:scope:edit'))
const selectedUser = computed(() => users.value.find((user) => String(user.id) === String(selectedUserId.value)))
const checkedCount = computed(() => Object.keys(selectedOrgModes.value).length)
const visibleUsers = computed(() => users.value.filter((user) => {
  const text = `${user.username || ''} ${user.nickname || ''} ${user.phone || ''}`.toLowerCase()
  return !keyword.value || text.includes(keyword.value.toLowerCase())
}))

function userLabel(user: RecordRow) {
  return `${user.nickname || user.username || '未命名用户'}`
}
function orgLabel(org: RecordRow) {
  return String(org.org_name || org.orgName || org.id || '未命名组织')
}
function scopeModeLabel(value: unknown) {
  return String(value).toUpperCase() === 'SUBTREE' ? '含下级' : '仅本组织'
}
function runFilter() {}
function isChecked(id: unknown) {
  return Boolean(selectedOrgModes.value[String(id)])
}
function toggleOrg(id: unknown) {
  const key = String(id)
  const next = { ...selectedOrgModes.value }
  if (next[key]) delete next[key]
  else next[key] = 'SELF'
  selectedOrgModes.value = next
}
function setOrgMode(id: unknown, mode: ScopeMode) {
  const key = String(id)
  selectedOrgModes.value = { ...selectedOrgModes.value, [key]: mode }
}
async function selectUser(user: RecordRow) {
  selectedUserId.value = user.id
  notice.value = ''
  error.value = ''
  try {
    const scopes = await userOrgScopes(user.id)
    selectedOrgModes.value = Object.fromEntries(scopes.map((scope) => [String(scope.org_id ?? scope.orgId), String(scope.scope_mode ?? scope.scopeMode).toUpperCase() === 'SUBTREE' ? 'SUBTREE' : 'SELF']))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '组织范围读取失败'
    selectedOrgModes.value = {}
  }
}
async function saveScopes() {
  if (!selectedUserId.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const scopes = Object.entries(selectedOrgModes.value).map(([orgId, scopeMode]) => ({ orgId: Number(orgId), scopeMode }))
    await assignUserOrgScopes(selectedUserId.value, scopes)
    notice.value = '用户组织绑定已保存'
    showAppAlert({ title: '操作成功', message: notice.value, type: 'success' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '用户组织绑定保存失败'
  } finally {
    saving.value = false
  }
}
async function load() {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const [userPage, tree] = await Promise.all([
      rbacPage('users', { pageSize: 500 }),
      rbacOrgTree(),
    ])
    users.value = userPage.records
    orgTree.value = tree
    if (users.value[0]) await selectUser(users.value[0])
  } catch (e) {
    error.value = e instanceof Error ? e.message : '用户组织绑定数据读取失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <section class="view-page user-org-binding-page">
    <header class="view-head">
      <div><p class="eyebrow">USER ORG SCOPE</p><h1>用户组织绑定</h1><p>组织范围授权。</p></div>
      <button class="quiet" @click="load">刷新</button>
    </header>
    <div class="org-binding-board">
      <article class="panel rbac-column">
        <div class="panel-head"><div><h3>用户列表</h3><small>{{ selectedUser ? userLabel(selectedUser) : '请选择用户' }}</small></div></div>
        <FilterBar v-model:keyword="keyword" :busy="loading" :show-reset="false" placeholder="搜索账号、姓名或电话" @query="runFilter" />
        <div v-if="loading" class="empty-state">正在读取用户...</div>
        <div v-else class="rbac-list">
          <button v-for="user in visibleUsers" :key="String(user.id)" class="rbac-item" :class="{ active: String(user.id) === String(selectedUserId) }" @click="selectUser(user)">
            <b>{{ userLabel(user) }}</b><span>{{ user.username }} / {{ Number(user.status) === 1 ? '正常' : '禁用' }}</span>
          </button>
          <div v-if="!visibleUsers.length" class="empty-state">暂无用户。</div>
        </div>
      </article>
      <article class="panel rbac-column org-scope-column">
        <div class="panel-head"><div><h3>组织范围</h3><small>{{ checkedCount }} 个组织已绑定</small></div><button class="primary" :disabled="!selectedUserId || !canEdit || saving" @click="saveScopes">{{ saving ? '正在保存...' : '保存绑定' }}</button></div>
        <div class="permission-tree">
          <OrgScopeTreeNode v-for="node in orgTree" :key="String(node.key || node.id)" :node="node" :checked="isChecked(node.id)" :mode="selectedOrgModes[String(node.id)] || 'SELF'" :checked-map="Object.fromEntries(Object.keys(selectedOrgModes).map((id) => [id, true]))" :mode-map="selectedOrgModes" :disabled="!canEdit" @toggle="toggleOrg" @mode="setOrgMode" />
          <div v-if="!orgTree.length && !loading" class="empty-state">暂无可绑定组织。</div>
        </div>
      </article>
    </div>
  </section>
</template>
