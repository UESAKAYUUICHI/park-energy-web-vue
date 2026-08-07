<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowLeft, BadgeCheck, ChevronRight, CopyPlus, Plus, RefreshCw, Save, Search, X } from '@lucide/vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppConfirmDialog from '@/components/app/AppConfirmDialog.vue'
import CatalogTreeNode from '@/components/catalog/CatalogTreeNode.vue'
import DictionarySelectTree from '@/components/catalog/DictionarySelectTree.vue'
import { catalogAttributeTree, catalogCreate, catalogCreateVersion, catalogDeleteNode, catalogDeleteVersion, catalogLookups, catalogModel, catalogPointTree, catalogSaveAttributes, catalogSavePoints, catalogTree, catalogUpdateNode, catalogUpdateVersion, catalogVersionAction } from '@/api/platform'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

type TreeMode = 'products' | 'attributes'
type DetailTab = 'basic' | 'attributes' | 'points' | 'devices'
type CreateKind = 'categories' | 'brands' | 'series' | 'models' | 'attribute-groups' | 'attributes' | 'standard-points'

const session = useSessionStore()
const treeMode = ref<TreeMode>('products')
const tab = ref<DetailTab>('basic')
const tree = ref<RecordRow[]>([])
const attributeTree = ref<RecordRow[]>([])
const pointTree = ref<RecordRow[]>([])
const lookups = ref<RecordRow>({})
const selected = ref<RecordRow | null>(null)
const selectedKey = computed(() => String(selected.value?.key || ''))
const detail = ref<RecordRow>({})
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const keyword = ref('')
const expandToken = ref(0)
const collapseToken = ref(0)
const createDialog = ref(false)
const createKind = ref<CreateKind>('categories')
const validation = ref<RecordRow | null>(null)
const validationState = ref<'idle' | 'running' | 'passed' | 'failed'>('idle')
const validationRunId = ref(0)
const validationCache = new Map<string, RecordRow>()
const modelDialog = ref(false)
const hierarchyKeyword = ref('')
const selectedCategoryId = ref('')
const catalogEditNode = ref<RecordRow | null>(null)
const catalogDeleteNodeRef = ref<RecordRow | null>(null)
const catalogDeleteDialog = ref(false)
const versionDeleteDialog = ref(false)
const versionDeleteTarget = ref<RecordRow | null>(null)
const createParentLocked = ref(false)
const versionForm = reactive({ collectIntervalSeconds: 300, qualityThresholdPct: 95, protocolType: 'JSON', remark: '' })
const attributeDrafts = ref<RecordRow[]>([])
const pointDrafts = ref<RecordRow[]>([])
const templateAttributeKeyword = ref('')
const templateAttributeGroupFilter = ref('')
const templatePointKeyword = ref('')
const templatePointGroupFilter = ref('')
const referencedDeviceKeyword = ref('')
const referencedDeviceOrgFilter = ref('')
const referencedDeviceStatusFilter = ref('')
const selectedAttributeIds = ref<string[]>([])
const selectedPointIds = ref<string[]>([])
const batchDialog = ref<'attributes' | 'points' | null>(null)
const batchKeyword = ref('')
const createForm = reactive<Record<string, any>>({})

const activeTree = computed(() => treeMode.value === 'products' ? tree.value : attributeTree.value)
const categoryTree = computed(() => categoryOnly(tree.value))
const selectedCategory = computed(() => selectedCategoryId.value
  ? findNode(tree.value, 'CATEGORY', selectedCategoryId.value)
  : selected.value?.nodeType === 'CATEGORY' ? selected.value : null)
const productHierarchy = computed(() => filterTreeNodes(trimProductTree(nodeChildren(selectedCategory.value || {})), hierarchyKeyword.value))
const model = computed(() => detail.value.model as RecordRow || {})
const version = computed(() => detail.value.version as RecordRow || {})
const versions = computed(() => Array.isArray(detail.value.versions) ? detail.value.versions as RecordRow[] : [])
const devices = computed(() => Array.isArray(detail.value.devices) ? detail.value.devices as RecordRow[] : [])
const templateAttributeGroupOptions = computed(() => [...new Set(attributeDrafts.value.map((item) => String(item.group_name || '未分组属性')))])
const templatePointGroupOptions = computed(() => [...new Set(pointDrafts.value.map((item) => String(item.point_group_name || '未分组测点')))])
const referencedDeviceOrgOptions = computed(() => [...new Set(devices.value.map((item) => String(item.org_name || '未分配组织')))])
const referencedDeviceStatusOptions = computed(() => [...new Set(devices.value.map((item) => String(item.status || '—')))])
const filteredAttributeDrafts = computed(() => {
  const query = templateAttributeKeyword.value.trim().toLowerCase()
  return attributeDrafts.value.filter((item) => {
    const text = [item.attribute_name, item.attribute_code, item.attribute_value, item.group_name].filter(Boolean).join(' ').toLowerCase()
    return (!query || text.includes(query)) && (!templateAttributeGroupFilter.value || String(item.group_name || '未分组属性') === templateAttributeGroupFilter.value)
  })
})
const attributeBindingGroups = computed(() => {
  const groups = new Map<string, RecordRow[]>()
  filteredAttributeDrafts.value.forEach((item) => {
    const name = String(item.group_name || '未分组属性')
    groups.set(name, [...(groups.get(name) || []), item])
  })
  return [...groups.entries()].map(([name, items]) => ({ name, items }))
})
const filteredPointDrafts = computed(() => {
  const query = templatePointKeyword.value.trim().toLowerCase()
  return pointDrafts.value.filter((item) => {
    const text = [item.point_name, item.point_code, item.point_group_name, item.mapping_protocol_type, item.source_path, item.register_address].filter(Boolean).join(' ').toLowerCase()
    return (!query || text.includes(query)) && (!templatePointGroupFilter.value || String(item.point_group_name || '未分组测点') === templatePointGroupFilter.value)
  })
})
const realtimePointGroups = computed(() => {
  const groups = new Map<string, RecordRow[]>()
  filteredPointDrafts.value.forEach((item) => {
    const name = String(item.point_group_name || '未分组测点')
    groups.set(name, [...(groups.get(name) || []), item])
  })
  return [...groups.entries()].map(([name, items]) => ({ name, items }))
})
const filteredReferencedDevices = computed(() => {
  const query = referencedDeviceKeyword.value.trim().toLowerCase()
  return devices.value.filter((item) => {
    const text = [item.device_sn, item.device_name, item.org_name, item.gateway_name, item.gateway_sn].filter(Boolean).join(' ').toLowerCase()
    return (!query || text.includes(query))
      && (!referencedDeviceOrgFilter.value || String(item.org_name || '未分配组织') === referencedDeviceOrgFilter.value)
      && (!referencedDeviceStatusFilter.value || String(item.status || '—') === referencedDeviceStatusFilter.value)
  })
})
const isModel = computed(() => ['MODEL', 'VERSION'].includes(String(selected.value?.nodeType)))
const isDraft = computed(() => String(version.value.status) === 'DRAFT')
const isDisabledVersion = computed(() => String(version.value.status) === 'DISABLED')
const canPublishVersion = computed(() => ['DRAFT', 'DISABLED'].includes(String(version.value.status)))
const canDeleteVersion = computed(() => canRemoveVersion(version.value))
const canAdd = computed(() => session.can('catalog:edit') || session.can('catalog:attribute:manage') || session.can('archive:add'))
const canEdit = computed(() => session.can('catalog:edit') || session.can('archive:edit'))
const canPublish = computed(() => session.can('catalog:publish') || session.can('archive:edit'))
const canDisable = computed(() => session.can('catalog:disable') || session.can('archive:edit'))
const categories = computed(() => Array.isArray(lookups.value.categories) ? lookups.value.categories as RecordRow[] : [])
const brands = computed(() => Array.isArray(lookups.value.brands) ? lookups.value.brands as RecordRow[] : [])
const seriesOptions = computed(() => Array.isArray(lookups.value.series) ? lookups.value.series as RecordRow[] : [])
const attributeGroups = computed(() => Array.isArray(lookups.value.attributeGroups) ? lookups.value.attributeGroups as RecordRow[] : [])
const standardPoints = computed(() => {
  const rows = Array.isArray(lookups.value.standardPoints) ? lookups.value.standardPoints as RecordRow[] : []
  const dynamicRows = rows.filter((item) => String(item.value_mode || 'REALTIME') === 'REALTIME')
  if (!model.value.category_id) return dynamicRows
  return dynamicRows.filter((item) => !item.category_id || String(item.category_id) === String(model.value.category_id))
})
const availableAttributes = computed(() => {
  return (Array.isArray(lookups.value.attributes) ? lookups.value.attributes as RecordRow[] : []).filter((item) => String(item.value_mode || 'FIXED') === 'FIXED' && (!model.value.category_id || !item.category_id || String(item.category_id) === String(model.value.category_id)))
})
const availablePoints = computed(() => {
  const selectedCodes = new Set(pointDrafts.value.map((item) => String(item.point_code).toLowerCase()))
  return standardPoints.value.filter((item) => !selectedCodes.has(String(item.point_code).toLowerCase()))
})
const attributeValues = computed(() => Array.isArray(lookups.value.attributeValues) ? lookups.value.attributeValues as RecordRow[] : [])
function optionsForAttribute(attributeId: unknown) {
  return attributeValues.value.filter((item) => String(item.attribute_id) === String(attributeId))
}
const createTitle = computed(() => {
  const title = ({ categories: '分类', brands: '品牌', series: '产品系列', models: '产品型号', 'attribute-groups': '属性分类', attributes: '属性定义', 'standard-points': '标准测点' } as Record<CreateKind, string>)[createKind.value]
  return catalogEditNode.value ? `编辑${title}` : `新增${title}`
})

