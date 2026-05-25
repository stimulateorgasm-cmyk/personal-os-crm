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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatDate, tgLink } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { Loader2 } from "lucide-react"
import type { Client } from "@/hooks/use-api"

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

function getAssignee(source: string | null | undefined): string {
  if (!source) return "Антон"
  return ASSIGNEE_LABELS[source] || "Антон"
}

function AssigneeBadge({ assignee }: { assignee: string }) {
  const isAssistant = assignee === "Ассистент"
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium leading-none",
      isAssistant ? "bg-purple-950/30 text-purple-400" : "bg-blue-950/30 text-blue-400"
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
function SortableCard({ client, isDragging }: { client: Client; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `client-${client.id}`,
    data: { client, stage: client.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const colors = STAGE_COLORS[client.status] || STAGE_COLORS["Контакт"]
  const assignee = getAssignee(client.source)

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
        <AssigneeBadge assignee={assignee} />
        {client.source && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
            {client.source}
          </Badge>
        )}
        {client.telegram_nick && (
          <a
            href={tgLink(client.telegram_nick) || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-zinc-500 hover:text-blue-400 truncate"
          >
            @{client.telegram_nick}
          </a>
        )}
      </div>
      {client.last_contact && (
        <p className="text-xs text-zinc-600 mt-2.5">
          {formatDate(client.last_contact)}
        </p>
      )}
    </div>
  )
}

// ─── DragOverlay preview ───────────────────────────────────────────────────────
function CardPreview({ client }: { client: Client }) {
  return (
    <div className="w-80 p-4 rounded-xl bg-zinc-800/90 border border-zinc-600 shadow-2xl -rotate-[2deg] backdrop-blur-sm">
      <p className="text-base font-semibold text-white leading-tight">
        {client.name || "Без имени"}
      </p>
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {client.source && (
          <span className="inline-flex items-center rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
            {client.source}
          </span>
        )}
        {client.telegram_nick && (
          <span className="text-sm text-zinc-400 truncate">
            @{client.telegram_nick}
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

// ─── Main component ────────────────────────────────────────────────────────────
const LIMIT = 50

export function Funnel({ onSelect }: FunnelProps) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const clickedRef = useRef(false)

  const { data: allClients, isLoading } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => authFetch(`${API}/api/clients?limit=3000`).then((r) => r.json()),
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },        // увеличен порог — меньше ложных драгов
    }),
  )

  const clients = useMemo(() => allClients?.clients || [], [allClients])

  const byStatus: Record<string, Client[]> = useMemo(() => {
    const map: Record<string, Client[]> = {}
    STAGES.forEach((s) => (map[s] = []))
    clients.forEach((c) => {
      if (map[c.status]) map[c.status].push(c)
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

    if (!sourceStage || !targetStage || sourceStage === targetStage) return

    // Move item visually between columns
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

      if (targetStage && STAGES.includes(targetStage as any) && client.status !== targetStage) {
        updateStatus.mutate({ id: clientId, status: targetStage })
      }
    },
    [clients, updateStatus],
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
        <h1 className="text-xl font-semibold text-white">Воронка продаж</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {stats?.total_clients?.toLocaleString() || 0} контактов · перетащи карточку в другую колонку
        </p>
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
                      <SortableCard
                        client={c}
                        isDragging={activeId === `client-${c.id}`}
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
    </div>
  )
}
