import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { API } from "@/lib/utils"

interface AuthContextType {
  token: string | null
  user: { id: number; name: string } | null
  isLoading: boolean
  login: (token: string, user: { id: number; name: string }) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("crm_token"))
  const [user, setUser] = useState<{ id: number; name: string } | null>(() => {
    const raw = localStorage.getItem("crm_user")
    return raw ? JSON.parse(raw) : null
  })

  const login = useCallback((t: string, u: { id: number; name: string }) => {
    setToken(t)
    setUser(u)
    localStorage.setItem("crm_token", t)
    localStorage.setItem("crm_user", JSON.stringify(u))
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setIsLoading(false)
    localStorage.removeItem("crm_token")
    localStorage.removeItem("crm_user")
  }, [])

  // Verify token on mount — пока проверка не завершена, isLoading=true
  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) {
          localStorage.removeItem("crm_token")
          localStorage.removeItem("crm_user")
          setToken(null)
          setUser(null)
        }
      })
      .catch(() => {
        // Network error — оставляем токен, возможно сервер временно недоступен
      })
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
