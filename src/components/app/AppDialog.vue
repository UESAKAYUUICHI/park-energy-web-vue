<script setup lang="ts">
import { X } from '@lucide/vue'

defineProps<{ open: boolean; title: string; description?: string; saving?: boolean; confirmText?: string; hideActions?: boolean; eyebrow?: string; dialogClass?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; submit: [] }>()
</script>
<template><div v-if="open" class="drawer-backdrop modal-backdrop" @click.self="emit('update:open', false)"><section :class="['dialog', dialogClass]"><div class="dialog-head"><div><p class="eyebrow">{{ eyebrow || 'FORM' }}</p><h2>{{ title }}</h2></div><button type="button" class="close-icon" aria-label="关闭" @click="emit('update:open', false)"><X :size="18" /></button></div><p v-if="description" class="tip">{{ description }}</p><slot /><div v-if="!hideActions" class="dialog-actions"><button type="button" class="primary" :disabled="saving" @click="emit('submit')">{{ saving ? '正在提交…' : (confirmText || '保存') }}</button><button type="button" class="quiet" @click="emit('update:open', false)">取消</button></div></section></div></template>
