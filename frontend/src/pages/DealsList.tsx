import React, { useState, useMemo, useRef, useCallback, useEffect } from "react"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowUpDown, Search, Plus, ChevronLeft, ChevronRight,
  RotateCcw, Trash2, CalendarDays, ExternalLink, ShoppingCart,
} from "lucide-react"
import { formatDate, getStatusStyle, cn, tgLink, displayNick } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"
import { DealEditor } from "@/components/DealEditor"
import { InlineSelect } from "@/components/InlineSelect"
import { InlineEdit } from "@/components/InlineEdit"
import { QuickDatePicker } from "@/components/QuickDatePicker"
import type { Deal } from "@/hooks/use-api"

const LIMIT = 50

const PRODUCT_OPTIONS = [
  { value: "М-Быстрый старт", label: "М-Быстрый старт", color: "#6366f1" },
  { value: "Ж-Быстрый старт", label: "Ж-Быстрый старт", color: "#ec4899" },
  { value: "Терапия", label: "Терапия", color: "#22c55e" },
  { value: "ЖП", label: "ЖП", color: "#a855f7" },
  { value: "Диагностика", label: "Диагностика", color: "#f97316" },
  { value: "Обуч. оргазмы", label: "Обуч. оргазмы", color: "#06b6d4" },
]

const STATUS_OPTIONS = [
  { value: "Ожидает", label: "Ожидает", color: "#eab308" },
  { value: "В процессе", label: "В процессе", color: "#6366f1" },
  { value: "Оплачено", label: "Оплачено", color: "#22c55e" },
  { value: "На паузе", label: "На паузе", color: "#a855f7" },
  { value: "Возврат", label: "Возврат", color: "#ef4444" },
]

const CONTRACT_STATUS_OPTIONS = [
  { value: "-", label: "-", color: "#71717a" },
  { value: "есть", label: "есть", color: "#22c55e" },
  { value: "отправила", label: "отправила", color: "#eab308" },
  { value: "расторгнут", label: "расторгнут", color: "#ef4444" },
]

const CONTRACT_WITH_OPTIONS = [
  { value: "", label: "-", color: "#71717a" },
  { value: "Шумкин ФЛ", label: "Шумкин ФЛ", color: "#6366f1" },
  { value: "ИП Горовцов", label: "ИП Горовцов", color: "#22c55e" },
  { value: "ИП Карика", label: "ИП Карика", color: "#f97316" },
]

const ACT_OPTIONS = [
  { value: "-", label: "-", color: "#71717a" },
  { value: "отправила", label: "отправила", color: "#eab308" },
  { value: "есть", label: "есть", color: "#22c55e" },
]

interface DealsListProps { onSelect: (clientId: number) => void; highlightDealId?: number | null }

