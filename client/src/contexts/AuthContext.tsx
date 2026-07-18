import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getCachedUser, setCachedUser, clearCachedUser, fetchMe, type SessionUser } from '@/lib/auth'
import { flushSyncQueue, setupOnlineListener } from '@/lib/offline'

type LoginResult = { ok: boolean; message?: string; mustChangePassword?: boolean }

type AuthContextType = {
  user: SessionUser | null
  login: (username: string, password: string, rememberMe?: boolean) => Promise<LoginResult>
  logout: () => void
  refresh: () => Promise<void>
  isOnline: boolean
  loading: boolean
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getCachedUser())
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)

  // Bootstrap: verify the cookie with the server on load (source of truth).
  useEffect(() => {
    let alive = true
    fetchMe().then((u) => { if (alive) { setUser(u); setLoading(false) } })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const cleanup = setupOnlineListener(() => {
      setIsOnline(true)
      flushSyncQueue()
    })
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('offline', handleOffline)
    return () => {
      cleanup()
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const login = useCallback(async (username: string, password: string, rememberMe = false) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, message: data.message || 'Login failed' }
      setCachedUser(data.user)
      setUser({ ...data.user })
      return { ok: true, mustChangePassword: !!data.user.mustChangePassword }
    } catch {
      return { ok: false, message: 'Network error' }
    }
  }, [])

  const refresh = useCallback(async () => { setUser(await fetchMe()) }, [])

  const logout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    clearCachedUser()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, refresh, isOnline, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
