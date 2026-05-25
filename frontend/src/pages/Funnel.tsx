import React, { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { Search, Plus, X, CalendarClock, FileText, CircleCheck } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatDate, tgLink, displayNick } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { Loader2 } from "lucide-react"
import type { Client } from "@/hooks/use-api"
import { AddContactDialog } from "@/components/AddContactDialog"
import { QuickDatePicker } from "@/components/QuickDatePicker"

const STAGES = [
  "Контакт",
  "Выдать контент",
  "Квалифицировать",
  "Довести до решения",
  "Проработать",
  "Работа завершена (Архив)",
] as const

interface FunnelProps {
  onSelect: (id: number) => void
}

// ─── Stage colour config ──────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, { headerBg: string; headerText: string; dotColor: string; cardBg: string; cardBorder: string }> = {
  "Контакт":            { headerBg: "bg-blue-950/20",  headerText: "text-blue-400",  dotColor: "bg-blue-500",  cardBg: "bg-blue-950/5",  cardBorder: "border-blue-900/20" },
  "Выдать контент":     { headerBg: "bg-orange-950/20",headerText: "text-orange-400",dotColor: "bg-orange-500", cardBg: "bg-orange-950/5", cardBorder: "border-orange-900/20" },
  "Квалифицировать":    { headerBg: "bg-purple-950/20",headerText: "text-purple-400",dotColor: "bg-purple-500", cardBg: "bg-purple-950/5", cardBorder: "border-purple-900/20" },
  "Довести до решения": { headerBg: "bg-emerald-950/20",headerText: "text-emerald-400", dotColor: "bg-emerald-500", cardBg: "bg-emerald-950/5", cardBorder: "border-emerald-900/20" },
  "Проработать":        { headerBg: "bg-rose-950/20",  headerText: "text-rose-400",  dotColor: "bg-rose-500",  cardBg: "bg-rose-950/5",  cardBorder: "border-rose-900/20" },
  "Работа завершена (Архив)": { headerBg: "bg-zinc-950/20", headerText: "text-zinc-400", dotColor: "bg-zinc-500", cardBg: "bg-zinc-950/5", cardBorder: "border-zinc-900/20" },
}

const ASSIGNEE_LABELS: Record<string, string> = {
  "Личка": "Антон",
  "Ассистент": "Ассистент",
  "Женский тест": "Ассистент",
  "Мужской тест": "Ассистент",
}

function getAssigneeLabel(source: string | null | undefined, responsible_person?: string | null): string {
  // Если ответственный явно назначен — его и показываем
  if (responsible_person === "assistant") return "Ассистент"
  if (responsible_person === "personal") return "Антон"
  // Fallback на старую логику (из source)
  if (!source) return "Антон"
  return ASSIGNEE_LABELS[source] || "Антон"
}

