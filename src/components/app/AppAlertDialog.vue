<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X } from '@lucide/vue'
import { appAlertState, closeAppAlert } from '@/composables/useAppAlert'
</script>

<template>
  <div v-if="appAlertState.open" class="drawer-backdrop modal-backdrop app-alert-backdrop" @click.self="closeAppAlert">
    <section class="dialog app-alert-dialog" :class="`alert-${appAlertState.type}`">
      <div class="app-alert-body">
        <div class="app-alert-icon">
          <CheckCircle2 v-if="appAlertState.type === 'success'" :size="22" />
          <Info v-else-if="appAlertState.type === 'info'" :size="22" />
          <AlertTriangle v-else :size="22" />
        </div>
        <div class="app-alert-copy">
          <p class="eyebrow">{{ appAlertState.type === 'warning' ? 'WARNING' : appAlertState.type === 'success' ? 'SUCCESS' : 'MESSAGE' }}</p>
          <h2>{{ appAlertState.title }}</h2>
          <p>{{ appAlertState.message }}</p>
        </div>
        <button class="close-icon" aria-label="关闭" @click="closeAppAlert"><X :size="18" /></button>
      </div>
      <div class="dialog-actions">
        <button class="primary" @click="closeAppAlert">知道了</button>
      </div>
    </section>
  </div>
</template>
