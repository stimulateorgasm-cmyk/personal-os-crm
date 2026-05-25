import { useState, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  ScrollArea,
} from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, formatTime, getStatusStyle, cn } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { TasksWidget } from "./TasksWidget"
import {
  Loader2, Send, StickyNote, UserPlus, X,
  ShoppingCart, FileText, Phone, AtSign, CalendarDays,
  CircleDot, Sparkles, MessageSquareHeart, MessageCircleReply,
} from "lucide-react"

function MiraClientActions({ clientId, items }: { clientId: number; items: TimelineItem[] }) {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const ask = async (prompt: string) => {
    setLoading(prompt)
    setResponse(null)
    try {
      const resp = await authFetch(`${API}/api/mira/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          context_type: "local",
          client_id: clientId,
          context_data: { timeline: items.slice(-20) },
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
    { id: "summary", label: "Саммари диалога", icon: FileText },
    { id: "tone", label: "Тональность клиента", icon: MessageSquareHeart },
    { id: "reply", label: "Предложить ответ", icon: MessageCircleReply },
  ]

  return (
    <div className="px-5 pt-3 pb-1 border-b border-zinc-800/30">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={12} className="text-purple-400" />
        <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Мира (AI)</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => ask(a.label)}
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
        <div className="mt-2 p-3 rounded-lg bg-gradient-to-r from-purple-950/30 to-blue-950/30 border border-purple-900/30 text-xs text-zinc-300 leading-relaxed">
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

const STATUSES = ["Контакт","Выдать контент","Квалифицировать","Довести до решения","Проработать","Работа завершена (Архив)"]

const ASSIGNEE_LABELS: Record<string, { label: string; color: string }> = {
  "Личка":        { label: "Антон",    color: "bg-blue-500" },
  "Ассистент":    { label: "Ассистент", color: "bg-purple-500" },
  "Женский тест": { label: "Ассистент", color: "bg-purple-500" },
  "Мужской тест": { label: "Ассистент", color: "bg-purple-500" },
}

function getAssignee(source: string | null | undefined) {
  if (!source) return { label: "Антон", color: "bg-blue-500" }
  return ASSIGNEE_LABELS[source] || { label: "Антон", color: "bg-blue-500" }
}

interface TimelineItem {
  id: number
  type: "note" | "message"
  sender: "client" | "personal" | "assistant" | "system"
  text: string
  created_at: string
}

interface ClientSheetProps {
  clientId: number | null
  onClose: () => void
}

// ─── Chat bubble (null-safe) ─────────────────────────────────────────────────
function safeText(text: string | null | undefined): string {
  if (!text || text.trim() === "") return "📎 Текст недоступен (медиа/стикер)"
  return text
}

function safeDate(date: string | null | undefined): string {
  return date || ""
}

function ChatBubble({ item }: { item: TimelineItem }) {
  try {
    const isNote = item.type === "note"
    const isClient = item.sender === "client"
    const isAnton = item.sender === "personal"
    const isAssistant = item.sender === "assistant"

    if (isNote) {
      return (
        <div className="flex justify-end my-2">
          <div className="max-w-[80%] bg-yellow-900/30 border border-yellow-700/30 rounded-2xl rounded-br-md px-4 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <StickyNote size={11} className="text-yellow-500" />
              <span className="text-[10px] text-yellow-500 font-medium">Заметка</span>
            </div>
            <p className="text-sm text-yellow-200 leading-relaxed whitespace-pre-wrap">{safeText(item.text)}</p>
            <p className="text-[10px] text-yellow-600 mt-1">{safeDate(item.created_at) ? formatTime(item.created_at) : ""}</p>
          </div>
        </div>
      )
    }

    const bubbleClass = isClient
      ? "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-md"
      : isAnton
      ? "bg-blue-600 text-white rounded-2xl rounded-br-md"
      : "bg-purple-600 text-white rounded-2xl rounded-br-md"

    const senderLabel = isAnton ? "Антон" : isAssistant ? "Ассистент" : ""

    return (
      <div className={cn("flex my-2", isClient ? "justify-start" : "justify-end")}>
        <div className={cn("max-w-[80%] px-4 py-2.5", bubbleClass)}>
          {senderLabel && <p className="text-[10px] opacity-60 font-medium mb-0.5">{senderLabel}</p>}
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{safeText(item.text)}</p>
          <p className={cn("text-[10px] mt-1", isClient ? "text-zinc-500" : "text-white/50")}>
            {safeDate(item.created_at) ? formatTime(item.created_at) : ""}
          </p>
        </div>
      </div>
    )
  } catch {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-zinc-600">[ошибка отображения сообщения]</span>
      </div>
    )
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

// ─── Main component ───────────────────────────────────────────────────────────
export function ClientSheet({ clientId, onClose }: ClientSheetProps) {
  const queryClient = useQueryClient()
  const [noteText, setNoteText] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  // Client data
  const { data, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => authFetch(`${API}/api/clients/${clientId}`).then((r) => r.json()),
    enabled: !!clientId,
  })

  // Unified timeline
  const { data: timelineData } = useQuery<TimelineItem[]>({
    queryKey: ["timeline", clientId],
    queryFn: () =>
      authFetch(`${API}/api/clients/${clientId}/timeline`).then((r) => r.json()).then((d) => d.items),
    enabled: !!clientId,
    refetchInterval: 15_000,
  })

  const patchClient = useMutation({
    mutationFn: (body: Record<string, string>) =>
      authFetch(`${API}/api/clients/${clientId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client", clientId] }),
  })

  const addNote = useMutation({
    mutationFn: (text: string) =>
      authFetch(`${API}/api/clients/${clientId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline", clientId] })
      setNoteText("")
    },
  })

  const c = data?.client
  const assignee = getAssignee(c?.source)
  const items: TimelineItem[] = Array.isArray(timelineData) ? timelineData : []

  // Timeline events for left panel
  const timelineEvents: { date: string; type: string; title: string; desc: string }[] = []
  if (c?.created_at) timelineEvents.push({ date: c.created_at, type: "created", title: "Клиент создан", desc: `Источник: ${c.source || "—"}` })
  if (data?.test_results) data.test_results.forEach((t: any) => timelineEvents.push({ date: t.created_at, type: "test", title: t.test_type === "female" ? "Прошла женский тест" : "Прошёл мужской тест", desc: `${t.diagnosis} (Свобода: ${t.freedom_score}/40, Сексуальность: ${t.sexuality_score}/60)` }))
  if (data?.deals) data.deals.forEach((d: any) => timelineEvents.push({ date: d.created_at, type: "deal", title: `Сделка: ${d.title}`, desc: `${d.amount?.toLocaleString()}₽` }))
  timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [items])

  const sendNote = () => {
    if (noteText.trim()) addNote.mutate(noteText.trim())
  }

  return (
    <Sheet open={!!clientId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-5xl p-0 bg-zinc-950">
        {isLoading && <SheetSkeleton />}

        {!isLoading && c && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-6 pt-5 pb-2 border-b border-zinc-800/50">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base font-semibold text-white">{c.name || "Без имени"}</SheetTitle>
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", assignee.color)} />
                  <span className="text-xs text-zinc-400">{assignee.label}</span>
                </div>
              </div>
            </SheetHeader>

            {/* Split layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* ── Left: Meta ──────────────────────────────────────── */}
              <div className="w-[30%] border-r border-zinc-800/50 flex flex-col">
                <ScrollArea className="flex-1 px-5 py-4">
                  <div className="space-y-5">
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

                    <div className="space-y-3">
                      <EditableMeta icon={<AtSign size={12} />} label="Имя" value={c.name} onSave={(v) => patchClient.mutate({ name: v })} />
                      <EditableMeta icon={<AtSign size={12} />} label="@ник" value={c.telegram_nick ? `@${c.telegram_nick}` : ""} onSave={(v) => patchClient.mutate({ telegram_nick: v.replace("@", "") })} />
                      <EditableMeta icon={<Phone size={12} />} label="Телефон" value={c.phone || ""} onSave={(v) => patchClient.mutate({ phone: v })} />
                      <MetaRow icon={<CalendarDays size={12} />} label="Посл. контакт" value={formatDate(c.last_contact)} />
                      {c.source && <MetaRow icon={<CircleDot size={12} />} label="Источник" value={c.source} />}
                    </div>

                    {/* Test results */}
                    {data?.test_results?.length > 0 && (
                      <>
                        <Separator className="bg-zinc-800/30" />
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-2">Тесты</p>
                          {data.test_results.map((t: any, i: number) => (
                            <div key={i} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 mb-2 last:mb-0">
                              <p className="text-xs font-medium text-zinc-300 mb-1">
                                {t.test_type === "female" ? "Женский тест" : "Мужской тест"}
                              </p>
                              <div className="flex justify-between text-[11px] text-zinc-400">
                                <span>Свобода</span><span className="text-white">{t.freedom_score}/40</span>
                              </div>
                              <div className="flex justify-between text-[11px] text-zinc-400">
                                <span>Сексуальность</span><span className="text-white">{t.sexuality_score}/60</span>
                              </div>
                              <p className="text-[11px] text-purple-400 mt-1">{t.diagnosis}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Next step */}
                    {c.next_step && (
                      <>
                        <Separator className="bg-zinc-800/30" />
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium mb-1">След. шаг</p>
                          <p className="text-xs text-zinc-300">{c.next_step}</p>
                        </div>
                      </>
                    )}

                    {/* Tasks */}
                    <div>
                      <TasksWidget clientId={c.id} />
                    </div>
                    <Separator className="bg-zinc-800/30" />

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
                </ScrollArea>
              </div>

              {/* ── Right: Chat timeline ─────────────────────────────── */}
              <div className="w-[70%] flex flex-col">
                {/* Mira AI actions */}
                <MiraClientActions clientId={c.id} items={items} />
                <ScrollArea className="flex-1 px-5 py-4" ref={scrollRef as any}>
                  {/* Date marker for first item */}
                  {items.length > 0 && (
                    <div className="flex justify-center mb-4">
                      <span className="text-[11px] text-zinc-600 bg-zinc-900 px-3 py-1 rounded-full">
                        {formatDate(items[0].created_at)}
                      </span>
                    </div>
                  )}
                  {items.map((item) => (
                    <ChatBubble key={`${item.type}-${item.id}`} item={item} />
                  ))}
                  {items.length === 0 && (
                    <div className="flex items-center justify-center h-48">
                      <p className="text-sm text-zinc-600">Нет сообщений. Напишите заметку ниже.</p>
                    </div>
                  )}
                </ScrollArea>

                {/* Input */}
                <div className="border-t border-zinc-800/50 px-5 py-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Написать заметку..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="h-9 text-sm bg-zinc-900 border-zinc-800 flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendNote() } }}
                    />
                    <Button size="sm" onClick={sendNote} disabled={!noteText.trim() || addNote.isPending}>
                      {addNote.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </Button>
                  </div>
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
          <input
            value={tmp}
            onChange={(e) => setTmp(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setTmp(value); setEditing(false) } }}
            className="w-full bg-transparent border-b border-zinc-700 text-xs text-zinc-200 outline-none focus:border-purple-500 py-0.5"
            autoFocus
          />
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
