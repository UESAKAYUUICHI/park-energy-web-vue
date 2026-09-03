<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Activity, BriefcaseBusiness, KeyRound, RefreshCw, ShieldCheck, UserRound } from '@lucide/vue'
import { audit, changeMyPassword, profileSummary, updateMyProfile } from '@/api/platform'
import { currentUser } from '@/api/auth'
import * as auth from '@/api/auth'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

const session = useSessionStore()
const loading = ref(false); const saving = ref(false); const changingPassword = ref(false); const error = ref('')
const summary = ref<RecordRow>({}); const activities = ref<RecordRow[]>([])
const form = reactive<RecordRow>({ nickname: '', phone: '', email: '', avatar: '' })
const passwordForm = reactive<RecordRow>({ currentPassword: '', newPassword: '', confirmPassword: '' })
const user = computed<RecordRow>(() => summary.value.user && typeof summary.value.user === 'object' ? summary.value.user as RecordRow : (session.user || {}))
const roles = computed<RecordRow[]>(() => Array.isArray(summary.value.roles) ? summary.value.roles as RecordRow[] : [])
const scopes = computed<RecordRow[]>(() => Array.isArray(summary.value.orgScopes) ? summary.value.orgScopes as RecordRow[] : [])
const work = computed<RecordRow>(() => summary.value.work && typeof summary.value.work === 'object' ? summary.value.work as RecordRow : {})
const initials = computed(() => String(user.value.nickname || user.value.username || '用').slice(0, 1))

async function load() {
  loading.value = true; error.value = ''
  try {
    const [profile, logPage] = await Promise.all([profileSummary(), audit('my-operations', { pageNum: 1, pageSize: 8 })])
    summary.value = profile; activities.value = logPage.records
    Object.assign(form, { nickname: user.value.nickname || '', phone: user.value.phone || '', email: user.value.email || '', avatar: user.value.avatar || '' })
  } catch (e) { error.value = e instanceof Error ? e.message : '个人中心读取失败' } finally { loading.value = false }
}
async function saveProfile() {
  saving.value = true
  try { await updateMyProfile(form); session.applyPayload(await currentUser()); await load() } finally { saving.value = false }
}
async function savePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) { error.value = '两次输入的新密码不一致'; return }
  changingPassword.value = true
  try { await changeMyPassword(passwordForm); Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' }) } finally { changingPassword.value = false }
}
onMounted(load)
</script>

