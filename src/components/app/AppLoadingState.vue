<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '数据加载中' })
</script>

<template>
  <div class="app-loading-state" role="status" aria-live="polite">
    <i class="app-loading-spinner" aria-hidden="true"></i>
    <span>{{ text }}</span>
  </div>
</template>
