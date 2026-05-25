import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, API } from "@/lib/utils"
import {
  Loader2, Plus, Circle, CheckCircle2,
  CalendarClock, CreditCard, CalendarCheck,
  FileText, MessageSquare, ArrowRight,
} from "lucide-react"

interface Task {
  id: number
  client_id: number
  title: string
  type: string
  due_date: string
  status: string
  created_at: string
}

function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("crm_token")
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

const TASK_TYPES = [
  { value: "follow_up", label: "Фоллоу-ап", icon: CalendarClock, color: "text-blue-400" },
  { value: "payment", label: "Оплата", icon: CreditCard, color: "text-emerald-400" },
  { value: "schedule", label: "Запись", icon: CalendarCheck, color: "text-purple-400" },
  { value: "content", label: "Контент", icon: FileText, color: "text-orange-400" },
  { value: "feedback", label: "Обратная связь", icon: MessageSquare, color: "text-rose-400" },
]

function getTypeInfo(type: string) {
  return TASK_TYPES.find((t) => t.value === type) || TASK_TYPES[0]
}

export function TasksWidget({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newType, setNewType] = useState("follow_up")
  const [newDue, setNewDue] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", clientId],
    queryFn: () => authFetch(`${API}/api/clients/${clientId}/tasks`).then((r) => r.json()),
    enabled: !!clientId,
  })

  const patchTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`${API}/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", clientId] }),
  })

  const addTask = useMutation({
    mutationFn: (body: object) =>
      authFetch(`${API}/api/clients/${clientId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", clientId] })
      setShowForm(false)
      setNewTitle("")
    },
  })

  const tasks: Task[] = Array.isArray(data?.tasks) ? data.tasks : []
  const pending = tasks.filter((t) => t.status === "pending")
  const completed = tasks.filter((t) => t.status === "completed")

  if (isLoading) return <Skeleton className="h-20 w-full bg-zinc-800" />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium">Задачи</p>
        <Button
          variant="ghost"
          size="xs"
          className="h-6 text-xs text-zinc-500 hover:text-white"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={12} className="mr-1" />
          {showForm ? "Отмена" : "Добавить"}
        </Button>
      </div>

      {/* New task form */}
      {showForm && (
        <div className="space-y-2 mb-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
          <Input
            placeholder="Что нужно сделать?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-8 text-xs bg-zinc-950 border-zinc-800"
          />
          <div className="flex gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="h-7 text-[11px] bg-zinc-950 border-zinc-800 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="h-7 text-[11px] bg-zinc-950 border-zinc-800 w-[130px]"
            />
            <Button
              size="xs"
              className="h-7 text-xs"
              disabled={!newTitle.trim() || addTask.isPending}
              onClick={() => {
                addTask.mutate({ title: newTitle.trim(), task_type: newType, due_date: newDue })
              }}
            >
              {addTask.isPending ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
            </Button>
          </div>
        </div>
      )}

      {/* Pending tasks */}
      {pending.length === 0 && completed.length === 0 && (
        <p className="text-xs text-zinc-600 text-center py-3">Нет задач</p>
      )}

      {pending.map((t) => {
        const info = getTypeInfo(t.type)
        const Icon = info.icon
        return (
          <div key={t.id} className="flex items-start gap-2.5 py-1.5 group">
            <button
              onClick={() => patchTask.mutate({ id: t.id, status: "completed" })}
              className="mt-0.5 shrink-0 text-zinc-600 hover:text-emerald-400 transition-colors"
            >
              <Circle size={14} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Icon size={11} className={info.color} />
                <span className="text-xs text-zinc-300 truncate">{t.title}</span>
              </div>
              {t.due_date && (
                <p className="text-[10px] text-zinc-500 mt-0.5">{t.due_date}</p>
              )}
            </div>
          </div>
        )
      })}

      {/* Completed tasks (collapsible) */}
      {completed.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] text-zinc-600 cursor-pointer hover:text-zinc-400">
            Выполнено ({completed.length})
          </summary>
          <div className="mt-1 space-y-1">
            {completed.map((t) => {
              const info = getTypeInfo(t.type)
              const Icon = info.icon
              return (
                <div key={t.id} className="flex items-start gap-2.5 py-1 opacity-50">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                  <span className="text-xs text-zinc-500 line-through truncate">{t.title}</span>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
