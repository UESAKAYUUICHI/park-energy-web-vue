<script setup lang="ts">
import { computed, isVNode, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, useSlots, type VNode } from 'vue'
import { ChevronDown } from '@lucide/vue'

type SelectValue = string | number | boolean | null | undefined
type SelectOption = { value: SelectValue; label: string; disabled: boolean; hidden: boolean }

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue?: SelectValue
  placeholder?: string
  modelModifiers?: Record<string, boolean>
}>(), { placeholder: '请选择', modelModifiers: () => ({}) })

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  change: [event: Event]
}>()

const attrs = useAttrs()
const slots = useSlots()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const searchText = ref('')
const disabled = computed(() => Boolean(attrs.disabled))

function flatten(nodes: unknown[]): VNode[] {
  return nodes.flatMap((node) => {
    if (!isVNode(node)) return []
    return Array.isArray(node.children) ? flatten(node.children) : [node]
  })
}

function optionText(node: VNode): string {
  if (typeof node.children === 'string') return node.children.trim()
  if (Array.isArray(node.children)) return node.children.map((child) => {
    if (isVNode(child)) return optionText(child)
    return typeof child === 'string' || typeof child === 'number' ? String(child) : ''
  }).join('').trim()
  return ''
}

const options = computed<SelectOption[]>(() => flatten(slots.default?.() || [])
  .filter((node) => node.type === 'option')
  .map((node) => {
    const optionProps = (node.props || {}) as Record<string, unknown>
    const rawValue = optionProps.value
    const value: SelectValue = typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean' || rawValue === null || rawValue === undefined ? rawValue ?? '' : String(rawValue)
    return {
      value,
      label: optionText(node),
      disabled: 'disabled' in optionProps && optionProps.disabled !== false,
      hidden: 'hidden' in optionProps && optionProps.hidden !== false,
    }
  }))

const selected = computed(() => options.value.find((option) => String(option.value ?? '') === String(props.modelValue ?? '')))
const searchable = computed(() => options.value.length > 8)
const visibleOptions = computed(() => options.value.filter((option) => !option.hidden && !(option.disabled && String(option.value ?? '') === '') && (!searchable.value || !searchText.value.trim() || option.label.toLowerCase().includes(searchText.value.trim().toLowerCase()))))
const displayText = computed(() => selected.value?.label || props.placeholder)
const isPlaceholder = computed(() => !selected.value || String(selected.value.value ?? '') === '')

function normalize(value: SelectValue): SelectValue {
  if (props.modelModifiers.number && value !== '' && value !== null && value !== undefined) return Number(value)
  return value
}

function choose(option: SelectOption) {
  if (option.disabled) return
  const value = normalize(option.value)
  emit('update:modelValue', value)
  emit('change', { target: { value }, currentTarget: { value } } as unknown as Event)
  open.value = false
  nextTick(() => trigger.value?.focus())
}

function toggle() {
  if (!disabled.value) { open.value = !open.value; if (!open.value) searchText.value = '' }
}

function onKeydown(event: KeyboardEvent) {
  if (disabled.value) return
  if (event.key === 'Escape') { open.value = false; return }
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); return }
  if (event.key === 'ArrowDown') { event.preventDefault(); open.value = true }
}

function onDocumentPointerDown(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentPointerDown))
</script>

<template>
  <span ref="root" class="app-select" :class="{ open, disabled }" v-bind="attrs">
    <button ref="trigger" type="button" class="app-select-trigger" :disabled="disabled" :aria-expanded="open" aria-haspopup="listbox" @click="toggle" @keydown="onKeydown">
      <span class="app-select-value" :class="{ placeholder: isPlaceholder }">{{ displayText }}</span>
      <ChevronDown class="app-select-arrow" :size="16" aria-hidden="true" />
    </button>
    <Transition name="app-select-menu">
      <span v-if="open" class="app-select-menu" role="listbox">
        <input v-if="searchable" v-model="searchText" class="app-select-search" placeholder="搜索选项" @click.stop />
        <button v-for="option in visibleOptions" :key="String(option.value)" type="button" class="app-select-option" :class="{ active: String(option.value ?? '') === String(modelValue ?? '') }" :disabled="option.disabled" @click="choose(option)">{{ option.label }}</button>
      </span>
    </Transition>
  </span>
</template>
<style scoped>
.app-select-search{box-sizing:border-box;width:calc(100% - 12px);height:30px;margin:6px;border:1px solid #d9e3eb;border-radius:5px;padding:0 8px;outline:0;font-size:12px}
.app-select-search:focus{border-color:#6b9fba}
</style>
