<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'

defineProps<{
  open: boolean
  title?: string
  message?: string
  loading?: boolean
  confirmText?: string
  cancelText?: string
  requireReason?: boolean
  reason?: string
  reasonPlaceholder?: string
}>()

const emit = defineEmits<{ 'update:open': [value: boolean]; 'update:reason': [value: string]; confirm: [] }>()
</script>

<template>
  <div v-if="open" class="drawer-backdrop modal-backdrop" @click.self="emit('update:open', false)">
    <section class="dialog confirm-dialog">
      <div class="confirm-body">
        <div class="confirm-icon"><AlertTriangle :size="22" /></div>
        <div class="confirm-copy">
          <p class="eyebrow">DELETE CONFIRM</p>
          <h2>{{ title || '确认删除' }}</h2>
          <p>{{ message || '删除后数据将无法恢复，请确认是否继续。' }}</p>
          <textarea v-if="requireReason" :value="reason" :placeholder="reasonPlaceholder || '请输入操作原因'" rows="3" @input="emit('update:reason', ($event.target as HTMLTextAreaElement).value)" />
        </div>
      </div>
      <div class="dialog-actions">
        <button class="danger" :disabled="loading" @click="emit('confirm')">{{ loading ? '正在处理...' : (confirmText || '确认删除') }}</button>
        <button class="quiet" :disabled="loading" @click="emit('update:open', false)">{{ cancelText || '取消' }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.confirm-dialog {
  width: min(460px, calc(100vw - 34px));
  overflow: hidden;
}

.confirm-body {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  padding: 24px 25px 20px;
}

.confirm-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #fff0ea;
  color: var(--danger);
}

.confirm-copy h2 {
  margin: 4px 0 8px;
}

.confirm-copy p:not(.eyebrow) {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}
.confirm-copy textarea{box-sizing:border-box;width:100%;margin-top:14px;padding:10px 12px;border:1px solid #d8e0e6;border-radius:7px;outline:0;resize:none;color:#30495a;font:inherit}.confirm-copy textarea:focus{border-color:#73a9c0;box-shadow:0 0 0 3px rgba(63,130,157,.1)}
@media(max-width:760px){
  .confirm-dialog{width:100%!important;max-width:none!important;border-radius:14px 14px 0 0!important}
  .confirm-body{grid-template-columns:36px minmax(0,1fr);gap:11px;padding:20px 16px 16px}
  .confirm-icon{width:36px;height:36px}
}

</style>
