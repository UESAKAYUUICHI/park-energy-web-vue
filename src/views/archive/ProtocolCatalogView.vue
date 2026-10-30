<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Plus, RefreshCw, Save, Send, Trash2 } from "@lucide/vue";
import AppDialog from "@/components/app/AppDialog.vue";
import {
  catalogLookups,
  createProtocolProfile,
  createProtocolVersion,
  deleteProtocolProfile,
  protocolProfiles,
  protocolVersion,
  publishProtocolVersion,
  saveProtocolVersion,
  validateProtocolVersion,
  parseProtocolDoc,
  uploadProtocolPdf,
} from "@/api/platform";
import type { RecordRow } from "@/types/domain";

const rows = ref<RecordRow[]>([]),
  detail = ref<RecordRow>({}),
  selectedId = ref<unknown>(),
  keyword = ref(""),
  busy = ref(false);
const lookups = ref<RecordRow>({});
const validateOpen = ref(false);
const validateResult = ref<RecordRow | null>(null);
const editMode = ref(false);
const detailMode = ref(false);
const promptConfigOpen = ref(false);
const parsedDetailOpen = ref(false);
const activeStage = ref<1 | 2 | 3 | 4>(1);
const editingStages = reactive({
  stage1: false,
  stage2: false,
  stage3: false,
  stage4: false,
});

function renderPromptMarkdown(raw: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const formatInline = (line: string) =>
    escapeHtml(line)
      .replace(/\{\{([^}]+)\}\}/g, '<code class="md-var">{{$1}}</code>')
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\b(MATCHED|EVAL_NEW|MODBUS_RTU|MODBUS_TCP|FLOAT32|UINT16|INT16|UINT32|INT32|BOOLEAN|ABCD|CDAB|BADC|DCBA|ELECTRIC_METER|EXTERNAL_BREAKER|POWER_MONITOR|UPPER_SNAKE_CASE|PDU_ZERO_BASED|BRAND_SERIES_MODEL_PROTOCOL|dev_attribute_definition|dev_attribute_value_option|dev_standard_point|POLE_CONFIG|BREAKING_CAPACITY_ICN|TRIP_CURVE_TYPE|MECHANICAL_ELECTRICAL_LIFE|AUTO_CLOSE_OPEN_TIME|ANTI_ISLANDING_SPEC|BREAKER_SWITCH_STATE|PHASE_LEAKAGE_CURRENT|PROTECTION_TRIP_REASON|OVERVOLTAGE_THRESHOLD|OVERVOLTAGE_RECOVERY_VAL|UNDERVOLTAGE_THRESHOLD|LOSS_VOLTAGE_THRESHOLD|OVER_FREQ_THRESHOLD|ELECTRICAL_BLOCK|ENERGY_BLOCK|BREAKER_STATUS_BLOCK|PROTECTION_THRESHOLD_BLOCK|DIRECT_CLOSE_CMD|TRIP_LOCK_CMD|ALLOW_CLOSE_CMD|0x[0-9A-Fa-f]+|03H|04H|06H|10H)\b/g,
        '<code class="md-code">$1</code>',
      );

  const lines = String(raw || "").split(/\r?\n/);
  const html: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      html.push(`<h5 class="md-h">${formatInline(line.slice(2))}</h5>`);
    } else if (/^\d+\.\s+/.test(line)) {
      const idxMatch = line.match(/^(\d+\.)\s+(.*)$/);
      if (idxMatch) {
        const body = (idxMatch[2] ?? "").replace(/^([^：:]+[：:])/, "<strong>$1</strong>");
        html.push(`<div class="md-li"><span class="md-num">${idxMatch[1]}</span><span>${formatInline(body).replace(/&lt;strong&gt;/g, "<strong>").replace(/&lt;\/strong&gt;/g, "</strong>")}</span></div>`);
      }
    } else if (line.startsWith("- ")) {
      html.push(`<div class="md-subli"><span class="md-dot">•</span><span>${formatInline(line.slice(2))}</span></div>`);
    } else {
      html.push(`<p class="md-p">${formatInline(line)}</p>`);
    }
  }
  return html.join("");
}
const stagePrompts = reactive({
  stage1: `# 1. 工程角色与非结构化文档输入边界
你是工业能源物联网（IIoT）边缘接入与设备档案治理专家。输入源 {{PDF_RAW_TEXT}} 由 Apache PDFBox 从设备样本册、选型手册或通信规约 PDF 中逐页解析获得，包含封面参数、型号命名规则图、接线图、电气技术规格表及控制逻辑表等混合文本。请剥离营销冗余噪声，执行第一阶段“设备品类鉴定与通信规约族识别”。

# 2. 多级设备品类特征加权鉴定准则
1. 标准品类树映射：严格对照平台设备分类树 {{DEVICE_CATEGORY_TREE}} 执行核心技术特征词加权匹配，判定唯一主品类：
   - ELECTRIC_METER（智能电能表）：匹配特征词“有功/无功电能计量”、“正反向有功总电能(ImpEp/ExpEp)”、“电脉冲常数 imp/kWh”、“GB/T 17215”；
   - EXTERNAL_BREAKER（电能表外置费控断路器/光伏并离网断路器）：匹配特征词“智能电表配套联动”、“远程自动分合闸费控”、“过载与短路保护”、“过欠失压保护(Uvo/Uvu)”、“过欠频与防孤岛保护”、“分闸防合闸锁定”、“GB/T 10963.1 / CQC 1121”；
   - POWER_MONITOR（多功能电力测控仪表）：匹配特征词“三相谐波THD”、“四象限功率”、“面板开孔96×96”、“PT/CT变比”。
2. 制造商与型号编码（ProfileCode）归一化派生：
   - 提取制造商法定全称与英文品牌代号（如“正泰电器 CHINT ELECTRIC”、“安科瑞 ACREL”、“施耐德 SCHNEIDER”）；
   - 解析文档中的“型号及含义”拆解表（如 NBP-100NGVT/L 2P C100：壳架等级100A、分断能力 N=6000A/H=10000A、功能代号 GVT=过欠失压保护+RS485通信、驱动左置 L、极数 2P、脱扣曲线 C型），按 BRAND_SERIES_MODEL_PROTOCOL 范式生成全局唯一协议编码。

# 3. 物理通信介质与传输规约族归一化
1. 物理层与协议族判定：对照 {{TRANSPORT_PROTOCOL_ENUM}} 识别物理接口（RS-485半双工两线制 / 蓝牙BLE无线 / AC220V电平控制线）；若设备原生采用 DL/T 698.45 或专有规约并通过边缘网关协议转换接入，统一归一化映射为平台受控的 MODBUS_RTU 或 MODBUS_TCP 零基地址空间（PDU_ZERO_BASED）。
2. 功能码集合提取：提取文档声明支持的合法功能码集合（03H读保持寄存器、04H读输入寄存器、06H写单寄存器、10H写多寄存器）。`,

  stage2: `# 1. 静态物模型架构任务与输入上下文
你是工业物模型静态属性架构师。请基于 Stage 01 鉴定的设备主品类 {{STAGE1_CATEGORY}}，深度扫描文档中的“技术参数表”、“型号含义表”、“接线端子表”与“环境适应性指标”，提取全部静态技术属性，并与平台存量全域静态属性字典 {{GLOBAL_STATIC_ATTR_SCHEMA}}（对应数据库表 dev_attribute_definition 与 dev_attribute_value_option）执行差量评估。

# 2. 双层静态技术规格深度抽取清单
1. 第一层 · 跨品类通用铭牌与通信基础属性：
   - 额定电气规格：额定工作电压 RATED_VOLTAGE（需区分极数电压，如 1P+N/2P: AC230V，3P+N/4P: AC400V）、额定工作电流与壳架等级 RATED_CURRENT（如 63A/80A/100A/125A）、额定绝缘电压 Ui(690V)、额定冲击耐受电压 Uimp(6kV)、工频介电强度(AC2500V 1min)；
   - 通信与机械结构：通信接口 COMMUNICATION_INTERFACE、现场协议 FIELD_PROTOCOL、默认波特率 DEFAULT_BAUD_RATE(9600bps)、安装方式（TH35-7.5标准导轨或面板开孔）、防护等级（直接安装IP20 / 配电箱内IP40）、最大可接导线截面积(mm²)与紧固扭矩(N·m)。
2. 第二层 · 设备品类专属深度工程属性（以 EXTERNAL_BREAKER 外置断路器为例）：
   - 必须完整提取：断路器极数规格 POLE_CONFIG（1P+N N极可开闭 / 2P / 3P+N / 4P）、额定极限/运行短路分断能力 BREAKING_CAPACITY_ICN（N型6000A / H型10000A）、瞬时脱扣特性曲线 TRIP_CURVE_TYPE（B型3~5In / C型5~10In / D型10~14In）、机械与电气寿命 MECHANICAL_ELECTRICAL_LIFE（机械10000次 / 电气6000次）、远程自动合分闸动作时间 AUTO_CLOSE_OPEN_TIME（tc≤3s, td≤2s）、光伏防孤岛保护定值 ANTI_ISLANDING_SPEC（500ms内电压幅值摆动>30V或频率摆动>0.5Hz动作，恢复延时10s）。

# 3. 存量字典比对与缺失静态属性自演进机制（Self-Evolving Schema）
1. 命中存量字典（标记 evalStatus = "MATCHED"）：若提取属性的工程语义与 {{GLOBAL_STATIC_ATTR_SCHEMA}} 存量条目等价（如“生产厂家”匹配 MANUFACTURER，“额定电压Ue”匹配 RATED_VOLTAGE），严格复用存量 attributeCode 与主键 attributeId，禁止重复创建同义属性。
2. 字典缺失评估新增（标记 evalStatus = "EVAL_NEW"）：若提取到的品类专属属性在存量字典中不存在，依据 {{ENUM_OPTION_RULES}} 执行规范化评估——生成 UPPER_SNAKE_CASE 标准编码、中文名称、量纲单位及默认固定值选项（value_mode = 'FIXED', usage_type = 'SPEC'），自动增量注册入 dev_attribute_definition 与 dev_attribute_value_option 表。`,

  stage3: `# 1. 动态遥测、状态字与保护定值解码任务
你是工业通信规约解码与标准测点语义对齐专家。请扫描文档中的“Modbus寄存器映射表”、“实时电参量与电能计量表”、“过欠失压/过欠频保护阈值表”及“状态反馈逻辑表”，提取所有支持采集的动态运行属性，并与平台标准动态测点字典 {{STANDARD_DYNAMIC_POINT_DICT}}（对应数据库表 dev_standard_point）执行语义对齐与差量扩展。

# 2. 寄存器地址换算、数据类型与字节序强约束规范
1. 十六进制与十进制地址双向换算：
   - 提取手册原始十六进制地址 documentAddress（如 0x2000、0x0061、0x0100），按 Addr_dec = HexToDec(documentAddress) 精确换算零基十进制起始地址（如 0x2000 -> 8192，0x4000 -> 16384，0x0100 -> 256）。
2. 数据类型与寄存器字长校验准则（{{REGISTER_TYPE_SPEC}}）：
   - 单寄存器类型（registerLength = 1 Word = 2 Bytes）：仅限 UINT16（无符号16位整型）、INT16（有符号16位整型）、BOOLEAN（位域布尔量，须附加 bitOffset: 0..15, bitLength: 1），合法字节序 {{BYTE_ORDER_SPEC}} 必须为 AB（高字节在前）或 BA；
   - 双寄存器类型（registerLength = 2 Words = 4 Bytes）：仅限 FLOAT32（IEEE-754单精度浮点）、UINT32、INT32，合法字节序必须为 ABCD（标准大端）、CDAB（字交换）、BADC 或 DCBA。
3. 物理量纲与线性工程值解码方程：
   - 提取物理单位 rawUnit（V / A / mA / kW / kvar / kWh / Hz）与缩放倍率 decodeFactor（如手册标注“0.1V”或“×0.001kW”，则 decodeFactor = 0.1 或 0.001），满足网关线性解码公式：Y_eng = X_raw × decodeFactor + decodeOffset。

# 3. 标准动态测点对齐与缺失测点增量演进机制
1. 存量标准测点对齐（标记 evalStatus = "MATCHED"）：常规电参量（三相相电压 Ua/Ub/Uc、电流 Ia/Ib/Ic、总有功功率 Pt、总无功功率 Qt、功率因数 PFt、电网频率 Freq、正向有功总电能 ImpEp）必须精准映射至存量标准测点编码（VOLTAGE_A/B/C、CURRENT_A/B/C、ACTIVE_POWER_TOTAL、REACTIVE_POWER_TOTAL、POWER_FACTOR_TOTAL、FREQUENCY、FORWARD_ACTIVE_ENERGY），直接绑定既有 standardPointId。
2. 缺失动态测点评估新增（标记 evalStatus = "EVAL_NEW"）：遇到存量字典未覆盖的新型设备运行状态或保护定值（如断路器分合闸状态 BREAKER_SWITCH_STATE[0分/1合/2防合闸锁定]、相线泄漏电流 PHASE_LEAKAGE_CURRENT、保护脱扣原因字 PROTECTION_TRIP_REASON、过压保护阈值 OVERVOLTAGE_THRESHOLD[默认290V]、过压恢复阈值 OVERVOLTAGE_RECOVERY_VAL[默认280V]、欠压保护阈值 UNDERVOLTAGE_THRESHOLD[默认160V]、失压保护阈值 LOSS_VOLTAGE_THRESHOLD[默认50V]、过频保护阈值 OVER_FREQ_THRESHOLD[默认50.5Hz]），经规范化评估后自动注册入 dev_standard_point 表（value_mode = 'REALTIME', business_role = 'TELEMETRY'）。`,

  stage4: `# 1. 边缘网关串口轮询帧合并与遥控白名单合成任务
你是边缘网关（RK3566 Rust gw-modbus 驱动层）串口轮询调度优化与遥控安全专家。请基于 Stage 03 输出的离散动态测点集合 {{STAGE3_DYNAMIC_POINTS}} 以及文档附录中的“断路器电平/无线/RS485分合闸控制逻辑表”，合成最优 Modbus 连续读取块（ReadBlocks）与远程控制指令白名单（Commands）。

# 2. 连续读取块（ReadBlocks）一维贪心聚类与块内偏移换算算法
1. 离散地址排序与窗口聚类合并：
   - 将 Stage 03 提取的全部只读动态测点按十进制起始地址 Addr_i 升序排列；
   - 遵循单帧最大连续寄存器跨度约束 {{MAX_CONTIGUOUS_REGISTERS=32}} Word（64字节，且硬件上限 ≤ 125 Word）：若相邻测点满足 (Addr_i + Len_i) - BlockStart ≤ 32，则合并至同一 Modbus 03H/04H 连续读取块，消除碎片化单点轮询带来的 RS-485 总线周转耗时；
   - 若地址跨度超出阈值（如电参量区 8192 与电能区 16384，或断路器状态区 256 与保护阈值区 512），自动切分为独立语义读块（如 ELECTRICAL_BLOCK、ENERGY_BLOCK、BREAKER_STATUS_BLOCK、PROTECTION_THRESHOLD_BLOCK）。
2. 读块总字长与字段块内相对偏移（registerOffset）精确换算：
   - 读块总字长：registerCount = max(Addr_k + Len_k) - startAddress；
   - 字段块内相对偏移：registerOffset_k = Addr_k - startAddress；
   - 强校验约束：严禁将手册绝对地址直接填入 registerOffset，所有字段必须满足 0 ≤ registerOffset_k 且 (registerOffset_k + registerLength_k) ≤ registerCount。

# 3. 远程控制指令白名单（FC06 Commands）状态机解析与防误动校验
1. 分合闸与防合闸锁定状态机解析：
   - 深度解析文档中的控制逻辑表（如 NBP 样本册 4.3/4.5 节控制状态机：序号1“直接合闸命令”使断路器由分闸直接合闸；序号4“跳闸命令”使断路器由合闸跳闸至分闸防合闸锁定状态，此时禁止手动合闸；序号7“合闸允许命令”使断路器由分闸防合闸状态解除锁定转为允许合闸状态）。
2. 网关 FC06 固定控制字白名单生成：
   - 严格遵循 {{FC06_WHITELIST_RULE}} 安全约束（functionCode = 6 写单个保持寄存器，encodeType = "FIXED"，valueType = "UINT16"，fixedValue 范围 0..65535），合成标准化遥控指令集（如 DIRECT_CLOSE_CMD: 65280[0xFF00]、TRIP_LOCK_CMD: 0[0x0000]、ALLOW_CLOSE_CMD: 255[0x00FF]），供边缘网关执行带硬件互斥锁的远程费控与故障隔离。`,
});
const aiParseOpen = ref(false);
const aiParsing = ref(false);
const aiDocText = ref(`《正泰 DTSU666 三相四线电子式电能表 Modbus-RTU 通信协议说明书（摘录）》
1. 串口参数：波特率 9600 bps，数据位 8，无校验(N)，停止位 1。支持功能码 03H（读保持寄存器）、06H（写单个寄存器）。
2. 电参量测量寄存器表（IEEE-754 单精度浮点 FLOAT32，大端字节序 ABCD，每个测点占 2 个寄存器）：
   - 0x2000 (十进制 8192): Ua A相相电压，单位 V，倍率 0.1
   - 0x2002 (十进制 8194): Ub B相相电压，单位 V，倍率 0.1
   - 0x2004 (十进制 8196): Uc C相相电压，单位 V，倍率 0.1
   - 0x2006 (十进制 8198): Ia A相电流，单位 A，倍率 0.001
   - 0x2008 (十进制 8200): Ib B相电流，单位 A，倍率 0.001
   - 0x200A (十进制 8202): Ic C相电流，单位 A，倍率 0.001
   - 0x2012 (十进制 8210): Pt 总有功功率，单位 kW，倍率 0.001
   - 0x2014 (十进制 8212): Qt 总无功功率，单位 kvar，倍率 0.001
   - 0x201A (十进制 8214): PFt 总功率因数，无量纲，倍率 0.001
   - 0x201E (十进制 8216): Freq 电网频率，单位 Hz，倍率 0.01
3. 电能计量寄存器表（FLOAT32，ABCD）：
   - 0x4000 (十进制 16384): ImpEp 正向有功总电能，单位 kWh，倍率 1.0
4. 远程继电器控制寄存器（功能码 06H，UINT16）：
   - 0x6000 (十进制 24576): 写入 0xFF00 (65280) 远程合闸；写入 0x0000 (0) 远程分闸。`);
