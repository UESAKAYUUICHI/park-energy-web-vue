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

let dismissTimer: ReturnType<typeof window.setTimeout> | undefined

export function showAppAlert(payload: AlertPayload) {
  if (dismissTimer) window.clearTimeout(dismissTimer)
  appAlertState.title = payload.title || (payload.type === 'warning' ? '操作提醒' : payload.type === 'info' ? '系统提示' : payload.type === 'success' ? '操作成功' : '请求失败')
  appAlertState.message = payload.message
  appAlertState.type = payload.type || 'error'
  appAlertState.open = true
  dismissTimer = window.setTimeout(() => closeAppAlert(), payload.type === 'error' ? 6500 : 4200)
}

export function closeAppAlert() {
  if (dismissTimer) window.clearTimeout(dismissTimer)
  dismissTimer = undefined
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
    },
  }))
}
