<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Building2, ChevronDown, ChevronRight } from '@lucide/vue'
import type { RecordRow } from '@/types/domain'

type ScopeMode = 'SELF' | 'SUBTREE'

const props = withDefaults(defineProps<{
  node: RecordRow
  depth?: number
  checked?: boolean
  mode?: ScopeMode
  checkedMap?: Record<string, unknown>
  modeMap?: Record<string, ScopeMode>
  disabled?: boolean
}>(), { depth: 0, checked: false, mode: 'SELF', checkedMap: () => ({}), modeMap: () => ({}), disabled: false })
const emit = defineEmits<{ toggle: [id: unknown]; mode: [id: unknown, value: ScopeMode] }>()
const expanded = ref(true)
const children = computed(() => Array.isArray(props.node.children) ? props.node.children as RecordRow[] : [])
const label = computed(() => String(props.node.org_name || props.node.orgName || props.node.label || props.node.id || '未命名组织'))
const modeLabel = computed(() => props.mode === 'SUBTREE' ? '含下级' : '仅本组织')
function forwardMode(value: unknown) {
  const tuple = value as [unknown, ScopeMode]
  emit('mode', tuple[0], tuple[1])
}
watch(() => props.node, () => { if (!children.value.length) expanded.value = false })
</script>

<template>
  <div class="org-scope-tree-node">
    <div class="org-scope-tree-row" :style="{ paddingLeft: (8 + Number(depth || 0) * 20) + 'px' }">
      <button v-if="children.length" class="org-scope-caret" type="button" :aria-label="expanded ? '收起' : '展开'" @click="expanded = !expanded">
        <ChevronDown v-if="expanded" :size="16" /><ChevronRight v-else :size="16" />
      </button>
      <span v-else class="org-scope-caret placeholder"></span>
      <input type="checkbox" :checked="checked" :disabled="disabled" @change="emit('toggle', node.id)">
      <span class="org-scope-icon"><Building2 :size="14" /></span>
      <b>{{ label }}</b>
      <small>{{ checked ? modeLabel : '未绑定' }}</small>
      <select :value="mode" :disabled="!checked || disabled" @change="emit('mode', node.id, ($event.target as HTMLSelectElement).value as ScopeMode)">
        <option value="SELF">仅本组织</option>
        <option value="SUBTREE">含下级</option>
      </select>
    </div>
    <div v-if="expanded && children.length" class="org-scope-tree-children">
      <OrgScopeTreeNode v-for="child in children" :key="String(child.key || child.id)" :node="child" :depth="Number(depth || 0) + 1" :checked="Boolean(checkedMap[String(child.id)])" :mode="modeMap[String(child.id)] || 'SELF'" :checked-map="checkedMap" :mode-map="modeMap" :disabled="disabled" @toggle="emit('toggle', $event)" @mode="forwardMode" />
    </div>
  </div>
</template>

<style scoped>
.org-scope-tree-row{min-height:48px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--border);color:#263d58}.org-scope-caret{width:26px;height:32px;display:grid;place-items:center;flex:none;border:0;background:transparent;color:#7d91a8}.org-scope-caret.placeholder{display:block}.org-scope-tree-row input{width:16px;height:16px;flex:none}.org-scope-icon{width:25px;height:25px;display:grid;place-items:center;flex:none;border-radius:6px;background:#eaf3ff;color:#2b78e5;font-size:11px;font-weight:700}.org-scope-tree-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.org-scope-tree-row small{margin-left:auto;color:var(--muted);font-size:12px;white-space:nowrap}.org-scope-tree-row select{width:104px;height:32px;padding:0 7px;border:1px solid var(--border);border-radius:5px;background:#fff;color:#52667e;font-size:12px}.org-scope-tree-row select:disabled{background:#f4f6f8;color:#9aa7b5}
</style>
