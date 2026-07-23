<script setup lang="ts">
import { RotateCcw, Search } from '@lucide/vue'

withDefaults(defineProps<{ keyword: string; placeholder?: string; busy?: boolean; showReset?: boolean }>(), { showReset: true })
const emit = defineEmits<{ 'update:keyword': [value: string]; query: []; reset: [] }>()
</script>
<template><article class="filter-card"><div class="filter-row"><label class="crud-search"><input :value="keyword" :placeholder="placeholder || '输入关键字筛选'" @input="emit('update:keyword', ($event.target as HTMLInputElement).value)" @keyup.enter="emit('query')"></label><slot /><div class="filter-actions"><button class="btn-primary" :disabled="busy" @click="emit('query')"><Search :size="15" />{{ busy ? '查询中…' : '查询' }}</button></div><div class="filter-extra-actions"><button v-if="showReset" class="icon-btn" title="重置" aria-label="重置" @click="emit('reset')"><RotateCcw :size="16" /></button><slot name="actions" /></div></div></article></template>
