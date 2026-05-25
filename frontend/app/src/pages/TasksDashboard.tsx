import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, formatDate, API, tgLink } from "@/lib/utils"
import {
  Loader2, CalendarClock, CreditCard, CalendarCheck,
  FileText, MessageSquare, Circle, CheckCircle2,
  Search, Plus, X,
} from "lucide-react"

const TASK_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  follow_up: { label: "Фоллоу-ап", icon: <CalendarClock size={14} />, color: "text-blue-400" },
  payment: { label: "Оплата", icon: <CreditCard size={14} />, color: "text-emerald-400" },
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
}

interface TasksDashboardProps {
  onSelectClient: (id: number) => void
}

const TODAY = new Date().toISOString().slice(0, 10)

export function TasksDashboard({ onSelectClient }: TasksDashboardProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDue, setNewDue] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => authFetch(`${API}/api/tasks`).then((r) => r.json()),
  })

  const patchTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`${API}/api/tasks/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  })

  const createTask = useMutation({
    mutationFn: (body: object) =>
      authFetch(`${API}/api/clients/0/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      setNewTitle(""); setNewDue(""); setShowAdd(false)
    },
  })

  const tasks: TaskRow[] = Array.isArray(data?.tasks) ? data.tasks : []

  const filtered = useMemo(() => {
    if (!search) return tasks.filter((t) => t.status === "pending")
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.status === "pending" &&
        (t.title.toLowerCase().includes(q) || (t.client_name || "").toLowerCase().includes(q)),
    )
  }, [tasks, search])

  const overdue = filtered.filter((t) => t.due_date && t.due_date < TODAY)
  const today = filtered.filter((t) => t.due_date === TODAY)
  const future = filtered.filter((t) => !t.due_date || t.due_date > TODAY)

  const columns = [
    { id: "overdue", label: "Просрочено", tasks: overdue, color: "bg-red-500", bg: "bg-red-950/10", border: "border-red-900/20", headerBg: "bg-red-950/20", headerText: "text-red-400" },
    { id: "today", label: "Сегодня", tasks: today, color: "bg-amber-500", bg: "bg-amber-950/10", border: "border-amber-900/20", headerBg: "bg-amber-950/20", headerText: "text-amber-400" },
    { id: "future", label: "На будущее", tasks: future, color: "bg-blue-500", bg: "bg-blue-950/10", border: "border-blue-900/20", headerBg: "bg-blue-950/20", headerText: "text-blue-400" },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Задачи</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} активных задач</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? "Отмена" : "Новая задача"}
        </Button>
      </div>

      {/* Add task form */}
      {showAdd && (
        <div className="flex gap-2 mb-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
          <Input
            placeholder="Название задачи"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-8 text-xs bg-zinc-950 border-zinc-800 flex-1"
          />
          <Input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            className="h-8 text-xs bg-zinc-950 border-zinc-800 w-[140px]"
          />
          <Button size="xs" disabled={!newTitle.trim()} onClick={() => createTask.mutate({ title: newTitle.trim(), due_date: newDue })}>
            Создать
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по задаче или клиенту..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-800"
        />
      </div>

      {/* Kanban */}
      {isLoading && (
        <div className="flex gap-4">
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
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "50vh" }}>
          {columns.map((col) => (
            <div key={col.id} className={cn("flex-1 min-w-[250px] rounded-xl border flex flex-col", col.bg, col.border)}>
              {/* Header */}
              <div className={cn("flex items-center justify-between px-4 py-3 rounded-t-xl border-b", col.headerBg)}>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", col.color)} />
                  <span className={cn("text-sm font-semibold", col.headerText)}>{col.label}</span>
                </div>
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", col.headerBg, col.headerText)}>
                  {col.tasks.length}
                </span>
              </div>
              {/* Cards */}
              <ScrollArea className="flex-1 px-3 py-3">
                <div className="space-y-2">
                  {col.tasks.length === 0 && (
                    <div className="py-8 text-center text-xs text-zinc-600 italic">Нет задач</div>
                  )}
                  {col.tasks.map((t) => {
                    const info = TASK_TYPES[t.type] || TASK_TYPES.follow_up
                    const Icon = info.icon
                    return (
                      <div key={t.id} className={cn("p-3 rounded-lg border transition-colors", col.bg, col.border, "hover:bg-zinc-800/30")}>
                        <div className="flex items-start gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); patchTask.mutate({ id: t.id, status: "completed" }) }}
                            className="mt-0.5 shrink-0 text-zinc-600 hover:text-emerald-400"
                          >
                            <Circle size={14} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={info.color}>{Icon}</span>
                              <span className="text-sm text-zinc-200 truncate font-medium">{t.title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {t.client_name && (
                                <span
                                  className="text-[11px] text-zinc-500 hover:text-blue-400 cursor-pointer truncate"
                                  onClick={(e) => { e.stopPropagation(); t.client_id && onSelectClient(t.client_id) }}
                                >
                                  {t.client_name}
                                </span>
                              )}
                              {t.due_date && (
                                <span className={cn("text-[10px]", col.id === "overdue" ? "text-red-400" : "text-zinc-600")}>
                                  {t.due_date}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
