import { formatDate } from "@/lib/utils"
import type { Client, Deal } from "@/hooks/use-api"
import { UserPlus, ShoppingCart, FileText, MessageSquare } from "lucide-react"

interface TimelineEvent {
  date: string
  type: "created" | "test" | "deal" | "note"
  title: string
  description: string
}

interface TimelineProps {
  client: Client
  deals: Deal[]
  testResults: {
    id: number
    test_type: string
    diagnosis: string
    freedom_score: number
    sexuality_score: number
    created_at: string
  }[]
  notes?: TimelineEvent[]
}

export function Timeline({ client, deals, testResults, notes = [] }: TimelineProps) {
  const events: TimelineEvent[] = []

  // Client created
  if (client.created_at) {
    events.push({
      date: client.created_at,
      type: "created",
      title: "Клиент создан",
      description: `Источник: ${client.source || "не указан"}`,
    })
  }

  // Test results
  testResults.forEach((t) => {
    events.push({
      date: t.created_at,
      type: "test",
      title: t.test_type === "female" ? "Прошла женский тест" : "Прошёл мужской тест",
      description: `${t.diagnosis} (Свобода: ${t.freedom_score}/40, Сексуальность: ${t.sexuality_score}/60)`,
    })
  })

  // Deals
  deals.forEach((d) => {
    events.push({
      date: d.created_at,
      type: "deal",
      title: `Сделка: ${d.title}`,
      description: `${d.amount.toLocaleString()}₽ — статус: ${d.status}`,
    })
  })

  // User notes (from the notes tab)
  notes.forEach((n) => {
    events.push(n)
  })

  // Sort by date descending
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const iconMap = {
    created: UserPlus,
    test: FileText,
    deal: ShoppingCart,
    note: MessageSquare,
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Нет событий
      </div>
    )
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-zinc-800" />

      {events.map((event, i) => {
        const Icon = iconMap[event.type]
        return (
          <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
            <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex-shrink-0 mt-0.5">
              <Icon size={12} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">
                {formatDate(event.date)}
              </p>
              {event.type === "note" ? (
                <p className="text-sm text-zinc-300 mt-0.5 whitespace-pre-wrap">{event.description}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-zinc-200 mt-0.5">
                    {event.title}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {event.description}
                  </p>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
