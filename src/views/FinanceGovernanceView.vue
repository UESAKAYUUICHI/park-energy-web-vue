<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppSelect from '@/components/app/AppSelect.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { addReconciliationItem, billingPeriodAction, billingPeriods, createBillingPeriod, createReconciliationBatch, finishReconciliation, reconciliationBatch, reconciliationBatches, reconciliationCandidates, reconciliationItemAction, rootOrgs } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { channelLabel, financeStatusLabel } from '@/utils/enumLabels'

type FinanceDetail = RecordRow & { bills?: RecordRow[]; items?: RecordRow[] }
const route = useRoute(), session = useSessionStore(), error = useAlertRef()
const props = withDefaults(defineProps<{ mode?: 'periods' | 'reconciliations'; embedded?: boolean }>(), { embedded: false })
const isPeriod = computed(() => props.mode ? props.mode === 'periods' : route.name === 'billing-periods')
const rows = ref<RecordRow[]>([]), orgs = ref<RecordRow[]>([]), loading = ref(false), keyword = ref(''), status = ref('')
const createOpen = ref(false), detailOpen = ref(false), detail = ref<FinanceDetail>({}), saving = ref(false), selected = ref<RecordRow>({})
const periodForm = reactive({ orgId: '', periodCode: '', startDate: '', endDate: '', remark: '' })
const reconForm = reactive({ orgId: '', statementNo: '', channel: 'OFFLINE', statementDate: '', statementAmount: '', remark: '' })
const itemForm = reactive({ bankReference: '', payerName: '', receivedAmount: '', receivedTime: '' })
const candidates = ref<RecordRow[]>([]), candidateItem = ref<RecordRow>({}), candidateOpen = ref(false)
const selectedPeriodOrg = computed(() => orgs.value.find((item) => String(item.id) === periodForm.orgId))
const selectedReconOrg = computed(() => orgs.value.find((item) => String(item.id) === reconForm.orgId))
const periodColumns = [{ key: 'period_code', label: '账期' }, { key: 'org_name', label: '园区' }, { key: 'start_date', label: '开始日期' }, { key: 'end_date', label: '结束日期' }, { key: 'bill_count', label: '账单数' }, { key: 'outstanding_amount', label: '未收金额' }, { key: 'status', label: '状态', format: financeStatusLabel }]
const reconColumns = [{ key: 'statement_no', label: '对账单号' }, { key: 'org_name', label: '园区' }, { key: 'channel', label: '渠道', format: channelLabel }, { key: 'statement_date', label: '对账日期' }, { key: 'statement_amount', label: '对账金额' }, { key: 'difference_count', label: '差异' }, { key: 'status', label: '状态', format: financeStatusLabel }]
const now = () => new Date().toISOString().slice(0, 10)
function resetForms() { const month = now().slice(0, 7); Object.assign(periodForm, { orgId: '', periodCode: month, startDate: `${month}-01`, endDate: '', remark: '' }); Object.assign(reconForm, { orgId: '', statementNo: '', channel: 'OFFLINE', statementDate: now(), statementAmount: '', remark: '' }) }
async function load() { loading.value = true; try { const data = isPeriod.value ? await billingPeriods({ pageNum: 1, pageSize: 200, keyword: keyword.value || undefined, status: status.value || undefined }) : await reconciliationBatches({ pageNum: 1, pageSize: 200, keyword: keyword.value || undefined, status: status.value || undefined }); rows.value = data.records } catch (cause) { error.value = cause instanceof Error ? cause.message : '财务治理数据读取失败' } finally { loading.value = false } }
async function create() { saving.value = true; try { if (isPeriod.value) await createBillingPeriod({ ...periodForm, orgId: Number(periodForm.orgId) }); else await createReconciliationBatch({ ...reconForm, orgId: Number(reconForm.orgId), statementAmount: Number(reconForm.statementAmount) }); createOpen.value = false; await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '创建失败' } finally { saving.value = false } }
async function openDetail(row: RecordRow) { selected.value = row; try { detail.value = isPeriod.value ? row : await reconciliationBatch(row.id); detailOpen.value = true } catch (cause) { error.value = cause instanceof Error ? cause.message : '详情读取失败' } }
async function periodAction(row: RecordRow, action: 'close' | 'reopen') { const body = action === 'reopen' ? { reason: '复核账期数据后重新开放' } : {}; try { await billingPeriodAction(row.id, action, body); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '账期操作失败' } }
async function addItem() { if (!selected.value.id) return; saving.value = true; try { detail.value = await addReconciliationItem(selected.value.id, { ...itemForm, receivedAmount: Number(itemForm.receivedAmount) }); Object.assign(itemForm, { bankReference: '', payerName: '', receivedAmount: '', receivedTime: '' }) } catch (cause) { error.value = cause instanceof Error ? cause.message : '流水录入失败' } finally { saving.value = false } }
async function openCandidates(item: RecordRow) { try { candidateItem.value = item; candidates.value = await reconciliationCandidates(item.id); candidateOpen.value = true } catch (cause) { error.value = cause instanceof Error ? cause.message : '收款候选读取失败' } }
async function match(payment: RecordRow) { try { detail.value = await reconciliationItemAction(candidateItem.value.id, 'match', { paymentId: payment.id }); candidateOpen.value = false } catch (cause) { error.value = cause instanceof Error ? cause.message : '收款匹配失败' } }
async function markDifference(item: RecordRow) { try { detail.value = await reconciliationItemAction(item.id, 'difference', { reason: '需人工复核银行流水或收款登记' }) } catch (cause) { error.value = cause instanceof Error ? cause.message : '差异标记失败' } }
async function finish() { try { detail.value = await finishReconciliation(selected.value.id); await load() } catch (cause) { error.value = cause instanceof Error ? cause.message : '完成对账失败' } }
onMounted(async () => { try { orgs.value = await rootOrgs() } catch { orgs.value = [] } resetForms(); await load() })
watch(isPeriod, () => { keyword.value = ''; status.value = ''; resetForms(); void load() })
</script>