function camel(row: RecordRow, camelKey: string, snakeKey: string) { return row[camelKey] ?? row[snakeKey] }
function statusLabel(value: unknown) { return ({ DRAFT: '草稿', PUBLISHED: '已发布', DISABLED: '已停用' } as Record<string, string>)[String(value)] || String(value || '—') }
function nodeChildren(node: RecordRow): RecordRow[] { return Array.isArray(node.children) ? node.children as RecordRow[] : [] }
function validationKey(value: unknown = version.value.id) { return String(value || '') }
function clearValidationCache(value: unknown = version.value.id) {
  const key = validationKey(value)
  if (key) validationCache.delete(key)
  validation.value = null
  validationState.value = 'idle'
}
function firstNode(nodes: RecordRow[], nodeType: string): RecordRow | null { for (const node of nodes) { if (node.nodeType === nodeType) return node; const found = firstNode(nodeChildren(node), nodeType); if (found) return found } return null }
function categoryOnly(nodes: RecordRow[]): RecordRow[] { return nodes.filter((node) => node.nodeType === 'CATEGORY').map((node) => ({ ...node, children: categoryOnly(nodeChildren(node)) })) }
function trimProductTree(nodes: RecordRow[]): RecordRow[] {
  return nodes.filter((node) => ['BRAND', 'SERIES', 'MODEL'].includes(String(node.nodeType))).map((node) => ({
    ...node,
    children: trimProductTree(nodeChildren(node)),
  }))
}
function filterTreeNodes(nodes: RecordRow[], value: string): RecordRow[] {
  const query = value.trim().toLowerCase()
  if (!query) return nodes
  return nodes.reduce<RecordRow[]>((result, node) => {
    const children = filterTreeNodes(nodeChildren(node), value)
    const text = [node.label, node.code, node.brand_name, node.series_name, node.model_name].filter(Boolean).join(' ').toLowerCase()
    if (text.includes(query) || children.length) result.push({ ...node, children })
    return result
  }, [])
}
function findNode(nodes: RecordRow[], nodeType: string, id: unknown): RecordRow | null {
  for (const node of nodes) {
    if (node.nodeType === nodeType && String(node.id) === String(id)) return node
    const found = findNode(nodeChildren(node), nodeType, id)
    if (found) return found
  }
  return null
}
function findParent(nodes: RecordRow[], target: RecordRow, parent: RecordRow | null = null): RecordRow | null {
  for (const node of nodes) {
    if (String(node.nodeType) === String(target.nodeType) && String(node.id) === String(target.id)) return parent
    const found = findParent(nodeChildren(node), target, node)
    if (found) return found
  }
  return null
}
function canRemoveVersion(row: RecordRow) {
  return ['DRAFT', 'DISABLED'].includes(String(row.status)) && Number(row.reference_count || 0) === 0
}

async function loadAll(keepSelection = true) {
  loading.value = true
  error.value = ''
  try {
    const [productRows, lookupRows] = await Promise.all([catalogTree(keyword.value), catalogLookups()])
    tree.value = productRows
    lookups.value = lookupRows
    void loadDictionaryTrees().catch((e) => { error.value = e instanceof Error ? e.message : '目录字典读取失败' })
    if (keepSelection && selected.value?.nodeType === 'MODEL') await loadModel(selected.value.id)
    else if (keepSelection && selected.value?.nodeType === 'VERSION') await loadModel(selected.value.modelId, selected.value.versionId)
    else if (!selected.value) {
      const initial = treeMode.value === 'products' ? firstNode(productRows, 'CATEGORY') : firstNode(attributeTree.value, 'ATTRIBUTE_GROUP')
      if (initial) await selectNode(initial)
    }
  } catch (e) { error.value = e instanceof Error ? e.message : '产品目录读取失败' }
  finally { loading.value = false }
}

async function loadDictionaryTrees() {
  if (attributeTree.value.length && pointTree.value.length) return
  const [attributeRows, pointRows] = await Promise.all([
    attributeTree.value.length ? Promise.resolve(attributeTree.value) : catalogAttributeTree(),
    pointTree.value.length ? Promise.resolve(pointTree.value) : catalogPointTree(),
  ])
  attributeTree.value = attributeRows
  pointTree.value = pointRows
}

async function searchTree() {
  if (treeMode.value === 'products') await loadAll(false)
  expandToken.value++
}

async function selectNode(node: RecordRow) {
  const source = node.nodeType === 'CATEGORY' ? findNode(tree.value, 'CATEGORY', node.id) : node
  selected.value = source || node
  if (node.nodeType === 'CATEGORY') selectedCategoryId.value = String(node.id)
  validation.value = null
  validationState.value = 'idle'
  if (node.nodeType === 'MODEL') await loadModel(node.id)
  else if (node.nodeType === 'VERSION') await loadModel(node.modelId, node.versionId)
  else detail.value = {}
}

async function openModelDialog(node: RecordRow) {
  if (node.nodeType !== 'MODEL') return
  selected.value = node
  await loadModel(node.id)
  modelDialog.value = true
}

function closeModelPanel() {
  modelDialog.value = false
  validation.value = null
  validationState.value = 'idle'
}

function viewCatalogNode(node: RecordRow) {
  if (node.nodeType === 'MODEL') void openModelDialog(node)
  else void selectNode(node)
}

function catalogNodeKind(node: RecordRow): CreateKind | null {
  return ({ CATEGORY: 'categories', BRAND: 'brands', SERIES: 'series', MODEL: 'models' } as Record<string, CreateKind>)[String(node.nodeType)] || null
}

function editCatalogNode(node: RecordRow) {
  const kind = catalogNodeKind(node)
  if (!kind) return
  openCreate(kind, node)
}

function removeCatalogNode(node: RecordRow) {
  if (!catalogNodeKind(node)) return
  catalogDeleteNodeRef.value = node
  catalogDeleteDialog.value = true
}

async function createCatalogSibling(node: RecordRow) {
  const parent = findParent(tree.value, node)
  if (node.nodeType === 'CATEGORY') return openCreate('categories', null, { parentId: parent?.id || node.parent_id || 0, __lockParent: true })
  if (node.nodeType === 'BRAND') return openCreate('brands', null, { categoryId: parent?.id || node.categoryId || selectedCategoryId.value, __lockParent: true })
  if (node.nodeType === 'SERIES') {
    const brand = parent
    const category = brand ? findParent(tree.value, brand) : null
    return openCreate('series', null, { categoryId: node.categoryId || category?.id || '', brandId: node.brandId || brand?.id || '', __lockParent: true })
  }
  if (node.nodeType === 'MODEL') return openCreate('models', null, { seriesId: parent?.id || node.seriesId || '', __lockParent: true })
}

async function createCatalogChild(node: RecordRow) {
  if (node.nodeType === 'CATEGORY') return openCreate('brands', null, { categoryId: node.id, __lockParent: true })
  if (node.nodeType === 'BRAND') return openCreate('series', null, { categoryId: findParent(tree.value, node)?.id || node.categoryId || selectedCategoryId.value, brandId: node.id, __lockParent: true })
  if (node.nodeType === 'SERIES') return openCreate('models', null, { seriesId: node.id, __lockParent: true })
  if (node.nodeType === 'MODEL') {
    selected.value = node
    await loadModel(node.id)
    await newVersion()
  }
}

function onCreateDialogToggle(open: boolean) {
  createDialog.value = open
  if (!open) catalogEditNode.value = null
  if (!open) createParentLocked.value = false
}

async function confirmDeleteCatalogNode() {
  const node = catalogDeleteNodeRef.value
  if (!node) return
  saving.value = true
  error.value = ''
  try {
    await catalogDeleteNode(String(node.nodeType), node.id)
    catalogDeleteDialog.value = false
    catalogDeleteNodeRef.value = null
    closeModelPanel()
    await loadAll(false)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '目录节点删除失败'
  } finally {
    saving.value = false
  }
}

async function loadModel(modelId: unknown, versionId?: unknown) {
  loading.value = true
  error.value = ''
  try {
    detail.value = await catalogModel(modelId, versionId)
    syncDrafts()
  } catch (e) { error.value = e instanceof Error ? e.message : '型号详情读取失败' }
  finally { loading.value = false }
}

function syncDrafts() {
  Object.assign(versionForm, {
    collectIntervalSeconds: Number(camel(version.value, 'collectIntervalSeconds', 'collect_interval_seconds') || 300),
    qualityThresholdPct: Number(camel(version.value, 'qualityThresholdPct', 'quality_threshold_pct') || 95),
    protocolType: String(camel(version.value, 'protocolType', 'protocol_type') || 'JSON') === 'MODBUS' ? 'MODBUS_RTU' : String(camel(version.value, 'protocolType', 'protocol_type') || 'JSON'),
    remark: String(version.value.remark || ''),
  })
  attributeDrafts.value = (Array.isArray(detail.value.attributes) ? detail.value.attributes as RecordRow[] : []).map((item) => ({ ...item }))
  pointDrafts.value = (Array.isArray(detail.value.points) ? detail.value.points as RecordRow[] : []).map((item) => ({
    ...item,
    mapping_protocol_type: String(item.mapping_protocol_type || versionForm.protocolType) === 'MODBUS' ? 'MODBUS_RTU' : String(item.mapping_protocol_type || versionForm.protocolType),
  }))
  selectedAttributeIds.value = []
  selectedPointIds.value = []
}

function switchMode(mode: TreeMode) {
  treeMode.value = mode
  selected.value = null
  selectedCategoryId.value = ''
  detail.value = {}
  keyword.value = ''
  hierarchyKeyword.value = ''
  modelDialog.value = false
  if (mode === 'attributes') void loadDictionaryTrees().catch((e) => { error.value = e instanceof Error ? e.message : '目录字典读取失败' })
}

