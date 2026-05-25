import { useState, useEffect } from "react"
import { Search, User, Loader2, FileBadge, ClipboardList } from "lucide-react"
import { cn, displayNick } from "@/lib/utils"
import { useFunnelSearch, type FunnelSearchItem } from "@/hooks/use-api"

interface SearchResultsProps {
  onSelect: (clientId: number) => void
}

export function SearchResults({ onSelect }: SearchResultsProps) {
  const [query, setQuery] = useState(() => sessionStorage.getItem("funnel_search_query") || "")
  const [input, setInput] = useState(query)
  const [searchArchived, setSearchArchived] = useState(false)
  const { data, isLoading, error } = useFunnelSearch(query, 20, 0, searchArchived)

  useEffect(() => {
    const stored = sessionStorage.getItem("funnel_search_query")
    if (stored) {
      setQuery(stored)
      setInput(stored)
    }
  }, [])

  const handleSearch = () => {
    if (input.trim().length >= 2) {
      sessionStorage.setItem("funnel_search_query", input.trim())
      setQuery(input.trim())
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Поиск по воронке</h1>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Имя, @username, телефон, статус..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <button
          onClick={() => setSearchArchived(!searchArchived)}
          className={cn(
            "flex items-center gap-1 h-9 px-3 text-xs rounded-lg border transition-colors",
            searchArchived ? "bg-zinc-800 border-zinc-600 text-zinc-300" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white"
          )}
        >
          📦 Архив
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Поиск...
        </div>
      )}

      {error && <div className="text-red-400 text-sm">Ошибка при поиске</div>}

      {data && !isLoading && (
        <>
          <p className="text-xs text-zinc-500">
            Найдено {data.total} {declOfNum(data.total, ["результат", "результата", "результатов"])} по запросу «{data.query}»
          </p>

          <div className="space-y-2">
            {data.items.map((item) => (
              <SearchResultCard key={item.client.id} item={item} onSelect={onSelect} />
            ))}
          </div>

          {data.items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <Search size={40} className="mb-3" />
              <p className="text-sm">Ничего не найдено</p>
            </div>
          )}
        </>
      )}

      {!query && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <Search size={40} className="mb-3" />
          <p className="text-sm">Введите минимум 2 символа для поиска</p>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({ item, onSelect }: { item: FunnelSearchItem; onSelect: (id: number) => void }) {
  return (
    <button
      onClick={() => onSelect(item.client.id)}
      className="w-full text-left p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-800/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <User size={14} className="shrink-0 text-zinc-500" />
            <span className="text-sm font-medium text-white truncate">{item.client.name || "Без имени"}</span>
            {displayNick(item.client.telegram_nick) && (
              <span className="text-xs text-zinc-500 truncate">{displayNick(item.client.telegram_nick)}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
              item.funnel_stage === "Контакт" ? "bg-blue-900/50 text-blue-300" :
              item.funnel_stage === "Выдать контент" ? "bg-amber-900/50 text-amber-300" :
              item.funnel_stage === "Диалог" ? "bg-green-900/50 text-green-300" :
              item.funnel_stage === "В работе" ? "bg-purple-900/50 text-purple-300" :
              item.funnel_stage === "Холодный" ? "bg-zinc-800 text-zinc-400" :
              "bg-zinc-800/50 text-zinc-400"
            }`}>
              {item.funnel_stage}
            </span>
            {item.client.source && <span className="text-[10px] text-zinc-600">{item.client.source}</span>}
          </div>
          {item.client.summary && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{item.client.summary}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
          {item.deal_summary && (
            <span className="flex items-center gap-1" title={`Сделок: ${item.deal_summary.total}`}>
              <FileBadge size={12} />
              {item.deal_summary.total}
            </span>
          )}
          {item.tasks_pending > 0 && (
            <span className="flex items-center gap-1 text-amber-400" title={`Задач: ${item.tasks_pending}`}>
              <ClipboardList size={12} />
              {item.tasks_pending}
            </span>
          )}
          {item.latest_test && (
            <span className="text-[10px] text-zinc-600">{item.latest_test.test_type}</span>
          )}
        </div>
      </div>
    </button>
  )
}

function declOfNum(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}
