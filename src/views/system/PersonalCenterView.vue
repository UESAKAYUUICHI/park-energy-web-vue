<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { BriefcaseBusiness, Building2, CheckCircle2, ImagePlus, KeyRound, Mail, Pencil, Phone, RefreshCw, ShieldCheck, Trash2, UserRound, UsersRound } from '@lucide/vue'
import { changeMyPassword, clearMyAvatar, profileSummary, updateMyProfile, uploadMyAvatar } from '@/api/platform'
import { currentUser } from '@/api/auth'
import * as auth from '@/api/auth'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

const session = useSessionStore()
const loading = ref(false); const saving = ref(false); const changingPassword = ref(false); const error = ref('')
const summary = ref<RecordRow>({})
const form = reactive<RecordRow>({ nickname: '', phone: '', email: '' })
const passwordForm = reactive<RecordRow>({ currentPassword: '', newPassword: '', confirmPassword: '' })
const profileDialog = ref(false); const avatarSaving = ref(false)
const user = computed<RecordRow>(() => summary.value.user && typeof summary.value.user === 'object' ? summary.value.user as RecordRow : (session.user || {}))
const roles = computed<RecordRow[]>(() => Array.isArray(summary.value.roles) ? summary.value.roles as RecordRow[] : [])
const scopes = computed<RecordRow[]>(() => Array.isArray(summary.value.orgScopes) ? summary.value.orgScopes as RecordRow[] : [])
const work = computed<RecordRow>(() => summary.value.work && typeof summary.value.work === 'object' ? summary.value.work as RecordRow : {})
const initials = computed(() => String(user.value.nickname || user.value.username || '用').slice(0, 1))
const avatarUrl = computed(() => String(summary.value.avatarUrl || user.value.avatar || '').trim())
function scopeName(scope: RecordRow) {
  const name = scope.org_name || scope.orgName
  if (name) return String(name)
  const id = scope.org_id ?? scope.orgId
  return id ? `组织 ID ${id}（记录已失效）` : '组织范围记录异常'
}

async function load() {
  loading.value = true; error.value = ''
  try {
    summary.value = await profileSummary()
    Object.assign(form, { nickname: user.value.nickname || '', phone: user.value.phone || '', email: user.value.email || '' })
  } catch (e) { error.value = e instanceof Error ? e.message : '个人中心读取失败' } finally { loading.value = false }
}
async function saveProfile() {
  saving.value = true
  try { await updateMyProfile(form); session.applyPayload(await currentUser()); profileDialog.value = false; await load() } finally { saving.value = false }
}
function openProfileEditor() { Object.assign(form, { nickname: user.value.nickname || '', phone: user.value.phone || '', email: user.value.email || '' }); profileDialog.value = true }
async function onAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { error.value = '头像仅支持图片格式，且不能超过 5MB'; input.value = ''; return }
  avatarSaving.value = true
  try { await uploadMyAvatar(file); session.applyPayload(await currentUser()); await load() } finally { avatarSaving.value = false; input.value = '' }
}
async function removeAvatar() { avatarSaving.value = true; try { await clearMyAvatar(); session.applyPayload(await currentUser()); await load() } finally { avatarSaving.value = false } }
async function savePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) { error.value = '两次输入的新密码不一致'; return }
  changingPassword.value = true
  try { await changeMyPassword(passwordForm); Object.assign(passwordForm, { currentPassword: '', newPassword: '', confirmPassword: '' }) } finally { changingPassword.value = false }
}
onMounted(load)
</script>

