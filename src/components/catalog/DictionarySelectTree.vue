<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, FolderTree, Tag, CircleGauge } from '@lucide/vue'
import type { RecordRow } from '@/types/domain'

const props = withDefaults(defineProps<{ nodes: RecordRow[]; selected?: string[]; keyword?: string }>(), { selected: () => [], keyword: '' })
const emit = defineEmits<{ toggle: [id: string, checked: boolean] }>()
const expanded = ref(new Set<string>())
const selectedSet = computed(() => new Set(props.selected))
function children(node: RecordRow) { return Array.isArray(node.children) ? node.children as RecordRow[] : [] }
function matches(node: RecordRow) { const key = props.keyword.trim().toLowerCase(); return !key || [node.label, node.code, node.attribute_name, node.attribute_code, node.point_name, node.point_code, node.group_name, node.group_code].filter(Boolean).join(' ').toLowerCase().includes(key) }
function filteredNodes(nodes: RecordRow[]): RecordRow[] { if (!props.keyword.trim()) return nodes; return nodes.reduce<RecordRow[]>((result, node) => { const nested = filteredNodes(children(node)); if (matches(node) || nested.length) result.push({ ...node, children: nested }); return result }, []) }
const visibleNodes = computed(() => filteredNodes(props.nodes))
function nodeId(node: RecordRow) { return String(node.id ?? '') }
function forwardToggle(id: string | undefined, checked: boolean | undefined) { if (id) emit('toggle', id, Boolean(checked)) }
function toggleExpanded(node: RecordRow) { const key = String(node.key); expanded.value.has(key) ? expanded.value.delete(key) : expanded.value.add(key); expanded.value = new Set(expanded.value) }
function icon(node: RecordRow) { return String(node.nodeType) === 'STANDARD_POINT' ? CircleGauge : String(node.nodeType).includes('GROUP') ? FolderTree : Tag }
function isSelectable(node: RecordRow) { return ['ATTRIBUTE_VALUE', 'STANDARD_POINT'].includes(String(node.nodeType)) }
function leafIds(node: RecordRow): string[] { return isSelectable(node) ? [nodeId(node)] : children(node).flatMap(leafIds) }
function inheritedSelected(node: RecordRow) { return leafIds(node).some((id) => selectedSet.value.has(id)) }
watch(() => props.nodes, (nodes) => { expanded.value = new Set(nodes.map((node) => String(node.key))) }, { immediate: true })
watch(() => props.keyword, (value) => { if (value) expanded.value = new Set(props.nodes.map((node) => String(node.key))) })
</script>

<template>
  <div class="dictionary-select-tree">
    <div v-for="node in visibleNodes" :key="String(node.key)" class="dictionary-select-node">
      <div class="dictionary-select-row">
        <button v-if="children(node).length" class="tree-caret" type="button" @click="toggleExpanded(node)"><ChevronDown v-if="expanded.has(String(node.key))" :size="15" /><ChevronRight v-else :size="15" /></button><span v-else class="tree-caret placeholder"></span>
        <input v-if="isSelectable(node)" type="checkbox" :checked="selectedSet.has(nodeId(node))" @change="emit('toggle', nodeId(node), ($event.target as HTMLInputElement).checked)">
        <span v-else-if="leafIds(node).length" class="tree-selected-state" :class="{ checked: inheritedSelected(node) }" aria-hidden="true"></span>
        <span v-else class="tree-selected-state placeholder"></span>
        <span class="tree-icon"><component :is="icon(node)" :size="15" /></span><span class="tree-label"><b>{{ node.label }}</b><small v-if="node.code">{{ node.code }}</small></span>
      </div>
      <DictionarySelectTree v-if="children(node).length && expanded.has(String(node.key))" :nodes="children(node)" :selected="selected" :keyword="keyword" @toggle="forwardToggle" />
    </div>
  </div>
</template>

<style scoped>
.dictionary-select-tree{min-height:0;padding-left:18px}.dictionary-select-tree>.dictionary-select-node{margin-left:-18px}.dictionary-select-row{min-height:46px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--border)}.tree-caret{width:22px;height:30px;display:grid;place-items:center;flex:none;padding:0;border:0;background:transparent;color:#8798aa;line-height:0}.tree-caret.placeholder{display:block}.dictionary-select-row input,.tree-selected-state{width:16px;height:16px;box-sizing:border-box;flex:none}.dictionary-select-row input{accent-color:#2879df}.tree-selected-state{border:1px solid #b7c6d6;border-radius:3px;background:#fff}.tree-selected-state.checked{border-color:#2879df;background:#2879df;box-shadow:inset 0 0 0 3px #fff}.tree-selected-state.placeholder{visibility:hidden}.tree-icon{width:28px;height:28px;display:grid;place-items:center;flex:none;border-radius:7px;background:#eef4ff;color:#2879df;line-height:0}.tree-caret :deep(svg),.tree-icon :deep(svg){display:block;margin:auto}.tree-label{display:grid;gap:3px}.tree-label b{font-size:13px}.tree-label small{color:var(--muted);font-size:11px}
</style>
