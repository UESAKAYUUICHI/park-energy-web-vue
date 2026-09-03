<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X } from '@lucide/vue'
import { appAlertState, closeAppAlert } from '@/composables/useAppAlert'
</script>

<template>
  <Transition name="app-alert-toast">
    <section v-if="appAlertState.open" class="app-alert-toast" :class="`alert-${appAlertState.type}`" role="status" aria-live="polite">
      <div class="app-alert-icon" aria-hidden="true">
        <CheckCircle2 v-if="appAlertState.type === 'success'" :size="20" />
        <Info v-else-if="appAlertState.type === 'info'" :size="20" />
        <AlertTriangle v-else :size="20" />
      </div>
      <div class="app-alert-copy">
        <strong>{{ appAlertState.title }}</strong>
        <span>{{ appAlertState.message }}</span>
      </div>
      <button class="app-alert-close" aria-label="关闭提示" @click="closeAppAlert"><X :size="16" /></button>
    </section>
  </Transition>
</template>

<style scoped>
.app-alert-toast { position: fixed; z-index: 10000; top: 18px; left: 50%; display: flex; align-items: center; gap: 11px; width: max-content; max-width: min(680px, calc(100vw - 32px)); min-height: 48px; padding: 11px 14px 11px 16px; border: 1px solid #d8dee6; border-radius: 12px; background: rgba(255, 255, 255, .98); box-shadow: 0 14px 34px rgba(24, 39, 58, .18); color: #253246; transform: translateX(-50%); }
.app-alert-icon { display: grid; flex: 0 0 30px; width: 30px; height: 30px; place-items: center; border-radius: 50%; }
.app-alert-copy { display: grid; min-width: 0; gap: 2px; line-height: 1.45; }
.app-alert-copy strong { font-size: 14px; font-weight: 650; }
.app-alert-copy span { color: #647084; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
.app-alert-close { display: grid; flex: 0 0 26px; width: 26px; height: 26px; margin-left: auto; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #8a94a3; cursor: pointer; place-items: center; }
.app-alert-close:hover { background: #f1f3f6; color: #344054; }
.alert-success { border-color: #cde6d7; background: #f7fcf8; }
.alert-success .app-alert-icon { background: #e0f4e7; color: #23824a; }
.alert-warning { border-color: #ecd9a8; background: #fffaf0; }
.alert-warning .app-alert-icon { background: #fff0c7; color: #a26b00; }
.alert-info { border-color: #cbdceb; background: #f6faff; }
.alert-info .app-alert-icon { background: #e3effb; color: #2d6eaa; }
.alert-error { border-color: #efc9bd; background: #fff8f5; color: #863d2c; }
.alert-error .app-alert-icon { background: #ffe5dc; color: #b34f37; }
.app-alert-toast-enter-active, .app-alert-toast-leave-active { transition: opacity .28s ease, transform .32s ease; }
.app-alert-toast-enter-from, .app-alert-toast-leave-to { opacity: 0; transform: translate(-50%, -24px); }
@media (prefers-reduced-motion: reduce) { .app-alert-toast-enter-active, .app-alert-toast-leave-active { transition: opacity .01s linear; } }
</style>
