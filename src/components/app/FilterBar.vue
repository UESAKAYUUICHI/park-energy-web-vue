<script setup lang="ts">
defineProps<{ keyword: string; placeholder?: string; busy?: boolean }>()
const emit = defineEmits<{ 'update:keyword': [value: string]; query: []; reset: [] }>()
</script>
<template><article class="filter-card"><div class="filter-row"><label class="crud-search"><input :value="keyword" :placeholder="placeholder || '输入关键字筛选'" @input="emit('update:keyword', ($event.target as HTMLInputElement).value)" @keyup.enter="emit('query')"></label><slot /><div class="filter-actions"><button class="btn-primary" :disabled="busy" @click="emit('query')">{{ busy ? '查询中…' : '查询' }}</button><button class="quiet" @click="emit('reset')">重置</button></div></div></article></template>