function openCreate(kind: CreateKind, editNode: RecordRow | null = null, defaults: Record<string, unknown> = {}) {
  createKind.value = kind
  catalogEditNode.value = editNode
  createParentLocked.value = Boolean(defaults.__lockParent)
  const edit = editNode
  Object.keys(createForm).forEach((key) => delete createForm[key])
  if (kind === 'categories') Object.assign(createForm, { parentId: edit?.parent_id ?? (selected.value?.nodeType === 'CATEGORY' ? selected.value.id : 0), categoryCode: edit?.category_code || edit?.code || '', categoryName: edit?.category_name || edit?.label || '', description: edit?.description || '' })
  if (kind === 'brands') Object.assign(createForm, { categoryId: edit?.categoryId ?? (selected.value?.nodeType === 'CATEGORY' ? selected.value.id : selectedCategoryId.value), brandCode: edit?.brand_code || edit?.code || '', brandName: edit?.brand_name || edit?.label || '', description: edit?.description || '' })
  if (kind === 'series') Object.assign(createForm, { categoryId: edit?.categoryId ?? (selected.value?.nodeType === 'CATEGORY' ? selected.value.id : ''), brandId: edit?.brandId ?? (selected.value?.nodeType === 'BRAND' ? selected.value.id : ''), seriesCode: edit?.series_code || edit?.code || '', seriesName: edit?.series_name || edit?.label || '', description: edit?.description || '' })
  if (kind === 'models') Object.assign(createForm, { seriesId: edit?.seriesId ?? (selected.value?.nodeType === 'SERIES' ? selected.value.id : ''), modelCode: edit?.model_code || edit?.code || '', modelName: edit?.model_name || edit?.label || '', protocolType: edit?.protocol_type || 'JSON', description: edit?.description || '' })
  if (kind === 'attribute-groups') Object.assign(createForm, { parentId: selected.value?.nodeType === 'ATTRIBUTE_GROUP' ? selected.value.id : 0, groupCode: '', groupName: '' })
  if (kind === 'attributes') Object.assign(createForm, {
    groupId: selected.value?.nodeType === 'ATTRIBUTE_GROUP' ? selected.value.id : selected.value?.group_id || '',
    categoryId: '', attributeCode: '', attributeName: '', dataType: 'STRING', usageType: 'SPEC', unit: '', required: 0,
    allowOverride: 0, defaultValue: '', enumOptions: '', validationRule: '',
  })
  if (kind === 'standard-points') Object.assign(createForm, { categoryId: '', pointCode: '', pointName: '', dataType: 'DOUBLE', unit: '', businessRole: 'INSTANT_VALUE', description: '' })
  Object.assign(createForm, defaults)
  delete createForm.__lockParent
  createDialog.value = true
}

async function submitCreate() {
  saving.value = true
  error.value = ''
  try {
    const edit = catalogEditNode.value
    const created = edit
      ? await catalogUpdateNode(String(edit.nodeType), edit.id, { ...createForm })
      : await catalogCreate(createKind.value, { ...createForm })
    createDialog.value = false
    catalogEditNode.value = null
    await loadAll(false)
    if (createKind.value === 'models') {
      const createdModel = created.model as RecordRow | undefined
      if (createdModel?.id) {
        selected.value = { key: `MODEL:${createdModel.id}`, nodeType: 'MODEL', id: createdModel.id, label: createdModel.model_name }
        detail.value = created
        syncDrafts()
      }
    }
  } catch (e) { error.value = e instanceof Error ? e.message : '创建失败' }
  finally { saving.value = false }
}

async function chooseVersion(item: RecordRow) {
  selected.value = { key: `VERSION:${item.id}`, nodeType: 'VERSION', id: item.id, modelId: model.value.id, versionId: item.id, label: item.version_name }
  await loadModel(model.value.id, item.id)
  validation.value = null
  validationState.value = 'idle'
}

async function saveBasic() {
  if (!version.value.id) return
  saving.value = true
  try { detail.value = await catalogUpdateVersion(version.value.id, { ...versionForm }); clearValidationCache(); syncDrafts() }
  catch (e) { error.value = e instanceof Error ? e.message : '版本保存失败' }
  finally { saving.value = false }
}

async function saveAttributes() {
  saving.value = true
  try {
    detail.value = await catalogSaveAttributes(version.value.id, attributeDrafts.value.map((item) => ({
      attributeId: item.attribute_id,
      attributeValueOptionId: item.attribute_value_option_id || item.attributeValueOptionId,
      attributeValue: item.attribute_value,
    })))
    clearValidationCache()
    syncDrafts()
  } catch (e) { error.value = e instanceof Error ? e.message : '属性保存失败' }
  finally { saving.value = false }
}

function addSelectedAttributes() {
  const selected = new Set(selectedAttributeIds.value)
  for (const item of availableAttributes.value) {
    const option = optionsForAttribute(item.id).find((row) => selected.has(String(row.id)))
    if (!option) continue
    const draft = {
      attribute_id: item.id, attribute_code: item.attribute_code, attribute_name: item.attribute_name,
      usage_type: item.usage_type, unit: item.unit, required: item.required, allow_override: item.allow_override,
      default_value: item.default_value, enum_options: item.enum_options, validation_rule: item.validation_rule,
      group_name: attributeGroups.value.find((group) => String(group.id) === String(item.group_id))?.group_name || '',
      attribute_value_option_id: option.id, attribute_value: option.value_text,
    }
    const index = attributeDrafts.value.findIndex((row) => String(row.attribute_id) === String(item.id))
    if (index >= 0) attributeDrafts.value[index] = draft
    else attributeDrafts.value.push(draft)
  }
  selectedAttributeIds.value = []
  batchDialog.value = null
}

function removeAttribute(index: number) {
  attributeDrafts.value.splice(index, 1)
}

function removePoint(index: number) {
  pointDrafts.value.splice(index, 1)
}

function isModbusPoint(item: RecordRow) {
  return String(item.mapping_protocol_type || '').startsWith('MODBUS')
}

function addPoint() {
  const modbus = versionForm.protocolType.startsWith('MODBUS')
  pointDrafts.value.push({ point_code: '', point_name: '', data_type: 'DOUBLE', unit: '', business_role: 'INSTANT_VALUE', billable: 0, stat_enabled: 1, enabled: 1, mapping_protocol_type: versionForm.protocolType, source_path: modbus ? '' : '$.', function_code: modbus ? '03' : '', register_address: '', register_length: modbus ? 2 : '', value_type: modbus ? 'FLOAT32' : '', byte_order: modbus ? 'ABCD' : '', scale_factor: 1, offset_value: 0, required: 1 })
}

function syncPointProtocol() {
  const modbus = versionForm.protocolType.startsWith('MODBUS')
  pointDrafts.value.forEach((item) => {
    item.mapping_protocol_type = versionForm.protocolType
    if (modbus) {
      item.source_path = ''
      item.function_code ||= '03'
      item.register_length ||= 2
      item.value_type ||= 'FLOAT32'
      item.byte_order ||= 'ABCD'
    } else {
      item.source_path ||= `$.${item.point_code || ''}`
      item.function_code = ''
      item.register_address = ''
      item.register_length = ''
      item.value_type = ''
      item.byte_order = ''
    }
  })
}

function createPointFromAttribute(item: RecordRow) {
  if (String(item.usage_type) !== 'MEASUREMENT_TEMPLATE') return
  const code = String(item.attribute_code || '')
  if (!code || pointDrafts.value.some((point) => String(point.point_code) === code)) {
    tab.value = 'points'
    return
  }
  const sourceType = String(item.data_type || 'STRING')
  pointDrafts.value.push({
    point_code: code, point_name: String(item.attribute_name || code),
    data_type: sourceType === 'NUMBER' ? 'DOUBLE' : sourceType === 'BOOLEAN' ? 'BOOLEAN' : 'STRING',
    unit: String(item.unit || ''), business_role: 'INSTANT_VALUE', billable: 0, stat_enabled: 1, enabled: 1,
    mapping_protocol_type: versionForm.protocolType, source_path: versionForm.protocolType === 'JSON' ? `$.${code}` : '',
    function_code: versionForm.protocolType === 'JSON' ? '' : '03', register_address: '', register_length: versionForm.protocolType === 'JSON' ? '' : 2,
    value_type: versionForm.protocolType === 'JSON' ? '' : 'FLOAT32', byte_order: versionForm.protocolType === 'JSON' ? '' : 'ABCD', scale_factor: 1, offset_value: 0, required: 1,
  })
  tab.value = 'points'
}

function addStandardPoint() {
  const items = availablePoints.value.filter((point) => selectedPointIds.value.includes(String(point.id)))
  items.forEach((item) => pointDrafts.value.push({
    standard_point_id: item.id,
    point_code: item.point_code, point_name: item.point_name, data_type: item.data_type || 'DOUBLE', unit: item.unit || '',
    business_role: item.business_role || 'INSTANT_VALUE', billable: 0, stat_enabled: 1, enabled: 1,
    mapping_protocol_type: versionForm.protocolType, source_path: versionForm.protocolType === 'JSON' ? `$.realtime.${String(item.point_code || '').replace(/_([a-z])/g, (_, c) => c.toUpperCase()).toLowerCase()}` : '',
    function_code: versionForm.protocolType === 'JSON' ? '' : '03', register_address: '', register_length: versionForm.protocolType === 'JSON' ? '' : 2,
    value_type: versionForm.protocolType === 'JSON' ? '' : 'FLOAT32', byte_order: versionForm.protocolType === 'JSON' ? '' : 'ABCD', scale_factor: 1, offset_value: 0, expression: '', required: 1,
  }))
  selectedPointIds.value = []
  batchDialog.value = null
}

async function openBatch(kind: 'attributes' | 'points') {
  batchKeyword.value = ''
  await loadDictionaryTrees()
  selectedAttributeIds.value = kind === 'attributes' ? attributeDrafts.value.map((item) => String(item.attribute_value_option_id || item.attributeValueOptionId)).filter(Boolean) : []
  selectedPointIds.value = kind === 'points' ? pointDrafts.value.map((item) => String(item.standard_point_id || '')).filter(Boolean) : []
  batchDialog.value = kind
}
function toggleBatchSelection(id: string, checked: boolean) {
  if (batchDialog.value === 'attributes') {
    const selectedOption = attributeValues.value.find((item) => String(item.id) === id)
    const attributeId = String(selectedOption?.attribute_id || '')
    const withoutSibling = attributeId ? selectedAttributeIds.value.filter((value) => String(attributeValues.value.find((item) => String(item.id) === value)?.attribute_id || '') !== attributeId) : selectedAttributeIds.value
    selectedAttributeIds.value = checked ? [...withoutSibling, id] : selectedAttributeIds.value.filter((item) => item !== id)
  } else selectedPointIds.value = checked ? [...selectedPointIds.value, id] : selectedPointIds.value.filter((item) => item !== id)
}

