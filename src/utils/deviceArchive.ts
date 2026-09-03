import type { RecordRow } from '@/types/domain'

interface DeviceLookupOptions {
  orgs: readonly RecordRow[]
  gateways: readonly RecordRow[]
  deviceTypes: readonly RecordRow[]
}

function indexById(rows: readonly RecordRow[]) {
  return new Map(rows.map((row) => [String(row.id), row]))
}

export function withDeviceLookupLabels(rows: readonly RecordRow[], options: DeviceLookupOptions): RecordRow[] {
  const orgs = indexById(options.orgs)
  const gateways = indexById(options.gateways)
  const deviceTypes = indexById(options.deviceTypes)

  return rows.map((row) => {
    const org = orgs.get(String(row.org_id))
    const gateway = gateways.get(String(row.gateway_id))
    const deviceType = deviceTypes.get(String(row.device_type_id))
    return {
      ...row,
      org_name: org?.org_name ?? row.org_name,
      gateway_name: gateway?.gateway_name ?? row.gateway_name,
      gateway_sn: gateway?.gateway_sn ?? row.gateway_sn,
      type_name: deviceType?.type_name ?? row.type_name,
    }
  })
}
