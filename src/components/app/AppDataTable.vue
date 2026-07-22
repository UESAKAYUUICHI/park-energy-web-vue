<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RecordRow } from '@/types/domain'

export interface TableColumn {
  key: string
  label: string
  width?: string
  format?: (value: unknown, row: RecordRow) => string
}

const props = withDefaults(defineProps<{
  columns: TableColumn[]
  rows: RecordRow[]
  loading?: boolean
  error?: string
  emptyText?: string
  title?: string
  pageSize?: number
  pageable?: boolean
}>(), { pageSize: 10, pageable: true })

const emit = defineEmits<{ refresh: []; detail: [row: RecordRow] }>()
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(props.rows.length / props.pageSize)))
const visibleRows = computed(() => props.pageable ? props.rows.slice((page.value - 1) * props.pageSize, page.value * props.pageSize) : props.rows)
const showPagination = computed(() => props.pageable && props.rows.length > 0)

watch(() => props.rows, () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })

const valueOf = (row: RecordRow, column: TableColumn) => column.format ? column.format(row[column.key], row) : (row[column.key] ?? '—')
const previousPage = () => { page.value = Math.max(1, page.value - 1) }
const nextPage = () => { page.value = Math.min(pageCount.value, page.value + 1) }
</script>

<template>
  <article class="table-panel app-table">
    <div v-if="title" class="table-tools"><h3>{{ title }}</h3><slot name="toolbar"></slot></div>
    <div v-if="error" class="service-error"><b>{{ error.includes('服务') || error.includes('连接') || error.includes('503') ? '服务不可用' : '请求失败' }}</b><p>{{ error }}</p><button class="quiet" @click="emit('refresh')">重新请求</button></div>
    <div v-else-if="loading" class="empty-state">正在读取 Platform 数据…</div>
    <div v-else-if="!rows.length" class="empty-state">{{ emptyText || '当前条件下暂无数据。' }}</div>
    <template v-else>
      <div class="table-scroll"><table class="data-table"><thead><tr><th v-for="column in columns" :key="column.key" :style="{ width: column.width }">{{ column.label }}</th><th><slot name="action-title">操作</slot></th></tr></thead><tbody><tr v-for="row in visibleRows" :key="String(row.id || row.command_id || row.bill_no)"><td v-for="column in columns" :key="column.key"><slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">{{ valueOf(row, column) }}</slot></td><td class="row-actions"><slot name="actions" :row="row"><button class="link-btn" @click="emit('detail', row)">详情</button></slot></td></tr></tbody></table></div>
      <div v-if="showPagination" class="table-pagination"><span>共 {{ rows.length }} 条</span><button class="quiet" :disabled="page <= 1" @click="previousPage">上一页</button><b>{{ page }} / {{ pageCount }}</b><button class="quiet" :disabled="page >= pageCount" @click="nextPage">下一页</button></div>
    </template>
  </article>
</template>
