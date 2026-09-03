<script setup lang="ts">
import { X } from '@lucide/vue'

withDefaults(defineProps<{ open: boolean; title: string; saving?: boolean; confirmText?: string; hideActions?: boolean; showFooter?: boolean; eyebrow?: string; dialogClass?: string }>(), {
  showFooter: true,
})
const emit = defineEmits<{ 'update:open': [value: boolean]; submit: [] }>()
</script>
<template><div v-if="open" class="drawer-backdrop modal-backdrop" @click.self="emit('update:open', false)"><section :class="['dialog', dialogClass]" :style="dialogClass?.includes('settlement-dialog') ? { width: 'min(1180px, calc(100vw - 40px))', maxHeight: '92vh' } : undefined"><div class="dialog-head"><div><p class="eyebrow">{{ eyebrow || 'FORM' }}</p><h2>{{ title }}</h2></div><button type="button" class="close-icon" aria-label="关闭" @click="emit('update:open', false)"><X :size="18" /></button></div><div :class="['dialog-content', { 'no-scrollbar': dialogClass?.includes('resource-dialog') || dialogClass?.includes('resource-editor-dialog') || dialogClass?.includes('settlement-dialog') }]" ><slot /></div><div v-if="!hideActions && showFooter !== false" class="dialog-actions"><button type="button" class="primary" :disabled="saving" @click="emit('submit')">{{ saving ? '正在提交…' : (confirmText || '保存') }}</button><button type="button" class="quiet" @click="emit('update:open', false)">取消</button></div></section></div></template>
<style scoped>
.no-scrollbar{scrollbar-width:none}.no-scrollbar::-webkit-scrollbar{display:none}
@media(max-width:760px){
  .dialog-content{padding-bottom:2px}
}
</style>