<template>
  <section class="view-page finance-governance">
    <header v-if="!props.embedded" class="view-head"><div><p class="eyebrow">{{ isPeriod ? 'ACCOUNTING PERIOD · CLOSE CONTROL' : 'RECEIPT · STATEMENT · RECONCILIATION' }}</p><h1>{{ isPeriod ? '账期管理' : '收款对账' }}</h1></div><button class="btn-primary" @click="resetForms();createOpen=true">{{ isPeriod ? '新建账期' : '新建对账单' }}</button></header>
    <div v-else class="embedded-action-row"><button class="btn-primary" @click="resetForms();createOpen=true">{{ isPeriod ? '新建账期' : '新建对账单' }}</button></div>
    <FilterBar v-model:keyword="keyword" :busy="loading" :placeholder="isPeriod ? '账期编码' : '对账单号'" @query="load" @reset="() => { keyword=''; status=''; load() }"><label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option v-if="isPeriod" value="OPEN">开放</option><option v-if="isPeriod" value="CLOSED">已关账</option><option v-if="!isPeriod" value="DRAFT">待对账</option><option v-if="!isPeriod" value="RECONCILED">已完成</option></AppSelect></label></FilterBar>
    <AppDataTable :title="isPeriod ? '结算账期' : '收款对账单'" :columns="isPeriod ? periodColumns : reconColumns" :rows="rows" :loading="loading" :error="error" :compact="props.embedded" @detail="openDetail" @refresh="load"><template #actions="{ row }"><button class="link-btn" @click="openDetail(row)">详情</button><button v-if="isPeriod && row.status==='OPEN'" class="link-btn" @click="periodAction(row,'close')">关账</button><button v-if="isPeriod && row.status==='CLOSED'" class="link-btn" @click="periodAction(row,'reopen')">反关账</button></template></AppDataTable>
    <AppDialog v-model:open="createOpen" :title="isPeriod ? '新建账期控制单' : '新建收款对账单'" :eyebrow="isPeriod ? 'PERIOD CONTROL DOCUMENT' : 'RECONCILIATION DOCUMENT'" :saving="saving" :confirm-text="isPeriod ? '建立账期' : '建立对账单'" dialog-class="finance-document-dialog" @submit="create">
      <div class="finance-document period-document">
        <article v-if="isPeriod" class="finance-paper">
          <header><p>ACCOUNTING PERIOD CONTROL</p><h2>账期控制单</h2></header>
          <section class="finance-clause">
            <h3>一、账期范围</h3>
            <p>本控制单适用于园区 <AppSelect v-model="periodForm.orgId"><option value="">请选择园区</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect> 的 <input v-model="periodForm.periodCode" placeholder="2026-08" /> 账期。</p>
          </section>
          <section class="finance-clause inline">
            <h3>二、业务期间</h3>
            <p>本账期覆盖自 <input v-model="periodForm.startDate" type="date" /> 起至 <input v-model="periodForm.endDate" type="date" /> 止的计量、出账、收款与对账业务。</p>
          </section>
          <section class="finance-clause">
            <h3>三、关账说明</h3>
            <textarea v-model="periodForm.remark" placeholder="可填写关账口径、特殊事项、财务复核说明等。"></textarea>
          </section>
        </article>
        <article v-else class="finance-paper">
          <header><p>RECEIPT RECONCILIATION</p><h2>收款对账单</h2></header>
          <section class="finance-clause">
            <h3>一、对账对象</h3>
            <p>本对账单归属园区 <AppSelect v-model="reconForm.orgId"><option value="">请选择园区</option><option v-for="org in orgs" :key="String(org.id)" :value="String(org.id)">{{ org.org_name }}</option></AppSelect> ，外部对账单号为 <input v-model="reconForm.statementNo" placeholder="银行或渠道单号" />。</p>
          </section>
          <section class="finance-clause inline">
            <h3>二、渠道与金额</h3>
            <p>收款渠道 <AppSelect v-model="reconForm.channel"><option>OFFLINE</option><option>BANK</option><option>WECHAT</option><option>ALIPAY</option></AppSelect> ，对账日期 <input v-model="reconForm.statementDate" type="date" /> ，对账金额人民币 <input v-model="reconForm.statementAmount" type="number" min="0" step="0.01" /> 元。</p>
          </section>
          <section class="finance-clause">
            <h3>三、对账说明</h3>
            <textarea v-model="reconForm.remark" placeholder="可填写银行批次、导入文件编号、异常说明等。"></textarea>
          </section>
        </article>
        <aside class="finance-sidecard">
          <b>{{ isPeriod ? '账期影响' : '对账影响' }}</b>
          <strong>{{ isPeriod ? (periodForm.periodCode || '未填写账期') : (reconForm.statementNo || '未填写单号') }}</strong>
          <p>{{ isPeriod ? '建立后作为出账和关账的财务边界，关账前会校验草稿、待审和未发布账单。' : '建立后可录入外部流水，并与系统成功收款做追溯匹配。' }}</p>
          <dl>
            <div><dt>园区</dt><dd>{{ isPeriod ? (selectedPeriodOrg?.org_name || '未选择') : (selectedReconOrg?.org_name || '未选择') }}</dd></div>
            <div><dt>{{ isPeriod ? '期间' : '渠道' }}</dt><dd>{{ isPeriod ? `${periodForm.startDate || '—'} 至 ${periodForm.endDate || '—'}` : reconForm.channel }}</dd></div>
            <div><dt>{{ isPeriod ? '状态' : '金额' }}</dt><dd>{{ isPeriod ? '建立后开放' : `¥${Number(reconForm.statementAmount || 0).toFixed(2)}` }}</dd></div>
          </dl>
        </aside>
      </div>
    </AppDialog>
    <AppDialog v-model:open="detailOpen" :title="isPeriod ? `账期 ${detail.period_code || ''}` : `对账单 ${detail.statement_no || ''}`" :show-footer="false"><template v-if="isPeriod"><div class="fact-list"><span>状态：<b>{{ detail.status }}</b></span><span>关账说明：{{ detail.close_summary || '—' }}</span></div><div class="mini-list"><div v-for="bill in detail.bills || []" :key="String(bill.id)"><b>{{ bill.bill_no }}</b><span>{{ bill.bill_status }} · 未收 ¥{{ bill.outstanding_amount }}</span></div></div></template><template v-else><div class="recon-head"><span>流水 {{ detail.record_count || 0 }} 条 · 已匹配 {{ detail.matched_count || 0 }} · 差异 {{ detail.difference_count || 0 }}</span><button v-if="detail.status==='DRAFT'" class="quiet" @click="finish">完成对账</button></div><div v-if="detail.status==='DRAFT'" class="item-form"><input v-model="itemForm.bankReference" placeholder="银行/渠道流水号"><input v-model="itemForm.payerName" placeholder="付款方"><input v-model="itemForm.receivedAmount" type="number" min="0" step="0.01" placeholder="金额"><input v-model="itemForm.receivedTime" type="datetime-local"><button class="quiet" :disabled="saving" @click="addItem">录入流水</button></div><div class="mini-list recon-list"><div v-for="item in detail.items || []" :key="String(item.id)"><span><b>{{ item.bank_reference || '未提供流水号' }}</b><small>{{ item.payer_name || '未识别付款方' }} · ¥{{ item.received_amount }} · {{ item.received_time }}</small></span><span><em :class="String(item.status).toLowerCase()">{{ item.status }}</em><small v-if="item.payment_no">{{ item.payment_no }} / {{ item.bill_no }}</small><small v-else-if="item.difference_reason">{{ item.difference_reason }}</small></span><span v-if="detail.status==='DRAFT' && item.status==='PENDING'"><button class="link-btn" @click="openCandidates(item)">匹配</button><button class="link-btn" @click="markDifference(item)">差异</button></span></div><p v-if="!(detail.items || []).length" class="empty">暂未录入流水</p></div></template></AppDialog>
    <AppDialog v-model:open="candidateOpen" title="匹配系统收款" :show-footer="false"><div class="mini-list"><div v-for="payment in candidates" :key="String(payment.id)"><span><b>{{ payment.payment_no }}</b><small>{{ payment.account_name }} · {{ payment.bill_no }} · {{ payment.pay_time }}</small></span><b>¥{{ payment.pay_amount }}</b><button class="link-btn" @click="match(payment)">确认匹配</button></div><p v-if="!candidates.length" class="empty">没有金额一致的可匹配收款，请核对后标记差异。</p></div></AppDialog>
  </section>
