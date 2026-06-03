import React, { useState, useMemo, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, formatDate, API } from "@/lib/utils"
import { DateInput } from "@/components/DateInput"
import {
  CalendarClock, CreditCard, CalendarCheck, MessageCircle,
  FileText, MessageSquare, Circle, CheckCircle2,
  Search, Plus, X, Loader2, RotateCcw, Trash2,
} from "lucide-react"

const TASK_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  follow_up: { label: "Фоллоу-ап", icon: <CalendarClock size={14} />, color: "text-blue-400" },
  session: { label: "Сессия", icon: <MessageCircle size={14} />, color: "text-violet-400" },
  payment: { label: "Оплата", icon: <CreditCard size={14} />, color: "text-emerald-400" },
  contract: { label: "Договор", icon: <FileText size={14} />, color: "text-cyan-400" },
  schedule: { label: "Запись", icon: <CalendarCheck size={14} />, color: "text-purple-400" },
  content: { label: "Контент", icon: <FileText size={14} />, color: "text-orange-400" },
  feedback: { label: "Обратная связь", icon: <MessageSquare size={14} />, color: "text-rose-400" },
}

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

interface TaskRow {
  id: number
  client_id: number
  title: string
  type: string
  due_date: string
  status: string
  created_at: string
  client_name: string | null
  telegram_nick: string | null
  responsible_person?: string | null
}

interface TasksDashboardProps {
  onSelectClient: (id: number) => void
}

const TODAY = new Date().toISOString().slice(0, 10)

function formatTaskDue(iso: string): string {
  if (!iso) return ""
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
    if (abs === 0) return "сегодня"
    if (abs === 1) return "вчера"
    return `${abs} дн. назад`
  }
  if (diffDays === 0) return timeStr ? `сегодня ${timeStr}` : "сегодня"
  if (diffDays === 1) return timeStr ? `завтра ${timeStr}` : "завтра"
  if (diffDays < 7) return `${weekdays[target.getDay()]} ${target.getDate()}${timeStr ? " " + timeStr : ""}`
  return `${target.getDate()}.${target.getMonth() + 1}${timeStr ? " " + timeStr : ""}`
}

