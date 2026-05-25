import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpDown, Search, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { formatDate, getStatusStyle, cn } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { DealEditor } from "@/components/DealEditor"
import type { Deal } from "@/hooks/use-api"

const LIMIT = 50

interface DealsListProps {
  onSelect: (clientId: number) => void
}

export function DealsList({ onSelect }: DealsListProps) {
  const queryClient = useQueryClient()
  const [editingDeal, setEditingDeal] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [newDeal, setNewDeal] = useState({ title: "", amount: "", paid: "" })

  const { data, isLoading } = useQuery({
    queryKey: ["deals", offset],
    queryFn: () => authFetch(`${API}/api/deals?limit=${LIMIT}&offset=${offset}`).then((r) => r.json()),
    staleTime: 30_000,
  })

  const createDeal = useMutation({
    mutationFn: (body: object) =>
      authFetch(`${API}/api/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] })
      setShowNewDeal(false)
      setNewDeal({ title: "", amount: "", paid: "" })
    },
  })

  const deals: Deal[] = Array.isArray(data?.deals) ? data.deals : []
  const total = typeof data?.total === "number" ? data.total : 0
  const pages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  // Filter
  const filtered = useMemo(() => {
    if (!search) return deals
    const q = search.toLowerCase()
    return deals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.client_name || "").toLowerCase().includes(q),
    )
  }, [deals, search])

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = (a as any)[sortKey]
      const bVal = (b as any)[sortKey]
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal
      }
      const cmp = String(aVal || "").localeCompare(String(bVal || ""))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const toggleSort = (col: string) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(col); setSortDir("desc") }
  }

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={cn("text-muted-foreground", sortKey === col && "text-white")} />
      </div>
    </TableHead>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Сделки</h1>
          <p className="text-sm text-muted-foreground mt-1">{total.toLocaleString()} сделок</p>
        </div>
        <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus size={14} />Новая сделка
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>Новая сделка</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Название</label>
                <Input
                  value={newDeal.title}
                  onChange={(e) => setNewDeal((p) => ({ ...p, title: e.target.value }))}
                  className="bg-zinc-950 border-zinc-800"
                  placeholder="Терапия, Коучинг..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Сумма (₽)</label>
                  <Input
                    value={newDeal.amount}
                    onChange={(e) => setNewDeal((p) => ({ ...p, amount: e.target.value }))}
                    className="bg-zinc-950 border-zinc-800"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Оплачено (₽)</label>
                  <Input
                    value={newDeal.paid}
                    onChange={(e) => setNewDeal((p) => ({ ...p, paid: e.target.value }))}
                    className="bg-zinc-950 border-zinc-800"
                    type="number"
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!newDeal.title || createDeal.isPending}
                onClick={() => {
                  createDeal.mutate({
                    title: newDeal.title,
                    amount: parseFloat(newDeal.amount) || 0,
                    paid: parseFloat(newDeal.paid) || 0,
                  })
                }}
              >
                {createDeal.isPending ? "Создание..." : "Создать"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по названию или клиенту..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-800"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortHeader col="title" label="Название" />
              <SortHeader col="client_name" label="Клиент" />
              <TableHead>Ник</TableHead>
              <SortHeader col="status" label="Статус" />
              <SortHeader col="amount" label="Сумма" />
              <SortHeader col="paid" label="Оплачено" />
              <TableHead>Остаток</TableHead>
              <SortHeader col="purchase_date" label="Дата" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading &&
              sorted.map((d: Deal) => {
                const remainder = (d.amount || 0) - (d.paid || 0)
                return (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer hover:bg-zinc-800/50"
                    onClick={() => setEditingDeal(d.id)}
                  >
                    <TableCell className="font-medium text-white whitespace-nowrap">{d.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.client_name ? (
                        <span className="cursor-pointer hover:text-white" onClick={(e) => { e.stopPropagation(); d.client_id && onSelect(d.client_id) }}>
                          {d.client_name}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{d.telegram_nick || "—"}</TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none gap-1.5", getStatusStyle(d.status).bg, getStatusStyle(d.status).text)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", getStatusStyle(d.status).bg.replace("/10", "/60"))} />
                        {d.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{d.amount?.toLocaleString()}₽</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{d.paid?.toLocaleString()}₽</TableCell>
                    <TableCell className={cn("whitespace-nowrap font-medium", remainder > 0 ? "text-orange-400" : "text-zinc-600")}>
                      {remainder > 0 ? `${remainder.toLocaleString()}₽` : "0₽"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDate(d.purchase_date)}</TableCell>
                  </TableRow>
                )
              })}
            {!isLoading && sorted.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Нет сделок</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>{total} сделок</span>
          <div className="flex items-center gap-2">
            <button className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30" disabled={currentPage <= 1} onClick={() => setOffset((currentPage - 2) * LIMIT)}>
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs">{currentPage} / {pages}</span>
            <button className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30" disabled={currentPage >= pages} onClick={() => setOffset(currentPage * LIMIT)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <DealEditor dealId={editingDeal} onClose={() => setEditingDeal(null)} />
    </div>
  )
}
