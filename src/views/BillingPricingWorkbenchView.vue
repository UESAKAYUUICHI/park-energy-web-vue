<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, ChevronRight, CircleAlert, Gauge, Layers3, Plus, RefreshCw, Settings2, SlidersHorizontal, Zap } from '@lucide/vue'
import AppDataTable, { type TableColumn } from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import AppSelect from '@/components/app/AppSelect.vue'
import MeteringView from '@/views/MeteringView.vue'
import ResourceView from '@/views/ResourceView.vue'
import TariffPlanView from '@/views/TariffPlanView.vue'
import { createResource, listResource, settlementMeters, tariffPlans } from '@/api/platform'
import type { RecordRow } from '@/types/domain'

type AdvancedView = 'rules' | 'rule-scopes' | 'price-items'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const keyword = ref('')
const status = ref('')
const rows = ref<RecordRow[]>([])
const accounts = ref<RecordRow[]>([])
const orgs = ref<RecordRow[]>([])
const devices = ref<RecordRow[]>([])
const deviceTypes = ref<RecordRow[]>([])
const scopes = ref<RecordRow[]>([])
const prices = ref<RecordRow[]>([])
const tariffs = ref<RecordRow[]>([])
const meters = ref<RecordRow[]>([])
const selected = ref<RecordRow | null>(null)
const detailOpen = ref(false)
const wizardOpen = ref(false)
const wizardStep = ref(1)
const tariffOpen = ref(false)
const meterOpen = ref(false)
const advancedOpen = ref(false)
const advancedView = ref<AdvancedView>('rules')
const form = reactive({ accountId: '', ruleName: '', scopeType: 'ORG', scopeId: '', deviceTypeId: '', metricPointCode: 'total_energy', billingCycle: 'MONTHLY', priceMode: 'UNIT_PRICE', unitPrice: '', tariffPlanId: '', remark: '' })
const tiers = ref([{ label: '第一阶梯', min: '0', max: '', price: '' }])

