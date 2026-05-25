import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, API } from "@/lib/utils"
import { Sparkles, Send, X, Plus, Trash2, MessageSquare, Loader2 } from "lucide-react"
import { useSheetContext } from "@/hooks/use-sheet-context"

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

interface Session {
  id: number
  title: string
  created_at: string
}

interface Message {
  role: "user" | "assistant"
  content: string
}

export function MiraGlobalChat() {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { isClientSheetOpen } = useSheetContext()

  const sheetWidth = isClientSheetOpen ? "calc(64px + 1024px)" : "1.5rem"

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const resp = await authFetch(`${API}/api/mira/sessions`)
      const data = await resp.json()
      setSessions(data.sessions || [])
    } catch {}
  }, [])

  // Create new session
  const newSession = useCallback(async () => {
    try {
      const resp = await authFetch(`${API}/api/mira/chat/session`, { method: "POST" })
      const data = await resp.json()
      setSessionId(data.session_id)
      setMessages([])
      await loadSessions()
      setSessionsOpen(false)
    } catch {}
  }, [loadSessions])

  // Delete session
  const deleteSession = useCallback(async (id: number) => {
    try {
      await authFetch(`${API}/api/mira/sessions/${id}`, { method: "DELETE" })
      if (sessionId === id) {
        setSessionId(null)
        setMessages([])
      }
      await loadSessions()
    } catch {}
  }, [sessionId, loadSessions])

  // Load messages for a session
  const loadMessages = useCallback(async (sid: number) => {
    try {
      const resp = await authFetch(`${API}/api/mira/sessions/${sid}/messages`)
      const data = await resp.json()
      setMessages((data.messages || []).map((m: any) => ({ role: m.role, content: m.content })))
      setSessionId(sid)
      setSessionsOpen(false)
    } catch {}
  }, [])

  // Open chat panel
  useEffect(() => {
    if (open) {
      loadSessions()
    }
  }, [open, loadSessions])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    if (!prompt.trim() || loading) return
    const text = prompt.trim()
    setPrompt("")

    // Auto-create session if needed
    let sid = sessionId
    if (!sid) {
      try {
        const resp = await authFetch(`${API}/api/mira/chat/session`, { method: "POST" })
        const data = await resp.json()
        sid = data.session_id
        setSessionId(sid)
        loadSessions()
      } catch { return }
    }

    setMessages((prev) => [...prev, { role: "user", content: text }])
    setLoading(true)

    try {
      const resp = await authFetch(`${API}/api/mira/chat/${sid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, context_type: "global" }),
      })
      const data = await resp.json()
      setMessages((prev) => [...prev, { role: "assistant", content: data.response || "Нет ответа" }])
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Ошибка" }])
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-20 z-[999] flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-2xl hover:shadow-purple-500/30 hover:scale-105 transition-all duration-200"
        style={{ right: sheetWidth }}
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      {open && (
        <div className="fixed bottom-32 z-[999] w-96 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col overflow-hidden" style={{ right: sheetWidth, maxHeight: "70vh" }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/50 shrink-0">
            <Sparkles size={14} className="text-purple-400" />
            <span className="text-sm font-medium text-white flex-1">Мира (AI)</span>
            <button onClick={newSession} className="text-zinc-500 hover:text-white transition-colors" title="Новый чат">
              <Plus size={16} />
            </button>
            <button onClick={() => setSessionsOpen(!sessionsOpen)} className="text-zinc-500 hover:text-white transition-colors relative" title="История чатов">
              <MessageSquare size={16} />
              {sessions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500" />
              )}
            </button>
          </div>

          {/* Sessions list */}
          {sessionsOpen && (
            <div className="border-b border-zinc-800 max-h-40 overflow-y-auto bg-zinc-900/30">
              {sessions.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-3">Нет чатов</p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-zinc-800 text-xs",
                    sessionId === s.id && "bg-zinc-800"
                  )}
                >
                  <span className="flex-1 truncate text-zinc-300" onClick={() => loadMessages(s.id)}>
                    {s.title}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                    className="text-zinc-600 hover:text-red-400 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-zinc-600">Новый чат. Задай вопрос.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-purple-600 text-white rounded-br-md"
                      : "bg-zinc-800 text-zinc-200 rounded-bl-md"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 size={14} className="animate-spin text-purple-400" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-800 px-4 py-3 shrink-0">
            <div className="flex gap-2">
              <Input
                placeholder="Задай вопрос..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="h-9 text-sm bg-zinc-900 border-zinc-800 flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              />
              <Button size="sm" onClick={sendMessage} disabled={!prompt.trim() || loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
