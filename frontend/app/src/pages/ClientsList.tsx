import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
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
import { formatDate, getStatusStyle, getAvatarUrl, cn, STAGES, tgLink } from "@/lib/utils"
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
  const [offset, setOffset] = useState(0)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const debouncedSearch = useMemo(() => {
    // simple client-side debounce via timeout
    return search
  }, [search])

  // Debounce search param by using a delayed query key
  const [effectiveSearch, setEffectiveSearch] = useState("")
  const handleSearchChange = (v: string) => {
    setSearch(v)
    setOffset(0)
    setTimeout(() => setEffectiveSearch(v), 300)
  }

  const params = new URLSearchParams()
  if (effectiveSearch) params.set("search", effectiveSearch)
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter)
  params.set("limit", String(LIMIT))
  params.set("offset", String(offset))

  const { data, isLoading, isError } = useQuery({
    queryKey: ["clients", effectiveSearch, statusFilter, offset],
    queryFn: () => authFetch(`${API}/api/clients?${params}`).then((r) => r.json()),
  })

  // Strict guard against undefined data
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-zinc-500">Ошибка загрузки. Попробуй обновить страницу.</p>
      </div>
    )
  }

  const rawClients = data?.clients
  const clients: Client[] = Array.isArray(rawClients) ? rawClients : []
  const total = typeof data?.total === "number" ? data.total : 0
  const pages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  // Client-side sort
  const sorted = useMemo(() => {
    if (!sortColumn) return clients
    return [...clients].sort((a, b) => {
      const aVal = (a as any)[sortColumn] || ""
      const bVal = (b as any)[sortColumn] || ""
      const cmp = String(aVal).localeCompare(String(bVal))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [clients, sortColumn, sortDir])

  const toggleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(col)
      setSortDir("asc")
    }
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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0) }}>
          <SelectTrigger className="w-[180px] h-9 text-sm bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {[...STAGES].map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40px]"></TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Имя
                  <ArrowUpDown size={12} className="text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead>@ник</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("status")}
              >
                <div className="flex items-center gap-1">
                  Статус
                  <ArrowUpDown size={12} className="text-muted-foreground" />
                </div>
              </TableHead>
              <TableHead>Источник</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("last_contact")}
              >
                <div className="flex items-center gap-1">
                  Посл. контакт
                  <ArrowUpDown size={12} className="text-muted-foreground" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
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
            {!isLoading && sorted.map((c) => (
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
                <TableCell className="font-medium text-white">{c.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.telegram_nick ? (
                    <a href={tgLink(c.telegram_nick) || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-blue-400">
                      @{c.telegram_nick}
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
                  {c.source ? (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {c.source}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(c.last_contact)}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {search || statusFilter ? "Ничего не найдено" : "Нет контактов"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>{total} контактов</span>
          <div className="flex items-center gap-2">
            <button
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30"
              disabled={currentPage <= 1}
              onClick={() => setOffset((currentPage - 2) * LIMIT)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs">{currentPage} / {pages}</span>
            <button
              className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30"
              disabled={currentPage >= pages}
              onClick={() => setOffset(currentPage * LIMIT)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
