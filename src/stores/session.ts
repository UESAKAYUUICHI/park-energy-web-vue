import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { clearToken, setToken } from '@/api/http'
import * as auth from '@/api/auth'
import type { RecordRow, SessionPayload } from '@/types/domain'

export const useSessionStore = defineStore('session', () => {
  const user = ref<RecordRow | null>(null); const roles = ref<string[]>([]); const permissions = ref<string[]>([]); const orgScopes = ref<RecordRow[]>([]); const initialized = ref(false)
  const isAuthenticated = computed(() => user.value !== null)
  function applyPayload(payload: SessionPayload) { setToken(payload.tokenValue); user.value = payload.user; roles.value = payload.roles; permissions.value = payload.permissions; orgScopes.value = payload.orgScopes; initialized.value = true }
  function can(permission?: string) { return !permission || permissions.value.includes('*') || permissions.value.includes(permission) }
  function canAny(required: string[]) { return required.some(can) }
  async function signIn(username: string, password: string) { applyPayload(await auth.login(username, password)) }
  async function restore() { if (initialized.value) return; try { applyPayload(await auth.currentUser()) } catch { clear() } }
  async function signOut() { try { await auth.logout() } finally { clear() } }
  function clear() { clearToken(); user.value = null; roles.value = []; permissions.value = []; orgScopes.value = []; initialized.value = true }
  return { user, roles, permissions, orgScopes, initialized, isAuthenticated, applyPayload, can, canAny, signIn, restore, signOut, clear }
})