const columns: TableColumn[] = [
  { key: 'schemeName', label: '计费方案', width: '20%' },
  { key: 'accountName', label: '结算对象', width: '19%' },
  { key: 'meteringSource', label: '计量来源', width: '18%' },
  { key: 'pricingMode', label: '计价方式', width: '13%' },
  { key: 'scopeSummary', label: '适用范围', width: '15%' },
  { key: 'readiness', label: '配置状态', width: '12%' },
]
const accountName = (id: unknown) => String(accounts.value.find((item) => String(item.id) === String(id))?.account_name || `账户 ${id || '—'}`)
const deviceTypeName = (id: unknown) => String(deviceTypes.value.find((item) => String(item.id) === String(id))?.type_name || `类型 ${id || '—'}`)
const scopeText = (ruleId: unknown) => {
  const related = scopes.value.filter((item) => String(item.rule_id) === String(ruleId))
  if (!related.length) return '尚未绑定'
  if (related.length > 1) return `${related.length} 个范围`
  const item = related[0]
  if (!item) return '尚未绑定'
  if (item.scope_type === 'ORG') return String(orgs.value.find((org) => String(org.id) === String(item.scope_id))?.org_name || `组织 ${item.scope_id}`)
  return String(devices.value.find((device) => String(device.id) === String(item.scope_id))?.device_name || `设备 ${item.scope_id}`)
}
const priceText = (rule: RecordRow) => {
  if (rule.price_mode === 'TIME_PERIOD') return String(tariffs.value.find((item) => String(item.id) === String(rule.tariff_plan_id))?.plan_name || '分时电价')
  const related = prices.value.filter((item) => String(item.rule_id) === String(rule.id))
  if (rule.price_mode === 'TIERED') return related.length ? `${related.length} 阶梯` : '未配置阶梯'
  return related[0] ? `¥${Number(related[0].unit_price || 0).toFixed(4)}` : '未配置价格'
}
const plans = computed<RecordRow[]>(() => rows.value.map((rule) => {
  const scopeCount = scopes.value.filter((item) => String(item.rule_id) === String(rule.id)).length
  const priceCount = prices.value.filter((item) => String(item.rule_id) === String(rule.id)).length
  const priceReady = rule.price_mode === 'TIME_PERIOD' ? Boolean(rule.tariff_plan_id) : priceCount > 0
  const ready = Boolean(rule.account_id && rule.device_type_id && rule.metric_point_code && scopeCount && priceReady)
  return { ...rule, schemeName: rule.rule_name, accountName: accountName(rule.account_id), meteringSource: `${deviceTypeName(rule.device_type_id)} · ${rule.metric_point_code || '未选测点'}`, pricingMode: ({ UNIT_PRICE: '按量单价', FIXED: '固定金额', TIERED: '阶梯计价', TIME_PERIOD: '分时电价' } as Record<string, string>)[String(rule.price_mode)] || rule.price_mode, priceSummary: priceText(rule), scopeSummary: scopeText(rule.id), readiness: ready ? (Number(rule.enabled) ? '已生效' : '配置完整') : '待补齐', ready } as RecordRow
}))
const filteredPlans = computed(() => plans.value.filter((item) => {
  const matchKeyword = !keyword.value.trim() || [item.schemeName, item.accountName, item.meteringSource, item.scopeSummary].some((value) => String(value || '').toLowerCase().includes(keyword.value.trim().toLowerCase()))
  const matchStatus = !status.value || (status.value === 'ACTIVE' ? Number(item.enabled) === 1 && item.ready : status.value === 'INCOMPLETE' ? !item.ready : Number(item.enabled) !== 1 && item.ready)
  return matchKeyword && matchStatus
}))
const activeCount = computed(() => plans.value.filter((item) => Number(item.enabled) === 1 && item.ready).length)
const incompleteCount = computed(() => plans.value.filter((item) => !item.ready).length)
const enabledMeters = computed(() => meters.value.filter((item) => Number(item.settlement_enabled) === 1).length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [rulesResult, scopesResult, priceResult, accountResult, orgResult, deviceResult, typeResult, tariffResult, meterResult] = await Promise.all([
      listResource('billing', 'rules', { pageSize: 500 }), listResource('billing', 'rule-scopes', { pageSize: 1000 }), listResource('billing', 'price-items', { pageSize: 1000 }), listResource('billing', 'accounts', { pageSize: 500 }), listResource('archive', 'orgs', { pageSize: 500 }), listResource('archive', 'devices', { pageSize: 500 }), listResource('archive', 'device-types', { pageSize: 500 }), tariffPlans({ pageSize: 500 }), settlementMeters(),
    ])
    rows.value = rulesResult.records
    scopes.value = scopesResult.records
    prices.value = priceResult.records
    accounts.value = accountResult.records
    orgs.value = orgResult.records
    devices.value = deviceResult.records
    deviceTypes.value = typeResult.records
    tariffs.value = tariffResult.records
    meters.value = meterResult
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '计费方案读取失败' }
  finally { loading.value = false }
}
function resetWizard() {
  Object.assign(form, { accountId: String(route.query.accountId || ''), ruleName: '', scopeType: 'ORG', scopeId: '', deviceTypeId: '', metricPointCode: 'total_energy', billingCycle: 'MONTHLY', priceMode: 'UNIT_PRICE', unitPrice: '', tariffPlanId: '', remark: '' })
  tiers.value = [{ label: '第一阶梯', min: '0', max: '', price: '' }]
  wizardStep.value = 1
  wizardOpen.value = true
}
function addTier() { tiers.value.push({ label: `第${tiers.value.length + 1}阶梯`, min: tiers.value.at(-1)?.max || '', max: '', price: '' }) }
function removeTier(index: number) { if (tiers.value.length > 1) tiers.value.splice(index, 1) }
function nextStep() {
  error.value = ''
  if (wizardStep.value === 1 && (!form.accountId || !form.ruleName || !form.scopeId)) { error.value = '请先选择结算对象、填写方案名称并确定适用范围'; return }
  if (wizardStep.value === 2 && (!form.deviceTypeId || !form.metricPointCode)) { error.value = '请选择计量来源并填写结算累计测点'; return }
  if (wizardStep.value === 3 && form.priceMode === 'TIME_PERIOD' && !form.tariffPlanId) { error.value = '请选择分时电价方案'; return }
  if (wizardStep.value === 4 && form.priceMode !== 'TIME_PERIOD' && form.priceMode !== 'TIERED' && !form.unitPrice) { error.value = '请填写结算价格'; return }
  if (wizardStep.value < 5) wizardStep.value += 1
}
async function saveScheme() {
  saving.value = true
  error.value = ''
  try {
    const rule = await createResource('billing', 'rules', { account_id: Number(form.accountId), rule_name: form.ruleName, device_type_id: Number(form.deviceTypeId), metric_point_code: form.metricPointCode, billing_cycle: form.billingCycle, price_mode: form.priceMode, tariff_plan_id: form.priceMode === 'TIME_PERIOD' ? Number(form.tariffPlanId) : null, enabled: 1, remark: form.remark })
    await createResource('billing', 'rule-scopes', { rule_id: Number(rule.id), scope_type: form.scopeType, scope_id: Number(form.scopeId) })
    if (form.priceMode === 'TIERED') {
      for (let index = 0; index < tiers.value.length; index += 1) {
        const tier = tiers.value[index]
        if (!tier) continue
        await createResource('billing', 'price-items', { rule_id: Number(rule.id), price_label: tier.label, tier_min: Number(tier.min || 0), tier_max: tier.max === '' ? null : Number(tier.max), unit_price: Number(tier.price), sort: index + 1 })
      }
    } else if (form.priceMode !== 'TIME_PERIOD') {
      await createResource('billing', 'price-items', { rule_id: Number(rule.id), price_label: form.priceMode === 'FIXED' ? '固定金额' : '标准单价', tier_min: 0, tier_max: null, unit_price: Number(form.unitPrice), sort: 1 })
    }
    wizardOpen.value = false
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '计费方案创建失败' }
  finally { saving.value = false }
}
function showDetail(row: RecordRow) { selected.value = row; detailOpen.value = true }
function openAdvanced(view: AdvancedView = 'rules') { advancedView.value = view; advancedOpen.value = true }
function handleLegacyEntry() {
  const view = String(route.query.view || '')
  const action = String(route.query.action || '')
  if (view === 'tariffs') tariffOpen.value = true
  else if (view === 'metering' || action === 'meters' || action === 'changes') meterOpen.value = true
  else if (['rules', 'rule-scopes', 'price-items'].includes(view)) openAdvanced(view as AdvancedView)
}
async function clearQueryAndClose(target: 'tariff' | 'meter' | 'advanced', open: boolean) {
  if (target === 'tariff') tariffOpen.value = open
  if (target === 'meter') meterOpen.value = open
  if (target === 'advanced') advancedOpen.value = open
  if (!open && (route.query.view || route.query.action)) await router.replace({ query: { accountId: route.query.accountId } })
}

