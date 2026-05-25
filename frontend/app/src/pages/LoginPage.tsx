import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/components/AuthProvider"
import { API } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

declare global {
  interface Window {
    onTelegramAuth: (user: any) => void
  }
}

const BOT_NAME = import.meta.env.VITE_TELEGRAM_BOT_NAME || "shumkinscalebot"

export function LoginPage() {
  const { login } = useAuth()
  const [widgetReady, setWidgetReady] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Init global callback BEFORE script loads
    window.onTelegramAuth = (user) => {
      if (!user || !user.hash) {
        console.error("[Login] Telegram auth failed: no hash in response", user)
        return
      }
      fetch(`${API}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Auth failed: ${r.status}`)
          return r.json()
        })
        .then((data) => {
          login(data.token, {
            id: data.user_id,
            name: user.first_name || user.username || "User",
          })
        })
        .catch((err) => console.error("[Login] error:", err))
    }

    // Create Telegram Login Widget script
    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.setAttribute("data-telegram-login", BOT_NAME)
    script.setAttribute("data-size", "large")
    script.setAttribute("data-radius", "8")
    script.setAttribute("data-onauth", "onTelegramAuth(user)")
    script.setAttribute("data-request-access", "write")
    script.async = true
    script.onload = () => setWidgetReady(true)
    script.onerror = () => console.error("[Login] Telegram widget script failed to load")

    const target = document.getElementById("telegram-widget-container")
    if (target) {
      target.innerHTML = "" // clear any stale content
      target.appendChild(script)
    }

    return () => {
      delete window.onTelegramAuth
    }
  }, [login])

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-zinc-800">
            <span className="text-xl font-bold text-white tracking-tight">OS</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Personal OS CRM
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5">
              Войди через Telegram
            </p>
          </div>
        </div>

        {/* Widget container — skeleton until ready */}
        <div className="w-full flex justify-center min-h-[52px] items-center">
          {!widgetReady && (
            <Skeleton className="h-[52px] w-[252px] rounded-lg bg-zinc-900" />
          )}
          <div
            id="telegram-widget-container"
            className={widgetReady ? "flex justify-center" : "hidden"}
          />
        </div>

        <p className="text-xs text-zinc-600 text-center max-w-[260px]">
          Используй аккаунт Антона. Домен должен быть привязан в BotFather.
        </p>
      </div>
    </div>
  )
}