<template>
  <section class="view-page personal-center-page">
    <header class="view-head personal-header"><div><p class="eyebrow">MY WORKSPACE</p><h1>个人中心</h1><p class="personal-subtitle">管理你的账号资料、访问范围与登录安全。</p></div><button class="quiet" :disabled="loading" @click="load"><RefreshCw :size="15" />{{ loading ? '读取中' : '刷新' }}</button></header>
    <p v-if="error" class="notice">{{ error }}</p>

    <section class="personal-overview panel">
      <div class="overview-identity">
        <div class="personal-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="头像"><span v-else>{{ initials }}</span></div>
        <div class="personal-identity"><div class="identity-kicker"><span class="online-mark"></span>账号正常</div><h2>{{ user.nickname || user.username || '当前用户' }}</h2><p>{{ user.username || '—' }}</p><div class="personal-tags"><span v-for="role in roles" :key="String(role.role_code)" class="tag blue">{{ role.role_name || role.role_code }}</span><span v-if="!roles.length" class="tag muted">暂无角色</span></div></div>
      </div>
      <div class="overview-contact"><div><Phone :size="15" /><span>{{ user.phone || '未绑定手机号' }}</span></div><div><Mail :size="15" /><span>{{ user.email || '未绑定邮箱' }}</span></div></div>
      <div class="personal-counts"><div><BriefcaseBusiness :size="17" /><b>{{ work.openWorkOrderCount || 0 }}</b><span>待处理工单</span></div><div><UsersRound :size="17" /><b>{{ roles.length }}</b><span>角色数量</span></div><div><ShieldCheck :size="17" /><b>{{ scopes.length || 1 }}</b><span>组织范围</span></div></div>
    </section>

    <div class="personal-layout">
        <article class="panel profile-editor">
          <div class="panel-head"><div><span class="section-overline">PROFILE</span><h3>我的资料</h3><small>这些信息用于平台内的身份展示和联系。</small></div><span class="section-icon"><UserRound :size="18" /></span></div>
          <div class="profile-readonly-grid"><div><span>昵称</span><b>{{ user.nickname || '未设置' }}</b></div><div><span>手机号</span><b>{{ user.phone || '未绑定' }}</b></div><div><span>邮箱</span><b>{{ user.email || '未绑定' }}</b></div><div><span>登录账号</span><b>{{ user.username || '—' }}</b></div></div>
          <div class="profile-form-footer"><span><CheckCircle2 :size="15" />资料默认只读，修改将在弹窗中完成</span><button class="primary" @click="openProfileEditor"><Pencil :size="15" />编辑资料</button></div>
        </article>
        <div class="personal-lower-grid">
        <article class="panel access-panel"><div class="panel-head"><div><span class="section-overline">ACCESS SCOPE</span><h3>组织与权限</h3><small>授权由系统治理模块统一维护。</small></div><span class="section-icon"><ShieldCheck :size="18" /></span></div><div class="access-summary"><div class="access-summary-icon"><Building2 :size="18" /></div><div><b>{{ scopes.length ? '已配置组织访问范围' : '使用默认组织范围' }}</b><span>{{ scopes.length ? `当前可访问 ${scopes.length} 个组织范围` : '暂无附加组织范围' }}</span></div></div><div class="scope-list"><div v-for="scope in scopes" :key="String(scope.id)"><span class="scope-name"><span class="scope-dot"></span>{{ scopeName(scope) }}</span><span class="scope-mode">{{ String(scope.scope_mode || scope.scopeMode || 'SELF').toUpperCase() === 'SUBTREE' ? '含下级组织' : '仅本组织' }}</span></div><p v-if="!scopes.length" class="muted-text">如需扩大范围，请联系系统管理员。</p></div></article>
        <article class="panel security-panel"><div class="panel-head"><div><span class="section-overline">SECURITY</span><h3>账户安全</h3><small>定期更新密码，保护平台访问。</small></div><span class="section-icon"><KeyRound :size="18" /></span></div><div class="security-note"><span class="security-shield"><ShieldCheck :size="17" /></span><div><b>登录态安全</b><span>修改密码后当前登录态保持有效。</span></div></div><div class="password-form"><label><span>当前密码</span><input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" placeholder="输入当前密码"></label><label><span>新密码</span><input v-model="passwordForm.newPassword" type="password" minlength="6" maxlength="64" autocomplete="new-password" placeholder="至少 6 位"></label><label><span>确认新密码</span><input v-model="passwordForm.confirmPassword" type="password" minlength="6" maxlength="64" autocomplete="new-password" placeholder="再次输入新密码"></label></div><button class="security-action" :disabled="changingPassword" @click="savePassword"><KeyRound :size="15" />{{ changingPassword ? '正在更新…' : '更新密码' }}</button></article>
        </div>
    </div>
    <AppDialog v-model:open="profileDialog" title="编辑个人资料" eyebrow="PROFILE EDITOR" confirm-text="保存资料" :saving="saving" @submit="saveProfile">
      <div class="profile-dialog-body"><div class="avatar-editor"><div class="personal-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="头像"><span v-else>{{ initials }}</span></div><div class="avatar-actions"><label class="quiet avatar-upload" :class="{ disabled: avatarSaving }"><ImagePlus :size="14" />{{ avatarSaving ? '处理中...' : '上传头像' }}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" :disabled="avatarSaving" @change="onAvatarFile"></label><button v-if="avatarUrl" class="quiet danger-text" type="button" :disabled="avatarSaving" @click="removeAvatar"><Trash2 :size="14" />去掉头像</button><small>支持 JPG、PNG、WebP、GIF，5MB 内</small></div></div><div class="personal-form"><label><span>昵称</span><input v-model="form.nickname" maxlength="50" placeholder="输入你的显示名称"></label><label><span>手机号</span><input v-model="form.phone" maxlength="20" placeholder="用于接收运维联系"></label><label><span>邮箱</span><input v-model="form.email" maxlength="100" placeholder="name@example.com"></label></div></div>
    </AppDialog>
  </section>
