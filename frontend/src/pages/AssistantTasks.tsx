import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { MessageSquare, Plus, Archive, ArrowLeft, Check, Search } from "lucide-react"

const STAGES = [
  "Входящие и идеи",
  "Очередь",
  "15 задач на неделю",
  "Делаю сейчас",
  "Рефлексия",
  "Готово",
  "Важное",
] as const

const LIMIT = 20

interface AssistantTask {
  id: number
  kaiten_id: number | null
  title: string
  description: string
  status: string
  order_index: number
  comments_count: number
  is_archived: number
  priority: string
  created_at: string
  updated_at: string
}

interface AssistantTasksProps {
  onSelect: (id: number) => void
}

// ─── Stage colour config — новые приглушённые цвета ────────────────────────────
const STAGE_COLORS: Record<string, { headerBg: string; headerText: string; dotColor: string; accentBorder: string }> = {
  "Входящие и идеи":               { headerBg: "bg-zinc-900/80",     headerText: "text-zinc-300",  dotColor: "bg-zinc-500",   accentBorder: "border-t-zinc-500/40" },
  "Очередь":            { headerBg: "bg-blue-950/30",     headerText: "text-blue-300",  dotColor: "bg-blue-500",   accentBorder: "border-t-blue-500/40" },
  "15 задач на неделю": { headerBg: "bg-violet-950/30",   headerText: "text-violet-300",dotColor: "bg-violet-500", accentBorder: "border-t-violet-500/40" },
  "Делаю сейчас":       { headerBg: "bg-amber-950/30",    headerText: "text-amber-300", dotColor: "bg-amber-500",  accentBorder: "border-t-amber-500/40" },
  "Рефлексия":          { headerBg: "bg-cyan-950/30",     headerText: "text-cyan-300",  dotColor: "bg-cyan-500",   accentBorder: "border-t-cyan-500/40" },
  "Готово":             { headerBg: "bg-emerald-950/30",  headerText: "text-emerald-300",dotColor: "bg-emerald-500",accentBorder: "border-t-emerald-500/40" },
  "Важное":             { headerBg: "bg-red-950/30",      headerText: "text-red-300",    dotColor: "bg-red-500",   accentBorder: "border-t-red-500/40" },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "Срочно, важно":    { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Срочно, важно" },
  "Срочно, не важно": { bg: "bg-amber-500/20",   text: "text-amber-400",   label: "Срочно, не важно" },
  "Не срочно, важно": { bg: "bg-blue-500/20",    text: "text-blue-400",    label: "Не срочно, важно" },
}

// ─── Column ───────────────────────────────────────────────────────────────────
function StageColumn({ stage, children, count, total, onAdd }: { stage: string; children: React.ReactNode; count: number; total: number; onAdd: () => void }) {
  const colors = STAGE_COLORS[stage] || STAGE_COLORS["Входящие и идеи"]
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-80 rounded-2xl border flex flex-col transition-all duration-200 bg-zinc-950/30 group",
        isOver ? "border-zinc-600 shadow-lg" : "border-zinc-800/50",
        "border-t-2",
        colors.accentBorder,
      )}
      style={{ maxHeight: "calc(100vh - 180px)" }}
    >
      {/* Header с кнопкой + */}
      <div className={cn("flex items-center justify-between px-4 py-3 rounded-t-2xl", colors.headerBg)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", colors.dotColor)} />
          <span className={cn("text-sm font-semibold tracking-wide truncate", colors.headerText)}>
            {stage}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onAdd}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300"
          >
            <Plus size={16} />
          </button>
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-900/60",
            colors.headerText
          )}>
            {count}/{total}
          </span>
        </div>
      </div>

      {/* Cards area */}
      <ScrollArea className="flex-1 px-3 py-3">
        {total === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-zinc-600 italic">
            Нет задач
          </div>
        )}
        {children}
      </ScrollArea>
    </div>
  )
}