async function savePoints() {
  saving.value = true
  try { detail.value = await catalogSavePoints(version.value.id, pointDrafts.value); clearValidationCache(); syncDrafts() }
  catch (e) { error.value = e instanceof Error ? e.message : '测点保存失败' }
  finally { saving.value = false }
}

async function validateVersion() {
  const key = validationKey()
  if (!key || validationState.value === 'running') return
  const cached = validationCache.get(key)
  if (cached) {
    validation.value = cached
    validationState.value = cached.ready ? 'passed' : 'failed'
    return
  }
  const runId = ++validationRunId.value
  validationState.value = 'running'
  validation.value = null
  try {
    const result = await catalogVersionAction(version.value.id, 'validate')
    if (runId !== validationRunId.value) return
    validation.value = result
    validationCache.set(key, result)
    validationState.value = result.ready ? 'passed' : 'failed'
  } catch (e) {
    if (runId !== validationRunId.value) return
    const message = e instanceof Error ? e.message : '校验失败，请检查版本配置和模板内容。'
    error.value = message
    validation.value = { ready: false, checks: [{ name: '发布校验请求', message, passed: false }] }
    validationState.value = 'failed'
  }
}

function closeValidation() {
  validationRunId.value++
  validation.value = null
  validationState.value = 'idle'
}

async function publishVersion() {
  saving.value = true
  try { detail.value = await catalogVersionAction(version.value.id, 'publish'); clearValidationCache(); syncDrafts(); await loadAll(true) }
  catch (e) { error.value = e instanceof Error ? e.message : '发布失败，请先查看发布检查' }
  finally { saving.value = false }
}

function askDeleteVersion(row: RecordRow = version.value) {
  versionDeleteTarget.value = row
  versionDeleteDialog.value = true
}

async function deleteVersion() {
  const target = versionDeleteTarget.value || version.value
  if (!target.id) return
  saving.value = true
  try {
    const modelId = model.value.id
    const modelName = model.value.model_name
    await catalogDeleteVersion(target.id)
    versionDeleteDialog.value = false
    versionDeleteTarget.value = null
    clearValidationCache()
    selected.value = { key: `MODEL:${modelId}`, nodeType: 'MODEL', id: modelId, label: modelName }
    try {
      detail.value = await catalogModel(modelId)
      syncDrafts()
    } catch {
      closeModelPanel()
      detail.value = {}
    }
    await loadAll(false)
  } catch (e) { error.value = e instanceof Error ? e.message : '版本删除失败' }
  finally { saving.value = false }
}

async function newVersion() {
  saving.value = true
  try {
    detail.value = await catalogCreateVersion(model.value.id, version.value.id)
    const createdVersion = detail.value.version as RecordRow
    selected.value = { key: `VERSION:${createdVersion.id}`, nodeType: 'VERSION', id: createdVersion.id, modelId: model.value.id, versionId: createdVersion.id, label: createdVersion.version_name }
    clearValidationCache()
    syncDrafts()
    tab.value = 'basic'
    await loadAll(true)
  }
  catch (e) { error.value = e instanceof Error ? e.message : '新版本创建失败' }
  finally { saving.value = false }
}

async function disableVersion() {
  saving.value = true
  try { detail.value = await catalogVersionAction(version.value.id, 'disable'); clearValidationCache(); syncDrafts(); await loadAll(true) }
  catch (e) { error.value = e instanceof Error ? e.message : '停用失败' }
  finally { saving.value = false }
}

onMounted(() => loadAll(false))
</script>

