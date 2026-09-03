<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, CircleGauge, Eye, FolderPlus, FolderTree, Pencil, Plus, RefreshCw, Search, Tag, Trash2 } from '@lucide/vue'
import { useRoute } from 'vue-router'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import { catalogAttributeTree, catalogCreate, catalogDeleteNode, catalogPointGroupCreate, catalogPointTree, catalogUpdateNode } from '@/api/platform'
import type { RecordRow } from '@/types/domain'
import { useSessionStore } from '@/stores/session'

type CreateKind = 'group' | 'attribute' | 'attribute-value' | 'point'
const route = useRoute(); const session = useSessionStore()
const isPoint = computed(() => String(route.name) === 'global-points')
const title = computed(() => isPoint.value ? '终端点位' : '全域属性')
const tree = ref<RecordRow[]>([]); const keyword = ref(''); const loading = ref(false); const saving = ref(false); const error = ref('')
const dialog = ref(false); const detailDialog = ref(false); const deleteDialog = ref(false)
const editing = ref<RecordRow | null>(null); const detail = ref<RecordRow | null>(null); const deleting = ref<RecordRow | null>(null)
const expanded = ref(new Set<string>()); const createKind = ref<CreateKind>('group'); const form = reactive<Record<string, any>>({})
const canEdit = computed(() => session.can('catalog:attribute:manage') || session.can('archive:edit'))
const children = (node: RecordRow) => Array.isArray(node.children) ? node.children as RecordRow[] : []
const typeOf = (node: RecordRow) => String(node.nodeType || '')
const isPointCategory = (node: RecordRow) => isPoint.value && typeOf(node) === 'POINT_CATEGORY'
const isGroup = (node: RecordRow) => typeOf(node).includes('GROUP') || isPointCategory(node)
const isReadOnlyContainer = (node: RecordRow) => isPointCategory(node)
const isValue = (node: RecordRow) => typeOf(node) === 'ATTRIBUTE_VALUE'
const iconOf = (node: RecordRow) => isGroup(node) ? FolderTree : isValue(node) ? Tag : isPoint.value ? CircleGauge : Tag
function val(row: RecordRow, ...keys: string[]) { for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key]; return '' }
function show(value: unknown) { return value === null || value === undefined || value === '' ? '—' : String(value) }
function matches(row: RecordRow) { const q = keyword.value.trim().toLowerCase(); return !q || [row.label,row.code,row.group_name,row.group_code,row.attribute_name,row.attribute_code,row.point_name,row.point_code,row.value_text,row.value_code].filter(Boolean).join(' ').toLowerCase().includes(q) }
function subtreeMatches(row: RecordRow): boolean { return matches(row) || children(row).some(subtreeMatches) }
function visibleRows(nodes: RecordRow[], parent = '', depth = 0): RecordRow[] { const out: RecordRow[] = []; for (const node of nodes) { if (keyword.value.trim() && !subtreeMatches(node)) continue; out.push({ ...node, parent_label: parent, tree_depth: depth }); if (expanded.value.has(String(node.key)) || keyword.value.trim()) out.push(...visibleRows(children(node), String(node.label || parent), depth + 1)) } return out }
const rows = computed(() => visibleRows(tree.value))
const detailType = computed(() => {
  const node = detail.value
  if (!node) return ''
  if (isPointCategory(node)) return '通用测点容器'
  if (isGroup(node)) return isPoint.value ? '测点组' : '属性组'
  if (isValue(node)) return '固定值'
  return isPoint.value ? '标准测点' : '全域属性'
})
const details = computed(() => {
  const node = detail.value; if (!node) return [] as Array<{ label: string; value: string }>
  if (isGroup(node)) return [['分组名称','group_name','label'],['分组编码','group_code','code'],['上级分组','parent_label'],['排序','sort']].map(([label,...keys]) => ({ label, value: show(val(node, ...keys)) }))
  if (isValue(node)) return [['所属属性','parent_label'],['固定值编码','value_code','code'],['固定值','value_text','label'],['排序','sort']].map(([label,...keys]) => ({ label, value: show(val(node, ...keys)) }))
  const fields = isPoint.value
    ? [['测点名称','point_name','label'],['测点编码','point_code','code'],['数据类型','data_type'],['单位','unit'],['业务角色','business_role'],['说明','description']]
    : [['属性名称','attribute_name','label'],['属性编码','attribute_code','code'],['数据类型','data_type'],['单位','unit'],['用途','usage_type'],['是否必填','required'],['固定值数量','children']]
  return fields.map(([label,...keys]) => ({ label, value: label === '是否必填' ? (Number(val(node, 'required')) ? '是' : '否') : label === '固定值数量' ? `${children(node).length} 项` : show(val(node, ...keys)) }))
})
let loadRequest = 0
function collectExpandedKeys(nodes: RecordRow[], keys = new Set<string>()) {
  nodes.forEach((node) => {
    if (children(node).length) keys.add(String(node.key))
    collectExpandedKeys(children(node), keys)
  })
  return keys
}
function expandAll() { expanded.value = collectExpandedKeys(tree.value) }
function collapseAll() { expanded.value = new Set() }
async function load() { const request = ++loadRequest; loading.value = true; error.value = ''; try { const data = isPoint.value ? await catalogPointTree() : await catalogAttributeTree(); if (request !== loadRequest) return; tree.value = data; expanded.value = collectExpandedKeys(data) } catch (e) { if (request === loadRequest) error.value = e instanceof Error ? e.message : '字典加载失败' } finally { if (request === loadRequest) loading.value = false } }
function resetForm() { Object.keys(form).forEach((key) => delete form[key]) }
function toggle(row: RecordRow) { const next = new Set(expanded.value); const key = String(row.key); next.has(key) ? next.delete(key) : next.add(key); expanded.value = next }
function openCreate(kind: CreateKind, parent?: RecordRow) { resetForm(); editing.value = null; createKind.value = kind
  if (kind === 'group') Object.assign(form, { parentId: parent?.id || 0, groupCode: '', groupName: '', sort: 0 })
  if (kind === 'attribute') Object.assign(form, { groupId: parent?.id || '', attributeCode: '', attributeName: '', dataType: 'STRING', usageType: 'SPEC', unit: '', required: 0, defaultValue: '', validationRule: '', sort: 0 })
  if (kind === 'attribute-value') Object.assign(form, { attributeId: parent?.id || '', valueCode: '', valueText: '', sort: 0 })
  if (kind === 'point') Object.assign(form, { groupId: parent?.id || '', pointCode: '', pointName: '', dataType: 'DOUBLE', unit: '', businessRole: 'INSTANT_VALUE', description: '' })
  dialog.value = true
}
function editNode(node: RecordRow) { resetForm(); editing.value = node
  if (isGroup(node)) Object.assign(form, { parentId: val(node,'parent_id') || 0, groupCode: val(node,'group_code','code'), groupName: val(node,'group_name','label'), sort: val(node,'sort') || 0 })
  else if (isValue(node)) Object.assign(form, { attributeId: val(node,'attribute_id'), valueCode: val(node,'value_code','code'), valueText: val(node,'value_text','label'), sort: val(node,'sort') || 0 })
  else if (isPoint.value) Object.assign(form, { groupId: val(node,'group_id'), pointCode: val(node,'point_code','code'), pointName: val(node,'point_name','label'), dataType: val(node,'data_type') || 'DOUBLE', unit: val(node,'unit'), businessRole: val(node,'business_role') || 'INSTANT_VALUE', description: val(node,'description') })
  else Object.assign(form, { groupId: val(node,'group_id'), attributeCode: val(node,'attribute_code','code'), attributeName: val(node,'attribute_name','label'), dataType: val(node,'data_type') || 'STRING', usageType: val(node,'usage_type') || 'SPEC', unit: val(node,'unit'), required: val(node,'required') || 0, defaultValue: val(node,'default_value'), validationRule: typeof val(node,'validation_rule') === 'object' ? JSON.stringify(val(node,'validation_rule')) : val(node,'validation_rule'), sort: val(node,'sort') || 0 })
  dialog.value = true
}
async function save() { saving.value = true; error.value = ''; try { if (editing.value) await catalogUpdateNode(typeOf(editing.value), editing.value.id, form); else if (createKind.value === 'group' && isPoint.value) await catalogPointGroupCreate(form); else await catalogCreate(createKind.value === 'attribute-value' ? 'attribute-values' : createKind.value === 'point' ? 'standard-points' : createKind.value === 'attribute' ? 'attributes' : 'attribute-groups', form); dialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '保存失败' } finally { saving.value = false } }
function askDelete(node: RecordRow) { deleting.value = node; deleteDialog.value = true }
async function remove() { if (!deleting.value) return; saving.value = true; try { await catalogDeleteNode(typeOf(deleting.value), deleting.value.id); deleteDialog.value = false; await load() } catch (e) { error.value = e instanceof Error ? e.message : '删除失败' } finally { saving.value = false } }
watch(isPoint, () => { keyword.value = ''; detail.value = null; editing.value = null; dialog.value = false; void load() })
onMounted(load)
</script>