<template>
  <section class="view-page personal-center-page">
    <header class="view-head"><div><p class="eyebrow">MY WORKSPACE</p><h1>个人中心</h1></div><button class="quiet" :disabled="loading" @click="load"><RefreshCw :size="15" />刷新</button></header>
    <p v-if="error" class="notice">{{ error }}</p>
    <div class="personal-hero panel">
      <div class="personal-avatar">{{ initials }}</div><div class="personal-identity"><h2>{{ user.nickname || user.username || '当前用户' }}</h2><p>{{ user.username || '—' }} · {{ user.phone || user.email || '未设置联系方式' }}</p><div class="personal-tags"><span v-for="role in roles" :key="String(role.role_code)" class="tag blue">{{ role.role_name || role.role_code }}</span><span v-if="!roles.length" class="tag muted">暂无角色</span></div></div>
      <div class="personal-counts"><div><BriefcaseBusiness :size="16" /><b>{{ work.openWorkOrderCount || 0 }}</b><span>待处理工单</span></div><div><Activity :size="16" /><b>{{ activities.length }}</b><span>最近操作</span></div><div><ShieldCheck :size="16" /><b>{{ scopes.length }}</b><span>组织范围</span></div></div>
    </div>
    <div class="personal-grid">
      <article class="panel"><div class="panel-head"><div><h3>我的资料</h3><small>仅修改本人基础联系方式</small></div><UserRound :size="18" /></div><div class="personal-form"><label><span>昵称</span><input v-model="form.nickname" maxlength="50"></label><label><span>手机号</span><input v-model="form.phone" maxlength="20"></label><label><span>邮箱</span><input v-model="form.email" maxlength="100"></label><label><span>头像地址（可选）</span><input v-model="form.avatar" maxlength="500" placeholder="https://..."></label></div><div class="form-actions"><button class="primary" :disabled="saving" @click="saveProfile">{{ saving ? '正在保存…' : '保存资料' }}</button></div></article>
      <article class="panel"><div class="panel-head"><div><h3>我的组织与权限</h3><small>授权由系统治理模块统一维护</small></div><ShieldCheck :size="18" /></div><div class="scope-list"><div v-for="scope in scopes" :key="String(scope.id)"><b>{{ scope.org_name || scope.orgName || '未命名组织' }}</b><span>{{ String(scope.scope_mode || scope.scopeMode || 'SELF').toUpperCase() === 'SUBTREE' ? '含下级组织' : '仅本组织' }}</span></div><p v-if="!scopes.length" class="muted-text">暂无附加组织范围，将使用账号默认组织。</p></div></article>
      <article class="panel"><div class="panel-head"><div><h3>账户安全</h3><small>修改密码后当前登录态保持有效</small></div><KeyRound :size="18" /></div><div class="personal-form"><label><span>当前密码</span><input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password"></label><label><span>新密码</span><input v-model="passwordForm.newPassword" type="password" minlength="6" maxlength="64" autocomplete="new-password"></label><label><span>确认新密码</span><input v-model="passwordForm.confirmPassword" type="password" minlength="6" maxlength="64" autocomplete="new-password"></label></div><div class="form-actions"><button class="quiet" :disabled="changingPassword" @click="savePassword">{{ changingPassword ? '正在更新…' : '更新密码' }}</button></div></article>
      <article class="panel personal-activity"><div class="panel-head"><div><h3>最近活动</h3><small>仅显示当前用户的操作留痕</small></div><Activity :size="18" /></div><div v-if="activities.length" class="activity-list"><div v-for="item in activities" :key="String(item.id)"><i :class="{ failed: Number(item.status) !== 1 }"></i><span><b>{{ item.operation || item.module || '系统操作' }}</b><small>{{ item.module || '系统' }} · {{ item.create_time || item.createTime || '—' }}</small></span><em>{{ Number(item.status) === 1 ? '成功' : '失败' }}</em></div></div><p v-else class="muted-text">暂时没有个人操作记录。</p></article>
    </div>
  </section>
</template>

<style scoped>
.personal-center-page{max-width:1280px}.personal-hero{display:flex;align-items:center;gap:16px;padding:22px;margin-bottom:14px}.personal-avatar{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,#2268c6,#55a5f4);color:#fff;font:700 27px Georgia}.personal-identity{min-width:0;flex:1}.personal-identity h2{margin:0;font-size:21px}.personal-identity p{margin:5px 0 9px;color:var(--muted);font-size:12px}.personal-tags{display:flex;gap:6px;flex-wrap:wrap}.personal-counts{display:flex;gap:8px}.personal-counts div{min-width:92px;padding:8px 10px;border-left:1px solid var(--border);display:grid;grid-template-columns:20px 1fr;align-items:center}.personal-counts svg{grid-row:1/3;color:var(--accent)}.personal-counts b{font-size:17px}.personal-counts span{font-size:11px;color:var(--muted)}.personal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.personal-grid .panel{padding:17px}.personal-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.personal-form label{display:grid;gap:6px;font-size:12px;color:var(--muted)}.personal-form input{height:34px;padding:0 10px;border:1px solid var(--border);border-radius:5px;background:#fff;color:var(--fg)}.form-actions{margin-top:14px}.scope-list,.activity-list{display:grid;gap:1px}.scope-list>div,.activity-list>div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px}.scope-list span,.activity-list small{color:var(--muted)}.activity-list>div{justify-content:flex-start}.activity-list i{width:7px;height:7px;border-radius:50%;background:#2fb176}.activity-list i.failed{background:#e46c55}.activity-list span{display:grid;gap:3px;min-width:0;flex:1}.activity-list em{font-style:normal;font-size:11px;color:var(--muted)}.muted-text{color:var(--muted);font-size:12px}@media(max-width:760px){.personal-hero{align-items:flex-start;flex-wrap:wrap}.personal-counts{width:100%}.personal-counts div{flex:1;min-width:0}.personal-grid,.personal-form{grid-template-columns:1fr}}
</style>
