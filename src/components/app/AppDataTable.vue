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
  hideActions?: boolean
  total?: number
  currentPage?: number
}>(), { pageSize: 10, pageable: true, hideActions: false, total: undefined, currentPage: undefined })

const emit = defineEmits<{ refresh: []; detail: [row: RecordRow]; 'page-change': [page: number] }>()
const page = ref(1)
const isServerPage = computed(() => props.total !== undefined && props.currentPage !== undefined)
const activePage = computed(() => isServerPage.value ? props.currentPage || 1 : page.value)
const totalRows = computed(() => isServerPage.value ? props.total || 0 : props.rows.length)
const pageCount = computed(() => Math.max(1, Math.ceil(totalRows.value / props.pageSize)))
const visibleColumns = computed(() => props.columns.filter((column) => column.key !== 'id'))
const pageWindow = computed(() => {
  const start = Math.max(1, activePage.value - 2)
  const end = Math.min(pageCount.value, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
const visibleRows = computed(() => props.pageable && !isServerPage.value ? props.rows.slice((page.value - 1) * props.pageSize, page.value * props.pageSize) : props.rows)
const showPagination = computed(() => props.pageable && props.rows.length > 0)

watch(() => props.rows, () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })

const valueOf = (row: RecordRow, column: TableColumn) => {
  if (column.format) return column.format(row[column.key], row)
  const value = row[column.key]
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}
const goPage = (next: number) => {
  const target = Math.min(pageCount.value, Math.max(1, next))
  if (isServerPage.value) emit('page-change', target)
  else page.value = target
}
const previousPage = () => goPage(activePage.value - 1)
const nextPage = () => goPage(activePage.value + 1)
</script>

<template>
  <article class="table-panel app-table">
    <div v-if="title" class="table-tools"><h3>{{ title }}</h3><slot name="toolbar"></slot></div>
    <div v-if="error" class="service-error"><b>{{ error.includes('服务') || error.includes('连接') || error.includes('503') ? '服务不可用' : '请求失败' }}</b><p>{{ error }}</p><button class="quiet" @click="emit('refresh')">重新请求</button></div>
    <div v-else-if="loading" class="empty-state">正在读取 Platform 数据…</div>
    <div v-else-if="!rows.length" class="empty-state">{{ emptyText || '当前条件下暂无数据。' }}</div>
    <template v-else>
      <div class="table-scroll"><table class="data-table" :class="{ 'has-actions': !hideActions }"><thead><tr><th v-for="column in visibleColumns" :key="column.key" :style="{ width: column.width }">{{ column.label }}</th><th v-if="!hideActions"><slot name="action-title">操作</slot></th></tr></thead><tbody><tr v-for="row in visibleRows" :key="String(row.id || row.command_id || row.bill_no)"><td v-for="column in visibleColumns" :key="column.key"><slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">{{ valueOf(row, column) }}</slot></td><td v-if="!hideActions" class="row-actions"><slot name="actions" :row="row"><button class="link-btn" @click="emit('detail', row)">详情</button></slot></td></tr></tbody></table></div>
      <div v-if="showPagination" class="table-pagination"><span>共 {{ totalRows }} 条</span><button class="quiet" :disabled="activePage <= 1" @click="previousPage">上一页</button><button v-for="item in pageWindow" :key="item" class="page-number" :class="{ active: item === activePage }" @click="goPage(item)">{{ item }}</button><button class="quiet" :disabled="activePage >= pageCount" @click="nextPage">下一页</button></div>
    </template>
  </article>
</template>
