<script setup lang="ts">
import { computed, onMounted, nextTick, ref } from 'vue'
import { Lock, QrCode, Smartphone, UserRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const username = ref('admin')
const password = ref('123456')
const captcha = ref('')
const captchaInput = ref('')
const consentChecked = ref(false)
const agreementOpen = ref(false)
const agreementScrolledToBottom = ref(false)
const pendingSubmit = ref(false)
const error = ref('')
const pending = ref(false)
const agreementBody = ref<HTMLElement | null>(null)
const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const unavailable = computed(() => error.value.includes('服务不可用') || error.value.includes('服务暂不可用') || error.value.includes('无法连接'))

function randomCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let value = ''
  for (let index = 0; index < 4; index += 1) value += chars[Math.floor(Math.random() * chars.length)]
  captcha.value = value
}

function openConsent() {
  agreementOpen.value = true
  agreementScrolledToBottom.value = false
  nextTick(() => {
    if (agreementBody.value) agreementBody.value.scrollTop = 0
  })
}

async function doLogin() {
  pending.value = true
  error.value = ''
  try {
    session.clear()
    await session.signIn(username.value, password.value)
    const target = String(route.query.redirect || '/dashboard')
    await router.replace(target.startsWith('/login') ? '/dashboard' : target)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    pending.value = false
  }
}

async function submit() {
  if (captchaInput.value.trim().toUpperCase() !== captcha.value) {
    error.value = '验证码失败'
    randomCaptcha()
    captchaInput.value = ''
    return
  }
  if (!consentChecked.value) {
    pendingSubmit.value = true
    openConsent()
    return
  }
  await doLogin()
}

async function confirmConsent() {
  consentChecked.value = true
  agreementOpen.value = false
  agreementScrolledToBottom.value = false
  if (pendingSubmit.value) {
    pendingSubmit.value = false
    await doLogin()
  }
}

function closeAgreement() {
  agreementOpen.value = false
  agreementScrolledToBottom.value = false
  pendingSubmit.value = false
}

function onAgreementScroll() {
  const el = agreementBody.value
  if (!el) return
  agreementScrolledToBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
}

onMounted(randomCaptcha)
</script>

