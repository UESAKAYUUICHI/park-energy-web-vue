import { createRouter, createWebHistory } from 'vue-router'
import { routeRecords } from './routes'
import { useSessionStore } from '@/stores/session'

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes: routeRecords })
router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (to.name !== 'login' && !session.initialized) await session.restore()
  if (to.name === 'login') return session.isAuthenticated ? '/dashboard' : true
  if (!session.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  const permission = to.meta.permission as string | undefined
  return session.can(permission) ? true : '/403'
})
export default router
