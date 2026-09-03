import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

export interface BusinessWorkbenchTab {
  key: string
  label: string
  description: string
  permission?: string
}

export function useBusinessWorkbench(tabs: BusinessWorkbenchTab[], defaultView: string) {
  const route = useRoute()
  const router = useRouter()
  const session = useSessionStore()
  const visibleTabs = computed(() => tabs.filter((tab) => session.can(tab.permission)))
  const activeView = computed(() => {
    const requested = String(route.query.view || defaultView)
    return visibleTabs.value.some((tab) => tab.key === requested)
      ? requested
      : visibleTabs.value[0]?.key || defaultView
  })

  watchEffect(() => {
    const requested = String(route.query.view || '')
    if (requested !== activeView.value) {
      void router.replace({ query: { ...route.query, view: activeView.value } })
    }
  })

  function switchView(view: string) {
    if (view === activeView.value) return
    void router.replace({ query: { ...route.query, view } })
  }

  return { activeView, visibleTabs, switchView }
}
