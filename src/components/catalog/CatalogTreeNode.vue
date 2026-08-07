<script setup lang="ts">
import { ref, watch } from 'vue'
import { Boxes, ChevronDown, ChevronRight, CircleGauge, Eye, FolderTree, GitBranch, Layers3, Pencil, Plus, RadioTower, Tag, Trash2 } from '@lucide/vue'
import type { RecordRow } from '@/types/domain'

const props = defineProps<{
  node: RecordRow
  selectedKey?: string
  depth?: number
  expandToken?: number
  collapseToken?: number
  showDetailAction?: boolean
  showActions?: boolean
}>()
const emit = defineEmits<{ select: [node: RecordRow]; detail: [node: RecordRow]; edit: [node: RecordRow]; remove: [node: RecordRow]; createSibling: [node: RecordRow]; createChild: [node: RecordRow] }>()
const expanded = ref((props.depth || 0) === 0)
const createMenu = ref(false)
const children = () => Array.isArray(props.node.children) ? props.node.children as RecordRow[] : []
const typeClass = () => String(props.node.nodeType || '').toLowerCase().replace('_', '-')
const typeIcon = () => ({ CATEGORY: FolderTree, BRAND: Tag, SERIES: Layers3, MODEL: Boxes, VERSION: GitBranch, ATTRIBUTE_GROUP: FolderTree, ATTRIBUTE: Tag, POINT_CATEGORY: FolderTree, STANDARD_POINT: CircleGauge, ORG: FolderTree, GATEWAY: RadioTower } as Record<string, unknown>)[String(props.node.nodeType)] || Tag
const canCreateSibling = () => ['CATEGORY', 'BRAND', 'SERIES', 'MODEL'].includes(String(props.node.nodeType))
const canCreateChild = () => ['CATEGORY', 'BRAND', 'SERIES', 'MODEL'].includes(String(props.node.nodeType))

watch(() => props.expandToken, () => { expanded.value = true })
watch(() => props.collapseToken, () => { expanded.value = false })
watch(() => props.node, () => { expanded.value = Boolean(props.node.searchExpanded) || (props.depth || 0) === 0 })
watch(() => props.node.searchExpanded, (value) => { if (value) expanded.value = true })
</script>

