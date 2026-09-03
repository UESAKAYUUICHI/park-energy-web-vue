<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FolderCog } from '@lucide/vue'
import AppDialog from '@/components/app/AppDialog.vue'
import ResourceView from '@/views/ResourceView.vue'
import RevenueCenterView from '@/views/RevenueCenterView.vue'
import TenantContractView from '@/views/TenantContractView.vue'

type RecordView = 'tenants' | 'contracts' | 'accounts'
const recordsOpen = ref(false)
const recordView = ref<RecordView>('tenants')
const route = useRoute()
const router = useRouter()

function openRecords(view: RecordView = 'tenants') {
  recordView.value = view
  recordsOpen.value = true
}
function updateRecordsOpen(open: boolean) {
  recordsOpen.value = open
  if (!open && route.query.view !== 'overview') void router.replace({ query: { ...route.query, view: 'overview' } })
}
watch(() => route.query.view, (view) => {
  if (view === 'tenants' || view === 'contracts' || view === 'accounts') openRecords(view)
}, { immediate: true })
</script>

<template>
  <section class="view-page settlement-subject-page">
    <header class="view-head settlement-subject-head">
      <div>
        <p class="eyebrow">SETTLEMENT SUBJECTS</p>
        <h1>结算对象中心</h1>
      </div>
      <button class="subject-records-button" type="button" @click="openRecords()"><FolderCog :size="16" /><span>对象资料管理</span></button>
    </header>

    <div class="settlement-subject-stage">
      <RevenueCenterView embedded />
    </div>

    <AppDialog
      :open="recordsOpen"
      title="结算对象资料管理"
      eyebrow="SUBJECT RECORDS"
      hide-actions
      dialog-class="subject-records-dialog"
      @update:open="updateRecordsOpen"
    >
      <nav class="dialog-section-tabs" aria-label="对象资料类型">
        <button :class="{ active: recordView === 'tenants' }" @click="recordView = 'tenants'">租户档案</button>
        <button :class="{ active: recordView === 'contracts' }" @click="recordView = 'contracts'">合同与空间</button>
        <button :class="{ active: recordView === 'accounts' }" @click="recordView = 'accounts'">计费账户</button>
      </nav>
      <div class="subject-records-panel">
        <ResourceView v-if="recordView === 'tenants'" resource="tenants" area="billing" embedded compact />
        <TenantContractView v-else-if="recordView === 'contracts'" embedded />
        <ResourceView v-else resource="accounts" area="billing" embedded compact />
      </div>
    </AppDialog>
  </section>
</template>