onMounted(async () => { await load(); handleLegacyEntry() })
watch(() => [route.query.view, route.query.action], handleLegacyEntry)
</script>

<template>
  <section class="view-page pricing-scheme-page">
    <header class="view-head business-module-head"><div><p class="eyebrow">PRICING SCHEME CONFIGURATION</p><h1>计费方案配置</h1></div><button class="primary" type="button" @click="resetWizard"><Plus :size="15" />新建计费方案</button></header>

    <section class="pricing-overview-strip">
      <article><span>计费方案</span><b>{{ plans.length }}</b></article>
      <article :class="{ healthy: activeCount > 0 }"><span>已生效</span><b>{{ activeCount }}</b></article>
      <article :class="{ warning: incompleteCount > 0 }"><span>待补齐</span><b>{{ incompleteCount }}</b></article>
      <article><span>结算表计</span><b>{{ enabledMeters }}</b><small>已完成准入</small></article>
      <div class="pricing-aux-actions"><button class="quiet" @click="tariffOpen = true"><Zap :size="14" />电价方案库</button><button class="quiet" @click="meterOpen = true"><Gauge :size="14" />表计与变更</button><button class="quiet" @click="openAdvanced()"><Settings2 :size="14" />高级配置</button></div>
    </section>

    <section class="pricing-filter-bar"><div class="crud-search"><input v-model="keyword" placeholder="搜索方案、对象或计量来源" /></div><label class="field inline"><span>配置状态</span><AppSelect v-model="status"><option value="">全部</option><option value="ACTIVE">已生效</option><option value="READY">配置完整</option><option value="INCOMPLETE">待补齐</option></AppSelect></label><button class="quiet" :disabled="loading" @click="load"><RefreshCw :size="14" />刷新</button></section>
    <p v-if="error" class="form-tip">{{ error }}</p>

    <AppDataTable title="计费方案" :columns="columns" :rows="filteredPlans" :loading="loading" empty-text="暂无计费方案，请通过右上角创建第一条方案。" compact>
      <template #cell-readiness="{ row }"><span :class="['scheme-status', row.ready ? (Number(row.enabled) ? 'active' : 'ready') : 'warning']"><Check v-if="row.ready" :size="12" /><CircleAlert v-else :size="12" />{{ row.readiness }}</span></template>
      <template #cell-pricingMode="{ row }"><span>{{ row.pricingMode }}</span><small class="cell-secondary">{{ row.priceSummary }}</small></template>
      <template #actions="{ row }"><button class="link-btn" @click="showDetail(row)">方案详情</button></template>
    </AppDataTable>

    <AppDialog v-model:open="wizardOpen" title="配置计费方案" eyebrow="PRICING SCHEME WIZARD" hide-actions dialog-class="pricing-wizard-dialog">
      <div class="pricing-wizard-body">
        <nav class="pricing-wizard-steps"><span v-for="(label, index) in ['结算对象','计量来源','计价方式','价格配置','确认启用']" :key="label" :class="{ active: wizardStep === index + 1, done: wizardStep > index + 1 }"><i>{{ wizardStep > index + 1 ? '✓' : index + 1 }}</i><b>{{ label }}</b></span></nav>
        <section v-if="wizardStep === 1" class="wizard-business-panel"><header><h3>这套方案给谁使用？</h3></header><div class="dialog-fields"><label class="dialog-field"><span>结算对象*</span><AppSelect v-model="form.accountId"><option value="">请选择计费账户</option><option v-for="item in accounts" :key="String(item.id)" :value="String(item.id)">{{ item.account_name }}</option></AppSelect></label><label class="dialog-field"><span>方案名称*</span><input v-model="form.ruleName" placeholder="例如：商业租户月度电费方案" /></label><label class="dialog-field"><span>适用范围*</span><AppSelect v-model="form.scopeType"><option value="ORG">整个组织</option><option value="DEVICE">指定设备</option></AppSelect></label><label class="dialog-field"><span>{{ form.scopeType === 'ORG' ? '选择组织' : '选择设备' }}*</span><AppSelect v-model="form.scopeId"><option value="">请选择</option><option v-for="item in form.scopeType === 'ORG' ? orgs : devices" :key="String(item.id)" :value="String(item.id)">{{ form.scopeType === 'ORG' ? item.org_name : `${item.device_sn} · ${item.device_name}` }}</option></AppSelect></label></div></section>
        <section v-else-if="wizardStep === 2" class="wizard-business-panel"><header><h3>使用什么数据进行结算？</h3></header><div class="dialog-fields"><label class="dialog-field"><span>设备类型*</span><AppSelect v-model="form.deviceTypeId"><option value="">请选择设备类型</option><option v-for="item in deviceTypes" :key="String(item.id)" :value="String(item.id)">{{ item.type_name }}</option></AppSelect></label><label class="dialog-field"><span>结算累计测点*</span><input v-model="form.metricPointCode" placeholder="例如 total_energy" /></label><label class="dialog-field"><span>结算周期</span><AppSelect v-model="form.billingCycle"><option value="MONTHLY">按月结算</option><option value="DAILY">按日结算</option></AppSelect></label></div></section>
        <section v-else-if="wizardStep === 3" class="wizard-business-panel"><header><h3>采用哪种计价方式？</h3></header><div class="pricing-mode-grid"><button v-for="item in [{key:'UNIT_PRICE',name:'按量单价'},{key:'FIXED',name:'固定金额'},{key:'TIERED',name:'阶梯计价'},{key:'TIME_PERIOD',name:'分时电价'}]" :key="item.key" :class="{ active: form.priceMode === item.key }" @click="form.priceMode = item.key"><SlidersHorizontal :size="18" /><b>{{ item.name }}</b></button></div><label v-if="form.priceMode === 'TIME_PERIOD'" class="dialog-field tariff-choice"><span>分时电价方案*</span><AppSelect v-model="form.tariffPlanId"><option value="">请选择已维护的电价方案</option><option v-for="item in tariffs" :key="String(item.id)" :value="String(item.id)">{{ item.plan_name }} · V{{ item.version }}</option></AppSelect></label></section>
        <section v-else-if="wizardStep === 4" class="wizard-business-panel"><header><h3>配置结算价格</h3></header><div v-if="form.priceMode === 'TIME_PERIOD'" class="selected-tariff-card"><Zap :size="22" /><div><b>{{ tariffs.find(item => String(item.id) === form.tariffPlanId)?.plan_name || '未选择电价方案' }}</b></div></div><label v-else-if="form.priceMode !== 'TIERED'" class="dialog-field price-single-field"><span>{{ form.priceMode === 'FIXED' ? '每账期固定金额' : '结算单价' }}*</span><input v-model="form.unitPrice" type="number" min="0" step="0.0001" placeholder="0.0000" /></label><div v-else class="tier-editor"><div v-for="(tier, index) in tiers" :key="index" class="tier-editor-row"><input v-model="tier.label" placeholder="阶梯名称" /><input v-model="tier.min" type="number" min="0" placeholder="下限" /><span>至</span><input v-model="tier.max" type="number" min="0" placeholder="上限，留空不限" /><input v-model="tier.price" type="number" min="0" step="0.0001" placeholder="单价" /><button class="link-btn" @click="removeTier(index)">删除</button></div><button class="quiet" @click="addTier"><Plus :size="13" />增加阶梯</button></div></section>
        <section v-else class="wizard-business-panel"><header><h3>确认并启用方案</h3></header><dl class="scheme-review"><div><dt>结算对象</dt><dd>{{ accountName(form.accountId) }}</dd></div><div><dt>方案名称</dt><dd>{{ form.ruleName }}</dd></div><div><dt>适用范围</dt><dd>{{ form.scopeType === 'ORG' ? '组织范围' : '指定设备' }}</dd></div><div><dt>计量来源</dt><dd>{{ deviceTypeName(form.deviceTypeId) }} · {{ form.metricPointCode }}</dd></div><div><dt>计价方式</dt><dd>{{ form.priceMode }}</dd></div><div><dt>结算周期</dt><dd>{{ form.billingCycle === 'MONTHLY' ? '按月' : '按日' }}</dd></div></dl><label class="dialog-field"><span>方案说明</span><textarea v-model="form.remark" placeholder="可填写适用政策、合同约定或变更原因"></textarea></label></section>
        <p v-if="error" class="form-tip wizard-error">{{ error }}</p>
        <footer class="pricing-wizard-actions"><button class="quiet" @click="wizardOpen = false">取消</button><button v-if="wizardStep > 1" class="quiet" @click="wizardStep -= 1">上一步</button><button v-if="wizardStep < 5" class="primary" @click="nextStep">下一步 <ChevronRight :size="14" /></button><button v-else class="primary" :disabled="saving" @click="saveScheme">{{ saving ? '正在创建…' : '确认创建并启用' }}</button></footer>
      </div>
    </AppDialog>

    <AppDialog v-model:open="detailOpen" title="计费方案详情" eyebrow="PRICING SCHEME" hide-actions dialog-class="business-record-dialog"><div v-if="selected" class="scheme-detail-body"><div :class="['scheme-detail-status', selected.ready ? 'ready' : 'warning']"><Check v-if="selected.ready" :size="22" /><CircleAlert v-else :size="22" /><div><b>{{ selected.readiness }}</b><span>{{ selected.ready ? '计量来源、范围和价格均已配置' : '存在缺失配置，暂不建议用于出账' }}</span></div></div><dl class="scheme-review"><div><dt>方案名称</dt><dd>{{ selected.schemeName }}</dd></div><div><dt>结算对象</dt><dd>{{ selected.accountName }}</dd></div><div><dt>计量来源</dt><dd>{{ selected.meteringSource }}</dd></div><div><dt>适用范围</dt><dd>{{ selected.scopeSummary }}</dd></div><div><dt>计价方式</dt><dd>{{ selected.pricingMode }}</dd></div><div><dt>价格摘要</dt><dd>{{ selected.priceSummary }}</dd></div></dl><div class="support-dialog-actions"><button class="quiet" @click="detailOpen = false">关闭</button><button class="primary" @click="detailOpen = false;openAdvanced('rules')">进入高级维护</button></div></div></AppDialog>

    <AppDialog :open="tariffOpen" title="分时电价方案库" eyebrow="TARIFF LIBRARY" hide-actions dialog-class="subject-records-dialog" @update:open="clearQueryAndClose('tariff', $event)"><div class="embedded-dialog-view"><TariffPlanView embedded /></div></AppDialog>
    <AppDialog :open="meterOpen" title="结算表计与计量变更" eyebrow="SETTLEMENT METERING" hide-actions dialog-class="subject-records-dialog" @update:open="clearQueryAndClose('meter', $event)"><div class="embedded-dialog-view"><MeteringView embedded /></div></AppDialog>
    <AppDialog :open="advancedOpen" title="计费高级配置" eyebrow="ADVANCED PRICING" hide-actions dialog-class="subject-records-dialog" @update:open="clearQueryAndClose('advanced', $event)"><nav class="dialog-section-tabs"><button :class="{ active: advancedView === 'rules' }" @click="advancedView = 'rules'">计费规则</button><button :class="{ active: advancedView === 'rule-scopes' }" @click="advancedView = 'rule-scopes'">适用范围</button><button :class="{ active: advancedView === 'price-items' }" @click="advancedView = 'price-items'">价格明细</button></nav><div class="subject-records-panel"><ResourceView v-if="advancedView === 'rules'" resource="rules" area="billing" embedded compact /><ResourceView v-else-if="advancedView === 'rule-scopes'" resource="rule-scopes" area="billing" embedded compact /><ResourceView v-else resource="price-items" area="billing" embedded compact /></div></AppDialog>
  </section>
</template>