<template>
  <section class="view-page catalog-page">
    <header class="view-head">
      <div><p class="eyebrow">DEVICE CATALOG</p><h1>产品目录与型号模板</h1><p>型号发布后才能用于创建设备；已发布版本通过创建新版本进行修改。</p></div>
      <button class="icon-btn" title="刷新" @click="loadAll(true)"><RefreshCw :size="16" /></button>
    </header>
    <p v-if="error" class="notice">{{ error }}</p>

    <div class="catalog-layout">
      <aside class="catalog-sidebar archive-sidebar-panel">
        <div class="catalog-mode-tabs"><button :class="{ active: treeMode === 'products' }" @click="switchMode('products')">产品树</button><button :class="{ active: treeMode === 'attributes' }" @click="switchMode('attributes')">属性树</button></div>
        <label class="catalog-search"><Search :size="14" /><input v-model.trim="keyword" placeholder="搜索名称或编码" @keyup.enter="searchTree"></label>
        <div class="archive-tree-tools"><button class="quiet" @click="expandToken++">全部展开</button><button class="quiet" @click="collapseToken++">全部折叠</button></div>
        <div v-if="canAdd && treeMode === 'products'" class="catalog-create-tools"><button @click="openCreate('categories')">+ 分类</button><button @click="openCreate('brands')">+ 品牌</button><button @click="openCreate('series')">+ 系列</button><button @click="openCreate('models')">+ 型号</button></div>
        <div class="archive-tree-list catalog-tree-list">
          <template v-if="treeMode === 'products'">
            <CatalogTreeNode v-for="node in categoryTree" :key="String(node.key)" :node="node" :selected-key="selectedKey" :expand-token="expandToken" :collapse-token="collapseToken" :show-actions="true" @select="selectNode" @detail="viewCatalogNode" @edit="editCatalogNode" @remove="removeCatalogNode" @create-sibling="createCatalogSibling" @create-child="createCatalogChild" />
          </template>
          <template v-else>
            <CatalogTreeNode v-for="node in activeTree" :key="String(node.key)" :node="node" :selected-key="selectedKey" :expand-token="expandToken" :collapse-token="collapseToken" @select="selectNode" />
          </template>
          <p v-if="!(treeMode === 'products' ? categoryTree : activeTree).length && !loading" class="empty-state">暂无目录数据</p>
        </div>
      </aside>

      <main class="catalog-main archive-main-panel catalog-hierarchy-panel">
        <template v-if="treeMode === 'products'">
          <template v-if="selectedCategory">
            <div class="catalog-hierarchy-head">
              <div><p class="eyebrow">PRODUCT CATALOG</p><h2>{{ selectedCategory.label }}</h2><small>品牌、系列与型号</small></div>
              <span>{{ productHierarchy.length }} 个品牌</span>
            </div>
            <div class="catalog-hierarchy-toolbar">
              <div><b>品牌与系列</b><small>按品牌 → 系列 → 型号查看产品目录</small></div>
              <div class="hierarchy-actions"><button class="quiet" @click="expandToken++">全展开</button><button class="quiet" @click="collapseToken++">全收起</button><label class="catalog-search hierarchy-search"><Search :size="15" /><input v-model.trim="hierarchyKeyword" placeholder="搜索品牌、系列或型号"></label></div>
            </div>
            <div class="catalog-hierarchy-list">
              <CatalogTreeNode v-for="node in productHierarchy" :key="String(node.key)" :node="node" :selected-key="selectedKey" :expand-token="expandToken" :collapse-token="collapseToken" :show-actions="true" @select="selectNode" @detail="viewCatalogNode" @edit="editCatalogNode" @remove="removeCatalogNode" @create-sibling="createCatalogSibling" @create-child="createCatalogChild" />
              <p v-if="!productHierarchy.length" class="empty-state">当前分类下暂无品牌、系列或型号。</p>
            </div>
          </template>
          <div v-else class="catalog-empty"><p class="eyebrow">CATALOG NAVIGATION</p><h2>请选择左侧产品分类</h2><p>左侧只保留分类导航，选择分类后在右侧按品牌、系列和型号浏览产品目录。</p></div>
        </template>
        <div v-else class="catalog-empty"><p class="eyebrow">ATTRIBUTE CATALOG</p><h2>{{ selected?.label || '请选择属性节点' }}</h2><p>属性字典按分类树维护。选择属性组或属性节点可查看定义并继续配置。</p></div>
      </main>

      <main v-if="modelDialog && isModel && model.id" class="catalog-main archive-main-panel catalog-detail-overlay">
        <div class="catalog-detail-back"><button class="quiet" type="button" @click="closeModelPanel"><ArrowLeft :size="16" />返回产品目录</button></div>
        <div v-if="loading && !selected" class="empty-state">正在读取产品目录...</div>
        <template v-else-if="isModel && model.id">
          <div class="catalog-head">
            <div><p>{{ model.category_name }} / {{ model.brand_name }} / {{ model.series_name }}</p><h2>{{ model.model_name }} <small>{{ model.model_code }}</small></h2></div>
            <div class="catalog-version-actions"><span :class="['catalog-status', String(version.status).toLowerCase()]">{{ statusLabel(version.status) }}</span><button v-if="canPublishVersion && canEdit" class="quiet" :disabled="validationState === 'running'" @click="validateVersion"><BadgeCheck :size="14" />{{ validationState === 'running' ? '校验中...' : '发布检查' }}</button><button v-if="canPublishVersion && canPublish" class="primary" :disabled="saving" @click="publishVersion">{{ isDisabledVersion ? '重新发布版本' : '发布版本' }}</button><button v-if="!isDraft && canEdit" class="quiet" :disabled="saving" @click="newVersion"><CopyPlus :size="14" />创建新版本</button><button v-if="version.status === 'PUBLISHED' && canDisable" class="quiet danger-text" @click="disableVersion">停用</button><button v-if="canDeleteVersion && canEdit" class="quiet danger-text" :disabled="saving" @click="askDeleteVersion()">删除版本</button></div>
          </div>
          <div class="catalog-version-bar"><span>版本</span><button v-for="item in versions" :key="String(item.id)" :class="{ active: String(item.id) === String(version.id) }" @click="chooseVersion(item)">{{ item.version_name }} · {{ statusLabel(item.status) }}</button></div>
          <nav class="archive-tabs catalog-tabs"><button :class="{ active: tab === 'basic' }" @click="tab = 'basic'">基本信息</button><button :class="{ active: tab === 'attributes' }" @click="tab = 'attributes'">产品属性</button><button :class="{ active: tab === 'points' }" @click="tab = 'points'">测点与协议</button><button :class="{ active: tab === 'devices' }" @click="tab = 'devices'">引用设备</button></nav>

          <div class="catalog-content">
            <section v-if="tab === 'basic'" class="catalog-basic-grid">
              <article class="panel catalog-form-panel">
                <div class="panel-head"><h3>版本配置</h3><small>已发布版本只读</small></div>
                <div class="dialog-fields"><label class="dialog-field"><span>版本号</span><input :value="version.version_name" disabled></label><label class="dialog-field"><span>底层类型编码</span><input :value="version.type_code" disabled></label><label class="dialog-field"><span>协议类型</span><select v-model="versionForm.protocolType" :disabled="!isDraft" @change="syncPointProtocol"><option>JSON</option><option>MODBUS_RTU</option><option>MODBUS_TCP</option></select></label><label class="dialog-field"><span>默认采集周期（秒）</span><input v-model.number="versionForm.collectIntervalSeconds" type="number" min="10" :disabled="!isDraft"></label><label class="dialog-field"><span>完整率阈值（%）</span><input v-model.number="versionForm.qualityThresholdPct" type="number" min="1" max="100" :disabled="!isDraft"></label><label class="dialog-field full"><span>版本说明</span><textarea v-model="versionForm.remark" :disabled="!isDraft"></textarea></label></div>
                <button v-if="isDraft && canEdit" class="primary catalog-save" :disabled="saving" @click="saveBasic"><Save :size="14" />保存草稿</button>
              </article>
              <article class="panel catalog-version-panel">
                <div class="panel-head"><h3>版本记录</h3><small>{{ versions.length }} 个版本</small></div>
                <div class="catalog-version-list"><div v-for="item in versions" :key="String(item.id)" :class="['catalog-version-row', { active: String(item.id) === String(version.id) }]" @click="chooseVersion(item)"><span><b>{{ item.version_name }}</b><small>{{ item.create_time }}<template v-if="item.source_version_id"> · 来源版本 #{{ item.source_version_id }}</template></small></span><em :class="String(item.status).toLowerCase()">{{ statusLabel(item.status) }}</em><ChevronRight :size="15" /></div></div>
              </article>
            </section>

            <section v-else-if="tab === 'attributes'" class="panel catalog-tab-panel">
              <div class="panel-head"><h3>继承属性</h3><div class="catalog-batch-actions"><small>{{ attributeDrafts.length }} 项</small><button v-if="isDraft && canEdit" class="quiet" @click="openBatch('attributes')"><Plus :size="14" />批量新增</button></div></div>
              <div class="template-filter-bar">
                <label class="catalog-search template-search"><Search :size="14" /><input v-model.trim="templateAttributeKeyword" placeholder="搜索属性名称、编码或固定值"></label>
                <select v-model="templateAttributeGroupFilter"><option value="">全部属性组</option><option v-for="group in templateAttributeGroupOptions" :key="group" :value="group">{{ group }}</option></select>
              </div>
              <div class="catalog-template-scroll">
                <div class="attribute-binding-list">
                  <section v-for="group in attributeBindingGroups" :key="group.name" class="attribute-binding-group">
                  <div class="binding-group-title"><b>{{ group.name }}</b><small>{{ group.items.length }} 项</small></div>
                  <div class="attribute-binding-grid">
                    <article v-for="item in group.items" :key="String(item.attribute_id)" class="fixed-attribute-card">
                      <small>{{ item.attribute_code }}</small><h4>{{ item.attribute_name }}</h4>
                      <select v-if="isDraft && canEdit" v-model="item.attribute_value_option_id" @change="item.attribute_value = optionsForAttribute(item.attribute_id).find((option) => String(option.id) === String(item.attribute_value_option_id))?.value_text || ''"><option value="">请选择固定值</option><option v-for="option in optionsForAttribute(item.attribute_id)" :key="String(option.id)" :value="option.id">{{ option.value_text }}</option></select>
                      <strong v-else>{{ item.attribute_value || item.default_value || '—' }}<em v-if="item.unit"> {{ item.unit }}</em></strong>
                      <span>{{ Number(item.required) ? '必填属性' : '可选属性' }} · {{ item.usage_type || 'SPEC' }}</span>
                      <button v-if="isDraft && canEdit" class="quiet danger-text table-action" @click="removeAttribute(attributeDrafts.indexOf(item))">移除</button>
                    </article>
                  </div>
                  </section>
                  <p v-if="!attributeBindingGroups.length" class="empty-state">暂无符合条件的固定属性。</p>
                </div>
              </div>
              <button v-if="isDraft && canEdit" class="primary catalog-save" :disabled="saving" @click="saveAttributes"><Save :size="14" />保存属性</button>
            </section>

            <section v-else-if="tab === 'points'" class="panel catalog-tab-panel">
              <div class="panel-head"><h3>测点与协议映射</h3><div class="catalog-point-actions"><button v-if="isDraft && canEdit" class="quiet" @click="openBatch('points')"><Plus :size="14" />批量新增</button></div></div>
              <div class="template-filter-bar">
                <label class="catalog-search template-search"><Search :size="14" /><input v-model.trim="templatePointKeyword" placeholder="搜索测点名称、编码或解析路径"></label>
                <select v-model="templatePointGroupFilter"><option value="">全部测点组</option><option v-for="group in templatePointGroupOptions" :key="group" :value="group">{{ group }}</option></select>
              </div>
              <div class="catalog-template-scroll">
                <div class="realtime-point-groups">
                  <section v-for="group in realtimePointGroups" :key="group.name" class="realtime-point-group">
                  <div class="binding-group-title"><b>{{ group.name }}</b><small>{{ group.items.length }} 项</small></div>
                  <div class="realtime-point-grid">
                    <article v-for="item in group.items" :key="String(item.id || item.point_code)" class="realtime-point-card">
                      <div class="realtime-point-card-head"><span>{{ item.point_code }}</span><small>{{ item.data_type }}<template v-if="item.unit"> · {{ item.unit }}</template></small></div>
                      <h4>{{ item.point_name }}</h4>
                      <div class="point-card-form-row"><label>协议<select v-if="isDraft && canEdit" v-model="item.mapping_protocol_type"><option>JSON</option><option>MODBUS_RTU</option><option>MODBUS_TCP</option></select><b v-else>{{ item.mapping_protocol_type || '—' }}</b></label><label>倍率<input v-if="isDraft && canEdit" v-model.number="item.scale_factor" type="number" step="0.000001"><b v-else>{{ item.scale_factor ?? 1 }}</b></label></div>
                      <label class="point-card-path">解析{{ isModbusPoint(item) ? '寄存器' : '路径' }}<input v-if="isDraft && canEdit && !isModbusPoint(item)" v-model="item.source_path" placeholder="$.realtime.xxx"><input v-else-if="isDraft && canEdit" v-model="item.register_address" type="number" min="0" placeholder="寄存器地址"><b v-else>{{ isModbusPoint(item) ? (item.register_address ?? '—') : (item.source_path || '—') }}</b></label>
                      <div class="realtime-point-meta"><span>{{ item.business_role || 'INSTANT_VALUE' }}</span><button v-if="isDraft && canEdit" class="quiet danger-text table-action" @click="removePoint(pointDrafts.indexOf(item))">移除</button></div>
                    </article>
                  </div>
                  </section>
                  <p v-if="!realtimePointGroups.length" class="empty-state">暂无符合条件的测点与协议映射。</p>
                </div>
              </div>
              <button v-if="isDraft && canEdit" class="primary catalog-save" :disabled="saving" @click="savePoints"><Save :size="14" />保存测点</button>
            </section>

            <section v-else class="panel catalog-tab-panel"><div class="panel-head"><h3>引用设备</h3><small>{{ devices.length }} 台</small></div><div class="template-filter-bar"><label class="catalog-search template-search"><Search :size="14" /><input v-model.trim="referencedDeviceKeyword" placeholder="搜索设备 SN、名称或网关"></label><select v-model="referencedDeviceOrgFilter"><option value="">全部组织</option><option v-for="org in referencedDeviceOrgOptions" :key="org" :value="org">{{ org }}</option></select><select v-model="referencedDeviceStatusFilter"><option value="">全部状态</option><option v-for="status in referencedDeviceStatusOptions" :key="status" :value="status">{{ status }}</option></select></div><div class="catalog-table template-scroll"><table><thead><tr><th>设备 SN</th><th>名称</th><th>组织</th><th>网关</th><th>状态</th></tr></thead><tbody><tr v-for="item in filteredReferencedDevices" :key="String(item.id)"><td>{{ item.device_sn }}</td><td>{{ item.device_name }}</td><td>{{ item.org_name || '—' }}</td><td>{{ item.gateway_name || item.gateway_sn || '未接入' }}</td><td>{{ item.status }}</td></tr><tr v-if="!filteredReferencedDevices.length"><td colspan="5" class="empty-cell">暂无符合条件的引用设备</td></tr></tbody></table></div></section>
          </div>
        </template>
        <div v-else class="catalog-empty"><p class="eyebrow">CATALOG NAVIGATION</p><h2>{{ selected?.label || '请选择产品型号' }}</h2><p v-if="treeMode === 'products'">从左侧展开设备分类、品牌和系列，选择具体型号后配置版本、属性、测点和协议。</p><p v-else>属性字典按分类树维护。选择属性节点可查看定义，新增属性时会自动使用当前属性组。</p></div>
      </main>
    </div>

    <AppDialog v-if="batchDialog" :open="Boolean(batchDialog)" dialog-class="catalog-batch-dialog" :title="batchDialog === 'attributes' ? '批量新增属性' : '批量新增测点'" :saving="saving" @update:open="(open) => { if (!open) batchDialog = null }" @submit="batchDialog === 'attributes' ? addSelectedAttributes() : addStandardPoint()"><div class="batch-select-panel"><div class="batch-select-head"><div><p class="eyebrow">{{ batchDialog === 'attributes' ? 'ATTRIBUTE SELECTION' : 'POINT SELECTION' }}</p><h3>{{ batchDialog === 'attributes' ? '选择产品属性' : '选择测点与协议' }}</h3><small>按组织树批量选择，勾选后加入当前产品版本。</small></div><label class="catalog-search batch-search"><Search :size="15" /><input v-model.trim="batchKeyword" placeholder="搜索名称、编码或分组"></label></div><div class="batch-tree-scroll"><DictionarySelectTree :nodes="batchDialog === 'attributes' ? attributeTree : pointTree" :selected="batchDialog === 'attributes' ? selectedAttributeIds : selectedPointIds" :keyword="batchKeyword" @toggle="toggleBatchSelection" /></div><div class="batch-selected-hint">已选择 <strong>{{ batchDialog === 'attributes' ? selectedAttributeIds.length : selectedPointIds.length }}</strong> 项</div></div></AppDialog>
    <section v-if="validationState !== 'idle'" class="catalog-validation catalog-validation-floating panel" :class="validationState">
      <button class="catalog-validation-close" type="button" aria-label="关闭发布校验" title="关闭" @click="closeValidation"><X :size="17" /></button>
      <div class="panel-head"><h3>发布校验</h3><b :class="{ passed: validationState === 'passed' }">{{ validationState === 'running' ? '正在验证' : validationState === 'passed' ? '可以发布' : '存在阻断项' }}</b></div>
      <div class="validation-status" :class="validationState"><span class="validation-status-icon"><span v-if="validationState === 'running'" class="validation-spinner"></span><template v-else>{{ validationState === 'passed' ? '✓' : '×' }}</template></span><div><b>{{ validationState === 'running' ? '正在检查版本配置' : validationState === 'passed' ? '验证通过' : '验证未通过' }}</b><small>{{ validationState === 'running' ? '正在检查属性、测点和发布条件，请稍候…' : validationState === 'passed' ? '当前版本满足发布条件。' : '请根据下面的检查结果修正后重新验证。' }}</small></div></div>
      <template v-if="validation && validationState !== 'running'"><div v-for="item in validation.checks as RecordRow[]" :key="String(item.name)" :class="['validation-row', { passed: item.passed }]"><span>{{ item.passed ? '✓' : '×' }}</span><div><b>{{ item.name }}</b><small>{{ item.message }}</small></div></div></template>
    </section>

    <AppDialog v-model:open="createDialog" :title="createTitle" :saving="saving" @update:open="onCreateDialogToggle" @submit="submitCreate">
      <div class="dialog-fields">
        <template v-if="createKind === 'categories'"><label v-if="!createParentLocked" class="dialog-field"><span>上级分类</span><select v-model="createForm.parentId"><option :value="0">无</option><option v-for="item in categories" :key="String(item.id)" :value="item.id">{{ item.category_name }}</option></select></label><label class="dialog-field"><span>分类编码*</span><input v-model="createForm.categoryCode"></label><label class="dialog-field"><span>分类名称*</span><input v-model="createForm.categoryName"></label></template>
        <template v-else-if="createKind === 'brands'"><label v-if="!createParentLocked" class="dialog-field"><span>绑定设备分类*</span><select v-model="createForm.categoryId"><option value="">请选择分类</option><option v-for="item in categories" :key="String(item.id)" :value="item.id">{{ item.category_name }}</option></select></label><label class="dialog-field"><span>品牌编码*</span><input v-model="createForm.brandCode" placeholder="已有品牌编码可直接绑定"></label><label class="dialog-field"><span>品牌名称*</span><input v-model="createForm.brandName"></label><small class="dialog-field full catalog-create-hint">如果品牌编码已经存在，系统会复用原品牌并绑定到当前分类，不会重复创建品牌。</small></template>
        <template v-else-if="createKind === 'series'"><label v-if="!createParentLocked" class="dialog-field"><span>设备分类*</span><select v-model="createForm.categoryId"><option value="">请选择</option><option v-for="item in categories" :key="String(item.id)" :value="item.id">{{ item.category_name }}</option></select></label><label v-if="!createParentLocked" class="dialog-field"><span>品牌*</span><select v-model="createForm.brandId"><option value="">请选择</option><option v-for="item in brands" :key="String(item.id)" :value="item.id">{{ item.brand_name }}</option></select></label><label class="dialog-field"><span>系列编码*</span><input v-model="createForm.seriesCode"></label><label class="dialog-field"><span>系列名称*</span><input v-model="createForm.seriesName"></label></template>
        <template v-else-if="createKind === 'models'"><label v-if="!createParentLocked" class="dialog-field"><span>产品系列*</span><select v-model="createForm.seriesId"><option value="">请选择</option><option v-for="item in seriesOptions" :key="String(item.id)" :value="item.id">{{ item.series_name }}</option></select></label><label class="dialog-field"><span>型号编码*</span><input v-model="createForm.modelCode"></label><label class="dialog-field"><span>型号名称*</span><input v-model="createForm.modelName"></label><label class="dialog-field"><span>默认协议</span><select v-model="createForm.protocolType"><option>JSON</option><option>MODBUS_RTU</option><option>MODBUS_TCP</option></select></label></template>
        <template v-else-if="createKind === 'attribute-groups'"><label class="dialog-field"><span>上级属性组</span><select v-model="createForm.parentId"><option :value="0">无（根节点）</option><option v-for="item in attributeGroups" :key="String(item.id)" :value="item.id">{{ item.group_name }}</option></select></label><label class="dialog-field"><span>属性组编码*</span><input v-model="createForm.groupCode"></label><label class="dialog-field"><span>属性组名称*</span><input v-model="createForm.groupName"></label></template>
        <template v-else-if="createKind === 'attributes'"><label class="dialog-field"><span>属性分类*</span><select v-model="createForm.groupId"><option value="">请选择</option><option v-for="item in attributeGroups" :key="String(item.id)" :value="item.id">{{ item.group_name }}</option></select></label><label class="dialog-field"><span>适用设备分类</span><select v-model="createForm.categoryId"><option value="">通用（全部分类）</option><option v-for="item in categories" :key="String(item.id)" :value="item.id">{{ item.category_name }}</option></select></label><label class="dialog-field"><span>属性编码*</span><input v-model="createForm.attributeCode"></label><label class="dialog-field"><span>属性名称*</span><input v-model="createForm.attributeName"></label><label class="dialog-field"><span>数据类型</span><select v-model="createForm.dataType"><option>STRING</option><option>NUMBER</option><option>BOOLEAN</option><option>ENUM</option></select></label><label class="dialog-field"><span>属性用途</span><select v-model="createForm.usageType"><option>SPEC</option><option>CONFIG</option><option>MEASUREMENT_TEMPLATE</option><option>LIMIT</option></select></label><label class="dialog-field"><span>单位</span><input v-model="createForm.unit"></label><label class="dialog-field"><span>必填</span><select v-model.number="createForm.required"><option :value="0">否</option><option :value="1">是</option></select></label><label class="dialog-field"><span>设备可覆盖</span><select v-model.number="createForm.allowOverride"><option :value="0">否</option><option :value="1">是</option></select></label><label v-if="createForm.dataType === 'ENUM'" class="dialog-field full"><span>枚举候选（JSON 数组）</span><textarea v-model="createForm.enumOptions" placeholder='["A","B"]'></textarea></label><label class="dialog-field full"><span>校验规则（JSON）</span><textarea v-model="createForm.validationRule" placeholder='{"min":0,"max":100}'></textarea></label></template>
        <template v-else><label class="dialog-field"><span>适用设备分类</span><select v-model="createForm.categoryId"><option value="">通用（全部分类）</option><option v-for="item in categories" :key="String(item.id)" :value="item.id">{{ item.category_name }}</option></select></label><label class="dialog-field"><span>测点编码*</span><input v-model="createForm.pointCode"></label><label class="dialog-field"><span>测点名称*</span><input v-model="createForm.pointName"></label><label class="dialog-field"><span>数据类型</span><select v-model="createForm.dataType"><option>DOUBLE</option><option>INTEGER</option><option>STRING</option><option>BOOLEAN</option></select></label><label class="dialog-field"><span>单位</span><input v-model="createForm.unit"></label><label class="dialog-field"><span>业务角色</span><input v-model="createForm.businessRole"></label><label class="dialog-field full"><span>说明</span><textarea v-model="createForm.description"></textarea></label></template>
        <label v-if="['categories','brands','series','models'].includes(createKind)" class="dialog-field full"><span>说明</span><textarea v-model="createForm.description"></textarea></label>
      </div>
    </AppDialog>
    <AppConfirmDialog v-model:open="catalogDeleteDialog" :title="catalogDeleteNodeRef ? `删除${catalogDeleteNodeRef.label}` : '确认删除'" message="删除后该目录节点将停用，并可能影响下级产品引用。确认继续吗？" :loading="saving" confirm-text="确认删除" @confirm="confirmDeleteCatalogNode" />
    <AppConfirmDialog v-model:open="versionDeleteDialog" title="删除版本" message="仅草稿或已停用且无设备引用的版本允许删除。删除后版本配置、属性值、测点和协议映射将一并移除；若这是型号的唯一版本，型号骨架也会一并删除。" :loading="saving" confirm-text="确认删除" @confirm="deleteVersion" />
  </section>