function AssigneeBadge({ assignee, className }: { assignee: string; className?: string }) {
  const isAssistant = assignee === "Ассистент"
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium leading-none",
      isAssistant ? "bg-purple-950/30 text-purple-400" : "bg-blue-950/30 text-blue-400",
      className
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", isAssistant ? "bg-purple-500" : "bg-blue-500")} />
      {assignee}
    </span>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────
function StageColumn({ stage, children, count }: { stage: string; children: React.ReactNode; count: number }) {
  const colors = STAGE_COLORS[stage] || STAGE_COLORS["Контакт"]
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-80 rounded-2xl border flex flex-col transition-all duration-200",
        isOver ? "border-zinc-600 shadow-lg" : "border-zinc-800/50",
        colors.headerBg
      )}
      style={{ maxHeight: "calc(100vh - 180px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/30">
        <div className="flex items-center gap-2.5">
          <div className={cn("w-2.5 h-2.5 rounded-full", colors.dotColor)} />
          <span className={cn("text-sm font-semibold tracking-wide", colors.headerText)}>
            {stage}
          </span>
        </div>
        <span className={cn(
          "text-xs font-bold px-2.5 py-1 rounded-full",
          colors.headerBg.replace("/20", "/40"),
          colors.headerText
        )}>
          {count}
        </span>
      </div>

      {/* Cards area */}
      <ScrollArea className="flex-1 px-3 py-3">
        {count === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-zinc-600 italic">
            Нет контактов
          </div>
        )}
        {children}
      </ScrollArea>
    </div>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────────────
function SortableCard({ client, isDragging, onCreateTask }: {
  client: Client; isDragging?: boolean; onCreateTask?: (clientId: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `client-${client.id}`,
    data: { client, stage: client.status },
  })
  const queryClient = useQueryClient()
  const [editingSource, setEditingSource] = useState(false)
  const [editingAssignee, setEditingAssignee] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const colors = STAGE_COLORS[client.status] || STAGE_COLORS["Контакт"]
  const assignee = getAssigneeLabel(client.source, client.responsible_person)

  const patchSource = useMutation({
    mutationFn: (source: string) =>
      authFetch(`${API}/api/clients/${client.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      }).then((r) => r.json()),
    onSuccess: () => {
      // Оптимистично обновляем только эту карточку, без полной перезагрузки списка
      queryClient.setQueriesData({ queryKey: ["clients"] }, (old: any) => {
        if (!old?.clients) return old
        return {
          ...old,
          clients: old.clients.map((c: any) =>
            c.id === client.id ? { ...c, source: patchSource.variables } : c
          ),
        }
      })
      setEditingSource(false)
    },
  })

  const patchAssignee = useMutation({
    mutationFn: (responsible_person: string) =>
      authFetch(`${API}/api/clients/${client.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsible_person }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.setQueriesData({ queryKey: ["clients"] }, (old: any) => {
        if (!old?.clients) return old
        return {
          ...old,
          clients: old.clients.map((c: any) =>
            c.id === client.id ? { ...c, responsible_person: patchAssignee.variables } : c
          ),
        }
      })
      setEditingAssignee(false)
    },
  })

  const SOURCES = ["Личка", "Ассистент", "Женский тест", "Мужской тест", "Ручной ввод", "Бот"]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-4 rounded-xl transition-all duration-150 mb-3",
        "hover:shadow-md",
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 scale-[0.97]",
        colors.cardBg,
        "border",
        colors.cardBorder,
      )}
      {...listeners}
      {...attributes}
    >
      <p className="text-base font-semibold text-white leading-tight">
        {client.name || "Без имени"}
      </p>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {/* Assignee: кликабельно */}
        {editingAssignee ? (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {["Антон", "Ассистент"].map((a) => (
              <button
                key={a}
                onClick={() => patchAssignee.mutate(a === "Ассистент" ? "assistant" : "personal")}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-md font-medium transition-colors min-h-[32px] touch-manipulation",
                  assignee === a
                    ? a === "Ассистент" ? "bg-purple-500/30 text-purple-300" : "bg-blue-500/30 text-blue-300"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                )}
              >
                {a}
              </button>
            ))}
            <button onClick={() => setEditingAssignee(false)} className="text-[10px] text-zinc-600 px-1">✕</button>
          </div>
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditingAssignee(true) }}
            className="cursor-pointer"
          >
            <AssigneeBadge assignee={assignee} />
          </span>
        )}

        {/* Source: кликабельно */}
        {editingSource ? (
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            {SOURCES.map((s) => (
              <button
                key={s}
                onClick={() => patchSource.mutate(s)}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors min-h-[28px] touch-manipulation",
                  client.source === s
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-800/50 text-zinc-600 hover:text-zinc-400"
                )}
              >
                {s}
              </button>
            ))}
            <button onClick={() => setEditingSource(false)} className="text-[10px] text-zinc-600 px-1">✕</button>
          </div>
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditingSource(true) }}
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors",
              "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            )}
          >
            {client.source || "Нет источника"}
          </span>
        )}

        {client.telegram_nick && (
          <a
            href={tgLink(client.telegram_nick) || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-zinc-500 hover:text-blue-400 truncate"
          >
            {displayNick(client.telegram_nick)}
          </a>
        )}
      </div>
      {/* Tags */}
      {Array.isArray(client.tags) && client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {(client.tags as any[]).slice(0, 4).map((tag: any) => (
            <span
              key={tag.id}
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium leading-none"
              style={{
                backgroundColor: tag.color + "33",
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
          {(client.tags as any[]).length > 4 && (
            <span className="text-[9px] text-zinc-500 px-1 py-0.5">+{client.tags.length - 4}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2.5">
        {client.last_contact ? (
          <p className="text-xs text-zinc-600">{formatDate(client.last_contact)}</p>
        ) : <div className="flex-1" />}
        <div className="flex items-center gap-2.5 ml-auto">
          {client.deal_count != null && client.deal_count > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-amber-400/90 font-medium" title={`Сделок: ${client.deal_count}`}>
              <FileText size={18} />
              {client.deal_count}
            </span>
          )}
          {client.tasks_pending != null && client.tasks_pending > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-500/90 font-medium" title={`Задач: ${client.tasks_pending}`}>
              <CircleCheck size={18} />
              {client.tasks_pending}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onCreateTask?.(client.id) }}
            className="text-zinc-600 hover:text-emerald-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            title="Добавить задачу"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DragOverlay preview ───────────────────────────────────────────────────────
function CardPreview({ client }: { client: Client }) {
  const assignee = getAssigneeLabel(client.source, client.responsible_person)
  return (
    <div className="w-80 p-4 rounded-xl bg-zinc-800/90 border border-zinc-600 shadow-2xl -rotate-[2deg] backdrop-blur-sm">
      <p className="text-base font-semibold text-white leading-tight">
        {client.name || "Без имени"}
      </p>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        <AssigneeBadge assignee={assignee} />
        {client.source && (
          <span className="inline-flex items-center rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
            {client.source}
          </span>
        )}
        {client.telegram_nick && (
          <span className="text-sm text-zinc-400 truncate">
            {displayNick(client.telegram_nick)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton for loading state ────────────────────────────────────────────────
function FunnelSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
      {STAGES.map((_, i) => (
        <div key={i} className="flex-shrink-0 w-80 rounded-2xl border border-zinc-800/50 bg-zinc-950/30">
          <div className="px-5 py-3.5 border-b border-zinc-800/30">
            <Skeleton className="h-5 w-24 bg-zinc-800" />
          </div>
          <div className="p-3 space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800/60">
                <Skeleton className="h-5 w-32 bg-zinc-800 mb-2.5" />
                <Skeleton className="h-4 w-20 bg-zinc-800/60" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Load/save card order in localStorage ─────────────────────────────────────
function loadOrder(stage: string): string[] {
  try {
    const raw = localStorage.getItem(`funnel-order-${stage}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveOrder(stage: string, ids: string[]) {
  localStorage.setItem(`funnel-order-${stage}`, JSON.stringify(ids))
}

// ─── Main component ────────────────────────────────────────────────────────────
const LIMIT = 50

export function Funnel({ onSelect }: FunnelProps) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [taskClientId, setTaskClientId] = useState<number | null>(null)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState("")
  const [taskType, setTaskType] = useState("follow_up")
  const clickedRef = useRef(false)

  const { data: allClients, isLoading } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => authFetch(`${API}/api/clients?limit=3000&archived=false`).then((r) => r.json()),
    staleTime: 120_000,
  })

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => authFetch(`${API}/api/stats`).then((r) => r.json()),
    staleTime: 60_000,
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authFetch(`${API}/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["stats"] })
    },
  })

  const createTask = useMutation({
    mutationFn: ({ clientId, title, due, type }: { clientId: number; title: string; due: string; type: string }) =>
      authFetch(`${API}/api/clients/${clientId}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, task_type: type, due_date: due }),
      }).then((r) => r.json()),
    onSuccess: (data, variables) => {
      // Optimistic update — сразу показываем иконку задачи на карточке
      queryClient.setQueryData(["clients", "all"], (old: any) => {
        if (!old?.clients) return old
        return {
          ...old,
          clients: old.clients.map((c: any) =>
            c.id === variables.clientId
              ? { ...c, tasks_pending: (c.tasks_pending || 0) + 1 }
              : c
          ),
        }
      })
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      setTaskClientId(null)
      setTaskTitle("")
      setTaskDue("")
      setTaskType("follow_up")
    },
  })

  const handleCreateTask = (clientId: number) => {
    if (taskClientId === clientId) {
      // Clicked again while form open — submit if title is filled
      if (taskTitle.trim()) {
        createTask.mutate({ clientId, title: taskTitle.trim(), due: taskDue, type: taskType })
      }
    } else {
      setTaskClientId(clientId)
      setTaskTitle("")
      setTaskDue("")
      setTaskType("follow_up")
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },        // увеличен порог — меньше ложных драгов
    }),
  )

  const clients = useMemo(() => {
    const raw = allClients?.clients || []
    if (!searchQuery.trim()) return raw
    const q = searchQuery.trim().toLowerCase()
    return raw.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.telegram_nick && c.telegram_nick.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)),
    )
  }, [allClients, searchQuery])

  const byStatus: Record<string, Client[]> = useMemo(() => {
    const map: Record<string, Client[]> = {}
    STAGES.forEach((s) => (map[s] = []))
    clients.forEach((c) => {
      if (map[c.status]) map[c.status].push(c)
    })
    // Apply saved order — append unknown clients at the end
    STAGES.forEach((s) => {
      // "Контакт" сортируем по last_contact — последние переписки сверху
      if (s === "Контакт") {
        map[s].sort((a, b) => {
          if (!a.last_contact && !b.last_contact) return 0
          if (!a.last_contact) return 1
          if (!b.last_contact) return -1
          return b.last_contact.localeCompare(a.last_contact)
        })
        return
      }
      const savedIds = loadOrder(s)
      if (savedIds.length > 0) {
        const sorted: Client[] = []
        const remaining: Client[] = []
        const idSet = new Set(savedIds)
        for (const c of map[s]) {
          const key = `client-${c.id}`
          const idx = savedIds.indexOf(key)
          if (idx >= 0) sorted[idx] = c
          else remaining.push(c)
        }
        map[s] = sorted.filter(Boolean).concat(remaining)
      }
    })
    return map
  }, [clients])

  const activeClient = useMemo(() => {
    if (!activeId) return null
    const id = parseInt(String(activeId).replace("client-", ""))
    return clients.find((c) => c.id === id) || null
  }, [activeId, clients])

  // Track item positions for smooth cross-column dragging
  const [items, setItems] = useState<Record<string, string[]>>({})

  // Sync items from byStatus
  useEffect(() => {
    const next: Record<string, string[]> = {}
    STAGES.forEach((s) => {
      next[s] = (byStatus[s] || []).map((c) => `client-${c.id}`)
    })
    setItems(next)
  }, [byStatus])

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIdStr = String(active.id)
    const overIdStr = String(over.id)

    // Find source and target containers
    let sourceStage: string | null = null
    let targetStage: string | null = null

    for (const stage of STAGES) {
      if (items[stage]?.includes(activeIdStr)) sourceStage = stage
    }
    if (overIdStr.startsWith("stage-")) {
      targetStage = overIdStr.replace("stage-", "")
    } else {
      for (const stage of STAGES) {
        if (items[stage]?.includes(overIdStr)) targetStage = stage
      }
    }

    if (!sourceStage || !targetStage) return

    // Reorder within the same column
    if (sourceStage === targetStage) {
      setItems((prev) => {
        const list = [...(prev[sourceStage!] || [])]
        const overIndex = list.indexOf(overIdStr)
        const activeIndex = list.indexOf(activeIdStr)
        if (activeIndex === -1 || overIndex === -1) return prev
        list.splice(activeIndex, 1)
        list.splice(overIndex, 0, activeIdStr)
        return { ...prev, [sourceStage!]: list }
      })
      return
    }

    // Move item between columns
    setItems((prev) => {
      const source = [...(prev[sourceStage!] || [])]
      const target = [...(prev[targetStage!] || [])]
      const overIndex = target.indexOf(overIdStr)
      const activeIndex = source.indexOf(activeIdStr)

      if (activeIndex === -1) return prev

      source.splice(activeIndex, 1)
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, activeIdStr)

      return { ...prev, [sourceStage!]: source, [targetStage!]: target }
    })
  }, [items])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over) return

      const clientId = parseInt(String(active.id).replace("client-", ""))
      const client = clients.find((c) => c.id === clientId)
      if (!client) return

      const overId = String(over.id)
      let targetStage: string | null = null

      if (overId.startsWith("stage-")) {
        targetStage = overId.replace("stage-", "")
      } else {
        for (const stage of STAGES) {
          if (items[stage]?.includes(overId)) targetStage = stage
        }
      }

      if (!targetStage || !STAGES.includes(targetStage as any)) return

      // Save the new order from items state to localStorage for the target stage
      if (items[targetStage]) {
        saveOrder(targetStage, items[targetStage])
      }

      // If status changed — persist to server
      if (client.status !== targetStage) {
        updateStatus.mutate({ id: clientId, status: targetStage })
      }
    },
    [clients, items, updateStatus],
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Воронка продаж</h1>
          <p className="text-sm text-zinc-500 mt-1">Загрузка...</p>
        </div>
        <FunnelSkeleton />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Воронка продаж</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {stats?.total_clients?.toLocaleString() || 0} контактов · перетащи карточку в другую колонку
              {searchQuery.trim() && (
                <span className="text-amber-400 ml-1">
                  · фильтр: «{searchQuery.trim()}»
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 whitespace-nowrap min-h-[44px] min-w-[44px] touch-manipulation"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Добавить контакт</span>
            </Button>
            <div className="relative w-48 sm:w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Фильтр по воронке..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 min-h-[28px] min-w-[28px] flex items-center justify-center touch-manipulation"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-5 overflow-x-auto pb-6" style={{ minHeight: "60vh" }}>
          {STAGES.map((stage) => {
            const cardIds = items[stage] || []
            const stageClients = cardIds
              .map((id) => clients.find((c) => `client-${c.id}` === id))
              .filter(Boolean) as Client[]
            return (
              <StageColumn key={stage} stage={stage} count={stageClients.length}>
                <SortableContext
                  items={cardIds}
                  strategy={verticalListSortingStrategy}
                >
                  {stageClients.slice(0, expanded[stage] ? undefined : LIMIT).map((c) => (
                    <div key={c.id} onClick={() => onSelect(c.id)}>
                      {taskClientId === c.id && (
                        <div
                          className="mb-2 p-3 rounded-lg bg-zinc-900 border border-zinc-700 space-y-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              value={taskTitle}
                              onChange={(e) => setTaskTitle(e.target.value)}
                              placeholder="Название задачи..."
                              className="flex-1 h-9 px-2 text-xs rounded bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setTaskClientId(null)
                                if (e.key === "Enter" && taskTitle.trim()) {
                                  createTask.mutate({ clientId: c.id, title: taskTitle.trim(), due: taskDue, type: taskType })
                                }
                              }}
                            />
                            <button
                              onClick={() => setTaskClientId(null)}
                              className="text-zinc-600 hover:text-zinc-300 min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <X size={16} />
                            </button>
                          </div>
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
                                onClick={() => setTaskType(t.value)}
                                className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors min-h-[28px] touch-manipulation ${
                                  taskType === t.value
                                    ? "bg-emerald-600/30 text-emerald-300"
                                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <QuickDatePicker
                              value={taskDue}
                              onChange={setTaskDue}
                            >
                              <button className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors min-h-[32px] touch-manipulation">
                                <CalendarClock size={14} />
                                {taskDue ? taskDue.replace("T", " ") : "Срок"}
                              </button>
                            </QuickDatePicker>
                            <button
                              onClick={() => {
                                createTask.mutate({ clientId: c.id, title: taskTitle.trim(), due: taskDue, type: taskType })
                              }}
                              disabled={!taskTitle.trim() || createTask.isPending}
                              className="ml-auto h-8 px-3 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
                            >
                              {createTask.isPending ? "..." : "Создать"}
                            </button>
                          </div>
                        </div>
                      )}
                      <SortableCard
                        client={c}
                        isDragging={activeId === `client-${c.id}`}
                        onCreateTask={handleCreateTask}
                      />
                    </div>
                  ))}
                </SortableContext>
                {stageClients.length > LIMIT && !expanded[stage] && (
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [stage]: true }))}
                    className="w-full py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800/30"
                  >
                    + {stageClients.length - LIMIT} ещё
                  </button>
                )}
              </StageColumn>
            )
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeClient ? <CardPreview client={activeClient} /> : null}
        </DragOverlay>
      </DndContext>

      <AddContactDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSelectClient={onSelect}
      />
    </div>
  )
}