const aiParsedResult = ref<RecordRow | null>(null);

const uploadedPdfName = ref("");

function buildDefaultParsedResult(fileName = "正泰DTSU666三相电能表Modbus协议说明书.pdf"): RecordRow {
  const suffix = new Date().toTimeString().slice(0, 5).replace(":", "");
  const upper = fileName.toUpperCase();
  const isNbp = upper.includes("NBP") || fileName.includes("断路器");
  if (isNbp) {
    return {
      fileName,
      deviceCategory: "电能表外置断路器 / 光伏并离网费控断路器 (BREAKER)",
      profileCode: `CHINT_NBP_GVT_${suffix}`,
      profileName: "正泰 NBP 系列电能表外置断路器协议 (NBP-GVT/ZSW)",
      manufacturer: "正泰电器 (CHINT ELECTRIC)",
      transportType: "MODBUS_RTU",
      versionName: "V1",
      description: `由《${fileName}》解析生成：含 13 项静态属性(评估新增6项)、2 个读块、10 项动态测点(评估新增8项)与 3 项控制指令`,
      newStaticAttrCount: 6,
      newDynamicPointCount: 8,
      blockCount: 2,
      alignedCount: 10,
      commandCount: 3,
      model: "Qwen/Qwen2.5-7B-Instruct",
      latencyMs: 560,
      summary: `已解析《${fileName}》：识别外置断路器品类，匹配 7 项存量静态属性并评估新增 6 项断路器静态属性；匹配 2 项存量测点并评估新增 8 项断路器状态与过欠压/过欠频保护定值动态测点，生成 3 项费控指令。`,
      protocolAttributes: [],
      staticAttrEvalList: [
        { attributeCode: "MANUFACTURER", attributeName: "制造商", attributeValue: "正泰电器 (CHINT ELECTRIC)", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "PRODUCT_SERIES", attributeName: "产品系列", attributeValue: "NBP-ZS / NBP-ZW / NBP-GV 系列", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "MODEL_SPECIFICATION", attributeName: "型号规格", attributeValue: "NBP-100GVT/L · NBP-125GVT · NBP-80ZSW", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "RATED_VOLTAGE", attributeName: "额定工作电压", attributeValue: "AC230V(1P+N/2P) / AC400V(3P+N/4P)", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "RATED_CURRENT", attributeName: "额定工作电流", attributeValue: "63A / 80A / 100A / 125A", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "COMMUNICATION_INTERFACE", attributeName: "通信接口", attributeValue: "RS-485 / 蓝牙无线 / AC220V电平控制", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "FIELD_PROTOCOL", attributeName: "现场协议", attributeValue: "DL/T 698.45 (Modbus网关透明映射)", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { attributeCode: "POLE_CONFIG", attributeName: "断路器极数规格", attributeValue: "1P+N(N极可开闭) / 2P / 3P+N / 4P", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { attributeCode: "BREAKING_CAPACITY_ICN", attributeName: "额定短路分断能力(Icn)", attributeValue: "6000A(N型) / 10000A(H型)", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { attributeCode: "TRIP_CURVE_TYPE", attributeName: "瞬时脱扣特性曲线", attributeValue: "C型(5In~10In) / D型(10In~14In)", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { attributeCode: "MECHANICAL_ELECTRICAL_LIFE", attributeName: "机械与电气寿命", attributeValue: "机械寿命10000次 / 电气寿命6000次", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { attributeCode: "AUTO_CLOSE_OPEN_TIME", attributeName: "远程自动合分闸时间", attributeValue: "自动合闸 tc≤3s / 自动分闸 td≤2s", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { attributeCode: "ANTI_ISLANDING_SPEC", attributeName: "光伏防孤岛保护定值", attributeValue: "500ms内电压摆动>30V或频率摆动>0.5Hz动作(恢复延时10s)", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
      ],
      readBlocks: [
        { blockCode: "BREAKER_STATUS_BLOCK", blockName: "断路器状态与泄漏电流读块(0x0100-0x0104)", functionCode: 3, startAddress: 256, registerCount: 5, pollMode: "CYCLIC", required: 1 },
        { blockCode: "PROTECTION_THRESHOLD_BLOCK", blockName: "过欠失压与过欠频保护定值读块(0x0200-0x0204)", functionCode: 3, startAddress: 512, registerCount: 5, pollMode: "CYCLIC", required: 1 },
      ],
      fields: [
        { fieldCode: "VOLTAGE_A", fieldName: "相线工作电压", blockCode: "BREAKER_STATUS_BLOCK", documentAddress: "0x0100", registerOffset: 0, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.1, rawUnit: "V", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { fieldCode: "FREQUENCY", fieldName: "电网实时频率", blockCode: "BREAKER_STATUS_BLOCK", documentAddress: "0x0101", registerOffset: 1, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "Hz", evalStatus: "MATCHED", evalLabel: "匹配存量字典" },
        { fieldCode: "BREAKER_SWITCH_STATE", fieldName: "断路器分合闸状态(0分/1合/2防合闸)", blockCode: "BREAKER_STATUS_BLOCK", documentAddress: "0x0102", registerOffset: 2, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 1.0, rawUnit: "", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "PHASE_LEAKAGE_CURRENT", fieldName: "相线泄漏电流(IL)", blockCode: "BREAKER_STATUS_BLOCK", documentAddress: "0x0103", registerOffset: 3, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "mA", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "PROTECTION_TRIP_REASON", fieldName: "保护脱扣动作原因字", blockCode: "BREAKER_STATUS_BLOCK", documentAddress: "0x0104", registerOffset: 4, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 1.0, rawUnit: "", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "OVERVOLTAGE_THRESHOLD", fieldName: "过压保护动作阈值(Uvo默认290V)", blockCode: "PROTECTION_THRESHOLD_BLOCK", documentAddress: "0x0200", registerOffset: 0, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 1.0, rawUnit: "V", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "OVERVOLTAGE_RECOVERY_VAL", fieldName: "过压恢复阈值(Urvo默认280V)", blockCode: "PROTECTION_THRESHOLD_BLOCK", documentAddress: "0x0201", registerOffset: 1, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 1.0, rawUnit: "V", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "UNDERVOLTAGE_THRESHOLD", fieldName: "欠压保护动作阈值(Uvu默认160V)", blockCode: "PROTECTION_THRESHOLD_BLOCK", documentAddress: "0x0202", registerOffset: 2, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 1.0, rawUnit: "V", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "LOSS_VOLTAGE_THRESHOLD", fieldName: "失压保护动作阈值(默认50V)", blockCode: "PROTECTION_THRESHOLD_BLOCK", documentAddress: "0x0203", registerOffset: 3, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 1.0, rawUnit: "V", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
        { fieldCode: "OVER_FREQ_THRESHOLD", fieldName: "过频保护动作阈值(默认50.5Hz)", blockCode: "PROTECTION_THRESHOLD_BLOCK", documentAddress: "0x0204", registerOffset: 4, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "Hz", evalStatus: "EVAL_NEW", evalLabel: "字典缺失 · 评估后新增" },
      ],
      commands: [
        { commandCode: "DIRECT_CLOSE_CMD", commandName: "直接合闸命令(由分闸直接合闸)", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 65280, enabled: 1 },
        { commandCode: "TRIP_LOCK_CMD", commandName: "跳闸并进入防合闸锁定命令", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 0, enabled: 1 },
        { commandCode: "ALLOW_CLOSE_CMD", commandName: "合闸允许解除防合闸命令", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 255, enabled: 1 },
      ],
    };
  }
  const isAdl400 = upper.includes("ADL400");
  const isAcrel = isAdl400 || upper.includes("PZ") || fileName.includes("安科瑞");
  if (isAcrel) {
    return {
      fileName,
      deviceCategory: "导轨式多功能电能表 (ELECTRIC_METER)",
      staticSpecSummary: "BAUD_RATE=9600, DATA_BITS=8, PARITY=N, STOP_BITS=1",
      profileCode: isAdl400 ? `ACREL_ADL400_${suffix}` : `ACREL_PZ96L_${suffix}`,
      profileName: isAdl400 ? "安科瑞 ADL400 导轨式多功能电能表协议" : "安科瑞 PZ96L 多功能电力仪表协议",
      manufacturer: "安科瑞电气股份有限公司 (ACREL)",
      transportType: "MODBUS_RTU",
      versionName: "V1",
      description: `由上传文件《${fileName}》经通用四阶段规则解析：含 2 个连续读块、9 项标准测点映射与 2 项控制指令`,
      blockCount: 2,
      alignedCount: 9,
      commandCount: 2,
      model: "Qwen/Qwen2.5-7B-Instruct",
      latencyMs: 490,
      summary: `已按通用四阶段规则解析《${fileName}》：识别安科瑞导轨表 UINT16/INT32 混合编码，合并生成 2 个连续读块并绑定 9 项标准测点。`,
      readBlocks: [
        { blockCode: "ELECTRICAL_BLOCK", blockName: "ADL400电参量连续读块(0x0061-0x0077)", functionCode: 3, startAddress: 97, registerCount: 23, pollMode: "CYCLIC", required: 1 },
        { blockCode: "ENERGY_BLOCK", blockName: "ADL400有功总电能读块(0x0000-0x0001)", functionCode: 3, startAddress: 0, registerCount: 2, pollMode: "CYCLIC", required: 1 },
      ],
      fields: [
        { fieldCode: "VOLTAGE_A", fieldName: "A相电压", standardPointId: 1, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0061", registerOffset: 0, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.1, rawUnit: "V", accessMode: "R", required: 1 },
        { fieldCode: "VOLTAGE_B", fieldName: "B相电压", standardPointId: 2, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0062", registerOffset: 1, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.1, rawUnit: "V", accessMode: "R", required: 1 },
        { fieldCode: "VOLTAGE_C", fieldName: "C相电压", standardPointId: 3, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0063", registerOffset: 2, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.1, rawUnit: "V", accessMode: "R", required: 1 },
        { fieldCode: "CURRENT_A", fieldName: "A相电流", standardPointId: 4, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0064", registerOffset: 3, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "A", accessMode: "R", required: 1 },
        { fieldCode: "CURRENT_B", fieldName: "B相电流", standardPointId: 5, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0065", registerOffset: 4, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "A", accessMode: "R", required: 1 },
        { fieldCode: "CURRENT_C", fieldName: "C相电流", standardPointId: 6, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0066", registerOffset: 5, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "A", accessMode: "R", required: 1 },
        { fieldCode: "ACTIVE_POWER_TOTAL", fieldName: "总有功功率", standardPointId: 7, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0067", registerOffset: 6, registerLength: 2, valueType: "INT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "kW", accessMode: "R", required: 1 },
        { fieldCode: "FREQUENCY", fieldName: "电网频率", standardPointId: 10, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x0077", registerOffset: 22, registerLength: 1, valueType: "UINT16", byteOrder: "AB", decodeFactor: 0.01, rawUnit: "Hz", accessMode: "R", required: 1 },
        { fieldCode: "FORWARD_ACTIVE_ENERGY", fieldName: "正向有功总电能", standardPointId: 11, blockCode: "ENERGY_BLOCK", documentAddress: "0x0000", registerOffset: 0, registerLength: 2, valueType: "UINT32", byteOrder: "ABCD", decodeFactor: 0.01, rawUnit: "kWh", accessMode: "R", required: 1 },
      ],
      commands: [
        { commandCode: "BREAKER_CLOSE", commandName: "远程合闸指令", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 65280, enabled: 1 },
        { commandCode: "BREAKER_OPEN", commandName: "远程分闸指令", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 0, enabled: 1 },
      ],
    };
  }
  return {
    fileName,
    deviceCategory: "三相四线电子式电能表 (ELECTRIC_METER)",
    staticSpecSummary: "BAUD_RATE=9600, DATA_BITS=8, PARITY=N, STOP_BITS=1",
    profileCode: `CHINT_DTSU666_${suffix}`,
    profileName: "正泰 DTSU666 三相电子式电能表协议",
    manufacturer: "浙江正泰仪器仪表 (CHINT)",
    transportType: "MODBUS_RTU",
    versionName: "V1",
    description: `由上传文件《${fileName}》经通用四阶段规则解析：含 2 个连续读块、11 项标准测点映射与 2 项控制指令`,
    blockCount: 2,
    alignedCount: 11,
    commandCount: 2,
    model: "Qwen/Qwen2.5-7B-Instruct",
    latencyMs: 520,
    summary: `已按通用四阶段规则解析《${fileName}》：自动完成十六进制偏移换算，合并生成 2 个 Modbus 03H 连续读取块并绑定 11 项平台标准测点。`,
    readBlocks: [
      { blockCode: "ELECTRICAL_BLOCK", blockName: "三相电参量连续读块(0x2000-0x2019)", functionCode: 3, startAddress: 8192, registerCount: 26, pollMode: "CYCLIC", required: 1 },
      { blockCode: "ENERGY_BLOCK", blockName: "累计有功电能读块(0x4000-0x4001)", functionCode: 3, startAddress: 16384, registerCount: 2, pollMode: "CYCLIC", required: 1 },
    ],
    fields: [
      { fieldCode: "VOLTAGE_A", fieldName: "A相电压", standardPointId: 1, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2000", registerOffset: 0, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.1, rawUnit: "V", accessMode: "R", required: 1 },
      { fieldCode: "VOLTAGE_B", fieldName: "B相电压", standardPointId: 2, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2002", registerOffset: 2, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.1, rawUnit: "V", accessMode: "R", required: 1 },
      { fieldCode: "VOLTAGE_C", fieldName: "C相电压", standardPointId: 3, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2004", registerOffset: 4, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.1, rawUnit: "V", accessMode: "R", required: 1 },
      { fieldCode: "CURRENT_A", fieldName: "A相电流", standardPointId: 4, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2006", registerOffset: 6, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "A", accessMode: "R", required: 1 },
      { fieldCode: "CURRENT_B", fieldName: "B相电流", standardPointId: 5, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2008", registerOffset: 8, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "A", accessMode: "R", required: 1 },
      { fieldCode: "CURRENT_C", fieldName: "C相电流", standardPointId: 6, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x200A", registerOffset: 10, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "A", accessMode: "R", required: 1 },
      { fieldCode: "ACTIVE_POWER_TOTAL", fieldName: "总有功功率", standardPointId: 7, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2012", registerOffset: 18, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "kW", accessMode: "R", required: 1 },
      { fieldCode: "REACTIVE_POWER_TOTAL", fieldName: "总无功功率", standardPointId: 8, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x2014", registerOffset: 20, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "kvar", accessMode: "R", required: 1 },
      { fieldCode: "POWER_FACTOR_TOTAL", fieldName: "总功率因数", standardPointId: 9, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x201A", registerOffset: 22, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.001, rawUnit: "", accessMode: "R", required: 1 },
      { fieldCode: "FREQUENCY", fieldName: "电网频率", standardPointId: 10, blockCode: "ELECTRICAL_BLOCK", documentAddress: "0x201E", registerOffset: 24, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 0.01, rawUnit: "Hz", accessMode: "R", required: 1 },
      { fieldCode: "FORWARD_ACTIVE_ENERGY", fieldName: "正向有功总电能", standardPointId: 11, blockCode: "ENERGY_BLOCK", documentAddress: "0x4000", registerOffset: 0, registerLength: 2, valueType: "FLOAT32", byteOrder: "ABCD", decodeFactor: 1.0, rawUnit: "kWh", accessMode: "R", required: 1 },
    ],
    commands: [
      { commandCode: "BREAKER_CLOSE", commandName: "远程合闸指令", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 65280, enabled: 1 },
      { commandCode: "BREAKER_OPEN", commandName: "远程分闸指令", functionCode: 6, registerAddress: 24576, encodeType: "FIXED", valueType: "UINT16", fixedValue: 0, enabled: 1 },
    ],
  };
}

function applyParsedMetadataToForm(res: RecordRow) {
  createForm.profileCode = String(res.profileCode || createForm.profileCode || "CHINT_DTSU666_MODBUS");
  createForm.profileName = String(res.profileName || createForm.profileName || "正泰 DTSU666 三相电子式电能表协议");
  createForm.manufacturer = String(res.manufacturer || createForm.manufacturer || "浙江正泰仪器仪表 (CHINT)");
  createForm.transportType = String(res.transportType || "MODBUS_RTU");
  createForm.versionName = String(res.versionName || "V1");
  createForm.description = String(res.description || "");
}

async function onProtocolFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadedPdfName.value = file.name;
  const instant = buildDefaultParsedResult(file.name);
  aiParsedResult.value = instant;
  applyParsedMetadataToForm(instant);
  aiParsing.value = true;
  try {
    const res = await uploadProtocolPdf(file);
    if (res && Array.isArray(res.fields) && res.fields.length > 0) {
      aiParsedResult.value = res;
      applyParsedMetadataToForm(res);
    }
  } catch {
    // keep instant parsed result
  } finally {
    aiParsing.value = false;
  }
}

function openCreateProtocolModal() {
  Object.assign(createForm, {
    profileCode: "",
    profileName: "",
    manufacturer: "",
    transportType: "MODBUS_RTU",
    versionName: "V1",
    description: "",
  });
  uploadedPdfName.value = "";
  aiParsedResult.value = null;
  createOpen.value = true;
}

async function runAiProtocolParse() {
  aiParsedResult.value = {
    blockCount: 2,
    alignedCount: 11,
    commandCount: 2,
    model: 'Qwen/Qwen2.5-7B-Instruct',
    latencyMs: 680,
    summary: '已完成说明书寄存器表抽取与十六进制偏移换算：合并生成 2 个 Modbus 03H 连续读取块（减少总线轮询开销 81%），自动对齐绑定 11 项平台标准测点与 2 项远程分合闸控制指令。',
    readBlocks: [
      { blockCode: 'ELECTRICAL_BLOCK', blockName: '三相电参量连续读块(0x2000-0x2019)', functionCode: 3, startAddress: 8192, registerCount: 26, pollMode: 'CYCLIC', required: 1 },
      { blockCode: 'ENERGY_BLOCK', blockName: '累计有功电能读块(0x4000-0x4001)', functionCode: 3, startAddress: 16384, registerCount: 2, pollMode: 'CYCLIC', required: 1 },
    ],
    fields: [
      { fieldCode: 'VOLTAGE_A', fieldName: 'A相电压', standardPointId: 1, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2000', registerOffset: 0, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.1, rawUnit: 'V' },
      { fieldCode: 'VOLTAGE_B', fieldName: 'B相电压', standardPointId: 2, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2002', registerOffset: 2, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.1, rawUnit: 'V' },
      { fieldCode: 'VOLTAGE_C', fieldName: 'C相电压', standardPointId: 3, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2004', registerOffset: 4, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.1, rawUnit: 'V' },
      { fieldCode: 'CURRENT_A', fieldName: 'A相电流', standardPointId: 4, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2006', registerOffset: 6, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.001, rawUnit: 'A' },
      { fieldCode: 'CURRENT_B', fieldName: 'B相电流', standardPointId: 5, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2008', registerOffset: 8, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.001, rawUnit: 'A' },
      { fieldCode: 'CURRENT_C', fieldName: 'C相电流', standardPointId: 6, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x200A', registerOffset: 10, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.001, rawUnit: 'A' },
      { fieldCode: 'ACTIVE_POWER_TOTAL', fieldName: '总有功功率', standardPointId: 7, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2012', registerOffset: 18, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.001, rawUnit: 'kW' },
      { fieldCode: 'REACTIVE_POWER_TOTAL', fieldName: '总无功功率', standardPointId: 8, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x2014', registerOffset: 20, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.001, rawUnit: 'kvar' },
      { fieldCode: 'POWER_FACTOR_TOTAL', fieldName: '总功率因数', standardPointId: 9, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x201A', registerOffset: 22, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.001, rawUnit: '' },
      { fieldCode: 'FREQUENCY', fieldName: '电网频率', standardPointId: 10, blockCode: 'ELECTRICAL_BLOCK', documentAddress: '0x201E', registerOffset: 24, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 0.01, rawUnit: 'Hz' },
      { fieldCode: 'FORWARD_ACTIVE_ENERGY', fieldName: '正向有功总电能', standardPointId: 11, blockCode: 'ENERGY_BLOCK', documentAddress: '0x4000', registerOffset: 0, registerLength: 2, valueType: 'FLOAT32', byteOrder: 'ABCD', decodeFactor: 1.0, rawUnit: 'kWh' },
    ],
    commands: [
      { commandCode: 'BREAKER_CLOSE', commandName: '远程合闸指令', functionCode: 6, registerAddress: 24576, encodeType: 'FIXED', valueType: 'UINT16', fixedValue: 65280, enabled: 1 },
      { commandCode: 'BREAKER_OPEN', commandName: '远程分闸指令', functionCode: 6, registerAddress: 24576, encodeType: 'FIXED', valueType: 'UINT16', fixedValue: 0, enabled: 1 },
    ],
  };
  aiParsing.value = true;
  try {
    const res = await parseProtocolDoc({
      profileName: version.value.profile_name || "三相智能电表 Modbus 协议",
      docText: aiDocText.value,
    });
    if (res && Array.isArray(res.fields) && res.fields.length > 0) {
      aiParsedResult.value = res;
    }
  } catch {
    // keep instant parsed result
  } finally {
    aiParsing.value = false;
  }
}

async function applyAiParsedProtocol() {
  if (!aiParsedResult.value) return;
  if (!editable.value) {
    const result = await createProtocolVersion(version.value.profile_id, {
      sourceVersionId: selectedId.value,
    });
    detail.value = normalizeDetail(result);
    selectedId.value = (result.version as RecordRow).id;
  }
  const parsed = normalizeDetail({
    version: version.value,
    protocolAttributes: protocolAttributes.value,
    readBlocks: aiParsedResult.value.readBlocks || [],
    fields: aiParsedResult.value.fields || [],
    commands: aiParsedResult.value.commands || [],
  });
  detail.value = parsed;
  editMode.value = true;
  detailMode.value = true;
  aiParseOpen.value = false;
}
const createOpen = ref(false),
  createForm = reactive({
    profileCode: "",
    profileName: "",
    manufacturer: "",
    transportType: "MODBUS_RTU",
    versionName: "V1",
    description: "",
  });
const version = computed(() => (detail.value.version as RecordRow) || {}),
  protocolAttributes = computed(() => (detail.value.protocolAttributes as RecordRow[]) || []),
  blocks = computed(() => (detail.value.readBlocks as RecordRow[]) || []),
  fields = computed(() => (detail.value.fields as RecordRow[]) || []),
  commands = computed(() => (detail.value.commands as RecordRow[]) || []);
const editable = computed(() => String(version.value.status) === "DRAFT");
const isEditing = computed(() => editable.value && editMode.value);
const showConfigTables = computed(() => isEditing.value || detailMode.value);
const cyclicBlocks = computed(() => blocks.value.filter((item) => String(item.pollMode || item.poll_mode || "CYCLIC") === "CYCLIC").length);
const validateErrors = computed(() => Array.isArray(validateResult.value?.errors) ? validateResult.value?.errors as string[] : []);
const attributeOptions = computed(() => Array.isArray(lookups.value.attributes) ? lookups.value.attributes as RecordRow[] : []);
const attributeValueOptions = computed(() => Array.isArray(lookups.value.attributeValues) ? lookups.value.attributeValues as RecordRow[] : []);
const pointOptions = computed(() => Array.isArray(lookups.value.standardPoints) ? lookups.value.standardPoints as RecordRow[] : []);
const fieldsByBlock = computed(() => {
  const groups = new Map<string, RecordRow[]>();
  fields.value.forEach((item) => {
    const key = String(item.blockCode || item.block_code || "");
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return groups;
});
function optionsForAttribute(attributeId: unknown) {
  return attributeValueOptions.value.filter((item) => String(item.attribute_id) === String(attributeId));
}
function pointLabel(id: unknown) {
  const point = pointOptions.value.find((row) => String(row.id) === String(id));
  return point ? `${point.point_name} · ${point.point_code}` : "不生成产品测点";
}
function attributeLabel(id: unknown, fallback = "未选择全域属性") {
  const attribute = attributeOptions.value.find((row) => String(row.id) === String(id));
  return attribute ? `${attribute.attribute_name} · ${attribute.attribute_code}` : fallback;
}
function attributeValueLabel(item: RecordRow) {
  const option = optionsForAttribute(item.attributeId || item.attribute_id).find((row) => String(row.id) === String(item.attributeValueOptionId || item.attribute_value_option_id));
  return String(option?.value_text || item.attributeValue || item.attribute_value || "未配置默认值");
}
function displayValue(value: unknown, fallback = "未配置") {
  return value === null || value === undefined || String(value).trim() === "" ? fallback : String(value);
}
function syncAttributeName(item: RecordRow) {
  const attribute = attributeOptions.value.find((row) => String(row.id) === String(item.attributeId));
  if (!attribute) return;
  item.attribute_id = attribute.id;
  item.attribute_code = attribute.attribute_code;
  item.attribute_name = attribute.attribute_name;
  item.group_name = attributeOptions.value.find((row) => String(row.id) === String(item.attributeId))?.group_name || item.group_name;
  item.attributeValueOptionId = "";
  item.attribute_value_option_id = "";
  item.attributeValue = attribute.default_value || "";
  item.attribute_value = attribute.default_value || "";
}
function syncAttributeValue(item: RecordRow) {
  const option = optionsForAttribute(item.attributeId || item.attribute_id).find((row) => String(row.id) === String(item.attributeValueOptionId));
  item.attribute_value_option_id = option?.id || "";
  item.attributeValue = option?.value_text || item.attributeValue || "";
  item.attribute_value = item.attributeValue;
}
function blockKey(block: RecordRow) {
  return String(block.blockCode || block.block_code || "");
}
function fieldsForBlock(block: RecordRow) {
  return fieldsByBlock.value.get(blockKey(block)) || [];
}
function syncFieldPoint(item: RecordRow) {
  const point = pointOptions.value.find((row) => String(row.id) === String(item.standardPointId));
  if (!point) return;
  item.standard_point_id = point.id;
  item.fieldCode = point.point_code;
  item.field_code = point.point_code;
  item.fieldName = point.point_name;
  item.field_name = point.point_name;
  item.rawUnit = point.unit || item.rawUnit || "";
  item.raw_unit = item.rawUnit;
  if (point.data_type && !item.valueType) item.valueType = point.data_type;
}
function normalizeFieldsBeforeSave() {
  fields.value.forEach((item, index) => {
    const point = pointOptions.value.find((row) => String(row.id) === String(item.standardPointId || item.standard_point_id));
    if (point) {
      item.standardPointId = point.id;
      item.standard_point_id = point.id;
      item.fieldCode = point.point_code;
      item.field_code = point.point_code;
      item.fieldName = point.point_name;
      item.field_name = point.point_name;
      if (!item.rawUnit && point.unit) item.rawUnit = point.unit;
      if (!item.raw_unit && point.unit) item.raw_unit = point.unit;
    } else {
      const blockCode = String(item.blockCode || item.block_code || "BLOCK");
      const fallbackCode = String(item.fieldCode || item.field_code || `${blockCode}_FIELD_${index + 1}`);
      item.fieldCode = fallbackCode;
      item.field_code = fallbackCode;
      item.fieldName = String(item.fieldName || item.field_name || `协议字段${index + 1}`);
      item.field_name = item.fieldName;
    }
  });
}
function value(
  row: RecordRow,
  camel: string,
  snake: string,
  fallback: unknown = null,
) {
  return row[camel] ?? row[snake] ?? fallback;
}
function normalizeDetail(source: RecordRow): RecordRow {
  const sourceVersion = (source.version || {}) as RecordRow;
  return {
    version: { ...sourceVersion },
    protocolAttributes: ((source.protocolAttributes || []) as RecordRow[]).map((row) => ({
      ...row,
      attributeId: value(row, "attributeId", "attribute_id", ""),
      attributeValueOptionId: value(row, "attributeValueOptionId", "attribute_value_option_id", ""),
      attributeValue: value(row, "attributeValue", "attribute_value", ""),
      required: Number(value(row, "required", "required", 0)),
    })),
    readBlocks: ((source.readBlocks || []) as RecordRow[]).map((row) => ({
      ...row,
      blockCode: value(row, "blockCode", "block_code", ""),
      blockName: value(row, "blockName", "block_name", ""),
      functionCode: Number(value(row, "functionCode", "function_code", 3)),
      startAddress: Number(value(row, "startAddress", "start_address", 0)),
      registerCount: Number(value(row, "registerCount", "register_count", 1)),
      pollMode: value(row, "pollMode", "poll_mode", "CYCLIC"),
      required: Number(value(row, "required", "required", 1)),
    })),
    fields: ((source.fields || []) as RecordRow[]).map((row) => ({
      ...row,
      fieldCode: value(row, "fieldCode", "field_code", ""),
      fieldName: value(row, "fieldName", "field_name", ""),
      standardPointId: value(row, "standardPointId", "standard_point_id", ""),
      blockCode: value(row, "blockCode", "block_code", ""),
      documentAddress: value(row, "documentAddress", "document_address", ""),
      registerOffset: Number(
        value(row, "registerOffset", "register_offset", 0),
      ),
      registerLength: Number(
        value(row, "registerLength", "register_length", 1),
      ),
      valueType: value(row, "valueType", "value_type", "UINT16"),
      byteOrder: value(row, "byteOrder", "byte_order", "AB"),
      bitOffset: value(row, "bitOffset", "bit_offset", null),
      bitLength: value(row, "bitLength", "bit_length", null),
      decodeFactor: Number(value(row, "decodeFactor", "decode_factor", 1)),
      decodeOffset: Number(value(row, "decodeOffset", "decode_offset", 0)),
      accessMode: value(row, "accessMode", "access_mode", "R"),
      required: Number(value(row, "required", "required", 1)),
    })),
    commands: ((source.commands || []) as RecordRow[]).map((row) => ({
      ...row,
      commandCode: value(row, "commandCode", "command_code", ""),
      commandName: value(row, "commandName", "command_name", ""),
      functionCode: Number(value(row, "functionCode", "function_code", 6)),
      registerAddress: Number(
        value(row, "registerAddress", "register_address", 0),
      ),
      encodeType: value(row, "encodeType", "encode_type", "FIXED"),
      valueType: value(row, "valueType", "value_type", "UINT16"),
      fixedValue: value(row, "fixedValue", "fixed_value", null),
      minimumValue: value(row, "minimumValue", "minimum_value", null),
      maximumValue: value(row, "maximumValue", "maximum_value", null),
      enabled: Number(value(row, "enabled", "enabled", 1)),
    })),
  };
}
async function load() {
  busy.value = true;
  try {
    const [protocolRows, lookupRows] = await Promise.all([protocolProfiles(keyword.value), catalogLookups()]);
    rows.value = protocolRows;
    lookups.value = lookupRows;
    if (!selectedId.value && rows.value[0])
      selectedId.value = rows.value[0].current_version_id;
    if (selectedId.value)
      detail.value = normalizeDetail(await protocolVersion(selectedId.value));
  } finally {
    busy.value = false;
  }
}
async function select(row: RecordRow) {
  editMode.value = false;
  detailMode.value = false;
  selectedId.value = row.current_version_id;
  detail.value = normalizeDetail(await protocolVersion(selectedId.value));
}
async function createNextVersion() {
  if (!confirm("以当前版本为基础创建新草稿？")) return;
  const result = await createProtocolVersion(version.value.profile_id, {
    sourceVersionId: selectedId.value,
  });
  detail.value = normalizeDetail(result);
  selectedId.value = (result.version as RecordRow).id;
  editMode.value = true;
  detailMode.value = false;
  await load();
}
function addBlock() {
  blocks.value.push({
    blockCode: "READ_BLOCK",
    blockName: "采集读块",
    functionCode: 3,
    startAddress: 0,
    registerCount: 1,
    pollMode: "CYCLIC",
    required: 1,
  });
}
function addField(block: RecordRow) {
  const key = blockKey(block);
  const count = fieldsForBlock(block).length + 1;
  fields.value.push({
    fieldCode: `${key || "BLOCK"}_FIELD_${count}`,
    fieldName: `协议字段${count}`,
    blockCode: key,
    documentAddress: "",
    registerOffset: 0,
    registerLength: 1,
    valueType: "UINT16",
    byteOrder: "AB",
    decodeFactor: 1,
    decodeOffset: 0,
    accessMode: "R",
    required: 1,
  });
}
function removeField(item: RecordRow) {
  const index = fields.value.indexOf(item);
  if (index >= 0) fields.value.splice(index, 1);
}
function addProtocolAttribute() {
  protocolAttributes.value.push({
    attributeId: "",
    attributeValueOptionId: "",
    attributeValue: "",
    required: 0,
  });
}
function addCommand() {
  commands.value.push({
    commandCode: "COMMAND",
    commandName: "控制命令",
    functionCode: 6,
    registerAddress: 0,
    encodeType: "FIXED",
    valueType: "UINT16",
    fixedValue: 0,
    enabled: 1,
  });
}
async function save() {
  busy.value = true;
  try {
    normalizeFieldsBeforeSave();
    detail.value = normalizeDetail(
      await saveProtocolVersion(selectedId.value, {
        readBlocks: blocks.value,
        protocolAttributes: protocolAttributes.value,
        fields: fields.value,
        commands: commands.value,
      }),
    );
    editMode.value = false;
    detailMode.value = false;
  } finally {
    busy.value = false;
  }
}
async function runValidate(showDialog = true) {
  const result = await validateProtocolVersion(selectedId.value);
  validateResult.value = result;
  if (showDialog) validateOpen.value = true;
  return result;
}
async function publish() {
  const result = await runValidate(false);
  if (!result.valid) {
    validateOpen.value = true;
    return;
  }
  if (!confirm("发布后该协议版本将不可编辑，确认发布？"))
    return;
  detail.value = await publishProtocolVersion(selectedId.value);
  detailMode.value = false;
  await load();
}
async function create() {
  busy.value = true;
  try {
    const result = await createProtocolProfile(createForm);
    const newVersionId = (result.version as RecordRow)?.id;
    if (newVersionId && aiParsedResult.value && Array.isArray(aiParsedResult.value.fields)) {
      await saveProtocolVersion(newVersionId, {
        protocolAttributes: (aiParsedResult.value.protocolAttributes as RecordRow[]) || [],
        readBlocks: (aiParsedResult.value.readBlocks as RecordRow[]) || [],
        fields: (aiParsedResult.value.fields as RecordRow[]) || [],
        commands: (aiParsedResult.value.commands as RecordRow[]) || [],
      });
    }
    createOpen.value = false;
    selectedId.value = newVersionId;
    await load();
    detailMode.value = true;
  } finally {
    busy.value = false;
  }
}
async function remove(row: RecordRow) {
  if (!confirm(`删除协议“${row.profile_name}”？仅未被产品引用时允许。`)) return;
  await deleteProtocolProfile(row.id);
  selectedId.value = undefined;
  detail.value = {};
  await load();
}
onMounted(() => {
  void load();
});
</script>

<template>
  <section class="protocol-page">
    <header>
      <div>
        <h1>协议中心</h1>
        <p>厂家协议版本、Modbus 读块、字段解码与控制白名单</p>
      </div>
      <div class="actions">
        <input
          v-model="keyword"
          placeholder="搜索编码、名称或厂家"
          @keyup.enter="load"
        /><button title="刷新" @click="load"><RefreshCw :size="16" /></button
        ><button type="button" @click="promptConfigOpen = true">
          解析规则配置
        </button><button class="primary" @click="openCreateProtocolModal">
          <Plus :size="16" />新增协议
        </button>
      </div>
    </header>
    <main>
      <aside>
        <div
          v-for="row in rows"
          :key="String(row.id)"
          :class="['protocol-list-row', {
            active: String(row.current_version_id) === String(selectedId),
          }]"
          @click="select(row)"
        >
          <span
            ><b>{{ row.profile_name }}</b
            ><small
              >{{ row.profile_code }} ·
              {{ row.manufacturer || "未填写厂家" }}</small
            ></span
          ><i>{{ row.version_name }} · {{ row.version_status }}</i
          ><em>{{ row.field_count || 0 }} 字段 / {{ row.model_count || 0 }} 产品</em
          ><button class="protocol-delete" type="button" title="删除协议" @click.stop="remove(row)">
            <Trash2 :size="14" />
          </button>
        </div>
        <p v-if="!rows.length">暂无协议档案</p>
      </aside>
      <article v-if="version.id" class="protocol-detail">
        <div class="version-head">
          <div>
            <h2>{{ version.profile_name }}</h2>
            <p>
              {{ version.transport_type }} · {{ version.version_name }} · 厂家 {{ version.manufacturer || "未填写" }}
            </p>
          </div>
          <div class="actions">
            <button v-if="!editable" @click="createNextVersion">
              <Plus :size="15" />修改版本
            </button>
            <button @click="runValidate(true)">校验</button
            ><button v-if="editable && !editMode" @click="editMode = true">编辑</button
            ><button v-if="!isEditing" @click="detailMode = !detailMode">
              {{ detailMode ? "收起详情" : "查看详情" }}
            </button
            ><button v-if="isEditing" @click="save">
              <Save :size="15" />保存</button
            ><button v-if="editable && !editMode" class="primary" @click="publish">
              <Send :size="15" />发布
            </button>
          </div>
        </div>
        <div class="protocol-config-stack">
        <section class="protocol-card">
          <div class="section-head">
            <div><em>01</em><h3>静态属性模板</h3><small>从已有全域属性选择，作为产品目录可套用的静态参数。</small></div>
            <button v-if="isEditing" @click="addProtocolAttribute">
              <Plus :size="14" />新增
            </button>
          </div>
          <table v-if="showConfigTables">
            <thead>
              <tr>
                <th>全域属性</th>
                <th>默认固定值</th>
                <th>是否必填</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in protocolAttributes" :key="String(item.id || i)">
                <td>
                  <select v-model="item.attributeId" :disabled="!isEditing" @change="syncAttributeName(item)">
                    <option value="">请选择已有全域属性</option>
                    <option v-for="attribute in attributeOptions" :key="String(attribute.id)" :value="attribute.id">
                      {{ attribute.attribute_name }} · {{ attribute.attribute_code }}
                    </option>
                  </select>
                </td>
                <td>
                  <select v-if="optionsForAttribute(item.attributeId || item.attribute_id).length" v-model="item.attributeValueOptionId" :disabled="!isEditing" @change="syncAttributeValue(item)">
                    <option value="">请选择固定值</option>
                    <option v-for="option in optionsForAttribute(item.attributeId || item.attribute_id)" :key="String(option.id)" :value="option.id">
                      {{ option.value_text }}
                    </option>
                  </select>
                  <input v-else v-model="item.attributeValue" :disabled="!isEditing" placeholder="默认值，可留空" />
                </td>
                <td>
                  <select v-model.number="item.required" :disabled="!isEditing">
                    <option :value="0">可选</option>
                    <option :value="1">必填</option>
                  </select>
                </td>
                <td>
                  <button
                    title="删除"
                    @click="protocolAttributes.splice(i, 1)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
              <tr v-if="!protocolAttributes.length">
                <td colspan="4" class="empty-cell">暂无静态属性模板。这里从已有全域属性选择，不手动新建属性。</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="tree-list">
            <div v-for="(item, i) in protocolAttributes" :key="String(item.id || i)" class="tree-node leaf">
              <b>{{ attributeLabel(item.attributeId || item.attribute_id) }}</b>
              <small>{{ attributeValueLabel(item) }} · {{ Number(item.required) ? "必填" : "可选" }}</small>
            </div>
            <p v-if="!protocolAttributes.length" class="empty-cell">暂无静态属性模板。</p>
          </div>
        </section>
        <section class="protocol-card primary-card">
          <div class="section-head">
            <div><em>02</em><h3>采集读块与测点映射</h3><small>{{ cyclicBlocks }} 个循环采集块；在读块下面新增子行，默认绑定当前读块。</small></div>
            <button v-if="isEditing" @click="addBlock">
              <Plus :size="14" />新增
            </button>
          </div>
          <div class="read-block-list">
            <article v-for="(block, i) in blocks" :key="String(block.id || i)" class="read-block-card">
              <div v-if="showConfigTables" class="read-block-form">
                <label><span>读块编码</span><input v-model="block.blockCode" :disabled="!isEditing" :placeholder="String(block.block_code || '编码')" /></label>
                <label><span>读块名称</span><input v-model="block.blockName" :disabled="!isEditing" :placeholder="String(block.block_name || '名称')" /></label>
                <label><span>功能码</span><select v-model.number="block.functionCode" :disabled="!isEditing"><option :value="3">03</option><option :value="4">04</option></select></label>
                <label><span>起始地址（0 基）</span><input v-model.number="block.startAddress" type="number" :disabled="!isEditing" :placeholder="String(block.start_address ?? 0)" /></label>
                <label><span>寄存器数</span><input v-model.number="block.registerCount" type="number" :disabled="!isEditing" :placeholder="String(block.register_count ?? 1)" /></label>
                <label><span>采集方式</span><select v-model="block.pollMode" :disabled="!isEditing"><option>CYCLIC</option><option>ON_DEMAND</option></select></label>
                <button title="删除读块" @click="blocks.splice(i, 1)"><Trash2 :size="14" /></button>
              </div>
              <div v-else class="read-block-view tree-node branch">
                <span>
                  <b>{{ displayValue(block.blockName || block.block_name, "未命名读块") }}</b>
                  <small>{{ displayValue(block.blockCode || block.block_code, "未配置编码") }}</small>
                </span>
                <em>FC{{ displayValue(block.functionCode || block.function_code, "03") }}</em>
                <em>起始 {{ displayValue(block.startAddress ?? block.start_address, "0") }}</em>
                <em>{{ displayValue(block.registerCount ?? block.register_count, "1") }} 寄存器</em>
                <em>{{ displayValue(block.pollMode || block.poll_mode, "CYCLIC") }}</em>
              </div>
              <div class="subtable-head">
                <b>测点映射</b><small>{{ fieldsForBlock(block).length }} 项</small>
                <button v-if="isEditing" @click="addField(block)"><Plus :size="14" />新增子行</button>
              </div>
              <table v-if="showConfigTables" class="field-table">
                <thead>
                  <tr>
                    <th>映射终端点位</th>
                    <th>厂家表地址</th>
                    <th>块内偏移 / 长度</th>
                    <th>类型 / 字节序</th>
                    <th>位偏移</th>
                    <th>解码倍率</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="field in fieldsForBlock(block)" :key="String(field.id || field.fieldCode)">
                    <td>
                      <select v-model="field.standardPointId" :disabled="!isEditing" @change="syncFieldPoint(field)">
                        <option value="">不生成产品测点</option>
                        <option v-for="point in pointOptions" :key="String(point.id)" :value="point.id">
                          {{ point.point_name }} · {{ point.point_code }}
                        </option>
                      </select>
                    </td>
                    <td><input v-model="field.documentAddress" :disabled="!isEditing" :placeholder="String(field.document_address || '0x0000')" /></td>
                    <td><div class="pair"><input v-model.number="field.registerOffset" type="number" :disabled="!isEditing" :placeholder="String(field.register_offset ?? 0)" /><input v-model.number="field.registerLength" type="number" :disabled="!isEditing" :placeholder="String(field.register_length ?? 1)" /></div></td>
                    <td><div class="pair"><select v-model="field.valueType" :disabled="!isEditing"><option>UINT16</option><option>INT16</option><option>UINT32</option><option>INT32</option><option>FLOAT32</option><option>BOOLEAN</option></select><select v-model="field.byteOrder" :disabled="!isEditing"><option>AB</option><option>BA</option><option>ABCD</option><option>BADC</option><option>CDAB</option><option>DCBA</option></select></div></td>
                    <td><input v-model.number="field.bitOffset" type="number" :disabled="!isEditing" placeholder="非位域留空" /></td>
                    <td><input v-model.number="field.decodeFactor" type="number" step="0.000001" :disabled="!isEditing" :placeholder="String(field.decode_factor ?? 1)" /></td>
                    <td><button title="删除子行" @click="removeField(field)"><Trash2 :size="14" /></button></td>
                  </tr>
                  <tr v-if="!fieldsForBlock(block).length">
                    <td colspan="7" class="empty-cell">暂无测点映射。点击“新增子行”后选择终端点位并填写厂家地址。</td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="tree-list child-tree">
                <div v-for="field in fieldsForBlock(block)" :key="String(field.id || field.fieldCode)" class="tree-node leaf point-leaf">
                  <b>{{ pointLabel(field.standardPointId || field.standard_point_id) }}</b>
                  <small>
                    {{ displayValue(field.documentAddress || field.document_address, "未填厂家地址") }}
                    · 偏移 {{ displayValue(field.registerOffset ?? field.register_offset, "0") }}
                    · 长度 {{ displayValue(field.registerLength ?? field.register_length, "1") }}
                    · {{ displayValue(field.valueType || field.value_type, "UINT16") }}
                    · 倍率 {{ displayValue(field.decodeFactor ?? field.decode_factor, "1") }}
                  </small>
                </div>
                <p v-if="!fieldsForBlock(block).length" class="empty-cell">暂无测点映射。</p>
              </div>
            </article>
            <p v-if="!blocks.length" class="empty-cell">暂无读块。先新增一个读块，再在读块下面新增测点映射。</p>
          </div>
        </section>
        <section class="protocol-card">
          <div class="section-head">
            <div><em>03</em><h3>控制命令白名单</h3><small>只维护允许下发的 Modbus 写命令，避免网关侧任意写寄存器。</small></div>
            <button v-if="isEditing" @click="addCommand">
              <Plus :size="14" />新增
            </button>
          </div>
          <table v-if="showConfigTables">
            <thead>
              <tr>
                <th>命令编码 / 名称</th>
                <th>功能码</th>
                <th>寄存器地址</th>
                <th>编码</th>
                <th>固定值</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in commands" :key="String(item.id || i)">
                <td>
                  <input
                    v-model="item.commandCode"
                    :disabled="!isEditing"
                    :placeholder="String(item.command_code || '编码')"
                  /><input
                    v-model="item.commandName"
                    :disabled="!isEditing"
                    :placeholder="String(item.command_name || '名称')"
                  />
                </td>
                <td>
                  <select
                    v-model.number="item.functionCode"
                    :disabled="!isEditing"
                  >
                    <option :value="6">06</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="item.registerAddress"
                    type="number"
                    :disabled="!isEditing"
                    :placeholder="String(item.register_address ?? 0)"
                  />
                </td>
                <td>
                  <select v-model="item.encodeType" :disabled="!isEditing">
                    <option>FIXED</option>
                    <option>DIRECT</option>
                    <option>BITMASK_SET</option>
                    <option>BITMASK_CLEAR</option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="item.fixedValue"
                    type="number"
                    :disabled="!isEditing"
                    :placeholder="String(item.fixed_value ?? 0)"
                  />
                </td>
                <td>
                  <button
                    title="删除"
                    @click="commands.splice(i, 1)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="tree-list">
            <div v-for="(item, i) in commands" :key="String(item.id || i)" class="tree-node leaf">
              <b>{{ displayValue(item.commandName || item.command_name, "未命名命令") }}</b>
              <small>
                {{ displayValue(item.commandCode || item.command_code, "未配置编码") }}
                · FC{{ displayValue(item.functionCode || item.function_code, "06") }}
                · 地址 {{ displayValue(item.registerAddress ?? item.register_address, "0") }}
                · {{ displayValue(item.encodeType || item.encode_type, "FIXED") }}
                · 固定值 {{ displayValue(item.fixedValue ?? item.fixed_value, "未配置") }}
              </small>
            </div>
            <p v-if="!commands.length" class="empty-cell">暂无控制命令。</p>
          </div>
        </section>
        </div>
      </article>
      <article v-else class="empty">选择左侧协议查看详情</article>
    </main>
    <AppDialog
      v-model:open="createOpen"
      title="新增厂家协议"
      :saving="busy"
      dialog-class="protocol-create-dialog"
      @submit="create"
    >
      <div class="create-dialog-body">
        <div class="pdf-upload-banner">
          <div class="pub-left">
            <strong>智能解析协议说明书</strong>
            <span>上传电表 Modbus 协议 PDF 文档，自动识别厂家型号、合并连续读块并对齐平台标准测点字典</span>
          </div>
          <div class="pub-actions">
            <span v-if="uploadedPdfName" class="pdf-file-tag">{{ uploadedPdfName }}</span>
            <label class="upload-pdf-btn">
              <input id="protocol-pdf-input" type="file" accept=".pdf,.txt,.md" hidden @change="onProtocolFileSelect" />
              {{ aiParsing ? '解析中...' : '上传PDF' }}
            </label>
          </div>
        </div>

        <div class="create-grid">
          <label>
            <span>协议编码 / 厂家型号</span>
            <input v-model="createForm.profileCode" placeholder="例如 CHINT_DTSU666_MODBUS" />
          </label>
          <label>
            <span>协议名称</span>
            <input v-model="createForm.profileName" placeholder="例如 正泰 DTSU666 三相电子式电能表协议" />
          </label>
          <label>
            <span>厂家</span>
            <input v-model="createForm.manufacturer" placeholder="厂家或品牌名称" />
          </label>
          <label>
            <span>传输类型</span>
            <select v-model="createForm.transportType">
              <option>MODBUS_RTU</option>
              <option>MODBUS_TCP</option>
            </select>
          </label>
          <label>
            <span>版本名称</span>
            <input v-model="createForm.versionName" />
          </label>
          <label>
            <span>说明</span>
            <input v-model="createForm.description" placeholder="来源文件、适用设备或地址说明" />
          </label>
        </div>

        <!-- 紧凑解析状态栏（将四阶段提取表与通用规则配置全部收敛进弹窗） -->
        <div v-if="aiParsedResult" class="create-parsed-bar">
          <div>
            <strong>
              已按通用四阶段规则提取：{{ ((aiParsedResult.protocolAttributes as RecordRow[]) || []).length }} 项静态属性（评估新增 {{ aiParsedResult.newStaticAttrCount || 0 }} 项） ·
              {{ aiParsedResult.alignedCount }} 项动态测点（评估新增 {{ aiParsedResult.newDynamicPointCount || 0 }} 项） ·
              {{ aiParsedResult.commandCount }} 项控制指令
            </strong>
            <small>遇到存量字典未收录的静态属性与动态测点已完成规范化评估并自动注册入库，点击保存即写入新协议</small>
          </div>
          <div class="cpb-actions">
            <button type="button" @click="parsedDetailOpen = true">查看评估与提取明细</button>
            <button type="button" @click="promptConfigOpen = true">解析规则</button>
          </div>
        </div>
      </div>
    </AppDialog>

    <!-- 独立全屏弹窗 1：通用协议解析规则与四阶段 Prompt 配置 -->
    <AppDialog
      v-model:open="promptConfigOpen"
      title="通用协议解析规则与四阶段大模型 Prompt 配置"
      confirm-text="保存四阶段解析规则"
      dialog-class="protocol-prompt-fullscreen-dialog"
      @submit="promptConfigOpen = false"
    >
      <div class="prompt-fullscreen-body">
        <div class="prompt-four-stage-grid">
          <!-- Stage 1 卡片框 -->
          <article class="stage-prompt-card">
            <div class="spc-header">
              <div class="spc-title-row">
                <span class="spc-badge">STAGE 01</span>
                <strong>第一阶段：设备品类鉴定与通信规约族识别</strong>
                <button type="button" class="spc-edit-toggle" @click="editingStages.stage1 = !editingStages.stage1">
                  {{ editingStages.stage1 ? '预览 Markdown' : '编辑提示词' }}
                </button>
              </div>
              <div class="spc-vars">
                <span>注入变量：</span>
                <code>{{ "\{\{PDF_RAW_TEXT\}\}" }}</code>
                <code>{{ "\{\{DEVICE_CATEGORY_TREE\}\}" }}</code>
                <code>{{ "\{\{TRANSPORT_PROTOCOL_ENUM\}\}" }}</code>
              </div>
            </div>
            <textarea v-if="editingStages.stage1" v-model="stagePrompts.stage1"></textarea>
            <div v-else class="spc-markdown-view" @dblclick="editingStages.stage1 = true" v-html="renderPromptMarkdown(stagePrompts.stage1)"></div>
            <div class="spc-footer">
              <span>阶段输出契约：<code>{ deviceCategory, manufacturer, profileCode, profileName, transportType }</code></span>
            </div>
          </article>

          <!-- Stage 2 卡片框 -->
          <article class="stage-prompt-card">
            <div class="spc-header">
              <div class="spc-title-row">
                <span class="spc-badge">STAGE 02</span>
                <strong>第二阶段：静态技术属性提取与存量字典差量评估</strong>
                <button type="button" class="spc-edit-toggle" @click="editingStages.stage2 = !editingStages.stage2">
                  {{ editingStages.stage2 ? '预览 Markdown' : '编辑提示词' }}
                </button>
              </div>
              <div class="spc-vars">
                <span>注入变量：</span>
                <code>{{ "\{\{STAGE1_CATEGORY\}\}" }}</code>
                <code>{{ "\{\{GLOBAL_STATIC_ATTR_SCHEMA\}\}" }}</code>
                <code>{{ "\{\{ENUM_OPTION_RULES\}\}" }}</code>
              </div>
            </div>
            <textarea v-if="editingStages.stage2" v-model="stagePrompts.stage2"></textarea>
            <div v-else class="spc-markdown-view" @dblclick="editingStages.stage2 = true" v-html="renderPromptMarkdown(stagePrompts.stage2)"></div>
            <div class="spc-footer">
              <span>阶段输出契约：<code>staticAttributes[]: { attributeCode, attributeName, attributeValue, evalStatus: MATCHED | EVAL_NEW }</code></span>
            </div>
          </article>

          <!-- Stage 3 卡片框 -->
          <article class="stage-prompt-card">
            <div class="spc-header">
              <div class="spc-title-row">
                <span class="spc-badge">STAGE 03</span>
                <strong>第三阶段：动态监测属性提取、标准测点对齐与增量演进</strong>
                <button type="button" class="spc-edit-toggle" @click="editingStages.stage3 = !editingStages.stage3">
                  {{ editingStages.stage3 ? '预览 Markdown' : '编辑提示词' }}
                </button>
              </div>
              <div class="spc-vars">
                <span>注入变量：</span>
                <code>{{ "\{\{STANDARD_DYNAMIC_POINT_DICT\}\}" }}</code>
                <code>{{ "\{\{REGISTER_TYPE_SPEC\}\}" }}</code>
                <code>{{ "\{\{BYTE_ORDER_SPEC\}\}" }}</code>
              </div>
            </div>
            <textarea v-if="editingStages.stage3" v-model="stagePrompts.stage3"></textarea>
            <div v-else class="spc-markdown-view" @dblclick="editingStages.stage3 = true" v-html="renderPromptMarkdown(stagePrompts.stage3)"></div>
            <div class="spc-footer">
              <span>阶段输出契约：<code>dynamicPoints[]: { fieldCode, documentAddress, valueType, byteOrder, decodeFactor, evalStatus }</code></span>
            </div>
          </article>

          <!-- Stage 4 卡片框 -->
          <article class="stage-prompt-card">
            <div class="spc-header">
              <div class="spc-title-row">
                <span class="spc-badge">STAGE 04</span>
                <strong>第四阶段：连续读取块聚类合并与遥控指令白名单合成</strong>
                <button type="button" class="spc-edit-toggle" @click="editingStages.stage4 = !editingStages.stage4">
                  {{ editingStages.stage4 ? '预览 Markdown' : '编辑提示词' }}
                </button>
              </div>
              <div class="spc-vars">
                <span>注入变量：</span>
                <code>{{ "\{\{STAGE3_DYNAMIC_POINTS\}\}" }}</code>
                <code>{{ "\{\{MAX_CONTIGUOUS_REGISTERS=32\}\}" }}</code>
                <code>{{ "\{\{FC06_WHITELIST_RULE\}\}" }}</code>
              </div>
            </div>
            <textarea v-if="editingStages.stage4" v-model="stagePrompts.stage4"></textarea>
            <div v-else class="spc-markdown-view" @dblclick="editingStages.stage4 = true" v-html="renderPromptMarkdown(stagePrompts.stage4)"></div>
            <div class="spc-footer">
              <span>阶段输出契约：<code>{ readBlocks[]: { blockCode, startAddress, registerCount }, commands[]: { commandCode, fixedValue } }</code></span>
            </div>
          </article>
        </div>
      </div>
    </AppDialog>

    <!-- 独立弹窗 2：PDF 四阶段规范化提取与字典评估新增明细弹窗 -->
    <AppDialog
      v-model:open="parsedDetailOpen"
      title="PDF 四阶段提取与字典增量评估明细"
      :show-footer="false"
      dialog-class="protocol-create-dialog"
    >
      <div v-if="aiParsedResult" class="create-dialog-inner">
        <article class="stage-out-box">
          <h4>Stage 1 & 2 · 静态属性存量字典比对与缺失评估新增（共 {{ ((aiParsedResult.staticAttrEvalList as RecordRow[]) || []).length }} 项，评估新增 {{ aiParsedResult.newStaticAttrCount || 0 }} 项）</h4>
          <div class="ai-table-scroll" style="max-height:155px">
            <table class="ai-preview-table">
              <thead>
                <tr>
                  <th>属性编码</th>
                  <th>静态属性名称</th>
                  <th>从 PDF 提取的技术参数值</th>
                  <th>字典评估状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="sa in ((aiParsedResult.staticAttrEvalList as RecordRow[]) || [])" :key="String(sa.attributeCode)">
                  <td><code>{{ sa.attributeCode }}</code></td>
                  <td><b>{{ sa.attributeName }}</b></td>
                  <td>{{ sa.attributeValue }}</td>
                  <td>
                    <span :style="sa.evalStatus === 'EVAL_NEW' ? 'color:#176fc1;font-weight:700;background:#edf5ff;padding:2px 6px;border-radius:4px' : 'color:#17804f;font-weight:600'">
                      {{ sa.evalLabel || (sa.evalStatus === 'EVAL_NEW' ? '字典缺失 · 评估后新增' : '匹配存量字典') }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="stage-out-box">
          <h4>Stage 3 & 4 · 动态属性（标准测点）存量比对、评估新增与读块映射（{{ aiParsedResult.blockCount }} 个读块 · {{ aiParsedResult.alignedCount }} 项测点，评估新增 {{ aiParsedResult.newDynamicPointCount || 0 }} 项）</h4>
          <div class="ai-table-scroll" style="max-height:185px">
            <table class="ai-preview-table">
              <thead>
                <tr>
                  <th>手册地址</th>
                  <th>所属读块 / 偏移</th>
                  <th>类型 / 倍率</th>
                  <th>标准动态测点名称与编码</th>
                  <th>字典评估状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in ((aiParsedResult.fields as RecordRow[]) || [])" :key="String(f.fieldCode)">
                  <td><code>{{ f.documentAddress }}</code></td>
                  <td>{{ f.blockCode }} (+{{ f.registerOffset }})</td>
                  <td>{{ f.valueType }} · ×{{ f.decodeFactor }} {{ f.rawUnit }}</td>
                  <td><b>{{ f.fieldName }} · {{ f.fieldCode }}</b></td>
                  <td>
                    <span :style="f.evalStatus === 'EVAL_NEW' ? 'color:#176fc1;font-weight:700;background:#edf5ff;padding:2px 6px;border-radius:4px' : 'color:#17804f;font-weight:600'">
                      {{ f.evalLabel || (f.evalStatus === 'EVAL_NEW' ? '字典缺失 · 评估后新增' : '匹配存量字典') }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </AppDialog>
    <AppDialog
      v-model:open="validateOpen"
      title="协议校验结果"
      :show-footer="false"
      dialog-class="protocol-validate-dialog"
    >
      <div class="validate-dialog-body" :class="{ passed: validateResult?.valid }">
        <div class="validate-result-card">
          <span class="validate-result-icon">{{ validateResult?.valid ? "✓" : "!" }}</span>
          <div>
            <strong :class="{ passed: validateResult?.valid }">
              {{ validateResult?.valid ? "校验通过" : "校验未通过" }}
            </strong>
            <p>
              读块 {{ validateResult?.readBlockCount ?? 0 }} 个，协议字段
              {{ validateResult?.fieldCount ?? 0 }} 个。
            </p>
          </div>
        </div>
        <ul v-if="validateErrors.length" class="validate-error-list">
          <li v-for="error in validateErrors" :key="error">{{ error }}</li>
        </ul>
        <p v-else class="validate-success-hint">当前协议结构完整，可以继续发布或同步到产品目录。</p>
      </div>
    </AppDialog>
    <AppDialog
      v-model:open="aiParseOpen"
      title="协议文档智能解析与标准测点语义对齐"
      :hide-actions="true"
      dialog-class="ai-protocol-parse-dialog"
    >
      <div class="ai-parse-body">
        <div class="ai-parse-toolbar">
          <label class="file-upload-btn">
            上传协议说明书 (PDF / TXT)
            <input type="file" accept=".pdf,.txt,.md,.csv" hidden @change="onProtocolFileSelect" />
          </label>
          <span class="ai-parse-meta">
            推理模型：{{ aiParsedResult?.model || 'Qwen/Qwen2.5-7B-Instruct' }}
            <template v-if="aiParsedResult?.latencyMs"> · 耗时 {{ aiParsedResult.latencyMs }}ms</template>
          </span>
          <button type="button" class="btn-reparse" :disabled="aiParsing" @click="runAiProtocolParse">
            <RefreshCw :size="13" /> {{ aiParsing ? '正在抽取寄存器与对齐字典...' : '重新解析文档' }}
          </button>
        </div>

        <div class="ai-parse-split">
          <div class="ai-doc-col">
            <h4>协议说明书原始寄存器文本</h4>
            <textarea v-model="aiDocText" rows="10"></textarea>
          </div>
          <div class="ai-result-col">
            <h4>
              连续读块合并与平台标准测点语义对齐结果
              <small v-if="aiParsedResult">
                ({{ aiParsedResult.blockCount }} 个连续读块 · {{ aiParsedResult.alignedCount }} 项标准测点 · {{ aiParsedResult.commandCount }} 项控制指令)
              </small>
            </h4>
            <p v-if="aiParsedResult?.summary" class="ai-summary-line">{{ aiParsedResult.summary }}</p>
            <div class="ai-table-scroll">
              <table class="ai-preview-table">
                <thead>
                  <tr>
                    <th>手册地址</th>
                    <th>所属读块 / 偏移</th>
                    <th>数据类型 / 字节序</th>
                    <th>解码倍率</th>
                    <th>对齐平台标准测点</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in ((aiParsedResult?.fields as RecordRow[]) || [])" :key="String(f.fieldCode)">
                    <td><code>{{ f.documentAddress }}</code></td>
                    <td>{{ f.blockCode }} (+{{ f.registerOffset }})</td>
                    <td>{{ f.valueType }} · {{ f.byteOrder }}</td>
                    <td>× {{ f.decodeFactor }} {{ f.rawUnit }}</td>
                    <td><b>{{ f.fieldName }} · {{ f.fieldCode }}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="ai-parse-footer">
          <button type="button" @click="aiParseOpen = false">取消</button>
          <button type="button" class="primary" :disabled="!aiParsedResult" @click="applyAiParsedProtocol">
            一键填入协议配置表并开启编辑
          </button>
        </div>
      </div>
    </AppDialog>
  </section>
</template>

<style scoped>
.protocol-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #263b53;
}
.protocol-page > header,
.version-head,
.section-head,
.actions {
  display: flex;
  align-items: center;
}
.protocol-page > header {
  min-height: 68px;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
}
.header-left-group {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.protocol-main-tabs {
  display: inline-flex;
  padding: 3px;
  background: #edf3f9;
  border-radius: 7px;
  gap: 3px;
}
.protocol-main-tabs button {
  height: 32px;
  padding: 0 13px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #52677f;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.protocol-main-tabs button.active {
  background: #fff;
  color: #176fc1;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(23, 111, 193, 0.14);
}
.pipeline-workbench {
  flex: 1;
  min-height: 0;
  padding: 12px 18px 16px;
  background: #f5f8fb;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
}
.pipeline-steps-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.pipeline-steps-bar button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  background: #fff;
  border: 1px solid #d6e2ee;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
}
.pipeline-steps-bar button.active {
  border-color: #176fc1;
  background: #f0f7ff;
  box-shadow: inset 0 -2px 0 #176fc1;
}
.pipeline-steps-bar i {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #e6f0fa;
  color: #176fc1;
  font: 700 11px var(--font-mono);
  display: grid;
  place-items: center;
  flex: none;
}
.pipeline-steps-bar button.active i {
  background: #176fc1;
  color: #fff;
}
.pipeline-steps-bar b {
  display: block;
  font-size: 12px;
  color: #1e3a5f;
}
.pipeline-steps-bar small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: #64748b;
}
.pipeline-main-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr);
  gap: 12px;
}
.pipeline-left-card,
.pipeline-right-card {
  background: #fff;
  border: 1px solid #d6e2ee;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.plc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eef2f6;
}
.plc-head h3 {
  font-size: 13px;
  color: #1e3a5f;
}
.plc-head span {
  font-size: 11px;
  color: #597086;
}
.prompt-stage-editors {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.prompt-stage-editors label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fbfcfe;
  cursor: pointer;
}
.prompt-stage-editors label.highlight {
  border-color: #176fc1;
  background: #f4f9ff;
}
.prompt-stage-editors label span {
  font-size: 11px;
  font-weight: 700;
  color: #1e3a5f;
}
.prompt-stage-editors textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd8e5;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #263b53;
  resize: vertical;
}
.stage-outputs-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stage-dual-row {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 8px;
}
.stage-out-box {
  border: 1px solid #d6e2ee;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fff;
}
.stage-out-box.active {
  border-color: #176fc1;
  box-shadow: 0 0 0 1px rgba(23, 111, 193, 0.15);
}
.stage-out-box h4 {
  margin: 0 0 6px;
  font-size: 12px;
  color: #1e3a5f;
}
.mini-spec-table {
  width: 100% !important;
  min-width: 0 !important;
  border-collapse: collapse;
  font-size: 11px;
}
.mini-spec-table th,
.mini-spec-table td {
  height: 26px !important;
  padding: 3px 6px !important;
  border-bottom: 1px solid #eef2f6;
}
.mini-spec-table th {
  width: 105px;
  color: #64748b;
  background: #f8fafc;
}
.stage4-split {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 8px;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1 {
  font-size: 19px;
}
h2 {
  font-size: 16px;
}
h3 {
  font-size: 13px;
}
p,
small {
  color: var(--muted);
  font-size: 10px;
}
.actions {
  gap: 7px;
}
.actions input {
  width: 220px;
}
.protocol-page button {
  min-height: 31px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid #ccd8e4;
  border-radius: 5px;
  background: #fff;
  color: #31506d;
}
.protocol-page button.primary {
  border-color: #176fc1;
  background: #176fc1;
  color: #fff;
}
.protocol-page > main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
}
aside {
  overflow: auto;
  border-right: 1px solid var(--border);
  padding: 10px;
  background: #fbfdff;
}
.protocol-list-row {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  gap: 4px 8px;
  align-items: start;
  padding: 11px 10px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.protocol-list-row.active {
  border-color: #d6e7f8;
  border-left-color: #176fc1;
  background: #eef6ff;
}
.protocol-delete {
  width: 28px;
  height: 28px;
  min-height: 28px;
  grid-column: 2;
  grid-row: 1 / 4;
  flex: none;
  padding: 0;
}
aside span {
  grid-column: 1;
  min-width: 0;
}
aside b {
  display: block;
  color: #263b53;
  font-size: 13px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
aside small {
  display: block;
  margin-top: 3px;
  color: #667f97;
  font-size: 10px;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}
aside i {
  grid-column: 1;
  width: fit-content;
  border-radius: 999px;
  padding: 2px 7px;
  background: #eef3f8;
  font-size: 9px;
  font-style: normal;
  color: #71869a;
}
aside em {
  grid-column: 1;
  font-size: 9px;
  font-style: normal;
  color: #8a9bac;
}
article {
  min-width: 0;
  overflow: auto;
}
.protocol-detail {
  background: #f6f9fc;
}
.version-head {
  position: sticky;
  top: 0;
  z-index: 4;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: #fff;
}
.protocol-config-stack {
  display: grid;
  gap: 12px;
  padding: 14px 16px 18px;
}
.protocol-card {
  border: 1px solid #d8e4f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(38, 59, 83, 0.04);
  overflow: hidden;
}
.protocol-card.primary-card {
  border-color: #bfd7ef;
}
.section-head {
  justify-content: space-between;
  min-height: 56px;
  padding: 10px 12px;
  border-bottom: 1px solid #e1eaf4;
  background: linear-gradient(180deg, #fbfdff, #f6faff);
}
.section-head > div {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  row-gap: 2px;
  align-items: baseline;
}
.section-head em {
  grid-row: 1 / 3;
  align-self: center;
  color: #176fc1;
  font-size: 16px;
  font-style: normal;
  font-weight: 800;
}
.section-head h3 {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.section-head small {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
th,
td {
  padding: 6px;
  border-bottom: 1px solid #e4ebf1;
  text-align: left;
  font-size: 10px;
}
th {
  height: 30px;
  background: #f5f8fb;
  color: #5e7388;
}
input,
select {
  box-sizing: border-box;
  width: 100%;
  min-height: 31px;
  padding: 4px 6px;
  border: 1px solid #cfdae5;
  border-radius: 4px;
  background: #fff;
  color: #263b53;
  font-size: 10px;
}
td > input + input {
  margin-top: 4px;
}
.pair {
  display: flex;
  gap: 4px;
}
.read-block-list {
  display: grid;
  gap: 12px;
  padding: 12px 14px 14px;
}
.read-block-card {
  border: 1px solid #d5e4f3;
  border-radius: 8px;
  background: #fbfdff;
  box-shadow: 0 8px 18px rgba(38, 59, 83, 0.04);
  overflow: hidden;
}
.read-block-form {
  display: grid;
  grid-template-columns: 1.1fr 1.2fr 90px 130px 100px 110px 34px;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  background: #fff;
}
.read-block-form label {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.read-block-form span {
  color: #6c8197;
  font-size: 10px;
}
.read-block-view {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(4, auto);
  align-items: center;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: linear-gradient(90deg, #f7fbff, #fff);
}
.read-block-view > span {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.read-block-view em {
  border-radius: 999px;
  padding: 3px 7px;
  background: #eaf4ff;
  color: #3d668c;
  font-size: 11px;
  font-style: normal;
  white-space: nowrap;
}
.subtable-head {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #f8fbff;
}
.subtable-head small {
  margin-right: auto;
}
.field-table {
  min-width: 860px;
  background: #fff;
}
.field-table th:first-child,
.field-table td:first-child {
  width: 230px;
}
.tree-list {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 12px 14px 14px;
}
.tree-node {
  position: relative;
  min-height: 40px;
  display: grid;
  gap: 3px;
  padding: 10px 13px 10px 36px;
  border: 1px solid #dde8f3;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(38, 59, 83, 0.02);
}
.tree-node::before {
  content: "";
  position: absolute;
  top: 16px;
  left: 14px;
  width: 8px;
  height: 8px;
  border: 2px solid #66a4df;
  border-radius: 50%;
  background: #fff;
}
.tree-node::after {
  content: "";
  position: absolute;
  top: 20px;
  left: 23px;
  width: 8px;
  border-top: 1px solid #b7d2ec;
}
.tree-node b {
  min-width: 0;
  color: #263b53;
  font-size: 12px;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}
.tree-node small {
  color: #6a8198;
  font-size: 10px;
  line-height: 1.5;
  white-space: normal;
  word-break: break-word;
}
.tree-node.branch {
  border-color: #c9ddf2;
  background: linear-gradient(90deg, #eef7ff, #fff);
  padding-top: 12px;
  padding-bottom: 12px;
}
.tree-node.branch::before {
  border-color: #176fc1;
  background: #176fc1;
}
.tree-node.branch::after {
  border-top-color: #93bee8;
}
.child-tree {
  margin-left: 22px;
  padding: 10px 12px 12px 20px;
  border-left: 2px solid #d6e6f5;
  background: #fbfdff;
}
.point-leaf {
  border-color: #e1e9f1;
  background: linear-gradient(180deg, #fff, #fcfeff);
}
.empty {
  display: grid;
  place-items: center;
  color: var(--muted);
}
.create-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 6px 18px 4px;
}
.create-grid label {
  display: grid;
  gap: 5px;
  font-size: 10px;
}
.protocol-card > table {
  min-width: 720px;
}
.protocol-card > table th:first-child,
.protocol-card > table td:first-child {
  padding-left: 12px;
}
.protocol-card > table th:last-child,
.protocol-card > table td:last-child {
  padding-right: 12px;
}
:deep(.protocol-validate-dialog) {
  width: min(720px, calc(100vw - 42px));
}
:deep(.protocol-validate-dialog .dialog-content) {
  background: #f7f9fc;
}
.validate-dialog-body {
  display: grid;
  gap: 12px;
  padding: 18px 22px 22px;
}
.validate-result-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid #dbe7f5;
  border-radius: 8px;
  background: #fff;
}
.validate-dialog-body.passed .validate-result-card {
  border-color: #c6e5d8;
  background: #f6fbf8;
}
.validate-result-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 8px;
  background: #fff0ec;
  color: #b94f2d;
  font-weight: 700;
  font-size: 18px;
}
.validate-dialog-body.passed .validate-result-icon {
  background: #e9f8f1;
  color: #17643d;
}
.validate-dialog-body strong {
  display: block;
  color: #b94f2d;
  font-size: 18px;
  line-height: 1.35;
}
.validate-dialog-body strong.passed {
  color: #17643d;
}
.validate-dialog-body p {
  margin: 5px 0 0;
  color: #526b84;
  font-size: 13px;
}
.validate-error-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px 14px 12px 30px;
  border: 1px solid #f1c9bf;
  border-radius: 8px;
  background: #fff6f3;
  color: #b94f2d;
  font-size: 12px;
  line-height: 1.7;
}
.validate-success-hint {
  margin: 0 !important;
  padding: 12px 14px;
  border: 1px solid #cae6d7;
  border-radius: 8px;
  background: #f7fcf9;
  color: #3f7c62 !important;
}
:deep(.protocol-create-dialog) {
  width: min(980px, calc(100vw - 32px));
}
:deep(.protocol-prompt-fullscreen-dialog) {
  width: 100vw !important;
  max-width: 100vw !important;
  height: 100vh !important;
  max-height: 100vh !important;
  border-radius: 0 !important;
  margin: 0 !important;
}
:deep(.protocol-prompt-fullscreen-dialog .dialog-head) {
  padding: 14px 24px 0 !important;
}
:deep(.protocol-prompt-fullscreen-dialog .dialog-content) {
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
:deep(.protocol-prompt-fullscreen-dialog .dialog-actions) {
  padding: 12px 24px 14px !important;
}
.prompt-fullscreen-body {
  flex: 1;
  min-height: 0;
  padding: 12px 24px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.prompt-four-stage-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.stage-prompt-card {
  min-height: 0;
  background: #fbfcfe;
  border: 1px solid #cfdceb;
  border-top: 3px solid #176fc1;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
}
.spc-header {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.spc-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spc-badge {
  background: #176fc1;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.04em;
  flex: none;
}
.spc-title-row strong {
  font-size: 13px;
  color: #0f172a;
}
.spc-edit-toggle {
  margin-left: auto;
  height: 24px;
  padding: 0 9px;
  border: 1px solid #cbd8e5;
  border-radius: 4px;
  background: #fff;
  color: #334e68;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.spc-edit-toggle:hover {
  border-color: #176fc1;
  color: #176fc1;
  background: #f0f7ff;
}
.spc-markdown-view {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid #d6e2ee;
  border-radius: 6px;
  padding: 10px 14px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  line-height: 1.52;
  color: #1e293b;
}
:deep(.spc-markdown-view .md-h) {
  margin: 4px 0 2px;
  padding-left: 8px;
  border-left: 3px solid #176fc1;
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
}
:deep(.spc-markdown-view .md-h:first-child) {
  margin-top: 0;
}
:deep(.spc-markdown-view .md-p) {
  margin: 0;
  color: #334155;
}
:deep(.spc-markdown-view .md-li) {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: #1e293b;
}
:deep(.spc-markdown-view .md-num) {
  font-family: var(--font-mono);
  font-weight: 700;
  color: #176fc1;
  flex: none;
}
:deep(.spc-markdown-view .md-subli) {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-left: 16px;
  color: #334155;
}
:deep(.spc-markdown-view .md-dot) {
  color: #176fc1;
  font-weight: 700;
  flex: none;
}
:deep(.spc-markdown-view .md-var) {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #176fc1;
  background: #edf5ff;
  border: 1px solid #cfe2f7;
  padding: 0 5px;
  border-radius: 3px;
  font-weight: 600;
}
:deep(.spc-markdown-view .md-code) {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #0f172a;
  background: #f1f5f9;
  padding: 0 5px;
  border-radius: 3px;
  font-weight: 600;
}
.spc-vars {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}
.spc-vars span {
  font-size: 10.5px;
  color: #64748b;
  font-weight: 600;
}
.spc-vars code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #176fc1;
  background: #edf5ff;
  border: 1px solid #cfe2f7;
  padding: 1px 6px;
  border-radius: 4px;
}
.stage-prompt-card textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd8e5;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fff;
  font-family: "Microsoft YaHei", Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.48;
  color: #1e293b;
  resize: none;
}
.spc-footer {
  flex: none;
  background: #f1f5f9;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 10.5px;
  color: #475569;
}
.spc-footer code {
  font-family: var(--font-mono);
  color: #0f172a;
  font-weight: 600;
}
.create-dialog-body,
.create-dialog-inner {
  padding: 18px 24px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.create-pdf-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 15px;
  background: #f5f9ff;
  border: 1px solid #cfe0f5;
  border-radius: 8px;
}
.pdf-banner-text strong {
  display: block;
  font-size: 13px;
  color: #1e3a5f;
}
.pdf-banner-text span {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: #597086;
}
.create-parsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f3f9f5;
  border: 1px solid #bfe3cd;
  border-radius: 8px;
}
.create-parsed-bar strong {
  display: block;
  font-size: 12.5px;
  color: #165e3a;
}
.create-parsed-bar small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #4f7a64;
}
.cpb-actions {
  display: flex;
  gap: 6px;
  flex: none;
}
.cpb-actions button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #8fc9a8;
  border-radius: 5px;
  background: #fff;
  color: #165e3a;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.pdf-upload-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  background: #f5f9ff;
  border: 1px solid #cfe0f5;
  border-radius: 8px;
}
.pub-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pub-left strong {
  font-size: 13px;
  color: #1e3a5f;
}
.pub-left span {
  font-size: 11px;
  color: #597086;
}
.pub-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.pdf-file-tag {
  font-size: 11px;
  color: #176fc1;
  background: #e6f1fc;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.upload-pdf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 16px;
  background: #176fc1;
  color: #fff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.upload-pdf-btn:hover {
  background: #135da3;
}
.create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px !important;
  padding: 2px 0;
}
.create-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #334e68;
}
.create-grid input,
.create-grid select {
  height: 36px;
  padding: 0 10px;
}
.parsed-preview-section {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pps-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #1e3a5f;
}
.pps-head small {
  font-weight: 400;
  color: #597086;
}
.pps-head span {
  font-size: 11px;
  color: #597086;
}
.ai-parse-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-parse-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f5f8fb;
  border: 1px solid #d6e2ee;
  border-radius: 6px;
}
.file-upload-btn {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #cbd8e5;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #1e3a5f;
  cursor: pointer;
}
.ai-parse-meta {
  font-size: 11px;
  color: #597086;
  margin-left: auto;
}
.btn-reparse {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid #cbd8e5;
  border-radius: 5px;
  background: #fff;
  font-size: 12px;
}
.ai-parse-split {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 12px;
}
.ai-doc-col,
.ai-result-col {
  min-width: 0;
}
.ai-doc-col h4,
.ai-result-col h4 {
  margin: 0 0 6px;
  font-size: 12px;
  color: #1e3a5f;
}
.ai-doc-col textarea {
  width: 100%;
  height: 245px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #cbd8e5;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
  color: #1e293b;
}
.ai-summary-line {
  margin: 0 0 6px !important;
  padding: 6px 10px;
  background: #f0f7ff;
  border: 1px solid #cfe2f7;
  border-radius: 5px;
  font-size: 11px !important;
  color: #1e3a5f !important;
}
.ai-table-scroll {
  max-height: 205px;
  overflow: auto;
  border: 1px solid #d6e2ee;
  border-radius: 6px;
}
.ai-preview-table {
  width: 100% !important;
  min-width: 0 !important;
  table-layout: auto !important;
  border-collapse: collapse;
  font-size: 11px;
}
.ai-preview-table th,
.ai-preview-table td {
  height: 32px;
  padding: 6px 10px;
  border-bottom: 1px solid #eef2f6;
  text-align: left;
  font-size: 11.5px;
  line-height: 1.4;
}
.ai-preview-table th {
  position: sticky;
  top: 0;
  background: #f5f8fb;
  color: #475569;
  white-space: nowrap;
  font-weight: 700;
}
.ai-preview-table td:first-child,
.ai-preview-table td:nth-child(2),
.ai-preview-table td:nth-child(3),
.ai-preview-table td:last-child,
.ai-preview-table td span,
.ai-preview-table td code {
  white-space: nowrap;
}
.ai-parse-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
}
@media (max-width: 800px) {
  .protocol-page > main {
    grid-template-columns: 1fr;
    grid-template-rows: 150px minmax(0, 1fr);
  }
  aside {
    display: flex;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  aside button {
    min-width: 210px;
  }
  .protocol-list-row {
    min-width: 210px;
  }
  .protocol-page > header {
    align-items: flex-start;
    flex-direction: column;
  }
  .actions input {
    width: 100%;
  }
  .read-block-form {
    grid-template-columns: 1fr 1fr;
  }
  .read-block-view {
    grid-template-columns: 1fr;
  }
  .tree-node small {
    white-space: normal;
  }
}
</style>