export function DealsList({ onSelect, highlightDealId }: DealsListProps) {
  const queryClient = useQueryClient()
  const [editingDeal, setEditingDeal] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<string | null>("contract_date")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [newDeal, setNewDeal] = useState({ title: "", amount: "", paid: "" })
  const [dealClientId, setDealClientId] = useState<number | null>(null)
  const [clientQuery, setClientQuery] = useState("")
  const [dateFrom, setDateFrom] = useState(() => new URLSearchParams(window.location.search).get("date_from") || "")
  const [dateTo, setDateTo] = useState(() => new URLSearchParams(window.location.search).get("date_to") || "")
  const [showArchived, setShowArchived] = useState(() => new URLSearchParams(window.location.search).get("archived") === "true")
  const [debtOnly, setDebtOnly] = useState(() => new URLSearchParams(window.location.search).get("debt") === "true")
  const [amountMin, setAmountMin] = useState("")
  const [amountMax, setAmountMax] = useState("")
  const [appliedAmountMin, setAppliedAmountMin] = useState("")
  const [appliedAmountMax, setAppliedAmountMax] = useState("")

  const amountTimer = useRef<ReturnType<typeof setTimeout>>()
  const applyAmountFilter = useCallback(() => {
    setAppliedAmountMin(amountMin)
    setAppliedAmountMax(amountMax)
    setOffset(0)
  }, [amountMin, amountMax])
  const handleAmountChange = useCallback((type: "min" | "max", value: string) => {
    if (type === "min") setAmountMin(value)
    else setAmountMax(value)
    clearTimeout(amountTimer.current)
    amountTimer.current = setTimeout(applyAmountFilter, 300)
  }, [applyAmountFilter])

  useEffect(() => {
    const p = new URLSearchParams()
    if (dateFrom) p.set("date_from", dateFrom)
    if (dateTo) p.set("date_to", dateTo)
    if (debtOnly) p.set("debt", "true")
    if (showArchived) p.set("archived", "true")
    const qs = p.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, "", url)
  }, [dateFrom, dateTo, debtOnly, showArchived])

  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    p.set("limit", String(LIMIT))
    p.set("offset", String(offset))
    p.set("archived", showArchived ? "true" : "false")
    if (dateFrom) p.set("date_from", dateFrom)
    if (dateTo) p.set("date_to", dateTo)
    if (appliedAmountMin) p.set("amount_min", appliedAmountMin)
    if (appliedAmountMax) p.set("amount_max", appliedAmountMax)
    if (debtOnly) p.set("debt_only", "true")
    return p.toString()
  }, [offset, dateFrom, dateTo, appliedAmountMin, appliedAmountMax, debtOnly])

  const { data, isLoading } = useQuery({
    queryKey: ["deals", queryParams],
    queryFn: () => authFetch(`${API}/api/deals?${queryParams}`).then((r) => r.json()),
    staleTime: 30_000,
  })

  const resetFilters = useCallback(() => {
    setDateFrom(""); setDateTo(""); setAmountMin(""); setAmountMax("")
    setAppliedAmountMin(""); setAppliedAmountMax(""); setOffset(0)
  }, [])

  const deleteDeal = useMutation({
    mutationFn: (id: number) =>
      authFetch(`${API}/api/deals/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deals"] }) },
  })

  const createDeal = useMutation({
    mutationFn: (body: object) =>
      authFetch(`${API}/api/deals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      setShowNewDeal(false)
      setNewDeal({ title: "", amount: "", paid: "" })
      setDealClientId(null)
      setClientQuery("")
    },
  })

  const patchDeal = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, any> }) =>
      authFetch(`${API}/api/deals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  })

  const deals: Deal[] = Array.isArray(data?.deals) ? data.deals : []
  const total = typeof data?.total === "number" ? data.total : 0
  const pages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  const filtered = useMemo(() => {
    let result = deals
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((d) =>
        (d.client_name || "").toLowerCase().includes(q) ||
        (d.telegram_nick || "").toLowerCase().includes(q) ||
        (d.product || "").toLowerCase().includes(q) ||
        (d.reg_number || "").toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q)
      )
    }
    if (debtOnly) result = result.filter((d) => (d.amount || 0) - (d.paid || 0) > 0)
    return result
  }, [deals, search, debtOnly])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = (a as any)[sortKey]
      const bVal = (b as any)[sortKey]
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal
      const cmp = String(aVal || "").localeCompare(String(bVal || ""))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const toggleSort = (col: string) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(col); setSortDir("desc") }
  }

  const SortHeader = ({ col, label, narrow }: { col: string; label: string; narrow?: boolean }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap ${narrow ? "w-0" : ""}`} onClick={() => toggleSort(col)}>
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
        <ArrowUpDown size={10} className={cn("text-zinc-600", sortKey === col && "text-white")} />
      </div>
    </TableHead>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Сделки</h1>
          <p className="text-sm text-zinc-500 mt-1">{total.toLocaleString()} сделок</p>
        </div>
        <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus size={14} />Новая сделка</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800">
            <DialogHeader><DialogTitle>Новая сделка</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500">Название</label>
                <Input value={newDeal.title} onChange={(e) => setNewDeal((p) => ({ ...p, title: e.target.value }))} className="bg-zinc-950 border-zinc-800" placeholder="Терапия, Коучинг..." />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-500">Клиент (необязательно)</label>
                <Input value={clientQuery} onChange={(e) => { setClientQuery(e.target.value); if (!e.target.value) setDealClientId(null) }} className="bg-zinc-950 border-zinc-800" placeholder="Имя или @username..." />
                {clientQuery && !dealClientId && <ClientSearchResults query={clientQuery} onSelect={(id, name) => { setDealClientId(id); setClientQuery(name) }} />}
                {dealClientId && <p className="text-[10px] text-emerald-500">{clientQuery}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500">Сумма (₽)</label>
                  <Input value={newDeal.amount} onChange={(e) => setNewDeal((p) => ({ ...p, amount: e.target.value }))} className="bg-zinc-950 border-zinc-800" type="number" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500">Оплачено (₽)</label>
                  <Input value={newDeal.paid} onChange={(e) => setNewDeal((p) => ({ ...p, paid: e.target.value }))} className="bg-zinc-950 border-zinc-800" type="number" />
                </div>
              </div>
              <Button className="w-full" disabled={!newDeal.title || createDeal.isPending} onClick={() => createDeal.mutate({ title: newDeal.title, client_id: dealClientId, amount: parseFloat(newDeal.amount) || 0, paid: parseFloat(newDeal.paid) || 0 })}>
                {createDeal.isPending ? "Создание..." : "Создать"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input placeholder="Поиск по продукту, клиенту, №..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-zinc-900 border-zinc-800" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Дата договора</label>
          <DateFilterButton value={dateFrom} onChange={(v) => { setDateFrom(v); setOffset(0) }} placeholder="от" />
          <span className="text-xs text-zinc-500">—</span>
          <DateFilterButton value={dateTo} onChange={(v) => { setDateTo(v); setOffset(0) }} placeholder="до" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Сумма</label>
          <input type="number" placeholder="от" value={amountMin} onChange={(e) => handleAmountChange("min", e.target.value)} className="h-7 w-20 px-2 text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600" />
          <span className="text-xs text-zinc-500">—</span>
          <input type="number" placeholder="до" value={amountMax} onChange={(e) => handleAmountChange("max", e.target.value)} className="h-7 w-20 px-2 text-xs rounded bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600" />
          <span className="text-xs text-zinc-500">₽</span>
        </div>
        <button onClick={() => setShowArchived(!showArchived)} className={cn("flex items-center gap-1 h-7 px-2 text-xs rounded transition-colors", showArchived ? "bg-zinc-800 text-zinc-300" : "text-zinc-500 hover:text-white")}>📦 Архив</button>
        <button onClick={() => setDebtOnly(!debtOnly)} className={cn("flex items-center gap-1 h-7 px-2 text-xs rounded transition-colors min-h-[28px] touch-manipulation", debtOnly ? "bg-orange-900/30 text-orange-400 border border-orange-800/50" : "text-zinc-500 hover:text-white")}>💰 Только с долгом</button>
        {(dateFrom || dateTo || appliedAmountMin || appliedAmountMax) && (
          <button onClick={resetFilters} className="flex items-center gap-1 h-7 px-2 text-xs text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition-colors"><RotateCcw size={12} />Сброс</button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-x-auto">
        <Table className="min-w-[1400px] lg:min-w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-0 sticky left-0 bg-zinc-950 z-10" />
              <SortHeader col="reg_number" label="№" narrow />
              <SortHeader col="product" label="Продукт" />
              <SortHeader col="client_name" label="ФИО" />
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Ник тг</span></TableHead>
              <SortHeader col="status" label="Статус" />
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Сессии</span></TableHead>
              <SortHeader col="amount" label="Сумма" />
              <SortHeader col="paid" label="Оплачено" />
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Остаток</span></TableHead>
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Договор</span></TableHead>
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">С кем</span></TableHead>
              <SortHeader col="contract_date" label="Дата дог." />
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Акт</span></TableHead>
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">% ассист.</span></TableHead>
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Ист./Реф.</span></TableHead>
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">% рефа</span></TableHead>
              <TableHead className="whitespace-nowrap"><span className="text-[10px] uppercase tracking-wider">Выпл. рефу</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 17 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!isLoading && sorted.map((d: Deal) => {
              const remainder = (d.amount || 0) - (d.paid || 0)
              return (
                <DealRow
                  key={d.id}
                  deal={d}
                  remainder={remainder}
                  onSelect={onSelect}
                  onDelete={(id) => { if (confirm("Удалить сделку?")) deleteDeal.mutate(id) }}
                  onOpenSheet={(id) => setEditingDeal(id)}
                  patchDeal={patchDeal}
                  highlighted={highlightDealId === d.id}
                />
              )
            })}
            {!isLoading && sorted.length === 0 && (
              <TableRow><TableCell colSpan={18} className="text-center py-12 text-zinc-500">Нет сделок</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-zinc-500">
          <span>{total} сделок</span>
          <div className="flex items-center gap-2">
            <button className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30" disabled={currentPage <= 1} onClick={() => setOffset((currentPage - 2) * LIMIT)}><ChevronLeft size={16} /></button>
            <span className="text-xs">{currentPage} / {pages}</span>
            <button className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30" disabled={currentPage >= pages} onClick={() => setOffset(currentPage * LIMIT)}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      <ErrorBoundary key={`deal-editor-${editingDeal}`}>
        <DealEditor dealId={editingDeal} onClose={() => setEditingDeal(null)} onSelectClient={onSelect} />
      </ErrorBoundary>
    </div>
  )
}

// ─── Deal Row ──────────────────────────────────────────────────────────────────
function DealRow({ deal, remainder, onSelect, onDelete, onOpenSheet, patchDeal, highlighted }: {
  deal: Deal; remainder: number
  onSelect: (id: number) => void; onDelete: (id: number) => void; onOpenSheet: (id: number) => void
  patchDeal: any; highlighted?: boolean
}) {
  const tg = deal.telegram_nick ? displayNick(deal.telegram_nick) : ""

  const handlePatch = (body: Record<string, any>) => patchDeal.mutate({ id: deal.id, body })

  return (
    <TableRow className={`hover:bg-zinc-800/50 group transition-colors duration-1000 ${highlighted ? "bg-emerald-900/40" : ""}`}>
      {/* 0 — open button */}
      <TableCell className="sticky left-0 bg-zinc-950 group-hover:bg-zinc-800/50 z-10 w-0">
        <button onClick={() => onOpenSheet(deal.id)}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-600 hover:text-white transition-colors touch-manipulation">
          <ExternalLink size={14} />
        </button>
      </TableCell>
      {/* 1 — № */}
      <TableCell>
        <InlineEdit value={deal.reg_number || ""} onSave={(v) => handlePatch({ reg_number: v })} placeholder="" className="text-xs w-16" />
      </TableCell>
      {/* 2 — Продукт */}
      <TableCell>
        <InlineSelect value={deal.product || ""} options={PRODUCT_OPTIONS} onSelect={(v) => handlePatch({ product: v })} placeholder="—" />
      </TableCell>
      {/* 3 — ФИО */}
      <TableCell className="max-w-[180px] whitespace-nowrap overflow-hidden text-ellipsis">
        {deal.client_name ? (
          <span className="cursor-pointer hover:text-blue-400 text-sm font-medium"
                onClick={(e) => { e.stopPropagation(); deal.client_id && onSelect(deal.client_id) }}>
            {deal.client_name}
          </span>
        ) : <span className="text-zinc-600">—</span>}
      </TableCell>
      {/* 4 — Ник тг */}
      <TableCell className="text-xs whitespace-nowrap">
        {tg ? (
          <a href={tgLink(deal.telegram_nick || "")} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             className="text-blue-400 hover:text-blue-300">
            {tg}
          </a>
        ) : "—"}
      </TableCell>
      {/* 5 — Статус */}
      <TableCell>
        <InlineSelect value={deal.status} options={STATUS_OPTIONS} onSelect={(v) => handlePatch({ status: v })} />
      </TableCell>
      {/* 6 — Сессии */}
      <TableCell>
        <InlineEdit value={deal.sessions_count || ""} onSave={(v) => handlePatch({ sessions_count: v })} placeholder="" className="text-xs w-12 text-center" />
      </TableCell>
      {/* 7 — Сумма */}
      <TableCell className="font-medium whitespace-nowrap">
        <InlineEdit value={String(deal.amount || 0)} onSave={(v) => handlePatch({ amount: parseFloat(v) || 0 })} type="number" placeholder="0" className="w-20 text-right font-medium" />
      </TableCell>
      {/* 8 — Оплачено */}
      <TableCell className="whitespace-nowrap">
        <InlineEdit value={String(deal.paid || 0)} onSave={(v) => handlePatch({ paid: parseFloat(v) || 0 })} type="number" placeholder="0" className="w-20 text-right" />
      </TableCell>
      {/* 9 — Остаток */}
      <TableCell className={`whitespace-nowrap font-medium ${remainder > 0 ? "text-orange-400" : "text-zinc-600"}`}>
        {remainder.toLocaleString()}₽
      </TableCell>
      {/* 10 — Договор */}
      <TableCell>
        <InlineSelect value={deal.contract_status || "-"} options={CONTRACT_STATUS_OPTIONS} onSelect={(v) => handlePatch({ contract_status: v })} />
      </TableCell>
      {/* 11 — С кем договор */}
      <TableCell>
        <InlineSelect value={deal.contract_with || ""} options={CONTRACT_WITH_OPTIONS} onSelect={(v) => handlePatch({ contract_with: v })} />
      </TableCell>
      {/* 12 — Дата договора */}
      <TableCell>
        <QuickDatePicker value={deal.contract_date || ""} onChange={(iso) => handlePatch({ contract_date: iso })} />
      </TableCell>
      {/* 13 — Акт */}
      <TableCell>
        <InlineSelect value={deal.act_status || "-"} options={ACT_OPTIONS} onSelect={(v) => handlePatch({ act_status: v })} />
      </TableCell>
      {/* 14 — % ассистента */}
      <TableCell>
        <InlineEdit value={deal.assistant_pct || ""} onSave={(v) => handlePatch({ assistant_pct: v })} placeholder="" className="w-14" />
      </TableCell>
      {/* 15 — Источник/Реферал */}
      <TableCell>
        <InlineEdit value={deal.source || ""} onSave={(v) => handlePatch({ source: v })} placeholder="" className="w-24" />
      </TableCell>
      {/* 16 — % рефа */}
      <TableCell>
        <InlineEdit value={deal.referral_pct || ""} onSave={(v) => handlePatch({ referral_pct: v })} placeholder="" className="w-14" />
      </TableCell>
      {/* 17 — Выплачено рефу */}
      <TableCell>
        <div className="flex items-center gap-1">
          <InlineEdit value={deal.referral_paid || ""} onSave={(v) => handlePatch({ referral_paid: v })} placeholder="" className="w-16" />
          <button onClick={() => onDelete(deal.id)}
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all min-h-[28px] min-w-[28px] flex items-center justify-center touch-manipulation" title="Удалить">
            <Trash2 size={12} />
          </button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Calendar grid for date filter ──────────────────────────────────────────────
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]

function CalendarGrid({ onSelect, onClose }: { onSelect: (d: string) => void; onClose: () => void }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const todayStr = now.toDateString()
  const days: (number | null)[] = Array(startOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-700/50 shadow-2xl w-64">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()) }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm">◀</button>
        <span className="text-sm font-semibold text-zinc-200">{MONTHS_RU[month]} {year}</span>
        <button onClick={() => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()) }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1.5">
        {["пн","вт","ср","чт","пт","сб","вс"].map(wd => <div key={wd} className="text-center text-[11px] font-medium text-zinc-600 py-1">{wd}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) =>
          d === null ? <div key={`e-${i}`} /> : (
            <button key={d} onClick={() => { onSelect(`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`); onClose() }}
              className={cn("w-full aspect-square flex items-center justify-center text-sm rounded-lg transition-colors",
                new Date(year, month, d).toDateString() === todayStr ? "bg-yellow-600 text-white font-bold" : "text-zinc-300 hover:bg-zinc-800 hover:text-white")}>{d}</button>
          )
        )}
      </div>
      <button onClick={onClose} className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 mt-3 py-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors">Закрыть</button>
    </div>
  )
}

function DateFilterButton({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className={cn("flex items-center gap-1 h-7 px-2 text-xs rounded transition-colors", value ? "bg-zinc-800 text-zinc-300" : "bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300")}>
        <CalendarDays size={11} />{value || placeholder}{value && <span className="ml-1 text-zinc-600" onClick={(e) => { e.stopPropagation(); onChange("") }}>✕</span>}
      </button>
      {open && <div className="absolute top-full mt-1 left-0 z-50"><CalendarGrid onSelect={onChange} onClose={() => setOpen(false)} /></div>}
    </div>
  )
}

function ClientSearchResults({ query, onSelect }: { query: string; onSelect: (id: number, name: string) => void }) {
  const { data } = useQuery({ queryKey: ["client-search", query], queryFn: () => authFetch(`${API}/api/clients/search?q=${encodeURIComponent(query)}`).then((r) => r.json()), enabled: query.length >= 1 })
  const clients = Array.isArray(data?.clients) ? data.clients : []
  if (clients.length === 0) return null
  return (
    <div className="mt-1 max-h-40 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded">
      {clients.map((c: any) => (
        <button key={c.id} onClick={() => onSelect(c.id, c.name)}
          className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2">
          <span>{c.name}</span>
          {c.telegram_nick && <span className="text-zinc-500">@{c.telegram_nick.replace(/^@+/, "")}</span>}
        </button>
      ))}
    </div>
  )
}
