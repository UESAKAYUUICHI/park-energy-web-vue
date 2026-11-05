<script setup lang="ts">
defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>
<template><div v-if="open" class="drawer-backdrop" @click.self="emit('update:open', false)"><aside class="drawer"><button class="close" @click="emit('update:open', false)">×</button><h2>{{ title }}</h2><slot /></aside></div></template>
