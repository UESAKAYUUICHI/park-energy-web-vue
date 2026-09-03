<script setup lang="ts">
import BillingSettlementCenter from '@/views/BillingSettlementCenter.vue'
</script>

<template>
  <BillingSettlementCenter view="payments" />
</template>

<style scoped>
.billing-domain-page { min-height:100%; }.billing-domain-head { margin-bottom:16px; }.billing-domain-head h1 { margin:4px 0 6px; }.billing-domain-head span { color:var(--muted,#708092); }.domain-stepbar { display:flex; align-items:center; gap:12px; padding:12px 16px; margin-bottom:14px; background:var(--surface,#fff); border:1px solid var(--line,#dfe6ed); border-radius:10px; color:var(--muted,#708092); }.domain-stepbar span { display:flex; align-items:center; gap:8px; font-size:13px; }.domain-stepbar span.active { color:var(--text,#17212b); font-weight:700; }.domain-stepbar b { display:grid; place-items:center; width:22px; height:22px; border-radius:50%; background:#e9eef2; font-size:12px; }.domain-stepbar .active b { color:#fff; background:#2f80a6; }.domain-stepbar i { color:#a4b1bc; font-style:normal; }
</style>
