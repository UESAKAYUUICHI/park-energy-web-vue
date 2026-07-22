<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/layouts/AppShell.vue'
const route = useRoute()
const publicPage = computed(() => route.name === 'login')
</script>
<template><RouterView v-if="publicPage" /><AppShell v-else /></template>