// ─── Card — новый дизайн ──────────────────────────────────────────────────────
function SortableTaskCard({ task, isDragging, onArchive }: {
  task: AntonTask
  isDragging?: boolean
  onArchive?: (taskId: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `task-${task.id}`,
    data: { task, stage: task.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-4 rounded-xl transition-all duration-150 mb-3 group/card",
        "bg-zinc-800 border border-zinc-700 shadow-md",
        "hover:shadow-lg hover:border-zinc-600",
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 scale-[0.97] ring-2 ring-zinc-500",
      )}
      {...listeners}
      {...attributes}
    >
      <p className="text-base font-semibold text-zinc-100 leading-tight">
        {task.title || "Без названия"}
      </p>
      {task.priority && PRIORITY_COLORS[task.priority] && (
        <div className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-2", PRIORITY_COLORS[task.priority].bg, PRIORITY_COLORS[task.priority].text)}>
          {task.priority}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        {task.comments_count > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <MessageSquare size={13} />
            <span>{task.comments_count}</span>
          </div>
        ) : <div />}
        {onArchive && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onArchive(task.id)
            }}
            className="opacity-0 group-hover/card:opacity-100 text-zinc-500 hover:text-emerald-400 transition-all"
            title="В архив"
          >
            <Check size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Inline create input ──────────────────────────────────────────────────────
function InlineCreateInput({ stage, onDone }: { stage: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const createTask = useMutation({
    mutationFn: (title: string) =>
      authFetch(`${API}/api/assistant-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status: stage }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-tasks"] })
      setValue("")
      onDone()
    },
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="px-3 pb-3">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            createTask.mutate(value.trim())
          }
          if (e.key === "Escape") {
            onDone()
          }
        }}
        onBlur={() => {
          if (!value.trim()) onDone()
          else createTask.mutate(value.trim())
        }}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none placeholder-zinc-500 focus:border-zinc-500"
        placeholder="Название задачи... Enter = создать"
      />
    </div>
  )
}

// ─── DragOverlay preview ──────────────────────────────────────────────────────
function TaskCardPreview({ task }: { task: AntonTask }) {
  return (
    <div className="w-80 p-4 rounded-xl bg-zinc-800 border border-zinc-600 shadow-2xl -rotate-[2deg]">
      <p className="text-base font-semibold text-zinc-100 leading-tight">
        {task.title || "Без названия"}
      </p>
      {task.priority && PRIORITY_COLORS[task.priority] && (
        <div className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-2", PRIORITY_COLORS[task.priority].bg, PRIORITY_COLORS[task.priority].text)}>
          {task.priority}
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export function AssistantTasks({ onSelect }: AssistantTasksProps) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["assistant-tasks", showArchived],
    queryFn: () => authFetch(`${API}/api/assistant-tasks${showArchived ? '?archived=true' : ''}`).then((r) => r.json()),
    staleTime: 30_000,
  })

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`${API}/api/assistant-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-tasks"] })
    },
  })

  const archiveTask = useMutation({
    mutationFn: (taskId: number) =>
      authFetch(`${API}/api/assistant-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: true }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-tasks"] })
    },
  })

  const reorderTasks = useMutation({
    mutationFn: ({ status, orderedIds }: { status: string; orderedIds: number[] }) =>
      authFetch(`${API}/api/assistant-tasks/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          items: orderedIds.map((id, idx) => ({ task_id: id, order_index: idx })),
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-tasks"] })
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const tasks = useMemo(() => {
    let all = data?.tasks || []
    if (search) {
      const q = search.toLowerCase()
      all = all.filter((t: any) => (t.title || "").toLowerCase().includes(q))
    }
    return all
  }, [data, search])

  const byStatus: Record<string, AssistantTask[]> = useMemo(() => {
    const map: Record<string, AssistantTask[]> = {}
    STAGES.forEach((s) => (map[s] = []))
    tasks.forEach((t: AntonTask) => {
      if (map[t.status]) map[t.status].push(t)
    })
    return map
  }, [tasks])

  const activeTask = useMemo(() => {
    if (!activeId) return null
    const id = parseInt(String(activeId).replace("task-", ""))
    return tasks.find((t: AntonTask) => t.id === id) || null
  }, [activeId, tasks])

  const [items, setItems] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const next: Record<string, string[]> = {}
    STAGES.forEach((s) => {
      next[s] = (byStatus[s] || []).map((t) => `task-${t.id}`)
    })
    setItems(next)
  }, [byStatus])

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const findStage = useCallback((id: string): string | null => {
    if (id.startsWith("stage-")) return id.replace("stage-", "")
    for (const stage of STAGES) {
      if (items[stage]?.includes(id)) return stage
    }
    return null
  }, [items])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)

    const from = findStage(activeId)
    const to = overId.startsWith("stage-")
      ? overId.replace("stage-", "")
      : findStage(overId)

    if (!from || !to || from === to) return

    setItems((prev) => {
      // Cross-column move
      const source = [...(prev[from] || [])]
      const target = [...(prev[to] || [])]
      const srcIdx = source.indexOf(activeId)
      if (srcIdx === -1) return prev
      source.splice(srcIdx, 1)
      const overIdx = target.indexOf(overId)
      target.splice(overIdx >= 0 ? overIdx : target.length, 0, activeId)
      return { ...prev, [from]: source, [to]: target }
    })
  }, [findStage])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const activeId = String(active.id)
      const overId = String(over.id)
      const taskId = parseInt(activeId.replace("task-", ""))
      const task = tasks.find((t: AntonTask) => t.id === taskId)
      if (!task) return

      let targetStage = overId.startsWith("stage-")
        ? overId.replace("stage-", "")
        : findStage(overId)

      if (!targetStage) return

      // Compute the final column order for persistence
      let columnIds: string[]
      const fromStage = findStage(activeId)
      if (fromStage === targetStage) {
        // Within-column: reorder in the items array
        const currentItems = [...(items[targetStage] || [])]
        const oldIdx = currentItems.indexOf(activeId)
        const newIdx = currentItems.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1) {
          currentItems.splice(oldIdx, 1)
          currentItems.splice(newIdx, 0, activeId)
        }
        columnIds = currentItems
        setItems((prev) => ({ ...prev, [targetStage]: currentItems }))
      } else {
        // Cross-column: handleDragOver already updated items
        columnIds = items[targetStage] || []
      }

      const allIdsInStage = columnIds
        .map((id) => parseInt(String(id).replace("task-", "")))
        .filter((id) => !isNaN(id))

      if (task.status !== targetStage) {
        updateTask.mutate({ id: taskId, status: targetStage })
      }
      if (allIdsInStage.length > 0) {
        reorderTasks.mutate({ status: targetStage, orderedIds: allIdsInStage })
      }
    },
    [tasks, items, updateTask, reorderTasks, findStage],
  )

  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Задачи ассистента</h1>
          <p className="text-sm text-zinc-500 mt-1">Загрузка...</p>
        </div>
        <AntonsTasksSkeleton />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          {showArchived ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowArchived(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-white">Архив задач</h1>
                <p className="text-sm text-zinc-500 mt-1">{tasks.length} завершённых задач</p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white">Задачи ассистента</h1>
              <p className="text-sm text-zinc-500 mt-1">
                {tasks.length} задач · перетащи карточку в другую колонку
              </p>
            </>
          )}
        </div>
        {!showArchived && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 gap-1.5"
          >
            <Archive size={14} />
            Архив
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Поиск по названию задачи..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 h-9 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-600 transition-colors"
        />
      </div>

      {showArchived ? (
        <ArchivedView tasks={tasks} onSelect={onSelect} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-5 overflow-x-auto pb-6" style={{ minHeight: "60vh" }}>
            {STAGES.map((stage) => {
              const allStageTasks = byStatus[stage] || []
              const cardIds = items[stage] || []
              const sortedTasks = cardIds
                .map((id) => tasks.find((t: AntonTask) => `task-${t.id}` === id))
                .filter(Boolean) as AssistantTask[]
              const visible = expanded[stage] ? sortedTasks : sortedTasks.slice(0, LIMIT)
              const remaining = allStageTasks.length - LIMIT
              const shownCount = visible.length

              return (
                <StageColumn key={stage} stage={stage} count={shownCount} total={allStageTasks.length} onAdd={() => setCreatingIn(stage)}>
                  {creatingIn === stage && (
                    <InlineCreateInput
                      stage={stage}
                      onDone={() => setCreatingIn(null)}
                    />
                  )}
                  <SortableContext
                    items={cardIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {visible.map((t) => (
                      <div key={t.id} onClick={() => onSelect(t.id)}>
                        <SortableTaskCard
                          task={t}
                          isDragging={activeId === `task-${t.id}`}
                          onArchive={(id) => archiveTask.mutate(id)}
                        />
                      </div>
                    ))}
                  </SortableContext>

                  {remaining > 0 && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [stage]: true }))}
                      className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800/30 mb-2"
                    >
                      + {remaining} ещё
                    </button>
                  )}

                  <button
                    onClick={() => setCreatingIn(stage)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800/30 mb-1"
                  >
                    <Plus size={14} />
                    Добавить задачу
                  </button>
                </StageColumn>
              )
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? <TaskCardPreview task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

// ─── Archived View ────────────────────────────────────────────────────────────
function ArchivedView({ tasks, onSelect }: { tasks: AssistantTask[]; onSelect: (id: number) => void }) {
  const sorted = useMemo(() =>
    [...tasks].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [tasks]
  )

  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <p className="text-sm text-zinc-600 italic">Архив пуст</p>
      )}
      {sorted.map((t) => (
        <div
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="bg-zinc-800/80 border border-zinc-700 rounded-xl px-5 py-4 hover:border-zinc-600 transition-colors cursor-pointer"
        >
          <p className="text-base font-semibold text-zinc-200">{t.title}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-zinc-500">{t.status}</span>
            {t.priority && PRIORITY_COLORS[t.priority] && (
              <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", PRIORITY_COLORS[t.priority].bg, PRIORITY_COLORS[t.priority].text)}>{t.priority}</span>
            )}
            {t.comments_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-zinc-600">
                <MessageSquare size={12} />
                {t.comments_count}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function AntonsTasksSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
      {STAGES.map((_, i) => (
        <div key={i} className="flex-shrink-0 w-80 rounded-2xl border border-zinc-800/50 bg-zinc-950/30 border-t-2 border-t-zinc-700/30">
          <div className="px-5 py-3.5 border-b border-zinc-800/30">
            <Skeleton className="h-5 w-24 bg-zinc-800" />
          </div>
          <div className="p-3 space-y-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="p-4 rounded-xl bg-zinc-800 border border-zinc-700">
                <Skeleton className="h-5 w-32 bg-zinc-700 mb-2.5" />
                <Skeleton className="h-3 w-16 bg-zinc-700/60" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default AssistantTasks