</template>

<style scoped>
.finance-governance{min-height:0}.fact-list,.recon-head{display:flex;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--border);border-radius:9px;background:#f8fbff;font-size:12px}.item-form{display:grid;grid-template-columns:1.2fr 1fr .8fr 1.3fr auto;gap:8px;margin:12px 0}.item-form input{min-width:0}.mini-list{display:grid;margin-top:12px;border-top:1px solid var(--border)}.mini-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:11px 2px;border-bottom:1px solid var(--border);font-size:12px}.mini-list span,.mini-list small{display:block}.mini-list small{margin-top:4px;color:var(--muted);font-size:11px}.mini-list em{font-style:normal;color:#596f87}.mini-list em.matched{color:#14845c}.mini-list em.difference{color:#b9690a}.recon-list>div>span:last-of-type{text-align:right}.empty{margin:26px 0;color:var(--muted);text-align:center;font-size:12px}.finance-document{width:min(980px,80vw);display:grid;grid-template-columns:minmax(0,1fr) 238px;gap:16px;max-height:72vh;overflow:auto;scrollbar-width:none}.finance-document::-webkit-scrollbar,.finance-paper::-webkit-scrollbar{display:none}.finance-paper{padding:26px;border:1px solid #d7e2ee;border-radius:12px;background:#fff}.finance-paper header{text-align:center;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid #e8eef5}.finance-paper header p{margin:0 0 5px;color:#2d73bd;font:700 11px ui-monospace,Consolas,monospace;letter-spacing:.16em}.finance-paper h2{margin:0;font:700 25px Georgia,"Noto Serif SC",serif}.finance-clause{margin-top:17px}.finance-clause h3{margin:0 0 9px;font-size:14px}.finance-clause p{margin:0;color:#405a75;font-size:14px;line-height:2.35}.finance-clause select,.finance-clause input,.finance-clause textarea{min-height:34px;border:0;border-bottom:1px solid #9fb9d7;border-radius:0;background:#f8fbff;padding:0 8px}.finance-clause select{min-width:220px}.finance-clause.inline input[type='date']{width:145px}.finance-clause.inline input[type='number']{width:120px}.finance-clause textarea{width:100%;min-height:92px;padding:10px;border:1px solid #dbe5f0;border-radius:8px;resize:vertical}.finance-sidecard{position:sticky;top:0;align-self:start;padding:15px;border:1px solid #d8e4f1;border-radius:12px;background:linear-gradient(180deg,#f8fbff,#fff)}.finance-sidecard>b{color:#607897;font-size:12px}.finance-sidecard>strong{display:block;margin:8px 0;color:#245d9f;font-size:18px}.finance-sidecard p{margin:0;color:#637891;font-size:12px;line-height:1.65}.finance-sidecard dl{display:grid;gap:8px;margin:14px 0 0}.finance-sidecard dl div{display:flex;justify-content:space-between;gap:8px}.finance-sidecard dt,.finance-sidecard dd{margin:0;font-size:12px}.finance-sidecard dt{color:#8a99aa}.finance-sidecard dd{text-align:right;color:#314b69}@media(max-width:820px){.item-form{grid-template-columns:1fr 1fr}.item-form button{grid-column:1/-1}.mini-list>div{grid-template-columns:minmax(0,1fr) auto}.mini-list>div>span:last-child{grid-column:1/-1}.fact-list{align-items:flex-start;flex-direction:column}.finance-document{grid-template-columns:1fr;width:min(94vw,720px)}.finance-sidecard{position:relative}}
</style>