<template>
  <section class="view-page dictionary-page">
    <header class="view-head"><div><p class="eyebrow">GLOBAL DICTIONARY</p><h1>{{ title }}</h1></div><button class="icon-btn" title="刷新" @click="load"><RefreshCw :size="16" /></button></header>
    <p v-if="error" class="notice">{{ error }}</p>
    <article class="panel dictionary-panel"><div class="dictionary-toolbar"><label class="catalog-search"><Search :size="14" /><input v-model.trim="keyword" placeholder="搜索名称、编码或分组"></label><div class="dictionary-expand-tools"><button class="quiet" type="button" @click="expandAll"><ChevronDown :size="14" />全展开</button><button class="quiet" type="button" @click="collapseAll"><ChevronRight :size="14" />全收起</button></div><button v-if="canEdit" class="primary dictionary-create-btn" @click="openCreate('group')"><FolderPlus :size="15" />新增{{ isPoint ? '测点组' : '属性组' }}</button></div>
      <div class="dictionary-table"><table><thead><tr><th class="tree-column">名称</th><template v-if="isPoint"><th>数据类型</th><th>单位</th><th>业务角色</th></template><template v-else><th>属性/固定值编码</th><th>用途</th><th>固定值</th></template><th class="actions-col">操作</th></tr></thead><tbody>
        <tr v-for="row in rows" :key="String(row.key)" :class="{ 'group-row': isGroup(row), 'value-row': isValue(row) }"><td><div class="dictionary-tree-cell" :style="{ paddingLeft: `${Number(row.tree_depth || 0) * 22}px` }"><button v-if="children(row).length" class="tree-toggle" type="button" @click="toggle(row)"><ChevronDown v-if="expanded.has(String(row.key))" :size="15" /><ChevronRight v-else :size="15" /></button><span v-else class="tree-toggle placeholder"></span><span class="dictionary-node-icon"><component :is="iconOf(row)" :size="15" /></span><span><b>{{ row.label }}<template v-if="isPoint && !isGroup(row) && val(row, 'point_code', 'code')"> ({{ val(row, 'point_code', 'code') }})</template></b><small v-if="row.parent_label">{{ row.parent_label }}</small></span></div></td><template v-if="isGroup(row)"><td :colspan="3" class="group-empty-cell"></td></template><template v-else-if="isPoint"><td>{{ row.data_type || '—' }}</td><td>{{ row.unit || '—' }}</td><td>{{ row.business_role || '—' }}</td></template><template v-else><td>{{ row.attribute_code || row.value_code || row.code || '—' }}</td><td>{{ row.usage_type || '—' }}</td><td>{{ row.value_text || (typeOf(row) === 'ATTRIBUTE' ? `${children(row).length} 个候选值` : '—') }}</td></template><td><div class="dictionary-actions"><template v-if="isGroup(row) && !isReadOnlyContainer(row)"><button v-if="canEdit" class="icon-btn" title="新增子分组" @click="openCreate('group',row)"><FolderPlus :size="15" /></button><button v-if="canEdit" class="icon-btn" title="新增子项" @click="openCreate(isPoint ? 'point' : 'attribute',row)"><Plus :size="15" /></button></template><button v-else-if="!isPoint && typeOf(row) === 'ATTRIBUTE' && canEdit" class="icon-btn" title="新增固定值" @click="openCreate('attribute-value',row)"><Plus :size="15" /></button><button class="icon-btn" title="查看详情" @click="detail=row;detailDialog=true"><Eye :size="15" /></button><button v-if="canEdit && !isReadOnlyContainer(row)" class="icon-btn" title="编辑" @click="editNode(row)"><Pencil :size="15" /></button><button v-if="canEdit && !isReadOnlyContainer(row)" class="icon-btn danger-text" title="删除" @click="askDelete(row)"><Trash2 :size="15" /></button></div></td></tr>
        <tr v-if="!rows.length && !loading"><td colspan="5" class="empty-cell">暂无数据</td></tr></tbody></table></div>
    </article>
    <AppDialog v-model:open="dialog" :title="editing ? `编辑${title}` : `新增${title}`" :saving="saving" @submit="save"><div class="dialog-fields"><template v-if="editing && isValue(editing) || !editing && createKind === 'attribute-value'"><label class="dialog-field"><span>固定值编码*</span><input v-model="form.valueCode"></label><label class="dialog-field"><span>固定值*</span><input v-model="form.valueText"></label></template><template v-else-if="(editing && isGroup(editing)) || (!editing && createKind === 'group')"><label class="dialog-field"><span>分组编码*</span><input v-model="form.groupCode"></label><label class="dialog-field"><span>分组名称*</span><input v-model="form.groupName"></label></template><template v-else-if="!isPoint"><label class="dialog-field"><span>属性编码*</span><input v-model="form.attributeCode"></label><label class="dialog-field"><span>属性名称*</span><input v-model="form.attributeName"></label><label class="dialog-field"><span>数据类型</span><AppSelect v-model="form.dataType"><option>STRING</option><option>NUMBER</option><option>BOOLEAN</option></AppSelect></label><label class="dialog-field"><span>单位</span><input v-model="form.unit"></label><label class="dialog-field"><span>用途</span><AppSelect v-model="form.usageType"><option>SPEC</option><option>CONFIG</option><option>LIMIT</option></AppSelect></label><label class="dialog-field"><span>是否必填</span><AppSelect v-model.number="form.required"><option :value="0">否</option><option :value="1">是</option></AppSelect></label></template><template v-else><label class="dialog-field"><span>测点编码*</span><input v-model="form.pointCode"></label><label class="dialog-field"><span>测点名称*</span><input v-model="form.pointName"></label><label class="dialog-field"><span>数据类型</span><AppSelect v-model="form.dataType"><option>DOUBLE</option><option>INTEGER</option><option>STRING</option><option>BOOLEAN</option></AppSelect></label><label class="dialog-field"><span>单位</span><input v-model="form.unit"></label><label class="dialog-field"><span>业务角色</span><input v-model="form.businessRole"></label><label class="dialog-field full"><span>说明</span><textarea v-model="form.description"></textarea></label></template></div></AppDialog>
    <AppDialog v-model:open="detailDialog" dialog-class="dictionary-detail-dialog" :hide-actions="true" :title="`${detail?.label || ''} · 详细信息`"><div class="dictionary-detail-card"><div class="dictionary-detail-summary"><span class="dictionary-node-icon"><component v-if="detail" :is="iconOf(detail)" :size="18" /></span><div><b>{{ detail?.label }}</b><small>{{ detailType }}<template v-if="detail?.code"> · {{ detail.code }}</template></small></div></div><div class="detail-grid"><div v-for="field in details" :key="field.label" class="detail-item"><span>{{ field.label }}</span><strong>{{ field.value }}</strong></div></div></div></AppDialog>
    <AppConfirmDialog v-model:open="deleteDialog" :title="`删除${deleting?.label || ''}`" message="被产品模板引用的数据不能删除。确认继续吗？" :loading="saving" confirm-text="确认删除" @confirm="remove" />
  </section>