function TasksDashboard({ onSelectClient }: TasksDashboardProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [newTaskType, setNewTaskType] = useState("follow_up")
  const [newDue, setNewDue] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newClientSearch, setNewClientSearch] = useState("")
  const [newClientId, setNewClientId] = useState<number | null>(null)
  const [newClientName, setNewClientName] = useState("")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all")
  const [showArchive, setShowArchive] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const LIMIT = 30
  const TASK_LABELS: Record<string, string> = {
    follow_up: "Фоллоу-ап", session: "Сессия", payment: "Оплата", contract: "Договор",
    schedule: "Запись", content: "Контент", feedback: "Обратная связь",
  }
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const clientSearchRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => authFetch(`${API}/api/tasks`).then((r) => r.json()),
  })

  // Search clients for the task form
  const { data: clientData } = useQuery({
    queryKey: ["clients", "search", newClientSearch],
    queryFn: () => authFetch(`${API}/api/clients?limit=10&search=${encodeURIComponent(newClientSearch)}&archived=false`).then((r) => r.json()),
    enabled: clientSearchOpen && newClientSearch.length >= 2,
  })

  // Close client search on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setClientSearchOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const patchTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`${API}/api/tasks/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  })

  const deleteTask = useMutation({
    mutationFn: (id: number) =>
      authFetch(`${API}/api/tasks/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  })

  const createTask = useMutation({
    mutationFn: (body: any) => {
      const title = TASK_LABELS[body.task_type] || body.task_type
      if (body.client_id && body.client_id > 0) {
        return authFetch(`${API}/api/clients/${body.client_id}/tasks`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, task_type: body.task_type, due_date: body.due_date || "" }),
        }).then((r) => r.json())
      }
      return authFetch(`${API}/api/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, task_type: body.task_type, due_date: body.due_date || "" }),
      }).then((r) => r.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      setNewDue("")
      setNewClientId(null)
      setNewClientName("")
      setNewClientSearch("")
      setShowAdd(false)
    },
  })

  const tasks: TaskRow[] = Array.isArray(data?.tasks) ? data.tasks : []

  function getTaskAssignee(t: TaskRow): string {
    const rp = (t.responsible_person || "").toLowerCase()
    if (rp === "assistant" || rp === "ассистент") return "assistant"
    if (rp === "personal" || rp === "personal") return "personal"
    // fallback: по умолчанию Антон
    return "personal"
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return tasks.filter((t) => {
      if (showArchive && t.status !== "completed") return false
      if (!showArchive && t.status !== "pending") return false
      if (assigneeFilter === "assistant" && getTaskAssignee(t) !== "assistant") return false
      if (assigneeFilter === "personal" && getTaskAssignee(t) !== "personal") return false
      if (q) {
        const matches = t.title.toLowerCase().includes(q) || (t.client_name || "").toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [tasks, search, assigneeFilter, showArchive])

  const nowMsk = new Date()
  const mskOffset = 3 * 60  // MSK = UTC+3
  const mskNow = new Date(nowMsk.getTime() + mskOffset * 60 * 1000)
  const TODAY_MSK = mskNow.toISOString().slice(0, 10)
  const NOW_MSK = mskNow.toISOString().slice(0, 16).replace("T", " ")
  const overdue = filtered.filter((t) => t.due_date && (
    t.due_date.slice(0, 10) < TODAY_MSK ||
    (t.due_date.slice(0, 10) === TODAY_MSK && t.due_date.slice(11) && t.due_date < NOW_MSK)
  ))
  const today = filtered.filter((t) => {
    if (!t.due_date) return false
    const dateOnly = t.due_date.slice(0, 10)
    if (dateOnly !== TODAY_MSK) return false
    if (t.due_date.length > 10 && t.due_date < NOW_MSK) return false
    return true
  })
  const future = filtered.filter((t) => !t.due_date || t.due_date.slice(0, 10) > TODAY_MSK)
  const futureSorted = useMemo(() => {
    return [...future].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  }, [future])

  const columns = [
    { id: "overdue", label: "Просрочено", tasks: overdue, color: "bg-red-500", bg: "bg-red-950/10", border: "border-red-900/20", headerBg: "bg-red-950/20", headerText: "text-red-400" },
    { id: "today", label: "Сегодня", tasks: today, color: "bg-amber-500", bg: "bg-amber-950/10", border: "border-amber-900/20", headerBg: "bg-amber-950/20", headerText: "text-amber-400" },
    { id: "future", label: "На будущее", tasks: futureSorted, color: "bg-blue-500", bg: "bg-blue-950/10", border: "border-blue-900/20", headerBg: "bg-blue-950/20", headerText: "text-blue-400" },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Задачи</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {showArchive ? "Архив выполненных задач" : `${filtered.length} активных задач`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showArchive ? "default" : "secondary"}
            className="gap-2 min-h-[44px] touch-manipulation"
            onClick={() => setShowArchive(!showArchive)}
          >
            {showArchive ? "✕ Активные" : "📦 Архив"}
          </Button>
          <Button size="sm" className="gap-2 min-h-[44px] touch-manipulation" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? <X size={14} /> : <Plus size={14} />}
            {showAdd ? "Отмена" : "Новая задача"}
          </Button>
        </div>
      </div>

      {/* Add task form */}
      {showAdd && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
          {/* Task type selector */}
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
                onClick={() => setNewTaskType(t.value)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded font-medium transition-colors min-h-[28px] touch-manipulation",
                  newTaskType === t.value
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Deadline picker */}
          <DateInput value={newDue} onChange={setNewDue} showTime />
          {/* Description */}
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Комментарий (необязательно)..."
            className="w-full h-9 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          {/* Client selector */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1" ref={clientSearchRef}>
              {newClientId ? (
                <div className="flex items-center gap-1 h-9 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-300">
                  <StickyNote size={12} className="text-zinc-500" />
                  <span>{newClientName}</span>
                  <button
                    onClick={() => { setNewClientId(null); setNewClientName(""); setNewClientSearch("") }}
                    className="ml-auto text-zinc-500 hover:text-zinc-300"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={newClientSearch}
                    onChange={(e) => { setNewClientSearch(e.target.value); setClientSearchOpen(true) }}
                    onFocus={() => setClientSearchOpen(true)}
                    placeholder="Клиент (необязательно)..."
                    className="w-full h-9 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                  />
                  {clientSearchOpen && newClientSearch.length >= 2 && (
                    <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-zinc-900 border border-zinc-700 rounded-lg max-h-40 overflow-y-auto">
                      {(clientData as any)?.clients?.slice(0, 8).map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setNewClientId(c.id)
                            setNewClientName(c.name)
                            setNewClientSearch("")
                            setClientSearchOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          {c.name}
                          {c.telegram_nick && <span className="text-zinc-500 ml-1">{c.telegram_nick}</span>}
                        </button>
                      ))}
                      {(!(clientData as any)?.clients?.length) && (
                        <div className="px-3 py-2 text-xs text-zinc-600">Ничего не найдено</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="h-9 shrink-0"
              disabled={createTask.isPending}
              onClick={() => createTask.mutate({ task_type: newTaskType, due_date: newDue, description: newDescription, client_id: newClientId })}
            >
              {createTask.isPending ? <Loader2 size={14} className="animate-spin" /> : TASK_LABELS[newTaskType]}
            </Button>
          </div>
        </div>
      )}

      {/* Filter: assignee */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Ответственный:</span>
        {[
          { value: "all", label: "Все" },
          { value: "personal", label: "Антон", dot: "bg-blue-500" },
          { value: "assistant", label: "Ассистент", dot: "bg-purple-500" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setAssigneeFilter(f.value)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 min-h-[28px] touch-manipulation",
              assigneeFilter === f.value
                ? "bg-zinc-700 text-zinc-200"
                : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
            )}
          >
            {f.dot && <span className={cn("w-1.5 h-1.5 rounded-full", f.dot)} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по задаче или клиенту..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 text-sm bg-zinc-900 border-zinc-800"
        />
      </div>

      {/* Kanban — responsive: horizontal scroll on desktop, vertical stack on mobile */}
      {isLoading && (
        <div className="flex flex-col sm:flex-row gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex-1 space-y-3">
              <Skeleton className="h-8 w-24 bg-zinc-800" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-20 w-full bg-zinc-800/60" />
              ))}
            </div>
          ))}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Desktop: horizontal kanban */}
          <div className="hidden md:flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "50vh" }}>
            {columns.map((col) => (
              <div key={col.id} className={cn("flex-1 min-w-[250px] rounded-xl border flex flex-col", col.bg, col.border)}>
                <div className={cn("flex items-center justify-between px-4 py-3 rounded-t-xl border-b", col.headerBg)}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", col.color)} />
                    <span className={cn("text-sm font-semibold", col.headerText)}>{col.label}</span>
                  </div>
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", col.headerBg, col.headerText)}>
                    {col.tasks.length}
                  </span>
                </div>
                <ScrollArea className="flex-1 px-3 py-3">
                  <div className="space-y-2">
                    {col.tasks.length === 0 && (
                      <div className="py-8 text-center text-xs text-zinc-600 italic">Нет задач</div>
                    )}
                    {col.tasks.slice(0, expanded[col.id] ? undefined : LIMIT).map((t) => <TaskCard key={t.id} task={t} columnId={col.id} showArchive={showArchive} onComplete={(id) => patchTask.mutate({ id, status: "completed" })} onRestore={(id) => patchTask.mutate({ id, status: "pending" })} onDelete={(id) => { if (confirm('Удалить задачу?')) deleteTask.mutate(id) }} onSelectClient={onSelectClient} />)}
                    {col.tasks.length > LIMIT && !expanded[col.id] && (
                      <button
                        onClick={() => setExpanded((prev) => ({ ...prev, [col.id]: true }))}
                        className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800/30"
                      >
                        + {col.tasks.length - LIMIT} ещё
                      </button>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>

          {/* Mobile: vertical stack */}
          <div className="md:hidden flex flex-col gap-4 pb-4">
            {columns.map((col) => (
              <div key={col.id} className={cn("rounded-xl border", col.bg, col.border)}>
                <div className={cn("flex items-center justify-between px-4 py-3 border-b", col.headerBg)}>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", col.color)} />
                    <span className={cn("text-sm font-semibold", col.headerText)}>{col.label}</span>
                  </div>
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", col.headerBg, col.headerText)}>
                    {col.tasks.length}
                  </span>
                </div>
                <div className="px-3 py-3 space-y-2">
                  {col.tasks.length === 0 && (
                    <div className="py-6 text-center text-xs text-zinc-600 italic">Нет задач</div>
                  )}
                  {col.tasks.slice(0, expanded[col.id] ? undefined : LIMIT).map((t) => <TaskCard key={t.id} task={t} columnId={col.id} showArchive={showArchive} onComplete={(id) => patchTask.mutate({ id, status: "completed" })} onRestore={(id) => patchTask.mutate({ id, status: "pending" })} onDelete={(id) => { if (confirm('Удалить задачу?')) deleteTask.mutate(id) }} onSelectClient={onSelectClient} />)}
                  {col.tasks.length > LIMIT && !expanded[col.id] && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [col.id]: true }))}
                      className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800/30"
                    >
                      + {col.tasks.length - LIMIT} ещё
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Task Card (shared between desktop and mobile) ──────────────────────────
function TaskCard({ task, columnId, showArchive, onComplete, onRestore, onDelete, onSelectClient }: {
  task: TaskRow
  columnId: string
  showArchive?: boolean
  onComplete: (id: number) => void
  onRestore?: (id: number) => void
  onDelete?: (id: number) => void
  onSelectClient: (id: number) => void
}) {
  const info = TASK_TYPES[task.type] || TASK_TYPES.follow_up
  const Icon = info.icon
  const colInfo = columnId === "overdue"
    ? { bg: "bg-red-950/10", border: "border-red-900/20" }
    : columnId === "today"
    ? { bg: "bg-amber-950/10", border: "border-amber-900/20" }
    : { bg: "bg-blue-950/10", border: "border-blue-900/20" }

  return (
    <div className={cn("p-4 rounded-xl border transition-colors", colInfo.bg, colInfo.border, "hover:bg-zinc-800/30")}>
      <div className="flex items-start gap-3">
        {showArchive ? (
          <span className="mt-0.5 shrink-0 text-emerald-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <CheckCircle2 size={16} />
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onComplete(task.id) }}
            className="mt-0.5 shrink-0 text-zinc-600 hover:text-emerald-400 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
          >
            <Circle size={16} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={info.color}>{Icon}</span>
            <span className={cn(
              "text-sm font-semibold leading-snug",
              showArchive ? "text-zinc-500" : "text-zinc-200"
            )}>
              {task.title}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {task.client_name && (
              <span
                className="text-xs text-zinc-400 hover:text-blue-400 cursor-pointer truncate min-h-[28px] flex items-center touch-manipulation"
                onClick={(e) => { e.stopPropagation(); task.client_id && onSelectClient(task.client_id) }}
              >
                {task.client_name}
              </span>
            )}
            {task.due_date && (
              <span className={cn("text-xs", columnId === "overdue" ? "text-red-400" : "text-zinc-500")}>
                {formatTaskDue(task.due_date)}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{task.description}</p>
          )}
        </div>
        {showArchive && (
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onRestore?.(task.id) }}
              className="text-zinc-500 hover:text-emerald-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation"
              title="Вернуть в активные"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(task.id) }}
              className="text-zinc-600 hover:text-red-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center touch-manipulation"
              title="Удалить навсегда"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
export default TasksDashboard