</template>

<style scoped>
.personal-center-page{width:100%;max-width:none;min-width:0}.personal-header{margin-bottom:10px}.personal-subtitle{margin:3px 0 0;color:var(--muted);font-size:11px}.personal-overview{display:grid;grid-template-columns:minmax(280px,1.1fr) minmax(220px,.8fr) minmax(310px,1fr);align-items:center;gap:16px;padding:16px 18px;margin-bottom:10px;background:linear-gradient(105deg,#f9fcff 0%,#fff 58%);border-top:3px solid var(--accent)}.overview-identity{display:flex;align-items:center;gap:12px;min-width:0}.personal-avatar{width:56px;height:56px;display:grid;place-items:center;flex:none;overflow:hidden;border-radius:14px;background:linear-gradient(135deg,#126abd,#51a3e9);color:#fff;font-size:23px;font-weight:700}.personal-avatar img{width:100%;height:100%;object-fit:cover}.personal-identity{min-width:0}.identity-kicker{display:flex;align-items:center;gap:6px;color:#2b8c64;font-size:10px;font-weight:600}.online-mark{width:7px;height:7px;border-radius:50%;background:#3bb582;box-shadow:0 0 0 3px #dff5ea}.personal-identity h2{margin:5px 0 2px;font-size:19px;letter-spacing:0}.personal-identity p{margin:0 0 6px;color:var(--muted);font-size:11px}.personal-tags{display:flex;gap:5px;flex-wrap:wrap}.overview-contact{display:grid;gap:7px;padding-left:16px;border-left:1px solid var(--border)}.overview-contact div{display:flex;align-items:center;gap:7px;min-width:0;color:var(--muted);font-size:11px}.overview-contact svg{flex:none;color:var(--accent)}.overview-contact span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.personal-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-left:1px solid var(--border)}.personal-counts div{display:grid;grid-template-columns:22px 1fr;align-items:center;min-width:0;padding:2px 10px;border-right:1px solid var(--border)}.personal-counts svg{grid-row:1/3;color:var(--accent)}.personal-counts b{font-size:17px;line-height:1.1}.personal-counts span{color:var(--muted);font-size:9px;white-space:nowrap}.personal-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(330px,.85fr);gap:10px;align-items:start}.personal-main-column,.personal-side-column{display:grid;gap:10px;min-width:0}.personal-layout .panel{padding:14px 16px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.panel-head h3{margin:3px 0 2px;font-size:14px;letter-spacing:0}.panel-head small{color:var(--muted);font-size:10px}.section-overline{color:var(--accent);font:700 9px 'SFMono-Regular',Consolas,monospace;letter-spacing:1px}.section-icon{display:grid;place-items:center;width:28px;height:28px;border:1px solid #d6e5f3;border-radius:7px;background:#f2f8fd;color:var(--accent)}.personal-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}.personal-form label,.password-form label{display:grid;gap:5px;color:#5f7388;font-size:10px}.personal-form input,.password-form input{width:100%;height:34px;box-sizing:border-box;padding:0 9px;border:1px solid #d4e0eb;border-radius:5px;background:#fbfdff;color:var(--fg);font-size:11px;outline:none;transition:border-color .15s,box-shadow .15s}.personal-form input:focus,.password-form input:focus{border-color:var(--accent);box-shadow:0 0 0 3px #1671c514}.profile-form-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}.profile-form-footer>span{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:10px}.profile-form-footer svg{color:#2e9b6c}.access-summary,.security-note{display:flex;align-items:center;gap:9px;padding:9px;border:1px solid #dce9f4;background:#f7fbff}.access-summary-icon,.security-shield{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:7px;background:#e5f2ff;color:var(--accent)}.access-summary div:last-child,.security-note div:last-child{display:grid;gap:2px}.access-summary b,.security-note b{font-size:11px}.access-summary span,.security-note span{color:var(--muted);font-size:10px}.scope-list{display:grid;gap:0;margin-top:7px}.scope-list>div{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 2px;border-bottom:1px solid var(--border);font-size:11px}.scope-name{display:flex;align-items:center;gap:7px;min-width:0}.scope-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#3b9ad1}.scope-mode{color:var(--muted);font-size:10px}.muted-text{margin:8px 0 0;color:var(--muted);font-size:10px}.security-note{margin-bottom:10px;border-color:#dcefe5;background:#f5fcf8}.security-shield{background:#e2f6ea;color:#25885d}.password-form{display:grid;gap:9px}.security-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;height:33px;margin-top:11px;border:1px solid #c9d9e7;border-radius:5px;background:#fff;color:#315372;font-size:11px}.security-action:hover{border-color:var(--accent);color:var(--accent)}.security-action:disabled{opacity:.55}.activity-list{display:grid;gap:0}.activity-list>div{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)}.activity-list i{width:6px;height:6px;flex:none;border-radius:50%;background:#2fb176}.activity-list i.failed{background:#e46c55}.activity-list span{display:grid;gap:2px;min-width:0;flex:1}.activity-list b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600}.activity-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:9px}.activity-list em{font-style:normal;color:#2e9566;font-size:9px}.activity-list i.failed+span+em{color:#c85b4c}@media(max-width:980px){.personal-overview{grid-template-columns:1fr 1fr}.personal-counts{grid-column:1/-1;border-left:0;border-top:1px solid var(--border);padding-top:10px}.personal-layout{grid-template-columns:1fr}}@media(max-width:640px){.personal-overview{grid-template-columns:1fr;gap:12px;padding:14px}.overview-contact{padding:9px 0 0;border-left:0;border-top:1px solid var(--border)}.personal-counts{grid-template-columns:repeat(3,1fr)}.personal-counts div{padding:2px 6px}.personal-counts b{font-size:15px}.personal-form{grid-template-columns:1fr}.personal-layout .panel{padding:13px}.profile-form-footer{align-items:flex-start;flex-direction:column}.profile-form-footer button{width:100%}}
 .personal-layout{display:grid;grid-template-columns:1fr;gap:10px;align-items:stretch}.personal-lower-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(330px,.85fr);gap:10px;align-items:stretch}.personal-lower-grid>.panel{height:100%;box-sizing:border-box}.profile-readonly-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.profile-readonly-grid>div{display:grid;gap:4px;min-width:0;padding:10px;border:1px solid #dce7f1;background:#fbfdff}.profile-readonly-grid span{color:var(--muted);font-size:10px}.profile-readonly-grid b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.profile-dialog-body{display:grid;gap:18px}.avatar-editor{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:1px solid var(--border)}.avatar-editor .personal-avatar{width:72px;height:72px}.avatar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.avatar-actions small{flex-basis:100%;color:var(--muted);font-size:10px}.avatar-upload{position:relative}.avatar-upload input{position:absolute;inset:0;opacity:0;cursor:pointer}.avatar-upload.disabled{opacity:.55;pointer-events:none}.danger-text{color:#c4574d}.danger-text:hover{border-color:#e3aaa3;color:#b4453b}@media(max-width:980px){.personal-lower-grid{grid-template-columns:1fr}}@media(max-width:640px){.profile-readonly-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.avatar-editor{align-items:flex-start;flex-direction:column}.avatar-actions{width:100%}}
</style>