</template>

<style scoped>
.catalog-page{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden}.catalog-page>.view-head,.catalog-page>.notice{flex:none}.catalog-layout{flex:1;min-height:0;display:grid;grid-template-columns:var(--archive-sidebar-width) minmax(0,1fr);gap:12px}.catalog-sidebar{display:flex;flex-direction:column}.catalog-mode-tabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--border)}.catalog-mode-tabs button{height:31px;border:0;background:#fff;color:#52667e;font-size:12px}.catalog-mode-tabs button.active{background:var(--accent);color:#fff}.catalog-search{height:32px;display:flex;align-items:center;gap:7px;margin-top:10px;padding:0 9px;border:1px solid var(--border);color:#8a9bad}.catalog-search input{min-width:0;flex:1;border:0;outline:0}.catalog-create-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-bottom:8px}.catalog-create-tools button{height:27px;padding:0 3px;border:1px solid var(--border);background:#fff;color:#36516f;font-size:10px}.catalog-create-tools button:hover{border-color:var(--accent);color:var(--accent)}.catalog-tree-list{padding-right:3px}.catalog-main{overflow:auto}.catalog-head{min-height:74px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border-bottom:1px solid var(--border)}.catalog-head p{margin:0 0 6px;color:var(--muted);font-size:11px}.catalog-head h2{margin:0;font-size:20px}.catalog-head h2 small{margin-left:8px;color:#71839a;font:11px ui-monospace,Consolas,monospace}.catalog-version-actions{display:flex;align-items:center;gap:7px}.catalog-version-actions .primary,.catalog-version-actions .quiet{height:30px;display:inline-flex;align-items:center;gap:5px;font-size:11px}.catalog-status{padding:5px 8px;border-radius:4px;background:#fff4df;color:#a46b00;font-size:10px}.catalog-status.published{background:#eef6ff;color:#2367bd}.catalog-status.disabled{background:#eef1f4;color:#6d7783}.catalog-version-bar{display:flex;align-items:center;gap:5px;padding:7px 14px;border-bottom:1px solid var(--border);background:#fafcff}.catalog-version-bar>span{margin-right:5px;color:#66798f;font-size:11px}.catalog-version-bar button{height:25px;padding:0 8px;border:1px solid var(--border);background:#fff;color:#52667e;font-size:10px}.catalog-version-bar button.active{border-color:var(--accent);color:var(--accent)}.catalog-tabs{padding-top:8px}.catalog-content{padding:12px 14px}.catalog-form-panel{max-width:860px}.catalog-save{height:31px;display:inline-flex;align-items:center;gap:5px;margin-top:12px;font-size:11px}.catalog-table{overflow:auto;border:1px solid var(--border)}.catalog-table table{width:100%;border-collapse:collapse;font-size:11px}.catalog-table th,.catalog-table td{height:36px;padding:5px 8px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}.catalog-table th{background:#f7f9fc;color:#5b6e84;font-weight:600}.catalog-table input,.catalog-table select{width:100%;min-width:90px;height:27px;padding:0 6px;border:1px solid var(--border);background:#fff}.point-table{max-height:480px}.point-table th:nth-child(1){min-width:150px}.point-table th:nth-child(2){min-width:120px}.point-table th:nth-child(5),.point-table th:nth-child(6){min-width:150px}.catalog-version-list{display:grid}.catalog-version-list button{min-height:52px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:8px 10px;border:0;border-bottom:1px solid var(--border);background:#fff;color:var(--fg);text-align:left}.catalog-version-list b,.catalog-version-list small{display:block}.catalog-version-list small{margin-top:5px;color:var(--muted);font-size:9px}.catalog-version-list em{font-size:10px;font-style:normal}.catalog-version-list em.published{color:#2367bd}.catalog-version-list em.draft{color:#a46b00}.catalog-validation{position:absolute;right:28px;top:150px;width:330px;z-index:3;box-shadow:0 10px 30px #17375c20}.catalog-validation .panel-head b{color:#b94f2d;font-size:11px}.catalog-validation .panel-head b.passed{color:#2367bd}.validation-row{display:flex;gap:9px;padding:9px;border-bottom:1px solid var(--border);color:#b94f2d}.validation-row.passed{color:#2367bd}.validation-row>span{font-weight:800}.validation-row b,.validation-row small{display:block}.validation-row b{font-size:11px}.validation-row small{margin-top:4px;color:#6c7c8f;font-size:9px}.catalog-empty{min-height:500px;display:grid;align-content:center;justify-items:center;padding:30px;color:#7b8999;text-align:center}.catalog-empty h2{margin:8px 0}.catalog-empty>p:last-child{max-width:500px;font-size:12px;line-height:1.7}@media(max-width:980px){.catalog-layout{grid-template-columns:min(280px,var(--archive-sidebar-width)) minmax(0,1fr)}.catalog-head{align-items:flex-start;flex-direction:column}.catalog-validation{position:static;width:auto;margin:0 14px 14px}}@media(max-width:720px){.catalog-layout{grid-template-columns:1fr}.catalog-sidebar{max-height:350px}.catalog-version-actions{flex-wrap:wrap}.catalog-tabs{overflow:auto}.catalog-tabs button{white-space:nowrap}}
.catalog-point-actions,.catalog-batch-actions{display:flex;align-items:center;gap:5px}.catalog-point-actions select{height:28px;max-width:230px;border:1px solid var(--border);background:#fff;color:#52667e;font-size:11px}.catalog-point-actions .quiet,.catalog-batch-actions .quiet{width:auto;min-width:max-content;height:28px;padding:0 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:11px}
.binding-table{max-height:520px}.binding-table table{min-width:820px}.binding-table td:nth-child(1){color:#68809a}.binding-table td:nth-child(2){font:10px ui-monospace,Consolas,monospace;color:#416486}.binding-table select,.binding-table input{min-width:110px}.point-binding-table table{min-width:1060px}.point-binding-table td:nth-child(7) input{min-width:190px}.point-binding-table td:nth-child(8) input{min-width:88px;width:88px}.table-action{height:26px;padding:0 7px;font-size:11px}
.catalog-basic-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.75fr);gap:12px;align-items:start}.catalog-basic-grid .catalog-form-panel{max-width:none}.catalog-version-panel{min-width:0}.catalog-version-panel .catalog-version-list{max-height:520px;overflow:auto}.catalog-version-row{min-height:52px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:8px 10px;border-bottom:1px solid var(--border);background:#fff;color:var(--fg);text-align:left;cursor:pointer}.catalog-version-row:hover{background:#f5f9ff}.catalog-version-row.active{background:#eef6ff;color:#2367bd}.catalog-version-row.active b{color:#2367bd}.catalog-version-row.active em{font-weight:700}.catalog-version-row .icon-btn{width:28px;height:28px}@media(max-width:980px){.catalog-basic-grid{grid-template-columns:1fr}.catalog-version-panel .catalog-version-list{max-height:none}}
.catalog-hierarchy-panel{display:flex;flex-direction:column;min-width:0;overflow:hidden}.catalog-hierarchy-head{min-height:82px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 22px;border-bottom:1px solid var(--border)}.catalog-hierarchy-head p{margin:0 0 5px;color:var(--muted);font-size:11px}.catalog-hierarchy-head h2{margin:0;font-size:22px}.catalog-hierarchy-head small{display:block;margin-top:5px;color:var(--muted);font-size:13px}.catalog-hierarchy-head>span{padding:7px 12px;border-radius:14px;background:#eef5ff;color:#2777df;font-size:13px}.catalog-hierarchy-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 22px;border-bottom:1px solid var(--border);background:#fbfdff}.catalog-hierarchy-toolbar>b,.catalog-hierarchy-toolbar>div:first-child b{display:block;font-size:16px}.catalog-hierarchy-toolbar small{display:block;margin-top:4px;color:var(--muted);font-size:13px}.hierarchy-actions{display:flex;align-items:center;gap:8px}.hierarchy-actions .quiet{min-height:36px;font-size:13px}.hierarchy-search{width:300px;height:38px;margin:0;background:#fff}.hierarchy-search input{font-size:14px}.catalog-hierarchy-list{flex:1;min-height:0;overflow:auto;padding:8px 22px 20px}.catalog-hierarchy-list :deep(.catalog-tree-row){min-height:58px;border-bottom:1px solid var(--border)}.catalog-hierarchy-list :deep(.catalog-tree-label){font-size:15px}.catalog-hierarchy-list :deep(.catalog-tree-meta){font-size:12px}.catalog-model-dialog{width:min(1180px,calc(100vw - 42px));height:min(790px,calc(100vh - 38px));max-height:none}.catalog-model-dialog .catalog-validation{display:none}.catalog-validation-floating{position:fixed;right:28px;top:138px;width:min(390px,calc(100vw - 40px));z-index:20;box-shadow:0 12px 32px #17375c24}.catalog-validation-close{position:absolute;right:10px;top:10px;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#71839a}.catalog-validation-close:hover{background:#eef4fb;color:#263d58}.catalog-validation-floating .panel-head{padding-right:38px}.validation-status{display:flex;align-items:center;gap:12px;padding:14px 12px;border-bottom:1px solid var(--border)}.validation-status-icon{width:36px;height:36px;display:grid;place-items:center;flex:none;border-radius:50%;font-size:23px;font-weight:800}.validation-status.running .validation-status-icon{background:#eef4ff;color:#2879ed}.validation-status.passed .validation-status-icon{background:#eef6ff;color:#2367bd}.validation-status.failed .validation-status-icon{background:#fff0ed;color:#c54e42}.validation-status b,.validation-status small{display:block}.validation-status b{font-size:14px}.validation-status small{margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5}.validation-spinner{width:20px;height:20px;border:3px solid #bfd5f5;border-top-color:#2779ed;border-radius:50%;animation:catalog-validation-spin .4s linear infinite}@keyframes catalog-validation-spin{to{transform:rotate(360deg)}}@media(max-width:900px){.catalog-hierarchy-toolbar{align-items:stretch;flex-direction:column}.hierarchy-actions{flex-wrap:wrap}.hierarchy-search{width:100%}}@media(max-width:720px){.catalog-hierarchy-head{align-items:flex-start;flex-direction:column}.catalog-hierarchy-list{padding-left:12px;padding-right:12px}.catalog-validation-floating{right:12px;top:96px;width:calc(100vw - 24px)}}
.catalog-layout{position:relative}.catalog-detail-overlay{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;min-width:0;background:#fff;overflow:auto}.catalog-detail-back{flex:none;padding:10px 16px;border-bottom:1px solid var(--border);background:#fbfdff}.catalog-detail-back button{display:inline-flex;align-items:center;gap:6px;min-height:36px;font-size:13px}
.batch-select-panel{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:14px 28px 0}.batch-select-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:28px;padding:16px 20px 18px;border:1px solid #dce8f6;border-radius:8px;background:#fbfdff}.batch-select-head>div{min-width:0;flex:1}.batch-select-head h3{margin:4px 0;font-size:18px;white-space:nowrap}.batch-select-head small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px}.batch-search{width:min(440px,42%);height:38px;margin:0;background:#fff;flex:0 0 min(440px,42%)}.batch-search input{font-size:13px}.batch-tree-scroll{flex:1;min-height:0;overflow:auto;margin-top:14px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:#fbfdff;scrollbar-width:none;-ms-overflow-style:none}.batch-tree-scroll::-webkit-scrollbar{width:0;height:0}.batch-selected-hint{flex:none;margin-top:12px;padding:12px 14px;border:1px solid #cfe2ff;border-radius:8px;background:#edf6ff;color:#2777df;font-size:13px}.batch-selected-hint strong{font-size:16px}.catalog-page :deep(.catalog-batch-dialog){width:min(1240px,calc(100vw - 40px));height:min(820px,calc(100vh - 32px));max-height:none;display:flex;flex-direction:column;overflow:hidden}.catalog-page :deep(.catalog-batch-dialog .dialog-head){flex:none}.catalog-page :deep(.catalog-batch-dialog .dialog-actions){flex:none}.catalog-page :deep(.catalog-batch-dialog .tip){flex:none}
@media(max-width:760px){.batch-select-head{align-items:stretch;flex-direction:column}.batch-select-head h3,.batch-select-head small{white-space:normal}.batch-search{width:100%;flex:0 0 auto}}
.catalog-mode-tabs button.active{background:var(--accent);color:#fff}.catalog-create-tools button:hover{border-color:var(--accent);color:var(--accent)}.catalog-status.published{background:#eef6ff;color:#2367bd}.catalog-version-bar button.active{border-color:var(--accent);color:var(--accent)}.catalog-version-list em.published,.catalog-validation .panel-head b.passed,.validation-row.passed{color:#2367bd}.validation-status.passed .validation-status-icon{background:#eef6ff;color:#2367bd}
.attribute-binding-list,.realtime-point-groups{display:grid;gap:14px}.attribute-binding-group,.realtime-point-group{border:1px solid var(--border);border-radius:8px;background:#fbfdff;overflow:hidden}.binding-group-title{min-height:42px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid var(--border);color:#36516f}.binding-group-title small{margin-left:auto;color:var(--muted);font-size:11px}.attribute-binding-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:12px}.fixed-attribute-card{display:grid;gap:6px;padding:13px;border:1px solid #dce6f2;border-radius:8px;background:#fff}.fixed-attribute-card small{color:#7890aa;font:10px ui-monospace,Consolas,monospace}.fixed-attribute-card h4{margin:4px 0 0;color:#263d58;font-size:14px}.fixed-attribute-card strong{color:#1f6bc5;font-size:22px}.fixed-attribute-card strong em{font-size:12px;font-style:normal;color:#5d7895}.fixed-attribute-card>span{color:var(--muted);font-size:10px}.fixed-attribute-card input{height:27px;padding:0 7px;border:1px solid var(--border);background:#fff}.realtime-point-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;padding:12px}.realtime-point-card{display:grid;gap:8px;padding:14px;border:1px solid #dce6f2;border-radius:9px;background:#fff;box-shadow:0 3px 10px #284c7310}.realtime-point-card-head{display:flex;justify-content:space-between;gap:8px;color:#66809e;font:10px ui-monospace,Consolas,monospace}.realtime-point-card-head small{padding:2px 6px;border-radius:10px;background:#eef5ff;color:#2879df}.realtime-point-card h4{margin:0;color:#263d58;font-size:14px}.realtime-point-value{display:flex;align-items:baseline;gap:6px;min-height:48px}.realtime-point-value strong{color:#1f6bc5;font-size:30px;font-weight:700}.realtime-point-value em{color:#66809e;font-size:12px;font-style:normal}.realtime-point-meta{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px}.realtime-point-meta span:first-child{max-width:150px;overflow:hidden;text-overflow:ellipsis}.point-card-edit{height:26px;padding:0 7px;border:1px solid var(--border);background:#fff}
.catalog-detail-overlay{overflow:hidden}.catalog-content{flex:1;min-height:0;display:flex;flex-direction:column;padding:12px 14px}.catalog-content>.catalog-tab-panel,.catalog-content>.catalog-basic-grid{flex:1;min-height:0}.catalog-tab-panel{display:flex;flex-direction:column;min-height:0;overflow:hidden}.catalog-basic-grid{align-items:stretch}.catalog-basic-grid>.panel{display:flex;flex-direction:column;min-height:0}.catalog-basic-grid>.panel .dialog-fields,.catalog-version-panel .catalog-version-list{flex:1;min-height:0;overflow:auto;scrollbar-width:none}.catalog-basic-grid>.panel .dialog-fields::-webkit-scrollbar,.catalog-version-panel .catalog-version-list::-webkit-scrollbar{display:none}.template-filter-bar{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);background:#fbfdff}.template-search{flex:1;min-width:220px;width:auto;margin:0;background:#fff}.template-filter-bar select{height:32px;min-width:150px;padding:0 9px;border:1px solid #d6e3f2;border-radius:6px;background:#fff;color:#45617e;outline:0}.template-scroll{flex:1;min-height:0;overflow:auto;scrollbar-width:none;-ms-overflow-style:none}.template-scroll::-webkit-scrollbar{display:none}.catalog-tab-panel>.attribute-binding-list,.catalog-tab-panel>.realtime-point-groups{padding:12px}.catalog-tab-panel>.catalog-save{flex:none;margin:10px 12px}.fixed-attribute-card select{width:100%;height:30px;padding:0 8px;border:1px solid #d6e3f2;border-radius:6px;background:#fff;color:#334f6d}.fixed-attribute-card .table-action{justify-self:start}.point-card-form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.point-card-form-row label,.point-card-path{display:grid;gap:5px;color:#7087a0;font-size:10px}.point-card-form-row select,.point-card-form-row input,.point-card-path input{width:100%;height:29px;padding:0 8px;border:1px solid #d6e3f2;border-radius:5px;background:#fff;color:#2f4965;outline:0}.point-card-form-row b,.point-card-path b{min-height:29px;display:flex;align-items:center;padding:0 8px;border-radius:5px;background:#f6f9fd;color:#385574;font:11px ui-monospace,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.point-card-path{padding-top:2px}.realtime-point-card .realtime-point-meta{align-items:center}.realtime-point-card .table-action{margin-left:auto}.catalog-tab-panel>.catalog-table{margin:12px;min-height:0}.catalog-tab-panel>.catalog-table.template-scroll{margin-top:0}@media(max-width:760px){.template-filter-bar{align-items:stretch;flex-direction:column}.template-search,.template-filter-bar select{width:100%;min-width:0}.point-card-form-row{grid-template-columns:1fr}}
.catalog-version-panel .catalog-version-list{align-content:start;grid-auto-rows:min-content}.catalog-version-row{min-height:44px;padding:7px 10px}.catalog-version-row small{margin-top:3px}.catalog-tab-panel>.attribute-binding-list,.catalog-tab-panel>.realtime-point-groups{gap:9px;padding:9px}.attribute-binding-group,.realtime-point-group{border-radius:7px}.binding-group-title{min-height:34px;padding:0 10px;font-size:12px}.attribute-binding-grid{grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:7px;padding:8px}.fixed-attribute-card{gap:4px;padding:9px;border-radius:6px}.fixed-attribute-card h4{margin:1px 0 0;font-size:12px;line-height:1.3}.fixed-attribute-card small{font-size:9px}.fixed-attribute-card strong{font-size:16px;line-height:1.25}.fixed-attribute-card>span{font-size:9px}.fixed-attribute-card select{height:28px;font-size:11px}.realtime-point-grid{grid-template-columns:repeat(auto-fill,minmax(184px,1fr));gap:8px;padding:8px}.realtime-point-card{gap:6px;padding:10px;border-radius:7px}.realtime-point-card h4{font-size:12px}.point-card-form-row{gap:6px}.point-card-form-row label,.point-card-path{gap:3px;font-size:9px}.point-card-form-row select,.point-card-form-row input,.point-card-path input{height:27px;font-size:10px}.point-card-form-row b,.point-card-path b{min-height:27px;font-size:10px}.realtime-point-meta{font-size:9px}
.template-filter-bar select,.fixed-attribute-card select,.point-card-form-row select{appearance:none;padding-right:31px;border-color:#d6e1ed;border-radius:8px;background-color:#fff;background-image:linear-gradient(45deg,transparent 50%,#7890aa 50%),linear-gradient(135deg,#7890aa 50%,transparent 50%);background-position:calc(100% - 15px) calc(50% - 2px),calc(100% - 10px) calc(50% - 2px);background-size:5px 5px,5px 5px;background-repeat:no-repeat;box-shadow:0 1px 2px #17375c08}.template-filter-bar select{height:36px}.fixed-attribute-card select{height:28px}.point-card-form-row select{height:27px}
.catalog-template-scroll{flex:1;min-height:0;margin:0 10px 10px;padding:0 3px 0 0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c7d8eb transparent}.catalog-template-scroll::-webkit-scrollbar{width:6px}.catalog-template-scroll::-webkit-scrollbar-thumb{border-radius:999px;background:#c7d8eb}.catalog-template-scroll>.attribute-binding-list,.catalog-template-scroll>.realtime-point-groups{display:grid;gap:9px;min-height:min-content;padding:9px 10px 16px}.realtime-point-group{overflow:hidden}.realtime-point-grid{align-items:start;grid-auto-rows:min-content;padding:10px}.realtime-point-card{display:grid;align-content:start;align-self:start;min-width:0;min-height:0;max-height:none;margin:7px 0;padding:14px 12px;overflow:visible}.realtime-point-card>*{min-width:0;min-height:0}.realtime-point-card-head{align-items:flex-start;min-width:0}.realtime-point-card-head>span{min-width:0;flex:1 1 auto;overflow-wrap:anywhere;line-height:1.35}.realtime-point-card-head small{min-width:0;max-width:48%;flex:0 1 auto;white-space:normal;overflow-wrap:anywhere;text-align:right;line-height:1.35}.realtime-point-card h4{overflow-wrap:anywhere;line-height:1.4}.point-card-form-row{grid-template-columns:repeat(auto-fit,minmax(min(100%,112px),1fr));align-items:start}.point-card-form-row label,.point-card-path{min-width:0}.point-card-form-row select,.point-card-form-row input,.point-card-path input{box-sizing:border-box;min-width:0}.point-card-path b{display:block;min-width:0;white-space:normal;overflow:visible;overflow-wrap:anywhere;word-break:break-word;height:auto;min-height:27px;padding-top:5px;padding-bottom:5px}.realtime-point-meta span:first-child{max-width:none;white-space:normal;overflow-wrap:anywhere}.realtime-point-card .realtime-point-meta{min-height:22px;align-items:center}
</style>
