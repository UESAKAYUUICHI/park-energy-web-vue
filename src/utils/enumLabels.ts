const maps: Record<string, Record<string, string>> = {
  access: { PENDING: '待接入', BOUND: '已绑定', RECEIVED: '已接收', FORWARDED: '已转发', INVALID: '无效报文', MQ_FAILED: '消息队列失败' },
  online: { ONLINE: '在线', OFFLINE: '离线', UNKNOWN: '未知' },
  billingBatch: { DRAFT: '草稿', RUNNING: '生成中', REVIEWING: '待审核', REVIEWED: '已审核', ISSUED: '已发布', FAILED: '失败' },
  billStatus: { DRAFT: '草稿', REVIEWING: '审核中', REVIEWED: '已审核', ISSUED: '已发布', VOIDED: '已作废', PENDING: '待处理', PAID: '已缴清', PARTIAL: '部分缴费', OVERDUE: '已逾期' },
  adjustmentType: { DISCOUNT: '应收减免', SURCHARGE: '应收补收', WRITE_OFF: '坏账核销' },
  adjustmentStatus: { PENDING: '待审批', APPROVED: '已批准', CANCELLED: '已撤销' },
  meterChangeType: { MANUAL_READING: '人工抄表', REPLACE: '表计更换', RESET: '读数重置', FACTOR_CHANGE: '倍率变更' },
  meterChangeStatus: { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', EXECUTED: '已执行', CANCELLED: '已取消' },
  qualityStatus: { SUCCESS: '成功', INVALID: '无效数据', DEAD_LETTER: '死信隔离', PROCESSING: '处理中', NORMAL: '正常', INCOMPLETE: '不完整', WARNING: '需关注', FAILED: '失败' },
  financeStatus: { OPEN: '开放', CLOSED: '已关账', DRAFT: '待对账', RECONCILED: '已完成' },
  channel: { OFFLINE: '线下', BANK: '银行', WECHAT: '微信', ALIPAY: '支付宝' },
  contractStatus: { DRAFT: '草稿', ACTIVE: '生效中', TERMINATED: '已终止', EXPIRED: '已到期', PENDING: '待生效' },
  collectionType: { NOTICE: '账单通知', PHONE: '电话沟通', EMAIL: '邮件', SMS: '短信', STOP_SERVICE: '停服预警' },
  scopeType: { ORG: '组织', DEVICE: '设备', SPACE: '空间', GATEWAY: '网关' },
  enabled: { '1': '启用', '0': '停用', true: '启用', false: '停用' },
}

export function enumLabel(value: unknown, group: string, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  const raw = String(value)
  return maps[group]?.[raw] || `未知（${raw}）`
}

export const accessLabel = (value: unknown) => enumLabel(value, 'access')
export const onlineLabel = (value: unknown) => enumLabel(value, 'online')
export const billingBatchLabel = (value: unknown) => enumLabel(value, 'billingBatch')
export const billStatusLabel = (value: unknown) => enumLabel(value, 'billStatus')
export const adjustmentTypeLabel = (value: unknown) => enumLabel(value, 'adjustmentType')
export const adjustmentStatusLabel = (value: unknown) => enumLabel(value, 'adjustmentStatus')
export const meterChangeTypeLabel = (value: unknown) => enumLabel(value, 'meterChangeType')
export const meterChangeStatusLabel = (value: unknown) => enumLabel(value, 'meterChangeStatus')
export const qualityStatusLabel = (value: unknown) => enumLabel(value, 'qualityStatus')
export const financeStatusLabel = (value: unknown) => enumLabel(value, 'financeStatus')
export const channelLabel = (value: unknown) => enumLabel(value, 'channel')
export const contractStatusLabel = (value: unknown) => enumLabel(value, 'contractStatus')
export const collectionTypeLabel = (value: unknown) => enumLabel(value, 'collectionType')
export const scopeTypeLabel = (value: unknown) => enumLabel(value, 'scopeType')
export const enabledLabel = (value: unknown) => enumLabel(value, 'enabled')
