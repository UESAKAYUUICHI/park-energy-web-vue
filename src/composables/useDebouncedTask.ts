import { onScopeDispose } from 'vue'

export function useDebouncedTask(delay = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let version = 0

  const schedule = (task: () => void | Promise<void>) => {
    const current = ++version
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (current === version) void task()
    }, delay)
  }

  const cancel = () => {
    version += 1
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  onScopeDispose(cancel)
  return { schedule, cancel }
}
