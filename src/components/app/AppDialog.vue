<script setup lang="ts">
defineProps<{ open: boolean; title: string; description?: string; saving?: boolean; confirmText?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; submit: [] }>()
</script>
<template><div v-if="open" class="drawer-backdrop modal-backdrop" @click.self="emit('update:open', false)"><section class="dialog"><div class="dialog-head"><div><p class="eyebrow">FORM</p><h2>{{ title }}</h2></div><button class="close" @click="emit('update:open', false)">关闭</button></div><p v-if="description" class="tip">{{ description }}</p><slot /><div class="dialog-actions"><button class="primary" :disabled="saving" @click="emit('submit')">{{ saving ? '正在提交…' : (confirmText || '保存') }}</button><button class="quiet" @click="emit('update:open', false)">取消</button></div></section></div></template>
