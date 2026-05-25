import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Loader2, CheckSquare, Square } from "lucide-react"
import { authFetch, API } from "@/hooks/use-api"

interface ChecklistItem {
  id: number
  task_type: string
  task_id: number
  text: string
  done: number
  order_index: number
}

interface TaskChecklistProps {
  taskType: "assistant" | "anton"
  taskId: number | null
}

export function TaskChecklist({ taskType, taskId }: TaskChecklistProps) {
  const queryClient = useQueryClient()
  const [newText, setNewText] = useState("")
  const [adding, setAdding] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["task-checklist", taskType, taskId],
    queryFn: () => authFetch(`${API}/api/tasks/${taskType}/${taskId}/checklist`).then((r) => r.json()),
    enabled: !!taskId,
  })

  const toggleItem = useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      authFetch(`${API}/api/tasks/${taskType}/${taskId}/checklist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-checklist", taskType, taskId] }),
  })

  const addItem = useMutation({
    mutationFn: (text: string) =>
      authFetch(`${API}/api/tasks/${taskType}/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-checklist", taskType, taskId] })
      setNewText("")
      setAdding(false)
    },
  })

  const deleteItem = useMutation({
    mutationFn: (id: number) =>
      authFetch(`${API}/api/tasks/${taskType}/${taskId}/checklist/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-checklist", taskType, taskId] }),
  })

  const items: ChecklistItem[] = data?.items || []
  const doneCount = items.filter((i) => i.done).length

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-400">
          Чеклист {items.length > 0 && `(${doneCount}/${items.length})`}
        </h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus size={14} />
            Добавить
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Loader2 size={12} className="animate-spin" />
          Загрузка...
        </div>
      )}

      {!isLoading && adding && (
        <div className="flex gap-2 mb-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newText.trim()) addItem.mutate(newText.trim())
              if (e.key === "Escape") { setAdding(false); setNewText("") }
            }}
            onBlur={() => { if (!newText.trim()) setAdding(false) }}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder-zinc-500 focus:border-zinc-500"
            placeholder="Новый пункт... Enter = добавить"
            autoFocus
          />
        </div>
      )}

      {!isLoading && items.length === 0 && !adding && (
        <p className="text-xs text-zinc-600 italic">Нет пунктов</p>
      )}

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-900/50 transition-colors group"
            >
              <button
                onClick={() => toggleItem.mutate({ id: item.id, done: !item.done })}
                className="shrink-0 text-zinc-500 hover:text-emerald-400 transition-colors"
                title={item.done ? "Отметить невыполненным" : "Отметить выполненным"}
              >
                {item.done ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
              </button>
              <span
                className={`flex-1 text-sm ${item.done ? "line-through text-zinc-600" : "text-zinc-200"}`}
              >
                {item.text}
              </span>
              <button
                onClick={() => { if (confirm("Удалить пункт?")) deleteItem.mutate(item.id) }}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                title="Удалить"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