</template>

<style scoped>
.dictionary-page{height:100%;min-height:0;display:flex;flex-direction:column}.dictionary-panel{flex:1;min-height:0;overflow:hidden}.dictionary-toolbar{display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid var(--border);background:#fbfdff}.dictionary-toolbar .catalog-search{width:min(480px,44vw);height:36px;display:flex;align-items:center;gap:8px;margin:0;padding:0 11px;border:1px solid var(--border);border-radius:4px;background:#fff;color:#8a9bad}.dictionary-toolbar .catalog-search:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px #2879df12}.dictionary-toolbar .catalog-search input{min-width:0;flex:1;border:0;outline:0;background:transparent}.dictionary-toolbar button{display:inline-flex;align-items:center;gap:5px}.dictionary-expand-tools{display:flex;align-items:center;gap:7px}.dictionary-expand-tools .quiet{height:32px;padding:0 10px;font-size:12px}.dictionary-create-btn{margin-left:auto;height:34px}.dictionary-table{height:calc(100% - 65px);overflow:auto}.dictionary-table table{width:100%;min-width:920px;border-collapse:collapse;font-size:12px;table-layout:fixed}.dictionary-table th,.dictionary-table td{height:48px;padding:7px 12px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}.dictionary-table th{background:#f7f9fc;color:#5b6e84}.tree-column{width:42%;min-width:420px}.group-row td{background:#fbfdff}.value-row td{background:#fff}.group-empty-cell{color:transparent}.dictionary-tree-cell{display:flex;align-items:center;gap:8px;min-width:0}.tree-toggle{width:22px;height:30px;display:grid;place-items:center;flex:none;padding:0;border:0;background:transparent;color:#8798aa;line-height:0}.tree-toggle.placeholder{display:block}.dictionary-node-icon{width:27px;height:27px;display:grid;place-items:center;flex:none;border-radius:7px;background:#eef4ff;color:#2879df;line-height:0}.tree-toggle svg,.dictionary-node-icon svg{display:block;margin:auto}.dictionary-tree-cell span:last-child{display:grid;gap:3px;min-width:0}.dictionary-tree-cell b{font-weight:600;color:#263d58;overflow:hidden;text-overflow:ellipsis}.dictionary-tree-cell small{color:var(--muted);font-size:10px}.actions-col{width:220px}.dictionary-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:192px;white-space:nowrap}.dictionary-actions .icon-btn{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;padding:0;line-height:0}.dictionary-detail-card{display:grid;gap:14px;padding:16px}.dictionary-detail-summary{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #dbe7f5;border-radius:8px;background:#f7fbff}.dictionary-detail-summary .dictionary-node-icon{width:36px;height:36px;border-radius:8px}.dictionary-detail-summary b,.dictionary-detail-summary small{display:block}.dictionary-detail-summary b{color:#263d58;font-size:16px}.dictionary-detail-summary small{margin-top:4px;color:#6d8198;font-size:12px}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.detail-item{min-height:68px;display:grid;align-content:center;gap:6px;padding:12px 14px;border:1px solid #e1e9f3;border-radius:8px;background:#fff}.detail-item span{color:#70849c;font-size:11px}.detail-item strong{color:#263d58;font-size:13px;font-weight:600;white-space:pre-wrap;word-break:break-word}.dictionary-page :deep(.dictionary-detail-dialog){width:min(720px,calc(100vw - 40px))}
@media(max-width:760px){.dictionary-toolbar{align-items:stretch;flex-wrap:wrap}.dictionary-toolbar .catalog-search{width:100%}.dictionary-create-btn{margin-left:0}.detail-grid{grid-template-columns:1fr}}
</style>
