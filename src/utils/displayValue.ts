import type { RecordRow } from '@/types/domain'

type LabelMap = Record<string, string>

const normalizeKey = (key: string) => key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
const normalizeValue = (value: unknown) => String(value ?? '').trim().toUpperCase()

const yesNo: LabelMap = { '1': '是', '0': '否', TRUE: '是', FALSE: '否' }
const enabled: LabelMap = { '1': '启用', '0': '停用', TRUE: '启用', FALSE: '停用', ENABLED: '启用', DISABLED: '停用' }
const status: LabelMap = {
  ...enabled,
  ACTIVE: '启用',
  INACTIVE: '停用',
  NORMAL: '正常',
  ONLINE: '在线',
  OFFLINE: '离线',
  UNKNOWN: '未知',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  PENDING: '待处理',
  PROCESSING: '处理中',
  RUNNING: '执行中',
  SUCCESS: '成功',
  FAILED: '失败',
  ERROR: '异常',
  CANCELLED: '已取消',
  CLOSED: '已关闭',
}

const maps: Record<string, LabelMap> = {
  online_status: { '1': '在线', '0': '离线', ONLINE: '在线', OFFLINE: '离线', UNKNOWN: '未知' },
  status,
  enabled,
  billable: yesNo,
  stat_enabled: enabled,
  required: yesNo,
  allow_override: yesNo,
  settlement_enabled: enabled,
  all_points: yesNo,

  event_status: { NEW: '新告警', ACKNOWLEDGED: '已确认', IN_PROGRESS: '处理中', RECOVERED: '已恢复', CLOSED: '已关闭', FALSE_POSITIVE: '误报', SUPPRESSED: '已抑制' },
  condition_status: { ACTIVE: '异常中', CLEARED: '已恢复' },
  alarm_source: { PLATFORM: '平台', GATEWAY: '网关', DATA: '数据服务' },
  alarm_value: { GATEWAY_OFFLINE: '网关离线', DEVICE_OFFLINE: '设备离线', POINT_MISSING: '测点缺失' },
  alarm_type: { '1': '过压', '2': '欠压', '3': '过流', '4': '设备离线', '5': '数据异常' },
  alarm_level: { '1': '一般', '2': '重要', '3': '紧急' },
  rule_scope: { '1': '全局', '2': '组织', '3': '设备', '4': '空间' },
  lifecycle_status: { DRAFT: '草稿', PUBLISHED: '已发布', DISABLED: '已停用' },
  protocol_status: { DRAFT: '草稿', PUBLISHED: '已发布', ACTIVE: '已发布', DISABLED: '已停用' },
  evaluation_mode: { THRESHOLD: '即时阈值', N_OF_M: 'N 次命中', WINDOW_AVG: '窗口平均', RATE_OF_CHANGE: '变化率', MISSING_DATA: '测点数据缺失', OFFLINE: '设备离线' },
  compare_operator: { '>': '大于', '>=': '大于等于', '<': '小于', '<=': '小于等于', '=': '等于', BETWEEN: '区间' },

  command_type: { BREAKER_CLOSE: '合闸', BREAKER_OPEN: '分闸', READ_NOW: '立即读取', SYNC_CONFIG: '同步配置', REBOOT: '重启' },
  action_type: { ACKNOWLEDGE: '确认', START_PROCESS: '开始处理', CLOSE: '关闭', RECOVER: '恢复', FALSE_POSITIVE: '标记误报', SUPPRESS: '抑制', REOPEN: '重新打开', CREATE_WORK_ORDER: '创建工单' },
  source_type: { ALARM: '告警', INSPECTION: '巡检', MANUAL: '人工', SYSTEM: '系统', DEVICE: '设备', GATEWAY: '网关' },
  cloud_status: { PENDING: '待上报', SENT: '已上报', ACKED: '已确认', FAILED: '失败' },

  protocol_type: { JSON: 'JSON', MODBUS: 'Modbus', MODBUS_RTU: 'Modbus RTU', MODBUS_TCP: 'Modbus TCP' },
  transport_type: { MODBUS_RTU: 'Modbus RTU', MODBUS_TCP: 'Modbus TCP', TCP: 'TCP', MQTT: 'MQTT', HTTP: 'HTTP' },
  function_code: { '1': '读线圈', '2': '读离散输入', '3': '读保持寄存器', '4': '读输入寄存器', '5': '写单线圈', '6': '写单寄存器', '15': '写多线圈', '16': '写多寄存器' },
  data_type: { DOUBLE: '小数', DECIMAL: '小数', FLOAT: '浮点数', NUMBER: '数字', INTEGER: '整数', INT: '整数', LONG: '长整数', STRING: '文本', BOOLEAN: '布尔值', UINT16: '无符号16位', INT16: '有符号16位', UINT32: '无符号32位', INT32: '有符号32位' },
  value_type: { DOUBLE: '小数', FLOAT32: '32位浮点', UINT16: '无符号16位', INT16: '有符号16位', UINT32: '无符号32位', INT32: '有符号32位', BOOL: '布尔值' },
  value_mode: { FIXED: '固定值', REALTIME: '实时测点' },
  business_role: { TOTAL_ACCUMULATED: '累计总量', INSTANT: '瞬时值', INSTANT_VALUE: '瞬时值', DEMAND: '需量', STATUS: '状态', OTHER: '其他' },
  usage_type: { SPEC: '规格属性', CONFIG: '配置属性', LIMIT: '阈值限制' },

  tenant_type: { ENTERPRISE: '企业', INDIVIDUAL: '个人' },
  contract_status: { DRAFT: '草稿', ACTIVE: '生效中', TERMINATED: '已终止', EXPIRED: '已到期', PENDING: '待生效' },
  billing_cycle: { MONTHLY: '月度', DAILY: '日度' },
  price_mode: { UNIT_PRICE: '单价计费', FIXED: '固定金额', TIERED: '阶梯计价', TIME_PERIOD: '分时计价' },
  bill_status: { DRAFT: '草稿', REVIEWING: '审核中', REVIEWED: '已审核', ISSUED: '已发布', VOIDED: '已作废', PENDING: '待处理', PAID: '已缴清', PARTIAL: '部分缴费', OVERDUE: '已逾期' },
  payment_status: { PENDING: '待支付', PAID: '已支付', PARTIAL: '部分支付', OVERDUE: '逾期', VOIDED: '已作废' },
  finance_status: { OPEN: '开放', CLOSED: '已关账', DRAFT: '待对账', RECONCILED: '已完成' },
  channel: { OFFLINE: '线下', BANK: '银行', WECHAT: '微信', ALIPAY: '支付宝' },
  space_type: { CAMPUS: '园区', BUILDING: '楼栋', FLOOR: '楼层', ROOM: '房间', AREA: '区域' },
  space_status: { VACANT: '空置', OCCUPIED: '已占用', RESERVED: '已预留', DISABLED: '停用' },
  meter_role: { MAIN: '总表', SUB: '分表', CHECK: '校核表' },
  energy_carrier: { ELECTRICITY: '电力', WATER: '水', GAS: '燃气', HEAT: '热力' },
}

const keyAliases: Record<string, string> = {
  protocol_status: 'lifecycle_status',
  version_status: 'lifecycle_status',
  parse_status: 'status',
  discovery_status: 'status',
  deal_status: 'enabled',
}

export function displayValue(key: string, value: unknown, row?: RecordRow): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  const normalizedKey = keyAliases[normalizeKey(key)] || normalizeKey(key)
  const raw = String(value)
  const normalizedValue = normalizeValue(value)
  const direct = maps[normalizedKey]?.[raw] || maps[normalizedKey]?.[normalizedValue]
  if (direct) return direct
  if (normalizedKey === 'status' && row) {
    const source = normalizeValue(row.alarm_source || row.source_type || row.resource_type)
    if (source === 'ALARM' && maps.event_status?.[normalizedValue]) return maps.event_status[normalizedValue]
  }
  return raw
}