<template>
  <div class="catalog-tree-node">
    <div
      class="catalog-tree-line"
      :class="{ active: selectedKey === String(node.key) }"
      :style="{ paddingLeft: `${(depth || 0) * 16}px` }"
      @click="emit('select', node)"
    >
      <button v-if="children().length" class="catalog-tree-caret" type="button" :aria-label="expanded ? '收起' : '展开'" @click="expanded = !expanded">
        <ChevronDown v-if="expanded" :size="14" />
        <ChevronRight v-else :size="14" />
      </button>
      <span v-else class="catalog-tree-caret placeholder"></span>
      <button class="archive-tree-item catalog-tree-select" type="button" tabindex="-1" @click.stop="emit('select', node)">
        <span class="archive-tree-type" :class="typeClass()"><component :is="typeIcon()" :size="15" :stroke-width="1.8" /></span>
        <span class="catalog-tree-label"><b>{{ node.label }}</b><small v-if="node.code">{{ node.code }}</small></span>
        <em v-if="node.status" :class="['catalog-status-dot', String(node.status).toLowerCase()]" :title="String(node.status)"></em>
      </button>
      <template v-if="showActions && ['CATEGORY', 'BRAND', 'SERIES', 'MODEL', 'ATTRIBUTE_GROUP', 'ATTRIBUTE', 'STANDARD_POINT'].includes(String(node.nodeType))">
        <div v-if="canCreateSibling() || canCreateChild()" class="catalog-create-menu">
          <button class="catalog-tree-action" type="button" title="新增" aria-label="新增" @click.stop="createMenu = !createMenu"><Plus :size="15" /></button>
          <div v-if="createMenu" class="catalog-create-popover" @click.stop>
            <button v-if="canCreateSibling()" type="button" @click="createMenu = false; emit('createSibling', node)">新增同级</button>
            <button v-if="canCreateChild()" type="button" @click="createMenu = false; emit('createChild', node)">新增下级</button>
          </div>
        </div>
        <button v-if="node.nodeType === 'MODEL'" class="catalog-tree-action" type="button" title="查看" aria-label="查看" @click.stop="emit('detail', node)"><Eye :size="15" /></button>
        <button class="catalog-tree-action" type="button" title="编辑" aria-label="编辑" @click.stop="emit('edit', node)"><Pencil :size="15" /></button>
        <button class="catalog-tree-action danger" type="button" title="删除" aria-label="删除" @click.stop="emit('remove', node)"><Trash2 :size="15" /></button>
      </template>
      <button v-else-if="showDetailAction && node.nodeType === 'MODEL'" class="catalog-tree-detail" type="button" title="查看型号详情" aria-label="查看型号详情" @click.stop="emit('detail', node)"><Eye :size="15" /></button>
    </div>
    <div v-if="expanded && children().length">
      <CatalogTreeNode
        v-for="child in children()"
        :key="String(child.key)"
        :node="child"
        :selected-key="selectedKey"
        :depth="(depth || 0) + 1"
        :expand-token="expandToken"
        :collapse-token="collapseToken"
        :show-detail-action="showDetailAction"
        :show-actions="showActions"
        @select="emit('select', $event)"
        @detail="emit('detail', $event)"
        @edit="emit('edit', $event)"
        @remove="emit('remove', $event)"
        @create-sibling="emit('createSibling', $event)"
        @create-child="emit('createChild', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.catalog-tree-line{position:relative;min-height:38px;display:flex;align-items:center;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s ease,color .15s ease,box-shadow .15s ease}.catalog-tree-line:hover{background:#f2f7ff}.catalog-tree-line.active{background:#e8f2ff;box-shadow:inset 3px 0 var(--accent)}.catalog-tree-line.active .catalog-tree-label b{color:var(--accent);font-weight:700}.catalog-tree-caret{width:22px;height:31px;display:grid;place-items:center;flex:none;padding:0;border:0;background:transparent;color:#8a9bad;line-height:0}.catalog-tree-caret.placeholder{display:block}.catalog-tree-select{min-width:0;flex:1;padding:5px 7px;background:transparent!important}.catalog-tree-select:hover,.catalog-tree-select:focus,.catalog-tree-select.active{background:transparent!important;color:inherit!important}.catalog-tree-label{min-width:0;display:grid;gap:3px}.catalog-tree-label b,.catalog-tree-label small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.catalog-tree-label b{font-size:14px;font-weight:500}.catalog-tree-label small{color:var(--muted);font-size:11px}.catalog-tree-detail,.catalog-tree-action{width:30px;height:30px;display:grid;place-items:center;flex:none;padding:0;border:0;border-radius:5px;background:transparent;color:var(--accent);line-height:0;opacity:.72}.catalog-tree-line:hover .catalog-tree-detail,.catalog-tree-line:hover .catalog-tree-action,.catalog-tree-line.active .catalog-tree-detail,.catalog-tree-line.active .catalog-tree-action{opacity:1}.catalog-tree-detail:hover,.catalog-tree-action:hover{background:#dcecff}.catalog-tree-action.danger{color:var(--danger)}.catalog-create-menu{position:relative;flex:none}.catalog-create-popover{position:absolute;right:0;top:31px;z-index:5;display:grid;min-width:94px;padding:5px;border:1px solid #cfe0f7;border-radius:7px;background:#fff;box-shadow:0 10px 24px #17375c20}.catalog-create-popover button{height:28px;border:0;border-radius:5px;background:transparent;color:#36516f;font-size:12px;text-align:left}.catalog-create-popover button:hover{background:#eef6ff;color:var(--accent)}.catalog-status-dot{width:8px;height:8px;margin-left:auto;border-radius:50%;background:#9aa8b8}.catalog-status-dot.published{background:var(--accent)}.catalog-status-dot.draft{background:#e09a2b}.catalog-status-dot.disabled{background:#aab2bc}.archive-tree-type{position:relative;width:25px;height:25px;display:block;flex:none;border-radius:6px;background:#eef4ff;color:#506f9b;line-height:0}.archive-tree-type.attribute{background:#f5f7fa;color:#67788e}.archive-tree-type.standard-point{background:#eefaf5;color:#27845f}
.catalog-tree-caret :deep(svg),.catalog-tree-action :deep(svg),.catalog-tree-detail :deep(svg){display:block;margin:auto}.archive-tree-type :deep(svg){position:absolute;left:50%;top:50%;display:block;margin:0;transform:translate(-50%,-50%)}
.catalog-status-dot.published{background:var(--accent)}
</style>
