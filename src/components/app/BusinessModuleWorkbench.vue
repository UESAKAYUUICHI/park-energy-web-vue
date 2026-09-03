<script setup lang="ts">
import type { BusinessWorkbenchTab } from '@/composables/useBusinessWorkbench'

withDefaults(defineProps<{
  eyebrow: string
  title: string
  description: string
  tabs: BusinessWorkbenchTab[]
  activeView: string
  navigation?: 'rail' | 'process'
}>(), { navigation: 'rail' })

defineEmits<{ change: [view: string] }>()
</script>

<template>
  <section class="view-page business-module-workbench">
    <header class="view-head business-module-head">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
      </div>
      <div class="business-module-actions"><slot name="actions" /></div>
    </header>
    <div class="business-module-body" :class="`navigation-${navigation}`">
      <nav class="business-module-tabs" :aria-label="`${title}功能切换`">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.key"
          type="button"
          :class="{ active: tab.key === activeView }"
          :title="tab.description"
          @click="$emit('change', tab.key)"
        >
          <i v-if="navigation === 'process'">{{ index + 1 }}</i>
          <span>{{ tab.label }}</span>
          <small>{{ tab.description }}</small>
        </button>
      </nav>
      <div class="business-module-panel">
        <slot />
      </div>
    </div>
  </section>
</template>
