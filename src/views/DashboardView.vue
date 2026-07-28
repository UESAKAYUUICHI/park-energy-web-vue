<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'
</script>

<template>
  <section class="dashboard-placeholder">
    <AlertTriangle :size="72" stroke-width="1.8" />
    <strong>该页面紧张开发中</strong>
  </section>
</template>

<style scoped>
.dashboard-placeholder {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  color: #1f5fbf;
  background: #fff;
}

.dashboard-placeholder svg {
  flex: none;
  color: #f59e0b;
}

.dashboard-placeholder strong {
  font-size: clamp(42px, 5vw, 76px);
  line-height: 1.08;
  font-weight: 900;
  letter-spacing: 0;
}

@media (max-width: 720px) {
  .dashboard-placeholder {
    flex-direction: column;
    text-align: center;
    padding: 30px;
  }
}
</style>
