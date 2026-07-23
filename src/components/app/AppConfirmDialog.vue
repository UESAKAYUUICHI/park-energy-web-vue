<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'

defineProps<{
  open: boolean
  title?: string
  message?: string
  loading?: boolean
  confirmText?: string
  cancelText?: string
}>()

const emit = defineEmits<{ 'update:open': [value: boolean]; confirm: [] }>()
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
        </div>
      </div>
      <div class="dialog-actions">
        <button class="danger" :disabled="loading" @click="emit('confirm')">{{ loading ? '正在删除...' : (confirmText || '确认删除') }}</button>
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

</style>
