<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppDataTable from '@/components/app/AppDataTable.vue'
import AppDialog from '@/components/app/AppDialog.vue'
import FilterBar from '@/components/app/FilterBar.vue'
import { billingBatchAction, billingBatches, rootOrgs, saveBillingBatch } from '@/api/platform'
import { useAlertRef } from '@/composables/useAppAlert'
import { useSessionStore } from '@/stores/session'
import type { RecordRow } from '@/types/domain'
import { billingBatchLabel } from '@/utils/enumLabels'

const session=useSessionStore(),error=useAlertRef(),rows=ref<RecordRow[]>([]),orgs=ref<RecordRow[]>([]),loading=ref(false),dialog=ref(false),saving=ref(false),keyword=ref(''),status=ref('')
const props=withDefaults(defineProps<{embedded?:boolean}>(),{embedded:false})
const form=reactive({orgId:'',batchName:'',billCycle:'',startDate:'',endDate:'',remark:''})
const columns=[{key:'batch_no',label:'批次编号'},{key:'batch_name',label:'批次名称'},{key:'org_name',label:'园区'},{key:'bill_cycle',label:'账期'},{key:'account_total',label:'账户数'},{key:'total_amount',label:'应收总额'},{key:'status',label:'状态',format: billingBatchLabel}]
function reset(){const now=new Date();const month=now.toISOString().slice(0,7);Object.assign(form,{orgId:'',batchName:`${month} 能源出账`,billCycle:month,startDate:`${month}-01`,endDate:'',remark:''})}
async function load(){loading.value=true;try{rows.value=(await billingBatches({pageNum:1,pageSize:200,keyword:keyword.value||undefined,status:status.value||undefined})).records}catch(e){error.value=e instanceof Error?e.message:'读取出账批次失败'}finally{loading.value=false}}
async function save(){saving.value=true;try{await saveBillingBatch({...form,orgId:Number(form.orgId)});dialog.value=false;await load()}catch(e){error.value=e instanceof Error?e.message:'创建批次失败'}finally{saving.value=false}}
async function action(row:RecordRow,type:'generate'|'review'|'issue'){try{await billingBatchAction(row.id,type);await load()}catch(e){error.value=e instanceof Error?e.message:'批次操作失败'}}
onMounted(async()=>{try{orgs.value=await rootOrgs()}catch{}reset();await load()})
</script>
<template><section class="view-page billing-table-page billing-batch-page"><header v-if="!props.embedded" class="view-head"><div><p class="eyebrow">BILLING RUN · REVIEW · ISSUE</p><h1>出账批次</h1></div><button v-if="session.can('billing:batch:generate')" class="btn-primary" @click="reset();dialog=true">新建出账批次</button></header><div v-else class="embedded-action-row"><button v-if="session.can('billing:batch:generate')" class="btn-primary" @click="reset();dialog=true">新建出账批次</button></div><p v-if="error" class="form-tip">{{error}}</p><FilterBar v-model:keyword="keyword" :busy="loading" placeholder="批次编号、名称或账期" @query="load" @reset="()=>{keyword='';status='';load()}"><label class="field inline"><span>状态</span><AppSelect v-model="status"><option value="">全部</option><option>DRAFT</option><option>RUNNING</option><option>REVIEWING</option><option>REVIEWED</option><option>ISSUED</option><option>FAILED</option></AppSelect></label></FilterBar><AppDataTable title="出账批次列表" :columns="columns" :rows="rows" :loading="loading" :error="error" :compact="props.embedded" @refresh="load"><template #actions="{row}"><button v-if="row.status==='DRAFT'" class="link-btn" @click="action(row,'generate')">生成账单</button><button v-if="row.status==='REVIEWING'" class="link-btn" @click="action(row,'review')">审核</button><button v-if="row.status==='REVIEWED'" class="link-btn" @click="action(row,'issue')">发布</button><span v-if="row.failure_summary" class="failure">存在失败记录</span></template></AppDataTable><AppDialog v-model:open="dialog" title="新建出账批次" :saving="saving" @submit="save"><div class="dialog-fields"><label class="dialog-field"><span>园区</span><AppSelect v-model="form.orgId"><option value="">请选择</option><option v-for="x in orgs" :key="String(x.id)" :value="String(x.id)">{{x.org_name}}</option></AppSelect></label><label class="dialog-field"><span>批次名称</span><input v-model="form.batchName"></label><label class="dialog-field"><span>账期</span><input v-model="form.billCycle" placeholder="2026-08"></label><label class="dialog-field"><span>开始日期</span><input v-model="form.startDate" type="date"></label><label class="dialog-field"><span>结束日期</span><input v-model="form.endDate" type="date"></label><label class="dialog-field full"><span>备注</span><textarea v-model="form.remark"></textarea></label></div></AppDialog></section></template>
<style scoped>.failure{color:#b54708;font-size:12px}</style>
