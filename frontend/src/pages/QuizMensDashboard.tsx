import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Users, TrendingUp, BarChart3, Globe, Search, Pencil, Trash2, ExternalLink, UserCircle } from "lucide-react"
import { cn, formatDateTime, displayNick, tgUserLink } from "@/lib/utils"
import { authFetch, API } from "@/hooks/use-api"

const PAGE_SIZE = 50

interface MensResult {
  id: number
  client_id: number | null
  created_at: string
  name: string | null
  telegram_username: string | null
  telegram_id: string | null
  phone: string | null
  age: number | null
  total_score: number
  level: string | null
  diagnosis: string | null
  utm_source: string | null
  state: string | null
  intent: string | null
}

function EditableCell({ value, field, rowId, onSave }: { value: string | null; field: string; rowId: number; onSave: (id: number, field: string, value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || "")

  const save = () => {
    setEditing(false)
    if (editValue !== (value || "")) {
      onSave(rowId, field, editValue)
    }
  }

  if (editing) {
    return (
      <input
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
        className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
        autoFocus
      />
    )
  }

  return (
    <span onClick={() => setEditing(true)} className="cursor-pointer hover:text-white transition-colors group flex items-center gap-1">
      {value || <span className="text-zinc-600 italic">—</span>}
      <Pencil size={10} className="text-zinc-700 group-hover:text-zinc-500 shrink-0" />
    </span>
  )
}

function useURLTab(key: string, fallback: string): [string, (v: string) => void] {
  const get = () => {
    const p = new URLSearchParams(window.location.search)
    return p.get(key) || fallback
  }
  const [tab, setTabState] = useState(get)
  const setTab = (val: string) => {
    const p = new URLSearchParams(window.location.search)
    p.set(key, val)
    window.history.replaceState({}, "", "?" + p.toString())
    setTabState(val)
  }
  useEffect(() => {
    const h = () => setTabState(get())
    window.addEventListener("popstate", h)
    return () => window.removeEventListener("popstate", h)
  }, [])
  return [tab, setTab]
}

export default function QuizMensDashboard({ onOpenClient }: { onOpenClient?: (clientId: number) => void }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useURLTab("mens_sub", "analytics")
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState("all")
  const [utmFilter, setUtmFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["quiz-mens-stats"],
    queryFn: () => authFetch(`${API}/api/quiz/mens-stats`).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ["quiz-mens-results"],
    queryFn: () => authFetch(`${API}/api/quiz/results?test_type=mens&limit=1000`).then(r => r.json()),
    staleTime: 10_000,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: string; value: string }) =>
      authFetch(`${API}/api/quiz/results/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-mens-results"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      authFetch(`${API}/api/quiz/results/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-mens-results"] })
      queryClient.invalidateQueries({ queryKey: ["quiz-mens-stats"] })
    },
  })

  const handleDelete = (id: number) => {
    if (!window.confirm("Удалить эту запись?")) return
    deleteMutation.mutate(id)
  }

  const stats = statsData || {}
  const legacy = stats.legacy_totals || {}

  // Results dedup
  const rawResults: MensResult[] = Array.isArray(resultsData?.items) ? resultsData.items : []
  const results = useMemo(() => {
    const seen = new Set<string>()
    return rawResults.filter(r => {
      const key = r.telegram_id || r.telegram_username || `id_${r.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [rawResults])

  // Stage counts
  const stageCounts = useMemo(() => {
    const total = results.length
    const started = results.filter(r => (r.total_score || 0) > 0 || r.level || r.diagnosis).length
    const completed = results.filter(r => (r.total_score || 0) > 0).length
    return { total, notStarted: total - started, opened: started - completed, completed }
  }, [results])

  const utmOptions = useMemo(() => {
    const set = new Set<string>()
    results.forEach(r => { if (r.utm_source) set.add(r.utm_source) })
    return Array.from(set).sort()
  }, [results])

  // Filters
  const filtered = useMemo(() => {
    let f = results
    if (stageFilter === "not_started") f = f.filter(r => !((r.total_score || 0) > 0 || r.level || r.diagnosis))
    else if (stageFilter === "opened") f = f.filter(r => ((r.total_score || 0) > 0 || r.level || r.diagnosis) && !((r.total_score || 0) > 0))
    else if (stageFilter === "completed") f = f.filter(r => (r.total_score || 0) > 0)
    if (search) {
      const q = search.toLowerCase()
      f = f.filter(r => (r.name || "").toLowerCase().includes(q) || (r.telegram_username || "").toLowerCase().includes(q) || (r.telegram_id || "").toLowerCase().includes(q))
    }
    if (utmFilter !== "all") f = f.filter(r => r.utm_source === utmFilter)
    if (dateFrom) f = f.filter(r => r.created_at && r.created_at >= dateFrom)
    if (dateTo) f = f.filter(r => r.created_at && r.created_at <= dateTo + "T23:59:59")
    return f
  }, [results, stageFilter, search, utmFilter, dateFrom, dateTo])

  const paginated = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])
  const hasMore = visibleCount < filtered.length

  const handleInlineUpdate = useCallback((id: number, field: string, value: string) => {
    updateMutation.mutate({ id, field, value })
  }, [updateMutation])

  const scores = useMemo(() => {
    const all = results.filter(r => r.total_score > 0).map(r => r.total_score)
    const avg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0
    const levelCounts: Record<string, number> = {}
    results.forEach(r => {
      const lvl = r.level || r.diagnosis || "Не указан"
      levelCounts[lvl] = (levelCounts[lvl] || 0) + 1
    })
    return { avg, levelCounts }
  }, [results])

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-zinc-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
          <TabsTrigger value="marketing">Маркетинг</TabsTrigger>
          <TabsTrigger value="table">Таблица результатов</TabsTrigger>
        </TabsList>

        {/* Аналитика */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Участников</CardTitle>
                <Users className="h-4 w-4 text-zinc-500" />
              </CardHeader>
              <CardContent><p className="text-2xl font-bold text-zinc-300">{legacy.total || 0}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Ср. балл</CardTitle>
                <BarChart3 className="h-4 w-4 text-zinc-500" />
              </CardHeader>
              <CardContent><p className="text-2xl font-bold text-white">{scores.avg}<span className="text-sm text-zinc-500">/{stats.total ? Math.round(stats.total / results.length) : 0}</span></p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Прошли тест</CardTitle>
                <TrendingUp className="h-4 w-4 text-zinc-500" />
              </CardHeader>
              <CardContent><p className="text-2xl font-bold text-blue-400">{legacy.completed || 0}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Записались</CardTitle>
                <Users className="h-4 w-4 text-zinc-500" />
              </CardHeader>
              <CardContent><p className="text-2xl font-bold" style={{ color: "#8B0000" }}>{legacy.booked || 0}</p></CardContent>
            </Card>
          </div>

          {/* Уровни */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-medium text-zinc-500">Распределение по уровням</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-4">
              {Object.entries(scores.levelCounts).length === 0 ? (
                <p className="text-sm text-zinc-600">Нет данных</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(scores.levelCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => {
                      const maxCount = Math.max(...Object.values(scores.levelCounts))
                      const pct = Math.round((count / maxCount) * 100)
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-zinc-300">{name}</span>
                            <span className="text-sm font-semibold text-zinc-400">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500/40 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Маркетинг */}
        <TabsContent value="marketing" className="space-y-4">
          {!statsLoading && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Открыли бот", value: legacy.total || 0, color: "text-zinc-300" },
                { label: "Начали тест", value: legacy.opened || 0, color: "text-green-400" },
                { label: "Прошли тест", value: legacy.completed || 0, color: "text-blue-400" },
                { label: "Записались", value: legacy.booked || 0, color: "text-red-400" },
              ].map(m => (
                <Card key={m.label}>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-medium text-zinc-500">{m.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3 px-4">
                    <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* UTM table */}
          {stats.by_source?.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-zinc-500" /> Топ источников трафика
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Источник</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Medium</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Кампания</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Всего</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Прошли</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Video1</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Video2</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Записались</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Покупка</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Созвон</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-zinc-500">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.by_source.map((s: any) => {
                        const conv = Math.min(Math.round((s.booked + s.purchase + s.call) / Math.max(s.total, 1) * 100), 100)
                        const convColor = conv >= 10 ? "bg-green-600/30 text-green-400" : conv >= 5 ? "bg-yellow-600/30 text-yellow-400" : "bg-red-600/30 text-red-400"
                        return (
                          <tr key={s.source + (s.medium || "") + (s.campaign || "")} className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                            <td className="px-3 py-2 font-medium text-zinc-300">{s.source === "—" ? "Прямой заход" : s.source}</td>
                            <td className="px-3 py-2 text-xs text-zinc-400">{s.medium || "—"}</td>
                            <td className="px-3 py-2 text-xs text-zinc-400">{s.campaign || "—"}</td>
                            <td className="px-3 py-2 text-center text-white">{s.total}</td>
                            <td className="px-3 py-2 text-center text-blue-400">{s.completed}</td>
                            <td className="px-3 py-2 text-center text-zinc-400">{s.video1}</td>
                            <td className="px-3 py-2 text-center text-zinc-400">{s.video2}</td>
                            <td className="px-3 py-2 text-center" style={{ color: "#8B0000" }}>{s.booked}</td>
                            <td className="px-3 py-2 text-center" style={{ color: "#D4AF37" }}>{s.purchase}</td>
                            <td className="px-3 py-2 text-center text-blue-400">{s.call}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${convColor}`}>{conv}%</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Таблица результатов */}
        <TabsContent value="table" className="space-y-4">
          {/* Stage filters */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "Все", count: stageCounts.total },
              { key: "not_started", label: "Не начали", count: stageCounts.notStarted },
              { key: "opened", label: "Открыли", count: stageCounts.opened },
              { key: "completed", label: "Прошли", count: stageCounts.completed },
            ].map(st => (
              <button key={st.key} onClick={() => { setStageFilter(st.key); setVisibleCount(PAGE_SIZE) }}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full transition-colors",
                  stageFilter === st.key ? "bg-zinc-200 text-zinc-900 font-medium" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                )}
              >
                {st.label} <span className="opacity-60">({st.count})</span>
              </button>
            ))}
          </div>

          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input placeholder="Поиск по имени или Telegram..." value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }} className="pl-9 h-9 text-sm" />
            </div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setVisibleCount(PAGE_SIZE) }} className="h-9 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 w-[150px]" />
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setVisibleCount(PAGE_SIZE) }} className="h-9 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 w-[150px]" />
            <Select value={utmFilter} onValueChange={v => { setUtmFilter(v); setVisibleCount(PAGE_SIZE) }}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="UTM Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все источники</SelectItem>
                {utmOptions.map(utm => <SelectItem key={utm} value={utm}>{utm}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <p className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Pencil size={10} /> Показано {Math.min(visibleCount, filtered.length)} из {filtered.length} записей
          </p>

          {resultsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-zinc-800" />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-zinc-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-auto whitespace-nowrap text-zinc-400 text-xs">Дата</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">Имя</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">Telegram</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">Телефон</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs">Возраст</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs">Балл</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs max-w-[150px]">Уровень</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs max-w-[110px]">Статус</TableHead>
                    <TableHead className="w-auto text-zinc-400 text-xs">UTM</TableHead>
                    <TableHead className="w-auto text-right text-zinc-400 text-xs">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map(r => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="whitespace-nowrap text-zinc-400 py-2.5 px-3">{formatDateTime(r.created_at)}</TableCell>
                      <TableCell className="py-2.5 px-3">
                        <EditableCell value={r.name} field="name" rowId={r.id} onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {r.telegram_username ? (
                            <a href={`https://t.me/${r.telegram_username}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline shrink-0" title="Открыть чат">
                              <ExternalLink size={13} />
                            </a>
                          ) : r.telegram_id ? (
                            <a href={tgUserLink(r.telegram_id) || "#"} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-blue-400 shrink-0" title="Написать по ID">
                              <ExternalLink size={13} />
                            </a>
                          ) : null}
                          <EditableCell
                            value={r.telegram_username}
                            field="telegram_username"
                            rowId={r.id}
                            onSave={handleInlineUpdate}
                            renderDisplay={(val) => val ? (
                              <span className="text-primary text-sm whitespace-normal break-all">{displayNick(val)}</span>
                            ) : r.telegram_id ? (
                              <a href={tgUserLink(r.telegram_id) || "#"} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-blue-400 text-sm truncate max-w-[130px]" title="Написать по ID">
                                ID {r.telegram_id}
                              </a>
                            ) : <span className="text-zinc-600">—</span>}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 px-3">
                        <EditableCell value={r.phone} field="phone" rowId={r.id} onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right text-zinc-300">{r.age || "—"}</TableCell>
                      <TableCell className="py-2.5 px-3 text-right text-white">{r.total_score || "—"}</TableCell>
                      <TableCell className="py-2.5 px-3 text-zinc-300 max-w-[150px] truncate">{r.level || r.diagnosis || "—"}</TableCell>
                      <TableCell className="py-2.5 px-3">
                        {r.intent === "purchase_tripwire" ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-600/30 text-yellow-400 border border-yellow-600/40 whitespace-nowrap">
                            Хочет купить
                          </span>
                        ) : r.state === "completed_test" ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-600/30 text-green-400 border border-green-600/40 whitespace-nowrap">
                            Прошёл тест
                          </span>
                        ) : r.state === "started" ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-400 border border-blue-600/40 whitespace-nowrap">
                            Начал
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-3">
                        <EditableCell value={r.utm_source} field="utm_source" rowId={r.id} onSave={handleInlineUpdate} />
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onOpenClient?.(r.client_id || r.id)}
                          className="p-1.5 rounded hover:bg-purple-500/20 text-zinc-500 hover:text-purple-400 transition-colors"
                          title="Карточка клиента"
                        >
                          <UserCircle size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-zinc-500 hover:text-red-400 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-zinc-600">
                        {search || utmFilter !== "all" || stageFilter !== "all" ? "Ничего не найдено" : "Нет результатов"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}>
                Показать ещё ({filtered.length - visibleCount})
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
