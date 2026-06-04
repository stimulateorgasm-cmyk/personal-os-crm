import { useState, useRef, useEffect, useMemo, useCallback, Component } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, formatTime, getStatusStyle, cn, displayNick } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { TasksWidget } from "./TasksWidget"
import { DateInput } from "./DateInput"
import { useSheetContext } from "@/hooks/use-sheet-context"
import {
  Loader2, Send, StickyNote, UserPlus, X,
  ShoppingCart, FileText, Phone, AtSign, CalendarDays,
  CircleDot, Sparkles, MessageSquareHeart, MessageCircleReply, Plus,
  Mic, Pencil, Trash2, CheckCircle2, Circle,
  CalendarClock, CreditCard, CalendarCheck, MessageCircle,
  MessageSquare, StickyNote as StickyNoteIcon,
} from "lucide-react"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / 86400000)

  if (diffDays === 0) return "Сегодня"
  if (diffDays === 1) return "Вчера"
  if (diffDays < 7) {
    const days = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]
    return days[d.getDay()]
  }
  return formatDate(dateStr)
}

function buildMiraContext(clientId: number, clientName: string, telegramNick: string | null, items: TimelineItem[]): string {
  const nickPart = telegramNick ? ` (@${telegramNick.replace(/^@+/, "")})` : ""
  const msgs = items.slice(-50).map((m) => {
    const who = m.sender === "client" ? "Клиент" : m.sender === "personal" ? "Антон" : m.sender === "assistant" ? "Ассистент" : "Система"
    return `[${who}]: ${m.text}`
  }).join("\n")

  return `Клиент: ${clientName}${nickPart}\n\nПереписка:\n${msgs}`
}

// ─── Mira Actions: верхний блок (Саммари + Тональность) ──────────────────────
function MiraTopActions({ clientId, clientName, telegramNick, items }: { clientId: number; clientName: string; telegramNick: string | null; items: TimelineItem[] }) {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const ask = async (promptLabel: string, systemPrompt: string) => {
    setLoading(promptLabel)
    setResponse(null)
    try {
      const context = buildMiraContext(clientId, clientName, telegramNick, items)
      const resp = await authFetch(`${API}/api/mira/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${systemPrompt}\n\n${context}`,
          context_type: "local",
          client_id: clientId,
          context_data: { timeline: items.slice(-50).map((m) => ({ sender: m.sender, text: m.text })) },
        }),
      })
      const data = await resp.json()
      setResponse(data.response || "Нет ответа")
    } catch {
      setResponse("Ошибка соединения")
    }
    setLoading(null)
  }

  const actions = [
    { id: "summary", label: "Саммари", icon: FileText, prompt: "Сделай краткое саммари этой переписки: кто клиент, о чём говорят, какие вопросы решают. Не задавай уточняющих вопросов, просто выдай результат." },
    { id: "tone", label: "Тональность", icon: MessageSquareHeart, prompt: "Определи тональность и настроение клиента в этой переписке. Не задавай уточняющих вопросов, просто выдай результат." },
  ]

  return (
    <div className="px-5 pt-3 pb-2 border-b border-zinc-800/30 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={12} className="text-purple-400" />
        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Мира (AI)</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {actions.map((a) => {
          const Icon = a.icon || Sparkles
          return (
            <button
              key={a.id}
              onClick={() => ask(a.label, a.prompt)}
              disabled={loading !== null}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              {loading === a.label ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />}
              {a.label}
            </button>
          )
        })}
      </div>
      {response && (
        <div className="mt-2 p-3 rounded-lg bg-gradient-to-r from-purple-950/30 to-blue-950/30 border border-purple-900/30 text-xs text-zinc-300 leading-relaxed relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-purple-400 font-medium">Мира</span>
            <button onClick={() => setResponse(null)} className="text-zinc-600 hover:text-zinc-400">
              <X size={12} />
            </button>
          </div>
          {response}
        </div>
      )}
    </div>
  )
}

// ─── Mira Actions: нижняя кнопка (Предложить ответ) ──────────────────────────
function MiraSuggestReply({ clientId, clientName, telegramNick, items, onInsert }: { clientId: number; clientName: string; telegramNick: string | null; items: TimelineItem[]; onInsert: (text: string) => void }) {
  const [loading, setLoading] = useState(false)

  const suggest = async () => {
    setLoading(true)
    try {
      const context = buildMiraContext(clientId, clientName, telegramNick, items)
      const resp = await authFetch(`${API}/api/mira/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Напиши ответ клиенту от имени менеджера, основываясь на этой переписке. Ответь одним сообщением, по-русски, без лишних пояснений.\n\n${context}`,
          context_type: "local",
          client_id: clientId,
          context_data: { timeline: items.slice(-50).map((m) => ({ sender: m.sender, text: m.text })) },
        }),
      })
      const data = await resp.json()
      if (data.response) onInsert(data.response)
    } catch {
      // silent
    }
    setLoading(false)
  }

  return (
    <button
      onClick={suggest}
      disabled={loading}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : <MessageCircleReply size={11} />}
      Предложить ответ
    </button>
  )
}

const STATUSES = ["Контакт","Выдать контент","Квалифицировать","Довести до решения","Проработать","Работа завершена (Архив)"]

const ASSIGNEE_LABELS: Record<string, { label: string; color: string }> = {
  "Личка":        { label: "Антон",    color: "bg-blue-500" },
  "Ассистент":    { label: "Ассистент", color: "bg-purple-500" },
  "Женский тест": { label: "Ассистент", color: "bg-purple-500" },
  "Мужской тест": { label: "Ассистент", color: "bg-purple-500" },
}

function getAssignee(source: string | null | undefined, responsible_person?: string | null) {
  if (responsible_person === "assistant") return { label: "Ассистент", color: "bg-purple-500" }
  if (responsible_person === "personal") return { label: "Антон", color: "bg-blue-500" }
  if (!source) return { label: "Антон", color: "bg-blue-500" }
  return ASSIGNEE_LABELS[source] || { label: "Антон", color: "bg-blue-500" }
}

interface TimelineItem {
  id: number
  type: "note" | "message" | "task"
  sender: "client" | "personal" | "assistant" | "system"
  text: string
  created_at: string
  file_path?: string | null
  mime_type?: string | null
  _taskStatus?: string
  _dueDate?: string
  _taskType?: string
  _description?: string
}

interface ClientSheetProps {
  clientId: number | null
  onClose: () => void
}

// ─── Media renderer ───────────────────────────────────────────────────────────
function MediaContent({ filePath, mimeType }: { filePath?: string | null; mimeType?: string | null }) {
  if (!filePath) return null

  const isAudio = mimeType?.startsWith("audio/") || filePath.match(/\.(ogg|oga|mp3|wav|opus)$/i)
  const isVideo = mimeType?.startsWith("video/") || filePath.match(/\.(mp4|webm|mov|avi)$/i)
  const isVideoNote = isVideo && (mimeType?.includes("video_note") || filePath.includes("video_note"))

  if (isAudio) {
    return (
      <div className="my-1">
        <audio controls className="w-full max-h-10 rounded-md" preload="metadata">
          <source src={filePath} />
        </audio>
      </div>
    )
  }

  if (isVideoNote) {
    return (
      <div className="my-1 flex items-center gap-2">
        <video
          className="w-16 h-16 rounded-full object-cover bg-zinc-900"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        >
          <source src={filePath} />
        </video>
      </div>
    )
  }

  if (isVideo) {
    return (
      <div className="my-1">
        <video controls className="w-full max-w-xs rounded-lg" preload="metadata">
          <source src={filePath} />
        </video>
      </div>
    )
  }

  return null
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────
function safeText(text: string | null | undefined): string {
  if (!text || text.trim() === "") return ""
  return text
}

function safeDate(date: string | null | undefined): string {
  return date || ""
}

function hasMedia(item: TimelineItem): boolean {
  return !!(item as any).file_path
}

function formatTaskDue(iso: string): string {
  if (!iso) return ""
  // iso может быть "2026-05-22 14:00" или "2026-05-22"
  const parts = iso.split(" ")
  const datePart = parts[0]
  const timePart = parts[1]
  const d = new Date(datePart + "T" + (timePart || "12:00") + ":00")
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  const diffMs = d.getTime() - now.getTime()
  const isOverdue = diffMs < 0 && d.toDateString() !== now.toDateString()

  const weekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]
  const timeStr = timePart ? timePart.slice(0, 5) : ""

  if (isOverdue) {
    const abs = Math.abs(diffDays)
    if (abs === 0) return "просрочено сегодня"
    if (abs === 1) return "просрочено вчера"
    return `просрочено на ${abs} дн.`
  }
  if (diffDays === 0) return timeStr ? `до сегодня ${timeStr}` : "до сегодня"
  if (diffDays === 1) return timeStr ? `до завтра ${timeStr}` : "до завтра"
  if (diffDays < 7) return `${weekdays[target.getDay()]} ${target.getDate()}${timeStr ? " " + timeStr : ""}`
  return `${target.getDate()}.${target.getMonth() + 1}${timeStr ? " " + timeStr : ""}`
}