<template>
  <div class="login-page">
    <section class="login-copy">
      <div class="brand"><i></i><span>智园能管<small>ENERGY PLATFORM</small></span></div>
      <div class="login-copy-body">
        <p class="eyebrow">PARK ENERGY OPERATIONS</p>
        <h1>智慧能源管理平台</h1>
        <div class="login-accent"></div>
      </div>
    </section>

    <main class="login-card">
      <div class="login-card-top">
        <span>扫码下载App</span>
        <QrCode :size="18" />
      </div>
      <p class="eyebrow">登录系统</p>
      <h2>智慧能源管理平台</h2>
      <div class="login-underline"></div>
      <form class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span><UserRound :size="18" />账号/手机号/邮箱</span>
          <input v-model.trim="username" autocomplete="username" required>
        </label>
        <p v-if="error" class="form-error"><b>{{ unavailable ? '服务不可用：' : '登录失败：' }}</b>{{ error }}</p>
        <label class="login-field">
          <span><Lock :size="18" />密码</span>
          <input v-model="password" type="password" autocomplete="current-password" required>
        </label>
        <label class="login-field captcha-field">
          <span><Smartphone :size="18" />验证码</span>
          <input v-model.trim="captchaInput" placeholder="验证码">
          <button class="captcha-box" type="button" @click="randomCaptcha">{{ captcha }}</button>
        </label>
        <label class="login-consent">
          <input v-model="consentChecked" type="checkbox">
          <span>我已知晓并阅读<span class="protocol-link" role="button" tabindex="0" @click.prevent="openConsent" @keydown.enter.prevent="openConsent">《智园能管用户须知协议》</span></span>
        </label>
        <button class="primary login-submit" :disabled="pending">{{ pending ? '正在登录…' : '登 录' }}</button>
      </form>
    <div class="login-footer">
        <a class="login-register" href="javascript:void(0)">企业内部注册，暂不开放。</a>
        <p class="login-help">忘记密码</p>
      </div>
    </main>
    <div v-if="agreementOpen" class="drawer-backdrop modal-backdrop login-agreement-backdrop" @click.self="closeAgreement">
      <section class="login-agreement-dialog">
        <div class="agreement-head">
          <div>
            <p class="eyebrow">USER AGREEMENT</p>
            <h2>智园能管用户须知协议</h2>
          </div>
          <button class="close-icon" type="button" aria-label="关闭" @click="closeAgreement">×</button>
        </div>
        <div ref="agreementBody" class="agreement-body" @scroll="onAgreementScroll">
          <p>欢迎使用智园能管平台。为保障平台运行安全、能源数据完整、设备控制可靠及企业经营信息安全，用户在使用本平台前应认真阅读、充分理解并承诺遵守本协议。智园能管平台为企业内部能源运营与设备管理系统，主要提供组织档案、设备档案、网关接入、实时监测、能耗统计、告警处置、计费结算、权限分配、操作审计等能力。本协议适用于所有通过网页端、移动端、接口服务或其他方式访问平台的用户。用户点击登录、勾选确认、持续使用平台或实施任何业务操作，均视为已阅读、理解并同意接受本协议约束。</p>
          <p>一、账号与身份管理。平台账号由企业或平台管理员统一创建、分配、停用和回收。用户应使用本人经授权的账号登录平台，不得冒用他人身份，不得借用、转让、出租、出借、出售或以其他方式向无关人员提供账号、密码、验证码、令牌、浏览器会话、接口密钥等认证凭据。用户应妥善保管登录信息，定期更新密码，发现账号异常登录、权限异常、数据异常或疑似泄露时，应立即停止操作并通知管理员。因用户保管不善、违规共享账号或绕过认证流程造成的数据泄露、业务损失、设备误控或审计责任，由相关责任人承担。</p>
          <p>二、授权边界与最小权限。平台采用用户、角色、权限、组织范围等机制控制访问边界。用户仅可在被授权的功能范围、数据范围和组织范围内进行查询、录入、修改、删除、处置、审核、导出、结算和控制等操作。任何用户不得通过修改请求参数、伪造接口、浏览器调试、脚本调用、越权链接、缓存数据、第三方工具或其他方式访问未授权资源。若因岗位调整、项目变更、离职、外包关系终止或临时授权到期导致权限不再适用，用户应主动申请调整或回收权限，管理员有权依据管理制度随时变更、冻结或撤销相关授权。</p>
          <p>三、数据资产与使用规范。平台中的组织结构、企业信息、设备信息、网关信息、测点定义、采集数据、能耗报表、告警记录、处置记录、计费账户、计费规则、账单明细、缴费记录、权限配置、审计日志等均属于企业业务数据或企业内部管理数据。用户应基于合法、正当、必要的业务目的使用数据，不得将平台数据用于个人用途、竞争用途、非授权分析、对外宣传、商业转售或其他与岗位职责无关的事项。未经批准，不得擅自复制、截屏、下载、导出、打印、转发、公开、篡改、删除或长期保存平台数据。确需导出或共享的，应遵守企业审批流程、保密要求和数据分级管理制度。</p>
          <p>四、个人信息与敏感信息保护。平台可能涉及用户姓名、账号、手机号、邮箱、岗位、组织归属、操作记录、登录信息、IP 地址、设备识别信息等个人信息或准个人信息。平台将依据业务需要和最小必要原则处理上述信息，用于身份识别、权限控制、安全审计、异常排查和业务追溯。用户在查看或处理他人信息时，应严格遵守保密义务，不得无关查询、恶意检索、批量复制、私自留存或向无权限人员披露。涉及计费金额、经营数据、设备运行状态、现场位置、接口密钥、网关密钥等敏感信息时，应按照更高安全等级进行保护。</p>
          <p>五、设备档案与现场操作。用户在维护组织、网关、设备、设备类型、测点定义、协议映射等档案时，应确保信息真实、准确、完整、及时。设备编号、网关编号、协议地址、安装位置、计费属性、测点编码、采集单位和映射路径等信息直接影响数据采集、告警判断、能耗统计和计费结果，用户不得随意填写、伪造或删除。涉及现场设备、网关、采集终端、配电设施、计量装置、传感器、控制器等对象时，用户应遵守现场安全制度和运维规程，不得擅自断电、拆卸、旁路、屏蔽、重置、刷写固件或改变通信参数。任何可能影响生产运行、计量准确性或人身安全的操作，应经过授权和复核。</p>
          <p>六、告警处置与业务闭环。用户在查看、确认、派发、处理、关闭告警事件时，应基于真实现场情况和系统记录作出判断，不得虚假处置、延迟处置、批量误关闭或删除关键告警。告警规则配置应符合业务场景和安全阈值要求，阈值、持续时间、告警等级、规则范围等参数调整前应评估影响范围。因错误配置导致漏报、误报、过度告警、设备误判或后续业务损失的，应按照企业制度追溯责任。平台中的告警处理记录、处理人、处理时间、备注和关联数据将作为运维闭环、责任认定和审计追踪的重要依据。</p>
          <p>七、计费结算与金额责任。用户在维护计费账户、计费规则、适用范围、阶梯价格、账单试算、账单生成、缴费登记、重算和作废等业务时，应确保账户归属、计费周期、设备类型、测点编码、价格模式、单价、阶梯区间和账期数据准确无误。任何金额相关操作均应符合企业财务制度和审批流程。用户不得伪造账单、篡改金额、恶意重算、擅自作废、重复确认或录入不真实缴费信息。若发现账单异常、采集异常、规则异常或金额不一致，应先暂停后续操作并进行复核，必要时联系管理员、财务人员或运维人员共同确认。</p>
          <p>八、系统安全与禁止行为。用户不得实施任何可能危害平台稳定性、安全性或可用性的行为，包括但不限于：未经授权扫描接口、爆破账号、抓取数据、绕过验证码、注入脚本、上传恶意内容、伪造请求、篡改前端代码、批量调用接口、恶意占用资源、攻击服务、破坏日志、删除审计记录、绕过组织范围、规避权限校验或尝试获取服务器、数据库、消息队列、缓存、网关、采集服务等底层资源的访问能力。用户不得利用平台漏洞谋取利益或规避管理，一经发现应立即停止并向管理方报告。</p>
          <p>九、日志审计与追溯。为保障平台安全和业务可追溯，平台会记录用户登录、查询、新增、编辑、删除、授权、处置、下发、支付、结算、导出、异常请求等操作日志。日志可能包含操作人、操作时间、请求路径、请求参数、执行结果、耗时、IP 地址、错误信息等内容。用户理解并同意平台基于安全审计、问题排查、责任认定、合规检查和业务复盘目的保存和使用相关日志。任何用户不得干扰、删除、伪造或规避审计记录。审计记录可作为处理违规、争议、事故和内部管理事项的重要依据。</p>
          <p>十、保密义务。用户对在平台中知悉的企业经营信息、组织架构、设备分布、能源消耗、计量数据、价格规则、客户信息、账号权限、系统配置、接口信息、审计记录、运维方案以及其他未公开信息负有严格保密义务。未经授权，不得向企业外部人员、无关部门、合作方、供应商或其他第三方披露。确因工作需要对外提供信息的，应取得必要审批，并采用脱敏、加密、最小化传输等措施。用户离职、调岗、项目结束、权限撤销或合作终止后，保密义务仍持续有效。</p>
          <p>十一、平台维护与服务变更。平台管理方可根据业务需要、系统升级、安全策略、数据治理、合规要求或第三方服务变化，对平台功能、接口、界面、权限、数据模型、日志策略、告警规则、计费逻辑、组织范围、验证码机制及其他配置进行调整。因维护、升级、网络故障、服务器异常、数据库异常、第三方依赖异常、设备离线、消息积压或不可抗力导致平台短时不可用、数据延迟或部分功能受限的，平台将尽力恢复。用户应关注系统提示和管理员通知，不得在已知异常状态下继续进行高风险操作。</p>
          <p>十二、责任限制与风险提示。平台提供的数据、报表、趋势、告警和账单试算结果依赖设备采集、网关传输、规则配置、数据清洗和业务参数。用户应结合现场实际、人工核验和管理要求进行判断，不应仅凭单一系统结果作出重大决策。由于设备故障、通信中断、采集误差、规则配置错误、第三方系统异常、网络延迟、用户误操作、不可抗力或其他超出平台合理控制范围的原因造成的数据缺失、延迟、偏差或业务影响，平台管理方将在合理范围内协助排查和修复，但不承担超出法律规定和企业制度范围之外的间接损失责任。</p>
          <p>十三、违规处理。用户违反本协议、企业制度、岗位职责、保密要求或法律法规的，平台管理方有权根据情节采取提醒、要求整改、限制功能、暂停账号、冻结权限、回收授权、保留证据、通报相关部门、移交审计或追究法律责任等措施。因违规行为导致企业数据泄露、设备异常、业务中断、账务错误、客户投诉、监管风险、第三方索赔或其他损失的，相关责任人应依法依规承担责任。平台管理方有权配合企业审计、法务、监管或司法机关调取必要记录。</p>
          <p>十四、协议更新与适用。平台管理方可根据法律法规变化、企业制度调整、业务发展、安全治理或平台升级需要，对本协议进行修订。修订内容可通过系统公告、登录弹窗、页面提示、邮件通知或其他合理方式告知用户。更新后的协议自公布或提示之日起生效。用户在协议更新后继续登录或使用平台的，视为接受更新内容；如不同意更新内容，应立即停止使用平台并联系管理员处理权限与账号事宜。</p>
          <p>十五、其他条款。本协议未尽事宜，按照国家法律法规、行业规范、企业内部管理制度、信息安全制度、财务制度、运维制度和数据管理规定执行。若本协议部分条款被认定无效，不影响其他条款的效力。因本协议或平台使用产生的争议，应优先通过企业内部沟通、审计复核或管理流程解决；无法解决的，按照适用法律和企业规定处理。本协议的解释、维护和执行由智园能管平台管理方负责。</p>
        </div>
        <div class="agreement-actions">
          <button class="primary" :disabled="!agreementScrolledToBottom" @click="confirmConsent">我已完成阅读</button>
          <button class="quiet" @click="closeAgreement">取消</button>
        </div>
      </section>
    </div>
  </div>
</template>
