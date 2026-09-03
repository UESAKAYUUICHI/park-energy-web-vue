<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ImageOff, RefreshCw } from '@lucide/vue'
import { mediaFileName, normalizeMediaUrl } from '@/utils/media'

const props = withDefaults(defineProps<{
  src?: unknown
  alt?: string
  fit?: 'cover' | 'contain'
  emptyText?: string
  retryable?: boolean
  eager?: boolean
}>(), {
  alt: '图片',
  fit: 'cover',
  emptyText: '暂无图片',
  retryable: true,
  eager: false,
})

const emit = defineEmits<{ error: [source: string]; retry: [] }>()
const failed = ref(false)
const loading = ref(false)
const retryVersion = ref(0)
const normalizedSource = computed(() => normalizeMediaUrl(props.src))
const displaySource = computed(() => normalizedSource.value)
const stateText = computed(() => failed.value ? '图片加载失败' : props.emptyText)
const sourceName = computed(() => mediaFileName(props.src))

watch(normalizedSource, (source) => {
  failed.value = false
  loading.value = Boolean(source)
  retryVersion.value += 1
}, { immediate: true })

function loaded() {
  loading.value = false
  failed.value = false
}

function failedToLoad() {
  loading.value = false
  failed.value = true
  emit('error', normalizedSource.value)
}

function retry() {
  failed.value = false
  loading.value = Boolean(normalizedSource.value)
  retryVersion.value += 1
  emit('retry')
}
</script>

<template>
  <div class="app-image" :class="[fit, { 'is-loading': loading, 'is-failed': failed }]">
    <img
      v-if="displaySource && !failed"
      :key="`${displaySource}:${retryVersion}`"
      :src="displaySource"
      :alt="alt"
      :title="sourceName"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      decoding="async"
      @load="loaded"
      @error="failedToLoad"
    >
    <div v-if="!displaySource || failed || loading" class="app-image-state">
      <ImageOff v-if="!loading" :size="32" />
      <small>{{ loading ? '图片加载中…' : stateText }}</small>
      <button v-if="failed && retryable" class="app-image-retry" type="button" @click.stop="retry">
        <RefreshCw :size="12" />重试
      </button>
    </div>
  </div>
</template>