function ChatBubble({ item, onTranscribe, clientId, editingTaskId, setEditingTaskId }: {
  item: TimelineItem; onTranscribe?: (item: TimelineItem) => void; clientId?: number;
  editingTaskId: number | null; setEditingTaskId: (id: number | null) => void
}) {
  try {
    const isNote = item.type === "note"
    const isClient = item.sender === "client"
    const isAnton = item.sender === "personal"
    const isAssistant = item.sender === "assistant"
    const media = hasMedia(item)
    const queryClient = useQueryClient()
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(item.text)

    const deleteNote = useMutation({
      mutationFn: () =>
        authFetch(`${API}/api/clients/${clientId}/notes/${item.id}`, { method: "DELETE" }).then((r) => r.json()),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["timeline", clientId] })
        queryClient.invalidateQueries({ queryKey: ["notes", clientId] })
      },
    })

    const updateNote = useMutation({
      mutationFn: (text: string) =>
        authFetch(`${API}/api/clients/${clientId}/notes/${item.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }).then((r) => r.json()),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["timeline", clientId] })
        queryClient.invalidateQueries({ queryKey: ["notes", clientId] })
        setEditing(false)
      },
    })

    if (isNote) {
      return (
        <div className="flex justify-end my-3 group">
          <div className="max-w-[80%] bg-zinc-850/80 border border-zinc-700/30 rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <StickyNote size={11} className="text-emerald-500/70" />
              <span className="text-[10px] text-emerald-500/70 font-medium tracking-wide">Заметка</span>
              <span className="ml-auto text-[9px] text-zinc-600">
                {safeDate(item.created_at) ? formatTime(item.created_at) : ""}
              </span>
              {/* Edit/Delete buttons */}
              <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(!editing) }}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center touch-manipulation"
                  title="Редактировать"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('Удалить заметку?')) deleteNote.mutate() }}
                  className="text-zinc-500 hover:text-red-400 transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center touch-manipulation"
                  title="Удалить"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full text-sm bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-zinc-300 resize-none min-h-[60px]"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setEditing(false); setEditText(item.text) }}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 px-2 py-1 min-h-[28px] touch-manipulation"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => updateNote.mutate(editText)}
                    disabled={!editText.trim() || updateNote.isPending}
                    className="text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1 min-h-[28px] touch-manipulation"
                  >
                    {updateNote.isPending ? "..." : "Сохранить"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{safeText(item.text)}</p>
            )}
          </div>
        </div>
      )
    }

    // ── Task card ─────────────────────────────────────────────────
    if (item.type === "task") {
      const isDone = item._taskStatus === "completed"
      const isEditing = editingTaskId === item.id
      const TASK_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
        follow_up: { icon: <CalendarClock size={14} />, color: "text-blue-400" },
        session: { icon: <MessageCircle size={14} />, color: "text-violet-400" },
        payment: { icon: <CreditCard size={14} />, color: "text-emerald-400" },
        contract: { icon: <FileText size={14} />, color: "text-cyan-400" },
        schedule: { icon: <CalendarCheck size={14} />, color: "text-purple-400" },
        content: { icon: <FileText size={14} />, color: "text-orange-400" },
        feedback: { icon: <MessageSquare size={14} />, color: "text-rose-400" },
      }
      const taskIcon = TASK_ICONS[item._taskType || "follow_up"] || TASK_ICONS.follow_up
      const dueStr = item._dueDate || ""
      const dueHuman = dueStr ? formatTaskDue(dueStr) : ""

      const toggleTask = () => {
        const newStatus = isDone ? "pending" : "completed"
        authFetch(`${API}/api/tasks/${item.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["tasks", clientId] })
        })
      }

      const saveEdit = (body: Record<string, any>) => {
        // Не отправлять пустую дату на сервер
        if (body.due_date === "") body = { ...body, due_date: "" }
        authFetch(`${API}/api/tasks/${item.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["tasks", clientId] })
        })
      }

      const deleteTask = () => {
        authFetch(`${API}/api/tasks/${item.id}`, { method: "DELETE" }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["tasks", clientId] })
          setEditingTaskId(null)
        })
      }

      return (
        <div className="flex justify-start my-2">
          <div className={cn(
            "max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border",
            isDone
              ? "bg-zinc-900/50 border-zinc-800/30 opacity-60"
              : "bg-zinc-900 border-zinc-700/30"
          )}>
            {isEditing ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                <input
                  defaultValue={item.text}
                  className="w-full h-9 px-2 text-sm rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600"
                  autoFocus
                  onBlur={(e) => {
                    if (e.target.value !== item.text) saveEdit({ title: e.target.value })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingTaskId(null)
                  }}
                />
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { value: "follow_up", label: "Фоллоу-ап" },
                    { value: "session", label: "Сессия" },
                    { value: "payment", label: "Оплата" },
                    { value: "contract", label: "Договор" },
                    { value: "schedule", label: "Запись" },
                    { value: "content", label: "Контент" },
                    { value: "feedback", label: "Обратная связь" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      onClick={() => saveEdit({ type: t.value })}
                      className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors min-h-[28px] touch-manipulation ${
                        (item._taskType || "follow_up") === t.value
                          ? "bg-emerald-600/30 text-emerald-300"
                          : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <DateInput
                    value={item._dueDate || ""}
                    onChange={(iso) => saveEdit({ due_date: iso })}
                    placeholder="ДД.ММ.ГГГГ" className="w-28"
                  />
                  <textarea
                    defaultValue={item._description || ""}
                    placeholder="Комментарий..."
                    rows={2}
                    onBlur={(e) => {
                      if (e.target.value !== (item._description || "")) saveEdit({ description: e.target.value })
                    }}
                    className="flex-1 text-[11px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setEditingTaskId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    Готово
                  </button>
                  <button
                    onClick={deleteTask}
                    className="text-[10px] text-red-500 hover:text-red-400 ml-auto flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Удалить
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <button
                  onClick={toggleTask}
                  className={cn(
                    "shrink-0 mt-0.5 min-h-[28px] min-w-[28px] flex items-center justify-center touch-manipulation transition-colors",
                    isDone ? "text-emerald-500" : "text-zinc-600 hover:text-emerald-400"
                  )}
                >
                  {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={taskIcon.color}>{taskIcon.icon}</span>
                    <span className={cn(
                      "text-sm font-medium cursor-pointer hover:text-blue-400 transition-colors",
                      isDone ? "text-zinc-500 line-through" : "text-zinc-200"
                    )}
                      onClick={() => setEditingTaskId(item.id)}
                    >
                      {safeText(item.text)}
                    </span>
                    <button
                      onClick={() => setEditingTaskId(item.id)}
                      className="ml-auto shrink-0 text-zinc-600 hover:text-zinc-400 min-h-[24px] min-w-[24px] flex items-center justify-center touch-manipulation"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                  {dueHuman && (
                    <p className={cn(
                      "text-[10px] mt-1",
                      dueHuman.startsWith("просрочено") ? "text-red-400" : "text-zinc-500"
                    )}>
                      {dueHuman}
                    </p>
                  )}
                  {item._description && (
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{item._description}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    const bubbleStyle = isClient
      ? "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm"
      : isAnton
      ? "bg-blue-600/90 text-white rounded-2xl rounded-br-sm"
      : "bg-purple-600/80 text-white rounded-2xl rounded-br-sm"

    const senderLabel = isAnton ? "Антон" : isAssistant ? "Ассистент" : ""

    const text = safeText(item.text)
    const mediaComponent = media ? <MediaContent filePath={(item as any).file_path} mimeType={(item as any).mime_type} /> : null

    return (
      <div className={cn("flex my-1.5", isClient ? "justify-start mr-12" : "justify-end ml-12")}>
        <div className={cn("max-w-[78%] px-4 py-2.5 shadow-sm", bubbleStyle)}>
          {senderLabel && (
            <p className={cn(
              "text-[10px] font-medium mb-0.5 tracking-wide",
              isAnton ? "text-blue-200/70" : "text-purple-200/70"
            )}>
              {senderLabel}
            </p>
          )}
          {mediaComponent}
          {text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</p>}
          {!text && !media && <p className="text-sm text-zinc-400 italic">📎 Медиа/стикер</p>}
          <div className="flex items-center justify-between mt-1">
            <p className={cn("text-[9px]", isClient ? "text-zinc-500" : "text-white/40")}>
              {safeDate(item.created_at) ? formatTime(item.created_at) : ""}
            </p>
            {media && onTranscribe && (
              <button
                onClick={(e) => { e.stopPropagation(); onTranscribe(item) }}
                className="text-[9px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
              >
                <Sparkles size={8} />
                Расшифровать
              </button>
            )}
          </div>
        </div>
      </div>
    )
  } catch (e) {
    console.error("ChatBubble render error:", e, item)
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-zinc-600">[ошибка отображения сообщения]</span>
      </div>
    )
  }
}

// ─── Day separator ────────────────────────────────────────────────────────────
function DaySeparator({ dateStr }: { dateStr: string }) {
  return (
    <div className="flex justify-center my-4">
      <span className="text-[11px] text-zinc-400 bg-zinc-900 px-3 py-1 rounded-full">
        {formatDayLabel(dateStr)}
      </span>
    </div>
  )
}

// ─── Messages list with day grouping + scroll-to-top infinite scroll ──────
function MessagesList({ items: rawItems, onTranscribe, emptyText, clientId, editingTaskId, setEditingTaskId, hasMore, onLoadMore, loadingMore }: {
  items: TimelineItem[]
  onTranscribe?: (item: TimelineItem) => void
  emptyText: string
  clientId?: number
  editingTaskId: number | null
  setEditingTaskId: (id: number | null) => void
  hasMore?: boolean
  onLoadMore?: () => void
  loadingMore?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollCounter = useRef(0)

  // Day-separated groups (already in ASC order = newest last)
  const groups = useMemo(() => {
    // Dedup by type+id to avoid collisions between notes and tasks
    const dedupKey = (m: TimelineItem) => `${m.type}-${m.id}`
    const items = Array.from(new Map(rawItems.map((m) => [dedupKey(m), m])).values())
    const result: { date: string; items: TimelineItem[] }[] = []
    let currentDate = ""
    for (const item of items) {
      const d = item.created_at?.slice(0, 10)
      if (d !== currentDate) {
        currentDate = d
        result.push({ date: d, items: [item] })
      } else {
        result[result.length - 1].items.push(item)
      }
    }
    return result
  }, [rawItems])

  // Always scroll to bottom on mount and whenever items change (chat tab switch)
  useEffect(() => {
    if (rawItems.length === 0) return
    scrollCounter.current++
    const el = scrollRef.current
    if (!el) return
    // Используем double requestAnimationFrame чтобы дать DOM обновиться
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    })
  }, [rawItems.length])

  // Load more when scrolling near top
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !onLoadMore || !hasMore || loadingMore) return
    if (el.scrollTop < 150) onLoadMore()
  }, [onLoadMore, hasMore, loadingMore])

  if (rawItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-zinc-600">{emptyText}</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex flex-col px-5 py-4" style={{height: '100%', overflowY: 'auto'}}>
      {loadingMore && (
        <div className="flex justify-center py-2 shrink-0">
          <Loader2 size={16} className="animate-spin text-zinc-500" />
        </div>
      )}
      {hasMore && !loadingMore && (
        <div className="flex justify-center py-1 shrink-0">
          <span className="text-[10px] text-zinc-600">↑ загрузить ещё</span>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.date}>
          <DaySeparator dateStr={g.date} />
          {g.items.map((item) => (
            <ChatBubble key={`${item.type}-${item.id}`} item={item} onTranscribe={onTranscribe} clientId={clientId} editingTaskId={editingTaskId} setEditingTaskId={setEditingTaskId} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Error Boundary for chat tabs ────────────────────────────────────────────
class ChatTabErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error) {
    console.error("[ChatTabError]", error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <p className="text-sm text-red-400 font-mono whitespace-pre-wrap break-all">
              {this.state.error?.message || "Ошибка загрузки чата"}
            </p>
            <p className="text-xs text-zinc-600 mt-2">Проверь консоль (F12) для деталей</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Sheet skeleton ───────────────────────────────────────────────────────────
function SheetSkeleton() {
  return (
    <div className="flex h-full">
      <div className="w-[30%] border-r border-zinc-800 p-5 space-y-4">
        <Skeleton className="h-6 w-28 bg-zinc-800" />
        <Skeleton className="h-9 w-full bg-zinc-800" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full bg-zinc-800/60" />
        ))}
      </div>
      <div className="w-[70%] p-5 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <Skeleton className={cn("h-12 rounded-2xl bg-zinc-800", i % 2 === 0 ? "w-3/5" : "w-2/5")} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Test Result Card ─────────────────────────────────────────────────────────
function TestResultCard({ test }: { test: any }) {
  const isFemale = test.test_type === "female"
  const title = isFemale ? "Шкала Шумкина" : "Мужской тест"
  const dateStr = formatDate(test.created_at)
  const testId = test.id

  const handleOpenTest = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(`/api/quiz/results/${testId}/download`, "_blank")
  }

  return (
    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2.5 cursor-pointer hover:bg-zinc-800/50 transition-colors min-w-0 break-words"
      onClick={handleOpenTest}
      data-test-id={testId}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") handleOpenTest(e) }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <span className="text-[11px] text-zinc-500">{dateStr}</span>
      </div>
      <div className="flex justify-between items-center py-1">
        <span className="text-xs text-zinc-300">Свобода</span>
        <span className="text-xs font-semibold text-white">{test.freedom_score}/40</span>
      </div>
      <div className="flex justify-between items-center py-1">
        <span className="text-xs text-zinc-300">{isFemale ? "Раскрепощённость" : "Сексуальность"}</span>
        <span className="text-xs font-semibold text-white">{test.sexuality_score}/60</span>
      </div>
      {test.diagnosis && (
        <p className="text-xs text-purple-300 leading-relaxed break-words">{test.diagnosis}</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ClientSheet({ clientId, onClose }: ClientSheetProps) {
  const queryClient = useQueryClient()
  const [noteText, setNoteText] = useState("")
  const [rightTab, setRightTab] = useState(() => {
    return clientId !== null
      ? localStorage.getItem(`crm_client_tab_${clientId}`) || "notes"
      : "notes"
  })
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [notesInputMode, setNotesInputMode] = useState<"note" | "task">("note")
  const [taskDue, setTaskDue] = useState("")
  const [taskType, setTaskType] = useState("follow_up")
  const [taskDescription, setTaskDescription] = useState("")
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false)
  const [newDealTitle, setNewDealTitle] = useState("")
  const [newDealAmount, setNewDealAmount] = useState("")
  const [newDealStatus, setNewDealStatus] = useState("Ожидает")
  const [newDealDate, setNewDealDate] = useState("")
  const { setClientSheetOpen } = useSheetContext()

  // Sync sheet open state
  useEffect(() => {
    setClientSheetOpen(!!clientId)
    return () => setClientSheetOpen(false)
  }, [clientId, setClientSheetOpen])

  // Save active tab for reload persistence
  useEffect(() => {
    if (clientId !== null) {
      localStorage.setItem(`crm_client_tab_${clientId}`, rightTab)
    }
  }, [rightTab, clientId])

  // Client data (refetch to pick up changes like responsible_person)
  const { data, isLoading, refetch: refetchClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => authFetch(`${API}/api/clients/${clientId}`).then((r) => r.json()),
    enabled: !!clientId,
    refetchInterval: 15_000,
  })

  // Dynamic polling: live (2s) when card is open, slow (15s) after 30s idle
  const [lastActivity, setLastActivity] = useState<number>(Date.now())
  const [pollInterval, setPollInterval] = useState<number>(2_000)
  const ACTIVITY_TIMEOUT = 30_000
  const touch = useCallback(() => setLastActivity(Date.now()), [])

  useEffect(() => {
    const elapsed = Date.now() - lastActivity
    setPollInterval(elapsed < ACTIVITY_TIMEOUT ? 2_000 : 15_000)
  }, [lastActivity])

  useEffect(() => {
    const id = setInterval(() => {
      setPollInterval((prev) => {
        if (prev === 2_000 && Date.now() - lastActivity >= ACTIVITY_TIMEOUT) return 15_000
        return prev
      })
    }, 5_000)
    return () => clearInterval(id)
  }, [lastActivity])

  // Timeline — separate state per account
  const [chatAccount, setChatAccount] = useState<string>("personal")
  const [items, setItems] = useState<TimelineItem[]>([])
  const [oldestId, setOldestId] = useState<number>(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const { data: timelineData } = useQuery<{ items: TimelineItem[]; oldest_id: number; has_more: boolean }>({
    queryKey: ["timeline", clientId, chatAccount],
    queryFn: () =>
      authFetch(`${API}/api/clients/${clientId}/timeline?account=${chatAccount}&limit=50`).then((r) => r.json()),
    enabled: !!clientId,
    refetchInterval: () => pollInterval,
  })

  // Sync chatAccount with active tab + activate live mode
  useEffect(() => {
    if (rightTab === "personal") { setChatAccount("personal"); touch() }
    else if (rightTab === "assistant") { setChatAccount("assistant"); touch() }
  }, [rightTab, touch])

  // Refetch timeline when switching to a chat tab
  useEffect(() => {
    if (rightTab !== "notes" && clientId) {
      queryClient.invalidateQueries({ queryKey: ["timeline", clientId, chatAccount] })
    }
  }, [rightTab, clientId, chatAccount, queryClient])

  // Refetch on window focus (user comes back to browser)
  useEffect(() => {
    const onFocus = () => {
      if (clientId && rightTab !== "notes") {
        queryClient.invalidateQueries({ queryKey: ["timeline", clientId, chatAccount] })
      }
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [clientId, rightTab, chatAccount, queryClient])

  // Copy data into items state
  useEffect(() => {
    if (!timelineData) return
    setItems(timelineData.items || [])
    setOldestId(timelineData.oldest_id)
    setHasMore(timelineData.has_more)
  }, [timelineData])

  // Load older messages (infinite scroll up)
  const loadMoreMessages = useCallback(async () => {
    if (!oldestId || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await authFetch(
        `${API}/api/clients/${clientId}/timeline?account=${chatAccount}&limit=50&before_id=${oldestId}`
      ).then((r) => r.json())
      if (res.items?.length) {
        const merged = [...res.items, ...items]
        setItems(merged)
        setOldestId(res.oldest_id)
        setHasMore(res.has_more)
      }
    } catch { /* silent */ }
    setLoadingMore(false)
  }, [oldestId, loadingMore, hasMore, clientId, chatAccount])

  // Separate notes query (no limit — fixes "disappearing notes" bug)
  const { data: notesData } = useQuery({
    queryKey: ["notes", clientId],
    queryFn: () =>
      authFetch(`${API}/api/clients/${clientId}/notes`).then((r) => r.json()),
    enabled: !!clientId,
    refetchInterval: 30_000,
  })

  // Tasks query (for merging into notes feed)
  const { data: tasksData } = useQuery({
    queryKey: ["tasks", clientId],
    queryFn: () =>
      authFetch(`${API}/api/clients/${clientId}/tasks`).then((r) => r.json()),
    enabled: !!clientId,
    refetchInterval: 15_000,
  })

  const patchClient = useMutation({
    mutationFn: (body: Record<string, string>) =>
      authFetch(`${API}/api/clients/${clientId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["stats"] })
      refetchClient()
    },
  })

  const sendMessage = useMutation({
    mutationFn: ({ text, sender, send_to_telegram }: { text: string; sender: string; send_to_telegram: boolean }) =>
      authFetch(`${API}/api/clients/${clientId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender, send_to_telegram }),
      }).then((r) => {
        if (!r.ok) throw new Error("send failed")
        return r.json()
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline", clientId] })
      queryClient.invalidateQueries({ queryKey: ["notes", clientId] })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      setNoteText("")
    },
    onError: (err) => {
      console.error("[sendMessage] error:", err)
    },
  })

  // Error boundary for render crashes
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setRenderError(event.message)
    }
    window.addEventListener("error", handler)
    return () => window.removeEventListener("error", handler)
  }, [])

  if (renderError) {
    return (
      <Sheet open={!!clientId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-5xl p-6 bg-zinc-950">
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-lg">
              <p className="text-sm text-red-400 font-mono whitespace-pre-wrap break-all">{renderError}</p>
              <button onClick={() => setRenderError(null)} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">Попробовать снова</button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const c = data?.client
  const assignee = getAssignee(c?.source, c?.responsible_person)
  // All timeline items — from items state

  // Notes + Tasks merged feed (for the "Заметки" tab)
  const notesItems = useMemo(() => {
    const rawNotesN: any[] = Array.isArray(notesData?.notes) ? notesData.notes : []
    const rawTasksN: any[] = Array.isArray(tasksData?.tasks) ? tasksData.tasks : []
    const notes: TimelineItem[] = rawNotesN.map((n: any) => ({
      id: n.id,
      type: "note" as const,
      sender: "personal" as const,
      text: n.text,
      created_at: n.created_at,
    }))
    const tasks: TimelineItem[] = rawTasksN.map((t: any) => ({
      id: t.id,
      type: "task" as const,
      sender: "system" as const,
      text: t.title,
      created_at: t.created_at,
      _taskStatus: t.status,
      _dueDate: t.due_date,
      _taskType: t.type,
      _description: t.description,
    }))
    return [...notes, ...tasks].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [notesData, tasksData])
  const personalChatItems = useMemo(
    () => items.filter((m) => m.type !== "note" && (m.sender === "client" || m.sender === "personal")),
    [items]
  )
  const assistantChatItems = useMemo(
    () => items.filter((m) => m.type !== "note" && (m.sender === "client" || m.sender === "assistant")),
    [items]
  )

  // Determine input mode from active tab
  const isNoteMode = rightTab === "notes"
  const chatSender = rightTab === "personal" ? "personal" : "assistant"

  // Sync chatAccount with active tab — removed, done above

  // Timeline events for left panel
  const timelineEvents: { date: string; type: string; title: string; desc: string }[] = []
  if (c?.created_at) timelineEvents.push({ date: c.created_at, type: "created", title: "Клиент создан", desc: `Источник: ${c.source || "—"}` })
  if (data?.test_results) data.test_results.forEach((t: any) => timelineEvents.push({ date: t.created_at, type: "test", title: t.test_type === "female" ? "Прошла женский тест" : "Прошёл мужской тест", desc: `${t.diagnosis} (Свобода: ${t.freedom_score}/40, Сексуальность: ${t.sexuality_score}/60)` }))
  if (data?.deals) data.deals.forEach((d: any) => timelineEvents.push({ date: d.created_at, type: "deal", title: `Сделка: ${d.title}`, desc: `${d.amount?.toLocaleString()}₽` }))
  timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())


  // No more scrollToBottom hack — flex-col-reverse handles it natively

  const addTask = useMutation({
    mutationFn: (body: any) =>
      authFetch(`${API}/api/clients/${clientId}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", clientId] })
      queryClient.invalidateQueries({ queryKey: ["tasks", "all"] })
      // Optimistic: иконка задачи на карточке воронки появляется сразу
      queryClient.setQueryData(["clients", "all"], (old: any) => {
        if (!old?.clients) return old
        return {
          ...old,
          clients: old.clients.map((c: any) =>
            c.id === clientId
              ? { ...c, tasks_pending: (c.tasks_pending || 0) + 1 }
              : c
          ),
        }
      })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      setNoteText("")
      setTaskDue("")
      setTaskDescription("")
    },
  })

  const TASK_LABELS: Record<string, string> = {
    follow_up: "Фоллоу-ап",
    session: "Сессия",
    payment: "Оплата",
    contract: "Договор",
    schedule: "Запись",
    content: "Контент",
    feedback: "Обратная связь",
  }

  const createDeal = useMutation({
    mutationFn: (body: object) =>
      authFetch(`${API}/api/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] })
      queryClient.invalidateQueries({ queryKey: ["deals"] })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      setShowNewDeal(false)
      setNewDealTitle("")
      setNewDealAmount("")
      setNewDealDate("")
      setNewDealStatus("Ожидает")
    },
  })

  const handleCreateDeal = () => {
    createDeal.mutate({
      title: newDealTitle.trim(),
      client_id: clientId,
      amount: parseFloat(newDealAmount) || 0,
      paid: 0,
      status: newDealStatus,
      purchase_date: newDealDate,
    })
  }

  const handleSend = () => {
    touch()
    if (rightTab !== "notes" && !noteText.trim()) return
    if (rightTab !== "notes") {
      // Chat mode
      if (sendMessage.isPending) return
      sendMessage.mutate({ text: noteText.trim(), sender: chatSender, send_to_telegram: true })
    } else if (notesInputMode === "task") {
      if (addTask.isPending) return
      addTask.mutate({ title: TASK_LABELS[taskType] || taskType, task_type: taskType, due_date: taskDue, description: taskDescription })
    } else {
      // Note mode
      if (!noteText.trim() || sendMessage.isPending) return
      sendMessage.mutate({ text: noteText.trim(), sender: "note", send_to_telegram: false })
    }
  }

  const handleInsertReply = (text: string) => {
    setNoteText(text)
  }

  const handleTranscribe = (item: TimelineItem) => {
    console.log("✨ Расшифровать медиа:", item)
  }

  return (
    <Sheet open={!!clientId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-5xl p-0 bg-zinc-950" data-sheet-open={!!clientId}>
        {isLoading && <SheetSkeleton />}

        {!isLoading && c && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-6 pt-5 pb-2 border-b border-zinc-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <SheetClose className="text-zinc-600 hover:text-white transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center touch-manipulation">
                    <X size={24} />
                  </SheetClose>
                  <SheetTitle className="text-base font-semibold text-white truncate">{c.name || "Без имени"}</SheetTitle>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editingAssignee ? (
                    <div className="flex gap-1">
                      {["Антон", "Ассистент"].map((a) => (
                        <button
                          key={a}
                          onClick={() => {
                            const v = a === "Ассистент" ? "assistant" : "personal"
                            patchClient.mutate({ responsible_person: v } as any)
                            setEditingAssignee(false)
                          }}
                          className={cn(
                            "text-[10px] px-2 py-1 rounded font-medium transition-colors min-h-[28px] touch-manipulation",
                            assignee.label === a
                              ? a === "Ассистент" ? "bg-purple-500/30 text-purple-300" : "bg-blue-500/30 text-blue-300"
                              : "bg-zinc-800 text-zinc-500"
                          )}
                        >
                          {a}
                        </button>
                      ))}
                      <button onClick={() => setEditingAssignee(false)} className="text-[9px] text-zinc-600">✕</button>
                    </div>
                  ) : (
                    <span
                      onClick={() => setEditingAssignee(true)}
                      className="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition-opacity"
                    >
                      <span className={cn("w-2 h-2 rounded-full", assignee.color)} />
                      <span className="text-xs text-zinc-400">{assignee.label}</span>
                    </span>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Mobile: editable meta section */}
            <div className="md:hidden px-5 py-2 border-b border-zinc-800/30">
              <button onClick={() => setMobileInfoOpen(!mobileInfoOpen)}
                className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium cursor-pointer list-none flex items-center gap-1.5 min-h-[36px] touch-manipulation w-full">
                <span className={`transition-transform ${mobileInfoOpen ? "rotate-90" : ""}`}>{">"}</span>
                Информация о клиенте
              </button>
              {mobileInfoOpen && (
                <div className="mt-2 space-y-3 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1">
                  <Select value={c.status} onValueChange={(v) => patchClient.mutate({ status: v })}>
                    <SelectTrigger className="h-8 text-xs bg-zinc-900 border-zinc-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <EditableMeta icon={<Phone size={12} />} label="Телефон" value={c.phone || ""} onSave={(v) => patchClient.mutate({ phone: v })} />
                  <EditableMeta icon={<AtSign size={12} />} label="@ник" value={displayNick(c.telegram_nick) || ""} onSave={(v) => patchClient.mutate({ telegram_nick: v.replace(/^@+/, "") })} />
                  <EditableMeta icon={<AtSign size={12} />} label="Псевдоним" value={c.pseudonym || ""} onSave={(v) => patchClient.mutate({ pseudonym: v })} />
                  <EditableMeta icon={<AtSign size={12} />} label="Старый ник" value={c.previous_username ? displayNick(c.previous_username) : ""} onSave={(v) => patchClient.mutate({ previous_username: v.replace(/^@+/, "") })} />
                  <EditableMeta icon={<CalendarDays size={12} />} label="День рождения" value={c.birthday || ""} onSave={(v) => patchClient.mutate({ birthday: v })} />
                  {c.source && (
                    <div className="flex gap-1.5 text-xs items-center">
                      <span className="text-zinc-500">Источник:</span>
                      <span className="text-zinc-200">{c.source}</span>
                    </div>
                  )}
                  {c.last_contact && (
                    <div className="flex gap-1.5 text-xs items-center">
                      <span className="text-zinc-500">Посл. контакт:</span>
                      <span className="text-zinc-200">{formatDate(c.last_contact)}</span>
                    </div>
                  )}
                  <Separator className="bg-zinc-800/30" />
                  {/* Mobile deals — кликабельные + добавление */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Сделки</p>
                      <button onClick={(e) => { e.stopPropagation(); setShowNewDeal(true) }}
                        className="text-[10px] text-emerald-500 hover:text-emerald-400 min-h-[32px] min-w-[32px] flex items-center justify-center touch-manipulation">
                        <Plus size={14} />
                      </button>
                    </div>
                    {data?.deals?.map((d: any, i: number) => (
                      <div key={i}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("open-deal", { detail: d.id }))
                          onClose()
                        }}
                        className="flex items-center justify-between text-xs py-1.5 cursor-pointer hover:bg-zinc-800/30 rounded px-1 transition-colors touch-manipulation">
                        <span className="text-zinc-300 truncate">{d.title}</span>
                        <span className="text-zinc-200 ml-2 shrink-0">{d.amount?.toLocaleString()}</span>
                      </div>
                    ))}
                    {data?.deals?.length > 1 && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/30 mt-1">
                        <span className="text-zinc-500">LTV</span>
                        <span className="text-emerald-400 font-semibold">
                          {data.deals.reduce((s: number, d: any) => s + (d.amount || 0), 0).toLocaleString()}rub
                        </span>
                      </div>
                    )}
                    {/* New deal form (mobile) */}
                    {showNewDeal && (
                      <div className="mt-2 p-2 rounded-lg bg-zinc-900 border border-zinc-700 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <input autoFocus value={newDealTitle} onChange={(e) => setNewDealTitle(e.target.value)}
                            placeholder="Название сделки..."
                            className="flex-1 h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                            onKeyDown={(e) => { if (e.key === "Escape") setShowNewDeal(false) }}
                          />
                          <button onClick={() => setShowNewDeal(false)}
                            className="text-zinc-600 hover:text-zinc-300 min-h-[32px] min-w-[32px] flex items-center justify-center">
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex gap-2 flex-wrap min-w-0">
                          <input type="number" value={newDealAmount} onChange={(e) => setNewDealAmount(e.target.value)}
                            placeholder="Сумма" className="w-20 h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600" />
                          <select value={newDealStatus} onChange={(e) => setNewDealStatus(e.target.value)}
                            className="h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600">
                            <option value="Ожидает">Ожидает</option>
                            <option value="В процессе">В процессе</option>
                            <option value="Оплачено">Оплачено</option>
                            <option value="Возврат">Возврат</option>
                          </select>
                          <DateInput value={newDealDate} onChange={setNewDealDate} placeholder="ДД.ММ.ГГГГ" className="w-28" />
                          <button onClick={handleCreateDeal} disabled={!newDealTitle.trim() || createDeal.isPending}
                            className="h-8 px-3 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors">
                            {createDeal.isPending ? "..." : "Create"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {data?.test_results?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-zinc-600 font-medium mb-2">Results</p>
                      <div className="space-y-2">
                        {data.test_results.map((t: any, i: number) => (
                          <TestResultCard key={i} test={t} />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Mobile tags */}
                  <Separator className="bg-zinc-800/30" />
                  <TagsWidget clientId={clientId} />

                  {timelineEvents.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-2">Events</p>
                      <div className="space-y-2">
                        {timelineEvents.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <div className="mt-0.5 shrink-0 text-zinc-600">
                              {e.type === "created" && <UserPlus size={12} />}
                              {e.type === "test" && <FileText size={12} className="text-purple-400" />}
                              {e.type === "deal" && <ShoppingCart size={12} className="text-emerald-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-zinc-300 truncate">{e.title}</p>
                              <p className="text-zinc-600 text-[10px]">{formatDate(e.date)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Split layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* ── Left: Meta (30%) — скрыто на мобилке ──────────── */}
              <div className="hidden md:flex md:w-[30%] border-r border-zinc-800/50 flex-col min-w-0 min-h-0" style={{maxWidth: '30%', width: '30%'}}>
                <div className="flex-1 px-5 py-4 overflow-y-auto overflow-x-hidden" style={{maxWidth: '100%'}}>
                  <div className="space-y-5 w-full min-w-0 break-words" style={{tableLayout: 'fixed', width: '100%'}}>
                    {/* Status */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Статус</label>
                      <Select value={c.status} onValueChange={(v) => patchClient.mutate({ status: v })}>
                        <SelectTrigger className="h-8 text-xs bg-zinc-900 border-zinc-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-zinc-800/30" />

                    {/* ── Архив ────────────────────────────────── */}
                    <div className="flex items-center gap-2">
                      {c.archived ? (
                        <>
                          <span className="text-[10px] text-zinc-500">📦 В архиве</span>
                          <button
                            onClick={() => patchClient.mutate({ archived: false } as any)}
                            className="text-[10px] text-purple-400 hover:text-purple-300 ml-auto"
                          >
                            Восстановить
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            patchClient.mutate({ archived: true } as any)
                            setTimeout(() => onClose(), 300)
                          }}
                          className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors ml-auto"
                        >
                          🗑 В архив
                        </button>
                      )}
                    </div>

                    <Separator className="bg-zinc-800/30" />

                    <div className="space-y-3">
                      <EditableMeta icon={<AtSign size={12} />} label="Имя (как представился)" value={c.name} onSave={(v) => patchClient.mutate({ name: v })} />
                      <EditableMeta icon={<AtSign size={12} />} label="ФИО (для договора)" value={c.full_name || ""} onSave={(v) => patchClient.mutate({ full_name: v })} />
                      <EditableMeta icon={<AtSign size={12} />} label="@ник" value={displayNick(c.telegram_nick) || ""} onSave={(v) => patchClient.mutate({ telegram_nick: v.replace(/^@+/, "") })} />
                      <EditableMeta icon={<AtSign size={12} />} label="Псевдоним" value={c.pseudonym || ""} onSave={(v) => patchClient.mutate({ pseudonym: v })} />
                      <EditableMeta icon={<AtSign size={12} />} label="Старый ник" value={displayNick(c.previous_username) || ""} onSave={(v) => patchClient.mutate({ previous_username: v.replace(/^@+/, "") })} />
                      <EditableMeta icon={<Phone size={12} />} label="Телефон" value={c.phone || ""} onSave={(v) => patchClient.mutate({ phone: v })} />
                      <EditableMeta icon={<CalendarDays size={12} />} label="День рождения" value={c.birthday || ""} onSave={(v) => patchClient.mutate({ birthday: v })} />
                      <MetaRow icon={<CalendarDays size={12} />} label="Посл. контакт" value={formatDate(c.last_contact)} />
                      {c.source && <MetaRow icon={<CircleDot size={12} />} label="Источник" value={c.source} />}
                    </div>

                    {/* Tags widget */}
                    <TagsWidget clientId={clientId} />

                    {/* ── Сделки и LTV ───────────────────────────── */}
                    <Separator className="bg-zinc-800/30" />
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Сделки и LTV</p>
                        <button
                          onClick={() => {
                            setShowNewDeal(true)
                          }}
                          className="text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center touch-manipulation"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      {data?.deals?.length > 0 && (
                        <div className="space-y-2">
                          {data.deals.map((d: any, i: number) => (
                            <div key={i}
                              className="flex items-center justify-between text-xs py-0.5 cursor-pointer hover:bg-zinc-800/30 rounded px-1 transition-colors"
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent("open-deal", { detail: d.id }))
                                onClose()
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ShoppingCart size={11} className="text-emerald-400 shrink-0" />
                                <span className="text-zinc-300 truncate">{d.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {d.purchase_date && (
                                  <span className="text-zinc-600 text-[10px]">{d.purchase_date.slice(0, 10)}</span>
                                )}
                                <span className="text-zinc-200 font-medium">
                                  {d.amount?.toLocaleString()}₽
                                </span>
                              </div>
                            </div>
                          ))}
                          {data.deals.length > 1 && (
                            <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/30">
                              <span className="text-zinc-500">LTV</span>
                              <span className="text-emerald-400 font-semibold">
                                {data.deals.reduce((s: number, d: any) => s + (d.amount || 0), 0).toLocaleString()}₽
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* New deal form */}
                      {showNewDeal && (
                        <div className="mt-2 p-2 rounded-lg bg-zinc-900 border border-zinc-700 space-y-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={newDealTitle}
                              onChange={(e) => setNewDealTitle(e.target.value)}
                              placeholder="Название сделки..."
                              className="flex-1 h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                              onKeyDown={(e) => { if (e.key === "Escape") setShowNewDeal(false) }}
                            />
                            <button
                              onClick={() => setShowNewDeal(false)}
                              className="text-zinc-600 hover:text-zinc-300 min-h-[32px] min-w-[32px] flex items-center justify-center"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <div className="flex gap-2 flex-wrap min-w-0">
                            <input
                              type="number"
                              value={newDealAmount}
                              onChange={(e) => setNewDealAmount(e.target.value)}
                              placeholder="Сумма"
                              className="w-20 h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                            />
                            <select
                              value={newDealStatus}
                              onChange={(e) => setNewDealStatus(e.target.value)}
                              className="h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 min-w-0 focus:outline-none focus:border-zinc-600"
                            >
                              <option value="Ожидает">Ожидает</option>
                              <option value="В процессе">В процессе</option>
                              <option value="Оплачено">Оплачено</option>
                              <option value="Возврат">Возврат</option>
                            </select>
                            <DateInput value={newDealDate} onChange={setNewDealDate} placeholder="ДД.ММ.ГГГГ" className="w-28" />
                            <button
                              onClick={handleCreateDeal}
                              disabled={!newDealTitle.trim() || createDeal.isPending}
                              className="h-8 px-3 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
                            >
                              {createDeal.isPending ? "..." : "Создать"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Результаты тестов ──────────────────────── */}
                    {data?.test_results?.length > 0 && (
                      <>
                        <Separator className="bg-zinc-800/30" />
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-2">Результаты тестов</p>
                          <div className="space-y-2">
                            {data.test_results.map((t: any, i: number) => (
                              <TestResultCard key={i} test={t} />
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Events */}
                    {timelineEvents.length > 0 && (
                      <>
                        <Separator className="bg-zinc-800/30" />
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-2">События</p>
                          <div className="space-y-2">
                            {timelineEvents.map((e, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <div className="mt-0.5 shrink-0 text-zinc-600">
                                  {e.type === "created" && <UserPlus size={12} />}
                                  {e.type === "test" && <FileText size={12} className="text-purple-400" />}
                                  {e.type === "deal" && <ShoppingCart size={12} className="text-emerald-400" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-zinc-300 truncate">{e.title}</p>
                                  <p className="text-zinc-600 text-[10px]">{formatDate(e.date)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Right: Tabs — 100% на мобилке, 70% на десктопе ── */}
              <div className="w-full md:w-[70%] flex flex-col min-h-0">
                <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col flex-1 min-h-0">
                  {/* Tab bar */}
                  <div className="border-b border-zinc-800/50 px-5 shrink-0">
                    <TabsList className="bg-transparent h-10 gap-0">
                      <TabsTrigger value="notes"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-yellow-500 data-[state=active]:text-yellow-300 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 px-3 py-2 text-xs font-medium"
                      >
                        <StickyNote size={13} className="mr-1.5" />
                        Заметки
                      </TabsTrigger>
                      <TabsTrigger value="personal"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:text-blue-300 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 px-3 py-2 text-xs font-medium"
                      >
                        Чат: Антон
                      </TabsTrigger>
                      <TabsTrigger value="assistant"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-purple-500 data-[state=active]:text-purple-300 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 px-3 py-2 text-xs font-medium"
                      >
                        Чат: Ассистент
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* ── Tab: Заметки ───────────────────────────── */}
                  <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
                    {/* Next step — редактируемое поле */}
                    <div className="px-5 py-2.5 bg-zinc-900/50 border-b border-zinc-800/30 shrink-0">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-1">След. шаг</p>
                      <input
                        defaultValue={c?.next_step || ""}
                        onBlur={(e) => { if (e.target.value !== (c?.next_step || "")) patchClient.mutate({ next_step: e.target.value }) }}
                        className="w-full h-9 px-3 text-xs rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 touch-manipulation"
                        placeholder="Укажите следующий шаг..."
                      />
                    </div>
                    <MessagesList
                      items={notesItems}
                      emptyText="Нет заметок"
                      clientId={c?.id}
                      editingTaskId={editingTaskId}
                      setEditingTaskId={setEditingTaskId}
                    />
                  </TabsContent>

                  {/* ── Tab: Чат: Антон ────────────────────────── */}
                  <TabsContent value="personal" className="flex-1 flex flex-col min-h-0 h-full mt-0 data-[state=inactive]:hidden">
                    <ChatTabErrorBoundary>
                      <MiraTopActions clientId={c.id} clientName={c.name} telegramNick={c.telegram_nick} items={personalChatItems} />
                      <MessagesList key={`chat-personal-${clientId}`}
                        items={personalChatItems}
                        onTranscribe={handleTranscribe}
                        emptyText="Нет сообщений"
                        editingTaskId={null}
                        setEditingTaskId={() => {}}
                        hasMore={hasMore}
                        onLoadMore={loadMoreMessages}
                        loadingMore={loadingMore}
                      />
                      <div className="px-5 py-1.5 border-t border-zinc-800/30 shrink-0 flex justify-end">
                        <MiraSuggestReply clientId={c.id} clientName={c.name} telegramNick={c.telegram_nick} items={personalChatItems} onInsert={handleInsertReply} />
                      </div>
                    </ChatTabErrorBoundary>
                  </TabsContent>

                  {/* ── Tab: Чат: Ассистент ────────────────────── */}
                  <TabsContent value="assistant" className="flex-1 flex flex-col min-h-0 h-full mt-0 data-[state=inactive]:hidden">
                    <ChatTabErrorBoundary>
                      <MiraTopActions clientId={c.id} clientName={c.name} telegramNick={c.telegram_nick} items={assistantChatItems} />
                      <MessagesList key={`chat-assistant-${clientId}`}
                        items={assistantChatItems}
                        onTranscribe={handleTranscribe}
                        emptyText="Пока нет сообщений"
                        editingTaskId={null}
                        setEditingTaskId={() => {}}
                        hasMore={hasMore}
                        onLoadMore={loadMoreMessages}
                        loadingMore={loadingMore}
                      />
                      <div className="px-5 py-1.5 border-t border-zinc-800/30 shrink-0 flex justify-end">
                        <MiraSuggestReply clientId={c.id} clientName={c.name} telegramNick={c.telegram_nick} items={assistantChatItems} onInsert={handleInsertReply} />
                      </div>
                    </ChatTabErrorBoundary>
                  </TabsContent>
                </Tabs>

                {/* ── Unified input ─────────────────────────────── */}
                <div className="border-t border-zinc-800/50 px-5 py-3 shrink-0">
                  {rightTab === "notes" ? (
                    /* Notes tab: toggle between note / task */
                    <>
                      <div className="flex items-center gap-1 mb-2">
                        <button
                          onClick={() => setNotesInputMode("note")}
                          className={cn(
                            "text-[10px] font-medium px-2 py-1 rounded transition-colors",
                            notesInputMode === "note"
                              ? "bg-yellow-900/30 text-yellow-400"
                              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          ✏️ Заметка
                        </button>
                        <button
                          onClick={() => setNotesInputMode("task")}
                          className={cn(
                            "text-[10px] font-medium px-2 py-1 rounded transition-colors",
                            notesInputMode === "task"
                              ? "bg-yellow-900/30 text-yellow-400"
                              : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          📋 Задача
                        </button>
                      </div>
                      {notesInputMode === "note" ? (
                        <div className="flex gap-2 items-end">
                          <textarea
                            placeholder="Добавить заметку..."
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }}
                            rows={1}
                            className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 text-sm bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none leading-relaxed"
                            onInput={(e) => {
                              const el = e.currentTarget
                              el.style.height = "auto"
                              el.style.height = Math.min(el.scrollHeight, 120) + "px"
                            }}
                          />
                          <Button size="sm" className="min-h-[44px]" onClick={handleSend} disabled={!noteText.trim() || sendMessage.isPending}>
                            {sendMessage.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          </Button>
                        </div>
                      ) : (
                        /* Task mode: no text input, just type selector + deadline + send */
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {[
                              { value: "follow_up", label: "📅 Фоллоу-ап" },
                              { value: "session", label: "🎯 Сессия" },
                              { value: "payment", label: "💳 Оплата" },
                              { value: "contract", label: "📄 Договор" },
                              { value: "schedule", label: "📝 Запись" },
                              { value: "content", label: "📄 Контент" },
                              { value: "feedback", label: "💬 Обратная связь" },
                            ].map((t) => (
                              <button
                                key={t.value}
                                onClick={() => setTaskType(t.value)}
                                className={cn(
                                  "text-[11px] px-2 py-1 rounded font-medium transition-colors min-h-[28px] touch-manipulation",
                                  taskType === t.value
                                    ? "bg-zinc-700 text-zinc-200"
                                    : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                                )}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <DateInput value={taskDue} onChange={setTaskDue} showTime />
                          <input
                            value={taskDescription}
                            onChange={(e) => setTaskDescription(e.target.value)}
                            placeholder="Комментарий (необязательно)..."
                            className="w-full h-9 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                          />
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              onClick={handleSend}
                              disabled={addTask.isPending}
                            >
                              {addTask.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="mr-1" />}
                              {addTask.isPending ? "..." : TASK_LABELS[taskType] || "Создать"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Chat tabs: Антон / Ассистент */
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded",
                          rightTab === "personal"
                            ? "bg-blue-600/30 text-blue-300"
                            : "bg-purple-600/30 text-purple-300"
                        )}>
                          {rightTab === "personal" ? "Антон" : "Ассистент"}
                        </span>
                        <span className="text-[10px] text-zinc-600">🕊 уйдёт в Telegram</span>
                      </div>
                      <div className="flex gap-2 items-end">
                        <textarea
                          placeholder={`Написать от имени ${rightTab === "personal" ? "Антона" : "Ассистента"}...`}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() } }}
                          rows={1}
                          className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 text-sm bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none leading-relaxed"
                          onInput={(e) => {
                            const el = e.currentTarget
                            el.style.height = "auto"
                            el.style.height = Math.min(el.scrollHeight, 120) + "px"
                          }}
                        />
                        <Button size="sm" className="min-h-[44px]" onClick={handleSend} disabled={!noteText.trim() || sendMessage.isPending}>
                          {sendMessage.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {/* ── Close button ─────────────────────────────── */}
                <div className="sticky bottom-0 bg-zinc-950 pt-3 pb-4 px-5 border-t border-zinc-800/50 shrink-0">
                  <Button onClick={onClose} className="w-full gap-2" size="sm">
                    <CheckCircle2 size={16} />Готово
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-600 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
        <p className="text-xs text-zinc-300 truncate">{value}</p>
      </div>
    </div>
  )
}

function EditableMeta({ icon, label, value, onSave }: { icon: React.ReactNode; label: string; value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [tmp, setTmp] = useState(value)

  const save = () => {
    setEditing(false)
    if (tmp !== value && tmp.trim()) onSave(tmp.trim())
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-zinc-600 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
          <input value={tmp} onChange={(e) => setTmp(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setTmp(value); setEditing(false) } }}
            className="w-full bg-transparent border-b border-zinc-700 text-xs text-zinc-200 outline-none focus:border-purple-500 py-0.5" autoFocus />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group cursor-text" onClick={() => { setTmp(value); setEditing(true) }}>
      <span className="text-zinc-600 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-300 truncate">{value || "—"}</p>
          <span className="text-[9px] text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
        </div>
      </div>
    </div>
  )
}

const TAG_PRESET_COLORS = [
  "#6366f1", "#22c55e", "#ef4444", "#a855f7",
  "#eab308", "#ec4899", "#f97316", "#06b6d4",
  "#14b8a6", "#8b5cf6",
]

// ─── Tag badge with inline edit ────────────────────────────────────────────────
function TagBadge({ tag, onRemove, clientId: cid }: { tag: { id: number; name: string; color: string }; onRemove: () => void; clientId?: number }) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(tag.name)
  const [editColor, setEditColor] = useState(tag.color)
  const queryClient = useQueryClient()

  useEffect(() => { setEditName(tag.name); setEditColor(tag.color) }, [tag.name, tag.color])

  const save = () => {
    if (editName.trim() && (editName !== tag.name || editColor !== tag.color)) {
      // Оптимистичное обновление — сразу меняем кэш
      const prev = queryClient.getQueryData<any>(["client", cid])
      if (prev) {
        queryClient.setQueryData(["client", cid], {
          ...prev,
          tags: (prev.tags || []).map((t: any) =>
            t.id === tag.id ? { ...t, name: editName.trim(), color: editColor } : t
          ),
        })
      }
      // PATCH на сервер — в фоне
      authFetch(`${API}/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      }).then(() => {
        if (cid) queryClient.invalidateQueries({ queryKey: ["client", cid] })
        queryClient.invalidateQueries({ queryKey: ["tags"] })
      }).catch(() => {
        if (cid) queryClient.invalidateQueries({ queryKey: ["client", cid] })
      })
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-800/80 border border-zinc-700 w-full" onClick={(e) => e.stopPropagation()}>
        <input value={editName} onChange={(e) => setEditName(e.target.value)}
          className="w-full h-8 px-2 text-xs rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none"
          autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
          onBlur={save}
        />
        <div className="flex flex-wrap gap-1">
          {["#22c55e","#6366f1","#eab308","#ef4444","#a855f7","#06b6d4","#f97316","#ec4899","#14b8a6","#8b5cf6"].map((c) => (
            <button key={c} onClick={() => setEditColor(c)}
              className={`w-5 h-5 rounded-full ${editColor === c ? "ring-2 ring-white" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
      style={{ backgroundColor: tag.color + "33", color: tag.color }}
      onClick={() => setEditing(true)}
    >
      {tag.name}
      <button onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="hover:opacity-70 text-current ml-0.5">&times;</button>
    </span>
  )
}

function TagsWidget({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [newColor, setNewColor] = useState(TAG_PRESET_COLORS[0])
  const inputRef = useRef<HTMLInputElement>(null)

  // All existing tags (for autocomplete)
  const { data: allTags } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const resp = await authFetch(`${API}/api/tags`)
      const d = await resp.json()
      return d.tags || []
    },
  })

  // Client tags — через useQuery чтобы подписаться на изменения кэша
  const { data: _clientData } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => authFetch(`${API}/api/clients/${clientId}`).then((r) => r.json()),
    staleTime: 30_000,
    enabled: !!clientId,
  })
  const clientTags: { id: number; name: string; color: string }[] = _clientData?.tags || []

  const addMutation = useMutation({
    mutationFn: async (tagId: number) => {
      await authFetch(`${API}/api/clients/${clientId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_id: tagId }),
      })
    },
    onMutate: async (tagId) => {
      await queryClient.cancelQueries({ queryKey: ["client", clientId] })
      const prev = queryClient.getQueryData<any>(["client", clientId])
      if (prev) {
        const tag = allTags?.find((t: any) => t.id === tagId)
        if (tag) {
          const newTag = { id: tag.id, name: tag.name, color: tag.color }
          queryClient.setQueryData(["client", clientId], {
            ...prev, tags: [...(prev.tags || []), newTag]
          })
          // Обновить в списке клиентов (воронка)
          queryClient.setQueriesData({ queryKey: ["clients"] }, (old: any) => {
            if (!old?.clients) return old
            return {
              ...old,
              clients: old.clients.map((c: any) =>
                c.id === clientId ? { ...c, tags: [...(c.tags || []), newTag] } : c
              ),
            }
          })
        }
      }
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["client", clientId], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (tagId: number) => {
      await authFetch(`${API}/api/clients/${clientId}/tags/${tagId}`, { method: "DELETE" })
    },
    onMutate: async (tagId) => {
      await queryClient.cancelQueries({ queryKey: ["client", clientId] })
      const prev = queryClient.getQueryData<any>(["client", clientId])
      if (prev) {
        queryClient.setQueryData(["client", clientId], {
          ...prev, tags: (prev.tags || []).filter((t: any) => t.id !== tagId)
        })
        // Удалить из списка клиентов (воронка)
        queryClient.setQueriesData({ queryKey: ["clients"] }, (old: any) => {
          if (!old?.clients) return old
          return {
            ...old,
            clients: old.clients.map((c: any) =>
              c.id === clientId ? { ...c, tags: (c.tags || []).filter((t: any) => t.id !== tagId) } : c
            ),
          }
        })
      }
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["client", clientId], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
  })

  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const resp = await authFetch(`${API}/api/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      })
      return resp.json()
    },
    onSuccess: (data) => {
      if (data?.tag?.id) {
        addMutation.mutate(data.tag.id)
      }
      queryClient.invalidateQueries({ queryKey: ["client", clientId] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
    },
  })

  const existingTags = Array.isArray(allTags) ? allTags : []
  const filteredExisting = input.trim()
    ? existingTags.filter((t: any) => t.name.toLowerCase().includes(input.toLowerCase()) && !clientTags.some((ct) => ct.id === t.id))
    : existingTags.filter((t: any) => !clientTags.some((ct) => ct.id === t.id))

  const handleAddExisting = (tagId: number) => {
    addMutation.mutate(tagId)
    setAdding(false)
    setInput("")
    setShowCreate(false)
  }

  const handleCreate = () => {
    if (!input.trim()) return
    createTagMutation.mutate({ name: input.trim(), color: newColor })
    setAdding(false)
    setInput("")
    setShowCreate(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Теги</p>
        <button
          onClick={(e) => { e.stopPropagation(); setAdding(!adding); setShowCreate(false); setInput("") }}
          className="text-zinc-500 hover:text-emerald-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation"
        >
          {adding ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {clientTags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            clientId={clientId}
            onRemove={() => removeMutation.mutate(tag.id)}
          />
        ))}
        {adding && !showCreate && (
          <div className="relative w-full mt-1">
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAdding(false)
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Поиск тега..."
              className="w-full h-8 bg-zinc-800 border border-zinc-600 rounded px-2 text-xs text-zinc-200 outline-none"
            />
            {input.trim() && filteredExisting.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-1 w-full text-left px-2 py-1.5 text-xs text-blue-400 hover:text-blue-300 bg-zinc-800/50 rounded"
              >
                + Создать "{input.trim()}"
              </button>
            )}
            {filteredExisting.length > 0 && input.trim() && (
              <div className="mt-1 max-h-32 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded">
                {filteredExisting.slice(0, 8).map((t: any) => (
                  <button
                    key={t.id}
                    onClick={(e) => { e.stopPropagation(); handleAddExisting(t.id) }}
                    className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {adding && showCreate && (
          <div className="w-full mt-1 p-2 bg-zinc-800/50 border border-zinc-700 rounded">
            <p className="text-[10px] text-zinc-400 mb-2">Цвет тега:</p>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {TAG_PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={(e) => { e.stopPropagation(); setNewColor(color) }}
                  className={`w-6 h-6 rounded-full ${newColor === color ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900" : ""}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Button size="xs" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleCreate() }}>
                Создать
              </Button>
              <button
                onClick={() => setShowCreate(false)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 ml-auto"
              >
                Назад
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
