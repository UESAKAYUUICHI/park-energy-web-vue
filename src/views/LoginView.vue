<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Lock, QrCode, Smartphone, UserRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const username = ref('admin')
const password = ref('123456')
const captcha = ref('')
const captchaInput = ref('')
const consentChecked = ref(false)
const consentDialog = ref(false)
const pendingSubmit = ref(false)
const error = ref('')
const pending = ref(false)
const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const unavailable = computed(() => error.value.includes('服务不可用') || error.value.includes('服务暂不可用') || error.value.includes('无法连接'))

function randomCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let value = ''
  for (let index = 0; index < 4; index += 1) value += chars[Math.floor(Math.random() * chars.length)]
  captcha.value = value
}

function openConsent() {
  consentDialog.value = true
}

async function doLogin() {
  pending.value = true
  error.value = ''
  try {
    session.clear()
    await session.signIn(username.value, password.value)
    const target = String(route.query.redirect || '/dashboard')
    await router.replace(target.startsWith('/login') ? '/dashboard' : target)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    pending.value = false
  }
}

async function submit() {
  if (captchaInput.value.trim().toUpperCase() !== captcha.value) {
    error.value = '验证码失败'
    randomCaptcha()
    captchaInput.value = ''
    return
  }
  if (!consentChecked.value) {
    pendingSubmit.value = true
    openConsent()
    return
  }
  await doLogin()
}

async function confirmConsent() {
  consentChecked.value = true
  consentDialog.value = false
  if (pendingSubmit.value) {
    pendingSubmit.value = false
    await doLogin()
  }
}

function setConsentDialog(value: boolean) {
  consentDialog.value = value
  if (!value) pendingSubmit.value = false
}

onMounted(randomCaptcha)
</script>

<template>
  <div class="login-page">
    <section class="login-copy">
      <div class="brand"><i></i><span>智园能管<small>ENERGY PLATFORM</small></span></div>
      <div class="login-copy-body">
        <p class="eyebrow">PARK ENERGY OPERATIONS</p>
        <h1>智慧能源管理平台</h1>
        <div class="login-accent"></div>
      </div>
    </section>

    <main class="login-card">
      <div class="login-card-top">
        <span>扫码下载App</span>
        <QrCode :size="18" />
      </div>
      <p class="eyebrow">登录系统</p>
      <h2>智慧能源管理平台</h2>
      <div class="login-underline"></div>
      <form class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span><UserRound :size="18" />账号/手机号/邮箱</span>
          <input v-model.trim="username" autocomplete="username" required>
        </label>
        <p v-if="error" class="form-error"><b>{{ unavailable ? '服务不可用：' : '登录失败：' }}</b>{{ error }}</p>
        <label class="login-field">
          <span><Lock :size="18" />密码</span>
          <input v-model="password" type="password" autocomplete="current-password" required>
        </label>
        <label class="login-field captcha-field">
          <span><Smartphone :size="18" />验证码</span>
          <input v-model.trim="captchaInput" placeholder="验证码">
          <button class="captcha-box" type="button" @click="randomCaptcha">{{ captcha }}</button>
        </label>
        <label class="login-consent">
          <input v-model="consentChecked" type="checkbox">
          <span>我已知晓并阅读<span class="protocol-link">《智园能管用户须知协议》</span></span>
        </label>
        <button class="primary login-submit" :disabled="pending">{{ pending ? '正在登录…' : '登 录' }}</button>
      </form>
      <div class="login-footer">
        <a class="login-register" href="javascript:void(0)">企业内部注册，暂不开放。</a>
        <p class="login-help">忘记密码</p>
      </div>
    </main>

    <div v-if="consentDialog" class="drawer-backdrop modal-backdrop login-consent-backdrop" @click.self="setConsentDialog(false)">
      <section class="login-consent-dialog">
        <h2>登录协议确认</h2>
        <p>
          登录即同意<span class="protocol-link">《智园能管用户须知协议》</span>，点击“是”将自动勾选并继续登录；点击“取消”则不登录。
        </p>
        <div class="dialog-actions">
          <button class="primary" @click="confirmConsent">是</button>
          <button class="quiet" @click="setConsentDialog(false)">取消</button>
        </div>
      </section>
    </div>
  </div>
</template>
