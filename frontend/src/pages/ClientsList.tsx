import { useState, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime, getStatusStyle, getAvatarUrl, cn, STAGES, tgLink, displayNick } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import type { Client } from "@/hooks/use-api"

const LIMIT = 50

interface ClientsListProps {
  onSelect: (id: number) => void
  selectedId: number | null
}

export function ClientsList({ onSelect, selectedId }: ClientsListProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [effectiveSearch, setEffectiveSearch] = useState("")
  const [allClients, setAllClients] = useState<Client[]>([])
  const [offset, setOffset] = useState(0)
  const totalRef = useRef(0)

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setAllClients([])
    setOffset(0)
    setTimeout(() => setEffectiveSearch(v), 300)
  }

  const handleStatusChange = (v: string) => {
    setStatusFilter(v)
    setAllClients([])
    setOffset(0)
  }

  const params = new URLSearchParams()
  if (effectiveSearch) params.set("search", effectiveSearch)
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter)
  if (statusFilter === "archived") { params.set("archived", "true"); params.delete("status") }
  else params.set("archived", "false")
  params.set("limit", String(LIMIT))
  params.set("offset", String(offset))

  const { data, isLoading, isError } = useQuery({
    queryKey: ["clients", effectiveSearch, statusFilter, offset],
    queryFn: () => authFetch(`${API}/api/clients?${params}`).then((r) => r.json()),
  })

  // Accumulate clients when new page loads
  useEffect(() => {
    if (data?.clients) {
      totalRef.current = data.total || 0
      setAllClients(prev => {
        if (offset === 0) return data.clients
        const existingIds = new Set(prev.map(c => c.id))
        const newOnes = data.clients.filter((c: Client) => !existingIds.has(c.id))
        return [...prev, ...newOnes]
      })
    }
  }, [data, offset])

  const total = totalRef.current
  const hasMore = allClients.length < total

  const loadMore = () => {
    setOffset(prev => prev + LIMIT)
  }

  // Strict guard against undefined data
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-zinc-500">Ошибка загрузки. Попробуй обновить страницу.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Контакты</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} контактов
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени или @username..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-800"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[180px] h-9 text-sm bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {[...STAGES].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
            <SelectItem value="archived">📦 Архив</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Имя
                </div>
              </TableHead>
              <TableHead>@ник</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Статус
                </div>
              </TableHead>
              <TableHead>Ответственный</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Посл. контакт
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && allClients.length === 0 && (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            )}
            {allClients.map((c) => (
              <TableRow
                key={c.id}
                className={cn(
                  "cursor-pointer",
                  selectedId === c.id && "bg-zinc-800/30"
                )}
                onClick={() => onSelect(c.id)}
              >
                <TableCell>
                  <Avatar className="h-8 w-8">
                    {getAvatarUrl(c.telegram_nick) ? (
                      <AvatarImage src={getAvatarUrl(c.telegram_nick)!} alt={c.name} />
                    ) : null}
                    <AvatarFallback className="text-xs bg-zinc-800">
                      {(c.name || "?")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-medium text-white">
                  <div className="flex items-center gap-2">
                    <span>{c.name || "—"}</span>
                    {c.labels && c.labels.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {c.labels.slice(0, 3).map((l: any) => (
                          <span key={l.id}
                            className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium leading-none"
                            style={{ backgroundColor: l.color + "30", color: l.color }}
                          >
                            {l.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.telegram_nick ? (
                    <a href={tgLink(c.telegram_nick) || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-blue-400">
                      {displayNick(c.telegram_nick)}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none",
                      getStatusStyle(c.status).bg,
                      getStatusStyle(c.status).text
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", getStatusStyle(c.status).bg.replace("/10", "/60"))} />
                    {c.status}
                  </span>
                </TableCell>
                <TableCell>
                  {c.responsible_person === "personal" ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-xs text-zinc-300">Антон</span>
                    </div>
                  ) : c.responsible_person === "assistant" ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      <span className="text-xs text-zinc-300">Ассистент</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Не назначен</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDateTime(c.actual_last_contact || c.last_contact)}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && allClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {search || statusFilter ? "Ничего не найдено" : "Нет контактов"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={loadMore}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
            Показать ещё ({total - allClients.length})
          </Button>
        </div>
      )}
    </div>
  )
}
