<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppDrawer from '@/components/app/AppDrawer.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { billCollections, createBillCollection, overdueBills } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'

const session = useSessionStore()
const rows = ref<RecordRow[]>([])
const selected = ref<RecordRow | null>(null)
const records = ref<RecordRow[]>([])
const keyword = ref('')
const loading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const error = useAlertRef()
const form = reactive({ collectionType: 'NOTICE', content: '', result: '', nextFollowTime: '' })

const columns = [
  { key: 'bill_no', label: '账单编号' }, { key: 'account_name', label: '计费账户' }, { key: 'tenant_name_snapshot', label: '租户' },
  { key: 'due_date', label: '应缴截止日' }, { key: 'overdue_days', label: '逾期天数' },
  { key: 'outstanding_amount', label: '剩余应收', format: (value: unknown) => `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
]
const recordColumns = [{ key: 'collection_time', label: '登记时间' }, { key: 'collection_type', label: '方式' }, { key: 'operator', label: '登记人' }, { key: 'content', label: '沟通内容' }, { key: 'result', label: '结果' }, { key: 'next_follow_time', label: '下次跟进' }]

async function load() {
  loading.value = true
  error.value = ''
  try { rows.value = (await overdueBills({ pageNum: 1, pageSize: 200, keyword: keyword.value })).records }
  catch (e) { error.value = e instanceof Error ? e.message : '逾期应收数据读取失败'; rows.value = [] }
  finally { loading.value = false }
}
async function open(row: RecordRow) {
  selected.value = row
  try { records.value = await billCollections(row.id) }
  catch (e) { error.value = e instanceof Error ? e.message : '催缴记录读取失败'; records.value = [] }
}
function resetForm() { form.collectionType = 'NOTICE'; form.content = ''; form.result = ''; form.nextFollowTime = '' }
function openCreate() { if (!selected.value) return; resetForm(); dialog.value = true }
async function save() {
  if (!selected.value) return
  saving.value = true
  try {
    await createBillCollection(selected.value.id, { ...form, operator: session.user?.username || 'admin', nextFollowTime: form.nextFollowTime || undefined })
    records.value = await billCollections(selected.value.id)
    dialog.value = false
  } catch (e) { error.value = e instanceof Error ? e.message : '催缴记录保存失败' }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <section class="view-page">
    <header class="view-head"><div><p class="eyebrow">COLLECTION · RECEIVABLES</p><h1>催缴中心</h1><p>集中跟进已逾应缴截止日且仍有剩余应收的已发布账单。</p></div><button class="quiet" @click="load">刷新</button></header>
    <FilterBar v-model:keyword="keyword" :busy="loading" placeholder="账单编号、租户或计费账户" @query="load" @reset="()=>{keyword='';load()}" />
    <AppDataTable title="逾期应收清单" :columns="columns" :rows="rows" :loading="loading" :error="error" @refresh="load"><template #actions="{ row }"><button class="link-btn" @click="open(row)">跟进催缴</button></template></AppDataTable>
    <AppDrawer :open="Boolean(selected)" title="账单催缴跟进" @update:open="(open)=>{if(!open) selected=null}"><div v-if="selected" class="detail-summary"><p><b>{{ selected.bill_no }}</b> · {{ selected.account_name }}</p><p>剩余应收：¥ {{ Number(selected.outstanding_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) }}；已逾期 {{ selected.overdue_days }} 天</p></div><button v-if="selected && session.can('billing:collection:edit')" class="primary" @click="openCreate">登记催缴</button><AppDataTable title="催缴记录" :columns="recordColumns" :rows="records" /></AppDrawer>
    <AppDialog v-model:open="dialog" title="登记催缴记录" description="记录对账、提醒及后续跟进结果，形成可审计的收款闭环。" :saving="saving" @submit="save"><div class="dialog-fields"><label class="dialog-field"><span>催缴方式</span><select v-model="form.collectionType"><option value="NOTICE">账单通知</option><option value="PHONE">电话沟通</option><option value="EMAIL">邮件</option><option value="SMS">短信</option><option value="STOP_SERVICE">停服预警</option></select></label><label class="dialog-field"><span>下次跟进时间</span><input v-model="form.nextFollowTime" type="datetime-local"></label><label class="dialog-field full"><span>沟通内容</span><textarea v-model="form.content" required></textarea></label><label class="dialog-field full"><span>本次结果</span><textarea v-model="form.result"></textarea></label></div></AppDialog>
  </section>
</template>
