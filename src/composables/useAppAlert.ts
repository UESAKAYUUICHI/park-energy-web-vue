import { customRef, reactive } from 'vue'

type AlertType = 'error' | 'warning' | 'info' | 'success'

interface AlertPayload {
  title?: string
  message: string
  type?: AlertType
}

export const appAlertState = reactive({
  open: false,
  title: '',
  message: '',
  type: 'error' as AlertType,
})

export function showAppAlert(payload: AlertPayload) {
  appAlertState.title = payload.title || (payload.type === 'warning' ? '操作提醒' : payload.type === 'success' ? '操作成功' : '请求失败')
  appAlertState.message = payload.message
  appAlertState.type = payload.type || 'error'
  appAlertState.open = true
}

export function closeAppAlert() {
  appAlertState.open = false
}

export function useAlertRef(title = '请求失败', type: AlertType = 'error') {
  let value = ''
  return customRef<string>((track, trigger) => ({
    get() {
      track()
      return value
    },
    set(next) {
      value = next
      trigger()
      if (next) showAppAlert({ title, message: next, type })
      else closeAppAlert()
    },
  }))
}
